// src/screens/ReceitaServicos.js
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
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
import DateTimePicker from "@react-native-community/datetimepicker";

import { addSaleToCollaborator } from "./services/colabSales";
import { getVendorProfile } from "./services/colabProfile";

// utils MEI (✅ mesmo padrão do Vendas: cache mensal por bucket+ym)
import {
  getLimits,
  exigirConfigMeiProporcional,
  loadMonthList,
  saveMonthList,
  yearMonthKey,
} from "../utils/mei";

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { FORM_CARD } from "../styles/formCard";

/* =========================
   Helpers
========================= */
const PLACEHOLDER = "#777";

const maskBRL = (texto) => {
  const digits = (texto || "").replace(/\D/g, "");
  const n = parseInt(digits || "0", 10);
  return (n / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
};

const parseBRL = (masked) => {
  const digits = (masked || "").replace(/\D/g, "");
  return (parseInt(digits || "0", 10) || 0) / 100;
};

const ptBR = (d) =>
  new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

const isSameDay = (d1, d2) =>
  d1.getDate() === d2.getDate() &&
  d1.getMonth() === d2.getMonth() &&
  d1.getFullYear() === d2.getFullYear();

const isSameMonth = (d1, d2) =>
  d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();

const fmtValor = (v) =>
  Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const KEY_SERVICOS = "@receitas_servicos";
const KEY_COLABS = "@colaboradores_v2";

// ✅ bucket do cache mensal MEI para serviços
const MEI_BUCKET = "servicos";

/* =========================
   COMPONENTE
========================= */
export default function ReceitaServicos() {
  const navigation = useNavigation();

  // 🔐 senha única do app
  const SENHA_APP = "1234";

  // 🔐 {/* ✅ Conteúdo só aparece após liberar */}
  const [liberadoAcesso, setLiberadoAcesso] = useState(false);
  const [senhaAcesso, setSenhaAcesso] = useState("");
  const pediuSenhaRef = useRef(false);

  // 🔐 Exclusão (senha + id)
  const [modalSenhaExcluir, setModalSenhaExcluir] = useState(false);
  const [senhaExcluir, setSenhaExcluir] = useState("");
  const [idExcluir, setIdExcluir] = useState(null);

  const [viewMode, setViewMode] = useState("day"); // 'day' | 'month'
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);

  // inputs do lançamento
  const [clienteNome, setClienteNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");

  // filtro (uma linha)
  const [filtroCliente, setFiltroCliente] = useState("");

  const [lista, setLista] = useState([]);
  const [soma, setSoma] = useState(0);

  const [colaboradores, setColaboradores] = useState([]);
  const [colabSelecionado, setColabSelecionado] = useState(null);
  const [modalColab, setModalColab] = useState(false);

  const [vendorProfile, setVendorProfile] = useState(null);
  const isVendor = !!vendorProfile;

  const [limites, setLimites] = useState({
    anual: 81000,
    mensal: 81000 / 12,
    avisos: true,
  });

  // ✅ pede senha só na primeira entrada da tela
  useFocusEffect(
    useCallback(() => {
      // se já pediu a senha nesta sessão da tela, não bloqueia de novo
      if (!pediuSenhaRef.current) {
        pediuSenhaRef.current = true;
        setLiberadoAcesso(false);
        setSenhaAcesso("");
      }

      return () => {};
    }, []),
  );

  useEffect(() => {
    let active = true;

    // só roda quando a tela já estiver liberada
    if (!liberadoAcesso) return () => {};

    // se já passou pela checagem, não roda de novo
    if (meiGateReadyRef.current || checkingMeiGate) return () => {};

    const timer = setTimeout(async () => {
      try {
        if (!active) return;
        setCheckingMeiGate(true);

        const pode = await exigirConfigMeiProporcional({
          navigation,
          origem: "ReceitaServicos",
        });

        if (active && pode) {
          meiGateReadyRef.current = true;
        }
      } catch (e) {
        console.log("[ReceitaServicos] checagem MEI falhou:", e?.message || e);
      } finally {
        if (active) setCheckingMeiGate(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [liberadoAcesso, navigation, checkingMeiGate]);

  function confirmarSenhaAcesso() {
    const ok = senhaAcesso === SENHA_APP;

    if (ok) {
      pediuSenhaRef.current = true;
      setLiberadoAcesso(true);
      setSenhaAcesso("");
    } else {
      Alert.alert("Senha incorreta", "A senha informada está incorreta.");
      setSenhaAcesso("");
    }
  }

  // ✅ PATCH SEGURO: trava 1 clique (evita duplicar salvar em build)
  const [saving, setSaving] = useState(false);

  const meiGateReadyRef = useRef(false);
  const [checkingMeiGate, setCheckingMeiGate] = useState(false);

  /* =========================
     DATA ISO DO LANÇAMENTO (✅ usa selectedDate)
  ========================= */
  const buildItemDateISO = useCallback(() => {
    const d = new Date(selectedDate || new Date());
    // meio-dia reduz chance de “virar o dia” por fuso
    d.setHours(12, 0, 0, 0);
    return d.toISOString();
  }, [selectedDate]);

  /* =========================
     CACHE MEI (lista mensal por bucket+ym)
     - salva itens simples { id, cents, dateISO, origem }
  ========================= */
  const meiAddServico = useCallback(async ({ id, dateISO, valorNumber }) => {
    try {
      const cents = Math.round(Number(valorNumber || 0) * 100);
      if (!(cents > 0)) return;

      const ym = yearMonthKey(new Date(dateISO || new Date()));
      const list = await loadMonthList(MEI_BUCKET, ym);
      const arr = Array.isArray(list) ? [...list] : [];

      // evita duplicar se algo chamar 2x (safe)
      const idStr = String(id);
      const exists = arr.some((x) => String(x?.id) === idStr);
      if (!exists) {
        arr.push({
          id: idStr,
          cents,
          dateISO,
          origem: "ReceitaServicos",
          createdAt: new Date().toISOString(),
        });
        await saveMonthList(MEI_BUCKET, arr, ym);
      }
    } catch (e) {
      console.log("[MEI] meiAddServico falhou:", e?.message || e);
    }
  }, []);

  const meiRemoveServico = useCallback(async ({ id, dateISO }) => {
    try {
      const ym = yearMonthKey(new Date(dateISO || new Date()));
      const list = await loadMonthList(MEI_BUCKET, ym);
      const arr = Array.isArray(list) ? [...list] : [];

      const idStr = String(id);
      const next = arr.filter((x) => String(x?.id) !== idStr);

      // só grava se realmente mudou
      if (next.length !== arr.length) {
        await saveMonthList(MEI_BUCKET, next, ym);
      }
    } catch (e) {
      console.log("[MEI] meiRemoveServico falhou:", e?.message || e);
    }
  }, []);

  /* =========================
     LOAD INICIAL
  ========================= */
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY_COLABS);
        const arr = raw ? JSON.parse(raw) : [];
        setColaboradores(Array.isArray(arr) ? arr.filter((c) => c.ativo) : []);
      } catch {
        setColaboradores([]);
      }

      try {
        const prof = await getVendorProfile();
        if (prof?.collaboratorId) {
          setVendorProfile(prof);
          setColabSelecionado(prof.collaboratorId);
        }
      } catch {}

      try {
        const lim = await getLimits();
        setLimites(lim);
      } catch {}

      carregar();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================
     LOAD LISTA (por data + filtro)
  ========================= */
  const carregar = useCallback(async () => {
    const raw = await AsyncStorage.getItem(KEY_SERVICOS);
    const all = raw ? JSON.parse(raw) : [];

    const getItemDate = (it) => {
      if (it?.dataISO) {
        const d = new Date(it.dataISO);
        if (!Number.isNaN(d.getTime())) return d;
      }

      if (it?.dateISO) {
        const d = new Date(it.dateISO);
        if (!Number.isNaN(d.getTime())) return d;
      }

      if (it?.recebidoEm) {
        const d = new Date(it.recebidoEm);
        if (!Number.isNaN(d.getTime())) return d;
      }

      if (it?.createdAt) {
        const d = new Date(it.createdAt);
        if (!Number.isNaN(d.getTime())) return d;
      }

      if (typeof it?.data === "string") {
        const m = it.data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) {
          const d = new Date(
            Number(m[3]),
            Number(m[2]) - 1,
            Number(m[1]),
            12,
            0,
            0,
            0,
          );
          if (!Number.isNaN(d.getTime())) return d;
        }
      }

      return null;
    };

    const base = Array.isArray(all) ? all : [];

    const filtradosPorData = base.filter((it) => {
      const d = getItemDate(it);
      if (!d) return false;

      return viewMode === "day"
        ? isSameDay(d, selectedDate)
        : isSameMonth(d, selectedDate);
    });

    const alvo = String(filtroCliente || "")
      .trim()
      .toLowerCase();

    const finalList =
      alvo.length > 0
        ? filtradosPorData.filter((it) =>
            String(it?.clienteNome || it?.cliente || "")
              .trim()
              .toLowerCase()
              .includes(alvo),
          )
        : filtradosPorData;

    setLista(finalList);
    setSoma(finalList.reduce((a, c) => a + Number(c.valor || 0), 0));
  }, [filtroCliente, selectedDate, viewMode]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /* =========================
     IMPRIMIR (PDF)
  ========================= */
  const imprimirServicos = async () => {
    try {
      const listaPrint = Array.isArray(lista) ? lista : [];

      if (listaPrint.length === 0) {
        Alert.alert(
          "Nada para imprimir",
          "Não há receitas de serviços neste período.",
        );
        return;
      }

      const titulo =
        viewMode === "day"
          ? `Receita de Serviços – ${ptBR(selectedDate)}`
          : `Receita de Serviços – ${String(selectedDate.getMonth() + 1).padStart(2, "0")}/${selectedDate.getFullYear()}`;

      const getColabNome = (colabId) => {
        const c = (colaboradores || []).find((x) => x.id === colabId);
        return c?.nome || "";
      };

      const linhas = listaPrint
        .map((r) => {
          const dataLinha = r.data || (r.dataISO ? ptBR(r.dataISO) : "");
          const cliente = String(r.clienteNome || "").trim();
          const colabNome = getColabNome(r.colaboradorId);
          const desc = String(r.descricao || "");

          return `
            <tr>
              <td>${dataLinha}</td>
              <td>${cliente || "-"}</td>
              <td>${desc}</td>
              <td>${colabNome || "-"}</td>
              <td style="text-align:right;">${fmtValor(r.valor)}</td>
            </tr>
          `;
        })
        .join("");

      const total = listaPrint.reduce((s, r) => s + Number(r.valor || 0), 0);

      const html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body { font-family: Arial; padding: 24px; }
              h2 { text-align:center; margin-bottom: 10px; }
              .sub { text-align:center; color:#666; margin-top:0; margin-bottom: 12px; font-size: 12px; }
              table { width: 100%; border-collapse: collapse; }
              th, td { border: 1px solid #ccc; padding: 8px; font-size: 12px; }
              th { background: #f0f0f0; }
              .total { margin-top: 16px; text-align:right; font-size: 16px; font-weight: 800; }
            </style>
          </head>
          <body>
            <h2>${titulo}</h2>
            <div class="sub">${
              String(filtroCliente || "").trim()
                ? `Filtro: ${String(filtroCliente).trim()}`
                : "Sem filtro"
            }</div>

            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th>Descrição</th>
                  <th>Colaborador</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                ${linhas}
              </tbody>
            </table>

            <div class="total">Total: ${fmtValor(total)}</div>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(
          "PDF gerado",
          "Seu dispositivo não possui compartilhamento disponível.\n\nArquivo:\n" +
            uri,
        );
        return;
      }

      await Sharing.shareAsync(uri);
    } catch (e) {
      console.log("Erro imprimirServicos:", e);
      Alert.alert("Erro ao gerar PDF", String(e?.message || e));
    }
  };

  /* =========================
     SALVAR
  ========================= */
  const salvar = async () => {
    if (saving || checkingMeiGate) return;
    setSaving(true);

    try {
      Keyboard.dismiss();

      if (!clienteNome.trim()) {
        Alert.alert("Erro", "Informe o nome do cliente.");
        return;
      }

      if (!descricao.trim() || !valor) {
        Alert.alert("Erro", "Preencha descrição e valor.");
        return;
      }

      const valorNum = parseBRL(valor);
      if (valorNum <= 0) {
        Alert.alert("Erro", "Valor inválido.");
        return;
      }

      // segurança extra: se a checagem ainda não tiver sido concluída,
      // tenta uma última vez aqui
      if (!meiGateReadyRef.current) {
        const pode = await exigirConfigMeiProporcional({
          navigation,
          origem: "ReceitaServicos",
        });

        if (!pode) return;
        meiGateReadyRef.current = true;
      }

      const dataISO = buildItemDateISO();

      const novo = {
        id: `srv-${Date.now()}`,
        clienteNome: clienteNome.trim(),
        descricao: descricao.trim(),
        valor: valorNum,
        data: ptBR(dataISO),
        dataISO,
        colaboradorId: isVendor
          ? vendorProfile?.collaboratorId
          : colabSelecionado,
      };

      const raw = await AsyncStorage.getItem(KEY_SERVICOS);
      const parsed = raw ? JSON.parse(raw) : [];
      const base = Array.isArray(parsed) ? parsed : [];

      base.push(novo);
      await AsyncStorage.setItem(KEY_SERVICOS, JSON.stringify(base));

      await meiAddServico({
        id: novo.id,
        dateISO: novo.dataISO,
        valorNumber: novo.valor,
      });

      if (novo.colaboradorId) {
        await addSaleToCollaborator(
          novo.colaboradorId,
          Math.round(valorNum * 100),
          new Date(novo.dataISO),
        );
      }

      setClienteNome("");
      setDescricao("");
      setValor("");
      carregar();
    } finally {
      setSaving(false);
    }
  };

  /* =========================
     EXCLUIR (senha + confirmação final)
  ========================= */
  const confirmarSenhaExcluir = async (forcedId = null) => {
    try {
      const ok = senhaExcluir === SENHA_APP;

      setModalSenhaExcluir(false);
      setSenhaExcluir("");

      if (!ok) {
        Alert.alert("Senha incorreta");
        return;
      }

      const id = forcedId != null ? forcedId : idExcluir;
      if (!id) return;

      const raw = await AsyncStorage.getItem(KEY_SERVICOS);
      const arr = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(arr) ? arr : [];

      const idx = list.findIndex((x) => String(x?.id) === String(id));
      if (idx < 0) return;

      const removed = list[idx];
      list.splice(idx, 1);
      await AsyncStorage.setItem(KEY_SERVICOS, JSON.stringify(list));

      // ✅ ESTORNO no Colaboradores (se este serviço tiver colaborador)
      try {
        const colabId = removed?.colaboradorId || removed?.colabId || null;

        // tenta achar o valor em campos comuns
        const valorServico =
          Number(
            removed?.valorNumber ?? removed?.valor ?? removed?.total ?? 0,
          ) || 0;

        if (colabId && valorServico > 0) {
          await addSaleToCollaborator(
            colabId,
            -Math.round(valorServico * 100), // negativo = estorno
            new Date(removed?.dataISO || Date.now()),
          );
        }
      } catch (e) {
        console.log(
          "Falha ao estornar colaborador (serviço):",
          e?.message || e,
        );
      }

      // ✅ PATCH SEGURO: estorna do cache mensal MEI usando o helper LOCAL
      try {
        await meiRemoveServico({
          id: removed?.id,
          dateISO: removed?.dataISO,
        });
      } catch {}

      setIdExcluir(null);
      carregar();
      Alert.alert("Removido", "Serviço excluído.");
    } catch (e) {
      Alert.alert("Erro", String(e?.message || e));
    }
  };

  // ✅ confirma antes de pedir senha
  const pedirExcluir = (id) => {
    Alert.alert("Confirmar exclusão", "Deseja excluir este serviço?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          setIdExcluir(id);

          setModalSenhaExcluir(true);
        },
      },
    ]);
  };

  /* =========================
     MODAL COLAB
  ========================= */
  const abrirModalColab = () => {
    if (isVendor) {
      Alert.alert(
        "Modo Vendedor",
        "Seu app está configurado como vendedor. O colaborador já vem fixo.",
      );
      return;
    }
    setModalColab(true);
  };

  const nomeColabSelecionado = useMemo(() => {
    const c = (colaboradores || []).find((x) => x.id === colabSelecionado);
    return c?.nome || "";
  }, [colabSelecionado, colaboradores]);

  const getColabName = useCallback(
    (id) => {
      const c = (colaboradores || []).find((x) => x.id === id);
      return c?.nome || "";
    },
    [colaboradores],
  );

  /* =========================
     DATE PICKER
  ========================= */
  const onPick = (_, date) => {
    setShowPicker(false);
    if (date) setSelectedDate(date);
  };

  const tituloTopo = useMemo(() => {
    return viewMode === "day"
      ? `Receita de Serviços – ${ptBR(selectedDate)}`
      : `Receita de Serviços – ${String(selectedDate.getMonth() + 1).padStart(2, "0")}/${selectedDate.getFullYear()}`;
  }, [selectedDate, viewMode]);

  /* =========================
     RENDER ITEM
  ========================= */
  const renderItem = ({ item }) => (
    <View style={styles.itemLinha}>
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={styles.itemLista}>
          {item.clienteNome || item.cliente
            ? `${item.clienteNome || item.cliente} — `
            : ""}
          {item.descricao || item.historico || "Recebimento"} –{" "}
          {fmtValor(item.valor)}
        </Text>

        <Text style={styles.itemSub}>
          {item.data || (item.dataISO ? ptBR(item.dataISO) : "")}
          {item.colaboradorId ? ` • ${getColabName(item.colaboradorId)}` : ""}
        </Text>
      </View>

      <TouchableOpacity onPress={() => pedirExcluir(item.id)}>
        <Text style={styles.excluir}>Excluir</Text>
      </TouchableOpacity>
    </View>
  );
  /* =========================
     HEADER (minimalista)
  ========================= */
  const Header = (
    <View>
      <Text style={styles.titulo}>{tituloTopo}</Text>

      {/* MEI */}
      <TouchableOpacity
        style={[
          styles.meiBtn,
          {
            borderColor: "#1B5E20",
            borderWidth: 2,
            backgroundColor: "#E8F5E9",
          },
        ]}
        onPress={() =>
          navigation.navigate("CalculoLimiteMEI", {
            refDate: selectedDate?.toISOString?.() || new Date().toISOString(),
            viewMode: "day",
          })
        }
      >
        <Text style={styles.meiBtnTxt}>Ver Cálculo do Limite MEI</Text>
      </TouchableOpacity>

      {/* Linha: Filtro + Dia/Mês + Data + Imprimir */}
      <View style={styles.filtersRow}>
        <TextInput
          style={[styles.input, styles.filterInput]}
          placeholder="Cliente (filtro)"
          placeholderTextColor={PLACEHOLDER}
          value={filtroCliente}
          onChangeText={setFiltroCliente}
          returnKeyType="done"
        />

        <View style={styles.segmentMini}>
          <TouchableOpacity
            style={[
              styles.segMiniBtn,
              viewMode === "day" && styles.segMiniBtnActive,
            ]}
            onPress={() => setViewMode("day")}
          >
            <Text
              style={[
                styles.segMiniTxt,
                viewMode === "day" && styles.segMiniTxtActive,
              ]}
            >
              Dia
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.segMiniBtn,
              viewMode === "month" && styles.segMiniBtnActive,
            ]}
            onPress={() => setViewMode("month")}
          >
            <Text
              style={[
                styles.segMiniTxt,
                viewMode === "month" && styles.segMiniTxtActive,
              ]}
            >
              Mês
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.dateBtn}
          onPress={() => setShowPicker(true)}
        >
          <Text style={styles.dateBtnTxt}>{ptBR(selectedDate)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.printBtn} onPress={imprimirServicos}>
          <Text style={styles.printBtnTxt}>IMPRIMIR</Text>
        </TouchableOpacity>
      </View>

      {/* Form */}
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          placeholder="Nome do Cliente"
          placeholderTextColor={PLACEHOLDER}
          value={clienteNome}
          onChangeText={setClienteNome}
          returnKeyType="next"
        />

        <TouchableOpacity
          style={styles.colabBtn}
          onPress={abrirModalColab}
          activeOpacity={0.9}
        >
          <Text style={styles.colabBtnTxt}>
            {isVendor
              ? "Colaborador (Vendedor): fixo"
              : nomeColabSelecionado
                ? `Colaborador: ${nomeColabSelecionado}`
                : "Selecionar Colaborador"}
          </Text>
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          placeholder="Descrição"
          placeholderTextColor={PLACEHOLDER}
          value={descricao}
          onChangeText={setDescricao}
          returnKeyType="next"
        />

        <TextInput
          style={styles.input}
          placeholder="Valor"
          placeholderTextColor={PLACEHOLDER}
          keyboardType="numeric"
          value={valor}
          onChangeText={(t) => setValor(maskBRL(t))}
          returnKeyType="done"
          onSubmitEditing={salvar}
        />

        <TouchableOpacity
          style={styles.botao}
          onPress={salvar}
          disabled={saving || checkingMeiGate}
        >
          <Text style={styles.botaoTexto}>
            {checkingMeiGate ? "Preparando..." : "Inserir Serviço"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 10 }} />
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
    >
      {showPicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={onPick}
        />
      )}

      <Modal visible={!liberadoAcesso} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={{ fontWeight: "900", marginBottom: 10 }}>
              Acesso restrito
            </Text>

            <Text style={{ color: "#666", marginBottom: 10 }}>
              Digite a senha para acessar esta tela.
            </Text>

            <TextInput
              secureTextEntry
              style={styles.input}
              value={senhaAcesso}
              onChangeText={setSenhaAcesso}
              placeholder="Senha"
              placeholderTextColor={PLACEHOLDER}
              returnKeyType="done"
              onSubmitEditing={confirmarSenhaAcesso}
              autoFocus
            />

            <TouchableOpacity
              style={[styles.botao, { borderColor: "#111" }]}
              onPress={confirmarSenhaAcesso}
            >
              <Text style={[styles.botaoTexto, { color: "#111" }]}>Entrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ✅ Conteúdo só aparece após liberar (ou bypass) */}
      {liberadoAcesso ? (
        <FlatList
          data={lista}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          ListHeaderComponent={Header}
          ListFooterComponent={
            <Text style={styles.total}>Total: {fmtValor(soma)}</Text>
          }
          alwaysBounceVertical={true}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />
      ) : null}

      {/* 🔐 MODAL SENHA (EXCLUIR) */}
      <Modal visible={modalSenhaExcluir} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={{ fontWeight: "800", marginBottom: 8 }}>
              Digite a senha para excluir:
            </Text>

            <TextInput
              secureTextEntry
              style={styles.input}
              value={senhaExcluir}
              onChangeText={setSenhaExcluir}
              placeholder="Senha"
              placeholderTextColor={PLACEHOLDER}
              returnKeyType="done"
              onSubmitEditing={() => confirmarSenhaExcluir(idExcluir)}
              autoFocus
            />

            <TouchableOpacity
              style={[styles.botao, { borderColor: "#111" }]}
              onPress={() => confirmarSenhaExcluir(idExcluir)}
            >
              <Text style={[styles.botaoTexto, { color: "#111" }]}>
                Confirmar
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.botao, { borderColor: "#999" }]}
              onPress={() => {
                setModalSenhaExcluir(false);
                setSenhaExcluir("");
                setIdExcluir(null);
              }}
            >
              <Text style={[styles.botaoTexto, { color: "#999" }]}>
                Cancelar
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL COLAB */}
      <Modal visible={modalColab} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={{ fontWeight: "900", marginBottom: 10 }}>
              Selecionar Colaborador
            </Text>

            <FlatList
              data={colaboradores}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 320 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.colabItem,
                    colabSelecionado === item.id && styles.colabItemActive,
                  ]}
                  onPress={() => {
                    setColabSelecionado(item.id);
                    setModalColab(false);
                  }}
                >
                  <Text
                    style={[
                      styles.colabTxt,
                      colabSelecionado === item.id && styles.colabTxtActive,
                    ]}
                  >
                    {item.nome}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={{ color: "#666" }}>
                  Nenhum colaborador ativo encontrado.
                </Text>
              }
              keyboardShouldPersistTaps="handled"
            />

            <TouchableOpacity
              style={[
                styles.botao,
                {
                  borderColor: "#111",
                  marginTop: 12,
                  backgroundColor: "#f9fafb",
                },
              ]}
              onPress={() => setModalColab(false)}
            >
              <Text
                style={[
                  styles.botaoTexto,
                  { color: "#111", fontWeight: "800" },
                ]}
              >
                Fechar
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

