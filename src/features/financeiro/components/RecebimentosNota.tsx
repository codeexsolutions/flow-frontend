import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Pencil, Trash2, Undo2, X } from "lucide-react";

import MoneyInput from "@/shared/ui/inputs/MoneyInput";
import { FORMAS } from "@/shared/ui/PagamentoForm";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import { formatCurrency } from "@/shared/utils/currency";
import { brDate } from "@/shared/utils/date";
import FinanceiroService, { type RecebimentoNota } from "@/features/financeiro/services/financeiro.service";

/**
 * O extrato de recebimentos da nota — e o lugar de consertar o que foi errado.
 *
 * Antes desta lista, o pagamento da venda era um número só: `valor_pago`
 * crescia a cada recebimento e a forma guardada era a do último. Três coisas
 * eram impossíveis por consequência, e as três eram pedidas todo dia no balcão:
 *
 * - **Corrigir.** Digitou 300 no lugar de 30 e não havia o que editar, porque
 *   não havia linha — só um acumulado. A saída era lançar valor negativo, que
 *   o formulário recusa.
 * - **Desquitar.** Nota que passou do total virava paga e ficava paga. Aqui
 *   isso não é uma função à parte: apagar o recebimento a mais devolve a venda
 *   para "em aberto" sozinha, porque o status é recalculado da soma das linhas.
 * - **Duas formas na mesma venda.** "50 no Pix e 30 em dinheiro" agora são duas
 *   linhas com as duas formas, em vez de 80 creditados à última usada.
 *
 * **Uma linha por vez em edição.** Não é limitação de tela: recebimento é
 * dinheiro conferido contra maquininha e gaveta, e abrir três campos de valor
 * ao mesmo tempo convida a salvar o que não foi olhado.
 *
 * A baixa de parcela aparece na lista, mas não se edita por aqui — ela nasceu
 * no financeiro e mexer só de um lado deixaria a parcela paga e a nota não. A
 * linha diz de onde veio e manda a pessoa para lá.
 */

type Props = {
  /** Sem nota gravada não há extrato: o recebimento aponta para o pedido. */
  pedidoId?: string;
  /**
   * Muda quando alguém mexe no pagamento por fora (recebeu no formulário ao
   * lado, baixou uma parcela). É o gatilho da releitura — sem ele, o valor
   * novo apareceria no topo da coluna e não na lista logo abaixo.
   */
  versao?: number | string;
  /** Recarrega nota e acordo depois de corrigir ou apagar. */
  onAlterado?: () => void | Promise<void>;
  /** Encolhe tipografia e espaçamentos para a coluna de 320px da nota. */
  compacto?: boolean;
  /**
   * Quanto o pagamento da nota mudou, NA HORA do clique — antes do servidor.
   * Quem mostra o "falta receber" soma isto para o número andar junto com a
   * linha que some ou muda. Negativo = saiu dinheiro.
   */
  onOtimista?: (delta: number) => void;
  /**
   * Recebimentos lançados NESTA tela que o servidor ainda não devolveu.
   *
   * Entram na lista no clique — quem recebeu vê a linha na hora, sem a lista
   * piscar nem recarregar. Quando a lista do servidor chega com o mesmo id
   * (ele nasce na tela), a linha local some e fica a verdadeira, no mesmo
   * lugar.
   */
  locais?: RecebimentoNota[];
};

/** O dia de um instante, no formato do `<input type="date">` (local, não UTC). */
const diaDe = (iso: string): string => {
  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) return "";

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Troca o DIA de um instante, preservando a hora.
 *
 * Corrigir a data de um recebimento é dizer "isso entrou ontem", não "isso
 * entrou ontem à meia-noite": jogar a hora para 00:00 embaralharia a ordem de
 * dois recebimentos do mesmo dia — e é a ordem que decide qual forma fica
 * como a principal da nota.
 */
