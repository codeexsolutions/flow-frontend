import type { HTMLAttributes, ReactNode } from "react";

type SkeletonProps = HTMLAttributes<HTMLDivElement>;

export const Skeleton = ({ className = "", ...props }: SkeletonProps) => <div aria-hidden {...props} className={`animate-pulse rounded-md bg-fg/[0.07] ${className}`} />;

/**
 * Esqueleto genérico de linhas de tabela. Cada página passa o próprio grid
 * (`cols`) e o conteúdo das células — o boilerplate de repetição fica aqui.
 */
export const SkeletonTableRows = ({ count, cols, rowHeight, children }: { count: number; cols: string; rowHeight: number; children: ReactNode }) => (
  <div className="animate-pulse">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className={`grid ${cols} items-center border-b border-fg/[0.04] px-5`} style={{ height: rowHeight }}>
        {children}
      </div>
    ))}
  </div>
);

/** Célula padrão: avatar + duas linhas de texto. */
export const SkeletonIdentityCell = () => (
  <div className="flex items-center gap-3">
    <div className="h-9 w-9 shrink-0 rounded-xl bg-fg/[0.05]" />
    <div className="flex flex-col gap-1.5">
      <div className="h-3 w-32 rounded bg-fg/[0.06]" />
      <div className="h-2 w-40 rounded bg-fg/[0.04]" />
    </div>
  </div>
);

/* ---------- Lista de produtos (modal) ---------- */
export const SkeletonProductList = ({ rows = 6 }: { rows?: number }) => (
  <ul className="space-y-1">
    {Array.from({ length: rows }).map((_, i) => (
      <li key={i} className="flex items-center justify-between gap-3 px-3 py-2.5">
        <Skeleton className="h-4 flex-1" />
        <Skeleton className="h-3 w-16" />
      </li>
    ))}
  </ul>
);

/* ---------- Linha da tabela (desktop) ---------- */
export const SkeletonInvoiceRow = () => (
  <tr className="border-b border-fg/[0.05]">
    <td className="p-3">
      <Skeleton className="h-4 w-3/4" />
    </td>
    <td className="p-3">
      <Skeleton className="h-10 w-20 rounded-lg" />
    </td>
    <td className="p-3">
      <Skeleton className="h-10 w-28 rounded-lg" />
    </td>
    <td className="p-3">
      <Skeleton className="h-10 w-24 rounded-lg" />
    </td>
    <td className="p-3">
      <Skeleton className="mx-auto h-9 w-9 rounded-lg" />
    </td>
  </tr>
);

/* ---------- Card do item (mobile) ---------- */
export const SkeletonInvoiceCard = () => (
  <div className="rounded-xl border border-fg/[0.06] bg-fg/[0.03] p-3">
    <div className="flex items-start justify-between gap-2">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-8 w-8 rounded-lg" />
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <Skeleton className="h-10 rounded-lg" />
      <Skeleton className="h-10 rounded-lg" />
    </div>
    <Skeleton className="mt-3 h-9 rounded-lg" />
  </div>
);

/* ---------- Cabeçalho da nota ---------- */
export const SkeletonInvoiceHeader = () => (
  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
    <div className="space-y-2">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-3 w-24" />
    </div>
    <div className="space-y-2 md:text-right">
      <Skeleton className="h-6 w-36 md:ml-auto" />
      <Skeleton className="h-3 w-28 md:ml-auto" />
    </div>
  </div>
);

/* ---------- Cards de resumo ---------- */
export const SkeletonSummary = ({ cards = 6 }: { cards?: number }) => (
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
    {Array.from({ length: cards }).map((_, i) => (
      <div key={i} className="rounded-xl border border-fg/[0.06] bg-fg/[0.03] p-3">
        <Skeleton className="h-2.5 w-14" />
        <Skeleton className="mt-2 h-4 w-20" />
      </div>
    ))}
  </div>
);

/* ─────────────────────────── Assinatura e faturas ─────────────────────────── */

