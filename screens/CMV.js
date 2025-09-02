import React, { useEffect, useState } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const formatarMoeda = (valor) => {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
};

const parseCurrencyBRL = (valorStr) => {
  if (!valorStr) return 0;
  const clean = valorStr.replace(/[^\d,]/g, "").replace(",", ".");
  return parseFloat(clean) || 0;
};

export default function CMV() {
  const [estoqueBaixado, setEstoqueBaixado] = useState([]);
  const [custos, setCustos] = useState({});
  const [valorEstoqueTotal, setValorEstoqueTotal] = useState(0);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    const estoqueJson = await AsyncStorage.getItem("estoque");
    const custoSalvo = await AsyncStorage.getItem("custosUnitarios");
    const lista = estoqueJson ? JSON.parse(estoqueJson) : [];
    const custosSalvos = custoSalvo ? JSON.parse(custoSalvo) : {};
    const baixados = lista.filter((p) => p.saida > 0);
    setEstoqueBaixado(baixados);
    setCustos(custosSalvos);

    // Calcular valor total atual em estoque (soma de todos os produtos)
    const totalEstoque = lista.reduce(
      (acc, item) => acc + (item.valorTotal || 0),
      0
    );
    setValorEstoqueTotal(totalEstoque);
  };

  const salvarCusto = async (codigo, novoCusto) => {
    const novosCustos = { ...custos, [codigo]: novoCusto };
    setCustos(novosCustos);
    await AsyncStorage.setItem("custosUnitarios", JSON.stringify(novosCustos));
  };

  const totalLucro = estoqueBaixado.reduce((acc, item) => {
    const custoUni = parseCurrencyBRL(custos[item.codigo] || "0");
    const custoTotal = custoUni * item.saida;

    const qtdVendida = item.saida;
    const qtdRestante = item.entrada - qtdVendida;
    const valorUnitEntrada =
      qtdRestante > 0 ? item.valorTotal / qtdRestante : 0;
    const valorEntradaOriginal = valorUnitEntrada * item.entrada;
    const valorVenda = valorEntradaOriginal - item.valorTotal;

    const lucro = valorVenda - custoTotal;
    return acc + lucro;
  }, 0);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.titulo}>CMV – Custo da Mercadoria Vendida</Text>

      {estoqueBaixado.map((item) => {
        const custoUni = custos[item.codigo] || "";
        const custoUnitario = parseCurrencyBRL(custoUni);
        const custoTotal = custoUnitario * item.saida;

        const qtdVendida = item.saida;
        const qtdRestante = item.entrada - qtdVendida;
        const valorUnitEntrada =
          qtdRestante > 0 ? item.valorTotal / qtdRestante : 0;
        const valorEntradaOriginal = valorUnitEntrada * item.entrada;
        const valorVenda = valorEntradaOriginal - item.valorTotal;

        const lucro = valorVenda - custoTotal;

        return (
          <View key={item.codigo} style={styles.bloco}>
            <Text style={styles.item}>
              <Text style={styles.label}>Código:</Text> {item.codigo}
            </Text>
            <Text style={styles.item}>
              <Text style={styles.label}>Descrição:</Text> {item.descricao}
            </Text>
            <Text style={styles.item}>
              <Text style={styles.label}>Quantidade vendida:</Text> {item.saida}
            </Text>
            <Text style={styles.item}>
              <Text style={styles.label}>Valor total da venda:</Text>{" "}
              {formatarMoeda(valorVenda)}
            </Text>
            <Text style={styles.item}>
              <Text style={styles.label}>Valor atual em estoque:</Text>{" "}
              {formatarMoeda(item.valorTotal)}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Custo unitário (R$)"
              keyboardType="numeric"
              value={custoUni}
              onChangeText={(text) => salvarCusto(item.codigo, text)}
            />

            <Text style={styles.item}>
              <Text style={styles.label}>Custo Total:</Text>{" "}
              {formatarMoeda(custoTotal)}
            </Text>
            <Text style={styles.item}>
              <Text style={styles.label}>Lucro Estimado:</Text>{" "}
              {formatarMoeda(lucro)}
            </Text>
          </View>
        );
      })}

      <Text style={styles.totalLucro}>
        Total de Lucro: {formatarMoeda(totalLucro)}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: "#fff",
  },
  titulo: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 16,
  },
  bloco: {
    padding: 16,
    backgroundColor: "#f2f2f2",
    borderRadius: 10,
    marginBottom: 20,
  },
  item: {
    fontSize: 16,
    marginBottom: 8,
  },
  label: {
    fontWeight: "bold",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 8,
    fontSize: 16,
    marginBottom: 12,
  },
  totalLucro: {
    marginTop: 24,
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    color: "green",
  },
  totalEstoque: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    color: "#444",
  },
});
