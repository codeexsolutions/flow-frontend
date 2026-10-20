import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ClipboardList, ExternalLink, Factory, ListFilter, Loader2, Receipt, Save, Table2, X } from "lucide-react";

import ProducaoService, { type ItemProducao, type ModeloOsDisponivel, type PedidoDeProducao } from "@/features/producao/services/producao.service";
import PlanilhaService, { type Modelo } from "@/features/planilhas/services/planilha.service";
import useSincronizacao from "@/shared/realtime/useSincronizacao";
import { useNavigate } from "react-router-dom";

import { PageScreen } from "@/shared/ui/PageShell";
import { Modal } from "@/shared/ui/Modal";
import { ControlesPagina, ListaAcao, ListaCabecalho, ListaFantasmas, ListaLinha, TabelaCard, TabelaVazia } from "@/shared/ui/DataTable";
import { SkeletonListaPainel } from "@/shared/ui/skeleton";
import { Selo } from "@/shared/ui/StatusBadge";
import BuscaSugestoes from "@/shared/ui/BuscaSugestoes";
import { useAutoPageSize } from "@/shared/hooks/useAutoPageSize";
import { formatDateShort } from "@/shared/utils/date";
import { getInitials } from "@/shared/utils/format";
import Select from "@/shared/ui/Select";
import BotaoVerDocumento, { type ModoDocumento } from "@/shared/ui/BotaoVerDocumento";
import { gerarBlobNota, proximoQuadro } from "@/shared/ui/DownloadButton";
import { entregarDocumento } from "@/shared/ui/downloadNota";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import useEnterprise from "@/features/empresa/store/enterprise.store";
import AbasProducao from "@/features/producao/components/AbasProducao";
import VisorDocumento from "@/features/producao/components/VisorDocumento";
import { modeloOS } from "@/features/producao/modelos";

/**
 * PEDIDOS — a venda e a ordem de serviço dela, numa lista só.
 *
 * ---------------------------------------------------------------------------
 * Venda e OS são o MESMO pedido
 * ---------------------------------------------------------------------------
 * Eram duas abas: Pedidos (as vendas, com o botão de gerar a ordem) e Ordem de
 * Serviço (as ordens geradas, com o documento e a planilha). Para a loja é uma
 * coisa só — o pedido do cliente — e a divisão obrigava a ir e voltar entre as
 * duas para acompanhar o mesmo trabalho.
 *
 * Agora cada linha é UM pedido. Sem ordem ainda, a ação da linha gera a OS;
 * com ordem, a linha abre a ficha, imprime o documento e diz para qual
 * planilha ela foi produzir. As ordens criadas sem venda (`pedido_fk` nulo)
 * entram como pedidos também — senão sumiriam da tela.
 *
 * ---------------------------------------------------------------------------
 * Nada é copiado
 * ---------------------------------------------------------------------------
 * A tela cruza duas listas que já existem — os pedidos (`producao/pedidos`) e
 * as ordens (`producao/itens`), casadas pelo `pedido_fk` da ordem.
 *
 * ---------------------------------------------------------------------------
 * Um nó escondido, trocado no clique
 * ---------------------------------------------------------------------------
 * Mesmo caminho da nota e do orçamento: existe UM documento de OS fora da
 * tela, e o conteúdo dele é trocado para a ordem escolhida antes de
 * fotografar. N nós escondidos numa lista de cem pedidos seriam cem documentos
 * renderizados para usar um.
 */

/* A mesma tabela de Vendas: a mesma casca, a mesma altura de linha e a mesma
   paginação pela altura do corpo — quem anda de uma tela para a outra lê as
   duas do mesmo jeito. */
const COLS = "grid-cols-[minmax(190px,1.6fr)_96px_150px_minmax(140px,1fr)_minmax(140px,1fr)_124px]";
const ROTULOS = ["Cliente", "Data", "Situação", "Itens", "Produção", "Ações"];
const ALTURA_LINHA = 60;
const ALTURA_CABECALHO = 40;

/** O botão-pastilha da barra da ordem aberta. */
const CHIP = (aceso: boolean) =>
  aceso
    ? "focus-ring flex h-[30px] shrink-0 cursor-default items-center rounded-lg border border-accent/40 bg-accent/[0.15] px-2.5 text-[11.5px] text-accent-soft"
    : "focus-ring flex h-[30px] shrink-0 cursor-pointer items-center rounded-lg border border-fg/[0.08] px-2.5 text-[11.5px] text-mist transition-colors hover:border-accent/40 hover:text-accent-soft disabled:cursor-not-allowed disabled:opacity-50";

type Filtro = "abertos" | "sem-os" | "finalizados" | "todos";

const FILTROS: { valor: Filtro; label: string }[] = [
  /* O padrão é o que ainda dá trabalho: sem ordem ou com a ordem na bancada. */
  { valor: "abertos", label: "Em aberto" },
  { valor: "sem-os", label: "Sem ordem" },
  { valor: "finalizados", label: "Finalizados" },
  { valor: "todos", label: "Todos" },
];

