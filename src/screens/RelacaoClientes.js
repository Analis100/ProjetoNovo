// screens/RelacaoClientes.js
import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
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

// ✅ motor único (Opção B)
import { excluirClientePrazoComEstorno as excluirClientePrazoMotor } from "./services/excluirVendaPrazo";

/** =========================
 *  Recebimentos: remover por cliente
 *  ========================= */
async function removerRecebimentosDoCliente(nomeCliente) {
  try {
    const raw = await AsyncStorage.getItem("recebimentosPrazo");
    const lista = raw ? JSON.parse(raw) : [];

    const filtrada = (lista || []).filter((r) => {
      const nome = String(
        r?.clienteNome || r?.nomeCliente || r?.cliente || "",
      ).trim();
      return nome !== String(nomeCliente || "").trim();
    });

    await AsyncStorage.setItem("recebimentosPrazo", JSON.stringify(filtrada));
  } catch (e) {
    console.log("Erro ao remover recebimentos:", e);
  }
}

const RECEBIMENTOS_KEY = "recebimentosPrazo";

/* ===== util ===== */
const fmtBRL = (v) =>
  Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

/* ===== Permissões ===== */
const ensureMediaPermission = async () => {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    Alert.alert(
      "Permissão negada",
      "Autorize acesso à galeria para escolher o logotipo.",
    );
    return false;
  }
  return true;
};

