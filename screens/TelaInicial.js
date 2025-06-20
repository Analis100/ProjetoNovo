import React, { useEffect } from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function TelaInicial({ navigation }) {
  useEffect(() => {
    (async () => {
      const jaAvisou = await AsyncStorage.getItem("senhaAvisada");
      if (!jaAvisou) {
        Alert.alert(
          "Senha inicial",
          'A senha padrão é "1234". Você pode alterá-la em Configurações.'
        );
        await AsyncStorage.setItem("senhaAvisada", "true");
      }
    })();
  }, []);

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { flexGrow: 1 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>DRD-Empresarial</Text>
      <Text style={styles.subtitle}>Demonstrativo do Resultado Diário</Text>

      {/* BOTÕES ORIGINAIS */}
      <TouchableOpacity
        style={[styles.button, { backgroundColor: "#17a2b8" }]}
        onPress={() => navigation.navigate("Instrucoes")}
      >
        <Text style={styles.buttonText}>Instruções de Uso</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.button}
        onPress={() =>
          navigation.navigate("Senha", { destino: "SaldoAnterior" })
        }
      >
        <Text style={styles.buttonText}>Saldo Anterior</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate("Receitas")}
      >
        <Text style={styles.buttonText}>Receitas</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate("Despesas")}
      >
        <Text style={styles.buttonText}>Despesas</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate("Senha", { destino: "SaldoFinal" })}
      >
        <Text style={styles.buttonText}>Saldo Final</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: "#28a745" }]}
        onPress={() => navigation.navigate("Senha", { destino: "Historico" })}
      >
        <Text style={styles.buttonText}>Demonstrativo</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: "#28a745" }]}
        onPress={() => navigation.navigate("ControleEstoque")}
      >
        <Text style={styles.buttonText}>Estoque</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: "#6c63ff" }]}
        onPress={() =>
          navigation.navigate("Senha", { destino: "ExportarPDFCompleto" })
        }
      >
        <Text style={styles.buttonText}>Exportar PDF</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: "#6c757d" }]}
        onPress={() =>
          navigation.navigate("Senha", { destino: "ConfiguraSenha" })
        }
      >
        <Text style={styles.buttonText}>Configurações</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#bfa140", // 👈 DOURADO
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 24,
    color: "#bfa140", // 👈 DOURADO
    textAlign: "center",
  },
  button: {
    backgroundColor: "#007bff",
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    marginVertical: 6,
    width: "80%",
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    textAlign: "center",
  },
});
