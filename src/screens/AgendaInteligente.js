// screens/AgendaInteligente.js
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
export default function AgendaInteligente({ navigation }) {
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [senhaDigitada, setSenhaDigitada] = useState("");
  const [erroSenha, setErroSenha] = useState(false);

  const B = ({ title, onPress }) => (
    <TouchableOpacity style={styles.btn} onPress={onPress}>
      <Text style={styles.btnTxt}>{title}</Text>
    </TouchableOpacity>
  );

  const abrirColaboradoresComSenha = () => {
    // 🔒 PRODUÇÃO: pede senha
    setErroSenha(false);
    setSenhaDigitada("");
    setSenhaVisivel(true);
  };

  const confirmarSenha = async () => {
    try {
      // 🔒 Build de produção (senha obrigatória)
      const salva = (await AsyncStorage.getItem("senhaAcesso")) || "1234";
      const digitada = String(senhaDigitada || "").trim();
      const senhaSalva = String(salva || "").trim();

      if (!digitada || digitada !== senhaSalva) {
        setErroSenha(true);
        Alert.alert("Senha incorreta", "Tente novamente.");
        return;
      }

      setSenhaVisivel(false);
      setSenhaDigitada("");
      setErroSenha(false);
      navigation.navigate("Colaboradores");
    } catch {
      Alert.alert("Erro", "Não foi possível validar a senha agora.");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={styles.container}>
        <Text style={styles.title}>Agenda Inteligente</Text>

        <B
          title="CLIENTES"
          onPress={() => navigation.navigate("ListaClientesAgenda")}
        />
        <B
          title="COMPROMISSOS"
          onPress={() => navigation.navigate("Compromissos")}
        />
        <B title="TAREFAS" onPress={() => navigation.navigate("Tarefas")} />

        {/* ✅ Colaboradores: sem senha em teste */}
        <B title="COLABORADORES" onPress={abrirColaboradoresComSenha} />
      </View>

      {/* Modal de Senha (produção apenas) */}
      <Modal
        visible={senhaVisivel}
        transparent
        animationType="fade"
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setSenhaVisivel(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.overlay}
        >
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Digite a senha</Text>
            <TextInput
              placeholder="Senha"
              secureTextEntry
              autoFocus
              value={senhaDigitada}
              onChangeText={(t) => {
                setSenhaDigitada(t);
                setErroSenha(false);
              }}
              onSubmitEditing={confirmarSenha}
              style={[styles.input, erroSenha && styles.inputErro]}
            />
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.btnGhost, { flex: 1 }]}
                onPress={() => {
                  setSenhaVisivel(false);
                  setSenhaDigitada("");
                  setErroSenha(false);
                }}
              >
                <Text style={styles.btnGhostTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnOk, { flex: 1 }]}
                onPress={confirmarSenha}
              >
                <Text style={styles.btnOkTxt}>Confirmar</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>
              Dica: se não definiu uma senha ainda, a padrão é 1234.
            </Text>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 26, fontWeight: "bold", marginBottom: 30 },
  btn: {
    backgroundColor: "#bfa140",
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 20,
    width: "85%",
    alignItems: "center",
    marginVertical: 12,
  },
  btnTxt: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.5,
  },

  // Modal senha
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  box: {
    width: "88%",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 18,
  },
  boxTitle: {
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: "#fff",
    marginBottom: 12,
  },
  inputErro: { borderColor: "#ef4444" },
  actionsRow: { flexDirection: "row", gap: 10 },
  btnGhost: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  btnGhostTxt: { color: "#111", fontWeight: "700" },
  btnOk: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#3b82f6",
  },
  btnOkTxt: { color: "#fff", fontWeight: "700" },
  hint: { color: "#6b7280", fontSize: 12, marginTop: 8, textAlign: "center" },
});
