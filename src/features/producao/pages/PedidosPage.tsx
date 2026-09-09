import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ClipboardList, Factory, Receipt, Table2 } from "lucide-react";

import useVendaStore from "@/features/vendas/store/venda.store";
import ProducaoService, { type ItemProducao, type ModeloOsDisponivel } from "@/features/producao/services/producao.service";
import useSincronizacao from "@/shared/realtime/useSincronizacao";
import { PageScreen } from "@/shared/ui/PageShell";
import { BarraFiltros, ListaAcao, ListaCabecalho, ListaLinha, TabelaVazia } from "@/shared/ui/DataTable";
import { Search } from "lucide-react";
import { Selo } from "@/shared/ui/StatusBadge";
import { SkeletonListaPainel } from "@/shared/ui/skeleton";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDate, toDate } from "@/shared/utils/date";
import { getInitials } from "@/shared/utils/format";
import Select from "@/shared/ui/Select";
import { Modal } from "@/shared/ui/Modal";
import AbasProducao from "@/features/producao/components/AbasProducao";
import { estaCancelado, totalDoPedido, type PedidoClienteType } from "@/shared/domain/pedido";

/**
 * PEDIDOS — a porta de entrada da produção.
 *
 * ---------------------------------------------------------------------------
 * Toda venda aparece aqui. Todas.
 * ---------------------------------------------------------------------------
 * Não há filtro de "merece produção" nesta lista, e é deliberado: quem decide
 * o que vira trabalho é a pessoa que olha, e ela só pode decidir sobre o que
 * enxerga. Uma lista que já viesse peneirada esconderia justamente o caso que
 * motiva a tela — a venda de estoque que, daquela vez, deu trabalho (a estampa
 * pedida depois, o ajuste, a montagem).
 *
 * O automático continua existindo por baixo, e só para venda com item de
 * SERVIÇO: essa já chega aqui com a ordem gerada, e a linha mostra o número
 * dela em vez do botão. Ver `ProducaoAutomaticaService`.
 *
 * ---------------------------------------------------------------------------
 * Nada é copiado
 * ---------------------------------------------------------------------------
 * Esta tela não tem dados próprios. Ela é o cruzamento de duas listas que já
 * existem — as vendas (`venda.store`) e as ordens (`producao/itens`) —, casadas
 * pelo `pedido_fk` da ordem. É o que permite a mesma venda estar aqui, na aba
 * de OS e no quadro ao mesmo tempo, sem nenhuma cópia para sincronizar.
 */

const COLS = "grid-cols-[minmax(200px,2fr)_minmax(96px,120px)_minmax(120px,160px)_124px]";
/* Sem coluna de data: quem responde "de quando é" é a faixa do dia, e uma
   coluna repetindo isso em toda linha gastaria largura para dizer de novo o
   que a pessoa acabou de ler no topo do bloco. */
const ROTULOS = ["Cliente", "Total", "Produção", "Ações"];
const ALTURA_LINHA = 60;

type Situacao = "todos" | "sem-os" | "com-os";

const SITUACOES: { valor: Situacao; label: string }[] = [
  { valor: "todos", label: "Todos" },
  /* O primeiro filtro que se usa: "o que ainda não mandei para a oficina?" */
  { valor: "sem-os", label: "Sem ordem" },
  { valor: "com-os", label: "Com ordem" },
];

