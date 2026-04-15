// screens/SaldoAnterior.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableOpacity,
  Alert,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

const CAPITAL_KEY = "capitalGiroResumo";
const PLACEHOLDER = "#777";

/* ===== Helpers de máscara BRL ===== */

// Saldo anterior: aceita sinal negativo
function maskBRLWithSign(text) {
  let s = String(text || "");
  let sign = "";

  if (s.trim().startsWith("-")) {
    sign = "-";
    s = s.replace("-", "");
  }

  const digits = s.replace(/\D/g, "");
  const n = parseInt(digits || "0", 10);
  const v = n / 100;
  const fmt = v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  return sign ? `-${fmt}` : fmt;
}

function parseBRLWithSign(masked) {
  if (!masked) return 0;
  const txt = String(masked).trim();
  const neg = txt.startsWith("-");
  const digits = txt.replace(/\D/g, "");
  const n = parseInt(digits || "0", 10);
  const v = n / 100;
  return neg ? -v : v;
}

// Capital de giro: só positivo
function maskBRL(text) {
  const digits = String(text || "").replace(/\D/g, "");
  const n = parseInt(digits || "0", 10);
  const v = n / 100;
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function parseBRL(masked) {
  if (!masked) return 0;
  const digits = String(masked).replace(/\D/g, "");
  const n = parseInt(digits || "0", 10);
  return n / 100;
}

/* ===== Helpers Capital de Giro ===== */

async function loadCapitalResumo() {
  try {
    const raw = await AsyncStorage.getItem(CAPITAL_KEY);
    if (!raw) {
      return { entrada: 0, saida: 0, saldo: 0 };
    }
    const obj = JSON.parse(raw);
    return {
      entrada: Number(obj.entrada || 0),
      saida: Number(obj.saida || 0),
      saldo: Number(obj.saldo || 0),
    };
  } catch {
    return { entrada: 0, saida: 0, saldo: 0 };
  }
}

async function salvarCapitalResumo(resumo) {
  await AsyncStorage.setItem(CAPITAL_KEY, JSON.stringify(resumo));
}

export default function SaldoAnterior() {
  const [valor, setValor] = useState("");
  const [saldoAtual, setSaldoAtual] = useState(null);
  const [dataAtual, setDataAtual] = useState("");

  // Capital de Giro
  const [cgValor, setCgValor] = useState("");
  const [cgResumo, setCgResumo] = useState({
    entrada: 0,
    saida: 0,
    saldo: 0,
  });

  useEffect(() => {
    carregarSaldoAnterior();
    carregarCapitalGiro();
    const hoje = new Date().toLocaleDateString("pt-BR");
    setDataAtual(hoje);
  }, []);

  const carregarSaldoAnterior = async () => {
    const dado = await AsyncStorage.getItem("saldoAnterior");
    if (dado !== null) setSaldoAtual(parseFloat(dado));
  };

  const salvarSaldoAnterior = async () => {
    const numero = parseBRLWithSign(valor);
    if (isNaN(numero)) return;
    await AsyncStorage.setItem("saldoAnterior", String(numero));
    setSaldoAtual(numero);
    setValor("");
  };

  const confirmarExclusao = () => {
    Alert.alert(
      "Excluir saldo",
      "Tem certeza que deseja apagar o saldo anterior salvo?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: excluirSaldoAnterior,
        },
      ]
    );
  };

  const excluirSaldoAnterior = async () => {
    await AsyncStorage.removeItem("saldoAnterior");
    setSaldoAtual(null);
    setValor("");
  };

  const formatarValor = (v) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  /* ===== Capital de Giro: carregar / registrar / limpar ===== */

  const carregarCapitalGiro = async () => {
    const resumo = await loadCapitalResumo();
    setCgResumo(resumo);
  };

  const registrarEntradaCG = async () => {
    Keyboard.dismiss();
    const val = parseBRL(cgValor);
    if (!(val > 0)) {
      Alert.alert("Valor inválido", "Informe um valor maior que zero.");
      return;
    }
    const atual = await loadCapitalResumo();
    const novo = {
      entrada: atual.entrada + val,
      saida: atual.saida,
      saldo: atual.saldo + val,
    };
    await salvarCapitalResumo(novo);
    setCgResumo(novo);
    setCgValor("");
  };

  const registrarSaidaCG = async () => {
    Keyboard.dismiss();
    const val = parseBRL(cgValor);
    if (!(val > 0)) {
      Alert.alert("Valor inválido", "Informe um valor maior que zero.");
      return;
    }
    const atual = await loadCapitalResumo();
    const novo = {
      entrada: atual.entrada,
      saida: atual.saida + val,
      saldo: atual.saldo - val,
    };
    await salvarCapitalResumo(novo);
    setCgResumo(novo);
    setCgValor("");
  };

  // 🔹 zerar tudo (mantemos opção antiga)
  const limparCapitalGiro = async () => {
    const vazio = { entrada: 0, saida: 0, saldo: 0 };
    await salvarCapitalResumo(vazio);
    setCgResumo(vazio);
    setCgValor("");
  };

  // 🔹 excluir parcialmente de Entradas ou Saídas usando o valor digitado
  const excluirParcialCG = async (tipo, valor) => {
    const atual = await loadCapitalResumo();
    let novaEntrada = atual.entrada;
    let novaSaida = atual.saida;

    if (tipo === "ENTRADA") {
      novaEntrada = Math.max(0, atual.entrada - valor);
    } else if (tipo === "SAIDA") {
      novaSaida = Math.max(0, atual.saida - valor);
    }

    const novo = {
      entrada: novaEntrada,
      saida: novaSaida,
      saldo: novaEntrada - novaSaida,
    };

    await salvarCapitalResumo(novo);
    setCgResumo(novo);
    setCgValor("");
  };

  // 🔹 botão "Excluir lançamentos Capital de Giro"
  const confirmarLimparCG = () => {
    const val = parseBRL(cgValor);
    if (!(val > 0)) {
      Alert.alert(
        "Valor inválido",
        "Digite o valor que deseja excluir no campo de Capital de Giro."
      );
      return;
    }

    Alert.alert(
      "Excluir lançamentos",
      `Valor a excluir: ${formatarValor(
        val
      )}\n\nDe onde deseja retirar esse valor?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir das Entradas",
          onPress: () => excluirParcialCG("ENTRADA", val),
        },
        {
          text: "Excluir das Saídas",
          onPress: () => excluirParcialCG("SAIDA", val),
        },
        {
          text: "Zerar tudo",
          style: "destructive",
          onPress: limparCapitalGiro,
        },
      ]
    );
  };

  /* ===== PDF Capital de Giro ===== */

  const gerarPdfCapitalGiro = async () => {
    try {
      if (
        cgResumo.entrada === 0 &&
        cgResumo.saida === 0 &&
        cgResumo.saldo === 0
      ) {
        Alert.alert(
          "Sem dados",
          "Não há lançamentos de Capital de Giro para gerar o PDF."
        );
        return;
      }

      const html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                padding: 24px;
                font-size: 14px;
                color: #333;
              }
              h1 {
                font-size: 20px;
                text-align: center;
                margin-bottom: 4px;
              }
              h2 {
                font-size: 16px;
                text-align: center;
                margin-top: 0;
                color: #555;
              }
              .data {
                text-align: center;
                margin-bottom: 20px;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 16px;
              }
              th, td {
                border: 1px solid #ccc;
                padding: 8px;
                text-align: right;
              }
              th {
                background-color: #f2f2f2;
                text-align: center;
              }
              .saldo-positivo {
                color: #155724;
                font-weight: bold;
              }
              .saldo-negativo {
                color: #a94442;
                font-weight: bold;
              }
              .footer {
                margin-top: 24px;
                font-size: 12px;
                text-align: center;
                color: #777;
              }
            </style>
          </head>
          <body>
            <h1>DRD-Financeiro</h1>
            <h2>Relatório de Capital de Giro</h2>
            <div class="data">Data: ${dataAtual}</div>

            <table>
              <tr>
                <th>Tipo</th>
                <th>Valor</th>
              </tr>
              <tr>
                <td style="text-align:left;">Entradas</td>
                <td>${formatarValor(cgResumo.entrada)}</td>
              </tr>
              <tr>
                <td style="text-align:left;">Saídas</td>
                <td>${formatarValor(cgResumo.saida)}</td>
              </tr>
              <tr>
                <td style="text-align:left;">Saldo</td>
                <td class="${
                  cgResumo.saldo < 0 ? "saldo-negativo" : "saldo-positivo"
                }">
                  ${formatarValor(cgResumo.saldo)}
                </td>
              </tr>
            </table>

            <div class="footer">
              Relatório gerado pelo app DRD-Financeiro.
            </div>
          </body>
        </html>
      `;

      const file = await Print.printToFileAsync({ html });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, {
          mimeType: "application/pdf",
          dialogTitle: "Compartilhar relatório de Capital de Giro",
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert(
          "PDF gerado",
          `O arquivo foi salvo em:\n${file.uri}\n\nCompartilhamento direto não disponível neste dispositivo.`
        );
      }
    } catch (err) {
      console.log("Erro ao gerar PDF Capital de Giro:", err);
      Alert.alert(
        "Erro",
        "Ocorreu um problema ao gerar o PDF do Capital de Giro."
      );
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: "#fff" }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.titulo}>Saldo Anterior</Text>
        <Text style={styles.data}>Data: {dataAtual}</Text>

        {/* SALDO ANTERIOR */}
        <Text style={styles.sectionTitle}>Saldo Anterior do Caixa</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder="Digite o valor (ex: -100 ou 200)"
          placeholderTextColor={PLACEHOLDER}
          underlineColorAndroid="transparent"
          value={valor}
          onChangeText={(t) => setValor(maskBRLWithSign(t))}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
        />

        <TouchableOpacity
          style={styles.botao}
          onPress={() => {
            Keyboard.dismiss();
            salvarSaldoAnterior();
          }}
        >
          <Text style={styles.botaoTexto}>Inserir</Text>
        </TouchableOpacity>

        {saldoAtual !== null && (
          <View
            style={[
              styles.valorBox,
              { backgroundColor: saldoAtual < 0 ? "#f8d7da" : "#d4edda" },
            ]}
          >
            <Text
              style={[
                styles.valorTexto,
                { color: saldoAtual < 0 ? "#a94442" : "#155724" },
              ]}
            >
              Valor salvo: {formatarValor(saldoAtual)}
            </Text>

            <View style={styles.botaoExcluir}>
              <TouchableOpacity onPress={confirmarExclusao}>
                <Text style={styles.excluirTxt}>Excluir Saldo</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* CAPITAL DE GIRO */}
        <View style={styles.cgCard}>
          <Text style={styles.cgTitulo}>Capital de Giro</Text>

          <TextInput
            style={styles.input}
            keyboardType="numeric"
            placeholder="Valor (R$)"
            placeholderTextColor={PLACEHOLDER}
            underlineColorAndroid="transparent"
            value={cgValor}
            onChangeText={(t) => setCgValor(maskBRL(t))}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />

          {/* Botões na mesma reta */}
          <View style={styles.cgButtonsRow}>
            <TouchableOpacity
              style={[styles.cgBtn, { backgroundColor: "#198754" }]}
              onPress={registrarEntradaCG}
            >
              <Text style={styles.cgBtnTxt}>Registrar Entrada</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cgBtn, { backgroundColor: "#dc3545" }]}
              onPress={registrarSaidaCG}
            >
              <Text style={styles.cgBtnTxt}>Registrar Saída</Text>
            </TouchableOpacity>
          </View>

          {/* Resumo compacto */}
          <View style={styles.cgResumoRow}>
            <View style={styles.cgResumoItem}>
              <Text style={styles.cgLabel}>Entradas</Text>
              <Text style={styles.cgValor}>
                {formatarValor(cgResumo.entrada)}
              </Text>
            </View>
            <View style={styles.cgResumoItem}>
              <Text style={styles.cgLabel}>Saídas</Text>
              <Text style={styles.cgValor}>
                {formatarValor(cgResumo.saida)}
              </Text>
            </View>
            <View style={styles.cgResumoItem}>
              <Text style={styles.cgLabel}>Saldo</Text>
              <Text
                style={[
                  styles.cgValor,
                  cgResumo.saldo < 0 && { color: "#a94442" },
                ]}
              >
                {formatarValor(cgResumo.saldo)}
              </Text>
            </View>
          </View>

          {/* Botões de limpar + PDF */}
          <View style={styles.cgActionsRow}>
            <TouchableOpacity
              style={styles.cgClearBtn}
              onPress={confirmarLimparCG}
            >
              <Text style={styles.cgClearTxt}>
                Excluir lançamentos Capital de Giro
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cgPdfBtn}
              onPress={gerarPdfCapitalGiro}
            >
              <Text style={styles.cgPdfTxt}>Exportar PDF</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: "#fff",
  },
  container: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: "#fff",
    flex: 1,
  },
  titulo: {
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 4,
    textAlign: "center",
    color: "#111",
  },
  data: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 16,
    color: "#111",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
    color: "#111",
  },

  // ✅ importante: color + placeholderTextColor nos inputs
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    fontSize: 18,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: "#fff",
    color: "#111",
  },

  botao: {
    borderWidth: 1,
    borderColor: "#bfa140",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 20,
    backgroundColor: "#fff",
  },
  botaoTexto: {
    color: "#bfa140",
    fontWeight: "bold",
    fontSize: 16,
  },
  valorBox: { padding: 12, borderRadius: 8, marginBottom: 18 },
  valorTexto: { fontSize: 18, textAlign: "center", fontWeight: "bold" },
  botaoExcluir: { marginTop: 8, alignItems: "center" },
  excluirTxt: { color: "#dc3545", fontWeight: "bold", fontSize: 16 },

  /* Capital de Giro */
  cgCard: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#f8f9fa",
    marginTop: 10,
  },
  cgTitulo: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
    color: "#111",
  },
  cgButtonsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  cgBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  cgBtnTxt: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  cgResumoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 8,
  },
  cgResumoItem: {
    flex: 1,
    alignItems: "center",
  },
  cgLabel: {
    fontSize: 12,
    color: "#555",
  },
  cgValor: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111",
  },
  cgActionsRow: {
    marginTop: 6,
  },
  cgClearBtn: {
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dc3545",
    alignItems: "center",
    marginBottom: 6,
  },
  cgClearTxt: {
    color: "#dc3545",
    fontWeight: "700",
    fontSize: 13,
    textAlign: "center",
  },
  cgPdfBtn: {
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#1d6fd8",
    alignItems: "center",
  },
  cgPdfTxt: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
});
