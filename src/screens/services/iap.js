// screens/services/iap.js
import { Platform } from "react-native";
import Constants from "expo-constants";

export const SKU_NORMAL = Platform.select({
  android: "plano_individual",
  ios: "plano_individual",
});
export const SKU_DESCONTO = Platform.select({
  android: "plano_individual_desconto",
  ios: "plano_individual_desconto",
});

let IAP = null;
let IAP_SUPPORTED = Constants.appOwnership !== "expo"; // 👈 NUNCA tente importar no Expo Go

async function loadIAP() {
  if (!IAP_SUPPORTED) return null; // 👈 curto-circuito no Expo Go
  if (IAP) return IAP;
  try {
    const mod = await import("expo-in-app-purchases"); // só em Dev Client/Standalone
    if (!mod?.connectAsync) throw new Error("IAP module not ready");
    IAP = mod;
    return IAP;
  } catch {
    IAP_SUPPORTED = false;
    return null;
  }
}

export function isIapAvailable() {
  return IAP_SUPPORTED;
}
export async function iapConnect() {
  const M = await loadIAP();
  if (!M) return;
  return M.connectAsync();
}
export async function iapDisconnect() {
  const M = await loadIAP();
  if (!M) return;
  return M.disconnectAsync();
}
export async function iapGetCatalog(skus = [SKU_NORMAL, SKU_DESCONTO]) {
  const M = await loadIAP();
  if (!M) return [];
  const { responseCode, results } = await M.getProductsAsync(skus);
  return responseCode === M.IAPResponseCode.OK ? results || [] : [];
}
export async function iapPurchase(sku) {
  const M = await loadIAP();
  if (!M) throw new Error("IAP not available");
  return M.purchaseItemAsync(sku);
}
export async function iapFinish(p, consume = true) {
  const M = await loadIAP();
  if (!M) return;
  try {
    await M.finishTransactionAsync(p, consume);
  } catch {}
}
export function setIapListener(handler) {
  let sub = { remove: () => {} };
  loadIAP()
    .then((M) => {
      if (M) sub = M.setPurchaseListener(handler);
    })
    .catch(() => {});
  return { remove: () => sub?.remove && sub.remove() };
}