const PedidosPage = () => {
  const alert = useAlert();
  const { vendas, fetchVendas, loading } = useVendaStore();

  const [ordens, setOrdens] = useState<ItemProducao[]>([]);
  const [carregandoOrdens, setCarregandoOrdens] = useState(true);
  const [gerando, setGerando] = useState<string | null>(null);
  const [modelosOs, setModelosOs] = useState<ModeloOsDisponivel[]>([]);

  /**
   * A venda escolhida para virar OS — e o modelo escolhido para ela.
   *
   * Gerar deixou de ser um clique direto: o papel que sai é decisão de quem
   * gera, e ela precisa acontecer ANTES da ordem existir. Trocar depois é
   * possível (a coluna Modelo, na aba OS), mas exigir isso significaria que a
   * primeira impressão sai sempre errada.
   */
  const [aGerar, setAGerar] = useState<PedidoClienteType | null>(null);
  const [modeloEscolhido, setModeloEscolhido] = useState("PADRAO");
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<Situacao>("todos");

  const carregarOrdens = async () => {
    try {
      /* `incluirConcluidos` para a linha não perder a ordem que já foi
         entregue: a venda continua tendo tido uma, e oferecer "gerar" de novo
         criaria a segunda para o mesmo trabalho. */
      setOrdens(await ProducaoService.itens({ incluirConcluidos: true }));
    } catch {
      /* Sem as ordens a lista ainda serve: mostra as vendas e deixa gerar. O
         que se perde é saber quais já foram. */
      setOrdens([]);
    } finally {
      setCarregandoOrdens(false);
    }
  };

  useEffect(() => {
    void fetchVendas();
    void carregarOrdens();

    /* Os modelos que o painel liberou. Falhar aqui não derruba a tela: o
       seletor fica só com o documento simples. */
    ProducaoService.modelosDeOs()
      .then(setModelosOs)
      .catch(() => setModelosOs([]));
    // Só na montagem.
  }, []);

  /* O quadro da bancada e o balcão mexem nos mesmos dados: quem está com esta
     tela aberta vê a ordem nova sem recarregar. */
  useSincronizacao(["producao", "pedidos"], () => {
    void carregarOrdens();
    void fetchVendas(true);
  });

  /** A ordem de cada venda, pelo vínculo que a própria ordem guarda. */
  const ordemPorPedido = useMemo(() => {
    const mapa = new Map<string, ItemProducao>();

    for (const o of ordens) if (o.pedido_fk) mapa.set(String(o.pedido_fk), o);

    return mapa;
  }, [ordens]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return vendas
      /* Nota cancelada não é pedido: não há o que produzir para uma venda que
         não existe mais. */
      .filter((v) => !estaCancelado(v))
      .filter((v) => {
        const temOrdem = ordemPorPedido.has(String(v.pedido.pedidoId));

        if (situacao === "sem-os" && temOrdem) return false;
        if (situacao === "com-os" && !temOrdem) return false;

        if (!termo) return true;

        return (
          (v.nomeCliente ?? "").toLowerCase().includes(termo) ||
          String(v.pedido.pedidoId ?? "").toLowerCase().includes(termo)
        );
      })
      .sort((a, b) => +new Date(b.pedido.dataPedido) - +new Date(a.pedido.dataPedido));
  }, [vendas, ordemPorPedido, busca, situacao]);

  /**
   * As mesmas linhas, agrupadas pelo DIA em que a venda entrou.
   *
   * -------------------------------------------------------------------------
   * Por que a data vira faixa, e não uma coluna a mais
   * -------------------------------------------------------------------------
   * A coluna de data já existia e não respondia a pergunta que se faz aqui:
   * "quanto entrou ontem, e quanto disso já foi para a oficina?". Para saber
   * isso era preciso correr o olho pela coluna contando linha por linha — e a
   * conta que a pessoa faz de cabeça é sempre por dia.
   *
   * A faixa carrega as duas contagens porque uma sozinha não diz nada: seis
   * pedidos é bom ou ruim conforme quantos viraram ordem. É o "3 de 6" que
   * manda alguém abrir a lista.
   *
   * A ordem é do mais recente para o mais antigo, e a chave do agrupamento é o
   * dia no fuso de Brasília (via `toDate`) — não a string ISO, que jogaria a
   * venda das 22h para o dia seguinte.
   */
  const porDia = useMemo(() => {
    const mapa = new Map<string, { chave: string; rotulo: string; itens: PedidoClienteType[]; comOrdem: number }>();

    for (const v of filtradas) {
      const dia = toDate(v.pedido.dataPedido);

      if (!dia) continue;

      const chave = `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, "0")}-${String(dia.getDate()).padStart(2, "0")}`;
      const grupo = mapa.get(chave) ?? { chave, rotulo: formatDate(v.pedido.dataPedido), itens: [], comOrdem: 0 };

      grupo.itens.push(v);
      if (ordemPorPedido.has(String(v.pedido.pedidoId))) grupo.comOrdem += 1;

      mapa.set(chave, grupo);
    }

    /* `filtradas` já vem do mais novo para o mais antigo, então a ordem de
       inserção do Map é a que se quer — sem um segundo `sort` por data. */
    return Array.from(mapa.values());
  }, [filtradas, ordemPorPedido]);

  const gerarOrdem = async (v: PedidoClienteType, osModelo: string) => {
    const id = String(v.pedido.pedidoId);

    setGerando(id);
    setAGerar(null);

    try {
      const r = await ProducaoService.daVenda(id, osModelo === "PADRAO" ? "" : osModelo);

      if (r.criado) {
        alert.success("Ordem de serviço gerada!", `A venda de ${v.nomeCliente} entrou na primeira etapa do quadro.`);
        await carregarOrdens();
      } else {
        alert.info("Nada a fazer", r.mensagem);
      }
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível gerar a ordem."));
    } finally {
      setGerando(null);
    }
  };

  const carregando = loading || carregandoOrdens;

  /** Quantos dos pedidos visíveis já viraram ordem — o apoio do cabeçalho. */
  const comOrdemTotal = useMemo(
    () => filtradas.filter((v) => ordemPorPedido.has(String(v.pedido.pedidoId))).length,
    [filtradas, ordemPorPedido],
  );

  return (
    /* O cabeçalho da PÁGINA é o mesmo nas três abas, de propósito: trocar de
       aba troca a lista, não a seção em que a pessoa está. Ver o Kanban. */
    <PageScreen icon={<Table2 className="h-5 w-5" />} title="Produção" subtitle="As produções que a sua operação usa">
      {/* A mesma casca de lista de Clientes, Estoque e do Kanban. */}
      <div className="card glass-sheen flex min-h-[460px] min-w-0 flex-col overflow-hidden rounded-lg sm:min-h-[260px] sm:flex-1">
        {/* O cabeçalho do CARTÃO: diz que lista é esta e quantas linhas ela
            tem. É a mesma peça do Kanban — sem ela, as abas trocavam o
            conteúdo e a tela ficava sem dizer o que se está olhando. */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-fg/[0.06] px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/[0.15]">
              <Receipt className="h-4 w-4 text-accent-soft" />
            </div>
            <div>
              <h2 className="text-[13px] text-ink">Pedidos</h2>
              <p className="text-[11px] text-faint">
                {filtradas.length} {filtradas.length === 1 ? "pedido" : "pedidos"}
                {comOrdemTotal > 0 && ` · ${comOrdemTotal} na produção`}
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
              placeholder="Buscar por cliente ou número da nota…"
              className="w-full flex-1 bg-transparent py-2 text-[13px] text-ink outline-none placeholder:text-faint"
            />
          </div>

          <Select
            valor={situacao}
            aria-label="Situação na produção"
            onChange={(v) => setSituacao(v as Situacao)}
            icone={<Factory size={14} />}
            opcoes={SITUACOES.map((s) => ({
              valor: s.valor,
              label: s.label,
              contagem:
                s.valor === "todos"
                  ? undefined
                  : vendas.filter((v) => !estaCancelado(v) && ordemPorPedido.has(String(v.pedido.pedidoId)) === (s.valor === "com-os")).length,
            }))}
          />
        </BarraFiltros>

        {carregando ? (
          <SkeletonListaPainel linhas={8} />
        ) : filtradas.length === 0 ? (
          <TabelaVazia
            icon={<Receipt size={20} />}
            title={busca.trim() || situacao !== "todos" ? "Nenhum pedido encontrado" : "Nenhum pedido ainda"}
            description={
              busca.trim() || situacao !== "todos"
                ? "Tente outra busca ou outro filtro."
                : "Toda venda registrada no balcão aparece aqui, pronta para virar ordem de serviço."
            }
          />
        ) : (
          <>
            <ListaCabecalho cols={COLS}>
              {ROTULOS.map((r, i) => (
                <span key={r} className={i >= 1 ? "text-right" : undefined}>{r}</span>
              ))}
            </ListaCabecalho>

            {/* O corpo rola; a faixa de cada dia gruda no topo enquanto o
                bloco dele passa. Numa lista que atravessa semanas, saber de
                que dia é a linha que está na tela é metade da informação. */}
            {porDia.map((grupo) => (
              <section key={grupo.chave}>
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-y border-fg/[0.06] bg-surface/95 px-5 py-2 backdrop-blur-sm">
                  <span className="flex items-center gap-2 text-[11.5px] text-mist">
                    <CalendarDays size={13} className="text-accent-soft" />
                    <span className="tabular-nums">{grupo.rotulo}</span>
                    <span className="text-faint">
                      · {grupo.itens.length} {grupo.itens.length === 1 ? "pedido" : "pedidos"}
                    </span>
                  </span>

                  {/* "3 de 6 na produção" — é este número que faz alguém abrir
                      o dia. Zero fica em cinza; não é urgência, é um dia sem
                      trabalho de oficina, e isso é normal em muita loja. */}
                  <span className={`text-[11.5px] tabular-nums ${grupo.comOrdem > 0 ? "text-accent-soft" : "text-faint"}`}>
                    {grupo.comOrdem} de {grupo.itens.length} na produção
                  </span>
                </div>

                {grupo.itens.map((v) => {
                const id = String(v.pedido.pedidoId);
                const ordem = ordemPorPedido.get(id);

                return (
                  <ListaLinha
                    key={id}
                    cols={COLS}
                    rotulos={ROTULOS}
                    altura={ALTURA_LINHA}
                    acoes={
                      /* A ordem já existe: não há botão. Oferecer "gerar" outra
                         vez prometeria algo que o servidor recusa — e o número da
                         OS ao lado já diz onde o trabalho está. */
                      ordem ? undefined : (
                        <ListaAcao
                          icon={<ClipboardList size={14} />}
                          label="Gerar ordem de serviço"
                          tom="sucesso"
                          ocupado={gerando === id}
                          onClick={() => {
                            setModeloEscolhido("PADRAO");
                            setAGerar(v);
                          }}
                        />
                      )
                    }
                  >
                    <span className="flex min-w-0 items-center gap-2.5 pr-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent/25 bg-accent/[0.12] text-[10.5px] text-accent-soft">
                        {getInitials(v.nomeCliente)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] text-ink">{v.nomeCliente}</span>
                        <span className="block truncate font-mono text-[10px] text-faint">#{id.slice(-6).toUpperCase()}</span>
                      </span>
                    </span>

                    <span className="text-right text-[12.5px] tabular-nums text-ink">{formatCurrency(totalDoPedido(v))}</span>

                    {/* A coluna que a tela existe para responder. */}
                    <span className="flex justify-end">
                      {ordem ? (
                        <Selo tom={ordem.concluido_em ? "sucesso" : "info"}>
                          OS #{ordem.codigo} · {ordem.concluido_em ? "concluída" : ordem.etapa_nome ?? "sem etapa"}
                        </Selo>
                      ) : (
                        <span className="text-[11.5px] text-faint">sem ordem</span>
                      )}
                    </span>

                    <span />
                  </ListaLinha>
                );
                })}
              </section>
            ))}
          </>
        )}
      </div>

      {/*
        Escolher o papel ANTES de a ordem existir.
        
        Um clique direto criaria a OS no documento simples e deixaria a troca
        para depois — o que significa que a primeira impressão sai sempre
        errada para quem usa um modelo próprio. Uma pergunta de um campo é mais
        barata do que reimprimir.
      */}
      <Modal
        open={!!aGerar}
        onClose={() => setAGerar(null)}
        title="Gerar ordem de serviço"
        subtitle={aGerar ? aGerar.nomeCliente : ""}
        size="sm"
      >
        {aGerar && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] uppercase tracking-[0.7px] text-faint">Modelo do papel</span>

              <Select
                valor={modeloEscolhido}
                aria-label="Modelo da ordem de serviço"
                onChange={setModeloEscolhido}
                opcoes={[
                  { valor: "PADRAO", label: "Ordem de serviço simples" },
                  ...modelosOs.map((m) => ({ valor: m.chave, label: m.nome })),
                ]}
              />

              <p className="text-[11.5px] leading-relaxed text-faint">
                {modelosOs.find((m) => m.chave === modeloEscolhido)?.descricao
                  ?? "Cliente, etapa, responsável, prazo e o que produzir. Serve a qualquer ramo."}
              </p>

              {modelosOs.length === 0 && (
                <p className="text-[11.5px] leading-relaxed text-mist">
                  Outros modelos — como a ficha técnica de produção, com grades de tamanho, moldes e tecidos — são
                  liberados para a sua empresa pelo suporte.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-fg/[0.06] pt-3">
              <button
                onClick={() => setAGerar(null)}
                className="flex min-h-[36px] items-center rounded-lg px-3 text-[12px] text-mist transition-colors hover:text-ink"
              >
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
    </PageScreen>
  );
};

export default PedidosPage;
