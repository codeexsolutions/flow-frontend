import { useEffect, useState } from "react";
import { FileText, Image as ImageIcon, ImageOff, Loader2, Paperclip, Play } from "lucide-react";

import sysgrafix from "@/shared/api/sysgrafix";
import VisorImagem from "@/features/crm/components/VisorImagem";
import AudioMensagem from "@/features/crm/components/AudioMensagem";
import type { Mensagem } from "@/features/crm/services/crm.service";

/**
 * O arquivo de uma mensagem, buscado no WhatsApp na hora de mostrar.
 *
 * ---------------------------------------------------------------------------
 * Por que não guardamos o arquivo
 * ---------------------------------------------------------------------------
 * O WhatsApp já guarda — de graça, e é a fonte da verdade. Copiar tudo para o
 * nosso storage na chegada significava pagar armazenamento eterno por milhares
 * de figurinhas e áudios de "bom dia" que ninguém reabre. Aqui se troca espaço
 * por uma espera de um a três segundos no clique, e é a troca certa.
 *
 * ---------------------------------------------------------------------------
 * Três cuidados que fazem isso não virar um problema pior
 * ---------------------------------------------------------------------------
 * 1. **Foto carrega sozinha, sempre — mas em fila.** A imagem é o conteúdo da
 *    mensagem: pedir um clique para vê-la é o mesmo que esconder o texto atrás
 *    de um botão "ler". A versão anterior só buscava o que estava VISÍVEL, com
 *    `IntersectionObserver`, e o resultado prático foi pior do que a economia:
 *    rolar a conversa dava uma fileira de retângulos cinza que apareciam
 *    atrasados, e quem rolava rápido passava por fotos que nunca chegaram a
 *    pedir o arquivo.
 *
 *    O que segura o servidor agora é uma FILA de quatro pedidos por vez (ver
 *    `entrarNaFila`): cinquenta fotos viram cinquenta downloads que acontecem
 *    de quatro em quatro, na ordem da conversa, em vez de cinquenta viagens
 *    simultâneas ao Chromium.
 *
 *    A foto aparece INTEIRA, na proporção do arquivo (ver `medidaDa`), e a
 *    bolha não tem moldura em volta dela — quem desenha isso é a `Conversa`.
 *
 * 2. **Áudio, vídeo e documento só no clique.** Ninguém abre uma conversa para
 *    ouvir todos os áudios; imagem se olha de relance, áudio se escolhe.
 *
 * 3. **O que já veio fica.** O cache por id vale para a sessão do navegador:
 *    rolar para cima e voltar não paga de novo. O `Cache-Control` da API cobre
 *    o resto.
 *
 * Falhar é normal e não é erro: mensagem antiga sai do cache do WhatsApp Web e
 * o arquivo não vem mais. A bolha volta a mostrar o rótulo, como antes.
 */

/*
 * Cores fixas, como na bolha que envolve este componente.
 *
 * Os tokens do tema (`text-mist`, `text-faint`) mudam com claro/escuro — e a
 * bolha da conversa NÃO muda: ela é branca ou verde sempre (ver a nota de
 * cores em `Conversa`). No tema escuro, um `text-mist` claro sobre bolha
 * branca ficava invisível: o rótulo "📷 Imagem" simplesmente sumia.
 */
const TEXTO_FRACO = "#667781";
const LINK = "#027eb5";

/**
 * O que já foi baixado nesta aba, por id de mensagem.
 *
 * Fora do componente de propósito: a bolha é desmontada e remontada a cada
 * recarga silenciosa da conversa (a lista chega nova do servidor), e um cache
 * em `useState` seria descartado junto — voltando a pagar a viagem que este
 * mapa existe para evitar.
 */
type Baixado = { url: string; largura: number; altura: number };

const baixados = new Map<string, Baixado>();

/**
 * O tamanho da foto na bolha — a foto INTEIRA, nunca um pedaço dela.
 *
 * A versão anterior encaixava tudo num quadro de três formatos (1:1, 4:3, 3:4)
 * e preenchia com `object-cover`. Ficava alinhado e mentia: um print de tela,
 * um comprovante, uma etiqueta com código — o que mais chega numa conversa de
 * loja — apareciam com as pontas cortadas, e a pessoa tinha que abrir para
 * descobrir o que a miniatura escondeu.
 *
 * Agora a bolha assume a PROPORÇÃO REAL do arquivo, limitada por uma largura e
 * uma altura máximas. A conta é feita aqui e não em CSS porque `aspect-ratio`
 * com `max-height` deforma: o navegador corta a altura e mantém a largura, e a
 * foto estica. Com o tamanho calculado, a bolha nasce exata.
 */
const LARGURA_MAX = 260;
const ALTURA_MAX = 340;

