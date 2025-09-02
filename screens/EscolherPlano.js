// screens/EscolherPlano.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ====== IAP (opcional) ======
import {
  isIapAvailable,
  iapConnect,
  iapDisconnect,
  iapGetCatalog,
  iapPurchase,
  iapFinish,
  setIapListener,
  SKU_INDIVIDUAL,
  SKU_INDIVIDUAL_DESCONTO,
  SKU_COLABORADORES,
  SKU_COLABORADORES_DESCONTO,
} from "./services/iap";

// ====== License helpers (existentes no seu projeto) ======
import { setPlan } from "../services/license"; // já existe no seu projeto

const FAKE_UID = "offline-uid"; // se ainda não tiver Auth

// --- Códigos fixos de indicação (ex.: cadastrados no Firebase). Você pode ampliar:
const CODIGOS_FIXOS = {
  DR1001: { discountPercent: 10 }, // <- seu código atual
};

// True se for código de indicação (desconto), false caso contrário
function isReferralCode(code) {
  const c = (code || "").trim().toUpperCase();
  if (CODIGOS_FIXOS[c]) return true;
  // Aceita DR + 4+ dígitos como indicação (ex.: DR1234)
  if (/^DR\d{4,}$/.test(c)) return true;
  return false;
}

// Retorna "INDIVIDUAL"/"COLABORADORES" se for código de ATIVAÇÃO direta (DRD-IND/DRD-COL)
function parseActivationCode(code) {
  const c = (code || "").trim().toUpperCase();
  if (c.startsWith("DRD-COL-")) return "COLABORADORES";
  if (c.startsWith("DRD-IND-")) return "INDIVIDUAL";
  return null;
}

