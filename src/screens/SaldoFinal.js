// screens/SaldoFinal.js
import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { getRecebimentosPrazoTotalDia } from "../utils/recebimentosPrazo";
/* =========================
   KEYS (ajuste se precisar)
   ========================= */
const KEYS = {
  saldoAnterior: ["saldoAnterior", "saldo_anterior", "saldoAnteriorValor"],
  vendas: ["venda", "vendas", "receitas", "receita"], // sua tela Vendas usa "venda"
  despesas: ["despesas", "despesa"],
  clientesPrazo: ["clientesPrazo"],
  recebimentosPrazo: [
    "recebimentosPrazo",
    "recebimentos_prazo",
    "@recebimentosPrazo",
    "@recebimentos_prazo",
  ],
  cmv: ["cmv", "CMV", "cmvRegistros", "cmv_movs", "cmvLancamentos", "cmvData"],

  // ✅ Capital de Giro (vem do SaldoAnterior.js: CAPITAL_KEY = "capitalGiroResumo")
  capitalGiro: ["capitalGiroResumo"],
};

/* =========================
   HELPERS – Serviços
   ========================= */
const KEY_SERVICOS = "@receitas_servicos";

const isSameDay = (d1, d2) =>
  d1.getDate() === d2.getDate() &&
  d1.getMonth() === d2.getMonth() &&
  d1.getFullYear() === d2.getFullYear();

const parsePtBRDate = (pt) => {
  // pt: "dd/mm/aaaa"
  try {
    const s = String(pt || "").trim();
    const [dd, mm, yyyy] = s.split("/").map((x) => parseInt(x, 10));
    if (!dd || !mm || !yyyy) return null;
    return new Date(yyyy, mm - 1, dd);
  } catch {
    return null;
  }
};

async function getServicosTotalDia(dateRef) {
  try {
    const raw = await AsyncStorage.getItem(KEY_SERVICOS);
    const arr = raw ? JSON.parse(raw) : [];
    const ref = new Date(dateRef);

    return (Array.isArray(arr) ? arr : [])
      .filter((it) => {
        // preferir dataISO (segura)
        if (it?.dataISO) {
          const d = new Date(it.dataISO);
          return isSameDay(d, ref);
        }
        // fallback: ptBR
        const dp = parsePtBRDate(it?.data);
        return dp ? isSameDay(dp, ref) : false;
      })
      .reduce((s, it) => s + Number(it?.valor || 0), 0);
  } catch {
    return 0;
  }
}

/* =========================
   Utils
   ========================= */
const fmtBRL = (v) =>
  Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const toNumberBRLLoose = (v) => {
  if (typeof v === "number") return v;
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  const n = s
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const f = parseFloat(n);
  return isNaN(f) ? 0 : f;
};

const todayPt = () => new Date().toLocaleDateString("pt-BR");

const sameDayISO = (iso, ptbr) => {
  if (!iso) return false;
  const ref = parsePtBRDate(ptbr); // usa seu helper dd/mm/aaaa
  if (!ref) return false;

  try {
    const d = new Date(iso);
    return isSameDay(d, ref); // compara dia/mês/ano
  } catch {
    return false;
  }
};

