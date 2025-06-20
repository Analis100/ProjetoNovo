import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  StyleSheet,
  Alert,
  TouchableOpacity,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function ControleEstoque() {
  const [codigo, setCodigo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [entrada, setEntrada] = useState("");
  const [estoque, setEstoque] = useState([]);

  /* ── carrega estoque no início ───────────────────────── */
  useEffect(() => {
    carregarEstoque();
  }, []);

  const carregarEstoque = async () => {
    const json = await AsyncStorage.getItem("estoque");
    setEstoque(json ? JSON.parse(json) : []);
  };

  /* ── insere novo produto ou soma à entrada ──────────── */
  const salvarProduto = async () => {
    if (!codigo || !descricao || !entrada) return;

    const qtd = parseFloat(entrada.replace(",", "."));
    const lista = [...estoque];
    const idx = lista.findIndex((p) => p.codigo === codigo);

    if (idx >= 0) {
      /* produto já existe → soma entrada */
      lista[idx].entrada += qtd;
    } else {
      lista.push({ codigo, descricao, entrada: qtd, saida: 0 });
    }

    await AsyncStorage.setItem("estoque", JSON.stringify(lista));
    setCodigo("");
    setDescricao("");
    setEntrada("");
    setEstoque(lista);
  };

  /* ── remove item inteiro do estoque ─────────────────── */
  const excluirProduto = async (index) => {
    Alert.alert("Excluir", "Remover este item do estoque?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          const novaLista = estoque.filter((_, i) => i !== index);
          await AsyncStorage.setItem("estoque", JSON.stringify(novaLista));
          setEstoque(novaLista);
        },
      },
    ]);
  };

  /* ── formatação helper ──────────────────────────────── */
  const fmtNum = (v) => Number(v).toLocaleString("pt-BR");

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Controle de Estoque em Exposição</Text>

      {/* retângulo de cadastro de entrada */}
      <View style={styles.boxCadastro}>
        <TextInput
          style={styles.inputMini}
          placeholder="Código"
          value={codigo}
          onChangeText={setCodigo}
        />
        <TextInput
          style={styles.inputDesc}
          placeholder="Descrição"
          value={descricao}
          onChangeText={setDescricao}
        />
        <TextInput
          style={styles.inputMini}
          placeholder="Entrada"
          keyboardType="numeric"
          value={entrada}
          onChangeText={setEntrada}
        />
        <Button title="Salvar" onPress={salvarProduto} />
      </View>

      {/* lista */}
      <FlatList
        style={{ marginTop: 10 }}
        data={estoque}
        keyExtractor={(item) => item.codigo}
        ListHeaderComponent={() => (
          <View style={styles.linhaHeader}>
            <Text style={styles.colCodigo}>Código</Text>
            <Text style={styles.colDesc}>Descrição</Text>
            <Text style={styles.colNum}>Entrada</Text>
            <Text style={styles.colNum}>Saída</Text>
            <Text style={styles.colNum}>Exposição</Text>
            <Text style={styles.colAcao} />
          </View>
        )}
        renderItem={({ item, index }) => (
          <View style={styles.linha}>
            <Text style={styles.colCodigo}>{item.codigo}</Text>
            <Text style={styles.colDesc}>{item.descricao}</Text>
            <Text style={styles.colNum}>{fmtNum(item.entrada)}</Text>
            <Text style={styles.colNum}>{fmtNum(item.saida)}</Text>
            <Text style={styles.colNum}>
              {fmtNum(item.entrada - item.saida)}
            </Text>

            {/* botão excluir */}
            <TouchableOpacity onPress={() => excluirProduto(index)}>
              <Text style={styles.excluir}>Excluir</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

/* ─── estilos ─────────────────────────────────────────── */
const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  titulo: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 8,
  },
  boxCadastro: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  inputMini: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 6,
    borderRadius: 6,
    width: 90,
  },
  inputDesc: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 6,
    borderRadius: 6,
  },
  linhaHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingVertical: 4,
  },
  linha: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderColor: "#ddd",
    alignItems: "center",
  },
  colCodigo: { width: 70 },
  colDesc: { flex: 1 },
  colNum: { width: 80, textAlign: "right" },
  colAcao: { width: 60 },
  excluir: { color: "red", fontWeight: "bold", textAlign: "center" },
});
