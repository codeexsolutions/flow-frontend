import { type Orcamento, type StatusOrcamento } from "@/features/orcamentos/services/orcamento.service";

/**
 * O recorte da fila de propostas — a MESMA regra para quem lista e quem conta.
 *
 * Mora fora da lista porque duas telas a usam (a página de orçamentos e a aba
 * de vendas) e porque as barras de filtro contam quantas linhas cada opção
 * deixaria passar. Contando com outra regra, o número prometeria linhas que a
 * lista não mostra.
 */
export const filtrarOrcamentos = (lista: Orcamento[], busca: string, filtro: "todos" | StatusOrcamento) => {
  const termo = busca.trim().toLowerCase();

  return lista.filter((o) => {
    /* Proposta que já virou nota sai da lista: aqui é fila de trabalho, e ela
       não espera mais nada de ninguém. O registro fica no banco. */
    if (o.status === "CONVERTIDO") return false;
    if (filtro !== "todos" && o.status !== filtro) return false;
    if (!termo) return true;

    return o.clienteNome.toLowerCase().includes(termo) || String(o.codigo).includes(termo);
  });
};
