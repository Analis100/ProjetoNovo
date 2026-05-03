import "react-native-gesture-handler";
import "react-native-reanimated";
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  AppState,
  Modal,
  TouchableOpacity,
  Alert,
  Linking,
  Platform,
  Pressable,
} from "react-native";
import Constants from "expo-constants";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

// MODO DE EXECUÇÃO
import { isExpoGo, isDevClient, isStandalone } from "./src/env";

// 🔔 Notificações (novo módulo seguro)
import {
  getPushTokenSafe,
  initNotificationListeners,
  removeNotificationListeners,
} from "./src/screens/services/notifications";

// Assinatura
import { getSubscriptionStatus } from "./src/services/subscription";

// 🔑 licença/plano (local)
import { getPlan } from "./src/services/license";

// 🔧 config remota (DRY: sem hardcode aqui)
import { BASE_URL } from "./src/services/config";

// 📌 DeviceId agora vem do helper local
import { getDeviceId } from "./src/utils/deviceId";

// telas do app
import TelaInicial from "./src/screens/TelaInicial";
import PlanosScreen from "./src/screens/PlanosScreen";
import Instrucoes from "./src/screens/Instrucoes";
import SaldoAnterior from "./src/screens/SaldoAnterior";
import Compras from "./src/screens/Compras";
import Vendas from "./src/screens/Vendas";
import CalculoLimiteMEI from "./src/screens/CalculoLimiteMEI";
import ConfigMEI from "./src/screens/ConfigMEI";
import Despesas from "./src/screens/Despesas";
import PrestacaoServicos from "./src/screens/PrestacaoServicos";
import ReceitaServicos from "./src/screens/ReceitaServicos";
import CatalogoServicos from "./src/screens/CatalogoServicos";
import Orcamento from "./src/screens/Orcamento";
import OrcamentoCliente from "./src/screens/OrcamentoCliente";
import RelacaoOrcamentos from "./src/screens/RelacaoOrcamentos";
import ContratoVista from "./src/screens/ContratoVista";
import ContratoPrazo from "./src/screens/ContratoPrazo";
import RelacionarMateriais from "./src/screens/RelacionarMateriais";
import ComprasMateriaisConsumo from "./src/screens/ComprasMateriaisConsumo";
import EstoqueMateriais from "./src/screens/EstoqueMateriais";
import ResultadoCaixa from "./src/screens/ResultadoCaixa";
import SaldoFinal from "./src/screens/SaldoFinal";
import Senha from "./src/screens/Senha";
import Historico from "./src/screens/Historico";
import ControleEstoque from "./src/screens/ControleEstoque";
import CMV from "./src/screens/CMV";
import ExportarPDFCompleto from "./src/screens/ExportarPDFCompleto";
import ConfiguraSenha from "./src/screens/ConfiguraSenha";
import RecuperarSenha from "./src/screens/RecuperarSenha";
import CatalogoScreen from "./src/screens/CatalogoScreen";
import ListaCredores from "./src/screens/ListaCredores";
import ContasPagar from "./src/screens/ContasPagar";
import ClientePrazo from "./src/screens/ClientePrazo";
import RelacaoClientes from "./src/screens/RelacaoClientes";
import AgendaInteligente from "./src/screens/AgendaInteligente";
import ListaClientesAgenda from "./src/screens/ListaClientesAgenda";
import ClientesAgenda from "./src/screens/ClientesAgenda";
import Compromissos from "./src/screens/Compromissos";
import Tarefas from "./src/screens/Tarefas";
import Colaboradores from "./src/screens/Colaboradores";
import RecebimentosPrazo from "./src/screens/RecebimentosPrazo";

// telas de plano/código
import EscolherPlano from "./src/screens/EscolherPlano";
import AssinaturaStatus from "./src/screens/AssinaturaStatus";

// pagos/gerenciar
import GerenciarPlanoScreen from "./src/screens/GerenciarPlanoScreen";
import PagamentoScreen from "./src/screens/PagamentoScreen";
import PagamentosMP from "./src/screens/PagamentosMP";
import ModoVendedor from "./src/screens/ModoVendedor";

const Stack = createNativeStackNavigator();

