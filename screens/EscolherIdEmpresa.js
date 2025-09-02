// EscolherIdEmpresa.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  StyleSheet,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
// Descomente se for registrar no Firestore
// import firestore from "@react-native-firebase/firestore";

function gerarIdEmpresa() {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `EMPRESA-${rand}`;
}

/**
 * Props:
 *  - value: string  (idEmpresa atual vindo da tela)
 *  - onChange: (novoId: string) => void  (para atualizar o campo da tela)
 *  - useNuvem?: boolean (se true, registra Firestore quando gerar/confirmar)
 *  - ownerMode?: boolean (se true, marca como proprietário ao registrar)
 */
export default function EscolherIdEmpresa({
  value,
  onChange,
  useNuvem = false,
  ownerMode = true,
}) {
  const [manualOpen, setManualOpen] = useState(false);
  const [manualId, setManualId] = useState("");

  useEffect(() => {
    if (!value) return;
    // opcional: validar/normalizar
  }, [value]);

  const registrarNaNuvemSeAplicar = async (id) => {
    if (!useNuvem) return;
    try {
      // 🔐 Registra/atualiza doc da empresa
      // await firestore().collection("empresas").doc(id).set(
      //   {
      //     criadoEm: new Date(),
      //     proprietario: !!ownerMode,
      //   },
      //   { merge: true }
      // );
    } catch (e) {
      console.warn("Falha ao registrar no Firestore:", e?.message);
      Alert.alert("Aviso", "Não foi possível registrar na nuvem agora.");
    }
  };

  const salvarLocal = async (id) => {
    try {
      await AsyncStorage.setItem("idEmpresa", id);
    } catch (e) {
      console.warn("Falha ao salvar idEmpresa local:", e?.message);
    }
  };

  const confirmarAplicacaoId = async (id) => {
    onChange?.(id);
    await salvarLocal(id);
    await registrarNaNuvemSeAplicar(id);
    Alert.alert("ID definido", `ID da Empresa: ${id}`);
  };

  const abrirPromptEscolha = () => {
    // Em Android/iOS usamos Alert com botões, e Modal para entrada manual.
    Alert.alert(
      "ID da Empresa",
      "Como você quer definir o ID?",
      [
        {
          text: "Gerar automático",
          onPress: async () => {
            const novo = gerarIdEmpresa();
            await confirmarAplicacaoId(novo);
          },
        },
        {
          text: "Criar manualmente",
          onPress: () => {
            setManualId(value || "");
            setManualOpen(true);
          },
        },
        { text: "Cancelar", style: "cancel" },
      ],
      { cancelable: true }
    );
  };

  const confirmarManual = async () => {
    const id = (manualId || "").trim().toUpperCase();
    if (!id) {
      Alert.alert("Atenção", "Digite um ID válido, ex.: EMPRESA-123");
      return;
    }
    // Validação simples (opcional)
    // if (!/^[-A-Z0-9]{3,}$/.test(id)) { ... }
    setManualOpen(false);
    await confirmarAplicacaoId(id);
  };

  return (
    <View>
      <TouchableOpacity style={styles.btnEscolher} onPress={abrirPromptEscolha}>
        <Text style={styles.btnTxt}>Escolher ID (Automático ou Manual)</Text>
      </TouchableOpacity>

      {/* Modal manual */}
      <Modal visible={manualOpen} transparent animationType="fade">
        <View style={styles.modalWrap}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Criar ID manualmente</Text>
            <Text style={styles.modalHint}>Ex.: EMPRESA-123</Text>
            <TextInput
              value={manualId}
              onChangeText={setManualId}
              placeholder="Digite o ID"
              autoCapitalize="characters"
              style={styles.input}
            />
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.btn, styles.btnCancel]}
                onPress={() => setManualOpen(false)}
              >
                <Text style={styles.btnLabel}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnOk]}
                onPress={confirmarManual}
              >
                <Text style={styles.btnLabel}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  btnEscolher: {
    backgroundColor: "#bfa140",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    marginTop: 10,
  },
  btnTxt: { color: "#fff", fontWeight: "700" },
  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalBox: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 6 },
  modalHint: { fontSize: 12, color: "#666", marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
  },
  row: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    justifyContent: "flex-end",
  },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  btnCancel: { backgroundColor: "#eee" },
  btnOk: { backgroundColor: "#bfa140" },
  btnLabel: { color: "#000", fontWeight: "600" },
});
