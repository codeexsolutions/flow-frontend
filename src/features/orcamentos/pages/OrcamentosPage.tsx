import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Search, Check, X, Trash2, Loader2, Info, ShoppingCart, Download } from "lucide-react";

import OrcamentoService, { type Orcamento, type StatusOrcamento } from "@/features/orcamentos/services/orcamento.service";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDate } from "@/shared/utils/date";
import { SkeletonListaPainel } from "@/shared/ui/skeleton";
import { PageScreen } from "@/shared/ui/PageShell";
import { handleDownload } from "@/shared/ui/DownloadButton";
import MenuDownloadNota from "@/shared/ui/MenuDownloadNota";
import { Modal } from "@/shared/ui/Modal";
import useEnterprise from "@/features/empresa/store/enterprise.store";
import OrcamentoNota from "@/features/orcamentos/components/OrcamentoNota";

const SITUACAO: Record<StatusOrcamento, { label: string; cls: string }> = {
  ABERTO: { label: "Aguardando", cls: "border-warning/40 bg-warning/15 text-warning" },
  APROVADO: { label: "Aprovado", cls: "border-success/40 bg-success/15 text-success" },
  RECUSADO: { label: "Recusado", cls: "border-danger/40 bg-danger/15 text-danger" },
  EXPIRADO: { label: "Expirado", cls: "border-fg/[0.12] bg-fg/[0.04] text-mist" },
  /* Não aparece na lista — fica aqui para o selo não quebrar caso um
     convertido chegue por outro caminho (busca por código, link direto). */
  CONVERTIDO: { label: "Virou venda", cls: "border-accent/40 bg-accent/15 text-accent-soft" },
};

const FILTROS: { id: "todos" | StatusOrcamento; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "ABERTO", label: "Aguardando" },
  { id: "APROVADO", label: "Aprovados" },
  { id: "RECUSADO", label: "Recusados" },
];

/**
 * Orçamentos: propostas enviadas, ainda sem compromisso.
 *
 * A tela é deliberadamente diferente de Vendas em uma coisa: **não há totais no
 * topo**. Somar orçamento dá um número que parece faturamento e não é — bastaria
 * alguém olhar de longe para tomar proposta por venda. O que interessa aqui é
 * quantas propostas estão paradas esperando resposta, e essa contagem fica no
 * próprio filtro.
 */
