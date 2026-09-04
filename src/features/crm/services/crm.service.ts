import sysgrafix from "@/shared/api/sysgrafix";

/**
 * O CRM de WhatsApp visto pelo painel.
 *
 * A tela nunca fala com o serviço que roda o WhatsApp — ela fala com a API, e
 * a API repassa. Ver `ServicoWhatsapp.ts` no back: o segredo daquele serviço
 * não pode chegar ao navegador, e ele nem sabe o que é um usuário.
 */

export type StatusConexao = "DESLIGADA" | "INICIANDO" | "AGUARDANDO_QR" | "CONECTADA" | "DERRUBADA";

export type Conexao = {
  status: StatusConexao;
  /** O payload do QR, em texto. Quem desenha o quadrado é a tela. */
  qr: string | null;
  numero: string | null;
  erro: string | null;
  ultimo_uso?: string | null;
  atualizado_em?: string | null;
  /**
   * A instalação tem o serviço de WhatsApp configurado?
   *
   * Diferente de "esta loja não conectou": sem o serviço, o botão de conectar
   * não deve nem aparecer — oferecer algo que nunca vai funcionar é pior do
   * que dizer que não está disponível.
   */
  configurado: boolean;
};

/** Um dia do expediente. `dia` 0 = domingo, como o `getDay()` do JavaScript. */
export type DiaExpediente = {
  dia: number;
  fechado?: boolean;
  abre?: string;
  fecha?: string;
};

export type Chatbot = {
  ativo: boolean;
  mensagem_fora: string | null;
  expediente: DiaExpediente[];
  /** Horas sem repetir o recado para a mesma pessoa. */
  silencio_horas: number;
  /** Com a IA ligada, é ela que responde — o recado fixo não sai. */
  ia_ativa: boolean;
  /** O que a loja sabe, em texto corrido. É daqui que a IA responde. */
  documentacao: string | null;
  /** Minutos que a IA espera antes de entrar no lugar de uma pessoa. */
  ia_espera_minutos: number;
  /**
   * Modo de teste: só este número recebe resposta da IA.
   *
   * Existe para dar como experimentar o robô sem soltá-lo na base inteira —
   * a falta disso é o que fez a primeira ativação virar 32 mensagens para 29
   * clientes reais.
   */
  ia_numero_teste: string | null;
  /**
   * Para quem o robô liga quando não sabe responder.
   *
   * Vazio = ninguém é avisado, e a conversa fica esperando na caixa de
   * entrada — o comportamento de antes da IA existir.
   */
  numero_atendente: string | null;
  /** Quando a IA foi ligada. A IA só responde ao que chegou depois disto. */
  ia_ligada_em?: string | null;
  atualizado_em?: string | null;
};

export type Etapa = {
  id: string;
  nome: string;
  cor: string | null;
  ordem: number;
  entrada: boolean;
  encerra: boolean;
};

export type Conversa = {
  id: string;
  etapa_fk: string | null;
  responsavel_fk: string | null;
  responsavel_nome: string | null;
  nao_lidas: number;
  arquivada: boolean;
  ordem: number;
  ultima_mensagem: string | null;
  ultima_mensagem_em: string | null;
  /** Quem falou por último. `SAIDA` = a loja — a lista escreve "Você:". */
  ultima_direcao: "ENTRADA" | "SAIDA" | null;
  contato_id: string;
  telefone: string;
  foto: string | null;
  cliente_fk: string | null;
  /** O do cadastro quando há vínculo; o do WhatsApp quando não há. */
  nome: string;
};

export type Mensagem = {
  id: string;
  direcao: "ENTRADA" | "SAIDA";
  tipo: "TEXTO" | "IMAGEM" | "AUDIO" | "VIDEO" | "DOCUMENTO" | "OUTRO";
  corpo: string | null;
  midia_url: string | null;
  status: "PENDENTE" | "ENVIADA" | "ENTREGUE" | "LIDA" | "FALHOU";
  erro: string | null;
  criado_em: string;
  autor_nome: string | null;
  /** Saiu do robô, não de uma pessoa — a bolha diz isso. */
  automatica?: boolean;
};

const dados = <T>(r: { data?: { data?: T[] } }): T[] => r.data?.data ?? [];
const um = <T>(r: { data?: { data?: T[] } }): T => (r.data?.data ?? [])[0] as T;

/**
 * A consulta do estado da conexão roda em laço enquanto o QR está na tela.
 *
 * `carregamento: false` nela e em tudo o que a tela faz em rajada: a caixa
 * "Salvando…" do interceptor roubaria o foco do campo de mensagem a cada
 * envio — o mesmo motivo pelo qual as planilhas já saíram dela. Numa tela de
 * conversa, um modal por mensagem enviada é inutilizável.
 */
