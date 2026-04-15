import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";

const KEY = "recebimentosPrazo";

const fmt = (v) =>
  Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

export default function RecebimentosPrazo({ navigation }) {
  const [lista, setLista] = useState([]);

  const [modoSelecao, setModoSelecao] = useState(false);
  const [selecionados, setSelecionados] = useState({});

  const carregar = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const arr = raw ? JSON.parse(raw) : [];
      const safe = Array.isArray(arr) ? arr : [];

      safe.sort((a, b) =>
        String(b?.pagoEm || "").localeCompare(String(a?.pagoEm || "")),
      );

      setLista(safe);
    } catch {
      setLista([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  const total = useMemo(
    () => lista.reduce((a, c) => a + Number(c?.valor || 0), 0),
    [lista],
  );

  const toggleSelecionado = (id) => {
    const key = String(id);
    setSelecionados((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const sairModoSelecao = () => {
    setModoSelecao(false);
    setSelecionados({});
  };

  const idsSelecionados = useMemo(
    () => Object.keys(selecionados).filter((id) => selecionados[id]),
    [selecionados],
  );

  async function excluirSelecionados() {
    const ids = idsSelecionados;

    if (ids.length === 0) {
      Alert.alert("Nada selecionado", "Selecione ao menos um recebimento.");
      return;
    }

    Alert.alert(
      "Excluir recebimentos",
      `Excluir ${ids.length} recebimento(s) selecionado(s)?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            try {
              const raw = await AsyncStorage.getItem(KEY);
              const arr = raw ? JSON.parse(raw) : [];
              const safe = Array.isArray(arr) ? arr : [];

              const filtrada = safe.filter((r) => !ids.includes(String(r?.id)));

              await AsyncStorage.setItem(KEY, JSON.stringify(filtrada));
              setLista(filtrada);
              sairModoSelecao();
            } catch (e) {
              console.log("Erro ao excluir selecionados:", e);
              Alert.alert("Erro", "Não foi possível excluir agora.");
            }
          },
        },
      ],
    );
  }

  const renderItem = ({ item }) => {
    const id = String(item?.id);
    const marcado = !!selecionados[id];

    return (
      <View style={styles.cardLinha}>
        {modoSelecao && (
          <TouchableOpacity
            onPress={() => toggleSelecionado(id)}
            style={[styles.checkbox, marcado && styles.checkboxOn]}
          >
            <Text style={styles.checkboxTxt}>{marcado ? "✓" : ""}</Text>
          </TouchableOpacity>
        )}

        <View style={styles.cardConteudo}>
          <Text style={styles.linha1}>
            {item?.cliente || "Cliente"} • Parcela {item?.numero || "-"}
          </Text>

          <Text style={styles.linha2}>
            Venc.: {item?.vencimento || "-"} • Pago em:{" "}
            {item?.pagoEm
              ? new Date(item.pagoEm).toLocaleDateString("pt-BR")
              : "-"}
          </Text>

          <Text style={styles.valor}>{fmt(item?.valor)}</Text>
        </View>
      </View>
    );
  };

  const header = (
    <View>
      <Text style={styles.title}>Recebimentos (Parcelas Baixadas)</Text>

      <View style={styles.resumo}>
        <Text style={styles.resumoTxt}>Total recebido:</Text>
        <Text style={styles.resumoValor}>{fmt(total)}</Text>
      </View>
    </View>
  );

  const footer = (
    <View style={styles.footerWrapper}>
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.btnTxt}>Voltar</Text>
        </TouchableOpacity>

        {!modoSelecao ? (
          <TouchableOpacity
            style={[styles.btn, styles.btnDanger]}
            onPress={() => {
              if (!lista.length) {
                Alert.alert(
                  "Sem recebimentos",
                  "Não há recebimentos para excluir.",
                );
                return;
              }
              setModoSelecao(true);
              setSelecionados({});
            }}
          >
            <Text style={[styles.btnTxt, { color: "#fff" }]}>
              Limpar Recebimentos
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flex: 1, gap: 10 }}>
            <TouchableOpacity
              style={[styles.btn, styles.btnDanger]}
              onPress={excluirSelecionados}
            >
              <Text style={[styles.btnTxt, { color: "#fff" }]}>
                Excluir Selecionados ({idsSelecionados.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.btn} onPress={sairModoSelecao}>
              <Text style={styles.btnTxt}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#fff" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
    >
      <FlatList
        data={lista}
        keyExtractor={(item, index) =>
          item?.id ? String(item.id) : `rec-${index}`
        }
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={
          <Text style={styles.vazio}>Nenhum recebimento registrado ainda.</Text>
        }
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 14,
    backgroundColor: "#fff",
    paddingBottom: 120,
  },

  title: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 10,
    color: "#111",
  },

  resumo: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#fff",
  },

  resumoTxt: {
    fontWeight: "700",
    color: "#111",
  },

  resumoValor: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: "900",
    color: "#111",
  },

  vazio: {
    textAlign: "center",
    marginTop: 30,
    color: "#666",
    fontWeight: "600",
  },

  cardLinha: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#fff",
  },

  cardConteudo: {
    flex: 1,
  },

  linha1: {
    fontWeight: "800",
    color: "#111",
  },

  linha2: {
    marginTop: 4,
    color: "#444",
    fontWeight: "600",
  },

  valor: {
    marginTop: 8,
    fontWeight: "900",
    fontSize: 16,
    color: "#111",
  },

  checkbox: {
    width: 28,
    height: 28,
    borderWidth: 2,
    borderColor: "#111",
    borderRadius: 8,
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },

  checkboxOn: {
    backgroundColor: "#111",
  },

  checkboxTxt: {
    fontSize: 18,
    fontWeight: "900",
    color: "#fff",
    marginTop: -1,
  },

  footerWrapper: {
    paddingTop: 10,
    paddingBottom: 30,
  },

  footer: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 10,
  },

  btn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#111",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#fff",
  },

  btnTxt: {
    fontWeight: "800",
    color: "#111",
  },

  btnDanger: {
    backgroundColor: "#111",
  },
});
