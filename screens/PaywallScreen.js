// screens/PaywallScreen.js
import React from "react";
import { View, Text, Button, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function PaywallScreen({ navigation }) {
  /* simula pagamento */
  const assinar = async () => {
    await AsyncStorage.setItem("subscriptionActive", "true");
    Alert.alert("Sucesso", "Assinatura ativa!");
    navigation.reset({ index: 0, routes: [{ name: "TelaInicial" }] });
  };

  /* restaura (caso usuário troque de celular) */
  const restaurar = async () => {
    const active = await AsyncStorage.getItem("subscriptionActive");
    if (active === "true") {
      navigation.reset({ index: 0, routes: [{ name: "TelaInicial" }] });
    } else {
      Alert.alert("Não encontrado", "Nenhuma assinatura para restaurar.");
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24 }}>
      <Text style={{ fontSize: 24, fontWeight: "bold", textAlign: "center" }}>
        Assine o DRD-Empresarial
      </Text>
      <Text style={{ textAlign: "center", marginVertical: 16 }}>
        Desbloqueie tudo por{" "}
        <Text style={{ fontWeight: "bold" }}>R$ 34,90/mês</Text>.
      </Text>

      <Button title="Assinar agora" onPress={assinar} />
      <View style={{ height: 12 }} />
      <Button title="Já sou assinante" onPress={restaurar} />
    </View>
  );
}
