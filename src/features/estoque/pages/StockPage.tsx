import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Tags, PackagePlus, Package, AlertTriangle, RotateCw,
  Infinity as InfinityIcon, Layers, Wrench, ListFilter, Tag, Bookmark, FolderTree,
  Blocks, LayoutDashboard,
} from "lucide-react";

import ProductType, { nivelEstoque, SEM_CATEGORIA, TIPO_ITEM, tipoDoItem, type NivelEstoque, type TipoItem } from "@/shared/domain/produto";
import type { Categoria } from "@/shared/domain/estoque";
import ProductService from "@/features/estoque/services/product.service";
import EstoqueService from "@/features/estoque/services/estoque.service";
import { ProdutoForm } from "@/features/estoque/components/ProdutoForm";
import CategoriasPainel from "@/features/estoque/components/CategoriasPainel";
import { ProductFormData } from "@/features/estoque/schema/product.schema";
import { AbasTabela } from "@/shared/ui/AbasTabela";
import EstoqueVisaoGeral from "@/features/estoque/components/EstoqueVisaoGeral";
import { Modal } from "@/shared/ui/Modal";
import Select from "@/shared/ui/Select";
import BuscaSugestoes from "@/shared/ui/BuscaSugestoes";
import { PageScreen } from "@/shared/ui/PageShell";
import { BarraFiltros, ListaCabecalho, ListaFantasmas, ListaLinha, TabelaPaginacao } from "@/shared/ui/DataTable";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import { formatNumber, EMPTY } from "@/shared/utils/format";
import { formatCurrency as brl } from "@/shared/utils/currency";
import { SkeletonTableRows, SkeletonIdentityCell } from "@/shared/ui/skeleton";
import { useAutoPageSize, ROW_HEIGHT } from "@/shared/hooks/useAutoPageSize";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import useSincronizacao from "@/shared/realtime/useSincronizacao";

type ModalType = "registrar" | "categorias" | null;

/**
 * O valor do filtro que junta os produtos sem categoria.
 *
 * Não pode ser `""`: o `Select` casa a opção marcada pelo `valor`, e vazio
 * também é o que sobra quando nada casa — as duas situações ficariam
 * indistinguíveis. E não pode ser um id, porque a ausência não tem id. O
 * prefixo `__` deixa claro que é um marcador da tela e não um dado do banco.
 */
const FILTRO_SEM_CATEGORIA = "__sem__";

/**
 * O verde do botão "Nova categoria" — em `style`, e não em classe do Tailwind.
 *
 * ---------------------------------------------------------------------------
 * Por que não é uma cor do `tailwind.config.js`
 * ---------------------------------------------------------------------------
 * Já foi, e quebrou. Cor declarada no config só existe depois que o Tailwind
 * relê o arquivo — e o config é justamente a parte que o servidor de
 * desenvolvimento NÃO recarrega sozinho. O resultado é o pior tipo de defeito:
 * o texto do botão atualiza na hora (o `.tsx` recarrega), as classes de cor
 * não existem, e o botão fica com fundo transparente e texto branco em cima do
 * cartão claro — ou seja, invisível. Quem está olhando a tela vê o botão
 * "sumir" sem nenhum erro em lugar nenhum.
 *
 * Aqui a cor não depende de build nenhum: são duas propriedades CSS escritas
 * direto no elemento.
 *
 * ---------------------------------------------------------------------------
 * Por que os valores aparecem duas vezes
 * ---------------------------------------------------------------------------
 * O que vale é a variável de `index.css`, que muda entre tema claro e escuro.
 * O número depois da vírgula é o FALLBACK do `var()`: se por qualquer motivo a
 * variável não estiver carregada, o botão continua verde em vez de sumir.
 * Repetir o valor é barato; um botão invisível não é.
 */
const VERDE = "var(--acao-2, 10 122 79)";
const VERDE_CLARO = "var(--acao-2-soft, 12 132 86)";

const ESTILO_ACAO_2 = {
  backgroundImage: `linear-gradient(to bottom right, rgb(${VERDE_CLARO}), rgb(${VERDE}))`,
  /* O mesmo brilho do botão primário, nesta cor: sem ele o botão fica
     visivelmente mais "chapado" que o vizinho e os dois deixam de parecer o
     mesmo tipo de coisa. */
  boxShadow: `0 0 0 1px rgb(${VERDE} / 0.25), 0 8px 32px -8px rgb(${VERDE} / 0.45)`,
};

/** O que se conta: produto de prateleira, serviço prestado ou insumo. */
type Tipo = "catalogo" | TipoItem;

