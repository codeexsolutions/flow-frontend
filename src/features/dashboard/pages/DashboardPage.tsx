import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  DollarSign,
  Wallet,
  AlertCircle,
  Users,
  Package,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  AlertTriangle,
  Receipt,
  Trophy,
  BarChart3,
  Boxes,
  CreditCard,
  Minus,
  Sun,
  Sunset,
  Moon,
} from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

import { KpiFaixa } from "@/shared/ui/Painel";
import { Rosca } from "@/shared/ui/Rosca";
import { PageScreen } from "@/shared/ui/PageShell";
import SeletorPeriodo, { PERIODO_TUDO, type Periodo } from "@/shared/ui/SeletorPeriodo";
import { SkeletonKpis, SkeletonGrafico, SkeletonListaPainel } from "@/shared/ui/skeleton";
import useAuth from "@/features/auth/store/auth.store";

import useVendaStore from "@/features/vendas/store/venda.store";
import useClienteStore from "@/features/clientes/store/cliente.store";
import useProdutoStore, { stockLevel } from "@/features/estoque/store/produto.store";
import { ehVendavel } from "@/shared/domain/produto";

import { estaAberto, estaFechado, estaCancelado, totalDoPedido } from "@/shared/domain/pedido";
import { mesesComMovimento as mesesComVenda, serieDeVendas } from "@/shared/domain/serieVendas";
import { formatCurrency } from "@/shared/utils/currency";
import { formatNumber, getInitials } from "@/shared/utils/format";
import { formatDateShort, toDate } from "@/shared/utils/date";

/* ─────────────────────────────── Componentes ─────────────────────────────── */

/* As cores saem dos próprios tokens do tema, lidas pelo CSS. O gráfico
   acompanha os 7 temas e os 9 destaques sem nenhum código condicional. */
const COR_FATURADO = "rgb(var(--accent))";
const COR_RECEBIDO = "rgb(var(--success))";

/** Curva de entrada do projeto inteiro — a mesma da transição de tela. */
const SUAVE = [0.22, 0.61, 0.36, 1] as const;

/**
 * Entrada em escada.
 *
 * Cada bloco entra 60ms depois do anterior. Tudo aparecendo junto é um susto:
 * a tela pisca inteira e o olho não sabe por onde começar. Escalonado, ele
 * segue a ordem de leitura — resumo, números, gráfico, listas.
 */
const surgir = {
  oculto: { opacity: 0, y: 14 },
  visivel: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.42, ease: SUAVE },
  }),
};

const Bloco = ({ i, className, children }: { i: number; className?: string; children: ReactNode }) => (
  <motion.div custom={i} variants={surgir} initial="oculto" animate="visivel" className={className}>
    {children}
  </motion.div>
);

/**
 * Número que sobe até o valor.
 *
 * Um total que aparece pronto é só um texto; um que corre até o valor diz que
 * foi calculado agora. Vale para dinheiro e contagem — a interpolação é sobre
 * o número, e a formatação acontece a cada quadro.
 *
 * Anima em `requestAnimationFrame` e parte do valor anterior, não de zero: se
 * o faturamento sobe de 4.000 para 4.200, correr de zero de novo esconderia
 * justamente o tamanho da mudança.
 */
