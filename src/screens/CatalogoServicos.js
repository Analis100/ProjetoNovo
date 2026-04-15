// screens/CatalogoServicos.js
import React, { useEffect, useMemo, useState } from "react";
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
  Keyboard,
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { FORM_CARD } from "../styles/formCard";

const PLACEHOLDER = "#777";

const KEY_CATALOGO_SERVICOS = "@servicos_tipos";
const KEY_ORCAMENTO_ATUAL = "@orcamento_atual";

/* =========================
   Helpers
========================= */
const maskBRL = (texto) => {
  const digits = (texto || "").replace(/\D/g, "");
  const n = parseInt(digits || "0", 10);
  return (n / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
};

const parseBRL = (masked) => {
  const digits = (masked || "").replace(/\D/g, "");
  return (parseInt(digits || "0", 10) || 0) / 100;
};

const fmtValor = (v) =>
  Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const safeJSON = (raw, fallback) => {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const uniqBy = (arr, keyFn) => {
  const seen = new Set();
  const out = [];
  for (const it of arr || []) {
    const k = keyFn(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
};
const imprimirCatalogo = async (servicos) => {
  if (!Array.isArray(servicos) || servicos.length === 0) {
    Alert.alert("Imprimir", "Não há serviços cadastrados.");
    return;
  }

  const linhas = servicos
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map(
      (s) => `
        <tr>
          <td>${s.nome}</td>
          <td style="text-align:right;">${fmtValor(s.preco)}</td>
        </tr>
      `,
    )
    .join("");

  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial; padding: 24px; }
          h2 { text-align:center; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ccc; padding: 8px; font-size: 12px; }
          th { background: #f0f0f0; }
        </style>
      </head>
      <body>
        <h2>Catálogo de Serviços</h2>
        <table>
          <thead>
            <tr>
              <th>Serviço</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            ${linhas}
          </tbody>
        </table>
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri);
  } else {
    Alert.alert("PDF gerado", uri);
  }
};

/* =========================
   Screen
========================= */
export default function CatalogoServicos({ navigation }) {
  // cadastro
  const [nome, setNome] = useState("");
  const [valor, setValor] = useState(maskBRL("0"));

  // lista
  const [servicos, setServicos] = useState([]);

  // filtro
  const [buscaNome, setBuscaNome] = useState("");

  // seleção
  const [selecionados, setSelecionados] = useState([]); // ids

  // modal editar
  const [modalEditar, setModalEditar] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editNome, setEditNome] = useState("");
  const [editValor, setEditValor] = useState(maskBRL("0"));

  /* =========================
     Load / Save
  ========================= */
  const carregar = async () => {
    const raw = await AsyncStorage.getItem(KEY_CATALOGO_SERVICOS);
    const arr = safeJSON(raw, []);
    setServicos(Array.isArray(arr) ? arr : []);
  };

  const salvarLista = async (novaLista) => {
    setServicos(novaLista);
    await AsyncStorage.setItem(
      KEY_CATALOGO_SERVICOS,
      JSON.stringify(novaLista),
    );
  };

  useEffect(() => {
    carregar();
  }, []);

  /* =========================
     Derived
  ========================= */
  const listaFiltrada = useMemo(() => {
    const base = Array.isArray(servicos) ? servicos : [];
    const q = String(buscaNome || "")
      .trim()
      .toLowerCase();
    if (!q) return base;

    return base.filter((s) =>
      String(s?.nome || "")
        .trim()
        .toLowerCase()
        .includes(q),
    );
  }, [servicos, buscaNome]);

  const qtdSelecionados = selecionados.length;

  /* =========================
     Actions
  ========================= */
  const inserirServico = async () => {
    Keyboard.dismiss();

    const n = String(nome || "").trim();
    const v = parseBRL(valor);

    if (!n) {
      Alert.alert("Erro", "Informe o nome do serviço.");
      return;
    }
    if (v < 0) {
      Alert.alert("Erro", "Valor inválido.");
      return;
    }

    const novo = {
      id: `srv-${Date.now()}`,
      nome: n,
      preco: v, // number
      updatedAt: new Date().toISOString(),
    };

    const novaLista = [novo, ...(Array.isArray(servicos) ? servicos : [])];
    await salvarLista(novaLista);

    setNome("");
    setValor(maskBRL("0"));
    Alert.alert("Catálogo", "Serviço cadastrado com sucesso.");
  };

  const toggleSelect = (id) => {
    setSelecionados((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  };

  const limparSelecao = () => setSelecionados([]);

  const excluirSelecionados = async () => {
    if (qtdSelecionados === 0) {
      Alert.alert("Excluir", "Selecione pelo menos 1 serviço.");
      return;
    }

    Alert.alert(
      "Excluir",
      `Excluir ${qtdSelecionados} serviço(s) do catálogo?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            const novaLista = (Array.isArray(servicos) ? servicos : []).filter(
              (s) => !selecionados.includes(s.id),
            );
            await salvarLista(novaLista);
            limparSelecao();
            Alert.alert("Ok", "Serviço(s) removido(s).");
          },
        },
      ],
    );
  };

  const inserirNoOrcamento = async () => {
    Keyboard.dismiss();

    if (qtdSelecionados === 0) {
      Alert.alert("Orçamento", "Selecione pelo menos 1 serviço para inserir.");
      return;
    }

    const itensSelecionados = (Array.isArray(servicos) ? servicos : []).filter(
      (s) => selecionados.includes(s.id),
    );

    if (itensSelecionados.length === 0) {
      Alert.alert("Orçamento", "Nada selecionado.");
      return;
    }

    // monta itens de orçamento (tipo servico)
    const nowISO = new Date().toISOString();
    const itensOrc = itensSelecionados.map((s) => ({
      id: `o-srv-${Date.now()}-${s.id}`,
      tipo: "servico",
      refId: s.id,
      nome: s.nome,
      valor: Number(s.preco || 0),
      createdAt: nowISO,
    }));

    const raw = await AsyncStorage.getItem(KEY_ORCAMENTO_ATUAL);
    const atual = safeJSON(raw, []);

    const merged = uniqBy(
      [...(Array.isArray(atual) ? atual : []), ...itensOrc],
      (it) => `${it.tipo}:${it.refId}`,
    );

    await AsyncStorage.setItem(KEY_ORCAMENTO_ATUAL, JSON.stringify(merged));

    limparSelecao();

    Alert.alert(
      "Orçamento",
      "Inserido no orçamento com sucesso ✅\n\nDeseja inserir materiais agora?",
      [
        {
          text: "Não",
          style: "cancel",
          onPress: () => {
            // ✅ fica no Catálogo (não navega)
          },
        },
        {
          text: "Sim",
          onPress: () => {
            // ✅ vai para Relação de Materiais
            navigation?.navigate?.("RelacionarMateriais", {
              origem: "CatalogoServicos",
              // opcional: manda quais serviços foram inseridos (se você quiser usar lá)
              servicosInseridos: itensSelecionados.map((s) => ({
                id: s.id,
                nome: s.nome,
              })),
            });
          },
        },
      ],
      { cancelable: true },
    );

    // opcional: se existir a rota Orcamento, navega
    // navigation?.navigate?.("Orcamento");
  };

  const abrirEditar = (item) => {
    setEditId(item?.id || null);
    setEditNome(String(item?.nome || ""));
    setEditValor(maskBRL(String(Math.round(Number(item?.preco || 0) * 100))));
    setModalEditar(true);
  };

  const salvarEdicao = async () => {
    Keyboard.dismiss();

    const n = String(editNome || "").trim();
    const v = parseBRL(editValor);

    if (!editId) {
      setModalEditar(false);
      return;
    }
    if (!n) {
      Alert.alert("Erro", "Informe o nome do serviço.");
      return;
    }
    if (v < 0) {
      Alert.alert("Erro", "Valor inválido.");
      return;
    }

    const novaLista = (Array.isArray(servicos) ? servicos : []).map((s) => {
      if (s.id !== editId) return s;
      return { ...s, nome: n, preco: v, updatedAt: new Date().toISOString() };
    });

    await salvarLista(novaLista);
    setModalEditar(false);
    Alert.alert("Ok", "Serviço atualizado.");
  };

  /* =========================
     Render
  ========================= */
  const renderItem = ({ item }) => {
    const selected = selecionados.includes(item.id);

    return (
      <TouchableOpacity
        onPress={() => toggleSelect(item.id)}
        onLongPress={() => abrirEditar(item)}
        style={[
          styles.itemLinha,
          selected && { borderColor: "#111", backgroundColor: "#f5f5f5" },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.itemLista}>
            {item?.nome || "-"}{" "}
            <Text style={{ fontWeight: "900" }}>{fmtValor(item?.preco)}</Text>
          </Text>

          <Text style={styles.itemSub}>
            {selected ? "Selecionado • " : ""}
            Toque: selecionar • Segure: editar
          </Text>
        </View>

        <View style={styles.badge}>
          <Text style={styles.badgeTxt}>{selected ? "✓" : "+"}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  /* =========================
     UI
  ========================= */
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#fff" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <FlatList
        data={listaFiltrada}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 28,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <>
            <Text style={styles.titulo}>Catálogo de Serviços</Text>
            <TouchableOpacity
              style={[
                styles.smallBtn,
                {
                  alignSelf: "flex-end",
                  paddingVertical: 6,
                  paddingHorizontal: 14,
                  backgroundColor: "#111",
                  borderColor: "#111",
                  marginBottom: 6,
                },
              ]}
              onPress={() => imprimirCatalogo(servicos)}
            >
              <Text
                style={[
                  styles.smallBtnTxt,
                  { color: "#fff", fontSize: 12, fontWeight: "700" },
                ]}
              >
                IMPRIMIR
              </Text>
            </TouchableOpacity>

            {/* filtro por nome */}
            <TextInput
              style={[styles.input, styles.filterInput]}
              placeholder="Filtrar por nome..."
              placeholderTextColor={PLACEHOLDER}
              value={buscaNome}
              onChangeText={setBuscaNome}
            />

            {/* card cadastro */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Cadastrar Serviço</Text>

              <TextInput
                style={styles.input}
                placeholder="Nome do serviço (ex: Conserto de Geladeira)"
                placeholderTextColor={PLACEHOLDER}
                value={nome}
                onChangeText={setNome}
              />

              <TextInput
                style={styles.input}
                placeholder="Valor"
                placeholderTextColor={PLACEHOLDER}
                keyboardType="numeric"
                value={valor}
                onChangeText={(t) => setValor(maskBRL(t))}
              />

              <TouchableOpacity style={styles.botao} onPress={inserirServico}>
                <Text style={styles.botaoTexto}>Salvar no Catálogo</Text>
              </TouchableOpacity>
            </View>

            {/* ações */}
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionPrimary]}
                onPress={inserirNoOrcamento}
              >
                <Text style={[styles.actionTxt, { color: "#fff" }]}>
                  Inserir no Orçamento
                  {qtdSelecionados ? ` (${qtdSelecionados})` : ""}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.actionDanger]}
                onPress={excluirSelecionados}
              >
                <Text style={[styles.actionTxt, { color: "#b91c1c" }]}>
                  Excluir Selecionado
                  {qtdSelecionados ? ` (${qtdSelecionados})` : ""}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.hint}>
              * Toque para selecionar. Segure para editar nome/valor. O
              orçamento recebe os serviços selecionados.
            </Text>
          </>
        }
        ListEmptyComponent={
          <View style={{ padding: 14 }}>
            <Text style={{ color: "#666", textAlign: "center" }}>
              Nenhum serviço encontrado.
            </Text>
          </View>
        }
      />

      {/* MODAL EDITAR */}
      <Modal visible={modalEditar} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={{ fontWeight: "900", marginBottom: 10 }}>
              Editar Serviço
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Nome"
              placeholderTextColor={PLACEHOLDER}
              value={editNome}
              onChangeText={setEditNome}
            />

            <TextInput
              style={styles.input}
              placeholder="Valor"
              placeholderTextColor={PLACEHOLDER}
              keyboardType="numeric"
              value={editValor}
              onChangeText={(t) => setEditValor(maskBRL(t))}
            />

            <TouchableOpacity
              style={[styles.botao, { marginTop: 10 }]}
              onPress={salvarEdicao}
            >
              <Text style={styles.botaoTexto}>Salvar Alterações</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.botao,
                {
                  marginTop: 10,
                  borderColor: "#111",
                  backgroundColor: "#f9fafb",
                },
              ]}
              onPress={() => setModalEditar(false)}
            >
              <Text style={[styles.botaoTexto, { color: "#111" }]}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

/* =========================
   Styles
========================= */
const styles = StyleSheet.create({
  titulo: {
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 10,
    color: "#111",
  },

  sectionTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#111",
    marginBottom: 6,
  },

  card: {
    ...FORM_CARD,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#eee",
    marginTop: 10,
    marginBottom: 12,
  },

  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 10,
    borderRadius: 10,
    marginTop: 8,
    color: "#111",
    backgroundColor: "#fff",
  },

  filterInput: {
    marginTop: 0,
    fontWeight: "900",
    fontSize: 12,
  },

  botao: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#bfa140",
    alignItems: "center",
    backgroundColor: "#fff",
  },

  botaoTexto: {
    color: "#bfa140",
    fontWeight: "900",
    letterSpacing: 0.3,
  },

  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
    marginBottom: 8,
  },

  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },

  actionPrimary: {
    backgroundColor: "#111",
    borderColor: "#111",
  },

  actionDanger: {
    backgroundColor: "#fff",
    borderColor: "#ef4444",
  },

  actionTxt: {
    fontWeight: "900",
    fontSize: 12,
  },

  hint: {
    marginTop: 6,
    marginBottom: 8,
    color: "#444",
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
  },

  itemLinha: {
    backgroundColor: "#fff",
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    marginBottom: 10,
  },

  itemLista: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111",
  },

  itemSub: {
    fontSize: 12,
    color: "#666",
    marginTop: 3,
  },

  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },

  badgeTxt: {
    fontWeight: "900",
    color: "#111",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 20,
  },

  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
  },
});
