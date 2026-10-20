import type { MouseEvent } from "react";

/**
 * Executa uma troca de tema com efeito de círculo se expandindo
 * a partir do ponto do clique. Fallback: aplica sem animação
 * (Firefox atual ou usuário com "reduzir movimento" ativado).
 */
export const switchThemeWithTransition = (event: MouseEvent<Element>, callback: () => void) => {
  /* A decisão já resolvida (`data-motion`), e não o sistema direto: quem
     escolheu "Sempre animar" ganha o círculo também. No modo leve não: o
     círculo é uma captura da tela inteira, pesada em máquina sem placa. */
  const raiz = document.documentElement.dataset;
  const semEfeito = raiz.motion === "reduce" || raiz.fx === "lite";

  if (!document.startViewTransition || semEfeito) {
    callback();
    return;
  }

  const x = event.clientX;
  const y = event.clientY;

  const endRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

  const transition = document.startViewTransition(() => {
    callback();
  });

  transition.ready.then(() => {
    document.documentElement.animate(
      {
        clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`],
      },
      {
        duration: 550,
        easing: "cubic-bezier(0.65, 0, 0.35, 1)",
        pseudoElement: "::view-transition-new(root)",
      },
    );
  });
};
