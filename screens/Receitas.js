// screens/Receitas.js
import React, { useState, useEffect, useMemo } from "react";
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
import { useNavigation } from "@react-navigation/native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { addSaleToCollaborator } from "./services/colabSales";

/** =========================
 *  Loader SEGURO do sync (um caminho só) – escopo de módulo
 *  ========================= */
let cachedSyncAdicionar = null;
async function resolveSyncAdicionar() {
  if (cachedSyncAdicionar !== null) return cachedSyncAdicionar;
  try {
    // o arquivo está em screens/services/sync.js
    const m = await import("./services/sync");
    return (cachedSyncAdicionar =
      typeof m?.syncAdicionar === "function" ? m.syncAdicionar : null);
  } catch {
    return (cachedSyncAdicionar = null);
  }
}
const syncAdicionarSafe = async (...args) => {
  try {
    const fn = await resolveSyncAdicionar();
    if (fn) return await fn(...args);
  } catch {}
  return null;
};

/* ===== Helpers de moeda ===== */
const maskBRL = (texto) => {
  const digits = (texto || "").replace(/\D/g, "");
  const n = parseInt(digits || "0", 10);
  const v = n / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};
const parseBRL = (masked) => {
  if (!masked) return 0;
  const digits = masked.replace(/\D/g, "");
  const n = parseInt(digits || "0", 10);
  return n / 100; // retorna em reais
};

