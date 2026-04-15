// components/SubscriptionGate.js
// components/SubscriptionGate.js
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal } from "react-native";
import { getSubscriptionState, buildRenewalMessage } from "../services/license";
import { useFocusEffect, useNavigation } from "@react-navigation/native";

export default function SubscriptionGate() {
  const [info, setInfo] = useState(null);
  const navigation = useNavigation();

  async function refresh() {
    const st = await getSubscriptionState();
    // console.log("[SubscriptionGate] estado:", st); // opcional p/ debug
    setInfo(st);
  }

  useFocusEffect(
    React.useCallback(() => {
      refresh();
    }, [])
  );

  useEffect(() => {
    // checagem periódica suave quando a tela fica aberta
    const id = setInterval(refresh, 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const msg = buildRenewalMessage(info);

  // Banner: aparece em "warn" (vence amanhã) e "grace1" (1º dia atraso)
  const showBanner = info?.state === "warn" || info?.state === "grace1";
  // Modal bloqueante: "blocked" (2+ dias atraso)
  const blocked = info?.state === "blocked";

  const goPay = () => {
    navigation.navigate("Pagamento"); // sua rota de pagamento
  };

  return (
    <>
      {showBanner && !!msg && (
        <View
          style={[
            styles.banner,
            info?.state === "warn" ? styles.bannerWarn : styles.bannerGrace,
          ]}
        >
          <Text style={styles.bannerTxt} numberOfLines={2}>
            {msg}
          </Text>
          <TouchableOpacity style={styles.bannerBtn} onPress={goPay}>
            <Text style={styles.bannerBtnTxt}>Renovar agora</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={blocked} animationType="fade" transparent>
        <View style={styles.modalWrap}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Plano vencido</Text>
            <Text style={styles.modalMsg} numberOfLines={3}>
              {msg ||
                "Seu plano venceu. Faça a renovação para continuar usando o app."}
            </Text>
            <TouchableOpacity style={styles.modalBtn} onPress={goPay}>
              <Text style={styles.modalBtnTxt}>Renovar agora</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    zIndex: 999,
  },
  bannerWarn: { backgroundColor: "#F59E0B" }, // amarelo/laranja
  bannerGrace: { backgroundColor: "#DC2626" }, // vermelho
  bannerTxt: { flex: 1, color: "#fff", fontWeight: "700" },
  bannerBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#111827",
    borderRadius: 8,
  },
  bannerBtnTxt: { color: "#fff", fontWeight: "700" },

  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBox: {
    width: "86%",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  modalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 8 },
  modalMsg: { fontSize: 14, textAlign: "center", color: "#374151" },
  modalBtn: {
    marginTop: 14,
    backgroundColor: "#2563EB",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  modalBtnTxt: { color: "#fff", fontWeight: "700" },
});
