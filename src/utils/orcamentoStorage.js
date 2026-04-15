// utils/orcamentoStorage.js
import AsyncStorage from "@react-native-async-storage/async-storage";

export const KEY_ORC_ATUAL = "@orcamento_atual";
export const KEY_ORC_LIMPAR = "@orcamento_limpar_pendente";

// chama ao FINAL do "Salvar Orçamento"
export async function marcarLimpezaPendente() {
  await AsyncStorage.setItem(KEY_ORC_LIMPAR, "1");
}

// chama na tela de Orçamento ao focar
export async function consumirLimpezaPendente() {
  const flag = await AsyncStorage.getItem(KEY_ORC_LIMPAR);
  if (flag === "1") {
    // limpa o rascunho atual e o gatilho
    await AsyncStorage.multiRemove([KEY_ORC_ATUAL, KEY_ORC_LIMPAR]);
    return true;
  }
  return false;
}

// opcional: limpar tudo na marra (botão "Novo orçamento")
export async function limparOrcamentoAtualAgora() {
  await AsyncStorage.multiRemove([KEY_ORC_ATUAL, KEY_ORC_LIMPAR]);
}