export default function EscolherPlano({ navigation /* route não é usado */ }) {
  const [iapReady, setIapReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [codigo, setCodigo] = useState("");

  // estado do código de indicação aplicado
  const [referralApplied, setReferralApplied] = useState(false);
  const [referralCode, setReferralCode] = useState(null);
  const [referralDiscount, setReferralDiscount] = useState(0);

  // ---------- IAP Setup (seguro mesmo se você não usar agora) ----------
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

        // catálogo
        const skus = [
          SKU_INDIVIDUAL,
          SKU_INDIVIDUAL_DESCONTO,
          SKU_COLABORADORES,
          SKU_COLABORADORES_DESCONTO,
        ].filter(Boolean);
        const items = await iapGetCatalog(skus);
        setCatalog(items || []);

        // listener de compra
        removeListener = setIapListener(async (event) => {
          try {
            await iapFinish(event);
            // escolha do plano pode vir do SKU
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

  // ---------- helpers ----------
  const finalizarAtivacao = async (plano) => {
    await setPlan(plano);
    await AsyncStorage.setItem("licenseActivated", "1");
    Alert.alert("Pronto!", `Plano ${plano} ativado com sucesso.`, [
      { text: "OK", onPress: () => navigation.replace("TelaInicial") },
    ]);
  };

  const comprar = async (sku) => {
    if (!iapReady) {
      Alert.alert("Loja indisponível", "Tente novamente em instantes.");
      return;
    }
    try {
      setLoading(true);
      await iapPurchase(sku);
      // o listener chamará finalizarAtivacao()
    } catch (e) {
      console.log("purchase error", e);
      Alert.alert("Compra não concluída", "Você pode tentar novamente.");
    } finally {
      setLoading(false);
    }
  };

  // ---------- APLICAR/VALIDAR CÓDIGO ----------
  const onAtivarCodigo = async () => {
    try {
      if (!codigo?.trim()) {
        Alert.alert("Atenção", "Digite um código.");
        return;
      }

      setLoading(true);

      // 1) CÓDIGO DE ATIVAÇÃO DIRETA (legacy): DRD-IND-XXXX / DRD-COL-XXXX
      const planoDireto = parseActivationCode(codigo);
      if (planoDireto) {
        await finalizarAtivacao(planoDireto);
        setShowCodeModal(false);
        setCodigo("");
        return;
      }

      // 2) CÓDIGO DE INDICAÇÃO (desconto): DR1001, DR1234, etc.
      if (isReferralCode(codigo)) {
        const c = codigo.trim().toUpperCase();
        const discount =
          CODIGOS_FIXOS[c]?.discountPercent != null
            ? CODIGOS_FIXOS[c].discountPercent
            : 10;

        setReferralApplied(true);
        setReferralCode(c);
        setReferralDiscount(discount);

        Alert.alert(
          "Código aplicado",
          `Código ${c} válido — desconto de ${discount}% aplicado na compra.`
        );

        setShowCodeModal(false);
        setCodigo("");
        return;
      }

      // 3) Caso não caia em nenhum dos formatos acima → inválido
      Alert.alert("Código inválido", "Confira e tente novamente.");
    } catch (e) {
      console.log("ativar codigo error", e);
      Alert.alert("Falha", "Não foi possível validar este código.");
    } finally {
      setLoading(false);
    }
  };

  // ---------- UI ----------
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.title}>Escolha seu plano</Text>
      <Text style={styles.sub}>
        Você pode comprar pelo app ou aplicar um código de indicação.
      </Text>

      {referralApplied && (
        <View style={styles.badge}>
          <Text style={styles.badgeTxt}>
            Código {referralCode} aplicado — {referralDiscount}% OFF
          </Text>
        </View>
      )}

      <View style={styles.cardArea}>
        <View className="card" style={styles.card}>
          <Text style={styles.cardTitle}>Plano Individual</Text>
          <Text style={styles.cardDesc}>
            Uso individual, dados locais no aparelho.
          </Text>
          <TouchableOpacity
            style={styles.btn}
            disabled={loading}
            onPress={() =>
              liberaracesso(
                referralApplied
                  ? SKU_INDIVIDUAL_DESCONTO || SKU_INDIVIDUAL
                  : SKU_INDIVIDUAL
              )
            }
          >
            <Text style={styles.btnText}>
              {loading ? "Processando..." : "Liberar Acesso"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Plano Colaboradores</Text>
          <Text style={styles.cardDesc}>
            Multiusuário e colaboração (sincronização).
          </Text>
          <TouchableOpacity
            style={styles.btn}
            disabled={loading}
            onPress={() =>
              liberaracesso(
                referralApplied
                  ? SKU_COLABORADORES_DESCONTO || SKU_COLABORADORES
                  : SKU_COLABORADORES
              )
            }
          >
            <Text style={styles.btnText}>
              {loading ? "Processando..." : "Liberar Acesso"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.btn, styles.btnOutline]}
        onPress={() => setShowCodeModal(true)}
        disabled={loading}
      >
        <Text style={[styles.btnText, styles.btnOutlineText]}>
          Aplicar código
        </Text>
      </TouchableOpacity>

      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator size="large" />
        </View>
      )}

      {/* MODAL DE CÓDIGO */}
      <Modal
        transparent
        visible={showCodeModal}
        animationType="slide"
        onRequestClose={() => setShowCodeModal(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Código</Text>
            <TextInput
              value={codigo}
              onChangeText={setCodigo}
              placeholder="Ex.: DR1001 (indicação) ou DRD-IND-XXXX"
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
            <Text style={{ fontSize: 18, color: "#666", marginTop: 6 }}>
              • Códigos “DRD-IND-…/DRD-COL-…” ativam o plano direto.{"\n"}•
              Códigos como “DR1001” aplicam desconto na compra.
            </Text>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#fff", gap: 16 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "center" },
  sub: { fontSize: 14, textAlign: "center", color: "#444" },
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
    borderWidth: 1,
    borderColor: "#e2e2e2",
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  cardTitle: { fontSize: 18, fontWeight: "700" },
  cardDesc: { fontSize: 14, color: "#555" },
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
    fontSize: 18, // 🔹 Agora a fonte do texto do botão está maior
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
