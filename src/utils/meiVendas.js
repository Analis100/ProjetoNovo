// src/utils/meiVendas.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadMonthList, saveMonthList, yearMonthKey } from "./mei";

function ymFromISO(iso) {
  const d = iso ? new Date(iso) : new Date();
  return yearMonthKey(d);
}

function safeArr(x) {
  return Array.isArray(x) ? x : [];
}

// ✅ bucket do cache = "venda" (singular)
const BUCKET = "venda";

// =========================
//  REMOVE POR ID (ANTI-FANTASMA)
// =========================
export async function removeFromMonthCacheByVenda(lanc) {
  try {
    const id = String(lanc?.id ?? "").trim();
    if (!id) return;

    const mesesParaTentar = [];

    if (lanc?.dataISO) mesesParaTentar.push(ymFromISO(lanc.dataISO));

    // fallback: mês atual e anterior (compat)
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    mesesParaTentar.push(yearMonthKey(now));
    mesesParaTentar.push(yearMonthKey(prev));

    const unique = [];
    for (const ym of mesesParaTentar) {
      if (!unique.includes(ym)) unique.push(ym);
    }

    for (const ym of unique) {
      const lista = safeArr(await loadMonthList(BUCKET, ym));
      const nova = lista.filter((x) => String(x?.id) !== id);
      if (nova.length !== lista.length) {
        await saveMonthList(BUCKET, nova, ym);
      }
    }
  } catch (e) {
    console.log("[MEI] remove venda cache falhou:", e?.message || e);
  }
}

// =========================
//  REBUILD (ANTI-FANTASMA)
// =========================
// ✅ Reconstrói o mês que você quiser (o CalculoLimiteMEI geralmente trabalha com refDate)
export async function rebuildVendaCacheMes(VENDAS_KEY, refDateISO = null) {
  try {
    const ym = refDateISO ? ymFromISO(refDateISO) : yearMonthKey(new Date());

    const raw = await AsyncStorage.getItem(VENDAS_KEY); // ex: "venda"
    const all = raw ? JSON.parse(raw) : [];
    const arrAll = safeArr(all);

    const doMes = arrAll.filter((x) => {
      const iso = x?.dataISO;
      if (!iso) return false;
      return yearMonthKey(new Date(iso)) === ym;
    });

    // ✅ anti-duplicação no rebuild
    const seen = new Set();
    const lista = [];
    for (const v of doMes) {
      const id = String(v?.id ?? "").trim();
      const dataISO = String(v?.dataISO ?? "").trim();
      if (!id || !dataISO) continue;
      if (seen.has(id)) continue;
      seen.add(id);

      lista.push({
        id,
        dataISO,
        descricao: String(v?.descricao ?? ""),
        valorNumber: Number(v?.valor ?? 0),
      });
    }

    await saveMonthList(BUCKET, lista, ym);
    return true;
  } catch (e) {
    console.log("[MEI] rebuild venda falhou:", e?.message || e);
    return false;
  }
}

// ✅ compat: mantém seu nome antigo chamando o novo
export async function rebuildVendaCacheMesAtual(VENDAS_KEY) {
  return rebuildVendaCacheMes(VENDAS_KEY, null);
}
