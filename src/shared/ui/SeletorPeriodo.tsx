import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, Check, ChevronDown } from "lucide-react";

import { MESES_EXTENSO } from "@/shared/utils/date";

/**
 * O recorte de tempo de uma tela inteira.
 *
 * `de`/`ate` em `null` significa TODO O HISTÓRICO — e é um valor legítimo, não
 * "ainda não escolheu". Um painel que só sabe falar do mês corrente responde
 * bem à pergunta do balcão ("como está indo o mês?") e a nenhuma outra: quanto
 * a loja faturou desde que abriu, como foi o segundo semestre, o que vendeu
 * entre a Black Friday e o Natal — tudo isso exigia sair da tela e montar
 * relatório.
 *
 * O `rotulo` viaja junto do intervalo de propósito. Quem recebe o período
 * precisa ESCREVER o recorte na tela ("no período", "em 2025", "de 01/03 a
 * 15/04"), e recalcular esse nome a partir de duas datas soltas daria "1 de
 * janeiro a 31 de dezembro" onde a pessoa escolheu "Este ano".
 */
export type Periodo = {
  /** Início do intervalo, à meia-noite. `null` = desde a primeira venda. */
  de: Date | null;
  /** Fim do intervalo, inclusive (23:59:59). `null` = até a última. */
  ate: Date | null;
  /** Como o período se chama na tela: "Todo o período", "Este mês", "2025"… */
  rotulo: string;
};

const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const fimDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

/** Todo o histórico — o padrão de quem quer ver a loja inteira. */
export const PERIODO_TUDO: Periodo = { de: null, ate: null, rotulo: "Todo o período" };

/**
 * O fim do intervalo, nunca depois de hoje.
 *
 * O mês corrente não termina no dia 31: termina agora. A diferença não é
 * cosmética — é ela que define a janela de comparação. Terminando no dia 31,
 * o mês em curso teria trinta e um dias de tamanho e seria comparado com o mês
 * anterior INTEIRO: quinze dias de venda contra trinta e um, e o painel
 * anunciaria uma queda de metade todo começo de mês.
 */
const ateHoje = (fim: Date) => {
  const agora = new Date();

  return fim > agora ? fimDoDia(agora) : fimDoDia(fim);
};

/**
 * Só o dia de hoje.
 *
 * É o único recorte relativo que sobrevive aqui, e sobrevive porque não tem o
 * defeito dos outros: "hoje" não muda de significado conforme o dia em que a
 * tela abre — ele É o dia em que a tela abriu. E é o relatório que mais se
 * tira: o fechamento do balcão, na hora de fechar.
 */
export const periodoDeHoje = (): Periodo => {
  const agora = new Date();

  return { de: inicioDoDia(agora), ate: fimDoDia(agora), rotulo: "Hoje" };
};

/**
 * Um mês do calendário, com nome próprio.
 *
 * "Setembro de 2026", e não "este mês". A lista aqui é feita dos meses que
 * TÊM movimento, então cada item é um fato — não um apelido que muda de
 * significado conforme o dia em que a tela é aberta. Quem confere setembro
 * quer setembro, inclusive em dezembro.
 */
export const periodoDoMes = (mes: Date): Periodo => ({
  de: new Date(mes.getFullYear(), mes.getMonth(), 1),
  /* Dia 0 do mês seguinte é o último dia deste — evita a tabela de "quantos
     dias tem cada mês" e acerta fevereiro bissexto de graça. */
  ate: ateHoje(new Date(mes.getFullYear(), mes.getMonth() + 1, 0)),
  rotulo: `${MESES_EXTENSO[mes.getMonth()]} de ${mes.getFullYear()}`,
});

/** `Date` → `yyyy-mm-dd`, que é o que `<input type="date">` entende. */
const paraCampo = (d: Date | null) => {
  if (!d) return "";

  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");

  return `${d.getFullYear()}-${mes}-${dia}`;
};

/** `yyyy-mm-dd` → `Date` local. `new Date("2026-03-01")` seria UTC, e em
    fuso negativo cairia no dia 28 de fevereiro. */
const doCampo = (v: string): Date | null => {
  const [ano, mes, dia] = v.split("-").map(Number);

  return ano && mes && dia ? new Date(ano, mes - 1, dia) : null;
};

const curto = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