const useContagem = (valor: number) => {
  const reduzir = useReducedMotion();

  const [n, setN] = useState(() => (reduzir ? valor : 0));
  const anteriorRef = useRef(reduzir ? valor : 0);

  useEffect(() => {
    if (reduzir) {
      setN(valor);
      anteriorRef.current = valor;
      return;
    }

    const de = anteriorRef.current;
    const inicio = performance.now();
    let quadro = 0;

    const passo = (agora: number) => {
      const p = Math.min(1, (agora - inicio) / 650);
      /* Desaceleração cúbica: rápido no começo, pousa devagar no fim. */
      const e = 1 - Math.pow(1 - p, 3);

      setN(de + (valor - de) * e);

      if (p < 1) quadro = requestAnimationFrame(passo);
      else anteriorRef.current = valor;
    };

    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [valor, reduzir]);

  return n;
};

const NumeroAnimado = ({ valor, moeda = true }: { valor: number; moeda?: boolean }) => {
  const n = useContagem(valor);
  return <>{moeda ? formatCurrency(n) : formatNumber(Math.round(n))}</>;
};

/**
 * Variação contra a janela anterior de mesmo tamanho.
 *
 * Um número sozinho não diz se o período está bom. 12 mil é ótimo depois de 8
 * e ruim depois de 20 — a comparação é o que transforma o valor em informação.
 *
 * A base é sempre um intervalo do MESMO tamanho, imediatamente antes: três
 * meses comparam com os três anteriores, uma semana com a semana de trás.
 * Comparar recortes de tamanhos diferentes daria uma queda de 60% só porque um
 * lado tem menos dias que o outro.
 *
 * Sem base anterior não inventa porcentagem. Dividir por zero daria "∞%" ou
 * "+100%", os dois mentindo sobre um crescimento que não existe porque não
 * havia com o que comparar.
 */
const Variacao = ({ atual, anterior }: { atual: number; anterior: number }) => {
  if (anterior <= 0) {
    return <span className="text-[11px] text-faint">{atual > 0 ? "primeiro período com movimento" : "sem base de comparação"}</span>;
  }

  const pct = ((atual - anterior) / anterior) * 100;
  const parado = Math.abs(pct) < 0.5;

  const Icone = parado ? Minus : pct > 0 ? TrendingUp : TrendingDown;
  const cor = parado ? "text-faint" : pct > 0 ? "text-success" : "text-danger";

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${cor}`}>
      <Icone size={12} />
      {parado ? "estável" : `${pct > 0 ? "+" : ""}${pct.toFixed(1).replace(".", ",")}%`}
      <span className="text-faint">vs. período anterior</span>
    </span>
  );
};

const TONES = {
  accent: "bg-accent/[0.15] text-accent-soft ring-accent/20",
  success: "bg-success/15 text-success ring-success/20",
  warning: "bg-warning/15 text-warning ring-warning/20",
  danger: "bg-danger/15 text-danger ring-danger/20",
} as const;

const Kpi = ({
  icon,
  label,
  valor,
  moeda = true,
  hint,
  rodape,
  tone = "accent",
}: {
  icon: ReactNode;
  label: string;
  valor: number;
  moeda?: boolean;
  hint?: string;
  rodape?: ReactNode;
  tone?: keyof typeof TONES;
}) => (
  <div className="card glass-sheen group relative overflow-hidden p-4 transition-transform duration-200 hover:-translate-y-0.5">
    {/* Halo que acende no hover — o mesmo vocabulário de brilho da entrada,
        contido para não competir com o número. */}
    <span
      aria-hidden
      className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-60"
      style={{ background: "rgb(var(--accent) / 0.28)" }}
    />

    <div className={`relative mb-2.5 flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset transition-transform duration-200 group-hover:scale-105 ${TONES[tone]}`}>{icon}</div>
    <p className="relative text-[11px] text-faint">{label}</p>
    {/*
      Um degrau menor no celular.
      Em duas colunas de 360px sobram ~130px para o número, e "R$ 48.320,00"
      em 20px não cabe — o `truncate` cortava justamente o dígito que decide a
      ordem de grandeza, e "R$ 48.32…" é pior do que número nenhum.
    */}
    <p className="nums relative mt-0.5 truncate text-lg tracking-tight text-ink sm:text-xl">
      <NumeroAnimado valor={valor} moeda={moeda} />
    </p>
    {hint && <p className="relative mt-0.5 truncate text-[11px] text-faint">{hint}</p>}
    {rodape && <p className="relative mt-1 truncate">{rodape}</p>}
  </div>
);

const Painel = ({ title, subtitle, icon, action, children }: { title: string; subtitle?: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) => (
  <section className="card glass-sheen flex min-h-0 flex-col overflow-hidden">
    <header className="flex shrink-0 items-center gap-2.5 border-b border-fg/[0.07] px-4 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/[0.14] text-accent-soft ring-1 ring-inset ring-accent/20">{icon}</span>
      <span className="min-w-0 flex-1">
        <h2 className="truncate text-[13.5px] leading-none text-ink">{title}</h2>
        {subtitle && <p className="mt-1 truncate text-[11px] text-faint">{subtitle}</p>}
      </span>
      {action}
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
  </section>
);

const VerTudo = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} className="focus-ring flex shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] text-accent transition-colors hover:text-accent-soft">
    Ver tudo <ArrowRight size={13} />
  </button>
);

const Vazio = ({ children }: { children: ReactNode }) => <p className="px-4 py-8 text-center text-[12.5px] text-faint">{children}</p>;

/**
 * Estilo do balão de valores — um só para os quatro gráficos.
 *
 * Recharts não herda CSS: a caixa precisa receber as cores do tema em linha,
 * senão sai branca sobre fundo escuro em cinco dos sete temas.
 */
const BALAO = {
  background: "rgb(var(--surface-raised))",
  border: "1px solid rgb(var(--fg) / 0.08)",
  borderRadius: 12,
  fontSize: 11.5,
  boxShadow: "var(--shadow-2)",
} as const;

/**
 * Ranking em barras horizontais.
 *
 * Barra deitada, e não em pé, porque o rótulo é um nome de cliente ou de
 * produto: na vertical ele vira texto girado ou cortado, e ninguém lê gráfico
 * de cabeça inclinada. Deitado, o nome fica na horizontal, do tamanho que for.
 *
 * Uma cor só — é magnitude da mesma medida, não categorias diferentes. Pintar
 * cada barra de uma cor sugeriria que a cor significa algo, e ela não significa.
 */
const Barras = ({
  dados,
  cor,
  formatar,
}: {
  dados: { nome: string; valor: number; sub: string }[];
  cor: string;
  formatar: (n: number) => string;
}) => (
  <div className="px-2 py-3" style={{ height: Math.max(150, dados.length * 38 + 16) }}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={dados} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="nome"
          width={116}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "rgb(var(--mist))" }}
          /* Nome longo empurraria o eixo até sobrar nada para a barra. */
          tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
        />

        <Tooltip
          cursor={{ fill: "rgb(var(--fg) / 0.04)" }}
          contentStyle={BALAO}
          labelStyle={{ color: "rgb(var(--faint))", marginBottom: 4 }}
          itemStyle={{ padding: 0 }}
          formatter={(v, _n, item) => [formatar(Number(v ?? 0)), item?.payload?.sub ?? ""]}
        />

        <Bar dataKey="valor" fill={cor} radius={[0, 4, 4, 0]} barSize={13} animationDuration={750} animationEasing="ease-out" />
      </BarChart>
    </ResponsiveContainer>
  </div>
);


/* ──────────────────────────────── Página ────────────────────────────────── */

/* Meia-noite do dia e primeiro-do-mês saíram daqui junto com o eixo do
   gráfico — vivem em `serieVendas`, com o resto do recorte. O que sobra abaixo
   é da janela de COMPARAÇÃO, que é leitura desta tela e de mais nenhuma. */

/** Quantos meses de calendário o intervalo toca. */
const mesesDoIntervalo = (de: Date, ate: Date) =>
  (ate.getFullYear() - de.getFullYear()) * 12 + (ate.getMonth() - de.getMonth()) + 1;

/**
 * A mesma data, `n` meses atrás — com o dia preso ao fim do mês curto.
 *
 * Sem o teto, 31 de março menos um mês vira "31 de fevereiro", que o
 * JavaScript traduz para 3 de março: a janela de comparação de "Mês passado"
 * invadiria o mês que ela deveria comparar.
 */
const recuarMeses = (d: Date, n: number) => {
  const alvo = new Date(d.getFullYear(), d.getMonth() - n, 1);
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();

  return new Date(
    alvo.getFullYear(),
    alvo.getMonth(),
    Math.min(d.getDate(), ultimoDia),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds(),
  );
};

const DashboardPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  /*
   * O recorte de tempo do painel inteiro — números, gráfico e rankings.
   *
   * Nasce em TODO O PERÍODO. O painel falava só do mês corrente, e isso deixava
   * a home respondendo a uma pergunta só: no dia 2 ela mostrava dois dias de
   * loja e dava a impressão de um negócio parado, e o histórico do ano só
   * existia no gráfico, sem os números ao lado. Abrindo em todo o período, a
   * primeira coisa que se vê é a loja inteira — e o mês continua a um clique,
   * no seletor do cabeçalho.
   */
  const [periodo, setPeriodo] = useState<Periodo>(PERIODO_TUDO);

  const vendas = useVendaStore((s) => s.vendas);
  const fetchVendas = useVendaStore((s) => s.fetchVendas);
  const clientes = useClienteStore((s) => s.clientes);
  const fetchClientes = useClienteStore((s) => s.fetchClientes);
  const produtos = useProdutoStore((s) => s.produtos);
  const fetchProdutos = useProdutoStore((s) => s.fetchProdutos);

  /* Um hook por linha, e só depois o `||`. Encadeados numa expressão só, o
     curto-circuito faria os seguintes não serem chamados quando o primeiro
     fosse verdadeiro — e ordem de hook que muda entre renders quebra o React. */
  const carregandoVendas = useVendaStore((s) => s.loading);
  const carregandoClientes = useClienteStore((s) => s.loading);
  const carregandoProdutos = useProdutoStore((s) => s.loading);

  /* O painel só aparece quando as três fontes chegam: KPI de vendas com estoque
     ainda vazio faz o número "pular" na frente de quem está lendo. */
  const carregando = carregandoVendas || carregandoClientes || carregandoProdutos;

  useEffect(() => {
    fetchVendas();
    fetchClientes();
    fetchProdutos();
  }, [fetchVendas, fetchClientes, fetchProdutos]);

  const dados = useMemo(() => {
    const agora = new Date();
    const ativas = vendas.filter((v) => !estaCancelado(v));

    const dentro = (v: (typeof ativas)[number], de: Date | null, ate: Date | null) => {
      const d = toDate(v.pedido.dataPedido);

      if (!d) return false;
      if (de && d < de) return false;
      if (ate && d > ate) return false;

      return true;
    };

    const noPeriodo = ativas.filter((v) => dentro(v, periodo.de, periodo.ate));

    /*
     * A janela anterior — a base de toda variação da tela.
     *
     * É o que dá sentido ao número: três meses comparam com os três de trás,
     * uma semana com a semana anterior. Em "todo o período" ela não existe —
     * não há nada antes do começo da loja —, e é por isso que a base é `null`
     * em vez de um intervalo vazio: os KPIs escondem a comparação inteira em
     * vez de mostrar "-100%".
     *
     * São DUAS regras, e a diferença importa:
     *
     * • Período que começa no dia 1º (todos os atalhos de mês e de ano) recua
     *   por MESES DE CALENDÁRIO. No dia 15, "Este mês" compara com o dia 1 ao
     *   15 do mês passado — que é a conta que quem vende faz de cabeça. Recuar
     *   pela duração em dias compararia com o dia 17 ao 31 do mês anterior, e
     *   o número estaria certo por uma definição que ninguém usa.
     *
     * • Intervalo livre recua pela DURAÇÃO. "12 a 19 de maio" não tem mês para
     *   se apoiar; o que dá para comparar é a semana imediatamente antes.
     */
    const anterior = (() => {
      if (!periodo.de || !periodo.ate) return null;

      if (periodo.de.getDate() === 1) {
        const meses = mesesDoIntervalo(periodo.de, periodo.ate);

        return { de: recuarMeses(periodo.de, meses), ate: recuarMeses(periodo.ate, meses) };
      }

      return {
        de: new Date(periodo.de.getTime() - (periodo.ate.getTime() - periodo.de.getTime()) - 1),
        ate: new Date(periodo.de.getTime() - 1),
      };
    })();

    const noAnterior = anterior ? ativas.filter((v) => dentro(v, anterior.de, anterior.ate)) : [];

    const soma = (lista: typeof ativas) => lista.reduce((acc, v) => acc + totalDoPedido(v), 0);

    const faturado = soma(noPeriodo);
    const recebido = soma(noPeriodo.filter(estaFechado));

    /* A receber e notas em aberto ignoram o período de propósito: dívida é do
       AGORA, não do recorte. Quem deve de março continua devendo quando a tela
       está mostrando junho. */
    const aReceber = soma(ativas.filter(estaAberto));

    const faturadoAnterior = soma(noAnterior);
    const recebidoAnterior = soma(noAnterior.filter(estaFechado));

    /* Hoje: o recorte que responde "como está indo o dia", que o período
       esconde. Fica fora do filtro pelo mesmo motivo — é o subtítulo da tela,
       e ele fala do turno, não do que se escolheu ver. */
    const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const doDia = ativas.filter((v) => {
      const d = toDate(v.pedido.dataPedido);
      return !!d && d >= inicioHoje;
    });

    const ticket = noPeriodo.length ? faturado / noPeriodo.length : 0;
    const ticketAnterior = noAnterior.length ? faturadoAnterior / noAnterior.length : 0;

    /*
     * Os meses do seletor e a curva do gráfico.
     *
     * As duas coisas eram montadas à mão aqui — uns noventa linhas de baldes,
     * pontos do eixo e rótulos. Quando o panorama de Vendas ganhou o mesmo
     * seletor de período, manter uma segunda cópia significaria ver as duas
     * telas divergirem na primeira correção feita só de um lado. Agora as
     * duas chamam `serieDeVendas`, e as notas sobre granularidade, baldes e
     * rótulos do eixo moram lá.
     */
    const mesesComMovimento = mesesComVenda(ativas);
    const { serie, porDia } = serieDeVendas(vendas, periodo);

    const recentes = [...ativas].sort((a, b) => +new Date(b.pedido.dataPedido) - +new Date(a.pedido.dataPedido)).slice(0, 6);

    const criticos = produtos
      .filter((p) => stockLevel(p.quantidade) !== "disponivel")
      .sort((a, b) => (a.quantidade ?? 0) - (b.quantidade ?? 0))
      .slice(0, 6);

    /* Quem mais comprou no período. */
    const porCliente = new Map<string, { nome: string; total: number; compras: number }>();
    noPeriodo.forEach((v) => {
      const atual = porCliente.get(v.clienteId) ?? { nome: v.nomeCliente, total: 0, compras: 0 };
      atual.total += totalDoPedido(v);
      atual.compras += 1;
      porCliente.set(v.clienteId, atual);
    });
    const topClientes = [...porCliente.values()].sort((a, b) => b.total - a.total).slice(0, 5);

    /* O que mais saiu no período — por quantidade, que é o que repõe estoque. */
    const porProduto = new Map<string, { nome: string; quantidade: number; total: number }>();
    noPeriodo.forEach((v) => {
      (v.pedido.itensPedido ?? []).forEach((it) => {
        const id = it.produto?.produtoId ?? it.itemPedidoId;
        const atual = porProduto.get(id) ?? { nome: it.produto?.nomeProduto ?? "Produto", quantidade: 0, total: 0 };

        /* O driver do Postgres devolve numérico como texto: somar sem converter
           concatena em vez de somar. */
        const qtd = Number(it.quantidadeItem) || 0;
        atual.quantidade += qtd;
        atual.total += Number(it.subtotalItens ?? Number(it.valorVendaItem) * qtd) || 0;

        porProduto.set(id, atual);
      });
    });
    const topProdutos = [...porProduto.values()].sort((a, b) => b.quantidade - a.quantidade).slice(0, 5);

    /* Mix de recebimento. `formaPagamento` é a do último pagamento da nota — o
       subtítulo do painel diz isso, para ninguém ler como rateio exato. */
    const porForma = new Map<string, { total: number; notas: number }>();
    noPeriodo.filter(estaFechado).forEach((v) => {
      const f = v.pedido.formaPagamento?.trim() || "Não informado";
      const atual = porForma.get(f) ?? { total: 0, notas: 0 };
      atual.total += totalDoPedido(v);
      atual.notas += 1;
      porForma.set(f, atual);
    });
    const formas = [...porForma.entries()].map(([forma, d]) => ({ forma, ...d })).sort((a, b) => b.total - a.total);

    return {
      faturado,
      recebido,
      aReceber,
      faturadoAnterior,
      recebidoAnterior,
      vendasNoPeriodo: noPeriodo.length,
      /* `null` = não há janela anterior (todo o período). Os KPIs escondem a
         linha de comparação em vez de inventar uma queda. */
      temComparacao: anterior !== null,
      faturadoHoje: soma(doDia),
      vendasHoje: doDia.length,
      ticket,
      ticketAnterior,
      abertasAgora: ativas.filter(estaAberto).length,
      mesesComMovimento,
      serie,
      /* O subtítulo do gráfico diz qual das duas leituras está na tela. */
      granularidade: porDia ? ("dia" as const) : ("mes" as const),
      recentes,
      criticos,
      topClientes,
      topProdutos,
      formas,
    };
  }, [vendas, produtos, periodo]);

  const saudacao = useMemo(() => {
    const h = new Date().getHours();

    /* A madrugada era o buraco: às 2 da manhã a conta caía em "Bom dia", e quem
       fecha o caixa de uma loja que virou a noite lia um bom dia sete horas
       cedo demais. */
    if (h < 5) return { texto: "Boa madrugada", Icone: Moon };
    if (h < 12) return { texto: "Bom dia", Icone: Sun };
    if (h < 18) return { texto: "Boa tarde", Icone: Sunset };
    return { texto: "Boa noite", Icone: Moon };
  }, []);

  const primeiroNome = user?.nome?.trim().split(/\s+/)[0];

  /**
   * Como está o dia — vira o subtítulo do cabeçalho.
   *
   * É o recorte que o resto da tela não dá: todo o painel fala de mês, e quem
   * abre o sistema de manhã quer saber do turno de hoje.
   */
  const resumoDoDia = useMemo(() => {
    const partes = [
      dados.vendasHoje > 0
        ? `${formatCurrency(dados.faturadoHoje)} em ${dados.vendasHoje} ${dados.vendasHoje === 1 ? "venda" : "vendas"} hoje`
        : "Nenhuma venda registrada hoje ainda",
    ];

    if (dados.abertasAgora > 0) {
      partes.push(`${dados.abertasAgora} ${dados.abertasAgora === 1 ? "nota em aberto" : "notas em aberto"}`);
    }

    return partes.join(" · ");
  }, [dados.vendasHoje, dados.faturadoHoje, dados.abertasAgora]);

  const ATALHOS = [
    { label: "Nova venda", icone: ShoppingCart, para: "/pdv" },
    { label: "Clientes", icone: Users, para: "/clientes" },
    { label: "Estoque", icone: Package, para: "/estoque" },
    { label: "Financeiro", icone: Wallet, para: "/vendas/financeiro" },
    { label: "Relatórios", icone: BarChart3, para: "/relatorios" },
  ];

  /**
   * Os caminhos para o trabalho, no cabeçalho.
   *
   * Moravam numa faixa própria logo abaixo dele, junto da saudação — uma
   * segunda barra de identidade empilhada sobre a primeira, gastando ~70px de
   * altura para repetir o que o cabeçalho já é. A saudação virou o título da
   * tela (numa home, "Boa noite, Fulano" diz mais que "Dashboard") e os
   * atalhos ocuparam o espaço que sobrava à direita.
   */
  const atalhos = (
    <>
      {/* O período vem ANTES dos atalhos: ele governa a tela toda, e os
          atalhos só levam para fora dela. Na faixa que rola no celular, é o
          primeiro item — o que se procura ali é o recorte, não o caminho para
          outra rota. */}
      <SeletorPeriodo valor={periodo} onChange={setPeriodo} meses={dados.mesesComMovimento} />

      <span aria-hidden className="hidden h-5 w-px shrink-0 bg-fg/[0.08] sm:block" />

      {ATALHOS.map(({ label, icone: Icone, para }) => (
        <motion.button
          key={para}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          onClick={() => navigate(para)}
          /* `shrink-0` e `whitespace-nowrap`: na faixa que rola (celular) o
             flex tentaria espremer os cinco na largura da tela, e "Financeiro"
             viraria duas linhas de cinco letras. */
          className="focus-ring flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-fg/[0.08] bg-fg/[0.03] px-3 py-2 text-[11.5px] text-mist transition-colors hover:border-accent/40 hover:text-ink"
        >
          <Icone size={13} />
          {label}
        </motion.button>
      ))}
    </>
  );

  return (
    <PageScreen
      icon={<saudacao.Icone className="h-5 w-5" />}
      title={`${saudacao.texto}${primeiroNome ? `, ${primeiroNome}` : ""}`}
      subtitle={resumoDoDia}
      actions={atalhos}
    >
      {/* KPIs — 2 → 3 → 5 colunas. Sem o degrau de 3, o tablet ficava com duas
          fileiras de dois e um cartão sozinho na terceira. */}
      {carregando ? (
        <SkeletonKpis />
      ) : (
        /* A fileira de números ROLA de lado no celular — ver `KpiFaixa`. Em
           grade de duas colunas eles truncavam o próprio valor, que é a única
           coisa que o cartão tem para dizer. */
        <Bloco i={0}>
          <KpiFaixa className="sm:grid-cols-3 xl:grid-cols-5">
          <Kpi
            icon={<DollarSign size={16} />}
            label={`Faturado · ${periodo.rotulo.toLowerCase()}`}
            valor={dados.faturado}
            hint={`${dados.vendasNoPeriodo} ${dados.vendasNoPeriodo === 1 ? "venda" : "vendas"}`}
            rodape={dados.temComparacao ? <Variacao atual={dados.faturado} anterior={dados.faturadoAnterior} /> : undefined}
            tone="accent"
          />
          <Kpi
            icon={<Wallet size={16} />}
            label={`Recebido · ${periodo.rotulo.toLowerCase()}`}
            valor={dados.recebido}
            hint={dados.faturado > 0 ? `${Math.round((dados.recebido / dados.faturado) * 100)}% do faturado` : undefined}
            rodape={dados.temComparacao ? <Variacao atual={dados.recebido} anterior={dados.recebidoAnterior} /> : undefined}
            tone="success"
          />
          <Kpi
            icon={<AlertCircle size={16} />}
            label="A receber"
            valor={dados.aReceber}
            hint={`${dados.abertasAgora} ${dados.abertasAgora === 1 ? "nota em aberto" : "notas em aberto"}`}
            tone="warning"
          />
          <Kpi
            icon={<Receipt size={16} />}
            label="Ticket médio"
            valor={dados.ticket}
            hint="por venda no período"
            rodape={dados.temComparacao ? <Variacao atual={dados.ticket} anterior={dados.ticketAnterior} /> : undefined}
            tone="accent"
          />
          <Kpi icon={<Users size={16} />} label="Clientes" valor={clientes.length} moeda={false} /* Só o que se vende: a frase diz "produtos", e insumo não é um.
                       A lista de estoque crítico logo abaixo continua
                       incluindo material — material acabando é exatamente
                       o que um painel precisa avisar. */
            hint={`${formatNumber(produtos.filter(ehVendavel).length)} produtos cadastrados`} tone="danger" />
          </KpiFaixa>
        </Bloco>
      )}

      {/* Gráfico do ano, agora dividindo a linha com a rosca de recebimento */}
      <Bloco i={1} className="grid shrink-0 grid-cols-1 gap-3 xl:grid-cols-3">
        <section className="card glass-sheen overflow-hidden xl:col-span-2">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-fg/[0.07] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/[0.14] text-accent-soft ring-1 ring-inset ring-accent/20">
                <TrendingUp size={15} />
              </span>
              <div>
                <h2 className="text-[13.5px] leading-none text-ink">Faturamento</h2>
                <p className="mt-1 text-[11.5px] text-faint">
                  {dados.granularidade === "dia" ? "Dia a dia" : "Mês a mês"} · {periodo.rotulo.toLowerCase()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Legenda: dois quadradinhos e os rótulos. */}
              <div className="hidden flex-wrap items-center gap-4 sm:flex">
                {[
                  ["Faturado", COR_FATURADO],
                  ["Recebido", COR_RECEBIDO],
                ].map(([rotulo, cor]) => (
                  <span key={rotulo} className="flex items-center gap-1.5 text-[11.5px] text-mist">
                    <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: cor }} />
                    {rotulo}
                  </span>
                ))}
              </div>

              {/* O seletor de 3/6/12 meses que morava aqui saiu: o período do
                  cabeçalho já decide o intervalo, e dois controles para a mesma
                  decisão fazem um deles estar sempre errado — este mostrava o
                  ano corrente mesmo com o painel somando outro recorte. */}
            </div>
          </header>

          {carregando ? (
            <SkeletonGrafico altura={176} />
          ) : (
            <div className="h-[176px] px-1 py-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dados.serie} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                  <defs>
                    {/* Preenchimento fundo no topo e queda longa: dá volume à
                        área sem escurecer a base do gráfico. */}
                    <linearGradient id="fillFaturado" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COR_FATURADO} stopOpacity={0.5} />
                      <stop offset="55%" stopColor={COR_FATURADO} stopOpacity={0.14} />
                      <stop offset="100%" stopColor={COR_FATURADO} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="fillRecebido" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COR_RECEBIDO} stopOpacity={0.34} />
                      <stop offset="60%" stopColor={COR_RECEBIDO} stopOpacity={0.08} />
                      <stop offset="100%" stopColor={COR_RECEBIDO} stopOpacity={0} />
                    </linearGradient>

                    {/* O mesmo brilho da tela de entrada: faz a curva acender
                        em vez de ser um traço chapado. */}
                    <filter id="brilhoLinha" x="-20%" y="-40%" width="140%" height="200%">
                      <feGaussianBlur stdDeviation="3.5" result="borrado" />
                      <feMerge>
                        <feMergeNode in="borrado" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgb(var(--fg) / 0.06)" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11, fill: "rgb(var(--faint))" }} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    width={44}
                    tick={{ fontSize: 11, fill: "rgb(var(--faint))" }}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                  />

                  <Tooltip
                    cursor={{ stroke: "rgb(var(--fg) / 0.12)", strokeDasharray: "4 4" }}
                    contentStyle={{
                      background: "rgb(var(--surface-raised))",
                      border: "1px solid rgb(var(--fg) / 0.08)",
                      borderRadius: 12,
                      fontSize: 11.5,
                      boxShadow: "var(--shadow-2)",
                    }}
                    labelStyle={{ color: "rgb(var(--faint))", marginBottom: 4 }}
                    itemStyle={{ padding: 0 }}
                    formatter={(v) => formatCurrency(Number(v ?? 0))}
                    /* O eixo mostra "12"; o balão diz "dia 12" — sozinho, o
                       número podia ser qualquer coisa. */
                    labelFormatter={(l) => (dados.granularidade === "dia" ? `Dia ${l}` : String(l))}
                  />

                  {/* Entram em escada — a segunda 180ms depois. Mesma ideia das
                      vozes do som de entrada. */}
                  <Area
                    type="monotone"
                    dataKey="faturado"
                    name="Faturado"
                    stroke={COR_FATURADO}
                    strokeWidth={2.5}
                    fill="url(#fillFaturado)"
                    filter="url(#brilhoLinha)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: "rgb(var(--surface))" }}
                    animationDuration={900}
                    animationEasing="ease-out"
                  />
                  <Area
                    type="monotone"
                    dataKey="recebido"
                    name="Recebido"
                    stroke={COR_RECEBIDO}
                    strokeWidth={2}
                    fill="url(#fillRecebido)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: "rgb(var(--surface))" }}
                    animationBegin={180}
                    animationDuration={900}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <Painel title="Como receberam" subtitle="última forma de cada nota quitada no período" icon={<CreditCard size={15} />} action={<VerTudo onClick={() => navigate("/vendas/financeiro")} />}>
          {carregando ? <SkeletonGrafico altura={176} /> : dados.formas.length === 0 ? <Vazio>Nenhuma nota quitada neste período.</Vazio> : <Rosca fatias={dados.formas.map((f) => ({ nome: f.forma, valor: f.total }))} formatar={formatCurrency} />}
        </Painel>
      </Bloco>

      {/* Rankings, em barras */}
      <Bloco i={2} className="grid shrink-0 grid-cols-1 gap-3 lg:grid-cols-2">
        <Painel title="Quem mais comprou" subtitle="no período, por valor" icon={<Trophy size={15} />} action={<VerTudo onClick={() => navigate("/clientes")} />}>
          {carregando ? (
            <SkeletonGrafico altura={176} />
          ) : dados.topClientes.length === 0 ? (
            <Vazio>Ainda não há compras neste período.</Vazio>
          ) : (
            <Barras
              cor={COR_FATURADO}
              formatar={formatCurrency}
              dados={dados.topClientes.map((c) => ({ nome: c.nome, valor: c.total, sub: `${c.compras} ${c.compras === 1 ? "compra" : "compras"}` }))}
            />
          )}
        </Painel>

        <Painel title="Mais vendidos" subtitle="no período, por quantidade" icon={<Boxes size={15} />} action={<VerTudo onClick={() => navigate("/relatorios")} />}>
          {carregando ? (
            <SkeletonGrafico altura={176} />
          ) : dados.topProdutos.length === 0 ? (
            <Vazio>Nenhum item vendido neste período.</Vazio>
          ) : (
            <Barras
              cor={COR_RECEBIDO}
              formatar={(n) => `${formatNumber(n)} un.`}
              dados={dados.topProdutos.map((p) => ({ nome: p.nome, valor: p.quantidade, sub: formatCurrency(p.total) }))}
            />
          )}
        </Painel>
      </Bloco>

      {/* Listas */}
      <Bloco i={3} className="grid min-h-[280px] shrink-0 grid-cols-1 gap-3 lg:grid-cols-2">
        <Painel title="Últimas vendas" icon={<ShoppingCart size={15} />} action={<VerTudo onClick={() => navigate("/vendas")} />}>
          {carregando ? (
            <SkeletonListaPainel />
          ) : dados.recentes.length === 0 ? (
            <Vazio>Nenhuma venda registrada ainda.</Vazio>
          ) : (
            dados.recentes.map((v) => (
              <div key={v.pedido.pedidoId} className="flex items-center gap-3 border-b border-fg/[0.04] px-4 py-2.5 transition-colors last:border-0 hover:bg-fg/[0.02]">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-accent/25 bg-accent/15 text-[10px] text-accent-soft">{getInitials(v.nomeCliente)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-ink">{v.nomeCliente}</span>
                  <span className="block text-[11px] text-faint">{formatDateShort(v.pedido.dataPedido)}</span>
                </span>
                <span className="text-right">
                  <span className="nums block text-[12.5px] text-ink">{formatCurrency(totalDoPedido(v))}</span>
                  <span className={`block text-[10.5px] ${estaAberto(v) ? "text-warning" : "text-success"}`}>{estaAberto(v) ? "em aberto" : "pago"}</span>
                </span>
              </div>
            ))
          )}
        </Painel>

        <Painel title="Estoque crítico" icon={<Package size={15} />} action={<VerTudo onClick={() => navigate("/estoque")} />}>
          {carregando ? (
            <SkeletonListaPainel linhas={4} />
          ) : dados.criticos.length === 0 ? (
            <Vazio>Nenhum produto em nível crítico. 👌</Vazio>
          ) : (
            dados.criticos.map((p) => {
              const nivel = stockLevel(p.quantidade);
              return (
                <div key={p.id} className="flex items-center gap-3 border-b border-fg/[0.04] px-4 py-2.5 transition-colors last:border-0 hover:bg-fg/[0.02]">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${nivel === "esgotado" ? "bg-danger/15 text-danger ring-danger/20" : "bg-warning/15 text-warning ring-warning/20"}`}>
                    <AlertTriangle size={14} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{p.nome}</span>
                  <span className={`nums text-[12.5px] ${nivel === "esgotado" ? "text-danger" : "text-warning"}`}>{formatNumber(p.quantidade ?? 0)} un.</span>
                </div>
              );
            })
          )}
        </Painel>
      </Bloco>

    </PageScreen>
  );
};

export default DashboardPage;
