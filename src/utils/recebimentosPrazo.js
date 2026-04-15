// src/utils/recebimentosPrazo.js
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "recebimentosPrazo";

// dd/mm/aaaa -> Date
const parsePtBRDate = (pt) => {
  try {
    const s = String(pt || "").trim();
    const [dd, mm, yyyy] = s.split("/").map((x) => parseInt(x, 10));
    if (!dd || !mm || !yyyy) return null;
    const dt = new Date(yyyy, mm - 1, dd, 0, 0, 0, 0);
    return isNaN(dt) ? null : dt;
  } catch {
    return null;
  }
};

const isSameDay = (d1, d2) =>
  d1.getDate() === d2.getDate() &&
  d1.getMonth() === d2.getMonth() &&
  d1.getFullYear() === d2.getFullYear();

const safeJSON = (raw, fallback) => {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

export async function getRecebimentosPrazoTotalDia(hojePtOrDate) {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const arr = safeJSON(raw, []);
    const lista = Array.isArray(arr) ? arr : [];

    const ref =
      hojePtOrDate instanceof Date ? hojePtOrDate : parsePtBRDate(hojePtOrDate);

    if (!ref) return 0;

    let soma = 0;

    for (const r of lista) {
      const pagoEm = r?.pagoEm;
      if (!pagoEm) continue;

      const d = new Date(pagoEm);
      if (isNaN(d)) continue;

      if (!isSameDay(d, ref)) continue;

      soma += Number(r?.valor || 0);
    }

    return soma;
  } catch {
    return 0;
  }
}
