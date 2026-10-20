import type ProductType from "@/shared/domain/produto";

/**
 * O CATÁLOGO DO BALCÃO, guardado no aparelho.
 *
 * ---------------------------------------------------------------------------
 * Por que existe
 * ---------------------------------------------------------------------------
 * Abrir a nota pedia a lista inteira de produtos ao servidor, e até ela chegar
 * a busca mostrava "procurando". Com internet ruim isso era a nota inteira
 * parada — justamente na hora em que o cliente está no balcão.
 *
 * Agora a nota abre com o catálogo guardado aqui e a busca FILTRA na hora,
 * sem esperar nada; a lista do servidor chega por baixo e atualiza o guardado.
 *
 * ---------------------------------------------------------------------------
 * O que é guardado — e o que não é
 * ---------------------------------------------------------------------------
 * Só texto curto: id, nome, preço e o mínimo que a busca precisa para decidir
 * se o item pode entrar na nota (saldo, se controla estoque, se tem
 * variações). Nada de imagem, descrição ou custo. E no máximo `LIMITE` itens,
 * escolhidos pelo USO: os que mais saem no balcão primeiro — a média de uso
 * esquece devagar o que parou de vender (ver `registrarUso`).
 */

/** Teto de itens guardados — o suficiente para o balcão, leve para o aparelho. */
const LIMITE = 400;
/** Teto do placar de uso — os que menos saem são esquecidos primeiro. */
const LIMITE_USO = 1_000;

const CHAVE_CATALOGO = "codeex-flow:cache:catalogo:v1";
const CHAVE_USO = "codeex-flow:cache:catalogo-uso:v1";

/** Os campos que a busca do balcão usa. Nenhum a mais. */
type ItemGuardado = Pick<
  ProductType,
  "id" | "nome" | "valorVenda" | "quantidade" | "tipo" | "sku" | "codigoBarras" | "unidade" | "estoqueMinimo" | "controlaEstoque" | "permiteVendaSemEstoque" | "usaVariacoes"
>;

const ler = <T>(chave: string, padrao: T): T => {
  try {
    const v = localStorage.getItem(chave);
    return v ? (JSON.parse(v) as T) : padrao;
  } catch {
    return padrao;
  }
};

const gravar = (chave: string, valor: unknown) => {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* Armazenamento cheio ou bloqueado: a busca segue com a lista do servidor. */
  }
};

/** Placar de uso: id → pontuação. */
let uso: Record<string, number> = ler(CHAVE_USO, {});

/** A pontuação de uso de um produto — para ordenar a busca pelo que mais sai. */
export const pontosDeUso = (id: string): number => uso[String(id)] ?? 0;

let gravacaoDoUso: ReturnType<typeof setTimeout> | null = null;

/**
 * Um produto entrou na nota.
 *
 * É uma média que ESQUECE: a cada uso, todo o placar encolhe um pouco (×0,98)
 * e o produto usado ganha um ponto. O que vendia muito no ano passado e parou
 * vai descendo sozinho; o que começou a sair esta semana sobe rápido. O placar
 * é gravado um segundo depois do último uso, para uma nota de dez itens não
 * virar dez gravações.
 */
export const registrarUso = (id: string) => {
  const chave = String(id);

  for (const k of Object.keys(uso)) uso[k] *= 0.98;
  uso[chave] = (uso[chave] ?? 0) + 1;

  /* O placar não cresce para sempre: passou do teto, os menores saem. */
  const chaves = Object.keys(uso);

  if (chaves.length > LIMITE_USO) {
    uso = Object.fromEntries(chaves.sort((a, b) => uso[b] - uso[a]).slice(0, LIMITE_USO).map((k) => [k, uso[k]]));
  }

  if (gravacaoDoUso) clearTimeout(gravacaoDoUso);
  gravacaoDoUso = setTimeout(() => gravar(CHAVE_USO, uso), 1_000);
};

/** O catálogo guardado, pronto para a busca — vazio na primeira vez. */
export const catalogoGuardado = (): ProductType[] => ler<ItemGuardado[]>(CHAVE_CATALOGO, []) as ProductType[];

/**
 * Guarda a lista que chegou do servidor — enxuta e limitada.
 *
 * Os mais usados entram primeiro; o resto completa até o `LIMITE`, na ordem
 * em que o servidor mandou. Insumo nunca entra: não se vende no balcão.
 */
export const guardarCatalogo = (produtos: ProductType[]) => {
  const enxutos: ItemGuardado[] = produtos
    .filter((p) => p.tipo !== "INSUMO")
    .map((p, i) => ({ p, i }))
    .sort((a, b) => pontosDeUso(b.p.id) - pontosDeUso(a.p.id) || a.i - b.i)
    .slice(0, LIMITE)
    .map(({ p }) => ({
      id: p.id,
      nome: p.nome,
      valorVenda: Number(p.valorVenda) || 0,
      quantidade: p.quantidade,
      tipo: p.tipo,
      sku: p.sku,
      codigoBarras: p.codigoBarras,
      unidade: p.unidade,
      estoqueMinimo: p.estoqueMinimo,
      controlaEstoque: p.controlaEstoque,
      permiteVendaSemEstoque: p.permiteVendaSemEstoque,
      usaVariacoes: p.usaVariacoes,
    }));

  gravar(CHAVE_CATALOGO, enxutos);
};
