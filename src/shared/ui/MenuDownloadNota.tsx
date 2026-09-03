import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, FileImage, FileText, Loader2, Check } from "lucide-react";

import { gerarBlobNota } from "@/shared/ui/DownloadButton";
import { baixarNotaPdf } from "@/shared/ui/downloadNota";

/**
 * Menu de download de um documento (nota/orçamento).
 *
 * Gera o PNG uma única vez e baixa como imagem ou cola no PDF. O nome da
 * empresa aparece no arquivo (ex.: `nota-loja-da-maria.pdf`).
 *
 * O menu vai para um portal no `body`, e não fica ao lado do botão.
 *
 * Dentro do modal o botão mora em duas caixas com `overflow` — o painel
 * (`overflow-hidden`) e o corpo rolável (`overflow-y-auto`). Uma lista
 * `absolute` que sobe a partir do botão é RECORTADA por elas, e nenhum
 * `z-index` resolve isso: empilhamento e recorte são coisas diferentes, e o
 * recorte vem primeiro. Ou o menu sai dessas caixas, ou ele aparece cortado.
 *
 * Fora do portal, `position: fixed` o ancora à posição do botão na tela.
 */

/** Largura da lista. Precisa bater com a classe `w-44` abaixo. */
const LARGURA = 176;

/** Espaço mínimo acima do botão para o menu caber; abaixo disso ele desce. */
const ALTURA_ESTIMADA = 140;

type Posicao = { left: number; bottom?: number; top?: number };
type Props = {
  /** Ref do nó a rasterizar (a nota em si). */
  refNota: React.RefObject<HTMLDivElement>;
  /** Nome da empresa, para o nome do arquivo. */
  nomeEmpresa?: string;
  /** Rótulo do documento (ex.: "nota", "orcamento"). */
  prefixo?: string;
  /** Título do arquivo (ex.: "nota"). */
  titulo?: string;
  /**
   * O NOME do documento — "nota", "recibo", "orçamento".
   *
   * Existe porque numa venda quitada há DOIS destes botões lado a lado, e
   * ambos diziam "Baixar" com o mesmo ícone: não havia como saber qual saía
   * com a nota e qual com o comprovante sem clicar e conferir o arquivo. Um
   * deles é o documento da venda, o outro é a prova de quitação — mandar o
   * errado para o cliente é o tipo de engano que volta como discussão.
   */
  documento?: string;
};

