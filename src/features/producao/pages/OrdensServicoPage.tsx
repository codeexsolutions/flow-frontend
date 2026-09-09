import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ClipboardList, ExternalLink, Loader2, Save, Search, Table2 } from "lucide-react";

import ProducaoService, { type ItemProducao, type ModeloOsDisponivel } from "@/features/producao/services/producao.service";
import PlanilhaService, { type Modelo } from "@/features/planilhas/services/planilha.service";
import useSincronizacao from "@/shared/realtime/useSincronizacao";
import { useNavigate } from "react-router-dom";

import { PageScreen } from "@/shared/ui/PageShell";
import { Modal } from "@/shared/ui/Modal";
import { BarraFiltros, ListaCabecalho, ListaLinha, TabelaVazia } from "@/shared/ui/DataTable";
import { SkeletonListaPainel } from "@/shared/ui/skeleton";
import { MESES_EXTENSO, isSameDay, toDate } from "@/shared/utils/date";
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

const COLS = "grid-cols-[minmax(190px,1.8fr)_minmax(170px,230px)_88px]";
/*
 * ETAPA e PRAZO saíram da ordem de serviço.
 *
 * Não porque não importem — porque não é aqui que elas vivem. A produção
 * acontece na PLANILHA: é lá que estão as colunas que a empresa montou, o
 * histórico e o link que o cliente acompanha. Enquanto as duas telas
 * respondiam "em que etapa está?", mover numa não mexia na outra: a mesma peça
 * tinha dois estados e nenhum era confiável.
 *
 * Então a ordem de serviço ficou com o que só ela faz — o DOCUMENTO — e a
 * coluna que sobrou é a costura entre as duas: para qual planilha este cliente
 * foi. O MODELO, por sua vez, mora dentro da ordem aberta: é decisão de quem
 * está com a peça na mão, não de quem varre a lista.
 */
const ROTULOS = ["Ordem", "Produção", "Ações"];
const ALTURA_LINHA = 60;

/**
 * O botão-pastilha da barra da ordem — o mesmo para MODELO e para ETAPA.
 *
 * Os dois respondem "qual está valendo?" e se escolhem do mesmo jeito, então
 * têm de parecer a mesma peça. Dois desenhos diferentes para o mesmo gesto
 * fazem a barra parecer montada por acaso.
 */
const CHIP = (aceso: boolean) =>
  aceso
    ? "focus-ring flex h-[30px] shrink-0 cursor-default items-center rounded-lg border border-accent/40 bg-accent/[0.15] px-2.5 text-[11.5px] text-accent-soft"
    : "focus-ring flex h-[30px] shrink-0 cursor-pointer items-center rounded-lg border border-fg/[0.08] px-2.5 text-[11.5px] text-mist transition-colors hover:border-accent/40 hover:text-accent-soft disabled:cursor-not-allowed disabled:opacity-50";

type Filtro = "abertas" | "concluidas" | "todas";

/**
 * "Hoje", "Ontem" ou "12 de setembro" — o cabeçalho de cada bloco.
 *
 * Data por extenso e não `12/09`: o bloco é lido uma vez, no alto de um grupo,
 * e ali cabe a forma que se fala. Nas LINHAS a data continua curta, porque lá
 * ela se repete dezenas de vezes.
 */
const rotuloDoDia = (iso: string): string => {
  const d = toDate(iso);

  if (!d) return "Sem data";

  if (isSameDay(d)) return "Hoje";

  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);

  if (isSameDay(d, ontem)) return "Ontem";

  /* O ano só entra quando não é o corrente: numa lista do mês passado ele é
     ruído, e numa de dois anos atrás é a informação que importa. */
  const ano = d.getFullYear() === new Date().getFullYear() ? "" : ` de ${d.getFullYear()}`;

  return `${d.getDate()} de ${MESES_EXTENSO[d.getMonth()].toLowerCase()}${ano}`;
};

const FILTROS: { valor: Filtro; label: string }[] = [
  /* "Abertas" é o padrão porque é a pergunta do dia: o que ainda está na
     bancada. A concluída não some da base — some da tela, que é diferente. */
  { valor: "abertas", label: "Em aberto" },
  /* "Finalizadas", a mesma palavra do selo da linha e do botão que encerra a
     ordem. Chamá-las de "concluídas" aqui e de "finalizadas" ali obriga quem
     lê a supor que são a mesma coisa. */
  { valor: "concluidas", label: "Finalizadas" },
  { valor: "todas", label: "Todas" },
];

