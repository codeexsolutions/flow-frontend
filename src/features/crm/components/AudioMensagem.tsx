import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Mic, Pause, Play } from "lucide-react";

/**
 * O áudio da conversa — o player, não os controles do navegador.
 *
 * A bolha mostrava um `<audio controls>` cru: uma barra cinza de 260px com o
 * desenho que cada navegador inventa, alta demais, com botão de volume e menu
 * de três pontinhos que ninguém usa numa conversa — e diferente no Chrome, no
 * Firefox e no celular. Dentro de uma tela que imita o WhatsApp, era a única
 * peça que denunciava que aquilo não é o WhatsApp.
 *
 * Este faz as quatro coisas que se faz com um recado de voz:
 *
 * 1. **Tocar e pausar**, num botão redondo verde — é o gesto de 95% dos casos.
 * 2. **Ver quanto falta.** O tempo conta para cima enquanto toca e mostra a
 *    duração quando parado, que é o que decide se dá para ouvir agora.
 * 3. **Pular para um trecho.** A onda é clicável: reouvir o endereço que o
 *    cliente falou no fim não pode exigir escutar o recado inteiro de novo.
 * 4. **Acelerar.** 1x → 1,5x → 2x, no mesmo lugar do WhatsApp. Quem atende
 *    ouve dezenas de áudios por dia, e metade deles é "alô? tá me ouvindo?".
 *
 * ---------------------------------------------------------------------------
 * A onda é decorativa, e é honesta sobre isso
 * ---------------------------------------------------------------------------
 * As barras NÃO são a forma de onda real do arquivo: para desenhá-la seria
 * preciso baixar o áudio inteiro e decodificá-lo na `AudioContext` antes de
 * mostrar qualquer coisa — segundos de espera e memória por bolha, numa lista
 * que pode ter trinta recados.
 *
 * Elas são geradas do id da mensagem (ver `ondaDe`): irregulares como uma
 * voz, e sobretudo ESTÁVEIS — o mesmo áudio desenha a mesma onda toda vez que
 * a conversa é aberta. O que a onda informa de verdade é o PROGRESSO, e esse
 * é real: a parte pintada é o quanto já tocou.
 */

/* As cores da conversa são fixas — ver a nota em `Conversa`. Um player que
   seguisse o tema ficaria com barras claras sobre a bolha branca no escuro. */
const TINTA = "#667781";
const ONDA_PARADA = "#c8d2d8";
const ONDA_TOCADA = "#00a884";
const VERDE = "#00a884";

/* Vinte e seis barras num player de 190px: mais que isso vira hachura, menos
   vira gráfico de barras. */
const BARRAS = 26;

/**
 * A onda de uma mensagem — sempre a mesma para o mesmo id.
 *
 * Um gerador congruente simples semeado pelo id: `Math.random()` daria uma
 * onda nova a cada render, e o recado mudaria de cara enquanto toca.
 */
const ondaDe = (semente: string): number[] => {
  let n = 0;

  for (let i = 0; i < semente.length; i += 1) n = (n * 31 + semente.charCodeAt(i)) >>> 0;

  return Array.from({ length: BARRAS }, () => {
    n = (n * 1664525 + 1013904223) >>> 0;

    /* Entre 22% e 100% da altura: barra muito baixa vira poeira na linha, e
       fila de barras iguais não parece voz. */
    return 0.22 + ((n >>> 8) % 1000) / 1000 * 0.78;
  });
};

/** "0:07", "1:42" — o relógio do recado, como no aplicativo. */
const relogio = (segundos: number): string => {
  if (!Number.isFinite(segundos) || segundos < 0) return "0:00";

  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60);

  return `${m}:${String(s).padStart(2, "0")}`;
};

const VELOCIDADES = [1, 1.5, 2] as const;

type Props = {
  /** `null` = o arquivo ainda não foi buscado; tocar é quem o pede. */
  url: string | null;
  carregando?: boolean;
  /** Pede o arquivo — a mídia só baixa no clique (ver `MidiaMensagem`). */
  onPedir: () => void;
  /** Semente da onda: o id da mensagem. */
  semente: string;
  /** Recado que a loja mandou — muda de lado, não de forma. */
  saiu?: boolean;
};

