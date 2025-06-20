import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function Senha({ navigation, route }) {
  const [senhaDigitada, setSenhaDigitada] = useState("");
  const [senhaSalva, setSenhaSalva] = useState("1234");

  /* para onde ir após autenticar */
  const destino = route.params?.destino || "TelaInicial";

  /* carrega (ou cria) a senha salva */
  useEffect(() => {
    (async () => {
      const senha = await AsyncStorage.getItem("senhaApp");
      if (senha) setSenhaSalva(senha);
      else await AsyncStorage.setItem("senhaApp", "1234");
    })();
  }, []);

  /* valida e navega */
  const validarSenha = () => {
    Keyboard.dismiss();
    if (senhaDigitada === senhaSalva) {
      setSenhaDigitada("");
      navigation.replace(destino);
    } else {
      Alert.alert("Senha incorreta", "Tente novamente.");
      setSenhaDigitada("");
    }
  };

  /* abre tela de troca de senha (só se autenticado) */
  const alterarSenha = () => {
    Keyboard.dismiss();
    if (senhaDigitada === senhaSalva) {
      setSenhaDigitada("");
      navigation.replace("ConfiguraSenha");
    } else {
      Alert.alert(
        "Para alterar a senha, digite a senha atual correta primeiro."
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={100} // evita botão encoberto
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          <Text style={styles.titulo}>Digite a senha para continuar</Text>

          <TextInput
            style={styles.input}
            placeholder="Senha"
            secureTextEntry
            value={senhaDigitada}
            onChangeText={setSenhaDigitada}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={validarSenha}
          />

          {/* ------- ações ------- */}
          <View style={{ gap: 12 }}>
            <Button title="Entrar" onPress={validarSenha} />

            <Button
              title="Alterar senha"
              color="#6c63ff"
              onPress={alterarSenha}
            />

            <Button
              title="Esqueci a senha"
              color="#888"
              onPress={() => navigation.navigate("RecuperarSenha")}
            />
          </View>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  titulo: {
    fontSize: 20,
    marginBottom: 20,
    textAlign: "center",
    fontWeight: "bold",
  },
  input: {
    borderWidth: 1,
    borderColor: "#aaa",
    padding: 10,
    marginBottom: 20,
    borderRadius: 8,
  },
});
