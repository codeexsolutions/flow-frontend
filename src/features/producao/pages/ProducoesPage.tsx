import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Check, Copy, ExternalLink, Eye, Factory, ListFilter, Palette, Table2, Trash2, Users } from "lucide-react";

import PlanilhaService, { type LinkPublico, type MarcaEmpresa } from "@/features/planilhas/services/planilha.service";
import useSincronizacao from "@/shared/realtime/useSincronizacao";
import { PageScreen } from "@/shared/ui/PageShell";
import { BarraFiltros, ListaAcao, ListaCabecalho, ListaFantasmas, ListaLinha, TabelaPaginacao } from "@/shared/ui/DataTable";
import { Selo } from "@/shared/ui/StatusBadge";
import { SkeletonTableRows, SkeletonIdentityCell } from "@/shared/ui/skeleton";
import { useAutoPageSize, ROW_HEIGHT } from "@/shared/hooks/useAutoPageSize";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import { formatNumber, getInitials } from "@/shared/utils/format";
import Select from "@/shared/ui/Select";
import BuscaSugestoes from "@/shared/ui/BuscaSugestoes";
import AbasProducao from "@/features/producao/components/AbasProducao";
import Personalizacao from "@/features/planilhas/components/Personalizacao";
import { Modal } from "@/shared/ui/Modal";

/**
 * As produções em curso: um cliente por linha, a página dele a um clique.
 *
 * ---------------------------------------------------------------------------
 * Por que a lista é a dos LINKS, e não a do cadastro
 * ---------------------------------------------------------------------------
 * Ter cliente cadastrado não é ter produção. A pergunta que esta tela responde
 * é "quem está acompanhando um pedido agora?", e quem responde isso é o link
 * emitido — não o cadastro, que guarda também quem comprou uma vez em março.
 * Listar o cadastro inteiro encheria a tabela de linhas sem destino, e o
 * clique — que aqui abre a página do cliente — não teria para onde ir na
 * maioria delas.
 *
 * Emitir link continua sendo ato da planilha, feito de dentro dela (aba Kanban
 * › botão "Cliente"), que é onde estão as colunas que decidem o que o cliente
 * enxerga. Aqui é a agenda: quem tem, por qual planilha, quantas vezes abriu.
 *
 * ---------------------------------------------------------------------------
 * A mesma tabela de Clientes e Estoque
 * ---------------------------------------------------------------------------
 * Cabeçalho de colunas, linhas de altura fixa, paginação que preenche a altura
 * da janela e a barra de busca e filtros colada na tabela — as mesmas peças de
 * `DataTable`, sem cópia. Uma terceira lista com regras próprias seria uma
 * terceira coisa para aprender numa tela que a pessoa abre justamente para não
 * ter de aprender nada.
 */

/** O link, já sabendo de qual planilha veio. */
type LinkComOrigem = LinkPublico & { planilha_nome: string; planilha_id: string };

type Situacao = "todos" | "ativos" | "revogados";

const SITUACOES: { valor: Situacao; label: string }[] = [
  { valor: "todos", label: "Todos" },
  { valor: "ativos", label: "Ativos" },
  /* Revogado não some da lista: link cortado é informação — é o que responde
     "por que o cliente diz que o link dele não abre mais". */
  { valor: "revogados", label: "Revogados" },
];

/** As colunas e a largura de cada uma. Mesma forma do `COLS` de Clientes. */
const COLS = "grid-cols-[minmax(0,1fr)_160px_112px_120px_104px_120px]";

/** Soma das fixas + folga para a flexível: abaixo disso a tabela rola. */
const TABLE_MIN_WIDTH = 856;

/**
 * Os rótulos das colunas, em UMA lista.
 *
 * Servem ao cabeçalho do desktop e ao cartão do celular (ver `ListaLinha`). A
 * última posição é vazia de propósito: aquela coluna só reserva a largura das
 * ações, e no cartão ela não tem o que rotular.
 */
const ROTULOS = ["Cliente", "Produção", "Aberturas", "Validade", "Situação", undefined];

const SkeletonRows = ({ count }: { count: number }) => (
  <SkeletonTableRows count={count} cols={COLS} rowHeight={ROW_HEIGHT}>
    <SkeletonIdentityCell />
    <div className="h-3 w-24 rounded bg-fg/[0.05]" />
    <div className="h-3 w-14 rounded bg-fg/[0.05]" />
    <div className="h-3 w-16 rounded bg-fg/[0.05]" />
    <div className="h-5 w-16 rounded-full bg-fg/[0.05]" />
    <div className="ml-auto h-7 w-[100px] rounded-lg bg-fg/[0.05]" />
  </SkeletonTableRows>
);

