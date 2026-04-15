// src/screens/services/notifications.js
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";

const IS_EXPO_GO = Constants.appOwnership === "expo";

// projectId vem do app.json → expo.extra.eas.projectId
const PROJECT_ID =
  Constants.expoConfig?.extra?.eas?.projectId ??
  "b1f0b01e-d335-44f3-8fd4-bcf7b7a9239f"; // fallback

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FFFFFF",
    });
  } catch (e) {
    console.log("[notifications] channel error:", e?.message);
  }
}

/**
 * Obtém o token com segurança, sem quebrar a UI.
 * Retorna: { token: string|null, granted: boolean, reason?: string }
 */
export async function getPushTokenSafe({ askPermission = true } = {}) {
  // Em Expo Go, não tenta push remoto (SDK 53+)
  if (IS_EXPO_GO) {
    return { token: null, granted: false, reason: "expo-go" };
  }

  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted" && askPermission) {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    const granted = status === "granted";
    if (!granted) return { token: null, granted: false, reason: "denied" };

    await ensureAndroidChannel();

    const resp = await Notifications.getExpoPushTokenAsync({
      projectId: PROJECT_ID,
    });
    const token = resp?.data ?? null;
    if (!token) return { token: null, granted: true, reason: "no-token" };

    return { token, granted: true };
  } catch (e) {
    return { token: null, granted: false, reason: e?.message || "error" };
  }
}

// Listeners — no-ops no Expo Go
let _receiveSub = null;
let _responseSub = null;

export function initNotificationListeners(onReceive, onResponse) {
  if (IS_EXPO_GO) return;
  _receiveSub = Notifications.addNotificationReceivedListener((n) => {
    try {
      onReceive?.(n);
    } catch {}
  });
  _responseSub = Notifications.addNotificationResponseReceivedListener((r) => {
    try {
      onResponse?.(r);
    } catch {}
  });
}

export function removeNotificationListeners() {
  try {
    _receiveSub?.remove?.();
  } catch {}
  try {
    _responseSub?.remove?.();
  } catch {}
  _receiveSub = null;
  _responseSub = null;
}

// Local notifications (funciona no Expo Go também)
export async function scheduleLocalNotification({ title, body, data } = {}) {
  try {
    await ensureAndroidChannel();
    return await Notifications.scheduleNotificationAsync({
      content: { title, body, data },
      trigger: null,
    });
  } catch (e) {
    console.log("[notifications] local error:", e?.message);
    return null;
  }
}
