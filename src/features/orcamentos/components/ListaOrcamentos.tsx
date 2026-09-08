import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, FileText, ShoppingCart, Trash2, X } from "lucide-react";

import OrcamentoService, { type Orcamento, type StatusOrcamento } from "@/features/orcamentos/services/orcamento.service";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDate } from "@/shared/utils/date";
import { SkeletonListaPainel } from "@/shared/ui/skeleton";
import { gerarBlobNota } from "@/shared/ui/DownloadButton";
import { baixarNotaPdf } from "@/shared/ui/downloadNota";
import MenuDownloadNota from "@/shared/ui/MenuDownloadNota";
import { Modal } from "@/shared/ui/Modal";
import useEnterprise from "@/features/empresa/store/enterprise.store";
import OrcamentoNota from "@/features/orcamentos/components/OrcamentoNota";
import { filtrarOrcamentos } from "@/features/orcamentos/utils/fila";

/**
 * A lista de propostas — sem tela própria.
 *
 * Ela nasceu como página (`/pdv/orcamentos`) e continua sendo uma; o que saiu
 * daqui foi a MOLDURA. A lista de vendas tem uma porta para orçamentos, e essa
 * porta trocava de rota: quem estava conferindo notas era levado para o
 * balcão, perdia a aba, o filtro e a busca, e voltava pelo histórico. Ver a
 * proposta é o mesmo trabalho de ver a nota — quem olha uma olha a outra —, e
 * trabalho contínuo não pode custar uma viagem de ida e volta.
 *
 * Então a lista virou peça: a página de orçamentos a envolve com o seu
 * cabeçalho e o seu aviso, e a aba de vendas a coloca dentro do cartão que já
 * está aberto. Uma implementação, dois lugares — o que se aprende num vale no
 * outro.
 *
 * **Busca e filtro vêm de fora.** Cada dona tem a sua barra: a página usa as
 * pílulas de status, o cartão de vendas usa os mesmos seletores das outras
 * abas. Guardar o estado aqui obrigaria as duas a desenhar a barra da lista.
 *
 * O que continua aqui é o que é da proposta: carregar, abrir, baixar, aprovar,
 * recusar, excluir.
 */

const SITUACAO: Record<StatusOrcamento, { label: string; cls: string }> = {
  ABERTO: { label: "Aguardando", cls: "border-warning/40 bg-warning/15 text-warning" },
  APROVADO: { label: "Aprovado", cls: "border-success/40 bg-success/15 text-success" },
  RECUSADO: { label: "Recusado", cls: "border-danger/40 bg-danger/15 text-danger" },
  EXPIRADO: { label: "Expirado", cls: "border-fg/[0.12] bg-fg/[0.04] text-mist" },
  /* Não aparece na lista — fica aqui para o selo não quebrar caso um
     convertido chegue por outro caminho (busca por código, link direto). */
  CONVERTIDO: { label: "Virou venda", cls: "border-accent/40 bg-accent/15 text-accent-soft" },
};

/** Baixa o PNG já rasterizado com o nome do orçamento. */
const baixarPng = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.download = filename;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

type Props = {
  busca: string;
  filtro: "todos" | StatusOrcamento;
  /**
   * Devolve a lista crua a quem contém.
   *
   * As contagens (quantas aguardando, quantas o filtro deixa passar) são
   * desenhadas na barra da dona, e ela precisa dos mesmos dados que a lista
   * tem. Buscar de novo lá em cima daria duas chamadas e dois números.
   */
  onCarregado?: (lista: Orcamento[]) => void;
};

const ListaOrcamentos = ({ busca, filtro, onCarregado }: Props) => {
  const alert = useAlert();
  const navigate = useNavigate();
  const enterprise = useEnterprise((s) => s.enterprise);

  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [visualizando, setVisualizando] = useState<Orcamento | null>(null);
  const [baixandoId, setBaixandoId] = useState<string | null>(null);

  /* A cada mudança, a dona recebe a lista de volta — é dela a contagem. */
  const guardar = (lista: Orcamento[]) => {
    setOrcamentos(lista);
    onCarregado?.(lista);
  };

  useEffect(() => {
    let vivo = true;

    (async () => {
      setCarregando(true);

      try {
        const lista = await OrcamentoService.listar();
        if (vivo) guardar(lista);
      } catch (err) {
        if (vivo) alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível carregar os orçamentos."));
      } finally {
        if (vivo) setCarregando(false);
      }
    })();

    return () => {
      vivo = false;
    };
    // Só na montagem.
  }, []);

  const filtrados = useMemo(() => filtrarOrcamentos(orcamentos, busca, filtro), [orcamentos, busca, filtro]);

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

  const baixar = async (o: Orcamento, formato: "png" | "pdf" = "png") => {
    setBaixandoId(o.id);

    try {
      /* Espera o render do nó com o orçamento certo antes de fotografar. */
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

      const blob = await gerarBlobNota(refNotaBaixada);

      /* O PDF sai do MESMO PNG que o download de imagem — uma página A4 com a
         imagem colada —, então o documento é idêntico nos dois caminhos. */
      if (formato === "pdf") {
        await baixarNotaPdf(blob, enterprise?.nomeFantasia ?? "orcamento");
      } else {
        baixarPng(blob, `orcamento-${o.codigo}.png`);
      }
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
      guardar(orcamentos.map((x) => (x.id === o.id ? { ...x, status } : x)));
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível atualizar a situação."));
    } finally {
      setSalvando(null);
    }
  };

  /**
   * Aprovar aqui é o mesmo gesto do balcão: aprova E fatura.
   *
   * Esta lista não tem nota — a nota mora no PDV, com a busca de produtos, o
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
      guardar(orcamentos.filter((x) => x.id !== o.id));
      alert.success("Orçamento excluído.", "A proposta foi removida.");
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível excluir."));
    } finally {
      setSalvando(null);
    }
  };

  return (
    <>
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

                <span className="mr-2 shrink-0">
                  <MenuDownloadNota
                    variante="linha"
                    titulo="Baixar orçamento"
                    documento="orçamento"
                    ocupado={baixandoId === o.id}
                    onEscolher={(formato) => void baixar(o, formato)}
                  />
                </span>
              </div>
            </div>
          );
        })
      )}

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
                      void mudarStatus(visualizando, "RECUSADO");
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
                  onClick={() => void excluir(visualizando).then(() => setVisualizando(null))}
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
    </>
  );
};

export default ListaOrcamentos;
