import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";

/**
 * A FOLHA INTEIRA NA TELA — com zoom.
 *
 * ---------------------------------------------------------------------------
 * O problema
 * ---------------------------------------------------------------------------
 * A ordem de serviço abre num modal, e o papel dela é uma folha A4 de verdade:
 * 210mm por 297mm, que em tela dá 794 por 1123 pixels. O modal tem 1200px de
 * largura e uns 780 de altura útil — ou seja, a folha SEMPRE foi mais alta do
 * que o lugar onde ela é mostrada, e o que aparecia era o topo dela, com o
 * resto atrás de uma barra de rolagem.
 *
 * Para fugir disso, o preenchimento abria a ficha fora do formato A4
 * (`a4={false}`, largura livre): cabia na largura, mas aí não era mais a folha
 * — os blocos se esticavam, a proporção mudava e o que estava na tela não era
 * o que sairia da impressora. Conferir se a grade coube na página exigia
 * baixar o PDF.
 *
 * ---------------------------------------------------------------------------
 * O que este visor faz
 * ---------------------------------------------------------------------------
 * Mostra a folha no tamanho real e a REDUZ por `transform: scale`, começando
 * no ajuste que faz a página caber inteira. Continua sendo o A4 — os mesmos
 * milímetros, a mesma quebra —, só que visto de mais longe. E como `scale` não
 * desliga nada, os campos continuam clicáveis: dá para preencher a ficha com
 * ela reduzida, e aproximar quando a letra ficar pequena demais.
 *
 * ---------------------------------------------------------------------------
 * Duas medidas, e por que elas não brigam
 * ---------------------------------------------------------------------------
 * O ajuste precisa da medida da ÁREA e da medida da FOLHA, e medir as duas
 * dentro de um contêiner que rola é pedir um laço: a folha cresce, nasce uma
 * barra de rolagem, a área encolhe, o ajuste muda, a folha encolhe, a barra
 * some... Por isso quem é medido é o quadro DE FORA (`areaRef`), que não rola
 * e cujo tamanho vem do modal, e a folha é medida por `offsetWidth` —
 * `transform` não mexe no layout, então a medida natural continua valendo por
 * mais reduzida que ela esteja na tela.
 */

type Props = {
  /** A folha. Manda na própria largura (A4, 900px — o que for). */
  children: ReactNode;
  /** Some com a barra de zoom — para quem só mostra o documento pronto. */
  semControles?: boolean;
  className?: string;
};

/** Os limites do zoom: menos que isso não se lê, mais que isso não cabe. */
const MIN = 0.3;
const MAX = 1.5;
const PASSO = 0.1;

/** O respiro entre a folha e as bordas do visor, nos dois eixos. */
const FOLGA = 28;

