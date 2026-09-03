import { useEffect, useMemo, useRef, useState, type LegacyRef } from "react";
import { ShoppingCart, UserRound, AlertTriangle, ListFilter, FileText, CalendarClock, LayoutDashboard } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Modal } from "@/shared/ui/Modal";
import Invoice from "@/features/vendas/components/Invoice";
import NotaResumo from "@/features/vendas/components/NotaResumo";
import { ControlesPagina, ListaCabecalho, ListaFantasmas, ListaLinha, TabelaCard, TabelaVazia } from "@/shared/ui/DataTable";
import { AbasTabela } from "@/shared/ui/AbasTabela";
import ListaContas from "@/features/financeiro/components/ListaContas";
import ContaForm from "@/features/financeiro/components/ContaForm";
import useContasStore from "@/features/financeiro/store/contas.store";
import Select from "@/shared/ui/Select";
import BuscaSugestoes from "@/shared/ui/BuscaSugestoes";
import { useAutoPageSize } from "@/shared/hooks/useAutoPageSize";
import { getInitials } from "@/shared/utils/format";
import { formatCurrency } from "@/shared/utils/currency";
import { type PedidoClienteType, estaAberto, estaCancelado, estaQuitado, totalDoPedido, valorPagoDoPedido, valorPendenteDoPedido } from "@/shared/domain/pedido";
import { formatDateShort } from "@/shared/utils/date";
import { PedidoStatusBadge } from "@/shared/ui/StatusBadge";
import useAuth from "@/features/auth/store/auth.store";
import { ehGestor, veVendasDeTodos } from "@/features/vendas/components/TabsVendas";
import useVendaStore from "@/features/vendas/store/venda.store";
import SalesOverviewPage from "@/features/vendas/pages/SalesOverviewPage";
import SeletorPeriodo, { PERIODO_TUDO, type Periodo } from "@/shared/ui/SeletorPeriodo";
import { mesesComMovimento, vendasAtivas } from "@/shared/domain/serieVendas";
import { gerarBlobNota } from "@/shared/ui/DownloadButton";
import { baixarNotaPdf } from "@/shared/ui/downloadNota";
import MenuDownloadNota from "@/shared/ui/MenuDownloadNota";
import useEnterprise from "@/features/empresa/store/enterprise.store";
import ContaService, { type NovaConta, type PrazoVenda } from "@/features/financeiro/services/conta.service";
import { dataBr, prazo } from "@/shared/utils/parcelas";

/**
 * A lista de vendas.
 *
 * A tabela era escrita à mão aqui — uma grade de nove colunas com cabeçalho,
 * linhas e estado vazio próprios, parecida com as das outras telas mas nunca
 * igual. Agora usa as mesmas peças de Clientes e Estoque (`TabelaCard`,
 * `ListaCabecalho`, `ListaLinha`).
 *
 * **Os controles moram no cabeçalho da tabela**, não numa barra acima dela.
 * Uma faixa de filtros solta sobre o cartão é uma segunda barra de comando
 * empilhada — cobra altura e fica longe da lista que comanda. Dentro do
 * cabeçalho, cada coisa tem o seu lado: a busca à esquerda, encostada no nome
 * da lista (dizer *o que* se procura), os seletores à direita (recortar o que
 * já está ali).
 */

type StatusFiltro = "todos" | "pago" | "pendente" | "vencida" | "cancelado";
type NotaAberta = { id?: string; clienteId: string; nome?: string };

const ROTULO_FILTRO: Record<StatusFiltro, string> = {
  todos: "Todas",
  pago: "Pagas",
  pendente: "Abertas",
  vencida: "Vencidas",
  cancelado: "Canceladas",
};

const ORDEM_FILTRO: StatusFiltro[] = ["todos", "pago", "pendente", "vencida", "cancelado"];

