import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function ConfiguraSenha({ navigation }) {
  /* estados */
  const [novaSenha, setNovaSenha] = useState("");
  const [confirma, setConfirma] = useState("");

  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState("");

  // 🔑 código do vendedor (para o aparelho do colaborador)
  const [codigoVendedor, setCodigoVendedor] = useState("");

  /* traz pergunta/resposta já salvas (se houver) + código vendedor */
  useEffect(() => {
    (async () => {
      try {
        const p = await AsyncStorage.getItem("recuperacaoPergunta");
        const r = await AsyncStorage.getItem("recuperacaoResposta");
        const cod = await AsyncStorage.getItem("@codigoVendedor");

        if (p) setPergunta(p);
        if (r) setResposta(r);
        if (cod) setCodigoVendedor(cod);
      } catch (e) {
        console.log("Erro ao carregar configs:", e);
      }
    })();
  }, []);

  const sanitizePin = (t) =>
    String(t || "")
      .replace(/\D/g, "")
      .slice(0, 6);

  // 🔐 SALVAR
  const salvar = async () => {
    const pin = sanitizePin(novaSenha);
    const pin2 = sanitizePin(confirma);

    if (!pin || pin.length < 4) {
      Alert.alert("Atenção", "Defina uma nova senha com pelo menos 4 dígitos.");
      return;
    }

    if (pin !== pin2) {
      Alert.alert("Erro", "Nova senha e confirmação não batem.");
      return;
    }

    try {
      await AsyncStorage.setItem("senhaApp", pin);
      await AsyncStorage.setItem("senhaAcesso", pin);

      await AsyncStorage.setItem(
        "recuperacaoPergunta",
        (pergunta || "").trim()
      );
      await AsyncStorage.setItem(
        "recuperacaoResposta",
        (resposta || "").trim().toLowerCase()
      );

      Alert.alert("Sucesso", "Dados de senha atualizados.");
      navigation.goBack();
    } catch (e) {
      console.log("Erro ao salvar senha:", e);
      Alert.alert("Erro", "Não foi possível salvar a senha. Tente novamente.");
    }
  };

  // 🔹 salva o código do vendedor no aparelho do colaborador (sem senha)
  const handleAdicionarCodigoVendedor = async () => {
    try {
      const codigoLimpo = (codigoVendedor || "").trim();

      if (!codigoLimpo) {
        Alert.alert("Atenção", "Cole o código do vendedor antes de salvar.");
        return;
      }

      await AsyncStorage.setItem("@codigoVendedor", codigoLimpo);

      Alert.alert(
        "Pronto",
        "Código de vendedor salvo neste aparelho.\n" +
          "As vendas lançadas aqui poderão ser associadas a esse código."
      );
    } catch (e) {
      console.log("Erro ao salvar código do vendedor:", e);
      Alert.alert(
        "Erro",
        "Não foi possível salvar o código agora. Tente novamente."
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={100}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.h1}>Alterar Senha</Text>

        <TextInput
          placeholder="Nova senha (mín. 4 dígitos)"
          secureTextEntry
          keyboardType="numeric"
          style={styles.input}
          value={novaSenha}
          onChangeText={(t) => setNovaSenha(sanitizePin(t))}
        />
        <TextInput
          placeholder="Confirmar nova senha"
          secureTextEntry
          keyboardType="numeric"
          style={styles.input}
          value={confirma}
          onChangeText={(t) => setConfirma(sanitizePin(t))}
        />

        <Text style={styles.h2}>Pergunta de recuperação (opcional)</Text>
        <TextInput
          placeholder="Ex.: Nome do seu primeiro pet"
          style={styles.input}
          value={pergunta}
          onChangeText={setPergunta}
        />
        <TextInput
          placeholder="Resposta"
          style={styles.input}
          value={resposta}
          onChangeText={setResposta}
        />

        {/* 🔑 Área para o COLABORADOR colar o código */}
        <Text style={styles.h2}>
          Código do vendedor (aparelho do colaborador)
        </Text>
        <TextInput
          placeholder="Cole aqui o código enviado pelo responsável"
          style={styles.input}
          value={codigoVendedor}
          onChangeText={setCodigoVendedor}
        />

        <TouchableOpacity
          style={styles.btnVendedor}
          onPress={handleAdicionarCodigoVendedor}
        >
          <Text style={styles.btnVendedorText}>
            Vendedor: salvar código neste aparelho
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary]}
          onPress={salvar}
        >
          <Text style={styles.btnText}>Salvar</Text>
        </TouchableOpacity>

        <View style={{ height: 24 }} />
        <Text style={styles.tip}>
          Dica: guarde a sua pergunta/resposta em um lugar seguro. Elas podem
          ser usadas para recuperar o acesso caso esqueça a senha.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    backgroundColor: "#fff",
    paddingBottom: 48,
  },
  h1: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  h2: { fontSize: 16, marginTop: 24, marginBottom: 6, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#aaa",
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
    backgroundColor: "#fff",
  },
  tip: {
    fontSize: 12,
    color: "#666",
    lineHeight: 18,
    textAlign: "center",
  },
  btn: {
    width: "100%",
    paddingVertical: 12,
    paddingHorizontal: 14,
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
  btnVendedor: {
    marginTop: 4,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bfa140",
    backgroundColor: "#fff",
    alignItems: "center",
  },
  btnVendedorText: { color: "#bfa140", fontWeight: "bold", fontSize: 14 },
});
