// screens/Compromissos.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Linking,
  RefreshControl,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const AGENDA_KEY = "agenda_clientes";
const CONCLU_KEY = "@compromissos_concluidos"; // novo: lista persistente dos concluídos

const toBRDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("pt-BR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
    : "";
const toBRTime = (d) =>
  d
    ? new Date(d).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const stripTime = (date) => {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};
const diffDias = (a, b) => {
  const ms = 24 * 60 * 60 * 1000;
  return Math.floor((stripTime(a) - stripTime(b)) / ms);
};

const statusEvento = (quandoISO) => {
  const hoje = new Date();
  const quando = new Date(quandoISO);
  const d = diffDias(quando, hoje);
  if (d === 0) return { txt: "Vence hoje", kind: "today" };
  if (d < 0) return { txt: `Atrasado ${Math.abs(d)}d`, kind: "late" };
  return { txt: `Faltam ${d}d`, kind: "soon" };
};

// util: todas as parcelas da linha estão baixadas?
const todasParcelasPagas = (item) =>
  (item?.parcelasDetalhe || []).every((p) => p?.pago === true);

export default function Compromissos() {
  const [itens, setItens] = useState([]);
  const [concluidos, setConcluidos] = useState([]); // novo
  const [filtro, setFiltro] = useState("todos"); // 'todos' | 'hoje' | 'semana' | 'atrasados' | 'concluidos'
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [rawAgenda, rawConcluidos] = await Promise.all([
        AsyncStorage.getItem(AGENDA_KEY),
        AsyncStorage.getItem(CONCLU_KEY),
      ]);

      const arr = rawAgenda ? JSON.parse(rawAgenda) : [];
      // Ordena por data
      arr.sort((a, b) => new Date(a.quandoISO) - new Date(b.quandoISO));
      setItens(arr);

      const arrC = rawConcluidos ? JSON.parse(rawConcluidos) : [];
      setConcluidos(Array.isArray(arrC) ? arrC : []);
    } catch {
      setItens([]);
      setConcluidos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const salvarItens = async (arr) => {
    setItens(arr);
    await AsyncStorage.setItem(AGENDA_KEY, JSON.stringify(arr));
  };

  const salvarConcluidos = async (arr) => {
    setConcluidos(arr);
    await AsyncStorage.setItem(CONCLU_KEY, JSON.stringify(arr));
  };

  const enviarWhats = async (item, mensagemCustom = null) => {
    const phone = item.telefone;
    if (!phone) return Alert.alert("Atenção", "Telefone não informado.");
    const msg =
      mensagemCustom ||
      `Olá, ${item.nome}! Lembrando do nosso evento: ${
        item.descricao || "compromisso"
      } em ${toBRDate(item.quandoISO)} às ${toBRTime(item.quandoISO)}.`;
    const url = `whatsapp://send?phone=55${phone}&text=${encodeURIComponent(
      msg
    )}`;
    const can = await Linking.canOpenURL(url);
    if (!can) {
      return Alert.alert(
        "WhatsApp não encontrado",
        "Instale o WhatsApp ou verifique o número."
      );
    }
    Linking.openURL(url);
  };

  // NOVO: finalizar um item (se todas parcelas estão pagas) → mover para "concluídos"
  const moverParaConcluidos = async (item, enviouMsg = false) => {
    const agora = new Date().toISOString();
    // monta registro enxuto para consulta
    const registro = {
      id: item.id,
      nome: item.nome,
      telefone: item.telefone || "",
      descricao: item.descricao || "",
      quandoISO: item.quandoISO,
      valor: item.valor || 0,
      parcelas: item.parcelas || 0,
      concluidoEm: agora,
      enviouMensagem: !!enviouMsg,
    };

    // atualiza concluídos
    const base = Array.isArray(concluidos) ? [...concluidos] : [];
    const idx = base.findIndex((c) => c.id === item.id);
    if (idx >= 0) base[idx] = { ...base[idx], ...registro };
    else base.push(registro);
    await salvarConcluidos(base);

    // remove item da lista principal
    const novos = (itens || []).filter((x) => x.id !== item.id);
    await salvarItens(novos);

    Alert.alert("Concluído", "Compromisso movido para Concluídos.");
  };

  // NOVO: fluxo do botão "Concluir"
  const concluirItem = async (item) => {
    const todasPagas = todasParcelasPagas(item);

    if (!todasPagas) {
      return Alert.alert(
        "Faltam baixas",
        "Ainda existem parcelas sem baixa. Conclua as baixas na Agenda do Cliente antes de finalizar."
      );
    }

    Alert.alert(
      "Concluir compromisso",
      "Deseja enviar mensagem de agradecimento ao cliente?",
      [
        {
          text: "Apenas concluir",
          onPress: () => moverParaConcluidos(item, false),
        },
        {
          text: "Enviar WhatsApp",
          onPress: async () => {
            await enviarWhats(
              item,
              `Olá, ${item.nome}! Passando para agradecer a preferência e a confiança 😊. Qualquer coisa, estamos à disposição.`
            );
            moverParaConcluidos(item, true);
          },
        },
        { text: "Cancelar", style: "cancel" },
      ]
    );
  };

  // NOVO: limpar todos os concluídos (lista de consulta)
  const limparConcluidos = () => {
    if (!concluidos?.length) return;
    Alert.alert(
      "Limpar concluídos",
      "Tem certeza que deseja limpar a lista de concluídos? (somente a lista; os compromissos já concluídos não voltam para a agenda)",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Limpar",
          style: "destructive",
          onPress: async () => {
            await salvarConcluidos([]);
            Alert.alert("Pronto", "Lista de concluídos limpa.");
          },
        },
      ]
    );
  };

  const listaFiltrada = useMemo(() => {
    if (filtro === "concluidos") {
      // mostra a lista persistida de concluídos (somente consulta)
      return concluidos;
    }

    const hoje = new Date();
    const in7 = new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000);
    const base = itens;

    if (filtro === "hoje") {
      return base.filter((x) => diffDias(new Date(x.quandoISO), hoje) === 0);
    }
    if (filtro === "semana") {
      return base.filter((x) => {
        const d = new Date(x.quandoISO);
        return d >= stripTime(hoje) && d <= in7;
      });
    }
    if (filtro === "atrasados") {
      return base.filter((x) => new Date(x.quandoISO) < stripTime(hoje));
    }
    return base;
  }, [itens, filtro, concluidos]);

  const RenderItem = ({ item }) => {
    // Renderiza cards diferentes para cada aba
    if (filtro === "concluidos") {
      // cartão somente leitura com badge ✔
      return (
        <View style={[styles.card, styles.cardConcluido]}>
          <View style={styles.headerRow}>
            <Text style={styles.dataHora}>
              📅 {toBRDate(item.quandoISO)} • ⏰ {toBRTime(item.quandoISO)}
            </Text>
            <View style={styles.badgeWrap}>
              <Text style={styles.badgeTxt}>✔ Concluído</Text>
            </View>
          </View>
          <Text style={styles.nome}>✓ {item.nome}</Text>
          {!!item.descricao && (
            <Text style={styles.desc}>📝 {item.descricao}</Text>
          )}
          <Text style={styles.valor}>
            💰{" "}
            {item.valor?.toLocaleString?.("pt-BR", {
              style: "currency",
              currency: "BRL",
            }) || "R$ 0,00"}{" "}
            • {item.parcelas}x
          </Text>
          <Text style={styles.obsConcluido}>
            Concluído em {toBRDate(item.concluidoEm)}{" "}
            {toBRTime(item.concluidoEm)}
          </Text>
        </View>
      );
    }

    // cartões normais (agenda ativa)
    const st = statusEvento(item.quandoISO);
    const todasPagas = todasParcelasPagas(item);

    return (
      <View style={[styles.card, todasPagas ? styles.cardPago : null]}>
        <View style={styles.headerRow}>
          <Text style={styles.dataHora}>
            📅 {toBRDate(item.quandoISO)} • ⏰ {toBRTime(item.quandoISO)}
          </Text>
          <Text
            style={[
              styles.status,
              st.kind === "today" && styles.statusHoje,
              st.kind === "late" && styles.statusAtrasado,
              st.kind === "soon" && styles.statusSoon,
            ]}
          >
            {st.txt}
          </Text>
        </View>

        <Text style={styles.nome}>{item.nome}</Text>
        {!!item.descricao && (
          <Text style={styles.desc}>📝 {item.descricao}</Text>
        )}
        <Text style={styles.valor}>
          💰{" "}
          {item.valor?.toLocaleString?.("pt-BR", {
            style: "currency",
            currency: "BRL",
          }) || "R$ 0,00"}{" "}
          • {item.parcelas}x
        </Text>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btn, styles.btnWhats]}
            onPress={() => enviarWhats(item)}
          >
            <Text style={styles.btnTxt}>WhatsApp</Text>
          </TouchableOpacity>

          {/* Agora o botão Concluir aparece SEMPRE; a regra fica no onPress */}
          <TouchableOpacity
            style={[styles.btn, styles.btnOk]}
            onPress={() => concluirItem(item)}
          >
            <Text style={styles.btnTxt}>Concluir</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Compromissos</Text>

      {/* Filtros */}
      <View style={styles.filters}>
        {[
          { k: "todos", label: "Todos" },
          { k: "hoje", label: "Hoje" },
          { k: "semana", label: "Próx. 7 dias" },
          { k: "atrasados", label: "Atrasados" },
          { k: "concluidos", label: `Concluídos (${concluidos.length})` }, // novo filtro
        ].map((f) => (
          <TouchableOpacity
            key={f.k}
            style={[styles.pill, filtro === f.k && styles.pillActive]}
            onPress={() => setFiltro(f.k)}
          >
            <Text
              style={[styles.pillTxt, filtro === f.k && styles.pillTxtActive]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Botão extra para limpar concluídos (apenas quando estiver na aba Concluídos) */}
      {filtro === "concluidos" && concluidos.length > 0 && (
        <View style={{ alignItems: "flex-end", marginBottom: 6 }}>
          <TouchableOpacity style={styles.btnLimpar} onPress={limparConcluidos}>
            <Text style={styles.btnLimparTxt}>Limpar concluídos</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={listaFiltrada}
        keyExtractor={(it) => it.id}
        renderItem={RenderItem}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={
          <Text style={{ textAlign: "center", marginTop: 20, color: "#777" }}>
            {filtro === "concluidos"
              ? "Nenhum compromisso concluído."
              : "Nenhum compromisso encontrado."}
          </Text>
        }
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={carregar} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  titulo: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
    color: "#bfa140",
  },

  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
    justifyContent: "center",
  },
  pill: {
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  pillActive: { backgroundColor: "#bfa14022", borderColor: "#bfa140" },
  pillTxt: { color: "#444", fontWeight: "600" },
  pillTxtActive: { color: "#bfa140" },

  card: {
    borderWidth: 1,
    borderColor: "#eee",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardPago: { backgroundColor: "#eef6ff", borderColor: "#cfe4ff" },

  // Concluídos (apenas consulta)
  cardConcluido: { backgroundColor: "#f8fff5", borderColor: "#dcfce7" },
  badgeWrap: {
    backgroundColor: "#dcfce7",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeTxt: { color: "#166534", fontWeight: "700", fontSize: 12 },
  obsConcluido: { color: "#2d6a2d", marginTop: 6 },

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  dataHora: { color: "#333", fontWeight: "600" },
  status: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "700",
    color: "#333",
    backgroundColor: "#eee",
  },
  statusHoje: { backgroundColor: "#fff2cc", color: "#8a6d3b" },
  statusAtrasado: { backgroundColor: "#fde2e2", color: "#a94442" },
  statusSoon: { backgroundColor: "#eaf7ea", color: "#2d6a2d" },

  nome: { fontSize: 16, fontWeight: "700", marginBottom: 2 },
  desc: { color: "#444", marginBottom: 2 },
  valor: { color: "#333", marginBottom: 8 },

  actions: { flexDirection: "row", gap: 8 },
  btn: { flex: 1, padding: 12, borderRadius: 12, alignItems: "center" },
  btnWhats: { backgroundColor: "#25D366" },
  btnOk: { backgroundColor: "#0d6efd" },
  btnTxt: { color: "#fff", fontWeight: "700" },

  // limpar concluídos
  btnLimpar: {
    backgroundColor: "#ef4444",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  btnLimparTxt: { color: "#fff", fontWeight: "700" },
});
