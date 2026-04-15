import React, { useMemo, useState, useLayoutEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Linking,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { FORM_CARD } from "../styles/formCard";
import { BASE_URL } from "../services/config";
import { getSubscriptionStatus } from "../services/subscription";
import { getDeviceId } from "../utils/deviceId";
import { setPlan } from "../services/license";

const PRECO = {
  INDIVIDUAL: { mensal: 39.9, anual: 39.9 * 12 },
  COLABORADORES: { mensal: 49.9, anual: 49.9 * 12 },
};

const PLAN_ID_MAP = {
  INDIVIDUAL: {
    mensal: "IND_MENSAL",
    anual: "IND_ANUAL",
  },
  COLABORADORES: {
    mensal: "COL_MENSAL",
    anual: "COL_ANUAL",
  },
};

export default function PagamentoScreen({ navigation, route }) {
  const [loading, setLoading] = useState(false);
  const [periodo, setPeriodo] = useState("mensal");
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const planoSelecionado = route?.params?.plano || "INDIVIDUAL";
  const referralCode = route?.params?.referralCode || null;

  const voltarTela = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate("EscolherPlano");
    }
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      title: "Pagamento",
      headerBackVisible: false,
      headerLeft: () => (
        <TouchableOpacity
          onPress={voltarTela}
          style={{ paddingVertical: 6, paddingRight: 8 }}
        >
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#111" }}>
            Voltar
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const dadosPlano = useMemo(() => {
    if (planoSelecionado === "COLABORADORES") {
      return {
        titulo: "Colaboradores",
        subtitulo: "Multiusuário, recursos colaborativos",
        precoMensal: PRECO.COLABORADORES.mensal,
        precoAnual: PRECO.COLABORADORES.anual,
      };
    }

    return {
      titulo: "Individual",
      subtitulo: "Uso pessoal, dados no dispositivo",
      precoMensal: PRECO.INDIVIDUAL.mensal,
      precoAnual: PRECO.INDIVIDUAL.anual,
    };
  }, [planoSelecionado]);

  const ehMensal = periodo === "mensal";

  const textoPreco = ehMensal
    ? `R$ ${dadosPlano.precoMensal.toFixed(2).replace(".", ",")} / mês`
    : `R$ ${dadosPlano.precoMensal
        .toFixed(2)
        .replace(
          ".",
          ",",
        )} / mês • total em 12 meses: R$ ${dadosPlano.precoAnual
        .toFixed(2)
        .replace(".", ",")}`;

  async function abrirLink(url) {
    try {
      if (!url || typeof url !== "string") {
        throw new Error("Link de pagamento inválido.");
      }

      const can = await Linking.canOpenURL(url);
      if (!can) {
        Alert.alert("Pagamento", "Não foi possível abrir o link de pagamento.");
        return;
      }

      await Linking.openURL(url);
    } catch (e) {
      Alert.alert(
        "Pagamento",
        e?.message || "Falha ao abrir o link de pagamento.",
      );
    }
  }

  async function criarLinkPagamento({ tier, period }) {
    const planId = PLAN_ID_MAP?.[tier]?.[period];

    if (!planId) {
      throw new Error("Plano inválido para geração do pagamento.");
    }

    const rawDeviceId = await getDeviceId();
    const deviceId =
      typeof rawDeviceId === "string"
        ? rawDeviceId.trim()
        : String(rawDeviceId || "").trim();

    if (!deviceId) {
      throw new Error(
        "Não foi possível identificar este aparelho. Feche e abra o app novamente.",
      );
    }

    await AsyncStorage.multiSet([
      ["lastPaymentDeviceId", deviceId],
      ["lastPaymentPlanId", planId],
      ["lastPaymentTier", tier],
      ["lastPaymentPeriod", period],
    ]);

    let url =
      `${BASE_URL}/assinaturas/checkout-url` +
      `?planId=${encodeURIComponent(planId)}` +
      `&deviceId=${encodeURIComponent(deviceId)}`;

    if (referralCode) {
      url += `&referralCode=${encodeURIComponent(referralCode)}`;
    }

    console.log("[PagamentoScreen] checkout-url =>", {
      planId,
      tier,
      period,
      deviceId,
      url,
    });

    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Device-Id": deviceId,
      },
    });

    const rawText = await resp.text();

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      console.log("[PagamentoScreen] resposta não-JSON:", rawText);
      throw new Error(
        "O servidor retornou uma resposta inválida ao gerar o pagamento.",
      );
    }

    if (!resp.ok) {
      throw new Error(
        data?.message ||
          data?.error ||
          data?.hint ||
          "Falha ao gerar link de pagamento.",
      );
    }

    if (!data?.ok) {
      throw new Error(data?.error || "Falha ao gerar link de pagamento.");
    }

    if (!data?.init_point) {
      throw new Error("Link de pagamento não retornado pelo servidor.");
    }

    return data.init_point;
  }

  async function handleAssinar() {
    try {
      setLoading(true);
      setStatusMsg("");

      const url = await criarLinkPagamento({
        tier: planoSelecionado,
        period: periodo,
      });

      await abrirLink(url);
    } catch (e) {
      Alert.alert("Pagamento", String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function verificarPagamento() {
    try {
      setCheckingStatus(true);
      setStatusMsg("Verificando pagamento...");

      const rawDeviceId = await getDeviceId();
      const deviceId =
        typeof rawDeviceId === "string"
          ? rawDeviceId.trim()
          : String(rawDeviceId || "").trim();

      if (!deviceId) {
        throw new Error(
          "Não foi possível identificar o aparelho para validar a assinatura.",
        );
      }

      console.log(
        "[PagamentoScreen] verificando status para deviceId:",
        deviceId,
      );

      const status = await getSubscriptionStatus(deviceId);

      console.log("[PagamentoScreen] status recebido:", status);

      // 🔒 validação mais segura do acesso
      const accessGranted =
        status?.active === true ||
        status?.allowed === true ||
        status?.access?.active === true ||
        status?.access?.allowed === true;

      if (accessGranted) {
        const tierFinal =
          status?.license?.tier ||
          status?.tier ||
          planoSelecionado ||
          "INDIVIDUAL";

        const periodFinal =
          status?.license?.period || status?.period || periodo || "mensal";

        await setPlan({
          tier: tierFinal,
          period: periodFinal,
          paidAt: Date.now(),
        });

        await AsyncStorage.multiSet([
          ["licenseActivated", "1"],
          ["license.deviceId", deviceId],
          ["license.tier", String(tierFinal)],
          ["license.period", String(periodFinal)],
        ]);

        setStatusMsg("Pagamento confirmado! Liberando acesso...");

        navigation.reset({
          index: 0,
          routes: [{ name: "TelaInicial" }],
        });

        return;
      }
      setStatusMsg(
        "Pagamento ainda não confirmado. Tente novamente em alguns segundos.",
      );

      Alert.alert(
        "Pagamento em processamento",
        "Seu pagamento ainda não foi confirmado. Toque em 'Já paguei' novamente em alguns segundos.",
      );
    } catch (e) {
      console.log("[PagamentoScreen] erro ao verificar pagamento:", e);
      setStatusMsg("Não foi possível verificar o pagamento agora.");
      Alert.alert("Erro", String(e?.message || e));
    } finally {
      setCheckingStatus(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.topo}>
        <TouchableOpacity
          onPress={voltarTela}
          style={styles.botaoVoltar}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.setaVoltar}>←</Text>
        </TouchableOpacity>

        <Text style={styles.header}>Finalizar assinatura</Text>

        <View style={styles.espacoDireito} />
      </View>

      <View style={styles.card}>
        <Text style={styles.tituloPlano}>{dadosPlano.titulo}</Text>
        <Text style={styles.subtitulo}>{dadosPlano.subtitulo}</Text>

        <View style={styles.periodos}>
          <TouchableOpacity
            style={[styles.pill, ehMensal && styles.pillAtivo]}
            onPress={() => setPeriodo("mensal")}
            disabled={loading || checkingStatus}
          >
            <Text style={[styles.pillTxt, ehMensal && styles.pillTxtAtivo]}>
              Mensal
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pill, !ehMensal && styles.pillAtivo]}
            onPress={() => setPeriodo("anual")}
            disabled={loading || checkingStatus}
          >
            <Text style={[styles.pillTxt, !ehMensal && styles.pillTxtAtivo]}>
              Anual
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.preco}>{textoPreco}</Text>

        {!ehMensal && (
          <Text style={styles.obsCartao}>
            No plano anual, o Mercado Pago cobra o valor mensal automaticamente
            todo mês, até completar os 12 meses, ou até o cancelamento.
          </Text>
        )}

        <TouchableOpacity
          style={[styles.botao, (loading || checkingStatus) && styles.disabled]}
          onPress={handleAssinar}
          disabled={loading || checkingStatus}
        >
          <Text style={styles.botaoTxt}>
            {loading
              ? "Gerando link..."
              : `Assinar ${ehMensal ? "Plano Mensal" : "Plano Anual"}`}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.botao,
            styles.botaoSecundario,
            (loading || checkingStatus) && styles.disabled,
          ]}
          onPress={verificarPagamento}
          disabled={loading || checkingStatus}
        >
          <Text style={styles.botaoTxtSecundario}>
            {checkingStatus ? "Verificando..." : "Já paguei"}
          </Text>
        </TouchableOpacity>

        {!!statusMsg && <Text style={styles.statusMsg}>{statusMsg}</Text>}
      </View>

      {(loading || checkingStatus) && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>
            {loading
              ? "Gerando link de pagamento..."
              : "Processando pagamento..."}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },

  topo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 8,
  },
  botaoVoltar: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  setaVoltar: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111",
  },
  espacoDireito: {
    width: 40,
  },

  header: {
    flex: 1,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginVertical: 8,
  },

  card: {
    ...FORM_CARD,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 14,
    padding: 16,
    marginTop: 14,
    backgroundColor: "#fafafa",
  },
  tituloPlano: { fontSize: 18, fontWeight: "700" },
  subtitulo: { fontSize: 13, color: "#555", marginTop: 2 },
  periodos: { flexDirection: "row", gap: 8, marginTop: 12 },
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
  },
  pillAtivo: { backgroundColor: "#111827", borderColor: "#111827" },
  pillTxt: { fontSize: 13, color: "#111827" },
  pillTxtAtivo: { color: "#fff", fontWeight: "700" },
  preco: { fontSize: 16, fontWeight: "700", marginTop: 12 },
  obsCartao: { fontSize: 12, color: "#374151", marginTop: 6 },
  botao: {
    marginTop: 12,
    backgroundColor: "#2563eb",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  botaoTxt: { color: "#fff", fontWeight: "700" },
  botaoSecundario: {
    marginTop: 10,
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: "#2563eb",
  },
  botaoTxtSecundario: {
    color: "#2563eb",
    fontWeight: "700",
  },
  statusMsg: {
    marginTop: 10,
    fontSize: 13,
    color: "#444",
    textAlign: "center",
  },
  loadingBox: {
    marginTop: 18,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 8,
    color: "#444",
  },
  disabled: {
    opacity: 0.7,
  },
});
