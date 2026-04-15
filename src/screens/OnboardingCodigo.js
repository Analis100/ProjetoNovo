import React, { useEffect } from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { hasActiveLicense } from "../services/license";

export default function OnboardingCodigo({ navigation }) {
  useEffect(() => {
    let mounted = true;

    async function go(name) {
      if (!mounted) return;

      try {
        navigation.reset({ index: 0, routes: [{ name }] });
      } catch {
        navigation.replace(name);
      }
    }

    (async () => {
      try {
        const allowed = await hasActiveLicense();
        if (!mounted) return;

        if (allowed) {
          await go("TelaInicial");
          return;
        }

        await go("EscolherPlano");
      } catch (e) {
        await go("EscolherPlano");
      }
    })();

    return () => {
      mounted = false;
    };
  }, [navigation]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator size="large" />
      <Text style={{ marginTop: 12 }}>Carregando...</Text>
    </View>
  );
}