/** ========= Utilitários de versão ========= **/
function compareVersions(a = "", b = "") {
  const pa = String(a)
    .split(".")
    .map((n) => Number(n || 0));
  const pb = String(b)
    .split(".")
    .map((n) => Number(n || 0));

  const len = Math.max(pa.length, pb.length);

  for (let i = 0; i < len; i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;

    if (va > vb) return 1;
    if (va < vb) return -1;
  }

  return 0;
}

function getInstalledVersion() {
  return (
    Constants.nativeAppVersion ||
    Constants.expoConfig?.version ||
    Constants.manifest?.version ||
    Constants.manifest2?.extra?.expoClient?.version ||
    "0.0.0"
  );
}

async function fetchUpdateConfig() {
  const url = `${BASE_URL}/app-version`;
  console.log("🌐 Consultando atualização:", url);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
      },
      signal: controller.signal,
    });

    console.log("📡 status /app-version:", res.status);

    if (!res.ok) {
      throw new Error(`Falha ao consultar versão (${res.status})`);
    }

    const json = await res.json();

    console.log("📄 resposta /app-version:", json);
    console.log("📱 versão instalada:", getInstalledVersion());

    return json;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function checkForAppUpdate() {
  const installedVersion = getInstalledVersion();
  const remote = await fetchUpdateConfig();

  const latestVersion = remote?.latestVersion || installedVersion;
  const minVersion = remote?.minVersion || installedVersion;
  const forceFromServer = remote?.force === true;

  const hasUpdate = compareVersions(latestVersion, installedVersion) === 1;
  const mustUpdateByMinVersion =
    compareVersions(minVersion, installedVersion) === 1;

  const force = forceFromServer || mustUpdateByMinVersion;

  const storeUrl =
    Platform.OS === "ios" ? remote?.updateUrlIos : remote?.updateUrlAndroid;

  return {
    installedVersion,
    latestVersion,
    minVersion,
    hasUpdate,
    mustUpdate: force,
    force,
    message:
      remote?.message || "Há uma nova versão disponível para atualização.",
    storeUrl,
  };
}

async function openStoreUpdate(url) {
  if (!url) {
    throw new Error("Link da loja não configurado.");
  }

  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) {
    throw new Error("Não foi possível abrir a loja.");
  }

  await Linking.openURL(url);
}

