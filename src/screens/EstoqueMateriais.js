// src/screens/EstoqueMateriais.js
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Modal,
  Keyboard,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { KEY_ESTOQUE_MATERIAIS } from "../utils/keys";
import { FORM_CARD } from "../styles/formCard";

// ✅ imprimir
import * as Print from "expo-print";

/* =========================
   KEYS (ESTOQUE SEPARADO)
   ========================= */

// ✅ Alias (pra não ter erro com nomes diferentes em outras telas)
export const ESTOQUE_MATERIAIS_KEY = KEY_ESTOQUE_MATERIAIS;

const KEY_MOV_MATERIAIS = "@mov_materiais_orcamento";
// { [movId]: { status:"pendente"|"confirmado"|"estornado", codigo, qtd, custoDebitado, at, und } }
// ✅ USADO POR ComprasMateriaisConsumo.js (entrada de materiais)

export async function upsertEstoqueMateriaisFromCompra(
  cod,
  desc,
  und,
  qtd,
  valor,
  meta = {}, // ✅ NOVO (opcional)
) {
  if (!cod || !(Number(qtd) > 0)) return;

  try {
    const json = await AsyncStorage.getItem(KEY_ESTOQUE_MATERIAIS);
    const arr = json ? JSON.parse(json) : [];

    const codigoNorm = String(cod).trim();
    const idx = arr.findIndex(
      (p) => String(p?.codigo || "").trim() === codigoNorm,
    );

    const agoraISO = new Date().toISOString();
    const q = Number(qtd || 0);
    const v = Number(valor || 0);

    const custoUnitDaCompra = v > 0 && q > 0 ? v / q : 0;

    // ✅ meta opcional
    const compraId = meta?.compraId ? String(meta.compraId) : "";
    const source = meta?.source ? String(meta.source) : "";
    const dataISO = meta?.dataISO ? String(meta.dataISO) : agoraISO;

    const aplicarMetaCompra = (it) => {
      // cria estrutura de log (não quebra quem já tem dados antigos)
      if (
        !it.compras ||
        typeof it.compras !== "object" ||
        Array.isArray(it.compras)
      ) {
        it.compras = {};
      }

      // se tiver compraId, registra para permitir estorno depois
      if (compraId) {
        if (!it.compras[compraId]) {
          it.compras[compraId] = {
            compraId,
            codigo: codigoNorm,
            qtd: q,
            valor: v,
            dataISO,
            source: source || "comprasMateriais",
            createdAt: agoraISO,
          };
        }
      }
    };

    if (idx >= 0) {
      const it = { ...(arr[idx] || {}) };

      it.codigo = codigoNorm;
      it.descricao = desc || it.descricao || "";
      it.unidade = und || it.unidade || "un";

      // ✅ soma agregada (como já era)
      it.entrada = (Number(it.entrada) || 0) + q;
      it.valorTotal = (Number(it.valorTotal) || 0) + v;

      if (!(Number(it.custoUnitarioBase) > 0) && custoUnitDaCompra > 0) {
        it.custoUnitarioBase = custoUnitDaCompra;
      }

      aplicarMetaCompra(it);

      it.updatedAt = agoraISO;
      arr[idx] = it;
    } else {
      const novo = {
        id: `mat-${Date.now()}`,
        codigo: codigoNorm,
        descricao: desc || "",
        unidade: und || "un",
        entrada: q,
        saida: 0,
        valorTotal: v,
        custoUnitarioBase: custoUnitDaCompra > 0 ? custoUnitDaCompra : 0,
        createdAt: agoraISO,
        updatedAt: agoraISO,

        // ✅ NOVO: log das compras por compraId
        compras: {},
      };

      aplicarMetaCompra(novo);

      arr.unshift(novo);
    }

    await AsyncStorage.setItem(KEY_ESTOQUE_MATERIAIS, JSON.stringify(arr));
  } catch (e) {
    console.log("Falha upsertEstoqueMateriaisFromCompra:", e?.message || e);
  }
}

