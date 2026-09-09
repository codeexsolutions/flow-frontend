import sysgrafix from "@/shared/api/sysgrafix";

/**
 * O CUPOM FISCAL (NFC-e), do lado da tela.
 *
 * A "Nota de Venda" que o sistema já entrega é comprovante COMERCIAL — não tem
 * número fiscal e não passa pela SEFAZ. Isto aqui é o outro documento: o cupom
 * com chave de 44 dígitos, protocolo e QR Code. Os dois convivem.
 */

const dados = <T>(r: { data?: { data?: T[] } }): T[] => r.data?.data ?? [];

export type SituacaoCupom = "PENDENTE" | "AUTORIZADA" | "REJEITADA" | "CANCELADA" | "DENEGADA";

export type Cupom = {
  id: string;
  modelo: number;
  serie: number | null;
  numero: number | null;
  situacao: SituacaoCupom;
  chave: string | null;
  protocolo: string | null;
  codigo_status: string | null;
  /** O texto da rejeição — é ele que diz o que corrigir. */
  motivo: string | null;
  /** 1 = produção, 2 = homologação (sem valor fiscal). */
  ambiente: number;
  xml_url: string | null;
  danfe_url: string | null;
  qrcode_url: string | null;
  valor_total: string | null;
  cancelada_em: string | null;
  criado_em: string;
};

export type ConfiguracaoFiscal = {
  insc_estadual: string | null;
  regime_tributario: number | null;
  fiscal_uf: string | null;
  fiscal_municipio_ibge: string | null;
  fiscal_provedor: string | null;
  fiscal_ambiente: number;
  nfce_serie: number;
  nfce_proximo_numero: number;
  nfce_csc_id: string | null;
  /** Os segredos nunca voltam preenchidos — só se existem. */
  tem_token: boolean;
  tem_csc: boolean;
};

export type ProdutoFiscal = {
  id: string;
  nome: string;
  sku: string | null;
  unidade: string | null;
  ncm: string | null;
  cest: string | null;
  cfop: string | null;
  cst: string | null;
  origem: number | null;
  unidade_tributavel: string | null;
};

const FiscalService = {
  /** O que falta para esta empresa emitir — cadastro e catálogo. */
  async pendencias() {
    const [p] = dados<{ empresa: string[]; produtos: number }>(await sysgrafix.get("/fiscal/pendencias"));
    return p ?? { empresa: [], produtos: 0 };
  },

  async configuracao() {
    const [c] = dados<ConfiguracaoFiscal>(await sysgrafix.get("/fiscal/configuracao"));
    return c ?? null;
  },

  /**
   * Grava o cadastro fiscal.
   *
   * Campo de segredo vazio significa "não mexi": a tela nunca recebe o valor
   * atual, então mandar vazio não pode apagar a credencial de quem só veio
   * corrigir a Inscrição Estadual.
   */
  async salvarConfiguracao(dadosFiscais: Record<string, unknown>) {
    await sysgrafix.put("/fiscal/configuracao", dadosFiscais);
  },

  /** Os produtos que ainda não têm classificação fiscal (ou todos). */
  async produtos(todos = false) {
    return dados<ProdutoFiscal>(await sysgrafix.get("/fiscal/produtos", { params: todos ? { todos: "1" } : {} }));
  },

  async classificarProduto(id: string, classificacao: Record<string, unknown>) {
    await sysgrafix.patch(`/fiscal/produtos/${id}`, classificacao);
  },

  /** Os cupons de uma venda — inclusive as tentativas recusadas. */
  async daVenda(pedidoId: string) {
    return dados<Cupom>(await sysgrafix.get(`/fiscal/vendas/${pedidoId}`));
  },

  /**
   * Emite o cupom.
   *
   * `cpf` ausente usa o do cadastro do cliente; string vazia sai como
   * consumidor não identificado — que é a resposta normal a "CPF na nota?".
   *
   * Devolve a mensagem do servidor porque REJEIÇÃO NÃO É ERRO de rede: "NCM
   * inválido" chega aqui num 200, e é esse texto que a tela precisa mostrar.
   */
  async emitir(pedidoId: string, cpf?: string): Promise<{ cupom: Cupom | null; mensagem: string }> {
    const r = await sysgrafix.post(`/fiscal/vendas/${pedidoId}/cupom`, cpf === undefined ? {} : { cpf });

    return { cupom: (r.data?.data?.[0] as Cupom) ?? null, mensagem: String(r.data?.message ?? "") };
  },

  /** Relê na SEFAZ o que ficou pendente. */
  async sincronizar(cupomId: string) {
    const r = await sysgrafix.post(`/fiscal/cupons/${cupomId}/sincronizar`);
    return { cupom: (r.data?.data?.[0] as Cupom) ?? null, mensagem: String(r.data?.message ?? "") };
  },

  /**
   * Abre o DANFCE numa guia.
   *
   * Vem por `axios` e não por um `<a href>` porque a rota exige o Bearer do
   * usuário — um link cru voltaria 401. O PDF chega como blob e é aberto por
   * uma URL local, que morre junto com a guia.
   */
  async abrirDanfe(cupomId: string) {
    const r = await sysgrafix.get(`/fiscal/cupons/${cupomId}/pdf`, { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));

    window.open(url, "_blank", "noopener");

    /* Solta a memória depois de a guia ter lido o blob. Revogar na hora
       entregaria uma guia em branco. */
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },

  /** A SEFAZ exige justificativa de 15 caracteres, e o prazo é de 30 minutos. */
  async cancelar(cupomId: string, justificativa: string) {
    const r = await sysgrafix.post(`/fiscal/cupons/${cupomId}/cancelar`, { justificativa });
    return String(r.data?.message ?? "");
  },
};

export default FiscalService;
