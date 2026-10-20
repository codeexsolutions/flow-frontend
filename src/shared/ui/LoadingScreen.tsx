import type { CSSProperties } from "react";
import { motion, useReducedMotionConfig } from "framer-motion";

import useMarcaDominio from "@/shared/marca/marcaDominio";

const EASE = [0.22, 0.61, 0.36, 1] as const;

/*
 * A logo do Flow em vetor — as duas lâminas que formam o "F".
 *
 * Redesenhada a partir do `logo.png` (viewBox 512, o mesmo quadro do PNG): a
 * lâmina de cima, roxa, nasce no pé do F e se abre para a direita; a de baixo,
 * azul, é mais curta e desce até a base. Em vetor elas podem ser DESENHADAS na
 * tela — o traço percorre o contorno, a cor enche, um brilho corre por cima —
 * coisa que a imagem não deixa fazer.
 */
const LAMINA_CIMA =
  "M150 286 C148 168 206 94 326 92 L398 92 C408 92 412 98 409 108 C396 162 356 194 300 194 L246 194 C194 194 160 226 150 286 Z";
const LAMINA_BAIXO =
  "M152 438 C149 402 149 364 152 332 C157 270 192 236 254 236 L374 236 C383 236 386 242 383 251 C371 300 336 330 284 330 L252 330 C206 330 170 370 161 430 C160 437 157 441 152 438 Z";

/* As cores da própria logo — fixas, e não as do tema: a logo é a marca, e a
   marca não muda de cor porque a pessoa escolheu o tema verde. */
const ROXO = ["#c084fc", "#8b5cf6", "#6d28d9"] as const;
const AZUL = ["#93c5fd", "#3b82f6", "#1d4ed8"] as const;

/* Um ciclo inteiro: desenha, enche, brilha, esvazia. */
const CICLO = 3.4;

/**
 * Uma lâmina da logo, desenhada em três camadas: o traço que se desenha, o
 * preenchimento que acende depois dele e o brilho que corre pelo contorno.
 */
const Lamina = ({ d, grad, atraso, reduzir }: { d: string; grad: string; atraso: number; reduzir: boolean | null }) => {
  if (reduzir) return <path d={d} fill={`url(#${grad}-fill)`} />;

  const repetir = { repeat: Infinity, duration: CICLO, delay: atraso, ease: "easeInOut" as const };

  return (
    <>
      {/* O preenchimento acende quando o traço termina e apaga no fim do ciclo. */}
      <motion.path
        d={d}
        fill={`url(#${grad}-fill)`}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 1, 1, 0] }}
        transition={{ ...repetir, times: [0, 0.32, 0.48, 0.82, 1] }}
      />

      {/* O traço: se desenha a partir do pé do F e se desfaz pela mesma ponta. */}
      <motion.path
        d={d}
        fill="none"
        stroke={`url(#${grad}-traco)`}
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, pathOffset: 0 }}
        animate={{ pathLength: [0, 1, 1, 0], pathOffset: [0, 0, 0, 1], opacity: [1, 1, 0.55, 0] }}
        transition={{ ...repetir, times: [0, 0.4, 0.82, 1] }}
      />

      {/* O cometa: um pedaço curto e muito claro do contorno, dando a volta. */}
      <motion.path
        d={d}
        fill="none"
        stroke="#fff"
        strokeWidth={4}
        strokeLinecap="round"
        style={{ filter: "drop-shadow(0 0 6px rgba(255,255,255,0.9))" }}
        initial={{ pathLength: 0.08, pathOffset: 0, opacity: 0 }}
        animate={{ pathOffset: [0, 0, 1], opacity: [0, 0, 1, 1, 0] }}
        transition={{
          pathOffset: { ...repetir, times: [0, 0.45, 0.85] },
          opacity: { ...repetir, times: [0, 0.44, 0.5, 0.8, 0.86] },
        }}
      />
    </>
  );
};