async function registrarRecebimentoPrazo({
  clienteNome,
  parcela,
  pagoEmISO,
  logoBase64,
}) {
  try {
    const raw = await AsyncStorage.getItem(RECEBIMENTOS_KEY);
    const arr = raw ? JSON.parse(raw) : [];

    const rec = {
      id: `rec-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      cliente: clienteNome || parcela?.cliente || "",
      numero: Number(parcela?.numero || 0),
      totalParcelas: Number(parcela?.totalParcelas || 0),
      valor: Number(parcela?.valor || 0),
      vencimento: parcela?.vencimento || "",
      pagoEm: pagoEmISO || new Date().toISOString(),
      codigo: parcela?.codigo || "",
      dataVenda: parcela?.dataVenda || "",
      colaboradorId: parcela?.colaboradorId || null,
      reciboComLogo: !!logoBase64,
    };

    const novo = Array.isArray(arr) ? [rec, ...arr] : [rec];
    await AsyncStorage.setItem(RECEBIMENTOS_KEY, JSON.stringify(novo));
    return rec;
  } catch (e) {
    console.log("Erro ao registrar recebimento:", e);
    return null;
  }
}

/** =========================
 *  Fallback local (emergência)
 *  - Faz a exclusão no clientesPrazo, mesmo se o motor falhar.
 *  - NÃO tenta mexer em Colaboradores (isso será ajustado no motor).
 *  ========================= */
async function excluirClienteFallbackLocal(nomeCliente) {
  const nome = String(nomeCliente || "").trim();
  if (!nome) return { ok: false };

  try {
    const raw = await AsyncStorage.getItem("clientesPrazo");
    const obj = raw ? JSON.parse(raw) : {};
    if (!obj || typeof obj !== "object") return { ok: false };

    if (!obj[nome]) {
      // já não existe
      return { ok: true, already: true };
    }

    delete obj[nome];
    await AsyncStorage.setItem("clientesPrazo", JSON.stringify(obj));
    return { ok: true };
  } catch (e) {
    console.log("[Fallback] erro excluirClienteFallbackLocal:", e);
    return { ok: false, error: e };
  }
}

export default function RelacaoClientes({ navigation }) {
  const [clientes, setClientes] = useState([]);
  const [logotipoBase64, setLogotipoBase64] = useState(null);

  // Totais (geral)
  const [totalPrazoGeral, setTotalPrazoGeral] = useState(0);
  const [totalAReceberGeral, setTotalAReceberGeral] = useState(0);

  // Filtro por nome
  const [filtroNome, setFiltroNome] = useState("");

  // Exclusão com senha
  const [senhaModalVisivel, setSenhaModalVisivel] = useState(false);
  const [senhaDigitada, setSenhaDigitada] = useState("");
  const [clienteParaExcluir, setClienteParaExcluir] = useState(null);

  // Evita duplo toque na baixa
  const [baixando, setBaixando] = useState(false);

  // Evita duplo toque na exclusão
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", carregarClientes);
    carregarClientes();
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  const carregarClientes = async () => {
    try {
      const json = await AsyncStorage.getItem("clientesPrazo");
      const obj = json ? JSON.parse(json) : {};

      // Card de totais (geral)
      let somaFichas = 0;
      let somaAReceber = 0;

      const lista = Object.keys(obj).map((nome) => {
        const parcelas = obj[nome].parcelas || [];

        // soma a receber (não pagas)
        somaAReceber += parcelas
          .filter((p) => !p.pago)
          .reduce((acc, p) => acc + Number(p.valor || 0), 0);

        // total da venda a prazo (pela FICHA)
        const fichaVal = Number(obj[nome]?.ficha?.valorTotal || 0);
        somaFichas += fichaVal;

        // próxima parcela
        const idxProx = parcelas.findIndex((p) => !p.pago);
        const proxima = idxProx >= 0 ? parcelas[idxProx] : null;

        return {
          nome,
          proximoVencimento: proxima?.vencimento || "-",
          valor: proxima?.valor || 0,
          id: proxima?.id,
          temBaixa: !!proxima,
          numeroParcela: idxProx >= 0 ? idxProx + 1 : null,
          totalParcelas: parcelas.length || 0,
          erroSenha: !!obj[nome]?.erroSenha,
        };
      });

      setClientes(lista);
      setTotalPrazoGeral(somaFichas);
      setTotalAReceberGeral(somaAReceber);
    } catch (e) {
      console.log("carregarClientes erro:", e);
    }
  };

  // === Logotipo para recibo ===
  const escolherImagemLogotipo = async (salvarComoPadrao = true) => {
    try {
      const ok = await ensureMediaPermission();
      if (!ok) return null;

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
        return base64;
      }
    } catch (e) {
      console.log("escolherImagemLogotipo erro:", e);
      Alert.alert("Erro", "Não foi possível selecionar a imagem.");
    }
    return null;
  };

  const formatarNumeroParcela = (n, total) => `${n}ª parcela de ${total}`;

  const gerarReciboPDF = async (
    clienteNome,
    valor,
    numeroParcela,
    totalParcelas,
    logoBase64Override = null,
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
          <p>Recebi de <strong>${clienteNome}</strong> a quantia de <strong>${fmtBRL(
            valor,
          )}</strong> referente à <strong>${formatarNumeroParcela(
            numeroParcela,
            totalParcelas,
          )}</strong> paga em ${dataAtual}.</p>
          <p style="text-align: right; margin-top: 20px;">Data: ${dataAtual}</p>
        </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri);
    } catch (e) {
      console.log("gerarReciboPDF erro:", e);
      Alert.alert("Erro", "Não foi possível gerar o recibo.");
    }
  };

  // === Baixa === (✅ NÃO salva em "venda"; salva em RECEBIMENTOS)
  const realizarBaixa = async (
    cliente,
    deveGerarRecibo,
    logoBase64Override = null,
  ) => {
    if (baixando) return;
    setBaixando(true);
    try {
      const json = await AsyncStorage.getItem("clientesPrazo");
      const obj = json ? JSON.parse(json) : {};
      const listaParcelas = obj[cliente.nome]?.parcelas || [];

      const index = listaParcelas.findIndex((p) => !p.pago);
      if (index === -1) return;

      const parcela = { ...listaParcelas[index] };
      const numeroParcela = index + 1;
      const totalParcelas = listaParcelas.length;

      const colabId =
        parcela.colaboradorId ||
        obj[cliente.nome]?.colaboradorIdDefault ||
        null;

      const pagoEmISO = new Date().toISOString();

      const rec = await registrarRecebimentoPrazo({
        clienteNome: cliente.nome,
        parcela: {
          ...parcela,
          numero: numeroParcela,
          totalParcelas,
          colaboradorId: colabId || null,
        },
        pagoEmISO,
        logoBase64: logoBase64Override,
      });

      listaParcelas[index] = {
        ...parcela,
        pago: true,
        pagoEm: pagoEmISO,
        recebimentoId: rec?.id || null,
        vendaId: null,
        colaboradorId: colabId || null,
      };

      obj[cliente.nome].parcelas = listaParcelas;
      await AsyncStorage.setItem("clientesPrazo", JSON.stringify(obj));

      if (deveGerarRecibo) {
        await gerarReciboPDF(
          cliente.nome,
          parcela.valor,
          numeroParcela,
          totalParcelas,
          logoBase64Override,
        );
      }

      Alert.alert("Sucesso", "Parcela baixada e registrada em Recebimentos.");
      carregarClientes();
    } catch (e) {
      console.log("BAIXA ERRO:", e);
      Alert.alert("Erro", "Não foi possível concluir a baixa.");
    } finally {
      setBaixando(false);
    }
  };

  const abrirFluxoRecibo = useCallback(
    (cliente) => {
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
                  const novo = await escolherImagemLogotipo(false);
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
                      ],
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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [realizarBaixa],
  );

  const onPressBaixar = useCallback(
    (cliente) => {
      const etiqueta =
        cliente.temBaixa && cliente.numeroParcela && cliente.totalParcelas
          ? `${cliente.numeroParcela}ª parcela em ${cliente.proximoVencimento}`
          : `Sem parcelas em aberto`;

      const mensagem =
        `Baixar ${fmtBRL(cliente.valor)} (${etiqueta}) de "${cliente.nome}"?\n\n` +
        `Essa ação registra a baixa em Recebimentose não pode ser desfeita.`;

      Alert.alert("Confirmar baixa", mensagem, [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Confirmar",
          style: "destructive",
          onPress: () => abrirFluxoRecibo(cliente),
        },
      ]);
    },
    [abrirFluxoRecibo],
  );

  /** =========================
   *  Exclusão unificada (motor único)
   *  ========================= */
  const excluirClienteDefinitivo = async (
    nomeExcluido,
    removerRecebimentos,
  ) => {
    const nome = String(nomeExcluido || "").trim();
    if (!nome) return false;
    if (excluindo) return false;

    setExcluindo(true);
    try {
      // ✅ chama o motor com opts explícito
      let ret = null;
      try {
        ret = await excluirClientePrazoMotor(nome, { allowIfPaid: false });
      } catch (e) {
        console.log(
          "[RelacaoClientes] motor excluir (allowIfPaid:false) erro:",
          e,
        );
        ret = null;
      }

      console.log("[RelacaoClientes] motor retorno:", ret);

      if (ret?.ok) {
        // ✅ remove da UI na hora
        setClientes((prev) => prev.filter((c) => c.nome !== nome));

        if (removerRecebimentos) {
          await removerRecebimentosDoCliente(nome);
        }

        await carregarClientes();

        Alert.alert(
          "Concluído",
          ret?.estornoFeito
            ? "Cliente excluído, como não tem parcelas pagas, o ESTOQUE E COLABORADORES foram estornados automaticamente ✅"
            : "Cliente excluído. (Sem estorno automático no estoque.)",
        );
        return true;
      }

      if (!ret?.ok && ret?.reason === "tem_parcela_paga") {
        return await new Promise((resolve) => {
          Alert.alert(
            "Atenção",
            "Este cliente possui parcela(s) paga(s).\n\n" +
              "Se você excluir agora, o ESTOQUE NÃO será estornado automaticamente.\n" +
              "Se precisar, faça o estorno manual no Controle de Estoque.\n\n" +
              "Deseja excluir mesmo assim?",
            [
              {
                text: "Cancelar",
                style: "cancel",
                onPress: () => resolve(false),
              },
              {
                text: "Excluir mesmo assim",
                style: "destructive",
                onPress: async () => {
                  let ret2 = null;
                  try {
                    ret2 = await excluirClientePrazoMotor(nome, {
                      allowIfPaid: true,
                    });
                  } catch (e) {
                    console.log(
                      "[RelacaoClientes] motor excluir (allowIfPaid:true) erro:",
                      e,
                    );
                    ret2 = null;
                  }

                  if (ret2?.ok) {
                    setClientes((prev) => prev.filter((c) => c.nome !== nome));

                    if (removerRecebimentos) {
                      await removerRecebimentosDoCliente(nome);
                    }

                    await carregarClientes();
                    Alert.alert(
                      "Concluído",
                      "Cliente excluído. (Sem estorno automático no estoque e em Colaboradores.)",
                    );
                    resolve(true);
                    return;
                  }

                  // ✅ fallback local (pra voltar a excluir na tela)
                  const fb = await excluirClienteFallbackLocal(nome);
                  if (fb?.ok) {
                    setClientes((prev) => prev.filter((c) => c.nome !== nome));
                    if (removerRecebimentos) {
                      await removerRecebimentosDoCliente(nome);
                    }
                    await carregarClientes();
                    Alert.alert(
                      "Concluído",
                      "Cliente excluído (fallback). Se ainda aparecer em Colaboradores, enviaremos correção no motor.",
                    );
                    resolve(true);
                    return;
                  }

                  Alert.alert(
                    "Erro",
                    "Não foi possível excluir este cliente agora.",
                  );
                  resolve(false);
                },
              },
            ],
          );
        });
      }

      // ✅ se chegou aqui: retorno inesperado do motor -> fallback local
      const fb = await excluirClienteFallbackLocal(nome);
      if (fb?.ok) {
        setClientes((prev) => prev.filter((c) => c.nome !== nome));
        if (removerRecebimentos) {
          await removerRecebimentosDoCliente(nome);
        }
        await carregarClientes();
        Alert.alert(
          "Concluído",
          "Cliente excluído (fallback). Agora vamos ajustar o motor para excluir também em Colaboradores.",
        );
        return true;
      }

      Alert.alert("Erro", "Não foi possível excluir este cliente agora.");
      return false;
    } finally {
      setExcluindo(false);
    }
  };

  /** =========================
   *  PROMPT DE ESCOLHA
   *  ========================= */
  const promptEscolhaExclusao = (nomeCliente) => {
    const nome = String(nomeCliente || "").trim();
    if (!nome) return;

    Alert.alert("Excluir cliente", `O que deseja excluir de "${nome}"?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Somente cliente + parcelas em aberto",
        onPress: async () => {
          await excluirClienteDefinitivo(nome, false);
        },
      },
      {
        text: "Cliente + parcelas + recebimentos baixados",
        style: "destructive",
        onPress: async () => {
          await excluirClienteDefinitivo(nome, true);
        },
      },
    ]);
  };

  // Exclusão com senha (ou bypass em teste)
  const pedirExclusao = (cliente) => {
    if (excluindo) return;

    Alert.alert("Confirmar exclusão", `Excluir o cliente "${cliente.nome}"?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          setClienteParaExcluir(cliente);
          setSenhaDigitada("");
          setSenhaModalVisivel(true);
        },
      },
    ]);
  };

  const confirmarExclusao = async () => {
    try {
      const nomeExcluido = (clienteParaExcluir?.nome || "").trim();

      // nada selecionado
      if (!nomeExcluido) {
        setSenhaModalVisivel(false);
        setSenhaDigitada("");
        setClienteParaExcluir(null);
        return;
      }

      setSenhaModalVisivel(true);
      setClienteParaExcluir(nomeExcluido);

      const senhaSalva = (await AsyncStorage.getItem("senhaAcesso")) || "1234";

      // senha errada
      if (String(senhaDigitada || "") !== String(senhaSalva || "")) {
        try {
          const json = await AsyncStorage.getItem("clientesPrazo");
          const obj = json ? JSON.parse(json) : {};
          if (obj && obj[nomeExcluido]) {
            obj[nomeExcluido].erroSenha = true;
            await AsyncStorage.setItem("clientesPrazo", JSON.stringify(obj));
          }
        } catch {}

        setSenhaModalVisivel(false);
        setSenhaDigitada("");
        setClienteParaExcluir(null);

        try {
          await carregarClientes();
        } catch {}

        Alert.alert("Senha incorreta", "Cliente não excluído.");
        return;
      }

      // senha correta -> remove marca vermelha (se tiver)
      try {
        const json = await AsyncStorage.getItem("clientesPrazo");
        const obj = json ? JSON.parse(json) : {};
        if (obj && obj[nomeExcluido] && obj[nomeExcluido].erroSenha) {
          obj[nomeExcluido].erroSenha = false;
          await AsyncStorage.setItem("clientesPrazo", JSON.stringify(obj));
        }
      } catch {}

      setSenhaModalVisivel(false);
      setSenhaDigitada("");
      setClienteParaExcluir(null);

      // agora abre o prompt de escolha (e ele chama o motor unificado)
      promptEscolhaExclusao(nomeExcluido);
    } catch (e) {
      setSenhaModalVisivel(false);
      setSenhaDigitada("");
      setClienteParaExcluir(null);
      Alert.alert("Erro", "Não foi possível excluir o cliente agora.");
    }
  };

  /* ===== Filtro por nome ===== */
  const clientesFiltrados = useMemo(() => {
    const q = (filtroNome || "").trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) => c.nome.toLowerCase().includes(q));
  }, [clientes, filtroNome]);

  // Totais considerando filtro
  const totaisFiltrados = useMemo(() => {
    if (!filtroNome.trim()) return null;
    const nomes = new Set(clientesFiltrados.map((c) => c.nome));
    return (async () => {
      const json = await AsyncStorage.getItem("clientesPrazo");
      const obj = json ? JSON.parse(json) : {};
      let somaFichas = 0;
      let somaAReceber = 0;
      for (const nome of Object.keys(obj)) {
        if (!nomes.has(nome)) continue;
        somaFichas += Number(obj[nome]?.ficha?.valorTotal || 0);
        const parcelas = obj[nome]?.parcelas || [];
        somaAReceber += parcelas
          .filter((p) => !p.pago)
          .reduce((acc, p) => acc + Number(p.valor || 0), 0);
      }
      return { somaFichas, somaAReceber };
    })();
  }, [clientesFiltrados, filtroNome]);

  const [totaisFiltroState, setTotaisFiltroState] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!totaisFiltrados) {
        setTotaisFiltroState(null);
        return;
      }
      const v = await totaisFiltrados;
      if (!cancelled) setTotaisFiltroState(v);
    })();
    return () => {
      cancelled = true;
    };
  }, [totaisFiltrados]);

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Relação de Clientes</Text>

      <TouchableOpacity
        onPress={() => navigation.navigate("RecebimentosPrazo")}
        style={[styles.btn, { backgroundColor: "#6f42c1", marginBottom: 10 }]}
      >
        <Text style={styles.btnText}>Recebimentos</Text>
      </TouchableOpacity>

      <View style={styles.cardTotais}>
        <Text style={styles.linhaTotais}>
          Valor total de venda a prazo:{" "}
          <Text style={styles.bold}>{fmtBRL(totalPrazoGeral)}</Text>
        </Text>
        <Text style={styles.linhaTotais}>
          Valor de venda a receber:{" "}
          <Text style={styles.bold}>{fmtBRL(totalAReceberGeral)}</Text>
        </Text>

        {!!filtroNome && totaisFiltroState && (
          <View style={styles.blocoFiltroInfo}>
            <Text style={styles.subtle}>
              (No filtro) Total a prazo:{" "}
              <Text style={styles.bold}>
                {fmtBRL(totaisFiltroState.somaFichas || 0)}
              </Text>
            </Text>
            <Text style={styles.subtle}>
              (No filtro) A receber:{" "}
              <Text style={styles.bold}>
                {fmtBRL(totaisFiltroState.somaAReceber || 0)}
              </Text>
            </Text>
          </View>
        )}
      </View>

      <TextInput
        placeholder="Filtrar por nome do cliente..."
        style={styles.inputFiltro}
        value={filtroNome}
        onChangeText={setFiltroNome}
        placeholderTextColor="#666"
      />

      <View style={styles.boxTopo}>
        <Text style={styles.subtitulo}>Clientes com Vendas a Prazo</Text>

        <TouchableOpacity
          onPress={() => navigation.navigate("ClientePrazo")}
          style={[styles.btn, styles.btnPrimary]}
        >
          <Text style={styles.btnText}>+ Novo Cliente</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={clientesFiltrados}
        keyExtractor={(item) => item.nome}
        renderItem={({ item }) => {
          const etiqueta =
            item.temBaixa && item.numeroParcela && item.totalParcelas
              ? `${item.numeroParcela}ª parcela em ${item.proximoVencimento}`
              : "Sem parcelas em aberto";
          return (
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
                  <Text
                    style={[styles.nome, item.erroSenha && styles.nomeErro]}
                  >
                    {item.nome}
                  </Text>
                  <Text style={styles.vencimento}>{etiqueta}</Text>
                </TouchableOpacity>

                {item.temBaixa ? (
                  <TouchableOpacity
                    onPress={() => onPressBaixar(item)}
                    style={styles.botaoBaixar}
                    disabled={baixando}
                  >
                    <Text style={styles.txtBaixar}>
                      {baixando ? "..." : "BAIXAR"}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.pago}>✓Pago</Text>
                )}
              </View>

              <View
                style={{
                  marginTop: 8,
                  flexDirection: "row",
                  justifyContent: "flex-end",
                }}
              >
                <TouchableOpacity
                  onPress={() => pedirExclusao(item)}
                  style={[
                    styles.btn,
                    styles.btnDanger,
                    { width: 120, opacity: excluindo ? 0.6 : 1 },
                  ]}
                  disabled={excluindo}
                >
                  <Text style={styles.btnText}>
                    {excluindo ? "..." : "Excluir"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.vazio}>Nenhum cliente cadastrado.</Text>
        }
      />

      <Modal visible={senhaModalVisivel} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitulo}>Digite a senha para excluir</Text>
            <TextInput
              placeholder="Senha"
              secureTextEntry
              value={senhaDigitada}
              onChangeText={setSenhaDigitada}
              style={styles.modalInput}
              autoFocus
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                style={[styles.btn, styles.btnGrey, { flex: 1 }]}
                onPress={() => {
                  setSenhaModalVisivel(false);
                  setSenhaDigitada("");
                  setClienteParaExcluir(null);
                }}
              >
                <Text style={styles.btnText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, styles.btnDanger, { flex: 1 }]}
                onPress={confirmarExclusao}
              >
                <Text style={styles.btnText}>Excluir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ===== estilos ===== */
const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  titulo: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },

  cardTotais: {
    borderWidth: 1,
    borderColor: "#ececff",
    backgroundColor: "#f8f8ff",
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  linhaTotais: { marginVertical: 2, color: "#111" },
  bold: { fontWeight: "800", color: "#111" },
  blocoFiltroInfo: { marginTop: 6 },
  subtle: { color: "#333" },

  inputFiltro: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    backgroundColor: "#fff",
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
  nome: { fontSize: 18, fontWeight: "600", marginBottom: 4, color: "#111" },
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
    color: "#111",
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    marginBottom: 12,
    backgroundColor: "#fff",
  },

  btn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "700" },
  btnPrimary: { backgroundColor: "#2196F3" },
  btnGrey: { backgroundColor: "#888" },
  btnDanger: { backgroundColor: "#e74c3c" },
});
