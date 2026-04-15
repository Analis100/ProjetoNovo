// src/utils/meiServicos.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadMonthList, saveMonthList, yearMonthKey } from "./mei";

function ymFromISO(iso) {
  const d = iso ? new Date(iso) : new Date();
  return yearMonthKey(d);
}

function safeArr(x) {
  return Array.isArray(x) ? x : [];
}

// =========================
//  CACHE MENSAL - SERVIÇOS
// =========================
export async function addToMonthCacheFromServico(lanc) {
  try {
    const id = String(lanc?.id ?? "").trim();
    const dataISO = String(lanc?.dataISO ?? "").trim();

    if (!id || !dataISO) return;

    const ym = ymFromISO(dataISO);
    const lista = safeArr(await loadMonthList("servicos", ym));

    // ✅ anti-duplicação (evita travar limite por item repetido)
    const jaExiste = lista.some((x) => String(x?.id) === id);
    if (jaExiste) return;

    lista.push({
      id,
      dataISO,
      descricao: String(lanc?.descricao ?? ""),
      valorNumber: Number(lanc?.valor ?? 0),
      // opcional: marca origem para debug
      origem: "ReceitaServicos",
    });

    await saveMonthList("servicos", lista, ym);
  } catch (e) {
    console.log("[MEI] add servico cache falhou:", e?.message || e);
  }
}

/**
 * Remove do cache por id (preferindo o mês do dataISO).
 * Mantém fallback para mês atual e anterior, mas evita regravar se não mudou.
 */
export async function removeFromMonthCacheByServico(lanc) {
  try {
    const id = String(lanc?.id ?? "").trim();
    if (!id) return;

    const mesesParaTentar = [];

    if (lanc?.dataISO) {
      mesesParaTentar.push(ymFromISO(lanc.dataISO));
    }

    // fallback: mês atual e anterior (caso dataISO tenha mudado em versões antigas)
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    mesesParaTentar.push(yearMonthKey(now));
    mesesParaTentar.push(yearMonthKey(prev));

    // remove duplicados mantendo ordem
    const unique = [];
    for (const ym of mesesParaTentar) {
      if (!unique.includes(ym)) unique.push(ym);
    }

    for (const ym of unique) {
      const lista = safeArr(await loadMonthList("servicos", ym));
      const nova = lista.filter((x) => String(x?.id) !== id);

      // ✅ só grava se mudou (menos chance de corrida/overwrite)
      if (nova.length !== lista.length) {
        await saveMonthList("servicos", nova, ym);
      }
    }
  } catch (e) {
    console.log("[MEI] remove servico cache falhou:", e?.message || e);
  }
}

// =========================
//  REBUILD (ANTI-FANTASMA)
// =========================
// ✅ Agora aceita refDateISO/ym para reconstruir o mês que o CalculoLimiteMEI está vendo.
export async function rebuildServicoCacheMes(KEY_SERVICOS, refDateISO = null) {
  try {
    const ym = refDateISO ? ymFromISO(refDateISO) : yearMonthKey(new Date());

    const raw = await AsyncStorage.getItem(KEY_SERVICOS);
    const all = raw ? JSON.parse(raw) : [];
    const arrAll = safeArr(all);

    const doMes = arrAll.filter((x) => {
      const iso = x?.dataISO;
      if (!iso) return false;
      return yearMonthKey(new Date(iso)) === ym;
    });

    // ✅ anti-duplicação no rebuild também
    const seen = new Set();
    const lista = [];
    for (const s of doMes) {
      const id = String(s?.id ?? "").trim();
      const dataISO = String(s?.dataISO ?? "").trim();
      if (!id || !dataISO) continue;
      if (seen.has(id)) continue;
      seen.add(id);

      lista.push({
        id,
        dataISO,
        descricao: String(s?.descricao ?? ""),
        valorNumber: Number(s?.valor ?? 0),
        origem: "ReceitaServicos",
      });
    }

    await saveMonthList("servicos", lista, ym);
    return true;
  } catch (e) {
    console.log("[MEI] rebuild servicos falhou:", e?.message || e);
    return false;
  }
}

// ✅ Mantém compat com seu nome antigo, mas redireciona pro novo
export async function rebuildServicoCacheMesAtual(KEY_SERVICOS) {
  return rebuildServicoCacheMes(KEY_SERVICOS, null);
}
