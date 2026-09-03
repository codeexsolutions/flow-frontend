import sysgrafix from "@/shared/api/sysgrafix";

export type Periodicidade = "DIARIA" | "SEMANAL" | "MENSAL";

/** Uma página da planilha: o começo do período e quantas linhas tem. */
export type Periodo = { de: string; linhas: number; nome?: string | null };

/** Uma linha do histórico: uma célula que mudou de valor. */
export type Alteracao = {
  id: string;
  registro_id: string;
  coluna_nome: string | null;
  valor_antes: string | null;
  valor_depois: string | null;
  acao: string;
  usuario_nome: string | null;
  criado_em: string;
};

export type TipoColuna =
  | "TEXTO" | "TEXTO_LONGO" | "NUMERO" | "MOEDA" | "DATA"
  | "SELECAO" | "MULTIPLA" | "CHECKBOX" | "IMAGEM" | "USUARIO" | "CLIENTE";

export type Modelo = {
  id: string;
  nome: string;
  descricao: string | null;
  periodicidade: Periodicidade;
  coluna_prazo_fk: string | null;
  total_colunas: number;
  total_registros: number;
  /**
   * Linhas COM valor — não é o mesmo que `total_registros`.
   *
   * A planilha nasce com dez linhas em branco, então contar registros diria
   * que toda planilha tem conteúdo. É este número que decide se ela pode ser
   * excluída.
   */
  total_preenchidas: number;
};

export type Opcao = { valor: string; cor?: string };

export type Coluna = {
  id: string;
  nome: string;
  tipo: TipoColuna;
  opcoes: Opcao[];
  ordem: number;
  largura: number | null;
  obrigatorio: boolean;
  valor_padrao: string | null;
  /** Ids que podem editar. Vazio = todos. */
  permissoes: string[];
  /** `false` esconde do link do cliente, em todos os links. */
  publico: boolean;
  /** Coluna DATA que serve de mínimo para esta, na mesma linha. */
  nao_antes_de: string | null;
};

export type Registro = {
  id: string;
  valores: Record<string, unknown>;
  competencia: string;
  ordem: number;
};

export type Pagina = { periodicidade: Periodicidade; de: string; ate: string; registros: Registro[] };

/** Um modelo pronto do catálogo — a receita, antes de virar planilha. */
export type ModeloCatalogo = {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  periodicidade: Periodicidade;
  colunas: { nome: string; tipo: TipoColuna; opcoes?: Opcao[]; valorPadrao?: string | null }[];
  publicado: boolean;
  /** Compartilhado com esta empresa em particular, e não com todas. */
  exclusivo: boolean;
};


/** Um link de acompanhamento entregue a um cliente. */
export type LinkPublico = {
  id: string;
  token: string;
  cliente_nome: string;
  coluna_cliente_fk: string;
  ativo: boolean;
  expira_em: string | null;
  visitas: number;
  visto_em: string | null;
  criado_em: string;
};

export type TemaMarca = "claro" | "escuro" | "degrade";

/** A identidade visual que a página do cliente veste. */
export type MarcaEmpresa = {
  nome: string;
  logo: string | null;
  cor: string | null;
  tema: TemaMarca;
  capa: string | null;
  /**
   * O wallpaper do cadastro da empresa — o mesmo da nota e do orçamento.
   *
   * Só de leitura por aqui: quem o troca é Configurações › Empresa. Ele vem
   * junto para a prévia poder mostrar a página como ela realmente fica.
   */
  wallpaper: string | null;
  whatsapp: string | null;
  /** O PNG do mascote que entra deslizando na página do cliente. */
  mascote: string | null;
  /**
   * O endereço próprio da empresa, quando ela tem um — `joseanfardamentos.com`.
   *
   * Só de leitura por aqui; quem grava é Configurações › Empresa. Vem junto da
   * marca porque quem precisa dele é a tela que MONTA o link para copiar, e ela
   * já busca a marca.
   */
  dominio: string | null;
};

