/* ─────────── API Preço / Prazo ─────────── */

export type ServicoCorreio = "SEDEX" | "PAC" | "SEDEX12" | "SEDEX10";

export type CalcFreteDto = {
  cepOrigem: string;
  cepDestino: string;
  peso: number;
  comprimento: number;
  altura: number;
  largura: number;
  servico?: ServicoCorreio;
};

export type FreteResultado = {
  /**
   * O id do serviço no provedor — é ele que volta na hora de gerar a etiqueta.
   *
   * O rótulo ("Correios · PAC") é para a pessoa ler; quem identifica o serviço
   * na hora de comprar o frete é este número.
   */
  servicoId: number;
  servico: string;
  valor: number;
  prazo: number;
  /** Preenchido quando aquela transportadora recusou a rota. */
  erro?: string;
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
