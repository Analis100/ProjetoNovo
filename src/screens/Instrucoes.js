import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";

export default function Instrucoes() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* 1. Instrução de Uso */}
      <Text style={styles.title}>📖 Instruções de Uso</Text>
      <Text style={styles.texto}>
        O app DRD-Financeiro ajuda a acompanhar o resultado diário e mensal do
        seu negócio. Abaixo um resumo do que cada tela faz.
      </Text>
      <Text style={styles.title}>📖 Importante:</Text>
      <Text style={styles.texto}>
        Quase todas as telas são para movimentos diários. Os lançamentos de dias
        anteriores ficam salvos no botão "mês".
      </Text>
      {/* 2. Estoque */}
      <Text style={styles.topico}>📦 Estoque (primeiro passo)</Text>
      <Text style={styles.alerta}>
        ➤ Cadastre o <Text style={styles.bold}>Estoque primeiro</Text>. As
        vendas à vista e a prazo baixam a quantidade a partir daqui.
      </Text>
      <Text style={styles.texto}>
        • Informe <Text style={styles.bold}>Código</Text>,{" "}
        <Text style={styles.bold}>Descrição</Text> e{" "}
        <Text style={styles.bold}>Quantidade</Text> e toque em{" "}
        <Text style={styles.bold}>Salvar</Text>.
      </Text>
      <Text style={styles.texto}>
        • Use <Text style={styles.bold}>Estornar Saída</Text> se precisar
        desfazer uma baixa.
      </Text>
      {/* 3. Catálogo */}
      <Text style={styles.topico}>🗂️ Catálogo</Text>
      <Text style={styles.texto}>
        • Toque em <Text style={styles.bold}>Abrir Catálogo</Text> para anexar
        fotos aos produtos e compartilhar nas redes.
      </Text>
      <Text style={styles.texto}>
        • Você pode selecionar itens para excluir quando necessário.
      </Text>
      {/* 4. Saldo Anterior + Capital de Giro */}
      <Text style={styles.topico}>💼 Saldo Anterior e Capital de Giro</Text>
      <Text style={styles.texto}>
        • Em <Text style={styles.bold}>Saldo Anterior do Caixa</Text> informe o
        valor inicial do dia (troco ou saldo). Pode ser positivo ou negativo e
        entra direto no cálculo do <Text style={styles.bold}>Saldo Final</Text>.
      </Text>
      <Text style={styles.subtopico}>Capital de Giro (mesma tela)</Text>

      <Text style={styles.texto}>
        • Campo usado para registrar valores reservados para reforçar o caixa
        para despesas operacionais.
      </Text>

      <Text style={styles.texto}>
        • Importante: Quando efetuar uma venda, sempre registre aqui o valor de
        custo da mercadoria, repondo assim o seu caixa.
      </Text>

      <Text style={styles.texto}>• Digite o valor e escolha:</Text>

      <Text style={styles.texto}>
        &nbsp;&nbsp;– <Text style={styles.bold}>Registrar Entrada</Text>:
        aumenta o Capital de Giro.{"\n"}
        &nbsp;&nbsp;– <Text style={styles.bold}>Registrar Saída</Text>: diminui
        o Capital de Giro quando o valor é usado.
      </Text>
      <Text style={styles.texto}>
        • A parte inferior mostra o resumo das{" "}
        <Text style={styles.bold}>Entradas</Text>,{" "}
        <Text style={styles.bold}>Saídas</Text> e{" "}
        <Text style={styles.bold}>Saldo</Text>.
      </Text>
      <Text style={styles.texto}>
        • O botão{" "}
        <Text style={styles.bold}>Excluir lançamentos Capital de Giro</Text>{" "}
        permite zerar apenas Entradas, apenas Saídas ou tudo.
      </Text>
      <Text style={styles.texto}>
        • O botão <Text style={styles.bold}>Exportar PDF</Text> gera um
        relatório do Capital de Giro.
      </Text>
      {/* 5. Compras */}
      <Text style={styles.topico}>🛒 Compras</Text>
      <Text style={styles.texto}>
        • Use esta tela para registrar compras de mercadorias à vista ou a
        prazo.
      </Text>
      <Text style={styles.texto}>
        • Para compra à vista: preencha{" "}
        <Text style={styles.bold}>Código, Descrição, Quantidade e Valor</Text> e
        toque em <Text style={styles.bold}>Inserir Compra</Text> (lança direto
        onde escolher, em{" "}
        <Text style={styles.bold}>Capital de Giro ou Despesas</Text>).
      </Text>
      <Text style={styles.texto}>
        • Para compra a prazo: use{" "}
        <Text style={styles.bold}>Compra a prazo (somar em lote)</Text> para
        montar o lote de itens.
      </Text>
      <Text style={styles.texto}>
        • Depois toque em <Text style={styles.bold}>Fechar Compra a Prazo</Text>{" "}
        e informe <Text style={styles.bold}>credor</Text>,{" "}
        <Text style={styles.bold}>quantidade de parcelas</Text> e{" "}
        <Text style={styles.bold}>1º vencimento</Text>. O botão{" "}
        <Text style={styles.bold}>Gerar parcelas</Text> envia tudo para{" "}
        <Text style={styles.bold}>Contas a Pagar</Text>.
      </Text>
      <Text style={styles.texto}>
        • Se uma compra usada em lote for excluída, as parcelas correspondentes
        também são removidas em <Text style={styles.bold}>Contas a Pagar</Text>.
      </Text>
      {/* 6. Vendas / Vendas a Prazo / Relação de Clientes / Cliente a Prazo */}
      <Text style={styles.topico}>
        💰 Vendas, Vendas a Prazo, Relação de Clientes, Cliente a Prazo
      </Text>
      {/* 6.1 Vendas */}
      <Text style={styles.subtopico}>Vendas</Text>
      <Text style={styles.texto}>
        • <Text style={styles.bold}>Filtro por Data</Text>: escolha outro dia ou
        volte para a data atual.
      </Text>
      <Text style={styles.texto}>
        • <Text style={styles.bold}>Código</Text> +{" "}
        <Text style={styles.bold}>Qtd</Text> (venda manual) fazem a{" "}
        <Text style={styles.bold}>baixa automática no Estoque</Text>.
      </Text>
      <Text style={styles.texto}>
        • Selecione o <Text style={styles.bold}>colaborador</Text> para
        registrar de quem é a venda direto na Agenda Inteligente tela
        Colaboradores.
      </Text>
      <Text style={styles.texto}>
        • O botão <Text style={styles.bold}>Inserir Venda a Prazo</Text> envia a
        venda para a tela <Text style={styles.bold}>Relação de Clientes</Text>.
      </Text>
      {/* 6.2 Relação de Clientes */}
      <Text style={styles.subtopico}>Relação de Clientes</Text>
      <Text style={styles.texto}>
        • Lista clientes com <Text style={styles.bold}>parcelas em aberto</Text>
        .
      </Text>
      <Text style={styles.texto}>
        • O botão <Text style={styles.bold}>BAIXAR</Text> quita a parcela,
        registra a venda do dia e gera um{" "}
        <Text style={styles.bold}>recibo em PDF</Text> com ou sem logotipo.
      </Text>
      <Text style={styles.texto}>
        • Se a venda estiver vinculada a um{" "}
        <Text style={styles.bold}>colaborador</Text>, a baixa atualiza as{" "}
        <Text style={styles.bold}>vendas do mês</Text> dele na tela
        Colaboradores.
      </Text>
      <Text style={styles.texto}>
        • <Text style={styles.bold}>Excluir cliente</Text>: protegido por senha
        e oferece limpar também as vendas vinculadas.
      </Text>
      {/* 6.3 Cliente a Prazo */}
      <Text style={styles.subtopico}>Cliente a Prazo</Text>
      <Text style={styles.texto}>
        • <Text style={styles.bold}>Salvar Ficha</Text>: grava dados, código,
        quantidade e valor e já faz a{" "}
        <Text style={styles.bold}>baixa no Estoque</Text>.
      </Text>
      <Text style={styles.texto}>
        • <Text style={styles.bold}>Salvar Parcelas</Text>: informe quantidade e
        1º vencimento que o app gera todas automaticamente.
      </Text>
      <Text style={styles.texto}>
        • Vincule um <Text style={styles.bold}>colaborador</Text> para cálculo
        de comissão nas baixas.
      </Text>
      <Text style={styles.texto}>
        • O botão <Text style={styles.bold}>Compartilhar em PDF</Text> exporta a
        ficha e as parcelas.
      </Text>
      {/* 7. Despesas e Contas a Pagar */}
      <Text style={styles.topico}>📉 Despesas e Contas a Pagar</Text>
      <Text style={styles.texto}>
        • Em <Text style={styles.bold}>Despesas</Text> você registra os gastos
        do dia. Eles entram no cálculo do{" "}
        <Text style={styles.bold}>Saldo Final</Text>.
      </Text>
      <Text style={styles.texto}>
        • O botão <Text style={styles.bold}>Contas a Pagar</Text> é protegido
        por senha. Nessa área você cadastra credores, ficha e parcelas.
      </Text>
      <Text style={styles.texto}>
        • Ao dar baixa em uma parcela, o valor vai para{" "}
        <Text style={styles.bold}>Despesas</Text>. Quando a parcela veio de uma{" "}
        <Text style={styles.bold}>Compra a Prazo</Text>, o app pergunta se o
        pagamento sai de <Text style={styles.bold}>Despesas</Text> ou do{" "}
        <Text style={styles.bold}>Capital de Giro</Text>.
      </Text>
      {/* 8. Prestação de Serviços */}
      <Text style={styles.subtopico}>Prestação de Serviços</Text>
      <Text style={styles.texto}>
        Receita de Serviços/ Catálogo de Serviços / Relacionar Materiais/
        Compras de Materiais de Consumo/ Orçamento/ Contrato à Vista/ Contrato à
        Prazo.
      </Text>
      {/* 8.1 Receita de Serviços */}
      <Text style={styles.subtopico}>💰 Receita de Serviços</Text>
      <Text style={styles.texto}>
        Filtro por cliente, Lançamentos são feitos diários, pesquisa por mês,
        Botão ver cálculo do Limite MEI, selecionar Colaboradores, Imprimir.
      </Text>
      {/* 8.2 Catálogo de Serviços */}
      <Text style={styles.subtopico}>Cadastrar Serviços</Text>
      <Text style={styles.texto}>
        Filtro por nome, Selecionar e inserir no Orçamento, Imprimir.
      </Text>
      {/* 8.3 Relacionar Materiais */}
      <Text style={styles.subtopico}>Relacionar Materiais</Text>
      <Text style={styles.texto}>
        • Digite o Código do material e os outros dados são importados
        automático. Quantidade usada no serviço é preenchida de acordo com a
        unidade do material, unidade, militro, grama etc., Valor para orçamento
        é o valor de venda do material, Salvar material, Inserir no orçamento=
        leva a relação de materiais para o pré-orçamento.
      </Text>
      {/* 8.4 Estoque de Materiais */}
      <Text style={styles.subtopico}>Estoque de Materiais</Text>
      <Text style={styles.texto}>
        • Pesquisa por código ou nome do material, Campos para inserir materias
        manual, também Recebe as informaçoes da tela Compras de Materiais de
        Consumo.
      </Text>
      <Text style={styles.texto}>
        • Código Quantidade, entrada, saída, estoque. cálculo do custo valor em
        estoque, baixa automática no Estoque .
      </Text>
      {/* 8.5 Compras Materiais de Consumo */}
      <Text style={styles.subtopico}>Compras Materiais de Consumo</Text>
      <Text style={styles.texto}>
        Filtro por mês anterior. descrever os materiais conforme cada card,
        essas informações serão inseridas automático no Estoque de Materiais. Se
        a compra for a prazo clique no quadrinho e siga com atenção as mensagens
        de alerta para gerar as parcelas..
      </Text>
      {/* 8.6 Orçamento */}
      <Text style={styles.subtopico}></Text>
      <Text style={styles.texto}>
        Filtro por cliente. Novo Orçamento= Aqui vai gerar um novo orçamento,
        Também fica salvo nessa tela todos os orçamentos gerados e para corrigir
        basta clicar em cima.
      </Text>
      {/* 8.7 Contrato à Vista */}
      <Text style={styles.subtopico}>Contrato à Vista</Text>
      <Text style={styles.texto}>
        •Tela preenchida automática. Só o quadro de obserações é preenchido
        manual, o preenchimento é automático. O botão Imprimir gera um PDF e
        também dá baixa no Estoque de Materiais, por isso é importante clicar no
        botão Imprimir mesmo que não queira imprimir o contrato.
      </Text>
      {/* 8.7 Contrato à Prazo */}
      <Text style={styles.subtopico}>Contrato à Prazo</Text>
      <Text style={styles.texto}>
        •Tela preenchida automática. Só o quadro de observações é preenchido
        manual, o preenchimento é automático. O botão Imprimir gera um PDF e
        também dá baixa no Estoque de Materiais, por isso é importante clicar no
        botão Imprimir mesmo que não queira imprimir o contrato.
      </Text>
      {/* 9. Saldo Final */}
      <Text style={styles.topico}>🧮 Saldo Final</Text>
      <Text style={styles.texto}>
        • Mostra automaticamente o resultado de vendas e serviços em tempo real
        em <Text style={styles.bold}>R$</Text>
        <Text style={styles.bold}></Text>, Saldo em caixa, vendas a prazo a
        receber, resultado do dia por competência. As Despesas Operacionais
        (compras) são controladas na tela Saldo Anterior/Capital de Giro .
      </Text>
      <Text style={styles.texto}>
        • O botão <Text style={styles.bold}>Resetar</Text> limpa apenas as telas{" "}
        <Text style={styles.bold}>Saldo Anterior</Text>,{" "}
        <Text style={styles.bold}>Vendas</Text> e{" "}
        <Text style={styles.bold}>Despesas</Text> do dia atual.
      </Text>
      {/* 10. Agenda Inteligente */}
      <Text style={styles.topico}>🧠 Agenda Inteligente</Text>
      <Text style={styles.texto}>
        • Agrupa <Text style={styles.bold}>CLIENTES</Text>,{" "}
        <Text style={styles.bold}>COMPROMISSOS</Text>,{" "}
        <Text style={styles.bold}>TAREFAS</Text> e{" "}
        <Text style={styles.bold}>COLABORADORES</Text>.
      </Text>
      <Text style={styles.texto}>
        • <Text style={styles.bold}>Colaboradores</Text> é protegido por senha
        (padrão <Text style={styles.bold}></Text>, se não alterado).
      </Text>
      <Text style={styles.texto}>
        • Cadastre comissão fixa em R$ ou percentual, atualize as vendas e
        serviços do mês e gere <Text style={styles.bold}>PDF</Text> com a ficha.
      </Text>
      {/* 11. Demonstrativo */}
      <Text style={styles.topico}>📊 Demonstrativo</Text>
      <Text style={styles.texto}>
        • Tela protegida por senha que mostra, por dia,{" "}
        <Text style={styles.bold}>Vendas</Text>,{" "}
        <Text style={styles.bold}>Despesas</Text> e{" "}
        <Text style={styles.bold}>Saldo Final</Text>.
      </Text>
      {/* 12. CMV */}
      <Text style={styles.topico}>🧾 CMV (Custo das Mercadorias Vendidas)</Text>
      <Text style={styles.texto}>
        • Tela protegida com senha, baseada nas saídas do{" "}
        <Text style={styles.bold}>Estoque</Text>.
      </Text>
      <Text style={styles.texto}>
        • Lance e atualize os custos para acompanhar o{" "}
        <Text style={styles.bold}>lucro real</Text>.
      </Text>
      {/* 13. Exportar PDF */}
      <Text style={styles.topico}>📄 Exportar PDF</Text>
      <Text style={styles.texto}>
        • Disponível em várias telas (clientes, colaboradores, capital de giro,
        recibos), para salvar ou compartilhar seus relatórios.
      </Text>
      {/* 14. Configurações */}
      <Text style={styles.topico}>⚙️ Configurações</Text>
      <Text style={styles.texto}>
        • Altere a <Text style={styles.bold}>senha</Text> e defina a{" "}
        <Text style={styles.bold}>pergunta de recuperação</Text>.
      </Text>
      <Text style={styles.texto}>
        • Guarde bem essas informações: apenas você terá acesso a elas.
      </Text>
      {/* 15. Mudar de Plano */}
      <Text style={styles.topico}>🚀 Mudar de Plano</Text>
      <Text style={styles.texto}>
        • Tela reservada para futuras opções de assinatura e recursos extras.
      </Text>
      {/* 16. Sair / Desativar licença */}
      <Text style={styles.topico}>⏹️ Sair / Desativar licença</Text>
      <Text style={styles.texto}>
        • Use quando não for mais usar o app neste aparelho ou quiser transferir
        a licença para outro dispositivo.
      </Text>
      <Text style={styles.texto}>
        • Ao <Text style={styles.bold}>desativar a licença</Text>, o app deixa
        de funcionar como versão completa neste celular. Para voltar a usar,
        será necessário ativar novamente.
      </Text>
      {/* Ajuda/Responsabilidade */}
      <Text style={styles.topico}>📞 Ajuda</Text>
      <Text style={styles.texto}>
        • Suporte: <Text style={styles.bold}>appdemonst@gmail.com</Text>
      </Text>
      <Text style={styles.texto}>
        • As informações lançadas são de responsabilidade do usuário e{" "}
        <Text style={styles.bold}>não têm validade fiscal</Text>.
      </Text>
      <Text style={styles.texto}>
        • Todos os dados ficam apenas no seu dispositivo. O criador do app não
        tem acesso às suas informações.
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
