import React from "react";
import { ScrollView, Text, TouchableOpacity, StyleSheet } from "react-native";

export default function PrestacaoServicos({ navigation }) {
  const itens = [
    { label: "Receita de Serviços", screen: "ReceitaServicos" },

    { label: "Catálogo de Serviços", screen: "CatalogoServicos" },
    { label: "Relacionar Materiais", screen: "RelacionarMateriais" },
    { label: "Estoque de Materiais", screen: "EstoqueMateriais" },
    {
      label: "Compras Materiais de Consumo",
      screen: "ComprasMateriaisConsumo",
    },

    // fluxo financeiro / contratos
    { label: "Orçamento", screen: "RelacaoOrcamentos" },
    { label: "Contrato à Vista", screen: "ContratoVista" },
    { label: "Contrato à Prazo", screen: "ContratoPrazo" },
  ];

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <Text style={styles.title}>Prestação de Serviços</Text>
      <Text style={styles.subtitle}>
        Organize receitas, contratos e materiais
      </Text>

      {itens.map((i) => (
        <TouchableOpacity
          key={i.screen}
          style={[styles.button, { backgroundColor: "#007bff" }]}
          onPress={() => navigation.navigate(i.screen)}
        >
          <Text style={styles.buttonText}>{i.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
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
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#bfa140",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 18,
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
});
