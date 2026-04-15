// src/utils/deviceId.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";

const KEY = "@drd:device_id";

export async function getDeviceId() {
  try {
    let id = await AsyncStorage.getItem(KEY);

    if (!id) {
      id = uuidv4();
      await AsyncStorage.setItem(KEY, id);
    }

    return id;
  } catch (e) {
    console.error("Erro ao obter deviceId:", e);
    throw new Error("Não foi possível obter o deviceId");
  }
}
