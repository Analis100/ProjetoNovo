import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function ConfiguraSenha({ navigation }) {
  /* estados de formulário */
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirma, setConfirma] = useState("");

  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState("");

  /* traz pergunta/resposta já salvas (se houver) */
  useEffect(() => {
    (async () => {
      const p = await AsyncStorage.getItem("recuperacaoPergunta");
      const r = await AsyncStorage.getItem("recuperacaoResposta");
      if (p) setPergunta(p);
      if (r) setResposta(r);
    })();
  }, []);

  const salvar = async () => {
    const salva = (await AsyncStorage.getItem("senhaApp")) || "1234";

    if (novaSenha !== confirma) {
      Alert.alert("Erro", "Nova senha e confirmação não batem.");
      return;
    }
    if (senhaAtual !== salva) {
      Alert.alert("Erro", "Senha atual incorreta.");
      return;
    }

    await AsyncStorage.setItem("senhaApp", novaSenha || "1234");
    await AsyncStorage.setItem("recuperacaoPergunta", pergunta.trim());
    await AsyncStorage.setItem(
      "recuperacaoResposta",
      resposta.trim().toLowerCase()
    );

    Alert.alert("Sucesso", "Dados de senha atualizados.");
    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={100}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.h1}>Alterar Senha</Text>

        <TextInput
          placeholder="Senha atual"
          secureTextEntry
          style={styles.input}
          value={senhaAtual}
          onChangeText={setSenhaAtual}
        />
        <TextInput
          placeholder="Nova senha"
          secureTextEntry
          style={styles.input}
          value={novaSenha}
          onChangeText={setNovaSenha}
        />
        <TextInput
          placeholder="Confirmar nova senha"
          secureTextEntry
          style={styles.input}
          value={confirma}
          onChangeText={setConfirma}
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

        <Button title="Salvar" onPress={salvar} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, gap: 12 },
  h1: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  h2: { fontSize: 16, marginTop: 24, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#aaa",
    borderRadius: 6,
    padding: 10,
  },
});