/** Um pedido da lista: a venda, a ordem dela, ou as duas. */
type Linha = {
  chave: string;
  data: string;
  cliente: string;
  venda: PedidoDeProducao | null;
  ordem: ItemProducao | null;
};

const finalizado = (l: Linha) => Boolean(l.ordem?.concluido_em);

/** Ordem criada na tela que o servidor ainda está gravando — ver `gerarOrdem`. */
const ehProvisoria = (o: ItemProducao) => o.id.startsWith("tmp-");

/** A situação do pedido em uma palavra, no mesmo selo da coluna de Vendas. */
const SituacaoPedido = ({ ordem }: { ordem: ItemProducao | null }) =>
  !ordem ? (
    <Selo tom="alerta">Sem ordem</Selo>
  ) : ordem.concluido_em ? (
    <Selo tom="sucesso">Finalizado</Selo>
  ) : (
    <Selo tom="info">{rotuloEtapa(ordem.etapa_nome)}</Selo>
  );

/* A etapa vem do banco como a empresa escreveu — às vezes "ATENDIMENTO" em
   caixa alta. No selo ela segue o padrão dos outros: só a inicial maiúscula. */
const rotuloEtapa = (nome: string | null) => {
  const t = (nome ?? "").trim().toLowerCase();
  return t ? t[0].toUpperCase() + t.slice(1) : "Em produção";
};