/** A logo do Flow, viva. */
const LogoFlow = ({ reduzir }: { reduzir: boolean | null }) => (
  <svg viewBox="96 64 340 400" className="relative h-44 w-auto overflow-visible drop-shadow-[0_10px_30px_rgba(124,58,237,0.35)]" aria-hidden>
    <defs>
      <linearGradient id="roxo-fill" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={ROXO[0]} />
        <stop offset="55%" stopColor={ROXO[1]} />
        <stop offset="100%" stopColor={ROXO[2]} />
      </linearGradient>
      <linearGradient id="roxo-traco" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0%" stopColor={ROXO[2]} />
        <stop offset="100%" stopColor={ROXO[0]} />
      </linearGradient>
      <linearGradient id="azul-fill" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={AZUL[0]} />
        <stop offset="55%" stopColor={AZUL[1]} />
        <stop offset="100%" stopColor={AZUL[2]} />
      </linearGradient>
      <linearGradient id="azul-traco" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0%" stopColor={AZUL[2]} />
        <stop offset="100%" stopColor={AZUL[0]} />
      </linearGradient>
    </defs>

    <Lamina d={LAMINA_CIMA} grad="roxo" atraso={0} reduzir={reduzir} />
    <Lamina d={LAMINA_BAIXO} grad="azul" atraso={0.22} reduzir={reduzir} />
  </svg>
);

/*
 * O fundo: fitas de luz correndo de um lado ao outro da tela — o "flow" do
 * nome, no lugar da grade de instrumento que havia aqui.
 *
 * Cada fita é uma curva longa com um traço tracejado que anda pelo
 * `strokeDashoffset`: o desenho fica parado e só o tracejado se move, que é
 * o tipo de animação mais barato que o navegador sabe fazer.
 */
const FITAS = [
  { d: "M-100 620 C 200 520, 420 760, 760 610 S 1300 470, 1600 600", cor: ROXO[1], largura: 2, duracao: 7, opacidade: 0.5 },
  { d: "M-100 680 C 260 600, 480 820, 820 660 S 1320 540, 1600 670", cor: AZUL[1], largura: 1.5, duracao: 9, opacidade: 0.4 },
  { d: "M-100 300 C 300 220, 560 420, 900 290 S 1360 180, 1600 280", cor: ROXO[0], largura: 1.2, duracao: 11, opacidade: 0.28 },
  { d: "M-100 360 C 240 300, 520 470, 860 350 S 1340 250, 1600 340", cor: AZUL[0], largura: 1, duracao: 13, opacidade: 0.22 },
];

const Fitas = ({ reduzir }: { reduzir: boolean | null }) => (
  <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1500 900" preserveAspectRatio="xMidYMid slice">
    {FITAS.map((f, i) => (
      <g key={i} opacity={f.opacidade}>
        {/* O trilho apagado da fita… */}
        <path d={f.d} fill="none" stroke={f.cor} strokeWidth={f.largura} opacity={0.25} />
        {/* …e a luz que corre por ele. */}
        <motion.path
          d={f.d}
          fill="none"
          stroke={f.cor}
          strokeWidth={f.largura * 1.8}
          strokeLinecap="round"
          strokeDasharray="120 1680"
          style={{ filter: `drop-shadow(0 0 6px ${f.cor})` }}
          initial={{ strokeDashoffset: 1800 }}
          animate={reduzir ? undefined : { strokeDashoffset: [1800, 0] }}
          transition={{ repeat: Infinity, duration: f.duracao, ease: "linear", delay: i * 0.7 }}
        />
      </g>
    ))}
  </svg>
);

/**
 * Tela de espera do boot, enquanto a sessão é conferida.
 *
 * No nosso endereço, a logo do Flow em vetor se desenha, acende e brilha em
 * ciclo, sobre fitas de luz que correm pelo fundo. No domínio de uma empresa
 * a logo e o nome são os dela (uma imagem, que não se desenha); enquanto a
 * marca ainda não chegou nada é mostrado no centro, para não piscar a nossa e
 * trocar em seguida.
 */
