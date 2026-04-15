import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  TouchableOpacity,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function RecuperarSenha({ navigation }) {
  const [pergunta, setPergunta] = useState("");
  const [respostaSalva, setRespostaSalva] = useState("");
  const [respostaUser, setRespostaUser] = useState("");

  /* carrega pergunta + resposta salvas */
  useEffect(() => {
    (async () => {
      try {
        const p = (await AsyncStorage.getItem("recuperacaoPergunta")) || "";
        const r = (await AsyncStorage.getItem("recuperacaoResposta")) || "";
        setPergunta(p);
        setRespostaSalva(r); // já salvo em minúsculas lá no ConfiguraSenha
      } catch {
        setPergunta("");
        setRespostaSalva("");
      }
    })();
  }, []);

  const confirmar = async () => {
    try {
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

      // Redefine para padrão e garante compatibilidade com telas antigas:
      await AsyncStorage.setItem("senhaApp", "1234");
      await AsyncStorage.setItem("senhaAcesso", "1234");

      Alert.alert(
        "Sucesso",
        'Senha redefinida para "1234". Faça login e altere em Configurações.'
      );
      navigation.goBack();
    } catch {
      Alert.alert("Erro", "Não foi possível redefinir a senha agora.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Recuperar Senha</Text>

      {pergunta ? (
        <>
          <Text style={styles.pergunta}>{pergunta}</Text>
          <TextInput
            style={styles.input}
            placeholder="Sua resposta"
            value={respostaUser}
            onChangeText={setRespostaUser}
            autoCapitalize="none"
          />

          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            onPress={confirmar}
          >
            <Text style={styles.btnText}>Confirmar</Text>
          </TouchableOpacity>
        </>
      ) : (
        <Text style={{ textAlign: "center", color: "#666" }}>
          Nenhuma pergunta de recuperação configurada.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  h1: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
    color: "#111",
  },
  pergunta: { marginBottom: 8, color: "#111", textAlign: "center" },
  input: {
    borderWidth: 1,
    borderColor: "#aaa",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#fff",
    marginBottom: 12,
  },

  /* Botões padronizados */
  btn: {
    width: "100%",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
  },
  btnPrimary: { backgroundColor: "#2196F3" },
  btnText: { color: "#fff", fontWeight: "700" },
});
