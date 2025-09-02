import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  SafeAreaView,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";

export default function CatalogoScreen() {
  const [itens, setItens] = useState([]);
  const [selecionados, setSelecionados] = useState([]);
  const capturaRef = useRef();

  useEffect(() => {
    carregarCatalogo();
  }, []);

  const carregarCatalogo = async () => {
    const estoqueJson = await AsyncStorage.getItem("estoque");
    const fotosJson = await AsyncStorage.getItem("catalogoFotos");

    const estoque = estoqueJson ? JSON.parse(estoqueJson) : [];
    const fotos = fotosJson ? JSON.parse(fotosJson) : {};

    const combinados = estoque.map((item) => ({
      ...item,
      imagem: fotos[item.codigo] || null,
    }));

    setItens(combinados);
  };

  const escolherFoto = async (codigo) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permissão negada",
        "Precisamos da galeria para escolher foto."
      );
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.7,
    });

    if (!res.assets || res.assets.length === 0) return;
    const src = res.assets[0].uri;

    const pasta = FileSystem.documentDirectory + "catalogo";
    await FileSystem.makeDirectoryAsync(pasta, { intermediates: true });
    const dest = `${pasta}/${Date.now()}.jpg`;
    await FileSystem.copyAsync({ from: src, to: dest });

    const novos = itens.map((i) =>
      i.codigo === codigo ? { ...i, imagem: dest } : i
    );
    setItens(novos);

    const fotos = {};
    novos.forEach((i) => {
      if (i.imagem) fotos[i.codigo] = i.imagem;
    });
    await AsyncStorage.setItem("catalogoFotos", JSON.stringify(fotos));
  };

  const alternarSelecao = (codigo) => {
    setSelecionados((prev) =>
      prev.includes(codigo)
        ? prev.filter((c) => c !== codigo)
        : [...prev, codigo]
    );
  };

  const compartilharSelecionados = async () => {
    if (selecionados.length === 0) {
      Alert.alert("Nada selecionado", "Selecione itens para compartilhar.");
      return;
    }

    try {
      const uri = await captureRef(capturaRef, {
        format: "png",
        quality: 1,
      });
      await Sharing.shareAsync(uri);
    } catch (error) {
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
          const restantes = itens.filter(
            (i) => !selecionados.includes(i.codigo)
          );
          setItens(restantes);
          setSelecionados([]);

          await AsyncStorage.setItem("estoque", JSON.stringify(restantes));

          const fotosJson = await AsyncStorage.getItem("catalogoFotos");
          const fotos = fotosJson ? JSON.parse(fotosJson) : {};
          selecionados.forEach((cod) => delete fotos[cod]);
          await AsyncStorage.setItem("catalogoFotos", JSON.stringify(fotos));
        },
      },
    ]);
  };

  const Card = ({ item }) => {
    const selecionado = selecionados.includes(item.codigo);
    return (
      <TouchableOpacity
        onPress={() => alternarSelecao(item.codigo)}
        style={[styles.card, selecionado && styles.cardSelecionado]}
      >
        {item.imagem ? (
          <Image source={{ uri: item.imagem }} style={styles.foto} />
        ) : (
          <TouchableOpacity
            style={styles.fotoVazia}
            onPress={() => escolherFoto(item.codigo)}
          >
            <Text style={styles.fotoTxt}>+ Foto</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.codigo}>{item.codigo}</Text>
        <Text style={styles.descricao}>{item.descricao}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.titulo}>Catálogo de Produtos</Text>

      <FlatList
        data={itens}
        keyExtractor={(i) => i.codigo}
        renderItem={({ item }) => <Card item={item} />}
        numColumns={2}
        columnWrapperStyle={{ justifyContent: "space-between" }}
        contentContainerStyle={{ paddingBottom: 100, gap: 12 }}
      />

      {/* área invisível para captura */}
      <View
        style={{ position: "absolute", top: -1000 }}
        ref={capturaRef}
        collapsable={false}
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", width: 300 }}>
          {itens
            .filter((i) => selecionados.includes(i.codigo))
            .map((item) => (
              <View key={item.codigo} style={styles.card}>
                {item.imagem && (
                  <Image source={{ uri: item.imagem }} style={styles.foto} />
                )}
                <Text style={styles.codigo}>{item.codigo}</Text>
                <Text style={styles.descricao}>{item.descricao}</Text>
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
    width: 140,
    backgroundColor: "#f0f0f0",
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
});
