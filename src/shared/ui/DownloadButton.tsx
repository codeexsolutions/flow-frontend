import { getFontEmbedCSS, toBlob } from "html-to-image";
import type { RefObject } from "react";
import { appInstalado } from "@/shared/pwa/appMode";

const resolveToken = (token: string, fallback: string): string => {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return raw ? `rgb(${raw})` : fallback;
};

/**
 * Converte uma imagem externa em data URI.
 *
 * `html-to-image` desenha tudo num canvas, e imagem de outro domínio sem CORS
 * "contamina" esse canvas — o navegador então proíbe exportar e o download
 * falha inteiro. Trazer os bytes para o próprio documento resolve.
 */
async function embutir(img: HTMLImageElement): Promise<boolean> {
  const src = img.getAttribute("src") ?? "";

  // Já é local ou já está embutida: nada a fazer.
  if (!src || src.startsWith("data:") || src.startsWith(window.location.origin) || src.startsWith("/")) return true;

  try {
    const resposta = await fetch(src, { mode: "cors" });

    if (!resposta.ok) return false;

    const blob = await resposta.blob();

    const dataUrl: string = await new Promise((ok, erro) => {
      const leitor = new FileReader();
      leitor.onload = () => ok(String(leitor.result));
      leitor.onerror = erro;
      leitor.readAsDataURL(blob);
    });

    img.setAttribute("data-src-original", src);
    img.setAttribute("src", dataUrl);

    return true;

  } catch {
    return false;
  }
}

/** Um quadro pintado de verdade — `rAF` sozinho ainda é antes da pintura. */
const proximoQuadro = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

/**
 * Espera as imagens do nó estarem realmente decodificadas.
 *
 * `complete` diz que o download terminou, não que o navegador já sabe desenhar
 * a imagem. Rasterizar antes do `decode()` era o que produzia o documento
 * cortado: a logo e o wallpaper entravam no meio da captura e a metade de baixo
 * saía em branco. Falha de decodificação não interrompe nada — a imagem some do
 * PNG e o resto do documento continua saindo.
 */
const esperarImagens = async (node: HTMLElement) => {
  const imgs = Array.from(node.querySelectorAll("img"));

  await Promise.all(
    imgs.map(async (img) => {
      try {
        if (!img.complete) {
          await new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          });
        }

        await img.decode?.();
      } catch {
        /* Imagem quebrada não impede o download do documento. */
      }
    }),
  );
};

/**
 * O CSS das fontes, embutido UMA vez por sessão.
 *
 * `html-to-image` embute as fontes por conta própria a cada rasterização: lê
 * todas as folhas de estilo da página, resolve cada `@font-face` e baixa os
 * arquivos de fonte. É o passo mais caro de gerar um documento, e o resultado
 * é sempre o mesmo — as folhas de estilo do app não mudam enquanto a aba está
 * aberta. Calculado aqui e reaproveitado, o segundo documento (e a segunda
 * passagem de cada um) sai sem pagar nada disso de novo.
 *
 * Falha vira string vazia: documento com fonte do sistema é melhor que
 * documento nenhum.
 */
let cssDasFontes: Promise<string> | null = null;

const fontesEmbutidas = (node: HTMLElement): Promise<string> => {
  cssDasFontes ??= getFontEmbedCSS(node).catch(() => "");
  return cssDasFontes;
};

/** Largura fixa do documento gerado — a mesma do `max-w-[900px]` da nota. */
const LARGURA_DOCUMENTO = 900;

/**
 * Copia o que o usuário digitou para a cópia da nota.
 *
 * `cloneNode` duplica os atributos, não o estado: a quantidade e o preço que
 * foram digitados vivem na PROPRIEDADE `value` do input, e a cópia nasceria com
 * o valor original do atributo. Sem isto, o arquivo sairia com números
 * diferentes dos que estão na tela — pior que sair cortado.
 */
const copiarValores = (origem: HTMLElement, copia: HTMLElement) => {
  const campos = origem.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
  const copias = copia.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");

  campos.forEach((campo, i) => {
    const alvo = copias[i];
    if (!alvo) return;

    alvo.value = campo.value;
    alvo.setAttribute("value", campo.value);

    if (campo instanceof HTMLInputElement && alvo instanceof HTMLInputElement) {
      alvo.checked = campo.checked;
      if (campo.checked) alvo.setAttribute("checked", "");
      else alvo.removeAttribute("checked");
    }
  });
};

