import Constants from "expo-constants";
import { Alert, Linking, Platform } from "react-native";
import { BASE_URL } from "./config";

function compareVersions(v1, v2) {
  const a = v1.split(".").map(Number);
  const b = v2.split(".").map(Number);

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function checkAppVersion() {
  try {
    const res = await fetch(`${BASE_URL}/app-version`);
    const data = await res.json();

    const appVersion = Constants.expoConfig.version;

    if (compareVersions(appVersion, data.minVersion) < 0 || data.force) {
      Alert.alert(
        "Atualização obrigatória",
        data.message,
        [
          {
            text: "Atualizar",
            onPress: () =>
              Linking.openURL(
                Platform.OS === "ios"
                  ? data.updateUrlIos
                  : data.updateUrlAndroid,
              ),
          },
        ],
        { cancelable: false },
      );
      return;
    }

    if (compareVersions(appVersion, data.latestVersion) < 0) {
      Alert.alert("Nova versão disponível", data.message, [
        { text: "Depois" },
        {
          text: "Atualizar",
          onPress: () =>
            Linking.openURL(
              Platform.OS === "ios" ? data.updateUrlIos : data.updateUrlAndroid,
            ),
        },
      ]);
    }
  } catch (err) {
    console.log("Erro ao verificar versão:", err);
  }
}
