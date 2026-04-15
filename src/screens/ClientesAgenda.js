// screens/ClientesAgenda.js
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  Keyboard,
  Linking,
  Platform,
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Notifications from "expo-notifications";
import { useNavigation } from "@react-navigation/native";

// Helpers de plataforma
const isIOS = Platform.OS === "ios";
const iosSupportsInline =
  isIOS &&
  (() => {
    const v = String(Platform.Version || "");
    const major = parseInt(v.split(".")[0] || "14", 10);
    return major >= 14;
  })();

// ✅ Mantém sua chave atual (pra não quebrar dados existentes)
const AGENDA_KEY = "agenda_clientes";
// ✅ Fallback de migração (se em algum momento você usou outra chave)
const AGENDA_KEY_FALLBACK = "@agenda_clientes";

const safeJSON = (raw, fallback) => {
  try {
    const v = raw ? JSON.parse(raw) : fallback;
    return v ?? fallback;
  } catch {
    return fallback;
  }
};

const isValidDate = (d) => d instanceof Date && !isNaN(d.getTime());

const cancelNotifIds = async (ids) => {
  try {
    if (!Array.isArray(ids) || ids.length === 0) return;
    for (const id of ids) {
      try {
        await Notifications.cancelScheduledNotificationAsync(id);
      } catch {
        // se já foi disparada/cancelada, ignora
      }
    }
  } catch (e) {
    console.log("Falha ao cancelar notifIds:", e);
  }
};

const onlyDigits = (s = "") => (s || "").replace(/\D+/g, "");
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

/* =========================
   DESTINO DO PAGAMENTO
   ========================= */
const KEY_SERVICOS = "@receitas_servicos";

// ✅ sua tela Vendas costuma usar "venda" (vou manter fallback pra não quebrar)
const KEY_VENDAS_PRI = "venda";
const KEY_VENDAS_FALLBACKS = ["@vendas", "vendas", "receitas", "receita"];

async function readArrayFromAnyKey(primaryKey, fallbacks = []) {
  const keys = [primaryKey, ...fallbacks];
  for (const k of keys) {
    try {
      const raw = await AsyncStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return { keyUsed: k, arr: parsed };
    } catch {}
  }
  return { keyUsed: primaryKey, arr: [] };
}

async function writeArrayToKey(key, arr) {
  await AsyncStorage.setItem(
    key,
    JSON.stringify(Array.isArray(arr) ? arr : []),
  );
}

