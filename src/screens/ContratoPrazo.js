// src/screens/ContratoPrazo.js

// =========================
// 1️⃣ IMPORTS
// =========================
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import {
  baixaMaterialParaOrcamento,
  confirmarBaixaMaterial,
  estornarBaixaMaterial,
} from "./EstoqueMateriais"; // ajuste o caminho conforme sua pasta
import { FORM_CARD } from "../styles/formCard";

// =========================
// 2️⃣ KEYS
// =========================
const KEY_LAST_ORC = "@ultimo_orcamento_salvo";
const KEY_ORCAMENTOS_SALVOS = "@orcamentos_salvos";
const KEY_ULTIMO_ORC_ID = "@ultimo_orcamento_id";
const KEY_RELACIONAR_MATERIAIS_ITENS = "@relacionar_materiais_itens";
const KEY_MATS_SERVICO = "@materiais_servico_por_orcamento";
const KEY_BAIXA_CONTRATO_MOVIDS_PREFIX = "@baixa_contrato_movids_";
// fica: @baixa_contrato_movids_<orcamentoId>

// =========================
// 3️⃣ HELPERS (SEM HOOKS)
// =========================
const safeJSON = (raw, fallback) => {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const fmtBRL = (v) =>
  Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const todayPt = () => new Date().toLocaleDateString("pt-BR");

// padrão DRD: barras automáticas dd/mm/aaaa
const maskDate = (v) => {
  return String(v || "")
    .replace(/\D/g, "")
    .replace(/^(\d{2})(\d)/, "$1/$2")
    .replace(/^(\d{2})\/(\d{2})(\d)/, "$1/$2/$3")
    .slice(0, 10);
};

function somenteMateriais(itens) {
  return (Array.isArray(itens) ? itens : []).filter(
    (x) => x?.tipo === "material",
  );
}

async function carregarMateriaisServicoPorOrcamento(orcamentoId) {
  try {
    const raw = await AsyncStorage.getItem(KEY_MATS_SERVICO);
    const all = raw ? JSON.parse(raw) : {};
    const pack = all[String(orcamentoId)];
    return Array.isArray(pack?.itens) ? pack.itens : [];
  } catch {
    return [];
  }
}

async function limparMateriaisServicoPorOrcamento(orcamentoId) {
  try {
    const raw = await AsyncStorage.getItem(KEY_MATS_SERVICO);
    const all = raw ? JSON.parse(raw) : {};
    delete all[String(orcamentoId)];
    await AsyncStorage.setItem(KEY_MATS_SERVICO, JSON.stringify(all));
  } catch (e) {
    console.log("Erro ao limpar materiais do orçamento:", e?.message || e);
  }
}

async function baixarMateriaisContrato({ materiais, orcamentoId }) {
  const mats = Array.isArray(materiais) ? materiais : [];
  const movIds = [];

  for (const it of mats) {
    const codigo = String(it?.codigo || "").trim();
    const qtd = Number(it?.qtd || 0);

    if (!codigo || !(qtd > 0)) continue;

    // 🔐 idempotente por orçamento + material
    const movId = `contrato-${orcamentoId}-mat-${codigo}`;

    const r = await baixaMaterialParaOrcamento({
      codigo,
      qtd,
      movId,
    });

    if (!r?.ok) {
      throw r; // cai no catch
    }

    movIds.push(movId);
  }

  return movIds;
}

// resolve ID do orçamento que o contrato deve abrir
async function resolveOrcamentoId({ route }) {
  const fromParams = route?.params?.orcamentoId
    ? String(route.params.orcamentoId).trim()
    : "";

  if (fromParams) return fromParams;

  const rawLast = await AsyncStorage.getItem(KEY_LAST_ORC);
  const last = safeJSON(rawLast, null);
  const lastId = String(last?.id || "").trim();
  if (lastId) return lastId;

  const ultimoId = String(
    (await AsyncStorage.getItem(KEY_ULTIMO_ORC_ID)) || "",
  ).trim();
  if (ultimoId) return ultimoId;

  return "";
}

// =========================
// 5️⃣ COMPONENTE
// =========================
export default function ContratoPrazo({ navigation, route }) {
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // orçamento carregado
  const [orcamento, setOrcamento] = useState(null);

  // dados do orçamento
  const [orcamentoId, setOrcamentoId] = useState("");
  const [orcamentoNumero, setOrcamentoNumero] = useState(null);

  const [cliente, setCliente] = useState("");
  const [endereco, setEndereco] = useState("");
  const [telefone, setTelefone] = useState("");
  const [pagamento, setPagamento] = useState("");
  const [previsao, setPrevisao] = useState("");
  const [itens, setItens] = useState([]);

  // campos do contrato
  const [dataContrato, setDataContrato] = useState(todayPt());
  const [garantiaDias, setGarantiaDias] = useState("90");
  const [observacoes, setObservacoes] = useState("");

  // campos de prazo
  const [qtdParcelas, setQtdParcelas] = useState(""); // string
  const [vencimentoInicial, setVencimentoInicial] = useState(""); // string

  // ✅ exibido em R$ e NÃO editável (preenchido automaticamente)
  const [valorParcela, setValorParcela] = useState("");

  const total = useMemo(() => {
    return (Array.isArray(itens) ? itens : []).reduce(
      (s, it) => s + Number(it?.valor || 0),
      0,
    );
  }, [itens]);

  // ✅ parcelas numéricas (mín 1)
  const parcelasNum = useMemo(() => {
    const n = Number(String(qtdParcelas || "").replace(/\D/g, "")) || 1;
    return Math.max(1, n);
  }, [qtdParcelas]);

  // ✅ valor automático por parcela (número)
  const valorParcelaNum = useMemo(() => {
    const t = Number(total || 0);
    return parcelasNum > 0 ? t / parcelasNum : t;
  }, [total, parcelasNum]);

  // ✅ sempre recalcula quando total ou qtdParcelas mudar
  useEffect(() => {
    setValorParcela(fmtBRL(valorParcelaNum));
  }, [valorParcelaNum]);

  const linhasHTML = useMemo(() => {
    const list = Array.isArray(itens) ? itens : [];
    if (!list.length)
      return `<div style="color:#666">Sem itens no orçamento.</div>`;

    const rows = list
      .map((it) => {
        const nome = String(it?.nome || "-");
        const valor = fmtBRL(it?.valor || 0);
        const tag = it?.tipo === "material" ? "Material" : "Serviço";
        return `
          <tr>
            <td>${nome}</td>
            <td>${tag}</td>
            <td style="text-align:right;">${valor}</td>
          </tr>
        `;
      })
      .join("");

    return `
      <table>
        <thead>
          <tr>
            <th>Descrição</th>
            <th>Tipo</th>
            <th style="text-align:right;">Valor</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }, [itens]);

  // =========================
  // CARREGAR ORÇAMENTO + CONTRATO (robusto)
  // =========================
  const carregarContrato = async () => {
    try {
      const id = await resolveOrcamentoId({ route });

      if (!id) {
        setOrcamento(null);
        setObservacoes("");
        return;
      }

      const raw = await AsyncStorage.getItem(KEY_ORCAMENTOS_SALVOS);
      const lista = safeJSON(raw, []);
      const arr = Array.isArray(lista) ? lista : [];

      const found = arr.find((x) => String(x?.id) === String(id)) || null;

      if (!found) {
        setOrcamento(null);
        setObservacoes("");
        return;
      }

      // ✅ SEM travar por tipoPagamento: carrega orçamento sempre
      setOrcamento(found);

      // ✅ aplica dados básicos do orçamento imediatamente
      setOrcamentoId(String(found?.id || ""));
      setOrcamentoNumero(found?.numero != null ? Number(found.numero) : null);

      setCliente(String(found?.cliente || ""));
      setEndereco(String(found?.endereco || ""));
      setTelefone(String(found?.telefone || ""));
      setPagamento(String(found?.pagamento || ""));
      setPrevisao(String(found?.previsao || ""));
      setItens(Array.isArray(found?.itens) ? found.itens : []);

      // ✅ puxa contratoPrazo se existir, senão deixa para preencher
      const cp = found?.contratoPrazo || {};

      setObservacoes(String(cp?.observacoes || ""));

      setDataContrato(cp?.dataContrato ? String(cp.dataContrato) : todayPt());

      setGarantiaDias(
        cp?.garantiaDias != null && String(cp.garantiaDias).trim() !== ""
          ? String(cp.garantiaDias)
          : "90",
      );

      setQtdParcelas(cp?.qtdParcelas != null ? String(cp.qtdParcelas) : "");

      setVencimentoInicial(
        cp?.vencimentoInicial ? String(cp.vencimentoInicial) : "",
      );

      // valorParcela: se tiver salvo, mostra; senão será recalculado pelo useEffect
      if (cp?.valorParcela != null) {
        setValorParcela(fmtBRL(Number(cp.valorParcela || 0)));
      }
    } catch (e) {
      console.log("carregarContrato erro:", e);
      setOrcamento(null);
      setObservacoes("");
    }
  };

  // =========================
  // CARREGA AO ENTRAR (FOCO)
  // =========================
  useFocusEffect(
    useCallback(() => {
      let alive = true;

      (async () => {
        try {
          alive && setLoading(true);
          await carregarContrato();
        } finally {
          alive && setLoading(false);
        }
      })();

      return () => {
        alive = false;
      };
    }, [route?.params?.orcamentoId]),
  );

  // =========================
  // SALVAR CONTRATO PRAZO (NO ORÇAMENTO)
  // =========================
  const salvarContratoPrazo = async () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      const id = String(orcamento?.id || orcamentoId || "").trim();
      if (!id) {
        Alert.alert("Contrato", "Nenhum orçamento carregado para salvar.");
        return;
      }

      const raw = await AsyncStorage.getItem(KEY_ORCAMENTOS_SALVOS);
      const lista = safeJSON(raw, []);
      const arr = Array.isArray(lista) ? lista : [];

      const idx = arr.findIndex((x) => String(x?.id) === id);
      if (idx < 0) {
        Alert.alert("Contrato", "Orçamento não encontrado para atualizar.");
        return;
      }

      const antigo = arr[idx] || {};
      const agoraISO = new Date().toISOString();

      const atualizado = {
        ...antigo,

        // ✅ marca como prazo ao salvar o contrato
        tipoPagamento: "prazo",
        pagamento: String(pagamento || antigo.pagamento || "").trim(),
        previsao: String(previsao || antigo.previsao || "").trim(),

        contratoPrazo: {
          ...(antigo?.contratoPrazo || {}),

          dataContrato: String(dataContrato || "").trim(),
          garantiaDias: String(garantiaDias || "").trim(),
          observacoes: String(observacoes || "").trim(),

          // ✅ grava sempre coerente
          qtdParcelas: Number(parcelasNum || 1),
          vencimentoInicial: String(vencimentoInicial || "").trim(),

          // ✅ grava como número
          valorParcela: Number(valorParcelaNum || 0),

          updatedAt: agoraISO,
        },

        updatedAt: agoraISO,
      };

      const novaLista = [...arr];
      novaLista[idx] = atualizado;

      await AsyncStorage.setItem(
        KEY_ORCAMENTOS_SALVOS,
        JSON.stringify(novaLista),
      );

      // ✅ mantém referência do último orçamento aberto
      await AsyncStorage.setItem(
        KEY_LAST_ORC,
        JSON.stringify({
          id,
          numero: Number(atualizado?.numero || 0),
          tipoPagamento: "prazo",
        }),
      );
      await AsyncStorage.setItem(KEY_ULTIMO_ORC_ID, String(id));

      setOrcamento(atualizado);
      Alert.alert("Contrato", "Dados salvos ✅");
    } catch (e) {
      console.log("salvarContratoPrazo erro:", e);
      Alert.alert("Erro", "Não foi possível salvar.");
    } finally {
      setIsSaving(false);
    }
  };

  const limparTelaContrato = async () => {
    // ⚠️ NÃO apaga orçamentos salvos. Só limpa visual + desarma o "último aberto"

    // visual
    setOrcamento(null);
    setOrcamentoId("");
    setOrcamentoNumero(null);

    setCliente("");
    setEndereco("");
    setTelefone("");
    setPagamento("");
    setPrevisao("");
    setItens([]);

    setDataContrato(todayPt());
    setGarantiaDias("90");
    setObservacoes("");

    setQtdParcelas("");
    setVencimentoInicial("");
    setValorParcela("");

    // ✅ impede que ao voltar para a tela ele "reabra" o último orçamento automaticamente
    try {
      await AsyncStorage.multiRemove([KEY_LAST_ORC, KEY_ULTIMO_ORC_ID]);
    } catch {}

    Alert.alert("Contrato", "Tela limpa ✅");
  };

  const abrirMenuContrato = async () => {
    const id = String(orcamentoId || orcamento?.id || "").trim();
    const FLAG = `@baixa_contrato_ok_${id}`;
    const jaBaixou = id ? (await AsyncStorage.getItem(FLAG)) === "1" : false;

    Alert.alert(
      "Opções do contrato",
      jaBaixou
        ? "Atenção: este contrato já baixou materiais do estoque."
        : "Escolha uma opção:",
      [
        { text: "Sair", style: "cancel" },

        {
          text: "Limpar tela",
          onPress: () => limparTelaContrato(),
        },

        {
          text: jaBaixou ? "Cancelar (estornar estoque)" : "Cancelar contrato",
          style: "destructive",
          onPress: async () => {
            // ✅ confirmação final (pra não gerar confusão)
            Alert.alert(
              "Confirmar cancelamento",
              jaBaixou
                ? "Isso vai ESTORNAR o estoque e desarmar este contrato. Deseja continuar?"
                : "Tem certeza que deseja cancelar este contrato? (Não haverá estorno pois não houve baixa.)",
              [
                { text: "Não", style: "cancel" },
                {
                  text: "Sim, cancelar",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      const orcId = String(
                        orcamentoId || orcamento?.id || "",
                      ).trim();
                      if (!orcId) {
                        Alert.alert("Cancelar", "Orçamento não identificado.");
                        return;
                      }

                      const flagKey = `@baixa_contrato_ok_${orcId}`;
                      const baixou =
                        (await AsyncStorage.getItem(flagKey)) === "1";

                      // ✅ se não baixou: só desarma e limpa tela
                      if (!baixou) {
                        await AsyncStorage.multiRemove([
                          KEY_LAST_ORC,
                          KEY_ULTIMO_ORC_ID,
                        ]).catch(() => {});

                        Alert.alert(
                          "Contrato cancelado ✅",
                          "Nenhuma baixa havia sido feita.",
                        );
                        return;
                      }

                      // ✅ se baixou: estorna
                      const rawMov = await AsyncStorage.getItem(
                        `${KEY_BAIXA_CONTRATO_MOVIDS_PREFIX}${orcId}`,
                      );
                      let movArr = rawMov ? safeJSON(rawMov, []) : [];
                      movArr = Array.isArray(movArr) ? movArr : [];

                      let estornos = 0;

                      // 🧯 fallback (caso você tenha contratos antigos que ainda não salvaram movIds)
                      if (!movArr.length) {
                        const materiaisBaixaParam = Array.isArray(
                          route?.params?.materiaisBaixa,
                        )
                          ? route.params.materiaisBaixa
                          : [];

                        const materiaisServico =
                          await carregarMateriaisServicoPorOrcamento(orcId);

                        const materiais = materiaisBaixaParam.length
                          ? materiaisBaixaParam
                          : materiaisServico.length
                            ? materiaisServico
                            : somenteMateriais(itens);

                        const mats = Array.isArray(materiais) ? materiais : [];
                        movArr = mats
                          .map((it) => String(it?.codigo || "").trim())
                          .filter(Boolean)
                          .map((codigo) => `contrato-${orcId}-mat-${codigo}`);
                      }

                      // ✅ estorna pelos movIds
                      for (const movId of movArr) {
                        try {
                          const r = await estornarBaixaMaterial({
                            movId,
                            force: true,
                          });

                          // ✅ só conta se a função explicitamente disser que estornou
                          // (aceita true ou { ok: true })
                          const ok =
                            r === true ||
                            (r && typeof r === "object" && r.ok === true);

                          if (ok) {
                            estornos++;
                          } else {
                            console.log(
                              "[Cancelar] estorno NÃO confirmado para",
                              movId,
                              r,
                            );
                          }
                        } catch (e) {
                          console.log(
                            "[Cancelar] falha estorno",
                            movId,
                            e?.message || e,
                          );
                        }
                      }

                      // ✅ libera baixar de novo + limpa rastros
                      await AsyncStorage.removeItem(
                        `@baixa_contrato_ok_${orcId}`,
                      ).catch(() => {});
                      await AsyncStorage.removeItem(
                        `${KEY_BAIXA_CONTRATO_MOVIDS_PREFIX}${orcId}`,
                      ).catch(() => {});

                      await limparMateriaisServicoPorOrcamento(orcId).catch(
                        () => {},
                      );
                      await AsyncStorage.removeItem(
                        KEY_RELACIONAR_MATERIAIS_ITENS,
                      ).catch(() => {});

                      // desarma último
                      await AsyncStorage.multiRemove([
                        KEY_LAST_ORC,
                        KEY_ULTIMO_ORC_ID,
                      ]).catch(() => {});

                      Alert.alert(
                        "Contrato cancelado ✅",
                        estornos
                          ? `Estorno realizado para ${estornos} movimento(s).`
                          : "⚠️ Não consegui confirmar o estorno no estoque. Vou manter o contrato desarmado, mas precisamos revisar o estornarBaixaMaterial/movId.",
                      );
                      return;
                    } catch (e) {
                      Alert.alert(
                        "Erro",
                        `Não foi possível cancelar: ${String(e?.message || e)}`,
                      );
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  // =========================
  // IMPRIMIR CONTRATO (PDF)
  // =========================
  const imprimirContrato = async () => {
    Keyboard.dismiss();

    if (!String(cliente || "").trim()) {
      Alert.alert("Contrato", "Cliente está vazio. Abra um orçamento salvo.");
      return;
    }

    const materiaisBaixaParam = Array.isArray(route?.params?.materiaisBaixa)
      ? route.params.materiaisBaixa
      : [];

    const materiaisServico =
      await carregarMateriaisServicoPorOrcamento(orcamentoId);

    const materiais = materiaisBaixaParam.length
      ? materiaisBaixaParam
      : materiaisServico.length
        ? materiaisServico
        : somenteMateriais(itens);
    // ✅ aviso: já houve baixa antes?
    const FLAG = `@baixa_contrato_ok_${String(orcamentoId || "")}`;
    const jaBaixouAntes = (await AsyncStorage.getItem(FLAG)) === "1";

    // (opcional) pegar quantos movimentos foram baixados naquela vez, se existir
    let qtdMovAnterior = 0;
    try {
      const movKey = `${KEY_BAIXA_CONTRATO_MOVIDS_PREFIX}${String(orcamentoId)}`;
      const rawMov = await AsyncStorage.getItem(movKey);
      const arrMov = rawMov ? JSON.parse(rawMov) : [];
      qtdMovAnterior = Array.isArray(arrMov) ? arrMov.length : 0;
    } catch {}
    Alert.alert(
      "Confirmar contrato",
      materiais.length
        ? jaBaixouAntes
          ? `⚠️ ATENÇÃO: os materiais deste orçamento já foram baixados do estoque anteriormente${
              qtdMovAnterior ? ` (${qtdMovAnterior} movimento(s)).` : "."
            }\n\nAo imprimir novamente, NÃO será feita nova baixa. Deseja continuar?`
          : "Ao imprimir o contrato, os materiais usados serão baixados do estoque. Deseja continuar?"
        : "Deseja gerar o contrato?",
      [
        { text: "Não", style: "cancel" },
        {
          text: "Sim",
          style: "destructive",
          onPress: async () => {
            let movIds = [];

            try {
              const numeroTexto =
                typeof orcamentoNumero === "number"
                  ? String(orcamentoNumero).padStart(3, "0")
                  : orcamentoId || "-";

              const resumoParcelas = `${parcelasNum}x de ${fmtBRL(valorParcelaNum)}${
                String(vencimentoInicial || "").trim()
                  ? ` • 1º venc.: ${vencimentoInicial}`
                  : ""
              }`;

              // ⬇️ TODO O SEU CÓDIGO CONTINUA IGUAL DAQUI PRA BAIXO

              const html = `
                <html>
                  <head>
                    <meta charset="utf-8" />
                    <style>
                      body { font-family: Arial; padding: 24px; color: #111; }
                      h2 { text-align:center; margin: 0 0 6px 0; }
                      .sub { text-align:center; color:#666; margin-bottom: 16px; }
                      .box { border: 1px solid #ddd; border-radius: 12px; padding: 12px; margin-bottom: 12px; }
                      .row { display:flex; justify-content: space-between; gap: 10px; margin: 6px 0; }
                      .label { color:#555; font-size: 12px; }
                      .value { font-weight: 700; }
                      table { width:100%; border-collapse: collapse; margin-top: 8px; }
                      th, td { border: 1px solid #ccc; padding: 8px; font-size: 12px; }
                      th { background: #f0f0f0; }
                      .total { text-align:right; font-size: 16px; font-weight: 800; margin-top: 12px; }
                      .p { font-size: 12px; line-height: 16px; color:#111; }
                      .sign { margin-top: 18px; display:flex; gap: 16px; justify-content: space-between; }
                      .line { border-top: 1px solid #111; padding-top: 6px; width: 48%; font-size: 12px; color:#111; text-align:center; }
                    </style>
                  </head>
                  <body>
                    <h2>Contrato de Prestação de Serviços (A Prazo)</h2>
                    <div class="sub">Contrato/Orçamento Nº ${numeroTexto}</div>

                    <div class="box">
                      <div class="row">
                        <div>
                          <div class="label">Cliente</div>
                          <div class="value">${cliente || "-"}</div>
                        </div>
                        <div>
                          <div class="label">Telefone</div>
                          <div class="value">${telefone || "-"}</div>
                        </div>
                      </div>

                      <div class="row">
                        <div style="flex:1;">
                          <div class="label">Endereço</div>
                          <div class="value">${endereco || "-"}</div>
                        </div>
                      </div>

                      <div class="row">
                        <div>
                          <div class="label">Data do contrato</div>
                          <div class="value">${dataContrato || "-"}</div>
                        </div>
                        <div>
                          <div class="label">Previsão de entrega</div>
                          <div class="value">${previsao || "-"}</div>
                        </div>
                      </div>

                      <div class="row">
                        <div style="flex:1;">
                          <div class="label">Forma de pagamento</div>
                          <div class="value">${pagamento || "A prazo"}</div>
                        </div>
                        <div>
                          <div class="label">Garantia</div>
                          <div class="value">${String(garantiaDias || "0")} dia(s)</div>
                        </div>
                      </div>

                      <div class="row">
                        <div style="flex:1;">
                          <div class="label">Parcelamento</div>
                          <div class="value">${resumoParcelas}</div>
                        </div>
                      </div>
                    </div>

                    <div class="box">
                      <div class="value" style="margin-bottom:6px;">Objeto do contrato</div>
                      <div class="p">
                        A CONTRATADA compromete-se a executar os serviços e/ou fornecer os materiais descritos abaixo,
                        conforme orçamento aprovado, com pagamento a prazo.
                      </div>

                      ${linhasHTML}

                      <div class="total">Total: ${fmtBRL(total)}</div>
                    </div>

                    <div class="box">
                      <div class="value" style="margin-bottom:6px;">Condições</div>
                      <div class="p">
                        1) O pagamento é a prazo, conforme acordado. <br/>
                        2) Prazo/previsão conforme informado. <br/>
                        3) Garantia de ${String(garantiaDias || "0")} dia(s), desde que respeitadas as condições de uso. <br/>
                        ${
                          String(observacoes || "").trim()
                            ? `4) Observações: ${String(observacoes).replace(/\n/g, "<br/>")}`
                            : ""
                        }
                      </div>
                    </div>

                    <div class="sign">
                      <div class="line">Assinatura do Cliente</div>
                      <div class="line">Assinatura da Contratada</div>
                    </div>
                  </body>
                </html>
              `;

              // ✅ baixa 1x por orçamento
              const jaBaixou = (await AsyncStorage.getItem(FLAG)) === "1";

              if (!jaBaixou && Array.isArray(materiais) && materiais.length) {
                movIds = await baixarMateriaisContrato({
                  materiais,
                  orcamentoId,
                });

                console.log(
                  "[Contrato] baixas geradas:",
                  movIds.length,
                  movIds,
                );

                // ✅ salva a lista exata de movIds usados nessa baixa
                await AsyncStorage.setItem(
                  `${KEY_BAIXA_CONTRATO_MOVIDS_PREFIX}${String(orcamentoId)}`,
                  JSON.stringify(movIds),
                );

                // ✅ marca flag só se baixou OK
                await AsyncStorage.setItem(FLAG, "1");
              }

              // PDF
              const { uri } = await Print.printToFileAsync({ html });

              const canShare = await Sharing.isAvailableAsync();
              if (!canShare) {
                Alert.alert("PDF gerado", uri);
              } else {
                await Sharing.shareAsync(uri);
              }

              // confirma baixa depois do PDF
              for (const id of movIds) {
                await confirmarBaixaMaterial({ movId: id });
              }

              // limpezas
              await limparMateriaisServicoPorOrcamento(orcamentoId);

              await AsyncStorage.removeItem(
                KEY_RELACIONAR_MATERIAIS_ITENS,
              ).catch(() => {});
            } catch (e) {
              // estorna
              for (const id of movIds) {
                try {
                  await estornarBaixaMaterial({ movId: id });
                } catch {}
              }

              // remove FLAG para permitir tentar de novo
              try {
                let movIds = [];

                await AsyncStorage.removeItem(FLAG);
              } catch {}
              try {
                await AsyncStorage.removeItem(
                  `${KEY_BAIXA_CONTRATO_MOVIDS_PREFIX}${String(orcamentoId)}`,
                );
              } catch {}

              const msg =
                e?.motivo === "saldo_insuficiente"
                  ? "Saldo insuficiente no estoque para algum material."
                  : `Erro ao gerar contrato: ${String(e?.message || e)}`;

              Alert.alert("Erro", msg);
            }
          },
        },
      ],
    );
  };

  // =========================
  // UI
  // =========================
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#fff" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Contrato a Prazo</Text>

        <Text style={styles.sub}>
          {loading
            ? "Carregando..."
            : `Orçamento ${
                orcamentoNumero
                  ? `Nº ${String(orcamentoNumero).padStart(3, "0")}`
                  : orcamentoId || "-"
              }`}
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Dados do Cliente</Text>

          <Text style={styles.label}>Cliente</Text>
          <Text style={styles.readonly}>{cliente || "-"}</Text>

          <Text style={styles.label}>Telefone</Text>
          <Text style={styles.readonly}>{telefone || "-"}</Text>

          <Text style={styles.label}>Endereço</Text>
          <Text style={styles.readonly}>{endereco || "-"}</Text>

          <Text style={styles.label}>Pagamento</Text>
          <Text style={styles.readonly}>{pagamento || "A prazo"}</Text>

          <Text style={styles.label}>Previsão</Text>
          <Text style={styles.readonly}>{previsao || "-"}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Condições</Text>

          <Text style={styles.label}>Data do contrato</Text>
          <TextInput
            style={styles.input}
            value={dataContrato}
            onChangeText={(t) => setDataContrato(maskDate(t))}
            placeholder="dd/mm/aaaa"
            placeholderTextColor="#777"
            keyboardType="numeric"
          />

          <Text style={styles.label}>Garantia (dias)</Text>
          <TextInput
            style={styles.input}
            value={String(garantiaDias)}
            onChangeText={(t) =>
              setGarantiaDias(
                String(t || "")
                  .replace(/\D/g, "")
                  .slice(0, 4),
              )
            }
            placeholder="90"
            placeholderTextColor="#777"
            keyboardType="numeric"
          />

          <Text style={styles.label}>Qtd. de parcelas</Text>
          <TextInput
            style={styles.input}
            value={String(qtdParcelas)}
            onChangeText={(t) =>
              setQtdParcelas(
                String(t || "")
                  .replace(/\D/g, "")
                  .slice(0, 4),
              )
            }
            placeholder="Ex: 3"
            placeholderTextColor="#777"
            keyboardType="numeric"
          />

          <Text style={styles.label}>Vencimento inicial</Text>
          <TextInput
            style={styles.input}
            value={String(vencimentoInicial)}
            onChangeText={(t) => setVencimentoInicial(maskDate(t))}
            placeholder="dd/mm/aaaa"
            placeholderTextColor="#777"
            keyboardType="numeric"
          />

          <Text style={styles.label}>Valor da parcela</Text>
          <TextInput
            style={[styles.input, { backgroundColor: "#f3f3f3" }]}
            value={String(valorParcela || "")}
            editable={false}
            selectTextOnFocus={false}
            placeholder="R$ 0,00"
            placeholderTextColor="#777"
          />
          <Text style={styles.hintInline}>
            * Calculado automaticamente: Total ÷ Parcelas
          </Text>

          <Text style={styles.label}>Observações (opcional)</Text>
          <TextInput
            style={[styles.input, { minHeight: 84, textAlignVertical: "top" }]}
            value={observacoes}
            onChangeText={setObservacoes}
            placeholder="Ex: atraso implica multa..."
            placeholderTextColor="#777"
            multiline
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Resumo</Text>
          <Text style={styles.readonly}>
            Itens: {Array.isArray(itens) ? itens.length : 0} • Total:{" "}
            {fmtBRL(total)}
          </Text>
        </View>

        <TouchableOpacity style={styles.btnGhost} onPress={limparTelaContrato}>
          <Text style={styles.btnGhostTxt}>LIMPAR TELA</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.btnDanger} onPress={abrirMenuContrato}>
          <Text style={styles.btnDangerTxt}>OPÇÕES / CANCELAR</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.btn} onPress={imprimirContrato}>
          <Text style={styles.btnTxt}>IMPRIMIR CONTRATO (PDF)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn2, isSaving && { opacity: 0.6 }]}
          onPress={salvarContratoPrazo}
          disabled={isSaving}
        >
          <Text style={styles.btn2Txt}>
            {isSaving ? "SALVANDO..." : "SALVAR DADOS DO CONTRATO"}
          </Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          * Este contrato puxa automaticamente o último orçamento salvo (ou o
          orçamento recebido pela rota).
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// =========================
// STYLES
// =========================
const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
    color: "#111",
  },
  sub: {
    marginTop: 6,
    marginBottom: 12,
    textAlign: "center",
    color: "#666",
    fontSize: 12,
  },

  card: {
    ...FORM_CARD,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  cardTitle: { fontWeight: "900", color: "#111", marginBottom: 8 },

  label: { color: "#111", fontWeight: "800", marginTop: 8, marginBottom: 4 },
  readonly: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 10,
    backgroundColor: "#fafafa",
    color: "#111",
  },

  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 10,
    color: "#111",
    backgroundColor: "#fff",
  },

  btn: {
    marginTop: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#111",
    alignItems: "center",
  },
  btnTxt: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.3,
  },

  btn2: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#111",
    backgroundColor: "#fff",
    alignItems: "center",
  },
  btn2Txt: {
    color: "#111",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.3,
  },

  hint: {
    marginTop: 10,
    textAlign: "center",
    color: "#666",
    fontSize: 12,
    lineHeight: 16,
  },
  hintInline: { marginTop: 6, color: "#666", fontSize: 12 },

  btnGhost: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#111",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  btnGhostTxt: { color: "#111", fontWeight: "900" },

  btnDanger: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#b00020",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  btnDangerTxt: { color: "#b00020", fontWeight: "900" },
});
