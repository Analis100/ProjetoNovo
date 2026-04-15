// screens/ClientePrazo.js
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  TouchableOpacity,
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useFocusEffect } from "@react-navigation/native";

// ✅ Colaboradores (Firestore) — soma no mês + venda detalhada
import {
  addSaleToCollaborator,
  registerCloudSale,
} from "./services/colabSales";

const PLACEHOLDER = "#777";

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
const fmtBRLNumber = (v) =>
  Number(v ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

// ✅ parse robusto para quantidade
function parseQtyLoose(v) {
  if (typeof v === "number") return v;
  const s = String(v || "").trim();
  const n = s
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const f = parseFloat(n);
  return isNaN(f) ? 0 : f;
}

/* ===== Helpers ESTOQUE (baixa por custo) ===== */
async function getEstoqueItem(codigo) {
  const js = await AsyncStorage.getItem("estoque");
  const lista = js ? JSON.parse(js) : [];
  const idx = lista.findIndex((p) => String(p.codigo) === String(codigo));
  return { lista, idx };
}
function toNumberBRLLoose(v) {
  if (typeof v === "number") return v;
  if (!v) return 0;
  const s = String(v).trim();
  const n = s
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const f = parseFloat(n);
  return isNaN(f) ? 0 : f;
}
function calcCustoUnitarioAtual(item) {
  if (!item) return 0;
  if (typeof item.custoUnitarioBase === "number" && item.custoUnitarioBase > 0)
    return Number(item.custoUnitarioBase);

  const teq = Number(item.totalEntradasQtde || 0);
  const tev = toNumberBRLLoose(item.totalEntradasValor || 0);
  if (teq > 0 && tev > 0) return tev / teq;

  const entrada = Number(item.entrada || 0);
  const saida = Number(item.saida || 0);
  const saldo = entrada - saida;
  const valorTotal = toNumberBRLLoose(item.valorTotal || 0);
  return saldo > 0 ? valorTotal / saldo : 0;
}

async function baixarEstoquePorCusto(codigo, quantidade) {
  const { lista, idx } = await getEstoqueItem(codigo);
  if (idx < 0) return null;
  const it = lista[idx];
  const qtd = Number(quantidade || 0);
  if (qtd <= 0) return null;

  const custoUnit = calcCustoUnitarioAtual(it);
  const custoTotal = custoUnit * qtd;

  it.saida = (Number(it.saida) || 0) + qtd;
  const novoValor =
    toNumberBRLLoose(it.valorTotal || 0) - Number(custoTotal || 0);
  it.valorTotal = novoValor > 0 ? novoValor : 0;

  lista[idx] = it;
  await AsyncStorage.setItem("estoque", JSON.stringify(lista));
  return { custoUnit, custoTotal };
}

/* ===== Helpers de datas / keys ===== */
const VENDAS_PRIMARY = "venda";

const toISOFromPtBr = (ddmmyyyy) => {
  try {
    const [dd, mm, yyyy] = String(ddmmyyyy || "")
      .split("/")
      .map(Number);
    if (!dd || !mm || !yyyy) return new Date().toISOString();
    return new Date(yyyy, mm - 1, dd, 12, 0, 0).toISOString();
  } catch {
    return new Date().toISOString();
  }
};

function makeVendaPrazoId(nome, dataPtBr, valorTotalNum, codigo) {
  return `${String(nome || "").trim()}|${String(dataPtBr || "").trim()}|${String(
    valorTotalNum || 0,
  ).trim()}|${String(codigo || "").trim()}`;
}

/**
 * ✅ registra em "venda" (MEI/Colaboradores) — AGORA com trava anti-duplicação por vendaPrazoId
 * retorna:
 *  { inserted: boolean, vendaLocalId?: string }
 */
async function registrarVendaNoMEI({
  nomeCliente,
  valorTotalNum,
  dataVendaPtBr,
  colaboradorId,
  vendaPrazoId,
  estoqueCodigo,
  estoqueQtd,
  estoqueCustoUnit,
  estoqueCustoTotal,
  estoqueBaixadoAt,
}) {
  try {
    const raw = await AsyncStorage.getItem(VENDAS_PRIMARY);
    const arr = raw ? JSON.parse(raw) : [];
    const lista = Array.isArray(arr) ? arr : [];

    const valor = Number(valorTotalNum || 0);
    if (!valor || valor <= 0) return { inserted: false };

    // ✅ trava por vendaPrazoId (não duplica)
    const vpid = vendaPrazoId ? String(vendaPrazoId) : "";
    if (vpid && lista.some((x) => String(x.vendaPrazoId || "") === vpid)) {
      return { inserted: false };
    }

    const cod = String(estoqueCodigo || "").trim();
    const qtd = Number(estoqueQtd || 0);
    const custoTotal = Number(estoqueCustoTotal || 0);
    const custoUnit = Number(estoqueCustoUnit || 0);

    const vendaLocalId = String(Date.now());

    lista.push({
      id: vendaLocalId,
      vendaPrazoId: vpid || undefined,
      cliente: (nomeCliente || "").trim(),
      dataISO: toISOFromPtBr(dataVendaPtBr),
      data: dataVendaPtBr,
      descricao: `Venda a prazo - ${nomeCliente || "Cliente"}`,
      valor,
      valorTotal: valor,
      origem: "prazo",
      colaboradorId: colaboradorId ? String(colaboradorId) : null,
      createdAt: new Date().toISOString(),
      estoqueCodigo: cod || undefined,
      estoqueQtd: qtd > 0 ? qtd : undefined,
      estoqueCustoUnit: custoUnit > 0 ? custoUnit : undefined,
      estoqueCustoTotal: custoTotal > 0 ? custoTotal : undefined,
      estoqueBaixadoAt: estoqueBaixadoAt || undefined,
      estoqueBaixado: cod && qtd > 0 ? true : undefined,
    });

    await AsyncStorage.setItem(VENDAS_PRIMARY, JSON.stringify(lista));
    return { inserted: true, vendaLocalId };
  } catch (e) {
    console.log("registrarVendaNoMEI erro:", e?.message || e);
    return { inserted: false };
  }
}

async function marcarVendaPrazoCloudSync(nomeCliente, patch = {}) {
  try {
    const nome = String(nomeCliente || "").trim();
    if (!nome) return;

    const raw = await AsyncStorage.getItem("clientesPrazo");
    const obj = raw ? JSON.parse(raw) : {};
    const atual = obj[nome] || {};

    obj[nome] = {
      ...atual,
      ficha: {
        ...(atual.ficha || {}),
        ...patch,
      },
    };

    await AsyncStorage.setItem("clientesPrazo", JSON.stringify(obj));
  } catch (e) {
    console.log("marcarVendaPrazoCloudSync erro:", e?.message || e);
  }
}

export default function ClientePrazo({ route, navigation }) {
  const nomeParam = route?.params?.cliente || "";

  const [dataAtual, setDataAtual] = useState("");
  const [nomeCliente, setNomeCliente] = useState(nomeParam || "");
  const [endereco, setEndereco] = useState("");
  const [codigoProduto, setCodigoProduto] = useState("");
  const [quantidadeVendida, setQuantidadeVendida] = useState("");
  const [valorTotal, setValorTotal] = useState("");
  const [qtdParcelas, setQtdParcelas] = useState("");
  const [vencimentoInicial, setVencimentoInicial] = useState("");
  const [parcelas, setParcelas] = useState([]);
  const [filtroVencimento, setFiltroVencimento] = useState("");
  const [fichaCliente, setFichaCliente] = useState(null);

  const [colaboradores, setColaboradores] = useState([]);
  const [colabSelecionado, setColabSelecionado] = useState(null);
  const [modalColab, setModalColab] = useState(false);

  useEffect(() => {
    const hoje = new Date();
    setDataAtual(hoje.toLocaleDateString("pt-BR"));

    (async () => {
      try {
        const raw = await AsyncStorage.getItem("@colaboradores_v2");
        const parsed = raw ? JSON.parse(raw) : [];
        const lista = Array.isArray(parsed) ? parsed : [];
        const ativos = lista.filter((c) => c?.ativo);
        setColaboradores(ativos);
      } catch {}
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      const n = (route?.params?.cliente || nomeCliente || "").trim();
      if (route?.params?.cliente && route.params.cliente !== nomeCliente) {
        setNomeCliente(route.params.cliente);
      }
      if (n) carregarDados(n);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [route?.params?.cliente]),
  );

  const formatarData = (texto) => {
    let v = (texto || "").replace(/\D/g, "");
    if (v.length >= 3 && v.length <= 4) v = v.replace(/(\d{2})(\d+)/, "$1/$2");
    else if (v.length > 4) v = v.replace(/(\d{2})(\d{2})(\d{1,4})/, "$1/$2/$3");
    return v;
  };

  const carregarDados = async (nome) => {
    const json = await AsyncStorage.getItem("clientesPrazo");
    const obj = json ? JSON.parse(json) : {};

    const parcelasSalvas = obj[nome]?.parcelas || [];
    setParcelas(parcelasSalvas);

    const ficha = obj[nome]?.ficha;
    if (ficha) {
      setFichaCliente(ficha);
      setEndereco(ficha.endereco || "");
      setCodigoProduto(ficha.codigoProduto || "");
      setQuantidadeVendida(String(ficha.quantidadeVendida || ""));
      setValorTotal(fmtBRLNumber(ficha.valorTotal || 0));
      setColabSelecionado(
        obj[nome]?.colaboradorIdDefault || ficha.colaboradorIdDefault || null,
      );
    } else {
      setFichaCliente(null);
      setEndereco("");
      setCodigoProduto("");
      setQuantidadeVendida("");
      setValorTotal("");
      setColabSelecionado(obj[nome]?.colaboradorIdDefault || null);
    }
  };

  const escolherColaborador = async (id) => {
    setColabSelecionado(id);
    setModalColab(false);

    const nome = (nomeCliente || "").trim();
    if (!nome) return;

    // ✅ salva como default do cliente (pra próxima vez já vir marcado)
    try {
      const json = await AsyncStorage.getItem("clientesPrazo");
      const obj = json ? JSON.parse(json) : {};
      obj[nome] = obj[nome] || {};
      obj[nome].colaboradorIdDefault = id;

      // mantém ficha se existir
      obj[nome].ficha = obj[nome].ficha || {};
      obj[nome].ficha.colaboradorIdDefault = id;

      await AsyncStorage.setItem("clientesPrazo", JSON.stringify(obj));
    } catch {}
  };

  const salvarParcelas = async () => {
    Keyboard.dismiss();
    const nome = (nomeCliente || "").trim();

    if (
      !nome ||
      !endereco ||
      !codigoProduto ||
      !quantidadeVendida ||
      !valorTotal
    ) {
      Alert.alert(
        "Campos obrigatórios",
        "Preencha os dados do cliente (ficha) antes de salvar as parcelas.",
      );
      return;
    }

    if (!qtdParcelas || !vencimentoInicial) {
      Alert.alert(
        "Campos obrigatórios",
        "Preencha todos os dados das parcelas.",
      );
      return;
    }

    const valorTotalNum = parseBRL(valorTotal);
    const qtdParcelasNum = Number(qtdParcelas);

    if (!qtdParcelasNum || qtdParcelasNum <= 0) {
      Alert.alert("Erro", "Informe uma quantidade de parcelas válida.");
      return;
    }

    const [dia, mes, ano] = (vencimentoInicial || "").split("/").map(Number);
    if (!dia || !mes || !ano) {
      Alert.alert(
        "Data inválida",
        "Informe o vencimento no formato dd/mm/aaaa.",
      );
      return;
    }

    // 🔒 Conferir estoque
    try {
      const { lista, idx } = await getEstoqueItem(codigoProduto);

      if (idx < 0) {
        Alert.alert(
          "Produto não encontrado",
          "Este código não está cadastrado no Controle de Estoque.",
        );
        return;
      }

      const itemEstoque = lista[idx];
      const entrada = Number(itemEstoque.entrada || 0);
      const saida = Number(itemEstoque.saida || 0);
      const saldoDisponivel = entrada - saida;

      const qtdVenda = parseQtyLoose(quantidadeVendida);

      if (!qtdVenda || qtdVenda <= 0) {
        Alert.alert("Quantidade inválida", "Informe uma quantidade válida.");
        return;
      }

      if (saldoDisponivel <= 0) {
        Alert.alert(
          "Estoque zerado",
          "Não há saldo disponível deste produto no estoque.",
        );
        return;
      }

      if (qtdVenda > saldoDisponivel) {
        Alert.alert(
          "Estoque insuficiente",
          `Saldo disponível: ${saldoDisponivel}`,
        );
        return;
      }
    } catch {
      Alert.alert(
        "Erro no estoque",
        "Não foi possível verificar o saldo do estoque.",
      );
      return;
    }

    const jsonOld = await AsyncStorage.getItem("clientesPrazo");
    const objOld = jsonOld ? JSON.parse(jsonOld) : {};
    const colabDefault =
      colabSelecionado ?? objOld[nome]?.colaboradorIdDefault ?? null;

    const qtdVendaTotal = parseQtyLoose(quantidadeVendida);
    const valorParcela = valorTotalNum / qtdParcelasNum;

    const vendaPrazoId = makeVendaPrazoId(
      nome,
      dataAtual,
      valorTotalNum,
      codigoProduto,
    );

    const novaLista = [];
    for (let i = 0; i < qtdParcelasNum; i++) {
      const vencimento = new Date(ano, mes - 1 + i, dia);
      novaLista.push({
        id: Date.now().toString() + i,
        numero: i + 1,
        valor: valorParcela,
        vencimento: vencimento.toLocaleDateString("pt-BR"),
        pago: false,
        pagoEm: null,
        vendaId: null,
        dataVenda: dataAtual,
        cliente: nome,
        codigo: codigoProduto,
        qtd: i === 0 ? qtdVendaTotal : 0,
        colaboradorId: colabDefault,
        vendaPrazoId,
      });
    }

    const json = await AsyncStorage.getItem("clientesPrazo");
    const obj = json ? JSON.parse(json) : {};
    const clienteExistente = obj[nome] || {};
    const fichaExist = clienteExistente.ficha || {};

    const fichaAutoBase = {
      ...fichaExist,
      endereco: (endereco || "").trim(),
      codigoProduto: (codigoProduto || "").trim(),
      quantidadeVendida: qtdVendaTotal,
      valorTotal: valorTotalNum,
      dataVenda: dataAtual,
      colaboradorIdDefault: colabDefault,
      vendaPrazoId,
    };

    obj[nome] = {
      ...clienteExistente,
      parcelas: novaLista,
      colaboradorIdDefault: colabDefault,
      ficha: fichaAutoBase,
    };

    await AsyncStorage.setItem("clientesPrazo", JSON.stringify(obj));
    setParcelas(novaLista);
    setFichaCliente(fichaAutoBase);

    // baixa estoque e salva dados na ficha
    let custoUnit = 0;
    let custoTotal = 0;
    let baixaAt = null;

    try {
      const cod = String(codigoProduto || "").trim();
      const qtd = Number(qtdVendaTotal || 0);

      if (cod && qtd > 0) {
        const rawNow = await AsyncStorage.getItem("clientesPrazo");
        const objNow = rawNow ? JSON.parse(rawNow) : {};
        const fichaNow = objNow?.[nome]?.ficha || {};

        const jaBaixou = fichaNow?.estoquePrazoBaixado === true;

        custoUnit = Number(fichaNow?.estoquePrazoCustoUnit || 0);
        custoTotal = Number(fichaNow?.estoquePrazoCustoTotal || 0);
        baixaAt = fichaNow?.estoquePrazoBaixadoAt || null;

        if (!jaBaixou) {
          const ret = await baixarEstoquePorCusto(cod, qtd);
          if (ret) {
            custoUnit = Number(ret.custoUnit || 0);
            custoTotal = Number(ret.custoTotal || 0);
            baixaAt = new Date().toISOString();

            objNow[nome] = {
              ...(objNow[nome] || {}),
              ficha: {
                ...(fichaNow || {}),
                estoquePrazoBaixado: true,
                estoquePrazoCodigo: cod,
                estoquePrazoQtd: qtd,
                estoquePrazoCustoUnit: custoUnit,
                estoquePrazoCustoTotal: custoTotal,
                estoquePrazoBaixadoAt: baixaAt,
              },
            };
            await AsyncStorage.setItem("clientesPrazo", JSON.stringify(objNow));
            setFichaCliente(objNow[nome]?.ficha || fichaAutoBase);
          }
        }

        const reg = await registrarVendaNoMEI({
          nomeCliente: nome,
          valorTotalNum,
          dataVendaPtBr: dataAtual,
          colaboradorId: colabDefault,
          vendaPrazoId,
          estoqueCodigo: cod,
          estoqueQtd: qtd,
          estoqueCustoUnit: custoUnit,
          estoqueCustoTotal: custoTotal,
          estoqueBaixadoAt: baixaAt,
        });

        // 🔥 NOVO BLOCO (sem quebrar try/catch)
        if (colabDefault) {
          const whenISO = toISOFromPtBr(dataAtual);
          const whenDate = new Date(whenISO);
          const valorCents = Math.round(Number(valorTotalNum || 0) * 100);

          const rawClienteSync = await AsyncStorage.getItem("clientesPrazo");
          const objClienteSync = rawClienteSync
            ? JSON.parse(rawClienteSync)
            : {};
          const fichaSync = objClienteSync?.[nome]?.ficha || {};

          const jaSincronizouCloud =
            String(fichaSync?.vendaPrazoCloudId || "") ===
              String(vendaPrazoId) && fichaSync?.vendaPrazoCloudSync === true;

          if (!jaSincronizouCloud) {
            let cloudOk = false;

            try {
              await addSaleToCollaborator(
                String(colabDefault),
                valorCents,
                whenDate,
              );
              cloudOk = true;
            } catch (e) {
              console.log("addSaleToCollaborator erro:", e);
            }

            try {
              await registerCloudSale({
                id: reg?.vendaLocalId || vendaPrazoId,
                colaboradorId: String(colabDefault),
                codigo: cod,
                descricao: `Venda a prazo - ${nome || "Cliente"}`,
                qtd: Number(qtdVendaTotal || 0),
                valor: Number(valorTotalNum || 0),
                dataISO: whenISO,
                origem: "prazo",
                vendaPrazoId,
              });
            } catch (e) {
              console.log("registerCloudSale erro:", e);
            }

            if (cloudOk) {
              await marcarVendaPrazoCloudSync(nome, {
                vendaPrazoCloudSync: true,
                vendaPrazoCloudId: vendaPrazoId,
                colaboradorIdDefault: colabDefault,
                vendaPrazoCloudUpdatedAt: new Date().toISOString(),
              });
            }
          }
        }
      }
    } catch (e) {
      console.log("Baixa estoque (Parcelas) erro:", e?.message || e);
    }

    await syncAdicionarSafe("vendasPrazo", {
      tipo: "parcelas",
      cliente: nome,
      valorTotal: valorTotalNum,
      qtdParcelas: qtdParcelasNum,
      vencimentoInicial,
      parcelas: novaLista,
      dataVenda: dataAtual,
      codigoProduto,
      colaboradorIdDefault: colabDefault,
      vendaPrazoId,
    });

    Alert.alert("Sucesso", "Parcelas salvas com sucesso.");
  };

  const compartilharPDF = async () => {
    try {
      const nome = (nomeCliente || "").trim();
      if (!nome) {
        Alert.alert("Atenção", "Informe o nome do cliente.");
        return;
      }

      const json = await AsyncStorage.getItem("clientesPrazo");
      const obj = json ? JSON.parse(json) : {};
      const clienteData = obj?.[nome];

      if (!clienteData) {
        Alert.alert("Erro", "Cliente não encontrado.");
        return;
      }

      const ficha = clienteData.ficha || {};
      const parcelasList = Array.isArray(clienteData.parcelas)
        ? clienteData.parcelas
        : [];

      const colabId =
        clienteData.colaboradorIdDefault || ficha.colaboradorIdDefault || null;
      const colabNome =
        (colabId &&
          (colaboradores?.find?.((c) => String(c.id) === String(colabId))
            ?.nome ||
            null)) ||
        "-";

      const fmt = (v) =>
        Number(v || 0).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });

      const esc = (s) =>
        String(s ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");

      const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: Arial; padding: 18px; color: #111; }
            h2 { text-align:center; margin: 0 0 6px 0; }
            .sub { text-align:center; color:#555; margin: 0 0 14px 0; }
            .box { border: 1px solid #ddd; border-radius: 10px; padding: 12px; margin-bottom: 12px; }
            .row { display:flex; justify-content: space-between; margin: 6px 0; }
            .lbl { color:#444; }
            .val { font-weight: 700; }
            ul { padding-left: 18px; }
            li { margin: 6px 0; }
            .pago { color: #198754; font-weight: 700; }
            .aberto { color: #dc3545; font-weight: 700; }
          </style>
        </head>
        <body>
          <h2>Ficha do Cliente</h2>
          <p class="sub">${esc(nome)}</p>

          <div class="box">
            <div class="row"><span class="lbl">Colaborador responsável</span><span class="val">${esc(
              colabNome,
            )}</span></div>
            <div class="row"><span class="lbl">Endereço</span><span class="val">${esc(
              ficha.endereco || "-",
            )}</span></div>
            <div class="row"><span class="lbl">Código</span><span class="val">${esc(
              ficha.codigoProduto || "-",
            )}</span></div>
            <div class="row"><span class="lbl">Quantidade</span><span class="val">${esc(
              ficha.quantidadeVendida || 0,
            )}</span></div>
            <div class="row"><span class="lbl">Valor Total</span><span class="val">${fmt(
              ficha.valorTotal || 0,
            )}</span></div>
            <div class="row"><span class="lbl">Data da Venda</span><span class="val">${esc(
              ficha.dataVenda || "-",
            )}</span></div>
          </div>

          <div class="box">
            <h3 style="margin: 0 0 8px 0;">Parcelas</h3>
            <ul>
              ${
                parcelasList.length
                  ? parcelasList
                      .map((p) => {
                        return `
                          <li>
                            <b>${Number(p.numero || 0)}ª</b> - ${fmt(
                              p.valor || 0,
                            )} - Venc: ${esc(p.vencimento || "-")}
                            - <span class="${p.pago ? "pago" : "aberto"}">${
                              p.pago ? "Paga" : "Em aberto"
                            }</span>
                            ${
                              p.pago && p.pagoEm
                                ? ` (em ${esc(
                                    new Date(p.pagoEm).toLocaleDateString(
                                      "pt-BR",
                                    ),
                                  )})`
                                : ""
                            }
                          </li>
                        `;
                      })
                      .join("")
                  : "<li>Sem parcelas cadastradas.</li>"
              }
            </ul>
          </div>
        </body>
      </html>
    `;

      const { uri } = await Print.printToFileAsync({ html });
      if (!uri) {
        Alert.alert("Erro", "Não foi possível gerar o PDF.");
        return;
      }

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(
          "Compartilhamento indisponível",
          "Seu dispositivo/ambiente não permite compartilhar arquivos agora.",
        );
        return;
      }

      await Sharing.shareAsync(uri);
    } catch (error) {
      console.log("compartilharPDF erro:", error?.message || error);
      Alert.alert("Erro", "Falha ao gerar ou compartilhar o PDF.");
    }
  };

  // ✅ Agora excluir aqui só redireciona
  const confirmarExclusao = () => {
    Alert.alert(
      "Excluir cliente",
      "Para manter a consistência dos dados, a exclusão de clientes deve ser feita pela tela:\n\nRelação de Clientes.",
      [
        { text: "Entendi", style: "default" },
        {
          text: "Ir para Relação de Clientes",
          onPress: () => navigation.navigate("RelacaoClientes"),
        },
      ],
    );
  };

  const parcelasFiltradas = filtroVencimento
    ? parcelas.filter((p) => p.vencimento === filtroVencimento)
    : parcelas;

  const renderParcela = ({ item }) => (
    <View style={styles.parcela}>
      <Text style={{ fontWeight: "800" }}>
        {item.numero}ª -{" "}
        {Number(item.valor || 0).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        })}
      </Text>
      <Text>Vencimento: {item.vencimento}</Text>
      <Text>Status: {item.pago ? "Paga" : "Em aberto"}</Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          style={{ flex: 1, backgroundColor: "#fff" }}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.titulo}>Cliente a Prazo</Text>

          <Text style={styles.label}>Cliente (nome)</Text>
          <TextInput
            style={styles.input}
            value={nomeCliente}
            onChangeText={setNomeCliente}
            placeholder="Digite ou selecione o cliente"
            placeholderTextColor={PLACEHOLDER}
          />

          <Text style={styles.label}>Endereço</Text>
          <TextInput
            style={styles.input}
            value={endereco}
            onChangeText={setEndereco}
            placeholder="Endereço"
            placeholderTextColor={PLACEHOLDER}
          />

          <Text style={styles.label}>Código do produto</Text>
          <TextInput
            style={styles.input}
            value={codigoProduto}
            onChangeText={setCodigoProduto}
            placeholder="Código"
            placeholderTextColor={PLACEHOLDER}
          />

          <Text style={styles.label}>Quantidade vendida</Text>
          <TextInput
            style={styles.input}
            value={quantidadeVendida}
            onChangeText={setQuantidadeVendida}
            placeholder="Quantidade"
            placeholderTextColor={PLACEHOLDER}
            keyboardType="numeric"
          />

          <Text style={styles.label}>Valor total</Text>
          <TextInput
            style={styles.input}
            value={valorTotal}
            onChangeText={(t) => setValorTotal(maskBRL(t))}
            placeholder="Valor Total"
            placeholderTextColor={PLACEHOLDER}
            keyboardType="numeric"
          />

          <View style={{ height: 6 }} />

          <Text style={styles.label}>Quantidade de parcelas</Text>
          <TextInput
            style={styles.input}
            value={qtdParcelas}
            onChangeText={setQtdParcelas}
            placeholder="Ex: 3"
            placeholderTextColor={PLACEHOLDER}
            keyboardType="numeric"
          />

          <Text style={styles.label}>Vencimento inicial</Text>
          <TextInput
            style={styles.input}
            value={vencimentoInicial}
            onChangeText={(t) => setVencimentoInicial(formatarData(t))}
            placeholder="dd/mm/aaaa"
            placeholderTextColor={PLACEHOLDER}
            keyboardType="numeric"
          />

          <Text style={styles.label}>Colaborador responsável</Text>

          <TouchableOpacity
            style={styles.select}
            onPress={() => setModalColab(true)}
          >
            <Text style={styles.selectTxt}>
              {colabSelecionado
                ? colaboradores.find(
                    (c) => String(c.id) === String(colabSelecionado),
                  )?.nome || "Selecionar..."
                : "Selecionar..."}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, { marginTop: 6 }]}
            onPress={salvarParcelas}
          >
            <Text style={styles.btnText}>Salvar Parcelas</Text>
          </TouchableOpacity>

          {!!fichaCliente && (
            <View style={styles.fichaBox}>
              <Text style={styles.fichaTitulo}>Ficha</Text>
              <Text>Data: {fichaCliente?.dataVenda || "-"}</Text>
              <Text>Código: {fichaCliente?.codigoProduto || "-"}</Text>
              <Text>Qtd: {String(fichaCliente?.quantidadeVendida || 0)}</Text>
              <Text>Valor: {fmtBRLNumber(fichaCliente?.valorTotal || 0)}</Text>
            </View>
          )}

          <Text style={styles.filtroTitulo}>Filtrar por vencimento</Text>
          <TextInput
            style={styles.input}
            value={filtroVencimento}
            onChangeText={(t) => setFiltroVencimento(formatarData(t))}
            placeholder="dd/mm/aaaa"
            placeholderTextColor={PLACEHOLDER}
            keyboardType="numeric"
          />

          {parcelasFiltradas?.length ? (
            <FlatList
              data={parcelasFiltradas}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderParcela}
              scrollEnabled={false}
            />
          ) : (
            <Text style={styles.vazio}>Nenhuma parcela cadastrada.</Text>
          )}

          <View style={{ height: 12 }} />

          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            onPress={compartilharPDF}
          >
            <Text style={styles.btnText}>Compartilhar em PDF</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.btnDanger, { marginTop: 10 }]}
            onPress={confirmarExclusao}
          >
            <Text style={styles.btnText}>Excluir Cliente</Text>
          </TouchableOpacity>

          <Modal visible={modalColab} transparent animationType="fade">
            <View style={styles.colabOverlay}>
              <View style={styles.colabList}>
                <Text style={styles.colabTitle}>Selecione o colaborador</Text>

                {colaboradores?.length ? (
                  colaboradores.map((c) => (
                    <TouchableOpacity
                      key={String(c.id)}
                      style={styles.itemColab}
                      onPress={() => escolherColaborador(String(c.id))}
                    >
                      <Text style={styles.itemColabTxt}>{c.nome}</Text>
                      {!!c.funcao && (
                        <Text style={styles.itemColabSub}>{c.funcao}</Text>
                      )}
                    </TouchableOpacity>
                  ))
                ) : (
                  <Text style={{ color: "#555" }}>
                    Nenhum colaborador ativo encontrado.
                  </Text>
                )}

                <TouchableOpacity
                  style={styles.btnFechar}
                  onPress={() => setModalColab(false)}
                >
                  <Text style={{ fontWeight: "800" }}>Fechar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <View style={{ height: 40 }} />
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 16,
    backgroundColor: "#fff",
    paddingBottom: 100,
  },
  titulo: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  label: {
    marginTop: 10,
    fontWeight: "600",
    color: "#222",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    backgroundColor: "#fff",
    color: "#111",
  },
  fichaBox: {
    backgroundColor: "#f0f0f0",
    padding: 12,
    borderRadius: 8,
    marginTop: 14,
    marginBottom: 6,
  },
  fichaTitulo: {
    fontWeight: "bold",
    marginBottom: 6,
  },
  filtroTitulo: {
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 20,
    marginBottom: 4,
  },
  select: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#fff",
    marginBottom: 8,
  },
  selectTxt: { color: "#111", fontWeight: "700" },

  colabOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 20,
  },
  colabList: {
    backgroundColor: "#fff",
    borderRadius: 12,
    maxHeight: "70%",
    padding: 12,
  },
  colabTitle: { fontWeight: "900", fontSize: 16, marginBottom: 8 },
  itemColab: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  itemColabTxt: { fontWeight: "800", fontSize: 15, color: "#111" },
  itemColabSub: { color: "#555" },
  btnFechar: {
    marginTop: 8,
    alignSelf: "flex-end",
    padding: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
  },

  parcela: {
    padding: 10,
    backgroundColor: "#f9f9f9",
    borderRadius: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#eee",
  },
  vazio: {
    marginTop: 20,
    textAlign: "center",
    color: "#777",
  },
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
  btnDanger: {
    backgroundColor: "#FF4444",
  },
});
