import sysgrafix from "@/shared/api/sysgrafix";
import { NovaMovimentacaoType } from "@/shared/domain/financeiro";

/**
 * Um recebimento da nota — uma linha do extrato.
 *
 * `origem` diz de onde o dinheiro entrou, e é o que separa o que se corrige
 * aqui do que se corrige no financeiro: AVULSO é o recebimento de balcão,
 * PARCELA é a baixa de uma parcela da venda a prazo, que só existe aqui como
 * reflexo. `editavel` já vem decidido pelo servidor para a regra não ser
 * reescrita (e divergir) no navegador.
 */
export type RecebimentoNota = {
  id: string;
  valor: number;
  formaPagamento: string | null;
  pagoEm: string;
  observacao: string | null;
  origem: "AVULSO" | "PARCELA";
  /** Qual parcela gerou o crédito. Nulo em recebimento de balcão. */
  parcelaNumero: number | null;
  usuarioNome: string | null;
  editavel: boolean;
};

const FinanceiroService = {
  getResumo: () => sysgrafix.get("/financeiro/resumo"),

  getNotas: () => sysgrafix.get("/financeiro/notas"),
  /* `id`: o do recebimento, gerado na tela — reenviar não lança duas vezes. */
  registrarPagamentoNota: (pedidoId: string, valor: number, formaPagamento: string, id?: string) =>
    sysgrafix.patch(`/financeiro/notas/${pedidoId}/pagar`, { valor, formaPagamento, id }),

  /* ── Extrato da nota ──
     Cada recebimento é uma linha desde a migration 050: é o que permite duas
     formas na mesma venda, corrigir um valor digitado errado e desquitar uma
     nota (apagando o lançamento a mais). */
  listarRecebimentos: async (pedidoId: string): Promise<RecebimentoNota[]> => {
    const r = await sysgrafix.get(`/financeiro/notas/${pedidoId}/recebimentos`);
    return (r.data?.data ?? []) as RecebimentoNota[];
  },

  alterarRecebimento: (recebimentoId: string, dados: { valor?: number; formaPagamento?: string | null; pagoEm?: string; observacao?: string | null }) =>
    sysgrafix.patch(`/financeiro/recebimentos/${recebimentoId}`, dados),

  excluirRecebimento: (recebimentoId: string) => sysgrafix.delete(`/financeiro/recebimentos/${recebimentoId}`),

  getMovimentacoes: () => sysgrafix.get("/financeiro/movimentacoes"),
  criarMovimentacao: (movimentacao: NovaMovimentacaoType) => sysgrafix.post("/financeiro/movimentacoes", movimentacao),
  excluirMovimentacao: (id: string) => sysgrafix.delete(`/financeiro/movimentacoes/${id}`),
};

export default FinanceiroService;