export async function estornarEstoqueMateriaisPorCompraIds(ids = []) {
  const idSet = new Set((ids || []).map((x) => String(x)));
  if (idSet.size === 0) return;

  try {
    const json = await AsyncStorage.getItem(KEY_ESTOQUE_MATERIAIS);
    const arr = json ? JSON.parse(json) : [];
    const agoraISO = new Date().toISOString();

    const nova = (Array.isArray(arr) ? arr : []).map((it) => {
      const compras =
        it?.compras && typeof it.compras === "object" ? it.compras : null;
      if (!compras) return it;

      let subQtd = 0;
      let subValor = 0;
      let mudou = false;

      for (const compraId of idSet) {
        const reg = compras[compraId];
        if (reg) {
          subQtd += Number(reg.qtd || 0);
          subValor += Number(reg.valor || 0);
          delete compras[compraId];
          mudou = true;
        }
      }

      if (!mudou) return it;

      const entradaAtual = Number(it.entrada || 0);
      const valorAtual = Number(it.valorTotal || 0);

      const novaEntrada = Math.max(0, entradaAtual - subQtd);
      const novoValor = Math.max(0, valorAtual - subValor);

      return {
        ...it,
        compras,
        entrada: novaEntrada,
        valorTotal: novoValor,
        updatedAt: agoraISO,
      };
    });

    await AsyncStorage.setItem(KEY_ESTOQUE_MATERIAIS, JSON.stringify(nova));
  } catch (e) {
    console.log("Falha estornarEstoqueMateriaisPorCompraIds:", e?.message || e);
  }
}

export async function baixaMaterialParaOrcamento({ codigo, qtd, movId }) {
  const rawMov = await AsyncStorage.getItem(KEY_MOV_MATERIAIS);
  const movs = rawMov ? JSON.parse(rawMov) : {};

  // idempotente: se já existe e não está estornado, não aplica de novo
  if (movs[movId]?.status && movs[movId].status !== "estornado") {
    return { ok: true, jaAplicado: true, mov: movs[movId] };
  }

  const rawEst = await AsyncStorage.getItem(KEY_ESTOQUE_MATERIAIS);
  const list = rawEst ? JSON.parse(rawEst) : [];
  const idx = (list || []).findIndex(
    (x) => String(x?.codigo) === String(codigo),
  );
  if (idx < 0) return { ok: false, motivo: "codigo_nao_encontrado" };

  const it = { ...list[idx] };
  const entradaN = Number(it.entrada || 0);
  const saidaN = Number(it.saida || 0);
  const saldo = entradaN - saidaN;

  const q = Number(qtd || 0);
  if (!(q > 0)) return { ok: false, motivo: "qtd_invalida" };
  if (q > saldo) return { ok: false, motivo: "saldo_insuficiente", saldo };

  const custoUnit = Number(it.custoUnitarioBase || 0);
  const debito = custoUnit * q;

  it.saida = (Number(it.saida) || 0) + q;
  it.valorTotal = Math.max(0, Number(it.valorTotal || 0) - debito);
  it.updatedAt = new Date().toISOString();

  list[idx] = it;
  await AsyncStorage.setItem(KEY_ESTOQUE_MATERIAIS, JSON.stringify(list));

  movs[movId] = {
    status: "pendente",
    codigo: String(codigo),
    qtd: q,
    custoDebitado: debito,
    und: it.unidade || "un",
    at: Date.now(),
  };
  await AsyncStorage.setItem(KEY_MOV_MATERIAIS, JSON.stringify(movs));

  return { ok: true, debito, custoUnit, und: it.unidade || "un" };
}