const OrcamentosPage = () => {
  const alert = useAlert();
  const navigate = useNavigate();
  const enterprise = useEnterprise((s) => s.enterprise);

  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | StatusOrcamento>("todos");
  const [salvando, setSalvando] = useState<string | null>(null);
  const [visualizando, setVisualizando] = useState<Orcamento | null>(null);

  const carregar = async () => {
    setCarregando(true);

    try {
      setOrcamentos(await OrcamentoService.listar());
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível carregar os orçamentos."));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
    // Só na montagem.
  }, []);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return orcamentos.filter((o) => {
      /* Proposta que já virou nota sai da lista: aqui é fila de trabalho, e
         ela não espera mais nada de ninguém. O registro fica no banco. */
      if (o.status === "CONVERTIDO") return false;
      if (filtro !== "todos" && o.status !== filtro) return false;
      if (!termo) return true;

      return o.clienteNome.toLowerCase().includes(termo) || String(o.codigo).includes(termo);
    });
  }, [orcamentos, busca, filtro]);

  const aguardando = orcamentos.filter((o) => o.status === "ABERTO").length;

  const [baixandoId, setBaixandoId] = useState<string | null>(null);

  /* Um único nó de orçamento fora da tela: seu conteúdo é trocado para o
     orçamento escolhido antes de rasterizar. Evita N nós escondidos na lista. */
  const refNotaBaixada = useRef<HTMLDivElement>(null);

  /*
   * TODO download — da lista e do modal — sai deste nó, nunca do que está na
   * tela.
   *
   * O nó visível vive dentro do corpo rolável do modal e com a largura que
   * sobrar na tela: rasterizá-lo entrega um PNG do tamanho da janela e, se a
   * pessoa tiver rolado até o total antes de clicar, com o topo cortado. O nó
   * de fora tem 900px fixos, nunca rola e está sempre inteiro — o arquivo sai
   * igual em qualquer aparelho, independente do que a pessoa estava vendo.
   */
  const orcamentoAlvo = filtrados.find((o) => o.id === baixandoId) ?? visualizando;

  const baixar = async (o: Orcamento) => {
    setBaixandoId(o.id);

    try {
      /* Espera o render do nó com o orçamento certo antes de fotografar. */
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      await handleDownload(refNotaBaixada, `orcamento-${o.codigo}.png`);
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível baixar o orçamento."));
    } finally {
      setBaixandoId(null);
    }
  };

  const mudarStatus = async (o: Orcamento, status: StatusOrcamento) => {
    setSalvando(o.id);

    try {
      await OrcamentoService.alterarStatus(o.id, status);
      setOrcamentos((prev) => prev.map((x) => (x.id === o.id ? { ...x, status } : x)));

    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível atualizar a situação."));
    } finally {
      setSalvando(null);
    }
  };

  /**
   * Aprovar aqui é o mesmo gesto do balcão: aprova E fatura.
   *
   * Esta tela não tem nota — a nota mora no PDV, com a busca de produtos, o
   * pagamento e o estoque. Duplicá-la aqui seria manter duas versões da mesma
   * conversão, e elas divergiriam na primeira mudança de regra.
   *
   * Então quem aprova daqui é levado ao balcão com a proposta já apontada: o
   * PDV marca o aprovado e abre a nota montada (ver `aprovarOrcamento` lá).
   * A aprovação NÃO acontece antes de sair desta tela de propósito — marcar
   * aqui e falhar lá deixaria a proposta aprovada sem venda nenhuma.
   */
  const aprovarEFaturar = (o: Orcamento) => {
    setVisualizando(null);
    navigate("/pdv", { state: { faturar: o.id } });
  };

  const excluir = async (o: Orcamento) => {
    setSalvando(o.id);

    try {
      await OrcamentoService.excluir(o.id);
      setOrcamentos((prev) => prev.filter((x) => x.id !== o.id));
      alert.success("Orçamento excluído.", "A proposta foi removida.");
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível excluir."));
    } finally {
      setSalvando(null);
    }
  };

  return (
    <PageScreen icon={<ShoppingCart className="h-5 w-5" />} title="Ponto de Venda" subtitle="Registre vendas e monte orçamentos">
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Explica a regra uma vez, onde ela importa. */}
      <div className="flex shrink-0 items-start gap-2.5 rounded-xl border border-fg/[0.07] bg-fg/[0.02] px-4 py-2.5">
        <Info size={14} className="mt-0.5 shrink-0 text-accent-soft" />
        <p className="text-[12px] leading-relaxed text-mist">
          Orçamento é proposta: <span className="text-ink">não entra no faturamento, não baixa estoque e não gera conta a receber</span>. Quando o cliente aceitar, “Cliente aprovou” abre a venda já montada no balcão.
        </p>
      </div>

      {/* Filtros */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="flex max-w-xs flex-1 items-center gap-2 rounded-lg border border-fg/[0.08] bg-fg/[0.05] px-3 focus-within:border-accent">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por cliente ou número..." className="flex-1 bg-transparent py-2 text-xs text-ink outline-none placeholder:text-faint" />
        </div>

        <div className="flex gap-1.5">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={`cursor-pointer rounded-lg px-3 py-2 text-[11px] transition-colors ${filtro === f.id ? "bg-accent text-white" : "border border-fg/[0.08] bg-fg/[0.05] text-mist hover:bg-fg/[0.09]"}`}
            >
              {f.label}
              {f.id === "ABERTO" && aguardando > 0 && <span className="ml-1.5 rounded-full bg-warning/25 px-1.5 text-[10px] text-warning">{aguardando}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="card glass-sheen min-h-0 flex-1 overflow-y-auto">
        {carregando ? (
          <SkeletonListaPainel linhas={6} />
        ) : filtrados.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl border border-fg/[0.08] bg-fg/[0.03] text-faint">
              <FileText size={22} />
            </span>
            <p className="text-[14px] text-ink">{busca.trim() || filtro !== "todos" ? "Nenhum orçamento encontrado" : "Nenhum orçamento ainda"}</p>
            <p className="max-w-[280px] text-[12.5px] leading-relaxed text-faint">
              {busca.trim() || filtro !== "todos" ? "Tente outro filtro ou outra busca." : "Monte uma proposta no PDV: escolha os produtos e clique em “Gerar orçamento”."}
            </p>
          </div>
        ) : (
          filtrados.map((o) => {
            const s = SITUACAO[o.status] ?? SITUACAO.ABERTO;

            return (
              <div key={o.id} className="border-b border-fg/[0.04] last:border-0">
                <div className="flex items-center gap-1">
                  <button onClick={() => setVisualizando(o)} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-fg/[0.03]">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fg/[0.05] text-[11px] tabular-nums text-mist">#{o.codigo}</span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">{o.clienteNome}</span>
                      <span className="block truncate text-[11px] text-faint">
                        {formatDate(o.criadoEm)}
                        {o.vendedorNome ? ` · ${o.vendedorNome}` : ""}
                        {o.itens.length ? ` · ${o.itens.length} ${o.itens.length === 1 ? "item" : "itens"}` : ""}
                      </span>
                    </span>

                    <span className={`hidden shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] sm:inline-flex ${s.cls}`}>{s.label}</span>

                    <span className="shrink-0 text-right text-[13px] tabular-nums text-ink">{formatCurrency(o.total)}</span>
                  </button>

                  <button
                    title="Baixar orçamento"
                    aria-label={`Baixar orçamento ${o.codigo}`}
                    disabled={baixandoId === o.id}
                    onClick={() => baixar(o)}
                    className="mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-accent/[0.12] hover:text-accent-soft disabled:opacity-50"
                  >
                    {baixandoId === o.id ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal de visualização do orçamento — clicar na linha abre aqui. */}
      <Modal
        open={!!visualizando}
        onClose={() => setVisualizando(null)}
        title="Orçamento"
        subtitle={visualizando ? `#${visualizando.codigo} · ${visualizando.clienteNome}` : ""}
        size="xl"
      >
        {visualizando && (
          <div className="flex flex-col gap-4">
            {/*
              O orçamento em si — visual de leitura, sem pagamento e sem QR.

              Sem scroller próprio aqui: o corpo do modal já rola. Dois
              scrollers aninhados faziam a roda parar no de dentro e o rodapé
              ficar preso fora de alcance no celular.
            */}
            <div className="overflow-hidden rounded-lg border border-fg/[0.06]">
              <OrcamentoNota orcamento={visualizando} />
            </div>

            {/* Rodapé de ações */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-fg/[0.06] pt-3">
              <MenuDownloadNota refNota={refNotaBaixada} nomeEmpresa={enterprise?.nomeFantasia ?? "orcamento"} prefixo="orcamento" titulo="Baixar orçamento" documento="orçamento" />

              <div className="flex flex-wrap items-center gap-2">
                {/* Um botão só, como no balcão: aprovar já é começar a venda.
                    Na proposta que JÁ está aprovada ele só troca de nome —
                    não há o que aprovar de novo, falta faturar. */}
                {visualizando.status !== "RECUSADO" && (
                  <button
                    disabled={salvando === visualizando.id}
                    onClick={() => aprovarEFaturar(visualizando)}
                    className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-success/30 bg-success/[0.1] px-3 text-[12px] text-success transition-colors hover:bg-success/20 disabled:opacity-50"
                  >
                    {visualizando.status === "APROVADO" ? <ShoppingCart size={13} /> : <Check size={13} />}
                    {visualizando.status === "APROVADO" ? "Faturar venda" : "Cliente aprovou"}
                  </button>
                )}

                {visualizando.status !== "RECUSADO" && (
                  <button
                    disabled={salvando === visualizando.id}
                    onClick={() => {
                      mudarStatus(visualizando, "RECUSADO");
                      setVisualizando((v) => (v ? { ...v, status: "RECUSADO" } : v));
                    }}
                    className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-fg/[0.1] px-3 text-[12px] text-mist transition-colors hover:text-ink disabled:opacity-50"
                  >
                    <X size={13} />
                    Recusou
                  </button>
                )}

                <button
                  disabled={salvando === visualizando.id}
                  onClick={() => excluir(visualizando).then(() => setVisualizando(null))}
                  className="flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-[12px] text-muted transition-colors hover:text-danger disabled:opacity-50"
                >
                  <Trash2 size={13} />
                  Excluir
                </button>

                <button
                  onClick={() => setVisualizando(null)}
                  className="flex min-h-[36px] items-center gap-1.5 rounded-lg bg-fg/[0.06] px-4 text-[12px] text-ink transition-colors hover:bg-fg/[0.1]"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Nó de orçamento fora da tela — é a fonte de TODO download, tanto o
          rápido da linha quanto o do modal. `html-to-image` precisa que o nó
          exista no DOM: escondido à esquerda, nunca `display:none`. */}
      <div className="fixed -left-[9999px] top-0 w-[900px]" aria-hidden>
        {orcamentoAlvo && <OrcamentoNota orcamento={orcamentoAlvo} refNota={refNotaBaixada} />}
      </div>
    </div>
    </PageScreen>
  );
};

export default OrcamentosPage;