const VisorDocumento = ({ children, semControles = false, className = "" }: Props) => {
  const areaRef = useRef<HTMLDivElement>(null);
  const folhaRef = useRef<HTMLDivElement>(null);

  const [area, setArea] = useState({ w: 0, h: 0 });
  const [folha, setFolha] = useState({ w: 0, h: 0 });

  /** `null` = acompanhando o ajuste automático; um número = zoom escolhido. */
  const [escolhido, setEscolhido] = useState<number | null>(null);

  /* As duas medidas. `offsetWidth`/`offsetHeight` de propósito: eles são o
     tamanho de LAYOUT, anterior ao `scale` — `getBoundingClientRect` devolveria
     o tamanho já reduzido e o ajuste se realimentaria a cada quadro. */
  const medir = useCallback(() => {
    const a = areaRef.current;
    const f = folhaRef.current;

    if (a) setArea({ w: a.clientWidth, h: a.clientHeight });
    if (f) setFolha({ w: f.offsetWidth, h: f.offsetHeight });
  }, []);

  useLayoutEffect(() => {
    medir();

    const obs = new ResizeObserver(medir);

    if (areaRef.current) obs.observe(areaRef.current);
    if (folhaRef.current) obs.observe(folhaRef.current);

    return () => obs.disconnect();
  }, [medir]);

  /*
   * A folha muda de altura enquanto se preenche (uma arte enviada, uma
   * observação que cresce), e o `ResizeObserver` só acorda quando o NÓ
   * observado muda de tamanho — o nó observado é a folha, então isso está
   * coberto. Este efeito cobre o outro caso: o conteúdo trocou inteiro (outra
   * ordem, outro modelo) e a medida precisa ser refeita no próximo quadro.
   */
  useEffect(() => {
    const t = requestAnimationFrame(medir);
    return () => cancelAnimationFrame(t);
  }, [children, medir]);

  /** O maior zoom que ainda deixa a página inteira à vista — nunca acima de 1. */
  const ajuste = useMemo(() => {
    if (!folha.w || !folha.h || !area.w || !area.h) return 1;

    const cabe = Math.min((area.w - FOLGA) / folha.w, (area.h - FOLGA) / folha.h);

    return Math.max(MIN, Math.min(1, cabe));
  }, [area, folha]);

  const zoom = escolhido ?? ajuste;

  const mudar = (delta: number) => setEscolhido(Math.min(MAX, Math.max(MIN, Math.round((zoom + delta) * 100) / 100)));

  const botao =
    "focus-ring grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-mist transition-colors hover:bg-fg/[0.08] hover:text-ink disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div ref={areaRef} className={`relative min-h-0 flex-1 overflow-hidden rounded-xl bg-fg/[0.03] ${className}`}>
      {/* O que rola é ISTO, e não o quadro medido acima. */}
      <div className="h-full w-full overflow-auto p-3.5">
        {/*
         * O vão que a folha reduzida ocupa.
         *
         * `transform` não muda o espaço que o elemento reserva: sem esta caixa
         * do tamanho JÁ multiplicado, a área de rolagem continuaria sendo a da
         * folha em tamanho real e sobraria um vazio enorme embaixo dela a 40%.
         */}
        <div
          className="mx-auto"
          style={folha.w ? { width: folha.w * zoom, height: folha.h * zoom } : undefined}
        >
          <div
            ref={folhaRef}
            className="w-max origin-top-left"
            style={{ transform: `scale(${zoom})` }}
          >
            {children}
          </div>
        </div>
      </div>

      {/* A barra flutua sobre a folha, encostada no rodapé do visor: presa
          acima, ela empurraria a página para baixo justamente na hora em que a
          pessoa quer ver a página inteira. */}
      {!semControles && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-fg/[0.08] bg-surface/95 px-1.5 py-1 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.6)] backdrop-blur">
            <button type="button" onClick={() => mudar(-PASSO)} disabled={zoom <= MIN} title="Afastar" aria-label="Afastar" className={botao}>
              <Minus size={14} />
            </button>

            {/* O número é um botão: clicar volta ao tamanho real. É o gesto que
                se tenta depois de reduzir para ver a página e querer voltar a
                escrever nela. */}
            <button
              type="button"
              onClick={() => setEscolhido(1)}
              title="Ver em tamanho real"
              className="focus-ring h-7 min-w-[46px] cursor-pointer rounded-lg px-1 text-[11.5px] tabular-nums text-mist transition-colors hover:bg-fg/[0.08] hover:text-ink"
            >
              {Math.round(zoom * 100)}%
            </button>

            <button type="button" onClick={() => mudar(PASSO)} disabled={zoom >= MAX} title="Aproximar" aria-label="Aproximar" className={botao}>
              <Plus size={14} />
            </button>

            <span className="mx-0.5 h-4 w-px bg-fg/[0.1]" />

            <button
              type="button"
              onClick={() => setEscolhido(null)}
              title="Ajustar à tela"
              aria-label="Ajustar à tela"
              /* Aceso enquanto o ajuste é quem manda: é a diferença entre "a
                 página cabe porque eu ajustei" e "cabe por acaso". */
              className={`focus-ring flex h-7 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-[11.5px] transition-colors ${
                escolhido === null ? "bg-accent/[0.14] text-accent-soft" : "text-mist hover:bg-fg/[0.08] hover:text-ink"
              }`}
            >
              <Maximize2 size={12} />
              Ajustar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VisorDocumento;
