import React from "react";
import { ScrollView, Text, TouchableOpacity, StyleSheet } from "react-native";

export default function DescreverServicos({ navigation }) {
  const itens = [
    { label: "Receita de Serviços", screen: "ReceitaServicos" },
    { label: "Relação de Materiais", screen: "RelacaoMateriais" },
    { label: "Compras", screen: "ComprasServicos" },
    { label: "Tipos de Serviços", screen: "TiposServicos" },
    { label: "Orçamento", screen: "Orcamento" },
    { label: "Contrato a Vista", screen: "ContratoVista" },
    { label: "Contrato a Prazo", screen: "ContratoPrazo" },
  ];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.titulo}>Descrever Serviços</Text>

      {itens.map((i) => (
        <TouchableOpacity
          key={i.screen}
          style={styles.botao}
          onPress={() => navigation.navigate(i.screen)}
        >
          <Text style={styles.botaoTexto}>{i.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  titulo: {
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
  },
  botao: {
    paddingVertical: 18,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
    marginBottom: 12,
  },
  botaoTexto: { fontSize: 18, fontWeight: "600", textAlign: "center" },
});
