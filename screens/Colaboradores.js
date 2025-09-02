// screens/Colaboradores.js
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import {
  getSalesForCollaborator,
  monthKey as mkUtil,
} from "./services/colabSales";

const STORAGE_KEY = "@colaboradores_v2";

// ---------- helpers ----------
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const onlyDigits = (s = "") => (s || "").replace(/\D+/g, "");

const formatCurrencyBRL = (cents) =>
  (Number(cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });

const toBRDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "-";

const monthKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const maskPhoneBR = (v) => {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10)
    return d.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").trim();
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3").trim();
};

// calcula comissão estimada (centavos)
const estimateCommissionCents = (tipo, fixoCents, percentInt, vendasCents) =>
  tipo === "fixo"
    ? Number(fixoCents || 0)
    : Math.round((Number(percentInt || 0) / 100) * Number(vendasCents || 0));

// ---------- componente ----------
export default function Colaboradores() {
  const [tab, setTab] = useState("ativos"); // "ativos" | "inativos"
  const [lista, setLista] = useState([]);
  const [busca, setBusca] = useState("");

  // modal / form
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showDate, setShowDate] = useState(false);

  // senha (inline overlay dentro do form)
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [senhaDigitada, setSenhaDigitada] = useState("");
  const [acaoPendente, setAcaoPendente] = useState(null); // 'inativar' | 'reativar' | 'excluir'

  // campos
  const [admissao, setAdmissao] = useState(new Date());
  const [nome, setNome] = useState("");
  const [endereco, setEndereco] = useState("");
  const [telefone, setTelefone] = useState("");
  const [funcao, setFuncao] = useState("");
  const [info, setInfo] = useState("");

  const [salarioCents, setSalarioCents] = useState(0);
  const [salarioInput, setSalarioInput] = useState("R$ 0,00");

  // comissão
  const [comissaoTipo, setComissaoTipo] = useState("fixo"); // "fixo" | "percentual"
  const [comissaoFixoInput, setComissaoFixoInput] = useState("R$ 0,00");
  const [comissaoFixoCents, setComissaoFixoCents] = useState(0);

  // Percentual como inteiro 0..100, input "00%"
  const [comissaoPercentInput, setComissaoPercentInput] = useState(""); // ex.: "10%"
  const [comissaoPercent, setComissaoPercent] = useState(0); // 10 => 10%

  // base mantida internamente (sem campo de edição)
  const [comissaoBase] = useState("sobre produção");

  // metas do mês
  const [metaMesInput, setMetaMesInput] = useState("R$ 0,00");
  const [metaMesCents, setMetaMesCents] = useState(0);
  const [vendasMesInput, setVendasMesInput] = useState("R$ 0,00");
  const [vendasMesCents, setVendasMesCents] = useState(0);

  // carregar
  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      setLista(raw ? JSON.parse(raw) : []);
    })();
  }, []);

  const persist = async (next) => {
    setLista(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  // máscaras moeda (R$ 0,00)
  const onChangeMoney = (txt, setterInput, setterCents) => {
    const cents = Number(onlyDigits(txt));
    setterCents(cents);
    setterInput(formatCurrencyBRL(cents));
  };

  // máscara percentual "00%"
  const onChangePercent = (txt) => {
    const digits = onlyDigits(txt).slice(0, 3);
    const n = Math.min(100, Number(digits || 0));
    setComissaoPercentInput(n ? `${n}%` : "");
    setComissaoPercent(n);
  };

  // abrir modal novo
  const openNovo = () => {
    setEditing(null);
    setAdmissao(new Date());
    setNome("");
    setEndereco("");
    setTelefone("");
    setFuncao("");
    setInfo("");

    setSalarioCents(0);
    setSalarioInput("R$ 0,00");

    setComissaoTipo("fixo");
    setComissaoFixoCents(0);
    setComissaoFixoInput("R$ 0,00");
    setComissaoPercent(0);
    setComissaoPercentInput("");

    setMetaMesCents(0);
    setMetaMesInput("R$ 0,00");
    setVendasMesCents(0);
    setVendasMesInput("R$ 0,00");

    setModalVisible(true);
  };

  // abrir modal editar (auto-carrega vendas do mês)
  const openEditar = async (c) => {
    const mk = monthKey();
    const vendasAuto = await getSalesForCollaborator(c.id, mk);

    setEditing(c);
    setAdmissao(c.admissao ? new Date(c.admissao) : new Date());
    setNome(c.nome || "");
    setEndereco(c.endereco || "");
    setTelefone(c.telefone || "");
    setFuncao(c.funcao || "");
    setInfo(c.info || "");

    setSalarioCents(c.salarioCents || 0);
    setSalarioInput(formatCurrencyBRL(c.salarioCents || 0));

    setComissaoTipo(c.comissao?.tipo || "fixo");
    setComissaoFixoCents(c.comissao?.fixoCents || 0);
    setComissaoFixoInput(formatCurrencyBRL(c.comissao?.fixoCents || 0));

    const p = Math.round(Number(c.comissao?.percent || 0));
    setComissaoPercent(p);
    setComissaoPercentInput(p ? `${p}%` : "");

    const metasExist = c.metas?.[mk] || {
      metaCents: 0,
      vendasCents: 0,
      comissaoEstimCents: 0,
    };
    setMetaMesCents(metasExist.metaCents || 0);
    setMetaMesInput(formatCurrencyBRL(metasExist.metaCents || 0));

    const vendasFinal = vendasAuto || metasExist.vendasCents || 0;
    setVendasMesCents(vendasFinal);
    setVendasMesInput(formatCurrencyBRL(vendasFinal));

    setModalVisible(true);
  };

  // pedir senha para ação (mostra overlay inline)
  const pedirSenha = (acao) => {
    setAcaoPendente(acao); // 'inativar' | 'reativar' | 'excluir'
    setSenhaDigitada("");
    setSenhaVisivel(true);
  };

  const confirmarSenhaAcao = async () => {
    const senhaSalva = (await AsyncStorage.getItem("senhaApp")) || "1234";
    if (senhaDigitada !== senhaSalva) {
      setSenhaVisivel(false);
      setSenhaDigitada("");
      Alert.alert("Senha incorreta", "Operação não realizada.");
      return;
    }
    setSenhaVisivel(false);
    const act = acaoPendente;
    setAcaoPendente(null);
    if (act === "inativar") await inativar();
    else if (act === "reativar") await reativar();
    else if (act === "excluir") await excluir();
  };

  // salvar
  const salvar = async () => {
    if (!nome.trim()) {
      Alert.alert("Atenção", "Informe o nome do colaborador.");
      return;
    }

    const mk = monthKey();

    // calcula comissão estimada para persistir no mês atual
    const comissaoEstimCents = estimateCommissionCents(
      comissaoTipo,
      comissaoFixoCents,
      comissaoPercent,
      vendasMesCents
    );

    const payload = {
      id: editing?.id || uid(),
      ativo: editing?.ativo ?? true,
      admissao: admissao?.toISOString(),
      nome: nome.trim(),
      endereco: endereco.trim(),
      telefone: telefone.trim(),
      funcao: funcao.trim(),
      info: info.trim(),
      salarioCents,
      comissao: {
        tipo: comissaoTipo,
        fixoCents: comissaoFixoCents,
        percent: comissaoPercent, // 10 => 10%
        base: "sobre produção",
      },
      metas: {
        ...(editing?.metas || {}),
        [mk]: {
          metaCents: metaMesCents,
          vendasCents: vendasMesCents,
          comissaoEstimCents, // << persistido
          updatedAt: new Date().toISOString(),
        },
      },
      createdAt: editing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const next = [...lista];
    const idx = next.findIndex((x) => x.id === payload.id);
    if (idx >= 0) next[idx] = payload;
    else next.unshift(payload);
    await persist(next);
    setModalVisible(false);
  };

  const inativar = async () => {
    if (!editing) return;
    const next = lista.map((c) =>
      c.id === editing.id
        ? { ...c, ativo: false, updatedAt: new Date().toISOString() }
        : c
    );
    await persist(next);
    setModalVisible(false);
    setTab("inativos");
  };

  const reativar = async () => {
    if (!editing) return;
    const next = lista.map((c) =>
      c.id === editing.id
        ? { ...c, ativo: true, updatedAt: new Date().toISOString() }
        : c
    );
    await persist(next);
    setModalVisible(false);
    setTab("ativos");
  };

  const excluir = async () => {
    if (!editing) return;
    Alert.alert("Excluir colaborador", "Tem certeza que deseja excluir?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          const next = lista.filter((c) => c.id !== editing.id);
          await persist(next);
          setModalVisible(false);
        },
      },
    ]);
  };

  // exportar PDF
  const exportarPDF = async (colab) => {
    const mk = monthKey();
    const metas = colab.metas?.[mk] || {
      metaCents: 0,
      vendasCents: 0,
      comissaoEstimCents: 0,
    };

    const comissaoTexto =
      colab.comissao?.tipo === "fixo"
        ? `${formatCurrencyBRL(colab.comissao?.fixoCents || 0)} (fixo)`
        : `${Number(colab.comissao?.percent || 0)}%${
            colab.comissao?.base ? ` - ${colab.comissao.base}` : ""
          }`;

    const comissaoEstimCents =
      metas.comissaoEstimCents ??
      estimateCommissionCents(
        colab.comissao?.tipo,
        colab.comissao?.fixoCents,
        colab.comissao?.percent,
        metas.vendasCents
      );

    const html = `
      <html><head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial; padding: 24px; }
          h1 { font-size: 20px; margin: 0 0 16px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
          .box { background:#f7f7ff; border:1px solid #e6e6ff; border-radius:10px; padding:10px; }
          .label { color:#666; font-size:12px }
          .value { font-weight:700; }
          .section { margin-top: 16px; }
        </style>
      </head>
      <body>
        <h1>Ficha do Colaborador</h1>
        <div class="grid">
          <div class="box"><div class="label">Nome</div><div class="value">${
            colab.nome
          }</div></div>
          <div class="box"><div class="label">Função</div><div class="value">${
            colab.funcao || "-"
          }</div></div>
          <div class="box"><div class="label">Admissão</div><div class="value">${toBRDate(
            colab.admissao
          )}</div></div>
          <div class="box"><div class="label">Telefone</div><div class="value">${
            colab.telefone || "-"
          }</div></div>
          <div class="box"><div class="label">Endereço</div><div class="value">${
            colab.endereco || "-"
          }</div></div>
          <div class="box"><div class="label">Salário</div><div class="value">${formatCurrencyBRL(
            colab.salarioCents
          )}</div></div>
          <div class="box"><div class="label">Comissão</div><div class="value">${comissaoTexto}</div></div>
        </div>

        <div class="section">
          <div class="label">Informações complementares</div>
          <div class="box">${colab.info || "-"}</div>
        </div>

        <div class="section">
          <div class="label">Mês ${mk}</div>
          <div class="grid">
            <div class="box"><div class="label">Meta do mês</div><div class="value">${formatCurrencyBRL(
              metas.metaCents || 0
            )}</div></div>
            <div class="box"><div class="label">Vendas do mês</div><div class="value">${formatCurrencyBRL(
              metas.vendasCents || 0
            )}</div></div>
            <div class="box"><div class="label">Comissão estimada</div><div class="value">${formatCurrencyBRL(
              comissaoEstimCents
            )}</div></div>
          </div>
        </div>
      </body></html>
    `;
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri, { mimeType: "application/pdf" });
  };

  // computed
  const ativos = useMemo(() => lista.filter((c) => c.ativo), [lista]);
  const inativos = useMemo(() => lista.filter((c) => !c.ativo), [lista]);

  const data = useMemo(() => {
    const base = tab === "ativos" ? ativos : inativos;
    const q = (busca || "").toLowerCase().trim();
    if (!q) return base;
    return base.filter((c) => (c.nome || "").toLowerCase().includes(q));
  }, [tab, ativos, inativos, busca]);

  const renderItem = ({ item }) => {
    const mk = monthKey();
    const metas = item.metas?.[mk] || {};
    const comissaoLabel =
      item.comissao?.tipo === "fixo"
        ? `${formatCurrencyBRL(item.comissao?.fixoCents || 0)} (fixo)`
        : `${Number(item.comissao?.percent || 0)}% ${
            item.comissao?.base ? `• ${item.comissao.base}` : ""
          }`;

    return (
      <TouchableOpacity style={styles.card} onPress={() => openEditar(item)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardNome}>{item.nome}</Text>
          <Text style={styles.cardLinha}>{item.funcao || "-"}</Text>
          <View style={styles.pillsRow}>
            <Text style={styles.pill}>{toBRDate(item.admissao)}</Text>
            <Text style={styles.pill}>
              {formatCurrencyBRL(item.salarioCents)}
            </Text>
            <Text style={styles.pill}>{comissaoLabel}</Text>
            {!!metas.vendasCents && (
              <Text style={styles.pill}>
                Vendas mês: {formatCurrencyBRL(metas.vendasCents)}
              </Text>
            )}
            {!!metas.comissaoEstimCents && (
              <Text style={styles.pill}>
                Comissão est.: {formatCurrencyBRL(metas.comissaoEstimCents)}
              </Text>
            )}
          </View>
        </View>
        <TouchableOpacity
          onPress={() => exportarPDF(item)}
          style={styles.pdfBtn}
        >
          <Text style={styles.pdfBtnTxt}>PDF</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "ativos" && styles.tabBtnActive]}
          onPress={() => setTab("ativos")}
        >
          <Text
            style={[styles.tabTxt, tab === "ativos" && styles.tabTxtActive]}
          >
            Ativos
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === "inativos" && styles.tabBtnActive]}
          onPress={() => setTab("inativos")}
        >
          <Text
            style={[styles.tabTxt, tab === "inativos" && styles.tabTxtActive]}
          >
            Inativos
          </Text>
        </TouchableOpacity>
      </View>

      {/* Busca */}
      <View style={{ paddingHorizontal: 12, paddingBottom: 6 }}>
        <TextInput
          placeholder="Buscar por nome..."
          value={busca}
          onChangeText={setBusca}
          style={styles.search}
        />
      </View>

      {/* Lista */}
      <FlatList
        data={data}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 120 }}
        ListEmptyComponent={
          <Text style={styles.vazio}>
            {tab === "ativos"
              ? "Nenhum colaborador ativo."
              : "Nenhum colaborador inativo."}
          </Text>
        }
        renderItem={renderItem}
      />

      {/* FAB */}
      {tab === "ativos" && (
        <TouchableOpacity style={styles.fab} onPress={openNovo}>
          <Text style={styles.fabTxt}>+ Novo Colaborador</Text>
        </TouchableOpacity>
      )}

      {/* Modal Form */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalWrap}
        >
          <View style={styles.modalCard}>
            <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
              <Text style={styles.formTitle}>
                {editing ? "Editar colaborador" : "Novo colaborador"}
              </Text>

              {/* Admissão */}
              <Text style={styles.label}>Data de admissão</Text>
              <TouchableOpacity
                onPress={() => setShowDate(true)}
                style={styles.dateBtn}
              >
                <Text style={styles.dateTxt}>
                  {toBRDate(admissao?.toISOString())}
                </Text>
              </TouchableOpacity>
              {showDate && (
                <DateTimePicker
                  value={admissao}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(e, d) => {
                    setShowDate(false);
                    if (d) setAdmissao(d);
                  }}
                />
              )}

              {/* Nome */}
              <Text style={styles.label}>Nome</Text>
              <TextInput
                value={nome}
                onChangeText={setNome}
                placeholder="Nome completo"
                style={styles.input}
              />

              {/* Endereço */}
              <Text style={styles.label}>Endereço</Text>
              <TextInput
                value={endereco}
                onChangeText={setEndereco}
                placeholder="Rua, número, bairro, cidade"
                style={styles.input}
              />

              {/* Telefone */}
              <Text style={styles.label}>Telefone</Text>
              <TextInput
                value={telefone}
                onChangeText={(t) => setTelefone(maskPhoneBR(t))}
                placeholder="(00) 00000-0000"
                keyboardType="phone-pad"
                style={styles.input}
                maxLength={15}
              />

              {/* Função */}
              <Text style={styles.label}>Função</Text>
              <TextInput
                value={funcao}
                onChangeText={setFuncao}
                placeholder="Ex.: Vendedor"
                style={styles.input}
              />

              {/* Salário */}
              <Text style={styles.label}>Valor do salário</Text>
              <TextInput
                value={salarioInput}
                onChangeText={(t) =>
                  onChangeMoney(t, setSalarioInput, setSalarioCents)
                }
                placeholder="R$ 0,00"
                keyboardType="numeric"
                style={styles.input}
              />

              {/* Comissão (2 colunas, botão em cima e campo embaixo) */}
              <Text style={styles.label}>Comissão</Text>
              <View style={styles.rowCols}>
                {/* Fixo (R$) */}
                <View style={styles.colBox}>
                  <TouchableOpacity
                    style={[
                      styles.toggle,
                      comissaoTipo === "fixo" && styles.toggleActive,
                    ]}
                    onPress={() => setComissaoTipo("fixo")}
                  >
                    <Text
                      style={[
                        styles.toggleTxt,
                        comissaoTipo === "fixo" && styles.toggleTxtActive,
                      ]}
                    >
                      Fixo (R$)
                    </Text>
                  </TouchableOpacity>

                  <TextInput
                    value={comissaoFixoInput}
                    onChangeText={(t) =>
                      onChangeMoney(
                        t,
                        setComissaoFixoInput,
                        setComissaoFixoCents
                      )
                    }
                    placeholder="R$ 0,00"
                    keyboardType="numeric"
                    editable={comissaoTipo === "fixo"}
                    style={[
                      styles.input,
                      comissaoTipo !== "fixo" && styles.inputDisabled,
                    ]}
                  />
                </View>

                {/* Percentual (%) */}
                <View style={styles.colBox}>
                  <TouchableOpacity
                    style={[
                      styles.toggle,
                      comissaoTipo === "percentual" && styles.toggleActive,
                    ]}
                    onPress={() => setComissaoTipo("percentual")}
                  >
                    <Text
                      style={[
                        styles.toggleTxt,
                        comissaoTipo === "percentual" && styles.toggleTxtActive,
                      ]}
                    >
                      % Percentual
                    </Text>
                  </TouchableOpacity>

                  <TextInput
                    value={comissaoPercentInput}
                    onChangeText={onChangePercent}
                    placeholder="00%"
                    keyboardType="numeric"
                    editable={comissaoTipo === "percentual"}
                    style={[
                      styles.input,
                      comissaoTipo !== "percentual" && styles.inputDisabled,
                    ]}
                  />
                  {comissaoTipo === "percentual" ? (
                    <Text style={styles.help}>
                      Ex.: 10% aplicado sobre a produção.
                    </Text>
                  ) : null}
                </View>
              </View>

              {/* Metas do mês */}
              <Text style={[styles.label, { marginTop: 14 }]}>
                Metas do mês ({monthKey()})
              </Text>
              <TextInput
                value={metaMesInput}
                onChangeText={(t) =>
                  onChangeMoney(t, setMetaMesInput, setMetaMesCents)
                }
                placeholder="R$ 0,00"
                keyboardType="numeric"
                style={styles.input}
              />

              <Text style={styles.label}>Vendas do mês</Text>
              <View
                style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
              >
                <TextInput
                  value={vendasMesInput}
                  onChangeText={(t) =>
                    onChangeMoney(t, setVendasMesInput, setVendasMesCents)
                  }
                  placeholder="R$ 0,00"
                  keyboardType="numeric"
                  style={[styles.input, { flex: 1 }]}
                />
                <TouchableOpacity
                  style={[
                    styles.btnOk,
                    { paddingVertical: 10, paddingHorizontal: 12 },
                  ]}
                  onPress={async () => {
                    try {
                      if (!editing?.id) return;
                      const mk = mkUtil();
                      const cents = await getSalesForCollaborator(
                        editing.id,
                        mk
                      );
                      setVendasMesCents(cents);
                      setVendasMesInput(formatCurrencyBRL(cents));
                      Alert.alert(
                        "Pronto",
                        "Vendas do mês atualizadas a partir de Receitas."
                      );
                    } catch (e) {
                      Alert.alert("Ops", "Não consegui atualizar agora.");
                    }
                  }}
                >
                  <Text style={styles.btnTxt}>Atualizar de Receitas</Text>
                </TouchableOpacity>
              </View>

              {/* Comissão estimada (ao vivo) */}
              <ResumoComissao
                tipo={comissaoTipo}
                fixoCents={comissaoFixoCents}
                percent={comissaoPercent}
                vendasCents={vendasMesCents}
              />

              {/* Info */}
              <Text style={styles.label}>Informações complementares</Text>
              <TextInput
                value={info}
                onChangeText={setInfo}
                placeholder="Observações, horários, etc."
                multiline
                style={[styles.input, { height: 90, textAlignVertical: "top" }]}
              />

              {/* Ações */}
              <View style={{ height: 12 }} />
              <View style={styles.actionsRow}>
                {editing?.ativo && (
                  <TouchableOpacity
                    style={styles.btnWarn}
                    onPress={() => pedirSenha("inativar")}
                  >
                    <Text style={styles.btnTxt}>Inativar</Text>
                  </TouchableOpacity>
                )}
                {editing && !editing.ativo && (
                  <TouchableOpacity
                    style={styles.btnOk}
                    onPress={() => pedirSenha("reativar")}
                  >
                    <Text style={styles.btnTxt}>Reativar</Text>
                  </TouchableOpacity>
                )}
                {editing && (
                  <TouchableOpacity
                    style={styles.btnDanger}
                    onPress={() => pedirSenha("excluir")}
                  >
                    <Text style={styles.btnTxt}>Excluir</Text>
                  </TouchableOpacity>
                )}
                <View style={{ flex: 1 }} />
                <TouchableOpacity
                  style={styles.btnGhost}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.btnGhostTxt}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnSave} onPress={salvar}>
                  <Text style={styles.btnTxt}>Salvar</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            {/* ==== OVERLAY DE SENHA INLINE ==== */}
            {senhaVisivel && (
              <View style={styles.inlineOverlay}>
                <View style={styles.inlineBox}>
                  <Text style={styles.inlineTitulo}>Digite a senha</Text>
                  <TextInput
                    placeholder="Senha"
                    secureTextEntry
                    value={senhaDigitada}
                    onChangeText={setSenhaDigitada}
                    style={styles.inlineInput}
                    autoFocus
                  />
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      style={[styles.btnGhost, { flex: 1 }]}
                      onPress={() => {
                        setSenhaVisivel(false);
                        setSenhaDigitada("");
                        setAcaoPendente(null);
                      }}
                    >
                      <Text style={styles.btnGhostTxt}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btnOk, { flex: 1 }]}
                      onPress={confirmarSenhaAcao}
                    >
                      <Text style={styles.btnTxt}>Confirmar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
            {/* ==== /OVERLAY DE SENHA INLINE ==== */}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// bloco pequeno para mostrar a comissão estimada