const medidaDa = (largura: number, altura: number) => {
  if (!largura || !altura) return { width: LARGURA_MAX, height: LARGURA_MAX };

  const escala = Math.min(LARGURA_MAX / largura, ALTURA_MAX / altura, 1);

  /* Foto pequena não é ampliada: esticar um adesivo de 80px até 260 entrega
     um borrão onde havia uma imagem nítida. */
  return { width: Math.round(largura * escala), height: Math.round(altura * escala) };
};

/*
 * A fila de downloads.
 *
 * Quatro por vez: o suficiente para a conversa se preencher de cima a baixo
 * em poucos segundos, e pouco o bastante para não abrir cinquenta conexões
 * contra o Chromium que serve os arquivos. Quem chega depois espera a vez —
 * na ordem em que as bolhas pediram, que é a ordem da conversa.
 */
const MAX_SIMULTANEOS = 4;
let emVoo = 0;
const esperando: (() => void)[] = [];

const entrarNaFila = () =>
  new Promise<void>((liberar) => {
    if (emVoo < MAX_SIMULTANEOS) {
      emVoo += 1;
      liberar();
      return;
    }

    esperando.push(() => {
      emVoo += 1;
      liberar();
    });
  });

const sairDaFila = () => {
  emVoo -= 1;
  esperando.shift()?.();
};

type Props = { mensagem: Mensagem };

