// screens/ListaClientesAgenda.js
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
import { FORM_CARD } from "../styles/formCard";

const AGENDA_KEY = "agenda_clientes";
const VENDAS_KEY = "venda";
const SERVICOS_KEY = "@receitas_servicos";

/* ====== Utils ====== */
const safeJSON = (raw, fallback) => {
  try {
    const v = raw ? JSON.parse(raw) : fallback;
    return v ?? fallback;
  } catch {
    return fallback;
  }
};

const isValidDate = (d) => d instanceof Date && !isNaN(d.getTime());

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
  }

  const hoje = new Date();
  const d = diffDias(hoje, venc);
  if (d === 0) return "Vence hoje";
  if (d < 0) return `Faltam ${Math.abs(d)}d`;
  return `Atrasado ${d}d`;
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

/* ====== Notificações ====== */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const ensureNotifPermission = async () => {
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (perm?.status !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      return req?.status === "granted";
    }
    return true;
  } catch {
    return false;
  }
};

// ✅ BLINDADO: se falhar, não derruba o salvamento
const scheduleReminders = async (startDate, nomeLocal, descLocal) => {
  try {
    const ok = await ensureNotifPermission();
    if (!ok) return { ids: [] };

    if (!isValidDate(startDate)) return { ids: [] };

    const scheduleIfFuture = async (fireDate, body) => {
      if (!isValidDate(fireDate)) return null;
      if (fireDate.getTime() <= Date.now()) return null;

      return Notifications.scheduleNotificationAsync({
        content: { title: "Lembrete de Evento", body, sound: true },
        trigger: fireDate, // Date trigger
      });
    };

    const msg = `Evento de ${nomeLocal || "cliente"}: ${
      descLocal || "compromisso"
    } em ${toBRDate(startDate)} às ${toBRTime(startDate)}.`;

    const id24h = await scheduleIfFuture(
      new Date(startDate.getTime() - 24 * 60 * 60 * 1000),
      `Amanhã: ${msg}`,
    );

    const id1h = await scheduleIfFuture(
      new Date(startDate.getTime() - 60 * 60 * 1000),
      `Daqui a 1 hora: ${msg}`,
    );

    return { ids: [id24h, id1h].filter(Boolean) };
  } catch (e) {
    console.log("[Agenda] scheduleReminders falhou:", e);
    return { ids: [] };
  }
};

