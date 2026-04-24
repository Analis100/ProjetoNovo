// services/license.js
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Chaves usadas no AsyncStorage
 */
const K = {
  // Licença / período inicial
  LICENSE_STATUS: "license.status", // "trial" | "licensed" | "expired"
  TRIAL_START: "license.trialStart", // ISO string
  CODE_SAVED: "license.code", // código ativado
  ALLOWED_CODES: "license.allowed", // lista local de códigos válidos

  // Plano
  PLAN_SELECTED: "plan.selected", // { tier, period, paidAt, updatedAt }
};

const TRIAL_DAYS = 3;
const PERIOD_DAYS = { mensal: 30, anual: 365 };

function toStartOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function diffDays(a, b) {
  const ms = Math.abs(toStartOfDay(a) - toStartOfDay(b));
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function isValidPlanObject(plan) {
  if (!plan || typeof plan !== "object") return false;
  if (!plan.tier || !plan.period) return false;
  return true;
}

/* ===== Período inicial ===== */
export async function ensureTrial() {
  const currentStatus = await AsyncStorage.getItem(K.LICENSE_STATUS);

  // se já está licenciado, não mexe
  if (currentStatus === "licensed") return;

  // não cria mais trial local automaticamente
  // o servidor é quem decide trial/licença
}

export async function getLicenseStatus() {
  await ensureTrial();

  const rawStatus = await AsyncStorage.getItem(K.LICENSE_STATUS);
  const status = rawStatus || "expired";

  if (status === "licensed") {
    const plan = await getPlan();
    if (isValidPlanObject(plan)) {
      return { status: "licensed", daysLeft: null };
    }

    await AsyncStorage.setItem(K.LICENSE_STATUS, "expired");
    return { status: "expired", daysLeft: 0 };
  }

  if (status === "trial") {
    const started = await AsyncStorage.getItem(K.TRIAL_START);

    if (!started) {
      await AsyncStorage.setItem(K.LICENSE_STATUS, "expired");
      return { status: "expired", daysLeft: 0 };
    }

    const daysPassed = diffDays(started, new Date().toISOString());
    const daysLeft = Math.max(0, TRIAL_DAYS - daysPassed);

    if (daysPassed >= TRIAL_DAYS) {
      await AsyncStorage.setItem(K.LICENSE_STATUS, "expired");
      return { status: "expired", daysLeft: 0 };
    }

    return { status: "trial", daysLeft };
  }

  return { status: "expired", daysLeft: 0 };
}

export async function hasActiveLicense() {
  const st = await getLicenseStatus();

  if (st.status === "licensed") {
    const plan = await getPlan();
    return isValidPlanObject(plan);
  }

  if (st.status === "trial") {
    return true;
  }

  return false;
}

export async function saveActivation(code) {
  await AsyncStorage.setItem(K.CODE_SAVED, String(code || "").trim());
  await AsyncStorage.setItem(K.LICENSE_STATUS, "licensed");
}

export async function setAllowedCodes(codes = []) {
  await AsyncStorage.setItem(K.ALLOWED_CODES, JSON.stringify(codes));
}

async function getAllowedCodes() {
  try {
    const raw = await AsyncStorage.getItem(K.ALLOWED_CODES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function validateCode(userCode = "") {
  const code = String(userCode || "").trim();
  const allowed = await getAllowedCodes();

  if (allowed.length > 0) {
    const ok = allowed.includes(code);
    return ok ? { ok: true } : { ok: false, reason: "Código não localizado." };
  }

  if (code.length < 6) {
    return {
      ok: false,
      reason: "Informe um código com no mínimo 6 caracteres.",
    };
  }

  return { ok: true }; // TODO: validar com servidor/Firebase
}

export async function signOutAndGoToOnboarding(navigation) {
  await AsyncStorage.multiRemove([
    K.LICENSE_STATUS,
    K.TRIAL_START,
    K.CODE_SAVED,
    K.ALLOWED_CODES,
    K.PLAN_SELECTED,
  ]);

  try {
    navigation.reset({ index: 0, routes: [{ name: "GerenciarPlanoScreen" }] });
  } catch {
    navigation.navigate?.("GerenciarPlanoScreen");
  }
}

export async function resetLicenseForTests() {
  await AsyncStorage.multiRemove([
    K.LICENSE_STATUS,
    K.TRIAL_START,
    K.CODE_SAVED,
    K.ALLOWED_CODES,
    K.PLAN_SELECTED,
  ]);
}

/* ===== Plano escolhido ===== */

export async function setPlan({ tier, period, paidAt = Date.now() }) {
  if (!tier || !period) throw new Error("Parâmetros inválidos em setPlan");

  const payload = { tier, period, paidAt, updatedAt: Date.now() };
  await AsyncStorage.setItem(K.PLAN_SELECTED, JSON.stringify(payload));
  await AsyncStorage.setItem(K.LICENSE_STATUS, "licensed");

  return payload;
}

export async function getPlan() {
  try {
    const raw = await AsyncStorage.getItem(K.PLAN_SELECTED);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return isValidPlanObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearPlan() {
  await AsyncStorage.removeItem(K.PLAN_SELECTED);

  // ao limpar plano, volta para trial se ainda estiver dentro do prazo;
  // senão, expira
  const trialStart = await AsyncStorage.getItem(K.TRIAL_START);

  if (trialStart) {
    const daysPassed = diffDays(trialStart, new Date().toISOString());
    if (daysPassed < TRIAL_DAYS) {
      await AsyncStorage.setItem(K.LICENSE_STATUS, "trial");
      return;
    }
  }

  await AsyncStorage.setItem(K.LICENSE_STATUS, "expired");
}

export async function isAnual() {
  const p = await getPlan();
  return p?.period === "anual";
}

export async function getTier() {
  const p = await getPlan();
  return p?.tier ?? null;
}

/* ===== Vencimento / Estado de Renovação ===== */

export async function getSubscriptionState() {
  const plan = await getPlan();
  if (!plan?.period || !plan?.paidAt) {
    return { state: "ok", daysToDue: null, overdueDays: null, dueDate: null };
  }

  const periodDays = PERIOD_DAYS[plan.period] ?? 30;
  const paid = toStartOfDay(new Date(plan.paidAt));
  const dueDate = new Date(paid);
  dueDate.setDate(dueDate.getDate() + periodDays);

  const today = toStartOfDay(new Date());
  const msDiff = today.getTime() - dueDate.getTime();
  const overdueDays = Math.floor(msDiff / (1000 * 60 * 60 * 24));
  const daysToDue = Math.floor(
    (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  let state = "ok";
  if (daysToDue === 1) state = "warn";
  if (overdueDays === 1) state = "grace1";
  if (overdueDays >= 2) state = "blocked";

  return {
    state,
    daysToDue,
    overdueDays,
    dueDate: dueDate.toISOString(),
    period: plan.period,
  };
}