/* ===== Helpers de data ===== */
const ptBR = (d) =>
  new Date(d).toLocaleDateString("pt-BR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

const parsePtBrDate = (s) => {
  // "dd/mm/yyyy" -> Date
  try {
    const [dd, mm, yyyy] = (s || "").split("/");
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  } catch {
    return new Date();
  }
};

const getItemDate = (item) => {
  if (item?.dataISO) return new Date(item.dataISO);
  if (item?.data) return parsePtBrDate(item.data);
  return new Date();
};

const isSameDay = (d1, d2) =>
  d1.getFullYear() === d2.getFullYear() &&
  d1.getMonth() === d2.getMonth() &&
  d1.getDate() === d2.getDate();

const isSameMonth = (d1, d2) =>
  d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth();

const fmtValor = (v) =>
  Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const RECEITAS_KEY = "receitas";
const AGENDA_KEY = "agenda_clientes";

export default function Receitas() {
  const navigation = useNavigation();

  // ===== Estados principais =====
  const [viewMode, setViewMode] = useState("day"); // "day" | "month"
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);

  const [codigo, setCodigo] = useState("");
  const [qtd, setQtd] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState(""); // "R$ 0,00"
  const [receitas, setReceitas] = useState([]);
  const [soma, setSoma] = useState(0);

  // exclusão com senha + confirmação final
  const [modalSenha, setModalSenha] = useState(false);
  const [senhaDigitada, setSenhaDigitada] = useState("");
  const [indiceParaExcluir, setIndiceParaExcluir] = useState(null);

  // colaboradores
  const [colaboradores, setColaboradores] = useState([]);
  const [colabSelecionado, setColabSelecionado] = useState(null); // id
  const [modalColab, setModalColab] = useState(false);

  // resumo mensal por colaborador
  const [resumoMensalColab, setResumoMensalColab] = useState([]);

  // Mapa id -> colaborador (para nome nos itens)
  const colabMap = useMemo(() => {
    const map = {};
    for (const c of colaboradores) map[c.id] = c;
    return map;
  }, [colaboradores]);

  // estamos no período atual (dia ou mês)?
  const isOnCurrentPeriod = useMemo(() => {
    const today = new Date();
    return viewMode === "day"
      ? isSameDay(selectedDate, today)
      : isSameMonth(selectedDate, today);
  }, [selectedDate, viewMode]);

  // carrega colaboradores ativos uma vez
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem("@colaboradores_v2");
        const lista = raw ? JSON.parse(raw) : [];
        const ativos = (lista || []).filter((c) => c.ativo);
        setColaboradores(ativos);
      } catch (e) {}
    })();
  }, []);

  // recarrega sempre que focar ou trocar período
  useEffect(() => {
    const unsub = navigation.addListener("focus", () =>
      carregarReceitas(selectedDate, viewMode)
    );
    carregarReceitas(selectedDate, viewMode);
    return unsub;
  }, [navigation, selectedDate, viewMode]);

  const titulo = useMemo(() => {
    if (viewMode === "day") return `Receitas – ${ptBR(selectedDate)}`;
    const mm = String(selectedDate.getMonth() + 1).padStart(2, "0");
    return `Receitas – ${mm}/${selectedDate.getFullYear()} (mensal)`;
  }, [selectedDate, viewMode]);

  const carregarReceitas = async (refDate = new Date(), mode = "day") => {
    const json = await AsyncStorage.getItem(RECEITAS_KEY);
    const lista = json ? JSON.parse(json) : [];

    const doPeriodo = (Array.isArray(lista) ? lista : []).filter((item) => {
      const d = getItemDate(item);
      return mode === "day" ? isSameDay(d, refDate) : isSameMonth(d, refDate);
    });

    setReceitas(doPeriodo);
    const total = doPeriodo.reduce((a, c) => a + Number(c.valor || 0), 0);
    setSoma(total);

    // atualiza demonstrativo diário apenas no modo dia
    if (mode === "day") {
      await atualizarDemonstrativo(total, ptBR(refDate));
    }

    // monta resumo mensal por colaborador quando em modo mês
    if (mode === "month") {
      const map = {};
      for (const it of doPeriodo) {
        const id = it.colaboradorId || "__sem__";
        map[id] = (map[id] || 0) + Number(it.valor || 0);
      }
      const listaResumo = Object.entries(map)
        .map(([id, total]) => ({
          id,
          nome:
            id === "__sem__"
              ? "— sem colaborador —"
              : colabMap[id]?.nome || "Colaborador",
          total,
        }))
        .sort((a, b) => b.total - a.total);
      setResumoMensalColab(listaResumo);
    } else {
      setResumoMensalColab([]);
    }
  };

  const salvarReceita = async () => {
    Keyboard.dismiss();

    if (!descricao || !valor || !codigo || !qtd) {
      Alert.alert("Erro", "Preencha todos os dados para salvar a receita.");
      return;
    }

    const valorNumerico = parseBRL(valor); // em reais
    const qtdNumerica = parseFloat(qtd);
    if (isNaN(qtdNumerica) || qtdNumerica <= 0) {
      Alert.alert("Erro", "Informe uma quantidade válida.");
      return;
    }
    if (valorNumerico <= 0) {
      Alert.alert("Erro", "Informe um valor maior que zero.");
      return;
    }

    const agoraISO = new Date().toISOString();

    const novaReceita = {
      id: `rc-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      descricao,
      valor: valorNumerico, // guarda em reais
      codigo,
      qtd: qtdNumerica,
      data: ptBR(agoraISO), // compat com legado
      dataISO: agoraISO, // novo padrão
      origem: "manual",
      colaboradorId: colabSelecionado || null,
    };

    // Salva local
    const json = await AsyncStorage.getItem(RECEITAS_KEY);
    const receitasSalvas = json ? JSON.parse(json) : [];
    const novoArr = Array.isArray(receitasSalvas)
      ? [...receitasSalvas, novaReceita]
      : [novaReceita];
    await AsyncStorage.setItem(RECEITAS_KEY, JSON.stringify(novoArr));

    // Indexa venda por colaborador (em CENTAVOS)
    if (colabSelecionado && Number(valorNumerico) > 0) {
      const valorCents = Math.round(Number(valorNumerico) * 100);
      await addSaleToCollaborator(
        colabSelecionado,
        valorCents,
        new Date(agoraISO)
      );
    }

    // Atualiza estoque (baixa)
    await atualizarEstoqueSaida(codigo, qtdNumerica, valorNumerico);

    // Sync opcional
    await syncAdicionarSafe(RECEITAS_KEY, novaReceita);

    // Limpa campos
    setDescricao("");
    setValor("");
    setCodigo("");
    setQtd("");

    // Recarrega conforme período atual
    await carregarReceitas(selectedDate, viewMode);
  };

  const atualizarEstoqueSaida = async (cod, quantidade, valorVenda) => {
    const json = await AsyncStorage.getItem("estoque");
    const lista = json ? JSON.parse(json) : [];
    const idx = lista.findIndex((p) => p.codigo === cod);
    if (idx >= 0) {
      const item = lista[idx];
      item.saida = (Number(item.saida) || 0) + quantidade;
      item.valorTotal = Math.max(
        0,
        (Number(item.valorTotal) || 0) - Number(valorVenda || 0)
      );
      await AsyncStorage.setItem("estoque", JSON.stringify(lista));
    }
  };

  const atualizarEstoqueRetorno = async (cod, quantidade, valorVenda) => {
    const json = await AsyncStorage.getItem("estoque");
    const lista = json ? JSON.parse(json) : [];
    const idx = lista.findIndex((p) => p.codigo === cod);
    if (idx >= 0) {
      const item = lista[idx];
      item.saida = Math.max(0, (Number(item.saida) || 0) - quantidade);
      item.valorTotal =
        (Number(item.valorTotal) || 0) + Number(valorVenda || 0);
      await AsyncStorage.setItem("estoque", JSON.stringify(lista));
    }
  };

  /* ===== helpers de erro visual na lista ===== */
  const marcarErroLinha = (index, flag = true) => {
    setReceitas((prev) => {
      const nova = [...prev];
      if (nova[index]) nova[index] = { ...nova[index], erroSenha: !!flag };
      return nova;
    });
  };
  const limparErroLinha = (index) => marcarErroLinha(index, false);

  /* ===== fluxo de exclusão ===== */
  const confirmarExclusao = (index) => {
    setIndiceParaExcluir(index);
    setSenhaDigitada("");
    setModalSenha(true);
  };

  // chamada ao tocar em "Confirmar" no modal de senha
  const confirmarSenhaParaExcluir = async () => {
    const senhaSalva = await AsyncStorage.getItem("senhaAcesso");
    const senhaOk = senhaDigitada === senhaSalva;

    // fecha modal de senha
    setModalSenha(false);
    setSenhaDigitada("");

    if (!senhaOk) {
      if (indiceParaExcluir !== null) marcarErroLinha(indiceParaExcluir, true);
      return;
    }

    const listaPeriodo = receitas;
    const item = listaPeriodo[indiceParaExcluir];
    if (!item) {
      setIndiceParaExcluir(null);
      return;
    }

    const valorFmt = fmtValor(item.valor);

    const msg =
      `Excluir esta receita?\n\n` +
      (item.codigo ? `Código: ${item.codigo}\n` : "") +
      (item.qtd ? `Qtd: ${item.qtd}\n` : "") +
      `Descrição: ${item.descricao}\n` +
      `Valor: ${valorFmt}\n\n` +
      `Obs.: O estoque só será estornado se for receita manual. ` +
      `Se veio da Agenda, a parcela será reaberta.`;

    Alert.alert("Confirmar exclusão", msg, [
      {
        text: "Cancelar",
        style: "cancel",
        onPress: () => {
          if (indiceParaExcluir !== null) limparErroLinha(indiceParaExcluir);
          setIndiceParaExcluir(null);
        },
      },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          await executarExclusao(indiceParaExcluir);
          if (indiceParaExcluir !== null) limparErroLinha(indiceParaExcluir);
          setIndiceParaExcluir(null);
          Alert.alert("Removido", "Receita excluída.");
        },
      },
    ]);
  };

  // efetiva a remoção dado o índice relativo ao período filtrado
  const executarExclusao = async (indexPeriodo) => {
    const json = await AsyncStorage.getItem(RECEITAS_KEY);
    const lista = json ? JSON.parse(json) : [];

    // descobrir o índice GLOBAL correspondente ao index do período atual
    let indexGlobal = -1;
    let count = -1;
    for (let i = 0; i < (lista?.length || 0); i++) {
      const d = getItemDate(lista[i]);
      const match =
        viewMode === "day"
          ? isSameDay(d, selectedDate)
          : isSameMonth(d, selectedDate);
      if (match) {
        count++;
        if (count === indexPeriodo) {
          indexGlobal = i;
          break;
        }
      }
    }
    if (indexGlobal < 0) return;

    const removida = lista[indexGlobal];

    // Se veio da Agenda → reabre a parcela correspondente
    if (removida?.agendaEventoId && removida?.agendaParcelaId) {
      try {
        const rawAg = await AsyncStorage.getItem(AGENDA_KEY);
        const arrAg = rawAg ? JSON.parse(rawAg) : [];
        const novoAg = Array.isArray(arrAg)
          ? arrAg.map((ev) => {
              if (ev.id !== removida.agendaEventoId) return ev;
              const det = (ev.parcelasDetalhe || []).map((p) =>
                p.id === removida.agendaParcelaId
                  ? { ...p, pago: false, pagoEm: null, receitaId: undefined }
                  : p
              );
              return { ...ev, parcelasDetalhe: det };
            })
          : [];
        await AsyncStorage.setItem(AGENDA_KEY, JSON.stringify(novoAg));
      } catch {}
    }

    // remove da base de receitas
    lista.splice(indexGlobal, 1);
    await AsyncStorage.setItem(RECEITAS_KEY, JSON.stringify(lista));

    // estorno de estoque só para receitas manuais (com código e qtd)
    if (removida?.codigo && removida?.qtd && removida?.origem !== "Agenda") {
      await atualizarEstoqueRetorno(
        removida.codigo,
        Number(removida.qtd || 0),
        Number(removida.valor || 0)
      );
    }

    // estorna do índice mensal do colaborador, se houver
    try {
      if (removida?.colaboradorId && Number(removida?.valor) > 0) {
        await addSaleToCollaborator(
          removida.colaboradorId,
          -Math.round(Number(removida.valor) * 100),
          new Date(removida.dataISO || Date.now())
        );
      }
    } catch {}

    // recarrega período atual
    await carregarReceitas(selectedDate, viewMode);
  };

  const atualizarDemonstrativo = async (totalReceitas, diaPtBr) => {
    const hoje = diaPtBr || ptBR(selectedDate);
    const demoJ = await AsyncStorage.getItem("demonstrativoMensal");
    const demo = demoJ ? JSON.parse(demoJ) : {};
    const dia = demo[hoje] || {
      saldoAnterior: 0,
      receitas: 0,
      despesas: 0,
      saldoFinal: 0,
    };
    dia.receitas = Number(totalReceitas || 0);
    dia.saldoFinal =
      Number(dia.saldoAnterior || 0) +
      Number(dia.receitas || 0) -
      Number(dia.despesas || 0);
    demo[hoje] = dia;
    await AsyncStorage.setItem("demonstrativoMensal", JSON.stringify(demo));
  };

  const renderItem = ({ item, index }) => {
    const seloAgenda = item?.origem === "Agenda";
    const nomeColab = item.colaboradorId
      ? colabMap[item.colaboradorId]?.nome
      : null;
    return (
      <View style={styles.itemLinha}>
        <Text
          style={[
            styles.itemLista,
            item.descricao?.includes("Relação Clientes") && {
              color: "#007BFF",
            },
            seloAgenda && { color: "#6f42c1", fontWeight: "600" },
            item.erroSenha && { color: "red" },
          ]}
        >
          {`${item.codigo ? item.codigo + " • " : ""}${item.descricao}${
            item.qtd ? ` (${item.qtd})` : ""
          } – ${fmtValor(item.valor)}${nomeColab ? ` • ${nomeColab}` : ""}${
            seloAgenda ? "  [Agenda]" : ""
          }`}
        </Text>
        <TouchableOpacity onPress={() => confirmarExclusao(index)}>
          <Text style={styles.excluir}>Excluir</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const totalFooter = useMemo(
    () => <Text style={styles.total}>Total: {fmtValor(soma)}</Text>,
    [soma]
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        {/* TOPO: seletor dia/mês + botão "Filtro por Data" / "Voltar à data atual" */}
        <Text style={styles.titulo}>{titulo}</Text>

        <View style={styles.filtersRow}>
          <View style={styles.segment}>
            <TouchableOpacity
              style={[styles.segBtn, viewMode === "day" && styles.segBtnActive]}
              onPress={() => setViewMode("day")}
            >
              <Text
                style={[
                  styles.segTxt,
                  viewMode === "day" && styles.segTxtActive,
                ]}
              >
                Dia
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.segBtn,
                viewMode === "month" && styles.segBtnActive,
              ]}
              onPress={() => setViewMode("month")}
            >
              <Text
                style={[
                  styles.segTxt,
                  viewMode === "month" && styles.segTxtActive,
                ]}
              >
                Mês
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.dateBtn}
            onPress={() => {
              if (isOnCurrentPeriod) {
                setShowPicker(true); // abre o seletor
              } else {
                setSelectedDate(new Date()); // volta pro hoje/mês atual
                setShowPicker(false);
              }
            }}
          >
            <Text style={styles.dateTxt}>
              {isOnCurrentPeriod ? "Filtro por Data" : "Voltar à data atual"}
            </Text>
          </TouchableOpacity>
        </View>

        {showPicker && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(e, d) => {
              setShowPicker(false);
              if (d) setSelectedDate(d);
            }}
          />
        )}

        {/* FORM */}
        <View style={styles.boxVenda}>
          <TextInput
            style={styles.inputCod}
            placeholder="Código"
            value={codigo}
            onChangeText={setCodigo}
          />
          <TextInput
            style={styles.inputQtd}
            placeholder="Qtd"
            keyboardType="numeric"
            value={qtd}
            onChangeText={setQtd}
          />
        </View>

        <TextInput
          style={styles.input}
          placeholder="Descrição"
          value={descricao}
          onChangeText={setDescricao}
        />

        <TextInput
          style={styles.input}
          placeholder="Valor"
          keyboardType="numeric"
          value={valor}
          onChangeText={(t) => setValor(maskBRL(t))}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
        />

        <Text style={styles.labelInline}>Vendedor (colaborador)</Text>
        <TouchableOpacity
          style={styles.select}
          onPress={() => setModalColab(true)}
        >
          <Text style={styles.selectTxt}>
            {colabSelecionado
              ? colaboradores.find((c) => c.id === colabSelecionado)?.nome ||
                "Selecionado"
              : "Selecionar..."}
          </Text>
        </TouchableOpacity>

        {/* Modal de seleção de colaborador */}
        <Modal visible={modalColab} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalList}>
              <Text style={styles.modalTitle}>Escolha o colaborador</Text>
              <FlatList
                data={colaboradores}
                keyExtractor={(it) => it.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.itemColab}
                    onPress={() => {
                      setColabSelecionado(item.id);
                      setModalColab(false);
                    }}
                  >
                    <Text style={styles.itemColabTxt}>{item.nome}</Text>
                    <Text style={styles.itemColabSub}>{item.funcao || ""}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={{ textAlign: "center", color: "#666" }}>
                    Nenhum ativo
                  </Text>
                }
              />
              <TouchableOpacity
                style={styles.btnFechar}
                onPress={() => setModalColab(false)}
              >
                <Text style={{ color: "#111", fontWeight: "700" }}>Fechar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <TouchableOpacity style={styles.botao} onPress={salvarReceita}>
          <Text style={styles.botaoTexto}>Inserir Receita</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.botao}
          onPress={async () => {
            if (codigo && qtd && valor) {
              await atualizarEstoqueSaida(
                codigo,
                parseFloat(qtd),
                parseBRL(valor)
              );
            }
            navigation.navigate("RelacaoClientes");
          }}
        >
          <Text style={styles.botaoTexto}>Inserir Venda a Prazo</Text>
        </TouchableOpacity>

        {/* LISTA */}
        <FlatList
          data={receitas}
          keyExtractor={(_, i) => i.toString()}
          renderItem={renderItem}
          ListFooterComponent={totalFooter}
        />

        {/* RESUMO MENSAL */}
        {viewMode === "month" && (
          <View style={styles.resumoCard}>
            <Text style={styles.resumoTitulo}>Resumo do mês</Text>
            <Text style={styles.resumoLinha}>
              Total do mês:{" "}
              <Text style={{ fontWeight: "800" }}>{fmtValor(soma)}</Text>
            </Text>
            <Text style={[styles.resumoTitulo, { marginTop: 8 }]}>
              Por colaborador
            </Text>
            {resumoMensalColab.length === 0 ? (
              <Text style={{ color: "#666" }}>Sem lançamentos.</Text>
            ) : (
              resumoMensalColab.map((r) => (
                <View key={r.id} style={styles.resumoRow}>
                  <Text style={{ flex: 1 }}>{r.nome}</Text>
                  <Text style={{ fontWeight: "700" }}>{fmtValor(r.total)}</Text>
                </View>
              ))
            )}
          </View>
        )}
      </View>

      {/* MODAL DE SENHA */}
      <Modal visible={modalSenha} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={{ marginBottom: 6 }}>
              Digite a senha para excluir:
            </Text>
            <TextInput
              secureTextEntry
              style={styles.input}
              value={senhaDigitada}
              onChangeText={setSenhaDigitada}
              placeholder="Senha"
              autoFocus
            />
            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <TouchableOpacity
                style={[styles.botao, { borderColor: "#999" }]}
                onPress={() => {
                  setModalSenha(false);
                  setSenhaDigitada("");
                }}
              >
                <Text style={[styles.botaoTexto, { color: "#999" }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.botao}
                onPress={confirmarSenhaParaExcluir}
              >
                <Text style={styles.botaoTexto}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

/* ===== estilos ===== */
const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },

  titulo: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
  },

  filtersRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: "#eee",
    borderRadius: 999,
    padding: 4,
  },
  segBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  segBtnActive: { backgroundColor: "#4f46e5" },
  segTxt: { fontWeight: "700", color: "#444" },
  segTxtActive: { color: "#fff" },

  dateBtn: {
    marginLeft: "auto",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
  },
  dateTxt: { fontWeight: "700", color: "#111" },

  boxVenda: { flexDirection: "row", gap: 6, marginTop: 8 },
  inputCod: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 8,
    borderRadius: 6,
    width: 110,
    backgroundColor: "#fff",
  },
  inputQtd: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 8,
    borderRadius: 6,
    width: 70,
    backgroundColor: "#fff",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    marginVertical: 8,
    borderRadius: 8,
    backgroundColor: "#fff",
  },

  labelInline: {
    marginTop: 4,
    marginBottom: 4,
    fontWeight: "600",
    color: "#222",
  },
  select: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#fff",
    marginBottom: 8,
  },
  selectTxt: { color: "#111" },

  botao: {
    borderWidth: 1,
    borderColor: "#bfa140",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 10,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
  },
  botaoTexto: {
    color: "#bfa140",
    fontWeight: "bold",
    fontSize: 16,
  },

  itemLinha: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderColor: "#ddd",
  },
  itemLista: { fontSize: 16, flexShrink: 1 },
  excluir: { color: "red", fontWeight: "bold", marginLeft: 10 },

  total: {
    marginTop: 10,
    fontWeight: "bold",
    color: "green",
    fontSize: 18,
    textAlign: "center",
  },

  // Modais (compartilhado)
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 20,
  },
  modalList: {
    backgroundColor: "#fff",
    borderRadius: 12,
    maxHeight: "70%",
    padding: 12,
  },
  modalTitle: { fontWeight: "800", fontSize: 16, marginBottom: 8 },
  itemColab: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  itemColabTxt: { fontWeight: "700", fontSize: 15, color: "#111" },
  itemColabSub: { color: "#555" },
  btnFechar: {
    marginTop: 8,
    alignSelf: "flex-end",
    padding: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
  },

  modalContent: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 12,
    width: "100%",
  },

  // resumo mensal
  resumoCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#f8f8ff",
    borderWidth: 1,
    borderColor: "#ececff",
  },
  resumoTitulo: { fontWeight: "800", color: "#111" },
  resumoLinha: { marginTop: 4, color: "#111" },
  resumoRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