/**
 * Esqueleto da tela de faturas.
 *
 * Reproduz a página inteira — herói, KPI row, tabela e os três cartões do
 * rodapé — porque era isso que um spinner centralizado escondia: a tela
 * aparecia de uma vez, já rolada, e o olho tinha de reencontrar tudo. Aqui o
 * layout nasce no lugar e só falta o dado chegar.
 */
export const SkeletonFaturas = ({ linhas = 8 }: { linhas?: number }) => (
  <div className="flex w-full flex-col gap-5">
    {/* Faixa da conta: saldo + ação, com a régua de indicadores embaixo */}
    <div className="card glass-sheen overflow-hidden">
      <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-6">
        <div className="min-w-0">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="mt-3 h-9 w-48" />
          <Skeleton className="mt-3 h-3 w-64" />
        </div>
        <Skeleton className="h-10 w-40 rounded-xl" />
      </div>

      <div className="grid grid-cols-2 gap-px bg-fg/[0.06] pt-px lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-canvas px-4 py-3">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="mt-2 h-3.5 w-24" />
            <Skeleton className="mt-1.5 h-2.5 w-16" />
          </div>
        ))}
      </div>
    </div>

    {/* Extrato: barra, cabeçalho de colunas, linhas e rodapé de paginação */}
    <div className="card glass-sheen overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-fg/[0.06] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div>
            <Skeleton className="h-3 w-32" />
            <Skeleton className="mt-1.5 h-2.5 w-20" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-40 rounded-lg" />
          <Skeleton className="h-7 w-52 rounded-lg" />
        </div>
      </div>

      <div className="hidden border-b border-fg/[0.06] bg-fg/[0.02] px-5 py-2 sm:block">
        <Skeleton className="h-2.5 w-full" />
      </div>

      <div className="animate-pulse">
        {Array.from({ length: linhas }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-fg/[0.04] px-5" style={{ height: 58 }}>
            <div className="min-w-0 flex-1">
              <div className="h-3 w-2/5 rounded bg-fg/[0.06]" />
              <div className="mt-2 h-2.5 w-1/4 rounded bg-fg/[0.04]" />
            </div>
            <div className="hidden h-2.5 w-16 rounded bg-fg/[0.05] sm:block" />
            <div className="hidden h-2.5 w-20 rounded bg-fg/[0.05] sm:block" />
            <div className="hidden h-2.5 w-24 rounded bg-fg/[0.05] sm:block" />
            <div className="h-3 w-20 rounded bg-fg/[0.06]" />
            <div className="h-7 w-7 rounded-lg bg-fg/[0.05]" />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-fg/[0.06] bg-fg/[0.02] px-5 py-2.5">
        <Skeleton className="h-2.5 w-36" />
        <Skeleton className="h-7 w-48 rounded-lg" />
      </div>
    </div>

    {/* Rodapé: plano, empresa e suporte */}
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="card glass-sheen p-5">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="mt-3 h-5 w-32" />
          <Skeleton className="mt-2 h-3 w-40" />
          <Skeleton className="mt-4 h-16 w-full rounded-xl" />
        </div>
      ))}
    </div>
  </div>
);

/* ─────────────────────────── Dashboard ─────────────────────────── */

/**
 * Esqueletos do painel.
 *
 * A regra que seguimos: o esqueleto tem **a forma e a altura do conteúdo real**.
 * Um bloco cinza genérico troca uma espera por outra — a tela ainda salta
 * quando os dados chegam. Reproduzindo o formato, o layout já nasce no lugar
 * certo e só falta a informação aparecer.
 */
export const SkeletonKpis = ({ cards = 4 }: { cards?: number }) => (
  <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
    {Array.from({ length: cards }).map((_, i) => (
      <div key={i} className="card glass-sheen p-4">
        <Skeleton className="mb-2.5 h-9 w-9 rounded-xl" />
        <Skeleton className="h-2.5 w-16" />
        <Skeleton className="mt-2 h-5 w-24" />
        <Skeleton className="mt-2 h-2.5 w-20" />
      </div>
    ))}
  </div>
);

