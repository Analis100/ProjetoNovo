// // screens/ControleEstoque.js
import React, { useEffect, useRef, useMemo, useState } from "react";
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
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";

// ⬇ Sync opcional (envia só no plano COLABORADORES)
import { syncAdicionar } from "./services/sync.js";
import { FORM_CARD } from "../styles/formCard";

/* ===== Helpers BRL ===== */
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

// robusto: converte strings antigas "R$ 249,90" em número
const toNumberBRL = (v) => {
  if (typeof v === "number") return v;
  if (!v) return 0;
  const s = String(v).trim();
  const n = s
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const f = parseFloat(n);
  return isNaN(f) ? 0 : f;
};

// normaliza texto p/ busca
const normalize = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/* ========= CMV: limpeza por código (para manter CMV “enxuto”) ========= */
async function removeCMVByCodigo(codigo) {
  try {
    const raw = await AsyncStorage.getItem("cmvRegistros");
    const arr = raw ? JSON.parse(raw) : [];
    const nova = (arr || []).filter((r) => String(r.codigo) !== String(codigo));
    await AsyncStorage.setItem("cmvRegistros", JSON.stringify(nova));
  } catch {}
}

/* ========= EXPORTS para ClientePrazo/CMV ========= */
/**
 * Retorna o custo unitário base do produto (fixo, calculado no 1º cadastro).
 */
export async function custoUnitarioDoEstoque(codigo) {
  const js = await AsyncStorage.getItem("estoque");
  const lista = js ? JSON.parse(js) : [];
  const it = (lista || []).find((p) => String(p.codigo) === String(codigo));
  return Number(it?.custoUnitarioBase || 0);
}

/**
 * Aplica a BAIXA no ESTOQUE quando a FICHA de Cliente Prazo é salva.
 * - Incrementa 'saida' pela quantidade vendida na ficha
 * - Debita 'valorTotal' usando custoUnitarioBase * quantidade
 * - Idempotente: usa marcador em @estoque_baixas_prazo para não aplicar 2x
 */
export async function aplicarBaixaPrazoAoSalvarFicha({
  codigo,
  quantidade,
  clienteNome,
  fichaId,
}) {
  try {
    const keyMemo = "@estoque_baixas_prazo";
    const rawMemo = await AsyncStorage.getItem(keyMemo);
    const memo = rawMemo ? JSON.parse(rawMemo) : {};

    const marker =
      String(clienteNome || "").trim() +
      "|" +
      String(codigo || "").trim() +
      "|" +
      String(fichaId || "default").trim();

    // já aplicado?
    if (memo[marker]?.aplicado) {
      return { ok: true, jaAplicado: true };
    }

    const js = await AsyncStorage.getItem("estoque");
    const lista = js ? JSON.parse(js) : [];
    const idx = lista.findIndex((p) => String(p.codigo) === String(codigo));

    if (idx < 0) {
      return { ok: false, motivo: "codigo_nao_encontrado" };
    }

    const qtd = Number(quantidade || 0);
    if (!(qtd > 0)) {
      return { ok: false, motivo: "quantidade_invalida" };
    }

    const it = { ...lista[idx] };
    const custoBase = Number(it.custoUnitarioBase || 0);
    const debito = custoBase * qtd;

    it.saida = (Number(it.saida) || 0) + qtd;
    it.valorTotal = Math.max(0, toNumberBRL(it.valorTotal) - debito);
    it.data = Date.now();

    lista[idx] = it;
    await AsyncStorage.setItem("estoque", JSON.stringify(lista));

    // marca como aplicado
    memo[marker] = { aplicado: true, qtd, at: Date.now() };
    await AsyncStorage.setItem(keyMemo, JSON.stringify(memo));

    // sync (opcional)
    await syncAdicionar("estoque", {
      tipo: "baixa_ficha_prazo",
      codigo,
      descricao: it.descricao,
      quantidade: qtd,
      valorDebitado: debito,
      custoUnitarioBase: custoBase,
      clientePrazo: String(clienteNome || ""),
      fichaId: String(fichaId || "default"),
      dataMov: new Date().toISOString(),
    });

    return { ok: true, qtd, debito, custoBase };
  } catch (e) {
    return { ok: false, motivo: "erro_interno", erro: String(e?.message || e) };
  }
}

