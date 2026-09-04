import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LegacyRef, ReactNode } from "react";
import { ShoppingCart, Plus, Receipt, UserCheck, DollarSign, Wallet, AlertCircle, Hash, TrendingUp, ChevronRight, Search, UserPlus, PackagePlus, FileText, Check, X, Trash2, CalendarDays } from "lucide-react";

import { useLocation, useNavigate } from "react-router-dom";

import Invoice from "@/features/vendas/components/Invoice";
import { PageScreen, PrimaryAction, GhostAction } from "@/shared/ui/PageShell";
import SeletorDia from "@/shared/ui/SeletorDia";
import OrcamentoService, { type Orcamento } from "@/features/orcamentos/services/orcamento.service";

import useVendaStore from "@/features/vendas/store/venda.store";
import useClienteStore from "@/features/clientes/store/cliente.store";
import { eStatus } from "@/shared/domain/cliente";
import useSincronizacao from "@/shared/realtime/useSincronizacao";
import ClienteForm from "@/features/clientes/components/ClienteForm";
import { ProdutoForm } from "@/features/estoque/components/ProdutoForm";
import ProductService from "@/features/estoque/services/product.service";
import type { ProductFormData } from "@/features/estoque/schema/product.schema";
import type { ClienteFormData } from "@/features/clientes/schema/cliente.schema";
import { KpiFaixa } from "@/shared/ui/Painel";
import { Modal } from "@/shared/ui/Modal";
import { BarraFiltros, ListaAcao } from "@/shared/ui/DataTable";
import { AbasTabela } from "@/shared/ui/AbasTabela";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import { formatCurrency } from "@/shared/utils/currency";

import MenuDownloadNota from "@/shared/ui/MenuDownloadNota";
import NotaResumo from "@/features/vendas/components/NotaResumo";
import OrcamentoNota from "@/features/orcamentos/components/OrcamentoNota";
import { gerarBlobNota } from "@/shared/ui/DownloadButton";
import { baixarNotaPdf } from "@/shared/ui/downloadNota";
import useEnterprise from "@/features/empresa/store/enterprise.store";

import { estaAberto as estaAberta, totalDoPedido, type ItemPedidoType, type PedidoClienteType } from "@/shared/domain/pedido";
import { formatTime as horaVenda, formatDate as dataBr, diaExtenso, isSameDay as noMesmoDia } from "@/shared/utils/date";
import { getInitials as iniciais, formatDocument, formatNumber } from "@/shared/utils/format";
import { Selo, type TomSelo } from "@/shared/ui/StatusBadge";

// Só o essencial: quem é o cliente e (se existir) qual pedido.
/* `clienteId` opcional: orçamento é montado para nome livre, sem cadastro. */
type NotaAberta = {
  id?: string;
  clienteId?: string;
  nome?: string;
  orcamento?: boolean;
  /** Itens com que a nota abre — quem vem de um orçamento não relança nada. */
  itens?: ItemPedidoType[];
  /** Reescrevendo esta proposta em vez de criar outra. */
  orcamentoId?: string;
  /** Proposta que esta venda substitui — apagada quando a nota for gerada. */
  converterOrcamentoId?: string;
};

/**
 * ============================================================================
 * PDV — o balcão. 1.250 linhas; leia este mapa antes de procurar onde mexer.
 * ============================================================================
 *
 * A tela onde a venda acontece. Duas abas sobre a MESMA operação:
 *
 *   • VENDAS — as notas do dia escolhido no calendário;
 *   • ORÇAMENTOS — as propostas, com aprovar, recusar e faturar.
 *
 * A venda em si NÃO está aqui: ela abre num modal com o componente `Invoice`,
 * o mesmo usado pela lista de vendas, por Orçamentos e pelo CRM. Mudar o
 * comportamento da nota é mexer lá, não neste arquivo.
 *
 * ----------------------------------------------------------------------------
 * COMO O ARQUIVO ESTÁ DIVIDIDO
 * ----------------------------------------------------------------------------
 *   1. COMPONENTES LOCAIS — `Kpi`, `StatusBadge`, `Avatar`, `SearchBox` e
 *      `LinhaAcoes`. São desta tela e não subiram para `shared/ui` porque ainda
 *      não tiveram um segundo consumidor; se você precisar de um deles noutra
 *      tela, o certo é subir, não copiar — foi o que se fez com o `AcaoLinha`
 *      daqui, que era o `ListaAcao` compartilhado com duas cores a mais.
 *
 *   2. A PÁGINA (~174 em diante) — estado, carga e o render das duas abas.
 *
 * ----------------------------------------------------------------------------
 * O CAMINHO DO ORÇAMENTO ATÉ A VENDA
 * ----------------------------------------------------------------------------
 * É o fluxo que mais confunde quem chega. Aprovar uma proposta não fatura
 * nada: `faturarId` abre o `Invoice` com os itens da proposta já montados
 * (`itensIniciais`) e com `converterOrcamentoId`, e é o `Invoice` que apaga o
 * orçamento DEPOIS que o servidor devolve o id da nota — nunca antes. Ver a
 * nota daquela prop.
 *
 * ----------------------------------------------------------------------------
 * DUAS COISAS QUE PARECEM BUG E NÃO SÃO
 * ----------------------------------------------------------------------------
 *   • O status de pagamento é DERIVADO do valor já pago, não lido do campo de
 *     status: nota parcialmente paga continua ABERTA no banco.
 *   • Os botões da linha ficam SOBREPOSTOS à direita, fora do botão da linha
 *     (`LinhaAcoes`). Botão dentro de botão é HTML inválido e, na prática,
 *     clicar em "aprovar" abriria a nota junto.
 *
 * Os números de linha envelhecem; os nomes, não.
 */

/* --------------------------- Componentes locais --------------------------- */

const TONES = {
  accent: "bg-accent/[0.15] text-accent-soft ring-accent/20",
  success: "bg-success/15 text-success ring-success/20",
  warning: "bg-warning/15 text-warning ring-warning/20",
  neutral: "bg-fg/[0.06] text-mist ring-fg/10",
} as const;

const Kpi = ({ icon, label, value, tone = "neutral" }: { icon: ReactNode; label: string; value: string; tone?: keyof typeof TONES }) => (
  <div className="card-interactive glass-sheen p-4">
    <div className={`mb-2.5 flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset ${TONES[tone]}`}>{icon}</div>
    <p className="text-[11px] text-faint">{label}</p>
    <p className="nums mt-0.5 text-xl tracking-tight text-ink">{value}</p>
  </div>
);

const TOM_PAGAMENTO = { PAGA: "sucesso", PARCIAL: "info", ABERTA: "alerta" } as const;
const ROTULO_PAGAMENTO = { PAGA: "Pago", PARCIAL: "Parcial", ABERTA: "Em aberto" } as const;

const StatusBadge = ({ status }: { status: keyof typeof TOM_PAGAMENTO }) => (
  <Selo tom={TOM_PAGAMENTO[status]}>{ROTULO_PAGAMENTO[status]}</Selo>
);