/**
 * Rasteriza o nó da nota para um blob PNG.
 *
 * Fica separado do download: quem precisa do PNG (download) e quem precisa
 * dele para gerar um PDF usam o mesmo blob.
 *
 * **A foto sai de uma CÓPIA fora da tela, nunca do nó visível.** O nó visível
 * da nota mora dentro do corpo rolável de um modal, com a largura que sobrar na
 * janela, sob um painel que tem `transform` e `overflow-hidden`. Fotografá-lo
 * ali amarra o arquivo ao estado da tela — e era isso que entregava a nota
 * cortada quando se abria pelo "editar". A cópia vive solta no `body`, com 900px
 * fixos, sem scroller acima, sem recorte e sem rolagem: o arquivo sai igual em
 * qualquer aparelho, independente do que a pessoa estava vendo.
 *
 * De quebra, a nota na tela não é mais tocada — nada de trocar `src` para
 * embutir imagem e devolver depois.
 */
export const gerarBlobNota = async (ref: RefObject<HTMLDivElement>): Promise<Blob> => {
  const node = ref.current;
  if (!node) throw new Error("Nota não encontrada.");

  /* O palco: fora do viewport e fora de qualquer ancestral que recorte ou
     transforme. `left` negativo em vez de `display:none` — o navegador precisa
     calcular o layout de verdade para a foto existir. */
  const palco = document.createElement("div");

  palco.setAttribute("aria-hidden", "true");
  palco.style.cssText = `position:fixed;left:-20000px;top:0;width:${LARGURA_DOCUMENTO}px;pointer-events:none;z-index:-1;`;

  const copia = node.cloneNode(true) as HTMLElement;

  /* A cópia manda na própria altura: qualquer teto herdado da tela viraria
     corte no arquivo. */
  copia.style.width = `${LARGURA_DOCUMENTO}px`;
  copia.style.maxWidth = "none";
  copia.style.height = "auto";
  copia.style.maxHeight = "none";
  copia.style.margin = "0";
  copia.style.transform = "none";

  copiarValores(node, copia);
  palco.appendChild(copia);
  document.body.appendChild(palco);

  try {
    /* Imagens embutidas NA CÓPIA — a nota na tela fica intacta. */
    const imgs = Array.from(copia.querySelectorAll<HTMLImageElement>("img"));
    const embutidas = await Promise.all(imgs.map(embutir));

    /* Só some quem não deu para embutir — assim o resto da nota sai completo. */
    imgs.forEach((img, i) => {
      if (!embutidas[i]) img.style.display = "none";
    });

    /* Fontes e imagens prontas ANTES de medir: uma fonte que chega no meio da
       captura reflui o documento inteiro, e a altura medida deixa de valer. */
    await document.fonts?.ready;
    await esperarImagens(copia);
    await proximoQuadro();

    /*
     * Medida pelo retângulo real, arredondando para cima.
     *
     * `scrollHeight` é inteiro: um documento de 1240.6px virava 1240, e a
     * fração perdida corta a última linha. `getBoundingClientRect` devolve o
     * valor fracionário — o `ceil` garante que sobre pixel, nunca falte.
     */
    const caixa = copia.getBoundingClientRect();
    const largura = Math.ceil(Math.max(copia.scrollWidth, caixa.width));
    const altura = Math.ceil(Math.max(copia.scrollHeight, caixa.height));

    const fontEmbedCSS = await fontesEmbutidas(copia);

    const opcoes = {
      /*
       * Tudo marcado com `data-sem-foto` fica de fora do PNG.
       *
       * Existem controles que precisam estar na tela e não podem estar no
       * arquivo que o cliente recebe — os atalhos de pagamento parcial, por
       * exemplo. Filtrar na hora de rasterizar é mais seguro do que esconder e
       * mostrar por CSS: não há intervalo em que o elemento pisca, e não
       * depende de o `finally` conseguir devolver o estilo se algo falhar.
       */
      filter: (no: Node) => !(no instanceof HTMLElement && no.dataset.semFoto !== undefined),
      backgroundColor: resolveToken("--surface", "#15132a"),
      width: largura,
      height: altura,
      pixelRatio: 2,
      /* As fontes já vêm prontas — sem isto, `html-to-image` refaz esse
         trabalho inteiro a cada passagem. */
      fontEmbedCSS,
      /*
       * Sem `cacheBust`.
       *
       * Ele pendurava um `?t=<agora>` em cada imagem para furar o cache — o
       * que, nas duas passagens, obrigava o navegador a BAIXAR de novo a logo
       * e o wallpaper toda vez, e era boa parte da espera. As imagens de fora
       * já chegam embutidas como data URI por `embutir`, e as locais podem
       * (devem) sair do cache: não há nada velho para furar.
       */
      style: {
        transform: "none",
        transformOrigin: "top left",
      },
    };

    /*
     * Duas passagens, e é a SEGUNDA que vale.
     *
     * `html-to-image` monta um SVG com o documento inteiro e o carrega numa
     * `<img>`. Nessa primeira montagem as imagens embutidas (logo, wallpaper)
     * ainda estão sendo decodificadas pelo navegador, e o que ele pinta é o que
     * já deu tempo — daí o arquivo sair pela metade, com o rodapé em branco.
     * A primeira passagem serve só para aquecer esse cache; na segunda tudo já
     * está decodificado e o documento sai inteiro.
     *
     * Essa passagem de aquecimento vai em `pixelRatio: 1`: o que ela precisa
     * conseguir é que o navegador DECODE as imagens, e decodificar não depende
     * da escala. Em `2` ela custava o mesmo que a passagem que vale — metade
     * da espera era um arquivo que ninguém ia usar.
     */
    await toBlob(copia, { ...opcoes, pixelRatio: 1 }).catch(() => null);

    const blob = await toBlob(copia, opcoes);

    if (!blob) throw new Error("Falha ao gerar a imagem da nota.");

    return blob;

  } finally {
    /* O palco inteiro sai de cena — sem estilo para restaurar na nota real. */
    palco.remove();
  }
};

