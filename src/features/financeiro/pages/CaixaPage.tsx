import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle, ArrowLeftRight, ArrowUpCircle, CalendarDays, CreditCard,
  Receipt, RotateCw, Trash2, TrendingDown, TrendingUp,
} from "lucide-react";

import { TabelaCard, TabelaHead, TabelaRow, TabelaVazia, type Coluna } from "@/shared/ui/DataTable";
import { AbasTabela } from "@/shared/ui/AbasTabela";
import Select from "@/shared/ui/Select";

import BotaoRecibo from "@/shared/ui/BotaoRecibo";
import { Modal } from "@/shared/ui/Modal";
import { Form, FormSection, FormGrid, FormActions, TextField } from "@/shared/ui/form/FormKit";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import useFinanceiroStore from "@/features/financeiro/store/financeiro.store";
import type { NovaMovimentacaoType } from "@/shared/domain/financeiro";
import { formatCurrency as brl, money } from "@/shared/utils/currency";
import { brDate } from "@/shared/utils/date";
import RecebimentosNota from "@/features/financeiro/components/RecebimentosNota";
import ListaContas from "@/features/financeiro/components/ListaContas";
import ContaForm from "@/features/financeiro/components/ContaForm";
import useContasStore from "@/features/financeiro/store/contas.store";
import ContaService, { type NovaConta, type TipoConta } from "@/features/financeiro/services/conta.service";
import ContasMensais from "@/features/financeiro/components/ContasMensais";

/**
 * Caixa — o dinheiro que entrou e saiu, num período.
 *
 * A tela responde uma pergunta só: "quanto tenho, e por onde passou". O que a
 * empresa deve e o que tem a receber são outras duas perguntas, com outro
 * recorte de tempo (vencimento, não pagamento), e por isso moram nas abas
 * vizinhas — misturá-las aqui fazia a tela responder três coisas e nenhuma bem.
 *
 * Cobrança de nota também não é daqui: a nota é aberta e recebida em Vendas,
 * onde o histórico do pedido está junto.
 */

/**
 * As quatro listas do dinheiro da empresa.
 *
 * Entradas e saídas são o CAIXA — dinheiro que já passou, datado pelo dia em
 * que passou. A pagar e a receber são COMPROMISSO — dinheiro que ainda vai
 * passar, datado pelo vencimento. Eram três telas separadas (Caixa, A pagar,
 * A receber) e o livro-caixa ainda misturava entrada e saída na mesma lista,
 * com um selo colorido na primeira coluna para desempatar.
 *
 * As quatro numa navegação só, dentro da mesma tabela: a pergunta "quanto
 * saiu?" e a pergunta "quanto ainda tenho que pagar?" são vizinhas na cabeça
 * de quem paga as contas, e agora são vizinhas na tela.
 */
export type AbaFinanceiro = "entradas" | "saidas" | "contas";

/** Recortes de data do caixa — o filtro que substituiu a barra de período. */
type Quando = "tudo" | "hoje" | "7" | "mes" | "ano" | "livre";

const QUANDO: { valor: Quando; label: string }[] = [
  { valor: "mes", label: "Este mês" },
  { valor: "hoje", label: "Hoje" },
  { valor: "7", label: "Últimos 7 dias" },
  { valor: "ano", label: "Este ano" },
  { valor: "tudo", label: "Tudo" },
  /*
   * O intervalo livre existe para o que não cabe em atalho — a semana do
   * feriado, o trimestre do contador. Escolhida esta opção, aparecem os dois
   * calendários ao lado; nas outras eles ficam fora do caminho, porque em
   * nove de cada dez aberturas do caixa o atalho já responde.
   */
  { valor: "livre", label: "Escolher período…" },
];

/** ISO local — `toISOString()` cai no dia anterior em fuso negativo. */
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const brDia = (isoStr: string) => isoStr.split("-").reverse().join("/");

/**
 * Uma linha do caixa, venha ela de onde vier.
 *
 * O recebimento de venda É uma entrada — o dinheiro entrou no caixa no dia em
 * que a nota foi paga. Ele tinha aba própria, e isso obrigava quem confere o
 * dia a somar duas listas de cabeça para saber quanto entrou. Aqui as duas
 * viram uma: `origem` guarda de onde a linha veio, porque o que se pode FAZER
 * com ela muda (a lançada à mão se apaga; a da nota se abre).
 */
