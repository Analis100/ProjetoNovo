import React, { useState, useEffect } from "react";
import { View, Text, TextInput, Button, StyleSheet, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function RecuperarSenha({ navigation }) {
  const [pergunta, setPergunta] = useState("");
  const [respostaSalva, setRespostaSalva] = useState("");
  const [respostaUser, setRespostaUser] = useState("");

  /* carrega pergunta + resposta salvas */
  useEffect(() => {
    (async () => {
      const p = (await AsyncStorage.getItem("recuperacaoPergunta")) || "";
      const r = (await AsyncStorage.getItem("recuperacaoResposta")) || "";
      setPergunta(p);
      setRespostaSalva(r);
    })();
  }, []);

  const confirmar = async () => {
    if (!pergunta) {
      Alert.alert(
        "Indisponível",
        "Nenhuma pergunta de recuperação foi configurada."
      );
      return;
    }
    if (respostaUser.trim().toLowerCase() !== respostaSalva) {
      Alert.alert("Erro", "Resposta incorreta.");
      return;
    }
    await AsyncStorage.setItem("senhaApp", "1234");
    Alert.alert(
      "Sucesso",
      'Senha redefinida para "1234". Faça login e altere em Configurações.'
    );
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Recuperar Senha</Text>

      {pergunta ? (
        <>
          <Text style={{ marginBottom: 8 }}>{pergunta}</Text>
          <TextInput
            style={styles.input}
            placeholder="Sua resposta"
            value={respostaUser}
            onChangeText={setRespostaUser}
          />
          <Button title="Confirmar" onPress={confirmar} />
        </>
      ) : (
        <Text>Nenhuma pergunta de recuperação configurada.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12, justifyContent: "center" },
  h1: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#aaa",
    borderRadius: 6,
    padding: 10,
  },
});