const comDia = (iso: string, dia: string): string => {
  const base = new Date(iso);
  const [ano, mes, d] = dia.split("-").map(Number);

  if (Number.isNaN(base.getTime()) || !ano || !mes || !d) return iso;

  base.setFullYear(ano, mes - 1, d);

  return base.toISOString();
};

type Edicao = { valor: number; forma: string; dia: string };

const RecebimentosNota = ({ pedidoId, versao, onAlterado, compacto = false, onOtimista, locais }: Props) => {
  const alert = useAlert();

  const [recebimentos, setRecebimentos] = useState<RecebimentoNota[]>([]);
  const [carregando, setCarregando] = useState(!!pedidoId);
  const [editando, setEditando] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<Edicao>({ valor: 0, forma: "", dia: "" });
  const [apagando, setApagando] = useState<string | null>(null);

  /*
   * Alterações desta lista ainda subindo para o servidor.
   *
   * Enquanto houver alguma, a releitura não mexe na lista: o total da nota
   * muda no clique (`onOtimista`), isso muda a `versao`, e uma releitura
   * naquele instante traria do servidor a linha que acabou de ser apagada —
   * ela sumia, voltava e sumia de novo. A lista do servidor entra quando a
   * última alteração terminar.
   */
  const emVoo = useRef(0);

  const carregar = useCallback(async () => {
    if (!pedidoId) {
      setRecebimentos([]);
      return;
    }

    try {
      const lista = await FinanceiroService.listarRecebimentos(pedidoId);

      if (emVoo.current === 0) setRecebimentos(lista);
    } catch {
      /* Silencioso de propósito: o extrato é o detalhe da coluna, e um alerta
         vermelho por causa dele assustaria quem só quer receber. O topo do
         painel continua mostrando o total, que vem da nota. */
      setRecebimentos([]);
    } finally {
      setCarregando(false);
    }
  }, [pedidoId]);

  useEffect(() => {
    void carregar();
  }, [carregar, versao]);

  const abrirEdicao = (r: RecebimentoNota) => {
    setApagando(null);
    setEditando(r.id);
    setEdicao({ valor: r.valor, forma: r.formaPagamento ?? FORMAS[0].id, dia: diaDe(r.pagoEm) });
  };

  /*
   * Corrigir e apagar são OTIMISTAS: a linha muda (ou some) no clique e o
   * aviso sai já; o servidor grava por baixo e a nota é recalculada quando
   * ele volta. Recusado, a lista volta como estava.
   */
  const salvar = async (r: RecebimentoNota) => {
    const antes = recebimentos;
    const dados = { valor: edicao.valor, formaPagamento: edicao.forma, pagoEm: edicao.dia ? comDia(r.pagoEm, edicao.dia) : undefined };

    const delta = dados.valor - r.valor;

    emVoo.current += 1;
    setRecebimentos((lista) => lista.map((x) => (x.id === r.id ? { ...x, valor: dados.valor, formaPagamento: dados.formaPagamento, pagoEm: dados.pagoEm ?? x.pagoEm } : x)));
    setEditando(null);
    onOtimista?.(delta);
    alert.success("Recebimento corrigido!", "A nota foi recalculada com o novo valor.");

    try {
      await FinanceiroService.alterarRecebimento(r.id, dados);
      emVoo.current -= 1;
      await carregar();
      await onAlterado?.();
    } catch (err) {
      emVoo.current -= 1;
      setRecebimentos(antes);
      onOtimista?.(-delta);
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível corrigir o recebimento."));
    }
  };

  const apagar = async (r: RecebimentoNota) => {
    const antes = recebimentos;

    emVoo.current += 1;
    setRecebimentos((lista) => lista.filter((x) => x.id !== r.id));
    setApagando(null);
    onOtimista?.(-r.valor);
    alert.success("Recebimento removido!", `${formatCurrency(r.valor)} saíram do pagamento da nota.`);

    try {
      await FinanceiroService.excluirRecebimento(r.id);
      emVoo.current -= 1;
      await carregar();
      await onAlterado?.();
    } catch (err) {
      emVoo.current -= 1;
      setRecebimentos(antes);
      onOtimista?.(r.valor);
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível remover o recebimento."));
    }
  };

  if (!pedidoId && !locais?.length) return null;

  /* As do servidor, mais as lançadas aqui que ele ainda não devolveu. */
  const lista = [...recebimentos, ...(locais ?? []).filter((l) => !recebimentos.some((r) => r.id === l.id))];

  if (carregando && lista.length === 0) return <div className="h-16 animate-pulse rounded-xl bg-fg/[0.05]" />;

  /* Nota sem recebimento não mostra caixa vazia: o formulário logo acima já
     diz que não entrou nada, e um quadro com "nenhum recebimento" seria a
     mesma frase ocupando altura numa coluna que não sobra. */
  if (lista.length === 0) return null;

  const total = recebimentos.reduce((soma, r) => soma + r.valor, 0);
  const texto = compacto ? "text-[11.5px]" : "text-[12.5px]";

  return (
    <div className="rounded-xl border border-fg/[0.07] bg-fg/[0.02] p-3">
      <header className="flex items-baseline justify-between gap-2">
        <p className={`${texto} text-ink`}>
          {recebimentos.length === 1 ? "Recebimento" : "Recebimentos"}
          <span className="ml-1.5 text-[10.5px] text-faint">{recebimentos.length}x</span>
        </p>

        <span className="shrink-0 text-[11px] tabular-nums text-success">{formatCurrency(total)}</span>
      </header>

      <ul className="mt-2.5 flex flex-col gap-1.5">
        {lista.map((r) => {
          const emEdicao = editando === r.id;
          const emConfirmacao = apagando === r.id;

          return (
            <li key={r.id} className="overflow-hidden rounded-lg border border-fg/[0.08] bg-surface">
              {/* ── Linha normal ── */}
              {!emEdicao && !emConfirmacao && (
                <div className="flex items-center gap-2 px-2.5 py-2">
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate ${compacto ? "text-[11.5px]" : "text-[12.5px]"} text-ink`}>
                      {r.formaPagamento?.trim() || "Não informado"}
                    </span>

                    <span className="block truncate text-[10px] text-faint">
                      {brDate(r.pagoEm)}
                      {/* De onde veio o dinheiro. A baixa de parcela precisa
                          dizer que é parcela: é o que explica por que os
                          botões de correção não aparecem nela. */}
                      {r.origem === "PARCELA" && <span className="text-accent-soft"> · parcela {r.parcelaNumero ?? ""}</span>}
                      {r.usuarioNome && <span> · {r.usuarioNome}</span>}
                    </span>
                  </span>

                  <span className="shrink-0 text-[12px] tabular-nums text-success">{formatCurrency(r.valor)}</span>

                  {r.editavel ? (
                    <span className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        title="Corrigir este recebimento"
                        onClick={() => abrirEdicao(r)}
                        className="focus-ring grid h-6 w-6 place-items-center rounded-md text-faint transition-colors hover:bg-fg/[0.06] hover:text-ink"
                      >
                        <Pencil size={12} />
                      </button>

                      <button
                        type="button"
                        title="Apagar este recebimento"
                        onClick={() => {
                          setEditando(null);
                          setApagando(r.id);
                        }}
                        className="focus-ring grid h-6 w-6 place-items-center rounded-md text-faint transition-colors hover:bg-danger/20 hover:text-danger"
                      >
                        <Trash2 size={12} />
                      </button>
                    </span>
                  ) : (
                    /* Sem botões, mas com o motivo: um espaço em branco onde os
                       outros têm ações lê como defeito, não como regra. */
                    <span className="shrink-0 text-[9.5px] uppercase tracking-[0.06em] text-faint" title="Baixa de parcela: ajuste pelo financeiro, nas parcelas da venda.">
                      financeiro
                    </span>
                  )}
                </div>
              )}

              {/* ── Correção ── */}
              <AnimatePresence initial={false}>
                {emEdicao && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                  >
                    <div className="flex flex-col gap-2 border-l-2 border-accent/60 px-2.5 py-2.5">
                      <MoneyInput
                        value={edicao.valor}
                        onChange={(valor) => setEdicao((e) => ({ ...e, valor }))}
                        withIcon
                        className="w-full rounded-lg border border-fg/[0.09] bg-fg/[0.03] px-2.5 py-1.5 text-[12.5px] tabular-nums text-ink outline-none transition-colors focus:border-accent/60"
                      />

                      <div className="flex gap-1.5">
                        <select
                          value={edicao.forma}
                          onChange={(e) => setEdicao((v) => ({ ...v, forma: e.target.value }))}
                          className="min-w-0 flex-1 rounded-lg border border-fg/[0.09] bg-fg/[0.03] px-2 py-1.5 text-[12px] text-ink outline-none transition-colors focus:border-accent/60"
                        >
                          {/* A forma antiga entra na lista quando não é uma das
                              seis: abrir a correção não pode trocar sozinho o
                              "Cartão" de uma venda velha por "Dinheiro". */}
                          {!FORMAS.some((f) => f.id === edicao.forma) && edicao.forma && <option value={edicao.forma}>{edicao.forma}</option>}
                          {FORMAS.map((f) => (
                            <option key={f.id} value={f.id}>{f.label}</option>
                          ))}
                        </select>

                        <input
                          type="date"
                          value={edicao.dia}
                          onChange={(e) => setEdicao((v) => ({ ...v, dia: e.target.value }))}
                          className="w-[122px] shrink-0 rounded-lg border border-fg/[0.09] bg-fg/[0.03] px-2 py-1.5 text-[12px] tabular-nums text-ink outline-none transition-colors focus:border-accent/60"
                        />
                      </div>

                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditando(null)}
                          className="focus-ring flex items-center gap-1 rounded-lg border border-fg/[0.1] px-2.5 py-1.5 text-[11.5px] text-mist transition-colors hover:text-ink disabled:opacity-40"
                        >
                          <X size={12} /> Cancelar
                        </button>

                        <button
                          type="button"
                          onClick={() => void salvar(r)}
                          disabled={!(edicao.valor > 0)}
                          className="focus-ring flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-[11.5px] text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
                        >
                          <Check size={12} /> Salvar
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Confirmação de exclusão ──
                  Dinheiro que sai do registro merece uma pergunta, e ela vem
                  na própria linha: um modal por cima esconderia justamente o
                  valor e a forma que a pessoa precisa conferir antes de dizer
                  sim. */}
              <AnimatePresence initial={false}>
                {emConfirmacao && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                  >
                    <div className="border-l-2 border-danger/60 px-2.5 py-2.5">
                      <p className="text-[11.5px] leading-relaxed text-mist">
                        Apagar <span className="tabular-nums text-ink">{formatCurrency(r.valor)}</span> em {(r.formaPagamento || "forma não informada").toLowerCase()}?
                      </p>

                      <div className="mt-2 flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setApagando(null)}
                          className="focus-ring flex items-center gap-1 rounded-lg border border-fg/[0.1] px-2.5 py-1.5 text-[11.5px] text-mist transition-colors hover:text-ink disabled:opacity-40"
                        >
                          <Undo2 size={12} /> Manter
                        </button>

                        <button
                          type="button"
                          onClick={() => void apagar(r)}
                          className="focus-ring flex items-center gap-1 rounded-lg bg-danger px-2.5 py-1.5 text-[11.5px] text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
                        >
                          <Trash2 size={12} /> Apagar
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default RecebimentosNota;
