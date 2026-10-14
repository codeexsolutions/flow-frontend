import { useId } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

import { BALAO } from "@/shared/ui/Rosca";

/*
 * Os gráficos do Início.
 *
 * Todos leem as cores dos tokens do tema (`rgb(var(--…))`): acompanham os
 * temas claros e escuros e os destaques sem nenhum código condicional.
 *
 * Magnitude é sempre UMA matiz — o destaque do tema —, variando só a
 * intensidade. Cor aqui nunca é categoria: a barra mais forte é a maior, e é
 * só isso que ela quer dizer.
 */

/* ─────────────────────────────── Sparkline ─────────────────────────────── */

/**
 * A curva miúda no pé do cartão de número.
 *
 * Não tem eixo nem grade: o valor exato está no próprio cartão, e o que a
 * linha diz é a FORMA — subindo, caindo, um pico no meio. O balão continua lá
 * para quem passa o mouse e quer o número de um ponto.
 *
 * Com menos de dois pontos não há forma para mostrar, e o componente some.
 */
export const Sparkline = ({
  pontos,
  cor,
  formatar,
  altura = 38,
}: {
  pontos: { name: string; valor: number }[];
  cor: string;
  formatar: (n: number) => string;
  altura?: number;
}) => {
  const id = useId().replace(/:/g, "");

  if (pontos.length < 2) return null;

  return (
    <div style={{ height: altura }} className="-mx-1 mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={pontos} margin={{ top: 3, right: 2, left: 2, bottom: 0 }}>
          <defs>
            <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={cor} stopOpacity={0.35} />
              <stop offset="100%" stopColor={cor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            cursor={{ stroke: "rgb(var(--fg) / 0.15)", strokeDasharray: "3 3" }}
            contentStyle={{ ...BALAO, padding: "4px 8px" }}
            labelStyle={{ color: "rgb(var(--faint))" }}
            itemStyle={{ padding: 0, color: "rgb(var(--ink))" }}
            formatter={(v) => [formatar(Number(v ?? 0)), ""]}
            separator=""
          />
          <Area
            type="monotone"
            dataKey="valor"
            stroke={cor}
            strokeWidth={1.75}
            fill={`url(#spark-${id})`}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 2, stroke: "rgb(var(--surface))" }}
            animationDuration={900}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

/* ──────────────────────────────── Medidor ──────────────────────────────── */

/**
 * Meio anel com o quanto do faturado já virou dinheiro.
 *
 * Um número só, então um medidor e não um gráfico de série: a pergunta é
 * "quanto do que vendi eu já recebi?", e a resposta é uma fração. As marcas a
 * cada 10% dão a escala sem precisar de eixo.
 */
export const Medidor = ({ fracao, rotulo }: { fracao: number; rotulo: string }) => {
  const id = useId().replace(/:/g, "");
  const f = Math.max(0, Math.min(1, Number.isFinite(fracao) ? fracao : 0));

  /* Semicírculo de 180°, da esquerda para a direita, centro em (100, 100). */
  const R = 78;
  const ponto = (t: number, r = R) => {
    const ang = Math.PI * (1 - t);
    return [100 + r * Math.cos(ang), 100 - r * Math.sin(ang)] as const;
  };
  const [x0, y0] = ponto(0);
  const [x1, y1] = ponto(1);
  const trilha = `M ${x0} ${y0} A ${R} ${R} 0 0 1 ${x1} ${y1}`;
  const comprimento = Math.PI * R;

  const pct = Math.round(f * 100);

  return (
    <div className="relative mx-auto w-full max-w-[240px]">
      <svg viewBox="0 0 200 116" className="w-full" role="img" aria-label={`${pct}% ${rotulo}`}>
        <defs>
          <linearGradient id={`medidor-${id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgb(var(--accent))" />
            <stop offset="100%" stopColor="rgb(var(--success))" />
          </linearGradient>
          <filter id={`brilho-${id}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Marcas da escala, a cada 10%. */}
        {Array.from({ length: 11 }, (_, i) => {
          const t = i / 10;
          const [ax, ay] = ponto(t, R + 11);
          const [bx, by] = ponto(t, R + (i % 5 === 0 ? 18 : 15));
          return <line key={i} x1={ax} y1={ay} x2={bx} y2={by} stroke="rgb(var(--fg) / 0.22)" strokeWidth={i % 5 === 0 ? 1.5 : 1} />;
        })}

        <path d={trilha} fill="none" stroke="rgb(var(--fg) / 0.08)" strokeWidth={12} strokeLinecap="round" />
        <path
          d={trilha}
          fill="none"
          stroke={`url(#medidor-${id})`}
          strokeWidth={12}
          strokeLinecap="round"
          filter={`url(#brilho-${id})`}
          strokeDasharray={comprimento}
          strokeDashoffset={comprimento * (1 - f)}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.22, 0.61, 0.36, 1)" }}
        />
      </svg>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center">
        <span className="nums text-[30px] leading-none tracking-tight text-ink">
          {pct}
          <span className="text-[16px] text-mist">%</span>
        </span>
        <span className="mt-1 text-[11px] text-faint">{rotulo}</span>
      </div>
    </div>
  );
};

