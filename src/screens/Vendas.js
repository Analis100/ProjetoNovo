// screens/Vendas.js
import React, { useState, useEffect, useMemo, useRef } from "react";
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
import { getVendorProfile } from "./services/colabProfile";

// ✅ MEI (usa o helper oficial com fluxo 2x + open direto no MEI proporcional)
import {
  getLimits,
  loadMonthList,
  saveMonthList,
  yearMonthKey,
  exigirConfigMeiProporcional,
} from "../utils/mei";

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { FORM_CARD } from "../styles/formCard";

/** =========================
 *  Loader SEGURO do sync (um caminho só)
 *  ========================= */
let cachedSyncAdicionar = null;
async function resolveSyncAdicionar() {
  if (cachedSyncAdicionar !== null) return cachedSyncAdicionar;
  try {
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
  return n / 100;
};

/* ===== Helpers de data ===== */
const ptBR = (d) =>
  new Date(d).toLocaleDateString("pt-BR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

const parsePtBrDate = (s) => {
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

const VENDAS_KEY = "venda";
const VENDAS_BUCKET = "venda";
const AGENDA_KEY = "agenda_clientes";
const LIMPEZA_KEY = "@MODO_LIMPEZA_PRAZO_VENDAS";
const LIMPEZA_TAPS_N = 7;

/* ===== Busca ===== */
const normalize = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/* ===== Cache mensal @VENDAS_YYYY-MM ===== */
function ymFromISO(iso) {
  const d = iso ? new Date(iso) : new Date();
  return yearMonthKey(d);
}
async function addToMonthCacheFromVenda(venda) {
  try {
    const ym = ymFromISO(venda?.dataISO);
    const lista = await loadMonthList(VENDAS_BUCKET, ym);

    // evita duplicar o mesmo id se salvar duas vezes
    const id = String(venda?.id || "");
    const limpa = (lista || []).filter((x) => String(x?.id) !== id);

    limpa.push({
      id: venda.id,
      dataISO: venda.dataISO,
      descricao: venda.descricao,
      valorNumber: Number(venda.valor || 0),
    });

    await saveMonthList(VENDAS_BUCKET, limpa, ym);
  } catch {}
}

async function removeFromMonthCacheByVenda(venda) {
  try {
    const id = String(venda?.id ?? "").trim();
    if (!id) return;

    const mesesParaTentar = [];
    if (venda?.dataISO) {
      mesesParaTentar.push(ymFromISO(venda.dataISO));
    } else {
      const now = new Date();
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      mesesParaTentar.push(yearMonthKey(now));
      mesesParaTentar.push(yearMonthKey(prev));
    }

    for (const ym of mesesParaTentar) {
      const lista = await loadMonthList(VENDAS_BUCKET, ym);
      const nova = (lista || []).filter((x) => String(x?.id) !== id);
      await saveMonthList(VENDAS_BUCKET, nova, ym);
    }
  } catch {}
}

/* ===== Toggle local para 'avisos' ===== */
const KEY_LIMITS = "@MEI_LIMITS";
async function setAvisosFlag(flag) {
  try {
    const lim = await getLimits();
    const next = { ...lim, avisos: !!flag };
    await AsyncStorage.setItem(KEY_LIMITS, JSON.stringify(next));
    return next;
  } catch {
    const defaults = { anual: 81000, mensal: 81000 / 12, avisos: !!flag };
    await AsyncStorage.setItem(KEY_LIMITS, JSON.stringify(defaults));
    return defaults;
  }
}

/* ===== ESTOQUE & CMV Helpers ===== */
async function getEstoqueItem(codigo) {
  const js = await AsyncStorage.getItem("estoque");
  const lista = js ? JSON.parse(js) : [];
  const idx = lista.findIndex((p) => String(p.codigo) === String(codigo));
  return { lista, idx };
}
function calcCustoUnitarioAtual(item) {
  if (!item) return 0;
  const saldo = (Number(item.entrada) || 0) - (Number(item.saida) || 0);
  const fixo = Number(item.custoUnitarioFixo || 0);
  if (fixo > 0) return fixo;
  if (saldo <= 0) return 0;
  const vTotal = Number(item.valorTotal || 0);
  return vTotal / saldo;
}
async function atualizarEstoqueSaidaPorCusto(cod, quantidade, custoUnitRef) {
  const { lista, idx } = await getEstoqueItem(cod);
  if (idx < 0) return null;
  const it = lista[idx];
  const qtd = Number(quantidade || 0);
  if (qtd <= 0) return null;

  const custoUnit =
    typeof custoUnitRef === "number" && custoUnitRef > 0
      ? custoUnitRef
      : calcCustoUnitarioAtual(it);
  const custoTotal = custoUnit * qtd;

  it.saida = (Number(it.saida) || 0) + qtd;
  const novoValor = Number(it.valorTotal || 0) - Number(custoTotal || 0);
  it.valorTotal = novoValor > 0 ? novoValor : 0;

  lista[idx] = it;
  await AsyncStorage.setItem("estoque", JSON.stringify(lista));
  return { custoUnit, custoTotal };
}
async function atualizarEstoqueRetornoPorCusto(
  cod,
  quantidade,
  custoUnitDaVenda,
) {
  const { lista, idx } = await getEstoqueItem(cod);
  if (idx < 0) return null;
  const it = lista[idx];
  const qtd = Number(quantidade || 0);
  if (qtd <= 0) return null;

  const custoUnit =
    typeof custoUnitDaVenda === "number" && custoUnitDaVenda > 0
      ? custoUnitDaVenda
      : calcCustoUnitarioAtual(it);
  const custoTotal = custoUnit * qtd;

  it.saida = Math.max(0, (Number(it.saida) || 0) - qtd);
  it.valorTotal = Number(it.valorTotal || 0) + Number(custoTotal || 0);

  lista[idx] = it;
  await AsyncStorage.setItem("estoque", JSON.stringify(lista));
  return { custoUnit, custoTotal };
}

// ===== CMV helpers (registrar e excluir) =====
async function registrarCMVFromVendaManual(venda) {
  try {
    if (!venda?.codigo || !(Number(venda?.qtd) > 0)) return;
    const js = await AsyncStorage.getItem("cmvRegistros");
    const arr = js ? JSON.parse(js) : [];
    arr.push({
      id: `cmv-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      vendaId: venda.id,
      dataISO: venda.dataISO,
      codigo: venda.codigo,
      descricao: venda.descricao || "",
      qtd: Number(venda.qtd || 0),
      custoUnit: Number(venda.cmvCustoUnit || 0),
      custoTotal: Number(venda.cmvCustoTotal || 0),
      valorVenda: Number(venda.valor || 0),
      origem: "Venda à vista",
    });
    await AsyncStorage.setItem("cmvRegistros", JSON.stringify(arr));
  } catch {}
}
async function removeCMVByVendaId(vendaId) {
  try {
    const raw = await AsyncStorage.getItem("cmvRegistros");
    const arr = raw ? JSON.parse(raw) : [];
    const nova = (arr || []).filter((r) => r.vendaId !== vendaId);
    await AsyncStorage.setItem("cmvRegistros", JSON.stringify(nova));
  } catch {}
}

// ✅ placeholders visíveis em Samsung/Moto
const PLACEHOLDER = "#777";

// ===== identificação do tipo de venda =====
const isPrazo = (it) => String(it?.origem || "").toLowerCase() === "prazo";

export default function Vendas() {
  const navigation = useNavigation();

  const savingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);

  // ===== Estados principais =====
  const [viewMode, setViewMode] = useState("day"); // "day" | "month"
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);

  // ===== MODO OCULTO + SENHA (limpeza de vendas a prazo antigas) =====
  const [modoLimpeza, setModoLimpeza] = useState(false);
  const [tapTitulo, setTapTitulo] = useState(0);

  const [modalSenhaLimpeza, setModalSenhaLimpeza] = useState(false);
  const [senhaLimpeza, setSenhaLimpeza] = useState("");
  const [acaoLimpezaPendente, setAcaoLimpezaPendente] = useState(null); // "toggle"

  const [codigo, setCodigo] = useState("");
  const [qtd, setQtd] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState(""); // "R$ 0,00"
  const [vendas, setVendas] = useState([]);
  const [soma, setSoma] = useState(0);

  // Filtro dinâmico
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todas"); // "todas" | "vista" | "prazo"

  // exclusão com senha + confirmação final
  const [modalSenha, setModalSenha] = useState(false);
  const [senhaDigitada, setSenhaDigitada] = useState("");
  const [vendaIdParaExcluir, setVendaIdParaExcluir] = useState(null);

  // colaboradores
  const [colaboradores, setColaboradores] = useState([]);
  const [colabSelecionado, setColabSelecionado] = useState(null); // id
  const [modalColab, setModalColab] = useState(false);

  // perfil de vendedor neste aparelho
  const [vendorProfile, setVendorProfile] = useState(null);
  const isVendor = !!vendorProfile;

  // resumo mensal por colaborador
  const [resumoMensalColab, setResumoMensalColab] = useState([]);

  // Limites
  const [limites, setLimitesState] = useState({
    anual: 81000,
    mensal: 81000 / 12,
    avisos: true,
  });

  // Mapa id -> colaborador
  const colabMap = useMemo(() => {
    const map = {};
    for (const c of colaboradores) map[c.id] = c;
    return map;
  }, [colaboradores]);

  const isOnCurrentPeriod = useMemo(() => {
    const today = new Date();
    return viewMode === "day"
      ? isSameDay(selectedDate, today)
      : isSameMonth(selectedDate, today);
  }, [selectedDate, viewMode]);

  // carrega colaboradores + limites
  useEffect(() => {
    async function loadColabsELimits() {
      try {
        const raw = await AsyncStorage.getItem("@colaboradores_v2");
        const lista = raw ? JSON.parse(raw) : [];
        const ativos = (lista || []).filter((c) => c.ativo);
        setColaboradores(ativos);
      } catch {}
      try {
        const lim = await getLimits();
        setLimitesState({
          anual: Number(lim.anual) || 81000,
          mensal: Number(lim.mensal) || 81000 / 12,
          avisos: lim.avisos !== false,
        });
      } catch {}
    }
    loadColabsELimits();
    const unsub = navigation.addListener("focus", loadColabsELimits);
    return unsub;
  }, [navigation]);

  // carrega perfil de vendedor
  useEffect(() => {
    (async () => {
      try {
        const prof = await getVendorProfile();
        if (prof && prof.collaboratorId) {
          setVendorProfile(prof);
          setColabSelecionado(prof.collaboratorId);
        } else {
          setVendorProfile(null);
        }
      } catch {
        setVendorProfile(null);
      }
    })();
  }, []);

  const titulo = useMemo(() => {
    if (viewMode === "day") return `Vendas – ${ptBR(selectedDate)}`;
    const mm = String(selectedDate.getMonth() + 1).padStart(2, "0");
    return `Vendas – ${mm}/${selectedDate.getFullYear()} (mensal)`;
  }, [selectedDate, viewMode]);

  const atualizarDemonstrativo = async (totalVendas, diaPtBr) => {
    const hoje = diaPtBr || ptBR(selectedDate);
    const demoJ = await AsyncStorage.getItem("demonstrativoMensal");
    const demo = demoJ ? JSON.parse(demoJ) : {};
    const dia = demo[hoje] || {
      saldoAnterior: 0,
      vendas: 0,
      despesas: 0,
      saldoFinal: 0,
    };
    dia.vendas = Number(totalVendas || 0);
    dia.saldoFinal =
      Number(dia.saldoAnterior || 0) +
      Number(dia.vendas || 0) -
      Number(dia.despesas || 0);
    demo[hoje] = dia;
    await AsyncStorage.setItem("demonstrativoMensal", JSON.stringify(demo));
  };

  const carregarVendas = async (refDate = new Date(), mode = "day") => {
    const json = await AsyncStorage.getItem(VENDAS_KEY);
    const lista = json ? JSON.parse(json) : [];

    const doPeriodo = (Array.isArray(lista) ? lista : []).filter((item) => {
      const d = getItemDate(item);
      return mode === "day" ? isSameDay(d, refDate) : isSameMonth(d, refDate);
    });

    setVendas(doPeriodo);

    const totalPeriodo = doPeriodo.reduce(
      (a, c) => a + Number(c.valor || 0),
      0,
    );
    setSoma(totalPeriodo);

    if (mode === "day") {
      await atualizarDemonstrativo(totalPeriodo, ptBR(refDate));
    }

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

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(LIMPEZA_KEY);
        if (raw === "1") setModoLimpeza(true);
      } catch {}
    })();
  }, []);

  const onTapTitulo = () => {
    setTapTitulo((prev) => {
      const n = prev + 1;
      if (n >= LIMPEZA_TAPS_N) {
        pedirSenhaModoLimpeza();
        return 0;
      }
      return n;
    });
  };

  useEffect(() => {
    const unsub = navigation.addListener("focus", () =>
      carregarVendas(selectedDate, viewMode),
    );
    carregarVendas(selectedDate, viewMode);
    return unsub;
  }, [navigation, selectedDate, viewMode]);

  // ✅ lista filtrada: tipo + busca
  const vendasFiltradas = useMemo(() => {
    let base = Array.isArray(vendas) ? vendas : [];

    if (filtroTipo === "prazo") base = base.filter((it) => isPrazo(it));
    else if (filtroTipo === "vista") base = base.filter((it) => !isPrazo(it));

    const q = normalize(busca);
    if (!q) return base;

    const terms = q.split(/\s+/).filter(Boolean);
    return base.filter((it) => {
      const nomeColab = it.colaboradorId
        ? colabMap[it.colaboradorId]?.nome || ""
        : "";
      const hay = normalize(
        `${it.codigo || ""} ${it.descricao || ""} ${nomeColab || ""}`,
      );
      return terms.every((t) => hay.includes(t));
    });
  }, [vendas, busca, colabMap, filtroTipo]);

  const totalFiltrado = useMemo(
    () => vendasFiltradas.reduce((a, c) => a + Number(c.valor || 0), 0),
    [vendasFiltradas],
  );

  // ===== SALVAR (venda à vista/manual) =====
  const salvarVenda = async () => {
    if (savingRef.current) return; // ✅ trava clique duplo
    savingRef.current = true;
    setIsSaving(true);

    try {
      Keyboard.dismiss();

      const pode = await exigirConfigMeiProporcional({
        navigation,
        origem: "Vendas",
      });
      if (!pode) return;

      if (!descricao || !valor || !codigo || !qtd) {
        Alert.alert("Erro", "Preencha todos os dados para salvar a venda.");
        return;
      }

      const valorNumerico = parseBRL(valor);
      const qtdNumerica = parseFloat(qtd);
      if (isNaN(qtdNumerica) || qtdNumerica <= 0) {
        Alert.alert("Erro", "Informe uma quantidade válida.");
        return;
      }
      if (valorNumerico <= 0) {
        Alert.alert("Erro", "Informe um valor maior que zero.");
        return;
      }

      const colaboradorIdToUse = isVendor
        ? vendorProfile?.collaboratorId || null
        : colabSelecionado || null;

      const agoraISO = new Date().toISOString();

      // ✅ 1) CONFERIR ESTOQUE ANTES DE VENDER
      let itemEstoque = null;
      try {
        const { lista, idx } = await getEstoqueItem(codigo);
        if (idx < 0) {
          Alert.alert(
            "Produto não encontrado",
            "Este código não está cadastrado no Controle de Estoque. Cadastre primeiro o produto.",
          );
          return;
        }

        itemEstoque = lista[idx];

        const entrada = Number(itemEstoque.entrada) || 0;
        const saida = Number(itemEstoque.saida) || 0;
        const saldoDisponivel = entrada - saida;

        if (saldoDisponivel <= 0) {
          Alert.alert(
            "Estoque zerado",
            "Não há saldo disponível deste produto no estoque.",
          );
          return;
        }

        if (qtdNumerica > saldoDisponivel) {
          Alert.alert(
            "Estoque insuficiente",
            `Quantidade em estoque: ${saldoDisponivel}. Ajuste a quantidade da venda.`,
          );
          return;
        }
      } catch (e) {
        console.log("Erro ao consultar estoque:", e);
        Alert.alert(
          "Erro no estoque",
          "Não foi possível verificar o saldo do estoque. Tente novamente.",
        );
        return;
      }

      // ✅ 2) custo (antes da baixa)
      let cmvCustoUnit = 0;
      let cmvCustoTotal = 0;
      try {
        cmvCustoUnit = calcCustoUnitarioAtual(itemEstoque);
        cmvCustoTotal = cmvCustoUnit * qtdNumerica;
      } catch {}

      const novaVenda = {
        id: `rc-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        descricao: descricao.trim(),
        valor: valorNumerico,
        codigo: codigo.trim(),
        qtd: qtdNumerica,
        data: ptBR(agoraISO),
        dataISO: agoraISO,
        origem: "manual", // ✅ à vista
        colaboradorId: colaboradorIdToUse,

        // ✅ campos para estorno consistente no excluir
        estoqueCodigo: codigo.trim(),
        estoqueQtd: qtdNumerica,
        estoqueCustoUnit: Number(cmvCustoUnit.toFixed(2)),

        cmvCustoUnit: Number(cmvCustoUnit.toFixed(2)),
        cmvCustoTotal: Number(cmvCustoTotal.toFixed(2)),
      };

      const commitVenda = async () => {
        try {
          const raw = await AsyncStorage.getItem(VENDAS_KEY);
          const todas = raw ? JSON.parse(raw) : [];
          const novoArr = Array.isArray(todas)
            ? [...todas, novaVenda]
            : [novaVenda];
          await AsyncStorage.setItem(VENDAS_KEY, JSON.stringify(novoArr));

          try {
            await addToMonthCacheFromVenda(novaVenda);
          } catch {}

          try {
            const colabId = colaboradorIdToUse;
            if (colabId && Number(valorNumerico) > 0) {
              const valorCents = Math.round(Number(valorNumerico) * 100);
              await addSaleToCollaborator(
                colabId,
                valorCents,
                new Date(agoraISO),
              );
            }
          } catch {}

          try {
            await atualizarEstoqueSaidaPorCusto(
              codigo,
              qtdNumerica,
              novaVenda.cmvCustoUnit,
            );
          } catch {}

          try {
            await registrarCMVFromVendaManual(novaVenda);
          } catch {}

          try {
            await syncAdicionarSafe(VENDAS_KEY, novaVenda);
          } catch {}

          setDescricao("");
          setValor("");
          setCodigo("");
          setQtd("");
          await carregarVendas(selectedDate, viewMode);
        } catch (e) {
          console.error("Erro ao salvar venda:", e);
          Alert.alert(
            "Erro",
            "Não foi possível salvar a venda. Tente novamente.",
          );
        }
      };

      // ✅ MEI: usa SOMENTE "venda"
      try {
        if (limites?.avisos === false) {
          await commitVenda();
          return;
        }

        const rawAll = await AsyncStorage.getItem(VENDAS_KEY);
        const all = rawAll ? JSON.parse(rawAll) : [];
        const nowDate = new Date(agoraISO);

        const totalMesAtual = (Array.isArray(all) ? all : [])
          .filter((it) => isSameMonth(getItemDate(it), nowDate))
          .reduce((a, c) => a + Number(c.valor || 0), 0);

        const projetado = totalMesAtual + valorNumerico;

        if (limites.mensal > 0) {
          const pAtual = (totalMesAtual / limites.mensal) * 100;
          const pProj = (projetado / limites.mensal) * 100;

          if (pAtual < 80 && pProj >= 80 && pProj < 100) {
            Alert.alert(
              "Atenção",
              `Com esta venda você atingirá ${Math.floor(
                pProj,
              )}% do limite mensal do MEI.`,
              [
                { text: "Fechar" },
                {
                  text: "Desativar avisos",
                  onPress: async () => {
                    const novos = await setAvisosFlag(false);
                    setLimitesState(novos);
                    Alert.alert("Feito", "Avisos de limite desativados.");
                  },
                },
              ],
            );
          }

          if (pProj >= 100) {
            Alert.alert(
              "Vai ultrapassar o limite",
              `Esta venda levará a ${Math.floor(
                pProj,
              )}% do limite mensal. Deseja salvar mesmo assim?`,
              [
                { text: "Cancelar" },
                {
                  text: "Desativar avisos",
                  onPress: async () => {
                    const novos = await setAvisosFlag(false);
                    setLimitesState(novos);
                    Alert.alert("Feito", "Avisos de limite desativados.");
                  },
                },
                { text: "Salvar mesmo assim", onPress: () => commitVenda() },
              ],
            );
            return;
          }
        }
      } catch {}

      await commitVenda();
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  // ✅ excluir por ID (não por índice) — evita erro quando lista está filtrada
  const executarExclusaoById = async (vendaId) => {
    if (!vendaId) return;

    const json = await AsyncStorage.getItem(VENDAS_KEY);
    const lista = json ? JSON.parse(json) : [];

    const indexGlobal = (Array.isArray(lista) ? lista : []).findIndex(
      (x) => String(x?.id) === String(vendaId),
    );
    if (indexGlobal < 0) return;

    const removida = lista[indexGlobal];

    // Agenda (se existir)
    if (removida?.agendaEventoId && removida?.agendaParcelaId) {
      try {
        const rawAg = await AsyncStorage.getItem(AGENDA_KEY);
        const arrAg = rawAg ? JSON.parse(rawAg) : [];
        const novoAg = Array.isArray(arrAg)
          ? arrAg.map((ev) => {
              if (ev.id !== removida.agendaEventoId) return ev;
              const det = (ev.parcelasDetalhe || []).map((p) =>
                p.id === removida.agendaParcelaId
                  ? { ...p, pago: false, pagoEm: null, vendasId: undefined }
                  : p,
              );
              return { ...ev, parcelasDetalhe: det };
            })
          : [];
        await AsyncStorage.setItem(AGENDA_KEY, JSON.stringify(novoAg));
      } catch {}
    }

    // remove venda
    lista.splice(indexGlobal, 1);
    await AsyncStorage.setItem(VENDAS_KEY, JSON.stringify(lista));

    // remove CMV
    try {
      if (removida?.id) await removeCMVByVendaId(removida.id);
    } catch {}

    // ✅ estorno de estoque (quando houver baixa registrada)
    if (
      removida?.estoqueCodigo &&
      Number(removida?.estoqueQtd) > 0 &&
      removida?.origem !== "Agenda"
    ) {
      try {
        await atualizarEstoqueRetornoPorCusto(
          removida.estoqueCodigo,
          Number(removida.estoqueQtd),
          Number(removida.estoqueCustoUnit || 0),
        );
      } catch {}
    }

    // cache mensal
    try {
      if (removida) await removeFromMonthCacheByVenda(removida);
    } catch {}

    // estorna colaborador
    try {
      if (removida?.colaboradorId && Number(removida?.valor) > 0) {
        await addSaleToCollaborator(
          removida.colaboradorId,
          -Math.round(Number(removida.valor) * 100),
          new Date(removida.dataISO || Date.now()),
        );
      }
    } catch {}

    await carregarVendas(selectedDate, viewMode);
  };

  const marcarErroLinha = (id, flag = true) => {
    setVendas((prev) => {
      const nova = [...(Array.isArray(prev) ? prev : [])];
      const idx = nova.findIndex((x) => String(x?.id) === String(id));
      if (idx >= 0) nova[idx] = { ...nova[idx], erroSenha: !!flag };
      return nova;
    });
  };
  const limparErroLinha = (id) => marcarErroLinha(id, false);

  const abrirConfirmacaoFinalExcluir = (item) => {
    if (!item) return;

    const valorFmt = fmtValor(item.valor);
    const msg =
      `Excluir esta venda?\n\n` +
      (item.codigo ? `Código: ${item.codigo}\n` : "") +
      (item.qtd ? `Qtd: ${item.qtd}\n` : "") +
      `Descrição: ${item.descricao}\n` +
      `Valor: ${valorFmt}\n\n` +
      `Obs.: O estoque será estornado se esta venda tiver baixa registrada. ` +
      `Se veio da Agenda, a parcela será reaberta.`;

    Alert.alert("Confirmar exclusão", msg, [
      {
        text: "Cancelar",
        style: "cancel",
        onPress: () => {
          limparErroLinha(item?.id);
          setVendaIdParaExcluir(null);
        },
      },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          await executarExclusaoById(item?.id);
          limparErroLinha(item?.id);
          setVendaIdParaExcluir(null);
          Alert.alert("Removido", "Venda excluída.");
        },
      },
    ]);
  };

  const confirmarExclusao = (item) => {
    if (!item?.id) return;
    setVendaIdParaExcluir(item.id);
    setSenhaDigitada("");
    setModalSenha(true);
  };

  const confirmarSenhaParaExcluir = async () => {
    const senhaSalva = (await AsyncStorage.getItem("senhaAcesso")) || "1234";
    const senhaOk = senhaDigitada === senhaSalva;

    setModalSenha(false);
    setSenhaDigitada("");

    if (!senhaOk) {
      if (vendaIdParaExcluir) marcarErroLinha(vendaIdParaExcluir, true);
      return;
    }

    const item = vendasFiltradas.find(
      (x) => String(x?.id) === String(vendaIdParaExcluir),
    );
    if (!item) return;
    abrirConfirmacaoFinalExcluir(item);
  };

  const pedirSenhaModoLimpeza = () => {
    setSenhaLimpeza("");
    setAcaoLimpezaPendente("toggle");
    setModalSenhaLimpeza(true);
  };
  const confirmarSenhaModoLimpeza = async () => {
    try {
      const senhaSalva = (await AsyncStorage.getItem("senhaAcesso")) || "1234";
      const ok = senhaLimpeza === senhaSalva;

      if (!ok) {
        setModalSenhaLimpeza(false);
        setSenhaLimpeza("");
        Alert.alert("Senha incorreta", "Modo limpeza não foi alterado.");
        return;
      }

      setModalSenhaLimpeza(false);
      setSenhaLimpeza("");

      if (acaoLimpezaPendente === "toggle") {
        const next = !modoLimpeza;
        setModoLimpeza(next);
        try {
          await AsyncStorage.setItem(LIMPEZA_KEY, next ? "1" : "0");
        } catch {}

        Alert.alert(
          "Modo Limpeza",
          next
            ? "✅ ATIVADO: você pode excluir vendas a prazo antigas para limpar o Mês/MEI.\n\n⚠️ Use só para manutenção."
            : "🔒 DESATIVADO: exclusão de venda a prazo volta a ser bloqueada.",
        );
      }

      setAcaoLimpezaPendente(null);
    } catch (e) {
      setModalSenhaLimpeza(false);
      setSenhaLimpeza("");
      Alert.alert("Erro", "Não foi possível validar a senha agora.");
    }
  };

  const renderItem = ({ item }) => {
    const seloAgenda = item?.origem === "Agenda";
    const nomeColab = item.colaboradorId
      ? colabMap[item.colaboradorId]?.nome
      : null;
    const dataPt = getItemDate(item).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    const tagTipo = isPrazo(item) ? "  [A PRAZO]" : "  [À VISTA]";
    const ehVendaPrazo = isPrazo(item);

    return (
      <View style={styles.itemLinha}>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.itemLista,
              seloAgenda && { color: "#6f42c1", fontWeight: "600" },
              item.erroSenha && { color: "red" },
            ]}
          >
            {`${item.codigo ? item.codigo + " • " : ""}${item.descricao}${
              item.qtd ? ` (${item.qtd})` : ""
            } – ${fmtValor(item.valor)}${nomeColab ? ` • ${nomeColab}` : ""}${
              seloAgenda ? "  [Agenda]" : tagTipo
            }`}
          </Text>
          <Text style={styles.itemSub}>{dataPt}</Text>
        </View>

        <TouchableOpacity
          onPress={() => {
            if (ehVendaPrazo && !modoLimpeza) {
              Alert.alert(
                "Exclusão bloqueada",
                "Esta venda é uma VENDA A PRAZO.\n\nPara excluir corretamente (remover também da Relação de Clientes e do Cliente Prazo), faça a exclusão na tela:\nRelação de Clientes.",
              );
              return;
            }

            if (ehVendaPrazo && modoLimpeza) {
              Alert.alert(
                "Modo Limpeza",
                "⚠️ Você está no MODO LIMPEZA.\n\nExcluir aqui serve apenas para limpar vendas antigas que ficaram no Mês/MEI.\n\nDeseja excluir esta venda a prazo?",
                [
                  { text: "Cancelar", style: "cancel" },
                  {
                    text: "Excluir",
                    style: "destructive",
                    onPress: () => confirmarExclusao(item),
                  },
                ],
              );
              return;
            }

            confirmarExclusao(item);
          }}
          style={ehVendaPrazo ? { opacity: 0.4 } : null}
        >
          <Text style={styles.excluir}>Excluir</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const totalFooter = useMemo(
    () => (
      <Text style={styles.total}>
        Total: {fmtValor(soma)}
        {busca || filtroTipo !== "todas"
          ? `   •   Filtrado: ${fmtValor(totalFiltrado)}`
          : ""}
      </Text>
    ),
    [soma, busca, totalFiltrado, filtroTipo],
  );

  const imprimirVendas = async () => {
    if (!vendasFiltradas || vendasFiltradas.length === 0) {
      Alert.alert("Nada para imprimir", "Não há vendas neste período.");
      return;
    }

    const tituloRelatorio =
      viewMode === "day"
        ? `Vendas do dia ${ptBR(selectedDate)}`
        : `Vendas do mês ${String(selectedDate.getMonth() + 1).padStart(
            2,
            "0",
          )}/${selectedDate.getFullYear()}`;

    const linhas = vendasFiltradas
      .map(
        (v) => `
        <tr>
          <td>${v.data || ""}</td>
          <td>${v.descricao || ""}</td>
          <td style="text-align:right;">${fmtValor(v.valor)}</td>
        </tr>
      `,
      )
      .join("");

    const html = `
    <html>
      <body style="font-family: Arial; padding: 24px;">
        <h2 style="text-align:center;">${tituloRelatorio}</h2>

        <table width="100%" border="1" cellspacing="0" cellpadding="6">
          <thead>
            <tr style="background:#f0f0f0;">
              <th>Data</th>
              <th>Descrição</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            ${linhas}
          </tbody>
        </table>

        <h3 style="text-align:right; margin-top:16px;">
          Total: ${fmtValor(totalFiltrado || soma)}
        </h3>
      </body>
    </html>
  `;

    try {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri);
    } catch (e) {
      console.log("Erro ao imprimir vendas:", e);
      Alert.alert("Erro", "Não foi possível gerar o relatório.");
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <FlatList
        contentContainerStyle={{
          padding: 16,
          backgroundColor: "#F2F2F2",
          paddingBottom: 220,
          flexGrow: 1,
        }}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        data={vendasFiltradas}
        extraData={vendasFiltradas}
        keyExtractor={(item) =>
          String(
            item?.id ||
              `${item?.dataISO || ""}-${item?.descricao || ""}-${item?.valor || ""}`,
          )
        }
        renderItem={renderItem}
        ListHeaderComponent={
          <>
            <TouchableOpacity activeOpacity={1} onPress={onTapTitulo}>
              <Text style={styles.titulo}>{titulo}</Text>
            </TouchableOpacity>

            {modoLimpeza && (
              <View
                style={{
                  backgroundColor: "#fff3cd",
                  borderColor: "#ffeeba",
                  borderWidth: 1,
                  padding: 10,
                  borderRadius: 10,
                  marginBottom: 10,
                }}
              >
                <Text style={{ fontWeight: "800", color: "#856404" }}>
                  ⚠️ MODO LIMPEZA ATIVO
                </Text>
                <Text style={{ color: "#856404", marginTop: 4 }}>
                  Excluir venda a prazo está liberado apenas para limpar
                  registros antigos do Mês/MEI.
                </Text>

                <TouchableOpacity
                  onPress={pedirSenhaModoLimpeza}
                  style={{
                    marginTop: 8,
                    alignSelf: "flex-start",
                    borderWidth: 1,
                    borderColor: "#856404",
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 8,
                    backgroundColor: "#fff",
                  }}
                >
                  <Text style={{ fontWeight: "800", color: "#856404" }}>
                    Desativar agora
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ✅ CARD: filtros + busca */}
            <View style={styles.card}>
              <View style={styles.filtersRow}>
                <View style={styles.segment}>
                  <TouchableOpacity
                    style={[
                      styles.segBtn,
                      viewMode === "day" && styles.segBtnActive,
                    ]}
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
                  style={styles.smallBtn}
                  onPress={() => {
                    if (isOnCurrentPeriod) setShowPicker(true);
                    else {
                      setSelectedDate(new Date());
                      setShowPicker(false);
                    }
                  }}
                >
                  <Text style={styles.smallBtnTxt}>
                    {isOnCurrentPeriod
                      ? "Filtro por Data"
                      : "Voltar à data atual"}
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

              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <TouchableOpacity
                  style={[styles.smallBtn, { flex: 1 }]}
                  onPress={() =>
                    navigation.navigate("CalculoLimiteMEI", {
                      refDate:
                        selectedDate?.toISOString?.() ||
                        new Date().toISOString(),
                      limites,
                      viewMode,
                    })
                  }
                >
                  <Text style={styles.smallBtnTxt}>
                    Ver Cálculo do Limite MEI
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.smallBtn,
                    { backgroundColor: "#2e7d32", paddingHorizontal: 16 },
                  ]}
                  onPress={imprimirVendas}
                >
                  <Text style={[styles.smallBtnTxt, { color: "#fff" }]}>
                    Imprimir
                  </Text>
                </TouchableOpacity>
              </View>

              <TextInput
                placeholder="Pesquisar por código, descrição ou colaborador..."
                placeholderTextColor={PLACEHOLDER}
                underlineColorAndroid="transparent"
                style={styles.searchInput}
                value={busca}
                onChangeText={setBusca}
                returnKeyType="search"
              />
            </View>

            {/* ✅ CARD: formulário venda */}
            <View style={styles.card}>
              <View style={styles.boxVenda}>
                <TextInput
                  style={styles.inputCod}
                  placeholder="Código"
                  placeholderTextColor={PLACEHOLDER}
                  underlineColorAndroid="transparent"
                  value={codigo}
                  onChangeText={setCodigo}
                />
                <TextInput
                  style={styles.inputQtd}
                  placeholder="Qtd"
                  placeholderTextColor={PLACEHOLDER}
                  underlineColorAndroid="transparent"
                  keyboardType="numeric"
                  value={qtd}
                  onChangeText={setQtd}
                />
              </View>

              <TextInput
                style={styles.input}
                placeholder="Descrição"
                placeholderTextColor={PLACEHOLDER}
                underlineColorAndroid="transparent"
                value={descricao}
                onChangeText={setDescricao}
              />

              <TextInput
                style={styles.input}
                placeholder="Valor"
                placeholderTextColor={PLACEHOLDER}
                underlineColorAndroid="transparent"
                keyboardType="numeric"
                value={valor}
                onChangeText={(t) => setValor(maskBRL(t))}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              {isVendor && vendorProfile ? (
                <View style={styles.vendorBox}>
                  <Text style={styles.vendorTitle}>Modo vendedor ativo</Text>
                  <Text style={styles.vendorLabel}>
                    Todas as vendas deste aparelho serão lançadas para:
                  </Text>
                  <Text style={styles.vendorValue}>
                    {vendorProfile.displayName ||
                      (colaboradores.find(
                        (c) => c.id === vendorProfile.collaboratorId,
                      )?.nome ??
                        vendorProfile.collaboratorId)}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.select}
                  onPress={() => setModalColab(true)}
                >
                  <Text style={styles.selectTxt}>
                    {colabSelecionado
                      ? colaboradores.find((c) => c.id === colabSelecionado)
                          ?.nome || "Selecionado"
                      : "Selecionar Vendedor (colaborador)"}
                  </Text>
                </TouchableOpacity>
              )}

              <View style={styles.botaoRow}>
                <TouchableOpacity
                  style={[styles.botao, isSaving && { opacity: 0.55 }]}
                  onPress={salvarVenda}
                  disabled={isSaving}
                >
                  <Text style={styles.botaoTexto}>
                    {isSaving ? "Salvando..." : "Inserir Venda à Vista"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.botao}
                  onPress={async () => {
                    try {
                      if (codigo && qtd) {
                        await AsyncStorage.setItem(
                          "@ultimaVendaPrazoProduto",
                          JSON.stringify({ codigo, qtd: Number(qtd) || 0 }),
                        );
                      }
                    } catch {}
                    navigation.navigate("RelacaoClientes");
                  }}
                >
                  <Text style={styles.botaoTexto}>Inserir Venda a Prazo</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        }
        ListEmptyComponent={
          <Text style={{ textAlign: "center", color: "#666", marginTop: 8 }}>
            {busca ? "Sem resultados para a busca." : "Sem vendas no período."}
          </Text>
        }
        ListFooterComponent={
          <>
            {totalFooter}
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
                      <Text style={{ fontWeight: "700" }}>
                        {fmtValor(r.total)}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            )}
          </>
        }
      />

      {/* MODAL COLABORADOR */}
      <Modal visible={modalColab} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalList}>
            <Text style={styles.modalTitle}>
              Selecionar Vendedor (colaborador)
            </Text>

            {!colaboradores || colaboradores.length === 0 ? (
              <>
                <Text style={{ color: "#555", marginBottom: 10 }}>
                  Você ainda não tem colaboradores ativos.
                </Text>
                <TouchableOpacity
                  style={[styles.botao, { alignSelf: "flex-start" }]}
                  onPress={() => {
                    setModalColab(false);
                    navigation.navigate("Colaboradores");
                  }}
                >
                  <Text style={styles.botaoTexto}>
                    Cadastrar/gerenciar colaboradores
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.itemColab}
                  onPress={() => {
                    setColabSelecionado(null);
                    setModalColab(false);
                  }}
                >
                  <Text style={styles.itemColabTxt}>— Sem colaborador —</Text>
                  <Text style={styles.itemColabSub}>
                    Não vincular esta venda
                  </Text>
                </TouchableOpacity>

                {colaboradores.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={styles.itemColab}
                    onPress={() => {
                      setColabSelecionado(c.id);
                      setModalColab(false);
                    }}
                  >
                    <Text style={styles.itemColabTxt}>
                      {c.nome || "Colaborador"}
                    </Text>
                    {c.funcao ? (
                      <Text style={styles.itemColabSub}>{c.funcao}</Text>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </>
            )}

            <TouchableOpacity
              style={[styles.btnFechar, { alignSelf: "flex-end" }]}
              onPress={() => setModalColab(false)}
            >
              <Text style={{ fontWeight: "700", color: "#111" }}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL SENHA (produção) */}
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
              placeholderTextColor={PLACEHOLDER}
              underlineColorAndroid="transparent"
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
                  setVendaIdParaExcluir(null);
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

      {/* MODAL SENHA - MODO LIMPEZA */}
      <Modal visible={modalSenhaLimpeza} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={{ marginBottom: 6, fontWeight: "800", color: "#111" }}>
              Digite a senha para {modoLimpeza ? "DESATIVAR" : "ATIVAR"} o Modo
              Limpeza:
            </Text>

            <TextInput
              secureTextEntry
              style={styles.input}
              value={senhaLimpeza}
              onChangeText={setSenhaLimpeza}
              placeholder="Senha"
              placeholderTextColor={PLACEHOLDER}
              underlineColorAndroid="transparent"
              autoFocus
            />

            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <TouchableOpacity
                style={[styles.botao, { borderColor: "#999" }]}
                onPress={() => {
                  setModalSenhaLimpeza(false);
                  setSenhaLimpeza("");
                  setAcaoLimpezaPendente(null);
                }}
              >
                <Text style={[styles.botaoTexto, { color: "#999" }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.botao}
                onPress={confirmarSenhaModoLimpeza}
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
  container: { flex: 1, padding: 16, backgroundColor: "#F2F2F2" },

  card: {
    ...FORM_CARD,
    backgroundColor: "#FAFAFA",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
  },

  titulo: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
    color: "#111",
  },

  filtersRow: { flexDirection: "row", alignItems: "center", gap: 8 },

  segment: {
    flexDirection: "row",
    backgroundColor: "#eee",
    borderRadius: 999,
    padding: 4,
  },
  segBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999 },
  segBtnActive: { backgroundColor: "#4f46e5" },
  segTxt: { fontWeight: "700", color: "#444" },
  segTxtActive: { color: "#fff" },

  smallBtn: {
    marginLeft: "auto",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
  },
  smallBtnTxt: { fontWeight: "700", color: "#111" },

  searchInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#fff",
    color: "#111",
  },

  boxVenda: { flexDirection: "row", gap: 6, marginTop: 4 },
  inputCod: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 8,
    borderRadius: 8,
    width: 110,
    backgroundColor: "#fff",
    color: "#111",
  },
  inputQtd: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 8,
    borderRadius: 8,
    width: 80,
    backgroundColor: "#fff",
    color: "#111",
  },

  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: "#fff",
    color: "#111",
  },

  select: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#fff",
    marginTop: 10,
  },
  selectTxt: { color: "#111" },

  vendorBox: {
    borderWidth: 1,
    borderColor: "#c7d2fe",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#eef2ff",
    marginTop: 10,
  },
  vendorTitle: { fontWeight: "800", color: "#1e293b", marginBottom: 4 },
  vendorLabel: { color: "#374151", fontSize: 13 },
  vendorValue: { marginTop: 2, fontWeight: "800", color: "#111827" },

  botaoRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  botao: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#bfa140",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 14,
  },
  botaoTexto: { color: "#bfa140", fontWeight: "bold", fontSize: 16 },

  itemLinha: {
    backgroundColor: "#fff",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderColor: "#E5E5E5",
  },
  itemLista: { fontSize: 16, flexShrink: 1, color: "#111" },
  itemSub: { fontSize: 12, color: "#666", marginTop: 2 },
  excluir: { color: "red", fontWeight: "bold", marginLeft: 10 },

  total: {
    marginTop: 12,
    fontWeight: "bold",
    fontSize: 18,
    textAlign: "center",
    color: "#1B5E20",
    backgroundColor: "#E8F5E9",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#C8E6C9",
  },

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
    borderWidth: 1,
    borderColor: "#E0E0E0",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
  },
  modalTitle: { fontWeight: "800", fontSize: 16, marginBottom: 8 },
  itemColab: { paddingVertical: 10 },
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
    borderWidth: 1,
    borderColor: "#E0E0E0",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
  },

  resumoCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FAFAFA",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
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
