// screens/EscolherPlano.js
import React, { useEffect, useState, useLayoutEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// (mantive seus imports de IAP, mas não usamos compra interna nesta tela agora)
import {
  isIapAvailable,
  iapConnect,
  iapDisconnect,
  iapGetCatalog,
  iapFinish,
  setIapListener,
  SKU_INDIVIDUAL,
  SKU_INDIVIDUAL_DESCONTO,
  SKU_COLABORADORES,
  SKU_COLABORADORES_DESCONTO,
} from "./services/iap";

import { setPlan } from "../services/license";
import { FORM_CARD } from "../styles/formCard";

const TEST_MODE = false;

// ✅ preços oficiais
const PRECO_INDIVIDUAL = 39.9;
const PRECO_COLABORADORES = 49.9;

const PRECO_INDIVIDUAL_ANUAL = PRECO_INDIVIDUAL * 12;
const PRECO_COLABORADORES_ANUAL = PRECO_COLABORADORES * 12;

// Códigos de indicação (conquistador) — sem desconto
const CODIGOS_FIXOS = {
  NETO10: true,
};

function isReferralCode(code) {
  const c = (code || "").trim().toUpperCase();
  if (CODIGOS_FIXOS[c]) return true;
  if (/^DR\d{4,}$/.test(c)) return true;
  return false;
}

// Códigos de ativação direta de plano (sem pagamento)
function parseActivationCode(code) {
  const c = (code || "").trim().toUpperCase();
  if (c.startsWith("DRD-COL-")) return "COLABORADORES";
  if (c.startsWith("DRD-IND-")) return "INDIVIDUAL";
  return null;
}

function formatBRL(valor) {
  return `R$ ${Number(valor).toFixed(2).replace(".", ",")}`;
}

export default function EscolherPlano({ navigation }) {
  const [iapReady, setIapReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [codigo, setCodigo] = useState("");

  const [referralApplied, setReferralApplied] = useState(false);
  const [referralCode, setReferralCode] = useState(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: "Escolher Plano",
      headerBackVisible: false,
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate("GerenciarPlanoScreen");
            }
          }}
          style={{ paddingVertical: 6, paddingRight: 8 }}
        >
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#111" }}>
            Voltar
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  useEffect(() => {
    let removeListener = null;

    const boot = async () => {
      try {
        const available = await isIapAvailable();
        if (!available) {
          setIapReady(false);
          return;
        }
        await iapConnect();
        setIapReady(true);

        const skus = [
          SKU_INDIVIDUAL,
          SKU_INDIVIDUAL_DESCONTO,
          SKU_COLABORADORES,
          SKU_COLABORADORES_DESCONTO,
        ].filter(Boolean);

        const items = await iapGetCatalog(skus);
        setCatalog(items || []);

        removeListener = setIapListener(async (event) => {
          try {
            await iapFinish(event);
            const sku = event?.productId || event?.purchaseToken || "";
            if (sku.includes("colab")) {
              await finalizarAtivacao("COLABORADORES");
            } else {
              await finalizarAtivacao("INDIVIDUAL");
            }
          } catch (e) {
            console.log("iapFinish error", e);
          }
        });
      } catch (e) {
        console.log("IAP init error:", e);
      }
    };

    boot();
    return () => {
      try {
        removeListener && removeListener();
      } catch {}
      try {
        iapDisconnect();
      } catch {}
    };
  }, []);

  const finalizarAtivacao = async (plano) => {
    await setPlan({
      tier: plano,
      period: "mensal",
      paidAt: Date.now(),
    });

    await AsyncStorage.setItem("licenseActivated", "1");

    Alert.alert("Pronto!", `Plano ${plano} ativado com sucesso.`, [
      { text: "OK", onPress: () => navigation.replace("TelaInicial") },
    ]);
  };

  const irParaPagamento = (planoAlvo, periodoAlvo) => {
    const precoBase =
      planoAlvo === "COLABORADORES"
        ? periodoAlvo === "anual"
          ? PRECO_COLABORADORES_ANUAL
          : PRECO_COLABORADORES
        : periodoAlvo === "anual"
          ? PRECO_INDIVIDUAL_ANUAL
          : PRECO_INDIVIDUAL;

    navigation.navigate("Pagamento", {
      plano: planoAlvo,
      periodoInicial: periodoAlvo,
      preco: precoBase,
      referralCode: referralApplied ? referralCode : null,
    });
  };

  const onAtivarCodigo = async () => {
    try {
      if (!codigo?.trim()) {
        Alert.alert("Atenção", "Digite um código.");
        return;
      }

      setLoading(true);

      const planoDireto = parseActivationCode(codigo);
      if (planoDireto) {
        await finalizarAtivacao(planoDireto);
        setShowCodeModal(false);
        setCodigo("");
        return;
      }

      if (isReferralCode(codigo)) {
        const c = codigo.trim().toUpperCase();

        setReferralApplied(true);
        setReferralCode(c);

        Alert.alert(
          "Código aplicado",
          `Código ${c} registrado como indicação.\nO valor do plano permanece o mesmo.`,
        );

        setShowCodeModal(false);
        setCodigo("");
        return;
      }

      Alert.alert("Código inválido", "Confira e tente novamente.");
    } catch (e) {
      console.log("ativar codigo error", e);
      Alert.alert("Falha", "Não foi possível validar este código.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: 40,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Escolha seu plano</Text>
        <Text style={styles.sub}>
          Você pode liberar o acesso com pagamento via PIX ou Cartão, e também
          pode aplicar o código de indicação, se não tiver, escolha só o plano.
        </Text>

        {referralApplied && (
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>
              Código {referralCode} aplicado como indicação.
            </Text>
          </View>
        )}

        <View style={styles.cardArea}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Plano Individual</Text>
            <Text style={styles.cardDesc}>
              Uso individual, dados locais no aparelho.
            </Text>

            <Text style={styles.precoLinha}>
              Mensal: {formatBRL(PRECO_INDIVIDUAL)} / mês
            </Text>
            <Text style={styles.precoLinha}>
              Anual: {formatBRL(PRECO_INDIVIDUAL_ANUAL)} em 12 meses
            </Text>

            <View style={styles.duoButtons}>
              <TouchableOpacity
                style={[styles.btn, styles.btnMetade]}
                disabled={loading}
                onPress={() => irParaPagamento("INDIVIDUAL", "mensal")}
              >
                <Text style={styles.btnText}>
                  {loading ? "Processando..." : "Mensal"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, styles.btnMetade]}
                disabled={loading}
                onPress={() => irParaPagamento("INDIVIDUAL", "anual")}
              >
                <Text style={styles.btnText}>
                  {loading ? "Processando..." : "Anual"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Plano Colaboradores</Text>
            <Text style={styles.cardDesc}>
              Multiusuário e colaboração (sincronização).
            </Text>

            <Text style={styles.precoLinha}>
              Mensal: {formatBRL(PRECO_COLABORADORES)} / mês
            </Text>
            <Text style={styles.precoLinha}>
              Anual: {formatBRL(PRECO_COLABORADORES_ANUAL)} em 12 meses
            </Text>

            <View style={styles.duoButtons}>
              <TouchableOpacity
                style={[styles.btn, styles.btnMetade]}
                disabled={loading}
                onPress={() => irParaPagamento("COLABORADORES", "mensal")}
              >
                <Text style={styles.btnText}>
                  {loading ? "Processando..." : "Mensal"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, styles.btnMetade]}
                disabled={loading}
                onPress={() => irParaPagamento("COLABORADORES", "anual")}
              >
                <Text style={styles.btnText}>
                  {loading ? "Processando..." : "Anual"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.btn, styles.btnOutline]}
          onPress={() => setShowCodeModal(true)}
          disabled={loading}
        >
          <Text style={[styles.btnText, styles.btnOutlineText]}>
            Aplicar código de indicação
          </Text>
        </TouchableOpacity>

        {loading && (
          <View style={styles.loading}>
            <ActivityIndicator size="large" />
          </View>
        )}

        <Modal
          transparent
          visible={showCodeModal}
          animationType="slide"
          onRequestClose={() => setShowCodeModal(false)}
        >
          <View style={styles.modalBg}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Código de indicação</Text>
              <TextInput
                value={codigo}
                onChangeText={setCodigo}
                placeholder="Ex.: DR1001 ou DRD-IND-XXXX"
                autoCapitalize="characters"
                style={styles.input}
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  style={[styles.btn, { flex: 1 }]}
                  onPress={onAtivarCodigo}
                  disabled={loading}
                >
                  <Text style={styles.btnText}>Validar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.btnOutline, { flex: 1 }]}
                  onPress={() => setShowCodeModal(false)}
                  disabled={loading}
                >
                  <Text style={[styles.btnText, styles.btnOutlineText]}>
                    Cancelar
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 14, color: "#666", marginTop: 6 }}>
                • Códigos “DRD-IND-…/DRD-COL-…” ativam o plano direto.{"\n"}•
                Códigos como “NETO10” ou “DR1001” registram indicação (sem
                desconto).
              </Text>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#fff", gap: 16 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "center" },
  sub: { fontSize: 14, textAlign: "center", color: "#444" },
  testButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#999",
    alignItems: "center",
  },
  testButtonText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#555",
  },
  badge: {
    backgroundColor: "#e6f7ef",
    borderColor: "#22c55e",
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  badgeTxt: { color: "#14532d", fontWeight: "700" },
  cardArea: { gap: 12 },
  card: {
    ...FORM_CARD,
    borderWidth: 1,
    borderColor: "#e2e2e2",
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  cardTitle: { fontSize: 18, fontWeight: "700" },
  cardDesc: { fontSize: 14, color: "#555" },
  precoLinha: {
    fontSize: 15,
    fontWeight: "700",
    marginTop: 2,
  },
  duoButtons: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  btnMetade: {
    flex: 1,
  },
  btn: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 6,
  },
  btnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 18,
  },
  btnOutline: {
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: "#2563eb",
  },
  btnOutlineText: { color: "#2563eb" },
  loading: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 30,
    alignItems: "center",
  },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
    fontSize: 16,
  },
});
