// services/license.js
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Chaves usadas no AsyncStorage
 */
const K = {
  LICENSE_STATUS: "license.status", // "trial" | "licensed" | "expired"
  TRIAL_START: "license.trialStart", // ISO string
  CODE_SAVED: "license.code", // código ativado
  ALLOWED_CODES: "license.allowed", // lista local de códigos válidos (opcional p/ testes)
};

const TRIAL_DAYS = 2; // ajuste se quiser

/**
 * Utils
 */
function toStartOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function diffDays(a, b) {
  const ms = Math.abs(toStartOfDay(a) - toStartOfDay(b));
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/**
 * Garante que o trial esteja inicializado.
 */
export async function ensureTrial() {
  const trialStart = await AsyncStorage.getItem(K.TRIAL_START);
  if (!trialStart) {
    await AsyncStorage.setItem(K.TRIAL_START, new Date().toISOString());
    await AsyncStorage.setItem(K.LICENSE_STATUS, "trial");
  }
}

/**
 * Retorna o status da licença.
 * { status: "trial" | "licensed" | "expired", daysLeft: number|null }
 */
export async function getLicenseStatus() {
  await ensureTrial();

  const status = (await AsyncStorage.getItem(K.LICENSE_STATUS)) || "trial";

  if (status === "licensed") {
    return { status: "licensed", daysLeft: null };
  }

  const started =
    (await AsyncStorage.getItem(K.TRIAL_START)) || new Date().toISOString();
  const daysPassed = diffDays(started, new Date().toISOString());
  const daysLeft = Math.max(0, TRIAL_DAYS - daysPassed);

  if (daysPassed >= TRIAL_DAYS) {
    await AsyncStorage.setItem(K.LICENSE_STATUS, "expired");
    return { status: "expired", daysLeft: 0 };
  }

  return { status: "trial", daysLeft };
}

/**
 * true se a licença for "licensed".
 * (Trial não conta como licença ativa para aparecer o botão de "Sair / Desativar")
 */
export async function hasActiveLicense() {
  const st = await getLicenseStatus();
  return st.status === "licensed";
}

/**
 * Salva ativação (após validar o código).
 */
export async function saveActivation(code) {
  await AsyncStorage.setItem(K.CODE_SAVED, String(code || "").trim());
  await AsyncStorage.setItem(K.LICENSE_STATUS, "licensed");
}

/**
 * Para testes: permita setar uma lista local de códigos válidos.
 * Ex.: await setAllowedCodes(["ABC123", "DRD-2025-VIP"]);
 */
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

/**
 * Valida o código informado (offline-friendly).
 * Regras:
 *  1) Se houver lista local (ALLOWED_CODES), valida nela.
 *  2) Senão, aceita códigos com 6+ caracteres (placeholder).
 * Substitua pelo check no Firestore quando estiver pronto.
 *
 * Retorno: { ok: boolean, reason?: string }
 */
export async function validateCode(userCode = "") {
  const code = String(userCode || "").trim();

  const allowed = await getAllowedCodes();
  if (allowed.length > 0) {
    const ok = allowed.includes(code);
    return ok
      ? { ok: true }
      : { ok: false, reason: "Código não encontrado na lista local." };
  }

  if (code.length < 6) {
    return {
      ok: false,
      reason: "Código muito curto. Use no mínimo 6 caracteres.",
    };
  }

  // TODO: integrar com servidor/Firebase aqui (quando estiver pronto)
  return { ok: true };
}

/**
 * Desativa a licença do dispositivo e navega para a tela de onboarding/gerenciamento.
 * Usei "GerenciarPlano" como destino, pois ele existe no seu app. Ajuste se quiser outra.
 */
export async function signOutAndGoToOnboarding(navigation) {
  await AsyncStorage.multiRemove([
    K.LICENSE_STATUS,
    K.TRIAL_START,
    K.CODE_SAVED,
    K.ALLOWED_CODES,
  ]);

  // Volta para o fluxo de onboarding/plano
  try {
    navigation.reset({
      index: 0,
      routes: [{ name: "GerenciarPlano" }],
    });
  } catch {
    // fallback caso a rota não exista no momento
    navigation.navigate("GerenciarPlano");
  }
}

/**
 * Utilitário de testes: reseta tudo da licença/trial.
 */
export async function resetLicenseForTests() {
  await AsyncStorage.multiRemove([
    K.LICENSE_STATUS,
    K.TRIAL_START,
    K.CODE_SAVED,
    K.ALLOWED_CODES,
  ]);
}
