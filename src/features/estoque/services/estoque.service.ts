import sysgrafix from "@/shared/api/sysgrafix";
import type {
  Atributo, AtributoValor, Categoria, FichaProduto, Indisponibilidade, Insumo,
  Movimento, TipoMovimento, Variacao, VariacaoInput,
} from "@/shared/domain/estoque";

/**
 * O estoque avançado: categorias, atributos, variações, insumos e extrato.
 *
 * Base `/estoque` e não `/produtos` — do lado da API, `GET /produtos/:id` casa
 * com qualquer caminho de um segmento e engoliria `/produtos/atributos`. Ver a
 * nota no topo de `estoque.route.ts`.
 */

/** Todo endpoint da casa responde `{ statusCode, message, data: [] }`. */
const lista = <T>(resposta: { data?: { data?: unknown } }): T[] =>
  Array.isArray(resposta.data?.data) ? (resposta.data.data as T[]) : [];

const primeiro = <T>(resposta: { data?: { data?: unknown } }): T | null => lista<T>(resposta)[0] ?? null;

const EstoqueService = {

  /* ── Ficha ────────────────────────────────────────────────────────────── */

  ficha: async (produtoId: string): Promise<FichaProduto> => {
    const resposta = await sysgrafix.get(`/estoque/produtos/${produtoId}/ficha`);
    const ficha = primeiro<FichaProduto>(resposta);

    if (!ficha) throw new Error("Produto não encontrado.");

    return ficha;
  },

  /* ── Categorias ───────────────────────────────────────────────────────── */

  categorias: async (): Promise<Categoria[]> => lista<Categoria>(await sysgrafix.get("/estoque/categorias")),

  /** Cria quando não tem `id`, renomeia quando tem. */
  salvarCategoria: async (categoria: Partial<Categoria> & { nome: string }) =>
    primeiro<string>(await sysgrafix.post("/estoque/categorias", categoria, { carregamento: "Salvando a categoria…" })),

  /**
   * Apaga a categoria. Os produtos dela ficam SEM CATEGORIA — não somem.
   *
   * Devolve a frase do servidor pelo mesmo motivo de `excluirVariacao`: quem
   * apaga precisa ler o que aconteceu com o que estava dentro, e não um
   * "excluída" que deixa a dúvida no ar.
   */
  excluirCategoria: async (categoriaId: string): Promise<string> => {
    const { data } = await sysgrafix.delete(`/estoque/categorias/${categoriaId}`, { carregamento: "Excluindo a categoria…" });

    return data?.message ?? "Categoria excluída.";
  },

  /* ── Atributos ────────────────────────────────────────────────────────── */

  atributos: async (): Promise<Atributo[]> => lista<Atributo>(await sysgrafix.get("/estoque/atributos")),

  salvarAtributo: async (atributo: Partial<Atributo> & { nome: string }) =>
    primeiro<string>(await sysgrafix.post("/estoque/atributos", atributo, { carregamento: "Salvando o atributo…" })),

  excluirAtributo: async (id: string) => { await sysgrafix.delete(`/estoque/atributos/${id}`, { carregamento: "Excluindo o atributo…" }); },

  salvarValor: async (atributoId: string, valor: Partial<AtributoValor> & { valor: string }) =>
    primeiro<string>(await sysgrafix.post(`/estoque/atributos/${atributoId}/valores`, valor, { carregamento: "Salvando o valor…" })),

  excluirValor: async (valorId: string) => { await sysgrafix.delete(`/estoque/valores/${valorId}`, { carregamento: "Excluindo o valor…" }); },

  /* ── Variações ────────────────────────────────────────────────────────── */

  variacoes: async (produtoId: string): Promise<Variacao[]> =>
    lista<Variacao>(await sysgrafix.get(`/estoque/produtos/${produtoId}/variacoes`)),

  salvarVariacao: async (produtoId: string, variacao: VariacaoInput) =>
    primeiro<string>(await sysgrafix.post(`/estoque/produtos/${produtoId}/variacoes`, variacao, { carregamento: "Salvando a variação…" })),

  /**
   * Devolve a frase do servidor.
   *
   * Excluir tem dois desfechos — a variação some de vez (nunca foi vendida) ou
   * sai do estoque e continua nos pedidos em que apareceu. A tela dizer sempre
   * "excluída" faria a pessoa procurá-la no histórico achando que sumiu de lá
   * também. Mesmo raciocínio de `ProductService.remove`.
   */
  excluirVariacao: async (variacaoId: string): Promise<string> => {
    const { data } = await sysgrafix.delete(`/estoque/variacoes/${variacaoId}`, { carregamento: "Removendo a variação…" });

    return data?.message ?? "Variação excluída.";
  },

  /* ── Insumos ──────────────────────────────────────────────────────────── */

  insumos: async (produtoId: string): Promise<Insumo[]> =>
    lista<Insumo>(await sysgrafix.get(`/estoque/produtos/${produtoId}/insumos`)),

  salvarInsumo: async (produtoId: string, insumo: { id?: string; insumoId: string; quantidade: number; variacaoId?: string | null }) =>
    primeiro<string>(await sysgrafix.post(`/estoque/produtos/${produtoId}/insumos`, insumo, { carregamento: "Salvando o insumo…" })),

  excluirInsumo: async (insumoId: string) => { await sysgrafix.delete(`/estoque/insumos/${insumoId}`, { carregamento: "Removendo o insumo…" }); },

  /**
   * Apaga um lançamento do extrato e DESFAZ o saldo dele.
   *
   * O servidor recusa movimento que veio de venda: aquele se desfaz
   * cancelando a nota, senão a mercadoria voltaria ao saldo sem tocar na
   * venda que a tirou. A tela esconde a lixeira nesses casos; a trava de
   * verdade é a de lá.
   */
  excluirMovimento: async (id: string) => { await sysgrafix.delete(`/estoque/movimentos/${id}`, { carregamento: "Apagando a movimentação…" }); },

  /* ── Extrato ──────────────────────────────────────────────────────────── */

  movimentos: async (produtoId: string, limite = 200): Promise<Movimento[]> =>
    lista<Movimento>(await sysgrafix.get(`/estoque/produtos/${produtoId}/movimentos`, { params: { limite } })),

  /**
   * Entrada, saída ou ajuste.
   *
   * ATENÇÃO ao significado de `quantidade`: em ENTRADA e SAIDA é o QUANTO
   * MUDOU; em AJUSTE é o SALDO FINAL contado na prateleira. A diferença é
   * calculada no banco de propósito — entre carregar a tela e clicar em
   * salvar, uma venda pode acontecer, e uma subtração feita aqui gravaria a
   * diferença errada.
   */
  movimentar: async (dados: {
    produtoId: string;
    variacaoId?: string | null;
    tipo: Extract<TipoMovimento, "ENTRADA" | "SAIDA" | "AJUSTE">;
    quantidade: number;
    motivo?: string;
    custoUnitario?: number | null;
  }) => primeiro<Movimento>(await sysgrafix.post("/estoque/movimentar", dados, { carregamento: "Lançando no estoque…" })),

  /* ── Disponibilidade ──────────────────────────────────────────────────── */

  /**
   * "Dá para vender isto?" — sem gravar nada.
   *
   * Conveniência do PDV, não a trava: entre esta resposta e o fechamento da
   * nota, outra venda pode acontecer. Quem barra de verdade é a gravação do
   * pedido, que responde 409 com a mesma lista.
   */
  disponibilidade: async (itens: { produtoId: string; variacaoId?: string | null; quantidade: number }[]): Promise<Indisponibilidade[]> =>
    lista<Indisponibilidade>(await sysgrafix.post("/estoque/disponibilidade", { itens })),
};

export default EstoqueService;
