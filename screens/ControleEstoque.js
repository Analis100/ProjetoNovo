// screens/ControleEstoque.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Modal,
  Keyboard,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";

// ⬇ Sync opcional (envia só no plano COLABORADORES)
import { syncAdicionar } from "./services/sync.js";

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

export default function ControleEstoque() {
  // cadastro
  const [codigo, setCodigo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [entrada, setEntrada] = useState("");
  const [valorTotal, setValorTotal] = useState(""); // BRL mascarado
  const [estoque, setEstoque] = useState([]);

  const nav = useNavigation();

  // modal de senha (genérico para EXCLUIR ou ESTORNAR)
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [senhaDigitada, setSenhaDigitada] = useState("");
  const [senhaContexto, setSenhaContexto] = useState(null); // "excluir" | "estorno"
  const [indexAlvo, setIndexAlvo] = useState(null); // índice do item afetado (p/ pintar vermelho)

  // modal de Estorno (preenche dados)
  const [modalEstornoVisivel, setModalEstornoVisivel] = useState(false);
  const [codigoEstorno, setCodigoEstorno] = useState("");
  const [qtdEstorno, setQtdEstorno] = useState("");
  const [valorEstorno, setValorEstorno] = useState(""); // BRL mascarado

  useEffect(() => {
    const iniciar = async () => {
      const json = await AsyncStorage.getItem("estoque");
      setEstoque(json ? JSON.parse(json) : []);

      const senhaExistente = await AsyncStorage.getItem("senhaAcesso");
      if (!senhaExistente) {
        await AsyncStorage.setItem("senhaAcesso", "1234");
      }
    };
    iniciar();
  }, []);

  const salvarProduto = async () => {
    Keyboard.dismiss();
    if (!codigo.trim() || !descricao.trim() || !entrada || !valorTotal) {
      Alert.alert(
        "Campos obrigatórios",
        "Preencha código, descrição, entrada e valor total."
      );
      return;
    }

    const qtd = parseFloat(String(entrada).replace(",", ".")) || 0;
    const total = parseBRL(valorTotal);

    if (qtd <= 0 || total < 0) {
      Alert.alert(
        "Valores inválidos",
        "Verifique a quantidade e o valor total."
      );
      return;
    }

    const lista = [...estoque];
    const idx = lista.findIndex((p) => p.codigo === codigo);

    if (idx >= 0) {
      lista[idx].entrada = (Number(lista[idx].entrada) || 0) + qtd;
      lista[idx].descricao = descricao;
      lista[idx].valorTotal = (Number(lista[idx].valorTotal) || 0) + total;
      lista[idx].data = Date.now();
    } else {
      lista.push({
        id: Date.now().toString(),
        codigo,
        descricao,
        entrada: qtd,
        saida: 0,
        valorTotal: total,
        data: Date.now(),
      });
    }

    await AsyncStorage.setItem("estoque", JSON.stringify(lista));
    setCodigo("");
    setDescricao("");
    setEntrada("");
    setValorTotal("");
    setEstoque(lista);

    // Sync: ENTRADA
    await syncAdicionar("estoque", {
      tipo: "entrada",
      codigo,
      descricao,
      quantidade: qtd,
      valorAdicionado: total,
      dataMov: new Date().toISOString(),
    });
  };

  /* ========= Helpers p/ erro visual ========= */
  const marcarErroIndex = (idx, flag = true) => {
    if (idx === null || idx < 0) return;
    setEstoque((prev) => {
      const nova = [...prev];
      nova[idx] = { ...nova[idx], erroSenha: !!flag };
      return nova;
    });
  };
  const limparErroIndex = (idx) => marcarErroIndex(idx, false);
  const limparErroPorCodigo = (cod) => {
    const idx = estoque.findIndex((p) => String(p.codigo) === String(cod));
    if (idx >= 0) limparErroIndex(idx);
  };

  /* ========= Exclusão com senha ========= */
  const solicitarSenhaParaExcluir = (index) => {
    setIndexAlvo(index);
    setSenhaDigitada("");
    setSenhaContexto("excluir");
    setSenhaVisivel(true);
  };

  const executarExclusao = async () => {
    const itemRemovido = estoque[indexAlvo];
    const nova = estoque.filter((_, i) => i !== indexAlvo);
    await AsyncStorage.setItem("estoque", JSON.stringify(nova));
    setEstoque(nova);

    // Sync: EXCLUSÃO
    if (itemRemovido) {
      await syncAdicionar("estoque", {
        tipo: "exclusao",
        codigo: itemRemovido.codigo,
        descricao: itemRemovido.descricao,
        entrada: Number(itemRemovido.entrada || 0),
        saida: Number(itemRemovido.saida || 0),
        valorTotal: Number(itemRemovido.valorTotal || 0),
        dataMov: new Date().toISOString(),
      });
    }
  };

  /* ========= Estorno ========= */
  const abrirModalEstorno = (codigoPadrao = "") => {
    setCodigoEstorno(String(codigoPadrao || ""));
    setQtdEstorno("");
    setValorEstorno("");
    setModalEstornoVisivel(true);
  };

  // 1ª confirmação (antes da senha) — mantida
  const confirmarEstorno = () => {
    const codigo = String(codigoEstorno || "").trim();
    const qtd = Number(String(qtdEstorno || "").replace(",", ".")) || 0;
    const valor = parseBRL(valorEstorno);

    if (!codigo || !qtd) {
      Alert.alert(
        "Erro",
        "Informe o código e uma quantidade válida para estornar."
      );
      return;
    }

    const valorFmt = Number(valor || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

    const mensagem =
      `Confirmar estorno para o produto "${codigo}"?\n\n` +
      `Quantidade a estornar: ${qtd}\n` +
      `Valor a estornar: ${valorFmt}`;

    Alert.alert("Confirmar estorno", mensagem, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Continuar",
        style: "destructive",
        onPress: () => solicitarSenhaParaEstorno(codigo),
      },
    ]);
  };

  const solicitarSenhaParaEstorno = (codigoParaMarcar) => {
    // index do item para pintar vermelho se senha errar
    const idx = estoque.findIndex(
      (p) => String(p.codigo) === String(codigoParaMarcar || "").trim()
    );
    setIndexAlvo(idx >= 0 ? idx : null);
    setSenhaDigitada("");
    setSenhaContexto("estorno");
    setSenhaVisivel(true);
  };

  // efetiva o estorno (depois da confirmação pós-senha)
  const efetivarEstorno = async () => {
    const codigo = String(codigoEstorno || "").trim();
    const qtd = Number(String(qtdEstorno || "").replace(",", ".")) || 0;
    const valor = parseBRL(valorEstorno);

    try {
      const json = await AsyncStorage.getItem("estoque");
      const lista = json ? JSON.parse(json) : [];
      const idx = lista.findIndex((p) => String(p.codigo) === codigo);
      if (idx < 0) {
        Alert.alert("Não encontrado", "Código não localizado no estoque.");
        return;
      }

      const item = lista[idx];
      item.saida = Math.max(0, (Number(item.saida) || 0) - qtd);
      item.valorTotal = Number(item.valorTotal || 0) + Number(valor || 0);

      await AsyncStorage.setItem("estoque", JSON.stringify(lista));
      setEstoque(lista);

      // Sync: ESTORNO
      await syncAdicionar("estoque", {
        tipo: "estorno",
        codigo,
        descricao: item.descricao,
        quantidadeEstornada: qtd,
        valorEstornado: valor,
        dataMov: new Date().toISOString(),
      });

      setModalEstornoVisivel(false);
      Alert.alert(
        "Estorno concluído",
        "Saída estornada com sucesso.\nDica: confira o saldo do item."
      );
    } catch {
      Alert.alert("Erro", "Não foi possível estornar agora.");
    }
  };

  /* ========= Verificação de senha (genérica) ========= */
  const verificarSenha = async () => {
    const senhaSalva = await AsyncStorage.getItem("senhaAcesso");
    const senhaOk = senhaDigitada === senhaSalva;

    // fechar modal de senha primeiro
    setSenhaVisivel(false);
    setSenhaDigitada("");

    if (!senhaOk) {
      // senha errada → marca item em vermelho
      if (indexAlvo !== null && indexAlvo >= 0) {
        marcarErroIndex(indexAlvo, true);
      } else if (senhaContexto === "estorno") {
        limparErroPorCodigo(null); // noop de segurança
        const idx = estoque.findIndex(
          (p) => String(p.codigo) === String(codigoEstorno || "").trim()
        );
        if (idx >= 0) marcarErroIndex(idx, true);
      }
      setSenhaContexto(null);
      setIndexAlvo(null);
      return;
    }

    // senha correta → confirmação FINAL da ação
    if (senhaContexto === "excluir") {
      const item = estoque[indexAlvo];
      const msg =
        `Excluir definitivamente o produto "${item?.codigo || ""}"?\n` +
        `Descrição: ${item?.descricao || "-"}\n` +
        `A ação não pode ser desfeita.`;

      Alert.alert("Confirmar exclusão", msg, [
        {
          text: "Cancelar",
          style: "cancel",
          onPress: () => {
            // limpa qualquer marcação vermelha e reseta contexto
            if (indexAlvo !== null && indexAlvo >= 0)
              limparErroIndex(indexAlvo);
            setSenhaContexto(null);
            setIndexAlvo(null);
          },
        },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            await executarExclusao();
            // garante que não fique vermelho
            if (indexAlvo !== null && indexAlvo >= 0)
              limparErroIndex(indexAlvo);
            setSenhaContexto(null);
            setIndexAlvo(null);
          },
        },
      ]);
    } else if (senhaContexto === "estorno") {
      const valor = parseBRL(valorEstorno);
      const valorFmt = Number(valor || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
      const msg =
        `Confirmar estorno APÓS senha para o produto "${codigoEstorno}"?\n\n` +
        `Quantidade: ${
          Number(String(qtdEstorno || "").replace(",", ".")) || 0
        }\n` +
        `Valor: ${valorFmt}`;

      Alert.alert("Confirmar estorno", msg, [
        {
          text: "Cancelar",
          style: "cancel",
          onPress: () => {
            // limpa qualquer marcação vermelha e reseta contexto
            if (indexAlvo !== null && indexAlvo >= 0)
              limparErroIndex(indexAlvo);
            // também garante tirar qualquer erro antigo por código
            limparErroPorCodigo(codigoEstorno);
            setSenhaContexto(null);
            setIndexAlvo(null);
          },
        },
        {
          text: "Estornar",
          style: "destructive",
          onPress: async () => {
            await efetivarEstorno();
            if (indexAlvo !== null && indexAlvo >= 0)
              limparErroIndex(indexAlvo);
            limparErroPorCodigo(codigoEstorno);
            setSenhaContexto(null);
            setIndexAlvo(null);
          },
        },
      ]);
    } else {
      // fallback: apenas limpa contexto
      setSenhaContexto(null);
      setIndexAlvo(null);
    }
  };

  const abrirCatalogo = async () => {
    const existe = await AsyncStorage.getItem("catalogo");
    if (!existe) {
      await AsyncStorage.setItem("catalogo", JSON.stringify(estoque));
    }
    nav.navigate("Catalogo");
  };

  const fmtInt = (v) => Math.floor(Number(v || 0)).toLocaleString("pt-BR");
  const fmtValor = (v) =>
    Number(v || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
    });
  const fmtData = (ms) => new Date(ms).toLocaleDateString("pt-BR");

  const renderItem = ({ item, index }) => {
    const corDeFundo = index % 2 === 0 ? "#fff" : "#f1f1f1";
    const exposicao = (Number(item.entrada) || 0) - (Number(item.saida) || 0);

    return (
      <View style={[styles.itemBox, { backgroundColor: corDeFundo }]}>
        <View style={styles.itemLinha1}>
          <Text style={[styles.codigo, item.erroSenha && styles.erro]}>
            {item.codigo}
          </Text>
          <Text style={styles.data}>{fmtData(item.data)}</Text>
          <Text style={[styles.descricao, item.erroSenha && styles.erro]}>
            {item.descricao}
          </Text>
        </View>

        <View style={styles.itemLinha2}>
          <Text style={[styles.detalhe, item.erroSenha && styles.erro]}>
            Entrada: {fmtInt(item.entrada)}
          </Text>
          <Text style={[styles.detalhe, item.erroSenha && styles.erro]}>
            Saída: {fmtInt(item.saida)}
          </Text>
          <Text style={[styles.detalhe, item.erroSenha && styles.erro]}>
            Expo.: {fmtInt(exposicao)}
          </Text>
          <Text style={[styles.detalhe, item.erroSenha && styles.erro]}>
            Total: {fmtValor(item.valorTotal)}
          </Text>

          {/* Ações do item */}
          <TouchableOpacity onPress={() => abrirModalEstorno(item.codigo)}>
            <Text style={styles.estornar}>Estornar</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => solicitarSenhaParaExcluir(index)}>
            <Text style={styles.excluir}>X</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Controle de Estoque</Text>

      <View style={styles.form}>
        <TextInput
          style={styles.mini}
          placeholder="Código"
          value={codigo}
          onChangeText={setCodigo}
        />
        <TextInput
          style={styles.descricaoMaior}
          placeholder="Descrição"
          value={descricao}
          onChangeText={setDescricao}
        />
        <TextInput
          style={styles.mini}
          placeholder="Entrada"
          value={entrada}
          onChangeText={setEntrada}
          keyboardType="numeric"
        />
        <TextInput
          style={styles.mini}
          placeholder="Valor Total"
          value={valorTotal}
          onChangeText={(t) => setValorTotal(maskBRL(t))}
          keyboardType="numeric"
        />
      </View>

      <View style={styles.botaoContainer}>
        <Button title="Salvar Produto" onPress={salvarProduto} />
        <View style={{ height: 8 }} />
        <Button
          title="Estornar Saída"
          color="#bfa140"
          onPress={() => abrirModalEstorno()}
        />
        <TouchableOpacity style={styles.btnCat} onPress={abrirCatalogo}>
          <Text style={styles.btnCatTxt}>Catálogo</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        style={{ flex: 1, marginTop: 10 }}
        data={estoque}
        keyExtractor={(it) => it.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
      />

      <View style={styles.blocoEstoqueTotal}>
        <Text style={styles.textoEstoqueTotal}>
          📦 Valor total atual em estoque:{" "}
          {fmtValor(
            estoque.length > 0
              ? estoque.reduce(
                  (acc, item) => acc + (Number(item.valorTotal) || 0),
                  0
                )
              : 0
          )}
        </Text>
      </View>

      {/* Modal senha (genérico para excluir/estornar) */}
      <Modal visible={senhaVisivel} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitulo}>
              {senhaContexto === "estorno"
                ? "Digite a senha para estornar"
                : "Digite a senha para excluir"}
            </Text>
            <TextInput
              style={styles.inputSenha}
              placeholder="Senha"
              secureTextEntry
              value={senhaDigitada}
              onChangeText={setSenhaDigitada}
            />
            <View style={styles.modalBtns}>
              <Button
                title="Cancelar"
                onPress={() => {
                  setSenhaVisivel(false);
                  setSenhaDigitada("");
                }}
              />
              <Button title="Confirmar" onPress={verificarSenha} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal estorno (preenche dados) */}
      <Modal visible={modalEstornoVisivel} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitulo}>Estornar Saída de Estoque</Text>

            <TextInput
              placeholder="Código do produto"
              value={codigoEstorno}
              onChangeText={setCodigoEstorno}
              autoCapitalize="characters"
              style={styles.inputSenha}
            />

            <TextInput
              placeholder="Quantidade a estornar"
              value={qtdEstorno}
              onChangeText={setQtdEstorno}
              keyboardType="numeric"
              style={styles.inputSenha}
            />

            <TextInput
              placeholder="Valor a estornar (R$)"
              value={valorEstorno}
              onChangeText={(t) => setValorEstorno(maskBRL(t))}
              keyboardType="numeric"
              style={styles.inputSenha}
            />

            <View style={styles.modalBtns}>
              <Button
                title="Cancelar"
                color="#999"
                onPress={() => setModalEstornoVisivel(false)}
              />
              <Button
                title="Confirmar Estorno"
                color="#bfa140"
                onPress={confirmarEstorno}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  titulo: { fontSize: 20, fontWeight: "bold", textAlign: "center" },
  form: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  mini: {
    width: 110,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 6,
  },
  descricaoMaior: {
    flex: 1,
    minWidth: 150,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 6,
  },
  botaoContainer: {
    width: "100%",
    alignItems: "center",
    marginTop: 4,
  },
  btnCat: {
    backgroundColor: "#2196f3",
    paddingVertical: 8,
    borderRadius: 6,
    marginTop: 8,
    paddingHorizontal: 16,
  },
  btnCatTxt: { color: "#fff", textAlign: "center", fontWeight: "600" },
  itemBox: {
    padding: 8,
    borderRadius: 8,
    marginBottom: 6,
  },
  itemLinha1: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  itemLinha2: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  codigo: { fontWeight: "bold", fontSize: 14 },
  data: { fontSize: 12, color: "#666" },
  descricao: { flex: 1, fontSize: 14 },
  detalhe: { fontSize: 13 },
  excluir: { color: "red", fontWeight: "bold", paddingHorizontal: 6 },
  estornar: { color: "#bfa140", fontWeight: "bold", paddingHorizontal: 6 },
  sep: { height: 4 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBox: {
    width: "80%",
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 10,
    elevation: 10,
  },
  modalTitulo: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  inputSenha: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 8,
    marginBottom: 10,
  },
  modalBtns: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  blocoEstoqueTotal: {
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#006400",
    padding: 12,
    marginTop: 12,
    marginBottom: 24,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  textoEstoqueTotal: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#006400",
  },
  erro: {
    color: "red",
  },
});