export default function ControleEstoque() {
  // cadastro
  const [codigo, setCodigo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [entrada, setEntrada] = useState("");
  const [valorTotal, setValorTotal] = useState(""); // BRL mascarado
  const [estoque, setEstoque] = useState([]);

  // 🔎 busca
  const [busca, setBusca] = useState("");

  const nav = useNavigation();

  // modal de senha (genérico para EXCLUIR ou ESTORNAR)
  const indexParaExcluirRef = useRef(null);

  const itemParaExcluirRef = useRef(null);
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [senhaDigitada, setSenhaDigitada] = useState("");
  const [senhaContexto, setSenhaContexto] = useState(null); // "excluir" | "estorno"
  const [indexAlvo, setIndexAlvo] = useState(null); // índice do item afetado (p/ pintar vermelho)
  const [senhaErro, setSenhaErro] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  // modal de Estorno (preenche dados)
  const [modalEstornoVisivel, setModalEstornoVisivel] = useState(false);
  const [codigoEstorno, setCodigoEstorno] = useState("");
  const [qtdEstorno, setQtdEstorno] = useState("");
  // ✅ removido: valorEstorno (agora o estorno calcula automático pelo custo)

  // =========================
  // ✅ CUSTO UNITÁRIO SEGURO (auto p/ estorno)
  // =========================
  function getCustoUnitarioSeguro(item) {
    if (!item) return 0;

    const base = Number(item.custoUnitarioBase || 0);
    if (base > 0) return base;

    const teq = Number(item.totalEntradasQtde || 0);
    const tev = toNumberBRL(item.totalEntradasValor || 0);
    if (teq > 0 && tev > 0) return tev / teq;

    const entrada = Number(item.entrada || 0);
    const saida = Number(item.saida || 0);
    const saldo = entrada - saida;
    const valorTotal = toNumberBRL(item.valorTotal || 0);

    return saldo > 0 ? valorTotal / saldo : 0;
  }

  useEffect(() => {
    const iniciar = async () => {
      const json = await AsyncStorage.getItem("estoque");
      let arr = json ? JSON.parse(json) : [];

      // MIGRAÇÃO: normaliza número + cria custo fixo e acumuladores
      arr = (arr || []).map((it) => {
        const entradaN = Number(it.entrada || 0);
        const saidaN = Number(it.saida || 0);
        const valorTotalNum = toNumberBRL(it.valorTotal);

        if (
          typeof it.custoUnitarioBase === "number" &&
          typeof it.totalEntradasQtde === "number" &&
          typeof it.totalEntradasValor === "number"
        ) {
          // já migrado: só garante valorTotal em número
          return { ...it, valorTotal: valorTotalNum };
        }

        const saldo = Math.max(0, entradaN - saidaN);
        const custoBase = saldo > 0 ? valorTotalNum / saldo : 0;

        return {
          ...it,
          valorTotal: valorTotalNum,
          totalEntradasQtde: entradaN,
          totalEntradasValor: custoBase * entradaN,
          custoUnitarioBase: custoBase,
        };
      });

      // ordena p/ leitura
      arr.sort((a, b) =>
        String(a?.descricao || a?.codigo || "").localeCompare(
          String(b?.descricao || b?.codigo || ""),
          "pt-BR",
          { sensitivity: "base" },
        ),
      );

      // 💾 persiste a migração
      await AsyncStorage.setItem("estoque", JSON.stringify(arr));
      setEstoque(arr);

      const senhaExistente = await AsyncStorage.getItem("senhaAcesso");
      if (!senhaExistente) {
        await AsyncStorage.setItem("senhaAcesso", "1234");
      }
    };
    iniciar();
  }, []);

  const salvarProduto = async () => {
    Keyboard.dismiss();
    if (!codigo.trim() || !descricao.trim() || !entrada || !valorTotal) {
      Alert.alert(
        "Campos obrigatórios",
        "Preencha código, descrição, entrada e valor total.",
      );
      return;
    }

    const qtd = parseFloat(String(entrada).replace(",", ".")) || 0;
    const total = parseBRL(valorTotal);

    if (qtd <= 0 || total < 0) {
      Alert.alert(
        "Valores inválidos",
        "Verifique a quantidade e o valor total.",
      );
      return;
    }

    const lista = [...estoque];
    const idx = lista.findIndex((p) => p.codigo === codigo);

    if (idx >= 0) {
      const item = { ...lista[idx] };
      // custoUnitarioBase permanece FIXO
      item.entrada = (Number(item.entrada) || 0) + qtd;
      item.valorTotal = toNumberBRL(item.valorTotal) + total;
      item.totalEntradasQtde =
        (Number(item.totalEntradasQtde) || 0) + Number(qtd);
      item.totalEntradasValor =
        toNumberBRL(item.totalEntradasValor) + Number(total);
      item.descricao = descricao;
      item.data = Date.now();

      lista[idx] = item;
    } else {
      // primeiro cadastro define o custo base
      const custoBase = qtd > 0 ? total / qtd : 0;
      lista.push({
        id: Date.now().toString(),
        codigo,
        descricao,
        entrada: qtd,
        saida: 0,
        valorTotal: total,
        data: Date.now(),
        totalEntradasQtde: qtd,
        totalEntradasValor: total,
        custoUnitarioBase: custoBase,
      });
    }

    await AsyncStorage.setItem("estoque", JSON.stringify(lista));
    setCodigo("");
    setDescricao("");
    setEntrada("");
    setValorTotal("");
    setEstoque(lista);

    // Sync: ENTRADA
    await syncAdicionar("estoque", {
      tipo: "entrada",
      codigo,
      descricao,
      quantidade: qtd,
      valorAdicionado: total,
      dataMov: new Date().toISOString(),
    });
  };

  /* ========= Helpers p/ erro visual ========= */
  const marcarErroIndex = (idx, flag = true) => {
    if (idx === null || idx < 0) return;
    setEstoque((prev) => {
      const nova = [...prev];
      nova[idx] = { ...nova[idx], erroSenha: !!flag };
      return nova;
    });
  };
  const limparErroIndex = (idx) => marcarErroIndex(idx, false);
  const limparErroPorCodigo = (cod) => {
    const idx = estoque.findIndex((p) => String(p.codigo) === String(cod));
    if (idx >= 0) limparErroIndex(idx);
  };

  /* ========= Exclusão ========= */
  const executarExclusao = async (idx) => {
    const index = Number.isInteger(idx)
      ? idx
      : Number.isInteger(indexParaExcluirRef.current)
        ? indexParaExcluirRef.current
        : indexAlvo;

    if (index === null || index === undefined || index < 0) return;

    const itemRemovido = estoque[index];
    const nova = estoque.filter((_, i) => i !== index);
    await AsyncStorage.setItem("estoque", JSON.stringify(nova));
    setEstoque(nova);

    // Sync: EXCLUSÃO
    if (itemRemovido) {
      await syncAdicionar("estoque", {
        tipo: "exclusao",
        codigo: itemRemovido.codigo,
        descricao: itemRemovido.descricao,
        entrada: Number(itemRemovido.entrada || 0),
        saida: Number(itemRemovido.saida || 0),
        valorTotal: Number(itemRemovido.valorTotal || 0),
        dataMov: new Date().toISOString(),
      });
      // ✅ Limpeza de CMV por código (enxuto)
      try {
        if (itemRemovido?.codigo) {
          await removeCMVByCodigo(itemRemovido.codigo);
        }
      } catch {}
    }
  };

  const mostrarConfirmacaoExclusao = () => {
    const idx = Number.isInteger(indexParaExcluirRef.current)
      ? indexParaExcluirRef.current
      : indexAlvo;

    const item = estoque[idx];

    const msg =
      `Excluir definitivamente o produto "${item?.codigo || ""}"?\n` +
      `Descrição: ${item?.descricao || "-"}\n` +
      `A ação não pode ser desfeita.`;

    Alert.alert("Confirmar exclusão", msg, [
      {
        text: "Cancelar",
        style: "cancel",
        onPress: () => {
          if (idx !== null && idx >= 0) limparErroIndex(idx);
          setSenhaContexto(null);
          setIndexAlvo(null);
          indexParaExcluirRef.current = null; // ✅ limpa também
        },
      },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          await executarExclusao(idx); // ✅ idx travado
          if (idx !== null && idx >= 0) limparErroIndex(idx);
          setSenhaContexto(null);
          setIndexAlvo(null);
          indexParaExcluirRef.current = null; // ✅ limpa também
        },
      },
    ]);
  };

  // ✅ Exclusão com senha (produção) / sem senha (teste)
  const solicitarSenhaParaExcluir = (index) => {
    indexParaExcluirRef.current = index;
    setIndexAlvo(index);

    // 🔒 sempre pede senha (produção)
    setSenhaDigitada("");
    setSenhaContexto("excluir");
    setSenhaVisivel(true);
  };

  /* ========= Estorno (AUTOMÁTICO por custo) ========= */
  const abrirModalEstorno = (codigoPadrao = "") => {
    setCodigoEstorno(String(codigoPadrao || ""));
    setQtdEstorno("");
    setModalEstornoVisivel(true);
  };

  // 1ª confirmação (antes da senha)
  const confirmarEstorno = async () => {
    const codigo = String(codigoEstorno || "").trim();
    const qtd = Number(String(qtdEstorno || "").replace(",", ".")) || 0;

    if (!codigo || !qtd || qtd <= 0) {
      Alert.alert(
        "Erro",
        "Informe o código e uma quantidade válida para estornar.",
      );
      return;
    }

    try {
      const json = await AsyncStorage.getItem("estoque");
      const lista = json ? JSON.parse(json) : [];
      const idx = lista.findIndex((p) => String(p.codigo) === codigo);

      if (idx < 0) {
        Alert.alert("Não encontrado", "Código não localizado no estoque.");
        return;
      }

      const item = lista[idx];
      // 🔒 TRAVA: só deixa estornar se tiver saída disponível
      const saidaAtual = Number(item.saida || 0);

      if (saidaAtual <= 0) {
        Alert.alert(
          "Estorno bloqueado",
          "Não há saídas registradas para este produto. Não é possível estornar.",
        );
        return;
      }

      if (qtd > saidaAtual) {
        Alert.alert(
          "Estorno bloqueado",
          `Você está tentando estornar ${qtd}, mas só existe ${saidaAtual} de saída para este produto.`,
        );
        return;
      }

      // ✅ custo unitário atual (auto)
      const custoUnit = getCustoUnitarioSeguro(item);
      const valorEst = Number(custoUnit || 0) * qtd;

      const custoFmt = Number(custoUnit || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
      const valorFmt = Number(valorEst || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });

      const mensagem =
        `Confirmar estorno para o produto "${codigo}"?\n\n` +
        `Quantidade a estornar: ${qtd}\n` +
        `Custo unitário (auto): ${custoFmt}\n` +
        `Valor a estornar (auto): ${valorFmt}`;

      Alert.alert("Confirmar estorno", mensagem, [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Continuar",
          style: "destructive",
          onPress: () => solicitarSenhaParaEstorno(codigo),
        },
      ]);
    } catch (e) {
      console.log("confirmarEstorno erro:", e);
      Alert.alert("Erro", "Não foi possível preparar o estorno agora.");
    }
  };

  const solicitarSenhaParaEstorno = (codigoParaMarcar) => {
    const idx = estoque.findIndex(
      (p) => String(p.codigo) === String(codigoParaMarcar || "").trim(),
    );
    setIndexAlvo(idx >= 0 ? idx : null);
    setSenhaDigitada("");
    setSenhaContexto("estorno");

    setSenhaVisivel(true);
  };

  const efetivarEstorno = async () => {
    const codigo = String(codigoEstorno || "").trim();
    const qtd = Number(String(qtdEstorno || "").replace(",", ".")) || 0;

    try {
      const json = await AsyncStorage.getItem("estoque");
      const lista = json ? JSON.parse(json) : [];
      const idx = lista.findIndex((p) => String(p.codigo) === codigo);

      if (idx < 0) {
        Alert.alert("Não encontrado", "Código não localizado no estoque.");
        return;
      }

      const item = lista[idx];
      // 🔒 TRAVA: impede estornar sem saída (e impede estornar mais que a saída)
      const saidaAtual = Number(item.saida || 0);

      if (saidaAtual <= 0) {
        Alert.alert(
          "Estorno bloqueado",
          "Este produto não tem saídas para estornar.",
        );
        return;
      }

      if (qtd > saidaAtual) {
        Alert.alert(
          "Estorno bloqueado",
          `Só é possível estornar até ${saidaAtual} unidade(s) deste produto.`,
        );
        return;
      }

      // ✅ SEMPRE por custo unitário (auto)
      const custoUnit = getCustoUnitarioSeguro(item);
      const valorEst = Number(custoUnit || 0) * qtd;

      // ✅ ajusta saída e valor total
      item.saida = Math.max(0, (Number(item.saida) || 0) - qtd);
      const atualValor = toNumberBRL(item.valorTotal);
      item.valorTotal = Number(atualValor || 0) + Number(valorEst || 0);

      lista[idx] = item;

      await AsyncStorage.setItem("estoque", JSON.stringify(lista));
      setEstoque(lista);

      // Sync: ESTORNO
      await syncAdicionar("estoque", {
        tipo: "estorno",
        codigo,
        descricao: item.descricao,
        quantidadeEstornada: qtd,
        custoUnitario: custoUnit,
        valorEstornado: valorEst,
        dataMov: new Date().toISOString(),
      });

      setModalEstornoVisivel(false);

      Alert.alert(
        "Estorno concluído",
        "Saída estornada pelo custo com sucesso.\n\n⚠️ Alerta: não esqueça de excluir o produto na tela Vendas.",
      );
    } catch (e) {
      console.log("efetivarEstorno erro:", e);
      Alert.alert("Erro", "Não foi possível estornar agora.");
    }
  };

  const mostrarConfirmacaoEstornoPosSenha = async () => {
    const codigo = String(codigoEstorno || "").trim();
    const qtd = Number(String(qtdEstorno || "").replace(",", ".")) || 0;

    try {
      const json = await AsyncStorage.getItem("estoque");
      const lista = json ? JSON.parse(json) : [];
      const idx = lista.findIndex((p) => String(p.codigo) === codigo);

      if (idx < 0) {
        Alert.alert("Não encontrado", "Código não localizado no estoque.");
        return;
      }

      const item = lista[idx];
      const custoUnit = getCustoUnitarioSeguro(item);
      const valorEst = Number(custoUnit || 0) * qtd;

      const custoFmt = Number(custoUnit || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
      const valorFmt = Number(valorEst || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });

      const msg =
        `Confirmar estorno para o produto "${codigo}"?\n\n` +
        `Quantidade: ${qtd}\n` +
        `Custo unitário (auto): ${custoFmt}\n` +
        `Valor (auto): ${valorFmt}`;

      Alert.alert("Confirmar estorno", msg, [
        {
          text: "Cancelar",
          style: "cancel",
          onPress: () => {
            if (indexAlvo !== null && indexAlvo >= 0)
              limparErroIndex(indexAlvo);
            limparErroPorCodigo(codigoEstorno);
            setSenhaContexto(null);
            setIndexAlvo(null);
          },
        },
        {
          text: "Estornar",
          style: "destructive",
          onPress: async () => {
            await efetivarEstorno();
            if (indexAlvo !== null && indexAlvo >= 0)
              limparErroIndex(indexAlvo);
            limparErroPorCodigo(codigoEstorno);
            setSenhaContexto(null);
            setIndexAlvo(null);
          },
        },
      ]);
    } catch (e) {
      console.log("mostrarConfirmacaoEstornoPosSenha erro:", e);
      Alert.alert("Erro", "Não foi possível confirmar o estorno agora.");
    }
  };

  const verificarSenha = async () => {
    const senhaSalva = (await AsyncStorage.getItem("senhaAcesso")) || "1234";
    const senhaOk = senhaDigitada === senhaSalva;

    setSenhaVisivel(false);
    setSenhaDigitada("");

    if (!senhaOk) {
      if (indexAlvo !== null && indexAlvo >= 0) {
        marcarErroIndex(indexAlvo, true);
      } else if (senhaContexto === "estorno") {
        const idx = estoque.findIndex(
          (p) => String(p.codigo) === String(codigoEstorno || "").trim(),
        );
        if (idx >= 0) marcarErroIndex(idx, true);
      }
      setSenhaContexto(null);
      setIndexAlvo(null);
      return;
    }

    if (senhaContexto === "excluir") {
      setSenhaVisivel(false);
      mostrarConfirmacaoExclusao();
    } else if (senhaContexto === "estorno") {
      setSenhaVisivel(false);
      mostrarConfirmacaoEstornoPosSenha();
    } else {
      setSenhaVisivel(false);
      setSenhaContexto(null);
      setIndexAlvo(null);
      indexParaExcluirRef.current = null;
    }
  };
  const abrirCatalogo = async () => {
    const existe = await AsyncStorage.getItem("catalogo");
    if (!existe) {
      await AsyncStorage.setItem("catalogo", JSON.stringify(estoque));
    }
    nav.navigate("CatalogoScreen");
  };

  const fmtInt = (v) => Math.floor(Number(v || 0)).toLocaleString("pt-BR");
  const fmtValor = (v) =>
    Number(v || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
    });
  const fmtData = (ms) => new Date(ms).toLocaleDateString("pt-BR");

  // 🔎 lista filtrada + totais
  const estoqueFiltrado = useMemo(() => {
    const q = normalize(busca);
    if (!q) return estoque;
    const terms = q.split(/\s+/).filter(Boolean);
    return (estoque || []).filter((it) => {
      const hay = normalize(`${it.codigo || ""} ${it.descricao || ""}`);
      return terms.every((t) => hay.includes(t));
    });
  }, [estoque, busca]);

  const sumValor = (arr) =>
    (arr || []).reduce((acc, it) => acc + (toNumberBRL(it.valorTotal) || 0), 0);
  const sumEstoque = (arr) =>
    (arr || []).reduce(
      (acc, it) => acc + (Number(it.entrada || 0) - Number(it.saida || 0)),
      0,
    );

  const totalGeralValor = useMemo(() => sumValor(estoque), [estoque]);
  const totalGeralQtde = useMemo(() => sumEstoque(estoque), [estoque]);
  const totalFiltradoValor = useMemo(
    () => sumValor(estoqueFiltrado),
    [estoqueFiltrado],
  );
  const totalFiltradoQtde = useMemo(
    () => sumEstoque(estoqueFiltrado),
    [estoqueFiltrado],
  );

  /* ====== Impressão (PDF) ====== */
  const askAndPrint = () => {
    Alert.alert(
      "Imprimir PDF",
      "O que deseja imprimir?",
      [
        { text: "Somente filtrado", onPress: () => gerarPDF(true) },
        { text: "Tudo", onPress: () => gerarPDF(false) },
        { text: "Cancelar", style: "cancel" },
      ],
      { cancelable: true },
    );
  };

  async function gerarPDF(onlyFiltered = false) {
    try {
      const Print = (await import("expo-print")).printToFileAsync;
      const { shareAsync } = await import("expo-sharing");

      const base = onlyFiltered ? estoqueFiltrado : estoque;

      const linhas = (base || [])
        .map((it) => {
          const codigo = String(it.codigo || "-").replace(/</g, "&lt;");
          const desc = String(it.descricao || "-").replace(/</g, "&lt;");
          const entrada = Number(it.entrada || 0);
          const saida = Number(it.saida || 0);
          const expo = entrada - saida;
          const vTotal = fmtValor(toNumberBRL(it.valorTotal) || 0);
          const dt = it.data
            ? new Date(it.data).toLocaleDateString("pt-BR")
            : "-";
          return `
          <tr>
            <td style="padding:6px;border-bottom:1px solid #eee;">${dt}</td>
            <td style="padding:6px;border-bottom:1px solid #eee;">${codigo}</td>
            <td style="padding:6px;border-bottom:1px solid #eee;">${desc}</td>
            <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;">${entrada}</td>
            <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;">${saida}</td>
            <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;">${expo}</td>
            <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;">${vTotal}</td>
          </tr>
        `;
        })
        .join("");

      const cardInfo = onlyFiltered
        ? `
      <div class="row"><div class="label">Filtro</div><div class="value">Somente itens filtrados</div></div>
      <div class="row"><div class="label">Itens</div><div class="value">${
        (base || []).length
      }</div></div>
      <div class="row"><div class="label">Qtde total (filtrado)</div><div class="value">${totalFiltradoQtde}</div></div>
      <div class="row"><div class="label">Valor total (filtrado)</div><div class="value">${fmtValor(
        totalFiltradoValor,
      )}</div></div>
    `
        : `
      <div class="row"><div class="label">Itens</div><div class="value">${
        (base || []).length
      }</div></div>
      <div class="row"><div class="label">Qtde total (geral)</div><div class="value">${totalGeralQtde}</div></div>
      <div class="row"><div class="label">Valor total (geral)</div><div class="value">${fmtValor(
        totalGeralValor,
      )}</div></div>
    `;

      const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: -apple-system, Roboto, Arial, sans-serif; padding: 24px; }
            h1 { font-size: 20px; text-align: center; margin: 0 0 12px 0; }
            h2 { font-size: 16px; margin: 16px 0 8px; }
            .card { border: 1px solid #ececff; background: #f8f8ff; border-radius: 12px; padding: 12px; }
            .row { display: flex; justify-content: space-between; margin: 6px 0; }
            .label { color: #111; }
            .value { font-weight: 800; color: #111; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
            th { text-align: left; padding: 6px; background: #fafafa; border-bottom: 1px solid #eee; }
          </style>
        </head>
        <body>
          <h1>Controle de Estoque</h1>

          <div class="card">
            ${cardInfo}
          </div>

          <h2>Itens (${(base || []).length})</h2>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Código</th>
                <th>Descrição</th>
                <th style="text-align:right;">Entrada</th>
                <th style="text-align:right;">Saída</th>
                <th style="text-align:right;">Estoque</th>
                <th style="text-align:right;">Valor Total</th>
              </tr>
            </thead>
            <tbody>
              ${linhas}
            </tbody>
          </table>
        </body>
      </html>
    `;

      const file = await Print({ html });
      await shareAsync(file.uri);
    } catch (e) {
      Alert.alert(
        "Impressão indisponível",
        "Para gerar PDF, instale e configure expo-print e expo-sharing.\n\nErro: " +
          (e?.message || e),
      );
    }
  }

  const renderItem = ({ item, index }) => {
    const corDeFundo = index % 2 === 0 ? "#fff" : "#f1f1f1";
    const exposicao = (Number(item.entrada) || 0) - (Number(item.saida) || 0);
    const custoBase = getCustoUnitarioSeguro(item);
    const podeEstornar = Number(item.saida || 0) > 0;

    <TouchableOpacity
      style={[styles.rowItem, !podeEstornar && { opacity: 0.4 }]}
      onPress={() => {
        if (!podeEstornar) {
          Alert.alert(
            "Estorno bloqueado",
            "Não há saídas para estornar neste produto.",
          );
          return;
        }
        abrirModalEstorno(item.codigo);
      }}
    >
      <Text style={styles.estornar}>Estornar</Text>
    </TouchableOpacity>;

    return (
      <View style={[styles.itemBox, { backgroundColor: corDeFundo }]}>
        <View style={styles.itemLinha1}>
          <Text style={[styles.codigo, item.erroSenha && styles.erro]}>
            {item.codigo}
          </Text>
          <Text style={styles.data}>{fmtData(item.data)}</Text>
          <Text style={[styles.descricao, item.erroSenha && styles.erro]}>
            {item.descricao}
          </Text>
        </View>

        <View style={styles.itemLinha2}>
          <Text
            style={[
              styles.detalhe,
              styles.rowItem,
              item.erroSenha && styles.erro,
            ]}
          >
            Entrada: {fmtInt(item.entrada)}
          </Text>
          <Text
            style={[
              styles.detalhe,
              styles.rowItem,
              item.erroSenha && styles.erro,
            ]}
          >
            Saída: {fmtInt(item.saida)}
          </Text>
          <Text
            style={[
              styles.detalhe,
              styles.rowItem,
              item.erroSenha && styles.erro,
            ]}
          >
            Expo.: {fmtInt(exposicao)}
          </Text>
          <Text
            style={[
              styles.detalhe,
              styles.rowItem,
              item.erroSenha && styles.erro,
            ]}
          >
            Total: {fmtValor(toNumberBRL(item.valorTotal))}
          </Text>
          <Text style={[styles.detalhe, styles.rowItem]}>
            Custo unit.: {fmtValor(custoBase)}
          </Text>

          {/* Ações do item */}
          <TouchableOpacity
            style={[styles.rowItem]}
            onPress={() => abrirModalEstorno(item.codigo)}
          >
            <Text style={styles.estornar}>Estornar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.rowItem]}
            onPress={() => solicitarSenhaParaExcluir(index)}
          >
            <Text style={styles.excluir}>X</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Controle de Estoque</Text>

      {/* Ações rápidas */}
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.filterBtn} onPress={askAndPrint}>
          <Text style={styles.filterTxt}>Imprimir PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.filterBtn}
          onPress={async () => {
            try {
              const json = await AsyncStorage.getItem("estoque");
              let arr = json ? JSON.parse(json) : [];

              arr = (Array.isArray(arr) ? arr : []).map((it) => {
                const entradaN = Number(it.entrada || 0);
                const saidaN = Number(it.saida || 0);
                const valorTotalNum = toNumberBRL(it.valorTotal);

                const totalEntradasQtde = Number(it.totalEntradasQtde || 0);
                const totalEntradasValor = toNumberBRL(
                  it.totalEntradasValor || 0,
                );

                let custoUnitarioBase = Number(it.custoUnitarioBase || 0);

                if (!(custoUnitarioBase > 0)) {
                  if (totalEntradasQtde > 0 && totalEntradasValor > 0) {
                    custoUnitarioBase = totalEntradasValor / totalEntradasQtde;
                  } else {
                    const saldo = Math.max(0, entradaN - saidaN);
                    custoUnitarioBase = saldo > 0 ? valorTotalNum / saldo : 0;
                  }
                }

                return {
                  ...it,
                  entrada: entradaN,
                  saida: saidaN,
                  valorTotal: valorTotalNum,
                  totalEntradasQtde:
                    totalEntradasQtde > 0 ? totalEntradasQtde : entradaN,
                  totalEntradasValor:
                    totalEntradasValor > 0
                      ? totalEntradasValor
                      : custoUnitarioBase * entradaN,
                  custoUnitarioBase,
                };
              });

              await AsyncStorage.setItem("estoque", JSON.stringify(arr));
              setEstoque(arr);
            } catch (e) {
              console.log("Erro ao atualizar estoque:", e);
              setEstoque([]);
            }
          }}
        >
          <Text style={styles.filterTxt}>Atualizar</Text>
        </TouchableOpacity>
      </View>

      {/* 🔎 Busca estilo "fininho" */}
      <TextInput
        placeholder="Pesquisar por código ou nome..."
        placeholderTextColor="#111"
        style={[
          styles.filterBtn,
          { fontWeight: "700", color: "#111", height: 36, marginBottom: 8 },
        ]}
        value={busca}
        onChangeText={setBusca}
        returnKeyType="search"
      />

      <View style={styles.form}>
        <TextInput
          style={[styles.mini, styles.fieldSpacing]}
          placeholder="Código"
          value={codigo}
          onChangeText={setCodigo}
        />
        <TextInput
          style={[styles.descricaoMaior, styles.fieldSpacing]}
          placeholder="Descrição"
          value={descricao}
          onChangeText={setDescricao}
        />
        <TextInput
          style={[styles.mini, styles.fieldSpacing]}
          placeholder="Entrada"
          value={entrada}
          onChangeText={setEntrada}
          keyboardType="numeric"
        />
        <TextInput
          style={[styles.mini, styles.fieldSpacing]}
          placeholder="Valor Total"
          value={valorTotal}
          onChangeText={(t) => setValorTotal(maskBRL(t))}
          keyboardType="numeric"
        />
      </View>

      <View style={styles.botaoContainer}>
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary]}
          onPress={salvarProduto}
        >
          <Text style={styles.btnText}>Salvar Produto</Text>
        </TouchableOpacity>

        <View style={{ height: 8 }} />

        <TouchableOpacity
          style={[styles.btn, styles.btnGold]}
          onPress={() => abrirModalEstorno()}
        >
          <Text style={styles.btnText}>Estornar Saída</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, { marginTop: 8 }]}
          onPress={abrirCatalogo}
        >
          <Text style={styles.btnText}>Catálogo</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        style={{ flex: 1, marginTop: 10 }}
        data={estoqueFiltrado}
        keyExtractor={(it) => it.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={
          <Text style={{ textAlign: "center", color: "#666", marginTop: 8 }}>
            {busca ? "Nenhum item corresponde ao filtro." : "Estoque vazio."}
          </Text>
        }
      />

      {/* Totais */}
      <View style={styles.blocoEstoqueTotal}>
        <Text style={styles.textoEstoqueTotal}>
          📦 Valor total atual (geral): {fmtValor(totalGeralValor)}
        </Text>
        {!!busca && (
          <Text style={[styles.textoEstoqueTotal, { marginTop: 6 }]}>
            🔎 Valor (filtrado): {fmtValor(totalFiltradoValor)} • Qtde
            (filtrada): {totalFiltradoQtde}
          </Text>
        )}
      </View>

      {/* Modal senha (genérico para excluir/estornar) */}
      <Modal visible={senhaVisivel} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitulo}>
              {senhaContexto === "estorno"
                ? "Digite a senha para estornar"
                : "Digite a senha para excluir"}
            </Text>
            <TextInput
              style={styles.inputSenha}
              placeholder="Senha"
              secureTextEntry
              value={senhaDigitada}
              onChangeText={setSenhaDigitada}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[
                  styles.btn,
                  styles.btnGhost,
                  { flex: 1, marginRight: 8 },
                ]}
                onPress={() => {
                  setSenhaVisivel(false);
                  setSenhaDigitada("");
                }}
              >
                <Text style={styles.btnGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, { flex: 1 }]}
                onPress={verificarSenha}
              >
                <Text style={styles.btnText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal estorno (preenche dados) */}
      <Modal visible={modalEstornoVisivel} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitulo}>Estornar Saída de Estoque</Text>

            <TextInput
              placeholder="Código do produto"
              value={codigoEstorno}
              onChangeText={setCodigoEstorno}
              autoCapitalize="characters"
              style={styles.inputSenha}
            />

            <TextInput
              placeholder="Quantidade a estornar"
              value={qtdEstorno}
              onChangeText={setQtdEstorno}
              keyboardType="numeric"
              style={styles.inputSenha}
            />

            {/* ✅ REMOVIDO: campo de valor (agora calcula automático pelo custo) */}

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[
                  styles.btn,
                  styles.btnGhost,
                  { flex: 1, marginRight: 8 },
                ]}
                onPress={() => setModalEstornoVisivel(false)}
              >
                <Text style={styles.btnGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnGold, { flex: 1 }]}
                onPress={confirmarEstorno}
              >
                <Text style={styles.btnText}>Confirmar Estorno</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  titulo: { fontSize: 20, fontWeight: "bold", textAlign: "center" },

  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    marginBottom: 6,
  },
  // “fininho” estilo filtro/botão
  filterBtn: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
  },
  filterTxt: { fontWeight: "700", color: "#111" },

  form: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
  fieldSpacing: { marginRight: 6, marginBottom: 6 },
  mini: {
    width: 110,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 6,
    backgroundColor: "#fff",
  },
  descricaoMaior: {
    flex: 1,
    minWidth: 150,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 6,
    backgroundColor: "#fff",
  },

  botaoContainer: {
    width: "100%",
    alignItems: "center",
    marginTop: 4,
  },

  itemBox: {
    padding: 8,
    borderRadius: 8,
    marginBottom: 6,
  },
  itemLinha1: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  itemLinha2: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  rowItem: { marginRight: 8, marginBottom: 4 },

  codigo: { fontWeight: "bold", fontSize: 14 },
  data: { fontSize: 12, color: "#666" },
  descricao: { flex: 1, fontSize: 14 },
  detalhe: { fontSize: 13 },

  excluir: { color: "red", fontWeight: "bold", paddingHorizontal: 6 },
  estornar: { color: "#bfa140", fontWeight: "bold", paddingHorizontal: 6 },

  sep: { height: 4 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBox: {
    width: "80%",
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 10,
    elevation: 10,
  },
  modalTitulo: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  inputSenha: {
    ...FORM_CARD,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 8,
    marginBottom: 10,
    backgroundColor: "#fff",
  },
  modalBtns: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  blocoEstoqueTotal: {
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#006400",
    padding: 12,
    marginTop: 12,
    marginBottom: 24,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  textoEstoqueTotal: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#006400",
    textAlign: "center",
  },

  /* ===== Botões padronizados ===== */
  btn: {
    width: "100%",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: {
    color: "#fff",
    fontWeight: "700",
  },
  btnPrimary: {
    backgroundColor: "#2196F3",
  },
  btnGold: {
    backgroundColor: "#bfa140",
  },
  btnGhost: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ccc",
  },
  btnGhostText: {
    color: "#111",
    fontWeight: "700",
  },

  erro: { color: "red" },
});
