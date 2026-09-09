import { useEffect, useRef, useState, type RefObject } from "react";
import { ExternalLink, Loader2, Check } from "lucide-react";

import Dica from "@/shared/ui/Dica";
import { gerarBlobNota } from "@/shared/ui/DownloadButton";
import { abrirDocumento, reservarAba } from "@/shared/ui/downloadNota";

/**
 * O ÚNICO botão de documento do sistema — nota, recibo, orçamento, holerite.
 *
 * Um clique, uma coisa só: **o documento abre numa guia**. Baixar acontece lá
 * dentro, em dois botões (PDF e imagem), e só para quem realmente quer o
 * arquivo.
 *
 * ---------------------------------------------------------------------------
 * Por que não há mais menu
 * ---------------------------------------------------------------------------
 * Este botão já foi quatro botões diferentes, depois virou um menu com PNG e
 * PDF, e agora é um gesto. A razão é a ordem real do trabalho: o que se faz o
 * dia inteiro é CONFERIR o documento — o desconto saiu certo? a foto entrou? —
 * e mandá-lo para o cliente. Baixar é a exceção.
 *
 * Com o menu, toda conferência custava dois cliques e uma escolha entre dois
 * formatos que, para só olhar, não fazem diferença nenhuma. Pior: ver exigia
 * baixar, e no fim do dia a pasta de downloads tinha vinte notas que ninguém
 * queria guardar.
 *
 * A guia resolve os dois: mostra o documento em tamanho de leitura e oferece
 * os dois formatos ali, já prontos. Quem só queria olhar fecha a guia e não
 * deixa nada para trás.
 *
 * ---------------------------------------------------------------------------
 * Dois modos
 * ---------------------------------------------------------------------------
 * Com `refNota`, o botão rasteriza o nó que recebeu. Com `onAbrir`, quem
 * prepara é a tela — as listas mantêm UM nó escondido e trocam o conteúdo pelo
 * da linha escolhida antes de fotografar, e esse preparo não é daqui.
 */

type Props = {
  /**
   * Ref do nó a rasterizar (o documento em si).
   *
   * Obrigatório no modo normal. Em `onAbrir` quem abre é a tela, e este ref
   * não é usado.
   */
  refNota?: RefObject<HTMLDivElement>;
  /**
   * Quem abre, quando não é o componente.
   *
   * A tela prepara o nó escondido com o documento da linha e chama
   * `abrirDocumento`. Neste modo o botão só dispara e mostra o estado que a
   * tela informa em `ocupado`.
   */
  onAbrir?: () => void | Promise<void>;
  /** Estado de "gerando" quando quem abre é a tela (`onAbrir`). */
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
  const [ocupadoInterno, setOcupadoInterno] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  const delegado = typeof onAbrir === "function";
  const ocupado = delegado ? ocupadoExterno : ocupadoInterno;
  const naLinha = variante === "linha";

  /*
   * O ✓ de "pronto" também quando quem abre é a tela.
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

    setSucesso(true);
    const t = setTimeout(() => setSucesso(false), 2000);

    return () => clearTimeout(t);
  }, [delegado, ocupadoExterno]);

  const abrir = async () => {
    if (ocupado) return;

    /*
     * A guia nasce AQUI, dentro do clique.
     *
     * Rasterizar o documento leva de meio a dois segundos, e `window.open`
     * chamado depois disso é bloqueado como pop-up em todo navegador — o
     * bloqueador só libera a janela que nasce do gesto da pessoa.
     */
    reservarAba();

    if (delegado) {
      await onAbrir();
      return;
    }

    if (!refNota) return;

    setOcupadoInterno(true);

    try {
      const blob = await gerarBlobNota(refNota);

      await abrirDocumento(blob, `${prefixo}-${nomeEmpresa}`, nomeEmpresa);

      setSucesso(true);
      setTimeout(() => setSucesso(false), 2000);
    } catch (err) {
      console.error("Erro ao abrir o documento", err);
    } finally {
      setOcupadoInterno(false);
    }
  };

  /* A seta de "abre em outra guia" no lugar da de download: o ícone passou a
     dizer o que o clique faz. */
  const icone = ocupado ? (
    <Loader2 size={naLinha ? 14 : 17} className="animate-spin" />
  ) : sucesso ? (
    <Check size={naLinha ? 14 : 17} className="text-success" />
  ) : (
    <ExternalLink size={naLinha ? 14 : 17} />
  );

  const botao = (
    <button
      type="button"
      title={naLinha ? undefined : titulo}
      aria-label={titulo}
      disabled={ocupado}
      onClick={(ev) => {
        /* A linha inteira é clicável (abre o documento na tela): sem barrar
           aqui, pedir a guia abriria o modal por baixo dela. */
        ev.stopPropagation();
        void abrir();
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
        <span className="hidden whitespace-nowrap text-[11.5px] sm:inline">{ocupado ? "Abrindo..." : "Ver"}</span>
      ) : (
        <span className="hidden whitespace-nowrap text-[13px] sm:inline">{ocupado ? "Abrindo..." : `Ver ${documento}`}</span>
      )}
    </button>
  );

  /* `Dica` só na linha: lá o rótulo some no celular e encolhe no desktop,
     então é a bolha que diz QUAL documento abre. No rodapé o nome do documento
     já está escrito no botão. */
  return naLinha ? <Dica texto={titulo}>{botao}</Dica> : botao;
};

export default BotaoVerDocumento;
