// screens/RelacaoOrcamentos.js
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
  TextInput,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { FORM_CARD } from "../styles/formCard";

const KEY_ORCAMENTOS_SALVOS = "@orcamentos_salvos";
const KEY_LAST_ORC = "@ultimo_orcamento_salvo";
const KEY_ULTIMO_ORC_ID = "@ultimo_orcamento_id";

const safeJSON = (raw, fallback) => {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const fmtBRL = (v) =>
  Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const ptBRFromISO = (iso) => {
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return "";
  }
};

const normTipo = (tp) => {
  const t = String(tp || "")
    .toLowerCase()
    .trim();
  if (t === "prazo" || t === "a_prazo" || t === "aprazo" || t === "à prazo")
    return "prazo";
  return "avista";
};

export default function RelacaoOrcamentos({ navigation }) {
  const [orcamentos, setOrcamentos] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos"); // "todos" | "avista" | "prazo"

  const carregar = async () => {
    const raw = await AsyncStorage.getItem(KEY_ORCAMENTOS_SALVOS);
    const arr = safeJSON(raw, []);
    setOrcamentos(Array.isArray(arr) ? arr : []);
  };

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, []),
  );

  // ✅ aplica filtro por cliente + tipo
  const listaFiltrada = useMemo(() => {
    const base = Array.isArray(orcamentos) ? orcamentos : [];

    const f = String(filtro || "")
      .trim()
      .toLowerCase();

    const porNome = !f
      ? base
      : base.filter((o) =>
          String(o?.cliente || "")
            .toLowerCase()
            .includes(f),
        );

    if (filtroTipo === "todos") return porNome;

    return porNome.filter(
      (o) => normTipo(o?.tipoPagamento) === String(filtroTipo),
    );
  }, [orcamentos, filtro, filtroTipo]);

  const abrirOrcamento = async (o) => {
    // ✅ salva o "último orçamento" (serve para ContratoVista/ContratoPrazo puxarem certo)
    try {
      await AsyncStorage.setItem(
        KEY_LAST_ORC,
        JSON.stringify({
          id: String(o?.id || ""),
          numero: Number(o?.numero || 0),
          tipoPagamento: String(o?.tipoPagamento || ""),
        }),
      );
      await AsyncStorage.setItem(KEY_ULTIMO_ORC_ID, String(o?.id || ""));
    } catch {
      // sem travar a navegação
    }

    // mantém seu fluxo: abre OrcamentoCliente para editar/visualizar
    navigation.navigate("OrcamentoCliente", {
      // ✅ identifica que é edição (pra salvar atualizar, não duplicar)
      orcamentoId: o?.id,
      createdAt: o?.createdAt,
      numero: o?.numero ?? null,
      tipoPagamento: normTipo(o?.tipoPagamento),

      // ✅ preenche tudo
      cliente: o?.cliente || "",
      endereco: o?.endereco || "",
      telefone: o?.telefone || "",
      pagamento: o?.pagamento || "",
      previsao: o?.previsao || "",
      itens: Array.isArray(o?.itens) ? o.itens : [],
    });
  };

  const excluirOrcamento = (id) => {
    Alert.alert("Excluir", "Excluir este orçamento?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          const nova = (Array.isArray(orcamentos) ? orcamentos : []).filter(
            (x) => x.id !== id,
          );
          setOrcamentos(nova);
          await AsyncStorage.setItem(
            KEY_ORCAMENTOS_SALVOS,
            JSON.stringify(nova),
          );

          // ✅ NÃO grava @ultimo_orcamento_salvo aqui (excluir não deve virar "último")
        },
      },
    ]);
  };

  const totalGeral = useMemo(() => {
    return (Array.isArray(listaFiltrada) ? listaFiltrada : []).reduce(
      (s, o) => s + Number(o?.total || 0),
      0,
    );
  }, [listaFiltrada]);

  const renderItem = ({ item }) => {
    const cli = String(item?.cliente || "").trim() || "Sem nome";
    const total = fmtBRL(item?.total || 0);
    const data = ptBRFromISO(item?.updatedAt || item?.createdAt);

    const tp = normTipo(item?.tipoPagamento);
    const tagTxt = tp === "prazo" ? "A prazo" : "À vista";

    return (
      <TouchableOpacity
        onPress={() => abrirOrcamento(item)}
        style={styles.card}
        activeOpacity={0.8}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.nome}>
            {cli} <Text style={styles.totalInline}>— {total}</Text>
          </Text>

          <Text style={styles.sub}>
            {data ? `Atualizado: ${data}` : "—"}
            {Array.isArray(item?.itens) ? ` • Itens: ${item.itens.length}` : ""}
          </Text>

          <View style={styles.badgeRow}>
            <View
              style={[
                styles.badge,
                tp === "prazo" ? styles.badgePrazo : styles.badgeVista,
              ]}
            >
              <Text
                style={[
                  styles.badgeTxt,
                  tp === "prazo" ? styles.badgeTxtPrazo : styles.badgeTxtVista,
                ]}
              >
                {tagTxt}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => excluirOrcamento(item?.id)}
          style={styles.btnExcluir}
        >
          <Text style={styles.txtExcluir}>Excluir</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#fff" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <FlatList
        data={listaFiltrada}
        keyExtractor={(item) => String(item?.id)}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <>
            <Text style={styles.titulo}>Relação de Orçamentos</Text>

            {/* Linha: filtro por nome + novo orçamento */}
            <View style={styles.topRow}>
              <TextInput
                style={styles.inputFiltro}
                placeholder="Filtrar por cliente"
                placeholderTextColor="#777"
                value={filtro}
                onChangeText={setFiltro}
              />

              <TouchableOpacity
                style={styles.btnNovo}
                onPress={() => navigation.navigate("Orcamento")}
              >
                <Text style={styles.btnNovoTxt}>Novo Orçamento</Text>
              </TouchableOpacity>
            </View>

            {/* ✅ filtro por tipo */}
            <View style={styles.tipoRow}>
              <TouchableOpacity
                style={[
                  styles.tipoBtn,
                  filtroTipo === "todos" && styles.tipoBtnOn,
                ]}
                onPress={() => setFiltroTipo("todos")}
              >
                <Text
                  style={[
                    styles.tipoTxt,
                    filtroTipo === "todos" && styles.tipoTxtOn,
                  ]}
                >
                  Todos
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.tipoBtn,
                  filtroTipo === "avista" && styles.tipoBtnOn,
                ]}
                onPress={() => setFiltroTipo("avista")}
              >
                <Text
                  style={[
                    styles.tipoTxt,
                    filtroTipo === "avista" && styles.tipoTxtOn,
                  ]}
                >
                  À vista
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.tipoBtn,
                  filtroTipo === "prazo" && styles.tipoBtnOn,
                ]}
                onPress={() => setFiltroTipo("prazo")}
              >
                <Text
                  style={[
                    styles.tipoTxt,
                    filtroTipo === "prazo" && styles.tipoTxtOn,
                  ]}
                >
                  A prazo
                </Text>
              </TouchableOpacity>
            </View>

            {/* Total geral */}
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>Total (lista)</Text>
              <Text style={styles.totalValue}>{fmtBRL(totalGeral)}</Text>
            </View>

            <Text style={styles.hint}>
              * Toque em um orçamento para abrir e atualizar (imprimir fica lá).
              {"\n"}* O app salva automaticamente o último orçamento para
              preencher os contratos.
            </Text>
          </>
        }
        ListEmptyComponent={
          <View style={{ padding: 16 }}>
            <Text style={{ color: "#666", textAlign: "center" }}>
              Nenhum orçamento salvo ainda.
              {"\n"}Toque em “Novo Orçamento”.
            </Text>
          </View>
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  titulo: {
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 10,
    color: "#111",
  },

  topRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    marginBottom: 10,
  },

  inputFiltro: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: "#111",
    backgroundColor: "#fff",
    fontWeight: "800",
  },

  btnNovo: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  btnNovoTxt: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.2,
  },

  // ✅ linha do filtro de tipo
  tipoRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  tipoBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  tipoBtnOn: {
    backgroundColor: "#111",
    borderColor: "#111",
  },
  tipoTxt: {
    fontWeight: "900",
    color: "#111",
    fontSize: 12,
  },
  tipoTxtOn: {
    color: "#fff",
  },

  totalCard: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fff",
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: { color: "#111", fontWeight: "900" },
  totalValue: { color: "#111", fontWeight: "900", fontSize: 16 },

  hint: {
    marginTop: 2,
    marginBottom: 12,
    color: "#555",
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
  },

  card: {
    ...FORM_CARD,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  nome: {
    fontSize: 15,
    fontWeight: "900",
    color: "#111",
  },
  totalInline: {
    fontWeight: "900",
    color: "#111",
  },
  sub: {
    marginTop: 4,
    fontSize: 12,
    color: "#666",
  },

  badgeRow: { marginTop: 8, flexDirection: "row" },
  badge: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  badgeVista: {
    borderColor: "#111",
    backgroundColor: "#fff",
  },
  badgePrazo: {
    borderColor: "#bfa140",
    backgroundColor: "#fff",
  },
  badgeTxt: { fontWeight: "900", fontSize: 12 },
  badgeTxtVista: { color: "#111" },
  badgeTxtPrazo: { color: "#bfa140" },

  btnExcluir: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ef4444",
    backgroundColor: "#fff",
  },
  txtExcluir: {
    color: "#b91c1c",
    fontWeight: "900",
    fontSize: 12,
  },
});
