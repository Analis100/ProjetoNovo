// screens/AssinaturaStatus.js
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
// Aqui você pode ler do Firestore e/ou AsyncStorage o status real.

export default function AssinaturaStatus({ navigation, route }) {
  const { currentSku } = route.params || {};

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Assinatura</Text>
      <Text style={styles.info}>
        Status: <Text style={{ fontWeight: "700" }}>Ativa</Text>
      </Text>
      <Text style={styles.info}>Plano: {currentSku || "-"}</Text>

      <TouchableOpacity
        style={[styles.btn, styles.primary]}
        onPress={() => navigation.replace("TelaInicial")}
      >
        <Text style={styles.btnTxt}>Ir para o app</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btn, styles.outline]}
        onPress={() =>
          navigation.replace("EscolherPlano", {
            skuInfo: { sku: null, memberId: null, code: null },
          })
        }
      >
        <Text style={[styles.btnTxt, styles.outlineTxt]}>Trocar plano</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#fff",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 16,
  },
  info: { textAlign: "center", marginBottom: 6, color: "#333" },
  btn: {
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 10,
    alignItems: "center",
  },
  primary: { backgroundColor: "#2196F3" },
  outline: { borderWidth: 1, borderColor: "#2196F3" },
  btnTxt: { color: "#fff", fontWeight: "700" },
  outlineTxt: { color: "#2196F3" },
});
