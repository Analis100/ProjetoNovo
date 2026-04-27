/**
 * Screen: GerenciarPlanoScreen
 */ //
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { getPlan } from "../services/license";
import { CommonActions } from "@react-navigation/native";
import { FORM_CARD } from "../styles/formCard";
import { SafeAreaView } from "react-native-safe-area-context";
import { getDeviceId } from "../utils/deviceId";
import { BASE_URL } from "../services/config";

function goToActivation(navigation) {
  const CANDIDATES = [
    "AtivacaoCodigo",
    "Ativacao",
    "AtivarCodigo",
    "Codigo",
    "Onboarding",
  ];

  const tryNames = (nav) => {
    const state = nav?.getState?.();
    const names = new Set(
      state?.routeNames || state?.routes?.map((r) => r.name) || [],
    );

    for (const name of CANDIDATES) {
      if (names.has(name)) {
        nav.navigate(name);
        return true;
      }
    }
    return false;
  };

  if (tryNames(navigation)) return;

  let parent = navigation.getParent?.();
  while (parent) {
    if (tryNames(parent)) return;
    parent = parent.getParent?.();
  }

  navigation.dispatch(
    CommonActions.reset({ index: 0, routes: [{ name: "Pagamento" }] }),
  );
}

function goToChoosePlan(navigation, params = {}) {
  const CANDIDATES = [
    "EscolherPlano",
    "Pagamento",
    "Paywall",
    "Assinatura",
    "Assinaturas",
    "Planos",
    "Plano",
  ];

  const tryNames = (nav) => {
    const state = nav?.getState?.();
    const names = new Set(
      state?.routeNames || state?.routes?.map((r) => r.name) || [],
    );

    for (const name of CANDIDATES) {
      if (names.has(name)) {
        nav.navigate(name, params);
        return true;
      }
    }
    return false;
  };

  if (tryNames(navigation)) return;

  let parent = navigation.getParent?.();
  while (parent) {
    if (tryNames(parent)) return;
    parent = parent.getParent?.();
  }

  Alert.alert(
    "Tela não encontrada",
    "Não foi possível localizar a tela de assinatura neste fluxo.",
  );
}

export default function GerenciarPlano({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState(null);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [reviewCode, setReviewCode] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);

  const ativarCodigoRevisao = async () => {
    const codigo = String(reviewCode || "").trim();

    if (!codigo) {
      Alert.alert("Código obrigatório", "Digite o código de revisão.");
      return;
    }

    try {
      setReviewLoading(true);

      const deviceId = await getDeviceId();

      const res = await fetch(`${BASE_URL}/assinaturas/review-access`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          deviceId,
          code: codigo,
        }),
      });

      const json = await res.json();

      if (!res.ok || json?.ok !== true) {
        Alert.alert(
          "Código inválido",
          json?.error || "Não foi possível ativar o acesso de revisão.",
        );
        return;
      }

      setReviewModalVisible(false);
      setReviewCode("");

      Alert.alert(
        "Acesso liberado",
        "O acesso de revisão foi ativado com sucesso.",
        [
          {
            text: "OK",
            onPress: () => {
              navigation.reset({
                index: 0,
                routes: [{ name: "TelaInicial" }],
              });
            },
          },
        ],
      );
    } catch (e) {
      console.log("Erro ao ativar código de revisão:", e);
      Alert.alert("Erro", "Não foi possível validar o código agora.");
    } finally {
      setReviewLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const p = await getPlan();
        if (!mounted) return;
        setPlan(p);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={{ marginTop: 8, color: "#666" }}>Carregando…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const hasPlan = false;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Gerenciar Plano</Text>

        {!hasPlan ? (
          <>
            <Text style={styles.subtitle}>
              Nenhum plano ativo neste dispositivo.
            </Text>

            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary]}
              onPress={() => goToChoosePlan(navigation)}
            >
              <Text style={styles.btnTxtPrimary}>Escolher / Assinar Plano</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.btnOutline]}
              onPress={() => goToActivation(navigation)}
            >
              <Text style={styles.btnTxtOutline}>Ativar com Código</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.btnReview]}
              onPress={() => setReviewModalVisible(true)}
            >
              <Text style={styles.btnTxtReview}>Código de Revisão Apple</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.link}
              onPress={() => goToActivation(navigation)}
            >
              <Text style={styles.linkTxt}>
                Ir para tela inicial de ativação
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Plano atual</Text>
              <Text style={styles.cardRow}>
                Tipo: <Text style={styles.bold}>{plan.tier}</Text>
              </Text>
              <Text style={styles.cardRow}>
                Periodicidade: <Text style={styles.bold}>{plan.period}</Text>
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary]}
              onPress={() =>
                goToChoosePlan(navigation, { from: "GerenciarPlano" })
              }
            >
              <Text style={styles.btnTxtPrimary}>Renovar / Alterar Plano</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <Modal visible={reviewModalVisible} transparent animationType="fade">
        <View style={styles.modalFundo}>
          <View style={styles.modalArea}>
            <Text style={styles.modalTitulo}>Código de Revisão</Text>

            <Text style={styles.modalTexto}>
              Digite o código fornecido para revisão da Apple.
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Código"
              autoCapitalize="characters"
              value={reviewCode}
              onChangeText={setReviewCode}
            />

            <View style={styles.modalBotoes}>
              <TouchableOpacity
                style={[styles.modalBotao, { backgroundColor: "#ccc" }]}
                onPress={() => {
                  setReviewModalVisible(false);
                  setReviewCode("");
                }}
                disabled={reviewLoading}
              >
                <Text>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBotao, { backgroundColor: "#2563EB" }]}
                onPress={ativarCodigoRevisao}
                disabled={reviewLoading}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>
                  {reviewLoading ? "Validando..." : "Ativar"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  container: { flex: 1, padding: 20 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: {
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 8,
    color: "#bfa140",
  },
  subtitle: {
    textAlign: "center",
    color: "#6b7280",
    marginTop: 8,
    marginBottom: 16,
  },
  btn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 12,
  },
  btnPrimary: { backgroundColor: "#2563EB" },
  btnTxtPrimary: { color: "#fff", fontWeight: "700" },
  btnOutline: {
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#2563EB",
  },
  btnTxtOutline: { color: "#2563EB", fontWeight: "700" },
  link: { alignItems: "center", marginTop: 10 },
  linkTxt: { color: "#2563EB" },

  card: {
    ...FORM_CARD,
    marginTop: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    backgroundColor: "#fafafa",
  },
  cardTitle: { fontWeight: "800", marginBottom: 6 },
  cardRow: { color: "#374151", marginTop: 2 },
  bold: { fontWeight: "700" },
  btnReview: {
    backgroundColor: "#bfa140",
  },

  btnTxtReview: {
    color: "#fff",
    fontWeight: "700",
  },

  modalFundo: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },

  modalArea: {
    width: "85%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
  },

  modalTitulo: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
    color: "#111827",
  },

  modalTexto: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 14,
  },

  modalInput: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },

  modalBotoes: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },

  modalBotao: {
    flex: 1,
    padding: 11,
    borderRadius: 8,
    alignItems: "center",
  },
});