const safeJSON = (raw, fallback) => {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

async function getFirstAvailable(keys, fallback) {
  for (const k of keys) {
    const raw = await AsyncStorage.getItem(k);
    if (raw !== null && raw !== undefined) return { key: k, raw };
  }
  return { key: null, raw: fallback };
}

const getValorVenda = (v) => {
  // prioridade: valorNumber (mais comum no app)
  if (typeof v?.valorNumber === "number") return v.valorNumber;

  // valor (número)
  if (typeof v?.valor === "number") return v.valor;

  // valor (string "R$ 1.234,56")
  if (typeof v?.valor === "string") return toNumberBRLLoose(v.valor);

  // cents
  if (typeof v?.valorCents === "number") return v.valorCents / 100;

  // fallback
  return 0;
};

/* =========================
   Regras de classificação
   ========================= */

// Identifica recebimento de parcela (baixada) criado na RelaçãoClientes
const isRecebimentoParcelaVenda = (venda) => {
  const desc = String(venda?.descricao || "").trim();
  return desc.startsWith("📦Rec.Parcela/");
};

// Identifica “venda a prazo” (competência) lançada no salvarParcelas
const isVendaPrazoCompetencia = (venda) => {
  const origem = String(venda?.origem || "").toLowerCase();
  const desc = String(venda?.descricao || "").toLowerCase();
  return origem === "prazo" || desc.startsWith("venda a prazo");
};

// Identifica “venda à vista”/venda comum
const isVendaVista = (venda) => {
  const origem = String(venda?.origem || "").toLowerCase();
  return (
    origem === "vista" ||
    origem === "manual" ||
    origem === "" ||
    origem === "vendas"
  );
};

/* =========================
   CMV (tenta achar um total do dia)
   ========================= */
function sumCMVForDay(data, diaPt) {
  const arr = Array.isArray(data) ? data : [];
  let soma = 0;

  for (const it of arr) {
    const dataISO =
      it?.dataISO ||
      it?.createdAt ||
      it?.pagoEm ||
      it?.dataMov ||
      it?.dateISO ||
      null;
    const dataPt = it?.data || it?.dia || it?.dataVenda || null;

    const bateDia =
      (dataPt && String(dataPt) === diaPt) ||
      (dataISO && sameDayISO(dataISO, diaPt));

    if (!bateDia) continue;

    const v =
      toNumberBRLLoose(it?.cmv) ||
      toNumberBRLLoose(it?.custoTotal) ||
      toNumberBRLLoose(it?.custo) ||
      toNumberBRLLoose(it?.valor) ||
      0;

    soma += Number(v || 0);
  }

  return soma;
}

function sumCMVPrazoFromClientesPrazo(clientesObj, diaPt) {
  try {
    if (!clientesObj || typeof clientesObj !== "object") return 0;

    let soma = 0;

    for (const nome of Object.keys(clientesObj)) {
      const ficha = clientesObj?.[nome]?.ficha || {};
      if (!ficha || typeof ficha !== "object") continue;

      // Só considera se houve baixa no estoque na venda a prazo
      const baixou = ficha?.estoquePrazoBaixado === true;
      if (!baixou) continue;

      // data da venda (competência)
      const dataPt = ficha?.dataVenda || ficha?.data || null;
      const dataISO = ficha?.dataISO || ficha?.createdAt || null;

      const ehHoje =
        (dataPt && String(dataPt) === diaPt) ||
        (dataISO && sameDayISO(dataISO, diaPt));

      if (!ehHoje) continue;

      const custoTotal =
        toNumberBRLLoose(ficha?.estoquePrazoCustoTotal) ||
        toNumberBRLLoose(ficha?.cmvCustoTotal) ||
        toNumberBRLLoose(ficha?.custoTotal) ||
        0;

      if (custoTotal > 0) soma += Number(custoTotal);
    }

    return soma;
  } catch {
    return 0;
  }
}

/* =========================
   Screen
   ========================= */
export default function SaldoFinal({ navigation }) {
  const [dia, setDia] = useState(todayPt());

  const [saldoAnteriorNum, setSaldoAnteriorNum] = useState(0);

  // ✅ caixa (regime de caixa)
  const [vendasRecebidasDia, setVendasRecebidasDia] = useState(0);
  const [recebPrazoDia, setRecebPrazoDia] = useState(0);

  // ✅ novo: serviços do dia
  const [servicosDia, setServicosDia] = useState(0);

  const [despesasDia, setDespesasDia] = useState(0);

  const [prazoAReceber, setPrazoAReceber] = useState(0);

  // ✅ competência
  const [receitasCompetenciaDia, setReceitasCompetenciaDia] = useState(0);

  const [cmvDia, setCmvDia] = useState(0);

  // ✅ Capital de Giro (compacto)
  const [capEntrada, setCapEntrada] = useState(0);
  const [capSaida, setCapSaida] = useState(0);
  const [capSaldo, setCapSaldo] = useState(0);

  const carregar = async () => {
    const hoje = todayPt();
    setDia(hoje);

    const hojeDate = new Date(); // referência para comparar serviços no mesmo dia
    const totalServicosHoje = await getServicosTotalDia(hojeDate);
    setServicosDia(totalServicosHoje);

    /* --- saldo anterior --- */
    const { raw: rawSaldo } = await getFirstAvailable(KEYS.saldoAnterior, null);
    let saldo = 0;
    const parsedSaldoObj = safeJSON(rawSaldo, null);
    if (typeof parsedSaldoObj === "number") saldo = parsedSaldoObj;
    else if (typeof parsedSaldoObj === "string")
      saldo = toNumberBRLLoose(parsedSaldoObj);
    else if (parsedSaldoObj && typeof parsedSaldoObj === "object") {
      saldo =
        toNumberBRLLoose(parsedSaldoObj?.valor) ||
        toNumberBRLLoose(parsedSaldoObj?.saldo) ||
        toNumberBRLLoose(parsedSaldoObj?.saldoAnterior) ||
        0;
    } else {
      saldo = toNumberBRLLoose(rawSaldo);
    }
    setSaldoAnteriorNum(saldo);

    /* --- vendas/receitas --- */
    const { raw: rawVendas } = await getFirstAvailable(KEYS.vendas, "[]");
    const vendas = safeJSON(rawVendas, []);
    const vendasArr = Array.isArray(vendas) ? vendas : [];

    let somaVendasVistaHoje = 0; // ✅ só o que está em "vendas" e entra no caixa (vista + rec.parcela se estiver em vendas)
    let somaCompetencia = 0;

    for (const v of vendasArr) {
      const dataPt = v?.data;
      const dataISO = v?.dataISO;

      const ehHoje =
        (dataPt && String(dataPt) === hoje) ||
        (dataISO && sameDayISO(dataISO, hoje));

      if (!ehHoje) continue;

      const valor = getValorVenda(v);

      // ✅ RECEBIMENTO vindo da Agenda (dar baixa em parcela)
      const ehRecebAgenda =
        String(v?.origem || "").toLowerCase() === "agenda" &&
        !!v?.agendaParcelaId;

      // ✅ caixa: entra vista + recebimento de parcela (inclui Agenda)
      if (isVendaVista(v) || isRecebimentoParcelaVenda(v) || ehRecebAgenda) {
        somaVendasVistaHoje += valor;
      }

      // ✅ competência: entra vista + venda a prazo (mas NÃO recebimento de parcela)
      // (Agenda é recebimento, então não entra em competência)
      if (!isRecebimentoParcelaVenda(v) && !ehRecebAgenda) {
        if (isVendaVista(v) || isVendaPrazoCompetencia(v)) {
          somaCompetencia += valor;
        }
      }
    }

    // ✅ recebimentos a prazo do dia (da tela RecebimentosPrazo) — separado!
    const recebPrazoHoje = await getRecebimentosPrazoTotalDia(hoje);
    setRecebPrazoDia(Number(recebPrazoHoje || 0));

    // ✅ atualiza states (sem misturar)
    setVendasRecebidasDia(somaVendasVistaHoje);
    setReceitasCompetenciaDia(somaCompetencia);

    /* --- despesas do dia --- */
    const { raw: rawDespesas } = await getFirstAvailable(KEYS.despesas, "[]");
    const despesas = safeJSON(rawDespesas, []);
    const despesasArr = Array.isArray(despesas) ? despesas : [];
    let somaDesp = 0;

    for (const d of despesasArr) {
      const dataPt = d?.data || d?.dia;
      const dataISO = d?.dataISO || d?.createdAt;
      const ehHoje =
        (dataPt && String(dataPt) === hoje) ||
        (dataISO && sameDayISO(dataISO, hoje));

      if (!ehHoje) continue;

      const v =
        typeof d?.valor === "number"
          ? d.valor
          : toNumberBRLLoose(d?.valor || d?.valorTotal || d?.total || 0);

      somaDesp += Number(v || 0);
    }
    setDespesasDia(somaDesp);

    /* --- Vendas a prazo a receber (parcelas abertas) --- */
    const { raw: rawClientes } = await getFirstAvailable(
      KEYS.clientesPrazo,
      "{}",
    );
    const clientesObj = safeJSON(rawClientes, {});
    let somaAReceber = 0;

    if (clientesObj && typeof clientesObj === "object") {
      for (const nome of Object.keys(clientesObj)) {
        const parcelas = clientesObj[nome]?.parcelas || [];
        for (const p of parcelas) {
          if (!p?.pago) {
            somaAReceber += Number(p?.valor || 0);
          }
        }
      }
    }
    setPrazoAReceber(somaAReceber);

    /* --- CMV do dia --- */
    let cmv = 0;

    let cmvReg = 0;
    let temPrazoNoReg = false;
    try {
      const rawReg = await AsyncStorage.getItem("cmvRegistros");
      const arrReg = safeJSON(rawReg, []);
      if (Array.isArray(arrReg)) {
        cmvReg = sumCMVForDay(arrReg, hoje);
        temPrazoNoReg = arrReg.some((it) => {
          const dataISO = it?.dataISO || it?.createdAt || it?.dataMov || null;
          const dataPt = it?.data || it?.dia || it?.dataVenda || null;
          const bateDia =
            (dataPt && String(dataPt) === hoje) ||
            (dataISO && sameDayISO(dataISO, hoje));
          if (!bateDia) return false;
          const origem = String(it?.origem || "").toLowerCase();
          return origem.includes("prazo");
        });
      }
    } catch {}

    cmv = cmvReg;

    if (!cmv || cmv <= 0) {
      for (const k of KEYS.cmv) {
        if (k === "cmvRegistros") continue;
        const raw = await AsyncStorage.getItem(k);
        if (!raw) continue;

        const data = safeJSON(raw, null);

        if (typeof data === "number") {
          cmv = Number(data || 0);
          break;
        }

        if (data && typeof data === "object" && !Array.isArray(data)) {
          const v =
            toNumberBRLLoose(data?.[hoje]) ||
            toNumberBRLLoose(data?.totalHoje) ||
            toNumberBRLLoose(data?.cmvHoje) ||
            0;

          if (v > 0) {
            cmv = v;
            break;
          }

          if (Array.isArray(data?.lancamentos)) {
            const s = sumCMVForDay(data.lancamentos, hoje);
            if (s > 0) {
              cmv = s;
              break;
            }
          }
        }

        if (Array.isArray(data)) {
          const s = sumCMVForDay(data, hoje);
          if (s > 0) {
            cmv = s;
            break;
          }
        }
      }
    }

    const cmvPrazoFicha = temPrazoNoReg
      ? 0
      : sumCMVPrazoFromClientesPrazo(clientesObj, hoje);

    setCmvDia(Number(cmv || 0) + Number(cmvPrazoFicha || 0));

    /* --- Capital de Giro (compacto) --- */
    const { raw: rawCG } = await getFirstAvailable(KEYS.capitalGiro, "{}");
    const cg = safeJSON(rawCG, { entrada: 0, saida: 0, saldo: 0 });

    const entradaCG = Number(cg?.entrada || 0);
    const saidaCG = Number(cg?.saida || 0);
    const saldoCG =
      typeof cg?.saldo === "number" ? Number(cg.saldo) : entradaCG - saidaCG;

    setCapEntrada(entradaCG);
    setCapSaida(saidaCG);
    setCapSaldo(saldoCG);
  };
  // ✅ RECARREGA TODA VEZ QUE ABRIR A TELA
  useFocusEffect(
    useCallback(() => {
      carregar();
    }, []),
  );

  /* =========================
     3 BLOCOS
     ========================= */
  const saldoEmCaixa = useMemo(() => {
    return (
      Number(saldoAnteriorNum || 0) +
      (Number(vendasRecebidasDia || 0) + Number(servicosDia || 0)) -
      Number(despesasDia || 0)
    );
  }, [saldoAnteriorNum, vendasRecebidasDia, servicosDia, despesasDia]);

  const resultadoCompetencia = useMemo(() => {
    return (
      Number(receitasCompetenciaDia || 0) +
      Number(servicosDia || 0) -
      Number(despesasDia || 0)
    );
  }, [receitasCompetenciaDia, servicosDia, despesasDia]);

  const corCaixa = saldoEmCaixa >= 0 ? "#e7fff0" : "#ffeaea";
  const corCompet = resultadoCompetencia >= 0 ? "#eaf2ff" : "#fff3e6";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 120 }}
    >
      <Text style={styles.title}>Saldo Final</Text>
      <Text style={styles.sub}>Dia: {dia}</Text>

      {/* ✅ Saldo em Caixa */}
      <View
        style={[
          styles.card,
          { backgroundColor: corCaixa, borderColor: "#dfe8df" },
        ]}
      >
        <Text style={styles.cardTitle}>✅ Saldo em Caixa</Text>

        <View style={styles.row}>
          <Text style={styles.label}>Saldo anterior</Text>
          <Text style={styles.value}>{fmtBRL(saldoAnteriorNum)}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Vendas recebidas hoje</Text>
          <Text style={styles.value}>{fmtBRL(vendasRecebidasDia)}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Recebimentos a prazo hoje</Text>
          <Text style={styles.value}>{fmtBRL(recebPrazoDia)}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Serviços recebidos hoje</Text>
          <Text style={styles.value}>{fmtBRL(servicosDia)}</Text>
        </View>

        <View style={styles.row}>
          <Text style={[styles.label, { fontWeight: "800" }]}>
            Total dos Recebimentos de hoje
          </Text>
          <Text style={[styles.value, { fontWeight: "900" }]}>
            {fmtBRL(Number(vendasRecebidasDia || 0) + Number(servicosDia || 0))}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Despesas de hoje</Text>
          <Text style={styles.value}>{fmtBRL(despesasDia)}</Text>
        </View>

        <View style={styles.sep} />

        <View style={styles.row}>
          <Text style={[styles.label, { fontWeight: "800" }]}>
            Saldo em caixa (hoje)
          </Text>
          <Text style={[styles.value, { fontWeight: "900" }]}>
            {fmtBRL(saldoEmCaixa)}
          </Text>
        </View>

        <Text style={styles.hint}>
          * Aqui não entra “venda a prazo” que ainda não foi recebida. Só entra
          quando você dá BAIXA na parcela. Serviços entram quando são lançados
          (à vista / recebidos).
        </Text>
      </View>

      {/* 💼 Capital de Giro (compacto) */}
      <View
        style={[
          styles.card,
          { backgroundColor: "#f8f9fa", borderColor: "#ddd" },
        ]}
      >
        <Text style={styles.cardTitle}>💼 Capital de Giro</Text>

        <View style={styles.cgResumoRow}>
          <View style={styles.cgResumoItem}>
            <Text style={styles.cgLabel}>Entradas</Text>
            <Text style={styles.cgValor}>{fmtBRL(capEntrada)}</Text>
          </View>

          <View style={styles.cgResumoItem}>
            <Text style={styles.cgLabel}>Saídas</Text>
            <Text style={styles.cgValor}>{fmtBRL(capSaida)}</Text>
          </View>

          <View style={styles.cgResumoItem}>
            <Text style={styles.cgLabel}>Saldo</Text>
            <Text
              style={[styles.cgValor, capSaldo < 0 && { color: "#a94442" }]}
            >
              {fmtBRL(capSaldo)}
            </Text>
          </View>
        </View>

        <Text style={styles.hint}>
          * Valores vêm do “Capital de Giro” salvo na tela Saldo Anterior.
        </Text>
      </View>

      {/* 🕒 Vendas a Prazo a Receber */}
      <View
        style={[
          styles.card,
          { backgroundColor: "#fffdf2", borderColor: "#f3e6ad" },
        ]}
      >
        <Text style={styles.cardTitle}>🕒 Vendas a Prazo a Receber</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Parcelas em aberto</Text>
          <Text style={[styles.value, { fontWeight: "900" }]}>
            {fmtBRL(prazoAReceber)}
          </Text>
        </View>
        <Text style={styles.hint}>
          * Soma todas as parcelas não pagas (clientesPrazo). Serve pra você
          enxergar o “a receber”.
        </Text>
      </View>
      {/* 📊 DRE de Hoje (Competência) */}
      <View
        style={[
          styles.card,
          { backgroundColor: corCompet, borderColor: "#d9e6ff" },
        ]}
      >
        <Text style={styles.cardTitle}>📊 DRE do Dia (Competência)</Text>

        {/* Receita bruta */}
        <View style={styles.row}>
          <Text style={styles.label}>Receita Bruta (vendas)</Text>
          <Text style={styles.value}>{fmtBRL(receitasCompetenciaDia)}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Receita de Serviços</Text>
          <Text style={styles.value}>{fmtBRL(servicosDia)}</Text>
        </View>

        <View style={styles.sep} />

        <View style={styles.row}>
          <Text style={[styles.label, { fontWeight: "900" }]}>
            Receita Total
          </Text>
          <Text style={[styles.value, { fontWeight: "900" }]}>
            {fmtBRL(
              Number(receitasCompetenciaDia || 0) + Number(servicosDia || 0),
            )}
          </Text>
        </View>

        {/* Deduções */}
        <View style={styles.row}>
          <Text style={[styles.value, styles.valueNeg]}></Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>(–) Despesas Gerais</Text>
          <Text style={[styles.value, styles.valueNeg]}>
            {fmtBRL(-Number(despesasDia || 0))}
          </Text>
        </View>

        <View style={styles.sep} />

        {/* Resultado */}
        <View style={styles.row}>
          <Text style={[styles.label, { fontWeight: "900" }]}>
            (=) Resultado do Dia
          </Text>
          <Text
            style={[
              styles.value,
              { fontWeight: "900" },
              resultadoCompetencia < 0 ? styles.valueNeg : styles.valuePos,
            ]}
          >
            {fmtBRL(resultadoCompetencia)}
          </Text>
        </View>

        <Text style={styles.hint}>
          * Regime de competência: entra venda à vista + venda a prazo do dia
          (como receita). Recebimento de parcela não entra aqui. Serviços entram
          quando registrados.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.cmvCard}
        onPress={() =>
          Alert.alert(
            "CMV do dia",
            "O CMV é um custo de mercadoria vendida (competência).\n\n• Se você pagar pelo CAPITAL DE GIRO: lembre de DEVOLVER manualmente o valor do custo ao Capital de Giro quando vender o produto.\n• Se você pagar em DESPESAS: lance o pagamento na tela Despesas (senão o caixa não bate).\n\nPor segurança, o CMV não está sendo somado nem subtraído automaticamente no Resultado do Dia.",
          )
        }
      >
        <Text style={styles.cmvTitle}>🧾 CMV do dia (informativo)</Text>
        <Text style={styles.cmvValue}>{fmtBRL(cmvDia)}</Text>
        <Text style={styles.cmvHint}>Toque para ver o aviso</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btn} onPress={carregar}>
        <Text style={styles.btnText}>Atualizar</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

