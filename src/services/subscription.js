import { BASE_URL, DEFAULT_PLAN } from "./config";

import * as WebBrowser from "expo-web-browser";
import { AppState, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { getDeviceId } from "../utils/deviceId";

/** Tabela de planos */
const PLAN_MAP = {
  IND_MENSAL: {
    title: "DRD Mensal",
    amount: 39.9,
    tier: "INDIVIDUAL",
    period: "mensal",
  },
  IND_ANUAL: {
    title: "DRD Anual",
    amount: 478.8,
    tier: "INDIVIDUAL",
    period: "anual",
  },
  COL_MENSAL: {
    title: "DRD Colaboradores Mensal",
    amount: 49.9,
    tier: "COLABORADORES",
    period: "mensal",
  },
  COL_ANUAL: {
    title: "DRD Colaboradores Anual",
    amount: 598.8,
    tier: "COLABORADORES",
    period: "anual",
  },
};

function pickPlan(planId) {
  return (
    PLAN_MAP[planId] || {
      title: `DRD ${DEFAULT_PLAN.period}`,
      amount: DEFAULT_PLAN.price,
      tier: DEFAULT_PLAN.tier,
      period: DEFAULT_PLAN.period,
    }
  );
}

function normalizeDeviceId(value) {
  if (typeof value === "string") return value.trim();
  return String(value || "").trim();
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function resolveDeviceId(deviceId) {
  const resolved = normalizeDeviceId(deviceId || (await getDeviceId()));

  if (!resolved) {
    throw new Error(
      "Não foi possível identificar este aparelho. Feche e abra o app novamente.",
    );
  }

  return resolved;
}

async function jsonOrThrow(resp) {
  const text = await resp.text().catch(() => "");

  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    console.log("[subscription] resposta inválida:", text);
    throw new Error("Resposta inválida do servidor");
  }

  if (!resp.ok) {
    throw new Error(
      data?.error || data?.message || data?.hint || `HTTP ${resp.status}`,
    );
  }

  if (data?.ok === false) {
    throw new Error(data?.error || data?.message || "Falha na operação");
  }

  return data;
}

/**
 * Pagamento único (Checkout Pro)
 * Usa planId como fonte principal.
 */
export async function getCheckoutUrl(
  planId,
  payerEmail,
  deviceId,
  referralCode,
) {
  const plan = pickPlan(planId);
  const realDeviceId = await resolveDeviceId(deviceId);

  const qs = new URLSearchParams({
    planId: String(planId || ""),
    title: String(plan.title || ""),
    amount: String(plan.amount || ""),
    deviceId: realDeviceId,
  });

  if (payerEmail && String(payerEmail).trim()) {
    qs.set("payer_email", String(payerEmail).trim());
  }

  if (referralCode && String(referralCode).trim()) {
    qs.set("referralCode", String(referralCode).trim().toUpperCase());
  }

  console.log("[getCheckoutUrl] BASE_URL =", BASE_URL);
  console.log("[getCheckoutUrl] planId =", planId);
  console.log("[getCheckoutUrl] payerEmail =", payerEmail);
  console.log("[getCheckoutUrl] deviceId =", realDeviceId);
  console.log(
    "[getCheckoutUrl] URL =",
    `${BASE_URL}/assinaturas/checkout-url?${qs.toString()}`,
  );

  const resp = await fetch(
    `${BASE_URL}/assinaturas/checkout-url?${qs.toString()}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Device-Id": realDeviceId,
      },
    },
  );

  const data = await jsonOrThrow(resp);

  console.log("[getCheckoutUrl] resposta =", data);

  return data?.init_point || null;
}

/**
 * Assinatura recorrente (preapproval)
 * Alinhada com o server.js: envia planId ou tier+period.
 */
export async function createPreapproval({
  payerEmail,
  deviceId,
  tier,
  period,
  amount,
  backUrl,
  planId,
  referralCode,
} = {}) {
  const realDeviceId = await resolveDeviceId(deviceId);
  const plan = pickPlan(planId);

  const finalTier = tier || plan.tier || DEFAULT_PLAN.tier;
  const finalPeriod = period || plan.period || DEFAULT_PLAN.period;
  const finalAmount =
    typeof amount === "number" && !Number.isNaN(amount)
      ? amount
      : plan.amount || DEFAULT_PLAN.price;

  const body = {
    reason: "Assinatura DRD",
    back_url: backUrl || `${BASE_URL}/retorno`,
    deviceId: realDeviceId,
    tier: finalTier,
    period: finalPeriod,
    planId: planId || undefined,
  };

  if (payerEmail && String(payerEmail).trim()) {
    body.payer_email = String(payerEmail).trim();
  }

  if (referralCode && String(referralCode).trim()) {
    body.referralCode = String(referralCode).trim().toUpperCase();
  }

  // Mantido por compatibilidade, embora o backend resolva pelo plano
  if (typeof finalAmount === "number") {
    body.amount = finalAmount;
  }

  const resp = await fetch(`${BASE_URL}/assinaturas/preapproval`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Device-Id": realDeviceId,
    },
    body: JSON.stringify(body),
  });

  const data = await jsonOrThrow(resp);

  return data?.preapproval?.init_point || data?.init_point || null;
}

/**
 * Status da assinatura/licença
 */
export async function getSubscriptionStatus(deviceId) {
  const realDeviceId = await resolveDeviceId(deviceId);

  const url = `${BASE_URL}/assinaturas/status?deviceId=${encodeURIComponent(
    realDeviceId,
  )}`;

  const resp = await fetchWithTimeout(
    url,
    {
      headers: {
        Accept: "application/json",
        "X-Device-Id": realDeviceId,
      },
    },
    5000,
  );
  const data = await jsonOrThrow(resp);

  const active =
    data?.access?.active === true || data?.access?.allowed === true;

  const status = data?.license?.status ?? null;
  const nextChargeAt =
    data?.license?.nextChargeAt ?? data?.license?.next_charge_at ?? null;

  return {
    ...data,
    active,
    status,
    next_charge_at: nextChargeAt,
    nextChargeAt,
  };
}

/** Atalho normalizado */
export async function getAccess(deviceId) {
  const data = await getSubscriptionStatus(deviceId);

  const allowed =
    data?.access?.allowed === true ||
    data?.access?.active === true ||
    data?.active === true;

  return {
    allowed,
    active: allowed,
    license: data?.license || null,
    tier: data?.license?.tier || data?.tier || null,
    period: data?.license?.period || data?.period || null,
    raw: data,
  };
}

/** Polling até autorizar */
export async function waitForAuthorized({
  deviceId,
  timeoutMs = 180000,
  intervalMs = 3500,
} = {}) {
  const realDeviceId = await resolveDeviceId(deviceId);
  const t0 = Date.now();

  while (Date.now() - t0 < timeoutMs) {
    try {
      const { allowed } = await getAccess(realDeviceId);
      if (allowed) return true;
    } catch (e) {
      // segue tentando até o timeout
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return false;
}

/** Abre o Checkout Pro no navegador */
export async function openCheckoutPro({
  planId,
  payerEmail,
  referralCode,
} = {}) {
  try {
    const deviceId = await resolveDeviceId();

    const url = await getCheckoutUrl(
      planId,
      payerEmail,
      deviceId,
      referralCode,
    );
    console.log("[openCheckoutPro] checkout url =", url);

    if (!url) {
      Alert.alert("Falha", "Não recebi a URL do checkout.");
      return { ok: false };
    }

    await AsyncStorage.multiSet([
      ["@drd:needs_status_refresh", "1"],
      ["@drd:last_device_id", deviceId],
      ["@drd:last_plan_id", String(planId || "")],
    ]);

    const res = await WebBrowser.openBrowserAsync(url, {
      enableDefaultShareMenuItem: false,
      showTitle: true,
    });

    console.log("[openCheckoutPro] browser result =", res);

    return { ok: true, result: res };
  } catch (e) {
    if (__DEV__) {
      console.log("Erro openCheckoutPro:", e);
    }
    Alert.alert("Erro", e?.message || "Falha ao abrir o checkout.");
    return { ok: false, error: e?.message };
  }
}

/** Abre o preapproval no navegador */
export async function openPreapprovalCheckout({
  payerEmail,
  deviceId,
  tier,
  period,
  amount,
  backUrl,
  planId,
  referralCode,
} = {}) {
  try {
    const realDeviceId = await resolveDeviceId(deviceId);

    const url = await createPreapproval({
      payerEmail,
      deviceId: realDeviceId,
      tier,
      period,
      amount,
      backUrl,
      planId,
      referralCode,
    });

    if (!url) {
      Alert.alert("Falha", "Não recebi a URL do preapproval.");
      return { ok: false };
    }

    await AsyncStorage.multiSet([
      ["@drd:needs_status_refresh", "1"],
      ["@drd:last_device_id", realDeviceId],
      ["@drd:last_plan_id", String(planId || "")],
    ]);

    const res = await WebBrowser.openBrowserAsync(url, {
      enableDefaultShareMenuItem: false,
      showTitle: true,
    });

    return { ok: true, result: res };
  } catch (e) {
    if (__DEV__) {
      console.log("Erro openPreapprovalCheckout:", e);
    }
    Alert.alert(
      "Erro",
      e?.message || "Falha ao abrir a assinatura recorrente.",
    );
    return { ok: false, error: e?.message };
  }
}

/** Watcher: quando o app volta para active, revalida status */
let _appStateSub = null;

export function watchAppStateForStatus(onChange) {
  if (_appStateSub) return _appStateSub;

  _appStateSub = AppState.addEventListener("change", async (state) => {
    if (state !== "active") return;

    try {
      const needs = await AsyncStorage.getItem("@drd:needs_status_refresh");
      if (!needs) return;

      await AsyncStorage.removeItem("@drd:needs_status_refresh");

      const lastDeviceId = await AsyncStorage.getItem("@drd:last_device_id");
      const data = await getSubscriptionStatus(lastDeviceId || undefined);

      onChange?.(data);
    } catch (e) {
      if (__DEV__) {
        console.log("[subscription] erro ao revalidar status:", e);
      }
    }
  });

  return _appStateSub;
}

export function unwatchAppStateForStatus() {
  if (_appStateSub?.remove) _appStateSub.remove();
  _appStateSub = null;
}
