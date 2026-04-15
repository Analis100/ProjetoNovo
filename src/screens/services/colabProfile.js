// src/screens/services/colabProfile.js
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "@colabPerfil_v1";

/**
 * Salva o perfil de VENDEDOR no aparelho
 * collaboratorId => é o CÓDIGO que você mandou pra ele (o mesmo que aparece na tela)
 * displayName    => só pra mostrar um nome bonitinho na tela Vendas
 */
export async function saveVendorProfile({ collaboratorId, displayName }) {
  if (!collaboratorId) throw new Error("collaboratorId é obrigatório");

  const payload = {
    mode: "vendedor",
    collaboratorId: String(collaboratorId).trim(),
    displayName: displayName ? String(displayName).trim() : null,
    updatedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(KEY, JSON.stringify(payload));
  return payload;
}

export async function getVendorProfile() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.mode !== "vendedor" || !parsed.collaboratorId)
      return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearVendorProfile() {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {}
}

export async function isVendorMode() {
  const p = await getVendorProfile();
  return !!(p && p.mode === "vendedor" && p.collaboratorId);
}
