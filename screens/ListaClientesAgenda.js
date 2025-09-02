import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  Modal,
  Platform,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Keyboard,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import DateTimePicker from "@react-native-community/datetimepicker";

const AGENDA_KEY = "agenda_clientes";
const RECEITAS_KEY = "receitas";

// ====== Utils ======
const toBRDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("pt-BR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
    : "-";
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
const statusParcela = (parcela) => {
  const venc = new Date(parcela.vencimentoISO);
  if (parcela.pago) {
    if (!parcela.pagoEm) return "Pago";
    const pag = new Date(parcela.pagoEm);
    const d = diffDias(pag, venc);
    if (d === 0) return "Pago no dia";
    if (d < 0) return `Pago adiantado ${Math.abs(d)}d`;
    return `Pago com atraso ${d}d`;
  } else {
    const hoje = new Date();
    const d = diffDias(hoje, venc);
    if (d === 0) return "Vence hoje";
    if (d < 0) return `Faltam ${Math.abs(d)}d`;
    return `Atrasado ${d}d`;
  }
};
const onlyDigits = (s = "") => (s || "").replace(/\D+/g, "");
const formatCurrencyTyping = (valueStr) => {
  const digits = (valueStr || "").replace(/\D/g, "");
  const num = Number(digits) / 100;
  if (isNaN(num)) return "R$ 0,00";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};
const parseCurrency = (str) => {
  const digits = (str || "").replace(/\D/g, "");
  return Number(digits) / 100;
};
const addMonths = (date, months) => {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
};

// ====== Notificações ======
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
const ensureNotifPermission = async () => {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    return req.status === "granted";
  }
  return true;
};
const scheduleReminders = async (startDate, nomeLocal, descLocal) => {
  const ok = await ensureNotifPermission();
  if (!ok) return { ids: [] };
  const scheduleIfFuture = async (fireDate, body) => {
    if (fireDate.getTime() <= Date.now()) return null;
    return Notifications.scheduleNotificationAsync({
      content: { title: "Lembrete de Evento", body, sound: true },
      trigger: fireDate,
    });
  };
  const msg = `Evento de ${nomeLocal || "cliente"}: ${
    descLocal || "compromisso"
  } em ${toBRDate(startDate)} às ${toBRTime(startDate)}.`;
  const id24h = await scheduleIfFuture(
    new Date(startDate.getTime() - 24 * 60 * 60 * 1000),
    `Amanhã: ${msg}`
  );
  const id1h = await scheduleIfFuture(
    new Date(startDate.getTime() - 60 * 60 * 1000),
    `Daqui a 1 hora: ${msg}`
  );
  return { ids: [id24h, id1h].filter(Boolean) };
};