/** ========= Função de acesso remoto ========= **/
async function fetchRemoteAccess() {
  const deviceId = await getDeviceId();

  const url = `${BASE_URL}/assinaturas/status?deviceId=${encodeURIComponent(
    deviceId,
  )}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`Falha ao consultar acesso (${res.status})`);
    const json = await res.json();

    return {
      active: json?.access?.active === true || json?.access?.allowed === true,
      tier: json?.license?.tier ?? null,
      source: json?.access?.source ?? null,
      trialActive: json?.trial?.trialActive === true,
      trial: json?.trial ?? null,
      license: json?.license ?? null,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export default function App() {
  const [bootLoading, setBootLoading] = useState(true);
  const [licensed, setLicensed] = useState(null);
  const [plan, setPlan] = useState(null);
  const [bootError, setBootError] = useState(false);

  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateVisible, setUpdateVisible] = useState(false);
  const [deviceId, setDeviceId] = useState("");

  const bootTimedOutRef = useRef(false);
  const checkingRef = useRef(false);

  const checkAll = async ({ silent = false } = {}) => {
    if (checkingRef.current) return;
    checkingRef.current = true;

    if (!silent && !bootTimedOutRef.current) {
      setBootLoading(true);
    }

    try {
      let remoteActive = false;
      let remoteTier = null;
      let remoteTrialActive = false;

      try {
        const r = await fetchRemoteAccess();
        remoteActive = !!r.active;
        remoteTier = r.tier;
        remoteTrialActive = !!r.trialActive;

        console.log("🌐 Acesso remoto:", {
          active: r.active,
          tier: r.tier,
          source: r.source,
          trialActive: r.trialActive,
          trial: r.trial,
          license: r.license,
        });
      } catch (e) {
        console.log("⚠️ Falha ao consultar acesso remoto:", e?.message || e);
      }

      let localActive = false;
      let localTrialActive = false;
      let localLicensed = false;

      try {
        const id = await getDeviceId();
        const localStatus = await getSubscriptionStatus(id);

        localTrialActive =
          localStatus?.trial?.trialActive === true ||
          localStatus?.trialActive === true;

        localLicensed =
          localStatus?.active === true ||
          localStatus?.allowed === true ||
          ["licensed", "active", "approved"].includes(
            String(
              localStatus?.license?.status || localStatus?.status || "",
            ).toLowerCase(),
          );

        localActive = localTrialActive || localLicensed;

        console.log("📱 Acesso local:", {
          raw: localStatus,
          localTrialActive,
          localLicensed,
          localActive,
        });
      } catch (e) {
        console.log("⚠️ Falha ao consultar acesso local:", e?.message || e);
      }

      const finalActive =
        remoteTrialActive ||
        remoteActive ||
        localTrialActive ||
        localLicensed ||
        localActive;

      setLicensed(finalActive);

      if (remoteTier) {
        setPlan(remoteTier);
      } else {
        try {
          const currentPlan = await getPlan();
          setPlan(currentPlan || null);
        } catch {
          setPlan(null);
        }
      }

      console.log("✅ checkAll:", {
        remoteActive,
        remoteTrialActive,
        localTrialActive,
        localLicensed,
        localActive,
        finalActive,
        remoteTier,
      });
    } finally {
      checkingRef.current = false;
      setBootLoading(false);
    }
  };

  const checkUpdates = async () => {
    try {
      console.log("🔎 checkUpdates iniciou");

      const info = await checkForAppUpdate();
      console.log("📦 info da atualização:", info);

      if (info?.hasUpdate || info?.mustUpdate) {
        console.log("🚨 Mostrar tela de atualização");
        setUpdateInfo(info);
        setUpdateVisible(true);
      } else {
        console.log("ℹ️ Sem atualização");
        setUpdateInfo(null);
        setUpdateVisible(false);
      }
    } catch (e) {
      console.log("❌ Falha ao checar atualização:", e?.message || e);
    }
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const id = await getDeviceId();
        if (!mounted) return;

        setDeviceId(id);
        console.log("🔑 DRD DeviceId:", id);

        try {
          const status = await getSubscriptionStatus(id);
          console.log("📡 Status assinatura/local:", status);
        } catch (e) {
          console.log(
            "⚠️ Não foi possível consultar status inicial:",
            e?.message,
          );
        }
      } catch (e) {
        console.log("⚠️ Não foi possível obter o DeviceId:", e?.message || e);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    if (isExpoGo) console.log("App rodando no Expo Go");
    if (isDevClient) console.log("App rodando no Dev Client");
    if (isStandalone) console.log("App rodando como Standalone (publicado)");

    const bootTimeout = setTimeout(() => {
      if (!mounted) return;

      bootTimedOutRef.current = true;
      console.log("⏱️ Timeout de segurança acionado");

      setBootError(true);
      setBootLoading(false);
    }, 8000);

    checkAll();

    checkAll();

    setTimeout(() => {
      checkUpdates();
    }, 1500);

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        checkAll({ silent: true });
        checkUpdates();
      }
    });

    (async () => {
      try {
        const { token, granted, reason } = await getPushTokenSafe({
          askPermission: false,
        });
        console.log(
          "[push] token:",
          token,
          "granted:",
          granted,
          "reason:",
          reason,
        );
      } catch (e) {
        console.log("⚠️ Falha ao obter push token:", e?.message || e);
      }
    })();

    initNotificationListeners(
      (n) => console.log("[push] received:", n),
      (r) => console.log("[push] response:", r),
    );

    return () => {
      mounted = false;
      clearTimeout(bootTimeout);
      sub.remove?.();
      removeNotificationListeners();
    };
  }, []);

  if (bootLoading || licensed === null) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#fff",
        }}
      >
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 12, color: "#666" }}>Carregando...</Text>
      </View>
    );
  }

  const isPaywalled = !licensed;

  if (__DEV__) {
    console.log("BOOT STATE =>", {
      licensed,
      plan,
      isPaywalled,
      updateInfo,
    });
  }

  return (
    <>
      <Modal
        visible={
          updateVisible && (updateInfo?.hasUpdate || updateInfo?.mustUpdate)
        }
        transparent={true}
        animationType="fade"
        statusBarTranslucent={true}
        hardwareAccelerated={true}
        presentationStyle="overFullScreen"
      >
        <View
          pointerEvents="box-none"
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 360,
              backgroundColor: "#fff",
              borderRadius: 16,
              padding: 20,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "bold",
                marginBottom: 12,
                textAlign: "center",
              }}
            >
              Atualização disponível
            </Text>

            <Text
              style={{
                fontSize: 15,
                textAlign: "center",
                marginBottom: 10,
              }}
            >
              {updateInfo?.message || "Há uma nova versão disponível."}
            </Text>

            <Text
              style={{
                fontSize: 14,
                textAlign: "center",
                color: "#555",
                marginBottom: 4,
              }}
            >
              Sua versão: {updateInfo?.installedVersion}
            </Text>

            <Text
              style={{
                fontSize: 14,
                textAlign: "center",
                color: "#007AFF",
                fontWeight: "bold",
                marginBottom: 18,
              }}
            >
              Nova versão: {updateInfo?.latestVersion}
            </Text>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={async () => {
                try {
                  await openStoreUpdate(updateInfo?.storeUrl);
                } catch (e) {
                  Alert.alert(
                    "Erro",
                    e?.message || "Não foi possível abrir a loja.",
                  );
                }
              }}
              style={{
                backgroundColor: "#007AFF",
                paddingVertical: 14,
                borderRadius: 12,
                marginBottom: 10,
                zIndex: 9999,
                elevation: 9999,
              }}
            >
              <Text
                style={{
                  color: "#fff",
                  textAlign: "center",
                  fontWeight: "bold",
                  fontSize: 16,
                }}
              >
                Atualizar agora
              </Text>
            </TouchableOpacity>

            {!updateInfo?.force && (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setUpdateVisible(false)}
                style={{
                  paddingVertical: 12,
                  zIndex: 9999,
                  elevation: 9999,
                }}
              >
                <Text
                  style={{
                    textAlign: "center",
                    color: "#333",
                    fontSize: 16,
                  }}
                >
                  Depois
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      <NavigationContainer key={isPaywalled ? "paywalled" : "unlocked"}>
        <Stack.Navigator
          screenOptions={{
            headerShown: true,
            headerTitleAlign: "center",
            headerTintColor: "#111",
            headerBackTitleVisible: true,
            headerShadowVisible: false,
          }}
        >
          {isPaywalled ? (
            <Stack.Screen
              name="GerenciarPlanoScreen"
              component={GerenciarPlanoScreen}
              options={{ title: "Gerenciar Plano" }}
            />
          ) : (
            <>
              <Stack.Screen
                name="TelaInicial"
                component={TelaInicial}
                options={{ headerShown: false }}
              />

              <Stack.Screen
                name="GerenciarPlanoScreen"
                component={GerenciarPlanoScreen}
                options={{ title: "Gerenciar Plano" }}
              />
            </>
          )}
          <Stack.Screen
            name="EscolherPlano"
            component={EscolherPlano}
            options={({ navigation }) => ({
              title: "Escolher Plano",
              headerBackVisible: false,
              headerLeft: () => (
                <Text
                  style={{ fontSize: 16, color: "#111", paddingHorizontal: 8 }}
                  onPress={() => {
                    if (navigation.canGoBack()) {
                      navigation.goBack();
                    } else {
                      navigation.navigate("GerenciarPlanoScreen");
                    }
                  }}
                >
                  Voltar
                </Text>
              ),
            })}
          />
          <Stack.Screen
            name="Pagamento"
            component={PagamentoScreen}
            options={{ title: "Pagamento" }}
          />
          <Stack.Screen
            name="PagamentosMP"
            component={PagamentosMP}
            options={{ title: "Pagamentos" }}
          />
          <Stack.Screen
            name="AssinaturaStatus"
            component={AssinaturaStatus}
            options={{ title: "Minha Assinatura" }}
          />

          {!isPaywalled && (
            <>
              <Stack.Screen
                name="Planos"
                component={PlanosScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="Instrucoes"
                component={Instrucoes}
                options={{ title: "Instruções de Uso" }}
              />
              <Stack.Screen
                name="Senha"
                component={Senha}
                options={{ title: "Senha" }}
              />
              <Stack.Screen
                name="SaldoAnterior"
                component={SaldoAnterior}
                options={{ title: "Saldo Anterior" }}
              />
              <Stack.Screen
                name="Compras"
                component={Compras}
                options={{ title: "Compras" }}
              />
              <Stack.Screen
                name="Vendas"
                component={Vendas}
                options={{ title: "Vendas" }}
              />
              <Stack.Screen
                name="RecebimentosPrazo"
                component={RecebimentosPrazo}
                options={{ title: "RecebimentoPrazo" }}
              />
              <Stack.Screen
                name="CalculoLimiteMEI"
                component={CalculoLimiteMEI}
                options={{ title: "Cálculo do Limite MEI" }}
              />
              <Stack.Screen
                name="ConfigMEI"
                component={ConfigMEI}
                options={{ title: "Configurações do MEI" }}
              />
              <Stack.Screen name="Despesas" component={Despesas} />
              <Stack.Screen
                name="PrestacaoServicos"
                component={PrestacaoServicos}
              />
              <Stack.Screen
                name="ReceitaServicos"
                component={ReceitaServicos}
              />
              <Stack.Screen
                name="CatalogoServicos"
                component={CatalogoServicos}
              />
              <Stack.Screen name="Orcamento" component={Orcamento} />
              <Stack.Screen
                name="RelacaoOrcamentos"
                component={RelacaoOrcamentos}
              />
              <Stack.Screen
                name="OrcamentoCliente"
                component={OrcamentoCliente}
              />
              <Stack.Screen name="ContratoVista" component={ContratoVista} />
              <Stack.Screen name="ContratoPrazo" component={ContratoPrazo} />
              <Stack.Screen
                name="RelacionarMateriais"
                component={RelacionarMateriais}
              />
              <Stack.Screen
                name="ComprasMateriaisConsumo"
                component={ComprasMateriaisConsumo}
              />
              <Stack.Screen
                name="EstoqueMateriais"
                component={EstoqueMateriais}
              />
              <Stack.Screen name="ResultadoCaixa" component={ResultadoCaixa} />
              <Stack.Screen name="SaldoFinal" component={SaldoFinal} />
              <Stack.Screen name="Historico" component={Historico} />
              <Stack.Screen
                name="ControleEstoque"
                component={ControleEstoque}
              />
              <Stack.Screen name="CMV" component={CMV} />
              <Stack.Screen name="CatalogoScreen" component={CatalogoScreen} />
              <Stack.Screen
                name="ListaCredores"
                component={ListaCredores}
                options={{ title: "Lista de Credores" }}
              />
              <Stack.Screen
                name="ContasPagar"
                component={ContasPagar}
                options={{ title: "Contas a Pagar" }}
              />
              <Stack.Screen
                name="ClientePrazo"
                component={ClientePrazo}
                options={{ title: "Cliente a Prazo" }}
              />
              <Stack.Screen
                name="RelacaoClientes"
                component={RelacaoClientes}
                options={{ title: "Relação de Clientes" }}
              />
              <Stack.Screen
                name="ExportarPDFCompleto"
                component={ExportarPDFCompleto}
                options={{ title: "Exportar PDF" }}
              />
              <Stack.Screen
                name="ConfiguraSenha"
                component={ConfiguraSenha}
                options={{ title: "Configura Senha" }}
              />
              <Stack.Screen
                name="RecuperarSenha"
                component={RecuperarSenha}
                options={{ title: "Recuperar Senha" }}
              />
              <Stack.Screen
                name="AgendaInteligente"
                component={AgendaInteligente}
              />
              <Stack.Screen
                name="ListaClientesAgenda"
                component={ListaClientesAgenda}
                options={{ title: "Agenda • Clientes" }}
              />
              <Stack.Screen
                name="ClientesAgenda"
                component={ClientesAgenda}
                options={{ title: "Agenda • Clientes" }}
              />
              <Stack.Screen
                name="Compromissos"
                component={Compromissos}
                options={{ title: "Compromissos" }}
              />
              <Stack.Screen
                name="Tarefas"
                component={Tarefas}
                options={{ title: "Tarefas" }}
              />
              <Stack.Screen
                name="Colaboradores"
                component={Colaboradores}
                options={{ title: "Colaboradores" }}
              />
              <Stack.Screen name="ModoVendedor" component={ModoVendedor} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}
