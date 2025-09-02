// screens/Tarefas.js
import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  Platform,
  Modal,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";

const KEY = "agenda_tarefas";
const CONC_KEY = "@tarefas_concluidas";

const toBRDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
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
  const dd = new Date(date);
  return new Date(dd.getFullYear(), dd.getMonth(), dd.getDate());
};
const diffDias = (a, b) => {
  const ms = 24 * 60 * 60 * 1000;
  return Math.floor((stripTime(a) - stripTime(b)) / ms);
};

export default function Tarefas() {
  const [tarefas, setTarefas] = useState([]);
  const [concluidas, setConcluidas] = useState([]);
  const [aba, setAba] = useState("abertas");

  // Modal de criação
  const [showModal, setShowModal] = useState(false);

  // formulário
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [inicioData, setInicioData] = useState(null);
  const [inicioHora, setInicioHora] = useState(null);
  const [vencimento, setVencimento] = useState(null);

  // flags dos pickers
  const [showInicioDate, setShowInicioDate] = useState(false);
  const [showInicioTime, setShowInicioTime] = useState(false);
  const [showDate, setShowDate] = useState(false);

  useEffect(() => {
    (async () => {
      const [rawAbertas, rawConc] = await Promise.all([
        AsyncStorage.getItem(KEY),
        AsyncStorage.getItem(CONC_KEY),
      ]);
      setTarefas(rawAbertas ? JSON.parse(rawAbertas) : []);
      setConcluidas(rawConc ? JSON.parse(rawConc) : []);
    })();
  }, []);

  const salvarAbertas = async (arr) => {
    setTarefas(arr);
    await AsyncStorage.setItem(KEY, JSON.stringify(arr));
  };
  const salvarConcluidas = async (arr) => {
    setConcluidas(arr);
    await AsyncStorage.setItem(CONC_KEY, JSON.stringify(arr));
  };

  const ordenarAbertas = (arr) => {
    const copy = [...arr];
    copy.sort((a, b) => {
      const ai = a.inicioISO ? new Date(a.inicioISO).getTime() : null;
      const bi = b.inicioISO ? new Date(b.inicioISO).getTime() : null;
      if (ai && bi) return ai - bi;
      if (ai) return -1;
      if (bi) return 1;
      // sem data de início → mais novo primeiro
      return new Date(b.criadoEm) - new Date(a.criadoEm);
    });
    return copy;
  };

  const combinarInicioISO = () => {
    if (!inicioData) return null;
    const base = new Date(inicioData);
    if (inicioHora) {
      const h = new Date(inicioHora);
      base.setHours(h.getHours(), h.getMinutes(), 0, 0);
    } else {
      base.setHours(0, 0, 0, 0);
    }
    return base.toISOString();
  };

  const add = async () => {
    const t = (titulo || "").trim();
    if (!t) return Alert.alert("Atenção", "Informe um título.");

    const novo = {
      id: Date.now().toString(),
      titulo: t,
      descricao: (descricao || "").trim() || null,
      observacoes: (observacoes || "").trim() || null,
      inicioISO: combinarInicioISO(),
      vencimentoISO: vencimento ? vencimento.toISOString() : null,
      criadoEm: new Date().toISOString(),
    };
    const arr = ordenarAbertas([novo, ...tarefas]);
    await salvarAbertas(arr);

    // reset e fecha modal
    setTitulo("");
    setDescricao("");
    setObservacoes("");
    setInicioData(null);
    setInicioHora(null);
    setVencimento(null);
    setShowModal(false);
    setAba("abertas");
  };

  const concluir = async (item) => {
    const agora = new Date().toISOString();
    const registro = { ...item, concluidoEm: agora };
    await salvarConcluidas([...(concluidas || []), registro]);
    await salvarAbertas((tarefas || []).filter((t) => t.id !== item.id));
    setAba("concluidas");
  };

  const remove = async (id) => {
    Alert.alert("Excluir", "Remover esta tarefa?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover",
        style: "destructive",
        onPress: async () => {
          await salvarAbertas((tarefas || []).filter((t) => t.id !== id));
        },
      },
    ]);
  };

  const limparConcluidas = async () => {
    await salvarConcluidas([]);
  };

  const RenderAberta = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.title}>{item.titulo}</Text>
      {!!item.descricao && <Text style={styles.sub}>📝 {item.descricao}</Text>}
      {!!item.observacoes && (
        <Text style={styles.sub}>📎 {item.observacoes}</Text>
      )}
      <Text style={styles.sub}>
        ▶️{" "}
        {item.inicioISO
          ? `${toBRDate(item.inicioISO)} ${toBRTime(item.inicioISO)}`
          : "Sem início"}
      </Text>
      <Text style={styles.sub}>
        🗓 {item.vencimentoISO ? toBRDate(item.vencimentoISO) : "Sem vencimento"}
      </Text>
      <View style={styles.rowBetween}>
        <TouchableOpacity
          style={[styles.btn, styles.btnOk]}
          onPress={() => concluir(item)}
        >
          <Text style={styles.btnTxt}>Concluir</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnDanger]}
          onPress={() => remove(item.id)}
        >
          <Text style={styles.btnTxt}>Excluir</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const RenderConcluida = ({ item }) => (
    <View style={[styles.card, styles.cardConcluida]}>
      <Text style={styles.title}>✓ {item.titulo}</Text>
      {!!item.descricao && <Text style={styles.sub}>📝 {item.descricao}</Text>}
      {!!item.observacoes && (
        <Text style={styles.sub}>📎 {item.observacoes}</Text>
      )}
      <Text style={styles.sub}>
        ▶️{" "}
        {item.inicioISO
          ? `${toBRDate(item.inicioISO)} ${toBRTime(item.inicioISO)}`
          : "Sem início"}
      </Text>
      <Text style={styles.sub}>
        🗓 {item.vencimentoISO ? toBRDate(item.vencimentoISO) : "Sem vencimento"}
      </Text>
      <Text style={[styles.sub, { color: "#166534" }]}>
        Finalizada em {toBRDate(item.concluidoEm)} {toBRTime(item.concluidoEm)}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Tarefas</Text>

      {/* Abas */}
      <View style={[styles.row, { justifyContent: "center", marginBottom: 8 }]}>
        {[
          { k: "abertas", label: "Abertas" },
          { k: "concluidas", label: `Concluídas (${concluidas.length})` },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.k}
            onPress={() => setAba(tab.k)}
            style={[styles.pill, aba === tab.k && styles.pillActive]}
            activeOpacity={0.85}
          >
            <Text
              style={[styles.pillTxt, aba === tab.k && styles.pillTxtActive]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {aba === "concluidas" && concluidas.length > 0 && (
        <TouchableOpacity
          style={[styles.btn, styles.btnDanger, { marginHorizontal: 16 }]}
          onPress={limparConcluidas}
        >
          <Text style={styles.btnTxt}>Limpar concluídas</Text>
        </TouchableOpacity>
      )}

      {/* Lista */}
      <FlatList
        data={aba === "abertas" ? ordenarAbertas(tarefas) : concluidas}
        keyExtractor={(it) => it.id}
        renderItem={aba === "abertas" ? RenderAberta : RenderConcluida}
        contentContainerStyle={{ paddingBottom: 90 }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {aba === "abertas"
              ? "Nenhuma tarefa aberta."
              : "Nenhuma tarefa concluída."}
          </Text>
        }
      />

      {/* FAB */}
      {aba === "abertas" && (
        <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)}>
          <Text style={styles.fabTxt}>+ Nova Tarefa</Text>
        </TouchableOpacity>
      )}

      {/* Modal de cadastro */}
      <Modal
        visible={showModal}
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <ScrollView style={{ flex: 1, padding: 16, backgroundColor: "#fff" }}>
          <Text style={styles.header}>Nova Tarefa</Text>

          <TextInput
            style={styles.input}
            placeholder="Título da tarefa"
            value={titulo}
            onChangeText={setTitulo}
          />
          <TextInput
            style={[styles.input, { height: 70 }]}
            placeholder="Descrição da tarefa"
            value={descricao}
            onChangeText={setDescricao}
            multiline
          />
          <TextInput
            style={[styles.input, { height: 70 }]}
            placeholder="Observações"
            value={observacoes}
            onChangeText={setObservacoes}
            multiline
          />

          <TouchableOpacity
            style={styles.input}
            onPress={() => setShowInicioDate(true)}
          >
            <Text style={{ color: inicioData ? "#333" : "#999" }}>
              {inicioData
                ? `Data de início: ${toBRDate(inicioData)}`
                : "Data de início"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.input}
            onPress={() => setShowInicioTime(true)}
          >
            <Text style={{ color: inicioHora ? "#333" : "#999" }}>
              {inicioHora
                ? `Hora de início: ${toBRTime(inicioHora)}`
                : "Hora de início"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.input}
            onPress={() => setShowDate(true)}
          >
            <Text style={{ color: vencimento ? "#333" : "#999" }}>
              {vencimento
                ? `Vencimento: ${toBRDate(vencimento)}`
                : "Definir vencimento (opcional)"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.btnOk, { marginTop: 12 }]}
            onPress={add}
          >
            <Text style={styles.btnTxt}>Salvar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnDanger, { marginTop: 8 }]}
            onPress={() => setShowModal(false)}
          >
            <Text style={styles.btnTxt}>Cancelar</Text>
          </TouchableOpacity>
        </ScrollView>
      </Modal>

      {/* ===== Pickers (fora do modal para garantir que abram no Android) ===== */}
      {showInicioDate &&
        (Platform.OS === "ios" ? (
          <Modal transparent onRequestClose={() => setShowInicioDate(false)}>
            <View style={styles.backdrop}>
              <View style={styles.sheet}>
                <DateTimePicker
                  mode="date"
                  value={inicioData || new Date()}
                  onChange={(_, d) => d && setInicioData(d)}
                  display="inline"
                  style={{ alignSelf: "stretch" }}
                />
                <TouchableOpacity
                  style={[styles.btn, styles.btnOk]}
                  onPress={() => setShowInicioDate(false)}
                >
                  <Text style={styles.btnTxt}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            mode="date"
            value={inicioData || new Date()}
            onChange={(_, d) => {
              setShowInicioDate(false);
              if (d) setInicioData(d);
            }}
          />
        ))}

      {showInicioTime &&
        (Platform.OS === "ios" ? (
          <Modal transparent onRequestClose={() => setShowInicioTime(false)}>
            <View style={styles.backdrop}>
              <View style={styles.sheet}>
                <DateTimePicker
                  mode="time"
                  value={inicioHora || new Date()}
                  onChange={(_, d) => d && setInicioHora(d)}
                  display="spinner"
                  style={{ alignSelf: "stretch" }}
                />
                <TouchableOpacity
                  style={[styles.btn, styles.btnOk]}
                  onPress={() => setShowInicioTime(false)}
                >
                  <Text style={styles.btnTxt}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            mode="time"
            value={inicioHora || new Date()}
            onChange={(_, d) => {
              setShowInicioTime(false);
              if (d) setInicioHora(d);
            }}
          />
        ))}

      {showDate &&
        (Platform.OS === "ios" ? (
          <Modal transparent onRequestClose={() => setShowDate(false)}>
            <View style={styles.backdrop}>
              <View style={styles.sheet}>
                <DateTimePicker
                  mode="date"
                  value={vencimento || new Date()}
                  onChange={(_, d) => d && setVencimento(d)}
                  display="inline"
                  style={{ alignSelf: "stretch" }}
                />
                <TouchableOpacity
                  style={[styles.btn, styles.btnOk]}
                  onPress={() => setShowDate(false)}
                >
                  <Text style={styles.btnTxt}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            mode="date"
            value={vencimento || new Date()}
            onChange={(_, d) => {
              setShowDate(false);
              if (d) setVencimento(d);
            }}
          />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    color: "#bfa140",
    marginVertical: 10,
  },
  pill: {
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    marginHorizontal: 4,
    backgroundColor: "#fff",
  },
  pillActive: { backgroundColor: "#bfa14022", borderColor: "#bfa140" },
  pillTxt: { color: "#444" },
  pillTxtActive: { color: "#bfa140", fontWeight: "700" },

  card: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: "#fff",
  },
  cardConcluida: { backgroundColor: "#f8fff5", borderColor: "#cce3cc" },
  title: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  sub: { color: "#444", marginTop: 2 },

  row: { flexDirection: "row", gap: 8, marginTop: 8 },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },

  btn: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  btnOk: { backgroundColor: "#0d6efd" },
  btnDanger: { backgroundColor: "#dc3545" },
  btnTxt: { color: "#fff", fontWeight: "700" },

  fab: {
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: "#0d6efd",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    elevation: 4,
  },
  fabTxt: { color: "#fff", fontWeight: "800", fontSize: 16 },

  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#fff",
    marginTop: 8,
  },

  // iOS sheet dos pickers
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
  },
  sheet: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    width: "85%",
    alignItems: "stretch",
  },

  empty: { textAlign: "center", marginTop: 16, color: "#777" },
});