const dataBr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");

const ProducoesPage = () => {
  const alert = useAlert();

  /* Mesma regra da planilha: aviso desta seção é toast, nunca modal — ver a
     nota em `PlanilhasPage`. */
  const TOAST = { position: "bottom-right" as const, timer: 4000 };

  const [links, setLinks] = useState<LinkComOrigem[]>([]);
  const [marca, setMarca] = useState<MarcaEmpresa | null>(null);
  const [carregando, setCarregando] = useState(true);

  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<Situacao>("ativos");
  const [planilha, setPlanilha] = useState("todas");
  const [copiado, setCopiado] = useState<string | null>(null);
  const [aparencia, setAparencia] = useState(false);

  const [pagina, setPagina] = useState(1);
  const { bodyRef, perPage } = useAutoPageSize<HTMLDivElement>();

  /**
   * Uma varredura por todas as planilhas.
   *
   * Não existe rota que devolva os links da empresa inteira, e criar uma
   * custaria migration e endpoint para uma consulta que roda uma vez por
   * abertura de tela. São poucas planilhas por empresa — três no Standard, meia
   * dúzia na prática acima disso —, então o leque em paralelo resolve sem
   * inventar rota nova.
   */
  const carregar = useCallback(async () => {
    setCarregando(true);

    try {
      const modelos = await PlanilhaService.modelos();

      const porModelo = await Promise.all(
        modelos.map(async (m) => {
          /* Falhar numa planilha não pode zerar as outras: a tela vale pelo
             que conseguiu trazer. */
          const seus = await PlanilhaService.links(m.id).catch(() => [] as LinkPublico[]);

          return seus.map((l) => ({ ...l, planilha_nome: m.nome, planilha_id: m.id }));
        }),
      );

      setLinks(porModelo.flat());
    } catch (err) {
      alert.toast("error", getErrorTitle(err), extractErrorMessage(err, "Não foi possível carregar as produções."), TOAST);
    } finally {
      setCarregando(false);
    }
    /* Sem dependências de propósito: `alert` vem do contexto e é um objeto novo
       a cada render — listá-lo trocaria a identidade de `carregar` toda vez e o
       efeito abaixo entraria em laço. */
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /* Link emitido em outra aba (ou por outra pessoa) entra aqui sem F5: é a
     mesma coleção que a planilha avisa quando muda. */
  useSincronizacao(["planilhas"], carregar);

  useEffect(() => {
    PlanilhaService.marca()
      .then(setMarca)
      .catch(() => {
        /* Sem marca o endereço cai no domínio do sistema — a lista continua
           utilizável, e interromper quem só quer copiar seria pior. */
      });
  }, []);

  /**
   * O endereço da página do cliente.
   *
   * Sai pelo domínio da empresa quando ela configurou um: `window.location` é
   * por onde o DONO entrou para administrar, e o link entregue não pode levar o
   * nome do sistema depois que a empresa passou a ter o dela.
   */
  const enderecoDe = (token: string) =>
    /* Sem o `/p/`: o token já é inconfundível sozinho (32 caracteres
       base64url), e o link entregue ao cliente fica mais curto de ler em voz
       alta e de caber numa mensagem. O endereço antigo continua abrindo — ver
       `TOKEN_PUBLICO`, em `AppRoutes`. */
    `${marca?.dominio ? `https://${marca.dominio}` : window.location.origin}/${token}`;

  const planilhas = useMemo(() => {
    const mapa = new Map<string, string>();

    for (const l of links) mapa.set(l.planilha_id, l.planilha_nome);

    return [...mapa].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [links]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return links
      .filter((l) => (situacao === "todos" ? true : situacao === "ativos" ? l.ativo : !l.ativo))
      .filter((l) => (planilha === "todas" ? true : l.planilha_id === planilha))
      .filter((l) => (termo ? l.cliente_nome.toLowerCase().includes(termo) : true))
      /* Ativos primeiro, e dentro deles por nome: a lista existe para achar o
         link de alguém, e revogado é histórico. */
      .sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.cliente_nome.localeCompare(b.cliente_nome, "pt-BR"));
  }, [links, situacao, planilha, busca]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / perPage));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const daPagina = filtrados.slice((paginaAtual - 1) * perPage, paginaAtual * perPage);
  const vazias = Math.max(0, perPage - daPagina.length);

  /* Filtrar mostra a página 1 do novo resultado: manter a quarta quando
     sobraram duas devolveria uma tela vazia a quem acabou de digitar. */
  useEffect(() => {
    setPagina(1);
  }, [busca, situacao, planilha]);

  const opcoesSituacao = useMemo(
    () =>
      SITUACOES.map((s) => ({
        valor: s.valor,
        label: s.label,
        meta: String(
          links.filter((l) => (s.valor === "todos" ? true : s.valor === "ativos" ? l.ativo : !l.ativo)).length,
        ),
      })),
    [links],
  );

  const opcoesPlanilha = useMemo(
    () => [{ valor: "todas", label: "Todas as produções" }, ...planilhas.map((p) => ({ valor: p.id, label: p.nome }))],
    [planilhas],
  );

  const sugestoes = useMemo(
    () => filtrados.slice(0, 40).map((l) => ({ id: l.token, label: l.cliente_nome, sub: l.planilha_nome })),
    [filtrados],
  );

  const temFiltro = busca.trim() !== "" || situacao !== "ativos" || planilha !== "todas";

  const limpar = () => {
    setBusca("");
    setSituacao("ativos");
    setPlanilha("todas");
  };

  /**
   * A página do cliente abre em ABA NOVA.
   *
   * Ela é um site de fora — outro domínio, quando a empresa tem o dela — e não
   * tem barra lateral para voltar. Substituindo a aba, quem só queria conferir
   * o que o cliente vê precisaria do botão do navegador para retomar o
   * trabalho, e perderia a busca e a página em que estava.
   */
  const abrir = (token: string) => window.open(enderecoDe(token), "_blank", "noopener,noreferrer");

  const copiar = async (token: string) => {
    const url = enderecoDe(token);

    try {
      await navigator.clipboard.writeText(url);
      setCopiado(token);
      setTimeout(() => setCopiado((t) => (t === token ? null : t)), 2000);
    } catch {
      /* Área de transferência bloqueada (http, permissão negada): mostrar o
         endereço deixa a cópia manual possível em vez de falhar calado. */
      alert.info("Copie o link", url);
    }
  };

  /**
   * A cor é gravada ao SOLTAR o seletor, não a cada movimento.
   *
   * `<input type="color">` dispara `onChange` continuamente enquanto o dedo
   * arrasta — gravar ali seria uma requisição por pixel de gradiente. O estado
   * local acompanha o arraste (a prévia responde), a rede só no fim.
   */
  const salvarMarca = async (mudanca: Partial<Pick<MarcaEmpresa, "cor" | "tema" | "capa" | "mascote">>) => {
    const antes = marca;

    setMarca((m) => (m ? { ...m, ...mudanca } : m));

    try {
      await PlanilhaService.salvarMarca(mudanca);
    } catch (err) {
      setMarca(antes);
      alert.toast("error", getErrorTitle(err), extractErrorMessage(err, "Não foi possível salvar."), TOAST);
    }
  };

  const revogar = async (link: LinkComOrigem) => {
    setLinks((atual) => atual.map((l) => (l.id === link.id ? { ...l, ativo: false } : l)));

    try {
      await PlanilhaService.revogarLink(link.id);
    } catch (err) {
      alert.toast("error", getErrorTitle(err), extractErrorMessage(err, "Não foi possível revogar."), TOAST);
      carregar();
    }
  };

  return (
    <PageScreen
      icon={<Factory className="h-5 w-5" />}
      title="Produção"
      subtitle="Quem acompanha o próprio pedido, e por qual link"
    >
      {/*
       * A mesma casca de lista de Clientes e Estoque.
       *
       * `min-h` no celular e `flex-1` a partir de `sm`: a tabela foi desenhada
       * para esticar até o fim da janela — é assim que a paginação sabe quantas
       * linhas cabem —, e num contêiner que rola o `flex-1` encolheria até a
       * linha mais curta, deixando o rodapé por cima da primeira.
       */}
      <div className="card glass-sheen flex min-h-[460px] min-w-0 flex-col overflow-hidden rounded-lg sm:min-h-[260px] sm:flex-1">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-fg/[0.06] px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/[0.15]">
              <Users className="h-4 w-4 text-accent-soft" />
            </div>
            <div>
              <h2 className="text-[13px] text-ink">Clientes em produção</h2>
              <p className="text-[11px] text-faint">
                {formatNumber(filtrados.length)} {filtrados.length === 1 ? "resultado" : "resultados"}
              </p>
            </div>
          </div>

          {/*
           * A aparência da página do cliente mora AQUI, e não dentro da
           * planilha.
           *
           * Ela veste todos os links de uma vez — é da empresa, não de uma
           * planilha —, e esta é a tela em que os links existem. Dentro da
           * planilha, junto do painel que emitia link um a um, ela ficava atrás
           * de um botão que a maioria abria por outro motivo.
           */}
          {marca && (
            <button
              type="button"
              onClick={() => setAparencia(true)}
              title="Logo, cor e fundo da página que o cliente abre"
              className="focus-ring inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-fg/[0.1] px-3 py-2 text-[12.5px] text-mist transition-colors hover:border-accent/40 hover:text-accent-soft"
            >
              <Palette size={15} />
              <span className="hidden sm:inline">Aparência</span>
            </button>
          )}
        </div>

        {/* A barra colada na tabela — a mesma peça das outras telas. À esquerda
            as abas que TROCAM a lista (Produções · Kanban); à direita a busca e
            os filtros, que restringem a que já está aberta. Separadas de
            propósito: um zera o que o outro fez. */}
        <BarraFiltros navegacao={<AbasProducao />}>
          {/*
           * A sugestão ABRE a página do cliente; ela não filtra a tabela.
           *
           * Filtrar já é o que o próprio texto faz enquanto se digita. O que a
           * lista acrescenta é o atalho para quem já sabe de quem está atrás e
           * não quer procurar a linha na página certa depois.
           */}
          <BuscaSugestoes
            valor={busca}
            onValor={setBusca}
            sugestoes={sugestoes}
            onEscolher={(s) => abrir(s.id)}
            placeholder="Buscar cliente…"
            aria-label="Buscar cliente com acompanhamento de produção"
            className="w-[212px] shrink-0"
          />

          <Select
            valor={situacao}
            onChange={(v) => setSituacao(v as Situacao)}
            opcoes={opcoesSituacao}
            icone={<ListFilter size={14} />}
            aria-label="Filtrar por situação do link"
            className="w-[150px] shrink-0"
          />

          {/* Planilha só existe quando há o que escolher: um seletor com uma
              opção só ocupa espaço para não decidir nada. */}
          {planilhas.length > 1 && (
            <Select
              valor={planilha}
              onChange={setPlanilha}
              opcoes={opcoesPlanilha}
              icone={<Table2 size={14} />}
              aria-label="Filtrar por produção de origem"
              className="w-[184px] shrink-0"
            />
          )}

          {temFiltro && (
            <button
              type="button"
              onClick={limpar}
              className="focus-ring h-[38px] shrink-0 cursor-pointer whitespace-nowrap rounded-xl px-2.5 text-[12px] text-faint transition-colors hover:text-ink"
            >
              Limpar
            </button>
          )}
        </BarraFiltros>

        {/* Largura mínima e rolagem horizontal são do DESKTOP: no celular a
            linha virou cartão e já cabe em pé. */}
        <div className="flex min-h-0 flex-1 flex-col sm:overflow-x-auto">
          <div
            className="flex min-h-0 flex-1 flex-col sm:[min-width:var(--tabela-min)]"
            style={{ "--tabela-min": `${TABLE_MIN_WIDTH}px` } as CSSProperties}
          >
            {/* Os rótulos saem de `ROTULOS`, a mesma lista do cartão do
                celular. "Ações" é escrito à parte: no cartão os botões ficam
                numa faixa própria, sem rótulo. */}
            <ListaCabecalho cols={COLS}>
              {ROTULOS.slice(0, 5).map((r, i) => (
                <p key={r} className={i >= 2 ? "text-right" : undefined}>
                  {r}
                </p>
              ))}
              <p className="text-right">Ações</p>
            </ListaCabecalho>

            {/* `overflow-hidden` é do desktop, que mostra exatamente as linhas
                que couberem; no celular os cartões são mais altos e o resto da
                página rola aqui. */}
            <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto sm:overflow-hidden">
              {carregando ? (
                <SkeletonRows count={perPage} />
              ) : filtrados.length === 0 ? (
                <div className="flex h-full items-center justify-center py-10">
                  <div className="flex max-w-xs flex-col items-center gap-3 text-center text-faint">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-fg/[0.06] bg-fg/[0.03]">
                      <Factory className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-[13px] text-mist">
                        {temFiltro ? "Nenhum cliente encontrado" : "Nenhuma produção acompanhada ainda"}
                      </p>
                      {/* Dois vazios diferentes pedem ações opostas: limpar o
                          que está escondendo a lista, ou emitir o primeiro
                          link. */}
                      <p className="mt-0.5 text-[11px]">
                        {temFiltro
                          ? "Ajuste a busca ou os filtros."
                          : "Abra o Kanban, escolha a produção e emita o link em “Cliente”."}
                      </p>
                    </div>
                    {temFiltro && (
                      <button
                        type="button"
                        onClick={limpar}
                        className="focus-ring cursor-pointer rounded-xl border border-fg/[0.1] px-3 py-1.5 text-[12px] text-mist transition-colors hover:text-ink"
                      >
                        Limpar filtros
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {daPagina.map((l) => (
                    <ListaLinha
                      key={l.id}
                      cols={COLS}
                      altura={ROW_HEIGHT}
                      rotulos={ROTULOS}
                      onClick={() => abrir(l.token)}
                      ariaLabel={`Abrir a página de produção de ${l.cliente_nome}`}
                      /* Revogado fica lavado de vermelho: o motivo de o link
                         não abrir precisa ser visível antes de alguém copiá-lo
                         e mandar para o cliente. */
                      destaque={l.ativo ? undefined : "danger"}
                      /*
                       * Três ações, e não um menu de três pontinhos.
                       *
                       * Um menu esconde as ações atrás de um clique e de uma
                       * leitura; com três itens custa mais do que economiza.
                       * Revogar só aparece no que está ativo — botão que não
                       * faz nada ensina a não clicar nos que fazem.
                       */
                      acoes={
                        <>
                          <ListaAcao
                            icon={copiado === l.token ? <Check size={14} /> : <Copy size={14} />}
                            label={copiado === l.token ? "Copiado" : "Copiar link"}
                            tom={copiado === l.token ? "sucesso" : "neutro"}
                            onClick={() => copiar(l.token)}
                          />

                          {l.ativo && (
                            <ListaAcao icon={<Trash2 size={14} />} label="Revogar" onClick={() => revogar(l)} />
                          )}

                          <ListaAcao
                            icon={<ExternalLink size={14} />}
                            label="Abrir página do cliente"
                            onClick={() => abrir(l.token)}
                          />
                        </>
                      }
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent/25 bg-gradient-to-br from-accent/25 to-accent-soft/10 text-[11px] text-accent-soft">
                          {getInitials(l.cliente_nome)}
                        </div>

                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-[13px] text-ink">{l.cliente_nome}</span>
                          <span className="truncate text-[11px] text-faint">
                            {l.visto_em ? `visto em ${dataBr(l.visto_em)}` : `emitido em ${dataBr(l.criado_em)}`}
                          </span>
                        </div>
                      </div>

                      <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-mist">
                        <Table2 size={12} className="shrink-0 text-muted" />
                        <span className="truncate">{l.planilha_nome}</span>
                      </span>

                      {/* Aberturas é o único sinal de que o link chegou ao
                          cliente — zero é notícia, não é célula vazia. */}
                      <span className="flex items-center justify-end gap-1.5 text-[12px] tabular-nums text-mist">
                        {l.visitas > 0 ? (
                          <>
                            <Eye size={12} className="shrink-0 text-muted" />
                            {formatNumber(l.visitas)}
                          </>
                        ) : (
                          <span className="text-faint">nunca</span>
                        )}
                      </span>

                      <span className="flex items-center justify-end text-[12px] tabular-nums text-mist">
                        {l.expira_em ? dataBr(l.expira_em) : <span className="text-faint">sem prazo</span>}
                      </span>

                      <span className="flex justify-end">
                        <Selo tom={l.ativo ? "sucesso" : "perigo"}>{l.ativo ? "Ativo" : "Revogado"}</Selo>
                      </span>

                      {/* Célula vazia: reserva a largura das ações, que são
                          desenhadas sobrepostas pela `ListaLinha`. */}
                      <span aria-hidden />
                    </ListaLinha>
                  ))}

                  <ListaFantasmas quantidade={vazias} altura={ROW_HEIGHT} />
                </>
              )}
            </div>
          </div>
        </div>

        <TabelaPaginacao
          pagina={paginaAtual}
          totalPaginas={totalPaginas}
          onPagina={setPagina}
          resumo={`${formatNumber(filtrados.length)} ${filtrados.length === 1 ? "cliente" : "clientes"}`}
        />
      </div>

      {/* A página do cliente é da EMPRESA, não do Flow: logo, cor, fundo e
          WhatsApp saem daqui. A marca vive no servidor porque quem abre o link
          é outro navegador — o tema do sistema, que mora no `localStorage`, não
          chega até lá. */}
      <Modal
        open={aparencia}
        onClose={() => setAparencia(false)}
        title="Aparência da página do cliente"
        subtitle="Vale para todos os links de acompanhamento"
        size="lg"
      >
        {marca && <Personalizacao marca={marca} onMudar={setMarca} onSalvar={salvarMarca} />}
      </Modal>
    </PageScreen>
  );
};

export default ProducoesPage;
