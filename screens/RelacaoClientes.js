// screens/RelacaoClientes.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Button,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { addSaleToCollaborator } from "./services/colabSales"; // <-- integração colaboradores

const RECEITAS_KEY = "receitas";

export default function RelacaoClientes({ navigation }) {
  const [clientes, setClientes] = useState([]);
  const [logotipoBase64, setLogotipoBase64] = useState(null);

  // Exclusão com senha
  const [senhaModalVisivel, setSenhaModalVisivel] = useState(false);
  const [senhaDigitada, setSenhaDigitada] = useState("");
  const [clienteParaExcluir, setClienteParaExcluir] = useState(null);

  // Evita duplo toque na baixa
  const [baixando, setBaixando] = useState(false);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", carregarClientes);
    return unsubscribe;
  }, [navigation]);

  const carregarClientes = async () => {
    const json = await AsyncStorage.getItem("clientesPrazo");
    const obj = json ? JSON.parse(json) : {};

    const lista = Object.keys(obj).map((nome) => {
      const parcelas = obj[nome].parcelas || [];
      const proxima = parcelas.find((p) => !p.pago);
      return {
        nome,
        proximoVencimento: proxima?.vencimento || "-",
        valor: proxima?.valor || 0,
        id: proxima?.id,
        temBaixa: !!proxima,
        numeroParcela: proxima
          ? parcelas.findIndex((p) => p.id === proxima.id) + 1
          : null,
        erroSenha: !!obj[nome]?.erroSenha,
      };
    });

    setClientes(lista);
  };

  // === Logotipo ===
  const escolherImagemLogotipo = async (salvarComoPadrao = true) => {
    try {
      const resultado = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
        allowsEditing: true,
      });

      if (!resultado.canceled) {
        const uri = resultado.assets[0].uri;
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        if (salvarComoPadrao) {
          await AsyncStorage.setItem("logotipoEmpresa", base64);
          setLogotipoBase64(base64);
        }
        return base64; // devolve o base64 pra usar no recibo
      }
    } catch {
      Alert.alert("Erro", "Não foi possível selecionar a imagem.");
    }
    return null;
  };

  const formatarNumeroParcela = (numero, total) =>
    `${numero}ª parcela de ${total}`;

  const gerarReciboPDF = async (
    clienteNome,
    valor,
    numeroParcela,
    totalParcelas,
    logoBase64Override = null
  ) => {
    const salvo =
      logoBase64Override ?? (await AsyncStorage.getItem("logotipoEmpresa"));
    const dataAtual = new Date().toLocaleDateString("pt-BR");

    const imagemHTML =
      salvo && salvo.length > 100
        ? `<img src="data:image/png;base64,${salvo}" style="max-height: 100px; margin-bottom: 16px;" />`
        : `<div style="width: 100%; height: 100px; border: 1px dashed #aaa; display: flex; align-items: center; justify-content: center;">
            <span style="color: #aaa;">Cole aqui o logotipo da sua empresa</span>
          </div>`;

    const html = `
      <html>
        <body style="font-family: Arial; padding: 24px; border: 2px solid #000; max-width: 600px; margin: auto;">
          <div style="text-align: center; margin-bottom: 20px;">
            ${imagemHTML}
          </div>
          <h2 style="text-align: center;">Recibo de Pagamento</h2>
          <p>Recebi de <strong>${clienteNome}</strong> a quantia de <strong>${Number(
      valor || 0
    ).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    })}</strong> referente à <strong>${formatarNumeroParcela(
      numeroParcela,
      totalParcelas
    )}</strong> paga em ${dataAtual}.</p>
          <p style="text-align: right; margin-top: 20px;">Data: ${dataAtual}</p>
        </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri);
    } catch {
      Alert.alert("Erro", "Não foi possível gerar o recibo.");
    }
  };

  /* ===== Helpers de Receita (com vínculo à parcela e colaborador) ===== */
  const criarReceitaVinculada = async (parcela, clienteNome, colabId) => {
    const agoraISO = new Date().toISOString();
    const receita = {
      id: `rc-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      data: new Date(agoraISO).toLocaleDateString("pt-BR"),
      dataISO: agoraISO,
      descricao: `📦Rec.Parcela/ ${clienteNome}`,
      valor: Number(parcela.valor || 0), // REAIS
      codigo: "-",
      qtd: 0,
      origem: "Prazo",
      colaboradorId: colabId || null,

      // vínculo reverso
      clientePrazoNome: clienteNome,
      clientePrazoParcelaId: parcela.id,
    };

    const receitasJson = await AsyncStorage.getItem(RECEITAS_KEY);
    const receitasLista = receitasJson ? JSON.parse(receitasJson) : [];
    await AsyncStorage.setItem(
      RECEITAS_KEY,
      JSON.stringify([...receitasLista, receita])
    );

    return receita;
  };

  // === Baixa ===
  const realizarBaixa = async (
    cliente,
    deveGerarRecibo,
    logoBase64Override = null
  ) => {
    if (baixando) return;
    setBaixando(true);
    try {
      const json = await AsyncStorage.getItem("clientesPrazo");
      const obj = json ? JSON.parse(json) : {};
      const listaParcelas = obj[cliente.nome]?.parcelas || [];

      const index = listaParcelas.findIndex((p) => !p.pago);
      if (index === -1) {
        setBaixando(false);
        return;
      }

      const parcela = { ...listaParcelas[index] };

      // pega colaborador da parcela ou do default do cliente
      const colabId =
        parcela.colaboradorId ||
        obj[cliente.nome]?.colaboradorIdDefault ||
        null;

      // 1) cria Receita vinculada (com colaborador)
      const receita = await criarReceitaVinculada(
        parcela,
        cliente.nome,
        colabId
      );

      // 2) indexa no mês do colaborador (CENTAVOS)
      if (colabId && Number(parcela.valor) > 0) {
        await addSaleToCollaborator(
          colabId,
          Math.round(Number(parcela.valor) * 100),
          new Date(receita.dataISO)
        );
      }

      // 3) marca a parcela como paga + vínculo com a receita
      listaParcelas[index] = {
        ...parcela,
        pago: true,
        pagoEm: receita.dataISO,
        receitaId: receita.id,
        colaboradorId: colabId || null,
      };
      obj[cliente.nome].parcelas = listaParcelas;
      await AsyncStorage.setItem("clientesPrazo", JSON.stringify(obj));

      // 4) recibo (opcional)
      if (deveGerarRecibo) {
        const numeroParcela = index + 1;
        const totalParcelas = listaParcelas.length;
        await gerarReciboPDF(
          cliente.nome,
          parcela.valor,
          numeroParcela,
          totalParcelas,
          logoBase64Override
        );
      }

      Alert.alert("Sucesso", "Parcela baixada e registrada na Receita.");
      carregarClientes();
    } catch (e) {
      Alert.alert("Erro", "Não foi possível concluir a baixa.");
    } finally {
      setBaixando(false);
    }
  };

  // Abre o fluxo de recibo
  const abrirFluxoRecibo = (cliente) => {
    Alert.alert("Gerar Recibo", "Deseja gerar recibo?", [
      {
        text: "Não",
        style: "cancel",
        onPress: () => realizarBaixa(cliente, false),
      },
      {
        text: "Sim",
        onPress: async () => {
          const logoAtual = await AsyncStorage.getItem("logotipoEmpresa");
          Alert.alert("Logotipo do Recibo", "Como deseja usar o logotipo?", [
            {
              text: "Usar logo atual",
              onPress: () => realizarBaixa(cliente, true, logoAtual),
            },
            {
              text: "Trocar logo",
              onPress: async () => {
                const novo = await escolherImagemLogotipo(false); // escolhe sem salvar
                if (novo) {
                  Alert.alert(
                    "Salvar como padrão?",
                    "Usar este logotipo como padrão nos próximos recibos?",
                    [
                      {
                        text: "Não",
                        onPress: () => realizarBaixa(cliente, true, novo),
                      },
                      {
                        text: "Sim",
                        onPress: async () => {
                          await AsyncStorage.setItem("logotipoEmpresa", novo);
                          setLogotipoBase64(novo);
                          realizarBaixa(cliente, true, novo);
                        },
                      },
                    ]
                  );
                }
              },
            },
            {
              text: "Sem logo",
              onPress: () => realizarBaixa(cliente, true, null),
            },
            { text: "Cancelar", style: "destructive" },
          ]);
        },
      },
    ]);
  };

  // CONFIRMAÇÃO antes de baixar (para evitar toque acidental)
  const onPressBaixar = (cliente) => {
    const valorFmt = Number(cliente.valor || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    const mensagem =
      `Baixar a próxima parcela de ${valorFmt} ` +
      `(venc.: ${cliente.proximoVencimento}) de "${cliente.nome}"?\n\n` +
      `Essa ação registra a baixa e não pode ser desfeita.`;

    Alert.alert("Confirmar baixa", mensagem, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Confirmar",
        style: "destructive",
        onPress: () => abrirFluxoRecibo(cliente),
      },
    ]);
  };

  // === Limpeza em Receitas: remove lançamentos do cliente (📦Rec.Parcela/ Nome)
  const apagarLancamentosReceitaDoCliente = async (nomeCliente) => {
    const receitasJson = await AsyncStorage.getItem(RECEITAS_KEY);
    const receitasLista = receitasJson ? JSON.parse(receitasJson) : [];
    const prefixA = `📦Rec.Parcela/ ${nomeCliente}`;
    const prefixB = `📦Rec.Parcela/${nomeCliente}`;

    const novas = receitasLista.filter((r) => {
      const d = (r?.descricao || "").trim();
      return !(d.startsWith(prefixA) || d.startsWith(prefixB));
    });

    const removidas = receitasLista.length - novas.length;
    await AsyncStorage.setItem(RECEITAS_KEY, JSON.stringify(novas));
    return removidas;
  };

  // === Exclusão com senha + duplas confirmações + proposta de limpar Receitas ===
  const pedirExclusao = (cliente) => {
    Alert.alert(
      "Confirmar exclusão",
      `Excluir o cliente "${cliente.nome}" e todos os dados (parcelas/flags)? Essa ação não pode ser desfeita.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: () => {
            setClienteParaExcluir(cliente);
            setSenhaDigitada("");
            setSenhaModalVisivel(true); // abre o modal somente após confirmar
          },
        },
      ]
    );
  };

  const confirmarExclusao = async () => {
    try {
      const senhaSalva = (await AsyncStorage.getItem("senhaApp")) || "1234";
      if (senhaDigitada !== senhaSalva) {
        // marca erroSenha = true
        const json = await AsyncStorage.getItem("clientesPrazo");
        const obj = json ? JSON.parse(json) : {};
        if (!obj[clienteParaExcluir?.nome]) {
          setSenhaModalVisivel(false);
          return;
        }
        obj[clienteParaExcluir.nome].erroSenha = true;
        await AsyncStorage.setItem("clientesPrazo", JSON.stringify(obj));
        setSenhaModalVisivel(false);
        setSenhaDigitada("");
        await carregarClientes();
        Alert.alert("Senha incorreta", "Cliente não excluído.");
        return;
      }

      // senha OK → confirmação FINAL
      Alert.alert(
        "Excluir definitivamente?",
        `Tem certeza que deseja remover "${clienteParaExcluir?.nome}" e todos os registros associados?`,
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Excluir",
            style: "destructive",
            onPress: async () => {
              const nomeExcluido = clienteParaExcluir?.nome || "";
              const json = await AsyncStorage.getItem("clientesPrazo");
              const obj = json ? JSON.parse(json) : {};
              if (obj[nomeExcluido]) {
                delete obj[nomeExcluido];
                await AsyncStorage.setItem(
                  "clientesPrazo",
                  JSON.stringify(obj)
                );
              }

              setSenhaModalVisivel(false);
              setSenhaDigitada("");
              setClienteParaExcluir(null);
              await carregarClientes();

              // Propor limpar lançamentos em Receitas
              Alert.alert(
                "Cliente removido",
                `Cliente removido com sucesso.\n\nDeseja também apagar os lançamentos em "Receitas" referentes às parcelas deste cliente?`,
                [
                  {
                    text: "Agora não",
                    style: "cancel",
                    onPress: () =>
                      Alert.alert(
                        "Lembrete",
                        'Se necessário, apague os lançamentos em "Receitas" depois e faça o estorno no "Controle de Estoque".'
                      ),
                  },
                  {
                    text: "Apagar agora",
                    onPress: async () => {
                      const removidas = await apagarLancamentosReceitaDoCliente(
                        nomeExcluido
                      );
                      Alert.alert(
                        "Receitas limpas",
                        `${removidas} lançamento(s) apagado(s).\n\nSe houve baixa de estoque, faça o estorno em "Controle de Estoque" > "Estornar Saída".`
                      );
                    },
                  },
                ]
              );
            },
          },
        ]
      );
    } catch (e) {
      setSenhaModalVisivel(false);
      Alert.alert("Erro", "Não foi possível excluir o cliente agora.");
    }
  };

  // === Modal de senha ===
  const [modalOverlay] = useState(true); // só para manter estrutura semelhante
  const [modalBox] = useState(true);
  const [modalTitulo] = useState(true);

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Relação de Clientes</Text>

      <View style={styles.boxTopo}>
        <Text style={styles.subtitulo}>Clientes com Vendas a Prazo</Text>
        <Button
          title="+ Novo Cliente"
          onPress={() => navigation.navigate("ClientePrazo")}
          color="#2196F3"
        />
      </View>

      <FlatList
        data={clientes}
        keyExtractor={(item) => item.nome}
        renderItem={({ item }) => (
          <View
            style={[
              styles.card,
              item.temBaixa ? styles.cardPendente : styles.cardPago,
            ]}
          >
            <View style={styles.cardLinha}>
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate("ClientePrazo", { cliente: item.nome })
                }
                style={{ flex: 1 }}
              >
                <Text style={[styles.nome, item.erroSenha && styles.nomeErro]}>
                  {item.nome}
                </Text>
                <Text style={styles.vencimento}>
                  Próx. vencimento: {item.proximoVencimento}
                </Text>
              </TouchableOpacity>

              {item.temBaixa ? (
                <TouchableOpacity
                  onPress={() => onPressBaixar(item)}
                  style={styles.botaoBaixar}
                >
                  <Text style={styles.txtBaixar}>BAIXAR</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.pago}>✓Pago</Text>
              )}
            </View>

            {/* Botão Excluir com senha */}
            <View
              style={{
                marginTop: 8,
                flexDirection: "row",
                justifyContent: "flex-end",
              }}
            >
              <TouchableOpacity
                onPress={() => pedirExclusao(item)}
                style={{
                  backgroundColor: "#e74c3c",
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: 6,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>
                  Excluir
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.vazio}>Nenhum cliente cadastrado.</Text>
        }
      />

      {/* Modal de senha para exclusão */}
      <Modal visible={senhaModalVisivel} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitulo}>Digite a senha para excluir</Text>
            <TextInput
              placeholder="Senha"
              secureTextEntry
              value={senhaDigitada}
              onChangeText={setSenhaDigitada}
              style={{
                borderWidth: 1,
                borderColor: "#ccc",
                borderRadius: 6,
                padding: 8,
                marginTop: 8,
                marginBottom: 12,
              }}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button
                title="Cancelar"
                color="#999"
                onPress={() => {
                  setSenhaModalVisivel(false);
                  setSenhaDigitada("");
                  setClienteParaExcluir(null);
                }}
              />
              <Button
                title="Excluir"
                color="#e74c3c"
                onPress={confirmarExclusao}
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
  titulo: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  boxTopo: { marginBottom: 16, gap: 8 },
  subtitulo: { fontSize: 16, fontWeight: "600", color: "#444" },
  card: { padding: 12, borderRadius: 8, marginBottom: 10 },
  cardPendente: { backgroundColor: "#f5f5f5" },
  cardPago: { backgroundColor: "#e0f0ff" },
  cardLinha: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  nome: { fontSize: 18, fontWeight: "600", marginBottom: 4 },
  nomeErro: { color: "red", fontWeight: "bold" },
  vencimento: { fontSize: 14, color: "#666" },
  vazio: { textAlign: "center", marginTop: 30, color: "#777" },
  botaoBaixar: {
    backgroundColor: "#4CAF50",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  txtBaixar: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  pago: { color: "#007BFF", fontWeight: "bold", fontSize: 18 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBox: {
    backgroundColor: "#fff",
    padding: 24,
    borderRadius: 12,
    width: "85%",
  },
  modalTitulo: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
});
