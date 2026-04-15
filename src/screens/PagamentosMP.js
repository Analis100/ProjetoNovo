import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
  Linking,
  TextInput,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { BASE_URL } from "../services/config";

// helpers de assinatura / status
import {
  getSubscriptionStatus,
  openCheckoutPro,
  openPreapprovalCheckout,
  watchAppStateForStatus,
  unwatchAppStateForStatus,
} from "../services/subscription";
import { getDeviceId } from "../utils/deviceId";
import { FORM_CARD } from "../styles/formCard";

export default function PagamentosMP({ navigation, route }) {
  if (!__DEV__) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Pagamentos (Área Técnica)</Text>
        <View style={styles.card}>
          <Text style={styles.subtitle}>Painel técnico</Text>
          <Text style={styles.text}>
            Esta tela é destinada ao suporte técnico de integração de
            pagamentos.
          </Text>
          <Text style={styles.text}>
            No aplicativo, o pagamento é realizado pela tela de planos.{" "}
            <Text style={styles.bold}>(Escolher Plano / Pagamento)</Text>.
          </Text>
          <Text style={[styles.text, { marginTop: 8 }]}>
            Se você chegou aqui por engano, pode voltar usando o botão de voltar
            do app.
          </Text>
        </View>
      </ScrollView>
    );
  }

  const [loading, setLoading] = useState(false);
  const SERVER = BASE_URL;

  const planoFromRoute = route?.params?.plano || null;
  const precoBaseFromRoute = route?.params?.preco ?? null;
  const precoFinalFromRoute = route?.params?.precoFinal ?? null;
  const referralCodeFromRoute = route?.params?.referralCode || null;

  const [referralCode, setReferralCode] = useState(referralCodeFromRoute);

  useEffect(() => {
    if (referralCodeFromRoute && !referralCode) {
      setReferralCode(referralCodeFromRoute);
    }
  }, [referralCodeFromRoute, referralCode]);

  const [payerEmail, setPayerEmail] = useState("");
  const [planId, setPlanId] = useState("");
  const [subStatus, setSubStatus] = useState(null);

  useEffect(() => {
    watchAppStateForStatus((data) => {
      setSubStatus(data);

      const accessGranted =
        data?.active === true ||
        data?.allowed === true ||
        data?.access?.active === true ||
        data?.access?.allowed === true;

      if (accessGranted) {
        Alert.alert("Acesso liberado", "Seu plano foi ativado com sucesso!");

        navigation.reset({
          index: 0,
          routes: [{ name: "TelaInicial" }],
        });
      }
    });

    return () => unwatchAppStateForStatus();
  }, []);

  async function safeReadJson(resp) {
    const text = await resp.text();

    try {
      return JSON.parse(text);
    } catch (e) {
      console.log("[PagamentosMP] resposta não-JSON:", text);
      throw new Error("O servidor retornou uma resposta inválida.");
    }
  }

  async function abrirAssinatura() {
    try {
      if (!payerEmail) {
        Alert.alert("Assinatura", "Informe o e-mail.");
        return;
      }

      setLoading(true);
      const deviceId = await getDeviceId();

      const amountFromRoute =
        typeof precoFinalFromRoute === "number"
          ? precoFinalFromRoute
          : typeof precoBaseFromRoute === "number"
            ? precoBaseFromRoute
            : 39.9;

      const { ok, error } = await openPreapprovalCheckout({
        payerEmail,
        deviceId,
        backUrl: `${BASE_URL}/retorno`,
        tier: planoFromRoute || null,
        amount: amountFromRoute,
        referralCode: referralCode || null,
        planId: planId || null,
      });

      if (!ok) {
        Alert.alert(
          "Assinatura",
          `Falha ao abrir checkout: ${String(error || "sem detalhes")}`,
        );
      }
    } catch (e) {
      Alert.alert("Erro (assinatura)", String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function checarAssinatura() {
    try {
      setLoading(true);
      const deviceId = await getDeviceId();
      const status = await getSubscriptionStatus(deviceId);
      setSubStatus(status);
    } catch (e) {
      Alert.alert("Erro (status assinatura)", String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function testarCheckoutPro() {
    try {
      if (!payerEmail) {
        Alert.alert("Checkout Pro", "Informe o e-mail do comprador.");
        return;
      }

      setLoading(true);

      const planForDebug = planId?.trim() || "IND_MENSAL";

      const { ok, error } = await openCheckoutPro({
        planId: planForDebug,
        payerEmail,
        referralCode: referralCode || null,
      });

      if (!ok) {
        Alert.alert(
          "Checkout Pro",
          `Falha ao abrir o link: ${String(error || "sem detalhes")}`,
        );
      }
    } catch (e) {
      Alert.alert("Checkout Pro", String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function pagarComLink() {
    try {
      setLoading(true);

      const planForDebug = planId?.trim() || "IND_MENSAL";
      const deviceId = await getDeviceId();

      const url =
        `${SERVER}/assinaturas/checkout-url` +
        `?planId=${encodeURIComponent(planForDebug)}` +
        `&deviceId=${encodeURIComponent(deviceId)}` +
        (payerEmail?.trim()
          ? `&payer_email=${encodeURIComponent(payerEmail.trim())}`
          : "") +
        (referralCode?.trim()
          ? `&referralCode=${encodeURIComponent(
              referralCode.trim().toUpperCase(),
            )}`
          : "");

      const resp = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Device-Id": deviceId,
        },
      });

      const data = await safeReadJson(resp);

      if (!resp.ok || !data?.ok) {
        throw new Error(
          data?.message ||
            data?.error ||
            data?.hint ||
            "Falha ao criar link de pagamento",
        );
      }

      if (!data?.init_point) {
        throw new Error("init_point ausente na resposta");
      }

      const can = await Linking.canOpenURL(data.init_point);
      if (!can) {
        throw new Error("Não foi possível abrir o navegador.");
      }

      await Linking.openURL(data.init_point);
    } catch (e) {
      Alert.alert("Erro (link)", String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  const [pix, setPix] = useState(null);
  const [remaining, setRemaining] = useState(0);

  const mmss = useMemo(() => {
    const mm = String(Math.floor((remaining || 0) / 60)).padStart(2, "0");
    const ss = String((remaining || 0) % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }, [remaining]);

  async function gerarPix() {
    try {
      setLoading(true);

      const resp = await fetch(`${SERVER}/pagamentos/pix/criar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valor: 5.0,
          descricao: "DRD PIX",
          email: "cliente@example.com",
          nome: "Cliente",
        }),
      });

      const data = await safeReadJson(resp);

      if (!resp.ok) {
        throw new Error(data?.message || data?.error || "Falha ao gerar PIX");
      }

      setPix(data);
      setRemaining(data.expires_in_seconds || 0);
    } catch (e) {
      Alert.alert("Erro (PIX)", String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function copiarCodigoPix() {
    if (!pix?.copia_cola) return;
    await Clipboard.setStringAsync(pix.copia_cola);
    Alert.alert("PIX", "Código copia-e-cola copiado!");
  }

  async function verificarStatusPix() {
    if (!pix?.id) return null;

    try {
      const resp = await fetch(`${SERVER}/pagamentos/status/${pix.id}`);
      const s = await safeReadJson(resp);

      if (!resp.ok) {
        throw new Error(s?.message || s?.error || "Falha ao consultar status");
      }

      if (s.status === "approved") {
        Alert.alert("Pagamento", "Pagamento confirmado!");
      } else if (s.is_expired) {
        Alert.alert("PIX", s.message || "PIX expirado.");
      }

      return s;
    } catch (e) {
      Alert.alert("Erro (status)", String(e?.message || e));
      return null;
    }
  }

  useEffect(() => {
    if (!pix?.id) return;

    const tick = setInterval(() => {
      if (pix.expires_at_epoch) {
        const sec = Math.max(
          0,
          (pix.expires_at_epoch || 0) - Math.floor(Date.now() / 1000),
        );
        setRemaining(sec);
      } else {
        setRemaining((s) => Math.max(0, s - 1));
      }
    }, 1000);

    const poll = setInterval(() => {
      verificarStatusPix();
    }, 4000);

    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pix?.id, pix?.expires_at_epoch]);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Pagamentos Mercado Pago (DEV)</Text>

      {referralCode ? (
        <View style={styles.referralBadge}>
          <Text style={styles.referralText}>
            Código de indicação aplicado:{" "}
            <Text style={{ fontWeight: "700" }}>{referralCode}</Text>
          </Text>

          {planoFromRoute && (
            <Text style={styles.referralSub}>
              Plano selecionado: {planoFromRoute} — valor{" "}
              {typeof precoFinalFromRoute === "number"
                ? `R$ ${precoFinalFromRoute.toFixed(2).replace(".", ",")}`
                : typeof precoBaseFromRoute === "number"
                  ? `R$ ${precoBaseFromRoute.toFixed(2).replace(".", ",")}`
                  : "não definido"}
            </Text>
          )}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.subtitle}>Assinatura (Plano de Produção)</Text>
        <Text style={styles.text}>
          Informe o <Text style={styles.bold}>planId</Text> do plano e o{" "}
          <Text style={styles.bold}>e-mail</Text> do comprador para abrir o
          checkout. Depois, confira o status pelo{" "}
          <Text style={styles.bold}>deviceId</Text>.
        </Text>

        <TextInput
          placeholder="planId (ex: IND_MENSAL)"
          autoCapitalize="characters"
          value={planId}
          onChangeText={setPlanId}
          style={styles.input}
        />

        <TextInput
          placeholder="email do comprador"
          autoCapitalize="none"
          keyboardType="email-address"
          value={payerEmail}
          onChangeText={setPayerEmail}
          style={styles.input}
        />

        <TouchableOpacity
          style={styles.btn}
          onPress={abrirAssinatura}
          disabled={loading}
        >
          <Text style={styles.btnText}>Abrir checkout (Assinatura)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnOutline]}
          onPress={checarAssinatura}
          disabled={loading}
        >
          <Text style={[styles.btnText, styles.btnOutlineText]}>
            Checar status da assinatura
          </Text>
        </TouchableOpacity>

        {subStatus && (
          <View style={{ marginTop: 8 }}>
            <Text>active: {String(subStatus.active)}</Text>
            <Text>status: {String(subStatus.status)}</Text>
            <Text>next_charge_at: {String(subStatus.next_charge_at)}</Text>
            <Text>reason: {String(subStatus.reason)}</Text>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.subtitle}>Link de Pagamento (Checkout Pro)</Text>
        <Text style={styles.text}>
          Abre o checkout no navegador usando o{" "}
          <Text style={styles.bold}>init_point</Text>.
        </Text>

        <TouchableOpacity
          style={styles.btn}
          onPress={testarCheckoutPro}
          disabled={loading}
        >
          <Text style={styles.btnText}>
            🔗 Testar link de pagamento (debug)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, { marginTop: 8 }]}
          onPress={pagarComLink}
          disabled={loading}
        >
          <Text style={styles.btnText}>Pagar com Link (rota oficial)</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.subtitle}>PIX (QR + Copia e Cola)</Text>
        <Text style={styles.text}>
          Gera um QR Code e o texto “copia e cola”. Validade: 30 min.
        </Text>

        {!pix && (
          <TouchableOpacity
            style={styles.btn}
            onPress={gerarPix}
            disabled={loading}
          >
            <Text style={styles.btnText}>Gerar PIX</Text>
          </TouchableOpacity>
        )}

        {pix?.qr_code_base64 ? (
          <View style={{ alignItems: "center", marginTop: 16 }}>
            <Image
              style={{ width: 240, height: 240 }}
              source={{ uri: `data:image/png;base64,${pix.qr_code_base64}` }}
            />

            <Text style={{ marginTop: 8 }}>
              Expira em: <Text style={styles.bold}>{mmss}</Text>
            </Text>

            <TouchableOpacity
              style={[styles.btn, styles.btnOutline]}
              onPress={copiarCodigoPix}
            >
              <Text style={[styles.btnText, styles.btnOutlineText]}>
                Copiar código PIX
              </Text>
            </TouchableOpacity>

            {pix.ticket_url ? (
              <TouchableOpacity
                style={[styles.btn, styles.btnOutline]}
                onPress={() => Linking.openURL(pix.ticket_url)}
              >
                <Text style={[styles.btnText, styles.btnOutlineText]}>
                  Abrir página do QR
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[styles.btn, styles.btnOutline]}
              onPress={verificarStatusPix}
            >
              <Text style={[styles.btnText, styles.btnOutlineText]}>
                Já paguei
              </Text>
            </TouchableOpacity>

            {remaining === 0 && (
              <>
                <Text
                  style={{
                    marginTop: 8,
                    color: "#b00020",
                    textAlign: "center",
                  }}
                >
                  O PIX expirou. Gere um novo código.
                </Text>
                <TouchableOpacity style={styles.btn} onPress={gerarPix}>
                  <Text style={styles.btnText}>Gerar novo PIX</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : null}
      </View>

      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator size="large" />
          <Text style={{ marginTop: 8 }}>Processando…</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48 },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 12,
  },
  referralBadge: {
    backgroundColor: "#e6f7ef",
    borderColor: "#22c55e",
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  referralText: {
    color: "#14532d",
    fontWeight: "600",
  },
  referralSub: {
    marginTop: 4,
    fontSize: 13,
    color: "#166534",
  },
  card: {
    ...FORM_CARD,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  subtitle: { fontSize: 16, fontWeight: "600", marginBottom: 6 },
  text: { fontSize: 14, color: "#333" },
  bold: { fontWeight: "bold" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
  },
  btn: {
    backgroundColor: "#1e88e5",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginTop: 10,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "700" },
  btnOutline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#1e88e5",
    marginTop: 10,
  },
  btnOutlineText: { color: "#1e88e5" },
  loading: { alignItems: "center", marginTop: 12 },
});
