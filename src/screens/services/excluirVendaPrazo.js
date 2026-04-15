// src/screens/services/excluirVendaPrazo.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import { addSaleToCollaborator } from "./colabSales";

/* ===== ESTOQUE (estorno por custoTotal salvo) ===== */
async function getEstoqueItem(codigo) {
  const js = await AsyncStorage.getItem("estoque");
  const lista = js ? JSON.parse(js) : [];
  const idx = lista.findIndex((p) => String(p.codigo) === String(codigo));
  return { lista, idx };
}

function toNumberBRLLoose(v) {
  if (typeof v === "number") return v;
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  const n = s
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const f = parseFloat(n);
  return isNaN(f) ? 0 : f;
}

async function estornarEstoquePorCusto(codigo, quantidade, custoTotal) {
  const { lista, idx } = await getEstoqueItem(codigo);
  if (idx < 0) return { ok: false, reason: "codigo_nao_encontrado" };

  const it = lista[idx];
  const qtd = Number(quantidade || 0);
  if (qtd <= 0) return { ok: false, reason: "qtd_invalida" };

  // devolve quantidade: reduz saída
  it.saida = Math.max(0, (Number(it.saida) || 0) - qtd);

  // devolve valorTotal pelo custoTotal guardado (se tiver)
  const custo = Number(custoTotal || 0);
  if (custo > 0) {
    it.valorTotal = toNumberBRLLoose(it.valorTotal || 0) + custo;
  }

  lista[idx] = it;
  await AsyncStorage.setItem("estoque", JSON.stringify(lista));
  return { ok: true };
}

/* ===== remove da key "venda" ===== */
const VENDAS_PRIMARY = "venda";