const getDestinoNormalizado = (destino) => {
  const d = String(destino || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return d.includes("servico") ? "servicos" : "vendas";
};

const getStorageKeyByDestino = (destino) => {
  return getDestinoNormalizado(destino) === "servicos"
    ? SERVICOS_KEY
    : VENDAS_KEY;
};

const addReceitaFromParcela = async (ev, parcela) => {
  try {
    const destino = getDestinoNormalizado(ev?.destinoReceita);
    const key = getStorageKeyByDestino(destino);

    const raw = await AsyncStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    const baseArr = Array.isArray(arr) ? arr : [];

    const lancamentoId = `rc-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const agoraISO = new Date().toISOString();

    const descricao =
      destino === "servicos"
        ? `[Agenda] Receita Serviço • ${ev.nome} • Parcela ${parcela.numero}/${ev.parcelas}` +
          (ev.descricao ? ` • ${ev.descricao}` : "")
        : `[Agenda] Venda • ${ev.nome} • Parcela ${parcela.numero}/${ev.parcelas}` +
          (ev.descricao ? ` • ${ev.descricao}` : "");

    const novo = {
      id: lancamentoId,
      descricao,
      valor: Number(parcela.valor || 0),
      valorNumber: Number(parcela.valor || 0),
      dataISO: agoraISO,
      data: new Date(agoraISO).toLocaleDateString("pt-BR"),
      origem: "Agenda",
      clienteNome: ev.nome,
      cliente: ev.nome,
      agendaEventoId: ev.id,
      agendaParcelaId: parcela.id,
      tipo: destino === "servicos" ? "servico" : "venda",
      meiBucket: destino === "servicos" ? "servicos" : "vendas",
    };

    const novoArr = [...baseArr, novo];
    await AsyncStorage.setItem(key, JSON.stringify(novoArr));

    return { lancamentoId, destino };
  } catch (e) {
    console.log("[ListaClientesAgenda] addReceitaFromParcela falhou:", e);
    return { lancamentoId: null, destino: "vendas" };
  }
};

const removeReceitaById = async (destino, lancamentoId) => {
  try {
    const key = getStorageKeyByDestino(destino);
    const raw = await AsyncStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    const novoArr = (Array.isArray(arr) ? arr : []).filter(
      (r) => r.id !== lancamentoId,
    );
    await AsyncStorage.setItem(key, JSON.stringify(novoArr));
  } catch (e) {
    console.log("[ListaClientesAgenda] removeReceitaById falhou:", e);
  }
};
/* ====== Geração de parcelas ====== */
const gerarParcelasDetalhe = (valorTotal, qtd, dataBaseISO) => {
  const totalCents = Math.round(valorTotal * 100);
  const base = Math.floor(totalCents / qtd);
  const resto = totalCents - base * qtd;

  const arr = [];
  const baseDate = new Date(dataBaseISO);
  const baseId = String(Date.now());

  for (let i = 0; i < qtd; i++) {
    const cents = base + (i < resto ? 1 : 0);
    const valorParcela = cents / 100;
    const venc = addMonths(baseDate, i);

    arr.push({
      id: `${baseId}-${i + 1}`,
      numero: i + 1,
      valor: valorParcela,
      vencimentoISO: venc.toISOString(),
      pago: false,
      pagoEm: null,
    });
  }

  return arr;
};

/* ====== Agrupar por cliente e numerar eventos ====== */
const groupByCliente = (itens) => {
  const sorted = [...(itens || [])].sort(
    (a, b) => new Date(a.quandoISO) - new Date(b.quandoISO),
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

  // ✅ canal Android (evita falhas/silêncio em alguns aparelhos)
  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name: "Lembretes",
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#FF231F7C",
          });
        }
      } catch (e) {
        console.log("[Agenda] falha canal notif:", e);
      }
    })();
  }, []);

  const loadAgenda = async () => {
    try {
      const raw = await AsyncStorage.getItem(AGENDA_KEY);
      const arr = safeJSON(raw, []);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  };

  useEffect(() => {
    const unsub = navigation.addListener("focus", async () => {
      const arr = await loadAgenda();
      setItens(Array.isArray(arr) ? arr : []);
    });
    return unsub;
  }, [navigation]);

  const salvarItens = async (arr) => {
    const safeArr = Array.isArray(arr) ? arr : [];
    setItens(safeArr);
    await AsyncStorage.setItem(AGENDA_KEY, JSON.stringify(safeArr));
  };

  const clientes = useMemo(() => {
    const base = groupByCliente(itens);
    if (!filtroNome.trim()) return base;
    return base.filter((c) =>
      c.nome.toLowerCase().includes(filtroNome.trim().toLowerCase()),
    );
  }, [itens, filtroNome]);

  const toggleParcelaWithPrompt = async (eventId, parcelaId) => {
    const ev = (Array.isArray(itens) ? itens : []).find(
      (e) => e.id === eventId,
    );
    if (!ev) return;

    const parcela = (ev.parcelasDetalhe || []).find((p) => p.id === parcelaId);
    if (!parcela) return;

    const destino = getDestinoNormalizado(ev?.destinoReceita);
    const destinoLabel =
      destino === "servicos" ? "Receita de Serviços" : "Vendas";

    if (!parcela.pago) {
      Alert.alert(
        "Confirmar baixa",
        `Dar baixa na ${parcela.numero}ª parcela de ${ev.nome}? Isso criará um lançamento em ${destinoLabel}.`,
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Confirmar",
            style: "default",
            onPress: async () => {
              const { lancamentoId, destino: destinoSalvo } =
                await addReceitaFromParcela(ev, parcela);

              if (!lancamentoId) {
                Alert.alert("Erro", "Não foi possível registrar a baixa.");
                return;
              }

              const pagoEmISO = new Date().toISOString();

              const novoArr = (Array.isArray(itens) ? itens : []).map((e) => {
                if (e.id !== ev.id) return e;
                const det = (e.parcelasDetalhe || []).map((p) =>
                  p.id === parcela.id
                    ? {
                        ...p,
                        pago: true,
                        pagoEm: pagoEmISO,
                        lancamentoId,
                        lancamentoDestino: destinoSalvo,
                      }
                    : p,
                );
                return { ...e, parcelasDetalhe: det };
              });

              await salvarItens(novoArr);
            },
          },
        ],
      );
    } else {
      Alert.alert(
        "Desfazer baixa",
        `Remover a baixa da ${parcela.numero}ª parcela de ${ev.nome}? O lançamento gerado em ${destinoLabel} será apagado.`,
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Confirmar",
            style: "destructive",
            onPress: async () => {
              if (parcela.lancamentoId) {
                await removeReceitaById(
                  parcela.lancamentoDestino || ev?.destinoReceita,
                  parcela.lancamentoId,
                );
              }

              const novoArr = (Array.isArray(itens) ? itens : []).map((e) => {
                if (e.id !== ev.id) return e;
                const det = (e.parcelasDetalhe || []).map((p) =>
                  p.id === parcela.id
                    ? {
                        ...p,
                        pago: false,
                        pagoEm: null,
                        lancamentoId: undefined,
                        lancamentoDestino: undefined,
                      }
                    : p,
                );
                return { ...e, parcelasDetalhe: det };
              });

              await salvarItens(novoArr);
            },
          },
        ],
      );
    }
  };

  const apagarEvento = async (id) => {
    const event = (Array.isArray(itens) ? itens : []).find((x) => x.id === id);
    if (event?.notifIds?.length) {
      for (const nid of event.notifIds) {
        try {
          await Notifications.cancelScheduledNotificationAsync(nid);
        } catch {}
      }
    }
    const novoArr = (Array.isArray(itens) ? itens : []).filter(
      (x) => x.id !== id,
    );
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

  // ✅ BLINDADO: salva primeiro, notifica depois (sem travar)
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
        0,
      );

      if (!isValidDate(quando)) {
        return Alert.alert(
          "Atenção",
          "Data/hora inválida. Selecione novamente.",
        );
      }

      // ✅ fonte da verdade (evita itens corrompido)
      const listaAtual = await loadAgenda();

      const baseId = Date.now().toString();

      const novo = {
        id: baseId,
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
          quando.toISOString(),
        ),
      };

      // ✅ 1) salva PRIMEIRO
      const novoArr = [
        ...(Array.isArray(listaAtual) ? listaAtual : []),
        novo,
      ].sort((a, b) => new Date(a.quandoISO) - new Date(b.quandoISO));

      await salvarItens(novoArr);

      // ✅ 2) tenta agendar lembretes (sem travar)
      if (lembrar) {
        const { ids } = await scheduleReminders(
          quando,
          novo.nome,
          novo.descricao,
        );
        const idsSafe = Array.isArray(ids) ? ids : [];

        if (idsSafe.length > 0) {
          const atualizado = novoArr.map((e) =>
            String(e.id) === String(baseId) ? { ...e, notifIds: idsSafe } : e,
          );
          await salvarItens(atualizado);
        }
      }

      setModalVisivel(false);
      Alert.alert("Sucesso", "Evento adicionado ao cliente.");
    } catch (e) {
      console.log("[Agenda] erro salvarNovoEvento:", e);
      Alert.alert(
        "Erro",
        `Não foi possível salvar o evento.\n\n${String(e?.message || e)}`,
      );
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

  // ✅ AQUI: clicar no evento abre ClientesAgenda em modo editar
  const abrirEdicaoEvento = (ev) => {
    navigation.navigate("ClientesAgenda", {
      mode: "edit",
      agendamento: ev,
      agendamentoId: String(ev.id),
      filtroNome: ev?.nome || "",
    });
  };

  const renderEventoDoCliente = (ev) => {
    const todasPagas = (ev.parcelasDetalhe || []).every((p) => p.pago);

    const valorFmt =
      ev.valor?.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      }) || "R$ 0,00";

    return (
      <TouchableOpacity
        key={ev.id}
        activeOpacity={0.9}
        onPress={() => abrirEdicaoEvento(ev)}
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
          keyExtractor={(p) => String(p.id)}
          renderItem={renderParcela(ev)}
          scrollEnabled={false}
          contentContainerStyle={{ marginTop: 8 }}
        />

        <Text style={styles.tapHint}>Toque no evento para corrigir/editar</Text>
      </TouchableOpacity>
    );
  };

  const renderCliente = ({ item }) => {
    const abertas = item.eventos.reduce(
      (acc, ev) =>
        acc + (ev.parcelasDetalhe || []).filter((p) => !p.pago).length,
      0,
    );

    const proximo = [...item.eventos].sort(
      (a, b) => new Date(a.quandoISO) - new Date(b.quandoISO),
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

/* ===== estilos ===== */
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
    ...FORM_CARD,
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

  btnNovoEvento: {
    alignSelf: "flex-start",
    backgroundColor: "#efe8ff",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    minHeight: 40,
  },
  btnNovoEventoTxt: {
    color: "#6f42c1",
    fontWeight: "700",
    fontSize: 14,
    lineHeight: 18,
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

  tapHint: {
    marginTop: 10,
    textAlign: "center",
    color: "#777",
    fontSize: 12,
    fontWeight: "600",
  },

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
