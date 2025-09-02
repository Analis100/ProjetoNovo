// screens/GerenciarPlanoScreen.js
import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  STORAGE,
  hasActiveLicense,
  signOutAndGoToOnboarding,
} from "../services/license";

export default function GerenciarPlanoScreen({ navigation }) {
  const [plano, setPlano] = useState(null);
  const [codigo, setCodigo] = useState(null);
  const [dataAtivacao, setDataAtivacao] = useState(null);

  useEffect(() => {
    (async () => {
      const ativo = await hasActiveLicense();
      if (!ativo) {
        setPlano(null);
        return;
      }

      const [planoSalvo, codigoSalvo, data] = await Promise.all([
        AsyncStorage.getItem(STORAGE.PLAN),
        AsyncStorage.getItem(STORAGE.LIC_CODE),
        AsyncStorage.getItem(STORAGE.ACTIVATED_AT),
      ]);

      setPlano(planoSalvo);
      setCodigo(codigoSalvo);
      if (data) {
        const d = new Date(parseInt(data, 10));
        setDataAtivacao(d.toLocaleDateString("pt-BR"));
      }
    })();
  }, []);

  const onLogout = async () => {
    Alert.alert(
      "Sair do plano",
      "Isso vai desativar este dispositivo e voltar para o início. Deseja continuar?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sim, sair",
          style: "destructive",
          onPress: async () => {
            await signOutAndGoToOnboarding(navigation);
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Gerenciar Plano</Text>

      {plano ? (
        <View style={styles.card}>
          <Text style={styles.label}>Plano ativo:</Text>
          <Text style={styles.valor}>{plano}</Text>

          {codigo && (
            <>
              <Text style={styles.label}>Código usado:</Text>
              <Text style={styles.valor}>{codigo}</Text>
            </>
          )}

          {dataAtivacao && (
            <>
              <Text style={styles.label}>Ativado em:</Text>
              <Text style={styles.valor}>{dataAtivacao}</Text>
            </>
          )}
        </View>
      ) : (
        <Text style={{ marginTop: 20, color: "#555" }}>
          Nenhum plano ativo neste dispositivo.
        </Text>
      )}

      {plano && (
        <TouchableOpacity style={styles.botaoPerigo} onPress={onLogout}>
          <Text style={styles.botaoPerigoTxt}>Sair / Desativar licença</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#fff" },
  titulo: {
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 20,
    color: "#bfa140",
  },
  card: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 12,
    padding: 16,
    marginBottom: 30,
    backgroundColor: "#fafafa",
  },
  label: { fontSize: 16, fontWeight: "600", marginTop: 8, color: "#333" },
  valor: { fontSize: 18, marginTop: 2, color: "#000" },
  botaoPerigo: {
    backgroundColor: "#ff4d4f",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  botaoPerigoTxt: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
