// screens/ConfigMEI.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  Keyboard,
  TouchableOpacity,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_LIMITS = "@MEI_LIMITS";

const maskBRL = (texto) => {
  const digits = String(texto || "").replace(/\D/g, "");
  const n = parseInt(digits || "0", 10) / 100;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};
const parseBRL = (masked) => {
  const digits = String(masked || "").replace(/\D/g, "");
  return parseInt(digits || "0", 10) / 100 || 0;
};

async function getLimits() {
  try {
    const raw = await AsyncStorage.getItem(KEY_LIMITS);
    const parsed = raw ? JSON.parse(raw) : null;
    const withDefaults = {
      anual: 81000,
      mensal: 81000 / 12,
      avisos: true,
      ...(parsed || {}),
    };
    if (!parsed || typeof parsed.avisos === "undefined") {
      await AsyncStorage.setItem(KEY_LIMITS, JSON.stringify(withDefaults));
    }
    return withDefaults;
  } catch {
    const defaults = { anual: 81000, mensal: 81000 / 12, avisos: true };
    await AsyncStorage.setItem(KEY_LIMITS, JSON.stringify(defaults));
    return defaults;
  }
}
async function saveLimits(newLimits) {
  const safe = {
    anual: Number(newLimits?.anual) || 81000,
    mensal: Number(newLimits?.mensal) || 81000 / 12,
    avisos: newLimits?.avisos !== false,
  };
  await AsyncStorage.setItem(KEY_LIMITS, JSON.stringify(safe));
  return safe;
}
export default function ConfigMEI({ navigation }) {
  const [anual, setAnual] = useState("R$ 81.000,00");
  const [mensal, setMensal] = useState("R$ 6.750,00");
  const [travarMensalAuto, setTravarMensalAuto] = useState(true); // mensal = anual/12

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY_LIMITS);
        if (raw) {
          const { anual: a = 81000, mensal: m = 81000 / 12 } = JSON.parse(raw);
          setAnual(
            a.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
          );
          setMensal(
            m.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
          );
        }
      } catch {}
    })();
  }, []);

  // quando anual muda e está travado, recalcula mensal
  useEffect(() => {
    if (!travarMensalAuto) return;
    const a = parseBRL(anual);
    const m = Math.max(0, a / 12);
    setMensal(maskBRL(String(m)));
  }, [anual, travarMensalAuto]);

  const salvar = async () => {
    Keyboard.dismiss();
    const a = parseBRL(anual);
    const m = parseBRL(mensal);
    if (a <= 0)
      return Alert.alert("Atenção", "Informe um limite anual maior que zero.");
    if (m <= 0)
      return Alert.alert("Atenção", "Informe um limite mensal maior que zero.");

    try {
      await AsyncStorage.setItem(
        KEY_LIMITS,
        JSON.stringify({ anual: a, mensal: m }),
      );
      Alert.alert("Pronto!", "Limites salvos com sucesso.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert(
        "Erro",
        "Não foi possível salvar os limites. Tente novamente.",
      );
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Configurações do MEI</Text>

      <Text style={styles.label}>Limite Anual</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={anual}
        onChangeText={(t) => setAnual(maskBRL(t))}
        placeholder="R$ 81.000,00"
        placeholderTextColor="#666"
        returnKeyType="done"
      />

      <TouchableOpacity
        onPress={() => setTravarMensalAuto((v) => !v)}
        style={styles.switchRow}
        activeOpacity={0.8}
      >
        <View style={[styles.switchBox, travarMensalAuto && styles.switchOn]} />
        <Text style={styles.switchTxt}>
          Calcular mensal automaticamente (anual ÷ 12)
        </Text>
      </TouchableOpacity>

      <Text style={styles.label}>Limite Mensal</Text>
      <TextInput
        style={[styles.input, travarMensalAuto && { opacity: 0.6 }]}
        keyboardType="numeric"
        value={mensal}
        onChangeText={(t) => setMensal(maskBRL(t))}
        editable={!travarMensalAuto}
        placeholder="R$ 6.750,00"
        placeholderTextColor="#666"
        returnKeyType="done"
      />

      <TouchableOpacity style={styles.btn} onPress={salvar}>
        <Text style={styles.btnTxt}>Salvar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  titulo: {
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 12,
  },
  label: { fontWeight: "700", color: "#111", marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#fff",
    marginTop: 6,
    color: "#111",
    fontWeight: "700",
  },
  btn: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#bfa140",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  btnTxt: { color: "#bfa140", fontWeight: "800", fontSize: 16 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  switchBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#bbb",
  },
  switchOn: { backgroundColor: "#10b981", borderColor: "#10b981" },
  switchTxt: { color: "#111" },
});