/* =========================
   Styles
   ========================= */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  title: { fontSize: 22, fontWeight: "900", textAlign: "center" },
  sub: { textAlign: "center", marginTop: 6, marginBottom: 14, color: "#555" },

  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 10,
    color: "#111",
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 4,
  },
  label: { color: "#111" },
  value: { color: "#111", fontWeight: "700" },

  sep: { height: 1, backgroundColor: "rgba(0,0,0,0.08)", marginVertical: 10 },

  hint: { marginTop: 10, color: "#444", fontSize: 12, lineHeight: 16 },

  // ✅ Capital de Giro compacto (3 colunas)
  cgResumoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 6,
  },
  cgResumoItem: {
    flex: 1,
    alignItems: "center",
  },
  cgLabel: {
    fontSize: 12,
    color: "#555",
  },
  cgValor: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111",
    marginTop: 2,
    textAlign: "center",
  },

  btn: {
    marginTop: 8,
    backgroundColor: "#111",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  cmvCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#f3e6ad",
    backgroundColor: "#fffdf2",
    borderRadius: 16,
    padding: 12,

    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cmvTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#7a5d00",
  },
  cmvValue: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: "900",
    color: "#111",
  },
  cmvHint: {
    marginTop: 6,
    fontSize: 12,
    color: "#666",
  },
  btnText: { color: "#fff", fontWeight: "800" },
});
