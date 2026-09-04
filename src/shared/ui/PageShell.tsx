import type { ReactNode } from "react";

import HeaderPage, { type HeaderTab } from "@/shared/ui/HeaderPage";

/**
 * Espaçamentos padrão das telas.
 *
 * Antes cada página escolhia o seu (p-5, px-5 py-5, px-8 py-6…), o que comia
 * altura útil — especialmente em telas de tabela, onde cada pixel vira linha
 * visível. Aqui o respiro é único e mais enxuto.
 */
export const PAGE_PAD = "px-4 py-3 lg:px-6 lg:py-4";
export const PAGE_GAP = "gap-3";

/**
 * Corpo rolável de uma página, já com o padding padrão.
 *
 * O corpo **sempre** rola na vertical. Antes o padrão era `overflow-hidden` e
 * cada tela precisava pedir `scroll` — quem esquecia ficava com o conteúdo
 * cortado e inalcançável em qualquer tela mais baixa que 1080px, que é a altura
 * em que tudo por acaso cabia. Em telas altas nada transborda e o resultado é
 * idêntico ao de antes; em telas baixas o que sobra fica acessível.
 */
export const PageBody = ({ children, className = "", cheio = false }: { children: ReactNode; className?: string; cheio?: boolean }) => (
  /*
   * `cheio` é a tela que ocupa a altura toda e rola por dentro.
   *
   * O padrão (com respiro e rolagem própria) é certo para página que cresce.
   * Não serve para tela de painéis — a conversa do CRM, um quadro de colunas —,
   * onde o respiro rouba altura útil e a rolagem de fora briga com a de dentro:
   * a roda do mouse para no visor errado e o polegar nunca sabe qual dos dois
   * vai se mexer.
   *
   * Existe como OPÇÃO e não como classe passada por fora porque sobrepor
   * `overflow` e padding por `className` depende da ordem em que o Tailwind
   * gera o CSS — funciona por acidente, e quebra numa atualização sem ninguém
   * mexer no arquivo.
   */
  <main
    className={
      cheio
        ? `relative flex min-h-0 flex-1 flex-col overflow-hidden ${className}`
        : `relative flex min-h-0 flex-1 flex-col overflow-y-auto ${PAGE_GAP} ${PAGE_PAD} ${className}`
    }
  >
    {children}
  </main>
);

/**
 * Casca canônica de uma tela do sistema: fundo, brilho, cabeçalho e corpo.
 *
 * Toda tela era montada à mão com essa mesma estrutura — dez cópias, três
 * espaçamentos diferentes e, em duas delas, um roxo cravado em hexadecimal que
 * não acompanhava a troca de tema. Agora existe um lugar só: mudou aqui, mudou
 * em todas.
 *
 * Use `<PageScreen>` sempre que a tela for um destino de rota. Conteúdo de aba
 * (o que entra num `<Outlet>`) NÃO leva casca — quem tem é a tela pai.
 */
export const PageScreen = ({
  title,
  subtitle,
  icon,
  tabs,
  actions,
  onVoltar,
  voltarPara,
  children,
  bodyClassName = "",
  corpoCheio = false,
  headerClassName,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  tabs?: HeaderTab[];
  /** Controles no cabeçalho — só para telas que precisam da altura. Ver `HeaderPage`. */
  actions?: ReactNode;
  /** Telas de detalhe: o voltar mora no cabeçalho. Ver `HeaderPage`. */
  onVoltar?: () => void;
  voltarPara?: string;
  children: ReactNode;
  bodyClassName?: string;
  /** Tela de altura cheia que rola por dentro — ver `PageBody`. */
  corpoCheio?: boolean;
  /** Envolve o cabeçalho — usado por Relatórios para escondê-lo na impressão. */
  headerClassName?: string;
}) => (
  <div className="aurora relative flex h-full w-full flex-col overflow-hidden text-ink">
    {/* Brilho do topo — segue o accent do tema, e some no modo leve. */}
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-72"
      style={{
        opacity: "var(--fx-aurora, 1)",
        background: "radial-gradient(60% 100% at 50% 0%, rgb(var(--accent) / 0.16), transparent 70%)",
      }}
    />

    {headerClassName ? (
      <div className={headerClassName}>
        <HeaderPage title={title} subtitle={subtitle} icon={icon} tabs={tabs} actions={actions} onVoltar={onVoltar} voltarPara={voltarPara} />
      </div>
    ) : (
      <HeaderPage title={title} subtitle={subtitle} icon={icon} tabs={tabs} actions={actions} onVoltar={onVoltar} voltarPara={voltarPara} />
    )}

    <PageBody className={bodyClassName} cheio={corpoCheio}>{children}</PageBody>
  </div>
);

/**
 * Barra de ações da tela. É aqui que ficam"Novo cliente","Exportar" etc. —
 * dentro do outlet, junto do conteúdo que elas afetam, e não no cabeçalho.
 */
export const PageToolbar = ({ children, left, className = "" }: { children?: ReactNode; left?: ReactNode; className?: string }) => (
  /*
   * No celular a barra EMPILHA; a partir de `sm` ela volta a ser uma linha.
   *
   * Com `flex-wrap` numa linha só, os controles da esquerda quebravam em duas
   * fileiras e o grupo da direita continuava alinhado ao centro vertical da
   * primeira — os botões apareciam DESENHADOS POR CIMA do segundo seletor.
   * É o que acontecia em Relatórios com "Exportar Excel" sobre o rótulo
   * "Relatório".
   */
  <div className={`flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between ${className}`}>
    <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-1">{left}</div>
    {children && <div className="flex flex-wrap items-center gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">{children}</div>}
  </div>
);

/** Botão de ação primário — o"criar" de cada tela. */
export const PrimaryAction = ({ icon, children, onClick, disabled }: { icon?: ReactNode; children: ReactNode; onClick?: () => void; disabled?: boolean }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="focus-ring inline-flex cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-br from-accent-soft to-accent px-4 py-2 text-[13px] text-white shadow-glow transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
  >
    {icon}
    {children}
  </button>
);

/** Botão de ação secundário. */
export const GhostAction = ({ icon, children, onClick, disabled, title }: { icon?: ReactNode; children?: ReactNode; onClick?: () => void; disabled?: boolean; title?: string }) => (
  <button type="button" onClick={onClick} disabled={disabled} title={title} className="glass-subtle focus-ring inline-flex cursor-pointer items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] text-mist transition-all hover:text-ink disabled:cursor-not-allowed disabled:opacity-50">
    {icon}
    {children}
  </button>
);
