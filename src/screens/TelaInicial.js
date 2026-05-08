// screens/TelaInicial.js
import React, { useEffect, useState, useCallback, useRef } from "react";
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
  AppState,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { isExpoGo } from "../env";

// 🔑 Helpers de licença/plano
import { signOutAndGoToOnboarding } from "../services/license";
import { getSubscriptionStatus } from "../services/subscription";
import { getDeviceId } from "../utils/deviceId";

const SHOW_DEBUG = __DEV__ || isExpoGo;

export default function TelaInicial({ navigation }) {
  const [senhaModalVisivel, setSenhaModalVisivel] = useState(false);
  const [senhaDigitada, setSenhaDigitada] = useState("");
  const [destinoAposSenha, setDestinoAposSenha] = useState(null);

  const [temLicenca, setTemLicenca] = useState(false);
  const [gateLoading, setGateLoading] = useState(true);
  const [trialInfo, setTrialInfo] = useState(null);
  const [horasRestantes, setHorasRestantes] = useState(0);
  const [trialEndsAt, setTrialEndsAt] = useState(null);

  const redirecionouRef = useRef(false);

  const diasRestantes = Math.max(0, Number(trialInfo?.daysLeft ?? 0));
  const horasRestantesSafe = Math.max(0, Number(horasRestantes ?? 0));

  const showTrialBanner = false;

  const isTrialEndingToday =
    showTrialBanner && diasRestantes === 0 && horasRestantesSafe > 0;

  const isTrialEndingSoon =
    showTrialBanner &&
    (diasRestantes < 1 || (diasRestantes === 1 && horasRestantesSafe <= 23));
  const carregarStatusPlano = useCallback(async () => {
    try {
      const id = await getDeviceId();
      const status = await getSubscriptionStatus(id);

      const trial = status?.trial || null;
      const lic = status?.license || null;

      if (trial?.trialActive === true && trial?.trialEndsAt) {
        const end = new Date(trial.trialEndsAt);
        const now = new Date();
        const ms = end.getTime() - now.getTime();
        const totalMinutos = Math.max(0, Math.floor(ms / (1000 * 60)));
        const totalHoras = Math.floor(totalMinutos / 60);
        const dias = Math.floor(totalHoras / 24);
        const horas = totalHoras % 24;

        setTrialEndsAt(trial.trialEndsAt);
        setTemLicenca(true);
        setHorasRestantes(Math.max(0, horas));
        setTrialInfo({
          status: "trial",
          daysLeft: Math.max(0, dias),
        });

        redirecionouRef.current = false;

        console.log("TelaInicial status remoto:", {
          uiStatus: "trial",
          trialEndsAt: trial.trialEndsAt,
          dias,
          horas,
          raw: status,
        });

        return;
      }

      if (
        ["licensed", "active", "approved"].includes(
          String(lic?.status || "").toLowerCase(),
        )
      ) {
        setTrialEndsAt(null);
        setHorasRestantes(0);
        setTrialInfo({ status: "licensed", daysLeft: 0 });
        setTemLicenca(true);

        redirecionouRef.current = false;

        console.log("TelaInicial status remoto:", {
          uiStatus: "licensed",
          raw: status,
        });

        return;
      }

      // 🔴 EXPIRADO
      setTrialEndsAt(null);
      setHorasRestantes(0);
      setTrialInfo({ status: "expired", daysLeft: 0 });
      setTemLicenca(false);

      console.log("TelaInicial status remoto:", {
        uiStatus: "expired",
        raw: status,
      });

      // 🔥 redireciona corretamente
      if (!redirecionouRef.current) {
        redirecionouRef.current = true;

        navigation.reset({
          index: 0,
          routes: [{ name: "GerenciarPlanoScreen" }],
        });
      }
    } catch (e) {
      console.log("Erro ao carregar status na TelaInicial:", e);
    }
  }, [navigation]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const jaAvisou = await AsyncStorage.getItem("senhaAvisada");
        if (!jaAvisou) {
          Alert.alert(
            "Senha inicial",
            'A senha padrão é "1234". Você pode alterá-la em Configurações.',
          );
          await AsyncStorage.setItem("senhaAvisada", "true");
        }

        if (mounted) {
          await carregarStatusPlano();
        }
      } catch (e) {
        console.log("Erro ao iniciar TelaInicial:", e);
      } finally {
        if (mounted) setGateLoading(false);
      }
    };

    init();

    const unsubscribeFocus = navigation.addListener("focus", () => {
      carregarStatusPlano();
    });

    const subAppState = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        carregarStatusPlano();
      }
    });

    return () => {
      mounted = false;
      unsubscribeFocus?.();
      subAppState?.remove?.();
    };
  }, [navigation, carregarStatusPlano]);

  useEffect(() => {
    if (!trialEndsAt) return;

    const atualizarContagem = () => {
      const end = new Date(trialEndsAt);
      const now = new Date();
      const ms = end.getTime() - now.getTime();

      if (ms <= 0) {
        setTrialInfo({ status: "expired", daysLeft: 0 });
        setHorasRestantes(0);
        setTrialEndsAt(null);
        setTemLicenca(false);

        if (!redirecionouRef.current) {
          redirecionouRef.current = true;

          Alert.alert(
            "Período grátis encerrado",
            "Seu período gratuito terminou. Escolha um plano para continuar usando o app.",
            [
              {
                text: "OK",
                onPress: () => {
                  navigation.reset({
                    index: 0,
                    routes: [{ name: "GerenciarPlanoScreen" }],
                  });
                },
              },
            ],
          );
        }

        return;
      }

      const totalMinutos = Math.max(0, Math.floor(ms / (1000 * 60)));
      const totalHoras = Math.floor(totalMinutos / 60);
      const dias = Math.floor(totalHoras / 24);
      const horas = totalHoras % 24;

      setTrialInfo({
        status: "trial",
        daysLeft: Math.max(0, dias),
      });
      setHorasRestantes(Math.max(0, horas));
      setTemLicenca(true);

      // enquanto ainda está ativo, deixa pronto para redirecionar no futuro
      redirecionouRef.current = false;

      console.log("⏳ Trial contagem:", {
        now: now.toISOString(),
        end: trialEndsAt,
        dias,
        horas,
      });
    };

    atualizarContagem();

    const interval = setInterval(atualizarContagem, 60000);

    return () => clearInterval(interval);
  }, [trialEndsAt, navigation]);

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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
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
              {isTrialEndingToday
                ? `Período grátis • Expira hoje em ${horasRestantesSafe}h`
                : diasRestantes === 1
                  ? `Período grátis • Resta 1 dia e ${horasRestantesSafe}h`
                  : `Período grátis • ${diasRestantes} dias e ${horasRestantesSafe}h restantes`}
            </Text>

            {(diasRestantes === 1 || isTrialEndingToday) && (
              <Text style={styles.trialBannerSubtext}>
                {isTrialEndingToday
                  ? "Seu acesso gratuito termina hoje"
                  : "Último dia de acesso gratuito"}
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
    marginTop: 18,
    marginBottom: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  trialBannerWarn: {
    backgroundColor: "#fef3c7",
  },
  trialBannerDanger: {
    backgroundColor: "#FDE7E7",
    borderWidth: 1,
    borderColor: "#E8B4B4",
  },
  trialBannerTextDanger: {
    color: "#B00020",
  },
  trialBannerText: {
    textAlign: "center",
    fontWeight: "700",
    fontSize: 16,
  },
  trialBannerTextWarn: {
    color: "#8A3D00",
  },

  trialBannerSubtext: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "600",
    color: "#B00020",
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
