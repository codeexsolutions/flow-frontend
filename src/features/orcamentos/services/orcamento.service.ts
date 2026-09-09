import sysgrafix from "@/shared/api/sysgrafix";

export type ItemOrcamento = {
  id?: string;
  produtoId?: string | null;
  nomeProduto: string;
  quantidade: number;
  valorUnitario: number;
  subtotal?: number;
  /**
   * Preço de TABELA do produto — o que permite mostrar o desconto dado.
   *
   * Vem do catálogo na hora da leitura, como na nota: compara com o preço de
   * hoje, não com um congelado. `null` no item avulso, que não tem produto.
   */
  valorProduto?: number | null;
};

/**
 * `CONVERTIDO` é o que já virou nota — sai da lista de trabalho, ao contrário
 * de `APROVADO`, que é o cliente ter dito sim e a venda ainda não existir.
 */
export type StatusOrcamento = "ABERTO" | "APROVADO" | "RECUSADO" | "EXPIRADO" | "CONVERTIDO";

export type Orcamento = {
  id: string;
  codigo: number;
  clienteNome: string;
  clienteId?: string | null;
  clienteContato?: string | null;
  total: number;
  status: StatusOrcamento;
  observacao?: string | null;
  validade?: string | null;
  criadoEm: string;
  vendedorId?: string | null;
  vendedorNome?: string | null;
  itens: ItemOrcamento[];
};

export type NovoOrcamento = {
  clienteNome: string;
  clienteId?: string | null;
  clienteContato?: string | null;
  observacao?: string | null;
  validade?: string | null;
  itens: ItemOrcamento[];
};

const OrcamentoService = {
  async listar(): Promise<Orcamento[]> {
    const r = await sysgrafix.get("/orcamentos");
    return (r.data?.data ?? []) as Orcamento[];
  },

  async criar(dados: NovoOrcamento): Promise<string> {
    const r = await sysgrafix.post("/orcamentos", dados);
    return String(r.data?.data?.[0] ?? "");
  },

  /** Reescreve a proposta. A API só aceita enquanto o orçamento está ABERTO. */
  async atualizar(id: string, dados: NovoOrcamento): Promise<void> {
    await sysgrafix.put(`/orcamentos/${id}`, dados);
  },

  async alterarStatus(id: string, status: StatusOrcamento): Promise<void> {
    await sysgrafix.patch(`/orcamentos/${id}/status`, { status });
  },

  async excluir(id: string): Promise<void> {
    await sysgrafix.delete(`/orcamentos/${id}`);
  },
};

export default OrcamentoService;