const SEM_AVISO = { carregamento: false as const };

const CrmService = {
  /* ------------------------------ Conexão ----------------------------- */

  async conexao() {
    return um<Conexao>(await sysgrafix.get("/crm/conexao"));
  },

  /** Pede a conexão. Responde na hora; o QR chega em `conexao()`. */
  async conectar() {
    await sysgrafix.post("/crm/conexao", {});
  },

  async desconectar() {
    await sysgrafix.delete("/crm/conexao");
  },

  /**
   * Traz as conversas que já existiam no WhatsApp.
   *
   * Roda sozinha na primeira conexão; isto é o "traz de novo". O servidor
   * responde na hora e trabalha por minutos — a caixa de entrada vai se
   * enchendo sozinha pelo tempo real.
   */
  async importar() {
    await sysgrafix.post("/crm/conexao/importar", {});
  },

  /* ------------------------------ Chatbot ----------------------------- */

  async chatbot() {
    return um<Chatbot>(await sysgrafix.get("/crm/chatbot"));
  },

  async salvarChatbot(dados: {
    ativo?: boolean;
    mensagemFora?: string;
    expediente?: DiaExpediente[];
    silencioHoras?: number;
    iaAtiva?: boolean;
    documentacao?: string;
    iaEsperaMinutos?: number;
    iaNumeroTeste?: string;
    numeroAtendente?: string;
  }) {
    await sysgrafix.patch("/crm/chatbot", dados, SEM_AVISO);
  },

  /* ------------------------------- Funil ------------------------------ */

  async etapas() {
    return dados<Etapa>(await sysgrafix.get("/crm/etapas"));
  },

  async criarEtapa(nome: string, cor?: string) {
    return um<string>(await sysgrafix.post("/crm/etapas", { nome, cor }));
  },

  async alterarEtapa(id: string, dados_: { nome?: string; cor?: string; ordem?: number }) {
    await sysgrafix.patch(`/crm/etapas/${id}`, dados_, SEM_AVISO);
  },

  async removerEtapa(id: string) {
    await sysgrafix.delete(`/crm/etapas/${id}`);
  },

  /* ----------------------------- Conversas ---------------------------- */

  async conversas(filtros: { busca?: string; etapa?: string; arquivadas?: boolean } = {}) {
    const params: Record<string, string> = {};

    if (filtros.busca) params.busca = filtros.busca;
    if (filtros.etapa) params.etapa = filtros.etapa;
    if (filtros.arquivadas) params.arquivadas = "true";

    return dados<Conversa>(await sysgrafix.get("/crm/conversas", { params }));
  },

  /** Começa a conversa com quem ainda não escreveu — a loja falando primeiro. */
  async abrirConversa(telefone: string, nome?: string) {
    return um<string>(await sysgrafix.post("/crm/conversas", { telefone, nome }));
  },

  /**
   * "Estou com esta conversa aberta."
   *
   * Batida em laço enquanto a conversa está na tela: o robô se cala enquanto
   * tem gente ali. `carregamento: false` porque é a chamada mais frequente do
   * CRM — a caixa "Salvando…" piscando a cada meio minuto seria intolerável.
   */
  async presenca(conversaId: string) {
    await sysgrafix.post(`/crm/conversas/${conversaId}/presenca`, {}, SEM_AVISO);
  },

  /** Abrir a conversa já zera as não lidas no servidor — ler é o próprio gesto. */
  async mensagens(conversaId: string) {
    return dados<Mensagem>(await sysgrafix.get(`/crm/conversas/${conversaId}/mensagens`, SEM_AVISO));
  },

  async enviar(conversaId: string, texto: string) {
    return um<string>(await sysgrafix.post(`/crm/conversas/${conversaId}/mensagens`, { texto }, SEM_AVISO));
  },

  /**
   * Move de etapa, troca responsável, arquiva — no mesmo lugar.
   *
   * `etapaId: null` TIRA do funil, e é diferente de omitir o campo (que
   * significa "não mexi"). A API distingue os dois; ver `AlterarConversa`.
   */
  async alterarConversa(
    conversaId: string,
    dados_: { etapaId?: string | null; responsavelId?: string | null; arquivada?: boolean; ordem?: number },
  ) {
    await sysgrafix.patch(`/crm/conversas/${conversaId}`, dados_, SEM_AVISO);
  },

  /* ------------------------------ Contato ----------------------------- */

  async vincularCliente(contatoId: string, clienteId: string | null) {
    await sysgrafix.patch(`/crm/contatos/${contatoId}/cliente`, { clienteId }, SEM_AVISO);
  },
};

export default CrmService;
