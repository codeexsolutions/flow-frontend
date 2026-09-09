import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ClipboardList, Loader2, Save, Search, Table2 } from "lucide-react";

import ProducaoService, { type ItemProducao, type ModeloOsDisponivel } from "@/features/producao/services/producao.service";
import useSincronizacao from "@/shared/realtime/useSincronizacao";
import { PageScreen } from "@/shared/ui/PageShell";
import { BarraFiltros, ListaCabecalho, ListaLinha, TabelaVazia } from "@/shared/ui/DataTable";
import { Selo } from "@/shared/ui/StatusBadge";
import { SkeletonListaPainel } from "@/shared/ui/skeleton";
import { formatDateShort } from "@/shared/utils/date";
import Select from "@/shared/ui/Select";
import BotaoVerDocumento from "@/shared/ui/BotaoVerDocumento";
import { gerarBlobNota } from "@/shared/ui/DownloadButton";
import { abrirDocumento } from "@/shared/ui/downloadNota";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import useEnterprise from "@/features/empresa/store/enterprise.store";
import AbasProducao from "@/features/producao/components/AbasProducao";
import { modeloOS } from "@/features/producao/modelos";

/**
 * ORDEM DE SERVIÇO — o que já virou trabalho, e o papel de cada uma.
 *
 * ---------------------------------------------------------------------------
 * A lista existe para o DOCUMENTO
 * ---------------------------------------------------------------------------
 * O quadro (Kanban) já responde "onde está cada uma?" melhor do que uma tabela
 * responderia. O que ele não faz é imprimir: e é a OS impressa que anda junto
 * com a peça pela oficina, volta rabiscada com o ajuste que o cliente pediu e
 * recebe a assinatura de quem retirou.
 *
 * Por isso esta tela é uma lista magra com uma ação só — abrir a OS. As
 * colunas são as que ajudam a ACHAR a ordem (número, cliente, etapa, prazo),
 * não as que descrevem o trabalho: essas estão no documento.
 *
 * ---------------------------------------------------------------------------
 * Um nó escondido, trocado no clique
 * ---------------------------------------------------------------------------
 * Mesmo caminho da nota e do orçamento: existe UM `OrdemServico` fora da tela,
 * com largura fixa de 900px, e o conteúdo dele é trocado para a ordem
 * escolhida antes de fotografar. N nós escondidos numa lista de cem ordens
 * seriam cem documentos renderizados para usar um.
 */

const COLS = "grid-cols-[minmax(170px,1.6fr)_minmax(120px,150px)_minmax(150px,180px)_104px_88px]";
/* "Aberta em" saiu para o MODELO entrar: a data de abertura é apoio (já
   aparece embaixo do cliente em outras telas), e o modelo é decisão — é o que
   define o papel que sai da impressora. */
const ROTULOS = ["Ordem", "Etapa", "Modelo", "Prazo", "Ações"];
const ALTURA_LINHA = 60;

type Filtro = "abertas" | "concluidas" | "todas";

const FILTROS: { valor: Filtro; label: string }[] = [
  /* "Abertas" é o padrão porque é a pergunta do dia: o que ainda está na
     bancada. A concluída não some da base — some da tela, que é diferente. */
  { valor: "abertas", label: "Em aberto" },
  { valor: "concluidas", label: "Concluídas" },
  { valor: "todas", label: "Todas" },
];