const PedidosPage = () => {
  const alert = useAlert();
  const navigate = useNavigate();
  const empresa = useEnterprise((s) => s.enterprise);

  const [pedidos, setPedidos] = useState<PedidoDeProducao[]>([]);
  const [ordens, setOrdens] = useState<ItemProducao[]>([]);
  const [carregandoPedidos, setCarregandoPedidos] = useState(true);
  const [carregandoOrdens, setCarregandoOrdens] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("abertos");
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [modelosOs, setModelosOs] = useState<ModeloOsDisponivel[]>([]);
  const [pagina, setPagina] = useState(1);

  /** A ordem que acabou de ser gerada aqui — fica destacada até ir para uma planilha. */
  const [novaOrdem, setNovaOrdem] = useState<string | null>(null);

  /* Gerar a OS: a venda escolhida e o modelo do papel, decididos ANTES de a
     ordem existir — senão a primeira impressão sai sempre no modelo errado. */
  const [aGerar, setAGerar] = useState<PedidoDeProducao | null>(null);
  const [modeloEscolhido, setModeloEscolhido] = useState("PADRAO");

  /** As planilhas de produção da empresa — para onde a ordem pode ir. */
  const [planilhas, setPlanilhas] = useState<Modelo[]>([]);
  const [aMandar, setAMandar] = useState<ItemProducao | null>(null);
  const [planilhaEscolhida, setPlanilhaEscolhida] = useState("");

  /* A ordem aberta para preencher, num modal sobre a lista, e o rascunho dela. */
  const [preenchendo, setPreenchendo] = useState<ItemProducao | null>(null);
  const [rascunho, setRascunho] = useState<Record<string, unknown>>({});
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const carregarPedidos = async () => {
    try {
      setPedidos(await ProducaoService.pedidos());
    } catch {
      /* Sem as vendas a lista ainda mostra as ordens. */
      setPedidos([]);
    } finally {
      setCarregandoPedidos(false);
    }
  };

  const carregarOrdens = async () => {
    try {
      /* `incluirConcluidos` para o pedido não perder a ordem já entregue: ele
         continua tendo tido uma, e oferecer "gerar" de novo criaria a segunda. */
      setOrdens(await ProducaoService.itens({ incluirConcluidos: true }));
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível carregar as ordens."));
    } finally {
      setCarregandoOrdens(false);
    }
  };

  useEffect(() => {
    void carregarPedidos();
    void carregarOrdens();

    /* Falhar aqui não derruba a tela: o seletor fica só com o documento simples. */
    ProducaoService.modelosDeOs()
      .then(setModelosOs)
      .catch(() => setModelosOs([]));

    /* Sem as planilhas some só a escolha de produção. */
    PlanilhaService.modelos()
      .then(setPlanilhas)
      .catch(() => setPlanilhas([]));
    // Só na montagem.
  }, []);

  /* A bancada e o balcão mexem nos mesmos dados: quem está com esta tela
     aberta vê a venda e a ordem nova sem recarregar. */
  useSincronizacao(["producao", "pedidos"], () => {
    void carregarOrdens();
    void carregarPedidos();
  });

  const carregando = carregandoPedidos || carregandoOrdens;

  /** Cada venda com a sua ordem, mais as ordens que não vieram de venda. */
  const linhas = useMemo<Linha[]>(() => {
    const ordemPorPedido = new Map<string, ItemProducao>();
    for (const o of ordens) if (o.pedido_fk) ordemPorPedido.set(String(o.pedido_fk), o);

    const vendas = new Set(pedidos.map((v) => String(v.pedidoId)));

    const daVenda: Linha[] = pedidos.map((v) => ({
      chave: `v-${v.pedidoId}`,
      data: v.dataPedido,
      cliente: v.nomeCliente,
      venda: v,
      ordem: ordemPorPedido.get(String(v.pedidoId)) ?? null,
    }));

    /* Ordem à mão, ou de uma venda que não veio na lista (cancelada, de outro
       vendedor): continua sendo um pedido em produção. */
    const soOrdem: Linha[] = ordens
      .filter((o) => !o.pedido_fk || !vendas.has(String(o.pedido_fk)))
      .map((o) => ({ chave: `o-${o.id}`, data: o.criado_em, cliente: o.cliente_nome || "Sem cliente", venda: null, ordem: o }));

    return [...daVenda, ...soOrdem].sort((a, b) => +new Date(b.data) - +new Date(a.data));
  }, [pedidos, ordens]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return linhas.filter((l) => {
      if (filtro === "abertos" && finalizado(l)) return false;
      if (filtro === "sem-os" && l.ordem) return false;
      if (filtro === "finalizados" && !finalizado(l)) return false;

      if (!termo) return true;

      return (
        l.cliente.toLowerCase().includes(termo) ||
        String(l.venda?.pedidoId ?? "").toLowerCase().includes(termo) ||
        (l.ordem ? String(l.ordem.codigo).includes(termo) || (l.ordem.titulo ?? "").toLowerCase().includes(termo) : false) ||
        (l.venda?.itens ?? []).some((i) => i.nomeProduto.toLowerCase().includes(termo))
      );
    });
  }, [linhas, busca, filtro]);

  /* Quantas linhas cabem é medido pela altura do corpo, como em Vendas: a
     lista não rola dentro do cartão, pagina. */
  const { bodyRef, perPage } = useAutoPageSize<HTMLDivElement>({ rowHeight: ALTURA_LINHA + 1, minPerPage: 4, offset: ALTURA_CABECALHO });
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / perPage));

  /* Busca ou filtro novo começa da primeira página; lista que encolheu não
     deixa a pessoa numa página que não existe mais. */
  useEffect(() => setPagina(1), [busca, filtro]);
  useEffect(() => {
    if (pagina > totalPaginas) setPagina(totalPaginas);
  }, [pagina, totalPaginas]);

  const primeiraDaPagina = (pagina - 1) * perPage + 1;
  const daPagina = filtradas.slice((pagina - 1) * perPage, pagina * perPage);
  const ultimaDaPagina = primeiraDaPagina + daPagina.length - 1;

  /* A ordem recém-gerada vai para a página em que o pedido dela está. */
  useEffect(() => {
    if (carregando || !novaOrdem) return;

    const indice = filtradas.findIndex((l) => l.ordem?.id === novaOrdem);
    if (indice >= 0) setPagina(Math.floor(indice / perPage) + 1);
    // `filtradas` fica de fora: reler a lista não deve puxar a tela de volta.
  }, [carregando, novaOrdem, perPage]);

  /* Clientes para a busca — tirados dos próprios pedidos, como em Vendas. */
  const clientesSugeridos = useMemo(() => {
    const mapa = new Map<string, number>();

    for (const l of linhas) if (l.cliente.trim()) mapa.set(l.cliente.trim(), (mapa.get(l.cliente.trim()) ?? 0) + 1);

    return [...mapa.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([nome, n]) => ({ id: nome, label: nome, sub: `${n} ${n === 1 ? "pedido" : "pedidos"}` }));
  }, [linhas]);

  const abertosTotal = useMemo(() => linhas.filter((l) => !finalizado(l)).length, [linhas]);
  const semOrdemTotal = useMemo(() => linhas.filter((l) => !l.ordem).length, [linhas]);

  /** A ordem recém-gerada, se ela estiver na lista. */
  const linhaNova = useMemo(() => (novaOrdem ? ordens.find((o) => o.id === novaOrdem) ?? null : null), [novaOrdem, ordens]);

  /**
   * QUAL planilha usar — a pergunta de quem acabou de gerar a ordem.
   *
   * A planilha para onde as outras ordens foram é a resposta certa na
   * esmagadora maioria das vezes. Sem histórico, só há sugestão se existir UMA
   * planilha — aí a escolha não é escolha.
   */
  const sugestao = useMemo(() => {
    const vezes = new Map<string, number>();

    for (const o of ordens) if (o.planilha_modelo_fk) vezes.set(o.planilha_modelo_fk, (vezes.get(o.planilha_modelo_fk) ?? 0) + 1);

    const [maisUsada] = [...vezes.entries()].sort((a, b) => b[1] - a[1]);
    const doHistorico = maisUsada && planilhas.find((m) => m.id === maisUsada[0]);

    if (doHistorico) return { modelo: doHistorico, vezes: maisUsada[1] };

    return planilhas.length === 1 ? { modelo: planilhas[0], vezes: 0 } : null;
  }, [ordens, planilhas]);

  /** Abre a pergunta do modelo do papel para gerar a OS da venda. */
  const pedirGerar = (v: PedidoDeProducao) => {
    setModeloEscolhido("PADRAO");
    setAGerar(v);
  };

  /** Abre a escolha da planilha, já com a sugerida marcada. */
  const abrirMandar = (o: ItemProducao) => {
    setPlanilhaEscolhida(sugestao?.modelo.id ?? planilhas[0]?.id ?? "");
    setAMandar(o);
  };

  /** Gera a ordem da venda e a destaca aqui mesmo, com a faixa da planilha. */
  /**
   * Gera a ordem da venda — OTIMISTA.
   *
   * A ordem aparece na linha no instante do clique, destacada, e o servidor
   * grava por baixo. Quando ele responde, a provisória dá lugar à verdadeira
   * (com número) e a faixa da planilha aparece. Se ele recusar, a linha volta
   * a "sem ordem" e o aviso diz por quê.
   */
  const gerarOrdem = async (v: PedidoDeProducao, osModelo: string) => {
    const id = String(v.pedidoId);

    const provisoria = {
      id: `tmp-${id}`,
      codigo: 0,
      titulo: v.itens.map((i) => i.nomeProduto).join(", "),
      descricao: null,
      cliente_nome: v.nomeCliente,
      pedido_fk: id,
      os_modelo: osModelo === "PADRAO" ? null : osModelo,
      os_dados: null,
      planilha_registro_fk: null,
      planilha_modelo_fk: null,
      planilha_nome: null,
      etapa_fk: null,
      etapa_nome: null,
      etapa_conclui: null,
      posicao: 0,
      responsavel_fk: null,
      responsavel_nome: null,
      periodo: "DIARIO",
      prazo: null,
      prioridade: "NORMAL",
      quantidade: v.quantidadeItens,
      concluido_em: null,
      criado_em: new Date().toISOString(),
      entrou_na_etapa: null,
    } as unknown as ItemProducao;

    setAGerar(null);
    setOrdens((lista) => [provisoria, ...lista]);
    setFiltro((f) => (f === "sem-os" || f === "finalizados" ? "abertos" : f));
    setNovaOrdem(provisoria.id);

    const desfazer = () => {
      setOrdens((lista) => lista.filter((o) => o.id !== provisoria.id));
      setNovaOrdem((atual) => (atual === provisoria.id ? null : atual));
    };

    try {
      const r = await ProducaoService.daVenda(id, osModelo === "PADRAO" ? "" : osModelo);

      if (r.criado) {
        await carregarOrdens();
        setNovaOrdem((atual) => (atual === provisoria.id ? r.id : atual));
        return;
      }

      /* Nada criado não é erro: a venda já tinha ordem, ou o plano não tem
         produção. A frase é do servidor — ela diz qual das duas é. */
      desfazer();
      alert.info("Nada a fazer", r.mensagem);
    } catch (err) {
      desfazer();
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível gerar a ordem."));
    }
  };

  /* O nó que vira documento — um só, trocado antes de cada foto. */
  const refDoc = useRef<HTMLDivElement>(null);
  const [ordemAlvo, setOrdemAlvo] = useState<ItemProducao | null>(null);

  /* O papel que sai é o modelo carimbado na PRÓPRIA ordem; as antigas, sem
     modelo, caem no padrão da empresa. Ver `modeloOS`. */
  const modeloDaOrdem = (o: ItemProducao) => modeloOS(o.os_modelo ?? empresa?.osModelo);

  /** Troca o papel da ordem — na tela já, no servidor por baixo. */
  const trocarModelo = async (o: ItemProducao, chave: string) => {
    const atualizada = { ...o, os_modelo: chave === "PADRAO" ? null : chave };

    const aplicar = (alvo: ItemProducao) => {
      setOrdens((lista) => lista.map((x) => (x.id === o.id ? alvo : x)));

      /* A ficha da chave nova não entende os campos da antiga: o rascunho da
         tela é reposto. O que já estava gravado continua no servidor. */
      setPreenchendo((atual) => {
        if (!atual || atual.id !== o.id) return atual;

        const modelo = modeloOS(alvo.os_modelo);

        setRascunho((alvo.os_dados as Record<string, unknown>) ?? modelo.vazio?.() ?? {});
        setSalvo(false);

        return alvo;
      });
    };

    aplicar(atualizada);

    try {
      await ProducaoService.definirModeloOs(o.id, chave === "PADRAO" ? "" : chave);
    } catch (err) {
      aplicar(o);
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível trocar o modelo."));
    }
  };

  /** Manda a ordem para a planilha escolhida — uma vez só por ordem. */
  const mandarParaPlanilha = async (o: ItemProducao, modeloId: string) => {
    const nome = planilhas.find((m) => m.id === modeloId)?.nome ?? null;

    /* Na tela já: a linha diz para onde foi e a faixa some. O vínculo
       verdadeiro (a linha criada na planilha) chega com a recarga. */
    setOrdens((lista) => lista.map((x) => (x.id === o.id ? { ...x, planilha_registro_fk: "tmp", planilha_modelo_fk: modeloId, planilha_nome: nome } : x)));
    setNovaOrdem((atual) => (atual === o.id ? null : atual));
    alert.success("Pronto!", nome ? `A ordem foi para ${nome}.` : "A ordem foi para a planilha.");

    try {
      await ProducaoService.mandarParaPlanilha(o.id, modeloId);
      await carregarOrdens();
    } catch (err) {
      setOrdens((lista) => lista.map((x) => (x.id === o.id ? o : x)));
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível mandar a ordem para a planilha."));
    }
  };

  /** Abre a ficha da ordem para preencher, com o que já foi salvo nela. */
  const preencher = (o: ItemProducao) => {
    const modelo = modeloDaOrdem(o);

    setPreenchendo(o);
    setRascunho((o.os_dados as Record<string, unknown>) ?? modelo.vazio?.() ?? {});
    setSalvo(false);
  };

  const salvarFicha = async () => {
    if (!preenchendo) return;

    setSalvando(true);

    try {
      await ProducaoService.salvarDadosOs(preenchendo.id, rascunho);

      setOrdens((lista) => lista.map((x) => (x.id === preenchendo.id ? { ...x, os_dados: rascunho } : x)));
      setPreenchendo((p) => (p ? { ...p, os_dados: rascunho } : p));

      setSalvo(true);
      setTimeout(() => setSalvo(false), 2000);
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível salvar a ficha."));
    } finally {
      setSalvando(false);
    }
  };

  const abrirOS = async (o: ItemProducao, modo: ModoDocumento = "ver") => {
    setAbrindo(o.id);
    setOrdemAlvo(o);

    try {
      /* Espera o nó escondido render com a ordem certa antes de fotografar. */
      await proximoQuadro();

      const blob = await gerarBlobNota(refDoc);

      const nomeBase = `os-${o.codigo}`;
      const nomeEmpresa = empresa?.nomeFantasia ?? "ordem-de-servico";

      await entregarDocumento(blob, modo, nomeBase, nomeEmpresa);
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível abrir a ordem."));
    } finally {
      setAbrindo(null);
    }
  };

  return (
    /* O cabeçalho da PÁGINA é o mesmo nas abas, de propósito: trocar de aba
       troca a lista, não a seção em que a pessoa está. Ver o Kanban. */
    <PageScreen icon={<Table2 className="h-5 w-5" />} title="Produção" subtitle="As produções que a sua operação usa">
      {/* A FAIXA de quem acabou de gerar a ordem: em qual planilha ela vai
          produzir. Fora do cartão, para não roubar altura das linhas que a
          paginação já contou. Some ao escolher ou ao fechar no X. */}
      {linhaNova && !ehProvisoria(linhaNova) && !linhaNova.planilha_registro_fk && (
        <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-success/25 bg-success/[0.07] px-4 py-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-success/30 bg-success/[0.12] text-success">
            <Check size={14} />
          </span>

          <div className="min-w-[200px] flex-1">
            <p className="text-[12.5px] text-ink">
              OS #{linhaNova.codigo} gerada para {linhaNova.cliente_nome || "sem cliente"} — falta dizer onde ela produz.
            </p>

            <p className="mt-0.5 text-[11.5px] leading-relaxed text-mist">
              {planilhas.length === 0
                ? "Você ainda não tem planilha de produção. Crie a primeira em Produção › Kanban — é nela que a ordem ganha a linha do cliente, com as colunas do seu processo."
                : sugestao
                  ? sugestao.vezes > 0
                    ? `Use a planilha ${sugestao.modelo.nome} — foi para lá que ${sugestao.vezes === 1 ? "a última ordem foi" : `as últimas ${sugestao.vezes} ordens foram`}.`
                    : `Você tem uma planilha de produção: ${sugestao.modelo.nome}. É nela que esta ordem entra.`
                  : `Escolha a planilha — ${planilhas.slice(0, 3).map((m) => m.nome).join(", ")}${planilhas.length > 3 ? " e outras" : ""}.`}
            </p>
          </div>

          {planilhas.length === 0 ? (
            <button
              type="button"
              onClick={() => navigate("/producao/kanban")}
              className="focus-ring flex h-[32px] shrink-0 items-center gap-1.5 rounded-lg border border-fg/[0.12] px-3 text-[12px] text-mist transition-colors hover:border-accent/40 hover:text-accent-soft"
            >
              Criar uma planilha <ArrowRight size={13} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => (sugestao ? void mandarParaPlanilha(linhaNova, sugestao.modelo.id) : abrirMandar(linhaNova))}
              className="focus-ring flex h-[32px] shrink-0 items-center gap-1.5 rounded-lg border border-success/30 bg-success/[0.1] px-3 text-[12px] text-success transition-colors hover:bg-success/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowRight size={13} />
              {sugestao ? `Mandar para ${sugestao.modelo.nome}` : "Escolher a planilha"}
            </button>
          )}

          <button
            type="button"
            aria-label="Fechar o aviso"
            onClick={() => setNovaOrdem(null)}
            className="focus-ring shrink-0 rounded-lg p-1 text-muted transition-colors hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <TabelaCard
        title="Pedidos"
        icon={<Receipt size={15} />}
        count={filtradas.length}
        countLabel={`${filtradas.length === 1 ? "pedido" : "pedidos"}${filtradas.length !== linhas.length ? ` de ${linhas.length}` : ""}`}
        minWidth={900}
        bodyRef={bodyRef}
        navegacao={<AbasProducao />}
        controles={
          <>
            <BuscaSugestoes
              valor={busca}
              onValor={setBusca}
              sugestoes={clientesSugeridos}
              onEscolher={(s) => setBusca(s.label)}
              placeholder="Buscar cliente, item ou OS…"
              aria-label="Buscar pedido"
              className="w-[230px] shrink-0"
            />

            <Select
              valor={filtro}
              aria-label="Situação do pedido"
              onChange={(v) => setFiltro(v as Filtro)}
              icone={<ListFilter size={14} />}
              className="w-[162px] shrink-0"
              opcoes={FILTROS.map((f) => ({
                valor: f.valor,
                label: f.label,
                contagem:
                  f.valor === "todos"
                    ? linhas.length
                    : f.valor === "abertos"
                      ? abertosTotal
                      : f.valor === "sem-os"
                        ? semOrdemTotal
                        : linhas.filter(finalizado).length,
              }))}
            />
          </>
        }
        footer={
          <>
            <span className="flex items-center gap-1.5">
              Em aberto <strong className="nums text-[13px] font-normal text-ink">{abertosTotal}</strong>
              <span className="text-faint">· {semOrdemTotal} sem ordem</span>
            </span>

            {totalPaginas > 1 && (
              <span className="flex items-center gap-3">
                <span className="hidden tabular-nums sm:inline">
                  {primeiraDaPagina}–{ultimaDaPagina} de {filtradas.length}
                </span>
                <ControlesPagina pagina={pagina} totalPaginas={totalPaginas} onPagina={setPagina} />
              </span>
            )}
          </>
        }
      >
        {carregando ? (
          <SkeletonListaPainel linhas={8} />
        ) : filtradas.length === 0 ? (
          <TabelaVazia
            icon={<Receipt size={20} />}
            title={busca.trim() || filtro !== "abertos" ? "Nenhum pedido encontrado" : "Nenhum pedido em aberto"}
            description={
              busca.trim() || filtro !== "abertos"
                ? "Tente outra busca ou outro filtro."
                : "Toda venda registrada no balcão aparece aqui, pronta para virar ordem de serviço."
            }
          />
        ) : (
          <>
            <ListaCabecalho cols={COLS}>
              {ROTULOS.map((r, i) => (
                <span key={r} className={i === ROTULOS.length - 1 ? "text-right" : undefined}>{r}</span>
              ))}
            </ListaCabecalho>

            {daPagina.map((l) => {
              const o = l.ordem;
              const v = l.venda;
              const idVenda = v ? String(v.pedidoId) : null;

              return (
                <ListaLinha
                  key={l.chave}
                  cols={COLS}
                  rotulos={ROTULOS}
                  altura={ALTURA_LINHA}
                  ancora={o ? `ordem-${o.id}` : undefined}
                  destaque={o && o.id === novaOrdem ? "sucesso" : undefined}
                  /* A linha inteira é o pedido: com ordem, abre a ficha da OS;
                     sem ordem, pergunta o modelo e gera. Os botões ficam FORA
                     do botão da linha — ver `ListaLinha`. */
                  ariaLabel={o ? `Abrir a OS ${o.codigo} de ${l.cliente}` : `Gerar a ordem de serviço de ${l.cliente}`}
                  onClick={o ? (ehProvisoria(o) ? undefined : () => preencher(o)) : v ? () => pedirGerar(v) : undefined}
                  acoes={
                    o && ehProvisoria(o) ? undefined : o ? (
                      <>
                        {o.planilha_registro_fk ? (
                          <ListaAcao
                            icon={<ExternalLink size={14} />}
                            label={`Abrir em ${o.planilha_nome ?? "Produção"}`}
                            tom="sucesso"
                            onClick={() => navigate("/producao/kanban")}
                          />
                        ) : (
                          <ListaAcao
                            icon={<Factory size={14} />}
                            label="Mandar para uma planilha de produção"
                            onClick={() => abrirMandar(o)}
                          />
                        )}

                        <BotaoVerDocumento
                          variante="linha"
                          titulo="Ver ou imprimir a ordem de serviço"
                          documento="ordem"
                          ocupado={abrindo === o.id}
                          onAbrir={(modo) => void abrirOS(o, modo)}
                        />
                      </>
                    ) : v ? (
                      <ListaAcao
                        icon={<ClipboardList size={14} />}
                        label="Gerar ordem de serviço"
                        tom="sucesso"
                        onClick={() => pedirGerar(v)}
                      />
                    ) : undefined
                  }
                >
                  <span className="flex min-w-0 items-center gap-2.5 pr-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent/25 bg-accent/[0.12] text-[10.5px] text-accent-soft">
                      {getInitials(l.cliente)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] text-ink">{l.cliente}</span>
                      <span className="flex min-w-0 items-center gap-1.5 text-[10px] text-faint">
                        <span className="truncate">{idVenda ? `#${idVenda.slice(-6).toUpperCase()}` : "Sem venda"}</span>
                        {o && <span className="shrink-0 text-accent-soft">· {ehProvisoria(o) ? "OS nova" : `OS #${o.codigo}`}</span>}
                      </span>
                    </span>
                  </span>

                  <span className="nums text-[12px] text-mist">{formatDateShort(l.data)}</span>

                  <span className="min-w-0">
                    <SituacaoPedido ordem={o} />
                  </span>

                  {/* Quantas peças, e o que são. */}
                  <span className="min-w-0 pr-3">
                    {v ? (
                      <>
                        <span className="block text-[12.5px] tabular-nums text-ink">
                          {v.quantidadeItens} {v.quantidadeItens === 1 ? "peça" : "peças"}
                        </span>
                        <span className="block truncate text-[10px] text-faint">{v.itens.map((i) => i.nomeProduto).join(", ")}</span>
                      </>
                    ) : (
                      <span className="block truncate text-[12px] text-mist">{o?.titulo}</span>
                    )}
                  </span>

                  {/* PARA ONDE a ordem foi produzir — só texto: escolher a
                      planilha é o botão de Ações, fora do clique da linha. */}
                  <span className="min-w-0 truncate pr-3 text-[12px]">
                    {!o ? (
                      <span className="text-faint">—</span>
                    ) : o.planilha_registro_fk ? (
                      <span className="text-success">{o.planilha_nome ?? "Na produção"}</span>
                    ) : (
                      <span className="text-warning">Sem planilha</span>
                    )}
                  </span>

                  <span />
                </ListaLinha>
              );
            })}

            {/* Linhas vazias completando a página, para o rodapé não pular. */}
            <ListaFantasmas quantidade={Math.max(0, perPage - daPagina.length)} altura={ALTURA_LINHA} />
          </>
        )}
      </TabelaCard>

      {/* Para qual planilha a ordem vai produzir. */}
      <Modal
        open={!!aMandar}
        onClose={() => setAMandar(null)}
        title="Mandar para a produção"
        subtitle={aMandar ? `OS #${aMandar.codigo} · ${aMandar.cliente_nome || "Sem cliente"}` : ""}
        size="sm"
      >
        {aMandar && (
          <div className="flex flex-col gap-4">
            {planilhas.length === 0 ? (
              <p className="text-[12px] leading-relaxed text-mist">
                Você ainda não tem planilha de produção. Crie a primeira em Produção › Kanban — é nela que a ordem ganha a linha do cliente.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <span className="text-[10px] uppercase tracking-[0.7px] text-faint">Planilha</span>
                <Select
                  valor={planilhaEscolhida}
                  aria-label="Planilha de produção"
                  onChange={setPlanilhaEscolhida}
                  opcoes={planilhas.map((m) => ({ valor: m.id, label: m.nome }))}
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-fg/[0.06] pt-3">
              <button onClick={() => setAMandar(null)} className="flex min-h-[36px] items-center rounded-lg px-3 text-[12px] text-mist transition-colors hover:text-ink">
                Cancelar
              </button>

              {planilhas.length === 0 ? (
                <button
                  onClick={() => navigate("/producao/kanban")}
                  className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-fg/[0.12] px-3.5 text-[12px] text-mist transition-colors hover:text-ink"
                >
                  Criar uma planilha <ArrowRight size={13} />
                </button>
              ) : (
                <button
                  disabled={!planilhaEscolhida}
                  onClick={() => {
                    const o = aMandar;
                    setAMandar(null);
                    void mandarParaPlanilha(o, planilhaEscolhida);
                  }}
                  className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-success/30 bg-success/[0.1] px-3.5 text-[12px] text-success transition-colors hover:bg-success/20 disabled:opacity-40"
                >
                  <Factory size={13} /> Mandar
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Escolher o papel ANTES de a ordem existir. */}
      <Modal open={!!aGerar} onClose={() => setAGerar(null)} title="Gerar ordem de serviço" subtitle={aGerar ? aGerar.nomeCliente : ""} size="sm">
        {aGerar && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] uppercase tracking-[0.7px] text-faint">Modelo do papel</span>

              <Select
                valor={modeloEscolhido}
                aria-label="Modelo da ordem de serviço"
                onChange={setModeloEscolhido}
                opcoes={[{ valor: "PADRAO", label: "Ordem de serviço simples" }, ...modelosOs.map((m) => ({ valor: m.chave, label: m.nome }))]}
              />

              <p className="text-[11.5px] leading-relaxed text-faint">
                {modelosOs.find((m) => m.chave === modeloEscolhido)?.descricao ?? "Cliente, etapa, responsável, prazo e o que produzir. Serve a qualquer ramo."}
              </p>

              {modelosOs.length === 0 && (
                <p className="text-[11.5px] leading-relaxed text-mist">
                  Outros modelos — como a ficha técnica de produção, com grades de tamanho, moldes e tecidos — são liberados para a sua
                  empresa pelo suporte.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-fg/[0.06] pt-3">
              <button onClick={() => setAGerar(null)} className="flex min-h-[36px] items-center rounded-lg px-3 text-[12px] text-mist transition-colors hover:text-ink">
                Cancelar
              </button>

              <button
                onClick={() => void gerarOrdem(aGerar, modeloEscolhido)}
                className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-success/30 bg-success/[0.1] px-3.5 text-[12px] text-success transition-colors hover:bg-success/20"
              >
                <ClipboardList size={13} /> Gerar ordem
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* A ordem aberta: o modelo, salvar e imprimir numa barra, e a folha. */}
      <Modal
        open={!!preenchendo}
        onClose={() => setPreenchendo(null)}
        title={preenchendo ? `OS #${preenchendo.codigo} · ${preenchendo.cliente_nome || "Sem cliente"}` : ""}
        subtitle={preenchendo ? modeloDaOrdem(preenchendo).nome : undefined}
        size="full"
      >
        {preenchendo && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="shrink-0 overflow-hidden rounded-xl border border-fg/[0.07] bg-fg/[0.02]">
              <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <span className="text-[10px] uppercase tracking-[0.7px] text-faint">Modelo</span>

                {[{ chave: "PADRAO", nome: "Simples" }, ...modelosOs.map((m) => ({ chave: m.chave, nome: m.nome }))].map((m) => {
                  const atual = (preenchendo.os_modelo ?? empresa?.osModelo ?? "PADRAO") === m.chave;

                  return (
                    <button
                      key={m.chave}
                      type="button"
                      disabled={atual}
                      onClick={() => void trocarModelo(preenchendo, m.chave)}
                      title={atual ? "É o modelo desta ordem" : `Usar ${m.nome}`}
                      className={CHIP(atual)}
                    >
                      {m.nome}
                    </button>
                  );
                })}


                <span className="ml-auto flex items-center gap-2">
                  {/* Só há o que salvar onde há o que preencher. */}
                  {modeloDaOrdem(preenchendo).Edicao && (
                    <button
                      onClick={() => void salvarFicha()}
                      disabled={salvando}
                      className="focus-ring flex h-[30px] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-gradient-to-br from-accent-soft to-accent px-3 text-[11.5px] text-white transition-all hover:brightness-110 disabled:opacity-50"
                    >
                      {salvando ? <Loader2 size={13} className="animate-spin" /> : salvo ? <Check size={13} /> : <Save size={13} />}
                      {salvo ? "Salvo" : "Salvar ficha"}
                    </button>
                  )}

                  <BotaoVerDocumento
                    variante="linha"
                    titulo="Ver ou imprimir a ordem de serviço"
                    documento="ordem"
                    ocupado={abrindo === preenchendo.id}
                    onAbrir={(modo) => void abrirOS(preenchendo, modo)}
                  />
                </span>
              </div>
            </div>

            {/* A folha inteira, reduzida para caber — e com zoom. */}
            <VisorDocumento>
              {(() => {
                const modelo = modeloDaOrdem(preenchendo);

                if (modelo.Edicao) return <modelo.Edicao ordem={preenchendo} dados={rascunho} onChange={setRascunho} />;

                /* Modelo sem ficha: mostra o papel como ele vai sair. Largura
                   FIXA — dentro do visor quem manda no tamanho é a folha. */
                return (
                  <div className="w-[900px] overflow-hidden rounded-xl">
                    <modelo.Documento ordem={preenchendo} />
                  </div>
                );
              })()}
            </VisorDocumento>
          </div>
        )}
      </Modal>

      {/* O documento fora da tela: largura fixa, nunca rola, sempre inteiro —
          `html-to-image` precisa do nó renderizado de verdade. */}
      <div className="fixed -left-[9999px] top-0 w-fit" aria-hidden>
        {ordemAlvo &&
          (() => {
            const M = modeloDaOrdem(ordemAlvo).Documento;
            return <M ordem={ordemAlvo} refDoc={refDoc} />;
          })()}
      </div>
    </PageScreen>
  );
};

export default PedidosPage;
