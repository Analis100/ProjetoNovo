import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
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

const safeJSON = (raw, fallback) => {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

// aceita número ou string "R$ 1.234,56"
const toNumberBRLLoose = (v) => {
  if (typeof v === "number") return v;
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  const n = s
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const f = parseFloat(n);
  return isNaN(f) ? 0 : f;
};

/** Soma despesas por data (pt-BR dd/mm/aaaa)
 *  Suporta:
 *  - despesas como Array [{data, valor}, ...]
 *  - despesas como Objeto { "dd/mm/aaaa": [ {valor}, ... ] }
 */
async function loadDespesasPorDia() {
  const raw = await AsyncStorage.getItem("despesas");
  const parsed = safeJSON(raw, null);

  const mapa = {}; // { "dd/mm/aaaa": total }

  // formato array
  if (Array.isArray(parsed)) {
    for (const d of parsed) {
      const dia = String(d?.data || d?.dia || "").trim();
      if (!dia) continue;
      const val =
        typeof d?.valor === "number"
          ? d.valor
          : toNumberBRLLoose(d?.valor || d?.valorTotal || d?.total || 0);
      mapa[dia] = (mapa[dia] || 0) + Number(val || 0);
    }
    return mapa;
  }

  // formato objeto por dia
  if (parsed && typeof parsed === "object") {
    for (const dia of Object.keys(parsed)) {
      const arr = Array.isArray(parsed[dia]) ? parsed[dia] : [];
      const totalDia = arr.reduce((s, it) => {
        const val =
          typeof it?.valor === "number"
            ? it.valor
            : toNumberBRLLoose(it?.valor || it?.valorTotal || it?.total || 0);
        return s + Number(val || 0);
      }, 0);
      mapa[dia] = (mapa[dia] || 0) + Number(totalDia || 0);
    }
    return mapa;
  }

  return mapa;
}

export default function Historico() {
  const [dados, setDados] = useState([]);

  /* carrega demonstrativo ao abrir */
  useEffect(() => {
    (async () => {
      try {
        // 1) lê o demonstrativoMensal
        const json = await AsyncStorage.getItem("demonstrativoMensal");
        const obj = json ? JSON.parse(json) : {};

        // 2) lê despesas reais por dia
        const despesasPorDia = await loadDespesasPorDia();

        // 3) monta lista mesclando
        const lista = Object.entries(obj).map(([data, valores]) => {
          const v = valores || {};

          const despDoDemonstrativo = Number(v?.despesas || 0);
          const despReal = Number(despesasPorDia?.[data] || 0);

          // ✅ se demonstrativo não tem despesa (0), usa a real
          const despesasFinal =
            despDoDemonstrativo > 0 ? despDoDemonstrativo : despReal;

          const vendas = Number(v?.vendas || 0);
          const saldoFinal =
            typeof v?.saldoFinal === "number"
              ? v.saldoFinal
              : // fallback simples: vendas - despesas
                Number(vendas || 0) - Number(despesasFinal || 0);

          return {
            data,
            ...v,
            vendas,
            despesas: despesasFinal,
            saldoFinal,
          };
        });

        // opcional: ordenar por data (mais recente primeiro)
        // (como está em pt-BR, ordenação segura com parse)
        const parseBR = (s) => {
          const [d, m, a] = String(s || "")
            .split("/")
            .map(Number);
          if (!d || !m || !a) return 0;
          return new Date(a, m - 1, d).getTime();
        };
        lista.sort((a, b) => parseBR(b.data) - parseBR(a.data));

        setDados(lista);
      } catch (e) {
        console.log("Erro ao carregar demonstrativo:", e);
        setDados([]);
      }
    })();
  }, []);

  /* corpo texto (fallback) */
  const gerarTexto = () =>
    dados
      .map(
        (d) =>
          `📅 ${d.data} | Venda: ${fmtR(d.vendas)} | Despesa: ${fmtR(
            d.despesas,
          )} | Saldo: ${fmtR(d.saldoFinal)} | ${pctLucro(d.vendas, d.despesas)}`,
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
          <td>${fmtR(d.vendas)}</td>
          <td>${fmtR(d.despesas)}</td>
          <td>${fmtR(d.saldoFinal)}</td>
          <td>${pctLucro(d.vendas, d.despesas)}</td>
        </tr>`,
      )
      .join("");

    const html = `
      <style>
        body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111}
        table{width:100%;border-collapse:collapse}
        th,td{border:1px solid #aaa;padding:6px}
        th{background:#eee}
      </style>
      <table>
        <tr><th>Data</th><th>Venda</th><th>Despesa</th><th>Saldo</th><th>%</th></tr>
        ${linhas}
      </table>`;

    const { uri } = await Print.printToFileAsync({ html });
    const pdf = FileSystem.cacheDirectory + `Historico_DRD_${Date.now()}.pdf`;
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
      ],
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

      {dados.length === 0 && (
        <Text style={{ textAlign: "center", color: "#666", marginBottom: 16 }}>
          Nenhum lançamento por enquanto.
        </Text>
      )}

      {dados.map((d, i) => (
        <View key={i} style={styles.linha}>
          <Text style={styles.data}>{d.data}</Text>
          <Text>Venda: {fmtR(d.vendas)}</Text>
          <Text>Despesa: {fmtR(d.despesas)}</Text>
          <Text>Saldo: {fmtR(d.saldoFinal)}</Text>
          <Text>{pctLucro(d.vendas, d.despesas)}</Text>
        </View>
      ))}

      <View style={{ marginTop: 24 }}>
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary]}
          onPress={enviarEmail}
        >
          <Text style={styles.btnText}>Enviar por E-mail (PDF)</Text>
        </TouchableOpacity>

        <View style={{ height: 12 }} />

        <TouchableOpacity
          style={[styles.btn, styles.btnGrey]}
          onPress={confirmarResetMes}
        >
          <Text style={styles.btnText}>Resetar Mês</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 90, backgroundColor: "#fff" },
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

  /* Botões padronizados */
  btn: {
    width: "100%",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
  },
  btnPrimary: {
    backgroundColor: "#2196F3",
  },
  btnGrey: {
    backgroundColor: "#888",
  },
  btnText: {
    color: "#fff",
    fontWeight: "700",
  },
});
