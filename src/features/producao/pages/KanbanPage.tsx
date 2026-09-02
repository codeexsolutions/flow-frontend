import PlanilhasPage from "@/features/planilhas/pages/PlanilhasPage";
import AbasProducao from "@/features/producao/components/AbasProducao";

/**
 * O Kanban da produção.
 *
 * ---------------------------------------------------------------------------
 * Planilha e backlog são a MESMA produção
 * ---------------------------------------------------------------------------
 * Esta tela é a planilha, e nada além dela. O quadro de cartões não é um
 * módulo ao lado: é a mesma planilha agrupada por uma coluna de seleção — as
 * mesmas linhas, as mesmas colunas, o mesmo histórico, os mesmos links de
 * cliente. Arrastar um cartão grava na célula da etapa exatamente o que a
 * lista suspensa gravaria na grade. Ver `QuadroPlanilha`.
 *
 * Por isso o alternador Planilha ⇄ Backlog mora DENTRO da `PlanilhasPage`, e
 * não aqui: ele troca a leitura de dados que já estão carregados, e um
 * alternador aqui fora obrigaria a desmontar e recarregar a planilha inteira a
 * cada troca — perdendo a página aberta, o rascunho da célula e a rolagem.
 *
 * O que este arquivo faz, então, é uma coisa só: dizer que esta rota é a aba
 * "Kanban" da seção Produção, passando as abas para a barra da tabela.
 */
const KanbanPage = () => <PlanilhasPage abasSecao={<AbasProducao />} />;

export default KanbanPage;