function ResumoComissao({ tipo, fixoCents, percent, vendasCents }) {
  const estimada =
    tipo === "fixo"
      ? Number(fixoCents || 0)
      : Math.round((Number(percent || 0) / 100) * Number(vendasCents || 0));
  return (
    <View style={styles.resumo}>
      <Text style={styles.resumoTxt}>
        Comissão estimada:{" "}
        <Text style={{ fontWeight: "800" }}>{formatCurrencyBRL(estimada)}</Text>
      </Text>
    </View>
  );
}

// ---------- estilos ----------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  tabs: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 6,
  },
  tabBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "#eee",
  },
  tabBtnActive: { backgroundColor: "#4f46e5" },
  tabTxt: { fontWeight: "600", color: "#444" },
  tabTxtActive: { color: "#fff" },

  search: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },

  vazio: {
    textAlign: "center",
    color: "#777",
    marginTop: 40,
    fontSize: 15,
  },

  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#f8f8ff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#ececff",
  },
  pdfBtn: {
    backgroundColor: "#111827",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  pdfBtnTxt: { color: "#fff", fontWeight: "700" },
  cardNome: { fontSize: 16, fontWeight: "700", color: "#111" },
  cardLinha: { color: "#444", marginTop: 2 },
  pillsRow: { flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" },
  pill: {
    backgroundColor: "#e9e9ff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    color: "#333",
    fontSize: 12,
  },

  fab: {
    position: "absolute",
    right: 16,
    bottom: 20,
    backgroundColor: "#4f46e5",
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 18,
    elevation: 3,
  },
  fabTxt: { color: "#fff", fontWeight: "700" },

  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "flex-end",
  },
  modalCard: {
    maxHeight: "92%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    overflow: "visible",
  },
  formTitle: { fontSize: 18, fontWeight: "800", marginBottom: 8 },
  label: { marginTop: 10, fontWeight: "600", color: "#222", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: "#fff",
    marginBottom: 8,
  },
  inputDisabled: {
    backgroundColor: "#f7f7f7",
    opacity: 0.6,
  },
  dateBtn: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
  },
  dateTxt: { fontSize: 15, color: "#111" },

  // Comissão (layout de duas colunas, botão em cima e campo embaixo)
  rowCols: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    marginBottom: 4,
  },
  colBox: { flex: 1 },

  toggle: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#fff",
    marginBottom: 6,
  },
  toggleActive: { backgroundColor: "#eef", borderColor: "#99f" },
  toggleTxt: { fontWeight: "600", color: "#333" },
  toggleTxtActive: { color: "#223" },

  help: { color: "#6b7280", fontSize: 12, marginTop: -2, marginBottom: 6 },

  resumo: {
    backgroundColor: "#f1f5f9",
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
    marginBottom: 6,
  },
  resumoTxt: { color: "#111" },

  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  btnSave: {
    backgroundColor: "#16a34a",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  btnWarn: {
    backgroundColor: "#f59e0b",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  btnOk: {
    backgroundColor: "#3b82f6",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  btnDanger: {
    backgroundColor: "#ef4444",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  btnGhost: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#fff",
  },
  btnTxt: { color: "#fff", fontWeight: "700" },
  btnGhostTxt: { color: "#111", fontWeight: "700" },

  // Overlay inline de senha (aparece por cima do form)
  inlineOverlay: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    zIndex: 9999,
    elevation: 10,
  },
  inlineBox: {
    backgroundColor: "#fff",
    width: "88%",
    borderRadius: 12,
    padding: 18,
  },
  inlineTitulo: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 10,
  },
  inlineInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    marginBottom: 12,
  },
});
