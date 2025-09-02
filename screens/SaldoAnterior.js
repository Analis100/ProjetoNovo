import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableOpacity,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function SaldoAnterior() {
  const [valor, setValor] = useState("");
  const [saldoAtual, setSaldoAtual] = useState(null);
  const [dataAtual, setDataAtual] = useState("");

  useEffect(() => {
    carregarSaldoAnterior();
    const hoje = new Date().toLocaleDateString("pt-BR");
    setDataAtual(hoje);
  }, []);

  const carregarSaldoAnterior = async () => {
    const dado = await AsyncStorage.getItem("saldoAnterior");
    if (dado !== null) setSaldoAtual(parseFloat(dado));
  };

  const salvarSaldoAnterior = async () => {
    const numero = parseFloat(valor.replace(",", "."));
    if (isNaN(numero)) return;
    await AsyncStorage.setItem("saldoAnterior", String(numero));
    setSaldoAtual(numero);
    setValor("");
  };

  const confirmarExclusao = () => {
    Alert.alert(
      "Excluir saldo",
      "Tem certeza que deseja apagar o saldo anterior salvo?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: excluirSaldoAnterior,
        },
      ]
    );
  };

  const excluirSaldoAnterior = async () => {
    await AsyncStorage.removeItem("saldoAnterior");
    setSaldoAtual(null);
    setValor("");
  };

  const formatarValor = (v) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <View style={styles.container}>
        <Text style={styles.titulo}>Saldo Anterior</Text>
        <Text style={styles.data}>Data: {dataAtual}</Text>

        <TextInput
          style={styles.input}
          keyboardType="default"
          placeholder="Digite o valor (ex: -100 ou 200)"
          value={valor}
          onChangeText={setValor}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
        />

        <TouchableOpacity
          style={styles.botao}
          onPress={() => {
            Keyboard.dismiss();
            salvarSaldoAnterior();
          }}
        >
          <Text style={styles.botaoTexto}>Inserir</Text>
        </TouchableOpacity>

        {saldoAtual !== null && (
          <View
            style={[
              styles.valorBox,
              { backgroundColor: saldoAtual < 0 ? "#f8d7da" : "#d4edda" },
            ]}
          >
            <Text
              style={[
                styles.valorTexto,
                { color: saldoAtual < 0 ? "#a94442" : "#155724" },
              ]}
            >
              Valor salvo: {formatarValor(saldoAtual)}
            </Text>

            <View style={styles.botaoExcluir}>
              <TouchableOpacity onPress={confirmarExclusao}>
                <Text style={styles.excluirTxt}>Excluir Saldo</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: "#fff",
    flex: 1,
  },
  titulo: {
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  data: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    fontSize: 18,
    borderRadius: 8,
    marginBottom: 20,
  },
  botao: {
    borderWidth: 1,
    borderColor: "#bfa140",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 20,
    backgroundColor: "#fff",
  },
  botaoTexto: {
    color: "#bfa140",
    fontWeight: "bold",
    fontSize: 16,
  },
  valorBox: { padding: 15, borderRadius: 8 },
  valorTexto: { fontSize: 20, textAlign: "center", fontWeight: "bold" },
  botaoExcluir: { marginTop: 10, alignItems: "center" },
  excluirTxt: { color: "#dc3545", fontWeight: "bold", fontSize: 16 },
});