/** O nome do cartão segue a aba — é o título da página, que aqui é o cartão. */
const TITULO_ABA: Record<AbaVenda, string> = {
  "visao-geral": "Visão geral",
  vendas: "Todas as vendas",
  "a-prazo": "Vendas a prazo",
};

/**
 * As colunas. A do cliente é a que estica; as de dinheiro têm largura fixa
 * para que os valores fiquem alinhados entre si de linha em linha.
 */
const COLS = "grid-cols-[minmax(190px,1.7fr)_96px_120px_minmax(140px,1fr)_120px_120px_124px_56px]";

/**
 * Os rótulos das colunas, em UMA lista.
 *
 * Servem ao cabeçalho do desktop e ao cartão do celular (ver `ListaLinha`). A
 * última é vazia: aquela coluna só reserva a largura do botão de baixar a nota,
 * e no cartão ela não tem o que rotular.
 */
const ROTULOS = ["Cliente", "Data", "Situação", "Vencimento", "Total", "Pago", "Pendente", undefined];

const ALTURA_LINHA = 60;

/** A faixa de títulos das colunas mora dentro do corpo medido — ver `offset`. */
const ALTURA_CABECALHO = 40;

/* ======================= Sales / Outlet Page ======================= */
/**
 * As três listas da seção — e o panorama.
 *
 * "A prazo" veio do Financeiro, onde se chamava "A receber". Ela nunca foi
 * assunto de caixa: é o pedaço não pago das notas que estão logo acima, e a
 * pergunta que ela responde — "quem ainda me deve?" — se termina abrindo a
 * venda, não o livro-caixa. No financeiro ela obrigava a atravessar a tela
 * para conferir a nota; aqui, a nota está na aba ao lado.
 *
 * Orçamento troca de rota (a lista inteira mora em `/pdv/orcamentos`), por
 * isso não entra na barra animada: a pílula não desliza entre telas.
 *
 * ---------------------------------------------------------------------------
 * "Visão geral" é uma ABA, não um bloco acima da tabela
 * ---------------------------------------------------------------------------
 * O panorama (KPIs do mês, faturamento anual, status das notas, top clientes,
 * compromissos) ficava empilhado ACIMA do cartão, e os dois disputavam a
 * altura da janela: o dono abria Vendas e via meia tabela, com a lista começando
 * abaixo da dobra. São duas escalas da MESMA pergunta — quanto a loja vendeu e
 * quais notas somam esse quanto —, e ler uma de cada vez é o gesto real; o que
 * não dá é pagar a altura das duas o tempo todo.
 *
 * Como aba, o cartão inteiro é a página: o cabeçalho, a barra e o rodapé
 * ficam de pé e só o CORPO troca — os gráficos rolam dentro do mesmo corpo
 * onde as linhas rolariam. A página não se remonta ao alternar.
 *
 * A aba só existe para o master: o panorama soma a loja inteira, e quem recebe
 * apenas as próprias vendas veria o próprio número com cara de total da loja.
 * Ver `veVendasDeTodos`.
 */
type AbaVenda = "visao-geral" | "vendas" | "a-prazo";

