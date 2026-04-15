// screens/ListaCredores.js
import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialIcons } from "@expo/vector-icons";

const PLACEHOLDER = "#777";

const fmtBRL = (n) =>
  Number(n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const toArray = (x) =>
  Array.isArray(x) ? x : x && typeof x === "object" ? Object.values(x) : [];

const parseBRDate = (s) => {
  if (!s) return null;
  const [d, m, y] = String(s).split("/").map(Number);
  if (!d || !m || !y) return null;
  const dt = new Date(y, m - 1, d);
  return isNaN(dt) ? null : dt;
};

const hojeBR = () => new Date().toLocaleDateString("pt-BR");

/* ==== CAPITAL DE GIRO (para pagar parcelas de compras) ==== */
const CAPITAL_KEY = "capitalGiroResumo";

async function loadCapitalResumo() {
  try {
    const raw = await AsyncStorage.getItem(CAPITAL_KEY);
    if (!raw) {
      return { entrada: 0, saida: 0, saldo: 0 };
    }
    const obj = JSON.parse(raw);
    return {
      entrada: Number(obj.entrada || 0),
      saida: Number(obj.saida || 0),
      saldo: Number(obj.saldo || 0),
    };
  } catch {
    return { entrada: 0, saida: 0, saldo: 0 };
  }
}

async function salvarCapitalResumo(resumo) {
  await AsyncStorage.setItem(CAPITAL_KEY, JSON.stringify(resumo));
}

/** Registra uma SAÍDA (parcela de compra paga com Capital de Giro) */
async function registrarSaidaCapital(valor) {
  if (!(valor > 0)) return;
  const atual = await loadCapitalResumo();
  const novo = {
    entrada: atual.entrada,
    saida: atual.saida + valor,
    saldo: atual.saldo - valor,
  };
  await salvarCapitalResumo(novo);
}

/* ==== DESPESAS (baixa automática) ==== */
const DESPESAS_KEY = "despesas";

const makeDespesaItem = ({ metaId, credor, parcela }) => ({
  id: metaId,
  descricao: `Parcela ${parcela.numero} - ${credor}`,
  valor: Number(parcela.valor || 0),
  data: hojeBR(),
  // se veio de COMPRA_PRAZO, marca bem claro
  origem:
    parcela?.origem === "COMPRA_PRAZO"
      ? "Parcela de Compras"
      : "Contas a Pagar",
  metaId,
});

const loadDespesas = async () => {
  try {
    const raw = await AsyncStorage.getItem(DESPESAS_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return parsed;
    }

    // Migração automática do formato antigo { "dd/mm/aaaa": [itens] } para array
    if (parsed && typeof parsed === "object") {
      const convertido = Object.values(parsed).flatMap((valor) =>
        Array.isArray(valor) ? valor : [],
      );
      return convertido;
    }

    return [];
  } catch (e) {
    console.warn("Erro ao carregar despesas:", e);
    return [];
  }
};

const saveDespesas = async (lista) => {
  try {
    await AsyncStorage.setItem(DESPESAS_KEY, JSON.stringify(lista));
  } catch (e) {
    console.warn("Erro ao salvar despesas:", e);
    throw e;
  }
};

const addDespesa = async ({ credor, parcela }) => {
  try {
    const metaId = `conta:${credor}:${parcela.id}`;
    const item = makeDespesaItem({ metaId, credor, parcela });
    const dados = await loadDespesas();

    const jaExiste = dados.some(
      (d) =>
        String(d?.metaId) === String(metaId) ||
        String(d?.id) === String(metaId),
    );

    if (!jaExiste) {
      dados.push(item);
      await saveDespesas(dados);
    }
  } catch (e) {
    console.warn("Erro ao adicionar despesa automática:", e);
    throw e;
  }
};

/* ==== Resumo por credor/lote ==== */
const proximoVencimento = (parcelas) => {
  const lista = toArray(parcelas);
  if (!lista.length) return { dataStr: "-", dataObj: null, abertas: 0, qtd: 0 };

  const pendentes = lista.filter((p) => !p.pago);
  const candidatas = pendentes.length ? pendentes : lista;

  const comDatas = candidatas
    .map((p) => ({ p, dt: parseBRDate(p.vencimento) }))
    .filter((x) => x.dt);

  comDatas.sort((a, b) => a.dt - b.dt);

  return {
    dataStr: comDatas.length ? comDatas[0].p.vencimento : "-",
    dataObj: comDatas.length ? comDatas[0].dt : null,
    abertas: pendentes.length,
    qtd: lista.length,
  };
};

/* Seleciona a próxima parcela pendente (por data; fallback por número) */
const pickNextUnpaid = (parcelas) => {
  const pend = toArray(parcelas).filter((p) => !p.pago);
  if (!pend.length) return null;
  const comDatas = pend.map((p) => ({
    p,
    dt: parseBRDate(p.vencimento) || null,
  }));
  comDatas.sort((a, b) => {
    const ta = a.dt ? a.dt.getTime() : Number.MAX_SAFE_INTEGER;
    const tb = b.dt ? b.dt.getTime() : Number.MAX_SAFE_INTEGER;
    if (ta !== tb) return ta - tb;
    return (a.p?.numero || 0) - (b.p?.numero || 0);
  });
  return comDatas[0].p;
};

/* Descobre o número da parcela mesmo se não existir campo .numero */
const descobrirNumeroParcela = (todasParcelas, parcelaAlvo) => {
  if (parcelaAlvo?.numero) return parcelaAlvo.numero;

  const byNumero = [...toArray(todasParcelas)].sort(
    (a, b) => (a?.numero || 0) - (b?.numero || 0),
  );

  // tenta por id
  let idx = -1;
  if (parcelaAlvo?.id) {
    idx = byNumero.findIndex((p) => p?.id === parcelaAlvo.id);
  }
  // fallback por referência/igualdade rasa
  if (idx < 0) {
    idx = byNumero.findIndex((p) => p === parcelaAlvo);
  }
  return idx >= 0 ? idx + 1 : "-";
};

export default function ListaCredores({ navigation }) {
  const [itens, setItens] = useState([]);

  // ✅ PESQUISA
  const [pesquisa, setPesquisa] = useState("");

  const carregar = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem("contasPagar");
      let obj = raw ? JSON.parse(raw) : {};
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) obj = {};

      const lista = Object.keys(obj).map((chave) => {
        const dado = obj[chave];
        let ficha = {};
        let parcelas = [];

        if (Array.isArray(dado)) {
          parcelas = dado; // legado
        } else if (dado && typeof dado === "object") {
          ficha = dado.ficha || {};
          parcelas = Array.isArray(dado.parcelas)
            ? dado.parcelas
            : toArray(dado.parcelas);
        }

        // chave pode ser "Nome" ou "Nome||loteId"
        let nomeExibicao = chave;
        if (chave.includes("||")) {
          nomeExibicao = chave.split("||")[0];
        }

        const res = proximoVencimento(parcelas);
        const totalParcelas = toArray(parcelas).reduce(
          (a, p) => a + Number(p.valor || 0),
          0,
        );

        return {
          chave, // chave real no AsyncStorage (pode ter loteId)
          nome: nomeExibicao, // só o nome para mostrar
          ficha,
          parcelas,
          valorTotalFicha: Number(ficha.valorTotal || 0),
          totalParcelas,
          proximoVencimento: res.dataStr,
          proxDate: res.dataObj,
          qtd: res.qtd,
          abertas: res.abertas,
        };
      });

      // ordena por data e depois por nome
      lista.sort((a, b) => {
        if (a.proxDate && b.proxDate) return a.proxDate - b.proxDate;
        if (a.proxDate && !b.proxDate) return -1;
        if (!a.proxDate && b.proxDate) return 1;
        return a.nome.localeCompare(b.nome);
      });

      setItens(lista);
    } catch (e) {
      console.warn("Falha ao carregar credores:", e);
      setItens([]);
    }
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener("focus", carregar);
    return unsub;
  }, [navigation, carregar]);

  const abrirNovoCredor = () => {
    navigation.navigate("ContasPagar", { credor: "" });
  };

  const abrirCredor = (chave) => {
    navigation.navigate("ContasPagar", { credor: chave });
  };

  /* === Baixa pela lista: com escolha Capital de Giro / Despesas para COMPRAS === */
  const darBaixaNaLista = async (chave, nomeExibicao) => {
    try {
      const raw = await AsyncStorage.getItem("contasPagar");
      const obj = raw ? JSON.parse(raw) : {};
      const dado = obj[chave];

      if (!dado) {
        Alert.alert("Atenção", "Não há dados para este credor.");
        return;
      }

      // obtém lista de parcelas (qualquer formato)
      let parcelas = Array.isArray(dado)
        ? [...dado]
        : [...toArray(dado.parcelas)];

      const proxima = pickNextUnpaid(parcelas);

      if (!proxima) {
        Alert.alert("Tudo pago", "Não há parcelas pendentes para este credor.");
        return;
      }

      const numero = descobrirNumeroParcela(parcelas, proxima);
      const valorStr = fmtBRL(proxima.valor || 0);
      const venc = proxima.vencimento || "-";

      // helper para realmente aplicar a baixa
      const processarBaixa = async (origemPagamento) => {
        try {
          // garante que a parcela marcada como paga esteja no array
          const idx = parcelas.findIndex((p) => p.id === proxima.id);
          if (idx >= 0) {
            parcelas[idx] = { ...proxima, pago: true };
          } else {
            proxima.pago = true;
          }

          // Se veio de COMPRAS e a pessoa escolheu CAPITAL DE GIRO,
          // só registra saída no capital de giro (sem gerar despesa)
          if (origemPagamento === "CAPITAL_GIRO") {
            await registrarSaidaCapital(Number(proxima.valor || 0));
          } else {
            // PADRÃO ou DESPESAS → registra despesa normalmente
            await addDespesa({
              credor: nomeExibicao,
              parcela: { ...proxima, numero },
            });
          }

          // persiste no mesmo formato-base
          if (Array.isArray(dado)) {
            obj[chave] = parcelas;
          } else {
            const ficha = (dado && dado.ficha) || {};
            obj[chave] = { ficha, parcelas };
          }
          await AsyncStorage.setItem("contasPagar", JSON.stringify(obj));

          // recarrega lista
          await carregar();
        } catch (err) {
          console.warn("Erro ao processar baixa:", err);
          Alert.alert("Erro", "Não foi possível dar baixa. Tente novamente.");
        }
      };

      // verifica se essa parcela veio da tela COMPRAS
      const isCompraPrazo =
        proxima?.origem === "COMPRA_PRAZO" ||
        (dado?.ficha && dado.ficha.origem === "COMPRA_PRAZO");

      // Prompt de confirmação da baixa
      Alert.alert(
        "Confirmação de Baixa",
        `Deseja realmente dar baixa na parcela ${numero}? Será salva na tela Despesas.\n\nValor: ${valorStr} \nVencimento: ${venc}`,
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Confirmar",
            onPress: () => {
              if (isCompraPrazo) {
                // SOMENTE parcelas vindas de COMPRAS perguntam de onde descontar
                Alert.alert(
                  "Pagamento da compra",
                  "De onde deseja descontar este valor?",
                  [
                    {
                      text: "Capital de Giro",
                      onPress: () => {
                        processarBaixa("CAPITAL_GIRO");
                      },
                    },
                    {
                      text: "Despesas",
                      onPress: () => {
                        processarBaixa("DESPESAS");
                      },
                    },
                    { text: "Cancelar", style: "cancel" },
                  ],
                );
              } else {
                // demais contas a pagar seguem fluxo antigo: vai para DESPESAS
                processarBaixa("PADRAO");
              }
            },
          },
        ],
        { cancelable: true },
      );
    } catch (e) {
      console.warn("Erro ao dar baixa:", e);
      Alert.alert("Erro", "Não foi possível dar baixa. Tente novamente.");
    }
  };

  // ✅ itens filtrados
  const itensFiltrados = useMemo(() => {
    const q = String(pesquisa || "")
      .trim()
      .toLowerCase();
    if (!q) return itens;

    return itens.filter((it) => {
      const nome = String(it?.nome || "").toLowerCase();
      const prox = String(it?.proximoVencimento || "").toLowerCase();
      const totalParc = fmtBRL(it?.totalParcelas).toLowerCase();
      const totalFicha = fmtBRL(it?.valorTotalFicha).toLowerCase();

      return (
        nome.includes(q) ||
        prox.includes(q) ||
        totalParc.includes(q) ||
        totalFicha.includes(q)
      );
    });
  }, [itens, pesquisa]);

  const Header = (
    <View>
      <Text style={styles.titulo}>Credores</Text>

      {/* ✅ PESQUISA */}
      <View style={styles.searchRow}>
        <TextInput
          style={[styles.searchInput]}
          placeholder="Pesquisar credor, vencimento ou valor"
          placeholderTextColor={PLACEHOLDER}
          value={pesquisa}
          onChangeText={setPesquisa}
          returnKeyType="search"
        />
        {!!pesquisa?.trim() && (
          <TouchableOpacity
            style={styles.searchClearBtn}
            onPress={() => setPesquisa("")}
          >
            <Text style={styles.searchClearTxt}>Limpar</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity style={styles.botaoNovo} onPress={abrirNovoCredor}>
        <Text style={styles.botaoNovoTxt}>+ Novo Credor</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={itensFiltrados}
        keyExtractor={(i) => i.chave} // usa a chave real, que é única por lote
        ListHeaderComponent={Header}
        renderItem={({ item }) => {
          const isQuitado = item.abertas === 0 && item.qtd > 0;

          return (
            <View style={[styles.card, isQuitado && styles.cardPago]}>
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={() => abrirCredor(item.chave)}
              >
                <Text style={styles.nome}>{item.nome}</Text>
                <Text style={styles.linha}>
                  Próx. vencimento: {item.proximoVencimento}
                </Text>
                <Text style={styles.linha}>
                  Parc: {item.abertas}/{item.qtd} • Total (parcelas):{" "}
                  {fmtBRL(item.totalParcelas)}
                </Text>
                {!!item.valorTotalFicha && (
                  <Text style={styles.linha}>
                    Valor Total (ficha): {fmtBRL(item.valorTotalFicha)}
                  </Text>
                )}
              </TouchableOpacity>

              {isQuitado ? (
                <View style={styles.btnPago}>
                  <MaterialIcons
                    name="check-circle"
                    size={18}
                    color="#1E88E5"
                  />
                  <Text style={styles.btnPagoTxt}>Pago</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.btnBaixa}
                  onPress={() => darBaixaNaLista(item.chave, item.nome)}
                >
                  <Text style={styles.btnBaixaTxt}>Dar baixa</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={{ textAlign: "center", marginTop: 20, color: "#777" }}>
            {pesquisa?.trim()
              ? "Nenhum credor encontrado para essa pesquisa."
              : "Nenhum credor cadastrado."}
          </Text>
        }
        contentContainerStyle={{ padding: 16 }}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  titulo: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 12,
  },

  // ✅ pesquisa
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#fff",
    color: "#111",
  },
  searchClearBtn: {
    borderWidth: 1,
    borderColor: "#2196F3",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  searchClearTxt: { color: "#2196F3", fontWeight: "bold" },

  botaoNovo: {
    alignSelf: "center",
    backgroundColor: "#2196F3",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  botaoNovoTxt: { color: "#fff", fontWeight: "bold" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f7f7f7",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "transparent",
  },
  cardPago: {
    backgroundColor: "#EAF4FF",
    borderColor: "#90CAF9",
  },
  nome: { fontSize: 18, fontWeight: "700" },
  linha: { color: "#444", marginTop: 4 },
  btnBaixa: {
    alignSelf: "center",
    backgroundColor: "#e53935",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  btnBaixaTxt: { color: "#fff", fontWeight: "bold" },
  btnPago: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#1E88E5",
  },
  btnPagoTxt: { color: "#1E88E5", fontWeight: "bold" },
});
