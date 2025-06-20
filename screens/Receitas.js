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

export default function Receitas() {
  const [codigo, setCodigo] = useState("");
  const [qtd, setQtd] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [receitas, setReceitas] = useState([]);
  const [soma, setSoma] = useState(0);
  const [dataAtual, setDataAtual] = useState("");

  useEffect(() => {
    const hoje = new Date().toLocaleDateString("pt-BR");
    setDataAtual(hoje);
    carregarReceitas(hoje);
  }, []);

  const carregarReceitas = async (data) => {
    const json = await AsyncStorage.getItem("receitas");
    const lista = json ? JSON.parse(json) : [];
    const hoje = lista.filter((item) => item.data === data);
    setReceitas(hoje);
    const total = hoje.reduce((a, c) => a + c.valor, 0);
    setSoma(total);
    atualizarDemonstrativo(total);
  };

  const salvarReceita = async () => {
    Keyboard.dismiss(); // 👈

    if (!descricao || !valor) return;

    const novaReceita = {
      data: dataAtual,
      codigo: codigo || "-",
      qtd: qtd ? parseFloat(qtd) : 0,
      descricao,
      valor: parseFloat(valor.replace(",", ".")),
    };

    const json = await AsyncStorage.getItem("receitas");
    const lista = json ? JSON.parse(json) : [];
    const novaLista = [...lista, novaReceita];
    await AsyncStorage.setItem("receitas", JSON.stringify(novaLista));

    if (codigo && qtd) {
      await atualizarEstoqueSaida(codigo, parseFloat(qtd));
    }

    setCodigo("");
    setQtd("");
    setDescricao("");
    setValor("");
    carregarReceitas(dataAtual);
  };

  const confirmarExclusao = (index) => {
    const item = receitas[index];
    Alert.alert(
      "Excluir receita",
      `Tem certeza que deseja excluir:\n\n"${item.descricao}" de ${fmtValor(
        item.valor
      )}?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: () => excluirReceita(index),
        },
      ]
    );
  };

  const excluirReceita = async (index) => {
    const json = await AsyncStorage.getItem("receitas");
    const lista = json ? JSON.parse(json) : [];
    const receitasHoje = lista.filter((r) => r.data === dataAtual);
    const removida = receitasHoje[index];
    const novaLista = lista.filter((item) => item !== removida);
    await AsyncStorage.setItem("receitas", JSON.stringify(novaLista));
    if (removida && removida.codigo !== "-" && removida.qtd) {
      await atualizarEstoqueRetorno(removida.codigo, removida.qtd);
    }
    carregarReceitas(dataAtual);
  };

  const atualizarEstoqueSaida = async (cod, quantidade) => {
    const json = await AsyncStorage.getItem("estoque");
    const lista = json ? JSON.parse(json) : [];
    const idx = lista.findIndex((p) => p.codigo === cod);
    if (idx >= 0) {
      lista[idx].saida += quantidade;
      await AsyncStorage.setItem("estoque", JSON.stringify(lista));
    }
  };

  const atualizarEstoqueRetorno = async (cod, quantidade) => {
    const json = await AsyncStorage.getItem("estoque");
    const lista = json ? JSON.parse(json) : [];
    const idx = lista.findIndex((p) => p.codigo === cod);
    if (idx >= 0) {
      lista[idx].saida = Math.max(0, lista[idx].saida - quantidade);
      await AsyncStorage.setItem("estoque", JSON.stringify(lista));
    }
  };

  const atualizarDemonstrativo = async (totalReceitas) => {
    const hoje = dataAtual;
    const demoJ = await AsyncStorage.getItem("demonstrativoMensal");
    const demo = demoJ ? JSON.parse(demoJ) : {};
    const dia = demo[hoje] || {
      saldoAnterior: 0,
      receitas: 0,
      despesas: 0,
      saldoFinal: 0,
    };
    dia.receitas = totalReceitas;
    dia.saldoFinal = dia.saldoAnterior + dia.receitas - dia.despesas;
    demo[hoje] = dia;
    await AsyncStorage.setItem("demonstrativoMensal", JSON.stringify(demo));
  };

  const fmtValor = (v) =>
    Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        <Text style={styles.titulo}>Receitas – {dataAtual}</Text>

        <View style={styles.boxVenda}>
          <TextInput
            style={styles.inputCod}
            placeholder="Código"
            value={codigo}
            onChangeText={setCodigo}
          />
          <TextInput
            style={styles.inputQtd}
            placeholder="Qtd"
            keyboardType="numeric"
            value={qtd}
            onChangeText={setQtd}
          />
        </View>

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

        {/* Botão com moldura dourada */}
        <TouchableOpacity style={styles.botao} onPress={salvarReceita}>
          <Text style={styles.botaoTexto}>Inserir Receita</Text>
        </TouchableOpacity>

        <FlatList
          data={receitas}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item, index }) => (
            <View style={styles.itemLinha}>
              <Text style={styles.itemLista}>
                {`${item.codigo !== "-" ? item.codigo + " • " : ""}${
                  item.descricao
                } (${item.qtd || 0}) – ${fmtValor(item.valor)}`}
              </Text>
              <TouchableOpacity onPress={() => confirmarExclusao(index)}>
                <Text style={styles.excluir}>Excluir</Text>
              </TouchableOpacity>
            </View>
          )}
        />

        <Text style={styles.total}>Total: {fmtValor(soma)}</Text>
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
  boxVenda: { flexDirection: "row", gap: 6, marginTop: 8 },
  inputCod: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 8,
    borderRadius: 6,
    width: 110,
  },
  inputQtd: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 8,
    borderRadius: 6,
    width: 70,
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
    borderColor: "#bfa140",
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
    color: "green",
    fontSize: 18,
    textAlign: "center",
  },
});
