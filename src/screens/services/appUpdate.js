import { Platform, Linking } from "react-native";
import Constants from "expo-constants";
import { BASE_URL } from "./config";
import { compareVersions } from "../utils/versioning";

export function getInstalledVersion() {
  return (
    Constants.expoConfig?.version ||
    Constants.manifest2?.extra?.expoClient?.version ||
    "0.0.0"
  );
}

export async function fetchUpdateConfig() {
  const resp = await fetch(`${BASE_URL}/app-version`, {
    headers: { Accept: "application/json" },
  });

  if (!resp.ok) {
    throw new Error(`Falha ao consultar versão (${resp.status})`);
  }

  return await resp.json();
}

export async function checkForAppUpdate() {
  const installedVersion = getInstalledVersion();
  const remote = await fetchUpdateConfig();

  const latestVersion = remote?.latestVersion || installedVersion;
  const minVersion = remote?.minVersion || installedVersion;
  const force = remote?.force === true;
  const message =
    remote?.message || "Há uma nova versão disponível para atualização.";

  const storeUrl =
    Platform.OS === "ios" ? remote?.updateUrlIos : remote?.updateUrlAndroid;

  const hasUpdate = compareVersions(latestVersion, installedVersion) === 1;
  const mustUpdate = compareVersions(minVersion, installedVersion) === 1;

  return {
    installedVersion,
    latestVersion,
    minVersion,
    hasUpdate,
    mustUpdate: force || mustUpdate,
    force: force || mustUpdate,
    message,
    storeUrl,
  };
}

export async function openStoreUpdate(url) {
  if (!url) throw new Error("Link da loja não configurado.");
  const supported = await Linking.canOpenURL(url);
  if (!supported) throw new Error("Não foi possível abrir a loja.");
  await Linking.openURL(url);
}
