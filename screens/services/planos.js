// services/planos.js
import AsyncStorage from "@react-native-async-storage/async-storage";

export const PLANOS = {
  INDIVIDUAL: "INDIVIDUAL",
  COLABORADORES: "COLABORADORES",
};

export const PRECO = {
  INDIVIDUAL: "R$ 34,90/mês",
  COLABORADORES: "R$ 49,90/mês",
};

const STORAGE_KEYS = {
  planoAtual: "@drd/planoAtual",
  trialStart: "@drd/trialStart",
  empresaId: "@drd/empresaId",
  papel: "@drd/papel", // "proprietario" | "colaborador"
};

export async function getPlanoAtual() {
  return (await AsyncStorage.getItem(STORAGE_KEYS.planoAtual)) || null;
}
export async function setPlanoAtual(plano) {
  await AsyncStorage.setItem(STORAGE_KEYS.planoAtual, plano);
}
export async function iniciarTrialSeNecessario() {
  const existing = await AsyncStorage.getItem(STORAGE_KEYS.trialStart);
  if (!existing) {
    await AsyncStorage.setItem(STORAGE_KEYS.trialStart, Date.now().toString());
  }
}
export async function trialAtivo() {
  const ts = await AsyncStorage.getItem(STORAGE_KEYS.trialStart);
  if (!ts) return false;
  const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
  return Date.now() - Number(ts) < TWO_DAYS;
}
export async function definirEmpresaEPerfil(empresaId, papel) {
  if (empresaId) await AsyncStorage.setItem(STORAGE_KEYS.empresaId, empresaId);
  if (papel) await AsyncStorage.setItem(STORAGE_KEYS.papel, papel);
}
export async function limparVinculoNuvemLocal() {
  await AsyncStorage.multiRemove(["idEmpresa", "perfil"]);
}

export async function trocarParaIndividualLocal() {
  await setPlanoAtual(PLANOS.INDIVIDUAL);
  await definirEmpresaEPerfil("local-only", "proprietario");
  await AsyncStorage.multiSet([
    ["planoAtual", PLANOS.INDIVIDUAL],
    ["idEmpresa", "local-only"],
    ["perfil", "proprietario"],
  ]);
}

export async function trocarParaColaboradoresLocal(idEmpresa, papel) {
  await setPlanoAtual(PLANOS.COLABORADORES);
  await definirEmpresaEPerfil(idEmpresa, papel);
  await AsyncStorage.multiSet([
    ["planoAtual", PLANOS.COLABORADORES],
    ["idEmpresa", idEmpresa],
    ["perfil", papel],
  ]);
}
export async function getContextoEmpresa() {
  const [empresaId, papel] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEYS.empresaId),
    AsyncStorage.getItem(STORAGE_KEYS.papel),
  ]);
  return { empresaId, papel };
}
export async function verificarAcessoLiberado() {
  const plano = await getPlanoAtual();
  if (plano) return true;
  return trialAtivo();
}
