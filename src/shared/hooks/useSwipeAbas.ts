import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { tocarNavegacao } from "@/shared/session/somSessao";

/**
 * As mesmas abas da dock, na mesma ordem.
 *
 * Exportada porque a dock e o gesto precisam concordar: se a ordem divergir, o
 * dedo vai para um lado e a pílula para outro.
 */
export const ABAS_SWIPE = ["/", "/vendas", "/pdv", "/clientes"];

const DISTANCIA_MINIMA = 64;
const TEMPO_MAXIMO = 700;

/**
 * Arrastar a tela troca de aba, no celular.
 *
 * A dock continua sendo o caminho declarado; o gesto é o atalho de quem já
 * decorou a ordem. Ele só vale entre as três abas principais e só nas pontas
 * dessa lista — não existe "próxima" depois de Vendas.
 *
 * O gesto é reconhecido no `touchend`, não durante o arrasto, e passa por
 * quatro filtros. Cada um existe porque, sem ele, o gesto rouba um toque que
 * era de outra coisa:
 *
 * 1. **Um dedo só.** Pinça de zoom acaba em dois pontos se afastando, e a
 *    diferença horizontal de um deles passaria por swipe.
 * 2. **Mais horizontal que vertical** (1,8×). Rolar uma lista comprida com o
 *    polegar nunca é perfeitamente reto: sem a folga, metade das rolagens
 *    trocaria de tela.
 * 3. **Rápido.** Acima de 700ms o dedo estava arrastando alguma coisa —
 *    reordenando, selecionando texto — e não pedindo navegação.
 * 4. **Fora de rolagem horizontal.** Tabela de produtos, carrossel de planos e
 *    a régua de abas rolam para o lado por conta própria; o gesto tem que ser
 *    deles, não da navegação. A checagem sobe pelos ancestrais do alvo até o
 *    documento, procurando quem realmente tenha o que rolar na horizontal.
 *
 * Quem quiser blindar um bloco específico marca com `data-sem-swipe`.
 */
export const useSwipeAbas = (ativo = true) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!ativo) return;

    const indice = ABAS_SWIPE.indexOf(pathname);
    if (indice < 0) return;

    let x0 = 0;
    let y0 = 0;
    let t0 = 0;
    let valendo = false;

    const podeArrastar = (alvo: EventTarget | null) => {
      let no = alvo instanceof Element ? alvo : null;

      while (no && no !== document.body) {
        if (no instanceof HTMLElement) {
          if (no.dataset.semSwipe !== undefined) return false;

          const estilo = getComputedStyle(no);
          const rolaLado = /(auto|scroll)/.test(estilo.overflowX);

          /* Tem overflow declarado E conteúdo de sobra: um contêiner com
             `overflow-x-auto` que coube inteiro não rola nada, e bloquear por
             causa dele deixaria telas inteiras sem gesto. */
          if (rolaLado && no.scrollWidth > no.clientWidth + 4) return false;
        }

        no = no.parentElement;
      }

      return true;
    };

    const aoTocar = (e: TouchEvent) => {
      valendo = e.touches.length === 1 && podeArrastar(e.target);
      if (!valendo) return;

      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      t0 = performance.now();
    };

    const aoSoltar = (e: TouchEvent) => {
      if (!valendo) return;
      valendo = false;

      const toque = e.changedTouches[0];
      if (!toque) return;

      const dx = toque.clientX - x0;
      const dy = toque.clientY - y0;

      if (performance.now() - t0 > TEMPO_MAXIMO) return;
      if (Math.abs(dx) < DISTANCIA_MINIMA) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.8) return;

      /* Arrastar para a esquerda puxa a próxima aba para dentro da tela — o
         mesmo sentido de virar página. */
      const destino = ABAS_SWIPE[indice + (dx < 0 ? 1 : -1)];
      if (!destino) return;

      tocarNavegacao();
      navigate(destino);
    };

    /* `passive`: o gesto nunca chama `preventDefault`, então avisar o navegador
       disso deixa a rolagem seguir sem esperar por este código. */
    document.addEventListener("touchstart", aoTocar, { passive: true });
    document.addEventListener("touchend", aoSoltar, { passive: true });

    return () => {
      document.removeEventListener("touchstart", aoTocar);
      document.removeEventListener("touchend", aoSoltar);
    };
  }, [ativo, pathname, navigate]);
};

export default useSwipeAbas;
