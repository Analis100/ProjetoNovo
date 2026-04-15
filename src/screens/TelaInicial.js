// screens/TelaInicial.js
import SubscriptionGate from "../components/SubscriptionGate";
import React, { useEffect, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { isExpoGo } from "../env";

// 🔑 Helpers de licença/plano
import {
  signOutAndGoToOnboarding,
  getPlan,
  getLicenseStatus,
} from "../services/license";

const SHOW_DEBUG = __DEV__ || isExpoGo;

export default function TelaInicial({ navigation }) {
  const [senhaModalVisivel, setSenhaModalVisivel] = useState(false);
  const [senhaDigitada, setSenhaDigitada] = useState("");
  const [destinoAposSenha, setDestinoAposSenha] = useState(null);

  const [temLicenca, setTemLicenca] = useState(false);
  const [gateLoading, setGateLoading] = useState(true);
  const [trialInfo, setTrialInfo] = useState(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const jaAvisou = await AsyncStorage.getItem("senhaAvisada");
        if (!jaAvisou) {
          Alert.alert(
            "Senha inicial",
            'A senha padrão é "1234". Você pode alterá-la em Configurações.',
          );
          await AsyncStorage.setItem("senhaAvisada", "true");
        }

        const plan = await getPlan();
        if (!mounted) return;

        const licenseStatus = await getLicenseStatus();
        if (!mounted) return;

        setTrialInfo(licenseStatus);

        // só para exibir botão/situação visual
        const ativoLocal =
          licenseStatus?.status === "licensed" ||
          licenseStatus?.status === "trial";

        setTemLicenca(!!ativoLocal);

        console.log("TelaInicial status/plano:", {
          plan,
          status: licenseStatus?.status,
          daysLeft: licenseStatus?.daysLeft,
        });
      } catch (e) {
        console.log("Erro ao carregar status na TelaInicial:", e);
      } finally {
        if (mounted) setGateLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const pedirSenhaPara = (screen, params) => {
    setDestinoAposSenha({ screen, params: params || null });
    setSenhaDigitada("");
    setSenhaModalVisivel(true);
  };

  const confirmarSenha = async () => {
    try {
      const senhaSalva = (await AsyncStorage.getItem("senhaAcesso")) || "1234";
      const digitada = String(senhaDigitada || "").trim();
      const salva = String(senhaSalva || "").trim();

      if (!digitada || digitada !== salva) {
        Alert.alert("Senha incorreta", "Acesso negado.");
        setSenhaDigitada("");
        return;
      }

      const destino = destinoAposSenha;

      setSenhaModalVisivel(false);
      setSenhaDigitada("");
      setDestinoAposSenha(null);

      if (destino?.screen) {
        if (destino.params) {
          navigation.navigate(destino.screen, destino.params);
        } else {
          navigation.navigate(destino.screen);
        }
      }
    } catch (e) {
      console.log("Erro ao verificar senha:", e);
      Alert.alert("Erro", "Não foi possível verificar a senha agora.");
      setSenhaDigitada("");
    }
  };

  const onLogout = async () => {
    const ativo =
      trialInfo?.status === "licensed" || trialInfo?.status === "trial";

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
      ],
    );
  };

  const botoes = [
    {
      label: "Instruções de Uso",
      onPress: () => navigation.navigate("Instrucoes"),
      color: "#17a2b8",
    },
    {
      label: "Saldo Anterior",
      onPress: () => pedirSenhaPara("SaldoAnterior"),
      color: "#007bff",
    },
    {
      label: "Compras",
      onPress: () => pedirSenhaPara("Compras"),
      color: "#0984e3",
    },
    {
      label: "Vendas",
      onPress: () => navigation.navigate("Vendas"),
      color: "#007bff",
    },
    {
      label: "Prestação de Serviços",
      onPress: () => navigation.navigate("PrestacaoServicos"),
      color: "#007bff",
    },
    {
      label: "Despesas",
      onPress: () => navigation.navigate("Despesas"),
      color: "#007bff",
    },
    {
      label: "Saldo Final",
      onPress: () => pedirSenhaPara("ResultadoCaixa"),
      color: "#007bff",
    },
    {
      label: "Demonstrativo",
      onPress: () => pedirSenhaPara("Historico"),
      color: "#28a745",
    },
    {
      label: "Estoque",
      onPress: () => pedirSenhaPara("ControleEstoque"),
      color: "#28a745",
    },
    {
      label: "CMV-Custo da Mercadoria Vendida",
      onPress: () => pedirSenhaPara("CMV"),
      color: "#bfa140",
    },
    {
      label: "Agenda Inteligente",
      onPress: () => pedirSenhaPara("AgendaInteligente"),
      color: "#007bff",
    },
    {
      label: "Exportar PDF",
      onPress: () => pedirSenhaPara("ExportarPDFCompleto"),
      color: "#6c63ff",
    },
    {
      label: "Configurações",
      onPress: () => pedirSenhaPara("ConfiguraSenha"),
      color: "#6c757d",
    },
    {
      label: "Mudar de Plano",
      onPress: () => navigation.navigate("GerenciarPlanoScreen"),
      color: "#bfa140",
    },
  ];

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

  const showTrialBanner = trialInfo?.status === "trial";
  const isTrialEndingSoon =
    showTrialBanner &&
    typeof trialInfo?.daysLeft === "number" &&
    trialInfo.daysLeft <= 3;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* <SubscriptionGate /> */}

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>DRD-Financeiro</Text>
        <Text style={styles.subtitle}>Demonstrativo do Resultado Diário</Text>

        {showTrialBanner && (
          <View
            style={[
              styles.trialBanner,
              isTrialEndingSoon
                ? styles.trialBannerDanger
                : styles.trialBannerWarn,
            ]}
          >
            <Text
              style={[
                styles.trialBannerText,
                isTrialEndingSoon
                  ? styles.trialBannerTextDanger
                  : styles.trialBannerTextWarn,
              ]}
            >
              Período grátis • Restam {trialInfo.daysLeft}{" "}
              {trialInfo.daysLeft === 1 ? "dia" : "dias"}
            </Text>

            {trialInfo.daysLeft === 1 && (
              <Text style={styles.trialBannerSubtext}>
                Último dia de acesso gratuito
              </Text>
            )}
          </View>
        )}

        {botoes.map((btn, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.button, { backgroundColor: btn.color || "#007bff" }]}
            onPress={btn.onPress}
          >
            <Text style={styles.buttonText}>{btn.label}</Text>
          </TouchableOpacity>
        ))}

        {SHOW_DEBUG && (
          <TouchableOpacity
            style={[styles.button, { backgroundColor: "#6c63ff" }]}
            onPress={() => navigation.navigate("PagamentosMP")}
          >
            <Text style={styles.buttonText}>Pagamentos (MP)</Text>
          </TouchableOpacity>
        )}

        {temLicenca && (
          <TouchableOpacity style={styles.buttonDanger} onPress={onLogout}>
            <Text style={styles.buttonDangerText}>
              Sair / Desativar licença
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

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
                  setDestinoAposSenha(null);
                }}
              >
                <Text>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBotao, { backgroundColor: "#4CAF50" }]}
                onPress={confirmarSenha}
              >
                <Text style={{ color: "#fff" }}>Confirmar</Text>
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
    paddingTop: 56,
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
  trialBanner: {
    width: "100%",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  trialBannerWarn: {
    backgroundColor: "#fef3c7",
  },
  trialBannerDanger: {
    backgroundColor: "#fee2e2",
  },
  trialBannerText: {
    textAlign: "center",
    fontWeight: "700",
    fontSize: 15,
  },
  trialBannerTextWarn: {
    color: "#92400e",
  },
  trialBannerTextDanger: {
    color: "#b91c1c",
  },
  trialBannerSubtext: {
    marginTop: 4,
    textAlign: "center",
    fontSize: 12,
    color: "#b91c1c",
    fontWeight: "600",
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
