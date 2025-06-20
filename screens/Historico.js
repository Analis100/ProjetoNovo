import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Button,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as MailComposer from "expo-mail-composer";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import * as FileSystem from "expo-file-system";

/* helpers */
const fmtR = (v) =>
  Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const pctLucro = (rec, desp) =>
  rec ? `${(((rec - desp) / rec) * 100).toFixed(1)}% Lucro` : "-";

export default function Historico() {
  const [dados, setDados] = useState([]);

  /* carrega demonstrativo ao abrir */
  useEffect(() => {
    (async () => {
      const json = await AsyncStorage.getItem("demonstrativoMensal");
      const obj = json ? JSON.parse(json) : {};
      const lista = Object.entries(obj).map(([data, valores]) => ({
        data,
        ...valores,
      }));
      setDados(lista);
    })();
  }, []);

  /* corpo texto (fallback) */
  const gerarTexto = () =>
    dados
      .map(
        (d) =>
          `📅 ${d.data} | Receita: ${fmtR(d.receitas)} | Despesa: ${fmtR(
            d.despesas
          )} | Saldo: ${fmtR(d.saldoFinal)} | ${pctLucro(
            d.receitas,
            d.despesas
          )}`
      )
      .join("\n");

  /* gerar + anexar PDF simplificado */
  const enviarEmail = async () => {
    if (!dados.length) {
      Alert.alert("Sem dados", "Não há lançamentos para enviar.");
      return;
    }

    const linhas = dados
      .map(
        (d) => `<tr>
          <td>${d.data}</td>
          <td>${fmtR(d.receitas)}</td>
          <td>${fmtR(d.despesas)}</td>
          <td>${fmtR(d.saldoFinal)}</td>
          <td>${pctLucro(d.receitas, d.despesas)}</td>
        </tr>`
      )
      .join("");

    const html = `
      <table border="1" cellspacing="0" cellpadding="4">
        <tr><th>Data</th><th>Receita</th><th>Despesa</th><th>Saldo</th><th>%</th></tr>
        ${linhas}
      </table>`;

    const { uri } = await Print.printToFileAsync({ html });
    const pdf = FileSystem.cacheDirectory + "Historico_DRD.pdf";
    await FileSystem.copyAsync({ from: uri, to: pdf });

    if (await MailComposer.isAvailableAsync()) {
      await MailComposer.composeAsync({
        subject: "Demonstrativo Diário – DRD",
        body: "Segue relatório em anexo.",
        attachments: [pdf],
      });
    } else {
      await Sharing.shareAsync(pdf, { mimeType: "application/pdf" });
    }
  };

  /* confirmação + reset mensal */
  const confirmarResetMes = () =>
    Alert.alert(
      "Resetar demonstrativo",
      "Isso apagará todos os dias salvos deste mês. Continuar?",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Resetar", style: "destructive", onPress: resetarMes },
      ]
    );

  const resetarMes = async () => {
    await AsyncStorage.removeItem("demonstrativoMensal");
    setDados([]);
    Alert.alert("Concluído", "Demonstrativo do mês foi zerado.");
  };

  /* render */
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.titulo}>Demonstrativo Diário</Text>

      {dados.map((d, i) => (
        <View key={i} style={styles.linha}>
          <Text style={styles.data}>{d.data}</Text>
          <Text>Receita: {fmtR(d.receitas)}</Text>
          <Text>Despesa: {fmtR(d.despesas)}</Text>
          <Text>Saldo: {fmtR(d.saldoFinal)}</Text>
          <Text>{pctLucro(d.receitas, d.despesas)}</Text>
        </View>
      ))}

      <View style={{ marginTop: 24, gap: 12 }}>
        <Button title="Enviar por E-mail (PDF)" onPress={enviarEmail} />
        <Button color="#888" title="Resetar Mês" onPress={confirmarResetMes} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: "#fff" },
  titulo: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  linha: {
    marginBottom: 15,
    padding: 10,
    backgroundColor: "#e8f4ff",
    borderRadius: 8,
  },
  data: { fontWeight: "bold", marginBottom: 4 },
});
