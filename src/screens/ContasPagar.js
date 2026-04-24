import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  TouchableOpacity,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

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

const fmtBRL = (n) =>
  Number(n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

/* ===== Helpers diversos ===== */
const formatarData = (texto) => {
  let v = (texto || "").replace(/\D/g, "");
  if (v.length >= 3 && v.length <= 4) v = v.replace(/(\d{2})(\d+)/, "$1/$2");
  else if (v.length > 4) v = v.replace(/(\d{2})(\d{2})(\d{1,4})/, "$1/$2/$3");
  return v;
};

const maskTelBR = (t) => {
  const d = (t || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) {
    return d
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  }
  return d
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d{1,4})$/, "$1-$2");
};

const toArray = (x) =>
  Array.isArray(x) ? x : x && typeof x === "object" ? Object.values(x) : [];

const safeParse = (json) => {
  try {
    return json ? JSON.parse(json) : {};
  } catch {
    return {};
  }
};

const hojeBR = () => new Date().toLocaleDateString("pt-BR");

export default function ContasPagar({ route, navigation }) {
  const initialKeyRef = useRef((route?.params?.credor || "").trim());

  const [novoCredor, setNovoCredor] = useState(route?.params?.credor || "");
  const [endereco, setEndereco] = useState("");
  const [telefone, setTelefone] = useState("");
  const [valorTotal, setValorTotal] = useState("");
  const [qtdParcelas, setQtdParcelas] = useState("");
  const [vencimentoInicial, setVencimentoInicial] = useState("");
  const [parcelas, setParcelas] = useState([]);

  useEffect(() => {
    const key = initialKeyRef.current;
    if (key) carregarDados(key);
  }, []);

  const carregarDados = async (nome) => {
    try {
      const obj = safeParse(await AsyncStorage.getItem("contasPagar"));
      let dado = obj[nome];

      if (Array.isArray(dado)) {
        dado = { ficha: {}, parcelas: dado };
      }

      if (dado && typeof dado === "object") {
        const ficha = dado.ficha || {};
        setEndereco(ficha.endereco || "");
        setTelefone(ficha.telefone || "");
        setValorTotal(ficha.valorTotal ? fmtBRL(ficha.valorTotal) : "");
        setParcelas(toArray(dado.parcelas));
      } else {
        setEndereco("");
        setTelefone("");
        setValorTotal("");
        setParcelas([]);
      }
    } catch (e) {
      console.warn("Falha ao carregar dados do credor:", e);
      setParcelas([]);
    }
  };

  const renameCredorKeyIfNeeded = (oldKey, newKey, obj) => {
    if (oldKey && newKey && oldKey !== newKey && obj[oldKey]) {
      obj[newKey] = obj[oldKey];
      delete obj[oldKey];
      initialKeyRef.current = newKey;
    }
  };

  const salvar = async () => {
    const typedName = (novoCredor || "").trim();

    if (!typedName || !valorTotal || !qtdParcelas || !vencimentoInicial) {
      Alert.alert(
        "Campos obrigatórios",
        "Preencha nome, valor total, qtd de parcelas e 1º vencimento.",
      );
      return;
    }

    const totalNum = parseBRL(valorTotal);
    const qtd = Number(qtdParcelas);
    const [dia, mes, ano] = (vencimentoInicial || "").split("/").map(Number);

    if (!qtd || qtd <= 0) {
      Alert.alert("Erro", "Informe uma quantidade de parcelas válida.");
      return;
    }

    if (!dia || !mes || !ano) {
      Alert.alert(
        "Data inválida",
        "Informe o 1º vencimento no formato dd/mm/aaaa.",
      );
      return;
    }

    const valorParcela = totalNum / qtd;
    const novaLista = [];

    for (let i = 0; i < qtd; i++) {
      const vencimento = new Date(ano, mes - 1 + i, dia);
      novaLista.push({
        id: `${Date.now()}-${i}`,
        numero: i + 1,
        valor: valorParcela,
        vencimento: vencimento.toLocaleDateString("pt-BR"),
        pago: false,
      });
    }

    const obj = safeParse(await AsyncStorage.getItem("contasPagar"));

    const oldKey = initialKeyRef.current;
    const newKey = typedName;
    renameCredorKeyIfNeeded(oldKey, newKey, obj);

    const keyToUse = newKey;
    const antigo = obj[keyToUse];

    const fichaAntiga =
      antigo && !Array.isArray(antigo) && antigo.ficha ? antigo.ficha : null;

    const ficha = {
      endereco,
      telefone,
      valorTotal: totalNum,
      dataCadastro: fichaAntiga?.dataCadastro || hojeBR(),
      atualizadoEm: hojeBR(),
    };

    obj[keyToUse] = { ficha, parcelas: novaLista };
    await AsyncStorage.setItem("contasPagar", JSON.stringify(obj));

    setParcelas(novaLista);
    navigation.setOptions({ title: keyToUse || "Contas a Pagar" });
    Alert.alert("Sucesso", "Parcelas salvas com sucesso!");
  };

  const salvarFichaSomente = async () => {
    const typedName = (novoCredor || "").trim();

    if (!typedName || !endereco || !telefone || !valorTotal) {
      Alert.alert(
        "Campos obrigatórios",
        "Preencha nome, endereço, telefone e valor total.",
      );
      return;
    }

    const totalNum = parseBRL(valorTotal);
    const obj = safeParse(await AsyncStorage.getItem("contasPagar"));

    const oldKey = initialKeyRef.current;
    const newKey = typedName;
    renameCredorKeyIfNeeded(oldKey, newKey, obj);

    const keyToUse = newKey;
    const antigo = obj[keyToUse];

    const parcelasExistentes = Array.isArray(antigo)
      ? antigo
      : toArray(antigo?.parcelas);

    const dataCadastroAnterior =
      !Array.isArray(antigo) && antigo?.ficha?.dataCadastro
        ? antigo.ficha.dataCadastro
        : hojeBR();

    obj[keyToUse] = {
      ficha: {
        endereco,
        telefone,
        valorTotal: totalNum,
        dataCadastro: dataCadastroAnterior,
        atualizadoEm: hojeBR(),
      },
      parcelas: parcelasExistentes,
    };

    await AsyncStorage.setItem("contasPagar", JSON.stringify(obj));
    navigation.setOptions({ title: keyToUse || "Contas a Pagar" });
    Alert.alert("Salvo", "Ficha do credor salva com sucesso.");
  };

  const excluirCredor = async () => {
    const key = initialKeyRef.current || (novoCredor || "").trim();
    if (!key) return;

    Alert.alert(
      "Excluir",
      `Deseja excluir a FICHA e TODAS as parcelas de "${key}"? Parcelas baixadas devem ser excluídas manualmente na tela Despesas.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            const obj = safeParse(await AsyncStorage.getItem("contasPagar"));
            delete obj[key];
            await AsyncStorage.setItem("contasPagar", JSON.stringify(obj));
            navigation.goBack();
          },
        },
      ],
    );
  };

  const exportarPDF = async () => {
    const key = initialKeyRef.current || (novoCredor || "").trim();
    const lista = toArray(parcelas);

    const obj = safeParse(await AsyncStorage.getItem("contasPagar"));
    let dado = obj[key];

    if (Array.isArray(dado)) {
      dado = { ficha: {}, parcelas: dado };
    }

    const ficha = dado?.ficha || {};
    const total = lista.reduce((acc, p) => acc + Number(p.valor || 0), 0);

    const html = `
      <html>
        <body style="font-family: Arial; padding: 24px;">
          <h2>Contas a Pagar - ${key || "-"}</h2>
          <p><strong>Endereço:</strong> ${ficha.endereco || "-"}</p>
          <p><strong>Telefone:</strong> ${ficha.telefone || "-"}</p>
          <p><strong>Valor Total (ficha):</strong> ${fmtBRL(ficha.valorTotal || 0)}</p>
          <hr />
          <table border="1" style="border-collapse: collapse; width: 100%">
            <tr>
              <th>Parcela</th>
              <th>Valor</th>
              <th>Vencimento</th>
              <th>Situação</th>
            </tr>
            ${lista
              .map(
                (p) => `
              <tr>
                <td style="text-align:center">${p.numero}</td>
                <td style="text-align:right">${fmtBRL(p.valor)}</td>
                <td style="text-align:center">${p.vencimento}</td>
                <td style="text-align:center">${p.pago ? "Pago" : "Pendente"}</td>
              </tr>`,
              )
              .join("")}
          </table>
          <h3>Total das parcelas: ${fmtBRL(total)}</h3>
        </body>
      </html>`;

    try {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri);
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
    }
  };

  const renderParcela = ({ item }) => (
    <View style={styles.parcela}>
      <Text style={{ flex: 1 }}>
        Parcela {item.numero} – {fmtBRL(item.valor)} – {item.vencimento} –{" "}
        {item.pago ? "Pago" : "Pendente"}
      </Text>
    </View>
  );

  const header = (
    <View>
      <Text style={styles.titulo}>{novoCredor || "Contas a Pagar"}</Text>

      <TextInput
        style={styles.input}
        placeholder="Nome do credor"
        value={novoCredor}
        onChangeText={(text) =>
          setNovoCredor(text.replace(/(^|\s)\S/g, (l) => l.toUpperCase()))
        }
        autoCapitalize="words"
      />

      <TextInput
        style={styles.input}
        placeholder="Endereço"
        value={endereco}
        onChangeText={setEndereco}
      />

      <TextInput
        style={styles.input}
        placeholder="Telefone"
        keyboardType="phone-pad"
        value={telefone}
        onChangeText={(t) => setTelefone(maskTelBR(t))}
        maxLength={15}
      />

      <TextInput
        style={styles.input}
        placeholder="Valor Total"
        keyboardType="numeric"
        value={valorTotal}
        onChangeText={(t) => setValorTotal(maskBRL(t))}
      />

      <TouchableOpacity
        style={[styles.btn, styles.btnPrimary]}
        onPress={salvarFichaSomente}
      >
        <Text style={styles.btnText}>Salvar Ficha do Credor</Text>
      </TouchableOpacity>

      <View style={{ height: 12 }} />

      <TextInput
        style={styles.input}
        placeholder="Quantidade de Parcelas"
        keyboardType="numeric"
        value={qtdParcelas}
        onChangeText={setQtdParcelas}
      />

      <TextInput
        style={styles.input}
        placeholder="Data de 1º vencimento (dd/mm/aaaa)"
        keyboardType="numeric"
        maxLength={10}
        value={vencimentoInicial}
        onChangeText={(text) => setVencimentoInicial(formatarData(text))}
      />

      <TouchableOpacity
        style={[styles.btn, styles.btnSuccess]}
        onPress={salvar}
      >
        <Text style={styles.btnText}>Gerar/Salvar Parcelas</Text>
      </TouchableOpacity>

      <View style={{ height: 16 }} />
    </View>
  );

  const footer =
    toArray(parcelas).length > 0 ? (
      <View style={{ marginTop: 20 }}>
        <TouchableOpacity
          style={[styles.btn, styles.btnDanger]}
          onPress={excluirCredor}
        >
          <Text style={styles.btnText}>Excluir tudo deste credor</Text>
        </TouchableOpacity>

        <View style={{ height: 10 }} />

        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary]}
          onPress={exportarPDF}
        >
          <Text style={styles.btnText}>Exportar PDF</Text>
        </TouchableOpacity>
      </View>
    ) : (
      <View style={{ height: 20 }} />
    );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <FlatList
          data={toArray(parcelas)}
          keyExtractor={(item, idx) =>
            item?.id ? String(item.id) : `p-${idx}`
          }
          renderItem={renderParcela}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          ListEmptyComponent={
            <Text style={styles.vazio}>Nenhuma parcela cadastrada.</Text>
          }
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
    padding: 16,
    backgroundColor: "#fff",
    paddingBottom: 100,
  },
  titulo: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 8,
    marginBottom: 10,
    backgroundColor: "#fff",
  },
  parcela: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    padding: 10,
    backgroundColor: "#f4f4f4",
    borderRadius: 6,
  },
  vazio: {
    marginTop: 30,
    textAlign: "center",
    color: "#666",
  },
  btn: {
    width: "100%",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: {
    color: "#fff",
    fontWeight: "700",
  },
  btnPrimary: {
    backgroundColor: "#2196F3",
  },
  btnSuccess: {
    backgroundColor: "#4CAF50",
  },
  btnDanger: {
    backgroundColor: "#FF4444",
  },
});