/** Barras de alturas variadas: parece um gráfico, não um retângulo cinza. */
export const SkeletonGrafico = ({ altura = 220 }: { altura?: number }) => {
  const alturas = [42, 58, 35, 72, 50, 88, 64, 46, 78, 55, 68, 40];

  return (
    <div className="flex items-end gap-2 p-4" style={{ height: altura }}>
      {alturas.map((h, i) => (
        <Skeleton key={i} className="flex-1 rounded-t-md" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
};

export const SkeletonListaPainel = ({ linhas = 5 }: { linhas?: number }) => (
  <div className="flex flex-col">
    {Array.from({ length: linhas }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 border-b border-fg/[0.04] px-4 py-2.5 last:border-0">
        <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-1.5 h-2.5 w-20" />
        </div>
        <Skeleton className="h-3 w-16 shrink-0" />
      </div>
    ))}
  </div>
);

/* ─────────────────────────────── Planilhas ─────────────────────────────── */

/**
 * A grade da planilha antes dos dados — com a forma da ÚLTIMA visita.
 *
 * Quem abre a Estamparia todo dia sabe que ela tem nove colunas e umas trinta
 * linhas; um esqueleto genérico de cinco linhas encolhe a tela e ela salta
 * quando os dados chegam. As larguras e a contagem vêm do localStorage (ver
 * `formaLembrada` em `PlanilhasPage`), então a grade nasce do tamanho certo.
 */
export const SkeletonPlanilha = ({ larguras, linhas }: { larguras: number[]; linhas: number }) => {
  const total = larguras.reduce((soma, l) => soma + l, 56 + 40);

  return (
    <div aria-hidden className="animate-pulse" style={{ minWidth: total }}>
      <div className="flex border-b border-fg/[0.07] bg-surface-raised">
        <div className="w-12 shrink-0 border-r border-fg/[0.07] py-2.5" />
        {larguras.map((l, i) => (
          <div key={i} className="shrink-0 border-r border-fg/[0.07] px-3 py-2.5" style={{ width: l }}>
            <div className="h-2.5 rounded bg-fg/[0.08]" style={{ width: `${40 + ((i * 23) % 35)}%` }} />
          </div>
        ))}
      </div>

      {Array.from({ length: linhas }).map((_, r) => (
        <div key={r} className="flex h-9 border-b border-fg/[0.05]">
          <div className="flex w-12 shrink-0 items-center justify-center border-r border-fg/[0.05]">
            <div className="h-2 w-3 rounded bg-fg/[0.06]" />
          </div>
          {larguras.map((l, c) => (
            <div key={c} className="flex shrink-0 items-center border-r border-fg/[0.05] px-3" style={{ width: l }}>
              {/* Larguras que variam por célula: uma grade de barras iguais
                  parece listra, não planilha. */}
              <div className="h-2.5 rounded bg-fg/[0.05]" style={{ width: `${30 + ((r * 7 + c * 13) % 50)}%` }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

/** O quadro de raias antes dos dados: uma coluna por raia, os cartões que ela tinha. */
export const SkeletonQuadro = ({ raias }: { raias: number[] }) => (
  <div aria-hidden className="flex h-full min-h-0 gap-3 overflow-hidden p-3">
    {raias.map((cartoes, i) => (
      <div key={i} className="flex w-[280px] shrink-0 animate-pulse flex-col overflow-hidden rounded-2xl border border-fg/[0.07] bg-fg/[0.02]">
        <div className="flex items-center gap-2 border-b border-fg/[0.06] px-3.5 py-3">
          <div className="h-2 w-2 rounded-full bg-fg/[0.1]" />
          <div className="h-2.5 w-24 rounded bg-fg/[0.08]" />
          <div className="ml-auto h-3.5 w-5 rounded-full bg-fg/[0.06]" />
        </div>
        <div className="flex flex-col gap-2 p-2.5">
          {Array.from({ length: cartoes }).map((_, c) => (
            <div key={c} className="rounded-xl border border-fg/[0.06] bg-surface p-3">
              <div className="h-3 rounded bg-fg/[0.07]" style={{ width: `${55 + ((i * 11 + c * 17) % 35)}%` }} />
              <div className="mt-2.5 flex gap-1.5">
                <div className="h-3.5 w-16 rounded-full bg-fg/[0.05]" />
                <div className="h-3.5 w-12 rounded-full bg-fg/[0.05]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);
