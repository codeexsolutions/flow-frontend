import { useEffect, useRef, useState } from "react";
import { FileText, Image as ImageIcon, ImageOff, Loader2, Paperclip, Play } from "lucide-react";

import sysgrafix from "@/shared/api/sysgrafix";
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
 * 1. **Só o que está VISÍVEL busca.** Uma conversa de cinquenta mensagens com
 *    vinte fotos dispararia vinte viagens ao Chromium na abertura — mais lento
 *    que a versão que a gente acabou de tirar. O `IntersectionObserver` faz a
 *    imagem carregar quando a pessoa chega nela.
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
const baixados = new Map<string, string>();

type Props = { mensagem: Mensagem };

const MidiaMensagem = ({ mensagem }: Props) => {
  const [url, setUrl] = useState<string | null>(() => baixados.get(mensagem.id) ?? null);
  const [carregando, setCarregando] = useState(false);
  const [falhou, setFalhou] = useState(false);

  /* Imagem carrega ao aparecer; o resto espera o clique — ver a nota 2. */
  const [pedido, setPedido] = useState(mensagem.tipo === "IMAGEM");
  const caixa = useRef<HTMLDivElement>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const no = caixa.current;

    if (!no || visivel) return;

    /* Navegador sem `IntersectionObserver` carrega direto: melhor gastar a
       viagem do que deixar a foto invisível para sempre. */
    if (typeof IntersectionObserver === "undefined") {
      setVisivel(true);
      return;
    }

    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setVisivel(true);
          observador.disconnect();
        }
      },
      /*
       * Margem larga de propósito.
       *
       * A conversa abre rolada até o fim, e o que a pessoa faz em seguida é
       * subir para ler o que veio antes. Com uma margem curta, cada foto só
       * começava a carregar quando já estava na tela — e a rolagem virava uma
       * sequência de retângulos cinza que iam aparecendo atrasados.
       *
       * O servidor aguenta: oito pedidos simultâneos voltaram em milissegundos
       * (o arquivo já está decifrado no cache do WhatsApp Web).
       */
      { rootMargin: "1200px" },
    );

    observador.observe(no);

    return () => observador.disconnect();
  }, [visivel]);

  useEffect(() => {
    if (!pedido || !visivel || url || carregando || falhou) return;

    let vivo = true;

    setCarregando(true);

    sysgrafix
      .get(`/crm/mensagens/${mensagem.id}/midia`, { responseType: "blob", carregamento: false })
      .then((r) => {
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

        baixados.set(mensagem.id, objeto);
        setUrl(objeto);
      })
      .catch(() => vivo && setFalhou(true))
      .finally(() => vivo && setCarregando(false));

    return () => {
      vivo = false;
    };
    /* `url` e `carregando` fora das dependências: eles mudam DENTRO deste
       efeito, e incluí-los o faria rodar de novo a cada passo do próprio
       carregamento. */
  }, [pedido, visivel, mensagem.id, falhou]);

  const rotulo =
    { IMAGEM: "📷 Imagem", AUDIO: "🎤 Áudio", VIDEO: "🎬 Vídeo", DOCUMENTO: "📎 Documento", OUTRO: "Anexo", TEXTO: "" }[
      mensagem.tipo
    ] ?? "Anexo";

  /* Sem o arquivo: o rótulo de sempre, com o motivo em voz baixa. Some da
     tela, nunca — a conversa tem de mostrar que houve uma foto ali. */
  if (falhou) {
    return (
      <p className="mb-0.5 flex items-center gap-1.5 text-[11.5px]" style={{ color: TEXTO_FRACO }}>
        <ImageOff size={12} className="shrink-0" />
        {rotulo}
        <span className="opacity-70">· indisponível</span>
      </p>
    );
  }

  /*
   * Imagem sem arquivo ainda: um retângulo, nunca um botão.
   *
   * Este era o defeito que aparecia como "muitas imagens não carregam". A
   * imagem caía no mesmo ramo do áudio e mostrava "📷 Imagem · tocar" — quem
   * olhava via um rótulo onde esperava a foto e concluía, com razão, que ela
   * não tinha vindo. O arquivo estava bem: era a tela que pedia um clique que
   * ninguém devia precisar dar.
   *
   * O retângulo também dá ao observador algo com ALTURA para observar. Um
   * `<p>` de uma linha no fim da conversa entra e sai da margem conforme o
   * texto ao redor, e a foto ficava esperando um cruzamento que demorava.
   */
  if (mensagem.tipo === "IMAGEM" && !url) {
    return (
      <div
        ref={caixa}
        className="mb-1 flex h-32 w-44 items-center justify-center rounded-xl"
        style={{ background: "rgba(0,0,0,0.05)", color: TEXTO_FRACO }}
      >
        {carregando ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} className="opacity-60" />}
      </div>
    );
  }

  if (carregando) {
    return (
      <p className="mb-0.5 flex items-center gap-1.5 text-[11.5px]" style={{ color: TEXTO_FRACO }}>
        <Loader2 size={12} className="animate-spin" /> {rotulo}
      </p>
    );
  }

  /* Áudio, vídeo e documento ainda não pedidos: o botão que traz o arquivo. */
  if (!url) {
    return (
      <div ref={caixa}>
        <button
          type="button"
          onClick={() => setPedido(true)}
          style={{ color: LINK }}
          className="mb-0.5 flex cursor-pointer items-center gap-1.5 text-[11.5px] transition-opacity hover:opacity-75"
        >
          {mensagem.tipo === "AUDIO" || mensagem.tipo === "VIDEO" ? <Play size={12} /> : <Paperclip size={12} />}
          {rotulo} <span style={{ color: TEXTO_FRACO }}>· tocar</span>
        </button>
      </div>
    );
  }

  if (mensagem.tipo === "IMAGEM") {
    return (
      <div ref={caixa}>
        <a href={url} target="_blank" rel="noreferrer" className="mb-1 block overflow-hidden rounded-xl">
          {/* `max-h` para foto em pé não empurrar a conversa para fora da
              tela. Clicar abre no tamanho real. */}
          <img src={url} alt={mensagem.corpo ?? "Imagem recebida"} className="max-h-72 w-auto rounded-xl object-cover" />
        </a>
      </div>
    );
  }

  if (mensagem.tipo === "AUDIO") {
    return (
      <div ref={caixa}>
        <audio controls autoPlay src={url} className="mb-1 w-full max-w-[260px]" />
      </div>
    );
  }

  if (mensagem.tipo === "VIDEO") {
    return (
      <div ref={caixa}>
        <video controls autoPlay src={url} className="mb-1 max-h-72 w-auto rounded-xl" />
      </div>
    );
  }

  return (
    <div ref={caixa}>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        style={{ color: LINK }}
        className="mb-1 flex items-center gap-1.5 text-[12px] underline underline-offset-2"
      >
        <FileText size={12} /> Abrir arquivo
      </a>
    </div>
  );
};

export default MidiaMensagem;
