// services/referral.js
import { db } from "./firebase";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
  runTransaction,
  updateDoc,
  increment,
} from "firebase/firestore";
import { getApp } from "firebase/app";

/** Util: ver em logs qual projeto Firebase este app está usando */
export function getFirebaseProjectInfo() {
  try {
    const app = getApp();
    return {
      projectId: app.options?.projectId || null,
      appId: app.options?.appId || null,
      apiKey: app.options?.apiKey ? "***" : null,
    };
  } catch {
    return { projectId: null, appId: null, apiKey: null };
  }
}

/** Normaliza o código (trim + uppercase) */
function norm(code) {
  return (code || "").trim().toUpperCase();
}

/** Verifica se o código existe e está ativo (e não estourou maxUses) */
export async function verifyReferralCode(code) {
  const c = norm(code);
  if (!c) return null;

  // DEBUG útil p/ iOS vs Android: ver no console qual projeto está sendo consultado
  const info = getFirebaseProjectInfo();
  console.log("Referral.verify on project:", info.projectId);

  const ref = doc(db, "referralCodes", c);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const data = snap.data() || {};
  if (data.active === false) return null;

  // Se houver maxUses e já atingiu, invalida
  const uses = typeof data.uses === "number" ? data.uses : 0;
  const max = typeof data.maxUses === "number" ? data.maxUses : null;
  if (typeof max === "number" && uses >= max) return null;

  // defaults para evitar undefined no app
  const discountPercent =
    typeof data.discountPercent === "number" ? data.discountPercent : 10;
  const commissionPercent =
    typeof data.commissionPercent === "number" ? data.commissionPercent : 10;

  return {
    id: snap.id,
    ...data,
    uses,
    discountPercent,
    commissionPercent,
  };
}

/**
 * Cria uma "reserva" do uso do código (status: reserved).
 * Passe os percentuais lidos do documento para registrar junto ao claim.
 */
export async function reserveReferralClaim(
  code,
  { userUid, plan = null, discountPercent = 10, commissionPercent = 10 }
) {
  const c = norm(code);
  if (!c) throw new Error("Código vazio.");

  const codeRef = doc(db, "referralCodes", c);
  const claimRef = collection(codeRef, "claims");

  return addDoc(claimRef, {
    userUid: userUid || "offline-uid",
    plan,
    status: "reserved",
    discountPercent,
    commissionPercent,
    createdAt: serverTimestamp(),
    completedAt: null,
  });
}

/**
 * Conclui a indicação após a compra/ativação:
 * - marca claim como completed
 * - incrementa uses e atualiza lastUseAt
 * - opcionalmente desativa se maxUses foi atingido
 */
export async function completeReferralClaim(
  code,
  claimId,
  { plan, purchaseSku = null, purchaseId = null }
) {
  const c = norm(code);
  if (!c || !claimId) throw new Error("Parâmetros inválidos.");

  const codeRef = doc(db, "referralCodes", c);
  const claimDoc = doc(db, "referralCodes", c, "claims", claimId);

  await runTransaction(db, async (trx) => {
    const codeSnap = await trx.get(codeRef);
    if (!codeSnap.exists()) throw new Error("Código inexistente.");
    const codeData = codeSnap.data() || {};

    trx.update(claimDoc, {
      status: "completed",
      plan: plan || null,
      purchaseSku,
      purchaseId,
      completedAt: serverTimestamp(),
    });

    const currentUses = typeof codeData.uses === "number" ? codeData.uses : 0;
    trx.update(codeRef, {
      uses: increment(1),
      lastUseAt: serverTimestamp(),
    });

    const max = typeof codeData.maxUses === "number" ? codeData.maxUses : null;
    if (typeof max === "number" && currentUses + 1 >= max) {
      trx.update(codeRef, { active: false });
    }
  });
}

/** Cancela a reserva (quando a compra falha/é abortada) */
export async function cancelReferralClaim(code, claimId) {
  const c = norm(code);
  if (!c || !claimId) return;

  const claimDoc = doc(db, "referralCodes", c, "claims", claimId);
  await updateDoc(claimDoc, { status: "cancelled" });
}
