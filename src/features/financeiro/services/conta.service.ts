import sysgrafix from "@/shared/api/sysgrafix";

/**
 * Contas a pagar e a receber.
 *
 * Um serviço só para os dois lados: são o mesmo objeto visto de ângulos
 * diferentes, e `tipo` é o que os separa.
 */

export type TipoConta = "PAGAR" | "RECEBER";
export type Recorrencia = "UNICA" | "SEMANAL" | "QUINZENAL" | "MENSAL";
export type SituacaoParcela = "ABERTA" | "PARCIAL" | "PAGA" | "VENCIDA";

export type Parcela = {
  id: string;
  numero: number;
  valor: number;
  vencimento: string;
  valorPago: number;
  quitadaEm: string | null;
  observacao: string | null;
  situacao: SituacaoParcela;
};

export type Conta = {
  id: string;
  tipo: TipoConta;
  descricao: string;
  categoria: string | null;
  valorTotal: number;
  fornecedor: string | null;
  pedidoId: string | null;
  clienteId: string | null;
  clienteNome: string | null;
  recorrencia: Recorrencia;
  observacao: string | null;
  status: "ABERTA" | "QUITADA" | "CANCELADA";
  criadoEm: string;
  parcelas: Parcela[];
};

export type NovaConta = {
  tipo: TipoConta;
  descricao: string;
  categoria?: string | null;
  valorTotal: number;
  clienteId?: string | null;
  fornecedor?: string | null;
  recorrencia?: Recorrencia;
  observacao?: string | null;
  parcelas?: number;
  primeiroVencimento?: string | null;
};

export type Recibo = {
  id: string;
  reciboNumero: number;
  valor: number;
  formaPagamento: string | null;
  pagoEm: string;
  parcelaNumero: number;
  contaDescricao: string;
  tipo: TipoConta;
};

export type Pagamento = {
  id: string;
  valor: number;
  formaPagamento: string | null;
  pagoEm: string;
  reciboNumero: number;
  usuarioNome: string | null;
};

/** O acordo de prazo de uma venda: a conta a receber que nasceu da nota. */
export type AcordoVenda = {
  id: string;
  descricao: string;
  valorTotal: number;
  recorrencia: Recorrencia;
  status: "ABERTA" | "QUITADA" | "CANCELADA";
  criadoEm: string;
  /** Taxa combinada por parcela, em %. 0 = parcelado sem juros. */
  jurosPercentual: number;
  /** Quanto do `valorTotal` é juros — por isso ele passa do total da nota. */
  acrescimo: number;
  parcelas: Parcela[];
};

export type ResumoContas = {
  aPagar: number;
  aReceber: number;
  vencidoPagar: number;
  vencidoReceber: number;
  pagarSemana: number;
  receberSemana: number;
};

const ContaService = {
  listar: async (tipo?: TipoConta): Promise<Conta[]> => {
    const r = await sysgrafix.get("/contas", { params: tipo ? { tipo } : undefined });
    return (r.data?.data ?? []) as Conta[];
  },

  resumo: async (): Promise<ResumoContas> => {
    const r = await sysgrafix.get("/contas/resumo");
    return (r.data?.data?.[0] ?? {
      aPagar: 0, aReceber: 0, vencidoPagar: 0, vencidoReceber: 0, pagarSemana: 0, receberSemana: 0,
    }) as ResumoContas;
  },

  criar: async (dados: NovaConta): Promise<string> => {
    const r = await sysgrafix.post("/contas", dados);
    return String(r.data?.data?.[0] ?? "");
  },

  /** Transforma o saldo em aberto de uma venda num acordo com vencimentos. */
  parcelarVenda: async (dados: {
    pedidoId: string;
    parcelas: number;
    primeiroVencimento?: string | null;
    recorrencia?: Recorrencia;
    valor?: number;
    /** Taxa por parcela, em %. O acréscimo é calculado no servidor. */
    juros?: number;
    /** A partir de quantas parcelas a taxa vale. Padrão do servidor: 2. */
    jurosAPartirDe?: number;
  }): Promise<string> => {
    const r = await sysgrafix.post("/contas/da-venda", dados);
    return String(r.data?.data?.[0] ?? "");
  },

  /** O acordo de UMA venda. `null` = nota à vista, que é o caso comum. */
  acordoDaVenda: async (pedidoId: string): Promise<AcordoVenda | null> => {
    const r = await sysgrafix.get(`/contas/vendas/${pedidoId}`);
    return (r.data?.data?.[0] ?? null) as AcordoVenda | null;
  },

  pagar: async (parcelaId: string, dados: { valor?: number; formaPagamento?: string }): Promise<Recibo> => {
    const r = await sysgrafix.post(`/contas/parcelas/${parcelaId}/pagar`, dados);
    const recibo = r.data?.data?.[0];

    if (!recibo) throw new Error(r.data?.message || "Não foi possível registrar o pagamento.");

    return recibo as Recibo;
  },

  pagamentos: async (parcelaId: string): Promise<Pagamento[]> => {
    const r = await sysgrafix.get(`/contas/parcelas/${parcelaId}/pagamentos`);
    return (r.data?.data ?? []) as Pagamento[];
  },

  estornar: async (pagamentoId: string): Promise<void> => {
    await sysgrafix.delete(`/contas/pagamentos/${pagamentoId}`);
  },

  alterarParcela: async (parcelaId: string, dados: { vencimento?: string; observacao?: string | null }): Promise<void> => {
    await sysgrafix.patch(`/contas/parcelas/${parcelaId}`, dados);
  },

  cancelar: async (contaId: string): Promise<void> => {
    await sysgrafix.delete(`/contas/${contaId}`);
  },
};

export default ContaService;
