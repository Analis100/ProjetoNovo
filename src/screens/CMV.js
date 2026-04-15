// screens/CMV.js
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";

/* ===== helpers ===== */
const formatarMoeda = (valor) =>
  Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });

const toNumberBRLLoose = (v) => {
  if (typeof v === "number") return v;
  if (!v) return 0;
  const s = String(v).trim();
  const n = s
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const f = parseFloat(n);
  return isNaN(f) ? 0 : f;
};

/** custo unitário do estoque (automático) */
const custoUnitarioDoEstoque = (item) => {
  if (!item) return 0;

  if (typeof item.custoUnitarioBase === "number") {
    return Number(item.custoUnitarioBase) || 0;
  }

  const teq = Number(item.totalEntradasQtde || 0);
  const tev = toNumberBRLLoose(item.totalEntradasValor || 0);
  if (teq > 0 && tev > 0) return tev / teq;

  const entrada = Number(item.entrada || 0);
  const saida = Number(item.saida || 0);
  const saldo = entrada - saida;
  const valorTotal = toNumberBRLLoose(item.valorTotal || 0);
  if (saldo > 0 && valorTotal > 0) return valorTotal / saldo;

  return 0;
};

const VENDAS_KEY = "venda";

// 🔑 novo: chave para mandar o lucro estimado para a tela SaldoFinal
const LUCRO_ESTIMADO_KEY = "lucroEstimadoCMV";

// chaves usadas aqui
const ESTOQUE_KEY = "estoque";
const CLIENTES_PRAZO_KEY = "clientesPrazo";