const LoadingScreen = () => {
  const reduzir = useReducedMotionConfig();
  const marca = useMarcaDominio((s) => s.marca);
  const carregandoMarca = useMarcaDominio((s) => s.carregando);

  const corDaMarca = marca?.cor ?? null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Carregando"
      className="relative flex h-[100dvh] w-full items-center justify-center overflow-hidden bg-canvas"
      style={corDaMarca ? ({ "--accent": corDaMarca, "--accent-soft": corDaMarca, "--accent-strong": corDaMarca } as CSSProperties) : undefined}
    >
      <Fitas reduzir={reduzir} />

      {/* Duas luzes grandes nas cores da logo, respirando — somem no modo leve. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ opacity: "var(--fx-aurora, 1)" }}>
        <motion.div
          className="absolute left-1/2 top-1/2 -ml-[260px] -mt-[300px] h-[420px] w-[420px] rounded-full"
          style={{ background: `radial-gradient(circle, ${ROXO[1]}38 0%, transparent 65%)` }}
          animate={reduzir ? undefined : { x: [0, 40, 0], y: [0, 24, 0], scale: [1, 1.12, 1] }}
          transition={{ repeat: Infinity, duration: 7, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute left-1/2 top-1/2 -ml-[140px] -mt-[120px] h-[400px] w-[400px] rounded-full"
          style={{ background: `radial-gradient(circle, ${AZUL[1]}33 0%, transparent 65%)` }}
          animate={reduzir ? undefined : { x: [0, -36, 0], y: [0, -20, 0], scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 8, ease: "easeInOut", delay: 0.5 }}
        />
      </div>

      <motion.div
        className="relative z-10 flex flex-col items-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        <div className="relative grid h-52 w-52 place-items-center">
          {!carregandoMarca &&
            (marca ? (
              <motion.img
                src={marca.logo || "/logo.png"}
                alt=""
                width={80}
                height={80}
                className="h-20 w-20 rounded-2xl object-cover shadow-glow"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={reduzir ? { opacity: 1, scale: 1 } : { opacity: 1, scale: [1, 1.05, 1] }}
                transition={reduzir ? { duration: 0.3 } : { opacity: { duration: 0.4 }, scale: { repeat: Infinity, duration: 2.4, ease: "easeInOut" } }}
              />
            ) : (
              <LogoFlow reduzir={reduzir} />
            ))}
        </div>

        {!carregandoMarca && (
          <motion.div
            className="mt-6 flex flex-col items-center gap-2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: EASE }}
          >
            <span className="text-[22px] tracking-tight text-ink">
              {marca ? (
                marca.nome
              ) : (
                <>
                  CodeEx{" "}
                  <span className="bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(90deg, ${ROXO[0]}, ${AZUL[1]})` }}>
                    Flow
                  </span>
                </>
              )}
            </span>
            <span className="text-[10px] uppercase tracking-[3px] text-faint">Preparando seu painel</span>
          </motion.div>
        )}

        {/* O progresso é uma onda que corre — a mesma linguagem das fitas. */}
        <svg viewBox="0 0 160 12" className="mt-6 h-3 w-40 overflow-visible" aria-hidden>
          <defs>
            <linearGradient id="onda" x1="0" x2="1">
              <stop offset="0%" stopColor={ROXO[0]} />
              <stop offset="100%" stopColor={AZUL[1]} />
            </linearGradient>
          </defs>
          <path d="M0 6 Q 10 0 20 6 T 40 6 T 60 6 T 80 6 T 100 6 T 120 6 T 140 6 T 160 6" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-fg/[0.08]" />
          <motion.path
            d="M0 6 Q 10 0 20 6 T 40 6 T 60 6 T 80 6 T 100 6 T 120 6 T 140 6 T 160 6"
            fill="none"
            stroke="url(#onda)"
            strokeWidth={2.5}
            strokeLinecap="round"
            initial={{ pathLength: 0.3, pathOffset: 0 }}
            animate={reduzir ? { pathLength: 1, pathOffset: 0 } : { pathOffset: [-0.3, 1] }}
            transition={reduzir ? { duration: 0 } : { repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
          />
        </svg>
      </motion.div>
    </div>
  );
};

export default LoadingScreen;
