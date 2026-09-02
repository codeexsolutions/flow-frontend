/**
 * Espelha os DTOs de `/v1/assinatura/*`. Valores monetários chegam SEMPRE em
 * centavos inteiros — use `formatCurrencyFromCents` para exibir.
 */

export type CicloPlano = "MENSAL" | "TRIMESTRAL" | "SEMESTRAL" | "ANUAL";

export type StatusAssinatura = "PENDENTE" | "TRIAL" | "ATIVA" | "SUSPENSA" | "CANCELADA";

export type StatusFatura = "PENDENTE" | "AGUARDANDO_CONFIRMACAO" | "PAGA" | "VENCIDA" | "CANCELADA";

export type Plano = {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  /** Frase escrita para quem o plano atende — o título da recomendação. */
  chamada: string | null;
  publicoAlvo: string | null;
  precoCentavos: number;
  ciclo: CicloPlano;
  limiteUsuarios: number | null;
  /** Assentos de CRM. `null` = sem limite. */
  limiteAtendentes: number | null;
  limiteClientes: number | null;
  limiteProdutos: number | null;
  limitePedidosMes: number | null;
  /** `null` = sem limite, `0` = módulo não incluído no plano. */
  limitePlanilhas: number | null;
  /** Atendimentos por IA inclusos no mês. `0` = plano sem IA. */
  limiteIaMes: number | null;
  recursos: Record<string, unknown>;
  destaque: boolean;
};

/* ------------------------------------------------------------------ */
/* Diagnóstico comercial */
/* ------------------------------------------------------------------ */

export type RespostaEquipe = "SO_EU" | "DOIS_A_CINCO" | "SEIS_A_QUINZE" | "MAIS_DE_QUINZE";
export type RespostaNegocio = "LOJA" | "SERVICOS" | "ONLINE" | "INDUSTRIA";
export type RespostaCorreios = "SEMPRE" | "AS_VEZES" | "NAO";

export type RespostasDiagnostico = {
  equipe: RespostaEquipe;
  negocio: RespostaNegocio;
  correios: RespostaCorreios;
};

/**
 * O que volta de `/assinatura/recomendar`: um plano, não uma tabela.
 * `alternativo` é o degrau vizinho, atrás de "ver outras opções".
 */
export type Recomendacao = {
  plano: Plano;
  alternativo: Plano | null;
  motivos: string[];
  /** Vazio quando o WhatsApp comercial ainda não foi configurado. */
  linkWhatsapp: string;
  mensagemWhatsapp: string;
};

export type LeadRegistrado = {
  id: string;
  linkWhatsapp: string;
  mensagem: string;
  /** `false` = sem número cadastrado; o fluxo cai no pagamento normal. */
  whatsappConfigurado: boolean;
};

/* ------------------------------------------------------------------ */
/* Plano vigente e limites */
/* ------------------------------------------------------------------ */

export type UsoLimite = { usado: number; limite: number | null };

export type MeuPlano = {
  plano: Plano | null;
  /** Flags do plano. É o que decide menu visível e rota aberta. */
  recursos: Record<string, boolean>;
  uso: {
    usuarios: UsoLimite;
    clientes: UsoLimite;
    produtos: UsoLimite;
    pedidosMes: UsoLimite;
    atendentes: UsoLimite;
  };
  /** Limites em 80% ou mais — aviso antes de travar. */
  avisos: string[];
};

export type Fatura = {
  id: string;
  competencia: string;
  descricao: string | null;
  valorCentavos: number;
  vencimento: string;
  status: StatusFatura;
  metodoPagamento: string;
  planoNome: string | null;
  comprovanteEnviadoEm: string | null;
  pagoEm: string | null;
};

export type PixCobranca = {
  chave: string;
  beneficiario: string;
  cidade: string;
  valorCentavos: number;
  copiaECola: string;
  txid: string;
};

export type Suporte = {
  whatsapp: string;
  email: string;
  /** Link wa.me com a mensagem pronta; vazio quando não há WhatsApp configurado. */
  linkWhatsapp: string;
  mensagem: string;
};

/**
 * Cobrança Pix identificada, gerada pelo Mercado Pago para uma fatura.
 *
 * Diferente do Pix estático da chave da empresa: esta cobrança tem dono e
 * valor, e o pagamento é confirmado por webhook — sem comprovante.
 */
export type CobrancaPix = {
  /** Pix copia e cola. */
  qrCode: string;
  /** PNG do QR em base64, já pronto para `src`. */
  qrCodeBase64: string;
  ticketUrl: string | null;
  /** ISO — passou disso, uma nova cobrança é gerada. */
  expiraEm: string | null;
};

