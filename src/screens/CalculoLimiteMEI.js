// screens/CalculoLimiteMEI.js
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Platform,
  Modal,
  TextInput,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  getLimits,
  setLimits,
  marcarMeiPromptConcluido,
  reativarPerguntaMei,
  setAvisosMEI,
  loadMonthList,
  yearMonthKey,
} from "../utils/mei";

import { rebuildVendaCacheMes } from "../utils/meiVendas";
import { rebuildServicoCacheMes } from "../utils/meiServicos";
import { FORM_CARD } from "../styles/formCard";

/* =========================
   CHAVES / CONSTANTES
========================= */
const KEY_LIMITS_LOCAL = "@MEI_LIMITS"; // mesmo key do utils/mei.js

const VENDAS_PRIMARY = "venda"; // igual Vendas.js
const SERVICOS_PRIMARY = "@receitas_servicos"; // ReceitaServicos.js salva separado

/* =========================
   HELPERS DE DATA / VALOR
========================= */
const fmt = (v) =>
  Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });

// aceita "81.000,00" / "81000" / "R$ 1.234,56"
const parseBRL = (txt) => {
  const s = String(txt || "")
    .replace(/\s/g, "")
    .replace("R$", "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const ptDate = (d) =>
  new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

// =========================
// FORMATAÇÃO BRL (padrão DRD)
// =========================
function onlyDigits(v = "") {
  return String(v).replace(/\D/g, "");
}

function formatBRLFromDigits(digits) {
  if (!digits) return "";
  const n = Number(digits) / 100;
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/* =========================
   SUBCOMPONENTE DE LINHA
========================= */
function Linha({ rotulo, valor }) {
  return (
    <View style={styles.linha}>
      <Text style={styles.rotulo}>{rotulo}</Text>
      <Text style={styles.valor}>{valor}</Text>
    </View>
  );
}

/* =========================
   MODAL: EDITAR LIMITES (manual)
========================= */
function EditarLimitesButton({ onSaved }) {
  const [open, setOpen] = useState(false);
  const [anual, setAnual] = useState("81000");
  const [mensal, setMensal] = useState("6750");
  const [avisos, setAvisos] = useState(true);

  useEffect(() => {
    (async () => {
      const lim = await getLimits();
      setAnual(String(lim?.anual ?? 81000));
      setMensal(String(lim?.mensal ?? 81000 / 12));
      setAvisos(lim?.avisos !== false);
    })();
  }, []);

  return (
    <>
      <TouchableOpacity style={styles.pillBtn} onPress={() => setOpen(true)}>
        <Text style={styles.pillTxt}>Editar Limites</Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={localStyles.overlay}>
          <View style={localStyles.box}>
            <Text style={localStyles.title}>Editar Limites MEI</Text>

            <Text style={localStyles.label}>Limite anual</Text>
            <TextInput
              style={localStyles.input}
              value={anual}
              onChangeText={setAnual}
              placeholder="81000"
              placeholderTextColor="#999"
              keyboardType="numeric"
            />

            <Text style={localStyles.label}>Limite mensal</Text>
            <TextInput
              style={localStyles.input}
              value={mensal}
              onChangeText={setMensal}
              placeholder="6750"
              placeholderTextColor="#999"
              keyboardType="numeric"
            />

            <View style={localStyles.row}>
              <Text style={localStyles.labelRow}>Ativar avisos</Text>
              <TouchableOpacity
                onPress={() => setAvisos((v) => !v)}
                style={localStyles.toggle}
              >
                <Text style={localStyles.toggleTxt}>
                  {avisos ? "Ligado" : "Desligado"}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={localStyles.rowBtns}>
              <TouchableOpacity
                style={[
                  localStyles.btnHalf,
                  {
                    borderColor: "#999",
                    borderWidth: 1,
                    backgroundColor: "#fff",
                  },
                ]}
                onPress={() => setOpen(false)}
              >
                <Text style={[localStyles.btnTxt, { color: "#999" }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[localStyles.btnHalf, { backgroundColor: "#111" }]}
                onPress={async () => {
                  const a = Number(anual) || 81000;
                  const m = Number(mensal) || a / 12;
                  await setLimits({ anual: a, mensal: m, avisos });

                  // ✅ preserva extras no @MEI_LIMITS (proporcional/prévio)
                  try {
                    const raw = await AsyncStorage.getItem(KEY_LIMITS_LOCAL);
                    const parsed = raw ? JSON.parse(raw) : {};
                    const merged = {
                      ...(parsed || {}),
                      anual: a,
                      mensal: m,
                      avisos: !!avisos,
                      updatedAt: new Date().toISOString(),
                    };
                    await AsyncStorage.setItem(
                      KEY_LIMITS_LOCAL,
                      JSON.stringify(merged),
                    );
                  } catch {}

                  setOpen(false);
                  onSaved?.();
                  Alert.alert("Pronto", "Limites atualizados.");
                }}
              >
                <Text style={[localStyles.btnTxt, { color: "#fff" }]}>
                  Salvar
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={localStyles.hint}>
              Dica: este botão é “manual”. O botão “MEI Proporcional” calcula
              automaticamente quando você iniciou a atividade.
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

/* =========================
   MODAL: PROPORCIONALIDADE + PRÉVIO
========================= */
function ProporcionalMEIButton({ baseYear, onSaved, autoOpen }) {
  const [open, setOpen] = useState(false);

  const [inicioISO, setInicioISO] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [inicioTemp, setInicioTemp] = useState(new Date());

  const [previoTxt, setPrevioTxt] = useState("");

  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY_LIMITS_LOCAL);
        const parsed = raw ? JSON.parse(raw) : {};
        if (parsed?.inicioAtividadeISO) {
          setInicioISO(String(parsed.inicioAtividadeISO));
          setInicioTemp(new Date(parsed.inicioAtividadeISO));
        }
        if (parsed?.faturamentoPrevioAno != null) {
          const centsDigits = String(
            Math.round(Number(parsed.faturamentoPrevioAno || 0) * 100),
          );
          setPrevioTxt(formatBRLFromDigits(centsDigits));
        }
      } catch {}
    })();
  }, [baseYear]);

  function calcProporcional({ anualBase = 81000, anoRef, inicioAtividadeISO }) {
    if (!inicioAtividadeISO) return null;

    const inicio = new Date(inicioAtividadeISO);
    const anoInicio = inicio.getFullYear();

    // só aplica proporcional no ano de início; nos anos seguintes é integral
    if (anoRef !== anoInicio) {
      return {
        anualCalc: anualBase,
        mensalCalc: anualBase / 12,
        mesesAtivos: 12,
        aplicado: false,
      };
    }

    // meses de atividade no ano (inclusive mês de abertura)
    const mInicio = inicio.getMonth() + 1; // 1..12
    const mesesAtivos = Math.max(1, 13 - mInicio);

    const anualCalc = (anualBase * mesesAtivos) / 12;

    // mensal proporcional “dos meses ativos”
    const mensalCalc =
      mesesAtivos > 0 ? anualCalc / mesesAtivos : anualCalc / 12;

    return { anualCalc, mensalCalc, mesesAtivos, aplicado: true };
  }

  const anoInicioAuto = useMemo(() => {
    if (!inicioISO) return null;
    const d = new Date(inicioISO);
    return Number.isFinite(d.getTime()) ? d.getFullYear() : null;
  }, [inicioISO]);

  return (
    <>
      <TouchableOpacity style={styles.pillBtn} onPress={() => setOpen(true)}>
        <Text style={styles.pillTxt}>MEI Proporcional</Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={localStyles.overlay}>
          <View style={localStyles.box}>
            <Text style={localStyles.title}>MEI Proporcional + Prévio</Text>

            <Text style={localStyles.label}>
              Data de início do MEI (abertura/atividade)
            </Text>
            <TouchableOpacity
              style={localStyles.input}
              onPress={() => setShowPicker(true)}
              activeOpacity={0.9}
            >
              <Text style={{ color: inicioISO ? "#111" : "#999" }}>
                {inicioISO ? ptDate(inicioISO) : "Selecionar data"}
              </Text>
            </TouchableOpacity>

            {showPicker && (
              <DateTimePicker
                value={inicioTemp}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(e, d) => {
                  setShowPicker(false);
                  if (d) {
                    setInicioTemp(new Date(d));
                    setInicioISO(new Date(d).toISOString());
                  }
                }}
              />
            )}

            <Text style={localStyles.label}>
              Faturamento já feito antes do app (no ano do início)
            </Text>
            <TextInput
              style={localStyles.input}
              value={previoTxt}
              onChangeText={(txt) => {
                const digits = onlyDigits(txt);
                setPrevioTxt(formatBRLFromDigits(digits));
              }}
              keyboardType="numeric"
              placeholder="R$ 0,00"
              placeholderTextColor="#777"
            />

            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                localStyles.btnFull,
                { backgroundColor: "#111", marginTop: 10 },
              ]}
              onPress={async () => {
                try {
                  const lim = await getLimits();
                  const anualBase = Number(lim?.anual ?? 81000);

                  const anoRef = Number(anoInicioAuto || baseYear);

                  const calc = calcProporcional({
                    anualBase,
                    anoRef,
                    inicioAtividadeISO: inicioISO,
                  });

                  const raw = await AsyncStorage.getItem(KEY_LIMITS_LOCAL);
                  const parsed = raw ? JSON.parse(raw) : {};

                  const previo = parseBRL(previoTxt);

                  const merged = {
                    ...(parsed || {}),
                    anual: Number(lim?.anual ?? 81000),
                    mensal: Number(lim?.mensal ?? 81000 / 12),
                    avisos: lim?.avisos !== false,

                    // extras
                    inicioAtividadeISO: inicioISO || null,
                    faturamentoPrevioAno: Number(previo || 0),
                    faturamentoPrevioAnoYear: Number(anoRef),

                    // limites calculados para o ANO DE INÍCIO
                    calcYear: Number(anoRef),
                    anualCalc: calc ? Number(calc.anualCalc || 0) : null,
                    mensalCalc: calc ? Number(calc.mensalCalc || 0) : null,
                    mesesAtivosCalc: calc
                      ? Number(calc.mesesAtivos || 0)
                      : null,
                    aplicadoCalc: calc ? !!calc.aplicado : false,
                    updatedAt: new Date().toISOString(),
                  };

                  await AsyncStorage.setItem(
                    KEY_LIMITS_LOCAL,
                    JSON.stringify(merged),
                  );

                  // ✅ salvou configuração => encerra onboarding do prompt
                  try {
                    await marcarMeiPromptConcluido();
                  } catch {}

                  setOpen(false);
                  onSaved?.();
                  Alert.alert("Pronto", "Configuração salva ✅");
                } catch (e) {
                  Alert.alert("Erro", String(e?.message || e));
                }
              }}
            >
              <Text style={[localStyles.btnTxt, { color: "#fff" }]}>
                Salvar
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                localStyles.btnFull,
                {
                  borderColor: "#999",
                  borderWidth: 1,
                  marginTop: 10,
                  backgroundColor: "#fff",
                },
              ]}
              onPress={() => setOpen(false)}
            >
              <Text style={[localStyles.btnTxt, { color: "#111" }]}>
                Fechar
              </Text>
            </TouchableOpacity>

            <Text style={localStyles.hint}>
              • Se o MEI foi aberto no ano do início, o limite anual fica
              proporcional aos meses ativos.{"\n"}• O “Faturamento prévio” entra
              no cálculo anual para quem começou a usar o app depois de janeiro.
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