const OrdensServicoPage = () => {
  const alert = useAlert();
  const empresa = useEnterprise((s) => s.enterprise);

  const [ordens, setOrdens] = useState<ItemProducao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("abertas");
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [modelosOs, setModelosOs] = useState<ModeloOsDisponivel[]>([]);
  const [trocando, setTrocando] = useState<string | null>(null);

  /**
   * A ordem ABERTA para preencher, e o rascunho dela.
   *
   * A ficha não é um modal: ela é uma folha de A4 inteira, com grades e
   * observações, e uma janela flutuante do tamanho dela cobriria a tela toda
   * de qualquer jeito — com a moldura por cima, atrapalhando. Então a aba
   * TROCA de conteúdo: a lista sai, a ficha entra, e o "voltar" a devolve.
   *
   * O rascunho vive aqui e não dentro do componente porque é ele que o botão
   * Salvar manda para o servidor — e é ele que diz se há mudança pendente.
   */
  const [preenchendo, setPreenchendo] = useState<ItemProducao | null>(null);
  const [rascunho, setRascunho] = useState<Record<string, unknown>>({});
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const carregar = async () => {
    try {
      setOrdens(await ProducaoService.itens({ incluirConcluidos: true }));
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível carregar as ordens."));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    void carregar();

    /* Os modelos que o painel liberou para esta empresa. Falhar aqui não
       derruba a tela: some a coluna de escolha, e toda ordem sai no modelo da
       empresa — que é o comportamento de antes desta coluna existir. */
    ProducaoService.modelosDeOs()
      .then(setModelosOs)
      .catch(() => setModelosOs([]));
    // Só na montagem.
  }, []);

  useSincronizacao(["producao"], () => void carregar());

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return ordens
      .filter((o) => {
        if (filtro === "abertas" && o.concluido_em) return false;
        if (filtro === "concluidas" && !o.concluido_em) return false;

        if (!termo) return true;

        return (
          (o.cliente_nome ?? "").toLowerCase().includes(termo) ||
          (o.titulo ?? "").toLowerCase().includes(termo) ||
          String(o.codigo).includes(termo)
        );
      })
      .sort((a, b) => b.codigo - a.codigo);
  }, [ordens, busca, filtro]);

  /** Quantas ainda estão na bancada — o apoio do cabeçalho. */
  const abertasTotal = useMemo(() => ordens.filter((o) => !o.concluido_em).length, [ordens]);

  /* O nó que vira documento — um só, trocado antes de cada foto. */
  const refDoc = useRef<HTMLDivElement>(null);
  const [ordemAlvo, setOrdemAlvo] = useState<ItemProducao | null>(null);

  /*
   * QUAL papel sai: o modelo escolhido NA PRÓPRIA ORDEM.
   *
   * Não há mais um modelo "da empresa" por trás. Existiu, em Configurações ›
   * Produção, e saiu: uma escolha global obrigava a trocar a configuração
   * inteira — e a lembrar de destrocar depois — para imprimir uma OS diferente
   * no meio de um lote. Com a escolha na ordem, cada papel é decidido onde a
   * decisão acontece, e a configuração deixou de ser um estado escondido que
   * mudava o resultado de todas as outras.
   *
   * Sem escolha (ou com uma chave que esta versão não conhece), cai no
   * documento simples — ver `modeloOS`.
   */
  const modeloDaOrdem = (o: ItemProducao) => modeloOS(o.os_modelo);

  const trocarModelo = async (o: ItemProducao, chave: string) => {
    setTrocando(o.id);

    try {
      /* "PADRAO" na tela = string vazia no servidor = volta ao documento
         simples. Ver `definirModeloOs`. */
      await ProducaoService.definirModeloOs(o.id, chave === "PADRAO" ? "" : chave);

      /* Otimista: a lista inteira não precisa ser relida para uma célula. O
         `useSincronizacao` corrige se alguém mexer na mesma ordem por outro
         caminho. */
      setOrdens((lista) => lista.map((x) => (x.id === o.id ? { ...x, os_modelo: chave === "PADRAO" ? null : chave } : x)));
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível trocar o modelo."));
    } finally {
      setTrocando(null);
    }
  };

  /** Abre a ficha da ordem para preencher, com o que já foi salvo nela. */
  const preencher = (o: ItemProducao) => {
    const modelo = modeloDaOrdem(o);

    setPreenchendo(o);
    /* Sem nada salvo, começa da ficha vazia do modelo — é ela que traz a grade
       de tamanhos montada, em vez de um objeto sem chave nenhuma. */
    setRascunho((o.os_dados as Record<string, unknown>) ?? modelo.vazio?.() ?? {});
    setSalvo(false);
  };

  const salvarFicha = async () => {
    if (!preenchendo) return;

    setSalvando(true);

    try {
      await ProducaoService.salvarDadosOs(preenchendo.id, rascunho);

      /* A lista guarda o que foi salvo: sem isto, voltar e abrir de novo
         mostraria a ficha como estava antes de preencher. */
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

  const abrirOS = async (o: ItemProducao) => {
    setAbrindo(o.id);
    setOrdemAlvo(o);

    try {
      /* Espera o nó escondido render com a ordem certa antes de fotografar —
         sem isso o arquivo sai da ordem anterior, ou em branco. */
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

      const blob = await gerarBlobNota(refDoc);

      await abrirDocumento(blob, `os-${o.codigo}`, empresa?.nomeFantasia ?? "ordem-de-servico");
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível abrir a ordem."));
    } finally {
      setAbrindo(null);
    }
  };

  return (
    /* O cabeçalho da PÁGINA é o mesmo nas três abas, de propósito: trocar de
       aba troca a lista, não a seção em que a pessoa está. Ver o Kanban. */
    <PageScreen icon={<Table2 className="h-5 w-5" />} title="Produção" subtitle="As produções que a sua operação usa">
      {preenchendo ? (
        /* ─────────────── A FICHA, no lugar da lista ─────────────── */
        <div className="card glass-sheen flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg sm:flex-1">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-fg/[0.06] px-4 py-3.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                onClick={() => setPreenchendo(null)}
                aria-label="Voltar para a lista"
                className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-fg/[0.08] text-mist transition-colors hover:border-accent/40 hover:text-accent-soft"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>

              <div className="min-w-0">
                <h2 className="truncate text-[13px] text-ink">OS #{preenchendo.codigo} · {preenchendo.cliente_nome || "Sem cliente"}</h2>
                <p className="truncate text-[11px] text-faint">{modeloDaOrdem(preenchendo).nome}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => void salvarFicha()}
                disabled={salvando}
                className="focus-ring flex h-[38px] items-center gap-1.5 rounded-xl bg-gradient-to-br from-accent-soft to-accent px-3.5 text-[12.5px] text-white shadow-glow transition-all hover:brightness-110 disabled:opacity-50"
              >
                {salvando ? <Loader2 size={15} className="animate-spin" /> : salvo ? <Check size={15} /> : <Save size={15} />}
                {salvo ? "Salvo" : "Salvar ficha"}
              </button>

              {/* Imprimir sai do que está GRAVADO, não do rascunho: o papel que
                  vai para a bancada tem de ser o mesmo que o sistema guarda —
                  senão a folha impressa e a tela contam histórias diferentes na
                  primeira vez que alguém esquecer de salvar. */}
              <BotaoVerDocumento
                variante="linha"
                titulo="Ver ou imprimir a ordem de serviço"
                documento="ordem"
                ocupado={abrindo === preenchendo.id}
                onAbrir={() => void abrirOS(preenchendo)}
              />
            </div>
          </div>

          {/* A folha rola dentro do cartão. Fundo neutro atrás dela para a
              página branca não colar nas bordas do tema escuro. */}
          <div className="min-h-0 flex-1 overflow-auto bg-fg/[0.03] p-4">
            {(() => {
              const E = modeloDaOrdem(preenchendo).Edicao;
              return E ? <E ordem={preenchendo} dados={rascunho} onChange={setRascunho} /> : null;
            })()}
          </div>
        </div>
      ) : (
      <div className="card glass-sheen flex min-h-[460px] min-w-0 flex-col overflow-hidden rounded-lg sm:min-h-[260px] sm:flex-1">
        {/* O cabeçalho do CARTÃO — a mesma peça do Kanban e da aba Pedidos. */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-fg/[0.06] px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/[0.15]">
              <ClipboardList className="h-4 w-4 text-accent-soft" />
            </div>
            <div>
              <h2 className="text-[13px] text-ink">Ordens de serviço</h2>
              <p className="text-[11px] text-faint">
                {filtradas.length} {filtradas.length === 1 ? "ordem" : "ordens"}
                {abertasTotal > 0 && ` · ${abertasTotal} em aberto`}
              </p>
            </div>
          </div>
        </div>

        <BarraFiltros navegacao={<AbasProducao />}>
          <div className="glass-subtle flex min-w-[200px] flex-1 items-center gap-2 rounded-xl px-3">
            <Search className="h-4 w-4 shrink-0 text-muted" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por cliente, item ou número da OS…"
              className="w-full flex-1 bg-transparent py-2 text-[13px] text-ink outline-none placeholder:text-faint"
            />
          </div>

          <Select
            valor={filtro}
            aria-label="Situação da ordem"
            onChange={(v) => setFiltro(v as Filtro)}
            icone={<ClipboardList size={14} />}
            opcoes={FILTROS.map((f) => ({
              valor: f.valor,
              label: f.label,
              contagem:
                f.valor === "todas"
                  ? ordens.length
                  : ordens.filter((o) => Boolean(o.concluido_em) === (f.valor === "concluidas")).length,
            }))}
          />
        </BarraFiltros>

        {carregando ? (
          <SkeletonListaPainel linhas={8} />
        ) : filtradas.length === 0 ? (
          <TabelaVazia
            icon={<ClipboardList size={20} />}
            title={busca.trim() || filtro !== "abertas" ? "Nenhuma ordem encontrada" : "Nenhuma ordem em aberto"}
            description={
              busca.trim() || filtro !== "abertas"
                ? "Tente outra busca ou outro filtro."
                : "As ordens nascem na aba Pedidos: escolha a venda e clique em gerar."
            }
          />
        ) : (
          <>
            <ListaCabecalho cols={COLS}>
              {ROTULOS.map((r, i) => (
                <span key={r} className={i >= 2 ? "text-right" : undefined}>{r}</span>
              ))}
            </ListaCabecalho>

            {filtradas.map((o) => (
              <ListaLinha
                key={o.id}
                cols={COLS}
                rotulos={ROTULOS}
                altura={ALTURA_LINHA}
                /* Clicar na ordem ABRE A FICHA para preencher — é o gesto do
                   dia na bancada. Imprimir continua na ação da direita, para
                   quem já preencheu. Modelo sem ficha (o simples) não tem o
                   que abrir: a linha fica sem clique. */
                ariaLabel={modeloDaOrdem(o).Edicao ? `Preencher a OS ${o.codigo}` : undefined}
                onClick={modeloDaOrdem(o).Edicao ? () => preencher(o) : undefined}
                acoes={
                  <BotaoVerDocumento
                    variante="linha"
                    titulo="Ver ou imprimir a ordem de serviço"
                    documento="ordem"
                    ocupado={abrindo === o.id || trocando === o.id}
                    onAbrir={() => void abrirOS(o)}
                  />
                }
              >
                <span className="flex min-w-0 items-center gap-2.5 pr-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-accent/25 bg-accent/[0.12] text-[10.5px] tabular-nums text-accent-soft">
                    #{o.codigo}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] text-ink">{o.cliente_nome || "Sem cliente"}</span>
                    <span className="block truncate text-[10.5px] text-faint">{o.titulo}</span>
                  </span>
                </span>

                <span className="flex">
                  <Selo tom={o.concluido_em ? "sucesso" : "info"}>{o.concluido_em ? "Concluída" : o.etapa_nome ?? "Sem etapa"}</Selo>
                </span>

                {/* O modelo, escolhido NA ORDEM — e o seletor fica de pé mesmo
                    com uma opção só. Escondê-lo enquanto o catálogo está vazio
                    faria o recurso desaparecer justamente para quem ainda vai
                    atrás dele; é a mesma lição do campo em Configurações. */}
                <span className="flex justify-end">
                  <Select
                    valor={o.os_modelo ?? "PADRAO"}
                    aria-label={`Modelo da OS ${o.codigo}`}
                    onChange={(v) => void trocarModelo(o, v)}
                    opcoes={[
                      { valor: "PADRAO", label: "Simples" },
                      ...modelosOs.map((m) => ({ valor: m.chave, label: m.nome })),
                    ]}
                  />
                </span>

                <span className="text-right text-[12px] tabular-nums text-mist">{o.prazo ? formatDateShort(o.prazo) : "—"}</span>

                <span />
              </ListaLinha>
            ))}
          </>
        )}
      </div>
      )}

      {/* O documento fora da tela: largura fixa, nunca rola, sempre inteiro — é
          o que faz o arquivo sair igual em qualquer aparelho. `html-to-image`
          precisa do nó renderizado de verdade, então nada de `display:none`.

          `w-fit` porque cada modelo manda na própria largura: o padrão usa
          900px e a ficha técnica é uma folha A4 de 210mm. Uma largura fixa
          aqui cortaria a folha ou deixaria uma tarja branca ao lado dela. */}
      <div className="fixed -left-[9999px] top-0 w-fit" aria-hidden>
        {ordemAlvo && (() => {
          const M = modeloDaOrdem(ordemAlvo).Documento;
          return <M ordem={ordemAlvo} refDoc={refDoc} />;
        })()}
      </div>
    </PageScreen>
  );
};

export default OrdensServicoPage;
