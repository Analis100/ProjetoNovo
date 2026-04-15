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
} from "react-native";
import { getPlan } from "../services/license";
import { CommonActions } from "@react-navigation/native";
import { FORM_CARD } from "../styles/formCard";
import { SafeAreaView } from "react-native-safe-area-context";
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
});