type LinhaCaixa = {
  id: string;
  data: string;
  descricao: string;
  apoio: string;
  forma: string;
  formasExtras: number;
  formasDetalhe?: string;
  valor: number;
  tipo: "ENTRADA" | "SAIDA";
  origem: "caixa" | "venda";
  /**
   * A nota de onde o recebimento veio.
   *
   * Existe só em `origem: "venda"`, e é o que permite abrir o extrato dela —
   * onde o pagamento pode ser corrigido ou apagado. O `id` da linha já traz o
   * pedido embutido ("nota-<uuid>"), mas depender de desmontar uma string é
   * o tipo de acoplamento que quebra em silêncio no dia em que o formato
   * mudar.
   */
  pedidoId?: string;
};

const ABAS: { id: AbaFinanceiro; label: string; titulo: string; icone: ReactNode }[] = [
  { id: "entradas", label: "Entradas", titulo: "Entradas no caixa", icone: <TrendingUp size={15} /> },
  { id: "saidas", label: "Saídas", titulo: "Saídas do caixa", icone: <TrendingDown size={15} /> },
  /*
   * "Contas", e não "A pagar".
   *
   * O que a empresa TEM A RECEBER saiu daqui: é dinheiro de venda a prazo, e
   * "quem ainda me deve" se responde olhando a nota — por isso virou a aba
   * "A prazo" da tela de Vendas. O que fica aqui é o que a empresa DEVE, e
   * num financeiro com um lado só de conta o rótulo "A pagar" ficou dizendo o
   * óbvio contra um par que não existe mais.
   */
  { id: "contas", label: "Contas", titulo: "Contas a pagar", icone: <ArrowUpCircle size={15} /> },
];

/**
 * A coluna flexível é capada e sobra um vão no fim: com "1fr" solto, os
 * valores iam parar na borda direita do monitor, longe do nome a que
 * pertencem. Assim os dados ficam agrupados à esquerda.
 */
const COLS_CAIXA = "grid-cols-[minmax(180px,1fr)_150px_120px_110px_56px]";

/**
 * `abaInicial` vem do ENDEREÇO: `/financeiro/a-pagar` abre na aba de pagar.
 *
 * É o que mantém favorito, link mandado para o contador e histórico do
 * navegador funcionando depois que as três telas viraram quatro abas de uma.
 */
