import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CalendarRange, ChevronDown } from "lucide-react";

import Suspenso from "@/shared/ui/Suspenso";
import { MESES_EXTENSO, MONTHS } from "@/shared/utils/date";

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
  const botao = useRef<HTMLButtonElement>(null);
  const fechar = useCallback(() => setAberto(false), []);

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

  /*
   * Os meses com movimento, agrupados por ano — do mais recente ao mais antigo.
   *
   * Em grade de três, e não numa lista: doze meses de um ano cabem em quatro
   * linhas em vez de doze, e o ano vira um bloco que se lê de relance. Dentro
   * do ano a ordem é a do calendário (jan → dez), que é como se procura um mês.
   */
  const anos = useMemo(() => {
    const porAno = new Map<number, Date[]>();

    meses.forEach((m) => porAno.set(m.getFullYear(), [...(porAno.get(m.getFullYear()) ?? []), m]));

    return [...porAno.entries()].sort((x, y) => y[0] - x[0]).map(([ano, lista]) => ({ ano, meses: lista.sort((x, y) => +x - +y) }));
  }, [meses]);

  const mesmoIntervalo = (a: Periodo, b: Periodo) =>
    (a.de?.getTime() ?? null) === (b.de?.getTime() ?? null) && (a.ate?.getTime() ?? null) === (b.ate?.getTime() ?? null);

  const escolher = (periodo: Periodo) => {
    onChange(periodo);
    setAberto(false);
    botao.current?.focus();
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

  const mesAtual = periodoDoMes(new Date());

  /* Os atalhos do topo: os extremos que se procura sem pensar. */
  const atalhos = [
    ...(comHoje ? [{ chave: "hoje", rotulo: "Hoje", detalhe: "", periodo: periodoDeHoje(), ativo: valor.rotulo === "Hoje" }] : []),
    {
      chave: "mes",
      rotulo: "Este mês",
      detalhe: `${curto(mesAtual.de!).slice(0, 5)} – ${curto(mesAtual.ate!).slice(0, 5)}`,
      periodo: mesAtual,
      ativo: mesmoIntervalo(mesAtual, valor),
    },
    {
      chave: "tudo",
      rotulo: "Todo o período",
      detalhe: meses.length ? `${meses.length} ${meses.length === 1 ? "mês" : "meses"}` : "",
      periodo: PERIODO_TUDO,
      ativo: mesmoIntervalo(PERIODO_TUDO, valor),
    },
  ];

  /* Entrada em cascata do conteúdo, depois que o painel abre. */
  const entrar = (i: number) => ({
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: 0.04 + i * 0.025, duration: 0.22, ease: [0.22, 0.61, 0.36, 1] as const },
  });

  const rotuloSecao = "px-1 pb-1.5  text-[9.5px] uppercase tracking-[0.14em] text-faint";

  return (
    <>
      {/* O mesmo botão do `Select` do sistema — um seletor tem a mesma cara em
          toda tela, seja de status, de vendedor ou de período. */}
      <button
        ref={botao}
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-haspopup="dialog"
        title="Escolher o período"
        className={`focus-ring flex h-[34px] shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl border bg-fg/[0.04] px-3 text-[12px] transition-colors ${
          aberto ? "border-accent/60 text-ink" : "border-fg/[0.08] text-mist hover:border-fg/[0.16] hover:text-ink"
        }`}
      >
        <CalendarRange size={14} className="shrink-0 text-accent-soft" />
        {/* `MESES_EXTENSO` é minúsculo na origem — é ele que serve tanto ao
            rótulo quanto às frases corridas ("faturado · setembro de 2026").
            A maiúscula é decisão de quem exibe. */}
        <span className="first-letter:uppercase">{valor.rotulo}</span>
        <ChevronDown size={14} className={`shrink-0 text-muted transition-transform duration-200 ${aberto ? "rotate-180" : ""}`} />
      </button>

      {/* Pelo `Suspenso`, como o `Select`: abre animado, fecha no clique fora e
          no Esc, e não é recortado pelo cabeçalho. `right`: o seletor mora na
          ponta direita, e ancorado à esquerda sairia da tela no notebook. */}
      <Suspenso aberto={aberto} onFechar={fechar} ancora={botao} largura={300} alinhar="fim" alturaMax={560} className="!p-2.5">
        <div role="dialog" aria-label="Escolher período" className="flex flex-col gap-3">
          {/* Atalhos */}
          <div className="flex flex-col gap-1">
            {atalhos.map((a, i) => (
              <motion.button
                key={a.chave}
                type="button"
                {...entrar(i)}
                onClick={() => escolher(a.periodo)}
                aria-pressed={a.ativo}
                className={`focus-ring flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-[12.5px] transition-colors ${
                  a.ativo
                    ? "border-accent/50 bg-accent/[0.14] text-ink"
                    : "border-transparent text-mist hover:border-fg/[0.08] hover:bg-fg/[0.05] hover:text-ink"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${a.ativo ? "bg-accent shadow-[0_0_8px_rgb(var(--accent))]" : "bg-fg/20"}`} />
                  <span className="truncate">{a.rotulo}</span>
                </span>
                {a.detalhe && <span className="shrink-0 text-[10.5px] tabular-nums text-faint">{a.detalhe}</span>}
              </motion.button>
            ))}
          </div>

          {/* Meses com movimento, em grade por ano */}
          {anos.length > 0 && (
            <div className="border-t border-fg/[0.07] pt-2.5">
              <p className={rotuloSecao}>Meses com movimento</p>

              {/* Teto de altura, não de quantidade: cortar a lista esconderia
                  justamente o mês antigo que alguém veio procurar. */}
              <div className="flex max-h-[230px] flex-col gap-2.5 overflow-y-auto pr-0.5">
                {anos.map(({ ano, meses: doAno }, ia) => (
                  <motion.div key={ano} {...entrar(atalhos.length + ia)}>
                    <p className="mb-1 flex items-center gap-2 px-1 text-[10px] tabular-nums text-mist">
                      {ano}
                      <span className="h-px flex-1 bg-fg/[0.07]" />
                    </p>

                    <div className="grid grid-cols-4 gap-1">
                      {doAno.map((mes) => {
                        const periodo = periodoDoMes(mes);
                        const ativo = mesmoIntervalo(periodo, valor);

                        return (
                          <motion.button
                            key={mes.getMonth()}
                            type="button"
                            whileTap={{ scale: 0.94 }}
                            onClick={() => escolher(periodo)}
                            aria-pressed={ativo}
                            aria-label={`${MESES_EXTENSO[mes.getMonth()]} de ${ano}`}
                            className={`focus-ring cursor-pointer rounded-lg border py-1.5 text-center text-[12px] transition-colors ${
                              ativo
                                ? "border-accent/60 bg-accent text-white shadow-[0_6px_18px_-6px_rgb(var(--accent)/0.8)]"
                                : "border-fg/[0.07] bg-fg/[0.025] text-mist hover:border-accent/40 hover:bg-accent/[0.1] hover:text-ink"
                            }`}
                          >
                            {MONTHS[mes.getMonth()]}
                          </motion.button>
                        );
                      })}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Intervalo livre — o que nenhum atalho cobre: "de 12 de maio ao
              fim da feira", "os três dias da promoção". */}
          <motion.div {...entrar(atalhos.length + anos.length)} className="border-t border-fg/[0.07] pt-2.5">
            <p className={rotuloSecao}>Período específico</p>

            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={de}
                max={ate || undefined}
                onChange={(e) => setDe(e.target.value)}
                aria-label="Data inicial"
                className="focus-ring min-w-0 flex-1 rounded-lg border border-fg/[0.08] bg-fg/[0.04] px-2 py-1.5 text-[11.5px] tabular-nums text-ink outline-none transition-colors focus:border-accent/60"
              />
              <span className="shrink-0 text-[11px] text-faint">até</span>
              <input
                type="date"
                value={ate}
                min={de || undefined}
                onChange={(e) => setAte(e.target.value)}
                aria-label="Data final"
                className="focus-ring min-w-0 flex-1 rounded-lg border border-fg/[0.08] bg-fg/[0.04] px-2 py-1.5 text-[11.5px] tabular-nums text-ink outline-none transition-colors focus:border-accent/60"
              />
            </div>

            <button
              type="button"
              onClick={aplicarLivre}
              disabled={!de || !ate}
              className="focus-ring mt-2 w-full cursor-pointer rounded-lg bg-gradient-to-b from-accent to-accent-strong px-3 py-2 text-[12px] text-white transition-[filter,opacity] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Aplicar período
            </button>
          </motion.div>
        </div>
      </Suspenso>
    </>
  );
};

export default SeletorPeriodo;
