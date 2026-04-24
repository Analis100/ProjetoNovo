/**
 * ⚠️ LEGADO (NÃO UTILIZAR)
 *
 * Este arquivo foi substituído pelo sistema de licença em:
 * → src/services/license.js
 *
 * Mantido apenas por segurança / histórico.
 *
 * ⚠️ NÃO IMPORTAR este arquivo em novas telas
 */
// src/utils/checkTrial.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDeviceId } from "./deviceId"; // 👈 agora o deviceId vem daqui

// ⚠️ Troque aqui se quiser outro prazo padrão
export const TRIAL_DAYS_DEFAULT = 3;

// troquei a chave para v3 para não conflitar com dados antigos
const KEY = "@drd:trial:v3";

const DAY = 24 * 60 * 60 * 1000;
const now = () => Date.now();
const addDays = (ts, days) => ts + days * DAY;

async function read() {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function write(obj) {
  await AsyncStorage.setItem(KEY, JSON.stringify(obj));
  return obj;
}

/**
 * Cria ou estende o trial para `days` dias.
 * - Se não existir, começa agora (startedAt=agora, endAt=agora+days).
 * - Se existir e estiver EXPIRADO, reinicia por `days`.
 * - Se existir e ainda estiver ativo:
 *     - Se `days` for maior que o salvo anteriormente, estende o endAt.
 *     - Caso contrário, mantém as datas atuais.
 */
export async function startOrExtendTrial(days = TRIAL_DAYS_DEFAULT) {
  const deviceId = await getDeviceId(); // 👈 pega/cria o deviceId atual

  const t = (await read()) || {};
  const startedAt = Number(t.startedAt) || now();
  const savedDays = Number(t.days || 0);
  const baseDays = Math.max(savedDays, Number(days));
  const currentEndAt = Number(t.endAt) || addDays(startedAt, baseDays);

  // Se já expirou, reinicia agora por baseDays
  if (now() > currentEndAt) {
    const s = now();
    return write({
      startedAt: s,
      endAt: addDays(s, baseDays),
      days: baseDays,
      deviceId, // 👈 salva o deviceId usado
    });
  }

  // Ainda ativo: estende se o novo prazo for maior
  const extendedEnd = addDays(startedAt, baseDays);
  const endAt = extendedEnd > currentEndAt ? extendedEnd : currentEndAt;

  return write({
    startedAt,
    endAt,
    days: baseDays,
    deviceId, // 👈 mantém atualizado
  });
}

/**
 * Retorna true se o trial estiver ativo. Garante criação/renovação automática.
 */
export async function isTrialActive(days = TRIAL_DAYS_DEFAULT) {
  const info = await startOrExtendTrial(days);
  return now() <= info.endAt;
}

/**
 * Dias restantes (inteiros, arredondando pra cima).
 * Se ainda não existir trial, cria um agora com o prazo padrão.
 */
export async function trialDaysRemaining() {
  // se não houver trial salvo, cria um agora
  const info = (await read()) || (await startOrExtendTrial());
  const ms = info.endAt - now();
  return Math.max(0, Math.ceil(ms / DAY));
}

/**
 * Retorna o objeto salvo do trial (startedAt, endAt, days, deviceId).
 */
export async function getTrialInfo() {
  return (await read()) || null;
}

/**
 * (Opcional, só para desenvolvimento) Reseta o trial.
 * Use com cuidado; você pode chamar isso num botão escondido de debug.
 */
export async function resetTrialDev() {
  if (__DEV__) {
    await AsyncStorage.removeItem(KEY);
    return true;
  }
  return false;
}
