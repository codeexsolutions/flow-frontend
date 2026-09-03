import { ShoppingCart } from "lucide-react";

import { PageScreen } from "@/shared/ui/PageShell";
import useAuth from "@/features/auth/store/auth.store";
import { veVendasDeTodos } from "@/features/vendas/components/TabsVendas";
import SalesList from "@/features/vendas/pages/SalesListPage";

/**
 * Vendas — o panorama e as notas na MESMA tela.
 *
 * ---------------------------------------------------------------------------
 * Por que as duas viraram uma
 * ---------------------------------------------------------------------------
 * Eram duas abas de uma barra de cinco: "Visão geral" e "Vendas". Elas
 * respondem a mesma pergunta em duas escalas — quanto a loja vendeu, e quais
 * notas somam esse quanto —, e a resposta de uma quase sempre puxava a outra:
 * o dono via "R$ 4.200 a receber" no panorama e clicava na aba ao lado para
 * descobrir de quem.
 *
 * O caixa e as contas saíram daqui e viraram tela própria — ver
 * `FinanceiroPage`. A divisão passou a ser a que a cabeça do lojista já faz:
 * **o que eu vendi** de um lado, **o dinheiro da empresa** do outro.
 *
 * ---------------------------------------------------------------------------
 * O panorama desceu para DENTRO do cartão
 * ---------------------------------------------------------------------------
 * Por um tempo as duas escalas ficaram empilhadas aqui: os painéis em cima, a
 * lista embaixo. Junto resolveu a troca de tela, mas cobrou o preço em altura —
 * os dois blocos disputavam a mesma janela, a tabela precisou de um piso de
 * 520px para não virar um visor de três notas, e a lista nascia abaixo da
 * dobra num notebook.
 *
 * Agora o panorama é a primeira ABA do próprio cartão de vendas (ver
 * `AbaVenda`, em `SalesListPage`): o cabeçalho, a barra e o rodapé ficam de
 * pé e só o corpo troca. A página deixou de ser dois blocos empilhados e
 * voltou a ser o que sempre foi — um cartão que ocupa a janela.
 *
 * O que sobrou aqui é a moldura: ícone, título e a frase que diz de quem são
 * as vendas listadas. Vendedor não tem a aba do panorama e o título diz isso
 * ("Minhas vendas") em vez de deixar a pessoa deduzir. Esconder é
 * conveniência; quem barra de verdade é a API.
 */
const VendasPage = () => {
  const { user } = useAuth();
  const veTudo = veVendasDeTodos(user);

  return (
    <PageScreen
      icon={<ShoppingCart className="h-5 w-5" />}
      title={veTudo ? "Vendas" : "Minhas vendas"}
      subtitle={
        veTudo
          ? "O mês da loja e todas as notas, com o que já foi pago e o que vence"
          : "As vendas que você fez, com o que já foi pago e o que vence"
      }
    >
      {/* Sozinha na tela, a lista volta a ESTICAR: é a altura do cartão que
          diz à paginação quantas linhas cabem, e o piso fixo que existia aqui
          só fazia sentido quando havia painéis disputando o espaço acima. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <SalesList />
      </div>
    </PageScreen>
  );
};

export default VendasPage;
