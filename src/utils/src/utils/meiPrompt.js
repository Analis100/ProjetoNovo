// src/utils/meiPrompt.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert } from "react-native";

// ✅ UMA ÚNICA CHAVE para Vendas + ReceitaServicos + CalculoLimiteMEI
export const KEY_MEI_PROMPT_STATE = "@drd_mei_prompt_state_v1";

/**
 * state:
 * - step: 0 (nunca mostrou), 1 (já mostrou o 1º), 2 (já mostrou o 2º)
 * - stop: true => nunca mais aparece (porque "não sou MEI" ou "sim")
 * - keepAsking: true => aparece sempre ao salvar (quando respondeu "não" no 2º)
 */
const DEFAULT_STATE = {
  step: 0,
  stop: false,
  keepAsking: false,
};

async function loadState() {
  try {
    const raw = await AsyncStorage.getItem(KEY_MEI_PROMPT_STATE);
    const st = raw ? JSON.parse(raw) : null;
    return { ...DEFAULT_STATE, ...(st || {}) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function saveState(st) {
  await AsyncStorage.setItem(KEY_MEI_PROMPT_STATE, JSON.stringify(st));
}

/**
 * Abre direto a tela/aba do MEI proporcional
 * (ajuste a rota conforme seu app)
 */
function openMeiProporcional(navigation) {
  // ✅ do jeito que você pediu: abre direto
  navigation.navigate("CalculoLimiteMEI", { openMeiProporcional: true });
}

/**
 * Mostra o prompt conforme suas regras.
 * Retorna true se mostrou algum Alert, false se não mostrou.
 */
export async function maybeShowMeiPrompt(navigation) {
  const st = await loadState();

  // 1) Se já “parou pra sempre”
  if (st.stop) return false;

  // 2) Se está no modo “perguntar sempre” (porque respondeu "não" no 2º)
  if (st.keepAsking) {
    return await showSecondPrompt(navigation, st);
  }

  // 3) Fluxo normal: 1º prompt, depois 2º prompt
  if (st.step === 0) {
    return await showFirstPrompt(navigation, st);
  }

  // step >= 1 -> 2º prompt
  return await showSecondPrompt(navigation, st);
}

async function showFirstPrompt(navigation, st) {
  return new Promise((resolve) => {
    Alert.alert(
      "MEI proporcional",
      "Se o MEI foi aberto depois do início do ano o limite anual fica proporcional.\n\nE se começou a usar o app depois de janeiro precisa informar o faturamento anterior.\n\nConfigurar agora?",
      [
        {
          text: "Não sou MEI",
          style: "destructive",
          onPress: async () => {
            await saveState({ ...st, stop: true, keepAsking: false, step: 1 });
            resolve(true);
          },
        },
        {
          text: "Configurar agora",
          onPress: async () => {
            await saveState({ ...st, step: 1 }); // ✅ marcou que já foi a 1ª vez
            openMeiProporcional(navigation);
            resolve(true);
          },
        },
      ],
    );
  });
}

async function showSecondPrompt(navigation, st) {
  return new Promise((resolve) => {
    Alert.alert("MEI proporcional", "Já configurou o MEI?", [
      {
        text: "Não sou MEI",
        style: "destructive",
        onPress: async () => {
          // ✅ para de aparecer para sempre
          await saveState({ ...st, stop: true, keepAsking: false, step: 2 });
          resolve(true);
        },
      },
      {
        text: "Sim",
        onPress: async () => {
          // ✅ para de aparecer para sempre (já configurou)
          await saveState({ ...st, stop: true, keepAsking: false, step: 2 });
          openMeiProporcional(navigation); // ✅ você pediu que "Sim" abre direto
          resolve(true);
        },
      },
      {
        text: "Não",
        onPress: async () => {
          // ✅ continua perguntando sempre a cada salvar
          await saveState({ ...st, step: 2, keepAsking: true, stop: false });
          resolve(true);
        },
      },
    ]);
  });
}

/**
 * Botão "Reativar aviso" usa isso.
 * Deixa como se nunca tivesse mostrado nada.
 */
export async function resetMeiPrompt() {
  await saveState({ ...DEFAULT_STATE });
}
