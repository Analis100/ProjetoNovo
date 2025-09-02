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
  Modal, // ✅ necessário para iOS
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Notifications from "expo-notifications";

// Helpers de plataforma
const isIOS = Platform.OS === "ios";
const iosSupportsInline =
  isIOS &&
  (() => {
    const v = String(Platform.Version || "");
    const major = parseInt(v.split(".")[0] || "14", 10);
    return major >= 14;
  })();

const AGENDA_KEY = "agenda_clientes";

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

// helpers p/ status
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

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function ClientesAgenda({ route }) {
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
  const [qtdParcelas, setQtdParcelas] = useState(""); // ✅ vazio; placeholder mostra "1"
  const [lembrar, setLembrar] = useState(true);

  const [itens, setItens] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(AGENDA_KEY);
        setItens(raw ? JSON.parse(raw) : []);
      } catch {
        setItens([]);
      }
    })();
  }, []);

  const salvarItens = async (arr) => {
    setItens(arr);
    await AsyncStorage.setItem(AGENDA_KEY, JSON.stringify(arr));
  };

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

  const onSalvar = async () => {
    try {
      if (!nome.trim())
        return Alert.alert("Atenção", "Informe o nome do cliente.");
      if (!dataDate || !horaDate)
        return Alert.alert("Atenção", "Informe data e hora do evento.");
      const valor = parseCurrency(valorStr);
      const parcelas = Math.max(1, parseInt(qtdParcelas || "1", 10)); // ✅ vazio vira 1

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
        nome: nome.trim(),
        endereco: endereco.trim(),
        telefone: onlyDigits(telefone),
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

      if (!filtroNome) setNome("");
      setEndereco("");
      setTelefone("");
      setDescricao("");
      setDataDate(null);
      setHoraDate(null);
      setValorStr("R$ 0,00");
      setQtdParcelas(""); // ✅ volta a vazio
      setLembrar(true);
      Keyboard.dismiss();

      Alert.alert("Sucesso", "Evento salvo.");
    } catch {
      Alert.alert("Erro", "Não foi possível salvar o evento.");
    }
  };

  const enviarWhats = async (item) => {
    const phone = item.telefone;
    if (!phone) return Alert.alert("Atenção", "Telefone não informado.");
    const msg = `Olá, ${item.nome}! Lembrando do nosso evento: ${
      item.descricao || "compromisso"
    } em ${toBRDate(item.quandoISO)} às ${toBRTime(item.quandoISO)}. Até lá!`;
    const url = `whatsapp://send?phone=55${phone}&text=${encodeURIComponent(
      msg
    )}`;
    const can = await Linking.canOpenURL(url);
    if (!can)
      return Alert.alert(
        "WhatsApp não encontrado",
        "Instale o WhatsApp ou verifique o número com DDD."
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
    return (
      <View style={[styles.parcela, item.pago ? styles.parcelaPago : null]}>
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
          {item.valor.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}{" "}
          • {item.parcelas}x
        </Text>

        <FlatList
          data={item.parcelasDetalhe || []}
          keyExtractor={(p) => p.id}
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
          keyboardType="default"
          style={[styles.input, styles.inputHalf]}
        />
        <TextInput
          style={styles.input}
          placeholder="1" // 👈 apenas exemplo
          placeholderTextColor="#999"
          value={qtdParcelas}
          onChangeText={(t) => setQtdParcelas(onlyDigits(t))}
          keyboardType="number-pad"
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

      <TouchableOpacity style={styles.btnSalvar} onPress={onSalvar}>
        <Text style={styles.btnSalvarTxt}>Salvar evento</Text>
      </TouchableOpacity>

      <FlatList
        data={listaFiltrada}
        keyExtractor={(it) => it.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListHeaderComponent={
          <Text style={{ marginTop: 14, fontWeight: "700" }}>
            {filtroNome
              ? "Agendamentos do cliente (somente leitura)"
              : "Todos os agendamentos (somente leitura)"}
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
  btnText: { color: "#fff", fontWeight: "700" },
});
