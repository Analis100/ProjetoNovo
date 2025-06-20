import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";

export default function Instrucoes() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>📖 Instruções de Uso</Text>

      <Text style={styles.topico}>🔐 Senha Inicial</Text>
      <Text style={styles.texto}>
        A senha inicial para acesso é: <Text style={styles.bold}>1234</Text>
      </Text>
      <Text style={styles.texto}>
        Você pode alterar essa senha no botão{" "}
        <Text style={styles.bold}>Configurações</Text>.
      </Text>

      <Text style={styles.topico}>❓ Esqueci a senha</Text>
      <Text style={styles.texto}>
        Caso esqueça a senha, utilize a opção{" "}
        <Text style={styles.bold}>“Esqueci a senha”</Text>
        na tela de login e responda à pergunta de segurança (a mesma
        cadastrada).
      </Text>

      <Text style={styles.topico}>📊 Menu Principal</Text>
      <Text style={styles.texto}>
        • Saldo Anterior: valor inicial do dia ou troco.
      </Text>
      <Text style={styles.texto}>
        • Receitas e Despesas: lançamentos diários. O código e quantidades
        lançados na Tela Receitas vai dar baixa no estoque.
      </Text>
      <Text style={styles.texto}>
        • Saldo Final: resultado automático do dia.
      </Text>
      <Text style={styles.texto}>
        • Demonstrativo: resumo de todos os dias.
      </Text>
      <Text style={styles.texto}>
        • Exportar PDF: gera e compartilha os dados do app.
      </Text>
      <Text style={styles.texto}>
        • Estoque: reistre o código, a descriçao, e quantidade para controle do
        que está em exposição.
      </Text>

      <Text style={styles.topico}>⚙️ Configurações</Text>
      <Text style={styles.texto}>
        Altere a senha e configure uma pergunta de recuperação para manter sua
        segurança.
      </Text>

      <Text style={styles.topico}>📞 Ajuda</Text>
      <Text style={styles.texto}>
        Em caso de dúvidas, entre em contato com o suporte do sistema.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 10 },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  topico: { fontSize: 18, fontWeight: "bold", marginTop: 16 },
  texto: { fontSize: 16 },
  bold: { fontWeight: "bold" },
});
