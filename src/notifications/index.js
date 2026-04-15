// src/notifications/index.js
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { isExpoGo } from "../env"; // 👈 novo

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function safeRegisterPushToken() {
  // 👉 No Expo Go (SDK 53) não há push remoto
  if (isExpoGo) {
    console.log("Expo Go: pulando registro de push remoto (SDK 53).");
    return null;
  }

  if (!Device.isDevice) {
    console.log("Push notifications requerem dispositivo físico.");
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") {
    console.log("Permissão de notificações negada.");
    return null;
  }

  let token = null;
  try {
    token = (await Notifications.getExpoPushTokenAsync()).data;
  } catch (e) {
    console.warn("Falha ao obter Expo push token:", e?.message || e);
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }

  return token;
}

// Mantém sua função de notificação local
export async function showLocalNotificationAsync({ title, body, data } = {}) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title: title ?? "Aviso", body: body ?? "", data: data ?? {} },
      trigger: null,
    });
    return true;
  } catch (e) {
    console.warn("Erro ao mostrar notificação local:", e?.message || e);
    return false;
  }
}

export default { safeRegisterPushToken, showLocalNotificationAsync };
