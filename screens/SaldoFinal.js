import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function SaldoFinal() {
  const [saldoFinal, setSaldoFinal] = useState(null);
  const [mensagem, setMensagem] = useState("");
  const [positivo, setPositivo] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [dataAtual, setDataAtual] = useState("");
  const [percentual, setPercentual] = useState("--");

  /* ─── carga inicial ──────────────────────────────────── */
  useEffect(() => {
    calcularSaldoFinal();
    const hoje = new Date().toLocaleDateString("pt-BR");
    setDataAtual(hoje);
  }, []);

  /* ─── cálculo de saldo final ─────────────────────────── */
  const calcularSaldoFinal = async () => {
    const saldoAnterior =
      parseFloat(await AsyncStorage.getItem("saldoAnterior")) || 0;

    const receitasRaw = await AsyncStorage.getItem("receitas");
    const despesasRaw = await AsyncStorage.getItem("despesas");
    const receitas = receitasRaw ? JSON.parse(receitasRaw) : [];
    const despesas = despesasRaw ? JSON.parse(despesasRaw) : [];

    const hoje = new Date().toLocaleDateString("pt-BR");
    const totalReceitas = receitas
      .filter((r) => r.data === hoje)
      .reduce((a, c) => a + c.valor, 0);
    const totalDespesas = despesas
      .filter((d) => d.data === hoje)
      .reduce((a, c) => a + c.valor, 0);

    const saldo = saldoAnterior + totalReceitas - totalDespesas;

    /* percentual lucro/prejuízo */
    if (totalReceitas > 0) {
      const perc = ((totalReceitas - totalDespesas) / totalReceitas) * 100;
      setPercentual(
        perc >= 0
          ? `${Math.abs(perc.toFixed(0))}% Lucro`
          : `${Math.abs(perc.toFixed(0))}% Prejuízo`
      );
    } else setPercentual("--");

    setSaldoFinal(saldo);
    setPositivo(saldo >= 0);
    setMensagem(
      saldo >= 0
        ? "Parabéns, seu saldo é positivo!"
        : "Não desanime, amanhã será melhor!"
    );
    setCarregando(false);
  };

  /* ─── confirmação + reset ────────────────────────────── */
  const confirmarReset = () =>
    Alert.alert(
      "Resetar lançamentos",
      "Isto irá apagar Saldo Anterior, Receitas e Despesas do dia. Continuar?",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Resetar", style: "destructive", onPress: resetarDia },
      ]
    );

  const resetarDia = async () => {
    try {
      await AsyncStorage.multiRemove(["saldoAnterior", "receitas", "despesas"]);

      setSaldoFinal(0);
      setMensagem("");
      setPercentual("--");
      Alert.alert("Reset realizado", "O dia foi zerado com sucesso.");
    } catch (e) {
      Alert.alert("Erro", "Não foi possível resetar os dados.");
    }
  };

  const formatarValor = (v) =>
    Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (carregando) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  /* ─── render ─────────────────────────────────────────── */
  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <Text style={styles.titulo}>Saldo Final</Text>
      <Text style={styles.data}>Data: {dataAtual}</Text>

      <View
        style={[
          styles.caixaResultado,
          positivo ? styles.fundoVerde : styles.fundoVermelho,
        ]}
      >
        <Text style={styles.textoResultado}>{formatarValor(saldoFinal)}</Text>
      </View>

      <Text style={styles.percentual}>{percentual}</Text>

      <Text
        style={[
          styles.mensagem,
          positivo ? styles.textoVerde : styles.textoVermelho,
        ]}
      >
        {mensagem}
      </Text>

      <TouchableOpacity style={styles.botao} onPress={confirmarReset}>
        <Text style={styles.textoBotao}>Resetar Lançamentos do Dia</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

/* ─── estilos ─────────────────────────────────────────── */
const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: "#fff",
  },
  titulo: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 12,
  },
  data: { fontSize: 16, textAlign: "center", marginBottom: 10 },
  caixaResultado: { padding: 20, borderRadius: 10, marginVertical: 10 },
  textoResultado: { fontSize: 28, fontWeight: "bold", textAlign: "center" },
  fundoVerde: { backgroundColor: "#d4edda" },
  fundoVermelho: { backgroundColor: "#f8d7da" },
  textoVerde: { color: "#155724", textAlign: "center", fontSize: 16 },
  textoVermelho: { color: "#721c24", textAlign: "center", fontSize: 16 },
  mensagem: { marginTop: 10, marginBottom: 20 },
  percentual: {
    fontSize: 18,
    textAlign: "center",
    marginBottom: 10,
    fontWeight: "bold",
    color: "#333",
  },
  botao: {
    backgroundColor: "#888",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  textoBotao: { color: "#fff", fontWeight: "bold" },
});