const Avatar = ({ name, size = "md" }: { name?: string; size?: "sm" | "md" }) => {
  const dim = size === "sm" ? "h-8 w-8 text-[10px]" : "h-9 w-9 text-[11px]";
  return <div className={`flex ${dim} shrink-0 items-center justify-center rounded-xl border border-accent/25 bg-gradient-to-br from-accent/30 to-accent-soft/10 text-accent-soft`}>{iniciais(name)}</div>;
};

/**
 * Deriva o status de pagamento pelo valor já pago (não só pelo status do
 * pedido) — assim uma nota com pagamento parcial aparece como "Parcial",
 * não como "Em aberto" cheio.
 */
const statusPagamentoVenda = (v: { pedido: { valorPago?: number } }, total: number): "ABERTA" | "PARCIAL" | "PAGA" => {
  const pago = Number(v.pedido.valorPago ?? 0);
  if (pago <= 0) return "ABERTA";
  if (pago >= total) return "PAGA";
  return "PARCIAL";
};

const SearchBox = ({ value, onChange, placeholder, className = "" }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) => (
  <div className={`glass-subtle flex items-center gap-2 rounded-xl px-3 transition-all focus-within:border-accent/50 focus-within:shadow-glow ${className}`}>
    <Search className="h-4 w-4 shrink-0 text-muted" />
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full flex-1 bg-transparent py-2 text-[13px] text-ink outline-none placeholder:text-faint" />
  </div>
);

/**
 * Linha da lista com botões próprios.
 *
 * As ações ficam FORA do botão da linha, sobrepostas à direita: botão dentro
 * de botão é HTML inválido e, na prática, clicar em "aprovar" abriria também
 * a nota — a pessoa pediria uma coisa e receberia outra. O vão entre os
 * ícones continua sendo área clicável da linha.
 */
const LinhaAcoes = ({ children }: { children: ReactNode }) => (
  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4">
    <div className="pointer-events-auto flex items-center gap-1 opacity-70 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">{children}</div>
  </div>
);


/* --------------------------------- Página --------------------------------- */

/** Vocabulário dos orçamentos — o mesmo da tela de Orçamentos. */
const SITUACAO_ORCAMENTO: Record<string, { label: string; tom: TomSelo }> = {
  ABERTO: { label: "Aguardando", tom: "alerta" },
  APROVADO: { label: "Aprovado", tom: "sucesso" },
  RECUSADO: { label: "Recusado", tom: "perigo" },
  EXPIRADO: { label: "Expirado", tom: "neutro" },
  /* Fora da fila, mas mapeado: se um convertido chegar por outro caminho, o
     selo diz o que ele é em vez de cair no genérico "Aguardando". */
  CONVERTIDO: { label: "Virou venda", tom: "info" },
};