/* =========================
   ESTILOS
========================= */
const styles = StyleSheet.create({
  titulo: {
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 10,
  },

  meiBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
    alignItems: "center",
    backgroundColor: "#E8F5E9",
  },
  meiBtnTxt: {
    fontWeight: "900",
    color: "#111",
    fontSize: 14,
    letterSpacing: 0.2,
  },

  filtersRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },

  filterInput: {
    flex: 1,
    marginTop: 0,
    paddingVertical: 8,
    fontWeight: "900",
    fontSize: 12,
    color: "#111",
  },

  segmentMini: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    overflow: "hidden",
  },
  segMiniBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#fff",
  },
  segMiniBtnActive: {
    backgroundColor: "#111",
  },
  segMiniTxt: {
    fontWeight: "900",
    color: "#111",
    fontSize: 12,
  },
  segMiniTxtActive: {
    color: "#fff",
  },

  dateBtn: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#fff",
  },
  dateBtnTxt: {
    fontWeight: "900",
    color: "#111",
    fontSize: 12,
  },

  printBtn: {
    borderWidth: 1,
    borderColor: "#111",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#111",
  },
  printBtnTxt: {
    fontWeight: "900",
    color: "#fff",
    fontSize: 12,
    letterSpacing: 0.6,
  },

  card: {
    ...FORM_CARD,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#eee",
    marginBottom: 8,
  },

  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    borderRadius: 10,
    marginTop: 8,
    color: "#111",
    backgroundColor: "#fff",
  },

  colabBtn: {
    marginTop: 10,
    borderWidth: 2,
    borderColor: "#4f46e5",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#eef2ff",
  },
  colabBtnTxt: {
    color: "#1f2a8a",
    fontWeight: "900",
  },

  botao: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#bfa140",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  botaoTexto: {
    color: "#bfa140",
    fontWeight: "900",
    letterSpacing: 0.3,
  },

  itemLinha: {
    backgroundColor: "#fff",
    padding: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: "#eee",
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
  },
  itemLista: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111",
  },
  itemSub: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
    fontWeight: "600",
  },
  excluir: {
    color: "red",
    fontWeight: "900",
  },

  total: {
    marginTop: 6,
    fontWeight: "900",
    textAlign: "center",
    fontSize: 16,
    color: "#111",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
  },

  colabItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: "#fff",
  },
  colabItemActive: {
    borderColor: "#4f46e5",
    backgroundColor: "#eef2ff",
  },
  colabTxt: {
    fontWeight: "800",
    color: "#111",
  },
  colabTxtActive: {
    color: "#1f2a8a",
    fontWeight: "900",
  },
});
