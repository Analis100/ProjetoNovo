// src/screens/services/colabSales.js
// Controle de vendas por colaborador + registro detalhado de vendas na nuvem,
// agora isolado por OWNER_ID (empresa).

import {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  serverTimestamp,
  increment,
} from "firebase/firestore";
import { db } from "./firebase";
import { OWNER_ID } from "./configEmpresa";

// 🔑 chave mês, igual usamos na tela Colaboradores
export function monthKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// =========================
//  TOTAIS MENSAIS (colabMonthSales)
// =========================
//
// Estrutura do doc:
// colabMonthSales / {OWNER_ID}_{colabId}_{monthKey} {
//   ownerId, colaboradorId, monthKey,
//   totalCents,
//   updatedAt, resetAt?
// }

function monthDocId(colabId, mk) {
  return `${OWNER_ID}_${colabId || "__sem__"}_${mk}`;
}

// ➕ Soma valor (em centavos) no mês do colaborador
export async function addSaleToCollaborator(
  colabId,
  valorCents,
  when = new Date()
) {
  try {
    const mk = monthKey(when);
    const id = monthDocId(colabId, mk);
    const ref = doc(collection(db, "colabMonthSales"), id);

    await setDoc(
      ref,
      {
        ownerId: OWNER_ID,
        colaboradorId: colabId || null,
        monthKey: mk,
        totalCents: increment(Number(valorCents || 0)),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (e) {
    console.log("addSaleToCollaborator erro:", e);
  }
}

// 🔍 Lê total do mês (em centavos) para um colaborador
export async function getSalesForCollaborator(colabId, mk) {
  try {
    const id = monthDocId(colabId, mk);
    const ref = doc(collection(db, "colabMonthSales"), id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return 0;
    const data = snap.data() || {};
    return Number(data.totalCents || 0);
  } catch (e) {
    console.log("getSalesForCollaborator erro:", e);
    return 0;
  }
}

// ♻️ Zera o total do mês para um colaborador (sem apagar doc)
export async function resetSalesForCollaboratorMonth(colabId, mk) {
  try {
    const id = monthDocId(colabId, mk);
    const ref = doc(collection(db, "colabMonthSales"), id);
    await setDoc(
      ref,
      {
        ownerId: OWNER_ID,
        colaboradorId: colabId || null,
        monthKey: mk,
        totalCents: 0,
        updatedAt: serverTimestamp(),
        resetAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (e) {
    console.log("resetSalesForCollaboratorMonth erro:", e);
  }
}

// =========================
//  VENDAS DETALHADAS (colabVendas)
// =========================
//
// Cada venda manual que você lança na tela Vendas será registrada aqui,
// com ownerId + colaboradorId, pra você ver depois em relatórios.

export async function registerCloudSale(venda) {
  try {
    if (!venda) return;

    const valorNumber = Number(venda.valor || 0);
    const valorCents = Math.round(valorNumber * 100);

    await addDoc(collection(db, "colabVendas"), {
      ownerId: OWNER_ID,
      colaboradorId: venda.colaboradorId || null,
      codigo: venda.codigo || "",
      descricao: venda.descricao || "",
      qtd: Number(venda.qtd || 0),
      valorCents,
      dataISO: venda.dataISO || new Date().toISOString(),
      origem: venda.origem || "manual",
      vendaIdLocal: venda.id || null,
      createdAt: serverTimestamp(),
      // opcional: se depois quisermos deviceId, podemos anexar aqui
      deviceId: venda.deviceId || null,
    });
  } catch (e) {
    console.log("registerCloudSale erro:", e);
  }
}
