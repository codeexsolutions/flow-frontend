import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, Check, Receipt, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import PagamentoForm from "@/shared/ui/PagamentoForm";
import PrazoNota from "@/features/vendas/components/PrazoNota";
import RecebimentosNota from "@/features/financeiro/components/RecebimentosNota";
import type { RecebimentoNota } from "@/features/financeiro/services/financeiro.service";
import { formatCurrency } from "@/shared/utils/currency";
import type { AcordoVenda } from "@/features/financeiro/services/conta.service";

/**
 * A coluna de recebimento da nota.
 *
 * Saiu de dentro do `Invoice` por dois motivos, nessa ordem: lá ela era um
 * bloco de JSX no meio de mil linhas de nota, e todo ajuste no painel obrigava
 * a reler a venda inteira para achar onde mexer. E porque ela deixou de ser um
 * formulário empilhado para virar uma tela com navegação — coisa que precisa
 * de estado próprio.
 *
 * **Por que abas.** Antes era uma pilha: recebimento avulso em cima, prazo
 * embaixo, um empurrando o outro. Numa coluna de 320px isso significa rolar
 * para ver as parcelas e rolar de volta para receber — e as duas coisas nunca
 * são feitas ao mesmo tempo. São modos: ou se está recebendo agora, ou se está
 * combinando o prazo, ou se está conferindo a conta. Cada modo ocupa a coluna
 * inteira, e o menu diz que os outros dois existem — que é justamente o que a
 * pilha não fazia: o parcelamento vivia abaixo da dobra, invisível para quem
 * não rolava.
 *
 * **O cabeçalho é o número, não o nome.** "Falta receber" em corpo grande com
 * a barra de progresso ao lado responde à pergunta que traz a pessoa aqui, sem
 * ela precisar entrar em nenhuma aba.
 */

type Aba = "receber" | "parcelas" | "resumo";

const ABAS: { id: Aba; label: string; icone: LucideIcon }[] = [
  { id: "receber", label: "Receber", icone: Wallet },
  { id: "parcelas", label: "Parcelas", icone: CalendarClock },
  { id: "resumo", label: "Resumo", icone: Receipt },
];

type Props = {
  /** Sem id a nota ainda não existe no servidor: não há o que receber. */
  pedidoId?: string;
  total: number;
  totalPago: number;
  totalBruto: number;
  totalDesconto: number;
  formaPagamento: string;
  statusPedido?: string;
  clienteNome?: string;
  acordo: AcordoVenda | null;
  carregandoAcordo: boolean;
  salvandoPagamento: boolean;
  /** Logo depois de salvar: o painel se anuncia como o próximo passo. */
  destacar: boolean;
  onPagar: (valor: number, forma: string) => void | Promise<void>;
  onAtualizar: () => void | Promise<void>;
  /**
   * A nota acabou de ser gerada e o servidor ainda está gravando. O painel já
   * abre para receber — o pagamento espera o id por baixo, ver `Invoice`.
   */
  preparando?: boolean;
  /** O pagamento mudou no clique (recebimento corrigido ou apagado). */
  onOtimista?: (delta: number) => void;
  /** Recebimentos lançados agora, ainda subindo — ver `RecebimentosNota`. */
  recebimentosLocais?: RecebimentoNota[];
  /** Receber está travado — e por quê. Ver `itensGravados`, na nota. */
  travaPagamento?: string | null;
};