function toISOFromPtBr(ddmmyyyy) {
  try {
    const [dd, mm, yyyy] = String(ddmmyyyy || "")
      .split("/")
      .map((x) => parseInt(x, 10));
    if (!dd || !mm || !yyyy) return new Date().toISOString();
    return new Date(yyyy, mm - 1, dd, 12, 0, 0).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

async function removerVendaPrazoDaKeyVenda({ vendaPrazoId, nomeCliente }) {
  try {
    const raw = await AsyncStorage.getItem(VENDAS_PRIMARY);
    const arr = raw ? JSON.parse(raw) : [];
    const lista = Array.isArray(arr) ? arr : [];

    const id = String(vendaPrazoId || "").trim();
    const nome = String(nomeCliente || "")
      .trim()
      .toLowerCase();

    let removed = null;

    const next = lista.filter((v) => {
      const origem = String(v?.origem || "")
        .trim()
        .toLowerCase();

      // ✅ considera "prazo" e também variações (se algum arquivo salvou diferente)
      const ehPrazo =
        origem === "prazo" ||
        origem === "venda a prazo" ||
        origem.includes("prazo");

      if (!ehPrazo) return true;

      // ✅ remove por ID (preferido)
      if (id && String(v?.vendaPrazoId || "").trim() === id) {
        removed = removed || v;
        return false;
      }

      // ✅ fallback 1: tenta por campos de cliente (se existirem)
      if (!id && nome) {
        const c1 = String(v?.cliente || "")
          .trim()
          .toLowerCase();
        const c2 = String(v?.clienteNome || "")
          .trim()
          .toLowerCase();
        const c3 = String(v?.nomeCliente || "")
          .trim()
          .toLowerCase();
        if (c1 === nome || c2 === nome || c3 === nome) {
          removed = removed || v;
          return false;
        }
      }

      // ✅ fallback 2: tenta por descrição (case-insensitive)
      if (!id && nome) {
        const d = String(v?.descricao || "").toLowerCase();
        // cobre "Venda a prazo - NOME", "Venda a Prazo - NOME" etc.
        if (d.includes("venda") && d.includes("prazo") && d.includes(nome)) {
          removed = removed || v;
          return false;
        }
      }

      return true;
    });

    if (next.length !== lista.length) {
      await AsyncStorage.setItem(VENDAS_PRIMARY, JSON.stringify(next));
    }

    return removed;
  } catch (e) {
    console.log("removerVendaPrazoDaKeyVenda erro:", e?.message || e);
    return null;
  }
}

/* ===== helper: tenta achar um vendaPrazoId salvo ===== */
function inferVendaPrazoIdDoCliente(nome, objCliente) {
  try {
    const ficha = objCliente?.ficha || {};
    const parcelas = objCliente?.parcelas || [];

    // 1) se a ficha tiver
    const a =
      ficha?.vendaPrazoId ||
      ficha?.idVendaPrazo ||
      ficha?.vendaId ||
      ficha?.idVenda ||
      null;
    if (a) return String(a);

    // 2) se alguma parcela tiver
    const p = (parcelas || []).find((x) => x?.vendaPrazoId || x?.idVendaPrazo);
    const b = p?.vendaPrazoId || p?.idVendaPrazo || null;
    if (b) return String(b);

    // 3) última tentativa: nada
    return "";
  } catch {
    return "";
  }
}

/**
 * EXCLUIR cliente/venda a prazo com estorno (compatível com RelacaoClientes)
 *
 * Regras:
 * - Se existir parcela paga:
 *    - por padrão NÃO exclui e retorna { ok:false, reason:"tem_parcela_paga" }
 *    - se opts.allowIfPaid === true: exclui, mas NÃO estorna
 * - Se NÃO existir parcela paga:
 *    - estorna (se houver dados) e exclui
 */
export async function excluirClientePrazoComEstorno(nomeCliente, opts = {}) {
  const allowIfPaid = !!opts.allowIfPaid;

  const nome = String(nomeCliente || "").trim();
  if (!nome) return { ok: false, reason: "nome_vazio" };

  const json = await AsyncStorage.getItem("clientesPrazo");
  const obj = json ? JSON.parse(json) : {};
  if (!obj?.[nome]) return { ok: false, reason: "nao_encontrado" };

  const clienteObj = obj[nome] || {};
  const parcelas = clienteObj?.parcelas || [];
  const temPaga = (parcelas || []).some((p) => p?.pago === true);

  // ✅ se tem paga e não autorizou, só avisa pra UI abrir o prompt
  if (temPaga && !allowIfPaid) {
    return { ok: false, reason: "tem_parcela_paga" };
  }

  const bloquearEstorno = temPaga === true;

  // ✅ tenta inferir o ID para remover em Vendas
  const vendaPrazoId = inferVendaPrazoIdDoCliente(nome, clienteObj);

  // ✅ Remove da key "venda" SEMPRE (mesmo se tem paga),
  // mas estornos só acontecem se não tiver paga
  const removedVenda = await removerVendaPrazoDaKeyVenda({
    vendaPrazoId,
    nomeCliente: nome,
  });

  const removedFromVendas = !!removedVenda;

  // ✅ ESTORNO (somente se não tiver parcela paga)
  let estornoFeito = false;
  if (!bloquearEstorno) {
    try {
      const ficha = clienteObj?.ficha || {};
      const jaBaixou = ficha?.estoquePrazoBaixado === true;

      if (jaBaixou) {
        const cod = String(
          ficha.estoquePrazoCodigo || ficha.codigoProduto || "",
        ).trim();

        const qtd = Number(
          ficha.estoquePrazoQtd || ficha.quantidadeVendida || 0,
        );

        const custoTotal = Number(ficha.estoquePrazoCustoTotal || 0);

        if (cod && qtd > 0) {
          const ret = await estornarEstoquePorCusto(cod, qtd, custoTotal);
          estornoFeito = ret?.ok === true;
        }
      }
    } catch (e) {
      console.log("Estorno estoque (Excluir Cliente) erro:", e?.message || e);
    }
  }

  // ✅ ESTORNO NO COLABORADOR (somente se não tiver parcela paga)
  // Prioridade: usa a venda REAL removida da key "venda" (se existir),
  // senão cai para a ficha.
  if (!bloquearEstorno) {
    try {
      let colabId = null;
      let valorVenda = 0;
      let whenISO = null;

      if (removedVenda) {
        colabId =
          removedVenda?.colaboradorId ||
          removedVenda?.colabId ||
          removedVenda?.collaboratorId ||
          null;

        valorVenda =
          Number(
            removedVenda?.valor ??
              removedVenda?.valorTotal ??
              removedVenda?.valorNumber ??
              0,
          ) || 0;

        whenISO =
          (removedVenda?.dataISO &&
            String(removedVenda.dataISO).includes("T") &&
            removedVenda.dataISO) ||
          new Date().toISOString();
      } else {
        const ficha = clienteObj?.ficha || {};
        colabId =
          ficha?.colaboradorId ||
          ficha?.collaboratorId ||
          clienteObj?.colaboradorId ||
          clienteObj?.collaboratorId ||
          null;

        valorVenda =
          Number(
            ficha?.valorTotal ?? ficha?.valor ?? ficha?.valorNumber ?? 0,
          ) || 0;

        whenISO =
          (ficha?.dataISO &&
            String(ficha.dataISO).includes("T") &&
            ficha.dataISO) ||
          (ficha?.dataVenda
            ? toISOFromPtBr(ficha.dataVenda)
            : new Date().toISOString());
      }

      if (colabId && valorVenda > 0) {
        await addSaleToCollaborator(
          String(colabId),
          -Math.round(valorVenda * 100),
          new Date(whenISO),
        );
      }
    } catch (e) {
      console.log(
        "Estorno colaborador (Excluir Cliente Prazo) erro:",
        e?.message || e,
      );
    }
  }

  // ✅ Exclui clientePrazo (pode excluir com paga se allowIfPaid=true)
  try {
    delete obj[nome];
    await AsyncStorage.setItem("clientesPrazo", JSON.stringify(obj));
  } catch (e) {
    console.log("Excluir clientePrazo erro:", e?.message || e);
    return { ok: false, reason: "falha_salvar" };
  }

  return {
    ok: true,
    hadPaid: temPaga,
    estornoFeito: bloquearEstorno ? false : estornoFeito,
    removedFromVendas,
    removedVendaId: removedVenda?.id || removedVenda?.vendaPrazoId || null,
    removedVenda: removedVenda || null,
  };
}
