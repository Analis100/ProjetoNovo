// src/screens/OrcamentoCliente.js
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FORM_CARD } from "../styles/formCard";

const PLACEHOLDER = "#777";
const KEY_ORCAMENTO_LOGO = "@orcamento_logo_uri";
const KEY_ORCAMENTOS_SALVOS = "@orcamentos_salvos";
const KEY_ORC_SEQ = "@orc_seq_orcamentos"; // contador do número do orçamento
const KEY_LAST_ORC = "@ultimo_orcamento_salvo"; // guarda { id, numero, tipoPagamento }
const KEY_MATS_SERVICO = "@materiais_servico_por_orcamento";
const KEY_SERVICE_PACK_PENDENTE = "@service_pack_pendente";
const KEY_SERVICE_PACK_PREFIX = "@service_pack_";

const fmtBRL = (v) =>
  Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const maskDate = (v) => {
  return String(v || "")
    .replace(/\D/g, "")
    .replace(/^(\d{2})(\d)/, "$1/$2")
    .replace(/^(\d{2})\/(\d{2})(\d)/, "$1/$2/$3")
    .slice(0, 10);
};

const safeJSON = (raw, fallback) => {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

async function uriToDataUri(uri) {
  if (!uri) return null;
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const ext = (String(uri).split(".").pop() || "").toLowerCase();
    const mime =
      ext === "png"
        ? "image/png"
        : ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : "image/png";
    return `data:${mime};base64,${base64}`;
  } catch {
    return null;
  }
}

