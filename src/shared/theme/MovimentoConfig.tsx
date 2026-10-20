import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { MotionConfig } from "framer-motion";

import useThemeStore from "@/shared/theme/theme.store";
import { reduzMovimento } from "@/shared/theme/useTheme";

/**
 * A preferência de movimento do Flow, entregue ao framer-motion.
 *
 * Sem isto o framer lia só o sistema: "Reduzidas" em Aparência não chegava às
 * animações dele, e "Sempre animar" não tinha como existir.
 *
 * Reduzir não é desligar. Com `reducedMotion="always"` o framer corta o que
 * DESLOCA (escala, deslize, posição) e mantém o esmaecer — é o movimento que
 * incomoda quem pede menos movimento, não a troca de opacidade. Era por isso
 * que, em máquina Windows com os efeitos de animação desligados, o sistema
 * parecia quebrado: tudo surgia seco, sem transição nenhuma.
 */
const MovimentoConfig = ({ children }: { children: ReactNode }) => {
  const pref = useThemeStore((s) => s.motion);
  const [reduzir, setReduzir] = useState(() => reduzMovimento(pref));

  useEffect(() => {
    setReduzir(reduzMovimento(pref));
    if (pref !== "auto") return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => setReduzir(reduzMovimento("auto"));
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [pref]);

  return <MotionConfig reducedMotion={reduzir ? "always" : "never"}>{children}</MotionConfig>;
};

export default MovimentoConfig;