/**
 * Entrega o arquivo à pessoa — o único caminho de download do sistema.
 *
 * Serve PNG e PDF: o tipo sai da extensão do nome. Existia só para o PNG, e o
 * PDF baixava por um link solto em `downloadNota` — que é justamente o que não
 * funciona dentro do app instalado (veja abaixo). Quem salvava a nota pelo
 * atalho da tela de início recebia a imagem e não recebia o PDF.
 */
export const entregarArquivo = async (blob: Blob, filename: string) => {
  const tipo = filename.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/png";

  /**
   * App instalado (tela de início / standalone) é o único caso em que
   * `<a download>` está provadamente quebrado: essa janela roda numa
   * WKWebView (iOS) ou equivalente sem o gerenciador de downloads do
   * navegador — o clique simplesmente não tem pra onde salvar o arquivo.
   * No Safari/Chrome normais (aba de navegador), o link com blob URL abaixo
   * já baixa direto, então só entramos aqui no caso que exige outro caminho.
   *
   * A Web Share API entrega o arquivo pro sistema operacional, que mostra o
   * menu nativo de salvar/compartilhar — funciona dentro do app instalado
   * tanto no iOS quanto no Android.
   */
  if (appInstalado()) {
    const file = new File([blob], filename, { type: tipo });

    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (err) {
        // Usuário cancelou o menu de compartilhamento: não é um erro de
        // download, então não cai no fallback nem loga nada.
        if (err instanceof Error && err.name === "AbortError") return;
        throw err;
      }
    }
  }

  /* Navegador comum (não instalado): blob URL em vez de data URI. Além de
     mais leve pra notas grandes, evita o limite de tamanho que o Safari
     impõe a data URIs — o link com blob URL baixa normalmente em qualquer
     navegador de aba, incluindo Safari iOS/macOS desde a versão 13. */
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

/**
 * Baixa a nota como PNG (o fluxo de sempre).
 *
 * Antes daqui saía uma nota sem QR e sem logo: o código escondia **todas** as
 * `<img>` antes de rasterizar, para o download parar de falhar. O problema real
 * nunca foi a imagem existir — era ser de outro domínio. Agora cada imagem é
 * embutida como data URI e só é escondida a que não puder ser trazida, em vez
 * de sacrificar todas.
 */
export const handleDownload = async (ref: RefObject<HTMLDivElement>, filename = `nota-${Date.now()}.png`) => {
  try {
    const blob = await gerarBlobNota(ref);
    await entregarArquivo(blob, filename);
  } catch (err) {
    console.error("Erro ao gerar imagem da nota:", err);
    throw err;
  }
};