export default function CaixaPage({ abaInicial = "entradas" }: { abaInicial?: AbaFinanceiro } = {}) {
  const alert = useAlert();

  const notas = useFinanceiroStore((s) => s.notas);
  const movimentacoes = useFinanceiroStore((s) => s.movimentacoes);
  const error = useFinanceiroStore((s) => s.error);
  const fetchFinanceiro = useFinanceiroStore((s) => s.fetchFinanceiro);
  const criarMovimentacaoStore = useFinanceiroStore((s) => s.criarMovimentacao);

  /* Contas a pagar e a receber vêm do outro store: são o mesmo assunto
     ("dinheiro da empresa") com outro recorte de tempo — vencimento, e não
     pagamento — e por isso outra fonte. */
  const contas = useContasStore((s) => s.contas);
  const carregandoContas = useContasStore((s) => s.carregando);
  const fetchContas = useContasStore((s) => s.fetchContas);
  const excluirMovimentacaoStore = useFinanceiroStore((s) => s.excluirMovimentacao);

  /*
   * Dois filtros, os dois em `Select`.
   *
   * A tela já teve uma barra de período com quatro botões (Dia · Mês · Ano ·
   * Período) acima de tudo, e ela sumiu junto com os KPIs e os gráficos. O
   * recorte de tempo, porém, é a primeira coisa que se pergunta de um caixa —
   * "quanto entrou HOJE?" —, então ele volta como o que sempre deveria ter
   * sido: um seletor do tamanho de um seletor, na barra de filtros da tabela,
   * ao lado do filtro de forma de pagamento.
   */
  const [quando, setQuando] = useState<Quando>("mes");
  const [forma, setForma] = useState("");

  /* O intervalo livre começa no mês corrente: assim, escolher "Escolher
     período…" não zera a lista enquanto a pessoa ainda não mexeu nas datas. */
  const [de, setDe] = useState(() => {
    const h = new Date();
    return isoLocal(new Date(h.getFullYear(), h.getMonth(), 1));
  });
  const [ate, setAte] = useState(() => isoLocal(new Date()));

  /* Qual das quatro listas a tabela mostra. As duas primeiras são o caixa
     (dinheiro que já passou); as duas últimas são compromisso (dinheiro que
     ainda vai passar) — ver a nota da tabela lá embaixo. */
  const [aba, setAba] = useState<AbaFinanceiro>(abaInicial);
  const [novaConta, setNovaConta] = useState<TipoConta | null>(null);
  const [salvandoConta, setSalvandoConta] = useState(false);
  const [showNovaMovimentacao, setShowNovaMovimentacao] = useState(false);
  const [salvando, setSalvando] = useState(false);
  /*
   * O detalhe é guardado por ID, não por cópia da linha.
   *
   * Com a nota copiada para o estado, corrigir um recebimento dentro do modal
   * deixava a janela mostrando os números de antes — a lista já tinha sido
   * relida do servidor e o modal continuava exibindo o retrato tirado no
   * clique. Derivando de `notas`, a correção aparece no mesmo instante em que
   * a lista atrás dela muda.
   */
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const [novaMovimentacao, setNovaMovimentacao] = useState<NovaMovimentacaoType>({
    tipo: "ENTRADA",
    categoria: "",
    descricao: "",
    valor: 0,
    dataMovimentacao: "",
  });

  useEffect(() => {
    fetchFinanceiro();
    fetchContas();
  }, [fetchFinanceiro, fetchContas]);

  const detalhe = useMemo(() => notas.find((n) => String(n.pedido_id) === detalheId) ?? null, [notas, detalheId]);

  /* ---------------- O caixa, numa lista só ---------------- */

  const ehCaixa = aba === "entradas" || aba === "saidas";
  const ehConta = aba === "contas";

  /**
   * O recorte, como um par de datas ISO — `null` quando não há corte.
   *
   * Comparar string ISO basta e evita fuso: "2026-08-03" >= "2026-08-01" é
   * verdade em qualquer máquina, e `new Date(iso)` no horário de verão já
   * escorregou um dia mais de uma vez neste código.
   */
  const recorte = useMemo<{ de: string; ate: string } | null>(() => {
    if (quando === "tudo") return null;
    if (quando === "livre") return { de, ate };

    const h = new Date();
    const fim = isoLocal(h);

    if (quando === "hoje") return { de: fim, ate: fim };
    if (quando === "7") return { de: isoLocal(new Date(+h - 6 * 86_400_000)), ate: fim };
    if (quando === "mes") return { de: isoLocal(new Date(h.getFullYear(), h.getMonth(), 1)), ate: fim };

    return { de: `${h.getFullYear()}-01-01`, ate: fim };
  }, [quando, de, ate]);

  /**
   * Todo o movimento do caixa, das duas fontes, no formato de linha.
   *
   * Recebimento de venda entra como ENTRADA: para o caixa, dinheiro pago é
   * dinheiro que entrou, e a data que vale é a do pagamento — uma nota de
   * janeiro quitada em março é dinheiro de março para quem fecha o mês.
   */
  const linhas = useMemo<LinhaCaixa[]>(() => {
    const todas: LinhaCaixa[] = [];

    for (const m of movimentacoes) {
      todas.push({
        id: m.id,
        data: String(m.data_movimentacao),
        descricao: m.descricao,
        apoio: m.categoria?.trim() || "Lançado à mão",
        forma: m.categoria?.trim() || "Caixa",
        formasExtras: 0,
        valor: Number(m.valor) || 0,
        tipo: m.tipo === "SAIDA" ? "SAIDA" : "ENTRADA",
        origem: "caixa",
      });
    }

    for (const n of notas) {
      const pago = Number(n.valor_pago ?? 0);
      if (!(pago > 0)) continue;

      /* Uma nota pode ter entrado por duas portas ("metade no Pix, metade em
         dinheiro"). A coluna mostra a primeira e conta as outras; o `title`
         abre a divisão inteira. */
      const formas = n.formas ?? [];

      todas.push({
        id: `nota-${n.pedido_id}`,
        data: String(n.data_pagamento ?? n.data_pedido),
        descricao: n.cliente_nome || "Venda",
        apoio: `Nota #${n.codigo_pedido}`,
        forma: formas[0]?.forma || n.forma_pagamento?.trim() || "Não informado",
        formasExtras: Math.max(formas.length - 1, 0),
        formasDetalhe: formas.length > 1 ? formas.map((f) => `${f.forma}: ${money(f.valor)}`).join(" · ") : undefined,
        valor: pago,
        tipo: "ENTRADA",
        origem: "venda",
        pedidoId: String(n.pedido_id),
      });
    }

    return todas.sort((a, b) => +new Date(b.data) - +new Date(a.data));
  }, [movimentacoes, notas]);

  /** As formas que EXISTEM no movimento — o seletor não oferece opção vazia. */
  const formasConhecidas = useMemo(
    () => [...new Set(linhas.map((l) => l.forma).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [linhas],
  );

  const noRecorte = useMemo(
    () =>
      linhas.filter((l) => {
        const dia = String(l.data).slice(0, 10);

        return (!recorte || (dia >= recorte.de && dia <= recorte.ate)) && (forma ? l.forma === forma : true);
      }),
    [linhas, recorte, forma],
  );

  const linhasDoCaixa = useMemo(
    () => noRecorte.filter((l) => (aba === "saidas" ? l.tipo === "SAIDA" : l.tipo === "ENTRADA")),
    [noRecorte, aba],
  );

  /** O total da aba aberta — vai no lugar da contagem, no cabeçalho. */
  const totalDaAba = useMemo(() => linhasDoCaixa.reduce((acc, l) => acc + l.valor, 0), [linhasDoCaixa]);

  const contagem: Record<AbaFinanceiro, number> = useMemo(() => ({
    "entradas": noRecorte.filter((l) => l.tipo === "ENTRADA").length,
    "saidas": noRecorte.filter((l) => l.tipo === "SAIDA").length,
    /* Na conta a contagem é de PARCELAS em aberto — é a parcela que vence.
       "Aluguel — 12x" com uma vencida conta 1, não 12. */
    "contas": contas
      .filter((c) => c.tipo === "PAGAR" && c.status !== "CANCELADA")
      .reduce((acc, c) => acc + c.parcelas.filter((x) => x.situacao !== "PAGA").length, 0),
  }), [noRecorte, contas]);

  const rotulo = quando === "livre" ? `${brDia(de)} a ${brDia(ate)}` : QUANDO.find((q) => q.valor === quando)!.label.toLowerCase();

  /* ---------------- Ações ---------------- */

  /** O botão da aba já sabe o tipo: quem está em "Saídas" quer lançar saída. */
  const abrirLancamento = (tipo: "ENTRADA" | "SAIDA") => {
    setNovaMovimentacao({ tipo, categoria: "", descricao: "", valor: 0, dataMovimentacao: "" });
    setShowNovaMovimentacao(true);
  };

  const criarConta = async (dados: NovaConta) => {
    setSalvandoConta(true);

    try {
      await ContaService.criar(dados);
      setNovaConta(null);
      await fetchContas(true);
      alert.success("Conta criada!", dados.parcelas && dados.parcelas > 1 ? `${dados.parcelas} parcelas geradas com os vencimentos.` : "O vencimento já está na lista.");
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível criar a conta."));
    } finally {
      setSalvandoConta(false);
    }
  };

  const handleCriarMovimentacao = async () => {
    if (!novaMovimentacao.descricao || !novaMovimentacao.dataMovimentacao || novaMovimentacao.valor <= 0) {
      alert.warning("Preencha os campos", "Descrição, valor e data são obrigatórios.");
      return;
    }

    setSalvando(true);

    try {
      await criarMovimentacaoStore(novaMovimentacao);
      alert.success("Movimentação registrada!", "O lançamento foi adicionado ao caixa.");
      setShowNovaMovimentacao(false);
      setNovaMovimentacao({ tipo: "ENTRADA", categoria: "", descricao: "", valor: 0, dataMovimentacao: "" });
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível registrar a movimentação."));
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluirMovimentacao = async (id: string) => {
    try {
      await excluirMovimentacaoStore(id);
      alert.success("Excluída!", "A movimentação foi removida.");
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível excluir a movimentação."));
    }
  };

  /* ---------------- Colunas ---------------- */

  /*
   * Quatro colunas e um botão — as mesmas para entrada e saída.
   *
   * A coluna "Tipo", com o selo verde/vermelho, saiu: agora é a ABA que diz
   * se a lista é de entrada ou de saída, e um selo repetindo isso em todas as
   * linhas era ruído. No lugar dela entrou "Forma", que era a informação que
   * só existia na tabela de recebimentos e é o que a rosca de formas de
   * pagamento respondia antes de sair.
   */
  const colCaixa: Coluna<LinhaCaixa>[] = [
    {
      id: "desc",
      header: "Descrição",
      cell: (l) => (
        <span className="block min-w-0">
          <span className="block truncate text-ink">{l.descricao}</span>
          <span className="block truncate text-[11px] text-faint">{l.apoio}</span>
        </span>
      ),
    },
    {
      id: "forma",
      header: "Forma",
      cell: (l) => (
        <span
          className="inline-flex w-fit items-center gap-1.5 rounded-full border border-fg/[0.1] px-2.5 py-0.5 text-[11px] text-mist"
          title={l.formasDetalhe}
        >
          <CreditCard size={11} className="text-muted" />
          {l.forma}
          {l.formasExtras > 0 && <span className="text-faint">+{l.formasExtras}</span>}
        </span>
      ),
    },
    {
      id: "valor",
      header: "Valor",
      align: "right",
      cell: (l) => <span className={`nums ${l.tipo === "ENTRADA" ? "text-success" : "text-danger"}`}>{brl(l.valor)}</span>,
    },
    { id: "data", header: "Data", align: "right", cell: (l) => <span className="nums text-mist">{brDate(l.data)}</span> },
    {
      id: "acoes",
      header: "",
      align: "right",
      /* O que se pode fazer depende da ORIGEM: o lançamento feito à mão se
         apaga; o recebimento veio de uma nota e se abre nela — apagar por
         aqui desfaria um pagamento pelas costas do pedido. */
      cell: (l) =>
        l.origem === "caixa" ? (
          <button onClick={() => handleExcluirMovimentacao(l.id)} className="focus-ring rounded-lg bg-fg/[0.05] p-1.5 text-faint transition-colors hover:bg-danger/20 hover:text-danger" title="Excluir lançamento">
            <Trash2 size={14} />
          </button>
        ) : (
          /*
           * Este ícone ERA um `<span>` — dizia "abra a nota para ver o
           * extrato" e não abria nada. O modal de recebimento e o
           * `RecebimentosNota` (que corrige e apaga) existiam no arquivo e
           * eram inalcançáveis: nada chamava `setDetalheId`.
           *
           * Resultado prático: um recebimento de venda lançado errado não
           * tinha como ser removido por tela nenhuma — a lixeira não aparece
           * aqui de propósito (apagar por fora desfaria o pagamento pelas
           * costas do pedido) e o caminho certo estava fechado.
           */
          <button
            type="button"
            onClick={() => l.pedidoId && setDetalheId(l.pedidoId)}
            title="Abrir o extrato da nota — é lá que o recebimento se corrige ou se apaga"
            aria-label="Abrir o extrato da nota"
            className="focus-ring rounded-lg bg-fg/[0.05] p-1.5 text-faint transition-colors hover:bg-accent/20 hover:text-accent-soft"
          >
            <Receipt size={14} />
          </button>
        ),
    },
  ];

  const modais = (
    <>
      {/* Criar conta a pagar / a receber — o mesmo formulário das duas abas,
          com o tipo vindo de qual delas estava aberta. */}
      {novaConta && (
        <ContaForm
          tipo={novaConta}
          salvando={salvandoConta}
          onFechar={() => setNovaConta(null)}
          onSalvar={criarConta}
        />
      )}

      <Modal open={showNovaMovimentacao} onClose={() => setShowNovaMovimentacao(false)} title="Nova movimentação" subtitle="Registre uma entrada ou saída no caixa">
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            handleCriarMovimentacao();
          }}
        >
          <FormSection title="Lançamento" icon={<ArrowLeftRight size={14} />}>
            <div className="flex gap-2">
              {(["ENTRADA", "SAIDA"] as const).map((t) => {
                const ativo = novaMovimentacao.tipo === t;
                const cor = t === "ENTRADA" ? "border-success/50 bg-success/15 text-success" : "border-danger/50 bg-danger/15 text-danger";

                return (
                  <button key={t} type="button" onClick={() => setNovaMovimentacao({ ...novaMovimentacao, tipo: t })} className={`focus-ring flex-1 cursor-pointer rounded-lg border px-3 py-2 text-sm transition-colors ${ativo ? cor : "border-fg/[0.1] text-faint hover:text-mist"}`}>
                    {t === "ENTRADA" ? "Entrada" : "Saída"}
                  </button>
                );
              })}
            </div>

            <TextField label="Descrição" value={novaMovimentacao.descricao} onChange={(e) => setNovaMovimentacao({ ...novaMovimentacao, descricao: e.target.value })} placeholder="Ex: Aluguel, fornecedor, venda avulsa…" />
            <TextField label="Categoria (opcional)" value={novaMovimentacao.categoria ?? ""} onChange={(e) => setNovaMovimentacao({ ...novaMovimentacao, categoria: e.target.value })} />

            <FormGrid cols={2}>
              <TextField label="Valor" type="number" min={0} step="0.01" value={novaMovimentacao.valor} onChange={(e) => setNovaMovimentacao({ ...novaMovimentacao, valor: Number(e.target.value) })} />
              <TextField label="Data" type="date" value={novaMovimentacao.dataMovimentacao} onChange={(e) => setNovaMovimentacao({ ...novaMovimentacao, dataMovimentacao: e.target.value })} />
            </FormGrid>
          </FormSection>

          <FormActions onCancel={() => setShowNovaMovimentacao(false)} saving={salvando} submitText="Registrar" />
        </Form>
      </Modal>

      {/*
       * Detalhe do recebimento.
       *
       * Deixou de ser só consulta: era daqui que a pessoa percebia o valor
       * errado — e daqui que ela era mandada procurar a nota em outra tela para
       * poder corrigir. O extrato abaixo edita e apaga no mesmo lugar em que o
       * erro aparece; apagar o lançamento a mais desquita a nota, porque a
       * situação é recalculada da soma das linhas.
       */}
      <Modal open={!!detalhe} onClose={() => setDetalheId(null)} title="Recebimento" subtitle={detalhe ? `${detalhe.cliente_nome} · nota #${detalhe.codigo_pedido}` : ""} maxWidth="max-w-sm">
        {detalhe && (
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-fg/[0.06]">
            {(
              [
                ["Total da nota", money(Number(detalhe.total ?? 0))],
                ["Recebido", money(Number(detalhe.valor_pago ?? 0))],
                /* Duas formas na mesma venda são a regra, não a exceção
                   ("metade no Pix, metade em dinheiro"). Dizer só a última
                   fazia a conferência com a maquininha nunca fechar. */
                ["Forma", (detalhe.formas ?? []).length > 1 ? (detalhe.formas ?? []).map((f) => f.forma).join(" · ") : (detalhe.formas ?? [])[0]?.forma || detalhe.forma_pagamento?.trim() || "Não informado"],
                ["Pago em", brDate(detalhe.data_pagamento)],
                ["Venda em", brDate(detalhe.data_pedido)],
                /* "Parcial" com R$ 0,00 seria contradição — e é o que a
                   janela mostra logo depois de alguém apagar o único
                   recebimento para desquitar a nota. */
                ["Situação", Number(detalhe.valor_pago ?? 0) >= Number(detalhe.total ?? 0) ? "Quitada" : Number(detalhe.valor_pago ?? 0) > 0 ? "Parcial" : "Em aberto"],
              ] as [string, string][]
            ).map(([rot, val]) => (
              <div key={rot} className="min-w-0 bg-surface px-3.5 py-3">
                <dt className="text-[10px] uppercase tracking-[0.1em] text-faint">{rot}</dt>
                <dd className="nums mt-1 truncate text-[13px] text-ink">{val}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* O extrato: de onde veio cada real, e onde se conserta o que foi
            lançado errado. */}
        {detalhe && (
          <div className="mt-4">
            <RecebimentosNota pedidoId={String(detalhe.pedido_id)} versao={Number(detalhe.valor_pago ?? 0)} onAlterado={() => fetchFinanceiro(true)} />
          </div>
        )}

        {/* Recibo: só de nota quitada.
            Um comprovante de quitação para pagamento parcial afirmaria o que
            não aconteceu — e é o cliente que leva esse papel para a
            contabilidade dele. */}
        {detalhe && Number(detalhe.valor_pago ?? 0) >= Number(detalhe.total ?? 0) && (
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-fg/[0.06] pt-4">
            <p className="text-[12px] leading-relaxed text-mist">Comprovante de pagamento para o cliente.</p>

            <BotaoRecibo
              dados={{
                numero: String(detalhe.codigo_pedido),
                clienteNome: detalhe.cliente_nome,
                valor: Number(detalhe.valor_pago ?? 0),
                formaPagamento: detalhe.forma_pagamento,
                pagoEm: detalhe.data_pagamento ?? detalhe.data_pedido,
              }}
            />
          </div>
        )}
      </Modal>
    </>
  );

  /* ---------------- Estados de carga ---------------- */

  if (error) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-center">
        <AlertTriangle className="h-8 w-8 text-danger" />
        <p className="max-w-md text-sm text-mist">{error}</p>
        <button onClick={() => fetchFinanceiro(true)} className="focus-ring flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm text-white transition hover:brightness-110">
          <RotateCw size={14} /> Tentar de novo
        </button>
      </div>
    );
  }

  /* ---------------- Tela ---------------- */

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/*
       * ---------------------------------------------------------------------
       * A tela é UMA tabela. Nada mais.
       * ---------------------------------------------------------------------
       * Ela já foi seis coisas empilhadas: uma barra de ações com filtro de
       * período, recarregar e "+ Movimentação"; quatro KPIs; um gráfico de
       * área de 300px; uma rosca de formas de pagamento; a tabela do
       * livro-caixa; e uma segunda tabela com os recebimentos de venda. Duas
       * telas de rolagem antes da primeira linha do movimento — e, na prática,
       * os painéis nem cabiam: como filhos de um flex column sem `shrink-0`
       * eles eram cortados no meio e a tabela subia por cima.
       *
       * O que cada peça dizia já está dito em outro lugar:
       *
       *   • os KPIs "Entradas" e "Saídas" viraram ABAS, com a contagem no
       *     rótulo e a lista inteira a um clique;
       *   • o gráfico de área desenhava a mesma série que a tabela lista linha
       *     a linha — e num caixa de loja pequena ele é dois picos e uma reta
       *     no chão;
       *   • a rosca de formas de pagamento respondia "como entrou", que é
       *     coluna da tabela de recebimentos;
       *   • a segunda tabela virou a quinta aba.
       *
       * Sobraram duas coisas: o aviso das contas que se repetem todo mês —
       * a única com PRAZO, e por isso no topo — e o movimento em si, ocupando
       * toda a altura que a janela tiver.
       */}
      <ContasMensais contas={contas} />

      <TabelaCard
        title={ABAS.find((a) => a.id === aba)!.titulo}
        icon={ABAS.find((a) => a.id === aba)!.icone}
        count={contagem[aba]}
        /* No caixa o rodapé do título diz o RECORTE e o TOTAL — "este mês ·
           R$ 12.586,10" —, que é a soma que a pessoa faria de cabeça olhando a
           coluna de valores. */
        countLabel={ehCaixa ? `${rotulo} · ${money(totalDaAba)}` : "parcelas em aberto"}
        onAdd={ehCaixa ? () => abrirLancamento(aba === "saidas" ? "SAIDA" : "ENTRADA") : () => setNovaConta("PAGAR")}
        addLabel={ehCaixa ? (aba === "saidas" ? "Lançar saída" : "Lançar entrada") : "Nova conta"}
        /* Os dois filtros só valem para o caixa: a conta a pagar é ordenada
           por vencimento e não tem forma de pagamento até ser paga. */
        controles={ehCaixa ? (
          <>
            <Select
              valor={quando}
              onChange={(v) => setQuando(v as Quando)}
              opcoes={QUANDO.map((q) => ({ valor: q.valor, label: q.label }))}
              icone={<CalendarDays size={14} />}
              aria-label="Filtrar por data"
              className="w-[168px] shrink-0"
            />

            {/* Os dois calendários só aparecem no intervalo livre. São
                `input type="date"`: o calendário é o do próprio sistema
                operacional, que a pessoa já sabe usar e que funciona no
                teclado e no celular sem nada a mais. */}
            {quando === "livre" && (
              <span className="flex shrink-0 items-center gap-1.5">
                <input
                  type="date"
                  value={de}
                  max={ate}
                  onChange={(e) => setDe(e.target.value)}
                  aria-label="Data inicial"
                  className="focus-ring h-[38px] shrink-0 cursor-pointer rounded-xl border border-fg/[0.09] bg-fg/[0.03] px-2.5 text-[12.5px] text-ink outline-none focus:border-accent/60"
                />
                <span className="text-[11.5px] text-faint">até</span>
                <input
                  type="date"
                  value={ate}
                  min={de}
                  onChange={(e) => setAte(e.target.value)}
                  aria-label="Data final"
                  className="focus-ring h-[38px] shrink-0 cursor-pointer rounded-xl border border-fg/[0.09] bg-fg/[0.03] px-2.5 text-[12.5px] text-ink outline-none focus:border-accent/60"
                />
              </span>
            )}

            {/* O seletor de forma só existe se houver mais de uma: com uma só,
                ele não filtra nada e vira ruído. */}
            {formasConhecidas.length > 1 && (
              <Select
                valor={forma}
                onChange={setForma}
                opcoes={[{ valor: "", label: "Todas as formas" }, ...formasConhecidas.map((f) => ({ valor: f, label: f }))]}
                icone={<CreditCard size={14} />}
                aria-label="Filtrar por forma de pagamento"
                className="w-[178px] shrink-0"
              />
            )}
          </>
        ) : undefined}
        navegacao={
          <AbasTabela
            grupo="abas-financeiro"
            valor={aba}
            onValor={setAba}
            abas={ABAS.map(({ id, label, icone }) => ({ id, label, icone, contagem: contagem[id] }))}
          />
        }
      >
        {/* A lista de contas traz a própria peça: a parcela tem botão de
            pagar, de recibo e de cancelar, e essa lógica já mora na
            `ListaContas`. Aqui ela entra sem moldura — quem dá a moldura é
            este cartão. */}
        {ehConta ? (
          <ListaContas
            embutida
            tipo="PAGAR"
            contas={contas.filter((c) => c.tipo === "PAGAR")}
            carregando={carregandoContas}
            onRecarregar={() => void fetchContas(true)}
          />
        ) : linhasDoCaixa.length === 0 ? (
          <TabelaVazia
            icon={<ArrowLeftRight size={20} />}
            title={aba === "saidas" ? "Nenhuma saída neste período" : "Nenhuma entrada neste período"}
            description="O que você registrar aparece aqui."
          />
        ) : (
          <>
            <TabelaHead cols={COLS_CAIXA} colunas={colCaixa} />
            {linhasDoCaixa.map((m) => (
              /* A linha inteira abre o extrato quando o dinheiro veio de uma
                 venda — é o alvo grande para o gesto que o ícone também faz.
                 Lançamento à mão não abre nada: ele não tem extrato, e a
                 única ação dele é a lixeira ao lado. */
              <TabelaRow
                key={m.id}
                cols={COLS_CAIXA}
                colunas={colCaixa}
                row={m}
                onClick={m.origem === "venda" && m.pedidoId ? () => setDetalheId(m.pedidoId!) : undefined}
              />
            ))}
          </>
        )}
      </TabelaCard>

      {modais}
    </div>
  );
}
