/**
 * Modelo de domínio de Pedido/Venda.
 *
 * Nomenclatura: `PedidoClienteType` é a *venda* (o cliente junto com o pedido),
 * enquanto `PedidoType` é apenas o pedido. Os nomes antigos (`clientePedido` e
 * `pedidoCliente`) eram quase anagramas um do outro e significavam coisas
 * opostas — origem recorrente de confusão.
 */

export const PEDIDO_STATUS = {
  ABERTO: "ABERTO",
  PENDENTE: "PENDENTE",
  FECHADO: "FECHADO",
  PAGO: "PAGO",
  CANCELADO: "CANCELADO",
} as const;

export type PedidoStatus = (typeof PEDIDO_STATUS)[keyof typeof PEDIDO_STATUS];

export type ProdutoPedidoType = {
  produtoId: string;
  nomeProduto: string;
  valorProduto: number;
};

export type ItemPedidoType = {
  itemPedidoId: string;
  quantidadeItem: number;
  valorVendaItem: number;
  subtotalItens?: number;
  produto: ProdutoPedidoType;
  /**
   * Qual peça saiu, quando o produto tem variações.
   *
   * Sem isto, "vendi 3 camisetas" não diz se foram P ou G — a baixa cairia no
   * produto inteiro e a nota reimpressa meses depois não mostraria o que o
   * cliente levou.
   */
  variacaoId?: string | null;
  /** "M / Azul" — só para exibir; quem manda no estoque é o `variacaoId`. */
  variacaoDescricao?: string;
};

export type PedidoType = {
  pedidoId: string;
  totalPedido: number;
  dataPedido: Date;
  pedidoStatus: string;
  /** Quanto já foi pago da nota (pagamento parcial acumulado). Vem do backend. */
  valorPago?: number;
  /** Forma do último pagamento registrado. Vem do backend. */
  formaPagamento?: string | null;
  itensPedido: ItemPedidoType[];
  /**
   * Até duas fotos do serviço prestado — da VENDA, não do catálogo.
   *
   * A foto do produto continua no produto: esta é a estampa aplicada, o
   * bordado aprovado, o antes e depois do conserto. Sai impressa na nota.
   */
  imagensServico?: string[];
  /** A nota sai com o QR do Pix? `true` é o padrão; falso na venda já quitada. */
  mostrarQr?: boolean;
};

/** Uma venda: o cliente e o pedido dele. */
export type PedidoClienteType = {
  clienteId: string;
  nomeCliente: string;
  statusCliente: string;
  pedido: PedidoType;
  codigoEmpresa: string;
  /** Quem fez a venda. Nulo em pedido anterior ao registro de vendedor. */
  vendedorId?: string | null;
  nomeVendedor?: string | null;
};

/** Item enviado ao backend ao criar ou alterar um pedido. */
export type ItemPedidoDto = {
  produtoId: string;
  quantidade: number;
  valorVenda: number;
  /** Ausente quando o produto não tem variações. */
  variacaoId?: string | null;
};

/** POST /pedidos/novo-pedido — o controller lê `itensPedido`. */
export type NovoPedidoDto = {
  clienteId: string | undefined;
  itensPedido: ItemPedidoDto[];
  imagensServico?: string[];
  mostrarQr?: boolean;
};

/**
 * PATCH /pedidos/alterar/:id — atenção: esse endpoint lê `produtosPedido`,
 * não `itensPedido` (nome diferente do de criar o pedido). Pagamento NÃO
 * passa por aqui — isso é feito à parte, em PATCH /financeiro/notas/:id/pagar.
 */
export type PedidoUpdateDto = {
  clienteId: string | undefined;
  produtosPedido: ItemPedidoDto[];
  /* Ausentes = a tela não mexeu; `[]` limpa. Ver `pedidoUpdate`, na API. */
  imagensServico?: string[];
  mostrarQr?: boolean;
};

/* ─────────────────────────── Regras de negócio ─────────────────────────── */

export const estaAberto = (v: PedidoClienteType): boolean => v.pedido.pedidoStatus === PEDIDO_STATUS.ABERTO;

export const estaPendente = (v: PedidoClienteType): boolean => v.pedido.pedidoStatus === PEDIDO_STATUS.PENDENTE;

