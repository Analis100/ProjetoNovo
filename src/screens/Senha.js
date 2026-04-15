// screens/Senha.js
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
  const [carregando, setCarregando] = useState(true);

  const destino = route?.params?.destino || "TelaInicial";
  const destinoParams = route?.params?.destinoParams || undefined;

  const sanitizePin = (t) =>
    String(t || "")
      .replace(/\D/g, "")
      .slice(0, 6);

  // carrega/migra senha salva (padroniza em senhaAcesso)
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        let atual = await AsyncStorage.getItem("senhaAcesso");

        if (!atual) {
          const alt = await AsyncStorage.getItem("senhaApp");
          if (alt) {
            await AsyncStorage.setItem("senhaAcesso", alt);
            atual = alt;
          }
        }

        if (!atual) {
          atual = "1234";
          await AsyncStorage.setItem("senhaAcesso", atual);
          await AsyncStorage.setItem("senhaApp", atual);
        }

        if (mounted) setSenhaSalva(atual);
      } catch (e) {
        console.log("Erro ao carregar senha:", e);
      } finally {
        if (mounted) setCarregando(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const validarSenha = () => {
    Keyboard.dismiss();

    if (carregando) return;

    const dig = String(senhaDigitada || "").trim();
    const saved = String(senhaSalva || "").trim();

    if (dig === saved) {
      setSenhaDigitada("");
      navigation.replace(destino, destinoParams);
    } else {
      Alert.alert("Senha incorreta", "Tente novamente.");
      setSenhaDigitada("");
    }
  };

  const alterarSenha = () => {
    Keyboard.dismiss();

    if (carregando) return;

    const dig = String(senhaDigitada || "").trim();
    const saved = String(senhaSalva || "").trim();

    if (dig === saved) {
      setSenhaDigitada("");
      navigation.replace("ConfiguraSenha");
    } else {
      Alert.alert(
        "Para alterar a senha",
        "Digite primeiro a senha atual correta.",
      );
      setSenhaDigitada("");
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={100}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          <Text style={styles.titulo}>Digite a senha para continuar</Text>

          <TextInput
            style={styles.input}
            placeholder="Senha"
            secureTextEntry
            keyboardType="numeric"
            textContentType="password"
            autoCapitalize="none"
            value={senhaDigitada}
            onChangeText={(t) => setSenhaDigitada(sanitizePin(t))}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={validarSenha}
          />

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
              onPress={() => {
                Keyboard.dismiss();
                navigation.navigate("RecuperarSenha");
              }}
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
    backgroundColor: "#fff",
  },
});
