import sysgrafix from "@/shared/api/sysgrafix";

export type Etapa = {
  id: string;
  nome: string;
  ordem: number;
  cor: string | null;
  conclui: boolean;
};

export type ItemProducao = {
  id: string;
  codigo: number;
  titulo: string;
  descricao: string | null;
  cliente_nome: string | null;
  /** A venda que originou a ordem. `null` = ordem criada à mão. */
  pedido_fk: string | null;
  /** Modelo de OS desta ordem. `null` = documento simples. */
  os_modelo: string | null;
  /** O que foi preenchido na OS, no formato do modelo que a desenha. */
  os_dados: Record<string, unknown> | null;
  /** A linha que esta ordem abriu na planilha de produção. `null` = não foi. */
  planilha_registro_fk: string | null;
  /** Em qual planilha ela foi aberta — fica gravado mesmo se a linha sumir. */
  planilha_modelo_fk: string | null;
  planilha_nome: string | null;
  etapa_fk: string | null;
  etapa_nome: string | null;
  etapa_conclui: boolean | null;
  posicao: number;
  responsavel_fk: string | null;
  responsavel_nome: string | null;
  periodo: "DIARIO" | "SEMANAL" | "MENSAL";
  prazo: string | null;
  prioridade: "BAIXA" | "NORMAL" | "ALTA";
  quantidade: number;
  concluido_em: string | null;
  criado_em: string;
  /** Quando entrou na coluna atual — é o que responde "parado desde quando". */
  entrou_na_etapa: string | null;
};

export type Movimento = {
  etapa_de_nome: string | null;
  etapa_para_nome: string | null;
  usuario_nome: string | null;
  criado_em: string;
};

const dados = <T>(r: { data?: { data?: T[] } }): T[] => r.data?.data ?? [];

/** Um modelo de OS que o painel liberou para esta empresa. */
export type ModeloOsDisponivel = {
  id: string;
  chave: string;
  nome: string;
  descricao: string | null;
};

const ProducaoService = {
  /** Os modelos de ordem de serviço que esta empresa pode adotar. */
  async modelosDeOs() {
    return dados<ModeloOsDisponivel>(await sysgrafix.get("/producao/os-modelos"));
  },

  /**
   * Gera a ORDEM DE SERVIÇO de uma venda já gravada.
   *
   * Sem `osModelo`, a ordem nasce com o modelo padrão da empresa — o escolhido
   * em Configurações › Produção.
   *
   * Devolve a mensagem do servidor: quando nada é criado (a venda já tem ordem,
   * ou o fluxo ainda não tem etapa) isso não é erro, e a tela precisa do texto
   * para dizer o que houve em vez de piscar um "pronto" mentiroso.
   */
  async daVenda(pedidoId: string, osModelo?: string): Promise<{ criado: boolean; mensagem: string }> {
    const r = await sysgrafix.post(`/producao/da-venda/${pedidoId}`, { osModelo: osModelo ?? null });
    return { criado: Boolean(r.data?.data?.[0]), mensagem: String(r.data?.message ?? "") };
  },

  async etapas() {
    return dados<Etapa>(await sysgrafix.get("/producao/etapas"));
  },

  async criarEtapa(nome: string, conclui = false) {
    await sysgrafix.post("/producao/etapas", { nome, conclui });
  },

  async removerEtapa(id: string) {
    await sysgrafix.delete(`/producao/etapas/${id}`);
  },

  async itens(filtros: { periodo?: string; responsavel?: string; incluirConcluidos?: boolean } = {}) {
    /* O servidor lê `concluidos=1`, não um booleano — ver o controller. Sem a
       tradução, `incluirConcluidos: true` virava `?incluirConcluidos=true` e a
       ordem já entregue sumia da lista, fazendo a venda parecer sem OS. */
    const { incluirConcluidos, ...resto } = filtros;

    return dados<ItemProducao>(
      await sysgrafix.get("/producao/itens", { params: { ...resto, ...(incluirConcluidos ? { concluidos: "1" } : {}) } }),
    );
  },

  async criarItem(item: Record<string, unknown>) {
    await sysgrafix.post("/producao/itens", item);
  },

  async mover(id: string, etapaId: string, contexto: { titulo?: string; etapaNome?: string } = {}) {
    await sysgrafix.patch(`/producao/itens/${id}/mover`, { etapaId, ...contexto });
  },

  async historico(id: string) {
    return dados<Movimento>(await sysgrafix.get(`/producao/itens/${id}/historico`));
  },

  /**
   * Troca o MODELO desta ordem — o papel que sai ao imprimi-la.
   *
   * String vazia volta ao modelo da empresa. É por isso que o parâmetro é
   * `string` e não `string | null`: `null` no corpo do PATCH significaria "não
   * mexa neste campo", e voltar ao padrão precisa ser alcançável.
   */
  async definirModeloOs(id: string, chave: string) {
    await sysgrafix.patch(`/producao/itens/${id}`, { osModelo: chave });
  },

  /**
   * Manda a ordem para uma planilha de produção.
   *
   * Cria a linha do cliente lá e guarda o vínculo na ordem. Devolve a mensagem
   * do servidor porque "criei agora" e "já estava" são desfechos diferentes, e
   * o segundo precisa ser dito — senão clicar duas vezes dá o mesmo "pronto" e
   * ninguém sabe se duplicou.
   */
  async mandarParaPlanilha(id: string, modeloId: string): Promise<string> {
    const r = await sysgrafix.post(`/producao/itens/${id}/planilha`, { modeloId });
    return String(r.data?.message ?? "");
  },

  /** Grava o preenchimento da OS — o que a bancada escreveu na ficha. */
  async salvarDadosOs(id: string, osDados: Record<string, unknown>) {
    await sysgrafix.patch(`/producao/itens/${id}`, { osDados });
  },

  /** Reatribui pessoa e dia — é o que a planilha faz ao arrastar a célula. */
  async reatribuir(id: string, responsavelId: string | null, prazo: string) {
    await sysgrafix.patch(`/producao/itens/${id}`, { responsavelId, prazo });
  },

  async excluir(id: string) {
    await sysgrafix.delete(`/producao/itens/${id}`);
  },
};

export default ProducaoService;