const MidiaMensagem = ({ mensagem }: Props) => {
  const guardado = baixados.get(mensagem.id);

  const [url, setUrl] = useState<string | null>(guardado?.url ?? null);
  const [medida, setMedida] = useState(() => (guardado ? medidaDa(guardado.largura, guardado.altura) : null));
  const [ampliada, setAmpliada] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [falhou, setFalhou] = useState(false);

  /* Imagem busca sozinha; o resto espera o clique — ver as notas 1 e 2. */
  const [pedido, setPedido] = useState(mensagem.tipo === "IMAGEM");

  useEffect(() => {
    if (!pedido || url || carregando || falhou) return;

    let vivo = true;
    let entrou = false;

    setCarregando(true);

    (async () => {
      try {
        await entrarNaFila();
        entrou = true;

        /* Desistiu no meio da fila (a conversa foi fechada): não gasta a
           viagem — só devolve a vaga para quem está atrás. */
        if (!vivo) return;

        const r = await sysgrafix.get(`/crm/mensagens/${mensagem.id}/midia`, { responseType: "blob", carregamento: false });

        if (!vivo) return;

        /*
         * A API responde 200 com JSON quando NÃO conseguiu o arquivo (é o
         * formato padrão dela). Sem esta checagem, um `URL.createObjectURL`
         * de um JSON viraria uma imagem quebrada — e a tela diria "aqui está
         * a foto" mostrando um ícone de erro do navegador.
         */
        const tipo = r.data?.type ?? "";

        if (tipo.includes("json") || !r.data?.size) {
          setFalhou(true);
          return;
        }

        const objeto = URL.createObjectURL(r.data as Blob);

        /*
         * O formato é medido ANTES de a foto aparecer.
         *
         * Desenhar primeiro e corrigir a moldura no `onLoad` faria cada foto
         * entrar quadrada e pular para deitada meio segundo depois — com a
         * conversa inteira dando um solavanco a cada imagem que chega. Aqui a
         * bolha já nasce no formato certo.
         */
        const tamanho = await new Promise<{ largura: number; altura: number }>((pronto) => {
          if (mensagem.tipo !== "IMAGEM") {
            pronto({ largura: 0, altura: 0 });
            return;
          }

          const regua = new Image();

          regua.onload = () => pronto({ largura: regua.naturalWidth, altura: regua.naturalHeight });
          /* Imagem que o navegador não decodifica cai na medida padrão — o
             `<img>` abaixo mostra o que conseguir dentro dela. */
          regua.onerror = () => pronto({ largura: 0, altura: 0 });
          regua.src = objeto;
        });

        if (!vivo) return;

        baixados.set(mensagem.id, { url: objeto, largura: tamanho.largura, altura: tamanho.altura });
        setMedida(medidaDa(tamanho.largura, tamanho.altura));
        setUrl(objeto);
      } catch {
        if (vivo) setFalhou(true);
      } finally {
        if (entrou) sairDaFila();
        if (vivo) setCarregando(false);
      }
    })();

    return () => {
      vivo = false;
    };
    /* `url` e `carregando` fora das dependências: eles mudam DENTRO deste
       efeito, e incluí-los o faria rodar de novo a cada passo do próprio
       carregamento. */
  }, [pedido, mensagem.id, mensagem.tipo, falhou]);

  const rotulo =
    { IMAGEM: "📷 Imagem", AUDIO: "🎤 Áudio", VIDEO: "🎬 Vídeo", DOCUMENTO: "📎 Documento", OUTRO: "Anexo", TEXTO: "" }[
      mensagem.tipo
    ] ?? "Anexo";

  /*
   * Áudio: o player desde o primeiro instante.
   *
   * Ele é o único que se desenha INTEIRO sem ter o arquivo — botão, onda e
   * tudo. O download continua acontecendo só no clique (ninguém abre uma
   * conversa para ouvir trinta recados de uma vez), mas quem clica clica no
   * PLAY, e não num link "🎤 Áudio · tocar" que depois vira outra coisa no
   * mesmo lugar. Ver `AudioMensagem`.
   */
  if (mensagem.tipo === "AUDIO" && !falhou) {
    return (
      <AudioMensagem
        url={url}
        carregando={carregando}
        onPedir={() => setPedido(true)}
        semente={mensagem.id}
        saiu={mensagem.direcao === "SAIDA"}
      />
    );
  }

  /* Sem o arquivo: o rótulo de sempre, com o motivo em voz baixa. Some da
     tela, nunca — a conversa tem de mostrar que houve uma foto ali. */
  if (falhou) {
    return (
      /* O respiro é DAQUI: a bolha de mídia não tem padding (ver `Conversa`),
         e sem isto o aviso encostaria na borda arredondada. */
      <p className="flex items-center gap-1.5 px-3 py-2 text-[11.5px]" style={{ color: TEXTO_FRACO }}>
        <ImageOff size={12} className="shrink-0" />
        {rotulo}
        <span className="opacity-70">· indisponível</span>
      </p>
    );
  }

  /*
   * Imagem sem arquivo ainda: o MESMO quadro que a foto vai ocupar.
   *
   * Nunca um botão. Este era o defeito que aparecia como "muitas imagens não
   * carregam": a imagem caía no mesmo ramo do áudio e mostrava "📷 Imagem ·
   * tocar" — quem olhava via um rótulo onde esperava a foto e concluía, com
   * razão, que ela não tinha vindo.
   *
   * Quadrado enquanto não se sabe a proporção do arquivo — ela só é conhecida
   * depois do download (ver `medidaDa`). É o palpite menos ruim: ocupa a
   * largura que a foto vai ocupar, então a conversa não muda de largura
   * quando ela chega; o que se ajusta é só a altura.
   */
  if (mensagem.tipo === "IMAGEM" && !url) {
    return (
      <div
        className="flex max-w-full items-center justify-center"
        style={{ width: LARGURA_MAX, aspectRatio: "1 / 1", background: "rgba(0,0,0,0.05)", color: TEXTO_FRACO }}
      >
        {carregando ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} className="opacity-60" />}
      </div>
    );
  }

  if (carregando) {
    return (
      <p className="flex items-center gap-1.5 px-3 py-2 text-[11.5px]" style={{ color: TEXTO_FRACO }}>
        <Loader2 size={12} className="animate-spin" /> {rotulo}
      </p>
    );
  }

  /* Áudio, vídeo e documento ainda não pedidos: o botão que traz o arquivo. */
  if (!url) {
    return (
      <>
        <button
          type="button"
          onClick={() => setPedido(true)}
          style={{ color: LINK }}
          className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-[11.5px] transition-opacity hover:opacity-75"
        >
          {mensagem.tipo === "VIDEO" ? <Play size={12} /> : <Paperclip size={12} />}
          {rotulo} <span style={{ color: TEXTO_FRACO }}>· tocar</span>
        </button>
      </>
    );
  }

  if (mensagem.tipo === "IMAGEM") {
    return (
      <>
        {/* A foto é a mensagem: ela ocupa a bolha de ponta a ponta, no tamanho
            que o arquivo tem (ver `medidaDa`). Clicar abre o visor por cima da
            conversa, e não uma aba nova — ver `VisorImagem`. */}
        <button
          type="button"
          onClick={() => setAmpliada(true)}
          aria-label="Ver a foto em tela cheia"
          className="block max-w-full cursor-zoom-in"
          style={{ width: medida?.width ?? LARGURA_MAX, background: "rgba(0,0,0,0.05)" }}
        >
          <img
            src={url}
            alt={mensagem.corpo ?? "Imagem recebida"}
            className="block h-auto w-full"
            style={{ maxHeight: ALTURA_MAX }}
          />
        </button>

        {ampliada && <VisorImagem url={url} alt={mensagem.corpo ?? undefined} onFechar={() => setAmpliada(false)} />}
      </>
    );
  }

  if (mensagem.tipo === "VIDEO") {
    /* Mesma largura da foto, para a coluna de mídia não serrilhar. `contain`
       e não `cover`: cortar imagem parada é aceitável, cortar cena de vídeo
       tira justamente o que a pessoa filmou. */
    return (
      <video
        controls
        autoPlay
        src={url}
        className="block max-w-full bg-black/[0.06] object-contain"
        style={{ width: LARGURA_MAX, maxHeight: ALTURA_MAX }}
      />
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      style={{ color: LINK }}
      className="flex items-center gap-1.5 px-3 py-2 text-[12px] underline underline-offset-2"
    >
      <FileText size={12} /> Abrir arquivo
    </a>
  );
};

export default MidiaMensagem;