export async function estornarBaixaMaterial({ movId, force = false }) {
  const rawMov = await AsyncStorage.getItem(KEY_MOV_MATERIAIS);
  const movs = rawMov ? JSON.parse(rawMov) : {};
  const mov = movs[movId];

  if (!mov) return { ok: false, motivo: "mov_nao_encontrado" };

  if (mov.status === "estornado") return { ok: true, jaEstornado: true };

  if (mov.status === "confirmado" && !force)
    return { ok: false, motivo: "ja_confirmado" };

  const { codigo, qtd, custoDebitado } = mov;

  const rawEst = await AsyncStorage.getItem(KEY_ESTOQUE_MATERIAIS);
  const list = rawEst ? JSON.parse(rawEst) : [];
  const idx = (list || []).findIndex(
    (x) => String(x?.codigo) === String(codigo),
  );
  if (idx < 0) return { ok: false, motivo: "codigo_nao_encontrado_no_estoque" };

  const it = { ...list[idx] };

  it.saida = Math.max(0, (Number(it.saida) || 0) - Number(qtd || 0));
  it.valorTotal = Number(it.valorTotal || 0) + Number(custoDebitado || 0);
  it.updatedAt = new Date().toISOString();

  list[idx] = it;
  await AsyncStorage.setItem(KEY_ESTOQUE_MATERIAIS, JSON.stringify(list));

  movs[movId] = {
    ...mov,
    status: "estornado",
    estornadoAt: Date.now(),
    estornadoForce: !!force,
  };
  await AsyncStorage.setItem(KEY_MOV_MATERIAIS, JSON.stringify(movs));

  return { ok: true };
}

export async function confirmarBaixaMaterial({ movId }) {
  const rawMov = await AsyncStorage.getItem(KEY_MOV_MATERIAIS);
  const movs = rawMov ? JSON.parse(rawMov) : {};
  if (!movs[movId]) return { ok: true, nada: true };
  if (movs[movId].status === "confirmado") return { ok: true, ja: true };
  movs[movId] = {
    ...movs[movId],
    status: "confirmado",
    confirmadoAt: Date.now(),
  };
  await AsyncStorage.setItem(KEY_MOV_MATERIAIS, JSON.stringify(movs));
  return { ok: true };
}

/* =========================
   HELPERS BRL
========================= */
const onlyDigits = (s = "") => String(s || "").replace(/\D/g, "");
const maskBRL = (txt) => {
  const cents = Number(onlyDigits(txt));
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
};
const parseBRL = (masked) => {
  const cents = Number(onlyDigits(masked));
  return (cents || 0) / 100;
};
const fmtBRL = (v) =>
  Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });

const toNumber = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const normalize = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const fmtQtde = (v) => {
  const n = Number(v || 0);
  const isInt = Math.abs(n - Math.round(n)) < 0.000001;
  return isInt ? String(Math.round(n)) : n.toFixed(2).replace(".", ",");
};

