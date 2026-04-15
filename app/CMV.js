import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FORM_CARD } from "../styles/formCard";

export default function CMV() {
  const [estoque, setEstoque] = useState([]);
  const [custos, setCustos] = useState({});
  const [lucros, setLucros] = useState([]);
  const [inputCusto, setInputCusto] = useState("");
  const [codigoAtual, setCodigoAtual] = useState("");

  useEffect(() => {
    carregarEstoque();
    carregarCustos();
  }, []);

  const carregarEstoque = async () => {
    const json = await AsyncStorage.getItem("estoque");
    const lista = json ? JSON.parse(json) : [];
    setEstoque(lista);
  };

  const carregarCustos = async () => {
    const json = await AsyncStorage.getItem("custosProdutos");
    const obj = json ? JSON.parse(json) : {};
    setCustos(obj);
  };

  const salvarCusto = async () => {
    if (!codigoAtual || !inputCusto) return;
    const novo = { ...custos, [codigoAtual]: parseFloat(inputCusto) };
    setCustos(novo);
    await AsyncStorage.setItem("custosProdutos", JSON.stringify(novo));
    setInputCusto("");
    calcularLucros(estoque, novo);
  };

  const calcularLucros = (estoqueData, custosData) => {
    const lista = estoqueData.map((item) => {
      const custoUnit = custosData[item.codigo] || 0;
      const qtdVendida = item.saida;
      const venda = item.valorTotal;
      const custoTotal = custoUnit * qtdVendida;
      const lucro = venda - custoTotal;
      return {
        ...item,
        custoUnit,
        custoTotal,
        lucro,
      };
    });
    setLucros(lista);
  };

  useEffect(() => {
    calcularLucros(estoque, custos);
  }, [estoque, custos]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.titulo}>CMV – Custo da Mercadoria Vendida</Text>
      {lucros.map((item) => (
        <View key={item.codigo} style={styles.card}>
          <Text style={styles.label}>
            <Text style={styles.bold}>Código:</Text> {item.codigo}
          </Text>
          <Text style={styles.label}>
            <Text style={styles.bold}>Descrição:</Text> {item.descricao}
          </Text>
          <Text style={styles.label}>
            <Text style={styles.bold}>Quantidade vendida:</Text>{" "}
            {Math.floor(item.saida)}
          </Text>

          <TextInput
            placeholder="Digite o custo unitário"
            keyboardType="numeric"
            value={codigoAtual === item.codigo ? inputCusto : ""}
            onChangeText={setInputCusto}
            onFocus={() => setCodigoAtual(item.codigo)}
            onSubmitEditing={salvarCusto}
            style={styles.input}
          />

          <Text style={styles.label}>
            <Text style={styles.bold}>Custo Total:</Text> R${" "}
            {item.custoTotal.toFixed(2)}
          </Text>
          <Text style={styles.label}>
            <Text style={styles.bold}>Lucro Estimado:</Text> R${" "}
            {item.lucro.toFixed(2)}
          </Text>
        </View>
      ))}

      {lucros.length > 0 && (
        <Text style={styles.totalLucro}>
          Total do Lucro Bruto: R${" "}
          {lucros.reduce((acc, i) => acc + i.lucro, 0).toFixed(2)}
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 60,
    backgroundColor: "#fff",
  },
  titulo: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 16,
  },
  card: {
    ...FORM_CARD,
    backgroundColor: "#f8f8f8",
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    marginBottom: 4,
  },
  bold: {
    fontWeight: "bold",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 8,
    marginBottom: 10,
    fontSize: 16,
  },
  totalLucro: {
    fontSize: 18,
    fontWeight: "bold",
    color: "green",
    textAlign: "center",
    marginTop: 10,
  },
});