/**
 * O `carregamento: false` que se repete abaixo — e por que é só aqui.
 *
 * O interceptor de `sysgrafix` abre uma caixa "Salvando…" em toda gravação
 * (ver `shared/api/carregamento.ts`). Essa caixa é certa na maior parte do
 * sistema: cadastrar produto, fechar nota, registrar pagamento — gestos que a
 * pessoa faz uma vez e espera terminar.
 *
 * A planilha e o backlog não funcionam assim. Ali se digita em rajada — dez,
 * vinte células seguidas — e cada saída de campo é uma gravação. A caixa não
 * tem botão, ROUBA O FOCO do campo e engole a próxima tecla: quem estava
 * descendo a coluna perde a linha e tem de reencontrá-la. No backlog é o
 * mesmo: arrastar um cartão travava o quadro por meio segundo, e arrastar
 * cinco travava cinco vezes. É a mesma razão pela qual `/mover`, o arrastar do
 * quadro de produção, já estava fora do aviso.
 *
 * Nada se perde calando o aviso: a gravação é otimista (a célula já mostra o
 * valor novo), e a falha volta como toast no canto, com a célula revertida —
 * ver `salvarCelula` em `PlanilhasPage`. O aviso dizia o que a tela já dizia,
 * e cobrava o foco por isso.
 *
 * O que CONTINUA com a caixa: criar e excluir planilha, criar coluna, usar um
 * modelo do catálogo, emitir e revogar link. São gestos deliberados, feitos
 * uma vez, fora do fluxo de digitação — e alguns demoram o bastante para que
 * o silêncio pareça travamento.
 */
const SEM_AVISO = { carregamento: false as const };

const lista = <T>(r: { data?: { data?: T[] } }): T[] => r.data?.data ?? [];
const um = <T>(r: { data?: { data?: T[] } }): T => (r.data?.data ?? [])[0] as T;