const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
const DIAS_LONGOS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;

/* ──────────────────────────── Barras da semana ──────────────────────────── */

/**
 * O faturamento por dia da semana, com o melhor dia aceso.
 *
 * As outras barras ficam na mesma matiz, só mais apagadas: o destaque é
 * ênfase, não categoria — o melhor dia é o mesmo tipo de coisa que os outros.
 */
export const BarrasSemana = ({ dias, formatar }: { dias: { dia: number; valor: number; vendas: number }[]; formatar: (n: number) => string }) => {
  const maior = Math.max(...dias.map((d) => d.valor));
  const dados = dias.map((d) => ({ ...d, nome: DIAS_CURTOS[d.dia] }));

  return (
    <div className="h-[260px] px-2 pt-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}>
          <XAxis dataKey="nome" tickLine={false} axisLine={false} tickMargin={6} tick={{ fontSize: 10.5, fill: "rgb(var(--faint))" }} />
          <YAxis hide />
          <Tooltip
            cursor={{ fill: "rgb(var(--fg) / 0.04)" }}
            contentStyle={BALAO}
            labelStyle={{ color: "rgb(var(--faint))", marginBottom: 4 }}
            itemStyle={{ padding: 0, color: "rgb(var(--ink))" }}
            labelFormatter={(_l, p) => DIAS_LONGOS[(p?.[0]?.payload as { dia: number } | undefined)?.dia ?? 0]}
            formatter={(v, _n, item) => [`${formatar(Number(v ?? 0))} · ${item?.payload?.vendas ?? 0} vendas`, ""]}
            separator=""
          />
          <Bar dataKey="valor" radius={[4, 4, 0, 0]} barSize={22} animationDuration={800} animationEasing="ease-out">
            {dados.map((d) => (
              <Cell key={d.dia} fill={d.valor === maior && maior > 0 ? "rgb(var(--accent))" : "rgb(var(--accent) / 0.32)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

/* ──────────────────────────────── Ranking ──────────────────────────────── */

export type ItemRanking = { nome: string; valor: number; sub?: string };

/**
 * Ranking em barras deitadas, desenhado à mão.
 *
 * Deitado porque o rótulo é nome de produto ou de cliente — em pé ele viraria
 * texto girado. E à mão, e não com o recharts, porque aqui o nome, o número e
 * a barra são uma linha só: o nome inteiro em cima, o valor alinhado à
 * direita, a barra embaixo ocupando a largura toda. No gráfico de eixo o nome
 * era cortado em 16 letras para caber.
 *
 * Uma matiz só, mais forte no primeiro — é a mesma medida para todos, e a cor
 * não diz nada além de "maior".
 */
export const Ranking = ({
  itens,
  formatar,
  cor = "var(--accent)",
}: {
  itens: ItemRanking[];
  formatar: (n: number) => string;
  /** A variável do tema SEM o `rgb()` — ex.: `var(--warning)`. */
  cor?: string;
}) => {
  const reduzir = useReducedMotion();
  const maior = Math.max(...itens.map((i) => i.valor), 0);

  return (
    <ol className="flex flex-col gap-3.5 px-4 py-4">
      {itens.map((it, i) => {
        const fracao = maior > 0 ? it.valor / maior : 0;
        const lider = i === 0 && it.valor > 0;

        return (
          <li key={`${it.nome}-${i}`} className="group">
            <div className="mb-1.5 flex items-baseline gap-2.5">
              <span
                className="nums flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px]"
                style={{
                  background: lider ? `rgb(${cor})` : `rgb(${cor} / 0.12)`,
                  color: lider ? "rgb(var(--surface))" : `rgb(${cor})`,
                  boxShadow: lider ? `0 0 12px -2px rgb(${cor} / 0.8)` : undefined,
                }}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink" title={it.nome}>
                {it.nome}
              </span>
              {it.sub && <span className="hidden shrink-0 text-[11px] text-faint sm:inline">{it.sub}</span>}
              <span className="nums shrink-0 text-[12.5px] text-ink">{formatar(it.valor)}</span>
            </div>

            <div className="relative ml-[30px] h-[7px] overflow-hidden rounded-full bg-fg/[0.06]">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  background: `linear-gradient(90deg, rgb(${cor} / 0.55), rgb(${cor}))`,
                  boxShadow: `0 0 10px -1px rgb(${cor} / ${lider ? 0.75 : 0.35})`,
                }}
                initial={{ width: reduzir ? `${fracao * 100}%` : 0 }}
                animate={{ width: `${Math.max(fracao * 100, it.valor > 0 ? 2 : 0)}%` }}
                transition={{ duration: 0.8, delay: reduzir ? 0 : 0.08 * i, ease: [0.22, 0.61, 0.36, 1] }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
};
