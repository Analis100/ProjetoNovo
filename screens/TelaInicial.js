// screens/TelaInicial.js
import React, { useEffect, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  Modal,
  TextInput,
  Button,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Modo de execução (Expo Go / Dev Client / Standalone)
import { isExpoGo } from "../src/env";
// Notificações locais (funciona em todos os modos)
import { showLocalNotificationAsync } from "../src/notifications";

// 🔑 Helpers de licença/plano
import {
  hasActiveLicense,
  signOutAndGoToOnboarding,
  getPlan,
} from "../services/license";

export default function TelaInicial({ navigation }) {
  const [senhaModalVisivel, setSenhaModalVisivel] = useState(false);
  const [senhaDigitada, setSenhaDigitada] = useState("");
  const [temLicenca, setTemLicenca] = useState(false);
  const [gateLoading, setGateLoading] = useState(true); // ⬅️ bloqueio inicial de navegação

  // Gate: garante o fluxo Código → Plano → TelaInicial
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Aviso de senha padrão (uma vez)
        const jaAvisou = await AsyncStorage.getItem("senhaAvisada");
        if (!jaAvisou) {
          Alert.alert(
            "Senha inicial",
            'A senha padrão é "1234". Você pode alterá-la em Configurações.'
          );
          await AsyncStorage.setItem("senhaAvisada", "true");
        }

        // 1) Checa licença
        const licensed = await hasActiveLicense();
        if (!licensed) {
          if (!mounted) return;
          // Sem licença → vai para tela de ativação de código
          navigation.reset({ index: 0, routes: [{ name: "AtivacaoCodigo" }] });
          return;
        }

        // 2) Checa plano salvo
        const plan = await getPlan(); // "INDIVIDUAL" | "COLABORADORES" | null
        if (!plan) {
          if (!mounted) return;
          // Licensed mas sem plano → escolher plano
          navigation.reset({ index: 0, routes: [{ name: "GerenciarPlano" }] });
          return;
        }

        // 3) Tudo ok, segue na TelaInicial
        if (!mounted) return;
        setTemLicenca(true);
      } catch {
        // falhou algo? manda para ativação para não travar fluxo
        if (!mounted) return;
        navigation.reset({ index: 0, routes: [{ name: "AtivacaoCodigo" }] });
      } finally {
        if (mounted) setGateLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [navigation]);

  const verificarSenha = () => {
    if (senhaDigitada === "1234") {
      setSenhaModalVisivel(false);
      setSenhaDigitada("");
      navigation.navigate("CMV");
    } else {
      Alert.alert("Senha incorreta", "Acesso negado.");
      setSenhaDigitada("");
    }
  };

  const onLogout = async () => {
    const ativo = await hasActiveLicense();
    if (!ativo) {
      Alert.alert("Aviso", "Nenhum plano ativo neste dispositivo.");
      return;
    }
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

  const botoes = [
    { label: "Instruções de Uso", screen: "Instrucoes", color: "#17a2b8" },
    {
      label: "Saldo Anterior",
      screen: "Senha",
      params: { destino: "SaldoAnterior" },
    },
    { label: "Receitas", screen: "Receitas" },
    { label: "Despesas", screen: "Despesas" },
    {
      label: "Saldo Final",
      screen: "Senha",
      params: { destino: "SaldoFinal" },
    },
    {
      label: "Demonstrativo",
      screen: "Senha",
      params: { destino: "Historico" },
      color: "#28a745",
    },
    { label: "Estoque", screen: "ControleEstoque", color: "#28a745" },
    {
      label: "CMV-Custo da Mercadoria Vendida",
      onPress: () => setSenhaModalVisivel(true),
      color: "#bfa140",
    },
    {
      label: "Exportar PDF",
      screen: "Senha",
      params: { destino: "ExportarPDFCompleto" },
      color: "#6c63ff",
    },
    {
      label: "Configurações",
      screen: "Senha",
      params: { destino: "ConfiguraSenha" },
      color: "#6c757d",
    },
  ];

  // Enquanto decide para onde mandar (Ativação/Plano/Home), mostra um loading simples
  if (gateLoading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#fff",
        }}
      >
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 12, color: "#666" }}>Carregando…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>DRD-Financeiro</Text>
        <Text style={styles.subtitle}>Demonstrativo do Resultado Diário</Text>

        {botoes.map((btn, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.button, { backgroundColor: btn.color || "#007bff" }]}
            onPress={
              btn.onPress
                ? btn.onPress
                : () =>
                    btn.params
                      ? navigation.navigate(btn.screen, btn.params)
                      : navigation.navigate(btn.screen)
            }
          >
            <Text style={styles.buttonText}>{btn.label}</Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={styles.botao}
          onPress={() => navigation.navigate("AgendaInteligente")}
        >
          <Text style={styles.textoBotao}>Agenda Inteligente</Text>
        </TouchableOpacity>

        {/* Mudar de Plano */}
        <TouchableOpacity
          style={[styles.button, { backgroundColor: "#bfa140", marginTop: 10 }]}
          onPress={() => navigation.navigate("GerenciarPlano")}
        >
          <Text style={styles.buttonText}>Mudar de Plano</Text>
        </TouchableOpacity>

        {/* 🔴 Sair / Desativar licença (só aparece se houver licença ativa) */}
        {temLicenca && (
          <TouchableOpacity style={[styles.buttonDanger]} onPress={onLogout}>
            <Text style={styles.buttonDangerText}>
              Sair / Desativar licença
            </Text>
          </TouchableOpacity>
        )}

        {/* Divider */}
        <View style={{ height: 24 }} />

        {/* AVISO quando estiver no Expo Go */}
        {isExpoGo && (
          <Text style={styles.infoText}>
            ⚠️ No Expo Go, notificações por push remoto não funcionam. Você pode
            testar notificações locais abaixo. Para push remoto, abra com o Dev
            Client.
          </Text>
        )}

        {/* Botão de Teste de Notificação Local */}
        <View style={{ width: "100%", marginTop: 8 }}>
          <Button
            title="🔔 Testar Notificação Local"
            onPress={() =>
              showLocalNotificationAsync("Teste de Notificação", "Funcionou 🎉")
            }
          />
        </View>
      </ScrollView>

      {/* Modal da senha (apenas Cancelar/Confirmar) */}
      <Modal visible={senhaModalVisivel} transparent animationType="fade">
        <View style={styles.modalFundo}>
          <View style={styles.modalArea}>
            <Text style={styles.modalTitulo}>Digite a senha para acessar:</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Senha"
              secureTextEntry
              value={senhaDigitada}
              onChangeText={setSenhaDigitada}
            />
            <View style={styles.modalBotoes}>
              <TouchableOpacity
                style={[styles.modalBotao, { backgroundColor: "#ccc" }]}
                onPress={() => {
                  setSenhaModalVisivel(false);
                  setSenhaDigitada("");
                }}
              >
                <Text>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBotao, { backgroundColor: "#4CAF50" }]}
                onPress={verificarSenha}
              >
                <Text style={{ color: "white" }}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    padding: 20,
    paddingBottom: 100,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#bfa140",
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 24,
    color: "#bfa140",
    textAlign: "center",
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    marginVertical: 6,
    width: "100%",
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    textAlign: "center",
  },
  botao: {
    backgroundColor: "#007bff",
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    marginVertical: 6,
    width: "100%",
    alignItems: "center",
  },
  textoBotao: {
    color: "#fff",
    fontSize: 18,
  },
  buttonDanger: {
    backgroundColor: "#ff4d4f",
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    marginVertical: 10,
    width: "100%",
  },
  buttonDangerText: {
    color: "#fff",
    fontSize: 18,
    textAlign: "center",
    fontWeight: "bold",
  },
  infoText: {
    fontSize: 13,
    color: "#555",
    textAlign: "center",
    lineHeight: 18,
  },
  modalFundo: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalArea: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 10,
    width: "80%",
    alignItems: "center",
  },
  modalTitulo: {
    fontWeight: "bold",
    fontSize: 16,
    marginBottom: 10,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    width: "100%",
    padding: 8,
    marginBottom: 15,
  },
  modalBotoes: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  modalBotao: {
    flex: 1,
    padding: 10,
    borderRadius: 6,
    alignItems: "center",
  },
});
