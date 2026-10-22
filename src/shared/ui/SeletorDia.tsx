import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { diaExtenso } from "@/shared/utils/date";
import Calendario, { mesmoDia, soODia } from "@/shared/ui/Calendario";

/**
 * Escolher UM dia — a pergunta que a loja faz de verdade.
 *
 * O filtro anterior era "Hoje / Este mês", dois botões. Funciona para a
 * pergunta do balcão ("quanto vendi até agora?") e não responde a mais nenhuma:
 * conferir sábado passado, refazer o caixa de anteontem, achar a venda que o
 * cliente diz ter feito "na terça" — tudo isso exigia sair da tela.
 *
 * Aqui o dia é um valor, com três formas de mexer nele, cada uma para um uso:
 *   - as setas, para andar de um em um (é o gesto de conferir dia a dia);
 *   - o calendário, para pular para uma data distante;
 *   - "Hoje", para voltar ao normal sem precisar achar o dia certo no mês.
 *
 * A data aparece por extenso porque `11/08/2026` obriga a pessoa a traduzir —
 * e o que ela quer saber é se está olhando para uma terça ou para um sábado,
 * já que o movimento da loja é diferente nos dois.
 */

const somarDias = (d: Date, n: number) => {
  const novo = new Date(d);
  novo.setDate(novo.getDate() + n);
  return novo;
};

type Props = {
  valor: Date;
  onChange: (dia: Date) => void;
  /** Último dia escolhível. Padrão: hoje — não se vende no futuro. */
  max?: Date;
};

const SeletorDia = ({ valor, onChange, max }: Props) => {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  const limite = soODia(max ?? new Date());
  const hoje = soODia(new Date());
  const selecionado = soODia(valor);

  /* Fecha ao clicar fora ou no Esc: um popover que só fecha pelo próprio botão
     fica no caminho de tudo que estiver embaixo dele. */
  useEffect(() => {
    if (!aberto) return;

    const foraDaCaixa = (ev: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(ev.target as Node)) setAberto(false);
    };
    const noEsc = (ev: KeyboardEvent) => ev.key === "Escape" && setAberto(false);

    document.addEventListener("mousedown", foraDaCaixa);
    document.addEventListener("keydown", noEsc);

    return () => {
      document.removeEventListener("mousedown", foraDaCaixa);
      document.removeEventListener("keydown", noEsc);
    };
  }, [aberto]);

  const escolher = (dia: Date) => {
    onChange(dia);
    setAberto(false);
  };

  const podeAvancar = selecionado < limite;

  const seta = "focus-ring flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-mist transition-colors hover:bg-fg/[0.06] hover:text-ink disabled:cursor-not-allowed disabled:opacity-30";

  return (
    <div ref={caixa} className="relative flex items-center gap-0.5 rounded-xl border border-fg/[0.08] bg-fg/[0.03] p-1">
      <button type="button" aria-label="Dia anterior" className={seta} onClick={() => onChange(somarDias(selecionado, -1))}>
        <ChevronLeft className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-haspopup="dialog"
        className="focus-ring flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] sm:min-w-[186px] sm:gap-2 sm:px-3 text-ink transition-colors hover:bg-fg/[0.06]"
      >
        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-accent-soft" />
        <span className="hidden truncate first-letter:uppercase sm:inline">{diaExtenso(selecionado)}</span>
        {/* No celular o dia por extenso não cabe ao lado da busca: "Hoje",
            "Ontem" ou a data curta. */}
        <span className="whitespace-nowrap tabular-nums sm:hidden">
          {mesmoDia(selecionado, hoje) ? "Hoje" : mesmoDia(selecionado, somarDias(hoje, -1)) ? "Ontem" : selecionado.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
        </span>
      </button>

      <button type="button" aria-label="Próximo dia" className={seta} disabled={!podeAvancar} onClick={() => onChange(somarDias(selecionado, 1))}>
        <ChevronRight className="h-4 w-4" />
      </button>

      {/* No celular o calendário abre no meio da tela, sobre um fundo escuro:
          ancorado ao botão ele saía pela borda esquerda. */}
      {aberto && (
        <div
          className="fixed inset-0 z-[290] bg-black/40 sm:hidden"
          onMouseDown={() => setAberto(false)}
          aria-hidden
        />
      )}

      {aberto && (
        <div
          role="dialog"
          aria-label="Escolher dia"
          /* `right-0`: o seletor mora à direita do cabeçalho da tabela, e um
             popover ancorado à esquerda sairia da tela em 1280px. */
          className="z-[300] rounded-2xl border border-fg/[0.1] bg-surface shadow-e3 max-sm:fixed max-sm:left-1/2 max-sm:top-1/2 max-sm:-translate-x-1/2 max-sm:-translate-y-1/2 sm:absolute sm:right-0 sm:top-[calc(100%+8px)] sm:z-30"
        >
          <Calendario
            valor={selecionado}
            onEscolher={escolher}
            max={limite}
            rodape={
              /* O caminho de volta ao normal. Sem ele, quem foi conferir março
                 precisa navegar de volta mês a mês para voltar a operar. */
              <button
                type="button"
                onClick={() => escolher(hoje)}
                disabled={mesmoDia(selecionado, hoje)}
                className="focus-ring w-full cursor-pointer rounded-lg border border-fg/[0.08] py-1.5 text-[12px] text-mist transition-colors hover:bg-fg/[0.05] hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                Voltar para hoje
              </button>
            }
          />
        </div>
      )}
    </div>
  );
};

export default SeletorDia;
