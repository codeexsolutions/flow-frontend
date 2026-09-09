import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, CalendarDays, Check, Loader2, Percent, Repeat, Trash2 } from "lucide-react";

import { Modal } from "@/shared/ui/Modal";
import PagamentoForm from "@/shared/ui/PagamentoForm";
import BotaoRecibo from "@/shared/ui/BotaoRecibo";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import { formatCurrency } from "@/shared/utils/currency";
import { dataBr, hojeIso, jurosDe, prazo, previaParcelas } from "@/shared/utils/parcelas";
import ContaService, { type AcordoVenda, type Parcela, type Recibo, type Recorrencia } from "@/features/financeiro/services/conta.service";

/**
 * Venda a prazo, dentro da nota.
 *
 * O parcelamento existia só no financeiro, onde é preciso redigitar cliente,
 * descrição e valor de uma venda que já está na tela ao lado. Quem fecha a
 * venda no balcão não vai a outra tela combinar o prazo — ou a combinação
 * acontece aqui, no instante em que o cliente diz "levo e pago dia 10", ou
 * ela não é registrada em lugar nenhum e a cobrança vira caderno.
 *
 * Duas caras, conforme o estado da nota:
 *
 * - **Sem acordo** — o formulário: em quantas vezes, a partir de que dia, de
 *   quanto em quanto tempo. A prévia mostra as datas ANTES de gravar, porque
 *   "6x mensal a partir de 10/09" é uma regra, e regra não se confere lendo.
 * - **Com acordo** — as parcelas, a que vence primeiro no topo. Receber é por
 *   parcela: é assim que o cliente paga, e é o que mantém nota e financeiro
 *   contando o mesmo dinheiro (a baixa da parcela abate a nota no servidor).
 *
 * **Juros.** Quem vende a prazo financia o cliente, e cobrar por isso é regra
 * de loja, não exceção. Sem lugar para lançar, o vendedor resolvia inflando o
 * preço dos produtos na nota — o cliente levava um documento mentindo sobre
 * quanto custa a mercadoria e o faturamento da loja passava a mentir junto.
 * Aqui a taxa é combinada por fora: a nota continua dizendo o preço de venda,
 * e o acréscimo aparece separado, com o total do prazo escrito antes de gravar.
 *
 * O "a partir de" é o que faz a regra sobreviver ao dia a dia: a loja combina
 * uma vez ("3% a partir de 4x") e as vendas curtas continuam saindo sem juros
 * sozinhas. A alternativa seria lembrar de desligar a taxa a cada 2x — e um
 * dia ninguém lembra, e o cliente do parcelamento em duas vezes paga a mais.
 */

const RECORRENCIAS: { id: Recorrencia; label: string }[] = [
  { id: "MENSAL", label: "Mensal" },
  { id: "QUINZENAL", label: "Quinzenal" },
  { id: "SEMANAL", label: "Semanal" },
];

const campo = "w-full rounded-lg border border-fg/[0.09] bg-fg/[0.03] px-2.5 py-2 text-[12.5px] text-ink outline-none transition-colors focus:border-accent/60";
const rotulo = "mb-1 block text-[10px] uppercase tracking-[0.08em] text-faint";

const TOM: Record<Parcela["situacao"], string> = {
  ABERTA: "border-fg/[0.09] text-mist",
  PARCIAL: "border-accent/40 text-accent-soft",
  PAGA: "border-success/40 text-success",
  VENCIDA: "border-danger/50 text-danger",
};

type Props = {
  /** Sem id não há venda a prazo: o acordo aponta para a nota gravada. */
  pedidoId?: string;
  /** Saldo em aberto da nota — é ele que será parcelado. */
  pendente: number;
  /** Vai no recibo da parcela: é o nome que o cliente lê no papel. */
  clienteNome?: string;
  acordo: AcordoVenda | null;
  carregando?: boolean;
  /** Recarrega acordo e nota: receber parcela mexe nos dois. */
  onAtualizar: () => void | Promise<void>;
};