const AudioMensagem = ({ url, carregando = false, onPedir, semente, saiu = false }: Props) => {
  const audio = useRef<HTMLAudioElement>(null);
  const onda = useMemo(() => ondaDe(semente), [semente]);

  const [tocando, setTocando] = useState(false);
  const [atual, setAtual] = useState(0);
  const [duracao, setDuracao] = useState(0);
  const [velocidade, setVelocidade] = useState<number>(1);
  /* O clique no play foi dado antes de o arquivo existir: quando ele chegar,
     toca sozinho — senão a pessoa clica duas vezes para ouvir uma vez. */
  const [pedido, setPedido] = useState(false);

  /*
   * A duração de um áudio de WhatsApp costuma vir `Infinity`.
   *
   * O arquivo é um OGG/Opus de fluxo, sem a duração no cabeçalho, e o
   * navegador só a descobre depois de percorrê-lo. O truque conhecido é
   * mandá-lo para um instante impossível: ele corre o arquivo até o fim, passa
   * a saber o tamanho, e voltamos o cursor para zero.
   */
  const medirDuracao = () => {
    const no = audio.current;

    if (!no) return;

    if (Number.isFinite(no.duration) && no.duration > 0) {
      setDuracao(no.duration);
      return;
    }

    const aoAtualizar = () => {
      if (!Number.isFinite(no.duration)) return;

      no.removeEventListener("timeupdate", aoAtualizar);
      setDuracao(no.duration);
      no.currentTime = 0;
    };

    no.addEventListener("timeupdate", aoAtualizar);
    no.currentTime = 1e101;
  };

  /* Chegou o arquivo depois do clique: toca. */
  useEffect(() => {
    if (!url || !pedido) return;

    void audio.current?.play().catch(() => setTocando(false));
  }, [url, pedido]);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = velocidade;
  }, [velocidade, url]);

  const alternar = () => {
    const no = audio.current;

    if (!url) {
      setPedido(true);
      onPedir();
      return;
    }

    if (!no) return;

    if (no.paused) void no.play().catch(() => setTocando(false));
    else no.pause();
  };

  /** Clicar na onda pula para aquele ponto do recado. */
  const pular = (e: React.MouseEvent<HTMLDivElement>) => {
    const no = audio.current;

    if (!no || !duracao) return;

    const caixa = e.currentTarget.getBoundingClientRect();
    const fracao = Math.min(Math.max((e.clientX - caixa.left) / caixa.width, 0), 1);

    no.currentTime = fracao * duracao;
    setAtual(no.currentTime);
  };

  const progresso = duracao > 0 ? Math.min(atual / duracao, 1) : 0;

  return (
    <div className="flex w-[190px] max-w-full items-center gap-2">
      {/*
       * Tocar/pausar — redondo, verde, 30px.
       *
       * Era um botão branco de 36 com sombra, e ficava do tamanho do avatar
       * de um contato dentro de uma bolha de recado. Verde cheio com o ícone
       * branco é menor e se enxerga melhor: a cor já diz "aperte aqui", e não
       * depende de uma sombra que some na bolha clara.
       */}
      <button
        type="button"
        onClick={alternar}
        aria-label={tocando ? "Pausar o áudio" : "Tocar o áudio"}
        className="flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full text-white transition-transform active:scale-90"
        style={{ background: VERDE }}
      >
        {carregando ? <Loader2 size={13} className="animate-spin" /> : tocando ? <Pause size={13} /> : <Play size={13} className="ml-[1px]" />}
      </button>

      <div className="min-w-0 flex-1">
        {/* A onda, com o ponto da posição — o detalhe que faz parecer um
            player e não um gráfico. `relative` para o ponto se prender a ela. */}
        <div
          onClick={pular}
          role="presentation"
          className="relative flex h-[18px] cursor-pointer items-center gap-[1.5px]"
        >
          {onda.map((altura, i) => (
            <span
              key={i}
              className="flex-1 rounded-full"
              style={{
                height: `${Math.round(altura * 100)}%`,
                minWidth: 1.5,
                background: i / BARRAS <= progresso ? ONDA_TOCADA : ONDA_PARADA,
              }}
            />
          ))}

          {/* Só aparece depois que o recado começou: em recado parado ele
              seria um enfeite pousado no zero. */}
          {(tocando || atual > 0) && (
            <span
              aria-hidden
              className="pointer-events-none absolute top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: `${progresso * 100}%`, background: VERDE, boxShadow: "0 0 0 2px rgba(255,255,255,0.9)" }}
            />
          )}
        </div>

        <div className="mt-[1px] flex items-center gap-1.5 text-[9.5px]" style={{ color: TINTA }}>
          {/* Parado mostra a duração; tocando, o quanto já passou — é a
              pergunta que muda de uma situação para a outra. */}
          <span className="tabular-nums">{relogio(tocando || atual > 0 ? atual : duracao)}</span>

          {/* O microfone diz que é recado de voz, e não um mp3 anexado. */}
          {!tocando && atual === 0 && <Mic size={9} className="opacity-60" style={{ color: saiu ? VERDE : TINTA }} />}

          <span className="flex-1" />

          {(tocando || atual > 0) && (
            <button
              type="button"
              onClick={() => setVelocidade((v) => VELOCIDADES[(VELOCIDADES.indexOf(v as 1) + 1) % VELOCIDADES.length])}
              aria-label={`Velocidade ${velocidade}x — tocar mais rápido`}
              className="cursor-pointer rounded-full px-1 text-[9px] tabular-nums transition-opacity hover:opacity-70"
              style={{ background: "rgba(0,0,0,0.06)" }}
            >
              {String(velocidade).replace(".", ",")}x
            </button>
          )}
        </div>
      </div>

      {url && (
        <audio
          ref={audio}
          src={url}
          preload="metadata"
          onLoadedMetadata={medirDuracao}
          onTimeUpdate={(e) => setAtual(e.currentTarget.currentTime)}
          onPlay={() => setTocando(true)}
          onPause={() => setTocando(false)}
          onEnded={() => {
            setTocando(false);
            /* Volta ao começo: um recado que termina e fica com a onda toda
               pintada não diz se já foi ouvido ou se travou no fim. */
            setAtual(0);
            if (audio.current) audio.current.currentTime = 0;
          }}
          className="hidden"
        />
      )}
    </div>
  );
};

export default AudioMensagem;