export const estaFechado = (v: PedidoClienteType): boolean => v.pedido.pedidoStatus === PEDIDO_STATUS.FECHADO;

export const estaPago = (v: PedidoClienteType): boolean => v.pedido.pedidoStatus === PEDIDO_STATUS.PAGO;

/**
 * A venda foi RECEBIDA — em qualquer um dos dois nomes que isso tem no banco.
 *
 * `FECHADO` e `PAGO` significam a mesma coisa para quem lê a tela ("essa já
 * entrou"), e ambos existem porque dois caminhos diferentes gravam o
 * fechamento da nota. Hoje a base tem 28 numa e 22 na outra.
 *
 * Enquanto cada tela perguntava `estaFechado`, as 22 notas em `PAGO` sumiam de
 * TUDO que conta dinheiro recebido: do "recebido no mês" do Início, da linha
 * verde do gráfico, do relatório por vendedor, do filtro "Pagas" da lista e da
 * contagem do panorama. A venda estava paga, o dinheiro no caixa, e o painel
 * dizia que não.
 *
 * `estaFechado` e `estaPago` continuam existindo para quem precisa do status
 * exato. Para "já recebi?", a pergunta é esta.
 */
export const estaQuitado = (v: PedidoClienteType): boolean => estaFechado(v) || estaPago(v);

export const estaCancelado = (v: PedidoClienteType): boolean => v.pedido.pedidoStatus === PEDIDO_STATUS.CANCELADO;

/**
 * Total da venda. Usa `totalPedido` quando o backend o envia; se vier 0/ausente,
 * recalcula somando os itens.
 */
export const totalDoPedido = (v: PedidoClienteType): number => Number(v.pedido.totalPedido) || (v.pedido.itensPedido ?? []).reduce((acc: number, item: ItemPedidoType) => acc + Number(item.valorVendaItem || 0) * Number(item.quantidadeItem || 0), 0);

/** Quanto já foi pago nesta venda (pagamentos parciais acumulados). */
export const valorPagoDoPedido = (v: PedidoClienteType): number =>
  Number(v.pedido.valorPago ?? 0);

/**
 * QUANTO ENTROU desta venda — a pergunta que todo painel faz.
 *
 * ---------------------------------------------------------------------------
 * Por que não basta `valorPagoDoPedido`, nem basta o status
 * ---------------------------------------------------------------------------
 * As telas respondiam isso de dois jeitos, e os dois erravam metade dos casos:
 *
 * • Somar o TOTAL das notas quitadas (o que o Início fazia) ignora pagamento
 *   parcial por completo. A venda de R$ 500 com R$ 300 recebidos contava
 *   ZERO — o dinheiro estava no caixa e o painel dizia que não tinha entrado.
 *   Era o que fazia o número só se mexer "quando a nota é dada baixa".
 *
 * • Somar só `valor_pago` erra no sentido contrário nas notas antigas: as que
 *   foram quitadas antes de existir o extrato de recebimentos ficaram com
 *   `valor_pago` zerado (ver a migration 068), e some do painel dinheiro que
 *   entrou de verdade.
 *
 * Esta função responde as duas: o recebido é o que o extrato acumulou e, na
 * nota que o sistema dá por quitada, nunca menos que o total dela.
 *
 * `Math.max` e não um `if`: se as duas fontes discordarem, quem vale é a
 * maior — subestimar caixa recebido é o erro que faz alguém cobrar de novo um
 * cliente que já pagou.
 */
export const recebidoDoPedido = (v: PedidoClienteType): number => {
  if (estaCancelado(v)) return 0;

  const pago = valorPagoDoPedido(v);

  return estaQuitado(v) ? Math.max(pago, totalDoPedido(v)) : pago;
};

/**
 * Valor ainda pendente.
 * Pedidos cancelados ou totalmente pagos/fechados ficam zerados.
 */
export const valorPendenteDoPedido = (v: PedidoClienteType): number => {
  if (estaCancelado(v) || estaFechado(v) || estaPago(v)) return 0;
  return Math.max(totalDoPedido(v) - valorPagoDoPedido(v), 0);
};

/** Type guard para respostas da API que podem trazer registros incompletos. */
export const isPedidoValido = (v: unknown): v is PedidoClienteType => !!v && !!(v as PedidoClienteType).pedido;
