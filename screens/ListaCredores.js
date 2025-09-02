// screens/ListaCredores.js
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialIcons } from "@expo/vector-icons";

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

/* ==== DESPESAS (baixa automática) ==== */
const DESPESAS_KEY = "despesas";
const makeDespesaItem = ({ metaId, credor, parcela }) => ({
  id: metaId,
  descricao: `Parcela ${parcela.numero} - ${credor}`,
  valor: Number(parcela.valor || 0),
  data: hojeBR(),
  origem: "Contas a Pagar",
  metaId,
});
const loadDespesas = async () => {
  const raw = await AsyncStorage.getItem(DESPESAS_KEY);
  if (!raw) return { tipo: "obj", dados: {} };
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return { tipo: "arr", dados: parsed };
  if (parsed && typeof parsed === "object")
    return { tipo: "obj", dados: parsed };
  return { tipo: "obj", dados: {} };
};
const saveDespesas = async (payload) => {
  await AsyncStorage.setItem(DESPESAS_KEY, JSON.stringify(payload));
};
const addDespesa = async ({ credor, parcela }) => {
  const metaId = `conta:${credor}:${parcela.id}`;
  const item = makeDespesaItem({ metaId, credor, parcela });
  const { tipo, dados } = await loadDespesas();

  if (tipo === "arr") {
    const jaExiste = dados.some(
      (d) => d?.metaId === metaId || d?.id === metaId
    );
    if (!jaExiste) {
      dados.push(item);
      await saveDespesas(dados);
    }
    return;
  }
  const data = hojeBR();
  const arr = Array.isArray(dados[data]) ? dados[data] : [];
  const jaExiste = arr.some((d) => d?.metaId === metaId || d?.id === metaId);
  if (!jaExiste) {
    dados[data] = [...arr, item];
    await saveDespesas(dados);
  }
};

/* ==== Resumo por credor ==== */
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
    (a, b) => (a?.numero || 0) - (b?.numero || 0)
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

  const carregar = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem("contasPagar");
      let obj = raw ? JSON.parse(raw) : {};
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) obj = {};

      const lista = Object.keys(obj).map((nome) => {
        const dado = obj[nome];
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

        const res = proximoVencimento(parcelas);
        const totalParcelas = toArray(parcelas).reduce(
          (a, p) => a + Number(p.valor || 0),
          0
        );

        return {
          nome,
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

  const abrirCredor = (nome) => {
    navigation.navigate("ContasPagar", { credor: nome });
  };

  /* === Baixa pela lista: agora com confirmação mostrando número da parcela === */
  const darBaixaNaLista = async (nome) => {
    try {
      const raw = await AsyncStorage.getItem("contasPagar");
      const obj = raw ? JSON.parse(raw) : {};
      const dado = obj[nome];

      if (!dado) {
        Alert.alert("Atenção", "Não há dados para este credor.");
        return;
      }

      // obtém lista de parcelas (qualquer formato)
      const parcelas = Array.isArray(dado)
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

      // Prompt de confirmação
      Alert.alert(
        "Confirmação de Baixa",
        `Deseja realmente dar baixa na parcela ${numero}?\n\nValor: ${valorStr}\nVencimento: ${venc}`,
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Confirmar",
            onPress: async () => {
              try {
                // aplica baixa
                proxima.pago = true;
                await addDespesa({
                  credor: nome,
                  parcela: { ...proxima, numero },
                });

                // persiste no mesmo formato-base
                if (Array.isArray(dado)) {
                  obj[nome] = parcelas;
                } else {
                  const ficha = (dado && dado.ficha) || {};
                  obj[nome] = { ficha, parcelas };
                }
                await AsyncStorage.setItem("contasPagar", JSON.stringify(obj));

                // recarrega lista
                await carregar();
              } catch (err) {
                console.warn("Erro ao confirmar baixa:", err);
                Alert.alert(
                  "Erro",
                  "Não foi possível dar baixa. Tente novamente."
                );
              }
            },
          },
        ],
        { cancelable: true }
      );
    } catch (e) {
      console.warn("Erro ao dar baixa:", e);
      Alert.alert("Erro", "Não foi possível dar baixa. Tente novamente.");
    }
  };

  const Header = (
    <View>
      <Text style={styles.titulo}>Credores</Text>
      <TouchableOpacity style={styles.botaoNovo} onPress={abrirNovoCredor}>
        <Text style={styles.botaoNovoTxt}>+ Novo Credor</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={itens}
        keyExtractor={(i) => i.nome}
        ListHeaderComponent={Header}
        renderItem={({ item }) => {
          const isQuitado = item.abertas === 0 && item.qtd > 0;

          return (
            <View style={[styles.card, isQuitado && styles.cardPago]}>
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={() => abrirCredor(item.nome)}
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
                // Estado QUITADO: botão "Pago" (letras azuis + ícone)
                <View style={styles.btnPago}>
                  <MaterialIcons
                    name="check-circle"
                    size={18}
                    color="#1E88E5"
                  />
                  <Text style={styles.btnPagoTxt}>Pago</Text>
                </View>
              ) : (
                // Ainda tem parcelas: botão vermelho "Dar baixa"
                <TouchableOpacity
                  style={styles.btnBaixa}
                  onPress={() => darBaixaNaLista(item.nome)}
                >
                  <Text style={styles.btnBaixaTxt}>Dar baixa</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={{ textAlign: "center", marginTop: 20, color: "#777" }}>
            Nenhum credor cadastrado.
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
  // destaque clarinho quando quitado
  cardPago: {
    backgroundColor: "#EAF4FF",
    borderColor: "#90CAF9",
  },
  nome: { fontSize: 18, fontWeight: "700" },
  linha: { color: "#444", marginTop: 4 },
  // botão vermelho "Dar baixa"
  btnBaixa: {
    alignSelf: "center",
    backgroundColor: "#e53935",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  btnBaixaTxt: { color: "#fff", fontWeight: "bold" },
  // botão "Pago" (visual)
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
