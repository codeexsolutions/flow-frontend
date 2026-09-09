/* ─────────── API Preço / Prazo ─────────── */

export type ServicoCorreio = "SEDEX" | "PAC" | "SEDEX12" | "SEDEX10";

export type CalcFreteDto = {
  cepOrigem: string;
  cepDestino: string;
  peso: number;
  comprimento: number;
  altura: number;
  largura: number;
  /**
   * Filtra a cotação a estes serviços. VAZIO = todas as transportadoras da
   * conta, que é o padrão — Correios, Jadlog, Azul Cargo, LATAM, Loggi.
   *
   * A tela pedia SEDEX, PAC e SEDEX 12 em três chamadas separadas: uma lista
   * fixa dos Correios escrita no código, que escondia todo o resto do
   * catálogo. Uma chamada sem filtro traz tudo.
   */
  servicos?: number[];
  valorSegurado?: number;
  avisoRecebimento?: boolean;
  maoPropria?: boolean;
};

export type FreteResultado = {
  /**
   * O id do serviço no provedor — é ele que volta na hora de gerar a etiqueta.
   *
   * O rótulo ("Correios · PAC") é para a pessoa ler; quem identifica o serviço
   * na hora de comprar o frete é este número.
   */
  servicoId: number;
  /** "Correios · PAC", "Azul Cargo · Amanhã" — transportadora e serviço juntos. */
  servico: string;
  transportadora?: string;
  transportadoraLogo?: string;
  transportadoraId?: number;
  /**
   * "normal" ou "express".
   *
   * NÃO diz se é aéreo: o provedor classifica por VELOCIDADE. Quem é aéreo se
   * reconhece pela transportadora — Azul Cargo, LATAM Cargo —, e é por isso
   * que o nome dela aparece no cartão.
   */
  tipo?: string;
  /** A transportadora exige escolher um ponto de postagem antes de comprar. */
  exigeAgencia?: boolean;
  valor: number;
  prazo: number;
  /** Preenchido quando aquela transportadora recusou a rota. */
  erro?: string;
};

/** O que muda o preço além da caixa. */
export type OpcoesFrete = {
  /** Valor declarado para o seguro. 0 = sem seguro. */
  valorSegurado?: number;
  /** Aviso de recebimento: o papel assinado que volta. */
  avisoRecebimento?: boolean;
  /** Só o destinatário recebe, com documento. */
  maoPropria?: boolean;
};

/** Um serviço do catálogo do provedor. */
export type ServicoDisponivel = {
  id: number;
  nome: string;
  transportadora: string;
  logo?: string | null;
  tipo?: string | null;
  alcance?: string | null;
};

/** Um ponto de postagem da transportadora. */
export type AgenciaEnvio = {
  id: string;
  nome: string;
  empresa?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
};

/* ─────────── API Pré-Postagem ─────────── */

export type RemetenteDto = {
  nome: string;
  cpfCnpj: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  telefone?: string;
  email?: string;
};

export type DestinatarioDto = {
  nome: string;
  cpfCnpj: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  telefone?: string;
};

export type ItemDeclaracaoDto = {
  descricao: string;
  quantidade: number;
  valor: number;
};

export type PrePostagemDto = {
  contrato: string;
  /**
   * O serviço ESCOLHIDO NA COTAÇÃO, pelo id do provedor.
   *
   * Era uma constante do sistema ("SEDEX", "PAC") escolhida antes de saber
   * preço e prazo — e o resultado é que se despachava sem saber quanto ia
   * custar. Agora a cotação vem primeiro, e o que se escolhe é uma linha dela:
   * transportadora, preço e prazo juntos.
   */
  servicoId: number;
  servico?: string;
  remetente: RemetenteDto;
  destinatario: DestinatarioDto;
  itensDeclaracao: ItemDeclaracaoDto[];
  peso: number;
  comprimento: number;
  altura: number;
  largura: number;
  notaFiscal?: string;
  /** Obrigatória quando a transportadora exige ponto de postagem. */
  agenciaId?: string;
  valorSegurado?: number;
  avisoRecebimento?: boolean;
  maoPropria?: boolean;
};

export type PostagemResultado = {
  id: string;
  codigoObjeto: string;
  etiqueta: string;
  dae: string;
  urlDAE: string;
  status: string;
};

export type PostagemType = {
  id: string;
  codigoObjeto: string;
  cliente: string;
  servico: string;
  status: "PENDENTE" | "POSTADO" | "CANCELADO" | "EM_TRANSITO" | "ENTREGUE";
  etiqueta: string;
  dae: string;
  dataPostagem: string;
  valorFrete: number;
};

/* ─────────── API Rastro ─────────── */

export type RastreioEvento = {
  data: string;
  hora: string;
  local: string;
  descricao: string;
};

export type RastreioResultado = {
  codigo: string;
  servico: string;
  eventos: RastreioEvento[];
  ultimaAtualizacao: string;
};

/* ─────────── Resumo ─────────── */

export type ResumoCorreiosType = {
  postagensHoje: number;
  postagensMes: number;
  postagensPendentes: number;
  totalFreteMes: number;
};
