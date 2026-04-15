// screens/ResultadoCaixa.js
import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";

/* =========================
   KEYS
========================= */
const KEYS = {
  saldoAnterior: ["saldoAnterior", "saldo_anterior", "saldoAnteriorValor"],
  vendas: ["venda", "vendas", "receitas", "receita"],
  despesas: ["despesas", "despesa"],
};

const KEY_SERVICOS = "@receitas_servicos";

/* =========================
   HELPERS
========================= */
const fmtBRL = (v) =>
  Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const todayPt = () => new Date().toLocaleDateString("pt-BR");

const isSameDay = (d1, d2) =>
  d1.getDate() === d2.getDate() &&
  d1.getMonth() === d2.getMonth() &&
  d1.getFullYear() === d2.getFullYear();

const parsePtBRDate = (pt) => {
  try {
    const s = String(pt || "").trim();
    const [dd, mm, yyyy] = s.split("/").map((x) => parseInt(x, 10));
    if (!dd || !mm || !yyyy) return null;
    return new Date(yyyy, mm - 1, dd);
  } catch {
    return null;
  }
};

const sameDayISO = (iso, ptbr) => {
  if (!iso) return false;
  const ref = parsePtBRDate(ptbr);
  if (!ref) return false;

  try {
    const d = new Date(iso);
    return isSameDay(d, ref);
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

async function getFirstAvailable(keys, fallback) {
  for (const k of keys) {
    const raw = await AsyncStorage.getItem(k);
    if (raw !== null && raw !== undefined) return { key: k, raw };
  }
  return { key: null, raw: fallback };
}

const getValorVenda = (v) => {
  if (typeof v?.valorNumber === "number") return v.valorNumber;
  if (typeof v?.valor === "number") return v.valor;
  if (typeof v?.valor === "string") return toNumberBRLLoose(v.valor);
  if (typeof v?.valorCents === "number") return v.valorCents / 100;
  return 0;
};

const isRecebimentoParcelaVenda = (venda) => {
  const desc = String(venda?.descricao || "").trim();
  return desc.startsWith("📦Rec.Parcela/");
};

const isVendaVista = (venda) => {
  const origem = String(venda?.origem || "").toLowerCase();
  return (
    origem === "vista" ||
    origem === "manual" ||
    origem === "" ||
    origem === "vendas"
  );
};

async function getServicosTotalDia(dateRef) {
  try {
    const raw = await AsyncStorage.getItem(KEY_SERVICOS);
    const arr = raw ? JSON.parse(raw) : [];
    const ref = new Date(dateRef);

    return (Array.isArray(arr) ? arr : [])
      .filter((it) => {
        if (it?.dataISO) {
          const d = new Date(it.dataISO);
          return isSameDay(d, ref);
        }
        const dp = parsePtBRDate(it?.data);
        return dp ? isSameDay(dp, ref) : false;
      })
      .reduce((s, it) => s + Number(it?.valor || 0), 0);
  } catch {
    return 0;
  }
}

/* =========================
   SCREEN
========================= */
export default function ResultadoCaixa({ navigation }) {
  const [dia, setDia] = useState(todayPt());
  const [saldoAnteriorNum, setSaldoAnteriorNum] = useState(0);
  const [vendasRecebidasDia, setVendasRecebidasDia] = useState(0);
  const [servicosDia, setServicosDia] = useState(0);
  const [despesasDia, setDespesasDia] = useState(0);

  const carregar = async () => {
    const hoje = todayPt();
    setDia(hoje);

    const hojeDate = new Date();

    /* saldo anterior */
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

    /* vendas recebidas hoje */
    const { raw: rawVendas } = await getFirstAvailable(KEYS.vendas, "[]");
    const vendas = safeJSON(rawVendas, []);
    const vendasArr = Array.isArray(vendas) ? vendas : [];

    let somaVendasVistaHoje = 0;

    for (const v of vendasArr) {
      const dataPt = v?.data;
      const dataISO = v?.dataISO;

      const ehHoje =
        (dataPt && String(dataPt) === hoje) ||
        (dataISO && sameDayISO(dataISO, hoje));

      if (!ehHoje) continue;

      const valor = getValorVenda(v);

      const ehRecebAgenda =
        String(v?.origem || "").toLowerCase() === "agenda" &&
        !!v?.agendaParcelaId;

      if (isVendaVista(v) || isRecebimentoParcelaVenda(v) || ehRecebAgenda) {
        somaVendasVistaHoje += valor;
      }
    }

    setVendasRecebidasDia(somaVendasVistaHoje);

    /* serviços recebidos hoje */
    const totalServicosHoje = await getServicosTotalDia(hojeDate);
    setServicosDia(totalServicosHoje);

    /* despesas do dia */
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
  };

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, []),
  );

  const saldoEmCaixa = useMemo(() => {
    return (
      Number(saldoAnteriorNum || 0) +
      (Number(vendasRecebidasDia || 0) + Number(servicosDia || 0)) -
      Number(despesasDia || 0)
    );
  }, [saldoAnteriorNum, vendasRecebidasDia, servicosDia, despesasDia]);

  const positivo = saldoEmCaixa >= 0;

  const mensagem = positivo
    ? "Parabéns, seu caixa está positivo!"
    : "Hoje não foi como esperado, mas amanhã pode ser melhor!";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 80 }}
    >
      <Text style={styles.topTitle}>Resultado em Caixa Hoje</Text>

      <Text style={styles.mainTitle}>Resultado em Caixa Hoje</Text>
      <Text style={styles.sub}>Data: {dia}</Text>

      <View
        style={[
          styles.valorBox,
          positivo ? styles.valorBoxPositivo : styles.valorBoxNegativo,
        ]}
      >
        <Text style={styles.valorTexto}>{fmtBRL(saldoEmCaixa)}</Text>
      </View>

      <Text
        style={[
          styles.mensagem,
          positivo ? styles.mensagemPositiva : styles.mensagemNegativa,
        ]}
      >
        {mensagem}
      </Text>

      <TouchableOpacity
        style={styles.botaoDetalhado}
        onPress={() => navigation.navigate("SaldoFinal")}
      >
        <Text style={styles.botaoDetalhadoTexto}>Ver detalhado</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 16,
  },

  topTitle: {
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 40,
    color: "#111",
  },

  mainTitle: {
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
    color: "#111",
    marginBottom: 12,
  },

  sub: {
    fontSize: 16,
    textAlign: "center",
    color: "#333",
    marginBottom: 28,
  },

  valorBox: {
    borderRadius: 18,
    paddingVertical: 34,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 26,
  },

  valorBoxPositivo: {
    backgroundColor: "#dff0e1",
  },

  valorBoxNegativo: {
    backgroundColor: "#fde2e2",
  },

  valorTexto: {
    fontSize: 34,
    fontWeight: "900",
    color: "#111",
    textAlign: "center",
  },

  mensagem: {
    fontSize: 18,
    textAlign: "center",
    marginBottom: 34,
    paddingHorizontal: 12,
    lineHeight: 26,
  },

  mensagemPositiva: {
    color: "#2d6a4f",
  },

  mensagemNegativa: {
    color: "#b23a48",
  },

  botaoDetalhado: {
    backgroundColor: "#d4af37",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },

  botaoDetalhadoTexto: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
});
