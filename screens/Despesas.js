// screens/Despesas.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
  Keyboard,
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation, useFocusEffect } from "@react-navigation/native";

/** =========================
 *  Loader SEGURO do sync (um caminho só)
 *  ========================= */
let cachedSyncAdicionar = null;
async function resolveSyncAdicionar() {
  if (cachedSyncAdicionar !== null) return cachedSyncAdicionar;
  try {
    // o arquivo está em screens/services/sync.js
    const m = await import("./services/sync");
    return (cachedSyncAdicionar =
      typeof m?.syncAdicionar === "function" ? m.syncAdicionar : null);
  } catch {
    return (cachedSyncAdicionar = null);
  }
}
const syncAdicionarSafe = async (...args) => {
  try {
    const fn = await resolveSyncAdicionar();
    if (fn) return await fn(...args);
  } catch {}
  return null;
};

/* ===== Helpers BRL ===== */
const maskBRL = (texto) => {
  const digits = (texto || "").replace(/\D/g, "");
  const n = parseInt(digits || "0", 10);
  const v = n / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};
const parseBRL = (masked) => {
  if (!masked) return 0;
  const digits = masked.replace(/\D/g, "");
  const n = parseInt(digits || "0", 10);
  return n / 100;
};

export default function Despesas() {
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState(""); // "R$ 0,00"
  const [despesas, setDespesas] = useState([]);
  const [soma, setSoma] = useState(0);
  const [dataAtual, setDataAtual] = useState("");

  // senha para abrir "Contas a Pagar"
  const [senhaModalVisivel, setSenhaModalVisivel] = useState(false);
  const [senhaDigitada, setSenhaDigitada] = useState("");

  // exclusão com senha + confirmação final
  const [modalSenhaExcluirVisivel, setModalSenhaExcluirVisivel] =
    useState(false);
  const [senhaExcluir, setSenhaExcluir] = useState("");
  const [indiceParaExcluir, setIndiceParaExcluir] = useState(null);

  const navigation = useNavigation();

  useEffect(() => {
    const hoje = new Date().toLocaleDateString("pt-BR");
    setDataAtual(hoje);
    carregarDespesas(hoje);
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      const hoje = new Date().toLocaleDateString("pt-BR");
      setDataAtual(hoje);
      carregarDespesas(hoje);
    }, [])
  );

  const carregarDespesas = async (data) => {
    const json = await AsyncStorage.getItem("despesas");
    const lista = json ? JSON.parse(json) : [];
    const despesasHoje = lista.filter((item) => item.data === data);
    setDespesas(despesasHoje);
    const total = despesasHoje.reduce(
      (acc, cur) => acc + Number(cur.valor || 0),
      0
    );
    setSoma(total);
    atualizarDemonstrativo(total, data);
  };

  const salvarDespesa = async () => {
    Keyboard.dismiss();
    if (!descricao || !valor) {
      Alert.alert("Erro", "Preencha descrição e valor.");
      return;
    }

    const valorNum = parseBRL(valor);
    if (valorNum <= 0) {
      Alert.alert("Erro", "Informe um valor maior que zero.");
      return;
    }

    const hoje = new Date().toLocaleDateString("pt-BR");
    const novaDespesa = {
      data: hoje,
      descricao,
      valor: valorNum,
      origem: "manual", // distinção visual com contas a pagar
    };

    try {
      // salva local
      const json = await AsyncStorage.getItem("despesas");
      const lista = json ? JSON.parse(json) : [];
      const novaLista = [...lista, novaDespesa];
      await AsyncStorage.setItem("despesas", JSON.stringify(novaLista));

      // sync (opcional)
      await syncAdicionarSafe("despesas", novaDespesa);

      setDescricao("");
      setValor("");
      carregarDespesas(hoje);
    } catch (e) {
      Alert.alert("Erro", "Não foi possível salvar a despesa.");
    }
  };

  /* === helpers visual (erro vermelho) === */
  const marcarErroLinha = (index, flag = true) => {
    setDespesas((prev) => {
      const nova = [...prev];
      if (nova[index]) nova[index] = { ...nova[index], erroSenha: !!flag };
      return nova;
    });
  };
  const limparErroLinha = (index) => marcarErroLinha(index, false);

  /* ===== Exclusão com senha → confirmação final ===== */
  const abrirSenhaExclusao = (index) => {
    setIndiceParaExcluir(index);
    setSenhaExcluir("");
    setModalSenhaExcluirVisivel(true);
  };

  const confirmarSenhaParaExcluir = async () => {
    const senhaSalva = await AsyncStorage.getItem("senhaAcesso");
    const ok = senhaExcluir === senhaSalva;

    // fecha modal de senha
    setModalSenhaExcluirVisivel(false);
    setSenhaExcluir("");

    if (!ok) {
      if (indiceParaExcluir !== null) marcarErroLinha(indiceParaExcluir, true);
      return;
    }

    // senha correta → confirmação final
    const item = despesas[indiceParaExcluir];
    if (!item) {
      setIndiceParaExcluir(null);
      return;
    }

    const msg =
      `Excluir esta despesa?\n\n` +
      `Descrição: ${item.descricao}\n` +
      `Valor: ${formatarValor(item.valor)}`;

    Alert.alert("Confirmar exclusão", msg, [
      {
        text: "Cancelar",
        style: "cancel",
        onPress: () => {
          // limpa vermelho se houver
          if (indiceParaExcluir !== null) limparErroLinha(indiceParaExcluir);
          setIndiceParaExcluir(null);
        },
      },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          await executarExclusao(indiceParaExcluir);
          if (indiceParaExcluir !== null) limparErroLinha(indiceParaExcluir);
          setIndiceParaExcluir(null);
          Alert.alert("Excluída", "Despesa removida com sucesso.");
        },
      },
    ]);
  };

  // remove a despesa pelo índice relativo ao DIA
  const executarExclusao = async (indexDia) => {
    const json = await AsyncStorage.getItem("despesas");
    const lista = json ? JSON.parse(json) : [];

    // mapear índice do dia → índice global
    let indexGlobal = -1;
    let count = -1;
    for (let i = 0; i < lista.length; i++) {
      if (lista[i].data === dataAtual) {
        count++;
        if (count === indexDia) {
          indexGlobal = i;
          break;
        }
      }
    }
    if (indexGlobal >= 0) {
      lista.splice(indexGlobal, 1);
      await AsyncStorage.setItem("despesas", JSON.stringify(lista));
      await carregarDespesas(dataAtual);
    }
  };

  const atualizarDemonstrativo = async (totalDespesas, diaRef) => {
    const hoje = diaRef || dataAtual;
    const demoJson = await AsyncStorage.getItem("demonstrativoMensal");
    const demo = demoJson ? JSON.parse(demoJson) : {};

    const dia = demo[hoje] || {
      saldoAnterior: 0,
      receitas: 0,
      despesas: 0,
      saldoFinal: 0,
    };

    dia.despesas = Number(totalDespesas || 0);
    dia.saldoFinal =
      Number(dia.saldoAnterior || 0) +
      Number(dia.receitas || 0) -
      Number(dia.despesas || 0);

    demo[hoje] = dia;
    await AsyncStorage.setItem("demonstrativoMensal", JSON.stringify(demo));
  };

  const formatarValor = (v) =>
    Number(v || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  /* ===== Senha para "Contas a Pagar" (mantido) ===== */
  const validarSenha = () => {
    if (senhaDigitada === "1234") {
      setSenhaModalVisivel(false);
      setSenhaDigitada("");
      navigation.navigate("ListaCredores");
    } else {
      Alert.alert("Senha incorreta", "Acesso negado.");
      setSenhaDigitada("");
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        <Text style={styles.titulo}>Despesas – {dataAtual}</Text>

        <TextInput
          style={styles.input}
          placeholder="Descrição"
          value={descricao}
          onChangeText={setDescricao}
        />
        <TextInput
          style={styles.input}
          placeholder="Valor"
          keyboardType="numeric"
          value={valor}
          onChangeText={(t) => setValor(maskBRL(t))}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
        />

        <TouchableOpacity style={styles.botao} onPress={salvarDespesa}>
          <Text style={styles.botaoTexto}>Inserir Despesa</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.botaoContas}
          onPress={() => setSenhaModalVisivel(true)}
        >
          <Text style={styles.botaoTextoContas}>Contas a Pagar</Text>
        </TouchableOpacity>

        <FlatList
          data={despesas}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item, index }) => (
            <View
              style={[
                styles.itemLinha,
                item.origem === "contaPagar" ? styles.itemLinhaBaixa : null,
              ]}
            >
              <Text
                style={[
                  styles.itemLista,
                  item.erroSenha && { color: "red", fontWeight: "bold" },
                ]}
              >
                {item.descricao} – {formatarValor(item.valor)}
              </Text>
              <TouchableOpacity onPress={() => abrirSenhaExclusao(index)}>
                <Text style={styles.excluir}>Excluir</Text>
              </TouchableOpacity>
            </View>
          )}
          ListFooterComponent={
            <Text style={styles.total}>Total: {formatarValor(soma)}</Text>
          }
        />
      </View>

      {/* Modal de Senha → "Contas a Pagar" (mantido) */}
      <Modal visible={senhaModalVisivel} transparent animationType="fade">
        <View style={styles.modalContainer}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitulo}>Digite a senha</Text>
            <TextInput
              style={styles.input}
              placeholder="Senha"
              secureTextEntry
              value={senhaDigitada}
              onChangeText={setSenhaDigitada}
              autoFocus
            />
            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <TouchableOpacity onPress={() => setSenhaModalVisivel(false)}>
                <Text style={{ color: "red", marginTop: 10 }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={validarSenha}>
                <Text style={{ color: "green", marginTop: 10 }}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de Senha → EXCLUIR despesa */}
      <Modal
        visible={modalSenhaExcluirVisivel}
        transparent
        animationType="fade"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitulo}>Digite a senha para excluir</Text>
            <TextInput
              style={styles.input}
              placeholder="Senha"
              secureTextEntry
              value={senhaExcluir}
              onChangeText={setSenhaExcluir}
              autoFocus
            />
            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <TouchableOpacity
                onPress={() => {
                  setModalSenhaExcluirVisivel(false);
                  setSenhaExcluir("");
                }}
              >
                <Text style={{ color: "red", marginTop: 10 }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmarSenhaParaExcluir}>
                <Text style={{ color: "green", marginTop: 10 }}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  titulo: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    marginVertical: 8,
    borderRadius: 8,
  },
  botao: {
    borderWidth: 1,
    borderColor: "#bfa140",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 10,
    backgroundColor: "#fff",
  },
  botaoTexto: {
    color: "#bfa140",
    fontWeight: "bold",
    fontSize: 16,
  },
  botaoContas: {
    backgroundColor: "#4e8cff",
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  botaoTextoContas: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
    textAlign: "center",
  },
  itemLinha: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  itemLinhaBaixa: {
    backgroundColor: "#e0f0ff",
    borderRadius: 6,
    paddingHorizontal: 6,
  },
  itemLista: { fontSize: 16, flexShrink: 1 },
  excluir: { color: "red", fontWeight: "bold" },
  total: {
    marginTop: 10,
    fontWeight: "bold",
    color: "red",
    fontSize: 18,
    textAlign: "center",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#00000088",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBox: {
    backgroundColor: "#fff",
    padding: 20,
    width: "80%",
    borderRadius: 10,
    elevation: 5,
  },
  modalTitulo: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
});
