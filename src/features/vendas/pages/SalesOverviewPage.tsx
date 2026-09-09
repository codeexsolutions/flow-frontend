import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle, AlertTriangle, ArrowDownCircle, ArrowUpCircle, CalendarClock, CheckCircle,
  ChevronRight, DollarSign, ListChecks, ShoppingCart, Star, TrendingUp, Wallet,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

import { Modal } from "@/shared/ui/Modal";
import Invoice from "@/features/vendas/components/Invoice";
import { ChartTip, Kpi, Legenda, Painel, PainelVazio, type Tom, KpiFaixa } from "@/shared/ui/Painel";
import { usePainelCores } from "@/shared/ui/painelCores";
import { formatCurrency } from "@/shared/utils/currency";
import { estaAberto, estaCancelado, estaQuitado, totalDoPedido, recebidoDoPedido, valorPendenteDoPedido } from "@/shared/domain/pedido";
import { noPeriodo, serieDeVendas, vendasAtivas } from "@/shared/domain/serieVendas";
import { PERIODO_TUDO, type Periodo } from "@/shared/ui/SeletorPeriodo";
import useVendaStore from "@/features/vendas/store/venda.store";
import useFinanceiroStore from "@/features/financeiro/store/financeiro.store";
import useContasStore from "@/features/financeiro/store/contas.store";
import { useRecurso } from "@/shared/plano/plano.store";

/**
 * Visão geral — o panorama da seção inteira.
 *
 * Era só de vendas, e o financeiro tinha um panorama próprio com metade dos
 * mesmos números: "recebido no mês" aparecia nos dois, somado de jeitos
 * diferentes, e quem conferia o dia ia e voltava entre as duas telas para
 * montar a conta na cabeça. Aqui a pergunta é uma: **como a loja está**. O que
 * vendeu, o que entrou, o que ainda vem — na mesma tela, na mesma moldura.
 *
 * Os cartões de dinheiro só existem para quem tem o módulo no plano. Não é
 * segurança (quem barra é a API): é não prometer um número que a pessoa não
 * pode abrir.
 */

type TopCliente = {
  clienteId: string;
  nome: string;
  total: number;
  pedidos: number;
};

type NotaAberta = { id?: string; clienteId: string; nome?: string };

/**
 * O recorte vem de FORA.
 *
 * O seletor mora na barra do cartão de vendas (`SalesListPage`), junto das
 * abas — é lá que ele governa o que está abaixo, e um controle desses dentro
 * de um dos painéis diria, pela posição, que vale só para aquele painel.
 * Sem prop, o panorama mostra a loja inteira, que é o padrão do Início.
 */
type Props = { periodo?: Periodo };