const SalesList = () => {
  const navigate = useNavigate();
  const [aba, setAba] = useState<AbaVenda>("vendas");

  /* O recorte do panorama. Abre em "todo o período" — a loja inteira é a
     primeira leitura, e o mês fica a um clique no seletor. Mora aqui, e não
     dentro do panorama, porque quem o desenha na barra é este cartão. */
  const [periodo, setPeriodo] = useState<Periodo>(PERIODO_TUDO);
  const [novaConta, setNovaConta] = useState(false);
  const [salvandoConta, setSalvandoConta] = useState(false);

  const contas = useContasStore((s) => s.contas);
  const carregandoContas = useContasStore((s) => s.carregando);
  const fetchContas = useContasStore((s) => s.fetchContas);
  const vendas = useVendaStore((s) => s.vendas);
  const fetchVendas = useVendaStore((s) => s.fetchVendas);
  const enterprise = useEnterprise((s) => s.enterprise);

  const [notaAberta, setNotaAberta] = useState<NotaAberta | null>(null);
  const [search, setSearch] = useState("");
  const { user } = useAuth();
  /* Duas perguntas diferentes: `gestor` é quem pode ver o DINHEIRO da loja
     (os prazos e o que está a receber); `veTudo` é quem recebe as vendas de
     toda a equipe — só o master. Ver `veVendasDeTodos`. */
  const gestor = ehGestor(user);
  const veTudo = veVendasDeTodos(user);

  /* Download rápido na linha: um único nó de nota fora da tela, cujo conteúdo
     é preenchido com a venda escolhida antes de rasterizar. Assim não há N
     notas escondidas e o modal não precisa abrir. */
  const [notaDownload, setNotaDownload] = useState<PedidoClienteType | null>(null);
  const [baixandoNota, setBaixandoNota] = useState(false);
  const refNotaDownload = useRef<HTMLDivElement>(null);

  const baixarNota = async (v: PedidoClienteType, formato: "png" | "pdf" = "png") => {
    if (baixandoNota) return;

    setBaixandoNota(true);
    setNotaDownload(v);

    try {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      const blob = await gerarBlobNota(refNotaDownload);

      if (formato === "pdf") {
        await baixarNotaPdf(blob, enterprise?.nomeFantasia ?? "nota");
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = `nota-${v.pedido.pedidoId}.png`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      }
    } catch {
      /* Falha de download não trava a tabela — o usuário tenta de novo. */
    } finally {
      setBaixandoNota(false);
      setNotaDownload(null);
    }
  };

  const [status, setStatus] = useState<StatusFiltro>("todos");
  /** "" = todos. Só o master vê este filtro — os demais já recebem só as próprias. */
  const [vendedor, setVendedor] = useState("");

  /*
   * O prazo de cada nota — o que transforma "em aberto" em "vencida".
   *
   * Vem separado das vendas porque é outro assunto: a nota diz o que foi
   * vendido, o acordo diz quando aquilo tinha que ser pago. Nota sem acordo
   * simplesmente não aparece no mapa, e continua sendo uma venda à vista.
   */
  const [prazos, setPrazos] = useState<Map<string, PrazoVenda>>(new Map());

  const carregarPrazos = () => {
    ContaService.prazoDasVendas()
      .then((lista) => setPrazos(new Map(lista.map((p) => [String(p.pedidoId), p]))))
      /* Falha aqui não derruba a lista de vendas: some a coluna de
         vencimento, e o resto da tela continua servindo. */
      .catch(() => setPrazos(new Map()));
  };

  useEffect(() => {
    fetchVendas();
    carregarPrazos();
  }, [fetchVendas]);

  const abrirNota = (nota: NotaAberta) => setNotaAberta(nota);
  const fecharNota = () => {
    setNotaAberta(null);
    fetchVendas(true);
    carregarPrazos();
  };

  /* ======================= Filtros ======================= */

  /** Vencida = parcela em aberto com vencimento no passado. O critério é do
      servidor (`vencidas`), não do relógio do navegador. */
  const estaVencida = (v: PedidoClienteType) => !estaCancelado(v) && (prazos.get(v.pedido.pedidoId)?.vencidas ?? 0) > 0;

  /**
   * Tudo menos o status — é a base de que saem as contagens do seletor.
   *
   * Sem separar, "Pagas 12" contaria as pagas do sistema inteiro enquanto a
   * tela mostra só as de um vendedor: o número prometeria doze linhas e
   * entregaria três.
   */
  const baseFiltrada = useMemo(() => {
    let base = [...vendas].sort((a, b) => +new Date(b.pedido.dataPedido) - +new Date(a.pedido.dataPedido));

    if (vendedor) base = base.filter((v) => String(v.vendedorId ?? "") === vendedor);

    const termo = search.trim().toLowerCase();
    if (termo) base = base.filter((v) => v.nomeCliente?.toLowerCase().includes(termo));

    return base;
  }, [vendas, search, vendedor]);

  const porStatus = (lista: PedidoClienteType[], s: StatusFiltro) => {
    if (s === "pago") return lista.filter(estaQuitado);
    if (s === "pendente") return lista.filter(estaAberto);
    if (s === "cancelado") return lista.filter(estaCancelado);
    if (s === "vencida") return lista.filter(estaVencida);
    return lista;
  };

  const vendasFiltradas = useMemo(() => porStatus(baseFiltrada, status), [baseFiltrada, status, prazos]);

  /** As opções do seletor de status, cada uma com quantas notas deixa passar. */
  const opcoesStatus = useMemo(
    () =>
      ORDEM_FILTRO.map((s) => ({
        valor: s,
        label: ROTULO_FILTRO[s],
        contagem: porStatus(baseFiltrada, s).length,
        /* O ponto só existe quando há nota vencida de verdade. */
        alerta: s === "vencida" && baseFiltrada.some(estaVencida),
      })),
    [baseFiltrada, prazos],
  );

  /*
   * Paginação.
   *
   * A lista não rola mais: quantas linhas cabem é medido pela altura do corpo
   * da tabela (`useAutoPageSize`), e o que sobra vai para a página seguinte.
   * Rolar dentro de um cartão que já rola dentro da página é o tipo de coisa
   * que faz alguém perder o rodapé com os totais — que é justamente onde
   * estão os dois números que essa tela existe para mostrar.
   */
  const { bodyRef, perPage } = useAutoPageSize<HTMLDivElement>({ rowHeight: ALTURA_LINHA + 1, minPerPage: 4, offset: ALTURA_CABECALHO });
  const [pagina, setPagina] = useState(1);

  /**
   * Os clientes que aparecem na busca — tirados das próprias vendas.
   *
   * Não é a base de clientes: sugerir quem nunca comprou daria uma lista que
   * leva a zero linhas. O número ao lado é quantas notas a pessoa tem, que é o
   * que ajuda a escolher entre dois nomes parecidos.
   */
  /* Os meses que o seletor oferece: feitos do que EXISTE, para que nenhuma
     opção da lista caia num mês sem venda. Ver `mesesComMovimento`. */
  const mesesDoSeletor = useMemo(() => mesesComMovimento(vendasAtivas(vendas)), [vendas]);

  const clientesSugeridos = useMemo(() => {
    const mapa = new Map<string, { id: string; label: string; notas: number }>();

    for (const v of vendas) {
      const nome = v.nomeCliente?.trim();
      if (!nome) continue;

      const atual = mapa.get(nome) ?? { id: v.clienteId ?? nome, label: nome, notas: 0 };
      atual.notas += 1;
      mapa.set(nome, atual);
    }

    return [...mapa.values()]
      .sort((a, b) => b.notas - a.notas)
      .map((c) => ({ id: c.id, label: c.label, sub: `${c.notas} ${c.notas === 1 ? "nota" : "notas"}` }));
  }, [vendas]);

  /**
   * Vendedores extraídos das próprias vendas, não da lista de funcionários.
   *
   * Assim quem saiu da empresa continua aparecendo enquanto tiver venda no
   * período — some da lista quando não houver mais o que filtrar. Buscar de
   * `/funcionarios` daria o oposto: ex-funcionário sumiria e as vendas dele
   * ficariam inalcançáveis.
   */
  const vendedores = useMemo(() => {
    const mapa = new Map<string, string>();

    for (const v of vendas) {
      if (v.vendedorId) mapa.set(String(v.vendedorId), v.nomeVendedor || "Sem nome");
    }

    return Array.from(mapa, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [vendas]);

  const totalPaginas = Math.max(1, Math.ceil(vendasFiltradas.length / perPage));

  /* Filtro novo devolve a lista ao começo. Sem isto, quem está na página 4 e
     digita um nome cai numa página que o resultado não tem — e a tela aparece
     vazia com a busca cheia. */
  useEffect(() => {
    setPagina(1);
  }, [search, status, vendedor]);

  /* Trava a página dentro do total: o corpo pode encolher (janela menor, mais
     linhas por página) e deixar a página atual para trás do fim da lista. */
  useEffect(() => {
    setPagina((p) => Math.min(p, totalPaginas));
  }, [totalPaginas]);

  /* As contas a receber só são buscadas por quem pode vê-las. */
  useEffect(() => {
    if (gestor) fetchContas();
  }, [gestor, fetchContas]);

  /** A contagem da aba é de PARCELAS em aberto — é a parcela que vence. */
  const parcelasEmAberto = useMemo(
    () =>
      contas
        .filter((c) => c.tipo === "RECEBER" && c.status !== "CANCELADA")
        .reduce((acc, c) => acc + c.parcelas.filter((x) => x.situacao !== "PAGA").length, 0),
    [contas],
  );

  const criarConta = async (dados: NovaConta) => {
    setSalvandoConta(true);

    try {
      await ContaService.criar(dados);
      setNovaConta(false);
      await fetchContas(true);
    } finally {
      setSalvandoConta(false);
    }
  };

  const primeiraDaPagina = (pagina - 1) * perPage + 1;
  const daPagina = vendasFiltradas.slice((pagina - 1) * perPage, pagina * perPage);
  const ultimaDaPagina = primeiraDaPagina + daPagina.length - 1;

  const totalEmAberto = useMemo(
    () => vendas.filter((v) => !estaCancelado(v)).reduce((acc, v) => acc + valorPendenteDoPedido(v), 0),
    [vendas],
  );

  /* O que já passou do vencimento — o número que faz alguém ligar cobrando. */
  const vencido = useMemo(() => {
    let valor = 0;
    let notas = 0;

    /* Percorre as VENDAS, não o mapa: nota cancelada não é cobrança, mesmo
       que o acordo dela ainda exista no financeiro. */
    for (const v of vendas) {
      if (estaCancelado(v)) continue;

      const p = prazos.get(v.pedido.pedidoId);

      if (p && p.vencidas > 0) {
        valor += p.vencido;
        notas += 1;
      }
    }

    return { valor, notas };
  }, [prazos, vendas]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TabelaCard
        title={TITULO_ABA[aba]}
        icon={aba === "visao-geral" ? <LayoutDashboard size={15} /> : aba === "vendas" ? <ShoppingCart size={15} /> : <CalendarClock size={15} />}
        /* O panorama não tem contagem: os quatro cartões do topo já são os
           números, e "N registros" sobre eles não diria de quê. */
        count={aba === "visao-geral" ? undefined : aba === "vendas" ? vendasFiltradas.length : parcelasEmAberto}
        countLabel={
          aba === "vendas"
            ? `${vendasFiltradas.length === 1 ? "nota" : "notas"}${vendasFiltradas.length !== vendas.length ? ` de ${vendas.length}` : ""}`
            : "parcelas em aberto"
        }
        /* A largura mínima de 980px é das COLUNAS. Os painéis são fluidos e
           herdariam dela uma barra de rolagem horizontal no notebook. */
        minWidth={aba === "vendas" ? 980 : 0}
        /* No celular os painéis empurram o cartão em vez de rolar por dentro
           dele — ver `corpoLivre`. As listas continuam paginando. */
        corpoLivre={aba === "visao-geral"}
        bodyRef={bodyRef}
        onAdd={aba === "a-prazo" ? () => setNovaConta(true) : () => navigate("/pdv", { state: { abrir: "venda" } })}
        addLabel={aba === "a-prazo" ? "Novo acordo" : "Nova venda"}
        /*
         * Duas abas com a pílula que desliza (a mesma peça do estoque e do
         * PDV) e uma terceira porta que TROCA DE ROTA — a lista completa de
         * orçamentos mora em `/pdv/orcamentos`, e pílula não desliza entre
         * telas. Por isso ela é um botão à parte, ao lado da barra.
         */
        navegacao={
          <>
            <AbasTabela
              grupo="abas-vendas"
              valor={aba}
              onValor={setAba}
              abas={[
                /* Visão geral primeiro e sem contagem: é a leitura de cima,
                   não mais uma lista com N itens. */
                ...(veTudo ? [{ id: "visao-geral" as const, label: "Visão geral", icone: <LayoutDashboard size={13} /> }] : []),
                { id: "vendas", label: "Vendas", icone: <ShoppingCart size={13} />, contagem: vendasFiltradas.length },
                { id: "a-prazo", label: "A prazo", icone: <CalendarClock size={13} />, contagem: parcelasEmAberto },
              ]}
            />

            <button
              type="button"
              onClick={() => navigate("/pdv/orcamentos")}
              className="focus-ring relative flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] text-faint transition-colors hover:text-ink"
            >
              <FileText size={13} />
              Orçamentos
            </button>
          </>
        }
        acoes={
          <button
            type="button"
            onClick={() => navigate("/pdv", { state: { abrir: "orcamento" } })}
            className="focus-ring flex h-[38px] cursor-pointer items-center gap-1.5 rounded-xl border border-warning/40 bg-warning/[0.12] px-3.5 text-[12.5px] text-warning transition-colors hover:bg-warning/20"
          >
            <FileText className="h-4 w-4" />
            Novo orçamento
          </button>
        }
        controles={aba === "visao-geral" ? (
          /* O período governa TUDO o que está abaixo dele — os cartões, a curva
             e o ranking falam todos do mesmo recorte —, por isso fica na barra
             do cartão e não dentro de um dos painéis. */
          <SeletorPeriodo valor={periodo} onChange={setPeriodo} meses={mesesDoSeletor} comHoje />
        ) : aba !== "vendas" ? undefined : (
          <>
            {/* Busca e filtros no mesmo grupo: as três coisas restringem a
                mesma lista, e separá-las pelas duas pontas da barra fazia o
                olho atravessar o cabeçalho para montar um filtro só. */}
            <BuscaSugestoes
              valor={search}
              onValor={setSearch}
              sugestoes={clientesSugeridos}
              onEscolher={(s) => setSearch(s.label)}
              placeholder="Buscar cliente…"
              aria-label="Buscar venda por cliente"
              className="w-[230px] shrink-0"
            />

            {/* O seletor de vendedor só aparece quando há mais de um vendedor
                com venda: com um só, ele não filtra nada e vira ruído. */}
            {veTudo && vendedores.length > 1 && (
              <Select
                valor={vendedor}
                onChange={setVendedor}
                aria-label="Filtrar por vendedor"
                icone={<UserRound size={14} />}
                className="w-[176px] shrink-0"
                opcoes={[
                  { valor: "", label: "Vendedores" },
                  ...vendedores.map((v) => ({ valor: v.id, label: v.nome })),
                ]}
              />
            )}

            <Select
              valor={status}
              onChange={(v) => setStatus(v as StatusFiltro)}
              aria-label="Filtrar por situação da nota"
              icone={<ListFilter size={14} />}
              className="w-[162px] shrink-0"
              opcoes={opcoesStatus}
            />
          </>
        )}
        /* Sem rodapé no panorama: "total em aberto" já é um dos cartões lá
           dentro, e a paginação não tem o que paginar — a faixa só tiraria
           altura dos gráficos. */
        footer={aba === "visao-geral" ? undefined : (
          <>
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="flex items-center gap-1.5">
                Total em aberto <strong className="nums text-[13px] text-danger">{formatCurrency(totalEmAberto)}</strong>
              </span>

              {/* O vencido só aparece quando existe: uma coluna zerada
                  permanente ensina o olho a ignorar o lugar onde o alerta
                  apareceria. */}
              {vencido.notas > 0 && (
                <span className="flex items-center gap-1.5 text-danger">
                  <AlertTriangle size={12} />
                  Vencido <strong className="nums text-[13px]">{formatCurrency(vencido.valor)}</strong>
                  <span className="text-faint">
                    em {vencido.notas} {vencido.notas === 1 ? "nota" : "notas"}
                  </span>
                </span>
              )}
            </span>

            {totalPaginas > 1 && (
              <span className="flex items-center gap-3">
                <span className="hidden tabular-nums sm:inline">
                  {primeiraDaPagina}–{ultimaDaPagina} de {vendasFiltradas.length}
                </span>
                <ControlesPagina pagina={pagina} totalPaginas={totalPaginas} onPagina={setPagina} />
              </span>
            )}
          </>
        )}
      >
        {aba === "visao-geral" ? (
          /* O panorama entra SEM moldura própria — a moldura é a do cartão.
             O corpo do `TabelaCard` já é `overflow-auto`, então os painéis
             rolam exatamente onde as linhas rolariam. O padding é daqui: a
             lista encosta nas bordas de propósito, os painéis não. */
          <div className="p-3">
            <SalesOverviewPage periodo={periodo} />
          </div>
        ) : aba === "a-prazo" ? (
          /* A parcela tem botão de receber, de recibo e de cancelar, e essa
             lógica já mora na `ListaContas`. Aqui ela entra sem moldura. */
          <ListaContas
            embutida
            tipo="RECEBER"
            contas={contas.filter((c) => c.tipo === "RECEBER")}
            carregando={carregandoContas}
            onRecarregar={() => void fetchContas(true)}
          />
        ) : vendasFiltradas.length === 0 ? (
          <TabelaVazia
            icon={<ShoppingCart size={20} />}
            title="Nenhuma venda encontrada"
            description={status === "todos" && !search ? "As notas que você emitir aparecem aqui." : "Nenhuma nota bate com o filtro escolhido."}
          />
        ) : (
          <>
            {/* Os rótulos saem de `ROTULOS`, a mesma lista do cartão do
                celular. */}
            <ListaCabecalho cols={COLS}>
              {ROTULOS.map((r, i) => (
                <span key={r ?? `vazio-${i}`} className={r && i >= 4 ? "text-right" : undefined}>{r}</span>
              ))}
            </ListaCabecalho>

            {daPagina.map((v) => {
              const total = totalDoPedido(v);
              const pago = valorPagoDoPedido(v);
              const pendente = valorPendenteDoPedido(v);
              const idCurto = v.pedido.pedidoId?.slice(-6).toUpperCase() ?? "—";
              const baixandoEsta = baixandoNota && notaDownload?.pedido.pedidoId === v.pedido.pedidoId;

              /* O vencimento que interessa é o da PRÓXIMA parcela em aberto —
                 as já pagas não cobram nada de ninguém. */
              const p = prazos.get(v.pedido.pedidoId);
              const atrasada = !estaCancelado(v) && (p?.vencidas ?? 0) > 0;

              return (
                <ListaLinha
                  key={v.pedido.pedidoId}
                  cols={COLS}
                  rotulos={ROTULOS}
                  altura={ALTURA_LINHA}
                  ariaLabel={`Abrir a nota de ${v.nomeCliente}`}
                  destaque={atrasada ? "danger" : undefined}
                  onClick={() => abrirNota({ id: v.pedido.pedidoId, clienteId: v.clienteId, nome: v.nomeCliente })}
                  acoes={
                    <MenuDownloadNota
                      variante="linha"
                      titulo="Baixar nota"
                      documento="nota"
                      ocupado={baixandoEsta}
                      onEscolher={(formato) => void baixarNota(v, formato)}
                    />
                  }
                >
                  {/* Cliente e número da nota na mesma célula: o código sozinho
                      numa coluna própria gastava 84px para dizer o que ninguém
                      procura primeiro — e a busca é por nome. */}
                  <span className="flex min-w-0 items-center gap-2.5 pr-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent/25 bg-accent/[0.12] text-[10.5px] text-accent-soft">
                      {getInitials(v.nomeCliente)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] text-ink">{v.nomeCliente}</span>
                      <span className="block truncate font-mono text-[10px] text-faint">#{idCurto}</span>
                    </span>
                  </span>

                  <span className="nums text-[12px] text-mist">{formatDateShort(v.pedido.dataPedido)}</span>
                  <span><PedidoStatusBadge status={v.pedido.pedidoStatus} /></span>

                  <span className="min-w-0 pr-3">
                    {p?.proximoVencimento ? (
                      <>
                        <span className={`nums block truncate text-[12px] ${atrasada ? "text-danger" : "text-mist"}`}>{dataBr(String(p.proximoVencimento))}</span>
                        <span className={`block truncate text-[10px] ${atrasada ? "text-danger" : "text-muted"}`}>
                          {atrasada ? `${p.diasAtraso} ${p.diasAtraso === 1 ? "dia" : "dias"} em atraso` : prazo(String(p.proximoVencimento)).texto}
                        </span>
                      </>
                    ) : p ? (
                      <span className="text-[12px] text-success">quitada</span>
                    ) : (
                      <span className="text-[12px] text-faint">à vista</span>
                    )}
                  </span>

                  <span className="nums text-right text-[12.5px] text-ink">{formatCurrency(total)}</span>
                  {/* Zerado fica apagado: um valor em verde ou vermelho que
                      diz "0,00" pinta de urgência uma linha que não tem. */}
                  <span className={`nums text-right text-[12.5px] ${pago > 0 ? "text-success" : "text-faint"}`}>{formatCurrency(pago)}</span>
                  <span className={`nums text-right text-[12.5px] ${pendente > 0 ? "text-danger" : "text-faint"}`}>{formatCurrency(pendente)}</span>
                  <span />
                </ListaLinha>
              );
            })}

            {/* Linhas vazias completando a página: sem elas o rodapé sobe e
                desce conforme a última página tem duas ou dez notas — e a
                paginação vira um alvo que se move entre um clique e outro. */}
            <ListaFantasmas quantidade={Math.max(0, perPage - daPagina.length)} altura={ALTURA_LINHA} />
          </>
        )}
      </TabelaCard>

      {novaConta && (
        <ContaForm tipo="RECEBER" salvando={salvandoConta} onFechar={() => setNovaConta(false)} onSalvar={criarConta} />
      )}

      <Modal open={!!notaAberta} onClose={fecharNota} title={notaAberta?.id ? "Venda" : "Nova venda"} subtitle={notaAberta?.nome} size="full">
        {/* `onSaved` também aqui: sem ele, salvar a alteração ou cancelar a nota
            no desktop não recarregava a lista nem fechava o modal — a tela
            ficava mostrando o estado antigo até um F5. */}
        {notaAberta && <Invoice id={notaAberta.id} clienteId={notaAberta.clienteId} nome={notaAberta.nome} onSaved={fecharNota} />}
      </Modal>

      {/* Nó de nota fora da tela para o download rápido. */}
      <NotaEscondida venda={notaDownload} refNota={refNotaDownload} />
    </div>
  );
};

/** Nó de nota escondido à esquerda — `html-to-image` precisa que ele exista
    no DOM, então fica fora do viewport em vez de `display:none`. */
function NotaEscondida({ venda, refNota }: { venda: PedidoClienteType | null; refNota: LegacyRef<HTMLDivElement> }) {
  return (
    <div className="fixed -left-[9999px] top-0 w-[900px]" aria-hidden>
      {venda && <NotaResumo venda={venda} refNota={refNota} />}
    </div>
  );
}

export default SalesList;
