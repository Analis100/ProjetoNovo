// src/screens/ModoVendedor.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import {
  saveVendorProfile,
  getVendorProfile,
  clearVendorProfile,
} from "./services/colabProfile";

export default function ModoVendedor() {
  const navigation = useNavigation();

  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [perfil, setPerfil] = useState(null);

  useEffect(() => {
    (async () => {
      const p = await getVendorProfile();
      if (p) {
        setPerfil(p);
        setCodigo(p.collaboratorId || "");
        setNome(p.displayName || "");
      }
    })();
  }, []);

  const ativar = async () => {
    const cod = (codigo || "").trim();
    if (!cod) {
      Alert.alert("Atenção", "Informe o código do colaborador.");
      return;
    }

    try {
      const payload = await saveVendorProfile({
        collaboratorId: cod,
        displayName: nome || null,
      });
      setPerfil(payload);
      Alert.alert(
        "Pronto",
        "Modo vendedor ativado neste aparelho.\n\nAs vendas lançadas aqui irão somar no colaborador deste código."
      );
    } catch (e) {
      console.log("saveVendorProfile erro:", e);
      Alert.alert("Erro", "Não foi possível salvar o perfil agora.");
    }
  };

  const desativar = async () => {
    await clearVendorProfile();
    setPerfil(null);
    setCodigo("");
    setNome("");
    Alert.alert("Pronto", "Modo vendedor desativado neste aparelho.");
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        <Text style={styles.titulo}>Modo Vendedor (Colaborador)</Text>

        <Text style={styles.texto}>
          Use esta tela APENAS no aparelho do vendedor.
        </Text>
        <Text style={styles.texto}>
          Cole aqui o <Text style={{ fontWeight: "700" }}>código</Text> que você
          enviou pelo WhatsApp na tela de Colaboradores.
        </Text>

        <Text style={styles.label}>Código do colaborador</Text>
        <TextInput
          value={codigo}
          onChangeText={setCodigo}
          placeholder="Cole o código aqui"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />

        <Text style={styles.label}>Nome do vendedor (opcional)</Text>
        <TextInput
          value={nome}
          onChangeText={setNome}
          placeholder="Ex.: João, Maria..."
          style={styles.input}
        />

        <TouchableOpacity style={styles.btnSalvar} onPress={ativar}>
          <Text style={styles.btnSalvarTxt}>Ativar modo vendedor</Text>
        </TouchableOpacity>

        {perfil ? (
          <View style={styles.caixaStatus}>
            <Text style={styles.statusTitulo}>Modo vendedor ATIVO</Text>
            <Text style={styles.statusLinha}>
              Código:{" "}
              <Text style={{ fontWeight: "800" }}>{perfil.collaboratorId}</Text>
            </Text>
            {perfil.displayName ? (
              <Text style={styles.statusLinha}>
                Nome:{" "}
                <Text style={{ fontWeight: "800" }}>{perfil.displayName}</Text>
              </Text>
            ) : null}

            <TouchableOpacity style={styles.btnDesativar} onPress={desativar}>
              <Text style={styles.btnDesativarTxt}>
                Desativar modo vendedor neste aparelho
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.caixaStatus}>
            <Text style={styles.statusTitulo}>
              Nenhum perfil de vendedor configurado.
            </Text>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  titulo: {
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 12,
  },
  texto: { color: "#333", marginBottom: 4 },
  label: { marginTop: 12, fontWeight: "600", color: "#222" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
    backgroundColor: "#fff",
  },
  btnSalvar: {
    marginTop: 16,
    backgroundColor: "#16a34a",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  btnSalvarTxt: { color: "#fff", fontWeight: "700", fontSize: 16 },
  caixaStatus: {
    marginTop: 20,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  statusTitulo: { fontWeight: "700", marginBottom: 6, color: "#111" },
  statusLinha: { color: "#333", marginTop: 2 },
  btnDesativar: {
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ef4444",
    paddingVertical: 10,
    alignItems: "center",
  },
  btnDesativarTxt: {
    color: "#ef4444",
    fontWeight: "700",
  },
});