/**
 * O filtro de tipo, e por que o primeiro item não se chama "Tudo".
 *
 * "Catálogo" é PRODUTO + SERVIÇO — o que a empresa vende. Insumo fica de
 * fora dele de propósito: material de produção no meio das camisetas faz a
 * lista mentir sobre o que há para vender, faz "132 itens" contar rolo de
 * tecido junto com peça pronta e faz "valor do estoque" somar duas vezes o
 * mesmo dinheiro (o do material e o da peça feita com ele).
 *
 * Chamar isso de "Tudo" seria pior do que o problema: um filtro que promete
 * tudo e esconde uma parte é um filtro em que ninguém confia depois da
 * primeira vez que descobre. Insumo tem a opção dele, ao lado.
 */
const TIPOS: { value: Tipo; label: string; icone: typeof Package }[] = [
  { value: "catalogo", label: "Catálogo", icone: Layers },
  { value: "PRODUTO", label: TIPO_ITEM.PRODUTO.plural, icone: Package },
  { value: "SERVICO", label: TIPO_ITEM.SERVICO.plural, icone: Wrench },
  { value: "INSUMO", label: TIPO_ITEM.INSUMO.plural, icone: Blocks },
];

type Situacao = "todos" | NivelEstoque;

const SITUACOES: { value: Situacao; label: string }[] = [
  { value: "todos", label: "Todas" },
  { value: "disponivel", label: "Em estoque" },
  { value: "baixo", label: "Estoque baixo" },
  { value: "esgotado", label: "Esgotado" },
  { value: "ilimitado", label: "Sem controle" },
];

/*
 * Colunas.
 *
 * A tabela passou a ocupar a largura inteira (a coluna lateral saiu), e o vão
 * fixo que antes segurava a borda direita virou desperdício: sobrava um
 * deserto no meio da linha. No lugar dele entra "Categoria" — que é o campo
 * pelo qual a lista passa a ser filtrada, e uma coluna que se pode filtrar mas
 * não se pode ver é uma meia funcionalidade.
 */
const COLS = "grid-cols-[minmax(220px,1fr)_132px_110px_110px_92px_132px]";
/** Soma das colunas fixas + folga para a flexível: abaixo disso a tabela rola. */
const TABLE_MIN_WIDTH = 840;

/**
 * Os rótulos das colunas, em UMA lista.
 *
 * Servem ao cabeçalho do desktop e ao cartão do celular (ver `ListaLinha`).
 * Escritos duas vezes, o cartão diria "Preço" onde a tabela diz "Venda" no dia
 * em que alguém renomeasse um dos dois — e essa divergência entre desktop e
 * celular é exatamente o que esta tela deixou de ter.
 */
const ROTULOS = ["Item", "Categoria", "Custo", "Venda", "Qtd.", "Estoque"];

/**
 * O nível do estoque vem de `shared/domain/produto`.
 *
 * A regra estava aqui, com o limite de 5 fixo — igual para parafuso e para
 * geladeira — e repetida em outras três telas. Agora o limite é do produto
 * (`estoqueMinimo`), e item que não conta unidades (serviço, encomenda) tem
 * nível próprio: antes ele caía em "esgotado" porque a quantidade era zero, e
 * a lista pintava todo serviço de vermelho como se fosse problema.
 */
const stockLevel = (produto: ProductType): NivelEstoque => nivelEstoque(produto);

function StockBadge({ produto }: { produto: ProductType }) {
  const level = stockLevel(produto);

  if (level === "ilimitado")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-fg/[0.12] bg-fg/[0.05] px-2.5 py-1 text-[11px] text-mist">
        <InfinityIcon className="h-3 w-3" /> Sem controle
      </span>
    );

  if (level === "esgotado")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/40 bg-danger/20 px-2.5 py-1 text-[11px] text-danger">
        <span className="h-1.5 w-1.5 rounded-full bg-danger" /> Esgotado
      </span>
    );
  if (level === "baixo")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/50 bg-warning/20 px-2.5 py-1 text-[11px] text-warning">
        <span className="h-1.5 w-1.5 rounded-full bg-warning" /> Baixo
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/20 px-2.5 py-1 text-[11px] text-success">
      <span className="h-1.5 w-1.5 rounded-full bg-success" /> Em estoque
    </span>
  );
}

/**
 * A categoria do produto, na linha da lista.
 *
 * Quem não tem categoria mostra "Sem categoria" e não "—". O traço lê-se como
 * "não sei" ou "campo quebrado"; "Sem categoria" é uma resposta — e o filtro
 * ao lado tem uma opção com esse mesmo nome, o que transforma a linha numa
 * pista de para onde ir arrumar.
 *
 * A bolinha usa a cor cadastrada da categoria. Ela existe para o olho pular a
 * leitura numa lista de trinta linhas; quem nunca escolheu cor fica com o tom
 * neutro do tema, que não compete com os selos de estoque à direita.
 */