const MenuDownloadNota = ({ refNota, nomeEmpresa = "nota", prefixo = "nota", titulo = "Baixar documento", documento = "documento" }: Props) => {
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState<null | "png" | "pdf">(null);
  const [sucesso, setSucesso] = useState(false);
  const [posicao, setPosicao] = useState<Posicao | null>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /*
   * Ancora o menu ao botão. `bottom` em vez de `top` para o caso normal (menu
   * subindo): assim não é preciso saber a altura da lista antes de renderizar.
   * Perto do topo da tela ele desce, senão sairia pela borda de cima.
   */
  useLayoutEffect(() => {
    if (!aberto) return;

    const posicionar = () => {
      const r = botaoRef.current?.getBoundingClientRect();
      if (!r) return;

      // Alinhado à direita do botão, sem encostar na borda da tela.
      const left = Math.max(8, Math.min(r.right - LARGURA, window.innerWidth - LARGURA - 8));

      setPosicao(
        r.top < ALTURA_ESTIMADA
          ? { left, top: r.bottom + 8 }
          : { left, bottom: window.innerHeight - r.top + 8 },
      );
    };

    posicionar();

    /* `capture` para pegar rolagem de qualquer container, não só da janela —
       o botão vive dentro do corpo rolável do modal. */
    window.addEventListener("scroll", posicionar, true);
    window.addEventListener("resize", posicionar);

    return () => {
      window.removeEventListener("scroll", posicionar, true);
      window.removeEventListener("resize", posicionar);
    };
  }, [aberto]);

  /* Clique fora e Esc fecham o menu. */
  useEffect(() => {
    if (!aberto) return;

    const aoClicar = (e: MouseEvent) => {
      const alvo = e.target as Node;

      /* O menu está no portal, fora da árvore do botão: sem checar as duas
         referências, clicar num item contaria como "clique fora", o menu
         sumiria no `mousedown` e o `click` nunca chegaria ao botão. */
      if (botaoRef.current?.contains(alvo) || menuRef.current?.contains(alvo)) return;

      setAberto(false);
    };

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      /* Não deixa o Esc vazar para o modal: fecha o menu primeiro, e só o
         próximo Esc fecha o orçamento. */
      e.stopPropagation();
      setAberto(false);
    };

    document.addEventListener("mousedown", aoClicar);
    document.addEventListener("keydown", aoTeclar, true);

    return () => {
      document.removeEventListener("mousedown", aoClicar);
      document.removeEventListener("keydown", aoTeclar, true);
    };
  }, [aberto]);

  const baixar = async (formato: "png" | "pdf") => {
    if (ocupado) return;

    setOcupado(formato);
    setAberto(false);

    try {
      const blob = await gerarBlobNota(refNota);

      if (formato === "png") {
        await baixarArquivo(blob, `${prefixo}-${nomeEmpresa}.png`);
      } else {
        await baixarNotaPdf(blob, nomeEmpresa);
      }

      setSucesso(true);
      setTimeout(() => setSucesso(false), 2000);
    } catch (err) {
      console.error("Erro ao baixar", err);
    } finally {
      setOcupado(null);
    }
  };

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        title={titulo}
        aria-label={titulo}
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className="flex h-12 shrink-0 items-center gap-2 rounded-xl border border-fg/[0.1] px-3 text-mist transition-colors hover:border-accent/40 hover:text-accent-soft"
      >
        {ocupado ? <Loader2 size={17} className="animate-spin" /> : sucesso ? <Check size={17} className="text-success" /> : <Download size={17} />}
        {/* O nome do documento no próprio botão, e não só no `title`: dica de
            ferramenta não existe no celular, que é onde a nota é mandada. */}
        <span className="hidden whitespace-nowrap text-[13px] sm:inline">{ocupado ? "Gerando..." : `Baixar ${documento}`}</span>
      </button>

      {/* z-[300] fica acima do modal (z-[200]) — e, por estar no portal, fora
          do `overflow` que recortava a lista. */}
      {aberto && posicao && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ position: "fixed", left: posicao.left, top: posicao.top, bottom: posicao.bottom, width: LARGURA }}
          className="z-[300] overflow-hidden rounded-xl border border-fg/[0.1] bg-surface shadow-[0_24px_60px_-20px_rgba(0,0,0,0.5)]"
        >
          {/* O cabeçalho repete o documento dentro do menu: quem abriu os dois
              botões em sequência perde de vista qual deles está aberto — a
              lista é idêntica nos dois. */}
          <p className="border-b border-fg/[0.06] bg-fg/[0.03] px-3.5 py-2 text-[10.5px] uppercase tracking-[0.1em] text-faint">{documento}</p>

          <button
            type="button"
            role="menuitem"
            onClick={() => void baixar("png")}
            className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-[13px] text-ink transition-colors hover:bg-fg/[0.06]"
          >
            <FileImage size={16} className="text-accent-soft" /> Imagem (PNG)
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void baixar("pdf")}
            className="flex w-full items-center gap-2.5 border-t border-fg/[0.06] px-3.5 py-3 text-left text-[13px] text-ink transition-colors hover:bg-fg/[0.06]"
          >
            <FileText size={16} className="text-danger/80" /> PDF
          </button>
        </div>,
        document.body,
      )}
    </>
  );
};

/** Baixa um blob arbitrário (PNG aqui) com o nome dado. */
const baixarArquivo = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export default MenuDownloadNota;
