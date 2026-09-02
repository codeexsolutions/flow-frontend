import { useEffect, useMemo, useState } from "react";
import { FileText, Printer, FileSpreadsheet, Users, Wallet, Boxes, LayoutList, UserCheck } from "lucide-react";
import * as XLSX from "xlsx";

import { PageScreen, PrimaryAction } from "@/shared/ui/PageShell";
import { SelectBox } from "@/shared/ui/form/FormKit";
import SeletorPeriodo, { PERIODO_TUDO, type Periodo } from "@/shared/ui/SeletorPeriodo";

import useVendaStore from "@/features/vendas/store/venda.store";
import useClienteStore from "@/features/clientes/store/cliente.store";
import useProdutoStore, { stockLevel } from "@/features/estoque/store/produto.store";
import useEnterprise from "@/features/empresa/store/enterprise.store";

import { estaAberto, estaCancelado, estaFechado, totalDoPedido, valorPagoDoPedido, type PedidoClienteType } from "@/shared/domain/pedido";
import { formatCurrency } from "@/shared/utils/currency";
import { MESES_EXTENSO, formatDate, formatDateTime, toDate } from "@/shared/utils/date";
import { formatDocument, formatNumber } from "@/shared/utils/format";
import ProductType, { ehVendavel } from "@/shared/domain/produto";

import { FolhaA4, FolhaHeader, FolhaKpis, FolhaTabela, FolhaTotais, FolhaFooter, type Coluna } from "@/features/relatorios/components/FolhaA4";

/* ─────────────────────────────── Tipos de folha ─────────────────────────── */

type TipoId = "resumo" | "vendas" | "vendedores" | "recebiveis" | "clientes" | "estoque";

const TIPOS: { id: TipoId; label: string; nota: string; icone: typeof FileText }[] = [
  { id: "resumo", label: "Resumo", nota: "Os números do período numa folha", icone: LayoutList },
  { id: "vendas", label: "Vendas", nota: "Uma linha por nota", icone: FileText },
  { id: "vendedores", label: "Por vendedor", nota: "Quanto cada um fechou", icone: UserCheck },
  { id: "recebiveis", label: "Contas a receber", nota: "O que está em aberto", icone: Wallet },
  { id: "clientes", label: "Clientes", nota: "Faturamento por cliente", icone: Users },
  { id: "estoque", label: "Estoque", nota: "Posição e valor parado", icone: Boxes },
];

/** O estoque é uma fotografia do AGORA — período e vendedor não o recortam. */
const SEM_RECORTE: TipoId[] = ["estoque"];

const TODOS_VENDEDORES = "todos";

/**
 * O período como ele vai IMPRESSO.
 *
 * Não é o mesmo texto do botão. Na tela, "Setembro de 2026" basta porque o
 * seletor está ali do lado; no papel, que vai circular sozinho, a folha precisa
 * dizer as datas exatas — é uma prestação de contas, e "este mês" numa folha
 * guardada em pasta não significa mais nada seis meses depois.
 */
const periodoImpresso = (p: Periodo): string => {
  if (!p.de || !p.ate) return p.rotulo;

  const de = formatDate(p.de);
  const ate = formatDate(p.ate);
  const faixa = de === ate ? de : `${de} a ${ate}`;

  /* Quando o próprio rótulo já é a faixa de datas (período livre), repeti-la
     daria "01/03/2026 – 15/04/2026 · 01/03/2026 a 15/04/2026". */
  return p.rotulo.includes("/") ? faixa : `${p.rotulo} · ${faixa}`;
};

/* ──────────────────────────────── Página ────────────────────────────────── */