type Props = {
  valor: Periodo;
  onChange: (periodo: Periodo) => void;
  /**
   * Os meses que TÊM movimento, do mais recente para o mais antigo.
   *
   * A lista é feita do que existe, e não de uma tabela de atalhos fixos. Um
   * menu com "este mês / últimos 7 dias / últimos 30 dias" tem dois defeitos
   * que se somam: os nomes mudam de significado conforme o dia em que a tela é
   * aberta, e metade das opções cai em cima de meses sem venda nenhuma — a
   * pessoa escolhe, o painel zera, e não fica claro se a loja parou ou se o
   * filtro está errado.
   *
   * Vindo dos dados, toda opção da lista devolve alguma coisa, e o tamanho da
   * lista já conta há quanto tempo a loja opera.
   */
  meses: Date[];
  /**
   * Oferece "Hoje" no topo da lista.
   *
   * Desligado por padrão. No painel, o dia já é o subtítulo do cabeçalho e
   * teria duas respostas na mesma tela; no relatório, é o documento que mais
   * se imprime.
   */
  comHoje?: boolean;
};

/**
 * Escolher o recorte de tempo da tela, no cabeçalho.
 *
 * Fica no cabeçalho e não numa barra do corpo porque ele governa TUDO o que
 * está abaixo — os números, o gráfico e os rankings falam todos do mesmo
 * período. Um controle desses dentro de um painel diria, pela posição, que
 * vale só para aquele painel.
 */