const PainelPagamento = ({
  pedidoId,
  total,
  totalPago,
  totalBruto,
  totalDesconto,
  formaPagamento,
  statusPedido,
  clienteNome,
  acordo,
  carregandoAcordo,
  salvandoPagamento,
  destacar,
  onPagar,
  onAtualizar,
  preparando = false,
  onOtimista,
  recebimentosLocais,
  travaPagamento = null,
}: Props) => {
  const [aba, setAba] = useState<Aba>("receber");

  /* Quem escolheu uma aba manda nela: o salto automático abaixo é para quem
     ABRIU a nota, não para quem está olhando outra coisa quando o acordo
     chega do servidor. */
  const escolheu = useRef(false);

  const pendente = Math.max(Math.round((total - totalPago) * 100) / 100, 0);
  const quitada = total > 0 && pendente <= 0;

  const parcelasAbertas = useMemo(() => (acordo?.parcelas ?? []).filter((p) => p.situacao !== "PAGA"), [acordo]);
  const vencidas = useMemo(() => parcelasAbertas.filter((p) => p.situacao === "VENCIDA").length, [parcelasAbertas]);

  /* Nota parcelada abre nas parcelas: com acordo, receber é POR parcela, e
     cair no recebimento avulso seria abrir na aba que não se deve usar. */
  useEffect(() => {
    if (acordo && !escolheu.current) setAba("parcelas");
  }, [acordo?.id]);

  const irPara = (destino: Aba) => {
    escolheu.current = true;
    setAba(destino);
  };

  const progresso = total > 0 ? Math.min(Math.max(totalPago / total, 0), 1) : 0;

  return (
    /* `bg-fg/[0.02]` é o que descola a coluna da nota clara ao lado. O
       gradiente do cabeçalho entra por cima dele, não no lugar. */
    <aside
      id="painel-pagamento"
      className={`order-first hidden w-[320px] shrink-0 flex-col border-r border-fg/[0.06] bg-fg/[0.02] lg:flex ${
        destacar ? "ring-2 ring-inset ring-accent/50" : ""
      }`}
    >
      {/*
       * Cabeçalho.
       *
       * O gradiente é fino de propósito — o suficiente para a coluna se
       * descolar da nota branca ao lado sem virar uma segunda superfície
       * competindo com o documento, que é o que a pessoa veio ler.
       */}
      <header className="relative shrink-0 overflow-hidden border-b border-fg/[0.06] px-4 py-4">
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${quitada ? "from-success/[0.10]" : "from-accent/[0.10]"} to-transparent`} />

        <div className="relative">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10.5px] uppercase tracking-[0.1em] text-faint">{pendente > 0 ? "Falta receber" : "Recebido"}</p>

            {/* O status da nota, do tamanho de um selo: informação de canto. */}
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9.5px] uppercase tracking-[0.08em] ${
              quitada ? "bg-success/15 text-success" : pendente > 0 && pedidoId ? "bg-warning/15 text-warning" : "bg-fg/[0.06] text-faint"
            }`}>
              {statusPedido ? statusPedido.toLowerCase() : "nova nota"}
            </span>
          </div>

          <motion.p
            key={pendente}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className={`mt-1 text-[26px] leading-none tracking-tight tabular-nums ${pendente > 0 ? "text-warning" : "text-success"}`}
          >
            {formatCurrency(pendente > 0 ? pendente : totalPago)}
          </motion.p>

          {/*
           * A barra de progresso.
           *
           * Dois números ("recebido de total") exigem uma subtração para virar
           * a resposta "estou perto?". A barra dá a mesma resposta sem conta
           * nenhuma, e cresce a cada recebimento — o retorno visível de quem
           * acabou de lançar.
           */}
          <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-fg/[0.08]">
            <motion.div
              initial={false}
              animate={{ width: `${progresso * 100}%` }}
              transition={{ type: "spring", stiffness: 220, damping: 32 }}
              className={`h-full rounded-full ${quitada ? "bg-success" : "bg-accent"}`}
            />
          </div>

          <p className="mt-1.5 flex items-center justify-between gap-2 text-[10.5px] text-faint">
            <span className="tabular-nums">{formatCurrency(totalPago)} de {formatCurrency(total)}</span>
            {acordo && (
              <span className={vencidas > 0 ? "text-danger" : ""}>
                {vencidas > 0 ? `${vencidas} vencida${vencidas > 1 ? "s" : ""}` : `${parcelasAbertas.length} em aberto`}
              </span>
            )}
          </p>
        </div>
      </header>

      {/*
       * O menu.
       *
       * A pílula ativa DESLIZA entre as abas (`layoutId`) em vez de piscar de
       * lugar: o olho acompanha para onde foi e não perde o ponto de leitura.
       * É o mesmo gesto da janela do gráfico no painel — dois lugares do
       * sistema que trocam de modo se comportam igual.
       */}
      <nav className="shrink-0 px-3 pt-3">
        <div className="flex items-center gap-0.5 rounded-xl border border-fg/[0.08] bg-fg/[0.03] p-0.5">
          {ABAS.map((a) => {
            const Icone = a.icone;
            const on = aba === a.id;

            /* O contador só aparece quando há o que contar — um "0" ao lado de
               "Parcelas" seria ruído com aparência de aviso. */
            const marca = a.id === "parcelas" && parcelasAbertas.length > 0 ? parcelasAbertas.length : null;

            return (
              <button
                key={a.id}
                type="button"
                onClick={() => irPara(a.id)}
                aria-pressed={on}
                className="focus-ring relative flex flex-1 items-center justify-center gap-1.5 rounded-[10px] px-2 py-1.5 text-[11px] transition-colors"
              >
                {on && (
                  <motion.span
                    layoutId="aba-painel-pagamento"
                    transition={{ type: "spring", stiffness: 520, damping: 38 }}
                    className="absolute inset-0 rounded-[10px] bg-accent"
                  />
                )}

                <span className={`relative flex items-center gap-1.5 ${on ? "text-white" : "text-mist"}`}>
                  <Icone size={12.5} />
                  {a.label}

                  {marca !== null && (
                    <span className={`rounded-full px-1 text-[9px] tabular-nums ${
                      on ? "bg-white/25 text-white" : vencidas > 0 ? "bg-danger/20 text-danger" : "bg-fg/[0.08] text-faint"
                    }`}>
                      {marca}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!pedidoId && !preparando ? (
          <p className="rounded-xl border border-warning/30 bg-warning/[0.08] px-3.5 py-3 text-[12px] leading-relaxed text-warning">
            Salve a nota antes de registrar pagamentos.
          </p>
        ) : (
          /* `mode="wait"` para a aba que sai não dividir a coluna com a que
             entra: em 320px o cruzamento vira embaralhado, não transição. */
          <AnimatePresence mode="wait">
            <motion.div
              key={aba}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {aba === "receber" && (
                /* O formulário em cima, o extrato embaixo — nessa ordem porque
                   o gesto comum é lançar, e o incomum é conferir o que já foi
                   lançado. */
                <div className="flex flex-col gap-3">
                  {destacar && (
                    <p className="rounded-xl border border-accent/30 bg-accent/[0.1] px-3.5 py-2.5 text-[12px] leading-relaxed text-accent-soft">
                      Nota salva! Informe como o cliente pagou para quitar.
                    </p>
                  )}

                  {/*
                   * Com acordo de prazo, o recebimento avulso sai da frente.
                   *
                   * São dois caminhos para o mesmo dinheiro: lançar solto aqui
                   * abateria a nota sem baixar nenhuma parcela, e a mesma venda
                   * apareceria paga na lista e vencida no financeiro. Havendo
                   * parcelas, recebe-se POR parcela — que é como o cliente paga.
                   *
                   * A aba continua existindo em vez de sumir: sumir deixaria o
                   * menu mudando de tamanho conforme a nota, e quem procurasse
                   * "Receber" acharia que perdeu a função. Ela explica e leva.
                   */}
                  {acordo ? (
                    <div className="rounded-xl border border-fg/[0.08] bg-fg/[0.02] p-3.5">
                      <p className="text-[12px] leading-relaxed text-mist">
                        Esta venda está parcelada. O recebimento é feito <span className="text-ink">por parcela</span> — assim a baixa vale na nota e no financeiro ao mesmo tempo.
                      </p>

                      <button
                        type="button"
                        onClick={() => irPara("parcelas")}
                        className="focus-ring mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent py-2 text-[12px] text-white transition-all hover:brightness-110 active:scale-[0.98]"
                      >
                        <CalendarClock size={13} />
                        Ver as parcelas
                      </button>
                    </div>
                  ) : quitada ? (
                    /* Nota quitada não pede valor: o formulário aqui só ofereceria
                       um campo que recusa qualquer número. */
                    <div className="flex flex-col items-center gap-2 rounded-xl border border-success/25 bg-success/[0.08] px-3.5 py-5 text-center">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-success/15 text-success">
                        <Check size={17} />
                      </span>
                      <p className="text-[12.5px] text-success">Nota quitada</p>
                      {/* "recebidos em dinheiro" era mentira na venda paga em
                          duas formas: a nota guarda só a última. O extrato
                          logo abaixo diz a verdade inteira, uma linha por
                          recebimento — e é lá que se desfaz o que foi lançado
                          errado. */}
                      <p className="text-[11px] leading-relaxed text-faint">
                        {formatCurrency(totalPago)} recebidos. O extrato abaixo diz como.
                      </p>
                    </div>
                  ) : travaPagamento ? (
                    /* Itens mudados e não salvos: receber agora gravaria o
                       pagamento contra uma nota que o servidor não conhece. */
                    <p className="rounded-xl border border-warning/30 bg-warning/[0.08] px-3.5 py-3 text-[12px] leading-relaxed text-warning">{travaPagamento}</p>
                  ) : (
                    <PagamentoForm
                      total={total}
                      jaPago={totalPago}
                      compacto
                      salvando={salvandoPagamento}
                      textoConfirmar="Registrar pagamento"
                      onConfirmar={(valor, forma) => void onPagar(valor, forma)}
                    />
                  )}

                  {/*
                   * O que já entrou, linha a linha — e o único lugar de
                   * desfazer.
                   *
                   * Ele mora AQUI, e não numa quarta aba, porque quem lançou
                   * 300 no lugar de 30 percebe o erro no instante seguinte ao
                   * de receber: a correção precisa estar embaixo do formulário
                   * que a causou, não atrás de um clique em outro menu. E é o
                   * que responde à nota quitada por engano — apagar o
                   * lançamento devolve a venda para "em aberto", sem botão de
                   * "desquitar" nenhum.
                   *
                   * `versao={totalPago}` faz a lista reler quando o pagamento
                   * muda por fora (recebimento novo, baixa de parcela).
                   */}
                  <RecebimentosNota pedidoId={pedidoId} versao={totalPago} onAlterado={onAtualizar} onOtimista={onOtimista} locais={recebimentosLocais} compacto />
                </div>
              )}

              {aba === "parcelas" && (
                /* `-mt-4` come o `mt-4` que o `PrazoNota` traz para quando é
                   empilhado embaixo do formulário. Aqui ele é o conteúdo da
                   aba e começa no topo, como qualquer outro. */
                <div className="-mt-4">
                  {pedidoId && (
                  <PrazoNota
                    pedidoId={pedidoId}
                    pendente={pendente}
                    clienteNome={clienteNome}
                    acordo={acordo}
                    carregando={carregandoAcordo}
                    onAtualizar={onAtualizar}
                  />
                  )}

                  {/* Nota quitada e sem acordo: o `PrazoNota` não renderiza
                      nada (não há saldo a parcelar) e a aba ficaria em branco,
                      parecendo defeito. */}
                  {!acordo && !carregandoAcordo && pendente <= 0 && (
                    <p className="mt-4 rounded-xl border border-fg/[0.07] bg-fg/[0.02] px-3.5 py-3 text-[11.5px] leading-relaxed text-faint">
                      Nota sem saldo em aberto — não há o que parcelar.
                    </p>
                  )}
                </div>
              )}

              {aba === "resumo" && (
                <ResumoConta
                  totalBruto={totalBruto}
                  totalDesconto={totalDesconto}
                  total={total}
                  totalPago={totalPago}
                  pendente={pendente}
                  formaPagamento={formaPagamento}
                  acordo={acordo}
                />
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </aside>
  );
};

/**
 * A conta da nota, linha a linha.
 *
 * O resumo em blocos no corpo da nota é para o CLIENTE ler — três ou seis
 * cartões lado a lado, curtos. Aqui é para quem opera: as mesmas grandezas na
 * vertical, com o que entra e o que sai alinhado à direita, que é como se
 * confere dinheiro. E é onde cabe o que não pertence ao documento — o total do
 * prazo com juros, que é maior que a nota de propósito.
 */
const ResumoConta = ({
  totalBruto,
  totalDesconto,
  total,
  totalPago,
  pendente,
  formaPagamento,
  acordo,
}: {
  totalBruto: number;
  totalDesconto: number;
  total: number;
  totalPago: number;
  pendente: number;
  formaPagamento: string;
  acordo: AcordoVenda | null;
}) => {
  const linhas: { rotulo: string; valor: string; cor?: string; forte?: boolean }[] = [
    { rotulo: "Total bruto", valor: formatCurrency(totalBruto) },
    ...(totalDesconto > 0 ? [{ rotulo: "Desconto", valor: `- ${formatCurrency(totalDesconto)}`, cor: "text-warning" }] : []),
    { rotulo: "Total da nota", valor: formatCurrency(total), forte: true },
    { rotulo: "Recebido", valor: formatCurrency(totalPago), cor: totalPago > 0 ? "text-success" : undefined },
    { rotulo: "Em aberto", valor: formatCurrency(pendente), cor: pendente > 0 ? "text-warning" : "text-success", forte: true },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-fg/[0.07] bg-fg/[0.02] px-3.5 py-1">
        {linhas.map((l) => (
          <div key={l.rotulo} className="flex items-baseline justify-between gap-3 border-b border-fg/[0.05] py-2 last:border-0">
            <span className={`text-[11.5px] ${l.forte ? "text-mist" : "text-faint"}`}>{l.rotulo}</span>
            <span className={`shrink-0 tabular-nums ${l.forte ? "text-[13px]" : "text-[12px]"} ${l.cor ?? "text-ink"}`}>{l.valor}</span>
          </div>
        ))}
      </div>

      {/* O prazo, quando existe. Fora do quadro acima porque não é a conta da
          nota: é a conta do financiamento, que vale mais que ela. */}
      {acordo && (
        <div className="rounded-xl border border-fg/[0.07] bg-fg/[0.02] px-3.5 py-1">
          <div className="flex items-baseline justify-between gap-3 border-b border-fg/[0.05] py-2">
            <span className="text-[11.5px] text-faint">Parcelamento</span>
            <span className="shrink-0 text-[12px] tabular-nums text-ink">
              {acordo.parcelas.length}x · {String(acordo.recorrencia).toLowerCase()}
            </span>
          </div>

          {acordo.acrescimo > 0 && (
            <div className="flex items-baseline justify-between gap-3 border-b border-fg/[0.05] py-2">
              <span className="text-[11.5px] text-faint">Juros ({acordo.jurosPercentual}% por parcela)</span>
              <span className="shrink-0 text-[12px] tabular-nums text-warning">+ {formatCurrency(acordo.acrescimo)}</span>
            </div>
          )}

          <div className="flex items-baseline justify-between gap-3 py-2">
            <span className="text-[11.5px] text-mist">Total a prazo</span>
            <span className="shrink-0 text-[13px] tabular-nums text-ink">{formatCurrency(acordo.valorTotal)}</span>
          </div>
        </div>
      )}

      <div className="flex items-baseline justify-between gap-3 px-1">
        <span className="text-[11.5px] text-faint">Forma de pagamento</span>
        <span className="shrink-0 text-[12px] text-mist">{formaPagamento}</span>
      </div>
    </div>
  );
};

export default PainelPagamento;
