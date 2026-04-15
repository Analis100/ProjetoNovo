// screens/Orcamento.js
import React, {
  useCallback,
  useMemo,
  useState,
  useEffect,
  useRef,
} from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  TextInput,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

const KEY_ORCAMENTO_ATUAL = "@orcamento_atual";
const KEY_LIMPAR_PENDENTE = "@orcamento_limpar_pendente";

const fmtBRL = (v) =>
  Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const safeJSON = (raw, fallback) => {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const asNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export default function Orcamento({ navigation, route }) {
  const [itens, setItens] = useState([]);
  const [selecionados, setSelecionados] = useState([]); // ids

  // ✅ refs para evitar corrida entre payloads (materiais x serviço)
  const lastMatPayloadRef = useRef(null);
  const lastServPayloadRef = useRef(null);

  // ✅ ref com a lista MAIS ATUAL (evita salvar por cima com lista velha)
  const itensRef = useRef([]);
  useEffect(() => {
    itensRef.current = Array.isArray(itens) ? itens : [];
  }, [itens]);

  // ✅ fila/lock para evitar corrida entre payloads (materiais x serviço)
  const mergeQueueRef = useRef(Promise.resolve());

  const runInQueue = (fn) => {
    mergeQueueRef.current = mergeQueueRef.current
      .then(fn)
      .catch((e) => console.log("[Orcamento] mergeQueue erro:", e));
    return mergeQueueRef.current;
  };

  const loadStorageList = async () => {
    const raw = await AsyncStorage.getItem(KEY_ORCAMENTO_ATUAL);
    const base = safeJSON(raw, []);
    return Array.isArray(base) ? base : [];
  };

  const salvarLista = async (novaLista) => {
    try {
      const lista = Array.isArray(novaLista) ? novaLista : [];

      // ✅ sincroniza IMEDIATO (evita race)
      itensRef.current = lista;

      setItens(lista);
      await AsyncStorage.setItem(KEY_ORCAMENTO_ATUAL, JSON.stringify(lista));

      console.log(
        "[Orcamento] ✅ salvou KEY_ORCAMENTO_ATUAL itens:",
        lista.length,
      );
    } catch (e) {
      console.log(
        "[Orcamento] ❌ erro ao salvar KEY_ORCAMENTO_ATUAL:",
        e?.message || e,
      );
    }
  };

  const carregar = async () => {
    try {
      const pendente = await AsyncStorage.getItem(KEY_LIMPAR_PENDENTE);

      if (pendente === "1") {
        await AsyncStorage.multiRemove([
          KEY_LIMPAR_PENDENTE,
          KEY_ORCAMENTO_ATUAL,
        ]);

        itensRef.current = [];
        setItens([]);
        setSelecionados([]);
        console.log("[Orcamento] limpou por pendente");
        return;
      }

      const raw = await AsyncStorage.getItem(KEY_ORCAMENTO_ATUAL);
      const arr = safeJSON(raw, []);
      const list = Array.isArray(arr) ? arr : [];

      // ✅ sincroniza ref + state juntos
      itensRef.current = list;
      setItens(list);

      setSelecionados((prev) =>
        prev.filter((id) => list.some((x) => x.id === id)),
      );

      console.log("[Orcamento] carregou do storage itens:", list.length);
    } catch (e) {
      console.log("carregar Orcamento erro:", e);
      itensRef.current = [];
      setItens([]);
      setSelecionados([]);
    }
  };

  useFocusEffect(
    useCallback(() => {
      runInQueue(async () => {
        await carregar();
      });
    }, []),
  );

  // ✅ RECEBER DO RelacionarMateriais e SALVAR no AsyncStorage na hora
  useEffect(() => {
    const payload = route?.params?.materiaisParaOrcamento;
    if (
      !payload ||
      !Array.isArray(payload?.itens) ||
      payload.itens.length === 0
    )
      return;

    // trava para não aplicar duas vezes o mesmo payload
    const payloadKey =
      String(payload?.createdAt || "") +
      ":" +
      String(payload?.itens?.length || 0);
    if (lastMatPayloadRef.current === payloadKey) return;
    lastMatPayloadRef.current = payloadKey;

    (async () => {
      await runInQueue(async () => {
        try {
          console.log(
            "[Orcamento] 🔥 recebeu materiaisParaOrcamento:",
            payload?.itens?.length,
          );

          // 1) SEMPRE lê do storage (fonte da verdade)
          const listaAtual = await loadStorageList();

          // 2) normaliza
          const novos = payload.itens.map((m) => {
            const codigo = String(m?.codigo || "").trim();
            const descricao = String(m?.descricao || "").trim();
            const qtd = asNumber(m?.qtd);
            const valor = asNumber(m?.valorOrcamento ?? m?.custoTotal ?? 0);

            const id = `RM:${codigo}:${descricao}`;

            return {
              id,
              tipo: "material",
              nome: codigo ? `${codigo} — ${descricao}` : descricao || "-",
              valor,
              codigo,
              descricao,
              qtd,
              origem: "RelacionarMateriais",
              createdAt: Date.now(),
              // se você tiver movId para estorno, pode manter aqui:
              movId: m?.movId || null,
              unidade: m?.unidade || m?.und || m?.um || "",
            };
          });

          // 3) mescla
          const map = new Map(listaAtual.map((x) => [x.id, x]));
          for (const n of novos) {
            const ex = map.get(n.id);
            if (ex) {
              map.set(n.id, {
                ...ex,
                qtd: asNumber(ex.qtd) + asNumber(n.qtd),
                valor: asNumber(ex.valor) + asNumber(n.valor),
                updatedAt: Date.now(),
              });
            } else {
              map.set(n.id, n);
            }
          }

          const mesclado = Array.from(map.values());

          // 4) salva
          await salvarLista(mesclado);

          // 5) limpa param
          navigation.setParams({ materiaisParaOrcamento: null });

          console.log(
            "[Orcamento] ✅ materiais mesclados. total itens:",
            mesclado.length,
          );
        } catch (e) {
          console.log(
            "[Orcamento] ❌ erro ao aplicar materiais:",
            e?.message || e,
          );
        }
      });
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.materiaisParaOrcamento]);

  // ✅ RECEBER SERVIÇO do CatálogoServiços e MESCLAR sem apagar nada
  useEffect(() => {
    const serv =
      route?.params?.servicoParaOrcamento ||
      route?.params?.servicoSelecionado ||
      route?.params?.servico ||
      route?.params?.itemServico ||
      route?.params?.item ||
      null;

    if (!serv) return;

    // ✅ trava para não reaplicar o mesmo serviço em loop
    const nomeKey = String(
      serv?.nome || serv?.descricao || serv?.titulo || "",
    ).trim();
    const valorKey = String(
      serv?.valor ?? serv?.preco ?? serv?.valorNumber ?? 0,
    );
    const payloadKey = `SV:${nomeKey}:${valorKey}:${String(route?.params?.createdAt || "")}`;

    if (lastServPayloadRef.current === payloadKey) return;
    lastServPayloadRef.current = payloadKey;

    (async () => {
      await runInQueue(async () => {
        try {
          console.log(
            "[Orcamento] 🔥 recebeu serviço do catálogo:",
            nomeKey || "-",
          );

          // 1) SEMPRE lê do storage (fonte da verdade)
          const listaAtual = await loadStorageList();

          // 2) normaliza
          const nome = nomeKey || "Serviço";
          const valor = asNumber(
            serv?.valor ?? serv?.preco ?? serv?.valorNumber ?? 0,
          );

          const id = `SV:${Date.now()}:${Math.random().toString(16).slice(2)}`;

          const novo = {
            id,
            tipo: "servico",
            nome,
            valor,
            origem: "CatalogoServicos",
            createdAt: Date.now(),
          };

          // 3) append e salva
          const mesclado = [...listaAtual, novo];
          await salvarLista(mesclado);

          // 4) limpa params
          navigation.setParams({
            servicoParaOrcamento: null,
            servicoSelecionado: null,
            servico: null,
            itemServico: null,
            item: null,
            createdAt: null,
          });

          console.log(
            "[Orcamento] ✅ serviço adicionado. total itens:",
            mesclado.length,
          );
        } catch (e) {
          console.log(
            "[Orcamento] ❌ erro ao aplicar serviço:",
            e?.message || e,
          );
        }
      });
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    route?.params?.servicoParaOrcamento,
    route?.params?.servicoSelecionado,
    route?.params?.servico,
    route?.params?.itemServico,
    route?.params?.item,
    route?.params?.createdAt,
  ]);

  const total = useMemo(() => {
    return (Array.isArray(itens) ? itens : []).reduce(
      (s, it) => s + Number(it?.valor || 0),
      0,
    );
  }, [itens]);

  const servicos = useMemo(
    () =>
      (Array.isArray(itens) ? itens : []).filter((i) => i?.tipo === "servico"),
    [itens],
  );
  const materiais = useMemo(
    () =>
      (Array.isArray(itens) ? itens : []).filter((i) => i?.tipo === "material"),
    [itens],
  );

  const toggleSelect = (id) => {
    setSelecionados((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  };

  const limparSelecao = () => setSelecionados([]);

  // ⚠️ Mantido como estava (se você tiver esse helper em outro arquivo, beleza)
  const estornarBaixaMaterial = async ({ movId }) => {
    // Se você já tem esse helper em outro lugar, pode remover este stub.
    // Aqui fica “silencioso” para não quebrar.
    try {
      if (!movId) return;
      console.log("[Orcamento] estornarBaixaMaterial movId:", movId);
    } catch {}
  };

  const removerSelecionados = async () => {
    if (selecionados.length === 0) {
      Alert.alert("Remover", "Selecione pelo menos 1 item.");
      return;
    }

    Alert.alert(
      "Remover",
      `Remover ${selecionados.length} item(ns) do orçamento?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover",
          style: "destructive",
          onPress: async () => {
            const base = Array.isArray(itensRef.current)
              ? itensRef.current
              : [];
            const novaLista = base.filter(
              (it) => !selecionados.includes(it.id),
            );
            const removidos = base.filter((it) => selecionados.includes(it.id));

            for (const r of removidos) {
              if (r?.tipo === "material" && r?.movId) {
                await estornarBaixaMaterial({ movId: r.movId });
              }
            }

            await salvarLista(novaLista);
            limparSelecao();
          },
        },
      ],
    );
  };

  const limparOrcamento = async () => {
    const base = Array.isArray(itensRef.current) ? itensRef.current : [];
    if (!base.length) {
      Alert.alert("Orçamento", "Já está vazio.");
      return;
    }

    Alert.alert("Limpar", "Deseja limpar todo o orçamento?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Limpar",
        style: "destructive",
        onPress: async () => {
          await salvarLista([]);
          limparSelecao();
        },
      },
    ]);
  };

  /* =========================
     ✅ SOMAR MATERIAIS NO SERVIÇO (PROMPT + MODAL)
     ========================= */
  const [modalSomarVisivel, setModalSomarVisivel] = useState(false);
  const [valorMateriaisStr, setValorMateriaisStr] = useState("");
  const [pendingGerar, setPendingGerar] = useState(null);
  // pendingGerar = { itensParaContrato, materiaisBaixa, totalMateriais, servicosSelecionados }

  const parseBRLInput = (txt) => {
    if (typeof txt === "number") return txt;
    const s = String(txt || "").trim();
    if (!s) return 0;
    const n = s
      .replace(/[^\d,.-]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const f = parseFloat(n);
    return Number.isFinite(f) ? f : 0;
  };

  const onlyDigitsMoney = (txt) => {
    // deixa números, vírgula e ponto
    return String(txt || "").replace(/[^\d,\.]/g, "");
  };

  const gerarOrcamento = () => {
    const base = Array.isArray(itensRef.current) ? itensRef.current : [];

    if (!base.length) {
      Alert.alert("Orçamento", "Não há itens no orçamento.");
      return;
    }

    if (!selecionados.length) {
      Alert.alert("Orçamento", "Selecione pelo menos 1 item para gerar.");
      return;
    }

    const selecionadosItens = base.filter((x) =>
      selecionados.includes(String(x?.id || "")),
    );

    if (!selecionadosItens.length) {
      Alert.alert("Orçamento", "Nenhum item selecionado encontrado.");
      return;
    }

    // ✅ 1) itens que aparecem no contrato (apenas selecionados)
    const itensParaContratoBase = selecionadosItens.map((x) => ({ ...x }));

    // ✅ 2) materiais que vão dar baixa no estoque (TODOS os materiais do orçamento)
    const materiaisDoOrcamento = base
      .filter((x) => x?.tipo === "material")
      .map((m) => ({
        codigo: String(m?.codigo || "").trim(),
        descricao: String(m?.descricao || "").trim(),
        qtd: Number(m?.qtd || 0),
        nome: String(m?.nome || "").trim(),
        unidade: String(m?.unidade || "").trim(),
      }))
      .filter((m) => m.codigo && m.qtd > 0);

    // ✅ total de materiais DO PRÉ-ORÇAMENTO (não depende da seleção)
    const totalMateriais = base
      .filter((x) => x?.tipo === "material")
      .reduce((s, it) => s + Number(it?.valor || 0), 0);

    const servicosSelecionados = itensParaContratoBase.filter(
      (i) => i?.tipo === "servico",
    );

    // Se não tem serviço selecionado ou não tem material, segue normal
    if (!servicosSelecionados.length || !(totalMateriais > 0)) {
      navigation.navigate("OrcamentoCliente", {
        itens: itensParaContratoBase,
        materiaisBaixa: materiaisDoOrcamento,
      });
      return;
    }

    Alert.alert(
      "Somar materiais no serviço?",
      `Deseja somar o valor dos materiais no valor do serviço?\n\nTotal materiais (pré-orçamento): ${fmtBRL(
        totalMateriais,
      )}`,
      [
        {
          text: "Não",
          style: "cancel",
          onPress: () => {
            navigation.navigate("OrcamentoCliente", {
              itens: itensParaContratoBase,
              materiaisBaixa: materiaisDoOrcamento,
            });
          },
        },
        {
          text: "Sim",
          onPress: () => {
            // abre modal com o valor sugerido (pode editar)
            setValorMateriaisStr(String(totalMateriais).replace(".", ","));
            setPendingGerar({
              itensParaContrato: itensParaContratoBase,
              materiaisBaixa: materiaisDoOrcamento,
              totalMateriais,
              servicosSelecionados,
            });
            setModalSomarVisivel(true);
          },
        },
      ],
      { cancelable: true },
    );
  };

  const imprimirOrcamento = async () => {
    try {
      const base = Array.isArray(itensRef.current) ? itensRef.current : [];
      if (!base.length) {
        Alert.alert("Imprimir", "Não há itens no orçamento.");
        return;
      }

      const s = base.filter((i) => i?.tipo === "servico");
      const m = base.filter((i) => i?.tipo === "material");

      const totalLocal = base.reduce(
        (acc, it) => acc + Number(it?.valor || 0),
        0,
      );

      const linhasServ = s
        .map(
          (it) => `
            <tr>
              <td>${it?.nome || "-"}</td>
              <td style="text-align:right;">${fmtBRL(it?.valor)}</td>
            </tr>
          `,
        )
        .join("");

      const linhasMat = m
        .map(
          (it) => `
            <tr>
              <td>
                ${it?.codigo ? `<strong>${it.codigo}</strong> — ` : ""}${it?.descricao || it?.nome || "-"}
                ${it?.qtd ? `<div style="color:#666;font-size:11px;margin-top:4px;">Qtd: ${String(it.qtd).replace(".", ",")}</div>` : ""}
              </td>
              <td style="text-align:right;">${fmtBRL(it?.valor)}</td>
            </tr>
          `,
        )
        .join("");

      const html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body { font-family: Arial; padding: 24px; }
              h2 { text-align:center; margin: 0 0 8px 0; }
              .sub { text-align:center; color:#666; margin-bottom: 14px; }
              table { width: 100%; border-collapse: collapse; margin-top: 10px; }
              th, td { border: 1px solid #ccc; padding: 8px; font-size: 12px; vertical-align: top; }
              th { background: #f0f0f0; }
              .total { margin-top: 14px; text-align:right; font-size: 16px; font-weight: 800; }
              .sec { margin-top: 14px; font-weight: 800; }
            </style>
          </head>
          <body>
            <h2>Orçamento</h2>
            <div class="sub">Serviços + Materiais</div>

            ${s.length ? `<div class="sec">Serviços</div>` : ""}
            ${
              s.length
                ? `<table>
                    <thead><tr><th>Descrição</th><th>Valor</th></tr></thead>
                    <tbody>${linhasServ}</tbody>
                  </table>`
                : `<div style="color:#666; font-size:12px;">Nenhum serviço inserido.</div>`
            }

            ${m.length ? `<div class="sec">Materiais</div>` : ""}
            ${
              m.length
                ? `<table>
                    <thead><tr><th>Material</th><th>Valor</th></tr></thead>
                    <tbody>${linhasMat}</tbody>
                  </table>`
                : `<div style="color:#666; font-size:12px;">Nenhum material inserido.</div>`
            }

            <div class="total">Total: ${fmtBRL(totalLocal)}</div>
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
      console.log("Erro imprimirOrcamento:", e);
      Alert.alert("Erro ao imprimir", String(e?.message || e));
    }
  };

  const renderItem = ({ item }) => {
    const selected = selecionados.includes(item.id);
    const tag = item?.tipo === "material" ? "Material" : "Serviço";

    return (
      <TouchableOpacity
        onPress={() => toggleSelect(item.id)}
        style={[
          styles.itemLinha,
          selected && { borderColor: "#111", backgroundColor: "#f5f5f5" },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.itemTitulo}>
            {item?.nome || "-"}{" "}
            <Text style={{ fontWeight: "900" }}>{fmtBRL(item?.valor)}</Text>
          </Text>
          <Text style={styles.itemSub}>
            {tag}
            {item?.tipo === "material" && item?.qtd
              ? ` • Qtd: ${String(item.qtd).replace(".", ",")}`
              : ""}
            {selected ? " • Selecionado" : ""}
          </Text>
        </View>

        <View style={styles.badge}>
          <Text style={styles.badgeTxt}>{selected ? "✓" : "+"}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const Header = (
    <>
      <Text style={styles.titulo}>Pre-Orçamento</Text>

      <TouchableOpacity
        style={[
          styles.smallBtn,
          {
            alignSelf: "flex-end",
            paddingVertical: 6,
            paddingHorizontal: 14,
            backgroundColor: "#111",
            borderColor: "#111",
            marginBottom: 8,
          },
        ]}
        onPress={imprimirOrcamento}
      >
        <Text
          style={[
            styles.smallBtnTxt,
            { color: "#fff", fontSize: 12, fontWeight: "700" },
          ]}
        >
          IMPRIMIR
        </Text>
      </TouchableOpacity>

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValor}>{fmtBRL(total)}</Text>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionDanger]}
          onPress={removerSelecionados}
        >
          <Text style={[styles.actionTxt, { color: "#b91c1c" }]}>
            Remover Selecionado
            {selecionados.length ? ` (${selecionados.length})` : ""}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.actionNeutral]}
          onPress={limparOrcamento}
        >
          <Text style={[styles.actionTxt, { color: "#111" }]}>Limpar Tudo</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.btnGerar} onPress={gerarOrcamento}>
        <Text style={styles.btnGerarTxt}>Gerar Orçamento</Text>
      </TouchableOpacity>

      <Text style={styles.btnHint}>
        toque aqui para gerar orçamento para o cliente
      </Text>

      <Text style={styles.hint}>
        * Toque para selecionar. Remover apaga só os itens marcados.
      </Text>
    </>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#fff" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ flex: 1 }}>
        <FlatList
          data={itens}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 120,
            flexGrow: 1,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={Header}
          ListEmptyComponent={
            <View style={{ padding: 14 }}>
              <Text style={{ color: "#666", textAlign: "center" }}>
                Orçamento vazio. Vá no Catálogo de Serviços e em Materiais para
                inserir.
              </Text>
            </View>
          }
        />

        {/* ✅ Modal: somar materiais no serviço */}
        <Modal
          transparent
          visible={modalSomarVisivel}
          animationType="fade"
          onRequestClose={() => setModalSomarVisivel(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Somar Materiais no Serviço</Text>

              <Text style={styles.modalSub}>
                Informe o valor dos materiais para somar no serviço.
              </Text>

              <TextInput
                value={valorMateriaisStr}
                onChangeText={(t) => setValorMateriaisStr(onlyDigitsMoney(t))}
                placeholder="Ex: 150,00"
                keyboardType="numeric"
                style={styles.modalInput}
                placeholderTextColor="#999"
              />

              <View style={styles.modalRow}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnGhost]}
                  onPress={() => {
                    setModalSomarVisivel(false);
                    setPendingGerar(null);
                  }}
                >
                  <Text style={styles.modalBtnTxtGhost}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnOk]}
                  onPress={() => {
                    try {
                      const p = pendingGerar;
                      if (!p) {
                        setModalSomarVisivel(false);
                        return;
                      }

                      let valorSomar = parseBRLInput(valorMateriaisStr);
                      if (!(valorSomar > 0))
                        valorSomar = Number(p.totalMateriais || 0);

                      const itensFinal = p.itensParaContrato.map((it) => ({
                        ...it,
                      }));

                      // ✅ regra: soma no PRIMEIRO serviço selecionado
                      const primeiroServ = p.servicosSelecionados?.[0];
                      if (primeiroServ?.id) {
                        const idx = itensFinal.findIndex(
                          (x) => x.id === primeiroServ.id,
                        );
                        if (idx >= 0) {
                          const baseValor = Number(itensFinal[idx]?.valor || 0);
                          itensFinal[idx] = {
                            ...itensFinal[idx],
                            valorBaseCatalogo: baseValor,
                            valorMateriaisSomados: valorSomar,
                            somouMateriais: true,
                            valor: baseValor + valorSomar,
                          };
                        }
                      }

                      setModalSomarVisivel(false);
                      setPendingGerar(null);

                      navigation.navigate("OrcamentoCliente", {
                        itens: itensFinal,
                        materiaisBaixa: p.materiaisBaixa,
                      });
                    } catch (e) {
                      console.log("Erro somar materiais:", e);
                      Alert.alert("Erro", "Não foi possível aplicar a soma.");
                    }
                  }}
                >
                  <Text style={styles.modalBtnTxtOk}>Salvar</Text>
                </TouchableOpacity>
              </View>

              {!!pendingGerar?.servicosSelecionados?.length &&
                pendingGerar.servicosSelecionados.length > 1 && (
                  <Text style={styles.modalWarn}>
                    * Você selecionou mais de 1 serviço. A soma será aplicada
                    apenas no primeiro serviço selecionado.
                  </Text>
                )}
            </View>
          </View>
        </Modal>
      </View>
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

  smallBtn: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ccc",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  smallBtnTxt: {
    fontWeight: "800",
    color: "#111",
  },

  totalCard: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fff",
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: { color: "#111", fontWeight: "900" },
  totalValor: { color: "#111", fontWeight: "900", fontSize: 16 },

  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2,
    marginBottom: 6,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  actionDanger: {
    backgroundColor: "#fff",
    borderColor: "#ef4444",
  },
  actionNeutral: {
    backgroundColor: "#fff",
    borderColor: "#111",
  },
  actionTxt: {
    fontWeight: "900",
    fontSize: 12,
  },

  hint: {
    marginTop: 4,
    marginBottom: 10,
    color: "#444",
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
  },

  itemLinha: {
    backgroundColor: "#fff",
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    marginBottom: 10,
  },
  itemTitulo: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111",
  },
  itemSub: {
    fontSize: 12,
    color: "#666",
    marginTop: 3,
  },

  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  badgeTxt: {
    fontWeight: "900",
    color: "#111",
  },

  btnGerar: {
    marginTop: 10,
    backgroundColor: "#111",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  btnGerarTxt: {
    color: "#fff",
    fontWeight: "900",
    letterSpacing: 0.3,
    fontSize: 18,
  },
  btnHint: {
    marginTop: 6,
    marginBottom: 10,
    color: "#555",
    fontSize: 12,
    textAlign: "center",
  },

  // ✅ Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#eee",
  },
  modalTitle: { fontSize: 16, fontWeight: "900", color: "#111" },
  modalSub: { marginTop: 6, color: "#444", fontSize: 12, lineHeight: 16 },

  modalInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: "#111",
    fontWeight: "800",
  },

  modalRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
  },
  modalBtnGhost: { backgroundColor: "#fff", borderColor: "#111" },
  modalBtnOk: { backgroundColor: "#111", borderColor: "#111" },
  modalBtnTxtGhost: { fontWeight: "900", color: "#111" },
  modalBtnTxtOk: { fontWeight: "900", color: "#fff" },

  modalWarn: { marginTop: 10, color: "#666", fontSize: 11 },
});
