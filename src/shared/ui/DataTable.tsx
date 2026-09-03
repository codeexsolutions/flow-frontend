import { Children } from "react";
import type { CSSProperties, ReactNode, Ref } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import Dica from "@/shared/ui/Dica";

export type Coluna<T> = {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
};

const MIN_TABLE_WIDTH = 720;

/**
 * A barra que fica ENTRE o cabeçalho do cartão e a tabela.
 *
 * ---------------------------------------------------------------------------
 * Por que ela desceu do cabeçalho
 * ---------------------------------------------------------------------------
 * Busca e filtros moravam na mesma fileira do título e dos botões de criar —
 * sete controles de ponta a ponta, e o que restringe a lista ficava a meia
 * tela de distância da linha que ele acabou de sumir. Aqui embaixo, o filtro
 * encosta na fileira de rótulos ("Custo", "Venda", "Qtd."): as duas coisas
 * falam das mesmas colunas — uma diz o que a coluna é, a outra decide quais
 * linhas entram — e o olho lê filtro e resultado num movimento só.
 *
 * ---------------------------------------------------------------------------
 * Navegação à esquerda, filtros à direita
 * ---------------------------------------------------------------------------
 * São coisas de naturezas diferentes e a barra as separa pelas duas pontas.
 * `navegacao` TROCA a lista (as abas "Vendas · Orçamentos", "Variações ·
 * Movimentações") e por isso vem primeiro, na margem onde a leitura começa;
 * os filtros restringem a lista que já está aberta e ficam na ponta oposta,
 * alinhados com os controles do cabeçalho acima. Misturados numa fileira só,
 * trocar de aba e filtrar viravam o mesmo gesto — e não são: um zera o que o
 * outro fez.
 *
 * A barra fica FORA do quadro que rola na horizontal: os controles cabem em
 * qualquer largura, e arrastá-los junto com as colunas faria a busca sair da
 * tela quando alguém rolasse a tabela.
 *
 * No celular a fileira inteira rola na horizontal em vez de quebrar linha —
 * são controles de largura fixa, e em 360px eles empilhariam em quatro
 * fileiras, tomando meia tela antes de a lista começar.
 */
export const BarraFiltros = ({ navegacao, pagina, children }: { navegacao?: ReactNode; pagina?: { label: string; icon?: ReactNode }; children?: ReactNode }) => (
  /*
   * No CELULAR a barra quebra em duas linhas; no computador continua uma.
   *
   * Rolando na horizontal, a busca — o controle mais usado dos cinco —
   * nascia cortada na borda direita ("Buscar vend…") e só aparecia inteira
   * depois de um arrasto que ninguém adivinha. Em duas linhas, a navegação
   * fica em cima e os filtros embaixo, cada um com a largura que tem; a
   * busca estica e os seletores dividem o resto.
   */
  <div className="flex max-w-full shrink-0 flex-col gap-2 border-b border-fg/[0.06] px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3">
    {navegacao ? (
      <div className="-mx-4 flex items-center gap-0.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:shrink-0 sm:overflow-visible sm:px-0">{navegacao}</div>
    ) : pagina ? (
      /*
       * Sem abas, o lugar da navegação recebe a PRÓPRIA PÁGINA.
       *
       * A lista que não se divide em duas ainda é uma lista de alguma coisa, e
       * a ponta esquerda da barra é onde o olho já aprendeu a procurar essa
       * resposta nas telas que têm aba. Deixá-la vazia faria os filtros
       * flutuarem sozinhos numa faixa sem começo — e o mesmo componente
       * pareceria dois, conforme a tela tivesse abas ou não.
       *
       * É uma aba única e por isso NÃO é botão: não há para onde ir.
       */
      <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-fg/[0.06] px-3 py-1.5 text-[12.5px] text-ink">
        {pagina.icon}
        {pagina.label}
      </span>
    ) : null}

    {/* `ml-auto` empurra os filtros para a direita mesmo sem navegação — sem
        ele, uma barra só de filtros começaria colada na margem esquerda e
        deixaria de estar alinhada com o botão de criar do cabeçalho. */}
    {/* No celular a fileira de filtros rola sozinha se não couber — são
        controles de largura fixa, e em 360px quatro deles empilhariam em
        quatro fileiras. A busca cresce para ocupar a sobra. */}
    <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:ml-auto sm:shrink-0 sm:flex-wrap sm:justify-end sm:overflow-visible sm:px-0 sm:pb-0">{children}</div>
  </div>
);