const OrdensServicoPage = () => {
  const alert = useAlert();
  const navigate = useNavigate();
  const empresa = useEnterprise((s) => s.enterprise);

  const [ordens, setOrdens] = useState<ItemProducao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("abertas");
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [modelosOs, setModelosOs] = useState<ModeloOsDisponivel[]>([]);
  const [trocando, setTrocando] = useState<string | null>(null);

  /**
   * As planilhas de produção da empresa — para onde a ordem pode ir.
   *
   * É a única coisa que a lista de ordens pergunta além do documento: este
   * cliente entra em qual produção? Escolhida a planilha, a linha nasce lá com
   * o cliente e o que produzir, e é lá que ela anda de etapa.
   */
  const [planilhas, setPlanilhas] = useState<Modelo[]>([]);
  const [mandando, setMandando] = useState<string | null>(null);

  /**
   * A ordem ABERTA para preencher, e o rascunho dela.
   *
   * A ficha abre num MODAL, sobre a lista.
   *
   * Ela já foi uma troca de conteúdo — a lista saía, a ficha entrava — e o
   * problema era perder o lugar: quem preenche uma ordem preenche a seguinte,
   * e voltar para o topo da lista a cada folha obrigava a procurar de novo
   * onde estava. Sobre a lista, fechar devolve exatamente a linha de onde se
   * saiu, com a busca e o filtro como estavam.
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

    /* Falhar aqui não derruba a tela: some a escolha de produção, e a lista
       continua entregando o documento, que é o que ela existe para fazer. */
    PlanilhaService.modelos()
      .then(setPlanilhas)
      .catch(() => setPlanilhas([]));
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

  /**
   * As ordens em BLOCOS DE DIA, na ordem em que se procura por elas.
   *
   * Uma lista corrida de ordens é uma lista de números: "a OS da terça" só se
   * acha contando linhas para trás. Com o dia escrito no alto de cada bloco, a
   * pergunta que a bancada faz de verdade — "o que entrou hoje?", "o que ficou
   * de ontem?" — se responde sem ler nenhuma linha.
   *
   * Agrupa pela ABERTURA, não pelo prazo: é a data que não muda e é a que a
   * pessoa lembra ("essa entrou na segunda"). Prazo é destino, e destino se vê
   * na coluna dele.
   */
  const grupos = useMemo(() => {
    const mapa = new Map<string, { rotulo: string; ordens: ItemProducao[] }>();

    for (const o of filtradas) {
      /* A chave é o dia em ISO — ordenável como texto, sem `Date` no meio. */
      const dia = String(o.criado_em ?? "").slice(0, 10) || "sem-data";

      if (!mapa.has(dia)) mapa.set(dia, { rotulo: dia === "sem-data" ? "Sem data" : rotuloDoDia(o.criado_em), ordens: [] });

      mapa.get(dia)!.ordens.push(o);
    }

    /* Mais recente primeiro, como a lista já vinha: a ordem de hoje é a que se
       procura, e ela não pode estar no fim da rolagem. */
    return [...mapa.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([dia, g]) => ({ dia, ...g }));
  }, [filtradas]);

  /** Quantas ainda estão na bancada — o apoio do cabeçalho. */
  const abertasTotal = useMemo(() => ordens.filter((o) => !o.concluido_em).length, [ordens]);

  /* O nó que vira documento — um só, trocado antes de cada foto. */
  const refDoc = useRef<HTMLDivElement>(null);
  const [ordemAlvo, setOrdemAlvo] = useState<ItemProducao | null>(null);

  /*
   * QUAL papel sai: o modelo da PRÓPRIA ORDEM, e só dela.
   *
   * A empresa escolhe um padrão em Configurações › Produção, mas ele é
   * carimbado na ordem quando ela NASCE — não lido aqui a cada abertura. A
   * diferença aparece no dia em que alguém troca o padrão: as ordens que já
   * estão na bancada continuam saindo no papel com que foram impressas, em vez
   * de mudarem de formato por causa de uma configuração mexida no meio do
   * expediente.
   *
   * A rede é para as ordens ANTIGAS, abertas antes de o modelo existir: elas
   * têm `os_modelo` nulo, e cair no padrão da empresa é mais perto do que a
   * oficina espera do que cair no documento simples. Chave que esta versão não
   * conhece também cai no simples — ver `modeloOS`.
   */
  const modeloDaOrdem = (o: ItemProducao) => modeloOS(o.os_modelo ?? empresa?.osModelo);

  const trocarModelo = async (o: ItemProducao, chave: string) => {
    setTrocando(o.id);

    try {
      /* "PADRAO" na tela = string vazia no servidor = volta ao documento
         simples. Ver `definirModeloOs`. */
      await ProducaoService.definirModeloOs(o.id, chave === "PADRAO" ? "" : chave);

      /* Otimista: a lista inteira não precisa ser relida para uma célula. O
         `useSincronizacao` corrige se alguém mexer na mesma ordem por outro
         caminho. */
      const atualizada = { ...o, os_modelo: chave === "PADRAO" ? null : chave };

      setOrdens((lista) => lista.map((x) => (x.id === o.id ? atualizada : x)));

      /* Trocar o modelo com a ordem ABERTA troca a folha na hora — e o
         rascunho vai junto: a ficha da chave nova não entende os campos da
         antiga, e mostrá-la com o que sobrou seria uma folha meio preenchida
         com dados de outro formulário. O que já estava GRAVADO continua no
         servidor; só o rascunho da tela é reposto. */
      setPreenchendo((atual) => {
        if (!atual || atual.id !== o.id) return atual;

        const modelo = modeloOS(atualizada.os_modelo);

        setRascunho((atualizada.os_dados as Record<string, unknown>) ?? modelo.vazio?.() ?? {});
        setSalvo(false);

        return atualizada;
      });
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível trocar o modelo."));
    } finally {
      setTrocando(null);
    }
  };

  /**
   * Manda a ordem para a planilha escolhida.
   *
   * Uma vez só por ordem: com o vínculo gravado, a coluna deixa de oferecer a
   * escolha e passa a dizer onde a ordem está. Mandar a mesma peça para duas
   * planilhas é produzir em dobro — e é o tipo de engano que só aparece na
   * entrega.
   *
   * Relê a lista depois: quem responde de qual linha a ordem virou é o
   * servidor, e é ele que sabe se ela já estava lá.
   */
  const mandarParaPlanilha = async (o: ItemProducao, modeloId: string) => {
    setMandando(o.id);

    try {
      const mensagem = await ProducaoService.mandarParaPlanilha(o.id, modeloId);

      await carregar();

      alert.success("Pronto!", mensagem || "A ordem foi para a planilha.");
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível mandar a ordem para a planilha."));
    } finally {
      setMandando(null);
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

            {grupos.map((g) => (
              <div key={g.dia}>
                {/* O cabeçalho do dia — colado no topo enquanto o bloco rola,
                    senão ele sobe junto com as linhas e, no meio de um dia
                    cheio, não há mais como saber que dia se está lendo. */}
                <div className="sticky top-0 z-[1] flex items-center gap-2 border-b border-fg/[0.05] bg-surface/95 px-4 py-1.5 backdrop-blur">
                  <span className="text-[11px] uppercase tracking-[0.7px] text-mist">{g.rotulo}</span>
                  <span className="text-[10.5px] tabular-nums text-faint">
                    {g.ordens.length} {g.ordens.length === 1 ? "ordem" : "ordens"}
                  </span>
                </div>

                {g.ordens.map((o) => (
                  <ListaLinha
                    key={o.id}
                    cols={COLS}
                    rotulos={ROTULOS}
                    altura={ALTURA_LINHA}
                    /* Clicar na ordem ABRE A ORDEM — é o gesto do dia na
                       bancada. Vale para todo modelo: o que tem ficha abre
                       para preencher, o simples abre para conferir. A linha
                       que não responde ao clique porque o modelo "não tem o
                       que abrir" é indistinguível de uma tela quebrada para
                       quem clicou. */
                    ariaLabel={`Abrir a OS ${o.codigo}`}
                    onClick={() => preencher(o)}
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
                    {/* O número da OS é PREFIXO do cliente, não um selo à
                        parte. Ele morava num quadrado de 32px com moldura e
                        fundo, e aquilo pesava como se fosse a informação
                        principal da linha — quando o que se procura é o nome
                        de quem encomendou. Em texto tabular ao lado do nome,
                        continua legível e devolve a largura para o que
                        importa. */}
                    <span className="flex min-w-0 flex-col justify-center pr-3">
                      <span className="flex min-w-0 items-baseline gap-1.5">
                        <span className="shrink-0 text-[11px] tabular-nums text-faint">#{o.codigo}</span>
                        <span className="min-w-0 truncate text-[12.5px] text-ink">{o.cliente_nome || "Sem cliente"}</span>
                      </span>
                      <span className="block truncate text-[10.5px] text-faint">{o.titulo}</span>
                    </span>

                    {/* PARA ONDE esta ordem foi produzir.
                        Já mandada, a célula vira informação (o nome da planilha
                        e o atalho para abri-la) em vez de continuar oferecendo
                        uma escolha que não se refaz. */}
                    <span className="flex min-w-0 justify-start" onClick={(ev) => ev.stopPropagation()}>
                      {o.planilha_registro_fk ? (
                        <button
                          type="button"
                          onClick={() => navigate("/producao/kanban")}
                          title="Abrir a produção"
                          className="focus-ring flex h-[30px] min-w-0 cursor-pointer items-center gap-1.5 rounded-lg border border-success/25 bg-success/[0.10] px-2.5 text-[11.5px] text-success transition-colors hover:border-success/50"
                        >
                          <span className="truncate">{o.planilha_nome ?? "Na produção"}</span>
                          <ExternalLink size={12} className="shrink-0" />
                        </button>
                      ) : mandando === o.id ? (
                        <span className="flex h-[30px] items-center gap-1.5 text-[11.5px] text-faint">
                          <Loader2 size={13} className="animate-spin text-accent" /> Mandando...
                        </span>
                      ) : planilhas.length === 0 ? (
                        <span className="text-[11.5px] text-faint">Sem planilha</span>
                      ) : (
                        <Select
                          valor=""
                          aria-label={`Mandar a OS ${o.codigo} para uma produção`}
                          placeholder="Escolher produção"
                          onChange={(v) => v && void mandarParaPlanilha(o, v)}
                          opcoes={planilhas.map((m) => ({ valor: m.id, label: m.nome }))}
                        />
                      )}
                    </span>

                    <span />
                  </ListaLinha>
                ))}
              </div>
            ))}
          </>
        )}
      </div>

      <Modal
        open={!!preenchendo}
        onClose={() => setPreenchendo(null)}
        title={preenchendo ? `OS #${preenchendo.codigo} · ${preenchendo.cliente_nome || "Sem cliente"}` : ""}
        subtitle={preenchendo ? modeloDaOrdem(preenchendo).nome : undefined}
        size="full"
      >
        {preenchendo && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {/* ─────────────────── A BARRA DA ORDEM ───────────────────
                O que a ordem É (o modelo) e o que se faz com ela (salvar,
                imprimir), numa faixa só. Onde ela ESTÁ não se pergunta aqui: a
                produção anda na planilha, e a coluna Produção da lista é o
                caminho até ela.

                Eram três controles soltos de alturas diferentes — um seletor
                de 38px, um botão de 30 e um rótulo perdido no meio —,
                encostados na folha branca sem nada que os agrupasse. Agora é
                um bloco com moldura e todo botão na mesma altura: a barra lê
                como cabeçalho da ordem, e não como sobra de interface em cima
                do documento.

                O MODELO virou fileira de botões, e não lista suspensa, pelo
                mesmo motivo das etapas: são dois ou três papéis, e qual está
                valendo se vê de relance. Numa suspensa isso fica escondido
                atrás de um clique — e o modelo é a primeira coisa que quem
                abre a ordem precisa conferir. */}
            <div className="shrink-0 overflow-hidden rounded-xl border border-fg/[0.07] bg-fg/[0.02]">
              <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <span className="text-[10px] uppercase tracking-[0.7px] text-faint">Modelo</span>

                {[
                  { chave: "PADRAO", nome: "Simples" },
                  ...modelosOs.map((m) => ({ chave: m.chave, nome: m.nome })),
                ].map((m) => {
                  const atual = (preenchendo.os_modelo ?? empresa?.osModelo ?? "PADRAO") === m.chave;

                  return (
                    <button
                      key={m.chave}
                      type="button"
                      disabled={trocando === preenchendo.id || atual}
                      onClick={() => void trocarModelo(preenchendo, m.chave)}
                      title={atual ? "É o modelo desta ordem" : `Usar ${m.nome}`}
                      className={CHIP(atual)}
                    >
                      {m.nome}
                    </button>
                  );
                })}

                {trocando === preenchendo.id && <Loader2 size={14} className="animate-spin text-accent" />}

                <span className="ml-auto flex items-center gap-2">
                  {/* Só há o que salvar onde há o que preencher: no documento
                      simples o botão prometeria gravar um formulário que não
                      existe. */}
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
                    onAbrir={() => void abrirOS(preenchendo)}
                  />
                </span>
              </div>
            </div>

            {/* A folha rola dentro do modal. Fundo neutro atrás dela para a
                página branca não colar nas bordas do tema escuro. */}
            <div className="min-h-0 flex-1 overflow-auto rounded-xl bg-fg/[0.03] p-4">
              {(() => {
                const modelo = modeloDaOrdem(preenchendo);

                if (modelo.Edicao) return <modelo.Edicao ordem={preenchendo} dados={rascunho} onChange={setRascunho} />;

                /* Modelo sem ficha — o documento simples. Não há o que
                   preencher, então o modal mostra o papel como ele vai sair,
                   que é a outra pergunta de quem clicou na linha. Trocar o
                   modelo na barra acima é o que faz a ficha aparecer aqui. */
                return (
                  <div className="mx-auto w-full max-w-[900px] overflow-hidden rounded-xl">
                    <modelo.Documento ordem={preenchendo} />
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </Modal>

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
