import useClienteStore from "@/features/clientes/store/cliente.store";
import useProdutoStore from "@/features/estoque/store/produto.store";
import useFinanceiroStore from "@/features/financeiro/store/financeiro.store";
import useVendaStore from "@/features/vendas/store/venda.store";
import useEnterprise from "@/features/empresa/store/enterprise.store";
import { limparCacheLocal } from "@/shared/cache/cacheLocal";

/**
 * Devolve todas as lojas de dados ao estado inicial.
 *
 * Sem isto, sair da conta deixava clientes, produtos, vendas e financeiro na
 * memória: quem entrasse em seguida — outro funcionário no mesmo balcão, por
 * exemplo — via por um instante os dados de quem saiu, antes de o novo
 * carregamento chegar. Num sistema multiempresa isso é vazamento.
 *
 * O retrato é tirado na carga do módulo, quando nenhuma loja foi tocada ainda.
 * O `true` no `setState` **substitui** o estado em vez de mesclar, o que impede
 * que uma chave suja sobreviva ao reset.
 *
 * `auth` não entra aqui: ela se limpa no próprio `clearAuth`, e importá-la
 * criaria ciclo de importação.
 */
const LOJAS = [useClienteStore, useProdutoStore, useFinanceiroStore, useVendaStore, useEnterprise];

const INICIAIS = LOJAS.map((loja) => loja.getState());

export function resetarLojas(): void {
  /* Ao sair, o que o PDV guardou no aparelho vai junto. */
  limparCacheLocal();

  LOJAS.forEach((loja, i) => {
    (loja as unknown as { setState: (estado: unknown, substituir: boolean) => void }).setState(INICIAIS[i], true);
  });
}