/* =========================
   COMPONENTE
========================= */
export default function EstoqueMateriais({ navigation }) {
  // cadastro
  const [codigo, setCodigo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [unidade, setUnidade] = useState("un");
  const [entrada, setEntrada] = useState("");
  const [custoTotal, setCustoTotal] = useState("R$ 0,00");

  // lista
  const [estoque, setEstoque] = useState([]);
  const [busca, setBusca] = useState("");

  // modal baixa
  const [modalBaixa, setModalBaixa] = useState(false);
  const [baixaCodigo, setBaixaCodigo] = useState("");
  const [baixaQtd, setBaixaQtd] = useState("");

  // carregar
  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(KEY_ESTOQUE_MATERIAIS);
      const arr = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(arr) ? arr : [];
      list.sort((a, b) =>
        String(a?.descricao || a?.codigo || "").localeCompare(
          String(b?.descricao || b?.codigo || ""),
          "pt-BR",
          { sensitivity: "base" },
        ),
      );
      setEstoque(list);
    })();
  }, []);

  const salvarStorage = async (list) => {
    setEstoque(list);
    await AsyncStorage.setItem(KEY_ESTOQUE_MATERIAIS, JSON.stringify(list));
  };

  /* =========================
     CADASTRAR / ENTRADA
  ========================= */
  const salvarMaterial = async () => {
    Keyboard.dismiss();

    const cod = String(codigo || "").trim();
    const desc = String(descricao || "").trim();
    const und = String(unidade || "").trim() || "un";

    const qtd = toNumber(entrada);
    const custo = parseBRL(custoTotal);

    if (!cod || !desc || !und || !(qtd > 0) || !(custo >= 0)) {
      Alert.alert(
        "Campos obrigatórios",
        "Preencha código, descrição, unidade, entrada e custo total.",
      );
      return;
    }

    const list = Array.isArray(estoque) ? [...estoque] : [];
    const idx = list.findIndex((x) => String(x?.codigo) === cod);

    if (idx >= 0) {
      const item = { ...list[idx] };

      item.codigo = cod;
      item.descricao = desc;
      item.unidade = und;
      item.entrada = (Number(item.entrada) || 0) + qtd;
      item.valorTotal = (Number(item.valorTotal) || 0) + custo;
      item.totalEntradasQtde =
        (Number(item.totalEntradasQtde) || 0) + Number(qtd);
      item.totalEntradasValor =
        (Number(item.totalEntradasValor) || 0) + Number(custo);
      item.updatedAt = new Date().toISOString();

      if (!(Number(item.custoUnitarioBase || 0) > 0)) {
        const teq = Number(item.totalEntradasQtde || 0);
        const tev = Number(item.totalEntradasValor || 0);
        item.custoUnitarioBase = teq > 0 ? tev / teq : 0;
      }

      list[idx] = item;
    } else {
      const custoBase = qtd > 0 ? custo / qtd : 0;

      list.unshift({
        id: `mat-${Date.now()}`,
        codigo: cod,
        descricao: desc,
        unidade: und,
        entrada: qtd,
        saida: 0,
        valorTotal: custo,
        custoUnitarioBase: custoBase,
        totalEntradasQtde: qtd,
        totalEntradasValor: custo,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    await salvarStorage(list);

    setCodigo("");
    setDescricao("");
    setUnidade("un");
    setEntrada("");
    setCustoTotal("R$ 0,00");

    Alert.alert("Estoque de Materiais", "Entrada salva ✅");
  };

  /* =========================
     BAIXA PARCIAL
  ========================= */
  const abrirBaixa = (codPadrao = "") => {
    setBaixaCodigo(String(codPadrao || ""));
    setBaixaQtd("");
    setModalBaixa(true);
  };

  const efetivarBaixa = async () => {
    Keyboard.dismiss();

    const cod = String(baixaCodigo || "").trim();
    const qtd = toNumber(baixaQtd);

    if (!cod || !(qtd > 0)) {
      Alert.alert("Baixa", "Informe o código e uma quantidade válida.");
      return;
    }

    const list = Array.isArray(estoque) ? [...estoque] : [];
    const idx = list.findIndex((x) => String(x?.codigo) === cod);

    if (idx < 0) {
      Alert.alert("Não encontrado", "Código não localizado no estoque.");
      return;
    }

    const it = { ...list[idx] };
    const entradaN = Number(it.entrada || 0);
    const saidaN = Number(it.saida || 0);
    const saldo = entradaN - saidaN;

    if (qtd > saldo) {
      Alert.alert(
        "Baixa bloqueada",
        `Você tem ${fmtQtde(saldo)} ${it.unidade || ""} em estoque.`,
      );
      return;
    }

    const custoUnit = Number(it.custoUnitarioBase || 0);
    const debito = custoUnit * qtd;

    it.saida = (Number(it.saida) || 0) + qtd;
    it.valorTotal = Math.max(0, Number(it.valorTotal || 0) - debito);
    it.updatedAt = new Date().toISOString();

    list[idx] = it;

    await salvarStorage(list);
    setModalBaixa(false);

    Alert.alert(
      "Baixa aplicada ✅",
      `Baixado: ${fmtQtde(qtd)} ${it.unidade}\nCusto baixado: ${fmtBRL(debito)}`,
    );
  };

  /* =========================
     EXCLUIR ITEM (sem senha)
  ========================= */
  const excluirItem = (cod) => {
    Alert.alert("Excluir", "Excluir este material do estoque?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          const list = (Array.isArray(estoque) ? estoque : []).filter(
            (x) => String(x?.codigo) !== String(cod),
          );
          await salvarStorage(list);
        },
      },
    ]);
  };

  /* =========================
     LISTA / FILTRO / TOTAIS
  ========================= */
  const estoqueFiltrado = useMemo(() => {
    const q = normalize(busca);
    if (!q) return estoque;
    const terms = q.split(/\s+/).filter(Boolean);
    return (estoque || []).filter((it) => {
      const hay = normalize(
        `${it.codigo || ""} ${it.descricao || ""} ${it.unidade || ""}`,
      );
      return terms.every((t) => hay.includes(t));
    });
  }, [estoque, busca]);

  const totalValor = useMemo(() => {
    return (Array.isArray(estoque) ? estoque : []).reduce(
      (s, it) => s + Number(it?.valorTotal || 0),
      0,
    );
  }, [estoque]);

  const totalQtd = useMemo(() => {
    return (Array.isArray(estoque) ? estoque : []).reduce((s, it) => {
      const entradaN = Number(it?.entrada || 0);
      const saidaN = Number(it?.saida || 0);
      return s + Math.max(0, entradaN - saidaN);
    }, 0);
  }, [estoque]);

  /* =========================
     IMPRIMIR (tudo ou filtro)
  ========================= */
  const buildHtmlImpressao = (lista = [], titulo = "Estoque de Materiais") => {
    const hoje = new Date().toLocaleString("pt-BR");
    const rows = (Array.isArray(lista) ? lista : [])
      .map((it) => {
        const entradaN = Number(it?.entrada || 0);
        const saidaN = Number(it?.saida || 0);
        const saldo = Math.max(0, entradaN - saidaN);
        const und = it?.unidade || "un";
        const custoUnit = Number(it?.custoUnitarioBase || 0);
        const custoTotal = Number(it?.valorTotal || 0);

        const upd = it?.updatedAt
          ? new Date(it.updatedAt).toLocaleDateString("pt-BR")
          : "-";

        return `
          <tr>
            <td>${String(it?.codigo || "-")}</td>
            <td>${String(it?.descricao || "-")}</td>
            <td style="text-align:center;">${String(und)}</td>
            <td style="text-align:right;">${fmtQtde(saldo)}</td>
            <td style="text-align:right;">${fmtBRL(custoUnit)}</td>
            <td style="text-align:right;">${fmtBRL(custoTotal)}</td>
            <td style="text-align:center;">${upd}</td>
          </tr>
        `;
      })
      .join("");

    const totalListaValor = (Array.isArray(lista) ? lista : []).reduce(
      (s, it) => s + Number(it?.valorTotal || 0),
      0,
    );

    const totalListaQtd = (Array.isArray(lista) ? lista : []).reduce(
      (s, it) => {
        const entradaN = Number(it?.entrada || 0);
        const saidaN = Number(it?.saida || 0);
        return s + Math.max(0, entradaN - saidaN);
      },
      0,
    );

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            body { font-family: Arial, sans-serif; padding: 16px; }
            h1 { font-size: 18px; margin: 0 0 6px 0; }
            .sub { color: #555; font-size: 12px; margin-bottom: 12px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 8px; font-size: 11px; }
            th { background: #f3f3f3; text-align: left; }
            .totais { margin-top: 12px; font-size: 12px; }
            .totais b { font-size: 13px; }
          </style>
        </head>
        <body>
          <h1>${titulo}</h1>
          <div class="sub">Gerado em ${hoje}</div>

          <table>
            <thead>
              <tr>
                <th style="width: 70px;">Código</th>
                <th>Descrição</th>
                <th style="width: 60px; text-align:center;">Und</th>
                <th style="width: 70px; text-align:right;">Estoque</th>
                <th style="width: 90px; text-align:right;">Custo Unit.</th>
                <th style="width: 95px; text-align:right;">Custo Total</th>
                <th style="width: 70px; text-align:center;">Atual.</th>
              </tr>
            </thead>
            <tbody>
              ${
                rows ||
                `<tr><td colspan="7" style="text-align:center;color:#666;">Nenhum item.</td></tr>`
              }
            </tbody>
          </table>

          <div class="totais">
            <div><b>Total (qtd em estoque):</b> ${fmtQtde(totalListaQtd)}</div>
            <div><b>Total (custo):</b> ${fmtBRL(totalListaValor)}</div>
          </div>
        </body>
      </html>
    `;
  };

  const imprimirLista = async (lista, titulo) => {
    try {
      const html = buildHtmlImpressao(lista, titulo);
      await Print.printAsync({ html });
    } catch (e) {
      console.log("[EstoqueMateriais] falha ao imprimir:", e?.message || e);
      Alert.alert(
        "Impressão",
        `Não foi possível imprimir.\n\n${String(e?.message || e)}`,
      );
    }
  };

  const onPressImprimir = () => {
    const temFiltro = normalize(busca).length > 0;
    const tituloBase = "Estoque de Materiais";

    Alert.alert(
      "Imprimir",
      temFiltro
        ? "Deseja imprimir tudo ou somente o resultado do filtro?"
        : "Deseja imprimir todo o estoque?",
      [
        { text: "Cancelar", style: "cancel" },
        temFiltro
          ? {
              text: "Somente filtro",
              onPress: () =>
                imprimirLista(
                  estoqueFiltrado,
                  `${tituloBase} (Filtro: "${busca}")`,
                ),
            }
          : null,
        {
          text: "Imprimir tudo",
          onPress: () => imprimirLista(estoque, tituloBase),
        },
      ].filter(Boolean),
    );
  };

  const renderItem = ({ item }) => {
    const entradaN = Number(item?.entrada || 0);
    const saidaN = Number(item?.saida || 0);
    const saldo = Math.max(0, entradaN - saidaN);
    const und = item?.unidade || "un";
    const custoUnit = Number(item?.custoUnitarioBase || 0);

    return (
      <View style={styles.card}>
        <View style={styles.linhaTop}>
          <Text style={styles.codigo}>{item?.codigo || "-"}</Text>
          <Text style={styles.data}>
            {item?.updatedAt
              ? new Date(item.updatedAt).toLocaleDateString("pt-BR")
              : "-"}
          </Text>
        </View>

        <Text style={styles.desc}>{item?.descricao || "-"}</Text>

        <View style={styles.row}>
          <Text style={styles.det}>Und: {und}</Text>
          <Text style={styles.det}>Entrada: {fmtQtde(entradaN)}</Text>
          <Text style={styles.det}>Saída: {fmtQtde(saidaN)}</Text>
          <Text style={styles.detStrong}>Estoque: {fmtQtde(saldo)}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.det}>Custo unit.: {fmtBRL(custoUnit)}</Text>
          <Text style={styles.detStrong}>
            Custo total: {fmtBRL(item?.valorTotal || 0)}
          </Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btnSmall, { borderColor: "#111" }]}
            onPress={() => abrirBaixa(item?.codigo)}
          >
            <Text style={[styles.btnSmallTxt, { color: "#111" }]}>
              Dar Baixa
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnSmall, { borderColor: "#ef4444" }]}
            onPress={() => excluirItem(item?.codigo)}
          >
            <Text style={[styles.btnSmallTxt, { color: "#b91c1c" }]}>
              Excluir
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#fff" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
    >
      <FlatList
        style={{ flex: 1, backgroundColor: "#fff" }}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        data={estoqueFiltrado}
        keyExtractor={(it) => String(it?.id || it?.codigo)}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>Estoque de Materiais</Text>
            <Text style={styles.sub}>
              Prestação de Serviços (estoque separado)
            </Text>

            <TextInput
              placeholder="Pesquisar por código ou nome..."
              placeholderTextColor="#777"
              value={busca}
              onChangeText={setBusca}
              style={styles.search}
              returnKeyType="search"
            />

            <TouchableOpacity style={styles.btnPrint} onPress={onPressImprimir}>
              <Text style={styles.btnPrintTxt}>Imprimir</Text>
            </TouchableOpacity>

            <View style={styles.form}>
              <TextInput
                style={[styles.input, styles.w110]}
                placeholder="Código"
                placeholderTextColor="#777"
                value={codigo}
                onChangeText={setCodigo}
              />
              <TextInput
                style={[styles.input, styles.flex]}
                placeholder="Descrição"
                placeholderTextColor="#777"
                value={descricao}
                onChangeText={setDescricao}
              />

              <TextInput
                style={[styles.input, styles.w110]}
                placeholder="Un (kg/ml/cx)"
                placeholderTextColor="#777"
                value={unidade}
                onChangeText={setUnidade}
              />
              <TextInput
                style={[styles.input, styles.w110]}
                placeholder="Entrada"
                placeholderTextColor="#777"
                value={entrada}
                onChangeText={setEntrada}
                keyboardType="numeric"
              />
              <TextInput
                style={[styles.input, styles.flex]}
                placeholder="Custo Total"
                placeholderTextColor="#777"
                value={custoTotal}
                onChangeText={(t) => setCustoTotal(maskBRL(t))}
                keyboardType="numeric"
              />
            </View>

            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={salvarMaterial}
            >
              <Text style={styles.btnPrimaryTxt}>Salvar Entrada</Text>
            </TouchableOpacity>

            <View style={styles.totalDestaque}>
              <Text style={styles.totalDestaqueLabel}>
                ValorTotal em Estoque
              </Text>
              <Text style={styles.totalDestaqueValor}>
                {fmtBRL(totalValor)}
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={{ padding: 16 }}>
            <Text style={{ color: "#666", textAlign: "center" }}>
              Estoque de materiais vazio.
            </Text>
          </View>
        }
      />

      <Modal visible={modalBaixa} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Dar baixa no estoque</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Código"
              placeholderTextColor="#777"
              value={baixaCodigo}
              onChangeText={setBaixaCodigo}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Quantidade (ex: 30)"
              placeholderTextColor="#777"
              value={baixaQtd}
              onChangeText={setBaixaQtd}
              keyboardType="numeric"
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: "#ddd" }]}
                onPress={() => setModalBaixa(false)}
              >
                <Text style={{ fontWeight: "900", color: "#111" }}>
                  Cancelar
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: "#111" }]}
                onPress={efetivarBaixa}
              >
                <Text style={{ fontWeight: "900", color: "#fff" }}>
                  Confirmar
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  listContent: {
    padding: 16,
    paddingBottom: 140,
    backgroundColor: "#fff",
    flexGrow: 1,
  },

  title: {
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
    color: "#111",
  },

  sub: {
    textAlign: "center",
    color: "#666",
    marginTop: 6,
    marginBottom: 12,
    fontSize: 12,
  },

  search: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: "#111",
    fontWeight: "800",
    marginBottom: 10,
    backgroundColor: "#fff",
  },

  btnPrint: {
    backgroundColor: "#f6f6f6",
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 10,
  },

  btnPrintTxt: { color: "#111", fontWeight: "900", letterSpacing: 0.3 },

  form: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },

  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    color: "#111",
    fontWeight: "800",
    backgroundColor: "#fff",
  },

  w110: { width: 110 },
  flex: { flex: 1, minWidth: 150 },

  btnPrimary: {
    backgroundColor: "#111",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 10,
  },

  btnPrimaryTxt: { color: "#fff", fontWeight: "900", letterSpacing: 0.3 },

  totalDestaque: {
    marginBottom: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#E8F5E9",
    borderWidth: 1,
    borderColor: "#C8E6C9",
    alignItems: "center",

    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },

  totalDestaqueLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2E7D32",
    marginBottom: 4,
  },

  totalDestaqueValor: {
    fontSize: 24,
    fontWeight: "900",
    color: "#1B5E20",
  },

  totalLabel: { color: "#111", fontWeight: "900" },
  totalValue: { color: "#111", fontWeight: "900", fontSize: 16 },

  card: {
    ...FORM_CARD,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#fff",
  },

  linhaTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  codigo: { fontWeight: "900", color: "#111", fontSize: 14 },
  data: { color: "#666", fontSize: 12 },
  desc: { marginTop: 6, fontWeight: "800", color: "#111" },

  row: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  det: { color: "#444", fontSize: 12, fontWeight: "800" },
  detStrong: { color: "#111", fontSize: 12, fontWeight: "900" },

  actions: { flexDirection: "row", gap: 10, marginTop: 12 },

  btnSmall: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#fff",
  },

  btnSmallTxt: { fontWeight: "900", fontSize: 12 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
  },

  modalBox: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
  },

  modalTitle: {
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
    color: "#111",
    marginBottom: 10,
  },

  modalInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    color: "#111",
    fontWeight: "800",
    marginBottom: 10,
  },

  modalBtns: { flexDirection: "row", gap: 10 },

  modalBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
});