const PrazoNota = ({ pedidoId, pendente, clienteNome, acordo, carregando = false, onAtualizar }: Props) => {
  const alert = useAlert();

  const [abrindo, setAbrindo] = useState(false);
  const [parcelas, setParcelas] = useState(2);
  const [primeiro, setPrimeiro] = useState(hojeIso());
  const [recorrencia, setRecorrencia] = useState<Recorrencia>("MENSAL");
  const [salvando, setSalvando] = useState(false);

  /* Juros desligado por padrão: a venda sem acréscimo é a maioria, e uma taxa
     que já vem preenchida vira juros cobrado por descuido. */
  const [comJuros, setComJuros] = useState(false);
  const [taxa, setTaxa] = useState(3);
  const [aPartirDe, setAPartirDe] = useState(2);

  const [recebendo, setRecebendo] = useState<Parcela | null>(null);
  const [recebendoSalvando, setRecebendoSalvando] = useState(false);
  const [recibo, setRecibo] = useState<Recibo | null>(null);
  const [desfazendo, setDesfazendo] = useState(false);

  /* A regra que vai para o servidor. Desligada, é `null` — e aí a prévia é a
     divisão pura, sem nenhum caminho para um acréscimo escapar. */
  const regra = comJuros && taxa > 0 ? { taxa, aPartirDe } : null;

  const acrescimo = useMemo(() => jurosDe(pendente, parcelas, regra), [pendente, parcelas, regra?.taxa, regra?.aPartirDe]);
  const totalPrazo = Math.round((pendente + acrescimo) * 100) / 100;

  const previa = useMemo(
    () => previaParcelas(pendente, parcelas, primeiro, recorrencia, regra),
    [pendente, parcelas, primeiro, recorrencia, regra?.taxa, regra?.aPartirDe],
  );

  const gerar = async () => {
    if (!pedidoId) return;

    setSalvando(true);

    try {
      await ContaService.parcelarVenda({
        pedidoId,
        parcelas,
        primeiroVencimento: primeiro,
        recorrencia: parcelas > 1 ? recorrencia : "UNICA",
        /* A taxa vai crua e o acréscimo é refeito no servidor: mandar o valor
           calculado aqui deixaria o total do acordo à mercê do que o navegador
           enviou. A prévia acima é conferência, não a fonte do número. */
        juros: regra?.taxa ?? 0,
        jurosAPartirDe: regra?.aPartirDe ?? 2,
      });

      setAbrindo(false);
      await onAtualizar();

      alert.success(
        parcelas > 1 ? `${parcelas} parcelas geradas!` : "Vencimento definido!",
        acrescimo > 0
          ? `${formatCurrency(totalPrazo)} a prazo (juros de ${formatCurrency(acrescimo)}). A primeira vence em ${dataBr(primeiro)}.`
          : `A primeira vence em ${dataBr(primeiro)}. A nota aparece como vencida se passar dessa data sem pagamento.`,
      );
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível parcelar a venda."));
    } finally {
      setSalvando(false);
    }
  };

  const receber = async (valor: number, forma: string) => {
    if (!recebendo) return;

    setRecebendoSalvando(true);

    try {
      const gerado = await ContaService.pagar(recebendo.id, { valor, formaPagamento: forma });

      setRecebendo(null);
      setRecibo(gerado);
      await onAtualizar();

      alert.success("Parcela recebida!", `Recibo nº ${gerado.reciboNumero}. O valor também abateu o saldo da nota.`);
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível registrar o recebimento."));
    } finally {
      setRecebendoSalvando(false);
    }
  };

  /**
   * Desfaz o acordo — não os recebimentos.
   *
   * Serve para o prazo combinado errado: dia trocado, parcela a mais. O que já
   * foi pago continua pago na nota, porque o dinheiro entrou de verdade; o que
   * sai é a régua de vencimentos, e outra pode ser criada em seguida.
   */
  const cancelarAcordo = async () => {
    if (!acordo) return;

    setDesfazendo(true);

    try {
      await ContaService.cancelar(acordo.id);
      await onAtualizar();
      alert.success("Acordo desfeito!", "Os vencimentos saíram. O que já foi recebido continua na nota.");
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível desfazer o acordo."));
    } finally {
      setDesfazendo(false);
    }
  };

  /* Nota nova ainda não tem a quem prender o acordo. */
  if (!pedidoId) return null;

  if (carregando) return <div className="mt-4 h-9 animate-pulse rounded-xl bg-fg/[0.05]" />;

  /* ─────────────── Com acordo: as parcelas ─────────────── */
  if (acordo) {
    const emAberto = acordo.parcelas.filter((p) => p.situacao !== "PAGA");
    const vencidas = emAberto.filter((p) => p.situacao === "VENCIDA");

    return (
      <div className="mt-4 rounded-xl border border-fg/[0.07] bg-fg/[0.02] p-3">
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11.5px] text-ink">
              <CalendarClock size={13} className="shrink-0 text-accent-soft" />
              Venda a prazo
            </p>
            <p className="mt-0.5 text-[10.5px] text-faint">
              {acordo.parcelas.length}x · {String(acordo.recorrencia).toLowerCase()}
              {/* A taxa fica escrita no acordo: quem for cobrar meses depois
                  precisa saber por que o total passa do valor da nota. */}
              {acordo.jurosPercentual > 0 && <span className="text-warning"> · {acordo.jurosPercentual}% de juros</span>}
              {vencidas.length > 0 && <span className="text-danger"> · {vencidas.length} vencida{vencidas.length > 1 ? "s" : ""}</span>}
            </p>

            {acordo.acrescimo > 0 && (
              <p className="mt-0.5 text-[10px] tabular-nums text-faint">
                {formatCurrency(acordo.valorTotal)} a prazo · {formatCurrency(acordo.acrescimo)} de acréscimo
              </p>
            )}
          </div>

          <button
            type="button"
            title="Desfazer o acordo de prazo"
            onClick={() => void cancelarAcordo()}
            disabled={desfazendo}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-danger/20 hover:text-danger disabled:opacity-40"
          >
            {desfazendo ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        </header>

        <ul className="mt-2.5 flex max-h-[240px] flex-col gap-1.5 overflow-y-auto">
          {acordo.parcelas.map((p) => {
            const quitada = p.situacao === "PAGA";
            const p2 = prazo(String(p.vencimento));

            return (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={quitada}
                  onClick={() => setRecebendo(p)}
                  className={`flex w-full items-center gap-2 rounded-lg border bg-surface px-2.5 py-2 text-left transition-colors ${TOM[p.situacao]} ${
                    quitada ? "opacity-70" : "hover:border-accent/50"
                  }`}
                >
                  <span className="w-5 shrink-0 text-center text-[11px] tabular-nums text-faint">{p.numero}</span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] tabular-nums text-ink">{dataBr(String(p.vencimento))}</span>
                    <span className="block text-[10px] text-faint">{quitada ? "recebida" : p2.texto}</span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span className="block text-[12px] tabular-nums text-ink">{formatCurrency(p.valor)}</span>
                    {p.valorPago > 0 && !quitada && <span className="block text-[10px] tabular-nums text-success">pago {formatCurrency(p.valorPago)}</span>}
                  </span>

                  {quitada ? <Check size={13} className="shrink-0 text-success" /> : <span className="shrink-0 text-[10px] uppercase tracking-wide">receber</span>}
                </button>
              </li>
            );
          })}
        </ul>

        {/* ── Recebimento de UMA parcela ── */}
        <Modal
          open={!!recebendo}
          onClose={() => !recebendoSalvando && setRecebendo(null)}
          title={recebendo ? `Parcela ${recebendo.numero}/${acordo.parcelas.length}` : ""}
          subtitle={recebendo ? `Vence em ${dataBr(String(recebendo.vencimento))}` : ""}
          maxWidth="max-w-sm"
        >
          {recebendo && (
            <PagamentoForm
              total={recebendo.valor}
              jaPago={recebendo.valorPago}
              alvo="parcela"
              salvando={recebendoSalvando}
              textoConfirmar="Registrar recebimento"
              onConfirmar={(valor, forma) => void receber(valor, forma)}
              onCancelar={() => setRecebendo(null)}
            />
          )}
        </Modal>

        {/* O recibo da parcela — é o que o cliente leva do balcão. */}
        <Modal open={!!recibo} onClose={() => setRecibo(null)} title="Parcela recebida" subtitle={recibo ? `Recibo nº ${recibo.reciboNumero}` : ""} maxWidth="max-w-sm">
          {recibo && (
            <div className="flex flex-col gap-4">
              <p className="text-[13px] leading-relaxed text-mist">
                <span className="tabular-nums text-ink">{formatCurrency(recibo.valor)}</span> recebidos na parcela {recibo.parcelaNumero}
                {recibo.formaPagamento ? ` em ${recibo.formaPagamento}` : ""}.
              </p>

              <div className="flex justify-end">
                <BotaoRecibo
                  dados={{
                    numero: String(recibo.reciboNumero),
                    clienteNome: clienteNome || acordo.descricao,
                    valor: recibo.valor,
                    formaPagamento: recibo.formaPagamento,
                    pagoEm: recibo.pagoEm,
                  }}
                />
              </div>
            </div>
          )}
        </Modal>
      </div>
    );
  }

  /* ─────────────── Sem acordo: combinar o prazo ─────────────── */

  /* Nota sem saldo não tem o que parcelar — o botão só criaria a dúvida. */
  if (pendente <= 0) return null;

  if (!abrindo) {
    return (
      <button
        type="button"
        onClick={() => setAbrindo(true)}
        className="focus-ring mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-fg/[0.14] py-2.5 text-[12px] text-mist transition-colors hover:border-accent/50 hover:text-accent-soft"
      >
        <CalendarClock size={14} />
        Vender a prazo · definir vencimento
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-fg/[0.07] bg-fg/[0.02] p-3">
      <p className="text-[11.5px] text-ink">Venda a prazo</p>
      <p className="mt-0.5 text-[10.5px] leading-relaxed text-faint">
        O saldo de <span className="tabular-nums text-mist">{formatCurrency(pendente)}</span> vira parcelas com vencimento. Passou da data sem pagar, a nota entra em <span className="text-danger">vencidas</span>.
      </p>

      {/* Os atalhos de quantidade.
          Digitar "6" no campo é um toque a mais que tocar em "6x", e são
          essas seis divisões que respondem por quase toda venda a prazo. O
          campo continua abaixo para o 18x que ninguém previu. */}
      <div className="mt-3 flex flex-wrap gap-1">
        {[2, 3, 4, 6, 10, 12].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setParcelas(n)}
            className={`rounded-md border px-2 py-1 text-[10.5px] tabular-nums transition-colors ${
              parcelas === n ? "border-accent bg-accent/[0.12] text-accent-soft" : "border-fg/[0.09] text-mist hover:border-fg/[0.2] hover:text-ink"
            }`}
          >
            {n}x
          </button>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <label className={rotulo}>Parcelas</label>
          <input
            type="number"
            min={1}
            max={120}
            value={parcelas}
            /* Trocar 1 por 6 é o gesto; sem a seleção vira "16". Mesma regra
               do `TextField` numérico e do campo de quantidade da nota. */
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setParcelas(Math.max(1, Math.min(120, Number(e.target.value) || 1)))}
            className={`${campo} tabular-nums`}
          />
        </div>

        <div>
          <label className={rotulo}>{parcelas > 1 ? "1º vencimento" : "Vencimento"}</label>
          <input type="date" value={primeiro} onChange={(e) => setPrimeiro(e.target.value)} className={campo} />
        </div>

        <div className="col-span-2">
          <label className={rotulo}>A cada</label>
          <select value={recorrencia} onChange={(e) => setRecorrencia(e.target.value as Recorrencia)} disabled={parcelas < 2} className={`${campo} disabled:opacity-40`}>
            {RECORRENCIAS.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Juros ── */}
      <div className="mt-3 border-t border-fg/[0.06] pt-2.5">
        <button
          type="button"
          onClick={() => setComJuros((v) => !v)}
          aria-pressed={comJuros}
          className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-[11.5px] transition-colors ${
            comJuros ? "border-accent/50 bg-accent/[0.08] text-ink" : "border-fg/[0.09] text-mist hover:border-fg/[0.2] hover:text-ink"
          }`}
        >
          <Percent size={12} className={comJuros ? "text-accent-soft" : "text-faint"} />
          <span className="flex-1 text-left">Cobrar juros pelo prazo</span>

          {/* Um interruptor, não um checkbox: a pergunta é "cobra ou não", e a
              resposta precisa ser lida de longe pelo estado, não pelo tique. */}
          <span className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${comJuros ? "bg-accent" : "bg-fg/[0.16]"}`}>
            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${comJuros ? "left-3.5" : "left-0.5"}`} />
          </span>
        </button>

        <AnimatePresence initial={false}>
          {comJuros && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <label className={rotulo}>Taxa (% por parcela)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={taxa}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setTaxa(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                    className={`${campo} tabular-nums`}
                  />
                </div>

                <div>
                  <label className={rotulo}>A partir de</label>
                  <select
                    value={aPartirDe}
                    onChange={(e) => setAPartirDe(Number(e.target.value))}
                    className={`${campo} tabular-nums`}
                  >
                    {[1, 2, 3, 4, 5, 6, 10, 12].map((n) => (
                      <option key={n} value={n}>{n === 1 ? "qualquer parcelamento" : `${n}x`}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* O caso em que a taxa está ligada e não vale: dito aqui, não
                  descoberto depois pela prévia que não mudou. */}
              <p className="mt-1.5 text-[10px] leading-relaxed text-faint">
                {parcelas < aPartirDe ? (
                  <>Em {parcelas}x não há juros — a taxa só vale de {aPartirDe}x em diante.</>
                ) : (
                  <>{taxa}% × {parcelas} parcelas = <span className="text-warning">{formatCurrency(acrescimo)}</span> de acréscimo.</>
                )}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* A prévia: as datas de verdade, antes de gravar. */}
      {previa.length > 0 && (
        <div className="mt-3 border-t border-fg/[0.06] pt-2.5">
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] text-faint">
            <Repeat size={11} className="text-accent-soft" />
            {previa.length === 1 ? "Vence uma vez" : `${previa.length}x ${RECORRENCIAS.find((r) => r.id === recorrencia)?.label.toLowerCase()}`}
          </p>

          {/* O número que o cliente leva anotado: quanto sai por mês e quanto
              é no fim. Com juros, o total do prazo passa do total da nota — e
              é justamente essa diferença que ele quer ver antes de aceitar. */}
          <div className="mb-2 flex items-baseline justify-between gap-2 rounded-lg bg-fg/[0.03] px-2.5 py-1.5">
            <span className="text-[11px] tabular-nums text-ink">
              {previa.length > 1 ? `${previa.length}x de ${formatCurrency(previa[previa.length - 1].valor)}` : formatCurrency(previa[0].valor)}
            </span>
            <span className="shrink-0 text-right text-[10px] text-faint">
              total <span className={`tabular-nums ${acrescimo > 0 ? "text-warning" : "text-mist"}`}>{formatCurrency(totalPrazo)}</span>
              {acrescimo > 0 && <span className="block">à vista {formatCurrency(pendente)}</span>}
            </span>
          </div>

          <div className="flex max-h-[92px] flex-wrap gap-1 overflow-y-auto">
            {previa.map((p) => (
              <span key={p.numero} className="flex items-center gap-1 rounded-md border border-fg/[0.08] bg-surface px-1.5 py-0.5 text-[10.5px] text-mist">
                <CalendarDays size={10} className="text-faint" />
                <span className="tabular-nums">{dataBr(p.vencimento)}</span>
                <span className="tabular-nums text-ink">{formatCurrency(p.valor)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setAbrindo(false)} disabled={salvando} className="flex-1 rounded-lg border border-fg/[0.1] py-2 text-[12px] text-mist transition-colors hover:text-ink disabled:opacity-50">
          Cancelar
        </button>

        <button
          type="button"
          onClick={() => void gerar()}
          disabled={salvando}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent py-2 text-[12px] text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
        >
          {salvando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          {salvando ? "Gerando…" : "Confirmar prazo"}
        </button>
      </div>
    </div>
  );
};

export default PrazoNota;
