/**
 * Tirar uma foto no navegador — pela câmera ao vivo ou pelo app do aparelho.
 *
 * ---------------------------------------------------------------------------
 * Por que existem DOIS caminhos (a mesma história da geolocalização)
 * ---------------------------------------------------------------------------
 * `getUserMedia` — a câmera ao vivo dentro da página — só existe em contexto
 * seguro: `https://` ou `localhost`. Fora disso o navegador não recusa com um
 * erro claro: ele nem define `navigator.mediaDevices`. A chamada estoura um
 * `TypeError` ("undefined is not an object"), que um `catch` genérico traduz
 * como "não foi possível abrir a câmera, autorize o acesso" — mandando a
 * pessoa liberar uma permissão que não é o problema. Foi exatamente o que
 * aconteceu no iPhone abrindo o sistema pelo IP da rede.
 *
 * O segundo caminho é o `<input type="file" capture>`: ele abre o app de
 * câmera do próprio aparelho, funciona em `http://` e não pede permissão de
 * site nenhuma. Perde a prévia ao vivo e ganha o que importa mais — funcionar.
 *
 * ---------------------------------------------------------------------------
 * O que o iOS exige quando o caminho bom está disponível
 * ---------------------------------------------------------------------------
 * O Safari só toca um `<video>` inline se ele tiver `playsinline` E `muted`, e
 * o `play()` precisa acontecer perto do gesto que o originou. Por isso quem
 * chama estas funções deve ter o `<video>` já montado no DOM antes do clique —
 * atribuir `srcObject` num `requestAnimationFrame` posterior quebra a cadeia.
 */

export type EstadoCamera = { ok: boolean; motivo?: string };

/**
 * A câmera ao vivo está disponível nesta página?
 *
 * A checagem de `mediaDevices` vem antes da de contexto seguro porque é ela
 * que de fato falta — em `http://` o objeto simplesmente não existe.
 */
export const cameraAoVivoDisponivel = (): EstadoCamera => {
  if (typeof window === "undefined") return { ok: false, motivo: "Câmera indisponível." };

  if (!window.isSecureContext) {
    return {
      ok: false,
      motivo: "O navegador só libera a câmera em páginas seguras (https). Aqui a foto é tirada pelo app de câmera do aparelho.",
    };
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, motivo: "Este navegador não abre a câmera dentro da página. Use o botão de tirar foto pelo aparelho." };
  }

  return { ok: true };
};

/** Câmera frontal: o ponto quer o rosto de quem está batendo, não o balcão. */
export const RESTRICOES_CAMERA: MediaStreamConstraints = {
  video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
  audio: false,
};

/**
 * O arquivo escolhido vira uma imagem pequena em base64.
 *
 * A foto do app de câmera de um iPhone tem 3–5 MB e 4000px de largura. Sem
 * reduzir, o corpo da requisição passa do teto do servidor e a batida falha
 * justamente para quem usou o caminho alternativo — que é quem já estava com
 * dificuldade.
 *
 * `createImageBitmap` decodifica fora da thread principal e entende HEIC nos
 * navegadores que abrem esse formato; onde ele não existe, o `<img>` resolve.
 */
export const arquivoParaBase64 = async (arquivo: File, largura = 640): Promise<string> => {
  const bitmap = await criarBitmap(arquivo);

  const escala = Math.min(1, largura / bitmap.width);
  const canvas = document.createElement("canvas");

  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);

  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL("image/jpeg", 0.8);
};

const criarBitmap = async (arquivo: File): Promise<ImageBitmap | HTMLImageElement> => {
  if ("createImageBitmap" in window) {
    try {
      /*
       * `imageOrientation: "from-image"` aplica a rotação gravada no EXIF.
       *
       * Sem isto a foto sai DEITADA ou de cabeça para baixo, e só nesse
       * caminho — o do app de câmera do aparelho. O celular quase nunca gira
       * os pixels ao salvar: ele grava a imagem como o sensor leu e anota "está
       * de lado" no EXIF. Todo visualizador respeita a anotação; o
       * `createImageBitmap` sem esta opção, não. O `drawImage` seguinte copia
       * os pixels crus e o resultado é a foto tombada, com a anotação perdida
       * na conversão para JPEG — sem como consertar depois.
       */
      return await createImageBitmap(arquivo, { imageOrientation: "from-image" });
    } catch {
      /* HEIC sem suporte cai no `<img>`, que o Safari lê nativamente — e que
         aplica a orientação do EXIF por conta própria. */
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a imagem."));
    };

    img.src = url;
  });
};
