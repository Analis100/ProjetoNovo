// screens/Compras.js
import React, { useEffect, useRef, useMemo, useState } from "react";
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
import { brMoney, yearMonthKey } from "../utils/mei";

/* ============ Constantes ============ */
const PLACEHOLDER = "#777";
const CAPITAL_KEY = "capitalGiroResumo";
const DESPESAS_KEY = "despesas";
const CONTAS_PAGAR_KEY = "contasPagar";
const VENDAS_KEY = "vendas";

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

  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
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

/* Data pt-BR -> Date a partir de dígitos */
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

async function atualizarContasPagarAposExcluirCompras(ajustes = []) {
  if (!Array.isArray(ajustes) || ajustes.length === 0) return;

  try {
    const raw = await AsyncStorage.getItem(CONTAS_PAGAR_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    const porKey = {};

    for (const aj of ajustes) {
      const key = aj.contasPagarKey;
      if (!key) continue;

      if (!porKey[key]) porKey[key] = [];
      porKey[key].push(aj);
    }

    for (const key of Object.keys(porKey)) {
      const dado = obj[key];
      if (!dado || typeof dado !== "object") continue;

      const ficha = dado.ficha || {};
      const parcelas = Array.isArray(dado.parcelas) ? dado.parcelas : [];
      const ajustesDoLote = porKey[key];

      let itens = Array.isArray(ficha.itens) ? [...ficha.itens] : [];

      for (const aj of ajustesDoLote) {
        if (aj.removerTotal) {
          itens = itens.filter(
            (it) => String(it.compraId) !== String(aj.compraId),
          );
        } else {
          itens = itens
            .map((it) => {
              if (String(it.compraId) !== String(aj.compraId)) return it;

              return {
                ...it,
                qtdNumber: Math.max(
                  0,
                  Number(it.qtdNumber || 0) - Number(aj.qtdRemovida || 0),
                ),
                valorNumber: Math.max(
                  0,
                  Number(it.valorNumber || 0) - Number(aj.valorRemovido || 0),
                ),
              };
            })
            .filter(
              (it) =>
                it &&
                (Number(it.qtdNumber || 0) > 0 ||
                  Number(it.valorNumber || 0) > 0),
            );
        }
      }

      const novoTotal = itens.reduce(
        (acc, it) => acc + Number(it.valorNumber || 0),
        0,
      );

      // ✅ Se apagou todos os itens do lote em Compras,
      // apaga também o lote inteiro em Contas a Pagar
      if (itens.length === 0 || novoTotal <= 0) {
        delete obj[key];
        continue;
      }

      const parcelasPagas = parcelas.filter((p) => p.pago);
      const parcelasPendentes = parcelas.filter((p) => !p.pago);

      const totalPago = parcelasPagas.reduce(
        (acc, p) => acc + Number(p.valor || 0),
        0,
      );

      const saldoPendente = Math.max(0, novoTotal - totalPago);

      let novasParcelas = parcelas;

      if (parcelasPendentes.length > 0) {
        const totalCents = Math.round(saldoPendente * 100);
        const qtdPendentes = parcelasPendentes.length;
        const base = Math.floor(totalCents / qtdPendentes);
        const resto = totalCents - base * qtdPendentes;
        let pendenteIndex = 0;

        novasParcelas = parcelas.map((p) => {
          if (p.pago) return p;

          const valorCents = base + (pendenteIndex < resto ? 1 : 0);
          pendenteIndex += 1;

          return {
            ...p,
            valor: valorCents / 100,
          };
        });
      }

      obj[key] = {
        ...dado,
        ficha: {
          ...ficha,
          valorTotal: novoTotal,
          atualizadoEm: formatDateBR(new Date()),
          itens,
        },
        parcelas: novasParcelas,
      };
    }

    await AsyncStorage.setItem(CONTAS_PAGAR_KEY, JSON.stringify(obj));
  } catch (e) {
    console.log(
      "Erro ao atualizar Contas a Pagar após exclusão:",
      e?.message || e,
    );
  }
}

/** ====== Sync seguro ====== */
async function syncAdicionarSafe(key, item) {
  try {
    const m = await import("./services/sync");
    if (typeof m?.syncAdicionar === "function") {
      await m.syncAdicionar(key, item);
    }
  } catch (e) {
    console.log("syncAdicionarSafe em Compras falhou:", e?.message || e);
  }
}

/* ======= Estoque: upsert pela compra ======= */
async function upsertEstoqueFromCompra(cod, desc, qtd, valor) {
  if (!cod || !(qtd > 0)) return;

  try {
    const json = await AsyncStorage.getItem("estoque");
    const arr = json ? JSON.parse(json) : [];
    const idx = arr.findIndex((p) => String(p.codigo) === String(cod));

    if (idx >= 0) {
      const it = arr[idx];
      it.entrada = (Number(it.entrada) || 0) + Number(qtd || 0);
      it.valorTotal = (Number(it.valorTotal) || 0) + Number(valor || 0);
      it.descricao = desc || it.descricao;
      it.data = Date.now();
    } else {
      arr.push({
        id: Date.now().toString(),
        codigo: cod,
        descricao: desc || "",
        entrada: Number(qtd || 0),
        saida: 0,
        valorTotal: Number(valor || 0),
        data: Date.now(),
      });
    }

    await AsyncStorage.setItem("estoque", JSON.stringify(arr));
  } catch (e) {
    console.log("Falha ao atualizar estoque via compras:", e?.message || e);
  }
}

export default function Compras() {
  const today = new Date();

  // mês selecionado
  const [selectedMonth, setSelectedMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );

  const ym = useMemo(() => ymKeyFromDate(selectedMonth), [selectedMonth]);

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

  // campos
  const [codigo, setCodigo] = useState("");
  const [descricao, setDescricao] = useState("");
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

  const codigoRef = useRef(null);

  function avisarApenasConsulta() {
    Alert.alert(
      "Apenas consulta",
      "Volte ao mês atual para inserir nova compra.",
    );
  }

  useEffect(() => {
    (async () => {
      const s = await AsyncStorage.getItem("senhaAcesso");
      if (!s) await AsyncStorage.setItem("senhaAcesso", "1234");
    })();
  }, []);

  // ✅ Carga mensal
  useEffect(() => {
    (async () => {
      const data = await loadMonthListDirect("compras", ym);
      setLista(Array.isArray(data) ? data : []);
    })();
  }, [ym]);

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
      const hay = normalize(`${it.codigo || ""} ${it.descricao || ""}`);
      return terms.every((t) => hay.includes(t));
    });
  }, [lista, busca]);

  const totalFiltrado = useMemo(
    () =>
      listaFiltrada.reduce((acc, it) => acc + Number(it.valorNumber || 0), 0),
    [listaFiltrada],
  );

  function parseQtd() {
    const normalized = String(qtdStr || "").replace(",", ".");
    const n = Number(normalized);
    return isNaN(n) ? 0 : n;
  }

  function addMonths(delta) {
    setSelectedMonth((prev) => {
      const next = new Date(prev.getFullYear(), prev.getMonth() + delta, 1);

      // não deixa ir para mês futuro
      const now = new Date();
      const current = new Date(now.getFullYear(), now.getMonth(), 1);
      if (next > current) return prev;

      return next;
    });
  }

  function voltarMesAtual() {
    setSelectedMonth(new Date(today.getFullYear(), today.getMonth(), 1));
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

  // ======= Inserir compra para LOTE =======
  async function inserirCompraEmLote() {
    Keyboard.dismiss();

    const valor = parseBRL(valorStr);
    const qtd = parseQtd();

    if (!codigo.trim() || !descricao.trim() || !valor) {
      Alert.alert("Campos incompletos", "Preencha Código, Descrição e Valor.");
      return;
    }

    const compra = {
      id: String(Date.now()),
      codigo: codigo.trim(),
      descricao: descricao.trim(),
      valorNumber: valor,
      qtdNumber: qtd || 0,
      dataISO: buildItemDateISO(),
      fromCapitalGiro: false,
      fromDespesas: false,
      compraPrazo: true,
    };

    const novaLista = [compra, ...lista];
    setLista(novaLista);

    await saveMonthListDirect("compras", novaLista, ym);
    await upsertEstoqueFromCompra(
      compra.codigo,
      compra.descricao,
      compra.qtdNumber,
      compra.valorNumber,
    );

    setLoteItens((prev) => [...prev, compra]);
    setTotalLote((prev) => Number(prev || 0) + Number(compra.valorNumber || 0));
    setCodigo("");
    setDescricao("");
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

    if (compraPrazoAtivo) {
      await inserirCompraEmLote();
      return;
    }

    const base = {
      id: String(Date.now()),
      codigo: codigo.trim(),
      descricao: descricao.trim(),
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

      await saveMonthListDirect("compras", novaLista, ym);
      await upsertEstoqueFromCompra(
        compra.codigo,
        compra.descricao,
        compra.qtdNumber,
        compra.valorNumber,
      );

      if (origem === "CAPITAL_GIRO") {
        await registrarSaidaCapital(compra.valorNumber);
      }

      if (origem === "DESPESAS") {
        try {
          const json = await AsyncStorage.getItem(DESPESAS_KEY);
          const listaDespesas = json ? JSON.parse(json) : [];

          const novaDespesa = {
            id: String(Date.now()),
            data: hojePtLocal,
            dataISO: agora.toISOString(),
            descricao: compra.descricao,
            valor: compra.valorNumber,
            origem: "compra",
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
  async function confirmarExclusao(item) {
    try {
      const qtd = Number(item.qtdNumber || 0);
      let saldoDisponivel = null;

      try {
        const estoqueJson = await AsyncStorage.getItem("estoque");
        const estoqueArr = estoqueJson ? JSON.parse(estoqueJson) : [];
        const est = (estoqueArr || []).find(
          (p) => String(p.codigo) === String(item.codigo),
        );

        if (est) {
          const entrada = Number(est.entrada || 0);
          const saida = Number(est.saida || 0);
          saldoDisponivel = Math.max(0, entrada - saida);
        }
      } catch (e) {
        console.log(
          "confirmarExclusao: falha ao ler estoque:",
          e?.message || e,
        );
        saldoDisponivel = null;
      }

      const jaConsumido =
        saldoDisponivel !== null && qtd > 0 && qtd > saldoDisponivel;

      let msg =
        `Excluir a compra "${item.descricao}" (${item.codigo || "s/ código"})?\n` +
        `Quantidade: ${qtd || 0}\n` +
        `Valor: ${brMoney(item.valorNumber)}\n\n` +
        "⚠️ Ao excluir, o sistema também remove esta entrada do ESTOQUE (estorno).";

      if (item.fromDespesas) {
        msg += "\n⚠️ Esta compra também será removida de DESPESAS.";
      }

      if (jaConsumido) {
        const vendido = Math.max(0, (qtd || 0) - (saldoDisponivel || 0));
        msg +=
          "\n\n⚠️ ATENÇÃO: parte desta compra já foi consumida/vendida.\n" +
          `Disponível para estornar agora: ${saldoDisponivel}\n` +
          `Já consumido/vendido: ${vendido}\n\n` +
          "Se continuar, o sistema vai excluir apenas o que ainda dá para estornar e manter o restante no histórico.";
      }

      if (item.fromCapitalGiro) {
        Alert.alert(
          "Excluir compra",
          msg +
            "\n\nEsta compra foi paga com Capital de Giro. Estornar a saída também?",
          [
            { text: "Cancelar", style: "cancel" },
            {
              text: jaConsumido
                ? "Excluir o que dá (sem estornar Capital)"
                : "Excluir (sem estornar Capital)",
              style: "default",
              onPress: () => excluirLote([item.id], false),
            },
            {
              text: jaConsumido
                ? "Excluir o que dá + estornar Capital"
                : "Excluir + estornar Capital",
              style: "destructive",
              onPress: () => excluirLote([item.id], true),
            },
          ],
        );
      } else {
        Alert.alert("Excluir compra", msg, [
          { text: "Cancelar", style: "cancel" },
          {
            text: jaConsumido ? "Excluir o que dá" : "Excluir",
            style: "destructive",
            onPress: () => excluirLote([item.id], false),
          },
        ]);
      }
    } catch (e) {
      console.log("confirmarExclusao erro:", e?.message || e);
      Alert.alert("Erro", "Não foi possível preparar a exclusão agora.");
    }
  }

  // ======= Seleção múltipla =======
  function toggleSelectMode() {
    setSelectMode((s) => !s);
    setSelectedIds(new Set());
  }

  function toggleSelected(id) {
    const idStr = String(id);
    setSelectedIds((prev) => {
      const next = new Set(prev);

      if (next.has(idStr)) next.delete(idStr);
      else next.add(idStr);

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

  async function excluirLote(idsForDelete, estornarCapital = false) {
    try {
      const ids = Array.isArray(idsForDelete)
        ? idsForDelete
        : Array.from(selectedIds);
      const idsSet = new Set(ids.map((x) => String(x)));
      const items = (lista || []).filter((it) => idsSet.has(String(it.id)));
      const teveDespesas = items.some((it) => !!it.fromDespesas);

      if (items.length === 0) {
        Alert.alert("Nada para excluir", "Não encontrei compras selecionadas.");
        return;
      }

      const estoqueJson = await AsyncStorage.getItem("estoque");
      const estoqueArr = estoqueJson ? JSON.parse(estoqueJson) : [];

      const mapByCod = {};
      for (const it of estoqueArr) {
        mapByCod[String(it.codigo)] = {
          ref: it,
          entrada: Number(it.entrada) || 0,
          saida: Number(it.saida) || 0,
          valorTotal: Number(it.valorTotal) || 0,
        };
      }

      const arred2 = (n) => Math.round(Number(n || 0) * 100) / 100;
      const arred3 = (n) => Math.round(Number(n || 0) * 1000) / 1000;

      let novaLista = [...(lista || [])];
      let tot = 0;
      let parc = 0;
      let sem = 0;
      let totalEstornarCapital = 0;
      const ajustesContasPagar = [];

      const ordered = [...items].sort(
        (a, b) =>
          new Date(a.dataISO || 0).getTime() -
          new Date(b.dataISO || 0).getTime(),
      );

      for (const item of ordered) {
        const idStr = String(item.id);
        const cod = String(item.codigo || "");
        const qtd = Number(item.qtdNumber || 0);
        const val = Number(item.valorNumber || 0);
        const contasPagarKey = item.contasPagarKey || null;

        if (estornarCapital && item.fromCapitalGiro && val > 0) {
          totalEstornarCapital += val;
        }

        if (!cod || !(qtd > 0)) {
          if (contasPagarKey && val > 0) {
            ajustesContasPagar.push({
              contasPagarKey,
              compraId: idStr,
              valorRemovido: val,
              qtdRemovida: qtd,
              removerTotal: true,
            });
          }

          novaLista = novaLista.filter((x) => String(x.id) !== idStr);
          tot++;
          continue;
        }

        const bucket = mapByCod[cod];

        if (!bucket) {
          if (contasPagarKey && val > 0) {
            ajustesContasPagar.push({
              contasPagarKey,
              compraId: idStr,
              valorRemovido: val,
              qtdRemovida: qtd,
              removerTotal: true,
            });
          }

          novaLista = novaLista.filter((x) => String(x.id) !== idStr);
          tot++;
          continue;
        }

        const saldo = Math.max(0, bucket.entrada - bucket.saida);

        if (saldo <= 0) {
          sem++;
          continue;
        }

        if (qtd <= saldo) {
          bucket.entrada = Math.max(0, bucket.entrada - qtd);
          bucket.valorTotal = Math.max(0, bucket.valorTotal - val);

          if (contasPagarKey && val > 0) {
            ajustesContasPagar.push({
              contasPagarKey,
              compraId: idStr,
              valorRemovido: val,
              qtdRemovida: qtd,
              removerTotal: true,
            });
          }

          novaLista = novaLista.filter((x) => String(x.id) !== idStr);
          tot++;
        } else {
          const qParc = saldo;
          const proporcao = qParc / qtd;
          const vParc = arred2(val * proporcao);

          bucket.entrada = Math.max(0, bucket.entrada - qParc);
          bucket.valorTotal = Math.max(0, bucket.valorTotal - vParc);

          const qtdResto = arred3(qtd - qParc);
          const valResto = arred2(val - vParc);

          if (contasPagarKey && vParc > 0) {
            ajustesContasPagar.push({
              contasPagarKey,
              compraId: idStr,
              valorRemovido: vParc,
              qtdRemovida: qParc,
              removerTotal: false,
            });
          }

          novaLista = novaLista.map((x) =>
            String(x.id) === idStr
              ? {
                  ...x,
                  qtdNumber: qtdResto,
                  valorNumber: valResto,
                }
              : x,
          );

          parc++;
        }
      }

      let estoqueFinal = [...estoqueArr];

      for (const cod of Object.keys(mapByCod)) {
        const b = mapByCod[cod];

        const entradaFinal = Number(b.entrada || 0);
        const saidaFinal = Number(b.saida || 0);
        const valorFinal = arred2(b.valorTotal);

        const podeExcluirProduto =
          entradaFinal <= 0 && saidaFinal <= 0 && valorFinal <= 0;

        if (podeExcluirProduto) {
          estoqueFinal = estoqueFinal.filter(
            (p) => String(p.codigo) !== String(cod),
          );
        } else {
          b.ref.entrada = entradaFinal;
          b.ref.saida = saidaFinal;
          b.ref.valorTotal = valorFinal;
          b.ref.data = Date.now();
        }
      }

      await AsyncStorage.setItem("estoque", JSON.stringify(estoqueFinal));
      setLista(novaLista);
      await saveMonthListDirect("compras", novaLista, ym);
      await atualizarContasPagarAposExcluirCompras(ajustesContasPagar);

      try {
        const jsonDesp = await AsyncStorage.getItem(DESPESAS_KEY);
        const listaDespesas = jsonDesp ? JSON.parse(jsonDesp) : [];

        if (Array.isArray(listaDespesas) && listaDespesas.length > 0) {
          const idsRemovidos = new Set(items.map((it) => String(it.id)));
          const filtrada = listaDespesas.filter(
            (d) => !d.compraId || !idsRemovidos.has(String(d.compraId)),
          );

          if (filtrada.length !== listaDespesas.length) {
            await AsyncStorage.setItem(DESPESAS_KEY, JSON.stringify(filtrada));
          }
        }
      } catch (e) {
        console.log(
          "Erro ao remover lançamento de Despesas ligado à compra:",
          e?.message || e,
        );
      }

      try {
        const idsRemovidos = new Set(items.map((it) => String(it.id)));
        const jsonV = await AsyncStorage.getItem(VENDAS_KEY);
        const vendas = jsonV ? JSON.parse(jsonV) : [];

        if (Array.isArray(vendas) && vendas.length > 0) {
          const filtrada = vendas.filter(
            (v) => !v.compraId || !idsRemovidos.has(String(v.compraId)),
          );

          if (filtrada.length !== vendas.length) {
            await AsyncStorage.setItem(VENDAS_KEY, JSON.stringify(filtrada));
          }
        }
      } catch (e) {
        console.log("Erro ao limpar Vendas ligadas à compra:", e?.message || e);
      }

      if (estornarCapital && totalEstornarCapital > 0) {
        await estornarSaidaCapital(totalEstornarCapital);
      }

      setSelectMode(false);
      setSelectedIds(new Set());

      const linhas = [
        "✅ Compra excluída com sucesso.",
        "",
        "• Histórico de compras atualizado",
        "• Entrada removida do estoque e de contas a pagar",
      ];

      if (teveDespesas) {
        linhas.push("• Lançamento removido de Despesas");
      }

      if (estornarCapital && totalEstornarCapital > 0) {
        linhas.push(
          `• Capital de Giro estornado: ${brMoney(totalEstornarCapital)}`,
        );
      }

      linhas.push("");
      linhas.push(`Totalmente excluídas: ${tot}`);
      linhas.push(`Parciais (saldo insuficiente): ${parc}`);
      linhas.push(`Sem estorno (saldo 0): ${sem}`);

      Alert.alert("Exclusão concluída", linhas.join("\n"));
    } catch (e) {
      console.log("ERRO REAL AO EXCLUIR COMPRA:", e);
      console.log("Mensagem:", e?.message);
      Alert.alert("Erro", "Não foi possível excluir a compra.");
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

    const nome = (nomeCredor || "").trim();
    const qtdParcelas = Number(qtdParcelasStr);
    const dt = parseDatePt(primeiroVencStr);

    if (!nome || !qtdParcelas || qtdParcelas < 1 || !dt) {
      Alert.alert(
        "Dados incompletos",
        "Informe o nome do credor, quantidade de parcelas e a data do primeiro vencimento (dd/mm/aaaa).",
      );
      return;
    }

    const totalCents = Math.round(Number(totalLote || 0) * 100);
    const base = Math.floor(totalCents / qtdParcelas);
    const resto = totalCents - base * qtdParcelas;
    const loteId = Date.now();
    const novasParcelas = [];

    for (let i = 0; i < qtdParcelas; i++) {
      const venc = new Date(dt.getTime());
      venc.setMonth(venc.getMonth() + i);

      const valorCents = base + (i < resto ? 1 : 0);
      const valorParcela = valorCents / 100;

      novasParcelas.push({
        id: `cp-${loteId}-${i + 1}`,
        numero: i + 1,
        valor: valorParcela,
        vencimento: formatDateBR(venc),
        pago: false,
        origem: "COMPRA_PRAZO",
      });
    }

    yearMonthKey(new Date());

    try {
      const raw = await AsyncStorage.getItem(CONTAS_PAGAR_KEY);
      let obj = {};

      if (raw) {
        try {
          const parsed = JSON.parse(raw);

          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            obj = parsed;
          } else {
            console.log(
              "[Compras] contasPagar estava em formato inválido, resetando.",
            );
            obj = {};
          }
        } catch (errParse) {
          console.log(
            "[Compras] JSON.parse(contasPagar) falhou:",
            errParse?.message || errParse,
          );
          obj = {};
        }
      }

      const chaveLote = `${nome}||${loteId}`;

      obj[chaveLote] = {
        ficha: {
          nome,
          valorTotal: Number(totalLote || 0),
          origem: "COMPRA_PRAZO",
          loteId,
          criadoEm: new Date().toISOString(),
          itens: (loteItens || []).map((it) => ({
            compraId: String(it.id),
            codigo: it.codigo,
            descricao: it.descricao,
            qtdNumber: Number(it.qtdNumber || 0),
            valorNumber: Number(it.valorNumber || 0),
          })),
        },
        parcelas: novasParcelas,
      };

      await AsyncStorage.setItem(CONTAS_PAGAR_KEY, JSON.stringify(obj));

      const idsLote = new Set((loteItens || []).map((c) => String(c.id)));
      const listaAtualizada = (Array.isArray(lista) ? lista : []).map((it) =>
        idsLote.has(String(it?.id))
          ? {
              ...it,
              contasPagarKey: chaveLote,
              loteId,
            }
          : it,
      );

      setLista(listaAtualizada);

      try {
        await saveMonthListDirect("compras", listaAtualizada, ym);
      } catch (eMonth) {
        console.log(
          "[Compras] saveMonthList(compras) falhou:",
          eMonth?.message || eMonth,
        );
      }

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
      console.log(
        "[Compras] Erro ao salvar lote em Contas a Pagar:",
        e?.message || e,
      );
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
    const idStr = String(item.id);
    const sel = selectedIds.has(idStr);

    return (
      <TouchableOpacity
        activeOpacity={selectMode ? 0.7 : 1}
        onPress={() => (selectMode ? toggleSelected(idStr) : null)}
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
            {hasQtd ? ` (${item.qtdNumber})` : ""}
            {item.fromCapitalGiro ? " [Cap. Giro]" : ""}
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
      (it) => ids.includes(String(it.id)) && it.fromCapitalGiro,
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
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        ListHeaderComponent={
          <View>
            <View style={styles.topBar}>
              <Text style={styles.topTitle}>Compras</Text>
              <Text style={styles.topSub}>Compras - Data {hojePt}</Text>
            </View>

            <View style={styles.monthRow}>
              <TouchableOpacity
                style={[
                  styles.monthActionBtn,
                  isCurrentMonth && styles.monthActionBtnDisabled,
                ]}
                onPress={voltarMesAtual}
                disabled={isCurrentMonth}
              >
                <Text
                  style={[
                    styles.monthActionTxt,
                    isCurrentMonth && styles.monthActionTxtDisabled,
                  ]}
                >
                  Lançamentos do Dia
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.monthActionBtn}
                onPress={() => addMonths(-1)}
              >
                <Text style={styles.monthActionTxt}>
                  Pesquisar mês anterior
                </Text>
              </TouchableOpacity>
            </View>

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
              ref={codigoRef}
              placeholder="Código"
              style={styles.input}
              placeholderTextColor={PLACEHOLDER}
              underlineColorAndroid="transparent"
              onChangeText={setCodigo}
              value={codigo}
              returnKeyType="next"
              editable={isCurrentMonth}
              onFocus={() => {
                if (!isCurrentMonth) {
                  avisarApenasConsulta();
                  Keyboard.dismiss();
                  setTimeout(() => codigoRef.current?.blur?.(), 0);
                }
              }}
            />

            <TextInput
              placeholder="Descrição da compra"
              style={styles.input}
              placeholderTextColor={PLACEHOLDER}
              underlineColorAndroid="transparent"
              value={descricao}
              onChangeText={setDescricao}
              returnKeyType="next"
              editable={isCurrentMonth}
            />

            <TextInput
              placeholder="Quantidade (ex.: 3 ou 3,5)"
              style={styles.input}
              placeholderTextColor={PLACEHOLDER}
              keyboardType="numeric"
              value={qtdStr}
              onChangeText={setQtdStr}
              returnKeyType="next"
              editable={isCurrentMonth}
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
              editable={isCurrentMonth}
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
              placeholder="Pesquisar por nome ou código..."
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
                    if (selectedIds.size === listaFiltrada.length) {
                      setSelectedIds(new Set());
                    } else {
                      setSelectedIds(
                        new Set(listaFiltrada.map((x) => String(x.id))),
                      );
                    }
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
  screen: {
    flex: 1,
    backgroundColor: "#F2F2F2",
  },
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
    fontSize: 20,
    fontWeight: "900",
    color: "#111",
    textAlign: "center",
  },
  topSub: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
    marginTop: 4,
  },
  addBtn: {
    backgroundColor: "#2196F3",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 2,
    marginBottom: 10,
  },
  addBtnText: {
    color: "#fff",
    fontWeight: "800",
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
  prazoBoxOn: {
    backgroundColor: "#111",
  },
  prazoMark: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 18,
    marginTop: -2,
  },
  prazoLabel: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111",
  },
  monthActionBtn: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  monthActionBtnDisabled: {
    backgroundColor: "#f2f2f2",
    borderColor: "#d0d0d0",
  },
  monthActionTxt: {
    fontWeight: "900",
    color: "#111",
    textAlign: "center",
  },
  monthActionTxtDisabled: {
    color: "#888",
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  navBtn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  navBtnLeft: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 6,
    alignItems: "center",
  },
  navBtnRight: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginLeft: 6,
    alignItems: "center",
  },
  navTxt: {
    fontWeight: "800",
    color: "#111",
  },
  navTxtBold: {
    fontWeight: "900",
    color: "#111",
  },
  navBtnDisabled: {
    backgroundColor: "#f2f2f2",
    borderColor: "#d0d0d0",
  },
  navTxtDisabled: {
    color: "#888",
  },
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
  selectRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
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
  check: {
    marginRight: 10,
    fontSize: 18,
    fontWeight: "900",
    color: "#111",
  },
  itemTop: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111",
  },
  itemSub: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  itemVal: {
    fontSize: 14,
    fontWeight: "900",
    color: "#111",
    marginHorizontal: 10,
  },
  del: {
    color: "red",
    fontWeight: "900",
    paddingHorizontal: 6,
  },
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
  totalText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0D47A1",
  },
  loteBox: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  loteText: {
    fontWeight: "800",
    color: "#111",
    marginBottom: 8,
  },
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
  btn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  btnPrimary: {
    backgroundColor: "#2196F3",
  },
  btnGhost: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ccc",
  },
  btnText: {
    color: "#fff",
    fontWeight: "800",
  },
  btnGhostText: {
    color: "#111",
    fontWeight: "800",
  },
  navBtnCenter: {
    alignSelf: "center",
    marginTop: 6,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
});