const SeletorPeriodo = ({ valor, onChange, meses, comHoje = false }: Props) => {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  /* Rascunho do intervalo livre. Separado do valor aplicado: enquanto a pessoa
     digita "de", o "até" ainda está vazio, e aplicar a cada tecla recalcularia
     o painel inteiro com um intervalo pela metade. */
  const [de, setDe] = useState(() => paraCampo(valor.de));
  const [ate, setAte] = useState(() => paraCampo(valor.ate));

  useEffect(() => {
    if (!aberto) return;

    setDe(paraCampo(valor.de));
    setAte(paraCampo(valor.ate));
  }, [aberto, valor.de, valor.ate]);

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

  /* A lista pronta: todo o período no topo, os meses com movimento abaixo. */
  const opcoes = useMemo(() => meses.map((mes) => ({ mes, periodo: periodoDoMes(mes) })), [meses]);

  const mesmoIntervalo = (a: Periodo, b: Periodo) =>
    (a.de?.getTime() ?? null) === (b.de?.getTime() ?? null) && (a.ate?.getTime() ?? null) === (b.ate?.getTime() ?? null);

  const escolher = (periodo: Periodo) => {
    onChange(periodo);
    setAberto(false);
  };

  const aplicarLivre = () => {
    const inicio = doCampo(de);
    const fim = doCampo(ate);

    if (!inicio || !fim) return;

    /* Datas invertidas não são erro de quem preenche, são ordem trocada: o
       intervalo é o mesmo, e recusar com uma mensagem seria pedir que a pessoa
       refizesse o que o sistema já entendeu. */
    const [a, b] = inicio <= fim ? [inicio, fim] : [fim, inicio];

    escolher({ de: inicioDoDia(a), ate: fimDoDia(b), rotulo: `${curto(a)} – ${curto(b)}` });
  };

  return (
    <div ref={caixa} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-haspopup="dialog"
        title="Escolher o período do painel"
        className={`focus-ring flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-2 text-[11.5px] transition-colors ${
          aberto ? "border-accent/50 bg-accent/[0.08] text-ink" : "border-fg/[0.08] bg-fg/[0.03] text-mist hover:border-accent/40 hover:text-ink"
        }`}
      >
        <CalendarRange size={13} className="text-accent-soft" />
        {/* `MESES_EXTENSO` é minúsculo na origem — é ele que serve tanto ao
            rótulo quanto às frases corridas ("faturado · setembro de 2026").
            A maiúscula é decisão de quem exibe. */}
        <span className="first-letter:uppercase">{valor.rotulo}</span>
        <ChevronDown size={12} className={`text-faint transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-label="Escolher período"
          /* `right-0`: o seletor mora na ponta direita do cabeçalho, e um
             popover ancorado à esquerda sairia da tela no notebook. */
          className="absolute right-0 top-[calc(100%+8px)] z-40 w-[268px] rounded-2xl border border-fg/[0.1] bg-surface p-2 shadow-e3"
        >
          {/* Hoje e "todo o período" ficam FORA da rolagem dos meses: são os
              dois extremos que se procura sem pensar, e não podem subir junto
              com a lista quando alguém rolar até 2024 atrás de um mês antigo. */}
          {comHoje && (
            <button
              type="button"
              onClick={() => escolher(periodoDeHoje())}
              className={`focus-ring flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors ${
                valor.rotulo === "Hoje" ? "bg-accent/[0.12] text-accent-soft" : "text-mist hover:bg-fg/[0.06] hover:text-ink"
              }`}
            >
              <span className="min-w-0 truncate">Hoje</span>
              {valor.rotulo === "Hoje" && <Check size={13} className="shrink-0" />}
            </button>
          )}

          <button
            type="button"
            onClick={() => escolher(PERIODO_TUDO)}
            className={`focus-ring flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors ${
              mesmoIntervalo(PERIODO_TUDO, valor) ? "bg-accent/[0.12] text-accent-soft" : "text-mist hover:bg-fg/[0.06] hover:text-ink"
            }`}
          >
            <span className="min-w-0 truncate">
              {PERIODO_TUDO.rotulo}
              {opcoes.length > 0 && (
                <span className="ml-1.5 text-[10.5px] text-faint">
                  {opcoes.length} {opcoes.length === 1 ? "mês" : "meses"}
                </span>
              )}
            </span>

            {mesmoIntervalo(PERIODO_TUDO, valor) && <Check size={13} className="shrink-0" />}
          </button>

          {opcoes.length > 0 && (
            <div className="mt-1.5 border-t border-fg/[0.07] pt-1.5">
              <p className="px-2.5 pb-1 text-[10px] uppercase tracking-[0.1em] text-faint">Meses com movimento</p>

              {/* Teto de altura, não de quantidade: cortar a lista em doze
                  esconderia justamente o mês antigo que alguém veio procurar. */}
              <div className="flex max-h-[196px] flex-col overflow-y-auto pr-0.5">
                {opcoes.map(({ mes, periodo }, i) => {
                  const ativo = mesmoIntervalo(periodo, valor);
                  /* O ano vira uma faixa quando muda, em vez de repetir "de
                     2026" em cada uma das doze linhas. */
                  const viraAno = i === 0 || mes.getFullYear() !== opcoes[i - 1].mes.getFullYear();

                  return (
                    <div key={`${mes.getFullYear()}-${mes.getMonth()}`}>
                      {viraAno && (
                        <p className="px-2.5 pb-0.5 pt-1.5 text-[10px] tabular-nums text-faint first:pt-0">{mes.getFullYear()}</p>
                      )}

                      <button
                        type="button"
                        onClick={() => escolher(periodo)}
                        className={`focus-ring flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] capitalize transition-colors ${
                          ativo ? "bg-accent/[0.12] text-accent-soft" : "text-mist hover:bg-fg/[0.06] hover:text-ink"
                        }`}
                      >
                        <span className="min-w-0 truncate">{MESES_EXTENSO[mes.getMonth()]}</span>
                        {ativo && <Check size={13} className="shrink-0" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Intervalo livre — o que nenhum atalho cobre: "de 12 de maio ao
              fim da feira", "os três dias da promoção". */}
          <div className="mt-2 border-t border-fg/[0.07] pt-2">
            <p className="px-2.5 pb-1.5 text-[10px] uppercase tracking-[0.1em] text-faint">Período específico</p>

            <div className="flex items-center gap-1.5 px-1">
              <input
                type="date"
                value={de}
                max={ate || undefined}
                onChange={(e) => setDe(e.target.value)}
                aria-label="Data inicial"
                className="focus-ring min-w-0 flex-1 rounded-lg border border-fg/[0.08] bg-fg/[0.03] px-2 py-1.5 text-[11.5px] tabular-nums text-ink outline-none focus:border-accent/60"
              />
              <span className="shrink-0 text-[11px] text-faint">até</span>
              <input
                type="date"
                value={ate}
                min={de || undefined}
                onChange={(e) => setAte(e.target.value)}
                aria-label="Data final"
                className="focus-ring min-w-0 flex-1 rounded-lg border border-fg/[0.08] bg-fg/[0.03] px-2 py-1.5 text-[11.5px] tabular-nums text-ink outline-none focus:border-accent/60"
              />
            </div>

            <button
              type="button"
              onClick={aplicarLivre}
              disabled={!de || !ate}
              className="focus-ring mt-2 w-full cursor-pointer rounded-lg bg-accent px-3 py-1.5 text-[12px] text-white transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SeletorPeriodo;
