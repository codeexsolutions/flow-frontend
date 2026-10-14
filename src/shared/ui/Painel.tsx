import type { ReactNode } from "react";

import { formatCurrency } from "@/shared/utils/currency";
import { usePainelCores } from "@/shared/ui/painelCores";

/**
 * As peças de um painel: o cartão de número, a moldura de gráfico e o balão do
 * Recharts.
 *
 * Nasceram dentro da Visão Geral de Vendas e foram copiadas para o Financeiro,
 * onde derivaram — mesma ideia, outros tamanhos, outro jeito de pintar o ícone.
 * Duas telas irmãs pareciam de sistemas diferentes. Agora as duas montam o
 * painel com as mesmas peças, e mexer aqui mexe nas duas.
 */

/* As cores e a paleta de fatias vivem em `painelCores.ts` — ver a nota lá. */

export type Tom = "accent" | "success" | "warning" | "danger";

/**
 * O selo colorido que carrega o ícone.
 *
 * O tom é um nome, não um punhado de classes: passar `tone="danger"` impede que
 * uma tela use `bg-danger/15` e a vizinha `bg-danger/20` para dizer a mesma
 * coisa.
 */
const TONS: Record<Tom, string> = {
  accent: "bg-accent/[0.15] text-accent-soft ring-accent/20",
  success: "bg-success/[0.15] text-success ring-success/20",
  warning: "bg-warning/[0.15] text-warning ring-warning/20",
  danger: "bg-danger/[0.15] text-danger ring-danger/20",
};

export const SeloIcone = ({ tone, size = 40, children }: { tone: Tom; size?: number; children: ReactNode }) => (
  <span className={`flex shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${TONS[tone]}`} style={{ width: size, height: size }}>
    {children}
  </span>
);

/**
 * Cartão de número — a linha de KPIs no topo de todo painel.
 *
 * `onClick` é opcional e existe para o número que é também um caminho: "vencido"
 * no panorama leva à lista do que venceu, em vez de obrigar a pessoa a procurar
 * a guia certa.
 */
/**
 * A fileira de números de uma tela.
 *
 * ---------------------------------------------------------------------------
 * No celular ela ROLA de lado; no computador vira grade
 * ---------------------------------------------------------------------------
 * Em 402px, quatro ou cinco cartões numa grade de duas colunas dão ~180px de
 * largura a cada um — e 180px não cabem "R$ 190.876,00" ao lado de um ícone de
 * 36px. O resultado era o número TRUNCADO ("R$ 190.87…"), que é o pior defeito
 * possível num cartão cuja única razão de existir é mostrar um número. Um
 * quinto cartão ainda sobrava sozinho numa terceira fileira.
 *
 * Rolando na horizontal, cada cartão recebe a largura de que precisa (72% da
 * tela), o número aparece inteiro, e o corte do próximo cartão na borda é o
 * que convida a arrastar. `snap-x` prende cada parada no começo do cartão.
 *
 * `-mx-4 px-4` faz a faixa sangrar até as bordas: rolagem que começa e termina
 * no meio do vão parece conteúdo cortado, não conteúdo que anda.
 */
export const KpiFaixa = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div
    className={`-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&>*]:w-[72vw] [&>*]:shrink-0 [&>*]:snap-start [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:overflow-visible sm:px-0 sm:[&>*]:w-auto ${className}`}
  >
    {children}
  </div>
);

export const Kpi = ({
  icon,
  tone,
  label,
  value,
  hint,
  onClick,
}: {
  icon: ReactNode;
  tone: Tom;
  label: string;
  value: string;
  hint?: string;
  onClick?: () => void;
}) => {
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`card-interactive glass-sheen flex items-center gap-3 px-3.5 py-3.5 text-left ${onClick ? "cursor-pointer" : ""}`}
    >
      <SeloIcone tone={tone}>{icon}</SeloIcone>

      <div className="min-w-0">
        <p className="truncate text-[10px] uppercase tracking-wider text-muted">{label}</p>
        {/*
         * O NÚMERO não trunca — ele quebra.
         *
         * Truncar o valor é apagar a única informação do cartão: "R$ 190.87…"
         * não é um número, é um enigma. Quando não couber numa linha, que
         * ocupe duas; a dica embaixo continua truncando, porque ela é
         * explicação e sobrevive cortada.
         */}
        <p className="nums text-[15px] leading-tight text-ink [overflow-wrap:anywhere]">{value}</p>
        {hint && <p className="truncate text-[10.5px] text-faint">{hint}</p>}
      </div>
    </Tag>
  );
};