async function lancarPagamentoNoDestino(destino, payload) {
  const d = String(destino || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // remove acentos

  const isServicos =
    d === "servicos" || d === "servico" || d.includes("servico");

  const key = isServicos ? KEY_SERVICOS : KEY_VENDAS_PRI;

  const { keyUsed, arr } = isServicos
    ? await readArrayFromAnyKey(KEY_SERVICOS, [])
    : await readArrayFromAnyKey(KEY_VENDAS_PRI, KEY_VENDAS_FALLBACKS);

  arr.push(payload);
  await writeArrayToKey(keyUsed || key, arr);
}

/* =========================
   STATUS PARCELA
   ========================= */
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

// handler global das notificações
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function ClientesAgenda({ route }) {
  const navigation = useNavigation();
  const filtroNome = route?.params?.filtroNome || null;

  const [nome, setNome] = useState(filtroNome || "");
  const [endereco, setEndereco] = useState("");
  const [telefone, setTelefone] = useState("");
  const [descricao, setDescricao] = useState("");

  const [dataDate, setDataDate] = useState(null);
  const [horaDate, setHoraDate] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [valorStr, setValorStr] = useState("R$ 0,00");
  const [qtdParcelas, setQtdParcelas] = useState(""); // vazio; placeholder mostra "1"
  const [lembrar, setLembrar] = useState(true);

  // ✅ escolha do destino do pagamento
  const [destinoReceita, setDestinoReceita] = useState("vendas"); // "vendas" | "servicos"

  const [itens, setItens] = useState([]);

  // ✅ canal Android
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
        console.log("[Agenda] falha ao criar canal:", e);
      }
    })();
  }, []);

  const loadAgenda = async () => {
    try {
      const raw = await AsyncStorage.getItem(AGENDA_KEY);
      const arr = safeJSON(raw, []);
      if (Array.isArray(arr) && arr.length > 0) return arr;

      const raw2 = await AsyncStorage.getItem(AGENDA_KEY_FALLBACK);
      const arr2 = safeJSON(raw2, []);
      if (Array.isArray(arr2) && arr2.length > 0) {
        await AsyncStorage.setItem(AGENDA_KEY, JSON.stringify(arr2));
        return arr2;
      }
      return [];
    } catch {
      return [];
    }
  };

  useEffect(() => {
    (async () => {
      const arr = await loadAgenda();
      setItens(Array.isArray(arr) ? arr : []);
    })();
  }, []);

  const salvarItens = async (arr) => {
    const safeArr = Array.isArray(arr) ? arr : [];
    setItens(safeArr);
    await AsyncStorage.setItem(AGENDA_KEY, JSON.stringify(safeArr));
  };

  useEffect(() => {
    const isEdit = route?.params?.mode === "edit";
    if (!isEdit) return;

    const ag = route?.params?.agendamento;
    if (ag) {
      setNome(ag.nome || "");
      setEndereco(ag.endereco || "");
      setTelefone(ag.telefone || "");
      setDescricao(ag.descricao || "");
      setValorStr(
        typeof ag.valor === "number"
          ? ag.valor.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })
          : "R$ 0,00",
      );
      setDestinoReceita(ag.destinoReceita || "vendas");
      setQtdParcelas(String(ag.parcelas || "1"));
      setLembrar(ag.lembreteAtivo !== false);

      const d = ag.quandoISO ? new Date(ag.quandoISO) : null;
      if (d && !isNaN(d.getTime())) {
        setDataDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
        setHoraDate(new Date(1970, 0, 1, d.getHours(), d.getMinutes(), 0, 0));
      }
    }
  }, [route?.params]);

  // ======= PERMISSÃO DE NOTIFICAÇÃO =======
  const ensureNotifPermission = async () => {
    try {
      const perm = await Notifications.getPermissionsAsync();
      if (perm?.status !== "granted") {
        const req = await Notifications.requestPermissionsAsync();
        if (req?.status !== "granted") {
          Alert.alert(
            "Permissão necessária",
            "Ative as notificações do app nas configurações do sistema para usar os lembretes.",
          );
          return false;
        }
      }
      return true;
    } catch (e) {
      console.log("[Agenda] erro permissão notif:", e);
      return false;
    }
  };

  // ======= AGENDAR LEMBRETES (24h e 1h antes) =======
  const scheduleReminders = async (startDate, nomeLocal, descLocal) => {
    try {
      const ok = await ensureNotifPermission();
      if (!ok) return { ids: [] };
      if (!isValidDate(startDate)) return { ids: [] };

      const now = Date.now();
      const eventTs = startDate.getTime();
      const diffSeconds = Math.floor((eventTs - now) / 1000);

      const before24h = diffSeconds - 24 * 60 * 60;
      const before1h = diffSeconds - 60 * 60;

      const msgBase = `Evento de ${nomeLocal || "cliente"}: ${
        descLocal || "compromisso"
      } em ${toBRDate(startDate)} às ${toBRTime(startDate)}.`;

      const ids = [];

      if (before24h > 60) {
        const id24 = await Notifications.scheduleNotificationAsync({
          content: {
            title: "Lembrete de Evento",
            body: `Amanhã: ${msgBase}`,
            sound: true,
          },
          trigger: { seconds: before24h, repeats: false },
        });
        ids.push(id24);
      }

      if (before1h > 60) {
        const id1 = await Notifications.scheduleNotificationAsync({
          content: {
            title: "Lembrete de Evento",
            body: `Daqui a 1 hora: ${msgBase}`,
            sound: true,
          },
          trigger: { seconds: before1h, repeats: false },
        });
        ids.push(id1);
      }

      if (ids.length === 0 && diffSeconds > 60) {
        const idTeste = await Notifications.scheduleNotificationAsync({
          content: {
            title: "Lembrete de Evento",
            body: `Teste rápido: ${msgBase}`,
            sound: true,
          },
          trigger: { seconds: 60, repeats: false },
        });
        ids.push(idTeste);
        Alert.alert(
          "Lembrete",
          "Como o evento está próximo, agendamos um lembrete de teste para daqui a 1 minuto.",
        );
      }

      return { ids };
    } catch (e) {
      console.log("[Agenda] falha ao agendar lembretes:", e);
      return { ids: [] };
    }
  };

  // ======= PARCELAS =======
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

        // ✅ anti-duplicação de lançamento
        lancado: false,
        lancadoEm: null,
      });
    }
    return arr;
  };

  // ======= BAIXAR PRÓXIMA PARCELA (AQUI NASCE O PAYLOAD) =======
  const baixarProximaParcela = async (agendamento) => {
    try {
      const listaAtual = await loadAgenda();
      const idx = (Array.isArray(listaAtual) ? listaAtual : []).findIndex(
        (x) => String(x.id) === String(agendamento.id),
      );
      if (idx < 0) return;

      const ag = listaAtual[idx];
      const parcelas = Array.isArray(ag.parcelasDetalhe)
        ? ag.parcelasDetalhe
        : [];

      const proxima = parcelas.find((p) => !p.pago);
      if (!proxima) {
        return Alert.alert("Tudo certo ✅", "Não há parcelas em aberto.");
      }

      const etiqueta = `${proxima.numero}ª parcela (venc. ${toBRDate(
        proxima.vencimentoISO,
      )})`;

      Alert.alert(
        "Confirmar baixa",
        `Baixar ${proxima.valor.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        })} - ${etiqueta} de "${ag.nome}"?\n\nEssa ação registra a baixa e não pode ser desfeita.`,
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Confirmar",
            style: "destructive",
            onPress: async () => {
              const agoraISO = new Date().toISOString();

              // normaliza destino salvo no agendamento
              const destinoRaw = String(ag?.destinoReceita || "")
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "");

              const destinoFinal =
                destinoRaw === "servicos" ||
                destinoRaw === "servico" ||
                destinoRaw.includes("servico")
                  ? "servicos"
                  : "vendas";

              // segurança: não lançar duas vezes a mesma parcela
              if (proxima.lancado === true) {
                Alert.alert(
                  "Atenção",
                  "Esta parcela já foi lançada anteriormente.",
                );
                return;
              }

              const payload = {
                id: String(Date.now()),
                dataISO: agoraISO,
                data: toBRDate(agoraISO),
                descricao:
                  destinoFinal === "servicos"
                    ? `Receita Serviço (Agenda) - ${ag.nome} (${proxima.numero}ª)`
                    : `Venda (Agenda) - ${ag.nome} (${proxima.numero}ª)`,
                valor: Number(proxima.valor || 0),
                valorNumber: Number(proxima.valor || 0),
                tipo: destinoFinal === "servicos" ? "servico" : "venda",
                meiBucket: destinoFinal === "servicos" ? "servicos" : "vendas",
                origem: "agenda_clientes",
                cliente: ag.nome,
                clienteNome: ag.nome, // ajuda a ReceitaServicos/Vendas a listar melhor
              };

              // lança UMA vez só, no destino correto
              await lancarPagamentoNoDestino(destinoFinal, payload);

              // marca parcela como paga + lançada
              const novasParcelas = parcelas.map((p) =>
                String(p.id) === String(proxima.id)
                  ? {
                      ...p,
                      pago: true,
                      pagoEm: agoraISO,
                      lancado: true,
                      lancadoEm: agoraISO,
                    }
                  : p,
              );

              // salva agenda atualizada
              const novoAg = { ...ag, parcelasDetalhe: novasParcelas };
              const novaLista = [...listaAtual];
              novaLista[idx] = novoAg;

              await salvarItens(
                novaLista.sort(
                  (a, b) => new Date(a.quandoISO) - new Date(b.quandoISO),
                ),
              );

              Alert.alert(
                "Sucesso ✅",
                `Parcela baixada e registrada em ${
                  destinoFinal === "servicos" ? "Receita de Serviços" : "Vendas"
                }.`,
              );
            },
          },
        ],
      );
    } catch (e) {
      console.log("[Agenda] erro ao baixar parcela:", e);
      Alert.alert(
        "Erro",
        `Não foi possível baixar.\n\n${String(e?.message || e)}`,
      );
    }
  };

  // ======= SALVAR / ATUALIZAR EVENTO =======
  const onSalvar = async () => {
    try {
      if (!nome.trim())
        return Alert.alert("Atenção", "Informe o nome do cliente.");
      if (!dataDate || !horaDate)
        return Alert.alert("Atenção", "Informe data e hora do evento.");

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

      const isEdit = route?.params?.mode === "edit";
      const editId = String(route?.params?.agendamentoId || "");

      const listaAtual = await loadAgenda();
      const antigo = isEdit
        ? (Array.isArray(listaAtual) ? listaAtual : []).find(
            (x) => String(x.id) === String(editId),
          )
        : null;

      const quandoISO = quando.toISOString();
      const mudouValor = isEdit
        ? Number(antigo?.valor || 0) !== Number(valor || 0)
        : true;
      const mudouQtd = isEdit
        ? Number(antigo?.parcelas || 1) !== Number(parcelas || 1)
        : true;
      const mudouQuando = isEdit
        ? String(antigo?.quandoISO || "") !== quandoISO
        : true;

      let parcelasDetalhe = gerarParcelasDetalhe(valor, parcelas, quandoISO);
      if (
        isEdit &&
        antigo?.parcelasDetalhe &&
        Array.isArray(antigo.parcelasDetalhe) &&
        !mudouValor &&
        !mudouQtd &&
        !mudouQuando
      ) {
        parcelasDetalhe = antigo.parcelasDetalhe;
      }

      const base = {
        id: isEdit ? String(antigo?.id || editId) : Date.now().toString(),
        nome: nome.trim(),
        endereco: endereco.trim(),
        telefone: onlyDigits(telefone),
        descricao: descricao.trim(),
        quandoISO,
        valor,
        parcelas,
        lembreteAtivo: lembrar,
        destinoReceita: destinoReceita === "servicos" ? "servicos" : "vendas",
        notifIds: Array.isArray(antigo?.notifIds) ? antigo.notifIds : [],
        criadoEm: isEdit
          ? antigo?.criadoEm || new Date().toISOString()
          : new Date().toISOString(),
        editadoEm: isEdit ? new Date().toISOString() : undefined,
        parcelasDetalhe,
      };

      // 1) salva evento
      let novoArr = [];
      if (isEdit) {
        novoArr = (Array.isArray(listaAtual) ? listaAtual : []).map((x) =>
          String(x.id) === String(base.id) ? { ...x, ...base } : x,
        );
      } else {
        novoArr = [...(Array.isArray(listaAtual) ? listaAtual : []), base];
      }

      novoArr = novoArr.sort(
        (a, b) => new Date(a.quandoISO) - new Date(b.quandoISO),
      );
      await salvarItens(novoArr);

      // 2) resolve notificações sem quebrar salvamento
      let notifIdsFinal = Array.isArray(base.notifIds) ? base.notifIds : [];

      if (!lembrar) {
        if (isEdit && antigo?.notifIds?.length)
          await cancelNotifIds(antigo.notifIds);
        notifIdsFinal = [];
      } else {
        const { ids } = await scheduleReminders(
          quando,
          base.nome,
          base.descricao,
        );
        if (Array.isArray(ids) && ids.length > 0) {
          if (isEdit && antigo?.notifIds?.length)
            await cancelNotifIds(antigo.notifIds);
          notifIdsFinal = ids;
        } else {
          notifIdsFinal = Array.isArray(antigo?.notifIds)
            ? antigo.notifIds
            : [];
        }
      }

      const precisaAtualizarNotif =
        JSON.stringify(notifIdsFinal || []) !==
        JSON.stringify(base.notifIds || []);

      if (precisaAtualizarNotif) {
        const lista3 = (novoArr || []).map((x) =>
          String(x.id) === String(base.id)
            ? { ...x, notifIds: notifIdsFinal }
            : x,
        );
        await salvarItens(lista3);
      }

      if (isEdit) {
        Keyboard.dismiss();
        return Alert.alert("Sucesso", "Evento atualizado.", [
          { text: "OK", onPress: () => navigation.goBack() },
        ]);
      }

      if (!filtroNome) setNome("");
      setEndereco("");
      setTelefone("");
      setDescricao("");
      setDataDate(null);
      setHoraDate(null);
      setValorStr("R$ 0,00");
      setQtdParcelas("");
      setLembrar(true);
      setDestinoReceita("vendas");
      Keyboard.dismiss();

      Alert.alert("Sucesso", "Evento salvo.");
    } catch (e) {
      console.log("Erro ao salvar evento:", e);
      Alert.alert(
        "Erro",
        `Não foi possível salvar o evento.\n\n${String(e?.message || e)}`,
      );
    }
  };

  // ======= WHATSAPP =======
  const enviarWhats = async (item) => {
    const phone = item.telefone;
    if (!phone) return Alert.alert("Atenção", "Telefone não informado.");
    const msg = `Olá, ${item.nome}! Lembrando do nosso evento: ${
      item.descricao || "compromisso"
    } em ${toBRDate(item.quandoISO)} às ${toBRTime(item.quandoISO)}. Até lá!`;
    const url = `whatsapp://send?phone=55${phone}&text=${encodeURIComponent(msg)}`;
    const can = await Linking.canOpenURL(url);
    if (!can)
      return Alert.alert(
        "WhatsApp não encontrado",
        "Instale o WhatsApp ou verifique o número com DDD.",
      );
    Linking.openURL(url);
  };

  const listaFiltrada = useMemo(() => {
    if (!filtroNome) return itens;
    return (itens || []).filter((x) => (x?.nome || "") === filtroNome);
  }, [itens, filtroNome]);

  const renderParcelaLeitura = ({ item }) => {
    const pagoEmTxt =
      item.pago && item.pagoEm ? ` • Pago em ${toBRDate(item.pagoEm)}` : "";

    // se você usa essa flag/texto, mantém:
    const lancadoTxt = item?.lancadoEm ? ` • Lançado` : "";

    return (
      <View style={[styles.parcela, item.pago ? styles.parcelaPago : null]}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={styles.parcelaTxt}>
            {item.numero}ª •{" "}
            {Number(item.valor || 0).toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}{" "}
            • Venc: {toBRDate(item.vencimentoISO)}
          </Text>

          <Text style={styles.parcelaSubTxt}>
            {statusParcela(item)}
            {pagoEmTxt}
            {lancadoTxt}
          </Text>
        </View>

        {/* se não quiser botão aqui, pode remover */}
        {/* exemplo visual "Pago" ou "Aberto" */}
        <View
          style={[
            styles.badgeMini,
            item.pago ? styles.badgeMiniPago : styles.badgeMiniAberto,
          ]}
        >
          <Text
            style={[
              styles.badgeMiniTxt,
              item.pago ? styles.badgeMiniTxtPago : null,
            ]}
          >
            {item.pago ? "Pago" : "Aberto"}
          </Text>
        </View>
      </View>
    );
  };

  const renderItem = ({ item }) => {
    const todasPagas = (item.parcelasDetalhe || []).every((p) => p.pago);

    return (
      <View style={[styles.card, todasPagas ? styles.cardPago : null]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitulo}>{item.nome}</Text>
          {todasPagas ? <Text style={styles.badgePago}>Pago</Text> : null}
        </View>

        <Text style={styles.cardLinha}>{item.endereco}</Text>
        <Text style={styles.cardLinha}>📞 {item.telefone || "-"}</Text>
        <Text style={styles.cardLinha}>
          🗓 {toBRDate(item.quandoISO)} • ⏰ {toBRTime(item.quandoISO)}
        </Text>
        <Text style={styles.cardLinha}>📝 {item.descricao || "-"}</Text>
        <Text style={styles.cardLinha}>
          💰{" "}
          {Number(item.valor || 0).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}{" "}
          • {item.parcelas}x
        </Text>
        <Text style={styles.cardLinha}>
          📌 Destino:{" "}
          <Text style={{ fontWeight: "700" }}>
            {item.destinoReceita === "servicos"
              ? "Receita de Serviços"
              : "Vendas"}
          </Text>
        </Text>

        <FlatList
          data={item.parcelasDetalhe || []}
          keyExtractor={(p) => String(p.id)}
          renderItem={renderParcelaLeitura}
          scrollEnabled={false}
          contentContainerStyle={{ marginTop: 8 }}
        />

        <View style={styles.rowActions}>
          <TouchableOpacity
            style={[styles.btn, styles.btnWhats]}
            onPress={() => enviarWhats(item)}
          >
            <Text style={styles.btnText}>Enviar WhatsApp</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.btnBaixar]}
            onPress={() => baixarProximaParcela(item)}
          >
            <Text style={styles.btnText}>Baixar próxima</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {filtroNome ? (
        <Text style={styles.titulo}>
          Novo agendamento para:{" "}
          <Text style={{ fontWeight: "bold" }}>{filtroNome}</Text>
        </Text>
      ) : (
        <Text style={styles.titulo}>Novo Agendamento</Text>
      )}

      <TextInput
        placeholder="Nome do cliente"
        value={nome}
        onChangeText={setNome}
        style={styles.input}
      />
      <TextInput
        placeholder="Endereço"
        value={endereco}
        onChangeText={setEndereco}
        style={styles.input}
      />
      <TextInput
        placeholder="Telefone (apenas números)"
        value={telefone}
        onChangeText={(t) => setTelefone(onlyDigits(t))}
        keyboardType="number-pad"
        style={styles.input}
        maxLength={15}
      />
      <TextInput
        placeholder="Descrição do evento"
        value={descricao}
        onChangeText={setDescricao}
        style={styles.input}
      />

      {/* pickers */}
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.input, styles.inputHalf]}
          onPress={() => setShowDatePicker(true)}
        >
          <Text style={styles.placeholderLike}>
            {dataDate ? toBRDate(dataDate) : "Selecionar data do evento"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.input, styles.inputHalf]}
          onPress={() => setShowTimePicker(true)}
        >
          <Text style={styles.placeholderLike}>
            {horaDate
              ? toBRTime(horaDate).slice(0, 5)
              : "Selecionar hora do evento"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* DATE PICKER */}
      {showDatePicker &&
        (isIOS ? (
          <Modal
            transparent
            animationType="fade"
            onRequestClose={() => setShowDatePicker(false)}
          >
            <View style={styles.modalBackdrop}>
              <View style={styles.modalSheet}>
                <Text style={styles.modalTitle}>Escolher data</Text>
                <DateTimePicker
                  value={dataDate || new Date()}
                  mode="date"
                  display={iosSupportsInline ? "inline" : "compact"}
                  onChange={(_, selected) => {
                    if (selected) setDataDate(selected);
                  }}
                  style={{ alignSelf: "stretch" }}
                />
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.btnModal, styles.btnCancel]}
                    onPress={() => setShowDatePicker(false)}
                  >
                    <Text style={styles.btnModalTxtCancel}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnModal, styles.btnOk]}
                    onPress={() => setShowDatePicker(false)}
                  >
                    <Text style={styles.btnModalTxtOk}>OK</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            value={dataDate || new Date()}
            mode="date"
            display="calendar"
            onChange={(_, selected) => {
              setShowDatePicker(false);
              if (selected) setDataDate(selected);
            }}
          />
        ))}

      {/* TIME PICKER */}
      {showTimePicker &&
        (isIOS ? (
          <Modal
            transparent
            animationType="fade"
            onRequestClose={() => setShowTimePicker(false)}
          >
            <View style={styles.modalBackdrop}>
              <View style={styles.modalSheet}>
                <Text style={styles.modalTitle}>Escolher hora</Text>
                <DateTimePicker
                  value={horaDate || new Date()}
                  mode="time"
                  is24Hour
                  display="spinner"
                  onChange={(_, selected) => {
                    if (selected) setHoraDate(selected);
                  }}
                  style={{ alignSelf: "stretch" }}
                />
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.btnModal, styles.btnCancel]}
                    onPress={() => setShowTimePicker(false)}
                  >
                    <Text style={styles.btnModalTxtCancel}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnModal, styles.btnOk]}
                    onPress={() => setShowTimePicker(false)}
                  >
                    <Text style={styles.btnModalTxtOk}>OK</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            value={horaDate || new Date()}
            mode="time"
            is24Hour
            display="clock"
            onChange={(_, selected) => {
              setShowTimePicker(false);
              if (selected) setHoraDate(selected);
            }}
          />
        ))}

      <View style={styles.row}>
        <TextInput
          placeholder="Valor do evento"
          value={valorStr}
          onChangeText={(t) => setValorStr(formatCurrencyTyping(t))}
          keyboardType="numeric"
          style={[styles.input, styles.inputHalf, styles.inputSlim]} // 👈 aqui
        />

        <TextInput
          placeholder="Quant. de parcelas (1)"
          value={qtdParcelas}
          onChangeText={(t) => setQtdParcelas(onlyDigits(t))}
          keyboardType="number-pad"
          placeholderTextColor="#999"
          style={[styles.input, styles.inputHalf, styles.inputSlim]}
          maxLength={3}
          returnKeyType="done"
        />
      </View>

      <TouchableOpacity
        onPress={() => setLembrar(!lembrar)}
        style={[styles.toggle, lembrar ? styles.toggleOn : styles.toggleOff]}
      >
        <Text style={styles.toggleText}>
          {lembrar
            ? "Lembrete ativado (24h e 1h antes)"
            : "Lembrete desativado"}
        </Text>
      </TouchableOpacity>

      {/* ✅ destino do pagamento */}
      <View style={styles.row}>
        <TouchableOpacity
          onPress={() => setDestinoReceita("vendas")}
          style={[
            styles.destBtn,
            styles.destBtnSlim, // 👈 aqui
            destinoReceita === "vendas" ? styles.destBtnOn : styles.destBtnOff,
          ]}
        >
          <Text style={styles.destTxt}>Entrada em Vendas</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setDestinoReceita("servicos")}
          style={[
            styles.destBtn,
            styles.destBtnSlim, // 👈 aqui
            destinoReceita === "servicos"
              ? styles.destBtnOn
              : styles.destBtnOff,
          ]}
        >
          <Text style={styles.destTxt}>Em Receita de Serviços</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.btnSalvar} onPress={onSalvar}>
        <Text style={styles.btnSalvarTxt}>Salvar evento</Text>
      </TouchableOpacity>

      <FlatList
        data={listaFiltrada}
        keyExtractor={(it) => String(it.id)}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListHeaderComponent={
          <Text style={{ marginTop: 14, fontWeight: "700" }}>
            {filtroNome
              ? "Agendamentos do cliente (leitura + baixa)"
              : "Todos os agendamentos (leitura + baixa)"}
          </Text>
        }
        ListEmptyComponent={
          <Text style={{ textAlign: "center", color: "#777", marginTop: 16 }}>
            Nenhum evento cadastrado.
          </Text>
        }
        style={{ marginTop: 8 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  titulo: { fontSize: 18, textAlign: "center", marginBottom: 8 },
  // ✅ força ficar mais fino (altura controlada)
  inputSlim: {
    paddingVertical: 6,
    height: 44, // 👈 controla a altura do R$
    textAlignVertical: "center",
  },

  parcelasCardSlim: {
    paddingVertical: 6, // 👈 reduz o card inteiro
  },

  parcelasLabelSlim: {
    marginBottom: 4, // 👈 diminui espaço do título
  },

  parcelasInputSlim: {
    paddingVertical: 6,
    height: 40, // 👈 controla a altura do input das parcelas
    textAlignVertical: "center",
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

  btnSalvar: {
    backgroundColor: "#bfa140",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },
  btnSalvarTxt: { color: "#fff", fontWeight: "bold", fontSize: 16 },

  // ✅ destino (corrigido: fora do parcelasCard!)
  destBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
    borderWidth: 1,
  },
  destBtnOn: {
    backgroundColor: "#e7f0ff",
    borderColor: "#3b82f6",
  },
  destBtnOff: {
    backgroundColor: "#f6f6f6",
    borderColor: "#ddd",
  },
  destTxt: { fontWeight: "700", color: "#111" },

  card: {
    borderWidth: 1,
    borderColor: "#eee",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    marginTop: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  parcelasCard: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 6, // 👈 mais fino
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },

  parcelasLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#666",
    marginBottom: 2, // 👈 menos espaço
  },

  // ✅ aqui é o “pulo do gato”: remove a segunda caixa
  parcelasInputSlim: {
    borderWidth: 0, // 👈 tira a borda interna
    backgroundColor: "transparent",
    paddingVertical: 0, // 👈 tira altura extra
    paddingHorizontal: 0,
    height: 22, // 👈 controla altura
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
    textAlignVertical: "center",
  },
  parcelasLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#666",
    marginBottom: 6,
  },

  parcelasInput: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#eee",
    backgroundColor: "#fff",
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
  },

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
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  cardTitulo: { fontSize: 16, fontWeight: "700" },
  cardLinha: { color: "#333", marginTop: 2 },

  parcela: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
  },
  parcelaPago: { backgroundColor: "#f2fbf2", borderColor: "#cfe7cf" },
  parcelaTxt: { color: "#333", fontWeight: "600" },
  parcelaSubTxt: { color: "#555", fontSize: 12, marginTop: 2 },

  rowActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  btn: { flex: 1, padding: 12, borderRadius: 12, alignItems: "center" },
  btnWhats: { backgroundColor: "#25D366" },
  btnBaixar: { backgroundColor: "#3b82f6" },
  btnText: { color: "#fff", fontWeight: "700" },

  // modais iOS
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalSheet: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    width: "90%",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 12,
  },
  btnModal: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  btnCancel: { backgroundColor: "#eee" },
  btnOk: { backgroundColor: "#3b82f6" },
  btnModalTxtCancel: { color: "#111", fontWeight: "600" },
  btnModalTxtOk: { color: "#fff", fontWeight: "700" },
});
