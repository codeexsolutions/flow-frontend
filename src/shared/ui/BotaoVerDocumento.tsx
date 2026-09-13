import { useEffect, useRef, useState, type RefObject } from "react";
import { Download, ExternalLink, Loader2, Check } from "lucide-react";

import Dica from "@/shared/ui/Dica";
import { gerarBlobNota } from "@/shared/ui/DownloadButton";
import { abrirDocumento, baixarDocumento, descartarAba, reservarAba } from "@/shared/ui/downloadNota";

/**
 * O ÚNICO controle de documento do sistema — nota, recibo, orçamento, holerite.
 *
 * Dois gestos colados: **Ver** abre o documento numa guia e **Baixar** manda o
 * PDF direto para a pasta de downloads, sem guia nenhuma.
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
 * Dois modos
 * ---------------------------------------------------------------------------
 * Com `refNota`, o botão rasteriza o nó que recebeu. Com `onAbrir`, quem
 * prepara é a tela — as listas mantêm UM nó escondido e trocam o conteúdo pelo
 * da linha escolhida antes de fotografar, e esse preparo não é daqui. Nesse
 * modo o `modo` ("ver" ou "baixar") chega como argumento, e é a tela que chama
 * `abrirDocumento` ou `baixarDocumento`.
 */

/** O que o clique faz: abrir numa guia ou baixar o PDF direto. */
export type ModoDocumento = "ver" | "baixar";

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
   * `abrirDocumento` ou `baixarDocumento`, conforme o `modo` recebido. Neste
   * modo o botão só dispara e mostra o estado que a tela informa em `ocupado`.
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
  /** Qual dos dois gestos está em andamento — `null` quando nenhum. */
  const [emCurso, setEmCurso] = useState<ModoDocumento | null>(null);
  const [sucesso, setSucesso] = useState<ModoDocumento | null>(null);

  const delegado = typeof onAbrir === "function";
  const naLinha = variante === "linha";

  /*
   * No modo delegado quem diz se está ocupado é a tela — mas ela só informa
   * QUE está, não qual dos dois gestos foi pedido. O `emCurso` guarda isso
   * daqui, para o giro aparecer no botão que a pessoa apertou.
   */
  const ocupado = delegado ? ocupadoExterno || emCurso !== null : emCurso !== null;
  const ocupadoBaixar = ocupado && emCurso === "baixar";
  const ocupadoVer = ocupado && !ocupadoBaixar;

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
     * A guia nasce AQUI, dentro do clique.
     *
     * Rasterizar o documento leva de meio a dois segundos, e `window.open`
     * chamado depois disso é bloqueado como pop-up em todo navegador — o
     * bloqueador só libera a janela que nasce do gesto da pessoa. Baixar não
     * abre guia nenhuma, então não reserva nada.
     */
    if (modo === "ver") reservarAba();

    setEmCurso(modo);

    if (delegado) {
      try {
        await onAbrir(modo);
      } catch (err) {
        console.error("Erro ao preparar o documento", err);
        if (modo === "ver") descartarAba();
        setEmCurso(null);
      }

      return;
    }

    if (!refNota) {
      if (modo === "ver") descartarAba();
      setEmCurso(null);
      return;
    }

    try {
      const blob = await gerarBlobNota(refNota);
      const nomeBase = `${prefixo}-${nomeEmpresa}`;

      if (modo === "ver") await abrirDocumento(blob, nomeBase, nomeEmpresa);
      else await baixarDocumento(blob, nomeBase, nomeEmpresa);

      setSucesso(modo);
      setTimeout(() => setSucesso(null), 2000);
    } catch (err) {
      console.error("Erro ao preparar o documento", err);
      /* A guia em branco reservada no clique não pode ficar órfã na tela. */
      if (modo === "ver") descartarAba();
    } finally {
      setEmCurso(null);
    }
  };

  const tamanho = naLinha ? 14 : 17;

  const icone = (modo: ModoDocumento, girando: boolean) =>
    girando ? (
      <Loader2 size={tamanho} className="animate-spin" />
    ) : sucesso === modo ? (
      <Check size={tamanho} className="text-success" />
    ) : modo === "ver" ? (
      <ExternalLink size={tamanho} />
    ) : (
      <Download size={tamanho} />
    );

  /* Os dois botões são um controle só: um par colado, arredondado nas pontas
     de fora e sem fio dobrado no meio. */
  const base = naLinha
    ? "focus-ring flex h-[30px] shrink-0 cursor-pointer items-center gap-1.5 border border-fg/[0.08] bg-surface/90 px-2 text-mist transition-colors hover:border-accent/40 hover:bg-fg/[0.08] hover:text-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
    : "focus-ring flex h-12 shrink-0 cursor-pointer items-center gap-2 border border-fg/[0.1] px-3 text-mist transition-colors hover:border-accent/40 hover:text-accent-soft disabled:cursor-not-allowed disabled:opacity-50";

  const pontaEsquerda = naLinha ? "rounded-l-lg border-r-0" : "rounded-l-xl border-r-0";
  const pontaDireita = naLinha ? "rounded-r-lg px-2" : "rounded-r-xl px-3";

  const tituloBaixar = `Baixar ${documento === "documento" ? "o documento" : documento} em PDF`;

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
      {icone("ver", ocupadoVer)}
      {/* O nome do documento no próprio botão, e não só no `title`: dica de
          ferramenta não existe no celular, que é onde a nota é mandada.
          Na linha o rótulo é curto e some no celular — ali a fileira de ações
          divide poucos pixels com o valor da venda. */}
      {naLinha ? (
        <span className="hidden whitespace-nowrap text-[11.5px] sm:inline">{ocupadoVer ? "Abrindo..." : "Ver"}</span>
      ) : (
        <span className="hidden whitespace-nowrap text-[13px] sm:inline">{ocupadoVer ? "Abrindo..." : `Ver ${documento}`}</span>
      )}
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
          type="button"
          title={naLinha ? undefined : tituloBaixar}
          aria-label={tituloBaixar}
          disabled={ocupado}
          onClick={(ev) => {
            ev.stopPropagation();
            void disparar("baixar");
          }}
          className={`${base} ${pontaDireita}`}
        >
          {icone("baixar", ocupadoBaixar)}
        </button>
      </Dica>
    </div>
  );
};

export default BotaoVerDocumento;
