import type { ReactNode } from "react";
import { motion, useReducedMotionConfig } from "framer-motion";

import { formatNumber } from "@/shared/utils/format";

/**
 * As abas que trocam a lista de uma tabela.
 *
 * ---------------------------------------------------------------------------
 * Por que virou componente
 * ---------------------------------------------------------------------------
 * Cada tela tinha escrito as suas: o painel de estoque com a pílula que
 * desliza, o PDV com uma cópia dela, o financeiro e a lista de vendas com um
 * fundo estático que acendia e apagava. Mesma peça, quatro implementações — e
 * o usuário sentia a diferença antes de saber nomeá-la: em duas telas a aba
 * "andava", nas outras duas ela piscava.
 *
 * ---------------------------------------------------------------------------
 * A pílula é UM elemento que se move
 * ---------------------------------------------------------------------------
 * É o `layoutId` do Framer Motion: existe um só destaque na barra, e ele é
 * reposicionado com mola quando a aba muda, em vez de um fundo por botão
 * ligando e desligando. O olho segue para onde ele foi em vez de procurar o
 * que mudou — e quem pediu menos animação no sistema recebe a troca seca.
 *
 * `grupo` é o `layoutId`: ele precisa ser ÚNICO por barra na página. Duas
 * barras compartilhando o mesmo nome fariam a pílula de uma voar para dentro
 * da outra ao trocar de aba.
 *
 * ---------------------------------------------------------------------------
 * A contagem fica na aba
 * ---------------------------------------------------------------------------
 * `contagem` é o que permite saber que há 200 lançamentos sem abrir a lista —
 * e é metade do motivo de trocar de aba. Só aparece quando a tela passa o
 * número: aba sem contagem conhecida não mostra zero.
 */

export type AbaTabela<T extends string> = {
  id: T;
  label: string;
  icone?: ReactNode;
  contagem?: number;
};

export function AbasTabela<T extends string>({
  abas,
  valor,
  onValor,
  grupo,
}: {
  abas: AbaTabela<T>[];
  valor: T;
  onValor: (id: T) => void;
  /** `layoutId` da pílula — único por barra na página. */
  grupo: string;
}) {
  const reduzir = useReducedMotionConfig();

  return (
    <>
      {abas.map(({ id, label, icone, contagem }) => {
        const on = id === valor;

        return (
          <button
            key={id}
            type="button"
            onClick={() => onValor(id)}
            aria-current={on ? "page" : undefined}
            className="focus-ring relative flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] transition-colors"
          >
            {on && (
              <motion.span
                layoutId={grupo}
                transition={reduzir ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 38 }}
                className="absolute inset-0 rounded-lg bg-fg/[0.07]"
              />
            )}

            <span className={`relative flex items-center gap-1.5 ${on ? "text-ink" : "text-faint"}`}>
              {icone}
              {label}
              {contagem !== undefined && (
                <span className={`tabular-nums ${on ? "text-muted" : "text-faint/70"}`}>{formatNumber(contagem)}</span>
              )}
            </span>
          </button>
        );
      })}
    </>
  );
}

export default AbasTabela;
