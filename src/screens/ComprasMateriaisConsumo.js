// screens/ComprasMateriaisConsumo.js
import React, { useEffect, useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  Keyboard,
  Platform,
  KeyboardAvoidingView,
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { brMoney } from "../utils/mei";

import {
  upsertEstoqueMateriaisFromCompra,
  estornarEstoqueMateriaisPorCompraIds,
  KEY_ESTOQUE_MATERIAIS,
} from "./EstoqueMateriais";

/* ============ Constantes ============ */
const PLACEHOLDER = "#777";
const CAPITAL_KEY = "capitalGiroResumo";
const DESPESAS_KEY = "despesas";
const CONTAS_PAGAR_KEY = "contasPagar";

// ✅ CHAVE MENSAL SEPARADA (não mistura com Compras do estoque de vendas)
const COMPRAS_MATERIAIS_BUCKET = "comprasMateriais";

/* ============ Utils ============ */
function daysInMonth(d) {
  const y = d.getFullYear();
  const m = d.getMonth();
  return new Date(y, m + 1, 0).getDate();
}

const normalize = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/* Máscara BRL automática ao digitar */
function maskBRLInput(text) {
  const digits = String(text || "").replace(/\D/g, "");
  const n = parseInt(digits || "0", 10);
  const v = n / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function parseBRL(masked) {
  if (!masked) return 0;
  const digits = String(masked).replace(/\D/g, "");
  const n = parseInt(digits || "0", 10);
  return n / 100;
}

// =========================
// Persistência mensal DIRETA (bypass do utils/mei)
// =========================
function ymKeyFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthStorageKey(bucket, ym) {
  // prefixo para evitar colisões e ficar explícito
  return `@${bucket}:${ym}`;
}

async function loadMonthListDirect(bucket, ym) {
  try {
    const raw = await AsyncStorage.getItem(monthStorageKey(bucket, ym));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.log("[DIRECT] loadMonthList erro:", e?.message || e);
    return [];
  }
}

async function saveMonthListDirect(bucket, list, ym) {
  try {
    await AsyncStorage.setItem(
      monthStorageKey(bucket, ym),
      JSON.stringify(Array.isArray(list) ? list : []),
    );
    return true;
  } catch (e) {
    console.log("[DIRECT] saveMonthList erro:", e?.message || e);
    return false;
  }
}

/* Máscara de data dd/mm/aaaa a partir de dígitos */
function maskDate(value) {
  const digits = String(value || "")
    .replace(/\D/g, "")
    .slice(0, 8);

  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return digits.slice(0, 2) + "/" + digits.slice(2);
  return digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4);
}

/* Data pt-BR -> Date: aceita "20/12/2025" ou "20122025" */
const parseDatePt = (s) => {
  if (!s) return null;
  const digits = String(s).replace(/\D/g, "").slice(0, 8);
  if (digits.length !== 8) return null;

  const dd = parseInt(digits.slice(0, 2), 10);
  const mm = parseInt(digits.slice(2, 4), 10);
  const yy = parseInt(digits.slice(4, 8), 10);
  if (!dd || !mm || !yy) return null;

  const dt = new Date(yy, mm - 1, dd);
  return isNaN(dt.getTime()) ? null : dt;
};

/* Date -> "dd/mm/aaaa" */
const formatDateBR = (dt) => {
  const d = String(dt.getDate()).padStart(2, "0");
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const y = dt.getFullYear();
  return `${d}/${m}/${y}`;
};

/* ====== Helpers Capital de Giro (resumo) ====== */
async function loadCapitalResumo() {
  try {
    const raw = await AsyncStorage.getItem(CAPITAL_KEY);
    if (!raw) return { entrada: 0, saida: 0, saldo: 0 };
    const obj = JSON.parse(raw);
    return {
      entrada: Number(obj.entrada || 0),
      saida: Number(obj.saida || 0),
      saldo: Number(obj.saldo || 0),
    };
  } catch {
    return { entrada: 0, saida: 0, saldo: 0 };
  }
}
async function salvarCapitalResumo(resumo) {
  await AsyncStorage.setItem(CAPITAL_KEY, JSON.stringify(resumo));
}
async function registrarSaidaCapital(valor) {
  if (!(valor > 0)) return;
  const atual = await loadCapitalResumo();
  const novo = {
    entrada: atual.entrada,
    saida: atual.saida + valor,
    saldo: atual.saldo - valor,
  };
  await salvarCapitalResumo(novo);
}
async function estornarSaidaCapital(valor) {
  if (!(valor > 0)) return;
  const atual = await loadCapitalResumo();
  const novaSaida = atual.saida - valor;
  const novo = {
    entrada: atual.entrada,
    saida: novaSaida > 0 ? novaSaida : 0,
    saldo: atual.saldo + valor,
  };
  await salvarCapitalResumo(novo);
}

/** ====== Sync seguro ====== */
async function syncAdicionarSafe(key, item) {
  try {
    const m = await import("./services/sync");
    if (typeof m?.syncAdicionar === "function") {
      await m.syncAdicionar(key, item);
    }
  } catch (e) {
    console.log(
      "syncAdicionarSafe em ComprasMateriais falhou:",
      e?.message || e,
    );
  }
}

export default function ComprasMateriaisConsumo() {
  const today = new Date();

  const [isUnlocked, setIsUnlocked] = useState(false);

  // mês selecionado (ancorado no 1º dia do mês)
  const [selectedMonth, setSelectedMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );

  const ym = useMemo(() => ymKeyFromDate(selectedMonth), [selectedMonth]);

  // campos
  const [codigo, setCodigo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [unidade, setUnidade] = useState(""); // ✅ NOVO (un, kg, ml...)
  const [avisoQtdMostrado, setAvisoQtdMostrado] = useState(false);
  const [qtdStr, setQtdStr] = useState("");
  const [valorStr, setValorStr] = useState("");
  const [busca, setBusca] = useState("");

  const [lista, setLista] = useState([]);

  // ===== Compra a prazo (somar em lote) =====
  const [compraPrazoAtivo, setCompraPrazoAtivo] = useState(false);
  const [loteItens, setLoteItens] = useState([]);
  const [totalLote, setTotalLote] = useState(0);
  const [nomeCredor, setNomeCredor] = useState("");
  const [qtdParcelasStr, setQtdParcelasStr] = useState("");
  const [primeiroVencStr, setPrimeiroVencStr] = useState("");
  const [modalPrazoVisivel, setModalPrazoVisivel] = useState(false);

  // seleção múltipla
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [senhaExclusaoVisivel, setSenhaExclusaoVisivel] = useState(false);
  const [senhaDigitada, setSenhaDigitada] = useState("");

  // gate por senha ao abrir
  const [senhaAberturaVisivel, setSenhaAberturaVisivel] = useState(true);
  const [senhaAbertura, setSenhaAbertura] = useState("");

  function mostrarAvisoQuantidade() {
    if (avisoQtdMostrado) return;

    Alert.alert(
      "Quantidade",
      "Informe a quantidade de acordo com a unidade de medida inserida.\n\nExemplos:\n• un = quantidade em unidades\n• kg = quantidade em quilos\n• ml = quantidade em mililitros\n• cx = quantidade em caixas",
    );

    setAvisoQtdMostrado(true);
  }

  const isCurrentMonth = useMemo(() => {
    const now = new Date();
    return (
      selectedMonth.getFullYear() === now.getFullYear() &&
      selectedMonth.getMonth() === now.getMonth()
    );
  }, [selectedMonth]);

  const hojePt = useMemo(
    () =>
      today.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
    [],
  );

  useFocusEffect(
    useCallback(() => {
      if (!isUnlocked) return;

      (async () => {
        const data = await loadMonthListDirect(COMPRAS_MATERIAIS_BUCKET, ym);
        setLista(Array.isArray(data) ? data : []);
      })();
    }, [isUnlocked, ym]),
  );

  useFocusEffect(
    useCallback(() => {
      setAvisoQtdMostrado(false);
    }, []),
  );

  const mesAnoLabel = useMemo(
    () =>
      selectedMonth.toLocaleDateString("pt-BR", {
        month: "2-digit",
        year: "numeric",
      }),
    [selectedMonth],
  );

  // ---- inicialização & carga ----
  useEffect(() => {
    (async () => {
      const s = await AsyncStorage.getItem("senhaAcesso");
      if (!s) await AsyncStorage.setItem("senhaAcesso", "1234");
    })();
  }, []);

  // ---- totais ----
  const totalMes = useMemo(
    () => lista.reduce((acc, it) => acc + Number(it.valorNumber || 0), 0),
    [lista],
  );

  const listaFiltrada = useMemo(() => {
    const q = normalize(busca);
    if (!q) return lista;
    const terms = q.split(/\s+/).filter(Boolean);
    return (lista || []).filter((it) => {
      const hay = normalize(
        `${it.codigo || ""} ${it.descricao || ""} ${it.unidade || ""}`,
      );
      return terms.every((t) => hay.includes(t));
    });
  }, [lista, busca]);

  const totalFiltrado = useMemo(
    () =>
      listaFiltrada.reduce((acc, it) => acc + Number(it.valorNumber || 0), 0),
    [listaFiltrada],
  );

  // ---- formatadores ----
  function parseQtd() {
    const normalized = String(qtdStr || "").replace(",", ".");
    const n = Number(normalized);
    return isNaN(n) ? 0 : n;
  }

  function buildItemDateISO() {
    const base = new Date(
      selectedMonth.getFullYear(),
      selectedMonth.getMonth(),
      1,
    );
    const diaHoje = new Date().getDate();
    const max = daysInMonth(base);
    base.setDate(Math.min(diaHoje, max));
    return base.toISOString();
  }

  const arred2 = (n) => Math.round(Number(n || 0) * 100) / 100;
  const arred3 = (n) => Math.round(Number(n || 0) * 1000) / 1000;

  // ---- navegação de mês ----
  function addMonths(delta) {
    setSelectedMonth((prev) => {
      const next = new Date(prev.getFullYear(), prev.getMonth() + delta, 1);

      // ✅ não deixa ir para mês futuro
      const now = new Date();
      const current = new Date(now.getFullYear(), now.getMonth(), 1);
      if (next > current) return prev;

      return next;
    });
  }

  // ======= Inserir compra para LOTE (Compra a prazo) =======
  async function inserirCompraEmLote() {
    Keyboard.dismiss();

    if (!isCurrentMonth) {
      Alert.alert(
        "Apenas consulta",
        "Você só pode lançar compras no mês atual. Volte ao mês atual para inserir.",
      );
      return;
    }

    const valor = parseBRL(valorStr);
    const qtd = parseQtd();

    if (!codigo.trim() || !descricao.trim() || !valor) {
      Alert.alert("Campos incompletos", "Preencha Código, Descrição e Valor.");
      return;
    }

    if (!(qtd > 0)) {
      Alert.alert(
        "Quantidade obrigatória",
        "Informe a quantidade para dar entrada no estoque.",
      );
      return;
    }

    const compra = {
      id: String(Date.now()),
      codigo: codigo.trim(),
      descricao: descricao.trim(),
      unidade: String(unidade || "un").trim(),
      valorNumber: valor,
      qtdNumber: qtd || 0,
      dataISO: buildItemDateISO(),
      fromCapitalGiro: false,
      fromDespesas: false,
      compraPrazo: true,
    };

    // salva na lista mensal (histórico)
    const novaLista = [compra, ...lista];
    setLista(novaLista);
    await saveMonthListDirect(COMPRAS_MATERIAIS_BUCKET, novaLista, ym);

    // ✅ dá entrada no EstoqueMateriais
    try {
      await upsertEstoqueMateriaisFromCompra(
        compra.codigo,
        compra.descricao,
        compra.unidade || "un",
        compra.qtdNumber,
        compra.valorNumber,
        {
          compraId: compra.id,
          source: "comprasMateriais",
          dataISO: compra.dataISO,
        },
      );
    } catch (e) {
      console.log(
        "[ComprasMateriais] ERRO ao salvar no estoque:",
        e?.message || e,
      );
      Alert.alert("Erro", "Não foi possível salvar no Estoque de Materiais.");
    }

    // soma no lote
    setLoteItens((prev) => [...prev, compra]);
    setTotalLote((prev) => Number(prev || 0) + Number(compra.valorNumber || 0));

    // limpa campos
    setCodigo("");
    setDescricao("");
    setUnidade("un");
    setQtdStr("");
    setValorStr("");

    Alert.alert(
      "Compra incluída no lote",
      "O item foi somado ao lote de Compra a Prazo. Use 'Fechar Compra a Prazo' para gerar as parcelas.",
    );
  }

  // ======= Inserir compra (fluxo normal) =======
  async function inserirCompra() {
    Keyboard.dismiss();

    if (!isCurrentMonth) {
      Alert.alert(
        "Apenas consulta",
        "Você só pode lançar compras no mês atual. Volte ao mês atual para inserir.",
      );
      return;
    }

    const valor = parseBRL(valorStr);
    const qtd = parseQtd();

    if (!codigo.trim() || !descricao.trim() || !valor) {
      Alert.alert("Campos incompletos", "Preencha Código, Descrição e Valor.");
      return;
    }

    if (!(qtd > 0)) {
      Alert.alert(
        "Quantidade obrigatória",
        "Informe a quantidade para dar entrada no estoque.",
      );
      return;
    }

    if (compraPrazoAtivo) {
      await inserirCompraEmLote();
      return;
    }

    const base = {
      id: String(Date.now()),
      codigo: codigo.trim(),
      descricao: descricao.trim(),
      unidade: String(unidade || "").trim() || "un",
      valorNumber: valor,
      qtdNumber: qtd || 0,
      dataISO: buildItemDateISO(),
      fromCapitalGiro: false,
      fromDespesas: false,
    };

    const commit = async (origem) => {
      const agora = new Date();
      const hojePtLocal = agora.toLocaleDateString("pt-BR");

      let compra = { ...base };
      if (origem === "CAPITAL_GIRO") compra.fromCapitalGiro = true;
      if (origem === "DESPESAS") compra.fromDespesas = true;

      const novaLista = [compra, ...lista];
      setLista(novaLista);

      // ✅ CORREÇÃO 1: salvar no DIRECT (mesma fonte do load)
      await saveMonthListDirect(COMPRAS_MATERIAIS_BUCKET, novaLista, ym);

      // ✅ CORREÇÃO 2: dar entrada no estoque também no commit (normal)
      try {
        await upsertEstoqueMateriaisFromCompra(
          compra.codigo,
          compra.descricao,
          compra.unidade || "un",
          compra.qtdNumber,
          compra.valorNumber,
        );
      } catch (e) {
        console.log(
          "[ComprasMateriais] ERRO ao salvar no estoque (commit):",
          e?.message || e,
        );
        Alert.alert("Erro", "Não foi possível salvar no Estoque de Materiais.");
      }

      if (origem === "CAPITAL_GIRO") {
        await registrarSaidaCapital(compra.valorNumber);
      }

      if (origem === "DESPESAS") {
        try {
          const json = await AsyncStorage.getItem(DESPESAS_KEY);
          const listaDespesas = json ? JSON.parse(json) : [];

          const novaDespesa = {
            id: String(Date.now()), // ✅ AQUI
            data: hojePtLocal,
            dataISO: agora.toISOString(),
            descricao: compra.descricao,
            valor: compra.valorNumber,
            origem: "compra_material",
            compraId: compra.id,
          };

          const novaListaDespesas = [...listaDespesas, novaDespesa];
          await AsyncStorage.setItem(
            DESPESAS_KEY,
            JSON.stringify(novaListaDespesas),
          );
          await syncAdicionarSafe(DESPESAS_KEY, novaDespesa);
        } catch (e) {
          console.log(
            "Erro ao salvar despesa originada de compra:",
            e?.message || e,
          );
        }
      }

      setCodigo("");
      setDescricao("");
      setUnidade("un");
      setQtdStr("");
      setValorStr("");
    };

    Alert.alert("Pagamento da compra", "De onde deseja descontar este valor?", [
      { text: "Capital de Giro", onPress: () => commit("CAPITAL_GIRO") },
      { text: "Despesas", onPress: () => commit("DESPESAS") },
      { text: "Cancelar", style: "cancel" },
    ]);
  }

  // ======= Exclusão individual =======
  function confirmarExclusao(item) {
    const msgBase =
      `Excluir a compra "${item.descricao}" (${item.codigo || "s/ código"})?\n` +
      `Unidade: ${item.unidade || "-"}\n` +
      `Quantidade: ${item.qtdNumber || 0}\n` +
      `Valor: ${brMoney(item.valorNumber)}\n\n` +
      `⚠️ Esta exclusão remove o registro do histórico de Compras e também o lançamento correspondente em Despesas.\n` +
      `O estoque NÃO será alterado.`;

    Alert.alert("Excluir compra", msgBase, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          const bloqueia = await existeNoEstoqueMateriais(item.codigo);

          if (bloqueia) {
            Alert.alert(
              "Atenção",
              "Excluir só é possível após excluir no EstoqueMateriais.",
            );
            return;
          }

          if (item.fromCapitalGiro) {
            Alert.alert(
              "Excluir compra",
              msgBase +
                "\n\nEsta compra foi paga com Capital de Giro. Deseja estornar também essa saída?",
              [
                { text: "Cancelar", style: "cancel" },
                {
                  text: "Excluir (somente histórico e despesas)",
                  style: "default",
                  onPress: () => excluirLote([item.id], false),
                },
                {
                  text: "Excluir e estornar Capital",
                  style: "destructive",
                  onPress: () => excluirLote([item.id], true),
                },
              ],
            );
          } else {
            excluirLote([item.id], false);
          }
        },
      },
    ]);
  }

  // ======= Seleção múltipla =======
  function toggleSelectMode() {
    setSelectMode((s) => !s);
    setSelectedIds(new Set());
  }
  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function pedirSenhaParaExcluirSelecionadas() {
    if (selectedIds.size === 0) {
      Alert.alert("Seleção vazia", "Escolha pelo menos uma compra.");
      return;
    }

    setSenhaExclusaoVisivel(true);
    setSenhaDigitada("");
  }

  async function existeNoEstoqueMateriais(codigo) {
    const cod = String(codigo || "").trim();
    if (!cod) return false;

    // tenta nas duas chaves (materiais e/ou estoque padrão)
    const KEYS = [KEY_ESTOQUE_MATERIAIS, "estoque"];

    try {
      for (const k of KEYS) {
        const raw = await AsyncStorage.getItem(k);
        if (!raw) continue;

        const parsed = JSON.parse(raw);

        // aceita array direto ou objeto com .itens
        const arr = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.itens)
            ? parsed.itens
            : [];

        const it = arr.find((p) => String(p?.codigo || "").trim() === cod);
        if (!it) continue;

        const entrada = Number(it?.entrada || 0);
        const saida = Number(it?.saida || 0);
        const saldo = entrada - saida;

        // se ainda tem saldo, bloqueia
        if (saldo > 0) return true;

        // se encontrou mas saldo <= 0, não bloqueia (pode excluir)
        return false;
      }

      // não achou em nenhuma key -> não bloqueia
      return false;
    } catch (e) {
      console.log("[ComprasMateriais] erro checando estoque:", e?.message || e);
      // por segurança você tinha bloqueio; mas aqui eu sugiro NÃO bloquear por erro de leitura
      // porque senão você fica travada pra sempre.
      return false;
    }
  }

  async function excluirLote(idsForDelete, estornarCapital = false) {
    const ids = Array.isArray(idsForDelete)
      ? idsForDelete
      : Array.from(selectedIds);
    const idsSet = new Set(ids.map((x) => String(x)));

    // itens atuais do mês (histórico)
    const items = Array.isArray(lista) ? lista : [];

    // itens selecionados pra excluir
    const itensAlvo = items.filter((it) => idsSet.has(String(it?.id)));

    // ids realmente removidos
    const idsTotaisRemovidos = new Set(itensAlvo.map((it) => String(it.id)));

    // lista após exclusão (só histórico)
    const list = items.filter((it) => !idsTotaisRemovidos.has(String(it?.id)));

    // contadores do Alert (no novo modo não tem parcial/sem)
    const tot = idsTotaisRemovidos.size;
    const parc = 0;
    const sem = 0;

    // total pra estornar no capital (somente itens que eram do capital)
    let totalEstornarCapital = 0;
    if (estornarCapital) {
      for (const it of itensAlvo) {
        if (it?.fromCapitalGiro) {
          totalEstornarCapital += Number(it?.valorNumber || 0);
        }
      }
    }

    // mapa id -> contasPagarKey (pra ajuste do credor)
    const contasKeyPorId = {};
    for (const it of itensAlvo) {
      const idStr = String(it?.id || "");
      if (!idStr) continue;
      if (it?.contasPagarKey) contasKeyPorId[idStr] = it.contasPagarKey;
    }

    // =========================
    // 1) Salva histórico (DIRECT) + limpa seleção
    // =========================
    setLista(list);
    await saveMonthListDirect(COMPRAS_MATERIAIS_BUCKET, list, ym);

    setSelectMode(false);
    setSelectedIds(new Set());

    // =========================
    // 2) Remove despesas ligadas (somente originadas desta compra)
    // =========================
    if (idsTotaisRemovidos.size > 0) {
      try {
        const jsonDesp = await AsyncStorage.getItem(DESPESAS_KEY);
        const listaDespesas = jsonDesp ? JSON.parse(jsonDesp) : [];

        const filtrada = (listaDespesas || []).filter(
          (d) => !d?.compraId || !idsTotaisRemovidos.has(String(d.compraId)),
        );

        await AsyncStorage.setItem(DESPESAS_KEY, JSON.stringify(filtrada));
      } catch (e) {
        console.log(
          "Erro ao remover despesas ligadas às compras:",
          e?.message || e,
        );
      }
    }

    // =========================
    // 3) Ajusta Contas a Pagar (se houver lote)
    // =========================
    const valorRemovidoPorLote = {};
    for (const item of itensAlvo) {
      const idStr = String(item.id);
      if (idsTotaisRemovidos.has(idStr)) {
        const key = contasKeyPorId[idStr];
        if (key) {
          valorRemovidoPorLote[key] =
            (valorRemovidoPorLote[key] || 0) + Number(item.valorNumber || 0);
        }
      }
    }

    const temAjusteParcial =
      Object.keys(valorRemovidoPorLote).length > 0 ||
      idsTotaisRemovidos.size > 0;

    if (temAjusteParcial) {
      try {
        const rawContas = await AsyncStorage.getItem(CONTAS_PAGAR_KEY);
        let obj = rawContas ? JSON.parse(rawContas) : {};
        if (!obj || typeof obj !== "object" || Array.isArray(obj)) obj = {};

        const listaAposExclusao = list;

        // atualiza credores que ainda ficam com compras
        for (const [key, valorRemovido] of Object.entries(
          valorRemovidoPorLote,
        )) {
          const aindaTemCompra = listaAposExclusao.some(
            (c) => c.contasPagarKey === key,
          );
          if (!aindaTemCompra) continue;

          const credor = obj[key];
          if (!credor) continue;

          const totalAtual = Number(credor.ficha?.valorTotal || 0);
          const novoTotal = Math.max(
            0,
            totalAtual - Number(valorRemovido || 0),
          );

          credor.ficha = { ...(credor.ficha || {}), valorTotal: novoTotal };

          // recalcula parcelas proporcionalmente
          if (Array.isArray(credor.parcelas) && credor.parcelas.length > 0) {
            const qtdParcelas = credor.parcelas.length;
            const totalCents = Math.round(novoTotal * 100);
            const base =
              qtdParcelas > 0 ? Math.floor(totalCents / qtdParcelas) : 0;
            const resto = qtdParcelas > 0 ? totalCents - base * qtdParcelas : 0;

            credor.parcelas = credor.parcelas.map((p, idx) => {
              const valorCents = base + (idx < resto ? 1 : 0);
              return { ...p, valor: valorCents / 100 };
            });
          }

          obj[key] = credor;
        }

        // remove credores sem nenhuma compra restante
        const loteKeysParaVerificar = new Set();
        idsTotaisRemovidos.forEach((id) => {
          const k = contasKeyPorId[String(id)];
          if (k) loteKeysParaVerificar.add(k);
        });

        loteKeysParaVerificar.forEach((key) => {
          const aindaTemCompra = listaAposExclusao.some(
            (c) => c.contasPagarKey === key,
          );
          if (!aindaTemCompra && obj[key]) delete obj[key];
        });

        await AsyncStorage.setItem(CONTAS_PAGAR_KEY, JSON.stringify(obj));
      } catch (e) {
        console.log("Erro ao ajustar Contas a Pagar:", e?.message || e);
      }
    }

    // =========================
    // 4) Estorno no Capital (se escolhido)
    // =========================
    if (estornarCapital && totalEstornarCapital > 0) {
      await estornarSaidaCapital(totalEstornarCapital);
      Alert.alert(
        "Exclusão concluída",
        `Totalmente excluídas: ${tot}\nParcialmente estornadas: ${parc}\nSem estorno (saldo insuficiente): ${sem}\n\nSaída estornada no Capital de Giro: ${brMoney(
          totalEstornarCapital,
        )}`,
      );
    } else {
      Alert.alert(
        "Exclusão concluída",
        `Totalmente excluídas: ${tot}\nParcialmente estornadas: ${parc}\nSem estorno (saldo insuficiente): ${sem}`,
      );
    }
  }

  // ======= Fechar COMPRA A PRAZO =======
  async function fecharCompraPrazo() {
    if (totalLote <= 0 || loteItens.length === 0) {
      Alert.alert(
        "Lote vazio",
        "Ative 'Compra a prazo (somar em lote)' e insira pelo menos uma compra.",
      );
      return;
    }

    const nome = nomeCredor.trim();
    const qtdParcelas = Number(qtdParcelasStr);
    const dt = parseDatePt(primeiroVencStr);

    if (!nome || !qtdParcelas || qtdParcelas < 1 || !dt) {
      Alert.alert(
        "Dados incompletos",
        "Informe o nome do credor, quantidade de parcelas e a data do primeiro vencimento (dd/mm/aaaa).",
      );
      return;
    }

    const totalCents = Math.round(totalLote * 100);
    const base = Math.floor(totalCents / qtdParcelas);
    const resto = totalCents - base * qtdParcelas;

    const novasParcelas = [];
    for (let i = 0; i < qtdParcelas; i++) {
      const venc = new Date(dt.getTime());
      venc.setMonth(venc.getMonth() + i);

      const valorCents = base + (i < resto ? 1 : 0);
      const valorParcela = valorCents / 100;

      novasParcelas.push({
        id: `cp-${Date.now()}-${i + 1}`,
        numero: i + 1,
        valor: valorParcela,
        vencimento: formatDateBR(venc),
        pago: false,
        origem: "COMPRA_PRAZO_MATERIAIS",
      });
    }

    try {
      const raw = await AsyncStorage.getItem(CONTAS_PAGAR_KEY);
      let obj = raw ? JSON.parse(raw) : {};
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) obj = {};

      const loteId = Date.now();
      const chaveLote = `${nome}||${loteId}`;

      obj[chaveLote] = {
        ficha: {
          nome,
          valorTotal: Number(totalLote || 0),
          origem: "COMPRA_PRAZO_MATERIAIS",
          criadoEm: new Date().toISOString(),
        },
        parcelas: novasParcelas,
      };

      await AsyncStorage.setItem(CONTAS_PAGAR_KEY, JSON.stringify(obj));

      const idsLote = new Set(loteItens.map((c) => c.id));
      const listaAtualizada = (lista || []).map((it) =>
        idsLote.has(it.id) ? { ...it, contasPagarKey: chaveLote } : it,
      );

      setLista(listaAtualizada);

      // ✅ manter consistência: DIRECT
      await saveMonthListDirect(COMPRAS_MATERIAIS_BUCKET, listaAtualizada, ym);

      setLoteItens([]);
      setTotalLote(0);
      setNomeCredor("");
      setQtdParcelasStr("");
      setPrimeiroVencStr("");
      setModalPrazoVisivel(false);

      Alert.alert(
        "Compra a prazo gerada",
        `Lote de ${brMoney(totalLote)} enviado para Contas a Pagar em ${qtdParcelas} parcelas.`,
      );
    } catch (e) {
      console.log("Erro ao salvar lote em Contas a Pagar:", e?.message || e);
      Alert.alert(
        "Erro",
        "Não foi possível salvar as parcelas em Contas a Pagar.",
      );
    }
  }

  const handleChangePrimeiroVenc = (text) => {
    const masked = maskDate(text);
    setPrimeiroVencStr(masked);
  };

  // ---- Render item lista ----
  const renderItem = ({ item }) => {
    const dataPt = new Date(item.dataISO).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const hasQtd = Number(item.qtdNumber || 0) > 0;
    const sel = selectedIds.has(item.id);

    return (
      <TouchableOpacity
        activeOpacity={selectMode ? 0.7 : 1}
        onPress={() => (selectMode ? toggleSelected(item.id) : null)}
        style={[
          styles.item,
          selectMode && { backgroundColor: sel ? "#fff7e6" : "#f9f9f9" },
        ]}
      >
        {selectMode && <Text style={styles.check}>{sel ? "☑" : "☐"}</Text>}

        <View style={{ flex: 1 }}>
          <Text style={styles.itemTop}>
            {item.codigo ? `${item.codigo} • ` : ""}
            {item.descricao}
            {!!item.unidade ? ` • ${item.unidade}` : ""}
            {hasQtd ? ` (${item.qtdNumber})` : ""}
            {item.fromCapitalGiro ? "  [Cap. Giro]" : ""}
          </Text>
          <Text style={styles.itemSub}>{dataPt}</Text>
        </View>

        <Text style={styles.itemVal}>{brMoney(item.valorNumber)}</Text>

        {!selectMode && (
          <TouchableOpacity onPress={() => confirmarExclusao(item)}>
            <Text style={styles.del}>Excluir</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  async function confirmarAbertura() {
    const senhaSalva = await AsyncStorage.getItem("senhaAcesso");
    if (senhaAbertura === (senhaSalva || "1234")) {
      setIsUnlocked(true);
      setSenhaAberturaVisivel(false);
      setSenhaAbertura("");
    } else {
      Alert.alert("Senha incorreta", "Tente novamente.");
      setSenhaAbertura("");
    }
  }

  async function confirmarExclusaoComSenha() {
    const senhaSalva = await AsyncStorage.getItem("senhaAcesso");
    const ok = senhaDigitada === (senhaSalva || "1234");
    setSenhaExclusaoVisivel(false);
    setSenhaDigitada("");

    if (!ok) {
      Alert.alert("Senha incorreta", "A exclusão foi cancelada.");
      return;
    }

    const ids = Array.from(selectedIds);
    const temCapital = lista.some(
      (it) => ids.includes(it.id) && it.fromCapitalGiro,
    );

    if (!temCapital) {
      await excluirLote(ids, false);
      return;
    }

    Alert.alert(
      "Excluir compras",
      "Algumas dessas compras foram pagas com Capital de Giro. Deseja estornar também essas saídas?",
      [
        {
          text: "Somente histórico/estoque",
          onPress: () => excluirLote(ids, false),
        },
        {
          text: "Excluir + estornar Capital",
          style: "destructive",
          onPress: () => excluirLote(ids, true),
        },
        { text: "Cancelar", style: "cancel" },
      ],
    );
  }

  if (!isUnlocked) {
    return (
      <View style={[styles.screen, { justifyContent: "center" }]}>
        <Modal visible={senhaAberturaVisivel} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Digite a senha para abrir</Text>
              <TextInput
                style={styles.input}
                placeholder="Senha"
                secureTextEntry
                value={senhaAbertura}
                onChangeText={setSenhaAbertura}
                autoFocus
                placeholderTextColor={PLACEHOLDER}
                underlineColorAndroid="transparent"
              />

              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnGhost, { flex: 1 }]}
                  onPress={() => setSenhaAberturaVisivel(false)}
                >
                  <Text style={styles.btnGhostText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.btnPrimary, { flex: 1 }]}
                  onPress={confirmarAbertura}
                >
                  <Text style={styles.btnText}>Confirmar</Text>
                </TouchableOpacity>
              </View>

              <Text style={{ color: "#777", marginTop: 8, fontSize: 12 }}>
                Dica: senha padrão é 1234 (pode ser alterada em Configurações).
              </Text>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
    >
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 140,
          backgroundColor: "#F2F2F2",
        }}
        keyboardShouldPersistTaps="handled"
        data={listaFiltrada}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={
          <View>
            <View style={styles.topBar}>
              <Text style={styles.topTitle}>
                Compras – Materiais de Consumo
              </Text>
              <Text style={styles.topSub}>
                Mês: {mesAnoLabel} • Hoje: {hojePt}
              </Text>
            </View>
            <View style={styles.monthRow}>
              <TouchableOpacity
                style={styles.navBtn}
                onPress={() => addMonths(-1)}
              >
                <Text style={styles.navTxt}>‹ Mês anterior</Text>
              </TouchableOpacity>
            </View>

            {!isCurrentMonth && (
              <TouchableOpacity
                style={[styles.navBtn, { alignSelf: "center", marginTop: 6 }]}
                onPress={() =>
                  setSelectedMonth(
                    new Date(today.getFullYear(), today.getMonth(), 1),
                  )
                }
              >
                <Text style={[styles.navTxt, { fontWeight: "900" }]}>
                  Voltar ao mês atual
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.prazoRow}
              onPress={() => setCompraPrazoAtivo((prev) => !prev)}
            >
              <View
                style={[styles.prazoBox, compraPrazoAtivo && styles.prazoBoxOn]}
              >
                <Text style={styles.prazoMark}>
                  {compraPrazoAtivo ? "✓" : ""}
                </Text>
              </View>
              <Text style={styles.prazoLabel}>
                Compra a prazo (somar em lote)
              </Text>
            </TouchableOpacity>

            <TextInput
              placeholder="Código"
              style={styles.input}
              placeholderTextColor={PLACEHOLDER}
              underlineColorAndroid="transparent"
              onChangeText={setCodigo}
              value={codigo}
              returnKeyType="next"
            />

            <TextInput
              placeholder="Descrição do material"
              style={styles.input}
              placeholderTextColor={PLACEHOLDER}
              underlineColorAndroid="transparent"
              value={descricao}
              onChangeText={setDescricao}
              returnKeyType="next"
            />

            {/* ✅ Card Unidade de medida */}
            <View style={styles.unitCard}>
              <Text style={styles.unitLabel}>Unidade de medida</Text>
              <TextInput
                placeholder="Ex: un, kg, g, ml, L, cx, pct..."
                style={styles.unitInput}
                placeholderTextColor={PLACEHOLDER}
                underlineColorAndroid="transparent"
                value={unidade}
                onChangeText={setUnidade}
                returnKeyType="next"
              />
            </View>

            <TextInput
              placeholder="Quantidade (ex.: 3 ou 3,5)"
              style={styles.input}
              placeholderTextColor={PLACEHOLDER}
              keyboardType="numeric"
              value={qtdStr}
              onChangeText={setQtdStr}
              returnKeyType="next"
              onFocus={mostrarAvisoQuantidade}
            />

            <TextInput
              placeholder="Valor"
              style={styles.input}
              placeholderTextColor={PLACEHOLDER}
              underlineColorAndroid="transparent"
              keyboardType="numeric"
              value={valorStr}
              onChangeText={(t) => setValorStr(maskBRLInput(t))}
              returnKeyType="done"
              onSubmitEditing={inserirCompra}
            />

            <TouchableOpacity style={styles.addBtn} onPress={inserirCompra}>
              <Text style={styles.addBtnText}>Inserir Compra</Text>
            </TouchableOpacity>

            {compraPrazoAtivo && loteItens.length > 0 && (
              <View style={styles.loteBox}>
                <Text style={styles.loteText}>
                  Lote atual: {loteItens.length} itens • Total{" "}
                  {brMoney(totalLote)}
                </Text>
                <TouchableOpacity
                  style={[styles.addBtn, { backgroundColor: "#bfa140" }]}
                  onPress={() => setModalPrazoVisivel(true)}
                >
                  <Text style={styles.addBtnText}>Fechar Compra a Prazo</Text>
                </TouchableOpacity>
              </View>
            )}

            <TextInput
              placeholder="Pesquisar por nome, código ou unidade..."
              style={styles.search}
              placeholderTextColor={PLACEHOLDER}
              underlineColorAndroid="transparent"
              value={busca}
              onChangeText={setBusca}
              returnKeyType="search"
            />

            <View style={styles.selectRow}>
              <TouchableOpacity
                style={[styles.navBtn, { flex: 1 }]}
                onPress={toggleSelectMode}
              >
                <Text style={styles.navTxt}>
                  {selectMode ? "Sair da seleção" : "Selecionar compras"}
                </Text>
              </TouchableOpacity>

              {selectMode && (
                <TouchableOpacity
                  style={[styles.navBtn, { marginLeft: 8 }]}
                  onPress={() => {
                    if (selectedIds.size === listaFiltrada.length)
                      setSelectedIds(new Set());
                    else
                      setSelectedIds(new Set(listaFiltrada.map((x) => x.id)));
                  }}
                >
                  <Text style={styles.navTxt}>
                    {selectedIds.size === listaFiltrada.length
                      ? "Limpar seleção"
                      : "Marcar tudo"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {selectMode && (
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: "#e74c3c" }]}
                onPress={pedirSenhaParaExcluirSelecionadas}
              >
                <Text style={styles.addBtnText}>Excluir selecionadas</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        ListEmptyComponent={
          <Text style={{ textAlign: "center", color: "#666", marginTop: 12 }}>
            {busca
              ? "Nenhuma compra corresponde à busca."
              : "Sem compras neste mês."}
          </Text>
        }
        ListFooterComponent={
          <View style={styles.totalBox}>
            <Text style={styles.totalText}>
              Total no mês: {brMoney(totalMes)}
            </Text>
            {!!busca && (
              <Text style={[styles.totalText, { marginTop: 4 }]}>
                Filtrado: {brMoney(totalFiltrado)}
              </Text>
            )}
          </View>
        }
      />

      {/* Modal senha exclusão múltipla */}
      <Modal visible={senhaExclusaoVisivel} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Confirme a senha para excluir</Text>
            <TextInput
              style={styles.input}
              placeholderTextColor={PLACEHOLDER}
              underlineColorAndroid="transparent"
              placeholder="Senha"
              secureTextEntry
              value={senhaDigitada}
              onChangeText={setSenhaDigitada}
              autoFocus
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                style={[styles.btn, styles.btnGhost, { flex: 1 }]}
                onPress={() => {
                  setSenhaExclusaoVisivel(false);
                  setSenhaDigitada("");
                }}
              >
                <Text style={styles.btnGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, { flex: 1 }]}
                onPress={confirmarExclusaoComSenha}
              >
                <Text style={styles.btnText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ color: "#777", marginTop: 8, fontSize: 12 }}>
              Dica: senha padrão é 1234 (pode ser alterada em Configurações).
            </Text>
          </View>
        </View>
      </Modal>

      {/* Modal COMPRA A PRAZO */}
      <Modal visible={modalPrazoVisivel} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Fechar Compra a Prazo</Text>
            <Text style={{ marginBottom: 6 }}>
              Total do lote:{" "}
              <Text style={{ fontWeight: "bold" }}>{brMoney(totalLote)}</Text>
            </Text>

            <TextInput
              style={styles.input}
              placeholderTextColor={PLACEHOLDER}
              underlineColorAndroid="transparent"
              placeholder="Nome do credor"
              value={nomeCredor}
              onChangeText={setNomeCredor}
            />
            <TextInput
              style={styles.input}
              placeholder="Quantidade de parcelas"
              keyboardType="numeric"
              placeholderTextColor={PLACEHOLDER}
              underlineColorAndroid="transparent"
              value={qtdParcelasStr}
              onChangeText={setQtdParcelasStr}
            />
            <TextInput
              style={styles.input}
              placeholder="Data 1º vencimento (dd/mm/aaaa)"
              keyboardType="number-pad"
              placeholderTextColor={PLACEHOLDER}
              underlineColorAndroid="transparent"
              value={primeiroVencStr}
              onChangeText={handleChangePrimeiroVenc}
              maxLength={10}
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <TouchableOpacity
                style={[styles.btn, styles.btnGhost, { flex: 1 }]}
                onPress={() => setModalPrazoVisivel(false)}
              >
                <Text style={styles.btnGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, { flex: 1 }]}
                onPress={fecharCompraPrazo}
              >
                <Text style={styles.btnText}>Gerar parcelas</Text>
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
  screen: { flex: 1, backgroundColor: "#F2F2F2" },

  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: "#fff",
    color: "#111",
  },

  topBar: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  topTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111",
    textAlign: "center",
  },
  topSub: {
    marginTop: 4,
    fontSize: 13,
    color: "#555",
    textAlign: "center",
    fontWeight: "700",
  },

  addBtn: {
    backgroundColor: "#2196F3",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 2,
    marginBottom: 10,
  },
  addBtnText: { color: "#fff", fontWeight: "800" },

  // ✅ Card Unidade
  unitCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  unitLabel: { fontWeight: "900", color: "#111", marginBottom: 8 },
  unitInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#fff",
    color: "#111",
  },

  prazoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
    marginBottom: 8,
  },
  prazoBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  prazoBoxOn: { backgroundColor: "#111" },
  prazoMark: { color: "#fff", fontWeight: "900", fontSize: 18, marginTop: -2 },
  prazoLabel: { fontSize: 16, fontWeight: "900", color: "#111" },

  monthRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 6,
  },
  navBtn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  navTxt: { fontWeight: "800", color: "#111" },

  search: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
    color: "#111",
    marginBottom: 10,
    fontWeight: "700",
  },

  selectRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },

  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderColor: "#E5E5E5",
    backgroundColor: "#fff",
    borderRadius: 10,
    marginBottom: 8,
  },
  check: { marginRight: 10, fontSize: 18, fontWeight: "900", color: "#111" },
  itemTop: { fontSize: 15, fontWeight: "800", color: "#111" },
  itemSub: { fontSize: 12, color: "#666", marginTop: 2 },
  itemVal: {
    fontSize: 14,
    fontWeight: "900",
    color: "#111",
    marginHorizontal: 10,
  },

  del: { color: "red", fontWeight: "900", paddingHorizontal: 6 },

  totalBox: {
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#0D47A1",
    padding: 12,
    marginTop: 12,
    marginBottom: 24,
    borderRadius: 12,
    alignItems: "center",
  },
  totalText: { fontSize: 16, fontWeight: "900", color: "#0D47A1" },

  loteBox: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  loteText: { fontWeight: "800", color: "#111", marginBottom: 8 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalBox: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 10,
    color: "#111",
  },

  btn: { paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  btnPrimary: { backgroundColor: "#2196F3" },
  btnGhost: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#ccc" },
  btnText: { color: "#fff", fontWeight: "800" },
  btnGhostText: { color: "#111", fontWeight: "800" },
});
