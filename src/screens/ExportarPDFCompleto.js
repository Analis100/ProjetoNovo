import React from "react";
import {
  View,
  Text,
  Alert,
  StyleSheet,
  Platform,
  TouchableOpacity,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

/* util */
const fmtR = (v) =>
  Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const safeJSON = (raw, fallback) => {
  try {
    const parsed = raw ? JSON.parse(raw) : fallback;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const pad2 = (n) => String(n).padStart(2, "0");

const toBRFromISO = (iso) => {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
  } catch {
    return "-";
  }
};

// ✅ Vendas no seu app hoje salvam em "venda" (e não "vendas")
const VENDAS_KEY_NOVA = "venda";
const VENDAS_KEY_ANTIGA = "vendas";

export default function ExportarPDFCompleto() {
  /* gera HTML grandão */
  const gerarHTML = async () => {
    // ✅ VENDAS: tenta a key nova primeiro, senão cai na antiga
    const rawVendaNova = await AsyncStorage.getItem(VENDAS_KEY_NOVA);
    let r = safeJSON(rawVendaNova, []);
    if (!Array.isArray(r) || r.length === 0) {
      const rawVendaAntiga = await AsyncStorage.getItem(VENDAS_KEY_ANTIGA);
      const alt = safeJSON(rawVendaAntiga, []);
      if (Array.isArray(alt)) r = alt;
    }

    // despesas + demo + estoque
    const d = safeJSON(await AsyncStorage.getItem("despesas"), []);
    const demo = safeJSON(
      await AsyncStorage.getItem("demonstrativoMensal"),
      {},
    );
    const est = safeJSON(await AsyncStorage.getItem("estoque"), []);

    const tr = (arr, fn) => (Array.isArray(arr) ? arr.map(fn).join("") : "");

    const html = `
      <style>
        body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111}
        h1,h2{text-align:center;margin:12px 0}
        table{width:100%;border-collapse:collapse;margin-bottom:24px}
        th,td{border:1px solid #aaa;padding:6px;text-align:left}
        th{background:#eee}
        .right{text-align:right}
      </style>

      <h1>DRD Empresarial – Relatório Completo</h1>

      <h2>Vendas</h2>
      <table>
        <tr><th>Data</th><th>Descrição</th><th class="right">Valor</th></tr>
        ${
          Array.isArray(r) && r.length
            ? tr(r, (x) => {
                const dataCell =
                  x?.data || (x?.dataISO ? toBRFromISO(x.dataISO) : "-");
                const desc = x?.descricao || "-";
                const val = fmtR(x?.valor);
                return `<tr><td>${dataCell}</td><td>${desc}</td><td class="right">${val}</td></tr>`;
              })
            : `<tr><td colspan="3">Nenhuma venda</td></tr>`
        }
      </table>

      <h2>Despesas</h2>
      <table>
        <tr><th>Data</th><th>Descrição</th><th class="right">Valor</th></tr>
        ${
          Array.isArray(d) && d.length
            ? tr(d, (x) => {
                const dataCell =
                  x?.data || (x?.dataISO ? toBRFromISO(x.dataISO) : "-");
                const desc = x?.descricao || "-";
                const val = fmtR(x?.valor);
                return `<tr><td>${dataCell}</td><td>${desc}</td><td class="right">${val}</td></tr>`;
              })
            : `<tr><td colspan="3">Nenhuma despesa</td></tr>`
        }
      </table>

      <h2>Demonstrativo Diário</h2>
      <table>
        <tr><th>Data</th><th class="right">Venda</th><th class="right">Despesa</th><th class="right">Saldo</th><th class="right">%</th></tr>
        ${
          demo && typeof demo === "object" && Object.keys(demo).length
            ? Object.entries(demo)
                .map(([data, v]) => {
                  const vendas = Number(v?.vendas || 0);
                  const despesas = Number(v?.despesas || 0);
                  const saldo = Number(v?.saldoFinal ?? vendas - despesas);
                  const perc = vendas
                    ? (((vendas - despesas) / vendas) * 100).toFixed(1) + "%"
                    : "-";
                  return `<tr>
                    <td>${data}</td>
                    <td class="right">${fmtR(vendas)}</td>
                    <td class="right">${fmtR(despesas)}</td>
                    <td class="right">${fmtR(saldo)}</td>
                    <td class="right">${perc}</td>
                  </tr>`;
                })
                .join("")
            : `<tr><td colspan="5">Sem dados</td></tr>`
        }
      </table>

      <h2>Controle de Estoque em Exposição</h2>
      <table>
        <tr><th>Código</th><th>Descrição</th><th class="right">Entrada</th><th class="right">Saída</th><th class="right">Exposição</th></tr>
        ${
          Array.isArray(est) && est.length
            ? tr(est, (e) => {
                const entrada = Number(e?.entrada || 0);
                const saida = Number(e?.saida || 0);
                const expo = entrada - saida;
                return `<tr>
                  <td>${e?.codigo || "-"}</td>
                  <td>${e?.descricao || "-"}</td>
                  <td class="right">${entrada}</td>
                  <td class="right">${saida}</td>
                  <td class="right">${expo}</td>
                </tr>`;
              })
            : `<tr><td colspan="5">Sem dados</td></tr>`
        }
      </table>
    `;
    return html;
  };

  /* gera + compartilha */
  const gerarPDF = async () => {
    try {
      const html = await gerarHTML();
      const { uri } = await Print.printToFileAsync({ html });

      const opts =
        Platform.OS === "ios"
          ? { UTI: "com.adobe.pdf", mimeType: "application/pdf" }
          : { mimeType: "application/pdf" };

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, opts);
      } else {
        Alert.alert("PDF gerado", `Arquivo gerado em:\n${uri}`);
      }
    } catch (e) {
      console.error("Erro ao gerar PDF:", e);
      Alert.alert("Erro", "Não foi possível gerar o PDF.");
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.btn, styles.btnPrimary]}
        onPress={gerarPDF}
      >
        <Text style={styles.btnText}>Gerar & Compartilhar PDF Completo</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  btn: {
    width: "100%",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
  },
  btnPrimary: {
    backgroundColor: "#2196F3",
  },
  btnText: {
    color: "#fff",
    fontWeight: "700",
  },
});
