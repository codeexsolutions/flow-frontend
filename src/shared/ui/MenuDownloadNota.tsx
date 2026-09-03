import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Download, FileImage, FileText, Loader2, Check } from "lucide-react";

import Dica from "@/shared/ui/Dica";
import { gerarBlobNota } from "@/shared/ui/DownloadButton";
import { baixarNotaPdf } from "@/shared/ui/downloadNota";

/**
 * O ÚNICO botão de download de documento do sistema — nota, recibo, orçamento,
 * holerite, na tela cheia ou na linha de uma lista.
 *
 * Antes existiam quatro botões diferentes para a mesma ação: este, um menu só
 * de ícone (`MenuFormatoDownload`), a seta da linha da lista de vendas e um
 * terceiro ícone solto na lista de orçamentos. Além de cada um ter um desenho
 * próprio, dois deles baixavam PNG direto, sem oferecer PDF — o mesmo clique
 * dava resultados diferentes dependendo de onde a pessoa estava. Agora todos
 * são este componente: mesmo ícone, mesmo giro de "gerando", mesmo ✓ de
 * pronto e a mesma lista PNG/PDF com o nome do documento no topo.
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
type Formato = "png" | "pdf";

type Props = {
  /**
   * Ref do nó a rasterizar (o documento em si).
   *
   * Obrigatório no modo normal. Em `onEscolher` quem baixa é a tela, e este
   * ref não é usado.
   */
  refNota?: RefObject<HTMLDivElement>;
  /**
   * Quem baixa, quando não é o componente.
   *
   * As listas mantêm UM nó de documento escondido e o preenchem com a linha
   * escolhida antes de fotografar; esse preparo é da tela, não daqui. Nesse
   * modo o botão só oferece o formato e mostra o estado que a tela informa em
   * `ocupado`.
   */
  onEscolher?: (formato: Formato) => void | Promise<void>;
  /** Estado de "gerando" quando quem baixa é a tela (`onEscolher`). */
  ocupado?: boolean;
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
  /**
   * `completo` (padrão) é o botão do rodapé do documento aberto — alto, com o
   * nome do documento escrito. `linha` é o mesmo botão encolhido para caber na
   * fileira de ações de uma lista: mesmo ícone, mesmas cores, mesmo menu, só
   * na altura dos outros ícones da linha.
   */
  variante?: "completo" | "linha";
};

const MenuDownloadNota = ({
  refNota,
  onEscolher,
  ocupado: ocupadoExterno = false,
  nomeEmpresa = "nota",
  prefixo = "nota",
  titulo = "Baixar documento",
  documento = "documento",
  variante = "completo",
}: Props) => {
  const [aberto, setAberto] = useState(false);
  const [ocupadoInterno, setOcupadoInterno] = useState<null | Formato>(null);
  const [sucesso, setSucesso] = useState(false);
  const [posicao, setPosicao] = useState<Posicao | null>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const delegado = typeof onEscolher === "function";
  const ocupado = delegado ? ocupadoExterno : ocupadoInterno !== null;
  const naLinha = variante === "linha";

  /*
   * O ✓ de "pronto" também quando quem baixa é a tela.
   *
   * No modo delegado o componente não vê o fim do download — só o `ocupado`
   * que a tela informa. Sem observar essa virada, o botão da linha piscava o
   * giro e voltava ao ícone normal, enquanto o do rodapé confirmava com o ✓:
   * a mesma ação dando dois retornos diferentes. O arquivo do navegador não
   * aparece na tela em todo aparelho, e sem confirmação alguma a pessoa clica
   * de novo achando que falhou.
   */
  const ocupadoAntes = useRef(false);

  useEffect(() => {
    if (!delegado) return;

    const terminou = ocupadoAntes.current && !ocupadoExterno;
    ocupadoAntes.current = ocupadoExterno;

    if (!terminou) return;

    setSucesso(true);
    const t = setTimeout(() => setSucesso(false), 2000);

    return () => clearTimeout(t);
  }, [delegado, ocupadoExterno]);

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

  const baixar = async (formato: Formato) => {
    if (ocupado) return;

    setAberto(false);

    /* Modo delegado: a tela tem o nó escondido e o próprio estado de
       "gerando" — aqui só se escolhe o formato. */
    if (delegado) {
      await onEscolher(formato);
      return;
    }

    if (!refNota) return;

    setOcupadoInterno(formato);

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
      setOcupadoInterno(null);
    }
  };

  /* O mesmo ícone nas duas variantes — é ele que faz o botão ser reconhecido
     como "o download" em qualquer tela. */
  const icone = ocupado ? (
    <Loader2 size={naLinha ? 14 : 17} className="animate-spin" />
  ) : sucesso ? (
    <Check size={naLinha ? 14 : 17} className="text-success" />
  ) : (
    <Download size={naLinha ? 14 : 17} />
  );

  const botao = (
    <button
      ref={botaoRef}
      type="button"
      title={naLinha ? undefined : titulo}
      aria-label={titulo}
      aria-haspopup="menu"
      aria-expanded={aberto}
      disabled={ocupado}
      onClick={(ev) => {
        /* A linha inteira é clicável (abre o documento): sem barrar aqui,
           pedir o arquivo abriria o modal por cima do menu. */
        ev.stopPropagation();
        setAberto((v) => !v);
      }}
      className={
        naLinha
          ? "focus-ring flex h-[30px] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-fg/[0.08] bg-surface/90 px-2 text-mist transition-colors hover:border-accent/40 hover:bg-fg/[0.08] hover:text-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
          : "flex h-12 shrink-0 items-center gap-2 rounded-xl border border-fg/[0.1] px-3 text-mist transition-colors hover:border-accent/40 hover:text-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      {icone}
      {/* O nome do documento no próprio botão, e não só no `title`: dica de
          ferramenta não existe no celular, que é onde a nota é mandada.
          Na linha o rótulo é curto e some no celular — ali a fileira de ações
          divide poucos pixels com o valor da venda. */}
      {naLinha ? (
        <span className="hidden whitespace-nowrap text-[11.5px] sm:inline">{ocupado ? "Gerando..." : "Baixar"}</span>
      ) : (
        <span className="hidden whitespace-nowrap text-[13px] sm:inline">{ocupado ? "Gerando..." : `Baixar ${documento}`}</span>
      )}
    </button>
  );

  return (
    <>
      {/* `Dica` só na linha: lá o rótulo some no celular e encolhe no desktop,
          então é a bolha que diz QUAL documento sai. No rodapé o nome do
          documento já está escrito no botão. */}
      {naLinha ? <Dica texto={titulo}>{botao}</Dica> : botao}

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
            onClick={(ev) => {
              ev.stopPropagation();
              void baixar("png");
            }}
            className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-[13px] text-ink transition-colors hover:bg-fg/[0.06]"
          >
            <FileImage size={16} className="text-accent-soft" /> Imagem (PNG)
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={(ev) => {
              ev.stopPropagation();
              void baixar("pdf");
            }}
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