const SalesOverviewPage = ({ periodo = PERIODO_TUDO }: Props) => {
  const navigate = useNavigate();
  const C = usePainelCores();

  const vendas = useVendaStore((s) => s.vendas);
  const fetchVendas = useVendaStore((s) => s.fetchVendas);

  /* `useRecurso` e não `usePlano(s => s.recurso)`: aquele devolve a FUNÇÃO, de
     identidade estável, e a tela não re-renderizaria quando o plano chegasse —
     os cartões de dinheiro ficariam com o valor do primeiro render. */
  const temFinanceiro = useRecurso("financeiro");

  const resumoCaixa = useFinanceiroStore((s) => s.resumo);
  const fetchFinanceiro = useFinanceiroStore((s) => s.fetchFinanceiro);
  const resumoContas = useContasStore((s) => s.resumo);
  const fetchContas = useContasStore((s) => s.fetchContas);

  const [notaAberta, setNotaAberta] = useState<NotaAberta | null>(null);

  useEffect(() => {
    fetchVendas();
  }, [fetchVendas]);

  /* Caixa e contas só são buscados por quem tem o módulo: sem o plano a API
     responde 402, e o erro apareceria no panorama de quem nem pediu. */
  useEffect(() => {
    if (!temFinanceiro) return;

    fetchFinanceiro();
    fetchContas();
  }, [temFinanceiro, fetchFinanceiro, fetchContas]);

  const abrirNota = (nota: NotaAberta) => setNotaAberta(nota);
  const fecharNota = () => {
    setNotaAberta(null);
    fetchVendas(true);
  };

  const dados = useMemo(() => {
    const naoCanceladas = vendasAtivas(vendas);

    /*
     * Tudo abaixo fala do RECORTE, e não do mês corrente.
     *
     * Os números eram fixos no mês em curso e a curva, nos doze meses do ano
     * atual — o painel só sabia responder "como está indo o mês?". Com o
     * seletor na barra, quem pergunta "como foi março" ou "quanto a loja
     * faturou desde que abriu" recebe a resposta na mesma tela, e os rótulos
     * dos cartões passam a dizer de qual período estão falando.
     */
    const doPeriodo = noPeriodo(naoCanceladas, periodo);

    const faturadoMes = doPeriodo.reduce((acc, v) => acc + totalDoPedido(v), 0);
    const recebidoMes = doPeriodo.reduce((acc, v) => acc + recebidoDoPedido(v), 0);
    const percentualRecebido = faturadoMes ? (recebidoMes / faturadoMes) * 100 : 0;

    /* A receber ignora o recorte de propósito: dívida é do AGORA. Quem deve
       de março continua devendo enquanto a tela mostra junho — mesma regra do
       painel de Início. */
    const aReceberTotal = naoCanceladas.reduce((acc, v) => acc + valorPendenteDoPedido(v), 0);

    const { serie: porMes, porDia } = serieDeVendas(vendas, periodo);

    const pagas = doPeriodo.filter(estaQuitado).length;
    const pendentes = doPeriodo.filter(estaAberto).length;
    const canceladas = noPeriodo(vendas.filter(estaCancelado), periodo).length;

    // Top clientes
    const porCliente = new Map<string, TopCliente>();
    doPeriodo.forEach((v) => {
      const atual = porCliente.get(v.clienteId) ?? {
        clienteId: v.clienteId,
        nome: v.nomeCliente,
        total: 0,
        pedidos: 0,
      };
      atual.total += totalDoPedido(v);
      atual.pedidos += 1;
      porCliente.set(v.clienteId, atual);
    });
    const topClientes = Array.from(porCliente.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    return {
      faturadoMes,
      recebidoMes,
      aReceberTotal,
      totalVendas: naoCanceladas.length,
      vendasNoMes: doPeriodo.length,
      percentualRecebido,
      porMes,
      porDia,
      pagas,
      pendentes,
      canceladas,
      topClientes,
    };
  }, [vendas, periodo]);

  const abrirPorCliente = (c: TopCliente) => {
    const doCliente = vendas.filter((v) => v.clienteId === c.clienteId).sort((a, b) => +new Date(b.pedido.dataPedido) - +new Date(a.pedido.dataPedido));
    const alvo = doCliente[0];
    if (!alvo) return;
    abrirNota({ id: alvo.pedido.pedidoId, clienteId: alvo.clienteId, nome: alvo.nomeCliente });
  };

  const axisProps = {
    tick: { fontSize: 11, fill: C.tick },
    axisLine: false as const,
    tickLine: false as const,
  };

  const maiorTotal = dados.topClientes[0]?.total ?? 0;
  const statusData = [
    { name: "Pago", value: dados.pagas, color: C.green },
    { name: "Pendente", value: dados.pendentes, color: C.red },
    { name: "Cancelado", value: dados.canceladas, color: C.amber },
  ].filter((s) => s.value > 0);

  const compromissos = [
    {
      destino: "/financeiro/contas",
      tom: "danger" as Tom,
      icone: <ArrowUpCircle size={15} />,
      label: "A pagar",
      total: resumoContas?.aPagar ?? 0,
      vencido: resumoContas?.vencidoPagar ?? 0,
      semana: resumoContas?.pagarSemana ?? 0,
    },
    {
      destino: "/vendas",
      tom: "success" as Tom,
      icone: <ArrowDownCircle size={15} />,
      label: "A receber",
      total: resumoContas?.aReceber ?? 0,
      vencido: resumoContas?.vencidoReceber ?? 0,
      semana: resumoContas?.receberSemana ?? 0,
    },
  ];

  return (
    /*
     * `shrink-0` do topo até cada faixa.
     *
     * O panorama era `flex-1` dentro de um corpo que rola e, desde que a
     * lista de vendas passou a morar na mesma tela, os dois disputavam a
     * mesma altura: o flex encolhia as faixas abaixo do próprio mínimo e os
     * quatro painéis apareciam CORTADOS a uns 55px, sobrepostos, com os
     * gráficos invisíveis. Quem manda na altura aqui é o conteúdo; quem rola
     * é a página.
     */
    <div className="flex shrink-0 flex-col gap-3">
      {/* ---------- Os quatro números do mês ---------- */}
      <KpiFaixa className="stagger shrink-0 xl:grid-cols-4">
        {/* O rótulo diz de QUE período o número fala — mesma fórmula do Início.
            Sem isso, quem abriu março no seletor lê "faturado este mês" com o
            valor de março e leva o número errado para a conversa. */}
        <Kpi tone="accent" icon={<DollarSign size={17} />} label={`Faturado · ${periodo.rotulo.toLowerCase()}`} value={formatCurrency(dados.faturadoMes)} hint={`${dados.vendasNoMes} ${dados.vendasNoMes === 1 ? "venda" : "vendas"}`} />
        <Kpi tone="success" icon={<CheckCircle size={17} />} label={`Recebido · ${periodo.rotulo.toLowerCase()}`} value={formatCurrency(dados.recebidoMes)} hint={`${dados.percentualRecebido.toFixed(0)}% do faturado`} />
        <Kpi tone="danger" icon={<AlertCircle size={17} />} label="A receber de clientes" value={formatCurrency(dados.aReceberTotal)} hint={`${dados.pendentes} ${dados.pendentes === 1 ? "nota aberta" : "notas abertas"}`} onClick={() => navigate("/vendas")} />

        {/* O quarto cartão muda com o plano: com o módulo, o número que o dono
            procura é o saldo em caixa; sem ele, o volume de vendas. */}
        {temFinanceiro ? (
          <Kpi tone="warning" icon={<Wallet size={17} />} label="Saldo em caixa" value={formatCurrency(resumoCaixa?.saldoCaixa ?? 0)} hint="Acumulado · abrir o caixa" onClick={() => navigate("/financeiro")} />
        ) : (
          <Kpi tone="warning" icon={<ShoppingCart size={17} />} label="Total de vendas" value={String(dados.totalVendas)} hint={`${dados.vendasNoMes} no período`} />
        )}
      </KpiFaixa>

      {/* ---------- Faturamento anual + status ---------- */}
      <div className="grid shrink-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <Painel
          icon={<TrendingUp size={15} />}
          tone="accent"
          title="Faturamento"
          /* A granularidade muda com o recorte (ver `serieDeVendas`), e o
             subtítulo precisa dizer qual saiu — senão "12" no eixo tanto pode
             ser dezembro quanto o dia 12. */
          sub={`${dados.porDia ? "Dia a dia" : "Mês a mês"} · ${periodo.rotulo.toLowerCase()}`}
          className="min-h-[300px]"
          footer={<Legenda itens={[{ color: C.accent, label: "Faturado" }, { color: C.green, label: "Recebido" }]} />}
        >
          <div className="h-full min-h-[240px] w-full py-3 pr-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dados.porMes} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="gFat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.accent} stopOpacity={0.28} />
                    <stop offset="95%" stopColor={C.accent} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gRec" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.green} stopOpacity={0.22} />
                    <stop offset="95%" stopColor={C.green} stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                <XAxis dataKey="name" {...axisProps} interval="preserveStartEnd" minTickGap={18} />
                <YAxis {...axisProps} width={44} tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
                <Tooltip content={<ChartTip />} />

                <Area type="monotone" dataKey="faturado" name="Faturado" stroke={C.accent} strokeWidth={2} fill="url(#gFat)" />
                <Area type="monotone" dataKey="recebido" name="Recebido" stroke={C.green} strokeWidth={2} fill="url(#gRec)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Painel>

        <Painel icon={<CheckCircle size={15} />} tone="success" title="Status das vendas" sub={`${dados.pagas + dados.pendentes + dados.canceladas} ${dados.pagas + dados.pendentes + dados.canceladas === 1 ? "nota" : "notas"} · ${periodo.rotulo.toLowerCase()}`}>
          {statusData.length === 0 ? (
            <PainelVazio icon={<CheckCircle size={19} />} title="Nenhuma venda ainda" />
          ) : (
            <div className="flex h-full min-h-[200px] items-center gap-2 p-4">
              <div className="h-full min-h-[130px] flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius="56%" outerRadius="88%" paddingAngle={3} dataKey="value">
                      {statusData.map((s) => (
                        <Cell key={s.name} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTip formatar={(v) => `${v} ${v === 1 ? "nota" : "notas"}`} />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <ul className="flex w-28 flex-col gap-2">
                {[
                  { color: C.green, label: "Pago", value: dados.pagas },
                  { color: C.red, label: "Pendente", value: dados.pendentes },
                  { color: C.amber, label: "Cancelado", value: dados.canceladas },
                ].map(({ color, label, value }) => (
                  <li key={label} className="flex items-center justify-between text-[11.5px]">
                    <span className="flex items-center gap-2 text-mist">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
                      {label}
                    </span>
                    <span className="nums text-ink">{value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Painel>
      </div>

      {/* ---------- Top clientes + compromissos ---------- */}
      <div className={`grid shrink-0 gap-3 ${temFinanceiro ? "grid-cols-1 xl:grid-cols-2" : "grid-cols-1"}`}>
        <Painel icon={<Star size={15} />} tone="warning" title="Top clientes" sub={dados.topClientes.length > 0 ? `Os ${dados.topClientes.length} que mais compraram` : undefined} className="min-h-[220px]" bodyClassName="overflow-y-auto">
          {dados.topClientes.length === 0 ? (
            <PainelVazio icon={<Star size={19} />} title="Sem dados para exibir" description="Assim que houver venda, os melhores clientes aparecem aqui." />
          ) : (
            <div className="flex flex-col gap-2 p-3">
              {dados.topClientes.map((c, i) => {
                const pct = maiorTotal > 0 ? (c.total / maiorTotal) * 100 : 0;

                return (
                  <button key={c.clienteId} onClick={() => abrirPorCliente(c)} className="focus-ring flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-fg/[0.06] bg-fg/[0.02] p-2 text-left transition-colors hover:bg-fg/[0.06]">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/[0.2] text-[10px] text-accent-soft">{i + 1}</span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[12px] text-ink">{c.nome}</span>
                        <span className="nums shrink-0 text-[12px] text-success">{formatCurrency(c.total)}</span>
                      </span>
                      <span className="mt-1 flex items-center gap-2">
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-fg/[0.05]">
                          <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(pct, 3)}%` }} />
                        </span>
                        <span className="shrink-0 text-[10px] text-muted">
                          {c.pedidos} {c.pedidos === 1 ? "venda" : "vendas"}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Painel>

        {/* O que ainda vem — a outra metade da pergunta "como estou": os
            cartões de cima dizem o que já aconteceu, isto diz o que está
            marcado. Cada linha abre a aba onde se resolve. */}
        {temFinanceiro && (
          <Painel icon={<ListChecks size={15} />} tone="accent" title="Compromissos" sub="Contas em aberto, por vencimento" className="min-h-[220px]">
            <div className="flex flex-col gap-2 p-3">
              {compromissos.map((linha) => (
                <button
                  key={linha.destino}
                  type="button"
                  onClick={() => navigate(linha.destino)}
                  className="focus-ring flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-fg/[0.06] bg-fg/[0.02] px-3 py-2.5 text-left transition-colors hover:bg-fg/[0.06]"
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${linha.tom === "danger" ? "bg-danger/[0.12] text-danger ring-danger/20" : "bg-success/[0.12] text-success ring-success/20"}`}>
                    {linha.icone}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12.5px] text-ink">{linha.label}</span>
                      <span className="nums shrink-0 text-[13px] text-ink">{formatCurrency(linha.total)}</span>
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                      {/* O aviso de vencido só existe quando há coisa vencida:
                          alerta sempre aceso deixa de ser alerta. */}
                      {linha.vencido > 0 ? (
                        <span className="flex items-center gap-1 text-danger">
                          <AlertTriangle size={10} /> {formatCurrency(linha.vencido)} vencido
                        </span>
                      ) : (
                        <span className="text-faint">Nada vencido</span>
                      )}
                      <span className="flex items-center gap-1 text-faint">
                        <CalendarClock size={10} /> {formatCurrency(linha.semana)} em 7 dias
                      </span>
                    </span>
                  </span>

                  <ChevronRight size={15} className="shrink-0 text-muted" />
                </button>
              ))}
            </div>
          </Painel>
        )}
      </div>

      <Modal open={!!notaAberta} onClose={fecharNota} title="Venda" subtitle={notaAberta?.nome} size="full">
        {notaAberta && <Invoice id={notaAberta.id} clienteId={notaAberta.clienteId} nome={notaAberta.nome} />}
      </Modal>
    </div>
  );
};

export default SalesOverviewPage;
