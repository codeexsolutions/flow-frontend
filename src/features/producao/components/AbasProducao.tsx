import { KanbanSquare, Users } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { AbasTabela } from "@/shared/ui/AbasTabela";

type Aba = "producoes" | "kanban";

/**
 * As duas telas de Produção, na barra da própria tabela.
 *
 * ---------------------------------------------------------------------------
 * Por que aqui, e não no cabeçalho da página
 * ---------------------------------------------------------------------------
 * Elas nasceram como abas do `PageScreen`, ao lado do título. Lá em cima elas
 * ficavam a meia tela do conteúdo que trocam, e principalmente: eram uma peça
 * DIFERENTE da que o resto do sistema usa para a mesma coisa. Vendas, PDV e o
 * caixa trocam a lista pela barra colada na tabela, com a pílula que desliza —
 * a mesma `AbasTabela` daqui. Duas gramáticas para "trocar o que a lista
 * mostra" fazem a pessoa aprender a segunda do zero, e do lado errado da tela.
 *
 * Elas continuam navegando por ROTA, e não por estado: cada tela tem endereço
 * próprio (`/producao` e `/producao/kanban`), então o link é salvável, o voltar
 * do navegador funciona e a barra lateral sabe acender o item de Produção.
 *
 * ---------------------------------------------------------------------------
 * Quem responde qual pergunta
 * ---------------------------------------------------------------------------
 *   • PRODUÇÕES — "o que eu mando para o cliente?". A lista de quem tem
 *     acompanhamento aberto, com o link de cada um pronto para copiar.
 *   • KANBAN — "onde está cada pedido?". O trabalho em si, em planilha ou em
 *     quadro — a mesma fila em duas leituras.
 */
const AbasProducao = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const atual: Aba = pathname.startsWith("/producao/kanban") ? "kanban" : "producoes";

  return (
    <AbasTabela<Aba>
      grupo="abas-producao"
      valor={atual}
      onValor={(id) => navigate(id === "kanban" ? "/producao/kanban" : "/producao")}
      abas={[
        { id: "producoes", label: "Produções", icone: <Users size={14} /> },
        { id: "kanban", label: "Kanban", icone: <KanbanSquare size={14} /> },
      ]}
    />
  );
};

export default AbasProducao;
