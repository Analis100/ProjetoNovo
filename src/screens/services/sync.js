// screens/services/sync.js
import { getPlanoAtual, PLANOS, getContextoEmpresa } from "./planos.js";

// Carrega Firebase só se existir, sem a análise estática do Metro
async function loadFirebaseIfAvailable() {
  try {
    // evita que o Metro tente resolver no build
    // eslint-disable-next-line no-eval
    const req = eval("require");
    const authMod = req("@react-native-firebase/auth");
    const fsMod = req("@react-native-firebase/firestore");
    const auth = authMod?.default ?? authMod;
    const firestore = fsMod?.default ?? fsMod;
    return { auth, firestore };
  } catch {
    return { auth: null, firestore: null }; // pacotes não instalados
  }
}

export async function syncAdicionar(docPath, payload) {
  try {
    const plano = await getPlanoAtual();
    if (plano !== PLANOS.COLABORADORES) return;

    const { auth, firestore } = await loadFirebaseIfAvailable();
    if (!auth || !firestore) return;

    const { empresaId, papel } = await getContextoEmpresa();
    const user = auth()?.currentUser;
    if (!user || !empresaId) return;

    const coll = firestore()
      .collection("empresa")
      .doc(empresaId)
      .collection("colaboradores")
      .doc(user.uid)
      .collection(docPath); // "vendas" | "despesas" | "vendasPrazo" | "estoque"

    const data = {
      ...payload,
      createdAt: firestore.FieldValue.serverTimestamp(),
      papel: papel || "colaborador",
    };

    await coll.add(data);
  } catch {
    // silencioso
  }
}
