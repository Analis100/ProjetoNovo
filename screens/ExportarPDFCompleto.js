import React from "react";
import { View, Button, Alert, StyleSheet, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Print from "expo-print";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

/* util */
const fmtR = (v) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ExportarPDFCompleto() {
  /* gera HTML grandão */
  const gerarHTML = async () => {
    const r = JSON.parse((await AsyncStorage.getItem("receitas")) || "[]");
    const d = JSON.parse((await AsyncStorage.getItem("despesas")) || "[]");
    const demo = JSON.parse(
      (await AsyncStorage.getItem("demonstrativoMensal")) || "{}"
    );
    const est = JSON.parse((await AsyncStorage.getItem("estoque")) || "[]");

    const tr = (arr, fn) => arr.map(fn).join("");

    const html = `
      <style>
        body{font-family:Arial;font-size:12px}
        h1,h2{text-align:center}
        table{width:100%;border-collapse:collapse;margin-bottom:24px}
        th,td{border:1px solid #aaa;padding:4px;text-align:left}
        th{background:#eee}
      </style>

      <h1>DRD Empresarial – Relatório Completo</h1>

      <h2>Receitas</h2>
      <table><tr><th>Data</th><th>Descrição</th><th>Valor</th></tr>
        ${
          tr(
            r,
            (x) =>
              `<tr><td>${x.data}</td><td>${
                x.descricao
              }</td><td align="right">${fmtR(x.valor)}</td></tr>`
          ) || "<tr><td colspan=3>Nenhuma receita</td></tr>"
        }
      </table>

      <h2>Despesas</h2>
      <table><tr><th>Data</th><th>Descrição</th><th>Valor</th></tr>
        ${
          tr(
            d,
            (x) =>
              `<tr><td>${x.data}</td><td>${
                x.descricao
              }</td><td align="right">${fmtR(x.valor)}</td></tr>`
          ) || "<tr><td colspan=3>Nenhuma despesa</td></tr>"
        }
      </table>

      <h2>Demonstrativo Diário</h2>
      <table><tr><th>Data</th><th>Receita</th><th>Despesa</th><th>Saldo</th><th>%</th></tr>
        ${
          Object.keys(demo).length
            ? Object.entries(demo)
                .map(([data, v]) => {
                  const perc = v.receitas
                    ? (((v.receitas - v.despesas) / v.receitas) * 100).toFixed(
                        1
                      ) + "%"
                    : "-";
                  return `<tr><td>${data}</td><td align="right">${fmtR(
                    v.receitas
                  )}</td><td align="right">${fmtR(
                    v.despesas
                  )}</td><td align="right">${fmtR(
                    v.saldoFinal
                  )}</td><td align="right">${perc}</td></tr>`;
                })
                .join("")
            : "<tr><td colspan=5>Sem dados</td></tr>"
        }
      </table>

      <h2>Controle de Estoque em Exposição</h2>
      <table><tr><th>Código</th><th>Descrição</th><th>Entrada</th><th>Saída</th><th>Exposição</th></tr>
        ${
          tr(est, (e) => {
            const expo = e.entrada - e.saida;
            return `<tr><td>${e.codigo}</td><td>${e.descricao}</td><td align="right">${e.entrada}</td><td align="right">${e.saida}</td><td align="right">${expo}</td></tr>`;
          }) || "<tr><td colspan=5>Sem dados</td></tr>"
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
      const destino =
        FileSystem.cacheDirectory + `Relatorio_DRD_${Date.now()}.pdf`;
      await FileSystem.copyAsync({ from: uri, to: destino });

      const opts =
        Platform.OS === "ios"
          ? { UTI: "com.adobe.pdf", mimeType: "application/pdf" }
          : { mimeType: "application/pdf" };

      await Sharing.shareAsync(destino, opts);
    } catch (e) {
      console.error("Erro ao gerar PDF:", e);
      Alert.alert("Erro", "Não foi possível gerar o PDF.");
    }
  };

  return (
    <View style={styles.container}>
      <Button title="Gerar & Compartilhar PDF Completo" onPress={gerarPDF} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24 },
});
