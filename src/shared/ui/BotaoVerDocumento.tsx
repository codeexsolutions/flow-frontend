import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Download, ExternalLink, FileText, Image as Imagem, Loader2, Check } from "lucide-react";

import Dica from "@/shared/ui/Dica";
import Suspenso from "@/shared/ui/Suspenso";
import { gerarBlobNota } from "@/shared/ui/DownloadButton";
import { entregarDocumento, type ModoDocumento } from "@/shared/ui/downloadNota";

/**
 * O ÚNICO controle de documento do sistema — nota, recibo, orçamento, holerite.
 *
 * Dois gestos colados: **Ver** abre o documento numa guia e **Baixar** manda o
 * arquivo direto para a pasta de downloads, sem guia nenhuma — em PDF ou em
 * PNG, conforme o formato escolhido no menu da seta.
 *
 * ---------------------------------------------------------------------------
 * Por que os dois, e não um
 * ---------------------------------------------------------------------------
 * Este controle já foi quatro botões, virou um menu de formatos e depois um
 * gesto só — a guia — porque conferir o documento é o que se faz o dia inteiro
 * e baixar era a exceção. A guia continua certa para conferir, mas não para
 * todo mundo: quem já sabe o que tem na nota e só quer o arquivo para mandar
 * ao cliente pagava a guia inteira — abrir, esperar, clicar em "Baixar PDF",
 * fechar — para chegar onde queria desde o clique.
 *
 * Então, em vez de escolher por todos, os dois caminhos ficam à vista. Quem
 * confere clica em Ver; quem já quer o arquivo clica na seta e ele desce.
 * Nenhum dos dois esbarra no outro.
 *
 * ---------------------------------------------------------------------------
 * Por que o FORMATO voltou a ser uma escolha
 * ---------------------------------------------------------------------------
 * A seta baixava PDF, e só PDF. Mas o documento que sai daqui vai para o
 * WhatsApp do cliente, e lá o PNG é melhor: chega como foto, abre dentro da
 * própria conversa e não pede leitor de PDF do outro lado. O PNG já existia —
 * na guia de conferência, no botão "Baixar imagem" — e era justamente isso que
 * obrigava quem queria a imagem a abrir a guia, esperar, baixar e fechar.
 *
 * Os dois formatos agora ficam onde a pessoa já clicava, num menu de duas
 * linhas. É um menu, e não um terceiro botão, porque na fileira de ações de
 * uma lista os pixels são do valor da venda: dois botões de baixar lado a lado
 * empurrariam a linha inteira.
 *
 * O menu não custa uma rasterização a mais — o PNG é o mesmo blob nos dois
 * casos, e o PDF é uma página A4 com essa imagem colada dentro (ver
 * `downloadNota`). Escolher PNG é, na verdade, o caminho mais curto dos dois.
 *
 * ---------------------------------------------------------------------------
 * Dois modos
 * ---------------------------------------------------------------------------
 * Com `refNota`, o botão rasteriza o nó que recebeu. Com `onAbrir`, quem
 * prepara é a tela — as listas mantêm UM nó escondido e trocam o conteúdo pelo
 * da linha escolhida antes de fotografar, e esse preparo não é daqui. Nesse
 * modo o `modo` ("ver", "pdf" ou "png") chega como argumento, e é a tela que
 * chama `entregarDocumento`.
 */

/**
 * O que o clique faz. Mora em `downloadNota`, junto de quem resolve cada um
 * dos três; fica reexportado aqui porque é nesta assinatura que as telas o
 * encontram.
 */
export type { ModoDocumento };

type Props = {
  /**
   * Ref do nó a rasterizar (o documento em si).
   *
   * Obrigatório no modo normal. Em `onAbrir` quem prepara é a tela, e este ref
   * não é usado.
   */
  refNota?: RefObject<HTMLDivElement>;
  /**
   * Quem prepara o documento, quando não é o componente.
   *
   * A tela monta o nó escondido com o documento da linha e chama
   * `entregarDocumento` com o `modo` recebido. Neste modo o botão só dispara e
   * mostra o estado que a tela informa em `ocupado`.
   */
  onAbrir?: (modo: ModoDocumento) => void | Promise<void>;
  /** Estado de "gerando" quando quem prepara é a tela (`onAbrir`). */
  ocupado?: boolean;
  /** Nome da empresa, para o nome do arquivo. */
  nomeEmpresa?: string;
  /** Rótulo do documento no nome do arquivo (ex.: "nota", "orcamento"). */
  prefixo?: string;
  /** O que a dica de ferramenta e o leitor de tela dizem. */
  titulo?: string;
  /**
   * O NOME do documento — "nota", "recibo", "orçamento".
   *
   * Existe porque numa venda quitada há DOIS destes botões lado a lado, e
   * ambos diziam "Ver" com o mesmo ícone: não havia como saber qual abria a
   * nota e qual o comprovante sem clicar e conferir. Um deles é o documento da
   * venda, o outro é a prova de quitação — mandar o errado para o cliente é o
   * tipo de engano que volta como discussão.
   */
  documento?: string;
  /**
   * `completo` (padrão) é o botão do rodapé do documento aberto — alto, com o
   * nome do documento escrito. `linha` é o mesmo botão encolhido para caber na
   * fileira de ações de uma lista: mesmo ícone, mesmas cores, só na altura dos
   * outros ícones da linha.
   */
  variante?: "completo" | "linha";
};

