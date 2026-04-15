import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert } from "react-native";

/* =========================
   CHAVES
========================= */
const KEY_LIMITS = "@MEI_LIMITS";

// flags do prompt (versão atual)
const KEY_MEI_PROMPT_1X = "@MEI_PROMPT_1X"; // mostrou 1x
const KEY_MEI_PROMPT_DONT_ASK = "@MEI_PROMPT_NO"; // "não sou MEI" definitivo
const KEY_MEI_PROP_DONE = "@MEI_PROP_DONE"; // configurou e salvou proporcional

// flags antigas (para compatibilidade / limpeza)
const KEY_NAO_MEI_STEP_OLD = "@MEI_NAO_STEP"; // "1" / "2" antigo
const KEY_MEI_PROMPT_NO_OLD = "@MEI_PROMPT_NO"; // às vezes igual, mas garante
const KEY_MEI_PROMPT_1X_OLD = "@MEI_PROMPT_1X";

// =========================
// YEAR-MONTH KEY (YYYY-MM)
// =========================
export function yearMonthKey(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`; // ex: 2026-02
}

/* =========================
   CACHE MENSAL (MEI)
   - chave: @MEI_<bucket>_<YYYY-MM>
   - bucket: "venda" | "servicos" | etc
========================= */
function monthCacheKey(bucket, ym) {
  const b = String(bucket || "").trim();
  const m = String(ym || "").trim();
  return `@MEI_${b}_${m}`; // ex: @MEI_venda_2026-02
}

export async function loadMonthList(bucket, ym) {
  try {
    const key = monthCacheKey(bucket, ym);
    const raw = await AsyncStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.log("[MEI] loadMonthList falhou:", e?.message || e);
    return [];
  }
}

export async function saveMonthList(bucket, list, ym) {
  try {
    const key = monthCacheKey(bucket, ym);
    const arr = Array.isArray(list) ? list : [];
    await AsyncStorage.setItem(key, JSON.stringify(arr));
    return true;
  } catch (e) {
    console.log("[MEI] saveMonthList falhou:", e?.message || e);
    return false;
  }
}

// =========================
// MONEY (usado por Compras/Vendas)
// =========================
export function brMoney(v) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });
}

/* =========================
   LIMITES
========================= */
export async function getLimits() {
  try {
    const raw = await AsyncStorage.getItem(KEY_LIMITS);
    const parsed = raw ? JSON.parse(raw) : null;

    const anual = Number(parsed?.anual ?? 81000) || 81000;
    const mensal = Number(parsed?.mensal ?? anual / 12) || anual / 12;
    const avisos = parsed?.avisos !== false;

    return { ...(parsed || {}), anual, mensal, avisos };
  } catch {
    return { anual: 81000, mensal: 81000 / 12, avisos: true };
  }
}

export async function setLimits(next = {}) {
  const current = await getLimits();
  const merged = {
    ...current,
    ...next,
    anual: Number(next?.anual ?? current.anual ?? 81000) || 81000,
  };
  merged.mensal =
    Number(next?.mensal ?? current.mensal ?? merged.anual / 12) ||
    merged.anual / 12;

  merged.avisos = merged?.avisos !== false;

  await AsyncStorage.setItem(KEY_LIMITS, JSON.stringify(merged));
  return merged;
}

export async function setAvisosMEI(flag) {
  const current = await getLimits();
  const merged = {
    ...current,
    avisos: !!flag,
    updatedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(KEY_LIMITS, JSON.stringify(merged));
  return merged;
}

/* =========================
   CONFIGURADO?
   - mínimo: inicioAtividadeISO OU flag done
========================= */
export async function isMeiProporcionalConfigured() {
  try {
    const lim = await getLimits();
    const done = (await AsyncStorage.getItem(KEY_MEI_PROP_DONE)) === "1";
    console.log("[MEI] isConfigured?", {
      inicioAtividadeISO: lim?.inicioAtividadeISO,
      done,
    });
    return !!lim?.inicioAtividadeISO || done;
  } catch {
    return false;
  }
}

/* =========================
   MARCAR CONCLUÍDO (chame ao salvar no CalculoLimiteMEI)
========================= */
export async function marcarMeiPromptConcluido() {
  try {
    await AsyncStorage.setItem(KEY_MEI_PROP_DONE, "1");
    // ao concluir, pode limpar o "mostrou 1x" para não confundir
    await AsyncStorage.removeItem(KEY_MEI_PROMPT_1X);
    await AsyncStorage.removeItem(KEY_NAO_MEI_STEP_OLD);
    return true;
  } catch {
    return false;
  }
}

/* =========================
   REATIVAR PERGUNTA MEI (zera tudo)
========================= */
export async function reativarPerguntaMei() {
  try {
    // 1) Zera flags do prompt (novo + compat antigo)
    await AsyncStorage.multiRemove([
      KEY_MEI_PROMPT_1X,
      KEY_MEI_PROMPT_DONT_ASK,
      KEY_MEI_PROP_DONE,

      // compat: versões antigas
      KEY_NAO_MEI_STEP_OLD,
      KEY_MEI_PROMPT_NO_OLD,
      KEY_MEI_PROMPT_1X_OLD,
    ]);

    // 2) ✅ Zera também a configuração proporcional dentro do @MEI_LIMITS
    //    (sem mexer nos limites anual/mensal/avisos)
    try {
      const raw = await AsyncStorage.getItem(KEY_LIMITS);
      const parsed = raw ? JSON.parse(raw) : {};
      const cleaned = { ...(parsed || {}) };

      delete cleaned.inicioAtividadeISO;

      delete cleaned.faturamentoPrevioAno;
      delete cleaned.faturamentoPrevioAnoYear;

      delete cleaned.calcYear;
      delete cleaned.anualCalc;
      delete cleaned.mensalCalc;
      delete cleaned.mesesAtivosCalc;
      delete cleaned.aplicadoCalc;

      cleaned.updatedAt = new Date().toISOString();

      await AsyncStorage.setItem(KEY_LIMITS, JSON.stringify(cleaned));
    } catch (e) {
      console.log(
        "[MEI] Falha ao limpar config proporcional:",
        e?.message || e,
      );
    }

    return true;
  } catch (e) {
    console.log("Erro ao reativarPerguntaMei:", e);
    return false;
  }
}

/* =========================
   PROMPT 2x (com compat antigo)
========================= */
export async function exigirConfigMeiProporcional({ navigation, origem }) {
  // 0) se já configurou, não pergunta
  const ok = await isMeiProporcionalConfigured();
  if (ok) return true;

  // 1) se marcou "não sou MEI" definitivo (novo OU antigo), não pergunta
  try {
    const noNovo = await AsyncStorage.getItem(KEY_MEI_PROMPT_DONT_ASK);
    if (noNovo === "1") return true;

    const noOldStep = await AsyncStorage.getItem(KEY_NAO_MEI_STEP_OLD);
    if (noOldStep === "2") return true;
  } catch {}

  // 2) controle do fluxo 2x
  let shown1x = false;
  let stageOld = null;

  try {
    shown1x = (await AsyncStorage.getItem(KEY_MEI_PROMPT_1X)) === "1";
    stageOld = await AsyncStorage.getItem(KEY_NAO_MEI_STEP_OLD);
  } catch {}

  const shouldAskSecond = shown1x || stageOld === "1";

  const goConfig = () => {
    navigation.navigate("CalculoLimiteMEI", {
      openMeiProporcional: true,
      returnTo: origem,
    });
  };

  if (!shouldAskSecond) {
    // 1ª VEZ
    return await new Promise((resolve) => {
      Alert.alert(
        "MEI proporcional",
        "Se o MEI foi aberto depois do início do ano o limite anual fica proporcional.\n\nE se começou a usar o app depois de janeiro precisa informar o faturamento anterior.\n\nConfigurar agora?",
        [
          {
            text: "Não sou MEI",
            style: "destructive",
            onPress: async () => {
              try {
                await AsyncStorage.setItem(KEY_MEI_PROMPT_DONT_ASK, "1");
                await AsyncStorage.setItem(KEY_NAO_MEI_STEP_OLD, "2");
                await AsyncStorage.setItem(KEY_MEI_PROMPT_1X, "1");
              } catch {}
              resolve(true);
            },
          },
          {
            text: "Configurar agora",
            onPress: async () => {
              try {
                await AsyncStorage.setItem(KEY_MEI_PROMPT_1X, "1");
                await AsyncStorage.setItem(KEY_NAO_MEI_STEP_OLD, "1");
              } catch {}
              goConfig();
              resolve(false);
            },
          },
        ],
      );
    });
  }

  // 2ª VEZ (e repetições)
  return await new Promise((resolve) => {
    Alert.alert("MEI proporcional", "Já configurou o MEI?", [
      {
        text: "Não sou MEI",
        style: "destructive",
        onPress: async () => {
          try {
            await AsyncStorage.setItem(KEY_MEI_PROMPT_DONT_ASK, "1");
            await AsyncStorage.setItem(KEY_NAO_MEI_STEP_OLD, "2");
          } catch {}
          resolve(true);
        },
      },
      {
        text: "Configurar agora",
        onPress: async () => {
          try {
            await AsyncStorage.setItem(KEY_MEI_PROMPT_1X, "1");
            await AsyncStorage.setItem(KEY_NAO_MEI_STEP_OLD, "1");
          } catch {}
          goConfig();
          resolve(false);
        },
      },
      {
        text: "Sim",
        onPress: async () => {
          try {
            await AsyncStorage.setItem(KEY_MEI_PROP_DONE, "1");
            await AsyncStorage.removeItem(KEY_MEI_PROMPT_1X);
          } catch {}
          goConfig(); // abre a tela também
          resolve(false);
        },
      },
      {
        text: "Não",
        onPress: async () => {
          try {
            await AsyncStorage.setItem(KEY_MEI_PROMPT_1X, "1");
            await AsyncStorage.setItem(KEY_NAO_MEI_STEP_OLD, "1");
            await AsyncStorage.removeItem(KEY_MEI_PROP_DONE);
          } catch {}
          resolve(true);
        },
      },
    ]);
  });
}
