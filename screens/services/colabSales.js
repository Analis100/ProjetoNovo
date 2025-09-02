// screens/services/colabSales.js
import AsyncStorage from "@react-native-async-storage/async-storage";

const SALES_KEY = "@vendas_por_colaborador"; // { [colabId]: { "YYYY-MM": cents } }

export const monthKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/**
 * Soma (ou estorna, se negativo) vendas em CENTAVOS para um colaborador no mês da data.
 * @param {string} colabId
 * @param {number} cents - pode ser negativo para estornar
 * @param {Date} date
 */
export async function addSaleToCollaborator(colabId, cents, date = new Date()) {
  if (!colabId || !Number.isFinite(Number(cents))) return;
  const mk = monthKey(date);
  const raw = await AsyncStorage.getItem(SALES_KEY);
  const db = raw ? JSON.parse(raw) : {};
  if (!db[colabId]) db[colabId] = {};
  db[colabId][mk] = Number(db[colabId][mk] || 0) + Number(cents || 0);
  await AsyncStorage.setItem(SALES_KEY, JSON.stringify(db));
}

/**
 * Lê o total de vendas em CENTAVOS para um colaborador em um mês (YYYY-MM).
 * @param {string} colabId
 * @param {string} mk - ex: "2025-08"
 */
export async function getSalesForCollaborator(colabId, mk = monthKey()) {
  const raw = await AsyncStorage.getItem(SALES_KEY);
  const db = raw ? JSON.parse(raw) : {};
  return Number(db?.[colabId]?.[mk] || 0);
}
