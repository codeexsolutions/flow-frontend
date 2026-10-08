import type { CSSProperties } from "react";
import { motion, useReducedMotion } from "framer-motion";

import useMarcaDominio from "@/shared/marca/marcaDominio";

const EASE = [0.22, 0.61, 0.36, 1] as const;

/* Anel em degradê cônico: a máscara recorta o miolo e sobra só a borda. */
const ANEL = {
  background: "conic-gradient(from 0deg, transparent 0deg, rgb(var(--accent) / 0) 40deg, rgb(var(--accent)) 220deg, rgb(var(--accent-soft)) 300deg, transparent 360deg)",
  WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))",
  mask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))",
};

/**
 * Tela de espera do boot, enquanto a sessão é conferida.
 *
 * Veste a mesma pele da tela de entrada — fundo do tema, glows do accent e a
 * logo com brilho — para o sistema não parecer outro produto nesse meio segundo.
 * No domínio de uma empresa a logo e o nome são os dela; enquanto a marca ainda
 * não chegou, a logo fica de fora para não piscar a nossa e trocar em seguida.
 */
const LoadingScreen = () => {
  const reduzir = useReducedMotion();
  const marca = useMarcaDominio((s) => s.marca);
  const carregandoMarca = useMarcaDominio((s) => s.carregando);

  const logo = marca?.logo || "/logo.png";
  const nome = marca ? marca.nome : null;
  const corDaMarca = marca?.cor ?? null;

  const girar = reduzir ? {} : { rotate: 360 };

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Carregando"
      className="relative flex h-[100dvh] w-full items-center justify-center overflow-hidden bg-canvas"
      style={corDaMarca ? ({ "--accent": corDaMarca, "--accent-soft": corDaMarca, "--accent-strong": corDaMarca } as CSSProperties) : undefined}
    >
      {/* Glows de fundo — os mesmos do login, e somem no modo leve */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ opacity: "var(--fx-aurora, 1)" }}>
        <motion.div
          className="absolute -left-32 -top-32 h-[460px] w-[460px] rounded-full bg-accent blur-[140px]"
          animate={reduzir ? undefined : { opacity: [0.12, 0.2, 0.12], x: [0, 30, 0], y: [0, 20, 0] }}
          style={{ opacity: 0.15 }}
          transition={{ repeat: Infinity, duration: 8, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-32 -right-32 h-[460px] w-[460px] rounded-full blur-[140px]"
          style={{ background: "rgb(var(--aurora-2))", opacity: 0.14 }}
          animate={reduzir ? undefined : { opacity: [0.1, 0.18, 0.1], x: [0, -30, 0], y: [0, -20, 0] }}
          transition={{ repeat: Infinity, duration: 9, ease: "easeInOut", delay: 0.6 }}
        />
      </div>

      <motion.div
        className="relative z-10 flex flex-col items-center"
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        <div className="relative grid h-32 w-32 place-items-center">
          {/* Halo que respira atrás da logo */}
          <motion.span
            aria-hidden
            className="pointer-events-none absolute h-24 w-24 rounded-full bg-accent blur-[38px]"
            style={{ opacity: "calc(0.45 * var(--fx-glow, 1))" }}
            animate={reduzir ? undefined : { scale: [0.9, 1.15, 0.9] }}
            transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
          />

          {/* Trilho fixo + cometa girando por cima */}
          <span aria-hidden className="absolute inset-0 rounded-full ring-1 ring-inset ring-fg/[0.07]" />
          <motion.span aria-hidden className="absolute inset-0 rounded-full" style={ANEL} animate={girar} transition={{ repeat: Infinity, duration: 1.3, ease: "linear" }} />
          <motion.span aria-hidden className="absolute inset-0" animate={girar} transition={{ repeat: Infinity, duration: 1.3, ease: "linear" }}>
            <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 -translate-y-[3px] rounded-full bg-accent-soft shadow-[0_0_12px_2px_rgb(var(--accent-soft)/0.9)]" />
          </motion.span>

          {/* Anel interno, mais lento e ao contrário */}
          <motion.span
            aria-hidden
            className="absolute inset-[14px] rounded-full border border-dashed border-accent/25"
            animate={reduzir ? undefined : { rotate: -360 }}
            transition={{ repeat: Infinity, duration: 12, ease: "linear" }}
          />

          {!carregandoMarca && (
            <motion.div
              className="relative"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={reduzir ? { opacity: 1, scale: 1 } : { opacity: 1, scale: [1, 1.05, 1] }}
              transition={reduzir ? { duration: 0.3 } : { opacity: { duration: 0.4 }, scale: { repeat: Infinity, duration: 2.4, ease: "easeInOut" } }}
            >
              <img src={logo} alt="" width={64} height={64} className="relative h-16 w-16 rounded-2xl object-cover shadow-glow" />
              {/* Reflexo que atravessa a logo */}
              {!reduzir && (
                <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
                  <motion.span
                    className="absolute inset-y-0 -left-full w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                    animate={{ x: ["0%", "500%"] }}
                    transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut", repeatDelay: 0.8 }}
                  />
                </span>
              )}
            </motion.div>
          )}
        </div>

        {!carregandoMarca && (
          <motion.div className="mt-7 flex flex-col items-center gap-1.5" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1, ease: EASE }}>
            <span className="font-display text-[22px] tracking-tight text-ink">
              {nome ?? (
                <>
                  CodeEx <span className="text-accent-soft">Flow</span>
                </>
              )}
            </span>
            <span className="text-[10px] uppercase tracking-[3px] text-faint">Preparando seu painel</span>
          </motion.div>
        )}

        {/* Barra de progresso indeterminada */}
        <div className="relative mt-6 h-[3px] w-40 overflow-hidden rounded-full bg-fg/[0.07]">
          <motion.div
            className="absolute inset-y-0 w-1/2 rounded-full bg-gradient-to-r from-transparent via-accent-soft to-transparent"
            initial={{ x: "-100%" }}
            animate={reduzir ? { x: "50%" } : { x: ["-100%", "200%"] }}
            transition={reduzir ? { duration: 0 } : { repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
          />
        </div>
      </motion.div>
    </div>
  );
};

export default LoadingScreen;