export type MinhaAssinatura = {
  empresa: {
    codigoEmpresa: string;
    nomeFantasia: string;
    nomeRepresentante: string;
    cpfCnpj: string;
    urlLogo: string | null;
    ativo: boolean;
  };
  plano: Plano | null;
  status: StatusAssinatura | null;
  proximoVencimento: string | null;
  faturas: Fatura[];
  faturaEmAberto: Fatura | null;
  /**
   * Se a troca de plano está liberada agora — e quando volta a estar.
   *
   * A regra (uma troca por ciclo) mora no servidor; a tela só obedece.
   * Opcional porque uma API antiga ainda não manda o campo: sem ele, a tela
   * assume liberada, que é o comportamento de antes.
   */
  trocaDePlano?: { liberada: boolean; liberaEm: string | null };
  /**
   * Cobrança automática pelo Mercado Pago.
   *
   * `disponivel` é o interruptor da plataforma; `ativo` é desta empresa.
   * Opcional para não quebrar contra uma API que ainda não manda o campo.
   */
  pagamentoAutomatico?: {
    disponivel: boolean;
    ativo: boolean;
    status: string | null;
    proximaCobranca: string | null;
  };
  pix: PixCobranca | null;
  suporte: Suporte;
  /**
   * Teste grátis em curso.
   *
   * Vem calculado do servidor: é ele que decide quando o período acaba, e uma
   * conta feita na tela poderia mostrar "faltam 2 dias" para quem a API já
   * está bloqueando. Opcional porque uma API anterior à migration 028 não
   * manda o campo — sem ele, a tela se comporta como antes.
   */
  teste?: {
    emTeste: boolean;
    /** ISO "AAAA-MM-DD" do último dia. */
    terminaEm: string | null;
    /** 0 = acaba hoje. */
    diasRestantes: number | null;
  };
};

/** Resposta de POST /empresas/cadastrar. */
export type RetornoCadastro = {
  id: string;
  codigoEmpresa: string;
  cpfCnpj: string;
  email: string;
  primeiroAcesso: boolean;
  plano: Plano | null;
  fatura: Fatura | null;
  pix: PixCobranca | null;
};

/** Rótulos e cores por status de fatura — usados no checkout. */
export const FaturaMeta: Record<StatusFatura, { label: string; text: string; bg: string; ring: string; dot: string }> = {
  PAGA: { label: "Paga", text: "text-success", bg: "bg-success/20", ring: "ring-success/25", dot: "bg-success" },
  PENDENTE: { label: "Pendente", text: "text-warning", bg: "bg-warning/20", ring: "ring-warning/25", dot: "bg-warning" },
  AGUARDANDO_CONFIRMACAO: {
    label: "Em confirmação",
    text: "text-accent-soft",
    bg: "bg-accent/20",
    ring: "ring-accent/25",
    dot: "bg-accent-soft",
  },
  VENCIDA: { label: "Vencida", text: "text-danger", bg: "bg-danger/20", ring: "ring-danger/25", dot: "bg-danger" },
  CANCELADA: { label: "Cancelada", text: "text-mist", bg: "bg-fg/[0.06]", ring: "ring-fg/[0.1]", dot: "bg-fg/[0.3]" },
};

export const ehPagavel = (f: Fatura) => f.status === "PENDENTE" || f.status === "VENCIDA";

export const emAberto = (f: Fatura) => ehPagavel(f) || f.status === "AGUARDANDO_CONFIRMACAO";

export const CICLO_LABEL: Record<CicloPlano, string> = {
  MENSAL: "/mês",
  TRIMESTRAL: "/trimestre",
  SEMESTRAL: "/semestre",
  ANUAL: "/ano",
};

/**
 * Nome amigável das flags de `recursos` vindas do banco.
 *
 * A ordem aqui é a ordem em que os recursos aparecem no cartão do plano: do
 * que todo mundo entende (PDV, clientes) para o que só quem precisa procura
 * (API, multi-loja). Flag sem rótulo simplesmente não é exibida.
 */
export const RECURSO_LABEL: Record<string, string> = {
  pdv: "PDV e vendas",
  clientes: "Cadastro de clientes",
  produtos: "Estoque e produtos",
  vendas: "Histórico de vendas",
  financeiro: "Financeiro e caixa",
  orcamentos: "Orçamentos",
  planilhas: "Produções",
  producao: "Controle de produção",
  crm: "CRM com funil de vendas",
  crmMultiAtendente: "CRM multi-atendente",
  metas: "Metas por vendedor",
  automacoes: "Automações de follow-up",
  relatorios: "Relatórios gerenciais",
  correios: "Correios integrado",
  whatsappIntegrado: "WhatsApp integrado",
  multiLoja: "Multi-loja",
  api: "API aberta",
  suporteWhatsapp: "Suporte por WhatsApp",
  suportePrioritario: "Suporte prioritário",
};

/** Rótulo dos limites, para a linha "o que cabe" do cartão. */
export const LIMITE_LABEL = {
  limiteUsuarios: "usuários",
  limiteAtendentes: "atendentes no CRM",
  limiteClientes: "clientes",
  limiteProdutos: "produtos",
  limitePedidosMes: "vendas/mês",
} as const;

/** `null` no limite é "sem teto" — e é assim que se escreve na tela. */
export const formatarLimite = (valor: number | null): string =>
  valor === null || valor === undefined ? "ilimitado" : valor.toLocaleString("pt-BR");
