import { useEffect, useMemo } from "react";
import { motion, useReducedMotionConfig } from "framer-motion";

import type { ModoTransicao } from "@/shared/session/transicao.store";

/**
 * A entrada no sistema.
 *
 * O formulário não some: ele é **consumido** por uma faixa de luz que o
 * atravessa de cima a baixo, deixando para trás partículas que sobem. Quando a
 * última partícula apaga, o nome de quem entrou ocupa a tela.
 *
 * Regras que a animação respeita:
 *
 * - **Duração curta.** Todo o teatro cabe em ~2,2s. Animação de entrada que
 *   passa disso deixa de ser bonita e vira pedágio — e quem entra no sistema
 *   dez vezes por dia paga esse pedágio dez vezes.
 * - **`prefers-reduced-motion` corta tudo**, indo direto ao "Bem-vindo". Não é
 *   detalhe: para quem tem sensibilidade vestibular, esse tipo de efeito causa
 *   mal-estar de verdade.
 * - Só transforma `opacity`, `transform` e `filter` — propriedades que a GPU
 *   compõe sem recalcular layout. Em celular fraco continua fluido.
 */

const QUANTIDADE_PARTICULAS = 26;

type Props = {
  nome?: string;
  /** `entrada` monta a sessão; `saida` desmonta. */
  modo?: ModoTransicao;
  /** Chamado quando a animação termina — é aqui que a sessão é efetivada. */
  aoTerminar: () => void;
};

const TransicaoSessao = ({ nome, modo = "entrada", aoTerminar }: Props) => {
  const reduzirMovimento = useReducedMotionConfig();

  const entrada = modo === "entrada";
  const primeiroNome = (nome ?? "").trim().split(/\s+/)[0] || (entrada ? "de volta" : "");

  /* Posições sorteadas uma vez: recalcular a cada frame faria as partículas
     "pularem" de lugar durante a animação. */
  const particulas = useMemo(
    () =>
      Array.from({ length: QUANTIDADE_PARTICULAS }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        atraso: Math.random() * 0.5,
        tamanho: 2 + Math.random() * 4,
        distancia: 90 + Math.random() * 140,
      })),
    [],
  );

  /* A saída é bem mais curta: esperar para ENTRAR tem graça, esperar para
     SAIR não tem nenhuma. */
  const duracaoTotal = reduzirMovimento ? 700 : entrada ? 2200 : 1400;

  useEffect(() => {
    const t = setTimeout(aoTerminar, duracaoTotal);
    return () => clearTimeout(t);
  }, [aoTerminar, duracaoTotal]);

  const letras = (entrada ? `Bem-vindo, ${primeiroNome}` : `Até logo${primeiroNome ? `, ${primeiroNome}` : ""}`).split("");

  return (
    <motion.div
      className="fixed inset-0 z-[400] flex items-center justify-center overflow-hidden bg-canvas"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      /*
       * O `exit` é o que faz a troca ser cruzada em vez de corte: o overlay
       * dissolve enquanto o sistema (ou o login) já está aparecendo atrás.
       * Na entrada ele se abre revelando o app; na saída ele se fecha por cima.
       */
      exit={{ opacity: 0, scale: entrada ? 1.12 : 0.96, filter: "blur(8px)" }}
      transition={{ duration: 0.25 }}
    >
      {/* Halo que respira atrás do texto */}
      <motion.div
        aria-hidden
        /* Centralizado por `inset-0 m-auto`, e não por `-translate-1/2`: o
           framer-motion escreve `transform` para animar a escala e apagaria o
           translate do Tailwind — o halo ficava deslocado da tela. */
        className="pointer-events-none absolute inset-0 m-auto h-[520px] w-[520px] rounded-full"
        style={{ background: "radial-gradient(circle, rgb(var(--accent) / 0.28), transparent 65%)", filter: "blur(60px)" }}
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: [0.4, 1.15, 1], opacity: [0, 0.9, 0.6] }}
        transition={{ duration: reduzirMovimento ? 0.4 : 1.6, ease: [0.22, 0.61, 0.36, 1] }}
      />

      {/* Partículas do formulário consumido subindo */}
      {!reduzirMovimento && (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {particulas.map((p) => (
            <motion.span
              key={p.id}
              className="absolute rounded-full bg-accent-soft"
              style={{ left: `${p.x}%`, top: "58%", width: p.tamanho, height: p.tamanho }}
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: [0, 1, 0], y: entrada ? -p.distancia : p.distancia }}
              transition={{ duration: entrada ? 1.4 : 1, delay: p.atraso, ease: "easeOut" }}
            />
          ))}
        </div>
      )}

      {/* Anel que se desenha */}
      {!reduzirMovimento && (
        <motion.svg aria-hidden className="pointer-events-none absolute h-[220px] w-[220px]" viewBox="0 0 100 100">
          <motion.circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke="rgb(var(--accent))"
            strokeWidth="0.6"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: [0, 0.7, 0] }}
            transition={{ duration: 1.8, ease: "easeInOut" }}
          />
        </motion.svg>
      )}

      {/* O nome */}
      <div className="relative z-10 flex flex-col items-center px-6 text-center">
        <motion.p
          className="text-[11px] uppercase tracking-[3px] text-faint"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduzirMovimento ? 0 : entrada ? 0.35 : 0.1, duration: 0.4 }}
        >
          CodeEx Flow
        </motion.p>

        <p className="mt-3 flex flex-wrap justify-center text-[30px] leading-tight tracking-tight text-ink sm:text-[38px]">
          {letras.map((letra, i) => (
            <motion.span
              key={`${letra}-${i}`}
              initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{
                delay: reduzirMovimento ? 0 : (entrada ? 0.5 : 0.15) + i * (entrada ? 0.028 : 0.016),
                duration: 0.42,
                ease: [0.22, 0.61, 0.36, 1],
              }}
              // `pre` mantém o espaço entre as palavras, que o flex comeria.
              style={{ whiteSpace: "pre" }}
            >
              {letra}
            </motion.span>
          ))}
        </p>

        <motion.div
          className="mt-6 h-px w-28 origin-center bg-gradient-to-r from-transparent via-accent to-transparent"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ delay: reduzirMovimento ? 0.1 : entrada ? 1.1 : 0.6, duration: 0.5 }}
        />
      </div>
    </motion.div>
  );
};

export default TransicaoSessao;
