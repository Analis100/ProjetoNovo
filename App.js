import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import TelaInicial from "./screens/TelaInicial";
import SaldoAnterior from "./screens/SaldoAnterior";
import Receitas from "./screens/Receitas";
import Despesas from "./screens/Despesas";
import SaldoFinal from "./screens/SaldoFinal";
import Senha from "./screens/Senha";
import Historico from "./screens/Historico"; // NOVO // ...
import ControleEstoque from "./screens/ControleEstoque"; // NOVO
import ExportarPDFCompleto from "./screens/ExportarPDFCompleto";
import ConfiguraSenha from "./screens/ConfiguraSenha";
import RecuperarSenha from "./screens/RecuperarSenha";
import Instrucoes from "./screens/Instrucoes";

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="TelaInicial">
        <Stack.Screen name="TelaInicial" component={TelaInicial} />
        <Stack.Screen name="Senha" component={Senha} />
        <Stack.Screen name="SaldoAnterior" component={SaldoAnterior} />
        <Stack.Screen name="Receitas" component={Receitas} />
        <Stack.Screen name="Despesas" component={Despesas} />
        <Stack.Screen name="SaldoFinal" component={SaldoFinal} />
        <Stack.Screen name="Historico" component={Historico} />
        <Stack.Screen name="ControleEstoque" component={ControleEstoque} />
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
        <Stack.Screen name="Instrucoes" component={Instrucoes} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
