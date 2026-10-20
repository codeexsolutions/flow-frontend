import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { MESES_EXTENSO } from "@/shared/utils/date";

/**
 * O calendário do sistema — a grade de um mês, para escolher um dia.
 *
 * Nasceu dentro do `SeletorDia` e saiu de lá quando a planilha precisou do
 * mesmo gesto: o `<input type="date">` do navegador desenha um calendário que
 * é de cada sistema operacional, ignora o tema e, no Windows, abre um quadrado
 * cinza que não se parece com nada do resto da tela. Um calendário só, em todo
 * lugar, é o que faz escolher uma data parecer a mesma coisa em qualquer tela.
 *
 * Só a grade: quem abre, onde aparece e o que acontece depois de escolher é de
 * quem usa — o seletor do PDV é um popover preso ao botão, a célula da
 * planilha abre num `Suspenso` porque mora dentro de uma grade que corta.
 */

const DIAS_DA_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"] as const;

/** Meia-noite do dia — comparar datas com hora dentro nunca bate. */
export const soODia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const mesmoDia = (a: Date, b: Date) =>
  a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

type Props = {
  /** O dia marcado. `null` = nenhum ainda; o mês aberto é o de hoje. */
  valor: Date | null;
  onEscolher: (dia: Date) => void;
  /** Último dia escolhível. Sem ele, o futuro inteiro está aberto. */
  max?: Date;
  /** O que vai embaixo da grade — "Voltar para hoje", "Limpar". */
  rodape?: ReactNode;
};

const Calendario = ({ valor, onEscolher, max, rodape }: Props) => {
  const hoje = soODia(new Date());
  const limite = max ? soODia(max) : null;
  const selecionado = valor ? soODia(valor) : null;

  /* Abre no mês do dia escolhido — quem vai mudar uma data quer ver a atual. */
  const [mesVisivel, setMesVisivel] = useState(() => selecionado ?? hoje);

  /*
   * A grade do mês, com os vazios do começo.
   *
   * `getDay()` do dia 1 diz quantas casas pular para o mês cair na coluna
   * certa — sem isso, todo mês começaria no domingo e o calendário mentiria
   * sobre o dia da semana.
   */
  const grade = useMemo(() => {
    const ano = mesVisivel.getFullYear();
    const mes = mesVisivel.getMonth();

    const vazios = new Date(ano, mes, 1).getDay();
    const total = new Date(ano, mes + 1, 0).getDate();

    return [
      ...Array.from({ length: vazios }, () => null),
      ...Array.from({ length: total }, (_, i) => new Date(ano, mes, i + 1)),
    ];
  }, [mesVisivel]);

  const seta =
    "focus-ring flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-mist transition-colors hover:bg-fg/[0.06] hover:text-ink disabled:cursor-not-allowed disabled:opacity-30";

  const ultimoMes = limite && new Date(mesVisivel.getFullYear(), mesVisivel.getMonth(), 1) >= new Date(limite.getFullYear(), limite.getMonth(), 1);

  return (
    <div className="w-[276px] p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="Mês anterior" className={seta} onClick={() => setMesVisivel((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </button>

        <span className="text-[12.5px] text-ink first-letter:uppercase">
          {MESES_EXTENSO[mesVisivel.getMonth()]} de {mesVisivel.getFullYear()}
        </span>

        <button
          type="button"
          aria-label="Próximo mês"
          className={seta}
          disabled={!!ultimoMes}
          onClick={() => setMesVisivel((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1">
        {DIAS_DA_SEMANA.map((d, i) => (
          <span key={`${d}-${i}`} className="text-center text-[10px] uppercase tracking-wider text-faint">
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {grade.map((dia, i) =>
          dia === null ? (
            <span key={`vazio-${i}`} />
          ) : (
            <button
              key={dia.toISOString()}
              type="button"
              disabled={!!limite && dia > limite}
              onClick={() => onEscolher(dia)}
              aria-current={selecionado && mesmoDia(dia, selecionado) ? "date" : undefined}
              className={`focus-ring flex h-8 cursor-pointer items-center justify-center rounded-lg text-[12px] tabular-nums transition-colors disabled:cursor-not-allowed disabled:text-faint/40 disabled:hover:bg-transparent ${
                selecionado && mesmoDia(dia, selecionado)
                  ? "bg-accent text-white shadow-glow"
                  : mesmoDia(dia, hoje)
                    ? "text-accent-soft ring-1 ring-inset ring-accent/40 hover:bg-fg/[0.06]"
                    : "text-mist hover:bg-fg/[0.06] hover:text-ink"
              }`}
            >
              {dia.getDate()}
            </button>
          ),
        )}
      </div>

      {rodape && <div className="mt-3">{rodape}</div>}
    </div>
  );
};

export default Calendario;