/** Cabeçalho de um painel: ícone, título e a frase que diz o recorte. */
export const PainelHead = ({ icon, tone, title, sub, acao }: { icon: ReactNode; tone: Tom; title: string; sub?: string; acao?: ReactNode }) => (
  <header className="flex shrink-0 items-center gap-2.5 border-b border-fg/[0.07] px-4 py-3">
    <SeloIcone tone={tone} size={32}>
      {icon}
    </SeloIcone>

    <div className="min-w-0 flex-1">
      <h2 className="truncate text-[13px] leading-none text-ink">{title}</h2>
      {sub && <p className="mt-1 truncate text-[11px] text-faint">{sub}</p>}
    </div>

    {acao}
  </header>
);

/** Moldura de um painel — cabeçalho fixo, corpo e rodapé opcional. */
export const Painel = ({
  icon,
  tone,
  title,
  sub,
  acao,
  children,
  footer,
  className = "",
  bodyClassName = "",
}: {
  icon: ReactNode;
  tone: Tom;
  title: string;
  sub?: string;
  acao?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) => (
  <section className={`card glass-sheen flex min-h-0 min-w-0 flex-col overflow-hidden ${className}`}>
    <PainelHead icon={icon} tone={tone} title={title} sub={sub} acao={acao} />
    <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    {footer && <div className="flex shrink-0 flex-wrap items-center gap-4 border-t border-fg/[0.07] bg-fg/[0.02] px-4 py-2.5">{footer}</div>}
  </section>
);

/** Legenda de gráfico — o tracinho colorido e o nome da série. */
export const Legenda = ({ itens }: { itens: { color: string; label: string }[] }) => (
  <>
    {itens.map(({ color, label }) => (
      <span key={label} className="flex items-center gap-1.5 text-[11px] text-mist">
        <span className="inline-block h-[3px] w-3 rounded-sm" style={{ background: color }} />
        {label}
      </span>
    ))}
  </>
);

/* ---------------- Balão do Recharts ---------------- */

type BalaoEntrada = {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
  payload?: { fill?: string };
};

export type BalaoProps = {
  active?: boolean;
  payload?: BalaoEntrada[];
  label?: string | number;
  /** Como escrever o número. Padrão: moeda. */
  formatar?: (v: number) => string;
};

/**
 * O balão que o Recharts abre no hover.
 *
 * Vem por `content={<ChartTip />}` porque o balão de fábrica é branco e opaco:
 * ele não acompanha o tema e some no modo claro.
 */
export const ChartTip = ({ active, payload, label, formatar = formatCurrency }: BalaoProps) => {
  const C = usePainelCores();

  if (!active || !payload?.length) return null;

  return (
    <div className="glass-strong elev-2 rounded-xl px-3 py-2 text-xs">
      {label !== undefined && label !== "" && <p className="mb-1 text-mist">{label}</p>}

      {payload.map((p) => (
        <p key={p.dataKey ?? p.name} className="mt-0.5" style={{ color: p.color ?? p.payload?.fill ?? C.accent }}>
          {p.name ?? p.dataKey}: <strong className="font-normal">{typeof p.value === "number" ? formatar(p.value) : p.value}</strong>
        </p>
      ))}
    </div>
  );
};

/** Vazio de painel — o lugar do gráfico quando não há o que desenhar. */
export const PainelVazio = ({ icon, title, description }: { icon?: ReactNode; title: string; description?: string }) => (
  <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
    {icon && <span className="grid h-11 w-11 place-items-center rounded-xl border border-fg/[0.07] bg-fg/[0.03] text-faint">{icon}</span>}
    <p className="text-[12.5px] text-mist">{title}</p>
    {description && <p className="max-w-[280px] text-[11.5px] leading-relaxed text-faint">{description}</p>}
  </div>
);