export default function CMV() {
  const [estoque, setEstoque] = useState([]);
  const [valorEstoqueTotal, setValorEstoqueTotal] = useState(0);

  // Receitas: prazo (Ficha) e à vista (Vendas -> origem: "manual")
  const [prazoValorPorCodigo, setPrazoValorPorCodigo] = useState({});
  const [avistaValorPorCodigo, setAvistaValorPorCodigo] = useState({});

  const [refreshing, setRefreshing] = useState(false);
  const [filtroCodigo, setFiltroCodigo] = useState("");

  // modal limpar venda antiga
  const [modalLimpar, setModalLimpar] = useState(false);
  const [codigoParaLimpar, setCodigoParaLimpar] = useState("");

  const carregarDados = async () => {
    try {
      // ===== ESTOQUE =====
      const estoqueJson = await AsyncStorage.getItem(ESTOQUE_KEY);
      const est = estoqueJson ? JSON.parse(estoqueJson) : [];
      setEstoque(Array.isArray(est) ? est : []);

      const totalEstoque = (Array.isArray(est) ? est : []).reduce(
        (acc, it) => acc + toNumberBRLLoose(it.valorTotal || 0),
        0,
      );
      setValorEstoqueTotal(totalEstoque);

      // ===== CLIENTE PRAZO (Fichas) -> valor (prazo)
      const cpJson = await AsyncStorage.getItem(CLIENTES_PRAZO_KEY);
      const clientesObj = cpJson ? JSON.parse(cpJson) : {};

      const mapaPrazoValor = {};
      // coletar códigos presentes em ficha (para whitelisting de vendas à vista)
      const codigosPrazo = new Set();

      if (clientesObj && typeof clientesObj === "object") {
        for (const nome of Object.keys(clientesObj)) {
          const ficha = clientesObj[nome]?.ficha;
          if (!ficha || !ficha.codigoProduto) continue;

          const cod = String(ficha.codigoProduto);
          codigosPrazo.add(cod);

          const val = toNumberBRLLoose(ficha.valorTotal || 0);
          if (val > 0) mapaPrazoValor[cod] = (mapaPrazoValor[cod] || 0) + val;
        }
      }
      setPrazoValorPorCodigo(mapaPrazoValor);

      // ===== whitelist de códigos atuais: estoque OU ficha
      const codigosEstoque = new Set(
        (Array.isArray(est) ? est : [])
          .map((it) => String(it.codigo))
          .filter(Boolean),
      );
      const codigosValidos = new Set([...codigosEstoque, ...codigosPrazo]);

      // ===== VENDAS (à vista) -> origem: "manual" (receita)
      const vendasJson = await AsyncStorage.getItem(VENDAS_KEY);
      const vendas = vendasJson ? JSON.parse(vendasJson) : [];
      const mapaAvistaValor = {};

      for (const v of Array.isArray(vendas) ? vendas : []) {
        if (v?.origem === "manual" && v?.codigo) {
          const cod = String(v.codigo);

          // só considera códigos válidos
          if (!codigosValidos.has(cod)) continue;

          const valor = Number(v.valor || 0);
          if (valor > 0)
            mapaAvistaValor[cod] = (mapaAvistaValor[cod] || 0) + valor;
        }
      }
      setAvistaValorPorCodigo(mapaAvistaValor);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      carregarDados();
    }, []),
  );

  // códigos com receita viva (prazo ou à vista)
  const codigos = useMemo(() => {
    const set = new Set();
    Object.entries(prazoValorPorCodigo || {}).forEach(([c, v]) => {
      if (Number(v) > 0) set.add(String(c));
    });
    Object.entries(avistaValorPorCodigo || {}).forEach(([c, v]) => {
      if (Number(v) > 0) set.add(String(c));
    });
    return Array.from(set);
  }, [prazoValorPorCodigo, avistaValorPorCodigo]);

  const linhas = useMemo(() => {
    return (
      (codigos || [])
        .map((codigo) => {
          const item =
            (estoque || []).find(
              (it) => String(it.codigo) === String(codigo),
            ) || null;

          // quantidade vendida: usando saída do estoque
          const qtdVendida = Number(item?.saida || 0);

          const descricao = item?.descricao || "-";
          const custoUnit = custoUnitarioDoEstoque(item);
          const valorAtualEstoque = toNumberBRLLoose(item?.valorTotal || 0);

          const valorPrazo = Number(prazoValorPorCodigo[codigo] || 0);
          const valorAvista = Number(avistaValorPorCodigo[codigo] || 0);

          const custoTotal = Number(custoUnit) * Number(qtdVendida);
          const receitaTotal = valorPrazo + valorAvista;
          const lucro = receitaTotal - custoTotal;

          return {
            codigo,
            descricao,
            qtdVendida,
            valorPrazo,
            valorAvista,
            valorAtualEstoque,
            custoUnit,
            custoTotal,
            lucro, // 👈 Lucro estimado por código
          };
        })
        // esconde se não houver receita
        .filter(
          (l) => Number(l.valorPrazo || 0) + Number(l.valorAvista || 0) > 0,
        )
    );
  }, [codigos, estoque, prazoValorPorCodigo, avistaValorPorCodigo]);

  // ==== FILTRO POR CÓDIGO ====
  const linhasFiltradas = useMemo(() => {
    const q = String(filtroCodigo || "")
      .trim()
      .toLowerCase();
    if (!q) return linhas;
    return (linhas || []).filter((l) =>
      String(l.codigo || "")
        .toLowerCase()
        .includes(q),
    );
  }, [linhas, filtroCodigo]);

  const totalLucro = useMemo(
    () =>
      (linhasFiltradas || []).reduce((acc, l) => acc + Number(l.lucro || 0), 0),
    [linhasFiltradas],
  );

  // 🔄 novo: sempre que o totalLucro mudar, salva para o SaldoFinal usar
  useEffect(() => {
    const salvarLucroEstimado = async () => {
      try {
        await AsyncStorage.setItem(
          LUCRO_ESTIMADO_KEY,
          JSON.stringify(totalLucro || 0),
        );
      } catch (e) {
        console.log("Erro ao salvar lucroEstimadoCMV:", e);
      }
    };
    salvarLucroEstimado();
  }, [totalLucro]);

  /* ===== PDF ===== */
  const gerarPDF = async () => {
    try {
      const Print = (await import("expo-print")).printToFileAsync;
      const { shareAsync } = await import("expo-sharing");

      // se tiver filtro, o PDF segue o filtro; se não, pega todas as linhas
      const baseLinhas =
        linhasFiltradas && linhasFiltradas.length > 0
          ? linhasFiltradas
          : linhas;

      const linhasHtml = (baseLinhas || [])
        .map((l) => {
          return `
            <tr>
              <td style="padding:6px;border-bottom:1px solid #eee;">${String(
                l.codigo || "",
              )
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")}</td>
              <td style="padding:6px;border-bottom:1px solid #eee;">${String(
                l.descricao || "",
              )
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")}</td>
              <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;">${
                l.qtdVendida || 0
              }</td>
              <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;">${formatarMoeda(
                l.valorAvista,
              )}</td>
              <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;">${formatarMoeda(
                l.valorPrazo,
              )}</td>
              <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;">${formatarMoeda(
                l.custoUnit,
              )}</td>
              <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;">${formatarMoeda(
                l.custoTotal,
              )}</td>
              <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;">${formatarMoeda(
                l.lucro,
              )}</td>
            </tr>
          `;
        })
        .join("");

      const html = `
        <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body {
              font-family: -apple-system, Roboto, Arial, sans-serif;
              padding: 24px;
            }
            h1 {
              font-size: 20px;
              text-align: center;
              margin: 0 0 12px 0;
            }
            .card {
              border: 1px solid #ececff;
              background: #f8f8ff;
              border-radius: 12px;
              padding: 12px;
              margin-bottom: 16px;
            }
            .row {
              display: flex;
              justify-content: space-between;
              margin: 4px 0;
            }
            .label {
              color: #111;
            }
            .value {
              font-weight: 800;
              color: #111;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 8px;
              font-size: 11px;
            }
            th {
              text-align: left;
              padding: 6px;
              background: #fafafa;
              border-bottom: 1px solid #eee;
            }
          </style>
        </head>
        <body>
          <h1>Relatório de CMV</h1>

          <div class="card">
            <div class="row">
              <div class="label">Total de lucro estimado${
                filtroCodigo ? " (filtro)" : ""
              }:</div>
              <div class="value">${formatarMoeda(totalLucro)}</div>
            </div>
            <div class="row">
              <div class="label">Valor total atual em estoque:</div>
              <div class="value">${formatarMoeda(valorEstoqueTotal)}</div>
            </div>
            <div class="row">
              <div class="label">Quantidade de produtos listados:</div>
              <div class="value">${baseLinhas.length}</div>
            </div>
          </div>

          <h2 style="font-size:14px;margin:12px 0 4px;">Detalhamento por código</h2>
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Descrição</th>
                <th style="text-align:right;">Qtd vendida</th>
                <th style="text-align:right;">Venda à vista</th>
                <th style="text-align:right;">Venda a prazo</th>
                <th style="text-align:right;">Custo unit.</th>
                <th style="text-align:right;">Custo total</th>
                <th style="text-align:right;">Lucro</th>
              </tr>
            </thead>
            <tbody>
              ${linhasHtml}
            </tbody>
          </table>
        </body>
        </html>
      `;

      const file = await Print({ html });
      await shareAsync(file.uri);
    } catch (e) {
      Alert.alert(
        "Impressão indisponível",
        "Para gerar PDF, verifique se expo-print e expo-sharing estão instalados.\n\nErro: " +
          (e?.message || e),
      );
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.container, { paddingBottom: 200 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              carregarDados();
            }}
          />
        }
      >
        <Text style={styles.titulo}>CMV – Custo da Mercadoria Vendida</Text>

        {/* Filtro por código */}
        <TextInput
          style={styles.filtroInput}
          placeholder="Filtrar por código do produto..."
          placeholderTextColor="#666"
          value={filtroCodigo}
          onChangeText={setFiltroCodigo}
          returnKeyType="search"
        />

        <View style={styles.rowButtons}>
          <TouchableOpacity style={styles.btnPdf} onPress={gerarPDF}>
            <Text style={styles.btnPdfText}>Imprimir PDF</Text>
          </TouchableOpacity>
        </View>

        {(linhasFiltradas || []).map((l) => (
          <View key={l.codigo} style={styles.bloco}>
            <Text style={styles.item}>
              <Text style={styles.label}>Código:</Text> {l.codigo}
            </Text>
            <Text style={styles.item}>
              <Text style={styles.label}>Descrição:</Text> {l.descricao}
            </Text>

            {!!l.avisoEstorno?.mensagem ? (
              <View style={styles.avisoBox}>
                <Text style={styles.avisoTitle}>Aviso (estorno)</Text>
                <Text style={styles.avisoText}>{l.avisoEstorno.mensagem}</Text>
                <Text style={styles.avisoText}>
                  Total estornado:{" "}
                  <Text style={{ fontWeight: "800" }}>
                    {formatarMoeda(l.avisoEstorno.totalRemovido || 0)}
                  </Text>{" "}
                  • Lançamentos:{" "}
                  <Text style={{ fontWeight: "800" }}>
                    {l.avisoEstorno.qtdLancamentos || 0}
                  </Text>
                </Text>
              </View>
            ) : null}

            <Text style={styles.item}>
              <Text style={styles.label}>Quantidade vendida:</Text>{" "}
              {l.qtdVendida}
            </Text>

            <Text style={styles.item}>
              <Text style={styles.label}>Valor total da venda (à vista):</Text>{" "}
              {formatarMoeda(l.valorAvista)}
            </Text>

            <Text style={styles.item}>
              <Text style={styles.label}>Valor total da venda (Prazo):</Text>{" "}
              {formatarMoeda(l.valorPrazo)}
            </Text>

            <Text style={styles.item}>
              <Text style={styles.label}>Valor atual em estoque:</Text>{" "}
              {formatarMoeda(l.valorAtualEstoque)}
            </Text>

            <Text style={styles.item}>
              <Text style={styles.label}>Custo unitário (estoque):</Text>{" "}
              {formatarMoeda(l.custoUnit)}
            </Text>

            <Text style={styles.item}>
              <Text style={styles.label}>Custo Total:</Text>{" "}
              {formatarMoeda(l.custoTotal)}
            </Text>

            <Text style={styles.item}>
              <Text style={styles.label}>Lucro Bruto Estimado:</Text>{" "}
              {formatarMoeda(l.lucro)}
            </Text>
          </View>
        ))}

        <Text style={styles.totalLucro}>
          Total de Lucro Bruto{filtroCodigo ? " (filtro)" : ""}:{" "}
          {formatarMoeda(totalLucro)}
        </Text>

        <Text style={styles.totalEstoque}>
          Valor total atual em estoque: {formatarMoeda(valorEstoqueTotal)}
        </Text>

        {/* Espaçador bem grande pra não encostar no comando do celular */}
        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: "#fff",
  },
  titulo: { fontSize: 20, fontWeight: "bold", marginBottom: 12 },
  filtroInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 10,
    backgroundColor: "#fff",
    fontWeight: "600",
    color: "#111",
  },

  rowButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "flex-end",
    marginBottom: 10,
  },

  bloco: {
    padding: 16,
    backgroundColor: "#f2f2f2",
    borderRadius: 10,
    marginBottom: 20,
  },
  item: { fontSize: 16, marginBottom: 8 },
  label: { fontWeight: "bold" },
  totalLucro: {
    marginTop: 24,
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    color: "green",
  },
  totalEstoque: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    color: "#444",
  },

  btnPdf: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#4f46e5",
    backgroundColor: "#fff",
  },
  btnPdfText: {
    fontWeight: "700",
    color: "#4f46e5",
    fontSize: 14,
  },

  btnWarn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#b45309",
    backgroundColor: "#fff",
  },
  btnWarnText: {
    fontWeight: "800",
    color: "#b45309",
    fontSize: 14,
  },

  btnClear: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#111",
    backgroundColor: "#fff",
  },
  btnClearText: {
    fontWeight: "800",
    color: "#111",
    fontSize: 14,
  },

  avisoBox: {
    borderWidth: 1,
    borderColor: "#f59e0b",
    backgroundColor: "#fff7ed",
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  avisoTitle: { fontWeight: "900", color: "#b45309", marginBottom: 4 },
  avisoText: { color: "#7c2d12", fontWeight: "700" },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
  },
  modalTitle: { fontSize: 18, fontWeight: "900", marginBottom: 8 },
  modalText: { color: "#333", fontWeight: "600" },
  modalInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontWeight: "700",
    color: "#111",
    backgroundColor: "#fff",
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  modalBtnCancel: {
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  modalBtnOk: {
    borderColor: "#b45309",
    backgroundColor: "#fff7ed",
  },
  modalBtnTextCancel: { fontWeight: "900", color: "#111" },
  modalBtnTextOk: { fontWeight: "900", color: "#b45309" },
});
