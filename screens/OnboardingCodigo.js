// screens/OnboardingCodigo.js
import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { hasActiveLicense, getPlan } from "../services/license";

export default function OnboardingCodigo({ navigation }) {
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        // 1) Licença
        const licensed = await hasActiveLicense();
        if (!mounted) return;

        if (!licensed) {
          // Sem licença → pedir código
          try {
            navigation.reset({ index: 0, routes: [{ name: "InserirCodigo" }] });
          } catch {
            navigation.replace("InserirCodigo");
          }
          return;
        }

        // 2) Plano
        const plan = await getPlan(); // "INDIVIDUAL" | "COLABORADORES" | null
        if (!mounted) return;

        if (!plan) {
          // Licensed mas sem plano → escolher plano
          try {
            navigation.reset({ index: 0, routes: [{ name: "EscolherPlano" }] });
          } catch {
            navigation.replace("EscolherPlano");
          }
          return;
        }

        // 3) Licensed + plano → TelaInicial
        try {
          navigation.reset({ index: 0, routes: [{ name: "TelaInicial" }] });
        } catch {
          navigation.replace("TelaInicial");
        }
      } catch (e) {
        // Se algo der errado, manda para InserirCodigo para não travar
        try {
          navigation.reset({ index: 0, routes: [{ name: "InserirCodigo" }] });
        } catch {
          navigation.replace("InserirCodigo");
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [navigation]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator size="large" />
    </View>
  );
}
