import { ClipboardList, KanbanSquare, Receipt } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { AbasTabela } from "@/shared/ui/AbasTabela";

type Aba = "pedidos" | "os" | "kanban";

/**
 * As três telas de Produção, na barra da própria tabela.
 *
 * ---------------------------------------------------------------------------
 * Quem responde qual pergunta
 * ---------------------------------------------------------------------------
 *   • PEDIDOS — "o que entrou?". Toda venda aparece aqui, e a ação da linha
 *     gera a ordem de serviço daquela venda. É uma tela de LEITURA sobre as
 *     vendas: não guarda nada.
 *   • ORDEM DE SERVIÇO — "o que levo impresso para a bancada?". As ordens
 *     geradas, cada uma com o documento que anda junto com a peça.
 *   • KANBAN — "onde está cada pedido?". É a PLANILHA de produção, em grade ou
 *     em quadro, com o histórico e as colunas que a empresa montou.
 *
 * ---------------------------------------------------------------------------
 * O Kanban é a planilha, e continua sendo
 * ---------------------------------------------------------------------------
 * Houve uma tentativa de trocar esta aba por um quadro novo, sobre outra
 * tabela. Foi revertida: a produção da loja está na planilha, com registros e
 * gente treinada nela — e um quadro vazio no lugar dela não é uma versão nova,
 * é a perda do que já funcionava. Pedidos e Ordem de Serviço entraram como
 * ADIÇÃO, ao lado dela, sem tirar nada.
 *
 * ---------------------------------------------------------------------------
 * Por que aqui, e não no cabeçalho da página
 * ---------------------------------------------------------------------------
 * Elas nasceram como abas do `PageScreen`, ao lado do título. Lá em cima
 * ficavam a meia tela do conteúdo que trocam, e principalmente: eram uma peça
 * DIFERENTE da que o resto do sistema usa para a mesma coisa. Vendas, PDV e o
 * caixa trocam a lista pela barra colada na tabela, com a pílula que desliza —
 * a mesma `AbasTabela` daqui.
 *
 * Elas navegam por ROTA, e não por estado: cada tela tem endereço próprio,
 * então o link é salvável, o voltar do navegador funciona e a barra lateral
 * sabe acender o item de Produção.
 */
const AbasProducao = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const atual: Aba = pathname.startsWith("/producao/kanban") ? "kanban" : pathname.startsWith("/producao/os") ? "os" : "pedidos";

  return (
    <AbasTabela<Aba>
      grupo="abas-producao"
      valor={atual}
      onValor={(id) => navigate(id === "pedidos" ? "/producao" : `/producao/${id}`)}
      abas={[
        { id: "pedidos", label: "Pedidos", icone: <Receipt size={14} /> },
        { id: "os", label: "Ordem de Serviço", icone: <ClipboardList size={14} /> },
        { id: "kanban", label: "Kanban", icone: <KanbanSquare size={14} /> },
      ]}
    />
  );
};

export default AbasProducao;