export default function OrcamentoCliente({ route, navigation }) {
  const [itens, setItens] = useState([]);

  const [logoUri, setLogoUri] = useState(null);
  const [orcamentoNumero, setOrcamentoNumero] = useState(
    route?.params?.numero ?? null,
  );

  const [cliente, setCliente] = useState(route?.params?.cliente || "");
  const [endereco, setEndereco] = useState(route?.params?.endereco || "");
  const [telefone, setTelefone] = useState(route?.params?.telefone || "");
  const [tipoPagamento, setTipoPagamento] = useState(
    route?.params?.tipoPagamento || "avista",
  );

  // ✅ dados do parcelamento (só quando tipoPagamento === "prazo")
  const [qtdParcelas, setQtdParcelas] = useState(
    String(route?.params?.qtdParcelas || ""),
  );
  const [vencimentoInicial, setVencimentoInicial] = useState(
    String(route?.params?.vencimentoInicial || ""),
  );

  const [pagamento, setPagamento] = useState(route?.params?.pagamento || "");
  const [previsao, setPrevisao] = useState(route?.params?.previsao || "");
  const [orcamentoId, setOrcamentoId] = useState(
    route?.params?.orcamentoId || null,
  );
  const [createdAt, setCreatedAt] = useState(route?.params?.createdAt || null);
  const [isSaving, setIsSaving] = useState(false);

  // ✅ filtro por nome (na mesma linha do imprimir)
  const [filtroNome, setFiltroNome] = useState("");

  // ✅ materiais que devem dar baixa no estoque (vem do Orçamento.js)
  const materiaisBaixa =
    route?.params && Array.isArray(route.params.materiaisBaixa)
      ? route.params.materiaisBaixa
      : [];

  useEffect(() => {
    setCliente(route?.params?.cliente || "");
    setEndereco(route?.params?.endereco || "");
    setTelefone(route?.params?.telefone || "");
    setPagamento(route?.params?.pagamento || "");
    setPrevisao(route?.params?.previsao || "");

    setOrcamentoId(route?.params?.orcamentoId || null);
    setCreatedAt(route?.params?.createdAt || null);

    if (route?.params?.numero != null) setOrcamentoNumero(route.params.numero);
  }, [
    route?.params?.orcamentoId,
    route?.params?.createdAt,
    route?.params?.cliente,
    route?.params?.endereco,
    route?.params?.telefone,
    route?.params?.pagamento,
    route?.params?.previsao,
    route?.params?.numero,
  ]);

  useEffect(() => {
    setOrcamentoNumero(route?.params?.numero ?? null);
  }, [route?.params?.numero]);

  useEffect(() => {
    // quando abrir um orçamento existente, tenta buscar o numero salvo
    (async () => {
      if (!orcamentoId) return;
      try {
        const raw = await AsyncStorage.getItem(KEY_ORCAMENTOS_SALVOS);
        const lista = safeJSON(raw, []);
        const arr = Array.isArray(lista) ? lista : [];
        const achou = arr.find((x) => String(x?.id) === String(orcamentoId));
        if (achou?.numero != null) setOrcamentoNumero(achou.numero);
      } catch {}
    })();
  }, [orcamentoId]);

  useEffect(() => {
    (async () => {
      if (!orcamentoId) return;

      try {
        const raw = await AsyncStorage.getItem(KEY_ORCAMENTOS_SALVOS);
        const lista = safeJSON(raw, []);
        const arr = Array.isArray(lista) ? lista : [];

        const achou = arr.find((x) => String(x?.id) === String(orcamentoId));
        if (!achou) return;

        // dados básicos
        setCliente(String(achou?.cliente || ""));
        setEndereco(String(achou?.endereco || ""));
        setTelefone(String(achou?.telefone || ""));
        setPagamento(String(achou?.pagamento || ""));
        setPrevisao(String(achou?.previsao || ""));
        if (achou?.numero != null) setOrcamentoNumero(achou.numero);

        // 🔑 tipo pagamento
        const tp = String(achou?.tipoPagamento || "avista");
        setTipoPagamento(tp);

        // 🔑 PARCELAMENTO (a correção está aqui)
        if (tp === "prazo") {
          const cp = achou?.contratoPrazo || {};
          setQtdParcelas(cp?.qtdParcelas != null ? String(cp.qtdParcelas) : "");
          setVencimentoInicial(String(cp?.vencimentoInicial || ""));
        } else {
          // 👇 limpa para não voltar "1"
          setQtdParcelas("");
          setVencimentoInicial("");
        }

        // itens
        if (Array.isArray(achou?.itens)) setItens(achou.itens);
      } catch (e) {
        console.log("Erro ao carregar orçamento salvo:", e?.message || e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orcamentoId]);

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(KEY_ORCAMENTO_LOGO);
      if (saved) setLogoUri(saved);
    })();
  }, []);

  useEffect(() => {
    setTipoPagamento(route?.params?.tipoPagamento || "avista");
  }, [route?.params?.tipoPagamento]);

  useEffect(() => {
    setItens(Array.isArray(route?.params?.itens) ? route.params.itens : []);
  }, [
    route?.params?.orcamentoId,
    route?.params?.createdAt,
    route?.params?.itens,
  ]);

  // ✅ aplica filtro na lista
  const itensFiltrados = useMemo(() => {
    const base = Array.isArray(itens) ? itens : [];
    const f = String(filtroNome || "")
      .trim()
      .toLowerCase();
    if (!f) return base;
    return base.filter((x) =>
      String(x?.nome || "")
        .toLowerCase()
        .includes(f),
    );
  }, [itens, filtroNome]);

  const total = useMemo(() => {
    return (Array.isArray(itens) ? itens : []).reduce(
      (s, it) => s + Number(it?.valor || 0),
      0,
    );
  }, [itens]);

  const parcelasNum = useMemo(() => {
    const n = Number(String(qtdParcelas || "").replace(/\D/g, "")) || 1;
    return Math.max(1, n);
  }, [qtdParcelas]);

  const valorParcela = useMemo(() => {
    const t = Number(total || 0);
    return parcelasNum > 0 ? t / parcelasNum : t;
  }, [total, parcelasNum]);

  const selecionarLogo = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permissão",
          "Permita acesso à galeria para escolher o logotipo.",
        );
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });

      if (res.canceled) return;
      const uri = res.assets?.[0]?.uri;
      if (!uri) return;

      setLogoUri(uri);
      await AsyncStorage.setItem(KEY_ORCAMENTO_LOGO, uri);
    } catch (e) {
      Alert.alert("Erro", String(e?.message || e));
    }
  };

  const imprimirPDF = async () => {
    Keyboard.dismiss();

    if (!String(cliente || "").trim()) {
      Alert.alert("Cliente", "Informe o nome do cliente.");
      return;
    }
    if (!Array.isArray(itens) || itens.length === 0) {
      Alert.alert("Orçamento", "Nenhum item no orçamento do cliente.");
      return;
    }

    try {
      const logoData = await uriToDataUri(logoUri);
      const hoje = new Date().toLocaleDateString("pt-BR");

      const linhas = (Array.isArray(itens) ? itens : [])
        .map((it) => {
          const tipo = it?.tipo === "material" ? "Material" : "Serviço";
          return `
            <tr>
              <td>${tipo}</td>
              <td>${String(it?.nome || "-")}</td>
              <td style="text-align:right;">${fmtBRL(it?.valor)}</td>
            </tr>
          `;
        })
        .join("");

      const html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body { font-family: Arial; padding: 24px; }
              .top { display:flex; align-items:center; gap:14px; margin-bottom: 10px; }
              .logo { width: 90px; height: 90px; object-fit: contain; border: 1px solid #eee; border-radius: 10px; padding: 6px; }
              h2 { margin: 0; }
              .muted { color:#666; font-size: 12px; margin-top: 2px; }
              .box { border: 1px solid #ddd; border-radius: 12px; padding: 12px; margin-top: 12px; }
              .row { display:flex; justify-content: space-between; gap: 10px; font-size: 12px; margin: 4px 0; }
              .label { color:#333; font-weight: 700; }
              .val { color:#111; }
              table { width: 100%; border-collapse: collapse; margin-top: 12px; }
              th, td { border: 1px solid #ccc; padding: 8px; font-size: 12px; }
              th { background: #f0f0f0; }
              .total { margin-top: 14px; text-align:right; font-size: 16px; font-weight: 800; }
            </style>
          </head>
          <body>

            <div class="top">
              ${logoData ? `<img class="logo" src="${logoData}" />` : ""}
              <div>
                <h2>Orçamento</h2>
                <div class="muted">Data: ${hoje}</div>
              </div>
            </div>

            <div class="box">
              <div class="row"><div class="label">Cliente:</div><div class="val">${cliente}</div></div>
              <div class="row"><div class="label">Endereço:</div><div class="val">${endereco || "-"}</div></div>
              <div class="row"><div class="label">Telefone:</div><div class="val">${telefone || "-"}</div></div>
              <div class="row"><div class="label">Pagamento:</div><div class="val">${pagamento || "-"}</div></div>
              <div class="row"><div class="label">Previsão:</div><div class="val">${previsao || "-"}</div></div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Descrição</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                ${linhas}
              </tbody>
            </table>

            <div class="total">Total: ${fmtBRL(total)}</div>

          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("PDF gerado", uri);
        return;
      }
      await Sharing.shareAsync(uri);
    } catch (e) {
      console.log("Erro imprimir orçamento:", e);
      Alert.alert("Erro ao gerar PDF", String(e?.message || e));
    }
  };

  const salvarOrcamento = async () => {
    Keyboard.dismiss();

    const nomeCli = String(cliente || "").trim();
    if (!nomeCli) {
      Alert.alert("Cliente", "Informe o nome do cliente antes de salvar.");
      return;
    }

    const itensParaSalvar = Array.isArray(itens) ? itens : [];
    if (itensParaSalvar.length === 0) {
      Alert.alert("Orçamento", "Nenhum item para salvar.");
      return;
    }

    if (isSaving) return; // evita duplo clique
    setIsSaving(true);

    try {
      const raw = await AsyncStorage.getItem(KEY_ORCAMENTOS_SALVOS);
      const lista = safeJSON(raw, []);
      const arr = Array.isArray(lista) ? lista : [];

      const agoraISO = new Date().toISOString();

      const totalCalc = itensParaSalvar.reduce(
        (s, it) => s + Number(it?.valor || 0),
        0,
      );

      const rawSeq = await AsyncStorage.getItem(KEY_ORC_SEQ);
      const seqAtual = rawSeq ? Number(rawSeq) : 0;

      const isEdit = !!orcamentoId;
      let numeroFinal = Number(orcamentoNumero || 0);
      if (!isEdit && !numeroFinal) numeroFinal = seqAtual + 1;

      // ✅ normaliza tipoPagamento
      const tipoPagamentoFinal = String(tipoPagamento || "avista").trim();

      // ✅ contratoPrazo final (ou null)
      const contratoPrazoFinal =
        tipoPagamentoFinal === "prazo"
          ? {
              qtdParcelas: Number(parcelasNum || 1),
              vencimentoInicial: String(vencimentoInicial || "").trim(),
              valorParcela: Number(valorParcela || 0),
            }
          : null;

      let idFinal = orcamentoId ? String(orcamentoId) : "";
      let numeroUltimo = Number(numeroFinal || 0);

      const materiaisBaixaFinal = Array.isArray(materiaisBaixa)
        ? materiaisBaixa
        : [];

      if (isEdit) {
        const idx = arr.findIndex((x) => String(x?.id) === String(orcamentoId));

        if (idx < 0) {
          // ===== EDIT, mas não achou -> cria novo =====
          idFinal = `orc-${Date.now()}`;
          const numeroGerado = numeroFinal || seqAtual + 1;
          numeroUltimo = numeroGerado;

          const novo = {
            id: idFinal,
            numero: numeroGerado,
            tipoPagamento: tipoPagamentoFinal,

            createdAt: agoraISO,
            updatedAt: agoraISO,

            cliente: nomeCli,
            endereco: String(endereco || "").trim(),
            telefone: String(telefone || "").trim(),
            pagamento: String(pagamento || "").trim(),
            previsao: String(previsao || "").trim(),

            itens: itensParaSalvar,
            materiaisBaixa: materiaisBaixaFinal,
            total: totalCalc,

            // ✅ salva OU limpa
            contratoPrazo: contratoPrazoFinal,
          };

          const novaLista = [novo, ...arr];
          await AsyncStorage.setItem(
            KEY_ORCAMENTOS_SALVOS,
            JSON.stringify(novaLista),
          );

          await AsyncStorage.setItem(
            KEY_ORC_SEQ,
            String(Math.max(seqAtual, numeroGerado)),
          );

          setOrcamentoId(novo.id);
          setOrcamentoNumero(novo.numero);
        } else {
          // ===== ATUALIZA EXISTENTE =====
          const antigo = arr[idx] || {};
          const numeroDoRegistro =
            Number(antigo?.numero || 0) || numeroFinal || seqAtual + 1;

          idFinal = String(orcamentoId);

          const atualizado = {
            ...antigo,
            id: idFinal,
            numero: numeroDoRegistro,
            tipoPagamento: tipoPagamentoFinal,

            createdAt: antigo.createdAt || createdAt || agoraISO,
            updatedAt: agoraISO,

            cliente: nomeCli,
            endereco: String(endereco || "").trim(),
            telefone: String(telefone || "").trim(),
            pagamento: String(pagamento || "").trim(),
            previsao: String(previsao || "").trim(),

            itens: itensParaSalvar,
            materiaisBaixa: materiaisBaixaFinal.length
              ? materiaisBaixaFinal
              : antigo?.materiaisBaixa || [],
            total: totalCalc,

            // ✅ salva OU limpa (isso resolve “não salva” quando muda)
            contratoPrazo: contratoPrazoFinal,
          };

          const novaLista = [...arr];
          novaLista[idx] = atualizado;

          await AsyncStorage.setItem(
            KEY_ORCAMENTOS_SALVOS,
            JSON.stringify(novaLista),
          );

          numeroUltimo = Number(atualizado.numero || 0);
          setOrcamentoNumero(atualizado.numero);
        }
      } else {
        // ===== NOVO ORÇAMENTO =====
        idFinal = `orc-${Date.now()}`;
        const numeroGerado = numeroFinal || seqAtual + 1;
        numeroUltimo = numeroGerado;

        const novo = {
          id: idFinal,
          numero: numeroGerado,
          tipoPagamento: tipoPagamentoFinal,

          createdAt: agoraISO,
          updatedAt: agoraISO,

          cliente: nomeCli,
          endereco: String(endereco || "").trim(),
          telefone: String(telefone || "").trim(),
          pagamento: String(pagamento || "").trim(),
          previsao: String(previsao || "").trim(),

          itens: itensParaSalvar,
          materiaisBaixa: materiaisBaixaFinal,
          total: totalCalc,

          // ✅ salva OU limpa
          contratoPrazo: contratoPrazoFinal,
        };

        const novaLista = [novo, ...arr];
        await AsyncStorage.setItem(
          KEY_ORCAMENTOS_SALVOS,
          JSON.stringify(novaLista),
        );

        await AsyncStorage.setItem(
          KEY_ORC_SEQ,
          String(Math.max(seqAtual, numeroGerado)),
        );

        setOrcamentoId(novo.id);
        setOrcamentoNumero(novo.numero);
      }

      if (!idFinal) idFinal = `orc-${Date.now()}`;

      // ✅ amarrou o service pack pendente no orçamento definitivo
      try {
        const spId = await AsyncStorage.getItem(KEY_SERVICE_PACK_PENDENTE);
        if (spId) {
          const rawItens = await AsyncStorage.getItem(
            `${KEY_SERVICE_PACK_PREFIX}${spId}`,
          );
          const itensPack = rawItens ? JSON.parse(rawItens) : [];

          const rawAll = await AsyncStorage.getItem(KEY_MATS_SERVICO);
          const all = rawAll ? JSON.parse(rawAll) : {};

          all[String(idFinal)] = {
            itens: Array.isArray(itensPack) ? itensPack : [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            servicePackId: String(spId),
          };

          await AsyncStorage.setItem(KEY_MATS_SERVICO, JSON.stringify(all));

          await AsyncStorage.removeItem(KEY_SERVICE_PACK_PENDENTE);
          await AsyncStorage.removeItem(`${KEY_SERVICE_PACK_PREFIX}${spId}`);
        }
      } catch (e) {
        console.log("Falha ao vincular materiais do serviço:", e?.message || e);
      }

      // ✅ guarda último orçamento salvo
      const ultimoPayload = {
        id: String(idFinal),
        numero: Number(numeroUltimo || 0),
        tipoPagamento: String(tipoPagamentoFinal || ""),
      };
      await AsyncStorage.setItem(KEY_LAST_ORC, JSON.stringify(ultimoPayload));
      await AsyncStorage.setItem("@ultimo_orcamento_id", String(idFinal));

      // ✅ limpa rascunho + marca gatilho para a tela Orçamento limpar o state ao voltar
      try {
        await AsyncStorage.removeItem("@orcamento_atual");
        await AsyncStorage.setItem("@orcamento_limpar_pendente", "1");
      } catch (e) {
        console.log("Falha ao limpar orçamento atual:", e);
      }

      Alert.alert("Orçamento", "Salvo com sucesso!", [
        {
          text: "OK",
          onPress: () => {
            if (navigation?.canGoBack?.()) navigation.goBack();
            else navigation?.navigate?.("Orcamento");
          },
        },
      ]);

      return;
    } catch (e) {
      console.log("salvarOrcamento erro:", e);
      Alert.alert("Erro", "Não foi possível salvar o orçamento.");
    } finally {
      setIsSaving(false);
    }
  };
  const irParaContrato = (modo) => {
    const id = orcamentoId || route?.params?.orcamentoId || null;

    // tenta alguns nomes comuns de rota (sem quebrar se não existir)
    const tentativas =
      modo === "vista"
        ? [
            "ContratoVista",
            "ContratoAVista",
            "ContratoÀVista",
            "Contrato_Vista",
          ]
        : [
            "ContratoPrazo",
            "ContratoAPrazo",
            "Contrato_A_Prazo",
            "Contrato_Prazo",
          ];

    for (const nome of tentativas) {
      try {
        navigation.navigate(nome, { orcamentoId: id, materiaisBaixa });
        return;
      } catch {}
    }

    // se não achou, mostra como descobrir o nome certo
    try {
      const st = navigation.getState?.();
      const nomes = (st?.routeNames || st?.routes?.map((r) => r?.name) || [])
        .filter(Boolean)
        .join(", ");
      Alert.alert(
        "Rota do contrato não encontrada",
        nomes
          ? `Não achei a rota do contrato.\n\nRotas disponíveis aqui:\n${nomes}`
          : "Não achei a rota do contrato. Me diga o nome que aparece no seu Stack.Navigator.",
      );
    } catch {
      Alert.alert(
        "Rota do contrato não encontrada",
        "Não achei a rota do contrato. Me diga o nome que aparece no seu Stack.Navigator.",
      );
    }
  };

  const imprimirOrcamentoComAviso = () => {
    Alert.alert(
      "Imprimir Orçamento",
      "⚠️ Atenção: imprimir por aqui NÃO dá baixa no estoque.\n\nPara gerar CONTRATO e dar baixa dos materiais, use a tela do Contrato (À Vista ou A Prazo).",
      [
        { text: "Voltar", style: "cancel" },

        // ✅ atalhos (opcionais) para o contrato
        {
          text: "Abrir Contrato (À Vista)",
          onPress: () => irParaContrato("vista"),
        },
        {
          text: "Abrir Contrato (A Prazo)",
          onPress: () => irParaContrato("prazo"),
        },

        // ✅ imprime aqui
        {
          text: "Imprimir mesmo assim",
          style: "destructive",
          onPress: () => imprimirPDF(), // ✅ sua função real
        },
      ],
    );
  };

  const renderItem = ({ item }) => {
    const tag = item?.tipo === "material" ? "Material" : "Serviço";
    return (
      <View style={styles.itemLinha}>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemTitulo}>
            {item?.nome || "-"}{" "}
            <Text style={{ fontWeight: "900" }}>{fmtBRL(item?.valor)}</Text>
          </Text>
          <Text style={styles.itemSub}>{tag}</Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#fff" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <FlatList
        data={itensFiltrados}
        keyExtractor={(item, index) => String(item?.id || index)}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 160, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <>
            <Text style={styles.titulo}>Orçamento do Cliente</Text>

            {orcamentoId ? (
              <Text style={styles.sub}>
                Orçamento #{orcamentoNumero || "—"}
              </Text>
            ) : null}

            <View style={styles.topRow}>
              <TextInput
                style={styles.filtroInput}
                placeholder="Filtrar por nome..."
                placeholderTextColor={PLACEHOLDER}
                value={filtroNome}
                onChangeText={setFiltroNome}
              />

              <TouchableOpacity
                style={styles.printBtn}
                onPress={imprimirOrcamentoComAviso}
              >
                <Text style={styles.printTxt}>IMPRIMIR</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Logotipo</Text>

              <TouchableOpacity style={styles.botao} onPress={selecionarLogo}>
                <Text style={styles.botaoTexto}>
                  {logoUri ? "Trocar logotipo" : "Selecionar logotipo"}
                </Text>
              </TouchableOpacity>

              <Text style={styles.hint}>
                * O logotipo fica salvo e você não precisa escolher toda vez.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Dados do Cliente</Text>

              <TextInput
                style={styles.input}
                placeholder="Nome do cliente"
                placeholderTextColor={PLACEHOLDER}
                value={cliente}
                onChangeText={setCliente}
              />
              <TextInput
                style={styles.input}
                placeholder="Endereço"
                placeholderTextColor={PLACEHOLDER}
                value={endereco}
                onChangeText={setEndereco}
              />
              <TextInput
                style={styles.input}
                placeholder="Telefone"
                placeholderTextColor={PLACEHOLDER}
                value={telefone}
                onChangeText={setTelefone}
              />

              <Text style={styles.label}>Tipo de pagamento</Text>

              <View style={styles.rowPay}>
                <TouchableOpacity
                  onPress={() => setTipoPagamento("avista")}
                  style={[
                    styles.payBtn,
                    tipoPagamento === "avista" && styles.payBtnActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.payTxt,
                      tipoPagamento === "avista" && styles.payTxtActive,
                    ]}
                  >
                    À vista
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setTipoPagamento("prazo")}
                  style={[
                    styles.payBtn,
                    tipoPagamento === "prazo" && styles.payBtnActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.payTxt,
                      tipoPagamento === "prazo" && styles.payTxtActive,
                    ]}
                  >
                    A prazo
                  </Text>
                </TouchableOpacity>
              </View>

              {tipoPagamento === "prazo" && (
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Parcelamento</Text>

                  <Text style={styles.label}>Quantidade de parcelas</Text>
                  <TextInput
                    style={styles.input}
                    value={String(qtdParcelas)}
                    onChangeText={(t) =>
                      setQtdParcelas(
                        String(t || "")
                          .replace(/\D/g, "")
                          .slice(0, 3),
                      )
                    }
                    placeholder="Ex: 3"
                    placeholderTextColor={PLACEHOLDER}
                    keyboardType="numeric"
                  />

                  <Text style={styles.label}>
                    Vencimento inicial (dd/mm/aaaa)
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={vencimentoInicial}
                    onChangeText={(t) => setVencimentoInicial(maskDate(t))}
                    placeholder="Ex: 10/02/2026"
                    placeholderTextColor={PLACEHOLDER}
                    keyboardType="numeric"
                  />

                  <View style={styles.totalCard}>
                    <Text style={styles.totalLabel}>Valor por parcela</Text>
                    <Text style={styles.totalValor}>
                      {fmtBRL(valorParcela)} ({parcelasNum}x)
                    </Text>
                  </View>

                  <Text style={styles.btnHint}>
                    * O valor da parcela é calculado automaticamente: Total ÷
                    Parcelas.
                  </Text>
                </View>
              )}

              <TextInput
                style={styles.input}
                placeholder="Forma de pagamento (Pix / Cartão / Dinheiro...)"
                placeholderTextColor={PLACEHOLDER}
                value={pagamento}
                onChangeText={setPagamento}
              />
              <TextInput
                value={previsao}
                onChangeText={(t) => setPrevisao(maskDate(t))}
                placeholder="Previsão de entrega"
                keyboardType="numeric"
                placeholderTextColor={PLACEHOLDER}
                style={styles.input}
              />

              <TouchableOpacity
                style={[styles.btnSalvar, isSaving && { opacity: 0.6 }]}
                onPress={salvarOrcamento}
                disabled={isSaving}
              >
                <Text style={styles.btnSalvarTxt}>
                  {orcamentoId ? "Atualizar Orçamento" : "Salvar Orçamento"}
                </Text>
              </TouchableOpacity>

              <Text style={styles.btnHint}>
                * Salva na “Relação de Orçamentos” e deixa esta tela livre para
                criar outro.
              </Text>
            </View>

            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValor}>{fmtBRL(total)}</Text>
            </View>

            <Text style={styles.sectionTitle}>Relação Selecionada</Text>
          </>
        }
        ListEmptyComponent={
          <Text style={{ color: "#666", textAlign: "center", marginTop: 10 }}>
            Nenhum item encontrado para esse filtro.
          </Text>
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  titulo: {
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 10,
    color: "#111",
  },
  sub: {
    textAlign: "center",
    color: "#666",
    marginBottom: 10,
    fontWeight: "800",
  },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  filtroInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    color: "#111",
    backgroundColor: "#fff",
  },
  printBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "#111",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  printTxt: { color: "#fff", fontWeight: "800", fontSize: 12 },

  sectionTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#111",
    marginBottom: 6,
  },
  label: {
    marginTop: 10,
    color: "#111",
    fontWeight: "900",
  },

  rowPay: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
    marginBottom: 10,
  },
  payBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#111",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  payBtnActive: {
    backgroundColor: "#111",
  },
  payTxt: {
    fontWeight: "900",
    color: "#111",
  },
  payTxtActive: {
    color: "#fff",
  },

  card: {
    ...FORM_CARD,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#eee",
    marginBottom: 12,
  },

  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 10,
    borderRadius: 10,
    marginTop: 8,
    color: "#111",
    backgroundColor: "#fff",
  },

  botao: {
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#bfa140",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  botaoTexto: { color: "#bfa140", fontWeight: "900", letterSpacing: 0.3 },

  hint: { marginTop: 8, color: "#444", fontSize: 12, lineHeight: 16 },

  btnSalvar: {
    marginTop: 12,
    backgroundColor: "#111",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  btnSalvarTxt: { color: "#fff", fontWeight: "900", letterSpacing: 0.3 },
  btnHint: {
    marginTop: 6,
    color: "#555",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 16,
  },

  totalCard: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fff",
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: { color: "#111", fontWeight: "900" },
  totalValor: { color: "#111", fontWeight: "900", fontSize: 16 },

  itemLinha: {
    backgroundColor: "#fff",
    padding: 12,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    marginBottom: 10,
  },
  itemTitulo: { fontSize: 15, fontWeight: "800", color: "#111" },
  itemSub: { fontSize: 12, color: "#666", marginTop: 3 },
});