// ====== Receitas ======
const addReceitaFromParcela = async (ev, parcela) => {
  try {
    const raw = await AsyncStorage.getItem(RECEITAS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    const receitaId = `rc-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const descricao =
      `[Agenda] ${ev.nome} • Parcela ${parcela.numero}/${ev.parcelas}` +
      (ev.descricao ? ` • ${ev.descricao}` : "");
    const agoraISO = new Date().toISOString();
    const nova = {
      id: receitaId,
      descricao,
      valor: parcela.valor,
      dataISO: agoraISO,
      data: new Date(agoraISO).toLocaleDateString("pt-BR"),
      origem: "Agenda",
      clienteNome: ev.nome,
      agendaEventoId: ev.id,
      agendaParcelaId: parcela.id,
    };
    const novoArr = Array.isArray(arr) ? [...arr, nova] : [nova];
    await AsyncStorage.setItem(RECEITAS_KEY, JSON.stringify(novoArr));
    return receitaId;
  } catch {
    return null;
  }
};
const removeReceitaById = async (receitaId) => {
  try {
    const raw = await AsyncStorage.getItem(RECEITAS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    const novoArr = (Array.isArray(arr) ? arr : []).filter(
      (r) => r.id !== receitaId
    );
    await AsyncStorage.setItem(RECEITAS_KEY, JSON.stringify(novoArr));
  } catch {}
};

// ====== Geração de parcelas ======
const gerarParcelasDetalhe = (valorTotal, qtd, dataBaseISO) => {
  const totalCents = Math.round(valorTotal * 100);
  const base = Math.floor(totalCents / qtd);
  const resto = totalCents - base * qtd;
  const arr = [];
  const baseDate = new Date(dataBaseISO);
  for (let i = 0; i < qtd; i++) {
    const cents = base + (i < resto ? 1 : 0);
    const valorParcela = cents / 100;
    const venc = addMonths(baseDate, i);
    arr.push({
      id: `${Date.now()}-${i + 1}`,
      numero: i + 1,
      valor: valorParcela,
      vencimentoISO: venc.toISOString(),
      pago: false,
      pagoEm: null,
    });
  }
  return arr;
};

// ====== Agrupar por cliente e numerar eventos ======
const groupByCliente = (itens) => {
  const sorted = [...(itens || [])].sort(
    (a, b) => new Date(a.quandoISO) - new Date(b.quandoISO)
  );
  const map = new Map();
  for (const ev of sorted) {
    const nome = ev?.nome || "—";
    if (!map.has(nome)) map.set(nome, []);
    map.get(nome).push(ev);
  }
  const out = [];
  for (const [nome, eventos] of map.entries()) {
    const enumerados = eventos.map((ev, idx) => ({
      ...ev,
      seqEventoCliente: idx + 1,
    }));
    const last = enumerados[enumerados.length - 1] || {};
    out.push({
      nome,
      telefone: last.telefone || "",
      endereco: last.endereco || "",
      eventos: enumerados,
    });
  }
  return out.sort((a, b) => a.nome.localeCompare(b.nome));
};

export default function ListaClientesAgenda({ navigation }) {
  const [itens, setItens] = useState([]);
  const [filtroNome, setFiltroNome] = useState("");

  // Modal de novo evento (inline, mesmo cliente)
  const [modalVisivel, setModalVisivel] = useState(false);
  const [clienteAlvo, setClienteAlvo] = useState(null);
  const [descricao, setDescricao] = useState("");
  const [valorStr, setValorStr] = useState("R$ 0,00");
  const [qtdParcelas, setQtdParcelas] = useState("1");
  const [lembrar, setLembrar] = useState(true);
  const [dataDate, setDataDate] = useState(null);
  const [horaDate, setHoraDate] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    const unsub = navigation.addListener("focus", async () => {
      try {
        const raw = await AsyncStorage.getItem(AGENDA_KEY);
        setItens(raw ? JSON.parse(raw) : []);
      } catch {
        setItens([]);
      }
    });
    return unsub;
  }, [navigation]);

  const salvarItens = async (arr) => {
    setItens(arr);
    await AsyncStorage.setItem(AGENDA_KEY, JSON.stringify(arr));
  };

  const clientes = useMemo(() => {
    const base = groupByCliente(itens);
    if (!filtroNome.trim()) return base;
    return base.filter((c) =>
      c.nome.toLowerCase().includes(filtroNome.trim().toLowerCase())
    );
  }, [itens, filtroNome]);

  const toggleParcelaWithPrompt = async (eventId, parcelaId) => {
    const ev = itens.find((e) => e.id === eventId);
    if (!ev) return;
    const parcela = (ev.parcelasDetalhe || []).find((p) => p.id === parcelaId);
    if (!parcela) return;

    if (!parcela.pago) {
      Alert.alert(
        "Confirmar baixa",
        `Dar baixa na ${parcela.numero}ª parcela de ${ev.nome}? Isso criará um lançamento em Receitas.`,
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Confirmar",
            style: "default",
            onPress: async () => {
              const receitaId = await addReceitaFromParcela(ev, parcela);
              const pagoEmISO = new Date().toISOString();
              const novoArr = itens.map((e) => {
                if (e.id !== ev.id) return e;
                const det = (e.parcelasDetalhe || []).map((p) =>
                  p.id === parcela.id
                    ? { ...p, pago: true, pagoEm: pagoEmISO, receitaId }
                    : p
                );
                return { ...e, parcelasDetalhe: det };
              });
              await salvarItens(novoArr);
            },
          },
        ]
      );
    } else {
      Alert.alert(
        "Desfazer baixa",
        `Remover a baixa da ${parcela.numero}ª parcela de ${ev.nome}? A receita gerada será apagada.`,
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Confirmar",
            style: "destructive",
            onPress: async () => {
              if (parcela.receitaId) await removeReceitaById(parcela.receitaId);
              const novoArr = itens.map((e) => {
                if (e.id !== ev.id) return e;
                const det = (e.parcelasDetalhe || []).map((p) =>
                  p.id === parcela.id
                    ? { ...p, pago: false, pagoEm: null, receitaId: undefined }
                    : p
                );
                return { ...e, parcelasDetalhe: det };
              });
              await salvarItens(novoArr);
            },
          },
        ]
      );
    }
  };

  const apagarEvento = async (id) => {
    const event = itens.find((x) => x.id === id);
    if (event?.notifIds?.length) {
      for (const nid of event.notifIds) {
        try {
          await Notifications.cancelScheduledNotificationAsync(nid);
        } catch {}
      }
    }
    const novoArr = itens.filter((x) => x.id !== id);
    await salvarItens(novoArr);
  };

  const abrirModalNovoEvento = (cliente) => {
    setClienteAlvo(cliente);
    setDescricao("");
    setValorStr("R$ 0,00");
    setQtdParcelas("1");
    setLembrar(true);
    setDataDate(null);
    setHoraDate(null);
    setModalVisivel(true);
  };
  const fecharModal = () => setModalVisivel(false);

  const salvarNovoEvento = async () => {
    try {
      if (!clienteAlvo?.nome)
        return Alert.alert("Atenção", "Cliente inválido.");
      if (!dataDate || !horaDate)
        return Alert.alert("Atenção", "Selecione data e hora do evento.");
      const valor = parseCurrency(valorStr);
      const parcelas = Math.max(1, parseInt(qtdParcelas || "1", 10));

      const quando = new Date(
        dataDate.getFullYear(),
        dataDate.getMonth(),
        dataDate.getDate(),
        horaDate.getHours(),
        horaDate.getMinutes(),
        0,
        0
      );

      const novo = {
        id: Date.now().toString(),
        nome: clienteAlvo.nome,
        endereco: clienteAlvo.endereco || "",
        telefone: onlyDigits(clienteAlvo.telefone || ""),
        descricao: descricao.trim(),
        quandoISO: quando.toISOString(),
        valor,
        parcelas,
        lembreteAtivo: lembrar,
        notifIds: [],
        criadoEm: new Date().toISOString(),
        parcelasDetalhe: gerarParcelasDetalhe(
          valor,
          parcelas,
          quando.toISOString()
        ),
      };

      if (lembrar) {
        const { ids } = await scheduleReminders(
          quando,
          novo.nome,
          novo.descricao
        );
        novo.notifIds = ids;
      }

      const novoArr = [...itens, novo].sort(
        (a, b) => new Date(a.quandoISO) - new Date(b.quandoISO)
      );
      await salvarItens(novoArr);
      setModalVisivel(false);
      Alert.alert("Sucesso", "Evento adicionado ao cliente.");
    } catch {
      Alert.alert("Erro", "Não foi possível salvar o evento.");
    }
  };

  const renderParcela =
    (ev) =>
    ({ item }) => {
      const pagoEmTxt =
        item.pago && item.pagoEm ? ` • Pago em ${toBRDate(item.pagoEm)}` : "";
      return (
        <View style={[styles.parcela, item.pago ? styles.parcelaPago : null]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.parcelaTxt}>
              {item.numero}ª •{" "}
              {item.valor.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}{" "}
              • Venc: {toBRDate(item.vencimentoISO)}
            </Text>
            <Text style={styles.parcelaSubTxt}>
              {statusParcela(item)}
              {pagoEmTxt}
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.btnMini,
              item.pago ? styles.btnPago : styles.btnBaixa,
            ]}
            onPress={() => toggleParcelaWithPrompt(ev.id, item.id)}
          >
            <Text
              style={[
                styles.btnMiniTxt,
                item.pago ? styles.btnMiniTxtPago : null,
              ]}
            >
              {item.pago ? "Pago" : "Dar baixa"}
            </Text>
          </TouchableOpacity>
        </View>
      );
    };

  const renderEventoDoCliente = (ev) => {
    const todasPagas = (ev.parcelasDetalhe || []).every((p) => p.pago);
    const valorFmt =
      ev.valor?.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      }) || "R$ 0,00";
    return (
      <View
        key={ev.id}
        style={[styles.eventCard, todasPagas ? styles.cardPago : null]}
      >
        <View style={styles.eventHeader}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={styles.badgeEvento}>
              Evento #{ev.seqEventoCliente}
            </Text>
            {todasPagas ? <Text style={styles.badgePago}>Pago</Text> : null}
          </View>
          <TouchableOpacity
            onPress={() =>
              Alert.alert("Confirmar", "Deseja remover este evento?", [
                { text: "Cancelar", style: "cancel" },
                {
                  text: "Remover",
                  style: "destructive",
                  onPress: () => apagarEvento(ev.id),
                },
              ])
            }
          >
            <Text style={styles.linkRemover}>Excluir</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.cardLinha}>
          🗓 {toBRDate(ev.quandoISO)} • ⏰ {toBRTime(ev.quandoISO)}
        </Text>
        <Text style={styles.cardLinha}>📝 {ev.descricao || "-"}</Text>
        <Text style={[styles.cardLinha, { fontWeight: "700" }]}>
          💰 Valor do evento: {valorFmt} • {ev.parcelas}x
        </Text>

        <FlatList
          data={ev.parcelasDetalhe || []}
          keyExtractor={(p) => p.id}
          renderItem={renderParcela(ev)}
          scrollEnabled={false}
          contentContainerStyle={{ marginTop: 8 }}
        />
      </View>
    );
  };

  const renderCliente = ({ item }) => {
    const abertas = item.eventos.reduce(
      (acc, ev) =>
        acc + (ev.parcelasDetalhe || []).filter((p) => !p.pago).length,
      0
    );
    const proximo = [...item.eventos].sort(
      (a, b) => new Date(a.quandoISO) - new Date(b.quandoISO)
    )[0];

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={styles.cardTitulo}>{item.nome}</Text>
            <Text style={styles.cardLinha}>{item.endereco || ""}</Text>
            <Text style={styles.cardLinha}>📞 {item.telefone || "-"}</Text>
            {proximo ? (
              <Text style={styles.cardLinha}>
                Próximo evento: {toBRDate(proximo.quandoISO)}{" "}
                {toBRTime(proximo.quandoISO)}
              </Text>
            ) : null}
            <Text style={styles.cardLinha}>Parcelas em aberto: {abertas}</Text>
          </View>

          {/* BOTÃO AJUSTADO: não corta mais o texto */}
          <TouchableOpacity
            style={styles.btnNovoEvento}
            onPress={() => abrirModalNovoEvento(item)}
          >
            <Text
              style={styles.btnNovoEventoTxt}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              + Agendar evento
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 8 }}>
          {item.eventos.map(renderEventoDoCliente)}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.rowTop}>
        <TouchableOpacity
          style={styles.btnNovo}
          onPress={() => navigation.navigate("ClientesAgenda")}
        >
          <Text style={styles.btnNovoTxt}>
            + Novo Agendamento (novo cliente)
          </Text>
        </TouchableOpacity>
        <TextInput
          placeholder="Filtrar por nome"
          value={filtroNome}
          onChangeText={setFiltroNome}
          style={styles.filtro}
          returnKeyType="search"
        />
      </View>

      <FlatList
        data={clientes}
        keyExtractor={(c) => c.nome}
        renderItem={renderCliente}
        ListEmptyComponent={
          <Text style={{ textAlign: "center", color: "#777", marginTop: 24 }}>
            Nenhum agendamento encontrado.
          </Text>
        }
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      />

      {/* ===== MODAL: novo evento do mesmo cliente ===== */}
      <Modal
        visible={modalVisivel}
        transparent
        animationType="slide"
        onRequestClose={fecharModal}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={{ width: "100%" }}
            >
              <View style={styles.modalContent}>
                <ScrollView keyboardShouldPersistTaps="handled">
                  <Text style={styles.modalTitulo}>
                    Novo evento — {clienteAlvo?.nome || ""}
                  </Text>

                  <TextInput
                    placeholder="Descrição do evento"
                    value={descricao}
                    onChangeText={setDescricao}
                    style={styles.input}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />

                  <View style={styles.row}>
                    <TouchableOpacity
                      style={[styles.input, styles.inputHalf]}
                      onPress={() => setShowDatePicker(true)}
                    >
                      <Text style={styles.placeholderLike}>
                        {dataDate ? toBRDate(dataDate) : "Selecionar data"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.input, styles.inputHalf]}
                      onPress={() => setShowTimePicker(true)}
                    >
                      <Text style={styles.placeholderLike}>
                        {horaDate
                          ? toBRTime(horaDate).slice(0, 5)
                          : "Selecionar hora"}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {showDatePicker && (
                    <DateTimePicker
                      value={dataDate || new Date()}
                      mode="date"
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      onChange={(_, selected) => {
                        setShowDatePicker(false);
                        if (selected) setDataDate(selected);
                      }}
                    />
                  )}
                  {showTimePicker && (
                    <DateTimePicker
                      value={horaDate || new Date()}
                      mode="time"
                      is24Hour
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      onChange={(_, selected) => {
                        setShowTimePicker(false);
                        if (selected) setHoraDate(selected);
                      }}
                    />
                  )}

                  <View style={styles.row}>
                    <TextInput
                      placeholder="Valor do evento"
                      value={valorStr}
                      onChangeText={(t) => setValorStr(formatCurrencyTyping(t))}
                      keyboardType="number-pad"
                      style={[styles.input, styles.inputHalf]}
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />
                    <TextInput
                      placeholder="Parcelas (ex: 1)"
                      value={qtdParcelas}
                      onChangeText={(t) => setQtdParcelas(onlyDigits(t))}
                      keyboardType="number-pad"
                      style={[styles.input, styles.inputHalf]}
                      maxLength={2}
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />
                  </View>

                  <TouchableOpacity
                    onPress={() => setLembrar(!lembrar)}
                    style={[
                      styles.toggle,
                      lembrar ? styles.toggleOn : styles.toggleOff,
                    ]}
                  >
                    <Text style={styles.toggleText}>
                      {lembrar
                        ? "Lembrete ativado (24h e 1h antes)"
                        : "Lembrete desativado"}
                    </Text>
                  </TouchableOpacity>

                  <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                    <TouchableOpacity
                      style={[styles.btnModal, styles.btnCancelar]}
                      onPress={fecharModal}
                    >
                      <Text style={styles.btnModalTxtCancel}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btnModal, styles.btnSalvar]}
                      onPress={salvarNovoEvento}
                    >
                      <Text style={styles.btnModalTxtSalvar}>Salvar</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

// ===== estilos =====
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },

  rowTop: { flexDirection: "row", gap: 8, marginBottom: 12 },
  btnNovo: {
    flex: 1,
    backgroundColor: "#bfa140",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  btnNovoTxt: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
    textAlign: "center",
  },
  filtro: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fff",
  },

  card: {
    borderWidth: 1,
    borderColor: "#eee",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    marginTop: 8,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  cardTitulo: { fontSize: 16, fontWeight: "700" },
  cardLinha: { color: "#333", marginTop: 2 },

  // BOTÃO corrigido (não corta mais o texto)
  btnNovoEvento: {
    alignSelf: "flex-start",
    backgroundColor: "#efe8ff",
    paddingHorizontal: 12,
    paddingVertical: 12, // mais alto
    borderRadius: 10,
    minHeight: 40, // garante altura adequada no iOS
  },
  btnNovoEventoTxt: {
    color: "#6f42c1",
    fontWeight: "700",
    fontSize: 14,
    lineHeight: 18, // evita corte vertical no iOS
  },

  eventCard: {
    borderWidth: 1,
    borderColor: "#f0f0f0",
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
  },
  eventHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  linkRemover: { color: "#d9534f", fontWeight: "700" },

  cardPago: { backgroundColor: "#eef6ff", borderColor: "#cfe4ff" },
  badgePago: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "700",
    color: "#0d6efd",
    backgroundColor: "#e7f0ff",
  },
  badgeEvento: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "700",
    color: "#6f42c1",
    backgroundColor: "#efe8ff",
  },

  parcela: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
    gap: 8,
  },
  parcelaPago: { backgroundColor: "#f2fbf2", borderColor: "#cfe7cf" },
  parcelaTxt: { color: "#333", fontWeight: "600" },
  parcelaSubTxt: { color: "#555", fontSize: 12, marginTop: 2 },
  btnMini: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10 },
  btnBaixa: { backgroundColor: "#bfa140" },
  btnPago: { backgroundColor: "#e7f0ff" },
  btnMiniTxt: { color: "#fff", fontWeight: "700" },
  btnMiniTxtPago: { color: "#0d6efd", fontWeight: "700" },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "#00000088",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalContent: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 16,
    width: "100%",
    maxHeight: "90%",
  },
  modalTitulo: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },

  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    backgroundColor: "#fff",
  },
  placeholderLike: { color: "#555" },
  row: { flexDirection: "row", gap: 8 },
  inputHalf: { flex: 1 },

  toggle: {
    marginTop: 10,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },
  toggleOn: {
    backgroundColor: "#e9f6e9",
    borderWidth: 1,
    borderColor: "#9bd09b",
  },
  toggleOff: {
    backgroundColor: "#f6f6f6",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  toggleText: { color: "#333", fontWeight: "600" },

  btnModal: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  btnCancelar: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#aaa" },
  btnSalvar: { backgroundColor: "#bfa140" },
  btnModalTxtCancel: { color: "#666", fontWeight: "700" },
  btnModalTxtSalvar: { color: "#fff", fontWeight: "700" },
});
