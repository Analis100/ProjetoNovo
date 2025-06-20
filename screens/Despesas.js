import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
  Keyboard, // 👈
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function Despesas() {
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [despesas, setDespesas] = useState([]);
  const [soma, setSoma] = useState(0);
  const [dataAtual, setDataAtual] = useState("");

  useEffect(() => {
    const hoje = new Date().toLocaleDateString("pt-BR");
    setDataAtual(hoje);
    carregarDespesas(hoje);
  }, []);

  const carregarDespesas = async (data) => {
    const json = await AsyncStorage.getItem("despesas");
    const lista = json ? JSON.parse(json) : [];
    const despesasHoje = lista.filter((item) => item.data === data);
    setDespesas(despesasHoje);
    const total = despesasHoje.reduce((acc, cur) => acc + cur.valor, 0);
    setSoma(total);
    atualizarDemonstrativo(total);
  };

  const salvarDespesa = async () => {
    Keyboard.dismiss(); // 👈

    if (!descricao || !valor) return;

    const novaDespesa = {
      data: dataAtual,
      descricao,
      valor: parseFloat(valor.replace(",", ".")),
    };

    const json = await AsyncStorage.getItem("despesas");
    const lista = json ? JSON.parse(json) : [];
    const novaLista = [...lista, novaDespesa];
    await AsyncStorage.setItem("despesas", JSON.stringify(novaLista));

    setDescricao("");
    setValor("");
    carregarDespesas(dataAtual);
  };

  const confirmarExclusao = (index) => {
    const item = despesas[index];
    Alert.alert(
      "Excluir despesa",
      `Tem certeza que deseja excluir:\n\n"${
        item.descricao
      }" de ${formatarValor(item.valor)}?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: () => excluirDespesa(index),
        },
      ]
    );
  };

  const excluirDespesa = async (index) => {
    const json = await AsyncStorage.getItem("despesas");
    const lista = json ? JSON.parse(json) : [];
    const novaLista = lista.filter(
      (item, i) => !(item.data === dataAtual && i === index)
    );
    await AsyncStorage.setItem("despesas", JSON.stringify(novaLista));
    carregarDespesas(dataAtual);
  };

  const atualizarDemonstrativo = async (totalDespesas) => {
    const hoje = dataAtual;
    const demoJson = await AsyncStorage.getItem("demonstrativoMensal");
    const demo = demoJson ? JSON.parse(demoJson) : {};

    const dia = demo[hoje] || {
      saldoAnterior: 0,
      receitas: 0,
      despesas: 0,
      saldoFinal: 0,
    };

    dia.despesas = totalDespesas;
    dia.saldoFinal = dia.saldoAnterior + dia.receitas - dia.despesas;

    demo[hoje] = dia;
    await AsyncStorage.setItem("demonstrativoMensal", JSON.stringify(demo));
  };

  const formatarValor = (v) =>
    Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        <Text style={styles.titulo}>Despesas – {dataAtual}</Text>

        <TextInput
          style={styles.input}
          placeholder="Descrição"
          value={descricao}
          onChangeText={setDescricao}
        />
        <TextInput
          style={styles.input}
          placeholder="Valor"
          keyboardType="numeric"
          value={valor}
          onChangeText={setValor}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
        />

        {/* Botão com borda dourada */}
        <TouchableOpacity style={styles.botao} onPress={salvarDespesa}>
          <Text style={styles.botaoTexto}>Inserir Despesa</Text>
        </TouchableOpacity>

        <FlatList
          data={despesas}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item, index }) => (
            <View style={styles.itemLinha}>
              <Text style={styles.itemLista}>
                {item.descricao} – {formatarValor(item.valor)}
              </Text>
              <TouchableOpacity onPress={() => confirmarExclusao(index)}>
                <Text style={styles.excluir}>Excluir</Text>
              </TouchableOpacity>
            </View>
          )}
        />

        <Text style={styles.total}>Total: {formatarValor(soma)}</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  titulo: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    marginVertical: 8,
    borderRadius: 8,
  },
  botao: {
    borderWidth: 1,
    borderColor: "#bfa140", // dourado
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginVertical: 12,
    backgroundColor: "#fff",
  },
  botaoTexto: {
    color: "#bfa140",
    fontWeight: "bold",
    fontSize: 16,
  },
  itemLinha: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  itemLista: { fontSize: 16 },
  excluir: { color: "red", fontWeight: "bold" },
  total: {
    marginTop: 10,
    fontWeight: "bold",
    color: "red",
    fontSize: 18,
    textAlign: "center",
  },
});