const BotaoVerDocumento = ({
  refNota,
  onAbrir,
  ocupado: ocupadoExterno = false,
  nomeEmpresa = "documento",
  prefixo = "documento",
  titulo = "Ver o documento",
  documento = "documento",
  variante = "completo",
}: Props) => {
  /** Qual dos gestos está em andamento — `null` quando nenhum. */
  const [emCurso, setEmCurso] = useState<ModoDocumento | null>(null);
  const [sucesso, setSucesso] = useState<ModoDocumento | null>(null);

  /** O menu de formatos, ancorado na seta. */
  const [menuAberto, setMenuAberto] = useState(false);
  const refBaixar = useRef<HTMLButtonElement>(null);

  const delegado = typeof onAbrir === "function";
  const naLinha = variante === "linha";

  /*
   * No modo delegado quem diz se está ocupado é a tela — mas ela só informa
   * QUE está, não qual dos gestos foi pedido. O `emCurso` guarda isso daqui,
   * para o giro aparecer no botão que a pessoa apertou.
   */
  const ocupado = delegado ? ocupadoExterno || emCurso !== null : emCurso !== null;

  /* PDF e PNG saem da MESMA seta: para o giro e para o ✓, os dois são "baixar". */
  const ocupadoBaixar = ocupado && (emCurso === "pdf" || emCurso === "png");
  const ocupadoVer = ocupado && !ocupadoBaixar;
  const sucessoBaixar = sucesso === "pdf" || sucesso === "png";

  /*
   * O ✓ de "pronto" também quando quem prepara é a tela.
   *
   * No modo delegado o componente não vê o fim do trabalho — só o `ocupado`
   * que a tela informa. Sem observar essa virada, o botão da linha piscava o
   * giro e voltava ao normal, enquanto o do rodapé confirmava com o ✓: a mesma
   * ação dando dois retornos diferentes.
   */
  const ocupadoAntes = useRef(false);

  useEffect(() => {
    if (!delegado) return;

    const terminou = ocupadoAntes.current && !ocupadoExterno;
    ocupadoAntes.current = ocupadoExterno;

    if (!terminou) return;

    setSucesso(emCurso ?? "ver");
    setEmCurso(null);

    const t = setTimeout(() => setSucesso(null), 2000);

    return () => clearTimeout(t);
  }, [delegado, ocupadoExterno, emCurso]);

  const disparar = async (modo: ModoDocumento) => {
    if (ocupado) return;

    /*
     * O clique não abre guia nenhuma — quem abre é `abrirDocumento`, depois
     * que o PNG existe. Abrir antes escondia ESTA aba, e aba escondida não
     * roda `requestAnimationFrame`: a foto que a guia esperava nunca ficava
     * pronta. O porquê inteiro está em `downloadNota`.
     */
    setMenuAberto(false);
    setEmCurso(modo);

    if (delegado) {
      try {
        await onAbrir(modo);
      } catch (err) {
        console.error("Erro ao preparar o documento", err);
      } finally {
        setEmCurso(null);
      }

      return;
    }

    if (!refNota) {
      setEmCurso(null);
      return;
    }

    try {
      const blob = await gerarBlobNota(refNota);
      const nomeBase = `${prefixo}-${nomeEmpresa}`;

      await entregarDocumento(blob, modo, nomeBase, nomeEmpresa);

      setSucesso(modo);
      setTimeout(() => setSucesso(null), 2000);
    } catch (err) {
      console.error("Erro ao preparar o documento", err);
    } finally {
      setEmCurso(null);
    }
  };

  const tamanho = naLinha ? 14 : 17;

  /** Giro enquanto trabalha, ✓ quando termina, ícone do gesto no descanso. */
  const icone = (girando: boolean, feito: boolean, padrao: ReactNode) =>
    girando ? <Loader2 size={tamanho} className="animate-spin" /> : feito ? <Check size={tamanho} className="text-success" /> : padrao;

  /* Os dois botões são um controle só: um par colado, arredondado nas pontas
     de fora e sem fio dobrado no meio. */
  const base = naLinha
    ? "focus-ring flex h-[30px] shrink-0 cursor-pointer items-center gap-1.5 border border-fg/[0.08] bg-surface/90 px-2 text-mist transition-colors hover:border-accent/40 hover:bg-fg/[0.08] hover:text-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
    : "focus-ring flex h-12 shrink-0 cursor-pointer items-center gap-2 border border-fg/[0.1] px-3 text-mist transition-colors hover:border-accent/40 hover:text-accent-soft disabled:cursor-not-allowed disabled:opacity-50";

  const pontaEsquerda = naLinha ? "rounded-l-lg border-r-0" : "rounded-l-xl border-r-0";
  const pontaDireita = naLinha ? "rounded-r-lg px-2" : "rounded-r-xl px-3";

  const tituloBaixar = `Baixar ${documento === "documento" ? "o documento" : documento}`;

  const verBotao = (
    <button
      type="button"
      title={naLinha ? undefined : titulo}
      aria-label={titulo}
      disabled={ocupado}
      onClick={(ev) => {
        /* A linha inteira é clicável (abre o documento na tela): sem barrar
           aqui, pedir a guia abriria o modal por baixo dela. */
        ev.stopPropagation();
        void disparar("ver");
      }}
      className={`${base} ${pontaEsquerda}`}
    >
      {icone(ocupadoVer, sucesso === "ver", <ExternalLink size={tamanho} />)}
      {/* O nome do documento no próprio botão, e não só no `title`: dica de
          ferramenta não existe no celular, que é onde a nota é mandada.

          NA LINHA não há rótulo: só o ícone. A fileira de ações divide poucos
          pixels com o valor da venda, e agora são DOIS botões ali (ver e
          baixar) — a palavra "Ver" ao lado do par empurrava o resto da linha.
          Quem passa o mouse tem a bolha do `Dica`, que diz qual documento é;
          a seta para fora já diz que abre em outra guia. */}
      {!naLinha && (
        <span className="hidden whitespace-nowrap text-[13px] sm:inline">{ocupadoVer ? "Abrindo..." : `Ver ${documento}`}</span>
      )}
    </button>
  );

  /** Uma linha do menu de formatos. */
  const formato = (modo: Exclude<ModoDocumento, "ver">, simbolo: ReactNode, rotulo: string, para: string) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => void disparar(modo)}
      className="focus-ring flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent/[0.12]"
    >
      <span className="shrink-0 text-mist">{simbolo}</span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] text-ink">{rotulo}</span>
        {/* Para que serve cada um: quem está no balcão não escolhe formato de
            arquivo por gosto, escolhe pelo que vai fazer com ele. */}
        <span className="block truncate text-[11px] text-faint">{para}</span>
      </span>
    </button>
  );

  return (
    <div className="flex shrink-0 items-center">
      {/* `Dica` no Ver só na linha: lá o rótulo some no celular e encolhe no
          desktop, então é a bolha que diz QUAL documento abre. No rodapé o
          nome do documento já está escrito no botão. */}
      {naLinha ? <Dica texto={titulo}>{verBotao}</Dica> : verBotao}

      <Dica texto={tituloBaixar}>
        <button
          ref={refBaixar}
          type="button"
          title={naLinha ? undefined : tituloBaixar}
          aria-label={tituloBaixar}
          aria-haspopup="menu"
          aria-expanded={menuAberto}
          disabled={ocupado}
          onClick={(ev) => {
            ev.stopPropagation();
            setMenuAberto((v) => !v);
          }}
          className={`${base} ${pontaDireita}`}
        >
          {icone(ocupadoBaixar, sucessoBaixar, <Download size={tamanho} />)}
        </button>
      </Dica>

      {/* O menu vai para um portal (`Suspenso`): aqui dentro ele seria
          recortado pelo corpo rolável da lista ou pelo painel do modal — e
          `z-index` não resolve recorte. */}
      <Suspenso aberto={menuAberto} onFechar={() => setMenuAberto(false)} ancora={refBaixar} largura={208} alinhar="fim" alturaMax={200}>
        {/*
          O clique morre AQUI, e não sobe para a linha.

          O menu está num portal no `body`, mas o evento do React sobe pela
          ÁRVORE DE COMPONENTES, não pela do DOM — e a árvore deste botão
          continua sendo a da linha da lista, que é clicável inteira. Sem
          barrar, escolher o formato baixaria o arquivo E abriria o modal da
          venda por baixo dele.
        */}
        <div role="menu" aria-label={tituloBaixar} onClick={(ev) => ev.stopPropagation()}>
          {formato("pdf", <FileText size={14} />, "Baixar PDF", "Para imprimir ou arquivar")}
          {formato("png", <Imagem size={14} />, "Baixar imagem (PNG)", "Para mandar no WhatsApp")}
        </div>
      </Suspenso>
    </div>
  );
};

export default BotaoVerDocumento;