const PontoDeVenda = () => {
  const navigate = useNavigate();

  const vendas = useVendaStore((s) => s.vendas);
  const fetchVendas = useVendaStore((s) => s.fetchVendas);
  const clientes = useClienteStore((s) => s.clientes);
  const fetchClientes = useClienteStore((s) => s.fetchClientes);

  const [novaVendaOpen, setNovaVendaOpen] = useState(false);
  const [nomeCliente, setNomeCliente] = useState("");
  const [busca, setBusca] = useState("");
  const [notaAberta, setNotaAberta] = useState<NotaAberta | null>(null);

  /*
   * O dia em foco — começa em hoje, que é o que o balcão quer ver ao abrir.
   *
   * Substitui o par "Hoje / Este mês". Aqueles dois botões respondiam à
   * pergunta do dia e a mais nenhuma: conferir sábado passado ou refazer o
   * caixa de anteontem obrigava a sair do PDV. Um dia escolhível responde às
   * três, e "hoje" continua sendo o que se vê sem clicar em nada.
   */
  const [dia, setDia] = useState(() => new Date());

  /* Qual lista a tabela mostra. As abas do topo da página levam para telas
     diferentes; estas trocam o conteúdo sem sair do balcão. */
  const [aba, setAba] = useState<"vendas" | "orcamentos">("vendas");

  const location = useLocation();

  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);

  /* Proposta que a tela de Orçamentos mandou faturar — ver o efeito que lê
     `location.state`. */
  const [faturarId, setFaturarId] = useState<string | null>(null);

  /* Ação em andamento numa linha — trava só aquela, não a tabela inteira. */
  const [ocupado, setOcupado] = useState<string | null>(null);

  /*
   * Download direto da linha, sem abrir a nota.
   *
   * Um único nó escondido fora da tela, cujo conteúdo é trocado para o
   * documento escolhido antes de rasterizar. N notas escondidas (uma por
   * linha) custariam o render de todas elas a cada mudança da lista.
   */
  const [notaDownload, setNotaDownload] = useState<PedidoClienteType | null>(null);
  const [orcamentoDownload, setOrcamentoDownload] = useState<Orcamento | null>(null);
  const refNotaDownload = useRef<HTMLDivElement>(null);
  const refOrcamentoDownload = useRef<HTMLDivElement>(null);
  const enterprise = useEnterprise((s) => s.enterprise);

  /* Clicar na linha mostra a proposta como o cliente a recebeu. As decisões
     ficam nos botões: abrir para ler não pode ter efeito colateral. */
  const [visualizando, setVisualizando] = useState<Orcamento | null>(null);

  /* No celular a tela é outra e não tem esta tabela — o par de listas do dia é
     coisa de desktop, e buscar orçamento ali seria uma requisição jogada fora. */

  /* Cadastros no próprio PDV: parar a venda para ir até Clientes ou Estoque e
     voltar é o que faz o operador desistir e vender "no caderno". */
  const [novoClienteOpen, setNovoClienteOpen] = useState(false);
  const [novoProdutoOpen, setNovoProdutoOpen] = useState(false);

  /* Orçamento volta a abrir pela nota (mesma tela, modo orçamento): um modal
     só de nome do cliente e a nota abre com título "ORÇAMENTO", sem pagamento. */
  const [orcamentoOpen, setOrcamentoOpen] = useState(false);
  const [nomeOrcamento, setNomeOrcamento] = useState("");
  const [salvandoCadastro, setSalvandoCadastro] = useState(false);

  const alert = useAlert();
  const criarCliente = useClienteStore((s) => s.criarCliente);

  /** Cadastra e já abre a venda para o cliente novo — é o motivo de ter cadastrado. */
  const handleNovoCliente = async (dados: ClienteFormData) => {
    setSalvandoCadastro(true);

    try {
      await criarCliente(dados);
      await fetchClientes(true);

      setNovoClienteOpen(false);
      alert.success("Cliente cadastrado!", "Agora é só lançar os produtos.");

      const criado = useClienteStore.getState().clientes.find((c) => c.nome === dados.nome);
      if (criado?.id) abrirNota({ clienteId: String(criado.id), nome: criado.nome });
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível cadastrar o cliente."));
    } finally {
      setSalvandoCadastro(false);
    }
  };

  const handleNovoProduto = async (dados: ProductFormData) => {
    setSalvandoCadastro(true);

    try {
      await ProductService.create(dados);

      setNovoProdutoOpen(false);
      alert.success("Produto cadastrado!", "Ele já pode ser lançado na nota.");
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível cadastrar o produto."));
    } finally {
      setSalvandoCadastro(false);
    }
  };

  // async/await como no commit `altera pra async`, mas preservando o tratamento
  // de erro: resposta vazia zera a lista em vez de manter dados antigos.
  const carregarVendas = async () => {
    await fetchVendas(true);
  };

  /* Falha aqui não pode derrubar o balcão: sem orçamentos a aba fica vazia e
     as vendas seguem funcionando. */
  const carregarOrcamentos = useCallback(async () => {
    /* Sem guarda de largura: a aba de orçamentos deixou de existir só no
       desktop, então não carregá-la no celular deixaria a aba vazia. */
    try {
      setOrcamentos(await OrcamentoService.listar());
    } catch {
      setOrcamentos([]);
    }
  }, []);

  useEffect(() => {
    fetchVendas();
    fetchClientes();
    carregarOrcamentos();
  }, [fetchVendas, fetchClientes, carregarOrcamentos]);

  /* O PDV é a tela mais compartilhada da loja: dois balcões abertos ao mesmo
     tempo é o normal, não a exceção. */
  useSincronizacao(["pedidos", "clientes", "produtos"], () => {
    fetchVendas(true);
    fetchClientes(true);
    carregarOrcamentos();
  });

  /*
   * As vendas do dia escolhido, da mais recente para a mais antiga.
   *
   * O recorte é o do CALENDÁRIO, em qualquer largura. O celular tinha o seu
   * próprio ("hoje / este mês") porque a tela de lá não tinha onde pôr o
   * seletor de dia; agora tem — e dois recortes diferentes para a mesma lista
   * faziam o mesmo aparelho mostrar números distintos ao girar de lado.
   */
  /*
   * "Nova venda" e "Novo orçamento" da lista de vendas chegam aqui.
   *
   * A nota e a proposta são montadas no balcão, então os botões de lá navegam
   * para cá pedindo a caixa que já vinham pedindo — e o estado é limpo em
   * seguida, senão um F5 (ou o voltar do navegador) reabriria o modal sozinho.
   */
  useEffect(() => {
    const estado = location.state as { abrir?: "venda" | "orcamento"; faturar?: string } | null;

    if (!estado?.abrir && !estado?.faturar) return;

    if (estado.abrir === "venda") setNovaVendaOpen(true);
    else if (estado.abrir === "orcamento") setOrcamentoOpen(true);

    /*
     * `faturar` vem da tela de Orçamentos, que aprova mas não tem nota.
     *
     * Ela manda o id e o balcão faz o resto — não dá para aprovar de lá e
     * abrir a venda aqui em dois lugares diferentes sem que as duas telas
     * discordem uma da outra na primeira mudança de regra. O id fica guardado
     * porque a lista de propostas pode ainda estar carregando: o efeito abaixo
     * dispara quando ela chegar.
     */
    if (estado.faturar) {
      setAba("orcamentos");
      setFaturarId(estado.faturar);
    }

    navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);

  /* A proposta que chegou pedindo para ser faturada, assim que ela existir na
     lista. Zerado ANTES de abrir a nota: sem isso, uma recarga da lista
     reabriria o mesmo modal. */
  useEffect(() => {
    if (!faturarId) return;

    const proposta = orcamentos.find((o) => o.id === faturarId);

    if (!proposta) return;

    setFaturarId(null);
    void aprovarOrcamento(proposta);
  }, [faturarId, orcamentos]);

  const vendasVisiveis = useMemo(
    () =>
      [...vendas.filter((v) => noMesmoDia(v.pedido.dataPedido, dia))]
        .sort((a, b) => +new Date(b.pedido.dataPedido) - +new Date(a.pedido.dataPedido)),
    [vendas, dia],
  );

  const vendasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return vendasVisiveis;
    return vendasVisiveis.filter((v) => v.nomeCliente?.toLowerCase().includes(termo));
  }, [vendasVisiveis, busca]);

  /*
   * Orçamentos: TODOS, sempre — o dia escolhido não vale aqui.
   *
   * Venda é do dia; proposta é do futuro. A que espera resposta há duas
   * semanas é justamente a que precisa de um telefonema, e um filtro de data
   * a esconderia — quem vai procurar o orçamento de 28 de julho para lembrar
   * de cobrá-lo? Em vez de filtrar, a lista separa por data.
   */
  const orcamentosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    /* O que virou venda sai daqui.
     *
     * Esta aba é fila de trabalho, não arquivo: proposta já faturada não tem
     * mais nenhuma ação possível e só empurra para baixo as que ainda esperam
     * resposta. O registro continua no banco — some da lista, não da história. */
    const naFila = orcamentos.filter((o) => o.status !== "CONVERTIDO");

    const base = termo
      ? naFila.filter((o) => o.clienteNome?.toLowerCase().includes(termo) || String(o.codigo).includes(termo))
      : naFila;

    return [...base].sort((a, b) => +new Date(b.criadoEm) - +new Date(a.criadoEm));
  }, [orcamentos, busca]);

  /** Do mais recente para o mais antigo, com a data como cabeçalho do bloco. */
  const orcamentosPorDia = useMemo(() => {
    const mapa = new Map<string, { data: string; itens: Orcamento[]; total: number }>();

    for (const o of orcamentosFiltrados) {
      const chave = dataBr(o.criadoEm);
      const grupo = mapa.get(chave) ?? { data: chave, itens: [], total: 0 };

      grupo.itens.push(o);
      grupo.total += Number(o.total ?? 0);
      mapa.set(chave, grupo);
    }

    return Array.from(mapa.values());
  }, [orcamentosFiltrados]);

  /** Quantos aguardam resposta — é a contagem que muda o que se faz no dia. */
  const aguardandoResposta = useMemo(() => orcamentos.filter((o) => o.status === "ABERTO").length, [orcamentos]);

  /** "hoje", "ontem" ou "11/08" — cabe no rótulo de um KPI. */
  const rotuloCurtoDoDia = useMemo(() => {
    const porExtenso = diaExtenso(dia);

    if (porExtenso.startsWith("Hoje")) return "hoje";
    if (porExtenso.startsWith("Ontem")) return "ontem";

    return dia.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }, [dia]);

  const faturamento = vendasVisiveis.reduce((acc, v) => acc + totalDoPedido(v), 0);
  const recebido = vendasVisiveis.reduce((acc, v) => acc + Number(v.pedido.valorPago ?? 0), 0);
  const pendente = Math.max(faturamento - recebido, 0);
  const ticketMedio = vendasVisiveis.length ? faturamento / vendasVisiveis.length : 0;

  // Sem busca mostra os primeiros clientes; com busca, os que casam.
  const listaClientes = useMemo(() => {
    const termo = nomeCliente.trim().toLowerCase();
    if (!termo) return clientes.slice(0, 8);
    return clientes.filter((c) => c.nome?.toLowerCase().includes(termo)).slice(0, 8);
  }, [clientes, nomeCliente]);

  const clienteSelecionavel = useMemo(() => {
    const termo = nomeCliente.trim().toLowerCase();
    return clientes.find((c) => c.nome?.toLowerCase() === termo);
  }, [clientes, nomeCliente]);

  /* ---------------------- Ações da linha de orçamento ---------------------- */

  /** Os itens da proposta no formato que a nota entende. */
  const itensDoOrcamento = (o: Orcamento) =>
    (o.itens ?? []).map((i, indice) => ({
      itemPedidoId: `orc-${o.id}-${i.id ?? indice}`,
      quantidadeItem: Number(i.quantidade ?? 0),
      valorVendaItem: Number(i.valorUnitario ?? 0),
      produto: {
        nomeProduto: i.nomeProduto,
        produtoId: String(i.produtoId ?? ""),
        valorProduto: Number(i.valorUnitario ?? 0),
      },
    }));

  /**
   * O cliente disse não.
   *
   * A proposta fica na lista, marcada — sumir com ela no clique apagaria a
   * informação mais útil que um orçamento recusado carrega: que aquele preço
   * já foi oferecido àquela pessoa e não colou. Depois de recusada, aí sim
   * aparece o apagar, para quem quiser limpar.
   */
  const recusarOrcamento = async (o: Orcamento) => {
    if (ocupado) return;

    setOcupado(o.id);

    try {
      await OrcamentoService.alterarStatus(o.id, "RECUSADO");
      setOrcamentos((prev) => prev.map((x) => (x.id === o.id ? { ...x, status: "RECUSADO" } : x)));
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível recusar o orçamento."));
    } finally {
      setOcupado(null);
    }
  };

  const excluirOrcamento = async (o: Orcamento) => {
    if (ocupado) return;

    setOcupado(o.id);

    try {
      await OrcamentoService.excluir(o.id);
      setOrcamentos((prev) => prev.filter((x) => x.id !== o.id));
      alert.success("Orçamento apagado.", `A proposta #${o.codigo} saiu da lista.`);
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível apagar o orçamento."));
    } finally {
      setOcupado(null);
    }
  };

  /**
   * O cliente da proposta, criando o cadastro se ele ainda não existir.
   *
   * Um orçamento pode nascer para nome livre — é o caso normal de quem pede
   * preço no balcão sem ser cliente ainda. Na hora de converter, esse nome
   * precisa virar cadastro, porque nota de venda é emitida PARA alguém.
   *
   * Antes de criar, procura pelo nome entre os já cadastrados: converter duas
   * propostas do mesmo "João da Silva" não pode render dois Joões na base.
   */
  const garantirClienteDaProposta = async (o: Orcamento): Promise<string | null> => {
    if (o.clienteId) return String(o.clienteId);

    const nomeProposta = (o.clienteNome ?? "").trim();
    const jaExiste = clientes.find((c) => c.nome?.trim().toLowerCase() === nomeProposta.toLowerCase());

    if (jaExiste?.id) return String(jaExiste.id);

    /* Ficha mínima: o nome e o telefone que a proposta já tem. O resto se
       completa depois em Clientes — exigir documento aqui seria parar a venda
       para preencher formulário. */
    await criarCliente({
      nome: nomeProposta,
      status: eStatus.ATIVO,
      contato: { whatsapp: o.clienteContato ?? "" },
    } as unknown as ClienteFormData);

    await fetchClientes(true);

    const criado = useClienteStore.getState().clientes.find((c) => c.nome?.trim().toLowerCase() === nomeProposta.toLowerCase());

    return criado?.id ? String(criado.id) : null;
  };

  /**
   * O cliente disse sim — e a venda começa no mesmo clique.
   *
   * -------------------------------------------------------------------------
   * Por que aprovar e faturar viraram um botão só
   * -------------------------------------------------------------------------
   * Eram dois, lado a lado: "Cliente aprovou" marcava a proposta e mandava um
   * aviso dizendo para clicar no outro; "Converter em venda" abria a nota. Na
   * prática ninguém aprova sem faturar em seguida — o sim do cliente É o
   * começo da venda —, então o primeiro botão só existia para pedir o segundo.
   * E quem clicava só no primeiro ficava com a proposta marcada como aprovada
   * e nenhuma venda, que é o pior estado dos três.
   *
   * Agora o gesto é um: a proposta fica aprovada e a nota abre montada, com o
   * cliente e os itens. Nada acontece no estoque nem no faturamento até
   * "Gerar Nota" — a decisão continua sendo de quem está no balcão, e fechar a
   * nota no X deixa a proposta aprovada esperando, não perdida.
   *
   * A ORDEM importa e é esta:
   *
   *   1. o cadastro do cliente, criado se preciso — parar aqui para pedir
   *      "cadastre antes" é interromper exatamente o momento em que o cliente
   *      disse sim;
   *   2. amarrar a proposta ao cadastro, enquanto ela ainda está ABERTA (a API
   *      só aceita edição nesse estado — depois do passo 3 seria tarde);
   *   3. registrar a aprovação, que é o que sobrevive se a nota for fechada
   *      sem gerar;
   *   4. abrir a nota.
   */
  const aprovarOrcamento = async (o: Orcamento) => {
    if (ocupado) return;

    setOcupado(o.id);

    try {
      const clienteId = await garantirClienteDaProposta(o);

      if (!clienteId) {
        alert.error("Não foi possível preparar a venda", "O cadastro do cliente não pôde ser criado. Cadastre-o em Clientes e tente de novo.");
        return;
      }

      /* Amarra a proposta ao cadastro — senão ela seguiria "sem cadastro" na
         lista mesmo depois de virar venda. */
      if (!o.clienteId && o.status === "ABERTO") {
        await OrcamentoService.atualizar(o.id, {
          clienteNome: o.clienteNome,
          clienteId,
          clienteContato: o.clienteContato ?? null,
          itens: (o.itens ?? []).map((i) => ({
            produtoId: i.produtoId ?? null,
            nomeProduto: i.nomeProduto,
            quantidade: i.quantidade,
            valorUnitario: i.valorUnitario,
          })),
        });
      }

      if (o.status !== "APROVADO") {
        await OrcamentoService.alterarStatus(o.id, "APROVADO");
        setOrcamentos((prev) => prev.map((x) => (x.id === o.id ? { ...x, status: "APROVADO", clienteId } : x)));
      }

      abrirNota({
        clienteId,
        nome: o.clienteNome,
        itens: itensDoOrcamento(o),
        /*
         * A proposta é APAGADA quando a nota nascer — ver `converterOrcamentoId`
         * em `Invoice`. Vai sempre: a aprovada é justamente a que mais precisa
         * sair da fila depois de virar nota.
         */
        converterOrcamentoId: o.id,
      });
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível aprovar o orçamento."));
    } finally {
      setOcupado(null);
    }
  };

  /**
   * Abrir a proposta — o que a linha inteira faz agora.
   *
   * O lápis saiu da fileira de ações. Ele competia com o clique na linha, que
   * abria a leitura, e a divisão era arbitrária: os dois gestos levavam à
   * MESMA proposta, um deles em modo de conserto e o outro não, e nada na tela
   * dizia qual era qual antes de clicar. Numa lista em que a maioria das
   * propostas está aguardando resposta, o botão certo era quase sempre o
   * pequeno — o de 14px escondido junto de mais quatro.
   *
   * Agora a linha abre a proposta, e o que se pode fazer com ela vem do estado
   * dela, não de qual pixel foi clicado:
   *
   *   • AGUARDANDO → abre para editar. É o único estado em que a API aceita
   *     reescrever, e é o estado em que quase toda proposta está.
   *
   *   • RESPONDIDA (aprovada ou recusada) → abre a leitura. Não é uma recusa
   *     disfarçada: o orçamento aprovado é o documento do que o cliente
   *     aceitou e o recusado é o registro do que ele viu antes de dizer não —
   *     reescrever qualquer um dos dois apagaria a prova da conversa. Só que
   *     em vez de um aviso amarelo dizendo isso, a pessoa recebe o que dá para
   *     ter ali: a proposta na tela.
   */
  const abrirProposta = (o: Orcamento) => {
    if (o.status !== "ABERTO") {
      setVisualizando(o);
      return;
    }

    abrirNota({ clienteId: o.clienteId ? String(o.clienteId) : undefined, nome: o.clienteNome, orcamento: true, itens: itensDoOrcamento(o), orcamentoId: o.id });
  };

  /* ------------------------------- Downloads ------------------------------- */

  /**
   * Baixa o documento da linha, no formato escolhido.
   *
   * Os dois servem a coisas diferentes e a loja usa os dois: o PNG vai para o
   * WhatsApp (abre na conversa, sem baixar nada), o PDF vai para o e-mail e
   * para a impressora. Os dois saem do MESMO PNG rasterizado — o PDF é essa
   * imagem colada numa A4 —, então o documento é idêntico nos dois caminhos.
   */
  const baixarDaLinha = async (
    formato: "png" | "pdf",
    chave: string,
    preparar: () => void,
    limpar: () => void,
    ref: React.RefObject<HTMLDivElement>,
    nome: string,
  ) => {
    if (ocupado) return;

    setOcupado(chave);
    preparar();

    try {
      /* Espera o nó escondido renderizar com o documento certo antes de
         fotografar — sem isso o arquivo sai do documento anterior, ou em
         branco. */
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

      const blob = await gerarBlobNota(ref);

      if (formato === "pdf") {
        await baixarNotaPdf(blob, nome);
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.download = `${nome}.png`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível gerar o arquivo."));
    } finally {
      setOcupado(null);
      limpar();
    }
  };

  const baixarOrcamento = (o: Orcamento, formato: "png" | "pdf") =>
    baixarDaLinha(formato, o.id, () => setOrcamentoDownload(o), () => setOrcamentoDownload(null), refOrcamentoDownload, `orcamento-${o.codigo}`);

  const baixarNota = (v: PedidoClienteType, formato: "png" | "pdf") =>
    baixarDaLinha(
      formato,
      String(v.pedido.pedidoId),
      () => setNotaDownload(v),
      () => setNotaDownload(null),
      refNotaDownload,
      `nota-${v.nomeCliente ? v.nomeCliente.toLowerCase().replace(/[^a-z0-9]+/g, "-") : enterprise?.nomeFantasia ?? "venda"}`,
    );

  const abrirNota = (nota: NotaAberta) => {
    setNotaAberta(nota);
    setNovaVendaOpen(false);
    setNomeCliente("");
  };

  /** Abre a nota em modo orçamento, com o nome digitado — sem cadastrar. */
  const abrirOrcamento = () => {
    const nomeLimpo = nomeOrcamento.trim();

    if (!nomeLimpo) {
      alert.warning("Informe o nome", "O orçamento precisa saber para quem é.");
      return;
    }

    setOrcamentoOpen(false);
    setNomeOrcamento("");
    abrirNota({ nome: nomeLimpo, orcamento: true });
  };

  /**
   * Fechar a nota não decide nada sobre o orçamento — só recarrega as listas.
   *
   * Aqui havia a marcação da proposta convertida, apoiada na ideia de que
   * fechar significa ter salvado. Não significa: este mesmo `fecharNota` é o
   * `onClose` da folha, e dispara quando alguém abre a conversão, muda de
   * ideia e fecha no X. Quem apaga a proposta agora é o `Invoice`, depois de o
   * servidor devolver o id da venda — ver `converterOrcamentoId` lá.
   */
  const fecharNota = async () => {
    setNotaAberta(null);

    /* Recarrega os dois: a nota fechada pode ter sido venda OU orçamento, e
       quem acabou de montar a proposta espera vê-la na aba ao fechar. A lista
       de orçamentos também é o que faz a proposta apagada sumir da tela. */
    carregarVendas();
    carregarOrcamentos();
  };

  return (
    <PageScreen icon={<ShoppingCart className="h-5 w-5" />} title="Ponto de Venda" subtitle="Registre vendas e monte orçamentos">
        {/*
          KPIs do dia escolhido — o rótulo diz qual.

          Sem isso, quem foi conferir sábado passado volta o olho para o topo e
          lê "Faturamento" achando que é o de hoje. O número mudou junto com a
          lista; o rótulo precisa contar isso.
        */}
        <KpiFaixa className="stagger shrink-0 lg:grid-cols-4">
          <Kpi icon={<DollarSign size={16} />} label={`Faturamento · ${rotuloCurtoDoDia}`} value={formatCurrency(faturamento)} tone="accent" />
          <Kpi icon={<Wallet size={16} />} label="Recebido" value={formatCurrency(recebido)} tone="success" />
          <Kpi icon={<AlertCircle size={16} />} label="Pendente" value={formatCurrency(pendente)} tone="warning" />
          <Kpi icon={<Hash size={16} />} label="Vendas" value={String(vendasVisiveis.length)} tone="neutral" />
        </KpiFaixa>

        {/* Card da lista */}
        <div className="card glass-sheen flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {/*
           * Cabeçalho: só o que se pode CRIAR.
           *
           * As abas e a busca desceram para a `BarraFiltros`, colada na lista
           * — navegação de um lado, filtros do outro. Aqui ficam as quatro
           * portas de criar, que não olham para a lista: elas acrescentam a
           * ela, e por isso não pertencem à barra que a restringe.
           */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2.5 border-b border-fg/[0.07] px-4 py-3">
            {/*
             * O cartão precisava dizer o que é.
             *
             * Ele era a única lista do sistema sem cabeçalho: começava direto
             * em quatro botões encostados à direita, e o que a tabela mostrava
             * só se descobria lendo as abas da barra de baixo. O título é fixo
             * — "Balcão" é o cartão inteiro, vendas e orçamentos —, e é a
             * linha de apoio que acompanha a aba aberta, como nas outras
             * listas ("128 itens", "12 clientes").
             */}
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/[0.14] text-accent-soft ring-1 ring-inset ring-accent/20">
                <ShoppingCart className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-[13px] text-ink">Balcão</h2>
                <p className="truncate text-[11px] text-faint">
                  {aba === "vendas"
                    ? `${formatNumber(vendasFiltradas.length)} ${vendasFiltradas.length === 1 ? "venda" : "vendas"} ${rotuloCurtoDoDia}`
                    : `${formatNumber(orcamentosFiltrados.length)} ${orcamentosFiltrados.length === 1 ? "orçamento" : "orçamentos"}`}
                </p>
              </div>
            </div>

            {/*
             * No celular as quatro portas de criar ROLAM numa fileira só.
             *
             * Elas quebravam em duas fileiras encostadas à direita, e o balcão
             * começava com dois centímetros de botão antes da primeira venda.
             * Numa fileira que rola, "Nova venda" — a que se usa o dia inteiro
             * — fica visível e as outras três ficam a um arrasto.
             */}
            <div className="-mx-4 flex w-[calc(100%+2rem)] items-center gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0 sm:mx-0 sm:w-auto sm:flex-wrap sm:justify-end sm:overflow-visible sm:px-0 sm:pb-0">
              <GhostAction icon={<UserPlus size={15} />} onClick={() => setNovoClienteOpen(true)}>
                Novo cliente
              </GhostAction>
              <GhostAction icon={<PackagePlus size={15} />} onClick={() => setNovoProdutoOpen(true)}>
                Novo produto
              </GhostAction>
              {/* Cor diferente de propósito: orçamento não é venda, e dois botões
                  iguais lado a lado fariam o operador clicar no errado com pressa. */}
              <button
                type="button"
                onClick={() => setOrcamentoOpen(true)}
                className="focus-ring flex h-[38px] cursor-pointer items-center gap-1.5 rounded-xl border border-warning/40 bg-warning/[0.12] px-3.5 text-[12.5px] text-warning transition-colors hover:bg-warning/20"
              >
                <FileText className="h-4 w-4" />
                Novo orçamento
              </button>

              {/* No celular "Nova venda" vem PRIMEIRO: é a ação do dia
                  inteiro, e numa fileira que rola ela nascia fora da tela,
                  atrás de três botões que se usa uma vez por semana. */}
              <span className="order-first shrink-0 sm:order-none">
                <PrimaryAction icon={<Plus className="h-4 w-4" />} onClick={() => setNovaVendaOpen(true)}>
                  Nova venda
                </PrimaryAction>
              </span>
            </div>
          </div>

          <BarraFiltros
            /* A `BarraFiltros` já agrupa a navegação num flex próprio na
               ponta esquerda; aqui vão só os botões. */
            navegacao={
              <AbasTabela
                grupo="abas-pdv"
                valor={aba}
                onValor={setAba}
                abas={[
                  { id: "vendas", label: "Vendas", icone: <Receipt size={13} />, contagem: vendasVisiveis.length },
                  { id: "orcamentos", label: "Orçamentos", icone: <FileText size={13} />, contagem: orcamentos.length },
                ]}
              />
            }
          >
            <SearchBox
              value={busca}
              onChange={setBusca}
              placeholder={aba === "vendas" ? "Buscar venda por cliente…" : "Buscar orçamento por cliente ou código…"}
              className="w-[240px] shrink-0"
            />

            {/* O calendário vale para as vendas. Orçamento não é do dia: a
                proposta parada há duas semanas é justamente a que precisa de
                telefonema, e escondê-la atrás de uma data seria perder a
                única lista que a mostra. */}
            {aba === "vendas" && <SeletorDia valor={dia} onChange={setDia} />}

            {aba === "orcamentos" && aguardandoResposta > 0 && (
              <span className="flex items-center gap-1.5 rounded-xl border border-warning/30 bg-warning/[0.1] px-3 py-2 text-[12px] text-warning">
                <FileText size={13} />
                {aguardandoResposta} {aguardandoResposta === 1 ? "aguardando resposta" : "aguardando resposta"}
              </span>
            )}
          </BarraFiltros>

          {/*
            Corpo — vendas do dia numa lista corrida; orçamentos, todos,
            separados por data.

            O agrupamento saiu das vendas porque a lista traz um dia só: o
            cabeçalho repetiria em cada bloco a data que já está escrita por
            extenso no seletor. Nos orçamentos ele volta pelo motivo inverso —
            a lista atravessa semanas, e sem a data cada linha vira "quando
            mesmo foi essa proposta?".
          */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {aba === "vendas" ? (
              vendasFiltradas.length > 0 ? (
                vendasFiltradas.map((venda) => {
                  const total = totalDoPedido(venda);
                  const statusPag = statusPagamentoVenda(venda, total);
                  const pagoVenda = Number(venda.pedido.valorPago ?? 0);

                  return (
                    <div key={venda.pedido.pedidoId} className="group relative">
                      <button
                        onClick={() => abrirNota({ id: venda.pedido.pedidoId, clienteId: venda.clienteId, nome: venda.nomeCliente })}
                        className="relative flex w-full items-center gap-3 border-b border-fg/[0.04] px-5 py-3.5 text-left transition-colors before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:rounded-r before:bg-accent before:opacity-0 before:transition-opacity hover:bg-fg/[0.03] hover:before:opacity-100"
                      >
                        <Avatar name={venda.nomeCliente} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] text-ink">{venda.nomeCliente}</p>
                          <p className="text-[11px] text-faint">
                            {horaVenda(venda.pedido.dataPedido)}
                            {statusPag === "PARCIAL" && ` · pago ${formatCurrency(pagoVenda)} de ${formatCurrency(total)}`}
                          </p>
                        </div>

                        <span className="hidden sm:block">
                          <StatusBadge status={statusPag} />
                        </span>

                        <div className="text-right">
                          <p className="text-[13px] tabular-nums text-ink">{formatCurrency(total)}</p>
                          <p className={`text-[11px] tabular-nums ${statusPag === "PAGA" ? "text-success" : statusPag === "PARCIAL" ? "text-accent-soft" : "text-warning"}`}>{statusPag === "PAGA" ? "paga" : statusPag === "PARCIAL" ? "parcial" : "aberta"}</p>
                        </div>

                        {/* Espaço para os botões sobrepostos não taparem o valor. */}
                        <span className="w-[38px] shrink-0" />
                      </button>

                      {/* A nota em PDF sem abrir a nota: é o pedido que mais
                          chega no balcão ("me manda a nota"), e atravessar o
                          modal para responder custava quatro cliques. */}
                      <LinhaAcoes>
                        <MenuDownloadNota
                          variante="linha"
                          titulo="Baixar nota"
                          documento="nota"
                          ocupado={ocupado === String(venda.pedido.pedidoId)}
                          onEscolher={(formato) => void baixarNota(venda, formato)}
                        />
                      </LinhaAcoes>
                    </div>
                  );
                })
              ) : (
                <div className="flex h-full items-center justify-center py-10">
                  <div className="flex max-w-xs flex-col items-center gap-3 text-center text-faint">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-fg/[0.06] bg-fg/[0.03]">
                      <Receipt className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-[13px] text-mist">{busca.trim() ? "Nenhuma venda encontrada" : `Nenhuma venda em ${diaExtenso(dia).toLowerCase()}`}</p>
                      <p className="mt-0.5 text-[11px]">{busca.trim() ? "Tente buscar por outro cliente." : "Escolha outro dia no calendário ou comece uma venda."}</p>
                    </div>
                    {!busca.trim() && (
                      <button onClick={() => setNovaVendaOpen(true)} className="mt-1 cursor-pointer rounded-xl bg-accent px-3.5 py-2 text-[12px] text-white transition-colors hover:bg-accent">
                        Nova venda
                      </button>
                    )}
                  </div>
                </div>
              )
            ) : orcamentosPorDia.length > 0 ? (
              orcamentosPorDia.map((grupo) => (
                <section key={grupo.data}>
                  {/* A data gruda no topo enquanto o bloco rola: numa lista que
                      atravessa semanas, saber de quando é a proposta que está
                      na tela é metade da informação. */}
                  <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-fg/[0.06] bg-surface/95 px-5 py-2 backdrop-blur-sm">
                    <span className="flex items-center gap-2 text-[11.5px] text-mist">
                      <CalendarDays size={13} className="text-warning" />
                      <span>{grupo.data}</span>
                      <span className="text-faint">
                        · {grupo.itens.length} {grupo.itens.length === 1 ? "proposta" : "propostas"}
                      </span>
                    </span>

                    <span className="text-[12px] tabular-nums text-mist">{formatCurrency(grupo.total)}</span>
                  </div>

                  {grupo.itens.map((o) => {
                    const situacao = SITUACAO_ORCAMENTO[o.status] ?? SITUACAO_ORCAMENTO.ABERTO;
                    const nesteMomento = ocupado === o.id;

                    return (
                      <div key={o.id} className="group relative">
                        <button
                          onClick={() => abrirProposta(o)}
                          title={o.status === "ABERTO" ? "Editar a proposta" : "Ver a proposta"}
                          className="relative flex w-full items-center gap-3 border-b border-fg/[0.04] px-5 py-3.5 text-left transition-colors before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:rounded-r before:bg-warning before:opacity-0 before:transition-opacity hover:bg-fg/[0.03] hover:before:opacity-100"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-warning/25 bg-warning/[0.12] text-[11px] tabular-nums text-warning">
                            #{o.codigo}
                          </span>

                          <div className="min-w-0 flex-1">
                            {/* Sem selo de "sem cadastro": converter cria a ficha
                                sozinho, então a falta dela deixou de ser um
                                impedimento sobre o qual avisar. */}
                            <p className="truncate text-[13px] text-ink">{o.clienteNome}</p>
                            <p className="text-[11px] text-faint">
                              {horaVenda(o.criadoEm)} · {o.itens?.length ?? 0} {(o.itens?.length ?? 0) === 1 ? "item" : "itens"}
                            </p>
                          </div>

                          <span className="hidden lg:block">
                            <Selo tom={situacao.tom}>{situacao.label}</Selo>
                          </span>

                          <p className="text-right text-[13px] tabular-nums text-ink">{formatCurrency(o.total)}</p>

                          {/* Reserva a faixa dos botões sobrepostos. */}
                          <span className="w-[128px] shrink-0 sm:w-[160px]" />
                        </button>

                        {/*
                         * Tudo o que se faz com uma proposta, na própria linha.
                         *
                         * A ordem segue a conversa real: o cliente responde
                         * (aprovar), fecha (converter), aí falta o cadastro,
                         * o documento e a correção. Cada botão some quando não
                         * cabe — aprovar num orçamento já aprovado e editar um
                         * já respondido seriam portas que não abrem.
                         */}
                        <LinhaAcoes>
                          {/*
                           * Um botão, não dois.
                           *
                           * "Cliente aprovou" já abre a nota montada — ver
                           * `aprovarOrcamento`. Na proposta que JÁ está
                           * aprovada, o mesmo botão troca de nome: não há o que
                           * aprovar de novo, só falta faturar.
                           */}
                          {o.status !== "RECUSADO" && (
                            <ListaAcao
                              icon={o.status === "APROVADO" ? <ShoppingCart size={14} /> : <Check size={14} />}
                              label={o.status === "APROVADO" ? "Faturar venda" : "Cliente aprovou"}
                              tom={o.status === "APROVADO" ? "aviso" : "sucesso"}
                              ocupado={nesteMomento}
                              onClick={() => void aprovarOrcamento(o)}
                            />
                          )}

                          {o.status !== "RECUSADO" && (
                            <ListaAcao icon={<X size={14} />} label="Cliente recusou" ocupado={nesteMomento} onClick={() => void recusarOrcamento(o)} />
                          )}

                          {/* Apagar só depois da recusa: enquanto a proposta
                              está viva, o botão destrutivo fica a um clique de
                              distância das ações que se usam o dia inteiro. */}
                          {o.status === "RECUSADO" && (
                            <ListaAcao icon={<Trash2 size={14} />} label="Apagar" tom="perigo" ocupado={nesteMomento} onClick={() => void excluirOrcamento(o)} />
                          )}

                          <MenuDownloadNota variante="linha" titulo="Baixar orçamento" documento="orçamento" ocupado={nesteMomento} onEscolher={(formato) => void baixarOrcamento(o, formato)} />
                        </LinhaAcoes>
                      </div>
                    );
                  })}
                </section>
              ))
            ) : (
              <div className="flex h-full items-center justify-center py-10">
                <div className="flex max-w-xs flex-col items-center gap-3 text-center text-faint">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-fg/[0.06] bg-fg/[0.03]">
                    <FileText className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-[13px] text-mist">{busca.trim() ? "Nenhum orçamento encontrado" : "Nenhum orçamento ainda"}</p>
                    <p className="mt-0.5 text-[11px]">{busca.trim() ? "Tente outro nome ou código." : "Monte uma proposta: escolha os produtos e clique em “Gerar orçamento”."}</p>
                  </div>
                  {!busca.trim() && (
                    <button onClick={() => setOrcamentoOpen(true)} className="mt-1 cursor-pointer rounded-xl border border-warning/40 bg-warning/[0.12] px-3.5 py-2 text-[12px] text-warning transition-colors hover:bg-warning/20">
                      Novo orçamento
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Rodapé do card — o resumo acompanha a aba aberta. Ticket médio de
              venda embaixo de uma lista de orçamentos seria número de outra
              conta, e proposta somada parece faturamento sem ser. */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-fg/[0.06] px-5 py-2.5">
            {aba === "vendas" ? (
              <>
                <p className="flex items-center gap-2 text-[12px] text-faint">
                  <TrendingUp size={14} className="text-accent-soft" />
                  Ticket médio: <span className="nums text-ink">{formatCurrency(ticketMedio)}</span>
                </p>
                <p className="text-[12px] text-faint">
                  <span className="nums text-success">{vendasVisiveis.filter((v) => !estaAberta(v)).length}</span> pagas · <span className="nums text-warning">{vendasVisiveis.filter(estaAberta).length}</span> em aberto
                </p>
              </>
            ) : (
              <>
                <p className="flex items-center gap-2 text-[12px] text-faint">
                  <FileText size={14} className="text-warning" />
                  {orcamentos.length} {orcamentos.length === 1 ? "proposta no total" : "propostas no total"}
                </p>
                <p className="text-[12px] text-faint">
                  <span className="nums text-warning">{aguardandoResposta}</span> aguardando ·{" "}
                  <span className="nums text-success">{orcamentos.filter((o) => o.status === "APROVADO").length}</span> aprovados
                </p>
              </>
            )}
          </div>
        </div>
      

      {/* Modal — nova venda */}
      <Modal open={novaVendaOpen} onClose={() => setNovaVendaOpen(false)} title="Iniciar venda" subtitle="Escolha o cliente para abrir a nota" size="md">
        <div className="flex flex-col gap-3">
          <SearchBox value={nomeCliente} onChange={setNomeCliente} placeholder="Buscar cliente por nome…" />

          {/* Lista de clientes: mostra os recentes quando ainda não há busca,
 em vez de deixar o modal vazio esperando digitação. */}
          <div className="flex max-h-[46vh] min-h-[180px] flex-col gap-1.5 overflow-y-auto">
            {listaClientes.length > 0 ? (
              listaClientes.map((c, i) => {
                const selecionado = clienteSelecionavel?.id && String(clienteSelecionavel.id) === String(c.id);
                return (
                  <button
                    key={c.id ?? i}
                    onClick={() => c.id && abrirNota({ clienteId: String(c.id), nome: c.nome })}
                    className={`focus-ring group flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${selecionado ? "border border-accent/50 bg-accent/10" : "glass-subtle hover:border-accent/30"}`}
                  >
                    <Avatar name={c.nome} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">{c.nome}</span>
                      {c.cpfCnpj && <span className="block truncate text-[11px] text-faint">{formatDocument(c.cpfCnpj)}</span>}
                    </span>
                    <ChevronRight size={15} className="shrink-0 text-muted transition-colors group-hover:text-accent-soft" />
                  </button>
                );
              })
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2.5 py-8 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-warning/15 text-warning ring-1 ring-inset ring-warning/25">
                  <UserCheck size={20} />
                </span>
                <p className="text-[13px] text-ink">{nomeCliente.trim() ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}</p>
                <p className="max-w-[240px] text-[11.5px] leading-relaxed text-faint">{nomeCliente.trim() ? "Confira o nome ou cadastre este cliente antes de iniciar a venda." : "Cadastre um cliente para poder abrir notas."}</p>
                <button
                  onClick={() => {
                    setNovaVendaOpen(false);
                    navigate("/clientes");
                  }}
                  className="focus-ring mt-1 cursor-pointer rounded-xl bg-accent px-3.5 py-2 text-[12px] text-white transition-all hover:brightness-110"
                >
                  Ir para Clientes
                </button>
              </div>
            )}
          </div>

          <p className="text-center text-[11px] text-faint">{listaClientes.length > 0 && `${listaClientes.length} ${listaClientes.length === 1 ? "cliente" : "clientes"} · clique para abrir a nota`}</p>
        </div>
      </Modal>

      {/* Modal — nota do PDV (venda ou orçamento). */}
      <Modal
        open={!!notaAberta}
        onClose={fecharNota}
        title={notaAberta?.orcamentoId ? "Editar orçamento" : notaAberta?.orcamento ? "Novo orçamento" : notaAberta?.converterOrcamentoId ? "Converter orçamento em venda" : notaAberta?.id ? "Venda" : "Nova venda"}
        subtitle={notaAberta?.nome}
        size="full"
      >
        {notaAberta && <Invoice id={notaAberta.id} clienteId={notaAberta.clienteId} nome={notaAberta.nome} onSaved={fecharNota} modoOrcamento={notaAberta.orcamento} itensIniciais={notaAberta.itens} orcamentoId={notaAberta.orcamentoId} converterOrcamentoId={notaAberta.converterOrcamentoId} />}
      </Modal>

      {/* Modal de nome do orçamento no desktop. */}
      <Modal open={orcamentoOpen} onClose={() => setOrcamentoOpen(false)} title="Novo orçamento" subtitle="Para quem é a proposta?" size="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            abrirOrcamento();
          }}
          className="flex flex-col gap-4"
        >
          <div>
            <label className="mb-1.5 block text-[11px] uppercase tracking-[0.08em] text-faint">Nome do cliente</label>
            <input
              autoFocus
              value={nomeOrcamento}
              onChange={(e) => setNomeOrcamento(e.target.value)}
              placeholder="Digite qualquer nome"
              className="w-full rounded-xl border border-fg/[0.08] bg-fg/[0.03] px-3.5 py-3 text-[14px] text-ink outline-none focus:border-accent/60"
            />
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-faint">Não precisa ter cadastro. A nota abre em modo orçamento — sem pagamento.</p>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOrcamentoOpen(false)} className="min-h-[42px] rounded-xl border border-fg/[0.1] px-4 text-[13px] text-mist transition-colors hover:text-ink">
              Cancelar
            </button>
            <button type="submit" className="min-h-[42px] rounded-xl bg-accent px-5 text-[13px] text-white transition-all hover:brightness-110 active:scale-[0.99]">
              Montar orçamento
            </button>
          </div>
        </form>
      </Modal>

        {/* Cadastros sem sair da tela — as rotas são as mesmas de Clientes e Estoque. */}
        {/* Sem `Modal` em volta: o `ClienteForm` já abre no `Modal` do sistema.
            Envolvê-lo empilhava dois fundos escuros e dois cartões, que era o
            "bugado" — a caixa aparecia dentro de outra caixa. */}
        {novoClienteOpen && <ClienteForm saving={salvandoCadastro} onClose={() => setNovoClienteOpen(false)} onSubmit={handleNovoCliente} />}

        <Modal open={novoProdutoOpen} onClose={() => setNovoProdutoOpen(false)} title="Novo produto" subtitle="Ele fica disponível na nota na hora">
          <ProdutoForm submitText={salvandoCadastro ? "Salvando..." : "Cadastrar produto"} onCancel={() => setNovoProdutoOpen(false)} onSubmit={handleNovoProduto} />
        </Modal>

        {/* Leitura da proposta — o mesmo documento que o cliente recebeu. */}
        <Modal
          open={!!visualizando}
          onClose={() => setVisualizando(null)}
          title="Orçamento"
          subtitle={visualizando ? `#${visualizando.codigo} · ${visualizando.clienteNome}` : ""}
          size="xl"
        >
          {visualizando && (
            <div className="overflow-hidden rounded-lg border border-fg/[0.06]">
              <OrcamentoNota orcamento={visualizando} />
            </div>
          )}
        </Modal>

        {/*
          Os nós que viram PDF.

          Ficam fora da tela (à esquerda), nunca com `display: none`: o
          `html-to-image` precisa do nó realmente renderizado para fotografar.
          São dois, e não um por linha — o conteúdo é trocado para o documento
          escolhido no instante do clique.
        */}
        <NotaEscondida venda={notaDownload} refNota={refNotaDownload} />

        <div className="fixed -left-[9999px] top-0 w-[900px]" aria-hidden>
          {orcamentoDownload && <OrcamentoNota orcamento={orcamentoDownload} refNota={refOrcamentoDownload} />}
        </div>

    </PageScreen>
  );
};

/** A nota fora da tela, pronta para virar imagem — igual à de Vendas. */
function NotaEscondida({ venda, refNota }: { venda: PedidoClienteType | null; refNota: LegacyRef<HTMLDivElement> }) {
  return (
    <div className="fixed -left-[9999px] top-0 w-[900px]" aria-hidden>
      {venda && <NotaResumo venda={venda} refNota={refNota} />}
    </div>
  );
}

export default PontoDeVenda;
