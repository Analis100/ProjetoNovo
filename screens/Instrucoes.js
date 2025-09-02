import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";

export default function Instrucoes() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* 1. Instrução de Uso */}
      <Text style={styles.title}>📖 Instrução de Uso</Text>
      <Text style={styles.texto}>
        Bem-vindo! Este app registra o resultado diário (e também funciona para
        visão mensal). Abaixo, veja o passo a passo e o que cada botão faz
        dentro de cada tela.
      </Text>

      {/* 2. Estoque */}
      <Text style={styles.topico}>📦 Estoque (primeiro passo)</Text>
      <Text style={styles.alerta}>
        ➤ Cadastre o <Text style={styles.bold}>Estoque primeiro</Text>. É ele
        que recebe as baixas quando você lança vendas em{" "}
        <Text style={styles.bold}>Receitas</Text> ou salva a ficha em{" "}
        <Text style={styles.bold}>Cliente a Prazo</Text>.
      </Text>
      <Text style={styles.texto}>
        • Preencha <Text style={styles.bold}>Código</Text>,{" "}
        <Text style={styles.bold}>Descrição</Text> e{" "}
        <Text style={styles.bold}>Quantidade</Text>, depois toque em{" "}
        <Text style={styles.bold}>Salvar</Text>.
      </Text>
      <Text style={styles.texto}>
        • Use <Text style={styles.bold}>Estornar Saída</Text> se precisar
        reverter uma baixa.
      </Text>

      {/* 3. Catálogo */}
      <Text style={styles.topico}>🗂️ Catálogo</Text>
      <Text style={styles.texto}>
        • Toque em <Text style={styles.bold}>Abrir Catálogo</Text> para anexar
        fotos nos cards e compartilhar nas redes.
      </Text>
      <Text style={styles.texto}>
        • Selecione imagens para excluir quando necessário.
      </Text>

      {/* 4. Saldo Anterior */}
      <Text style={styles.topico}>💼 Saldo Anterior</Text>
      <Text style={styles.texto}>
        • Informe o valor inicial do dia (ou troco). Ele entra no cálculo do{" "}
        <Text style={styles.bold}>Saldo Final</Text>.
      </Text>

      {/* 5. Receitas / Vendas a Prazo / Relação de Clientes / Cliente a Prazo */}
      <Text style={styles.topico}>
        💰 Receitas, Vendas a Prazo, Relação de Clientes, Cliente a Prazo
      </Text>

      {/* 5.1 Receitas */}
      <Text style={styles.subtopico}>Receitas</Text>
      <Text style={styles.texto}>
        • <Text style={styles.bold}>Filtro por Data</Text>: o botão exibe
        “Filtro por Data”. Ao escolher uma data diferente, ele mostra{" "}
        <Text style={styles.bold}>“Voltar à data atual”</Text>.
      </Text>
      <Text style={styles.texto}>
        • <Text style={styles.bold}>Código</Text> +{" "}
        <Text style={styles.bold}>Qtd</Text> (venda manual): ao salvar,{" "}
        <Text style={styles.bold}>baixa o estoque</Text> automaticamente.
      </Text>
      <Text style={styles.texto}>
        • <Text style={styles.bold}>Vendedor (colaborador)</Text>: toque para
        escolher quem realizou a venda.
      </Text>
      <Text style={styles.texto}>
        • <Text style={styles.bold}>Inserir Venda a Prazo</Text>: envia para a
        tela de <Text style={styles.bold}>Relação de Clientes</Text>.
      </Text>

      {/* 5.2 Relação de Clientes */}
      <Text style={styles.subtopico}>Relação de Clientes</Text>
      <Text style={styles.texto}>
        • Lista quem tem <Text style={styles.bold}>próxima parcela</Text> em
        aberto.
      </Text>
      <Text style={styles.texto}>
        • Botão <Text style={styles.bold}>BAIXAR</Text>: confirma a baixa,
        registra a receita do dia e abre o{" "}
        <Text style={styles.bold}>Recibo em PDF</Text> (você pode usar o
        logotipo atual, escolher outro ou sem logo).
      </Text>
      <Text style={styles.texto}>
        • Se a venda estiver{" "}
        <Text style={styles.bold}>vinculada a um colaborador</Text>, a baixa
        também alimenta as <Text style={styles.bold}>vendas do mês</Text> dele
        na tela Colaboradores, (usadas para cálculos de comissões).
      </Text>
      <Text style={styles.texto}>
        • <Text style={styles.bold}>Excluir cliente</Text>: Para segurança, pede
        senha e oferece limpar lançamentos em{" "}
        <Text style={styles.bold}>Receitas</Text> referentes às parcelas.
      </Text>

      {/* 5.3 Cliente a Prazo */}
      <Text style={styles.subtopico}>Cliente a Prazo</Text>
      <Text style={styles.texto}>
        • <Text style={styles.bold}>Salvar Ficha</Text>: endereço, código,
        quantidade e valor — já{" "}
        <Text style={styles.bold}>baixa do Estoque</Text>.
      </Text>
      <Text style={styles.texto}>
        • <Text style={styles.bold}>Salvar Parcelas</Text>: informe a quantidade
        e o 1º vencimento; o app gera todas.
      </Text>
      <Text style={styles.texto}>
        • <Text style={styles.bold}>Colaborador</Text>: vincule a venda para
        calcular comissões na baixa de parcelas.
      </Text>
      <Text style={styles.texto}>
        • <Text style={styles.bold}>Compartilhar em PDF</Text>: exporta a ficha
        e a lista de parcelas.
      </Text>

      {/* 6. Despesas e Contas a Pagar */}
      <Text style={styles.topico}>📉 Despesas e Contas a Pagar</Text>
      <Text style={styles.texto}>
        • Registre as despesas do dia, elas entram no cálculo do e as contas a
        pagar.<Text style={styles.bold}>Saldo Final</Text>.
        <Text style={styles.bold}>Contas a Pagar</Text>
        <Text style={styles.texto}>
          Para privacidade é protegida por senha. Insira Novo Credor, salva
          ficha e Parcelas, ao dar baixa nas parcelas, entram na tela Despesas
          para cálculo do saldo final
        </Text>
        .
      </Text>

      {/* 7. Saldo Final */}
      <Text style={styles.topico}>🧮 Saldo Final</Text>
      <Text style={styles.texto}>
        • Calcula automaticamente:{" "}
        <Text style={styles.bold}> O lucro em R$ e em %.</Text>
        <Text style={styles.texto}>
          A função reserar só limpa as telas Saldo Anterior, Receitas e
          Despesas.{" "}
        </Text>
      </Text>

      {/* 8. Agenda Inteligente */}
      <Text style={styles.topico}>🧠 Agenda Inteligente</Text>
      <Text style={styles.texto}>
        • <Text style={styles.bold}>CLIENTES</Text>,{" "}
        <Text style={styles.bold}>COMPROMISSOS</Text>,{" "}
        <Text style={styles.bold}>TAREFAS</Text> e{" "}
        <Text style={styles.bold}>COLABORADORES</Text>.
      </Text>
      <Text style={styles.texto}>
        • O botão <Text style={styles.bold}>COLABORADORES</Text> pede senha
        (padrão <Text style={styles.bold}>1234</Text>, se não alterado).
      </Text>
      <Text style={styles.texto}>
        • Em <Text style={styles.bold}>Colaboradores</Text>: use{" "}
        <Text style={styles.bold}>
          Tela Protegida com senha. Ativos / Inativos
        </Text>
        , busca por nome. Comissão <Text style={styles.bold}>Fixo (R$)</Text> ou{" "}
        <Text style={styles.bold}>% Percentual</Text>(nesse campo informe
        quantidade do percentual“00%” a ser pago),{" "}
        <Text style={styles.bold}>Atualizar de "Receitas"</Text> para mostrar
        vendas do mês,<Text style={styles.bold}>Comissão estimada</Text>cálculo
        da comissão. Salvar a ficha. <Text style={styles.bold}>PDF</Text>{" "}
        <Text style={styles.texto}>Exportar ficha.</Text>
      </Text>

      {/* 9. Demonstrativo */}
      <Text style={styles.topico}>📊 Demonstrativo</Text>
      <Text style={styles.texto}>Para privacidade e protegida com senha</Text>
      <Text style={styles.texto}>
        • Resumo dos dias com <Text style={styles.bold}>Receitas</Text>,{" "}
        <Text style={styles.bold}>Despesas</Text> e{" "}
        <Text style={styles.bold}>Saldo Final</Text>.
      </Text>

      {/* 10. CMV */}
      <Text style={styles.topico}>🧾 CMV (Custo das Mercadorias Vendidas)</Text>
      <Text style={styles.texto}>
        <Text style={styles.texto}>Protegida com senha para privacidade.</Text>•
        Calculado a partir do <Text style={styles.bold}>Estoque</Text> e das{" "}
        <Text style={styles.bold}>saídas</Text> registradas em Receitas/Cliente
        a Prazo.
      </Text>
      <Text style={styles.texto}>
        • Mantenha custos atualizados no estoque para que o CMV reflita
        corretamente o resultado.
      </Text>

      {/* 11. Exportar PDF */}
      <Text style={styles.topico}>📄 Exportar PDF</Text>
      <Text style={styles.texto}>
        • Gere relatórios e compartilhe: recibos de parcelas, ficha do cliente,
        ficha do colaborador e resumos.
      </Text>

      {/* 12. Configurações */}
      <Text style={styles.topico}>⚙️ Configurações</Text>
      <Text style={styles.texto}>
        • Altere a <Text style={styles.bold}>senha</Text> e defina a{" "}
        <Text style={styles.bold}>pergunta de recuperação</Text>.
        <Text style={styles.texto}>
          Não deixe de alterar sua senha, responder a pergunta de recuperação e
          guardá-las bem, porque só você terá acesso a essas informações.
        </Text>
      </Text>

      {/* 13. Mudar de Plano */}
      <Text style={styles.topico}>🚀 Mudar de Plano</Text>
      <Text style={styles.texto}>
        • Acesse opções de assinatura e recursos adicionais quando disponíveis.
      </Text>

      {/* Ajuda/Responsabilidade */}
      <Text style={styles.topico}>📞 Ajuda</Text>
      <Text style={styles.texto}>
        • Suporte e-mail: <Text style={styles.bold}>appdemonst@gmail.com</Text>
      </Text>
      <Text style={styles.texto}>
        • As informações lançadas neste app são de inteira responsabilidade do
        usuário e <Text style={styles.bold}>não têm validade fiscal</Text>.
        <Text style={styles.texto}>
          Todas as informações inseridas neste aplicativo ficam armazenadas
          apenas no seu dispositivo. O criador do app não tem acesso aos seus
          dados.
        </Text>
      </Text>

      <View style={{ height: 16 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 8 },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  topico: { fontSize: 18, fontWeight: "bold", marginTop: 16 },
  subtopico: { fontSize: 16, fontWeight: "700", marginTop: 8 },
  texto: { fontSize: 16, lineHeight: 22 },
  bold: { fontWeight: "bold" },
  alerta: {
    fontSize: 16,
    lineHeight: 22,
    padding: 10,
    backgroundColor: "#fff7e6",
    borderWidth: 1,
    borderColor: "#ffe3b3",
    borderRadius: 8,
  },
});