const localStyles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 20,
  },
  box: { backgroundColor: "#fff", borderRadius: 12, padding: 16 },
  title: {
    fontWeight: "900",
    fontSize: 16,
    marginBottom: 10,
    textAlign: "center",
    color: "#111",
  },
  label: { fontWeight: "800", color: "#111", marginTop: 8, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#fff",
  },
  row: { flexDirection: "row", alignItems: "center", marginTop: 10 },
  labelRow: { flex: 1, fontWeight: "800", color: "#111" },
  toggle: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
  },
  toggleTxt: { fontWeight: "900", color: "#111" },
  rowBtns: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    gap: 10,
  },
  btnHalf: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    minHeight: 44,
  },
  btnFull: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    minHeight: 44,
  },
  btnTxt: { fontWeight: "900", textAlign: "center" },
  hint: {
    marginTop: 10,
    color: "#666",
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
  },
});

/* =========================
   TELA PRINCIPAL
========================= */
export default function CalculoLimiteMEI({ route, navigation }) {
  const { refDate } = route.params || {};
  const initialDate = useMemo(
    () => (refDate ? new Date(refDate) : new Date()),
    [refDate],
  );

  const [baseDate, setBaseDate] = useState(initialDate);
  const [showPicker, setShowPicker] = useState(false);

  const [limites, setLimitesState] = useState({
    anual: 81000,
    mensal: 81000 / 12,
    avisos: true,
  });

  // separados
  const [totalMesVendas, setTotalMesVendas] = useState(0);
  const [totalMesServicos, setTotalMesServicos] = useState(0);
  const [totalAnoVendas, setTotalAnoVendas] = useState(0);
  const [totalAnoServicos, setTotalAnoServicos] = useState(0);

  const totalMes = useMemo(
    () => Number(totalMesVendas || 0) + Number(totalMesServicos || 0),
    [totalMesVendas, totalMesServicos],
  );

  const totalAno = useMemo(
    () => Number(totalAnoVendas || 0) + Number(totalAnoServicos || 0),
    [totalAnoVendas, totalAnoServicos],
  );

  // ✅ limites “usados” (proporcional se existir)
  const limiteMensalUsado = useMemo(() => {
    return Number(limites?.mensalCalc ?? limites?.mensal ?? 0);
  }, [limites]);

  const limiteAnualUsado = useMemo(() => {
    return Number(limites?.anualCalc ?? limites?.anual ?? 0);
  }, [limites]);

  // ✅ prévio só entra no ano correspondente
  const faturamentoPrevioAno = useMemo(() => {
    const v = Number(limites?.faturamentoPrevioAno ?? 0);
    const y = Number(
      limites?.faturamentoPrevioAnoYear ?? baseDate.getFullYear(),
    );
    return y === baseDate.getFullYear() ? v : 0;
  }, [limites, baseDate]);

  const totalAnoComPrevio = useMemo(() => {
    return Number(totalAno || 0) + Number(faturamentoPrevioAno || 0);
  }, [totalAno, faturamentoPrevioAno]);

  const percentMes = useMemo(() => {
    const lim = Number(limiteMensalUsado || 0);
    if (!lim) return 0;
    return Math.min(100, (Number(totalMes) / lim) * 100);
  }, [totalMes, limiteMensalUsado]);

  const percentAno = useMemo(() => {
    const lim = Number(limiteAnualUsado || 0);
    if (!lim) return 0;
    return Math.min(100, (Number(totalAnoComPrevio) / lim) * 100);
  }, [totalAnoComPrevio, limiteAnualUsado]);

  useEffect(() => {
    const unsub = navigation?.addListener?.("focus", () => recarregar());
    recarregar();

    if (route?.params?.openMeiProporcional) {
      navigation.setParams?.({ openMeiProporcional: false });
    }

    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseDate]);

  async function recarregar() {
    // 1) limites
    try {
      const lim = await getLimits();

      let extras = {};
      try {
        const raw = await AsyncStorage.getItem(KEY_LIMITS_LOCAL);
        const parsed = raw ? JSON.parse(raw) : {};
        extras = parsed && typeof parsed === "object" ? parsed : {};
      } catch {}

      const calcYear = Number(extras?.calcYear || 0);
      const anoAtual = baseDate.getFullYear();

      const merged = {
        ...(lim || {}),
        ...(extras || {}),
        anualCalc: calcYear === anoAtual ? extras?.anualCalc : undefined,
        mensalCalc: calcYear === anoAtual ? extras?.mensalCalc : undefined,
      };

      setLimitesState(merged);
    } catch {}

    // 2) totais (✅ cache mensal por bucket)
    try {
      const ym = yearMonthKey(baseDate);
      const refISO = baseDate?.toISOString?.() || new Date().toISOString();

      // ✅ rebuild do mês que está sendo exibido (anti-fantasma REAL)
      try {
        await rebuildVendaCacheMes(VENDAS_PRIMARY, refISO); // bucket "venda"
      } catch (e) {
        console.log("[MEI] rebuild vendas(ref) falhou:", e?.message || e);
      }

      try {
        await rebuildServicoCacheMes(SERVICOS_PRIMARY, refISO); // bucket "servicos"
      } catch (e) {
        console.log("[MEI] rebuild servicos(ref) falhou:", e?.message || e);
      }

      // ---- MÊS ----
      const cacheVendasMes = await loadMonthList("venda", ym);
      const cacheServMes = await loadMonthList("servicos", ym);

      const vendasMes = (
        Array.isArray(cacheVendasMes) ? cacheVendasMes : []
      ).reduce((a, c) => a + Number(c?.valorNumber || 0), 0);

      const servMes = (Array.isArray(cacheServMes) ? cacheServMes : []).reduce(
        (a, c) => a + Number(c?.valorNumber || 0),
        0,
      );

      setTotalMesVendas(vendasMes);
      setTotalMesServicos(servMes);

      // ---- ANO (soma 12 meses do cache) ----
      const ano = baseDate.getFullYear();
      let vendasAno = 0;
      let servAno = 0;

      for (let m = 0; m < 12; m++) {
        const d = new Date(ano, m, 1);
        const ymLoop = yearMonthKey(d);

        const vList = await loadMonthList("venda", ymLoop);
        const sList = await loadMonthList("servicos", ymLoop);

        vendasAno += (Array.isArray(vList) ? vList : []).reduce(
          (a, c) => a + Number(c?.valorNumber || 0),
          0,
        );

        servAno += (Array.isArray(sList) ? sList : []).reduce(
          (a, c) => a + Number(c?.valorNumber || 0),
          0,
        );
      }

      setTotalAnoVendas(vendasAno);
      setTotalAnoServicos(servAno);
    } catch (e) {
      console.log("[MEI] recarregar totais(cache) falhou:", e?.message || e);
    }
  }

  const statusMes =
    percentMes >= 100
      ? { cor: "#dc2626", bg: "#fee2e2", label: "Ultrapassou o limite mensal" }
      : percentMes >= 80
        ? {
            cor: "#b45309",
            bg: "#fef3c7",
            label: "Atenção: próximo do limite mensal",
          }
        : { cor: "#047857", bg: "#ecfdf5", label: "Dentro do limite mensal" };

  const mesStr = `${String(baseDate.getMonth() + 1).padStart(
    2,
    "0",
  )}/${baseDate.getFullYear()}`;

  // PDF
  const askAndPrint = () => {
    Alert.alert("Imprimir PDF", "Deseja gerar o relatório Mensal ou Anual?", [
      { text: "Mensal", onPress: () => gerarPDF("mensal") },
      { text: "Anual", onPress: () => gerarPDF("anual") },
      { text: "Cancelar", style: "cancel" },
    ]);
  };

  async function gerarPDF(tipo = "mensal") {
    try {
      const printToFileAsync = (await import("expo-print")).printToFileAsync;
      const { shareAsync } = await import("expo-sharing");

      const isMensal = tipo === "mensal";
      const lim = isMensal
        ? Number(limiteMensalUsado || 0)
        : Number(limiteAnualUsado || 0);

      const vendas = isMensal
        ? Number(totalMesVendas || 0)
        : Number(totalAnoVendas || 0);
      const servicos = isMensal
        ? Number(totalMesServicos || 0)
        : Number(totalAnoServicos || 0);

      const previo = isMensal ? 0 : Number(faturamentoPrevioAno || 0);
      const total = vendas + servicos + previo;

      const pct = lim > 0 ? Math.min(100, (total / lim) * 100) : 0;
      const periodoTitulo = isMensal
        ? `Mês ${mesStr}`
        : `Ano ${baseDate.getFullYear()}`;

      const html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body { font-family: -apple-system, Roboto, Arial, sans-serif; padding: 24px; color:#111; }
              h1 { font-size: 20px; text-align: center; margin: 0 0 12px 0; }
              h2 { font-size: 16px; margin: 16px 0 8px; }
              .card { border: 1px solid #ececff; background: #f8f8ff; border-radius: 12px; padding: 12px; }
              .row { display: flex; justify-content: space-between; margin: 6px 0; }
              .value { font-weight: 900; }
              .bar { height: 14px; width: 100%; background: #eee; border-radius: 999px; position: relative; margin-top: 8px; }
              .fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 999px; }
              .alert { margin-top: 10px; padding: 8px 10px; border-radius: 10px; font-weight: 900; text-align:center; }
              .muted { color:#666; font-size:12px; text-align:center; margin-top:10px; }
            </style>
          </head>
          <body>
            <h1>Cálculo do Limite MEI</h1>
            <div class="card">
              <h2>${periodoTitulo}</h2>

              <div class="row"><div>Limite ${isMensal ? "mensal" : "anual"}</div><div class="value">${fmt(lim)}</div></div>
              <div class="row"><div>Vendas</div><div class="value">${fmt(vendas)}</div></div>
              <div class="row"><div>Serviços</div><div class="value">${fmt(servicos)}</div></div>
              ${
                !isMensal && previo > 0
                  ? `<div class="row"><div>Prévio no ano</div><div class="value">${fmt(previo)}</div></div>`
                  : ""
              }
              <div class="row"><div><b>Total</b></div><div class="value"><b>${fmt(total)}</b></div></div>
              <div class="row"><div>Restante</div><div class="value">${fmt(Math.max(0, lim - total))}</div></div>
              <div class="row"><div>Percentual usado</div><div class="value">${pct.toFixed(0)}%</div></div>

              <div class="bar">
                <div class="fill" style="width:${pct}%; background:${
                  pct >= 100 ? "#dc2626" : pct >= 80 ? "#f59e0b" : "#10b981"
                };"></div>
              </div>

              ${
                pct >= 100
                  ? `<div class="alert" style="background:#fee2e2;color:#dc2626;">Ultrapassou o limite</div>`
                  : pct >= 80
                    ? `<div class="alert" style="background:#fef3c7;color:#b45309;">Atenção: próximo do limite</div>`
                    : `<div class="alert" style="background:#ecfdf5;color:#047857;">Dentro do limite</div>`
              }

              ${
                limites?.aplicadoCalc
                  ? `<div class="muted">* Limite proporcional aplicado (meses ativos: ${
                      limites?.mesesAtivosCalc ?? "-"
                    }).</div>`
                  : ""
              }
            </div>
          </body>
        </html>
      `;

      const file = await printToFileAsync({ html });
      await shareAsync(file.uri);
    } catch (e) {
      Alert.alert("Erro", String(e?.message || e));
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 24 }}
    >
      <Text style={styles.titulo}>Cálculo do Limite MEI</Text>

      <View style={styles.topButtons}>
        <TouchableOpacity
          style={styles.pillBtn}
          onPress={() => setShowPicker(true)}
        >
          <Text style={styles.pillTxt}>Filtro mensal</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.pillBtn} onPress={askAndPrint}>
          <Text style={styles.pillTxt}>Imprimir PDF</Text>
        </TouchableOpacity>

        <ProporcionalMEIButton
          baseYear={baseDate.getFullYear()}
          autoOpen={!!route?.params?.openMeiProporcional}
          onSaved={() => {
            recarregar();

            const returnTo = route?.params?.returnTo || null;
            if (returnTo) {
              navigation.navigate(returnTo);
            } else if (navigation?.canGoBack?.()) {
              navigation.goBack();
            }
          }}
        />

        <EditarLimitesButton onSaved={() => recarregar()} />

        {/* 🔁 BOTÃO REATIVAR AVISO */}
        <TouchableOpacity
          style={styles.pillBtn}
          onPress={async () => {
            const ok = await reativarPerguntaMei();
            if (ok) {
              Alert.alert(
                "Aviso reativado",
                "O alerta voltará a aparecer ao salvar.",
              );
            } else {
              Alert.alert("Erro", "Não foi possível reativar o aviso.");
            }
          }}
        >
          <Text style={styles.pillTxt}>Reativar aviso</Text>
        </TouchableOpacity>
      </View>

      {showPicker && (
        <DateTimePicker
          value={baseDate}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(e, d) => {
            setShowPicker(false);
            if (d) setBaseDate(new Date(d));
          }}
        />
      )}

      {/* --- MENSAL --- */}
      <View style={styles.card}>
        <Text style={styles.cardTitulo}>Mês de {mesStr}</Text>

        <Linha rotulo="Limite mensal" valor={fmt(limiteMensalUsado)} />
        <Linha rotulo="Vendas do mês" valor={fmt(totalMesVendas)} />
        <Linha rotulo="Serviços do mês" valor={fmt(totalMesServicos)} />
        <Linha rotulo="Total (Vendas + Serviços)" valor={fmt(totalMes)} />

        <Linha
          rotulo="Restante no mês"
          valor={fmt(
            Math.max(0, Number(limiteMensalUsado || 0) - Number(totalMes || 0)),
          )}
        />
        <Linha rotulo="Percentual usado" valor={`${percentMes.toFixed(0)}%`} />

        <View style={styles.progressWrap}>
          <View style={styles.progressBase} />
          <View
            style={[
              styles.progressFill,
              {
                width: `${percentMes}%`,
                backgroundColor:
                  percentMes >= 100
                    ? "#dc2626"
                    : percentMes >= 80
                      ? "#f59e0b"
                      : "#10b981",
              },
            ]}
          />
        </View>

        <View style={[styles.alert, { backgroundColor: statusMes.bg }]}>
          <Text style={[styles.alertTxt, { color: statusMes.cor }]}>
            {statusMes.label}
          </Text>
        </View>
      </View>

      {/* --- ANUAL --- */}
      <View style={styles.card}>
        <Text style={styles.cardTitulo}>
          Acumulado no Ano ({baseDate.getFullYear()})
        </Text>

        <Linha rotulo="Limite anual" valor={fmt(limiteAnualUsado)} />

        {faturamentoPrevioAno > 0 && (
          <Linha
            rotulo="Faturamento prévio no ano"
            valor={fmt(faturamentoPrevioAno)}
          />
        )}

        <Linha rotulo="Vendas no ano" valor={fmt(totalAnoVendas)} />
        <Linha rotulo="Serviços no ano" valor={fmt(totalAnoServicos)} />
        <Linha rotulo="Total (Ano + Prévio)" valor={fmt(totalAnoComPrevio)} />

        <Linha
          rotulo="Restante no ano"
          valor={fmt(
            Math.max(
              0,
              Number(limiteAnualUsado || 0) - Number(totalAnoComPrevio || 0),
            ),
          )}
        />
        <Linha rotulo="Percentual usado" valor={`${percentAno.toFixed(0)}%`} />

        <View style={styles.progressWrap}>
          <View style={styles.progressBase} />
          <View
            style={[
              styles.progressFill,
              {
                width: `${percentAno}%`,
                backgroundColor:
                  percentAno >= 100
                    ? "#dc2626"
                    : percentAno >= 80
                      ? "#f59e0b"
                      : "#10b981",
              },
            ]}
          />
        </View>

        {percentAno >= 80 && percentAno < 100 && (
          <View style={[styles.alert, { backgroundColor: "#fef3c7" }]}>
            <Text style={[styles.alertTxt, { color: "#b45309" }]}>
              Atenção: próximo do limite anual
            </Text>
          </View>
        )}
        {percentAno >= 100 && (
          <View style={[styles.alert, { backgroundColor: "#fee2e2" }]}>
            <Text style={[styles.alertTxt, { color: "#dc2626" }]}>
              Ultrapassou o limite anual
            </Text>
          </View>
        )}

        {limites?.aplicadoCalc && (
          <Text style={styles.obsInline}>
            * Limite proporcional aplicado (meses ativos:{" "}
            {String(limites?.mesesAtivosCalc || "-")}).
          </Text>
        )}
      </View>

      <Text style={styles.obs}>
        Dica: “MEI Proporcional” resolve abertura no meio do ano + faturamento
        anterior. “Editar Limites” é ajuste manual.
      </Text>
    </ScrollView>
  );
}

/* --- estilos --- */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  titulo: {
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 12,
    color: "#111",
  },

  topButtons: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
    marginBottom: 8,
    flexWrap: "wrap",
  },
  pillBtn: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 999,
    backgroundColor: "#fff",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  pillTxt: { fontWeight: "900", color: "#111" },

  card: {
    ...FORM_CARD,
    borderWidth: 1,
    borderColor: "#ececff",
    backgroundColor: "#f8f8ff",
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  cardTitulo: {
    fontWeight: "900",
    fontSize: 16,
    color: "#111",
    marginBottom: 6,
  },

  linha: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  rotulo: { color: "#111" },
  valor: { fontWeight: "900", color: "#111" },

  progressWrap: { marginTop: 8, marginBottom: 6 },
  progressBase: {
    height: 12,
    width: "100%",
    borderRadius: 999,
    backgroundColor: "#eee",
  },
  progressFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 999,
  },

  alert: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  alertTxt: { fontWeight: "900", textAlign: "center" },
  obs: { color: "#666", marginTop: 4, textAlign: "center" },
  obsInline: { color: "#666", marginTop: 8, textAlign: "center", fontSize: 12 },
});