const CategoriaTag = ({ nome, cor }: { nome?: string | null; cor?: string | null }) => {
  if (!nome) return <span className="truncate text-[12px] text-faint">{SEM_CATEGORIA}</span>;

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-fg/30"
        style={cor ? { background: cor } : undefined}
      />
      <span className="truncate text-[12px] text-mist">{nome}</span>
    </span>
  );
};

const SkeletonRows = ({ count }: { count: number }) => (
  <SkeletonTableRows count={count} cols={COLS} rowHeight={ROW_HEIGHT}>
    <SkeletonIdentityCell />
    <div className="h-3 w-20 rounded bg-fg/[0.05]" />
    <div className="ml-auto h-3 w-16 rounded bg-fg/[0.05]" />
    <div className="ml-auto h-3 w-16 rounded bg-fg/[0.05]" />
    <div className="ml-auto h-3 w-10 rounded bg-fg/[0.05]" />
    <div className="ml-auto h-5 w-20 rounded-full bg-fg/[0.05]" />
  </SkeletonTableRows>
);

/* -------------------------------------------------------------------------- */
/* Tela                                                                       */
/* -------------------------------------------------------------------------- */

const Estoque = () => {
  const alert = useAlert();
  const navigate = useNavigate();

  const [products, setProducts] = useState<ProductType[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [tipo, setTipo] = useState<Tipo>("catalogo");
  const [situacao, setSituacao] = useState<Situacao>("todos");
  const [categoria, setCategoria] = useState("todas");
  const [marca, setMarca] = useState("todas");
  const [page, setPage] = useState(1);

  const [modal, setModal] = useState<ModalType>(null);
  const fechar = () => setModal(null);

  /*
   * Duas abas no cartão, como em Vendas: a VISÃO GERAL (os números e os
   * gráficos do estoque) e a lista de ITENS. Os números moravam numa faixa
   * acima da tabela e roubavam altura dela o tempo todo; numa aba, quem quer
   * a lista tem a tela inteira, e quem quer o panorama ganha espaço para mais
   * do que quatro cartões.
   */
  const [aba, setAba] = useState<"visao-geral" | "itens">("itens");

  const { bodyRef, perPage } = useAutoPageSize<HTMLDivElement>();

  /**
   * Produtos e categorias, juntos.
   *
   * As duas listas vão em paralelo porque não dependem uma da outra, e a de
   * categorias vem da API em vez de sair dos produtos: categoria virou
   * cadastro (migration 045), então uma recém-criada e ainda vazia precisa
   * aparecer no seletor do formulário — que é justamente quando ela serve
   * para alguma coisa.
   */
  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, lista] = await Promise.all([ProductService.getAll(), EstoqueService.categorias()]);
      const produtos = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);

      setProducts(produtos as ProductType[]);
      setCategorias(lista);
    } catch {
      setError("Não foi possível carregar os produtos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  /* Produto criado no PDV ou por outro operador entra na lista sozinho — e a
     baixa de estoque de uma venda também. */
  useSincronizacao(["produtos", "pedidos"], load);

  /*
   * Criar NÃO fecha o modal.
   *
   * Cadastro de estoque acontece em série — chegou nota, são trinta itens de
   * uma vez. Fechar a cada salvamento obrigava a procurar o botão e reabrir a
   * tela por item. O formulário se limpa sozinho (`resetarAoSalvar`) e o
   * cursor volta para o nome; quem terminou fecha pelo Cancelar ou pelo X.
   */
  /*
   * Otimista: o formulário não espera o servidor — o aviso sai e ele já fica
   * limpo para o próximo; o cadastro corre por baixo e a lista se atualiza
   * quando ele volta. Recusado, o aviso de erro diz qual e por quê.
   */
  const handleCreateProduct = (data: ProductFormData) => {
    setError(null);
    alert.success(`${TIPO_ITEM[data.tipo].singular} cadastrado!`, "Já pode cadastrar o próximo.");

    void (async () => {
      try {
        await ProductService.create(data);
        await load();
      } catch (err) {
        alert.error(getErrorTitle(err), extractErrorMessage(err, `Não foi possível cadastrar “${data.nome}”.`));
      }
    })();
  };

  /*
   * Editar e excluir não moram aqui.
   *
   * Os dois estão na ficha do produto (`/estoque/:id`), que é para onde a linha
   * leva. Mantê-los também nesta tela significaria dois lugares capazes de
   * alterar o mesmo produto, com dois conjuntos de campos que divergem no
   * primeiro campo novo — foi o que aconteceu quando a ficha ganhou SKU,
   * unidade e as regras de estoque.
   */

  /*
   * As opções de MARCA saem do que está cadastrado nos produtos.
   *
   * Marca continua sendo texto livre no produto, então não há de onde tirar a
   * lista senão do que foi digitado. Um select com opções que não existem em
   * nenhum produto só produz resultado vazio — e quem filtra por ele conclui
   * que a busca está quebrada.
   *
   * Categoria não segue mais essa regra: ela virou cadastro próprio (ver
   * `load`), e é por isso que uma categoria vazia aparece no filtro — mostrar
   * "Bebidas 0" é a única forma de a pessoa descobrir que criou a gaveta e
   * ainda não pôs nada nela.
   */
  const marcas = useMemo(
    () => [...new Set(products.map((p) => p.marca?.trim()).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b)),
    [products],
  );

  /**
   * A regra de filtragem, como função pura.
   *
   * Escrita assim, e não embutida num `useMemo`, porque ela é usada duas vezes
   * com propósitos diferentes: para montar a lista e para CONTAR quantos itens
   * cada opção do filtro deixaria passar. O número ao lado de "Esgotado" só é
   * confiável se sair exatamente da mesma regra que a lista aplica — duas
   * cópias divergem no primeiro campo novo, e aí o filtro promete três itens e
   * entrega dois.
   */
  const passa = (p: ProductType, f: { tipo: Tipo; situacao: Situacao; categoria: string; marca: string; q: string }) => {
    /* "Catálogo" é tudo MENOS insumo — ver a nota de `TIPOS`. O item sem
       tipo é produto: cadastro anterior à migration 017 não gravava a coluna. */
    const tipoItem = tipoDoItem(p);

    if (f.tipo === "catalogo" ? tipoItem === "INSUMO" : tipoItem !== f.tipo) return false;
    if (f.situacao !== "todos" && stockLevel(p) !== f.situacao) return false;

    /* Categoria casa por ID, não por nome: dois produtos podem mostrar o mesmo
       texto ("Bebidas") por um instante depois de um rename, enquanto a lista
       ainda não recarregou, e o id não tem esse intervalo. */
    if (f.categoria === FILTRO_SEM_CATEGORIA) {
      if (p.categoriaId) return false;
    } else if (f.categoria !== "todas" && p.categoriaId !== f.categoria) {
      return false;
    }

    if (f.marca !== "todas" && (p.marca?.trim() ?? "") !== f.marca) return false;
    if (!f.q) return true;

    return (
      Boolean(p.nome?.toLowerCase().includes(f.q)) ||
      Boolean(p.descricao?.toLowerCase().includes(f.q)) ||
      Boolean(p.sku?.toLowerCase().includes(f.q)) ||
      p.codigoBarras?.toLowerCase() === f.q ||
      String(p.id ?? "").includes(f.q) ||
      p.tamanho?.toLowerCase() === f.q
    );
  };

  const q = debouncedSearch.trim().toLowerCase();
  const atual = { tipo, situacao, categoria, marca, q };

  const filtered = useMemo(
    () => products.filter((p) => passa(p, atual)),
    [products, tipo, situacao, categoria, marca, q],
  );

  /**
   * Quantos itens cada opção deixaria passar.
   *
   * Contado com os OUTROS filtros aplicados e o próprio suspenso — que é o que
   * torna o número útil: dentro de "Produtos", "Esgotado 3" quer dizer três
   * produtos esgotados, não três itens esgotados na loja inteira. Contando com
   * o próprio filtro junto, toda opção não escolhida marcaria zero.
   */
  const contar = (mudanca: Partial<typeof atual>) => products.filter((p) => passa(p, { ...atual, ...mudanca })).length;

  const opcoesTipo = useMemo(
    () => TIPOS.map((t) => ({ valor: t.value, label: t.label, contagem: contar({ tipo: t.value }) })),
    [products, tipo, situacao, categoria, marca, q],
  );

  const opcoesSituacao = useMemo(
    () => SITUACOES.map((o) => ({
      valor: o.value,
      label: o.label,
      contagem: contar({ situacao: o.value }),
      /* O ponto vermelho só acende quando há mesmo item esgotado. Um alerta
         permanentemente aceso deixa de ser alerta em uma semana. */
      alerta: o.value === "esgotado" && contar({ situacao: "esgotado" }) > 0,
    })),
    [products, tipo, situacao, categoria, marca, q],
  );

  /*
   * "Sem categoria" fecha a lista, e não é um detalhe de ordenação.
   *
   * É a opção que responde "o que ainda falta organizar?" — a pergunta que
   * leva alguém a abrir este filtro logo depois de criar as categorias. Sem
   * ela, os produtos em branco só apareceriam em "Qualquer categoria", ou
   * seja, misturados com todo o resto.
   */
  const opcoesCategoria = useMemo(
    () => [
      { valor: "todas", label: "Todas", contagem: contar({ categoria: "todas" }) },
      ...categorias.map((c) => ({ valor: c.id, label: c.nome, contagem: contar({ categoria: c.id }) })),
      { valor: FILTRO_SEM_CATEGORIA, label: SEM_CATEGORIA, contagem: contar({ categoria: FILTRO_SEM_CATEGORIA }) },
    ],
    [products, categorias, tipo, situacao, categoria, marca, q],
  );

  const opcoesMarca = useMemo(
    () => [
      { valor: "todas", label: "Qualquer marca", contagem: contar({ marca: "todas" }) },
      ...marcas.map((m) => ({ valor: m, label: m, contagem: contar({ marca: m }) })),
    ],
    [products, marcas, tipo, situacao, categoria, marca, q],
  );

  /**
   * As sugestões da busca.
   *
   * Saem da lista JÁ FILTRADA: sugerir um item que os filtros escondem levaria
   * a pessoa a uma ficha que ela não consegue achar de volta na tabela. Quem
   * casa o texto com o rótulo é o próprio `BuscaSugestoes`.
   */
  const sugestoes = useMemo(
    () => filtered.map((p) => ({
      id: String(p.id),
      label: p.nome,
      sub: stockLevel(p) === "ilimitado" ? "—" : `${formatNumber(Number(p.quantidade) || 0)} un.`,
    })),
    [filtered],
  );

  /*
   * O que a visão geral olha: o TIPO escolhido (catálogo, produtos, serviços,
   * insumos) e nenhum outro filtro — busca, situação, categoria e marca
   * recortam a lista, e um panorama que mudasse a cada letra digitada deixaria
   * de ser panorama.
   */
  const itensDoTipo = useMemo(
    () => products.filter((p) => passa(p, { tipo, situacao: "todos", categoria: "todas", marca: "todas", q: "" })),
    [products, tipo],
  );

  /**
   * A categoria de cada produto, pelo id.
   *
   * A linha precisa da COR, e o produto só carrega o nome (o espelho que o
   * banco mantém). Um mapa resolve isso sem transformar cada linha da tabela
   * numa varredura da lista de categorias.
   */
  const categoriaPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);

  /* Conta sobre o catálogo INTEIRO, não sobre o filtrado: é o número que o
     painel de categorias mostra ao lado de "Sem categoria", e ele descreve o
     estoque — não o recorte que a pessoa está olhando agora. */
  const semCategoria = useMemo(() => products.filter((p) => !p.categoriaId).length, [products]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageItems = filtered.slice((page - 1) * perPage, page * perPage);
  const emptySlots = Math.max(0, perPage - pageItems.length);

  /*
   * Categoria excluída não pode deixar o filtro apontando para o vazio.
   *
   * Sem isto, apagar a categoria que está filtrando deixa o seletor sem
   * rótulo (nenhuma opção casa com o valor) e a tabela com zero linhas — um
   * beco sem saída em que a única pista é o "Limpar filtros" do estado vazio,
   * que não parece ter relação com o que acabou de acontecer.
   */
  useEffect(() => {
    if (categoria === "todas" || categoria === FILTRO_SEM_CATEGORIA) return;
    if (!categorias.some((c) => c.id === categoria)) setCategoria("todas");
  }, [categorias, categoria]);

  useEffect(() => setPage(1), [debouncedSearch, tipo, situacao, categoria, marca]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const hasFilters = Boolean(search) || tipo !== "catalogo" || situacao !== "todos" || categoria !== "todas" || marca !== "todas";

  const limparFiltros = () => {
    setSearch("");
    setTipo("catalogo");
    setSituacao("todos");
    setCategoria("todas");
    setMarca("todas");
  };

  /* O mesmo formulário serve as duas versões — o que muda é a moldura. */
  const modais = (
    <>
      {/* `maxWidth` acima do `lg` padrão (672px): as abas de estoque e
          organização têm linhas de três colunas, e em 672px elas se espremem a
          ponto de "Avisar abaixo de" caber em duas letras. Em 768px cabem três
          colunas de verdade. Mesma largura da ficha do cliente, pelo mesmo
          motivo. */}
      <Modal open={modal === "registrar"} onClose={fechar} title="Novo item" subtitle="Só o nome é obrigatório" size="lg" maxWidth="sm:max-w-3xl">
        <ProdutoForm submitText="Cadastrar" onCancel={fechar} onSubmit={handleCreateProduct} resetarAoSalvar categorias={categorias} />
      </Modal>

      {/* As categorias valem para a loja inteira, e é por isso que elas se
          editam AQUI e não dentro da ficha de um produto: mexer numa gaveta a
          partir de um item dentro dela sugere que o efeito é só daquele item. */}
      <Modal
        open={modal === "categorias"}
        onClose={fechar}
        title="Categorias"
        subtitle="As gavetas do seu catálogo — valem para todos os produtos"
        size="lg"
      >
        <CategoriasPainel categorias={categorias} semCategoria={semCategoria} onMudou={load} />
      </Modal>
    </>
  );

  return (
    <PageScreen
      icon={<Tags className="h-5 w-5" />}
      title="Estoque e serviços"
      subtitle="O que você vende, quanto tem e quanto vale"
    >
      {error && (
        <div className="flex shrink-0 items-center justify-between gap-2.5 rounded-xl border border-danger/40 bg-danger/15 px-4 py-3 text-[13px] text-danger">
          <span className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </span>
          <button onClick={load} className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-danger/30 px-2.5 py-1 text-[12px] text-danger transition-colors hover:bg-danger/10">
            <RotateCw className="h-3.5 w-3.5" /> Tentar novamente
          </button>
        </div>
      )}

      {/* ---------- Lista ---------- */}
      <section className="card glass-sheen flex min-h-[460px] min-w-0 flex-col overflow-hidden rounded-lg sm:min-h-[260px] sm:flex-1">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2.5 border-b border-fg/[0.06] px-4 py-3">
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
            {/* Visão geral primeiro e sem contagem, como em Vendas: é a leitura
                de cima, não mais uma lista com N itens. */}
            <AbasTabela
              grupo="abas-estoque"
              valor={aba}
              onValor={setAba}
              abas={[
                { id: "visao-geral", label: "Visão geral", icone: <LayoutDashboard size={13} /> },
                { id: "itens", label: tipo === "catalogo" ? "Itens" : TIPO_ITEM[tipo].plural, icone: <Package size={13} />, contagem: filtered.length },
              ]}
            />
          </div>

          {/*
           * Em cima ficam só as duas portas de CRIAR.
           *
           * Criar e filtrar são movimentos opostos — um acrescenta ao
           * catálogo, o outro esconde parte dele — e estavam na mesma fileira,
           * sete controles de ponta a ponta, com os dois botões coloridos no
           * fim de uma fila de caixas cinzas. Os filtros desceram para junto
           * da tabela que eles governam (ver a barra logo abaixo); aqui ficam
           * o título, a contagem e as duas ações.
           */}
          <div className="flex shrink-0 items-center gap-2">
            {/*
             * Dois botões de mesmo peso, separados pela COR.
             *
             * São as duas maneiras de acrescentar coisa ao catálogo — um item
             * ou uma gaveta para os itens —, e é por isso que têm o mesmo
             * recorte, altura e brilho. O que os distingue é a cor, não o
             * tamanho: dar menos peso a um deles diria que criar categoria é
             * uma configuração escondida, quando é a primeira coisa a fazer
             * num estoque que ainda não está organizado.
             *
             * A cor sai de `--acao-2`, um token FIXO, e não de `--accent`: o
             * acento é escolhido pela empresa (nove opções), então derivar
             * daqui a segunda cor faria as duas mudarem de hue juntas — e os
             * botões voltariam a ser iguais.
             */}
            <button
              type="button"
              onClick={() => setModal("categorias")}
              title="Criar, renomear e excluir as categorias do catálogo"
              style={ESTILO_ACAO_2}
              className="focus-ring inline-flex h-[38px] shrink-0 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-[12.5px] text-white transition-all hover:brightness-110 active:scale-[0.98]"
            >
              <FolderTree className="h-3.5 w-3.5" />
              Nova Categoria
            </button>

            <button
              type="button"
              onClick={() => setModal("registrar")}
              className="focus-ring inline-flex h-[38px] shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-gradient-to-br from-accent-soft to-accent px-3 text-[12.5px] text-white shadow-glow transition-all hover:brightness-110 active:scale-[0.98]"
            >
              <PackagePlus className="h-3.5 w-3.5" />
              Novo item
            </button>
          </div>
        </div>

        <BarraFiltros pagina={{ label: "Estoque", icon: <Tags className="h-3.5 w-3.5" /> }}>
          {/*
           * A sugestão ABRE a ficha; ela não filtra a tabela.
           *
           * Filtrar já é o que o próprio texto faz enquanto se digita — a
           * tabela reage sozinha. O que a lista acrescenta é o atalho para
           * quem já sabe qual item quer e não quer procurá-lo na página
           * certa da tabela depois.
           */}
          {aba === "itens" && (
          <BuscaSugestoes
            valor={search}
            onValor={setSearch}
            sugestoes={sugestoes}
            onEscolher={(s) => navigate(`/estoque/${s.id}`)}
            placeholder="Buscar item…"
            aria-label="Buscar item por nome, SKU ou código de barras"
            className="w-[210px] shrink-0"
          />
          )}

          <Select
            valor={tipo}
            onChange={(v) => setTipo(v as Tipo)}
            opcoes={opcoesTipo}
            icone={<Layers size={14} />}
            aria-label="Filtrar entre produtos e serviços"
            className="w-[150px] shrink-0"
          />

          {aba === "itens" && (
          <>
          <Select
            valor={situacao}
            onChange={(v) => setSituacao(v as Situacao)}
            opcoes={opcoesSituacao}
            icone={<ListFilter size={14} />}
            aria-label="Filtrar por situação do estoque"
            className="w-[168px] shrink-0"
          />

          {/*
           * O filtro de categoria fica SEMPRE, ao contrário do de marca.
           *
           * Marca só existe se alguém digitou uma; categoria é cadastro, e
           * a lista sempre tem ao menos "Sem categoria" — que é a opção
           * mais útil das duas primeiras semanas de uso, porque é ela que
           * mostra o que ainda falta organizar. Escondê-lo enquanto não
           * houvesse categoria criada esconderia justamente de quem ainda
           * não começou.
           */}
          <Select
            valor={categoria}
            onChange={setCategoria}
            opcoes={opcoesCategoria}
            icone={<Tag size={14} />}
            aria-label="Filtrar por categoria"
            className="w-[168px] shrink-0"
          />

          {marcas.length > 0 && (
            <Select
              valor={marca}
              onChange={setMarca}
              opcoes={opcoesMarca}
              icone={<Bookmark size={14} />}
              aria-label="Filtrar por marca"
              className="w-[156px] shrink-0"
            />
          )}
          </>
          )}
        </BarraFiltros>

        {/* A visão geral ocupa o corpo do cartão. A lista abaixo fica montada
            e só ESCONDIDA: quem calcula quantas linhas cabem na página mede o
            corpo dela uma vez, ao montar, e desmontar faria a paginação voltar
            com a conta errada. */}
        {aba === "visao-geral" && (
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <EstoqueVisaoGeral itens={itensDoTipo} categorias={categorias} rotulo={tipo === "catalogo" ? "Itens no catálogo" : TIPO_ITEM[tipo].plural} />
          </div>
        )}

        {/* Colunas + linhas rolam juntas na horizontal quando a tela é estreita. */}
        {/* A largura mínima é do DESKTOP: ela existe para as seis colunas não
            se esmagarem. No celular a linha virou cartão (ver `ListaLinha`), e
            forçar 840px ali daria rolagem horizontal num conteúdo que já cabe
            em pé. Por variável porque `style` não aceita breakpoint. */}
        <div className={`min-h-0 flex-1 flex-col sm:overflow-x-auto ${aba === "itens" ? "flex" : "hidden"}`}>
          <div
            className="flex min-h-0 flex-1 flex-col sm:[min-width:var(--tabela-min)]"
            style={{ "--tabela-min": `${TABLE_MIN_WIDTH}px` } as React.CSSProperties}
          >
            {/* Os rótulos saem de `ROTULOS`, a mesma lista que o cartão do
                celular usa. "Custo" e não "Compra": quem presta serviço não
                compra nada e mesmo assim tem custo — e mesmo na revenda o custo
                real inclui frete e imposto, não só a nota do fornecedor. */}
            <ListaCabecalho cols={COLS}>
              {ROTULOS.map((r, i) => (
                <p key={r} className={i >= 2 ? "text-right" : undefined}>{r}</p>
              ))}
            </ListaCabecalho>

            {/* Corpo: sem scroll — o que não cabe vai pra próxima página */}
            {/* `overflow-hidden` é do desktop, onde a página tem exatamente as
                linhas que couberem. No celular os cartões são mais altos que a
                linha medida, então o que sobra da página rola aqui dentro em
                vez de ser cortado. */}
            <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto sm:overflow-hidden">
              {loading ? (
                <SkeletonRows count={perPage} />
              ) : filtered.length === 0 ? (
                <div className="flex h-full items-center justify-center py-10">
                  <div className="flex max-w-xs flex-col items-center gap-3 text-center text-faint">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-fg/[0.06] bg-fg/[0.03]">
                      <Package className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-[13px] text-mist">
                        {tipo === "catalogo" ? "Nenhum item encontrado" : `Nenhum ${TIPO_ITEM[tipo].singular.toLowerCase()} encontrado`}
                      </p>
                      <p className="mt-0.5 text-[11px]">{hasFilters ? "Ajuste a busca ou os filtros." : "Comece cadastrando seu primeiro item."}</p>
                    </div>
                    {hasFilters ? (
                      <button onClick={limparFiltros} className="mt-1 cursor-pointer rounded-xl border border-fg/[0.1] px-3.5 py-2 text-[12px] text-mist transition-colors hover:text-ink">
                        Limpar filtros
                      </button>
                    ) : (
                      <button onClick={() => setModal("registrar")} className="mt-1 cursor-pointer rounded-xl bg-accent px-3.5 py-2 text-[12px] text-white transition-colors hover:bg-accent">
                        Cadastrar primeiro item
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {pageItems.map((product) => (
                    <ListaLinha
                      key={product.id}
                      cols={COLS}
                      altura={ROW_HEIGHT}
                      rotulos={ROTULOS}
                      /*
                       * A linha abre a FICHA, não um modal de edição.
                       *
                       * Com variações, insumos e extrato, "abrir o produto"
                       * deixou de caber numa caixa flutuante — e a edição dos
                       * campos básicos continua a um clique, pelo botão
                       * "Editar" da própria ficha.
                       */
                      onClick={() => navigate(`/estoque/${product.id}`)}
                      ariaLabel={`Abrir ${product.nome}`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-accent/25 bg-gradient-to-br from-accent/25 to-accent-soft/10">
                          {product.imagem ? <img src={product.imagem} alt={product.nome} className="h-full w-full object-cover" /> : <Package className="h-4 w-4 text-accent-soft" />}
                        </div>
                        <div className="flex min-w-0 flex-col">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-[13px] text-ink">{product.nome}</span>
                            {product.tamanho && (
                              <span className="shrink-0 rounded bg-fg/[0.07] px-1.5 py-px text-[10px] leading-[15px] text-mist">{product.tamanho}</span>
                            )}
                            {/* Selo de variações: sem ele, duas linhas com
                                números muito diferentes de estoque não explicam
                                por que uma é a soma de várias peças e a outra
                                não. */}
                            {product.usaVariacoes && (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded bg-fg/[0.07] px-1.5 py-px text-[10px] leading-[15px] text-mist">
                                <Layers className="h-2.5 w-2.5" /> variações
                              </span>
                            )}
                            {/* O selo só aparece no que NÃO é produto: numa
                                lista majoritariamente de produtos, marcar
                                todos com "produto" é ruído que esconde
                                justamente as duas linhas diferentes. */}
                            {tipoDoItem(product) !== "PRODUTO" && (
                              <span className="shrink-0 rounded bg-accent/[0.12] px-1.5 py-px text-[10px] leading-[15px] text-accent-soft">
                                {TIPO_ITEM[tipoDoItem(product)].singular.toLowerCase()}
                              </span>
                            )}
                          </span>
                          <span className="truncate text-[11px] text-faint">{product.sku || product.descricao || `#${product.id}`}</span>
                        </div>
                      </div>

                      <span className="flex min-w-0 items-center">
                        <CategoriaTag
                          nome={product.categoria}
                          cor={product.categoriaId ? categoriaPorId.get(product.categoriaId)?.cor : null}
                        />
                      </span>
                      <span className="text-right text-[12px] tabular-nums text-mist">{brl(product.valorCompra)}</span>
                      <span className="text-right text-[12px] tabular-nums text-ink">{brl(product.valorVenda)}</span>
                      <span className="text-right text-[12px] tabular-nums text-mist">
                        {stockLevel(product) === "ilimitado" ? EMPTY : formatNumber(Number(product.quantidade) || 0)}
                      </span>
                      <span className="flex justify-end">
                        <StockBadge produto={product} />
                      </span>
                    </ListaLinha>
                  ))}

                  <ListaFantasmas quantidade={emptySlots} altura={ROW_HEIGHT} />
                </>
              )}
            </div>
          </div>
        </div>

        {aba === "itens" && (
        <TabelaPaginacao
          pagina={page}
          totalPaginas={totalPages}
          onPagina={setPage}
          resumo={`${formatNumber(filtered.length)} ${filtered.length === 1 ? "item" : "itens"}`}
        />
        )}
      </section>

      {modais}
    </PageScreen>
  );
};

export default Estoque;
