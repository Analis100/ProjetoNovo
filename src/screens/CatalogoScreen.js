// screens/CatalogoScreen.js
import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { FORM_CARD } from "../styles/formCard";
import { SafeAreaView } from "react-native-safe-area-context";

// helpers de moeda
const onlyDigits = (s = "") => (s || "").replace(/\D/g, "");
const formatCurrencyBRL = (cents) =>
  (Number(cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });

export default function CatalogoScreen() {
  const [itens, setItens] = useState([]);
  const [selecionados, setSelecionados] = useState([]);
  const capturaRef = useRef(null);

  // modal de preço
  const [precoModalVisivel, setPrecoModalVisivel] = useState(false);
  const [precoCodigoAtual, setPrecoCodigoAtual] = useState(null);
  const [precoInput, setPrecoInput] = useState("R$ 0,00");
  const [precoCentsAtual, setPrecoCentsAtual] = useState(0);

  useEffect(() => {
    carregarCatalogo();
  }, []);

  const carregarCatalogo = async () => {
    try {
      const estoqueJson = await AsyncStorage.getItem("estoque");
      const fotosJson = await AsyncStorage.getItem("catalogoFotos");
      const precosJson = await AsyncStorage.getItem("catalogoPrecos");

      const estoque = estoqueJson ? JSON.parse(estoqueJson) : [];
      const fotos = fotosJson ? JSON.parse(fotosJson) : {};
      const precos = precosJson ? JSON.parse(precosJson) : {};

      const combinados = estoque.map((item) => ({
        ...item,
        imagem: fotos[item.codigo] || null,
        precoCents:
          typeof precos[item.codigo] === "number" ? precos[item.codigo] : null,
      }));

      setItens(combinados);
    } catch (e) {
      console.log("Erro ao carregar catálogo:", e);
      Alert.alert("Erro", "Não foi possível carregar o catálogo.");
    }
  };

  const escolherFoto = async (codigo) => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permissão negada",
          "Precisamos da galeria para escolher foto.",
        );
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7,
      });

      if (res.canceled) return;
      if (!res.assets || res.assets.length === 0) return;

      const src = res.assets[0].uri;

      // Atualiza na memória
      const novos = itens.map((i) =>
        i.codigo === codigo ? { ...i, imagem: src } : i,
      );
      setItens(novos);

      // Atualiza no AsyncStorage
      const fotosJson = await AsyncStorage.getItem("catalogoFotos");
      const fotos = fotosJson ? JSON.parse(fotosJson) : {};
      fotos[codigo] = src;
      await AsyncStorage.setItem("catalogoFotos", JSON.stringify(fotos));
    } catch (e) {
      console.log("Erro ao escolher foto:", e);
      Alert.alert("Erro", "Não foi possível anexar a foto.");
    }
  };

  const alternarSelecao = (codigo) => {
    setSelecionados((prev) =>
      prev.includes(codigo)
        ? prev.filter((c) => c !== codigo)
        : [...prev, codigo],
    );
  };

  const compartilharSelecionados = async () => {
    if (selecionados.length === 0) {
      Alert.alert("Nada selecionado", "Selecione itens para compartilhar.");
      return;
    }

    try {
      if (!capturaRef.current) {
        Alert.alert("Erro", "Não foi possível capturar o catálogo.");
        return;
      }

      const uri = await captureRef(capturaRef.current, {
        format: "png",
        quality: 1,
      });

      await Sharing.shareAsync(uri);
    } catch (error) {
      console.log("Erro ao compartilhar:", error);
      Alert.alert("Erro ao compartilhar", error.message);
    }
  };

  const excluirSelecionados = () => {
    if (selecionados.length === 0) {
      Alert.alert("Nada selecionado", "Selecione itens para excluir.");
      return;
    }

    Alert.alert("Confirmar Exclusão", "Deseja excluir os itens selecionados?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          try {
            // ⚠️ NÃO mexe no estoque. Catálogo é “visual”.
            // Então aqui só removemos as infos do catálogo (foto/preço) dos códigos selecionados.

            // remove fotos e preços dos itens excluídos
            const fotosJson = await AsyncStorage.getItem("catalogoFotos");
            const fotos = fotosJson ? JSON.parse(fotosJson) : {};
            const precosJson = await AsyncStorage.getItem("catalogoPrecos");
            const precos = precosJson ? JSON.parse(precosJson) : {};

            selecionados.forEach((cod) => {
              delete fotos[cod];
              delete precos[cod];
            });

            await AsyncStorage.setItem("catalogoFotos", JSON.stringify(fotos));
            await AsyncStorage.setItem(
              "catalogoPrecos",
              JSON.stringify(precos),
            );

            // atualiza UI: recarrega do estoque e aplica as infos atualizadas
            setSelecionados([]);
            await carregarCatalogo();

            Alert.alert("Pronto", "Removido do catálogo ✅");
          } catch (e) {
            console.log("Erro ao excluir itens:", e);
            Alert.alert("Erro", "Não foi possível excluir os itens.");
          }
        },
      },
    ]);
  };

  // abre modal de preço para um item
  const abrirModalPreco = (item) => {
    setPrecoCodigoAtual(item.codigo);
    const cents = item.precoCents ?? 0;
    setPrecoCentsAtual(cents);
    setPrecoInput(cents ? formatCurrencyBRL(cents) : "R$ 0,00");
    setPrecoModalVisivel(true);
  };

  const onChangePrecoInput = (txt) => {
    const cents = Number(onlyDigits(txt));
    setPrecoCentsAtual(cents);
    setPrecoInput(formatCurrencyBRL(cents));
  };

  const salvarPreco = async () => {
    if (!precoCodigoAtual) {
      setPrecoModalVisivel(false);
      return;
    }

    try {
      // atualiza na memória
      const novos = itens.map((i) =>
        i.codigo === precoCodigoAtual
          ? { ...i, precoCents: precoCentsAtual }
          : i,
      );
      setItens(novos);

      // atualiza no AsyncStorage
      const precosJson = await AsyncStorage.getItem("catalogoPrecos");
      const precos = precosJson ? JSON.parse(precosJson) : {};

      if (precoCentsAtual > 0) {
        precos[precoCodigoAtual] = precoCentsAtual;
      } else {
        delete precos[precoCodigoAtual];
      }

      await AsyncStorage.setItem("catalogoPrecos", JSON.stringify(precos));
    } catch (e) {
      console.log("Erro ao salvar preço:", e);
      Alert.alert("Erro", "Não foi possível salvar o preço.");
    } finally {
      setPrecoModalVisivel(false);
    }
  };

  const Card = ({ item }) => {
    const selecionado = selecionados.includes(item.codigo);

    return (
      <TouchableOpacity
        style={[styles.card, selecionado && styles.cardSelecionado]}
        activeOpacity={0.8}
        // Toque normal: escolhe/atualiza foto
        onPress={() => escolherFoto(item.codigo)}
        // Pressionar e segurar: marcar/desmarcar seleção
        onLongPress={() => alternarSelecao(item.codigo)}
      >
        {item.imagem ? (
          <Image
            source={{ uri: item.imagem }}
            style={styles.foto}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.fotoVazia}>
            <Text style={styles.fotoTxt}>+ Foto</Text>
          </View>
        )}
        <Text style={styles.codigo}>{item.codigo}</Text>
        <Text style={styles.descricao}>{item.descricao}</Text>

        {/* Botãozinho de preço */}
        <TouchableOpacity
          style={styles.precoPill}
          onPress={() => abrirModalPreco(item)}
          activeOpacity={0.7}
        >
          <Text style={styles.precoPillTxt}>
            {item.precoCents != null && item.precoCents > 0
              ? formatCurrencyBRL(item.precoCents)
              : "Definir preço"}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.titulo}>Catálogo de Produtos</Text>

      <FlatList
        data={itens}
        keyExtractor={(i) => String(i.codigo)}
        renderItem={({ item }) => <Card item={item} />}
        numColumns={2}
        columnWrapperStyle={{ justifyContent: "space-between" }}
        contentContainerStyle={{ paddingBottom: 100, gap: 12 }}
      />

      {/* área invisível para captura do catálogo selecionado */}
      <View style={{ position: "absolute", top: -1000, left: -1000 }}>
        <View
          ref={capturaRef}
          collapsable={false}
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            width: 300,
            backgroundColor: "#fff",
            padding: 8,
            borderRadius: 16,
            alignSelf: "flex-start",
          }}
        >
          {itens
            .filter((i) => selecionados.includes(i.codigo))
            .map((item) => (
              <View key={item.codigo} style={styles.card}>
                {item.imagem && (
                  <Image
                    source={{ uri: item.imagem }}
                    style={styles.foto}
                    resizeMode="cover"
                  />
                )}
                <Text style={styles.codigo}>{item.codigo}</Text>
                <Text style={styles.descricao}>{item.descricao}</Text>
                {item.precoCents != null && item.precoCents > 0 && (
                  <Text style={styles.precoCaptura}>
                    {formatCurrencyBRL(item.precoCents)}
                  </Text>
                )}
              </View>
            ))}
        </View>
      </View>

      <View style={styles.rodape}>
        <TouchableOpacity
          style={styles.botao}
          onPress={compartilharSelecionados}
        >
          <Text style={styles.botaoTexto}>Compartilhar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.botaoExcluir}
          onPress={excluirSelecionados}
        >
          <Text style={styles.botaoTexto}>Excluir</Text>
        </TouchableOpacity>
      </View>

      {/* Modal de preço */}
      <Modal visible={precoModalVisivel} transparent animationType="fade">
        <View style={styles.modalFundo}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>Preço de venda</Text>
            <TextInput
              value={precoInput}
              onChangeText={onChangePrecoInput}
              keyboardType="numeric"
              style={styles.modalInput}
            />
            <View style={styles.modalLinhaBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: "#ccc" }]}
                onPress={() => setPrecoModalVisivel(false)}
              >
                <Text>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: "#4CAF50" }]}
                onPress={salvarPreco}
              >
                <Text style={{ color: "#fff" }}>Salvar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  titulo: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 10,
  },
  card: {
    ...FORM_CARD,
    width: 140,
    backgroundColor: "#f8f8f8",
    borderRadius: 12,
    padding: 10,
    margin: 5,
    alignItems: "center",
  },
  cardSelecionado: {
    borderColor: "#bfa140",
    borderWidth: 2,
  },
  foto: { width: 100, height: 100, borderRadius: 8, marginBottom: 8 },
  fotoVazia: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: "#ccc",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  fotoTxt: { color: "#444" },
  codigo: { fontWeight: "bold", fontSize: 16 },
  descricao: { fontSize: 14, textAlign: "center" },

  precoPill: {
    marginTop: 6,
    backgroundColor: "#bfa140",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  precoPillTxt: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 12,
  },
  precoCaptura: {
    marginTop: 4,
    fontWeight: "bold",
    fontSize: 14,
  },

  rodape: {
    position: "absolute",
    bottom: 50,
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  botao: {
    flex: 1,
    backgroundColor: "#4e8cff",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  botaoExcluir: {
    flex: 1,
    backgroundColor: "#dc3545",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  botaoTexto: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },

  // modal preço
  modalFundo: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    width: "85%",
  },
  modalTitulo: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 12,
  },
  modalLinhaBtns: {
    flexDirection: "row",
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
});
