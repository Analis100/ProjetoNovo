// src/screens/RelacionarMateriais.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { KEY_ESTOQUE_MATERIAIS } from "../utils/keys";
import { FORM_CARD } from "../styles/formCard";

const PLACEHOLDER = "#777";
const KEY_RELACIONAR_MATERIAIS_ITENS = "@relacionar_materiais_itens";
const KEY_SERVICE_PACK_PENDENTE = "@service_pack_pendente";
const KEY_SERVICE_PACK_PREFIX = "@service_pack_"; // + servicePackId

const asNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const brMoney = (n) => {
  try {
    return (asNumber(n) || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  } catch {
    return `R$ ${asNumber(n).toFixed(2)}`;
  }
};

// ✅ pega custo unitário ou calcula a partir de total/qtd
function toNumber(v) {
  if (v == null) return 0;
  if (typeof v === "string") {
    const s = v
      .replace(/\s/g, "")
      .replace("R$", "")
      .replace(/\./g, "")
      .replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ✅ Parser simples para "Valor para orçamento"
function parseValorOrcamento(v) {
  if (v == null) return 0;

  const s = String(v)
    .trim()
    .replace(/\s/g, "")
    .replace("R$", "")
    .replace(/\./g, "") // remove separador de milhar
    .replace(",", "."); // troca vírgula por ponto

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function pickNum(item, keys) {
  for (const k of keys) {
    const v = item?.[k];
    const n = toNumber(v);
    if (n > 0) return { key: k, num: n };
  }
  return { key: null, num: 0 };
}

function getCustoUnitario(item) {
  if (!item) return 0;

  // 1) tenta unitário direto (vários nomes possíveis)
  const unitPick = pickNum(item, [
    "custoUnit",
    "custoUnitario",
    "custoUnitNum",
    "custoUnitNumber",
    "valorUnitario",
    "valorUnitarioNum",
    "valorUnitarioNumber",
    "precoCustoUnitario",
    "unitCost",
  ]);
  if (unitPick.num > 0) return unitPick.num;

  function parseDecimalBR(v) {
    if (!v) return 0;
    return Number(String(v).replace(/\./g, "").replace(",", "."));
  }

  // 2) tenta total (vários nomes possíveis)
  const totalPick = pickNum(item, [
    "custoTotal",
    "custoTotalNum",
    "custoTotalNumber",
    "valorTotal",
    "valorTotalNum",
    "valorTotalNumber",
    "total",
    "totalNum",
    "totalNumber",
    "valor",
    "valorNum",
    "valorNumber",
  ]);

  // 3) tenta estoque direto
  const estoquePick = pickNum(item, [
    "estoque",
    "estoqueNum",
    "estoqueNumber",
    "qtdEmEstoque",
    "qtdEmEstoqueNum",
    "qtdEmEstoqueNumber",
    "saldo",
    "saldoNum",
    "saldoNumber",
    "quantidade",
    "quantidadeNum",
    "quantidadeNumber",
    "qtd",
    "qtdNum",
    "qtdNumber",
  ]);

  // 4) se não tiver estoque direto, calcula entrada - saida (vários nomes)
  const entradaPick = pickNum(item, [
    "entrada",
    "entradaNum",
    "entradaNumber",
    "qtdEntrada",
    "qtdEntradaNum",
    "qtdEntradaNumber",
  ]);
  const saidaPick = pickNum(item, [
    "saida",
    "saidaNum",
    "saidaNumber",
    "qtdSaida",
    "qtdSaidaNum",
    "qtdSaidaNumber",
  ]);

  const estoqueCalc = Math.max(0, entradaPick.num - saidaPick.num);

  const totalNum = totalPick.num;
  const estoqueNum = estoquePick.num > 0 ? estoquePick.num : estoqueCalc;

  if (totalNum > 0 && estoqueNum > 0) return totalNum / estoqueNum;

  return 0;
}

function maskMoneyBR(v) {
  const digits = String(v || "").replace(/\D/g, "");
  if (!digits) return "";

  const cents = Number(digits) / 100;
  return cents.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function RelacionarMateriais({ navigation, route }) {
  const codigoParam = route?.params?.codigo ? String(route.params.codigo) : "";

  const [estoque, setEstoque] = useState([]);

  const [codigo, setCodigo] = useState(codigoParam);
  const [descricao, setDescricao] = useState("");
  const [unidade, setUnidade] = useState("");

  const [qtdStr, setQtdStr] = useState("");
  const [valorOrcStr, setValorOrcStr] = useState(""); // opcional, por item

  const [itens, setItens] = useState([]); // lista relacionada
  const hydratedRef = useRef(false);

  // 💾 salva automaticamente os materiais relacionados (após hidratar)
  useEffect(() => {
    if (!hydratedRef.current) return;

    (async () => {
      try {
        await AsyncStorage.setItem(
          KEY_RELACIONAR_MATERIAIS_ITENS,
          JSON.stringify(itens),
        );
      } catch (e) {
        console.log("Falha autosave itens relacionados:", e?.message || e);
      }
    })();
  }, [itens]);

  const qtdNum = useMemo(() => {
    const n = Number(String(qtdStr).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }, [qtdStr]);

  async function carregarItensRelacionados() {
    try {
      const json = await AsyncStorage.getItem(KEY_RELACIONAR_MATERIAIS_ITENS);
      const arr = json ? JSON.parse(json) : [];
      setItens(Array.isArray(arr) ? arr : []);
      hydratedRef.current = true;
    } catch (e) {
      console.log("Falha carregarItensRelacionados:", e?.message || e);
      setItens([]);
      hydratedRef.current = true;
    }
  }

  async function salvarItensRelacionados(novaLista) {
    try {
      await AsyncStorage.setItem(
        KEY_RELACIONAR_MATERIAIS_ITENS,
        JSON.stringify(novaLista),
      );
    } catch (e) {
      console.log("Falha salvarItensRelacionados:", e?.message || e);
    }
  }

  async function carregarEstoque() {
    try {
      const json = await AsyncStorage.getItem(KEY_ESTOQUE_MATERIAIS);
      const parsed = json ? JSON.parse(json) : null;

      let lista = [];

      // 1️⃣ Caso já seja array
      if (Array.isArray(parsed)) {
        lista = parsed;
      }

      // 2️⃣ Caso seja objeto → procurar QUALQUER array dentro
      if (!lista.length && parsed && typeof parsed === "object") {
        const stack = [parsed];

        while (stack.length) {
          const current = stack.pop();

          if (Array.isArray(current)) {
            lista = current;
            break;
          }

          if (current && typeof current === "object") {
            Object.values(current).forEach((v) => {
              if (v && typeof v === "object") stack.push(v);
            });
          }
        }
      }

      console.log(
        "[RelacionarMateriais] estoque_materiais carregado:",
        lista.length,
        "itens",
      );

      if (lista.length) {
        console.log("[RelacionarMateriais] exemplo item:", lista[0]);
      }

      setEstoque(lista);
    } catch (e) {
      console.log(
        "[RelacionarMateriais] erro carregar estoque:",
        e?.message || e,
      );
      setEstoque([]);
    }
  }

  // ✅ Um carregador só (evita corrida)
  useEffect(() => {
    const carregar = async () => {
      await carregarEstoque();
      await carregarItensRelacionados();
    };

    carregar();
    const unsub = navigation.addListener("focus", carregar);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  const normalize = (s) =>
    String(s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const normalizeCode = (v) => {
    const raw = String(v ?? "").trim();
    if (!raw) return { a: "", digits: "", noZeros: "" };

    const a = normalize(raw);

    // só números (pra comparar "001" com "1")
    const digits = raw.replace(/\D+/g, "");
    const noZeros = digits ? String(parseInt(digits, 10)) : ""; // "001" -> "1"

    return { a, digits, noZeros };
  };

  const materialAtual = useMemo(() => {
    const q = normalizeCode(codigo);
    if (!q.a && !q.digits) return null;

    const getCodeFromItem = (m) => {
      const v =
        m?.codigo ??
        m?.cod ??
        m?.codigoMaterial ??
        m?.codigo_material ??
        m?.codMaterial ??
        m?.code ??
        m?.sku ??
        m?.codigo_produto ??
        m?.codigoProduto ??
        m?.id ??
        "";

      return String(v ?? "").trim();
    };

    return (
      estoque.find((m) => {
        const c = normalizeCode(getCodeFromItem(m));
        return (
          (q.a && c.a === q.a) ||
          (q.digits && c.digits === q.digits) ||
          (q.noZeros && c.noZeros === q.noZeros)
        );
      }) || null
    );
  }, [estoque, codigo]);

  const custoUnit = useMemo(
    () => getCustoUnitario(materialAtual),
    [materialAtual],
  );

  const custoCalculado = useMemo(
    () => custoUnit * (qtdNum > 0 ? qtdNum : 0),
    [custoUnit, qtdNum],
  );

  const totalCusto = useMemo(
    () => itens.reduce((acc, it) => acc + asNumber(it.custoTotal), 0),
    [itens],
  );

  // ✅ AUTO: quando encontrar o material pelo código, preenche descrição/unidade
  useEffect(() => {
    if (!materialAtual) return;

    setDescricao(
      String(
        materialAtual.descricao ||
          materialAtual.desc ||
          materialAtual.nome ||
          "",
      ).trim(),
    );

    setUnidade(
      String(
        materialAtual.und ||
          materialAtual.unidade ||
          materialAtual.unidadeMedida ||
          materialAtual.unid ||
          materialAtual.medida ||
          materialAtual.um ||
          materialAtual.un || // ✅
          materialAtual.unMedida || // ✅
          "",
      ).trim(),
    );

    const cod = String(materialAtual.codigo || materialAtual.cod || "").trim();
    if (cod && String(codigo || "").trim() !== cod) setCodigo(cod);
  }, [materialAtual]);

  function limparEntrada() {
    setQtdStr("");
    setValorOrcStr("");
  }

  function adicionarItem() {
    Keyboard.dismiss();

    const cod = String(codigo || "").trim();
    if (!cod) {
      Alert.alert("Informe o código", "Digite o código do material.");
      return;
    }

    if (!materialAtual) {
      Alert.alert(
        "Material não encontrado",
        "Esse código não existe no Estoque de Materiais.",
      );
      return;
    }

    if (!(qtdNum > 0)) {
      Alert.alert(
        "Quantidade obrigatória",
        "Informe a quantidade usada no serviço.",
      );
      return;
    }

    const desc = String(materialAtual.descricao || descricao || "").trim();
    const uni = String(
      materialAtual.und ||
        materialAtual.unidade ||
        materialAtual.medida ||
        unidade ||
        "",
    ).trim();

    const unit = custoUnit;
    if (!(unit > 0)) {
      Alert.alert(
        "Custo não encontrado",
        "Não consegui identificar o custo unitário desse material no estoque.",
      );
      return;
    }

    const total = unit * qtdNum;

    const valorOrcInput = parseValorOrcamento(valorOrcStr);
    const valorOrcamento = valorOrcInput > 0 ? valorOrcInput : total;

    const novo = {
      id: String(Date.now()) + "-" + cod,
      codigo: cod,
      descricao: desc,
      unidade: uni,
      qtd: qtdNum,
      custoUnit: unit,
      custoTotal: total,
      valorOrcamento, // ✅ agora salva correto (5,00 → 5)
      selected: false, // (como você pediu antes)
    };

    setItens((prev) => {
      const novoArr = [novo, ...prev];
      salvarItensRelacionados(novoArr);
      return novoArr;
    });

    limparEntrada();
  }

  function toggleSelect(id) {
    setItens((prev) =>
      prev.map((it) => (it.id === id ? { ...it, selected: !it.selected } : it)),
    );
  }

  function removerItem(id) {
    setItens((prev) => prev.filter((it) => it.id !== id));
  }

  function maskBRL(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "";

    const number = Number(digits) / 100;

    return number.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  function abrirInserirNoOrcamento() {
    if (!itens.length) {
      Alert.alert(
        "Orçamento",
        "Não há materiais salvos para inserir no orçamento.",
      );
      return;
    }

    confirmarInserirNoOrcamento();
  }

  async function confirmarInserirNoOrcamento() {
    if (!itens.length) {
      Alert.alert("Orçamento", "Não há materiais para inserir.");
      return;
    }

    // manda TODOS
    const payload = {
      origem: "RelacionarMateriais",
      createdAt: Date.now(),
      itens: itens.map((it) => ({
        codigo: it.codigo,
        descricao: it.descricao,
        unidade: it.unidade,
        qtd: it.qtd,
        valorOrcamento: it.valorOrcamento ?? it.custoTotal,
      })),
    };

    // ✅ salva pacote pendente do serviço (todos os itens selecionados/enviados)
    const servicePackId = `sp-${payload.createdAt}`;

    try {
      await AsyncStorage.setItem(KEY_SERVICE_PACK_PENDENTE, servicePackId);
      await AsyncStorage.setItem(
        `${KEY_SERVICE_PACK_PREFIX}${servicePackId}`,
        JSON.stringify(payload.itens || []),
      );
    } catch (e) {
      console.log("Falha ao salvar service pack pendente:", e?.message || e);
    }

    navigation.navigate("Orcamento", { materiaisParaOrcamento: payload });

    // limpa para não correr risco de repetir envio
    await AsyncStorage.removeItem(KEY_RELACIONAR_MATERIAIS_ITENS);
    setItens([]);
  }

  const codigoExiste = useMemo(() => {
    const c = String(codigo || "").trim();
    if (!c) return true;
    return !!materialAtual;
  }, [codigo, materialAtual]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#fff" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 190 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <Text style={styles.title}>Relacionar Materiais</Text>

          {/* Card: material (auto pelo código) */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Material (auto pelo código)</Text>

            <TextInput
              value={codigo}
              onChangeText={(t) => setCodigo(String(t || ""))}
              placeholder="Digite o código do material"
              placeholderTextColor={PLACEHOLDER}
              style={[styles.input, !codigoExiste && styles.inputNotFound]}
            />
            {!codigoExiste && (
              <Text style={styles.notFound}>
                ⚠ Código não encontrado no estoque
              </Text>
            )}

            <TextInput
              value={descricao}
              editable={false}
              placeholder="Descrição (auto)"
              placeholderTextColor={PLACEHOLDER}
              style={[styles.input, styles.inputDisabled]}
            />

            <TextInput
              value={unidade}
              editable={false}
              placeholder="Unidade (auto) — un, kg, ml..."
              placeholderTextColor={PLACEHOLDER}
              style={[styles.input, styles.inputDisabled]}
            />

            <Text style={styles.muted}>
              Custo unitário:{" "}
              <Text style={styles.bold}>{brMoney(custoUnit)}</Text>
            </Text>
          </View>

          {/* Card: quantidade + custo calculado + valor para orçamento */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Quantidade usada no serviço</Text>

            <TextInput
              value={qtdStr}
              onChangeText={setQtdStr}
              placeholder="Ex: 2"
              placeholderTextColor={PLACEHOLDER}
              keyboardType="numeric"
              style={styles.input}
            />

            <Text style={styles.muted}>
              Custo calculado:{" "}
              <Text style={styles.bold}>{brMoney(custoCalculado)}</Text>
            </Text>

            <TextInput
              value={valorOrcStr}
              onChangeText={(t) => setValorOrcStr(maskMoneyBR(t))}
              placeholder="Valor para orçamento (opcional) — 0,00"
              placeholderTextColor={PLACEHOLDER}
              keyboardType="numeric"
              style={styles.input}
            />

            <TouchableOpacity style={styles.btnPrimary} onPress={adicionarItem}>
              <Text style={styles.btnPrimaryTxt}>Salvar material</Text>
            </TouchableOpacity>
          </View>

          {/* Lista */}
          <View style={styles.listHeader}>
            <Text style={styles.subtitle}>Materiais relacionados</Text>
            <Text style={styles.total}>
              Total custo:{" "}
              <Text style={styles.totalStrong}>{brMoney(totalCusto)}</Text>
            </Text>
          </View>

          <FlatList
            data={itens}
            keyExtractor={(it) => it.id}
            scrollEnabled={false}
            contentContainerStyle={{ paddingBottom: 10 }}
            renderItem={({ item }) => (
              <View style={styles.itemRow}>
                <TouchableOpacity
                  style={[styles.check, item.selected && styles.checkOn]}
                  onPress={() => toggleSelect(item.id)}
                >
                  <Text
                    style={[
                      styles.checkTxt,
                      item.selected && styles.checkTxtOn,
                    ]}
                  >
                    {item.selected ? "✓" : ""}
                  </Text>
                </TouchableOpacity>

                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>
                    {item.codigo} — {item.descricao}
                  </Text>
                  <Text style={styles.itemSub}>
                    Qtd: {String(item.qtd).replace(".", ",")}{" "}
                    {item.unidade ? `(${item.unidade})` : ""}
                    {"  •  "}
                    Unit: {brMoney(item.custoUnit)}
                    {"  •  "}
                    Custo: {brMoney(item.custoTotal)}
                    {"  •  "}
                    Orç: {brMoney(item.valorOrcamento ?? item.custoTotal)}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.delBtn}
                  onPress={() => removerItem(item.id)}
                >
                  <Text style={styles.delTxt}>Excluir</Text>
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.empty}>
                Ainda não foi relacionado nenhum material.
              </Text>
            }
          />
        </View>
      </ScrollView>

      {/* Footer fixo */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.btnOutline} onPress={carregarEstoque}>
          <Text style={styles.btnOutlineTxt}>Recarregar estoque</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={abrirInserirNoOrcamento}
        >
          <Text style={styles.btnPrimaryTxt}>Inserir no pre-orçamento</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 14 },
  title: { fontSize: 20, fontWeight: "800", marginBottom: 10, color: "#111" },

  card: {
    ...FORM_CARD,
    borderWidth: 1,
    borderColor: "#E5E5E5",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#fff",
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111",
    marginBottom: 8,
  },

  input: {
    borderWidth: 1,
    borderColor: "#E5E5E5",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    fontSize: 14,
    color: "#111",
    backgroundColor: "#fff",
    marginTop: 8,
  },
  inputDisabled: {
    backgroundColor: "#F7F7F7",
    color: "#333",
  },
  inputNotFound: {
    borderColor: "#B00020",
  },
  notFound: {
    color: "#B00020",
    marginTop: 6,
    fontWeight: "800",
  },

  btnPrimary: {
    backgroundColor: "#111",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
  },
  btnPrimaryTxt: { color: "#fff", fontWeight: "800" },

  btnOutline: {
    borderWidth: 1,
    borderColor: "#111",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  btnOutlineTxt: { color: "#111", fontWeight: "800" },

  muted: { color: "#444", marginTop: 8 },
  bold: { fontWeight: "900", color: "#111" },

  listHeader: {
    marginTop: 6,
    marginBottom: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  subtitle: { fontSize: 14, fontWeight: "800", color: "#111" },
  total: { color: "#333" },
  totalStrong: { fontWeight: "900", color: "#111" },

  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#EEE",
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  check: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: "#111" },
  checkTxt: { fontSize: 16, fontWeight: "900", color: "transparent" },
  checkTxtOn: { color: "#fff" },

  itemTitle: { fontWeight: "900", color: "#111" },
  itemSub: { color: "#444", marginTop: 2, fontSize: 12 },

  delBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  delTxt: { color: "#B00020", fontWeight: "800" },

  empty: { color: "#666", marginTop: 10, textAlign: "center" },

  footer: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: Platform.OS === "android" ? 40 : 14,
    gap: 10,
  },
});