export const TabelaCard = ({
  title,
  icon,
  count,
  countLabel,
  onAdd,
  addLabel = "Adicionar",
  acoes,
  navegacao,
  pagina,
  controles,
  filters,
  children,
  footer,
  bodyRef,
  minWidth = MIN_TABLE_WIDTH,
  corpoLivre = false,
}: {
  title: string;
  icon?: ReactNode;
  count?: number;
  countLabel?: string;
  onAdd?: () => void;
  addLabel?: string;
  /**
   * Ações próprias do cabeçalho, quando `onAdd` não dá conta — duas portas de
   * criar, por exemplo. Ficam à direita, no lugar do botão padrão.
   */
  acoes?: ReactNode;
  /**
   * Abas que TROCAM a lista. Vão para a ponta esquerda da `BarraFiltros`.
   *
   * Separadas dos filtros de propósito: trocar de aba e filtrar não são o
   * mesmo gesto — um zera o que o outro fez.
   */
  navegacao?: ReactNode;
  /** Sem `navegacao`, é o nome da própria página que ocupa a ponta esquerda. */
  pagina?: { label: string; icon?: ReactNode };
  /**
   * Busca e filtros da lista — um grupo só, na `BarraFiltros` logo abaixo do
   * cabeçalho, encostado na tabela que eles restringem.
   *
   * Juntos porque as três coisas fazem o mesmo trabalho (restringir a lista) e
   * separá-las pelas duas pontas obrigava o olho a atravessar a barra para
   * montar um filtro só. Fora do cabeçalho porque o título é o que a lista É e
   * o botão de criar é o que se acrescenta a ela; o filtro fala das colunas, e
   * é ao lado delas que ele pertence — ver a nota da `BarraFiltros`.
   */
  controles?: ReactNode;
  /** Mais filtros, à direita dos `controles` na mesma barra. */
  filters?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * Referência do corpo rolável.
   *
   * Serve ao `useAutoPageSize`: é a altura DESTE elemento que decide quantas
   * linhas cabem na página.
   */
  bodyRef?: Ref<HTMLDivElement>;
  minWidth?: number;
  /**
   * O corpo tem a altura do CONTEÚDO no celular, em vez de rolar por dentro.
   *
   * O padrão (`false`) é o certo para lista paginada: o corpo é uma janela de
   * altura fixa e a paginação existe justamente para o que não cabe nela.
   *
   * Aba que mostra um bloco alto e não paginável — o panorama de vendas, com
   * seus painéis empilhados — precisa do contrário no telefone: presa aos
   * 460px do piso do cartão, ela vira um visor rolando dentro de uma página
   * que também rola, e o polegar nunca sabe qual das duas vai se mexer. No
   * computador nada muda: lá o cartão ocupa a janela de propósito.
   */
  corpoLivre?: boolean;
}) => (
  /*
   * No celular a tabela tem ALTURA PRÓPRIA; no computador ela estica.
   *
   * O cartão foi desenhado para ocupar o que sobra da janela — é assim que a
   * paginação sabe quantas linhas cabem. Numa página que rola (que é o que o
   * telefone tem), `flex-1` não estica nada: encolhe até o conteúdo mais
   * curto, e a lista aparecia com uma linha e meia, com o rodapé por cima
   * dela. 460px são ~7 linhas — uma tela de trabalho de verdade.
   */
  <section className={`card glass-sheen flex min-w-0 flex-col overflow-hidden sm:min-h-[220px] sm:flex-1 ${corpoLivre ? "min-h-0" : "min-h-[460px]"}`}>
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2.5 border-b border-fg/[0.07] px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
        {icon && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/[0.14] text-accent-soft ring-1 ring-inset ring-accent/20">{icon}</span>}
        <div className="min-w-0">
          <h2 className="truncate text-[13px] text-ink">{title}</h2>
          {count !== undefined && (
            <p className="text-[11px] text-faint">
              {count} {countLabel ?? (count === 1 ? "registro" : "registros")}
            </p>
          )}
        </div>
      </div>

      {(onAdd || acoes) && (
        /* No celular as ações ocupam a largura inteira, em vez de se
           espremerem à direita do título: dois botões de 130px numa tela de
           402px sobravam 40px para o nome da lista. */
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none">
          {acoes}

          {onAdd && (
            <button type="button" onClick={onAdd} className="focus-ring inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-gradient-to-br from-accent-soft to-accent px-3 py-2 text-[12.5px] text-white shadow-glow transition-all hover:brightness-110 active:scale-[0.98]">
              <Plus className="h-3.5 w-3.5" />
              {addLabel}
            </button>
          )}
        </div>
      )}
    </header>

    {/* `pagina` sozinha NÃO cria a barra: uma faixa inteira só para repetir o
        nome da tela é altura tirada da tabela em troca de nada. */}
    {(navegacao || controles || filters) && (
      <BarraFiltros navegacao={navegacao} pagina={pagina}>
        {controles}
        {filters}
      </BarraFiltros>
    )}

    <div ref={bodyRef} className={`min-h-0 flex-1 overflow-auto ${corpoLivre ? "max-sm:flex-none max-sm:overflow-visible" : ""}`}>
      <div className="min-w-0 sm:[min-width:var(--tabela-min)]" style={{ "--tabela-min": `${minWidth}px` } as CSSProperties}>
        {children}
      </div>
    </div>

    {footer && <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-fg/[0.06] px-4 py-2.5 text-[12px] text-faint">{footer}</div>}
  </section>
);

const alignCls = { left: "text-left", right: "text-right", center: "text-center" } as const;

export function TabelaHead<T>({ colunas, cols }: { colunas: Coluna<T>[]; cols: string }) {
  return (
    <div className={`sticky top-0 z-10 hidden ${cols} gap-2 border-b border-fg/[0.1] bg-fg/[0.05] px-4 py-2.5 text-[10.5px] uppercase tracking-[0.12em] text-mist backdrop-blur sm:grid`}>
      {colunas.map((c) => (
        <span key={c.id} className={alignCls[c.align ?? "left"]}>
          {c.header}
        </span>
      ))}
    </div>
  );
}

export function TabelaRow<T>({ colunas, cols, row, onClick }: { colunas: Coluna<T>[]; cols: string; row: T; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  const [principal, ...demais] = colunas;
  const visiveis = demais.filter((c) => Boolean(c.header));

  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      /* Mesma zebra da `ListaLinha` — ver a nota lá. */
      className={`group relative block w-full border-b border-fg/[0.04] text-left text-[12.5px] text-ink transition-colors odd:bg-fg/[0.025] before:absolute before:left-0 before:top-0 before:h-full before:w-[2px] before:bg-accent before:opacity-0 before:transition-opacity ${onClick ? "cursor-pointer hover:bg-fg/[0.05] hover:before:opacity-100" : ""}`}
    >
      <span className={`hidden ${cols} items-center gap-2 px-4 py-2.5 sm:grid`}>
        {colunas.map((c) => (
          <span key={c.id} className={`min-w-0 truncate ${alignCls[c.align ?? "left"]}`}>
            {c.cell(row)}
          </span>
        ))}
      </span>

      {/* Cartão — celular. Os pares em DUAS colunas: ver a nota da `ListaLinha`. */}
      <span className="flex flex-col gap-2 px-4 py-2.5 sm:hidden">
        {principal && <span className="min-w-0 truncate text-[13px] text-ink">{principal.cell(row)}</span>}

        <span className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {visiveis.map((c) => (
            <span key={c.id} className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[9.5px] uppercase tracking-[0.08em] text-faint">{c.header}</span>
              <span className="min-w-0 truncate text-[12.5px]">{c.cell(row)}</span>
            </span>
          ))}
        </span>
      </span>
    </Tag>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Lista de altura fixa

   O outro formato de tabela do sistema, usado por Clientes e Estoque: as
   linhas têm altura constante, o corpo não rola e o que não couber vai para a
   próxima página (ver `useAutoPageSize`). As três peças abaixo eram copiadas
   nas duas telas — as classes do cabeçalho, da linha e das linhas-fantasma
   eram idênticas byte a byte, e só as células mudavam.
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Cabeçalho das colunas — só no desktop.
 *
 * No celular a linha vira cartão e cada valor já vem com o próprio rótulo ao
 * lado (ver `ListaLinha`). Um cabeçalho de seis colunas acima de cartões
 * empilhados não rotula nada: fica sobrando no topo, desalinhado do conteúdo.
 */
export const ListaCabecalho = ({ cols, children }: { cols: string; children: ReactNode }) => (
  /*
   * A fileira de rótulos precisa PESAR mais que as linhas.
   *
   * Ela era quase invisível — 10px em `text-muted` sobre um fundo 2% acima do
   * cartão — e num cartão de sessenta linhas o olho perdia de vista qual
   * coluna era qual assim que rolava. Agora tem fundo próprio, borda de baixo
   * cheia e o texto em `text-mist`: continua sendo rótulo (caixa alta, miúdo,
   * espaçado), mas se lê como o começo da tabela em vez de sobra do cabeçalho.
   */
  <div className={`hidden shrink-0 ${cols} border-b border-fg/[0.1] bg-fg/[0.05] px-5 py-2.5 text-[10.5px] uppercase tracking-[0.12em] text-mist sm:grid`}>{children}</div>
);

/**
 * Linha da lista. `onClick` a torna um `<button>` — abrir o registro é a ação
 * principal dessas telas, e um `<div>` com `onClick` não recebe foco nem
 * responde ao Enter.
 *
 * `acoes` são os botões da própria linha (ligar, editar, o que a tela tiver).
 * Eles ficam FORA do botão da linha: botão dentro de botão é HTML inválido, e
 * na prática o clique no ícone dispararia também a navegação da linha — a
 * pessoa pediria "editar" e receberia outra tela.
 *
 * ---------------------------------------------------------------------------
 * A MESMA linha vira cartão no celular
 * ---------------------------------------------------------------------------
 * Não existe versão de celular desta lista em outro arquivo, e é deliberado:
 * era assim que o Estoque e os Clientes tinham duas implementações da mesma
 * tela, e mexer numa não mexia na outra. Um filtro novo no desktop
 * simplesmente não chegava ao telefone.
 *
 * Abaixo de `sm` a grade de colunas viraria seis colunas de 40px. Então ela é
 * trocada por um cartão: a primeira célula (a identidade — nome e apoio) fica
 * em cima, e as demais viram pares "rótulo · valor". Os rótulos vêm de
 * `rotulos`, os MESMOS que a tela passa ao `ListaCabecalho` — uma lista só por
 * tela, para o cabeçalho do desktop e o cartão do celular nunca divergirem.
 *
 * A altura fixa também é só do desktop: ela existe para as linhas-fantasma
 * segurarem o rodapé de paginação. No cartão, o conteúdo manda.
 */
export const ListaLinha = ({
  cols,
  altura,
  rotulos,
  onClick,
  ariaLabel,
  acoes,
  destaque,
  children,
}: {
  cols: string;
  altura: number;
  /**
   * Rótulo de cada célula, na ordem das colunas — o que o cartão do celular
   * escreve antes de cada valor. A primeira posição é a identidade e não
   * recebe rótulo; posição vazia esconde a célula no cartão.
   */
  rotulos?: (string | undefined)[];
  onClick?: () => void;
  ariaLabel?: string;
  acoes?: ReactNode;
  /**
   * Fundo de aviso na linha inteira — vencida, crítica, o que a tela chamar
   * de urgente. É um tom lavado de propósito: a linha precisa saltar ao correr
   * o olho pela lista sem ficar ilegível quando se para nela.
   */
  destaque?: "danger" | "warning";
  children: ReactNode;
}) => {
  const Tag = onClick ? "button" : "div";

  /*
   * Linha sim, linha não.
   *
   * Numa tabela de seis colunas o olho tem de atravessar a largura inteira
   * para casar o nome da esquerda com a situação da direita, e sem faixa ele
   * escorrega uma linha no caminho — o erro clássico de ler o estoque de um
   * item na linha do outro. A faixa é de 2,5%: o bastante para o olho se
   * apoiar, pouco o bastante para não virar listra.
   *
   * `odd:` conta os IRMÃOS: onde o cabeçalho das colunas é o primeiro filho do
   * mesmo container, a alternância começa na segunda linha. Continua alternando
   * — que é a única coisa que importa aqui.
   *
   * A linha com `destaque` não recebe faixa: o fundo dela já é o aviso.
   */
  const fundo = destaque === "danger" ? "bg-danger/[0.055] hover:bg-danger/[0.09]" : destaque === "warning" ? "bg-warning/[0.05] hover:bg-warning/[0.085]" : "odd:bg-fg/[0.025] hover:bg-fg/[0.05]";
  const marca = destaque === "danger" ? "before:bg-danger" : destaque === "warning" ? "before:bg-warning" : "before:bg-accent";

  /* As células como array: é o que permite pareá-las com os rótulos no cartão.
     Os mesmos elementos são desenhados nos dois lugares — só um deles está
     visível a cada largura, então não há trabalho duplicado na tela. */
  const celulas = Children.toArray(children);
  const [identidade, ...resto] = celulas;

  const linha = (
    <Tag
      {...(onClick ? { type: "button" as const, onClick, "aria-label": ariaLabel } : {})}
      /* `h-auto` no celular e a altura fixa só a partir de `sm`: a altura vem
         por variável porque valor de `style` não aceita breakpoint. */
      className={`group relative block h-auto w-full border-b border-fg/[0.04] text-left transition-colors before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:rounded-r before:transition-opacity hover:before:opacity-100 sm:h-[var(--linha-altura)] ${fundo} ${marca} ${destaque ? "before:opacity-100" : "before:opacity-0"}`}
      style={{ "--linha-altura": `${altura}px` } as CSSProperties}
    >
      {/* Grade — desktop */}
      <span className={`hidden h-full ${cols} items-center px-5 sm:grid`}>{children}</span>

      {/*
       * Cartão — celular. Os pares vão em DUAS COLUNAS.
       *
       * Um par por linha dava seis linhas de altura a cada item: no estoque,
       * um produto ocupava metade da tela do telefone e ver três exigia rolar
       * a página inteira. Em duas colunas o mesmo conteúdo cabe em três
       * linhas, com o rótulo miúdo em cima do valor — a forma que a lista de
       * lançamentos de um banco usa, e pelo mesmo motivo: o olho lê a coluna
       * da esquerda de cima a baixo sem atravessar o cartão a cada dado.
       */}
      <span className="flex flex-col gap-2 px-4 py-2.5 sm:hidden">
        <span className="min-w-0">{identidade}</span>

        <span className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {resto.map((celula, i) => {
            const rotulo = rotulos?.[i + 1];

            /* Sem rótulo, a célula não entra: é o caso da coluna que só
               reserva a largura das ações, que no cartão não existe. */
            if (!rotulo) return null;

            return (
              <span key={i} className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[9.5px] uppercase tracking-[0.08em] text-faint">{rotulo}</span>
                <span className="min-w-0 [&>*]:justify-start">{celula}</span>
              </span>
            );
          })}
        </span>
      </span>
    </Tag>
  );

  if (!acoes) return linha;

  return (
    /* `group` também aqui: as ações são irmãs do botão da linha, e o
       `group-hover` delas precisa de um ancestral comum aos dois. */
    <div className="group relative" style={{ "--linha-altura": `${altura}px` } as CSSProperties}>
      {linha}

      {/*
        No desktop as ações se sobrepõem à direita e só acendem no hover.
        No celular não existe hover — e um botão que só aparece ao passar o
        dedo é um botão que ninguém encontra. Então elas ficam de pé, numa
        faixa própria no pé do cartão.
      */}
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden items-center pr-4 sm:flex">
        <div className="pointer-events-auto flex items-center gap-1 opacity-60 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          {acoes}
        </div>
      </div>

      <div className="flex items-center justify-end gap-1.5 border-b border-fg/[0.04] px-4 pb-3 sm:hidden">{acoes}</div>
    </div>
  );
};

/**
 * Botão de ícone de uma linha de tabela.
 *
 * Alvo de 30px com o ícone em 14: menor que isso vira alvo de mira no
 * trackpad. Quem responde "o que este ícone faz" é a `Dica` — tooltip do tema,
 * imediato, em vez do `title` do navegador (lento, cinza e recortado pelo
 * `overflow` da tabela).
 */
export const ListaAcao = ({
  icon,
  label,
  onClick,
  tone = "neutral",
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tone?: "neutral" | "success";
}) => (
  <Dica texto={label}>
    <button
      type="button"
      aria-label={label}
      onClick={(ev) => {
        ev.stopPropagation();
        onClick();
      }}
      className={`focus-ring flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-lg border border-fg/[0.08] bg-surface/90 transition-colors hover:bg-fg/[0.08] ${
        tone === "success" ? "text-success hover:text-success" : "text-mist hover:text-ink"
      }`}
    >
      {icon}
    </button>
  </Dica>
);

/**
 * Linhas vazias que completam a página.
 *
 * Sem elas o rodapé sobe e desce conforme a última página tem duas ou dez
 * linhas — e a paginação vira um alvo que se move entre um clique e outro.
 *
 * Só no desktop: elas servem à lista de ALTURA FIXA. No celular as linhas são
 * cartões de altura variável e a lista rola, então uma fileira de retângulos
 * vazios no fim seria só espaço morto para o dedo atravessar.
 */
export const ListaFantasmas = ({ quantidade, altura }: { quantidade: number; altura: number }) => (
  <>
    {Array.from({ length: quantidade }).map((_, i) => (
      <div key={`fantasma-${i}`} aria-hidden className="hidden border-b border-fg/[0.04] sm:block" style={{ height: altura }} />
    ))}
  </>
);

/**
 * Rodapé de paginação das listas.
 *
 * Estava copiado em quatro telas — Clientes, Estoque, o extrato de faturas e o
 * histórico de pedidos do cliente — com quatro variações de espaçamento e dois
 * jeitos diferentes de desabilitar as setas. Aqui é um só; o que muda entre as
 * telas é o `resumo` da esquerda ("12 clientes", "Mostrando 1–8 de 11", o
 * ticket médio), que cada uma escreve do seu jeito.
 */
/**
 * Só as setas e o "3 / 7".
 *
 * Separado do rodapé porque nem toda tela quer uma barra própria para paginar:
 * a lista de vendas já tem um rodapé com os totais, e empilhar duas faixas
 * seria gastar altura para dizer duas coisas que cabem na mesma linha.
 */
export const ControlesPagina = ({ pagina, totalPaginas, onPagina }: { pagina: number; totalPaginas: number; onPagina: (p: number) => void }) => {
  const botao =
    "focus-ring flex cursor-pointer items-center gap-1 rounded-lg border border-fg/[0.08] bg-fg/[0.04] px-2.5 py-1.5 text-mist transition-colors hover:bg-fg/[0.08] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="flex items-center gap-2 text-[11px] text-faint">
      <button type="button" disabled={pagina <= 1} onClick={() => onPagina(Math.max(1, pagina - 1))} aria-label="Página anterior" className={botao}>
        <ChevronLeft className="h-3.5 w-3.5" /> Anterior
      </button>

      <span className="px-1 tabular-nums">
        {pagina} / {totalPaginas}
      </span>

      <button type="button" disabled={pagina >= totalPaginas} onClick={() => onPagina(Math.min(totalPaginas, pagina + 1))} aria-label="Próxima página" className={botao}>
        Próxima <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export const TabelaPaginacao = ({
  pagina,
  totalPaginas,
  onPagina,
  resumo,
}: {
  pagina: number;
  totalPaginas: number;
  onPagina: (p: number) => void;
  resumo?: ReactNode;
}) => (
  <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-fg/[0.06] bg-fg/[0.02] px-5 py-3 text-[11px] text-faint">
    <div className="min-w-0">{resumo}</div>
    <ControlesPagina pagina={pagina} totalPaginas={totalPaginas} onPagina={onPagina} />
  </div>
);

export const TabelaVazia = ({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) => (
  <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2.5 px-6 py-10 text-center">
    {icon && <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-fg/[0.07] bg-fg/[0.03] text-faint">{icon}</span>}
    <p className="text-[13px] text-mist">{title}</p>
    {description && <p className="max-w-[280px] text-[11.5px] leading-relaxed text-faint">{description}</p>}
    {action}
  </div>
);