const RelatoriosPage = () => {
  const [periodo, setPeriodo] = useState<Periodo>(PERIODO_TUDO);
  const [tipo, setTipo] = useState<TipoId>("resumo");
  const [vendedor, setVendedor] = useState<string>(TODOS_VENDEDORES);

  const vendas = useVendaStore((s) => s.vendas);
  const fetchVendas = useVendaStore((s) => s.fetchVendas);
  const clientes = useClienteStore((s) => s.clientes);
  const fetchClientes = useClienteStore((s) => s.fetchClientes);
  const produtos = useProdutoStore((s) => s.produtos);
  const fetchProdutos = useProdutoStore((s) => s.fetchProdutos);
  const { enterprise } = useEnterprise();

  useEffect(() => {
    fetchVendas();
    fetchClientes();
    fetchProdutos();
  }, [fetchVendas, fetchClientes, fetchProdutos]);

  const ativas = useMemo(() => vendas.filter((v) => !estaCancelado(v)), [vendas]);

  /* Os meses que têm venda alimentam o seletor: a lista de recortes é feita do
     que existe, e não de atalhos que caem em meses vazios. */
  const mesesComMovimento = useMemo(() => {
    const chaves = new Set<string>();

    for (const v of ativas) {
      const d = toDate(v.pedido.dataPedido);
      if (d) chaves.add(`${d.getFullYear()}-${d.getMonth()}`);
    }

    return [...chaves]
      .map((c) => {
        const [ano, mes] = c.split("-").map(Number);
        return new Date(ano, mes, 1);
      })
      .sort((a, b) => +b - +a);
  }, [ativas]);

  /**
   * Quem vendeu, no período.
   *
   * Sai das VENDAS e não do cadastro de funcionários: a lista precisa ser de
   * quem tem nota, senão o seletor oferece o estoquista e a folha sai vazia.
   * Venda antiga sem vendedor gravado entra como "Sem vendedor" em vez de
   * sumir — ela faturou, e um relatório que não a soma não fecha com o caixa.
   */
  const vendedores = useMemo(() => {
    const mapa = new Map<string, string>();

    for (const v of ativas) {
      const id = String(v.vendedorId ?? "");
      if (id) mapa.set(id, v.nomeVendedor?.trim() || "Sem nome");
    }

    const lista = [...mapa.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    const temOrfas = ativas.some((v) => !v.vendedorId);

    return temOrfas ? [...lista, { id: "sem", nome: "Sem vendedor" }] : lista;
  }, [ativas]);

  /* Vendedor que sumiu da lista (mudou o período) volta para "todos" — senão a
     folha fica filtrada por alguém que o seletor nem mostra mais. */
  useEffect(() => {
    if (vendedor !== TODOS_VENDEDORES && !vendedores.some((v) => v.id === vendedor)) setVendedor(TODOS_VENDEDORES);
  }, [vendedores, vendedor]);

  const nomeVendedorAtual = vendedor === TODOS_VENDEDORES ? null : vendedores.find((v) => v.id === vendedor)?.nome ?? null;

  const noRecorte = useMemo(() => {
    const dentro = (v: PedidoClienteType) => {
      const d = toDate(v.pedido.dataPedido);

      if (!d) return false;
      if (periodo.de && d < periodo.de) return false;
      if (periodo.ate && d > periodo.ate) return false;

      return true;
    };

    const doVendedor = (v: PedidoClienteType) => {
      if (vendedor === TODOS_VENDEDORES) return true;
      if (vendedor === "sem") return !v.vendedorId;

      return String(v.vendedorId ?? "") === vendedor;
    };

    return ativas.filter((v) => dentro(v) && doVendedor(v));
  }, [ativas, periodo, vendedor]);

  const totais = useMemo(() => {
    const faturado = noRecorte.reduce((acc, v) => acc + totalDoPedido(v), 0);
    const recebido = noRecorte.reduce((acc, v) => acc + valorPagoDoPedido(v), 0);

    return {
      faturado,
      recebido,
      aReceber: Math.max(faturado - recebido, 0),
      ticket: noRecorte.length ? faturado / noRecorte.length : 0,
      quantidade: noRecorte.length,
    };
  }, [noRecorte]);

  /* ─────────────────────────── Agrupamentos ─────────────────────────── */

  const porCliente = useMemo(() => {
    const mapa = new Map<string, { nome: string; pedidos: number; total: number }>();

    noRecorte.forEach((v) => {
      const atual = mapa.get(v.clienteId) ?? { nome: v.nomeCliente, pedidos: 0, total: 0 };
      atual.pedidos += 1;
      atual.total += totalDoPedido(v);
      mapa.set(v.clienteId, atual);
    });

    return [...mapa.values()].sort((a, b) => b.total - a.total);
  }, [noRecorte]);

  const porVendedor = useMemo(() => {
    const mapa = new Map<string, { nome: string; pedidos: number; total: number; recebido: number }>();

    noRecorte.forEach((v) => {
      const chave = String(v.vendedorId ?? "sem");
      const nome = v.vendedorId ? v.nomeVendedor?.trim() || "Sem nome" : "Sem vendedor";
      const atual = mapa.get(chave) ?? { nome, pedidos: 0, total: 0, recebido: 0 };

      atual.pedidos += 1;
      atual.total += totalDoPedido(v);
      atual.recebido += valorPagoDoPedido(v);

      mapa.set(chave, atual);
    });

    return [...mapa.values()].sort((a, b) => b.total - a.total);
  }, [noRecorte]);

  /**
   * O movimento distribuído no tempo — o corpo do Resumo.
   *
   * Dia a dia quando o recorte é curto, mês a mês quando é longo. O corte é
   * pelo tamanho: um resumo de "hoje" com uma linha só não diz nada além do
   * KPI, e um de três anos em dias sairia com mil linhas de papel.
   */
  const linhaDoTempo = useMemo(() => {
    const porDia = (() => {
      if (!periodo.de || !periodo.ate) return false;

      const dias = Math.round((+periodo.ate - +periodo.de) / (24 * 60 * 60 * 1000)) + 1;

      return dias <= 62;
    })();

    const mapa = new Map<string, { ordem: number; rotulo: string; pedidos: number; total: number; recebido: number }>();

    noRecorte.forEach((v) => {
      const d = toDate(v.pedido.dataPedido);

      if (!d) return;

      const chave = porDia ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : `${d.getFullYear()}-${d.getMonth()}`;
      const rotulo = porDia ? formatDate(d) : `${MESES_EXTENSO[d.getMonth()]} de ${d.getFullYear()}`;
      const ordem = porDia ? +new Date(d.getFullYear(), d.getMonth(), d.getDate()) : +new Date(d.getFullYear(), d.getMonth(), 1);
      const atual = mapa.get(chave) ?? { ordem, rotulo, pedidos: 0, total: 0, recebido: 0 };

      atual.pedidos += 1;
      atual.total += totalDoPedido(v);
      atual.recebido += valorPagoDoPedido(v);

      mapa.set(chave, atual);
    });

    return { porDia, linhas: [...mapa.values()].sort((a, b) => a.ordem - b.ordem) };
  }, [noRecorte, periodo]);

  const porForma = useMemo(() => {
    const mapa = new Map<string, { forma: string; notas: number; total: number }>();

    noRecorte.filter(estaFechado).forEach((v) => {
      const forma = v.pedido.formaPagamento?.trim() || "Não informado";
      const atual = mapa.get(forma) ?? { forma, notas: 0, total: 0 };

      atual.notas += 1;
      atual.total += totalDoPedido(v);

      mapa.set(forma, atual);
    });

    return [...mapa.values()].sort((a, b) => b.total - a.total);
  }, [noRecorte]);

  const emAberto = useMemo(() => noRecorte.filter(estaAberto), [noRecorte]);

  /* ──────────────────────────── Colunas ──────────────────────────── */

  const colVendas: Coluna<PedidoClienteType>[] = [
    { header: "Data", cell: (v) => formatDate(v.pedido.dataPedido), width: "14%" },
    { header: "Cliente", cell: (v) => v.nomeCliente, width: "34%" },
    { header: "Vendedor", cell: (v) => v.nomeVendedor?.trim() || "—", width: "20%" },
    { header: "Status", cell: (v) => (estaAberto(v) ? "Em aberto" : "Pago"), width: "14%" },
    { header: "Total", cell: (v) => formatCurrency(totalDoPedido(v)), align: "right", width: "18%" },
  ];

  const colTempo: Coluna<(typeof linhaDoTempo.linhas)[number]>[] = [
    { header: linhaDoTempo.porDia ? "Dia" : "Mês", cell: (l) => l.rotulo, width: "34%" },
    { header: "Vendas", cell: (l) => formatNumber(l.pedidos), align: "right", width: "16%" },
    { header: "Recebido", cell: (l) => formatCurrency(l.recebido), align: "right", width: "25%" },
    { header: "Faturado", cell: (l) => formatCurrency(l.total), align: "right", width: "25%" },
  ];

  const colVendedores: Coluna<(typeof porVendedor)[number]>[] = [
    { header: "Vendedor", cell: (v) => v.nome, width: "34%" },
    { header: "Vendas", cell: (v) => formatNumber(v.pedidos), align: "right", width: "13%" },
    { header: "Ticket médio", cell: (v) => formatCurrency(v.pedidos ? v.total / v.pedidos : 0), align: "right", width: "19%" },
    { header: "Recebido", cell: (v) => formatCurrency(v.recebido), align: "right", width: "17%" },
    { header: "Faturado", cell: (v) => formatCurrency(v.total), align: "right", width: "17%" },
  ];

  const colFormas: Coluna<(typeof porForma)[number]>[] = [
    { header: "Forma de pagamento", cell: (f) => f.forma, width: "56%" },
    { header: "Notas", cell: (f) => formatNumber(f.notas), align: "right", width: "18%" },
    { header: "Total", cell: (f) => formatCurrency(f.total), align: "right", width: "26%" },
  ];

  const colClientes: Coluna<(typeof porCliente)[number]>[] = [
    { header: "Cliente", cell: (c) => c.nome, width: "54%" },
    { header: "Pedidos", cell: (c) => formatNumber(c.pedidos), align: "right", width: "20%" },
    { header: "Total", cell: (c) => formatCurrency(c.total), align: "right", width: "26%" },
  ];

  const colEstoque: Coluna<ProductType>[] = [
    { header: "Produto", cell: (p) => p.nome, width: "46%" },
    { header: "Situação", cell: (p) => ({ disponivel: "Em estoque", baixo: "Baixo", esgotado: "Esgotado" })[stockLevel(p.quantidade)], width: "18%" },
    { header: "Qtd.", cell: (p) => formatNumber(p.quantidade ?? 0), align: "right", width: "12%" },
    { header: "Custo total", cell: (p) => formatCurrency((p.valorCompra ?? 0) * (p.quantidade ?? 0)), align: "right", width: "24%" },
  ];

  const valorEmEstoque = produtos.reduce((a, p) => a + (p.valorCompra ?? 0) * (p.quantidade ?? 0), 0);

  /* ───────────────────────────── Excel ───────────────────────────── */

  /**
   * A planilha sai do MESMO recorte da folha.
   *
   * Antes ela ignorava a tela e exportava dia/mês/ano fixos: quem filtrava
   * setembro e o vendedor João recebia um arquivo do ano inteiro da loja
   * inteira, sem nada avisando da troca. As abas de dia/mês/ano continuam —
   * são úteis e ninguém as pediu de volta ao contrário —, mas agora vivem numa
   * aba própria, ao lado do que está na tela.
   */
  const exportarExcel = () => {
    const somaTotal = (lista: PedidoClienteType[]) => lista.reduce((acc, v) => acc + totalDoPedido(v), 0);
    const somaRecebido = (lista: PedidoClienteType[]) => lista.reduce((acc, v) => acc + valorPagoDoPedido(v), 0);

    const agora = new Date();
    const janelas: { rotulo: string; inicio: Date }[] = [
      { rotulo: "Dia", inicio: new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()) },
      { rotulo: "Mês", inicio: new Date(agora.getFullYear(), agora.getMonth(), 1) },
      { rotulo: "Ano", inicio: new Date(agora.getFullYear(), 0, 1) },
    ];

    const wb = XLSX.utils.book_new();

    /* 1. O recorte da tela, em números. */
    const wsResumo = XLSX.utils.json_to_sheet([
      { Campo: "Período", Valor: periodoImpresso(periodo) },
      { Campo: "Vendedor", Valor: nomeVendedorAtual ?? "Todos" },
      { Campo: "Vendas", Valor: totais.quantidade },
      { Campo: "Faturado", Valor: totais.faturado },
      { Campo: "Recebido", Valor: totais.recebido },
      { Campo: "A receber", Valor: totais.aReceber },
      { Campo: "Ticket médio", Valor: totais.ticket },
    ]);
    wsResumo["!cols"] = [{ wch: 16 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");

    /* 2. O movimento distribuído no tempo. */
    const wsTempo = XLSX.utils.json_to_sheet(
      linhaDoTempo.linhas.map((l) => ({
        [linhaDoTempo.porDia ? "Dia" : "Mês"]: l.rotulo,
        Vendas: l.pedidos,
        Faturado: l.total,
        Recebido: l.recebido,
        "A receber": Math.max(l.total - l.recebido, 0),
      })),
    );
    wsTempo["!cols"] = [{ wch: 20 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsTempo, linhaDoTempo.porDia ? "Dia a dia" : "Mês a mês");

    /* 3. Por vendedor. */
    const wsVendedores = XLSX.utils.json_to_sheet(
      porVendedor.map((v) => ({
        Vendedor: v.nome,
        Vendas: v.pedidos,
        Faturado: v.total,
        Recebido: v.recebido,
        "Ticket médio": v.pedidos ? v.total / v.pedidos : 0,
      })),
    );
    wsVendedores["!cols"] = [{ wch: 26 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsVendedores, "Por vendedor");

    /* 4. Por cliente. */
    const wsClientes = XLSX.utils.json_to_sheet(
      porCliente.map((c) => ({ Cliente: c.nome, Pedidos: c.pedidos, Total: c.total })),
    );
    wsClientes["!cols"] = [{ wch: 30 }, { wch: 10 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsClientes, "Por cliente");

    /* 5. Nota a nota. */
    const wsVendas = XLSX.utils.json_to_sheet(
      noRecorte.map((v) => ({
        Data: formatDate(v.pedido.dataPedido),
        Cliente: v.nomeCliente,
        Vendedor: v.nomeVendedor?.trim() || "—",
        Status: estaAberto(v) ? "Em aberto" : "Pago",
        Total: totalDoPedido(v),
        Pago: valorPagoDoPedido(v),
      })),
    );
    wsVendas["!cols"] = [{ wch: 12 }, { wch: 28 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsVendas, "Vendas");

    /* 6. Dia/mês/ano da loja inteira — independente do recorte da tela, e a
          coluna "Vendedor" diz isso para ninguém confundir com o de cima. */
    const wsJanelas = XLSX.utils.json_to_sheet(
      janelas.map(({ rotulo, inicio }) => {
        const lista = ativas.filter((v) => {
          const d = toDate(v.pedido.dataPedido);
          return !!d && d >= inicio;
        });

        return {
          Período: rotulo,
          Vendedor: "Todos",
          Vendas: lista.length,
          Faturado: somaTotal(lista),
          Recebido: somaRecebido(lista),
          "A receber": Math.max(somaTotal(lista) - somaRecebido(lista), 0),
        };
      }),
    );
    wsJanelas["!cols"] = [{ wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsJanelas, "Loja hoje-mês-ano");

    const carimbo = formatDate(new Date()).replaceAll("/", "-");

    XLSX.writeFile(wb, `relatorio-${carimbo}.xlsx`);
  };

  /* ──────────────────────────── Render ──────────────────────────── */

  const escolhido = TIPOS.find((t) => t.id === tipo) ?? TIPOS[0];
  const recortavel = !SEM_RECORTE.includes(tipo);

  const rotuloPeriodoFolha = recortavel ? periodoImpresso(periodo) : `Posição em ${formatDate(new Date())}`;
  const rotuloFiltroFolha = recortavel && nomeVendedorAtual ? `Vendedor: ${nomeVendedorAtual}` : undefined;

  return (
    <PageScreen
      icon={<FileText className="h-5 w-5" />}
      title="Relatórios"
      subtitle="Monte o recorte à esquerda, confira a folha e imprima"
      headerClassName="no-print contents"
    >
      {/*
       * Opções à ESQUERDA, folha à DIREITA.
       *
       * Antes os controles eram uma barra deitada sobre a folha, e a folha
       * ficava centralizada embaixo. Duas coisas davam errado: numa tela de
       * notebook a barra empurrava o papel para fora da área visível — quem
       * trocava o período tinha de rolar para ver o efeito, que é justamente o
       * que se quer ver na hora —, e a barra deitada não tinha onde crescer,
       * então cada filtro novo espremia os outros.
       *
       * Em coluna, o painel cresce para baixo sem tirar nada do papel, e o A4
       * fica na proporção em que será impresso, ao lado da decisão que o monta.
       * No celular volta a empilhar: painel em cima, folha embaixo.
       */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <aside className="no-print flex w-full shrink-0 flex-col gap-3 lg:w-[288px] lg:overflow-y-auto lg:pb-6">
          <section className="card glass-sheen flex flex-col gap-3 rounded-xl p-3.5">
            <div>
              <p className="mb-1.5 text-[10px] uppercase tracking-[0.1em] text-faint">Período</p>
              <SeletorPeriodo valor={periodo} onChange={setPeriodo} meses={mesesComMovimento} comHoje />
            </div>

            {/* Vendedor só aparece quando há mais de um: um seletor com uma
                opção é um campo que não decide nada. */}
            {vendedores.length > 1 && (
              <SelectBox label="Vendedor" icon={<UserCheck size={15} />} value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
                <option value={TODOS_VENDEDORES}>Todos os vendedores</option>
                {vendedores.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nome}
                  </option>
                ))}
              </SelectBox>
            )}

            {/* O recorte não vale para o estoque, e a tela diz isso em vez de
                deixar a pessoa mexer em controles sem efeito. */}
            {!recortavel && (
              <p className="rounded-lg border border-fg/[0.07] bg-fg/[0.02] px-2.5 py-2 text-[11px] leading-relaxed text-faint">
                A posição de estoque é do momento — período e vendedor não a recortam.
              </p>
            )}
          </section>

          {/*
           * Os tipos viram uma LISTA, não um `select`.
           *
           * Num select fechado, escolher o relatório exige abrir para lembrar o
           * que existe; e o que existe é a pergunta que a tela responde. Cada
           * linha carrega o que aquela folha mostra, então dá para escolher sem
           * ter que imprimir para descobrir.
           */}
          <section className="card glass-sheen flex flex-col gap-1 rounded-xl p-2">
            <p className="px-1.5 pb-0.5 pt-1 text-[10px] uppercase tracking-[0.1em] text-faint">Relatório</p>

            {TIPOS.map((t) => {
              const Icone = t.icone;
              const ativo = t.id === tipo;

              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTipo(t.id)}
                  aria-pressed={ativo}
                  className={`focus-ring flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    ativo ? "bg-accent/[0.12] text-ink" : "text-mist hover:bg-fg/[0.05] hover:text-ink"
                  }`}
                >
                  <Icone size={15} className={`mt-0.5 shrink-0 ${ativo ? "text-accent-soft" : "text-faint"}`} />
                  <span className="min-w-0">
                    <span className="block text-[12.5px] leading-tight">{t.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-faint">{t.nota}</span>
                  </span>
                </button>
              );
            })}
          </section>

          <div className="flex flex-col gap-2">
            <PrimaryAction icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
              Imprimir / PDF
            </PrimaryAction>

            <button
              onClick={exportarExcel}
              className="focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-fg/[0.1] bg-fg/[0.03] px-3.5 py-2 text-[13px] text-mist transition-colors hover:bg-fg/[0.06] hover:text-ink"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Exportar Excel
            </button>
          </div>
        </aside>

        {/* A folha rola sozinha, dentro da própria coluna: sem isto, um
            relatório de duzentas linhas levaria o painel de opções junto para
            fora da tela.

            `print:overflow-visible` não é detalhe: um container com rolagem
            imprime só o pedaço visível na tela, e o relatório de duzentas
            linhas sairia cortado na primeira página sem nada indicando que
            faltou o resto. */}
        <div className="area-impressao min-w-0 flex-1 lg:overflow-y-auto print:overflow-visible">
          <div className="flex justify-center pb-6">
            <FolhaA4>
              <FolhaHeader
                empresa={enterprise?.nomeFantasia ?? "Sua Empresa"}
                documento={enterprise?.cpfCnpj ? formatDocument(enterprise.cpfCnpj) : undefined}
                titulo={escolhido.label}
                periodo={rotuloPeriodoFolha}
                filtro={rotuloFiltroFolha}
                logo={enterprise?.urlLogo}
              />

              {tipo === "resumo" && (
                <>
                  <FolhaKpis
                    itens={[
                      { label: "Vendas", valor: formatNumber(totais.quantidade) },
                      { label: "Faturado", valor: formatCurrency(totais.faturado) },
                      { label: "Recebido", valor: formatCurrency(totais.recebido) },
                      { label: "A receber", valor: formatCurrency(totais.aReceber) },
                      { label: "Ticket médio", valor: formatCurrency(totais.ticket) },
                    ]}
                  />

                  <FolhaTabela
                    titulo={linhaDoTempo.porDia ? "Dia a dia" : "Mês a mês"}
                    colunas={colTempo}
                    linhas={linhaDoTempo.linhas}
                    vazio="Nenhuma venda no período."
                  />

                  {/* As duas quebras do resumo só entram quando há o que
                      quebrar: uma tabela de uma linha só repete o total. */}
                  {porVendedor.length > 1 && <FolhaTabela titulo="Por vendedor" colunas={colVendedores} linhas={porVendedor} />}
                  {porForma.length > 0 && <FolhaTabela titulo="Como receberam" colunas={colFormas} linhas={porForma} />}

                  <FolhaTotais
                    itens={[
                      { label: "Recebido", valor: formatCurrency(totais.recebido) },
                      { label: "A receber", valor: formatCurrency(totais.aReceber) },
                      { label: "Total faturado", valor: formatCurrency(totais.faturado), destaque: true },
                    ]}
                  />
                </>
              )}

              {tipo === "vendas" && (
                <>
                  <FolhaKpis
                    itens={[
                      { label: "Faturado", valor: formatCurrency(totais.faturado) },
                      { label: "Recebido", valor: formatCurrency(totais.recebido) },
                      { label: "A receber", valor: formatCurrency(totais.aReceber) },
                      { label: "Vendas", valor: formatNumber(totais.quantidade) },
                    ]}
                  />
                  <FolhaTabela titulo="Vendas do período" colunas={colVendas} linhas={noRecorte} />
                  <FolhaTotais
                    itens={[
                      { label: "Ticket médio", valor: formatCurrency(totais.ticket) },
                      { label: "Recebido", valor: formatCurrency(totais.recebido) },
                      { label: "Total faturado", valor: formatCurrency(totais.faturado), destaque: true },
                    ]}
                  />
                </>
              )}

              {tipo === "vendedores" && (
                <>
                  <FolhaKpis
                    itens={[
                      { label: "Vendedores", valor: formatNumber(porVendedor.length) },
                      { label: "Vendas", valor: formatNumber(totais.quantidade) },
                      { label: "Faturado", valor: formatCurrency(totais.faturado) },
                      { label: "Ticket médio", valor: formatCurrency(totais.ticket) },
                    ]}
                  />
                  <FolhaTabela titulo="Desempenho por vendedor" colunas={colVendedores} linhas={porVendedor} vazio="Nenhuma venda no período." />
                  <FolhaTotais
                    itens={[
                      { label: "Recebido", valor: formatCurrency(totais.recebido) },
                      { label: "Total faturado", valor: formatCurrency(totais.faturado), destaque: true },
                    ]}
                  />
                </>
              )}

              {tipo === "recebiveis" && (
                <>
                  <FolhaKpis
                    itens={[
                      { label: "Notas em aberto", valor: formatNumber(emAberto.length) },
                      { label: "Total a receber", valor: formatCurrency(totais.aReceber) },
                      { label: "Já recebido", valor: formatCurrency(totais.recebido) },
                      { label: "Faturado", valor: formatCurrency(totais.faturado) },
                    ]}
                  />
                  <FolhaTabela titulo="Contas a receber" colunas={colVendas} linhas={emAberto} vazio="Nenhuma conta em aberto no período." />
                  <FolhaTotais itens={[{ label: "Total a receber", valor: formatCurrency(emAberto.reduce((a, v) => a + totalDoPedido(v), 0)), destaque: true }]} />
                </>
              )}

              {tipo === "clientes" && (
                <>
                  <FolhaKpis
                    itens={[
                      { label: "Clientes ativos", valor: formatNumber(porCliente.length) },
                      { label: "Base total", valor: formatNumber(clientes.length) },
                      { label: "Faturado", valor: formatCurrency(totais.faturado) },
                      { label: "Ticket médio", valor: formatCurrency(totais.ticket) },
                    ]}
                  />
                  <FolhaTabela titulo="Faturamento por cliente" colunas={colClientes} linhas={porCliente} vazio="Nenhum cliente comprou no período." />
                  <FolhaTotais itens={[{ label: "Total geral", valor: formatCurrency(porCliente.reduce((a, c) => a + c.total, 0)), destaque: true }]} />
                </>
              )}

              {tipo === "estoque" && (
                <>
                  <FolhaKpis
                    itens={[
                      /* Insumo fica de fora da CONTAGEM de produtos (ele não é um),
                         mas continua nas linhas de posição de estoque abaixo:
                         ele tem saldo, e posição de estoque é sobre saldo. */
                      { label: "Produtos", valor: formatNumber(produtos.filter(ehVendavel).length) },
                      { label: "Unidades", valor: formatNumber(/* bigint chega como string: sem Number() a soma concatena. */
                        produtos.reduce((a, p) => a + (Number(p.quantidade) || 0), 0)) },
                      { label: "Baixo/esgotado", valor: formatNumber(produtos.filter((p) => stockLevel(p.quantidade) !== "disponivel").length) },
                      { label: "Valor em estoque", valor: formatCurrency(valorEmEstoque) },
                    ]}
                  />
                  <FolhaTabela titulo="Posição de estoque" colunas={colEstoque} linhas={produtos} vazio="Nenhum produto cadastrado." />
                  <FolhaTotais itens={[{ label: "Valor total em estoque", valor: formatCurrency(valorEmEstoque), destaque: true }]} />
                </>
              )}

              <FolhaFooter emitidoEm={formatDateTime(new Date())} />
            </FolhaA4>
          </div>
        </div>
      </div>
    </PageScreen>
  );
};

export default RelatoriosPage;
