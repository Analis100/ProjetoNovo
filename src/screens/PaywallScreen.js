// screens/PaywallScreen.js
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

import {
  getAccess,
  waitForAuthorized,
  openCheckoutPro,
  watchAppStateForStatus,
  unwatchAppStateForStatus,
} from "../services/subscription";

import { getDeviceId } from "../utils/deviceId";
import { SafeAreaView } from "react-native-safe-area-context";
import { setPlan } from "../services/license";

export default function PaywallScreen() {
  const navigation = useNavigation();

  const [loading, setLoading] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [deviceId, setDeviceId] = useState(null);
  const [selectedPlanId, setSelectedPlanId] = useState(null);

  /** =========================
   * DEVICE ID
   * ========================= */
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const id = await getDeviceId();
        if (mounted) setDeviceId(id);
      } catch {
        if (mounted) {
          setDeviceId(null);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  /** =========================
   * LISTENER DE PAGAMENTO
   * ========================= */
  useEffect(() => {
    if (!deviceId) return;

    const onAppStateChange = async () => {
      try {
        const access = await getAccess(deviceId);

        if (access?.allowed) {
          setWaiting(false);

          await setPlan({
            tier: access?.tier || "INDIVIDUAL",
            period: access?.period || "mensal",
            paidAt: Date.now(),
          });

          navigation.reset({
            index: 0,
            routes: [{ name: "TelaInicial" }],
          });
        }
      } catch {}
    };

    const subscription = watchAppStateForStatus(onAppStateChange);

    return () => {
      try {
        if (typeof subscription?.remove === "function") {
          subscription.remove();
        } else if (typeof subscription === "function") {
          subscription();
        } else {
          unwatchAppStateForStatus();
        }
      } catch {
        unwatchAppStateForStatus();
      }
    };
  }, [deviceId, navigation]);

  /** =========================
   * HELPERS
   * ========================= */
  const ensureDeviceId = useCallback(() => {
    if (!deviceId) {
      Alert.alert("Aguarde", "Inicializando dispositivo...");
      return false;
    }
    return true;
  }, [deviceId]);

  /** =========================
   * PAGAMENTO DINÂMICO
   * ========================= */
  const handleComprar = async (planId) => {
    if (!ensureDeviceId()) return;

    try {
      setLoading(true);
      setSelectedPlanId(planId);

      await openCheckoutPro({ planId });

      setWaiting(true);

      waitForAuthorized({ deviceId }).catch(() => {});
    } catch {
      setSelectedPlanId(null);
      Alert.alert("Erro", "Não foi possível abrir o pagamento.");
    } finally {
      setLoading(false);
    }
  };

  /** =========================
   * VERIFICAR
   * ========================= */
  const handleVerificar = async () => {
    if (!ensureDeviceId()) return;

    try {
      setLoading(true);

      const access = await getAccess(deviceId);

      if (access?.allowed) {
        await setPlan({
          tier: access?.tier || "INDIVIDUAL",
          period: access?.period || "mensal",
          paidAt: Date.now(),
        });

        navigation.reset({
          index: 0,
          routes: [{ name: "TelaInicial" }],
        });
      } else {
        Alert.alert("Aguardando", "Pagamento ainda não confirmado.");
      }
    } catch {
      Alert.alert("Erro", "Falha ao verificar.");
    } finally {
      setLoading(false);
    }
  };

  /** =========================
   * PLANOS
   * ========================= */
  const planos = [
    {
      id: "IND_MENSAL",
      nome: "Plano Individual Mensal",
      preco: "R$ 39,90 / mês",
    },
    {
      id: "IND_ANUAL",
      nome: "Plano Individual Anual",
      preco: "R$ 478,80 / ano",
    },
    {
      id: "COL_MENSAL",
      nome: "Plano Colaboradores Mensal",
      preco: "R$ 49,90 / mês",
    },
    {
      id: "COL_ANUAL",
      nome: "Plano Colaboradores Anual",
      preco: "R$ 598,80 / ano",
    },
  ];

  /** =========================
   * UI
   * ========================= */
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <Text style={styles.titulo}>Ativar DRD-Financeiro</Text>

          <Text style={styles.desc}>
            Escolha um plano para continuar usando o aplicativo.
          </Text>

          {planos.map((p) => (
            <View key={p.id} style={styles.bloco}>
              <Text style={styles.planoTitulo}>{p.nome}</Text>
              <Text style={styles.planoPreco}>{p.preco}</Text>

              <TouchableOpacity
                style={[styles.botao, styles.botaoPrincipal]}
                onPress={() => handleComprar(p.id)}
                disabled={loading}
              >
                <Text style={styles.botaoTexto}>
                  {loading && selectedPlanId === p.id
                    ? "Abrindo pagamento..."
                    : "Assinar"}
                </Text>
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity
            style={[styles.botao, styles.botaoNeutro]}
            onPress={handleVerificar}
            disabled={loading}
          >
            <Text style={styles.botaoTexto}>
              Já paguei / Verificar assinatura
            </Text>
          </TouchableOpacity>

          {waiting && (
            <View style={styles.waitingBox}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.waitingText}>
                Aguardando confirmação do pagamento...
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** =========================
 * STYLES
 * ========================= */
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scroll: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollContent: {
    paddingBottom: 40,
  },
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#fff",
  },
  titulo: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#bfa140",
    marginBottom: 12,
    textAlign: "center",
    marginTop: 8,
  },
  desc: {
    fontSize: 14,
    color: "#444",
    marginBottom: 16,
    textAlign: "center",
  },
  bloco: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#f8f8f8",
  },
  planoTitulo: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  planoPreco: {
    fontSize: 16,
    color: "#28a745",
    marginBottom: 8,
  },
  botao: {
    padding: 10,
    borderRadius: 6,
    alignItems: "center",
    marginTop: 6,
  },
  botaoPrincipal: {
    backgroundColor: "#28a745",
  },
  botaoNeutro: {
    backgroundColor: "#6c757d",
    marginTop: 8,
  },
  botaoTeste: {
    backgroundColor: "#bfa140",
    marginBottom: 10,
  },
  botaoTexto: {
    color: "#fff",
    fontWeight: "600",
  },
  waitingBox: {
    marginTop: 10,
    marginBottom: 20,
    padding: 10,
    backgroundColor: "#6c63ff",
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
  },
  waitingText: {
    color: "#fff",
    marginLeft: 8,
    flex: 1,
  },
});
