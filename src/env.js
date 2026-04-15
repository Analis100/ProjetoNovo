import Constants from "expo-constants";

export function getOwnership() {
  try {
    const fromConstants = Constants?.appOwnership ?? null; // 'expo' | 'guest' | 'standalone'
    if (fromConstants) return fromConstants;
    const fromExtra =
      Constants?.expoConfig?.extra?.appOwnership ??
      Constants?.manifest2?.extra?.appOwnership ??
      null;
    return fromExtra ?? null;
  } catch {
    return null;
  }
}

export const isExpoGo = getOwnership() === "expo";
export const isDevClient = getOwnership() === "guest";
export const isStandalone = getOwnership() === "standalone";

export default { isExpoGo, isDevClient, isStandalone, getOwnership };
