// screens/ClientePrazo.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  Modal,
  TouchableOpacity,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useFocusEffect } from "@react-navigation/native";

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

export default function ClientePrazo({ route, navigation }) {
  const nomeParam = route?.params?.cliente || "";

  const [dataAtual, setDataAtual] = useState("");
  const [nomeCliente, setNomeCliente] = useState(nomeParam || "");
  const [Endereço, setEndereço] = useState("");
  const [codigoProduto, setCodigoProduto] = useState("");
  const [quantidadeVendida, setQuantidadeVendida] = useState("");
  const [valorTotal, setValorTotal] = useState(""); // mascarado BRL
  const [qtdParcelas, setQtdParcelas] = useState("");
  const [vencimentoInicial, setVencimentoInicial] = useState("");
  const [parcelas, setParcelas] = useState([]);
  const [filtroVencimento, setFiltroVencimento] = useState("");
  const [fichaCliente, setFichaCliente] = useState(null);

  // Estados para senha/erro
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [senhaDigitada, setSenhaDigitada] = useState("");
  const [erroSenha, setErroSenha] = useState(false);

  // --- Colaborador responsável ---
  const [colaboradores, setColaboradores] = useState([]);
  const [modalColab, setModalColab] = useState(false);
  const [colabSelecionado, setColabSelecionado] = useState(null); // id

  useEffect(() => {
    const hoje = new Date();
    setDataAtual(hoje.toLocaleDateString("pt-BR"));
    // colaboradores ativos
    (async () => {
      try {
        const raw = await AsyncStorage.getItem("@colaboradores_v2");
        const lista = raw ? JSON.parse(raw) : [];
        const ativos = (lista || []).filter((c) => c.ativo);
        setColaboradores(ativos);
      } catch {}
    })();
  }, []);

  // Recarrega SEMPRE que a tela ganhar foco (e quando o nome vindo por params mudar)
  useFocusEffect(
    React.useCallback(() => {
      const n = (route?.params?.cliente || nomeCliente || "").trim();
      if (route?.params?.cliente && route.params.cliente !== nomeCliente) {
        setNomeCliente(route.params.cliente);
      }
      if (n) carregarDados(n);
    }, [route?.params?.cliente])
  );

  const formatarData = (texto) => {
    let v = (texto || "").replace(/\D/g, "");
    if (v.length >= 3 && v.length <= 4) v = v.replace(/(\d{2})(\d+)/, "$1/$2");
    else if (v.length > 4) v = v.replace(/(\d{2})(\d{2})(\d{1,4})/, "$1/$2/$3");
    return v;
  };

  const carregarDados = async (nome) => {
    const json = await AsyncStorage.getItem("clientesPrazo");
    const obj = json ? JSON.parse(json) : {};

    const parcelasSalvas = obj[nome]?.parcelas || [];
    setParcelas(parcelasSalvas);

    const ficha = obj[nome]?.ficha;
    if (ficha) {
      setFichaCliente(ficha);
      setEndereço(ficha.Endereço || "");
      setCodigoProduto(ficha.codigoProduto || "");
      setQuantidadeVendida(String(ficha.quantidadeVendida || ""));
      setValorTotal(maskBRL(String(ficha.valorTotal || 0)));
      setColabSelecionado(
        obj[nome]?.colaboradorIdDefault ||
          obj[nome]?.ficha?.colaboradorIdDefault ||
          null
      );
    } else {
      // limpa campos se ainda não houver ficha
      setFichaCliente(null);
      setEndereço("");
      setCodigoProduto("");
      setQuantidadeVendida("");
      setValorTotal("");
      setColabSelecionado(
        obj[nome]?.colaboradorIdDefault ||
          obj[nome]?.ficha?.colaboradorIdDefault ||
          null
      );
    }

    if (obj[nome]?.erroSenha) setErroSenha(true);
  };

  /** Atualiza estoque: baixa quantidade e valor (sem custo médio) */
  const atualizarEstoqueSaida = async (cod, quantidade, valorVenda) => {
    const json = await AsyncStorage.getItem("estoque");
    const lista = json ? JSON.parse(json) : [];
    const idx = lista.findIndex((p) => p.codigo === cod);
    if (idx >= 0) {
      const item = lista[idx];
      item.saida = (Number(item.saida) || 0) + Number(quantidade || 0);
      item.valorTotal = Math.max(
        0,
        (Number(item.valorTotal) || 0) - Number(valorVenda || 0)
      );
      await AsyncStorage.setItem("estoque", JSON.stringify(lista));
    }
  };

  const salvarFicha = async () => {
    Keyboard.dismiss();
    const nome = (nomeCliente || "").trim();
    if (
      !nome ||
      !Endereço ||
      !codigoProduto ||
      !quantidadeVendida ||
      !valorTotal
    ) {
      Alert.alert("Campos obrigatórios", "Preencha todos os dados da ficha.");
      return;
    }

    const qtdNum = Number(String(quantidadeVendida).replace(",", "."));
    const valorNum = parseBRL(valorTotal);

    const json = await AsyncStorage.getItem("clientesPrazo");
    const obj = json ? JSON.parse(json) : {};

    const ficha = {
      Endereço,
      codigoProduto,
      quantidadeVendida: qtdNum,
      valorTotal: valorNum,
      dataVenda: dataAtual,
      colaboradorIdDefault: colabSelecionado || null,
    };

    const clienteExistente = obj[nome] || {};
    obj[nome] = {
      ...clienteExistente,
      ficha,
      colaboradorIdDefault: colabSelecionado || null, // salva também na raiz
    };

    await AsyncStorage.setItem("clientesPrazo", JSON.stringify(obj));
    setFichaCliente(ficha);

    // Baixa no estoque ao salvar a ficha
    await atualizarEstoqueSaida(codigoProduto, qtdNum, valorNum);

    // Sync opcional
    await syncAdicionarSafe("vendasPrazo", {
      tipo: "ficha",
      cliente: nome,
      ...ficha,
    });

    Alert.alert("Ficha salva com sucesso");
  };

  const salvarParcelas = async () => {
    Keyboard.dismiss();
    const nome = (nomeCliente || "").trim();
    if (!nome || !valorTotal || !qtdParcelas || !vencimentoInicial) {
      Alert.alert(
        "Campos obrigatórios",
        "Preencha todos os dados das parcelas."
      );
      return;
    }

    const valorTotalNum = parseBRL(valorTotal);
    const qtdParcelasNum = Number(qtdParcelas);
    if (!qtdParcelasNum || qtdParcelasNum <= 0) {
      Alert.alert("Erro", "Informe uma quantidade de parcelas válida.");
      return;
    }

    const valorParcela = valorTotalNum / qtdParcelasNum;
    const novaLista = [];
    const [dia, mes, ano] = (vencimentoInicial || "").split("/").map(Number);

    if (!dia || !mes || !ano) {
      Alert.alert(
        "Data inválida",
        "Informe o vencimento no formato dd/mm/aaaa."
      );
      return;
    }

    // carrega cliente atual para herdar colaborador salvo, caso não selecione
    const jsonOld = await AsyncStorage.getItem("clientesPrazo");
    const objOld = jsonOld ? JSON.parse(jsonOld) : {};
    const colabDefault =
      colabSelecionado ?? objOld[nome]?.colaboradorIdDefault ?? null;

    for (let i = 0; i < qtdParcelasNum; i++) {
      const vencimento = new Date(ano, mes - 1 + i, dia);
      novaLista.push({
        id: Date.now().toString() + i,
        numero: i + 1,
        valor: valorParcela,
        vencimento: vencimento.toLocaleDateString("pt-BR"),
        pago: false,
        pagoEm: null,
        receitaId: null,
        dataVenda: dataAtual,
        cliente: nome,
        codigoProduto,
        colaboradorId: colabDefault, // usado pela RelacaoClientes ao baixar
      });
    }

    const json = await AsyncStorage.getItem("clientesPrazo");
    const obj = json ? JSON.parse(json) : {};
    const clienteExistente = obj[nome] || {};
    obj[nome] = {
      ...clienteExistente,
      parcelas: novaLista,
      colaboradorIdDefault: colabDefault,
    };

    await AsyncStorage.setItem("clientesPrazo", JSON.stringify(obj));
    setParcelas(novaLista);

    // Sync opcional
    await syncAdicionarSafe("vendasPrazo", {
      tipo: "parcelas",
      cliente: nome,
      valorTotal: valorTotalNum,
      qtdParcelas: qtdParcelasNum,
      vencimentoInicial,
      parcelas: novaLista,
      dataVenda: dataAtual,
      codigoProduto,
      colaboradorIdDefault: colabDefault,
    });

    Alert.alert("Parcelas salvas com sucesso");
  };

  const compartilharPDF = async () => {
    if (!nomeCliente.trim()) return;

    const json = await AsyncStorage.getItem("clientesPrazo");
    const obj = json ? JSON.parse(json) : {};
    const clienteData = obj[nomeCliente];

    if (!clienteData) {
      Alert.alert("Erro", "Cliente não encontrado.");
      return;
    }

    const ficha = clienteData.ficha || {};
    const parcelasList = clienteData.parcelas || [];
    const colabId =
      clienteData.colaboradorIdDefault || ficha.colaboradorIdDefault || null;
    const colabNome =
      (colabId &&
        (colaboradores.find((c) => c.id === colabId)?.nome || null)) ||
      "-";

    const fmt = (v) =>
      Number(v || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });

    const html = `
      <html>
        <body>
          <h2>Ficha do Cliente: ${nomeCliente}</h2>
          <p><strong>Colaborador responsável:</strong> ${colabNome}</p>
          <p><strong>Endereço:</strong> ${ficha.Endereço || ""}</p>
          <p><strong>Código:</strong> ${ficha.codigoProduto || ""}</p>
          <p><strong>Quantidade Vendida:</strong> ${
            ficha.quantidadeVendida || ""
          }</p>
          <p><strong>Valor Total:</strong> ${fmt(ficha.valorTotal || 0)}</p>
          <p><strong>Data da Venda:</strong> ${ficha.dataVenda || ""}</p>
          <h3>Parcelas:</h3>
          <ul>
            ${parcelasList
              .map((p) => {
                const n =
                  (p.colaboradorId &&
                    (colaboradores.find((c) => c.id === p.colaboradorId)
                      ?.nome ||
                      null)) ||
                  colabNome ||
                  "-";
                return `
                  <li>
                    ${p.numero}ª parcela - ${fmt(p.valor)} - Vencimento: ${
                  p.vencimento
                } - Pago: ${p.pago ? "Sim" : "Não"}${
                  p.pago && p.pagoEm
                    ? ` (em ${new Date(p.pagoEm).toLocaleDateString("pt-BR")})`
                    : ""
                } - Colab.: ${n}
                  </li>`;
              })
              .join("")}
          </ul>
        </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri);
    } catch (error) {
      Alert.alert("Erro", "Falha ao gerar ou compartilhar o PDF.");
    }
  };

  const confirmarExclusao = () => {
    setSenhaVisivel(true);
    setSenhaDigitada("");
  };

  const verificarSenhaParaExcluir = async () => {
    const senhaSalva = await AsyncStorage.getItem("senhaAcesso");
    const nome = (nomeCliente || "").trim();

    const json = await AsyncStorage.getItem("clientesPrazo");
    const obj = json ? JSON.parse(json) : {};

    if (senhaDigitada === senhaSalva) {
      if (obj[nome]) {
        delete obj[nome];
        await AsyncStorage.setItem("clientesPrazo", JSON.stringify(obj));
        Alert.alert("Sucesso", "Cliente excluído com sucesso.");
        setErroSenha(false);
        setSenhaVisivel(false);
        navigation.goBack();
      } else {
        Alert.alert("Erro", "Cliente não encontrado.");
        setSenhaVisivel(false);
      }
    } else {
      setErroSenha(true);
      if (obj[nome]) {
        obj[nome].erroSenha = true;
        await AsyncStorage.setItem("clientesPrazo", JSON.stringify(obj));
      }
      setSenhaVisivel(false);
    }

    setSenhaDigitada("");
  };

  const parcelasFiltradas = filtroVencimento
    ? parcelas.filter((p) => p.vencimento === filtroVencimento)
    : parcelas;

  const nomeColabAtual =
    colabSelecionado &&
    (colaboradores.find((c) => c.id === colabSelecionado)?.nome || null);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.titulo}>ClientePrazo – {dataAtual}</Text>

          <TextInput
            style={[
              styles.input,
              erroSenha && {
                borderColor: "red",
                color: "red",
                fontWeight: "bold",
              },
            ]}
            placeholder="Nome do cliente"
            value={nomeCliente}
            onChangeText={(text) =>
              setNomeCliente(text.replace(/(^|\s)\S/g, (l) => l.toUpperCase()))
            }
          />

          {fichaCliente && (
            <View style={styles.fichaBox}>
              <Text style={styles.fichaTitulo}>Ficha do Cliente:</Text>
              <Text>
                Colaborador:{" "}
                {nomeColabAtual ||
                  (fichaCliente.colaboradorIdDefault &&
                    (colaboradores.find(
                      (c) => c.id === fichaCliente.colaboradorIdDefault
                    )?.nome ||
                      "-")) ||
                  "-"}
              </Text>
              <Text>Endereço: {fichaCliente.Endereço}</Text>
              <Text>Código: {fichaCliente.codigoProduto}</Text>
              <Text>Qtd Vendida: {fichaCliente.quantidadeVendida}</Text>
              <Text>
                Valor Total:{" "}
                {Number(fichaCliente.valorTotal || 0).toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </Text>
              <Text>Data: {fichaCliente.dataVenda}</Text>
            </View>
          )}

          {/* Colaborador responsável */}
          <Text style={styles.label}>Colaborador responsável</Text>
          <TouchableOpacity
            style={styles.select}
            onPress={() => setModalColab(true)}
          >
            <Text style={styles.selectTxt}>
              {nomeColabAtual || "Selecionar..."}
            </Text>
          </TouchableOpacity>

          <Modal visible={modalColab} transparent animationType="fade">
            <View style={styles.colabOverlay}>
              <View style={styles.colabList}>
                <Text style={styles.colabTitle}>Escolha o colaborador</Text>
                <FlatList
                  data={colaboradores}
                  keyExtractor={(it) => it.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.itemColab}
                      onPress={() => {
                        setColabSelecionado(item.id);
                        setModalColab(false);
                      }}
                    >
                      <Text style={styles.itemColabTxt}>{item.nome}</Text>
                      <Text style={styles.itemColabSub}>
                        {item.funcao || ""}
                      </Text>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={
                    <Text style={{ textAlign: "center", color: "#666" }}>
                      Nenhum ativo
                    </Text>
                  }
                />
                <TouchableOpacity
                  style={styles.btnFechar}
                  onPress={() => setModalColab(false)}
                >
                  <Text style={{ color: "#111", fontWeight: "700" }}>
                    Fechar
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <TextInput
            style={styles.input}
            placeholder="Endereço"
            value={Endereço}
            onChangeText={setEndereço}
          />
          <TextInput
            style={styles.input}
            placeholder="Código do produto"
            value={codigoProduto}
            onChangeText={setCodigoProduto}
          />
          <TextInput
            style={styles.input}
            placeholder="Quantidade vendida"
            keyboardType="numeric"
            value={quantidadeVendida}
            onChangeText={setQuantidadeVendida}
          />
          <TextInput
            style={styles.input}
            placeholder="Valor Total"
            keyboardType="numeric"
            value={valorTotal}
            onChangeText={(t) => setValorTotal(maskBRL(t))}
          />

          <Button title="Salvar Ficha" onPress={salvarFicha} color="#2196F3" />

          <TextInput
            style={styles.input}
            placeholder="Qtd Parcelas"
            keyboardType="numeric"
            value={qtdParcelas}
            onChangeText={setQtdParcelas}
          />
          <TextInput
            style={styles.input}
            placeholder="1º Vencimento (dd/mm/aaaa)"
            keyboardType="numeric"
            maxLength={10}
            value={vencimentoInicial}
            onChangeText={(text) => setVencimentoInicial(formatarData(text))}
          />
          <Button
            title="Salvar Parcelas"
            onPress={salvarParcelas}
            color="#4CAF50"
          />

          <Text style={styles.filtroTitulo}>Filtrar por vencimento</Text>
          <TextInput
            style={styles.input}
            placeholder="dd/mm/aaaa"
            keyboardType="numeric"
            maxLength={10}
            value={filtroVencimento}
            onChangeText={(text) => setFiltroVencimento(formatarData(text))}
          />

          <FlatList
            data={parcelasFiltradas}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.parcela}>
                <Text>
                  {item.numero}ª parcela -{" "}
                  {Number(item.valor || 0).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}{" "}
                  - {item.vencimento}
                  {item.pago && item.pagoEm
                    ? ` • Pago em ${new Date(item.pagoEm).toLocaleDateString(
                        "pt-BR"
                      )}`
                    : ""}
                </Text>
              </View>
            )}
            scrollEnabled={false}
            ListEmptyComponent={
              <Text style={styles.vazio}>Nenhuma parcela cadastrada.</Text>
            }
          />

          <View style={{ marginTop: 20 }}>
            <Button
              title="Compartilhar em PDF"
              onPress={compartilharPDF}
              color="#2196F3"
            />
            <View style={{ marginVertical: 8 }} />
            <Button
              title="Excluir Cliente"
              onPress={confirmarExclusao}
              color="#FF4444"
            />
          </View>

          {/* Modal de Senha */}
          <Modal visible={senhaVisivel} transparent animationType="fade">
            <View style={modalStyles.overlay}>
              <View style={modalStyles.box}>
                <Text style={modalStyles.titulo}>
                  Digite a senha para excluir
                </Text>
                <TextInput
                  style={[
                    modalStyles.input,
                    erroSenha && {
                      borderColor: "red",
                      color: "red",
                      fontWeight: "bold",
                    },
                  ]}
                  placeholder="Senha"
                  secureTextEntry
                  value={senhaDigitada}
                  onChangeText={(text) => setSenhaDigitada(text)}
                />
                <View style={modalStyles.botoes}>
                  <Button
                    title="Cancelar"
                    onPress={() => setSenhaVisivel(false)}
                  />
                  <Button
                    title="Confirmar"
                    onPress={verificarSenhaParaExcluir}
                  />
                </View>
              </View>
            </View>
          </Modal>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 16,
    backgroundColor: "#fff",
    paddingBottom: 100,
  },
  titulo: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  label: {
    marginTop: 10,
    fontWeight: "600",
    color: "#222",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 8,
    marginBottom: 10,
    backgroundColor: "#fff",
  },
  select: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#fff",
    marginBottom: 8,
  },
  selectTxt: { color: "#111" },

  fichaBox: {
    backgroundColor: "#f0f0f0",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  fichaTitulo: {
    fontWeight: "bold",
    marginBottom: 4,
  },
  filtroTitulo: {
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 20,
    marginBottom: 4,
  },
  parcela: {
    padding: 10,
    backgroundColor: "#f9f9f9",
    borderRadius: 6,
    marginBottom: 6,
  },
  vazio: {
    marginTop: 30,
    textAlign: "center",
    color: "#777",
  },

  // Modal de colaborador
  colabOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 20,
  },
  colabList: {
    backgroundColor: "#fff",
    borderRadius: 12,
    maxHeight: "70%",
    padding: 12,
  },
  colabTitle: { fontWeight: "800", fontSize: 16, marginBottom: 8 },
  itemColab: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  itemColabTxt: { fontWeight: "700", fontSize: 15, color: "#111" },
  itemColabSub: { color: "#555" },
  btnFechar: {
    marginTop: 8,
    alignSelf: "flex-end",
    padding: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
  },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  box: {
    width: "80%",
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 10,
    elevation: 10,
  },
  titulo: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
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
  botoes: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
});
