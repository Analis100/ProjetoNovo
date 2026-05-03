// screens/Despesas.js
import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";

import { FORM_CARD } from "../styles/formCard";

const PLACEHOLDER = "#777";
const DESPESAS_KEY = "despesas";

// ===== Helpers BRL (máscara + parse) =====
const maskBRL = (texto) => {
  const digits = String(texto || "").replace(/\D/g, "");
  const n = parseInt(digits || "0", 10);
  const v = n / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const parseBRL = (masked) => {
  const digits = String(masked || "").replace(/\D/g, "");
  const n = parseInt(digits || "0", 10);
  return n / 100;
};

const fmtValor = (v) =>
  Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });

/**
 * Normaliza qualquer formato salvo em "despesas" para ARRAY.
 * Aceita:
 * - array direto
 * - objeto por data { "05/04/2026": [ ... ] }
 */
const normalizarDespesas = (parsed) => {
  if (Array.isArray(parsed)) return parsed;

  if (parsed && typeof parsed === "object") {
    return Object.values(parsed).flatMap((valor) =>
      Array.isArray(valor) ? valor : [],
    );
  }

  return [];
};

export default function Despesas() {
  const navigation = useNavigation();

  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [despesas, setDespesas] = useState([]);
  const [soma, setSoma] = useState(0);

  // ✅ data do topo
  const hojePt = new Date().toLocaleDateString("pt-BR");

  // ✅ PESQUISA
  const [pesquisa, setPesquisa] = useState("");

  // ===== senha =====
  const [senhaModalVisivel, setSenhaModalVisivel] = useState(false);
  const [senhaDigitada, setSenhaDigitada] = useState("");
  const [senhaSalva, setSenhaSalva] = useState("1234");

  // ===== excluir =====
  const [modalSenhaExcluirVisivel, setModalSenhaExcluirVisivel] =
    useState(false);
  const [indiceParaExcluir, setIndiceParaExcluir] = useState(null);
  const [senhaExcluir, setSenhaExcluir] = useState("");

  // ===== carregar senha =====
  useEffect(() => {
    (async () => {
      try {
        const s = await AsyncStorage.getItem("senhaAcesso");
        if (s) setSenhaSalva(s);
      } catch (e) {
        console.warn("Erro ao carregar senha:", e);
      }
    })();
  }, []);

  // ===== carregar despesas =====
  const carregarDespesas = async () => {
    try {
      const json = await AsyncStorage.getItem(DESPESAS_KEY);
      const parsed = json ? JSON.parse(json) : [];

      const lista = normalizarDespesas(parsed);

      // se estiver em formato antigo, já migra para array
      if (!Array.isArray(parsed)) {
        await AsyncStorage.setItem(DESPESAS_KEY, JSON.stringify(lista));
      }

      setDespesas(lista);
      const total = lista.reduce((a, c) => a + (Number(c?.valor) || 0), 0);
      setSoma(total);
    } catch (error) {
      console.warn("Erro ao carregar despesas:", error);
      setDespesas([]);
      setSoma(0);
      Alert.alert("Erro", "Não foi possível carregar as despesas.");
    }
  };

  useEffect(() => {
    const unsub = navigation.addListener("focus", carregarDespesas);
    carregarDespesas();
    return unsub;
  }, [navigation]);

  // ✅ lista filtrada
  const despesasFiltradas = useMemo(() => {
    const q = String(pesquisa || "")
      .trim()
      .toLowerCase();

    if (!q) return despesas;

    return despesas.filter((item) => {
      const desc = String(item?.descricao || "").toLowerCase();
      const data = String(item?.data || "").toLowerCase();
      const valorFmt = fmtValor(item?.valor).toLowerCase();
      const valorNum = String(item?.valor ?? "").toLowerCase();
      const origem = String(item?.origem || "").toLowerCase();

      return (
        desc.includes(q) ||
        data.includes(q) ||
        valorFmt.includes(q) ||
        valorNum.includes(q) ||
        origem.includes(q)
      );
    });
  }, [despesas, pesquisa]);

  // ===== salvar =====
  const salvarDespesa = async () => {
    try {
      if (!descricao.trim() || !valor) {
        Alert.alert("Erro", "Preencha descrição e valor.");
        return;
      }

      const valorNumerico = parseBRL(valor);

      if (!(valorNumerico > 0)) {
        Alert.alert("Erro", "Digite um valor válido.");
        return;
      }

      const agora = new Date();
      const nova = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        descricao: descricao.trim(),
        valor: valorNumerico,
        data: agora.toLocaleDateString("pt-BR"),
        dataISO: agora.toISOString(),
      };

      const json = await AsyncStorage.getItem(DESPESAS_KEY);
      const parsed = json ? JSON.parse(json) : [];
      const lista = normalizarDespesas(parsed);

      lista.push(nova);
      await AsyncStorage.setItem(DESPESAS_KEY, JSON.stringify(lista));

      setDescricao("");
      setValor("");
      await carregarDespesas();
    } catch (error) {
      console.warn("Erro ao salvar despesa:", error);
      Alert.alert("Erro", "Não foi possível salvar a despesa.");
    }
  };

  const parseDataBR = (data) => {
    const [dia, mes, ano] = String(data || "")
      .split("/")
      .map(Number);
    if (!dia || !mes || !ano) return null;
    return new Date(ano, mes - 1, dia);
  };

  const mostrarContasVencendo = async () => {
    try {
      const json = await AsyncStorage.getItem("contasPagar");
      const obj = json ? JSON.parse(json) : {};

      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      const limite = new Date(hoje);
      limite.setDate(limite.getDate() + 7);

      const contas = [];

      Object.keys(obj || {}).forEach((credor) => {
        const dado = obj[credor];
        const parcelas = Array.isArray(dado) ? dado : dado?.parcelas || [];

        parcelas.forEach((p) => {
          if (p?.pago) return;

          const venc = parseDataBR(p?.vencimento);
          if (!venc) return;

          venc.setHours(0, 0, 0, 0);

          if (venc <= limite) {
            contas.push({
              credor,
              vencimento: p.vencimento,
              valor: Number(p.valor || 0),
              vencida: venc < hoje,
              hoje: venc.getTime() === hoje.getTime(),
            });
          }
        });
      });

      if (contas.length === 0) {
        Alert.alert(
          "Contas a Pagar",
          "Não há contas vencidas ou vencendo nos próximos 7 dias.",
          [{ text: "OK", onPress: () => navigation.navigate("ListaCredores") }],
        );
        return;
      }

      contas.sort(
        (a, b) => parseDataBR(a.vencimento) - parseDataBR(b.vencimento),
      );

      const texto = contas
        .map((c) => {
          const status = c.vencida
            ? "VENCIDA"
            : c.hoje
              ? "VENCE HOJE"
              : "A vencer";
          return `• ${c.credor}\n${status} - ${c.vencimento} - ${c.valor.toLocaleString(
            "pt-BR",
            {
              style: "currency",
              currency: "BRL",
            },
          )}`;
        })
        .join("\n\n");

      Alert.alert("Contas próximas do vencimento", texto, [
        {
          text: "Abrir Contas a Pagar",
          onPress: () => navigation.navigate("ListaCredores"),
        },
      ]);
    } catch (e) {
      console.log("Erro ao verificar contas a pagar:", e);
      navigation.navigate("ListaCredores");
    }
  };

  // ===== CONTAS A PAGAR =====
  const abrirContasAPagar = () => {
    setSenhaModalVisivel(true);
  };

  const confirmarSenhaContas = async () => {
    if (senhaDigitada === senhaSalva) {
      setSenhaDigitada("");
      setSenhaModalVisivel(false);

      await mostrarContasVencendo();
    } else {
      Alert.alert("Senha incorreta");
      setSenhaDigitada("");
    }
  };

  // ===== EXCLUIR =====
  const executarExclusaoPorId = async (id) => {
    try {
      const nova = despesas.filter((x) => String(x.id) !== String(id));
      await AsyncStorage.setItem(DESPESAS_KEY, JSON.stringify(nova));
      setDespesas(nova);
      setSoma(nova.reduce((a, c) => a + Number(c?.valor || 0), 0));
    } catch (error) {
      console.warn("Erro ao excluir despesa:", error);
      Alert.alert("Erro", "Não foi possível excluir a despesa.");
    }
  };

  const abrirSenhaExclusao = (id) => {
    setIndiceParaExcluir(id);
    setSenhaExcluir("");
    setModalSenhaExcluirVisivel(true);
  };

  const confirmarSenhaParaExcluir = async () => {
    const ok = senhaExcluir === senhaSalva;

    setModalSenhaExcluirVisivel(false);
    setSenhaExcluir("");

    if (!ok) {
      Alert.alert("Senha incorreta");
      return;
    }

    if (indiceParaExcluir !== null) {
      await executarExclusaoPorId(indiceParaExcluir);
      Alert.alert("Excluída", "Despesa removida com sucesso.");
      setIndiceParaExcluir(null);
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.item}>
      <View style={styles.itemTextoArea}>
        <Text style={styles.itemData}>
          {item.data ||
            (item.dataISO
              ? new Date(item.dataISO).toLocaleDateString("pt-BR")
              : "")}
        </Text>
        <Text style={styles.itemTxt}>
          {item.descricao} – {fmtValor(item.valor)}
        </Text>
        {!!item.origem && <Text style={styles.itemOrigem}>{item.origem}</Text>}
      </View>

      <TouchableOpacity onPress={() => abrirSenhaExclusao(item.id)}>
        <Text style={styles.excluir}>Excluir</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
    >
      <FlatList
        style={{ flex: 1, backgroundColor: "#F2F2F2" }}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        data={despesasFiltradas}
        keyExtractor={(item, index) => String(item.id ?? index)}
        renderItem={renderItem}
        ListHeaderComponent={
          <View>
            <Text style={styles.titulo}>Despesas</Text>
            <Text style={styles.topSub}>Despesas - Data {hojePt}</Text>

            {/* ✅ PESQUISA */}
            <View style={styles.searchRow}>
              <TextInput
                style={[styles.input, styles.searchInput]}
                placeholder="Pesquisar (descrição, data, valor ou origem)"
                placeholderTextColor={PLACEHOLDER}
                underlineColorAndroid="transparent"
                value={pesquisa}
                onChangeText={setPesquisa}
                returnKeyType="search"
              />

              {!!pesquisa?.trim() && (
                <TouchableOpacity
                  style={styles.searchClearBtn}
                  onPress={() => setPesquisa("")}
                >
                  <Text style={styles.searchClearTxt}>Limpar</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 🔹 CARD DO FORMULÁRIO */}
            <View style={styles.card}>
              <TextInput
                style={styles.input}
                placeholder="Descrição"
                placeholderTextColor={PLACEHOLDER}
                underlineColorAndroid="transparent"
                value={descricao}
                onChangeText={setDescricao}
              />

              <TextInput
                style={styles.input}
                placeholder="Valor"
                placeholderTextColor={PLACEHOLDER}
                underlineColorAndroid="transparent"
                keyboardType="numeric"
                value={valor}
                onChangeText={(t) => setValor(maskBRL(t))}
              />

              <TouchableOpacity style={styles.botao} onPress={salvarDespesa}>
                <Text style={styles.botaoTexto}>Inserir Despesa</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.botao, { marginTop: 6 }]}
                onPress={abrirContasAPagar}
              >
                <Text style={styles.botaoTexto}>Contas a Pagar</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.emptyTxt}>
            {pesquisa?.trim()
              ? "Nenhuma despesa encontrada para essa pesquisa."
              : "Nenhuma despesa cadastrada ainda."}
          </Text>
        }
        ListFooterComponent={<Text style={styles.total}>{fmtValor(soma)}</Text>}
        showsVerticalScrollIndicator={false}
      />

      {/* ===== MODAL SENHA CONTAS ===== */}
      <Modal visible={senhaModalVisivel} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={{ marginBottom: 6 }}>Digite a senha:</Text>
            <TextInput
              secureTextEntry
              style={styles.input}
              placeholder="Senha"
              placeholderTextColor={PLACEHOLDER}
              underlineColorAndroid="transparent"
              value={senhaDigitada}
              onChangeText={setSenhaDigitada}
              autoFocus
            />
            <TouchableOpacity
              style={styles.botao}
              onPress={confirmarSenhaContas}
            >
              <Text style={styles.botaoTexto}>Confirmar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ===== MODAL SENHA EXCLUIR ===== */}
      <Modal
        visible={modalSenhaExcluirVisivel}
        transparent
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={{ marginBottom: 6 }}>
              Digite a senha para excluir:
            </Text>
            <TextInput
              secureTextEntry
              style={styles.input}
              placeholder="Senha"
              placeholderTextColor={PLACEHOLDER}
              underlineColorAndroid="transparent"
              value={senhaExcluir}
              onChangeText={setSenhaExcluir}
              autoFocus
            />
            <TouchableOpacity
              style={styles.botao}
              onPress={confirmarSenhaParaExcluir}
            >
              <Text style={styles.botaoTexto}>Confirmar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  listContent: {
    padding: 16,
    paddingBottom: 140,
    backgroundColor: "#F2F2F2",
    flexGrow: 1,
  },

  card: {
    ...FORM_CARD,
    backgroundColor: "#FAFAFA",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
  },

  titulo: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 4,
    color: "#111",
  },

  topSub: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
    marginBottom: 10,
  },

  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: "#fff",
    color: "#111",
  },

  botao: {
    borderWidth: 1,
    borderColor: "#bfa140",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#fff",
  },

  botaoTexto: { color: "#bfa140", fontWeight: "bold" },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },

  searchInput: {
    flex: 1,
    marginBottom: 0,
  },

  searchClearBtn: {
    borderWidth: 1,
    borderColor: "#bfa140",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#fff",
  },

  searchClearTxt: { color: "#bfa140", fontWeight: "bold" },

  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderColor: "#E5E5E5",
    backgroundColor: "#fff",
  },

  itemTextoArea: {
    flex: 1,
    paddingRight: 10,
  },

  itemData: {
    fontSize: 13,
    color: "#666",
    marginBottom: 2,
  },

  itemTxt: {
    fontSize: 16,
    color: "#111",
  },

  itemOrigem: {
    fontSize: 12,
    color: "#777",
    marginTop: 4,
    fontStyle: "italic",
  },

  excluir: { color: "red", fontWeight: "bold" },

  emptyTxt: {
    textAlign: "center",
    color: "#444",
    paddingVertical: 18,
  },

  total: {
    marginTop: 12,
    fontWeight: "bold",
    fontSize: 18,
    textAlign: "center",
    color: "#1B5E20",
    backgroundColor: "#E8F5E9",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#C8E6C9",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 20,
  },

  modalContent: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
  },
});