const PlanilhaService = {
  async modelos() {
    return lista<Modelo>(await sysgrafix.get("/planilhas"));
  },

  async criarModelo(dados: { nome: string; descricao?: string; periodicidade: Periodicidade }) {
    return um<string>(await sysgrafix.post("/planilhas", dados));
  },

  async alterarModelo(id: string, dados: Record<string, unknown>) {
    await sysgrafix.patch(`/planilhas/${id}`, dados, SEM_AVISO);
  },

  /** Os modelos prontos que esta empresa recebeu. */
  async catalogo() {
    return lista<ModeloCatalogo>(await sysgrafix.get("/planilhas/catalogo"));
  },

  /** Cria a planilha a partir de um modelo do catálogo. Devolve o id novo. */
  async usarModelo(catalogoId: string, nome?: string) {
    return um<string>(await sysgrafix.post(`/planilhas/catalogo/${catalogoId}/usar`, { nome }));
  },

  /** Copia a ESTRUTURA da planilha — colunas, não registros. */
  async duplicarModelo(id: string, nome?: string) {
    return um<string>(await sysgrafix.post(`/planilhas/${id}/duplicar`, { nome }));
  },

  async removerModelo(id: string) {
    await sysgrafix.delete(`/planilhas/${id}`);
  },

  /** As páginas já existentes desta planilha — Agosto, Setembro... */
  async periodos(modeloId: string) {
    return lista<Periodo>(await sysgrafix.get(`/planilhas/${modeloId}/periodos`));
  },

  /** Batiza uma página. Nome vazio devolve o rótulo pela data. */
  async renomearPagina(modeloId: string, competencia: string, nome: string) {
    await sysgrafix.patch(`/planilhas/${modeloId}/paginas`, { competencia, nome }, SEM_AVISO);
  },

  /* --------- Links de acompanhamento (o que o cliente abre) --------- */

  async links(modeloId: string) {
    return lista<LinkPublico>(await sysgrafix.get(`/planilhas/${modeloId}/links`));
  },

  /**
   * Emite o link de um cliente.
   *
   * Chamar duas vezes para o mesmo cliente devolve o MESMO link com a validade
   * renovada — o servidor trata isso, então a tela não precisa checar antes.
   */
  async criarLink(
    modeloId: string,
    dados: { clienteNome: string; colunaClienteId?: string; colunasVisiveis?: string[]; validadeDias?: number | null },
    /**
     * `true` quando o link é CONSEQUÊNCIA de uma célula, não um pedido.
     *
     * Escrever um nome numa coluna de Cliente emite o link sozinho (ver
     * `emitirLinkDoCliente`). Sem esta saída, digitar o nome do cliente
     * abriria a caixa "Salvando…" no meio da planilha — um aviso para algo
     * que a pessoa nem pediu, tirando o foco de onde ela estava digitando. O
     * toast de "link criado" já conta o que aconteceu, no canto e sem
     * interromper.
     *
     * No botão de gerar link (`LinksCliente`) fica `false`: ali o gesto foi
     * deliberado e a espera é a resposta a ele.
     */
    automatico = false,
  ) {
    return um<LinkPublico>(await sysgrafix.post(`/planilhas/${modeloId}/links`, dados, automatico ? SEM_AVISO : undefined));
  },

  async revogarLink(linkId: string) {
    await sysgrafix.delete(`/planilhas/links/${linkId}`);
  },

  /** Logo, cor e contato — o que a página do cliente veste. */
  async marca() {
    return um<MarcaEmpresa>(await sysgrafix.get("/planilhas/marca"));
  },

  /**
   * Campo omitido não é tocado; campo vazio limpa. Mandar `{ cor }` sozinho
   * não apaga o tema nem a capa.
   */
  async salvarMarca(dados: { cor?: string | null; tema?: TemaMarca | null; capa?: string | null; mascote?: string | null }) {
    await sysgrafix.patch("/planilhas/marca", dados);
  },

  /** Quem mudou o quê. Sem filtro, a planilha inteira; com os dois, a célula. */
  async historico(modeloId: string, registroId?: string, colunaId?: string) {
    const params: Record<string, string> = {};

    if (registroId) params.registro = registroId;
    if (colunaId) params.coluna = colunaId;

    return lista<Alteracao>(
      await sysgrafix.get(`/planilhas/${modeloId}/historico`, { params: Object.keys(params).length ? params : undefined }),
    );
  },

  async colunas(modeloId: string) {
    return lista<Coluna>(await sysgrafix.get(`/planilhas/${modeloId}/colunas`));
  },

  async criarColuna(modeloId: string, dados: { nome: string; tipo: TipoColuna; opcoes?: Opcao[]; valorPadrao?: string | null; permissoes?: string[] }) {
    return um<string>(await sysgrafix.post(`/planilhas/${modeloId}/colunas`, dados));
  },

  async alterarColuna(colunaId: string, dados: Record<string, unknown>) {
    await sysgrafix.patch(`/planilhas/colunas/${colunaId}`, dados, SEM_AVISO);
  },

  async removerColuna(colunaId: string) {
    await sysgrafix.delete(`/planilhas/colunas/${colunaId}`);
  },

  /** Cria um bloco de linhas em branco de uma vez. */
  async criarLote(modeloId: string, quantidade: number, competencia: string) {
    await sysgrafix.post(`/planilhas/${modeloId}/registros/lote`, { quantidade, competencia }, SEM_AVISO);
  },

  async registros(modeloId: string, data?: string) {
    return um<Pagina>(await sysgrafix.get(`/planilhas/${modeloId}/registros`, { params: data ? { data } : undefined }));
  },

  async criarRegistro(modeloId: string, dados: { valores?: Record<string, unknown>; competencia?: string }) {
    return um<string>(await sysgrafix.post(`/planilhas/${modeloId}/registros`, dados, SEM_AVISO));
  },

  async alterarRegistro(registroId: string, dados: Record<string, unknown>) {
    await sysgrafix.patch(`/planilhas/registros/${registroId}`, dados, SEM_AVISO);
  },

  async excluirRegistro(registroId: string) {
    await sysgrafix.delete(`/planilhas/registros/${registroId}`, SEM_AVISO);
  },
};

export default PlanilhaService;
