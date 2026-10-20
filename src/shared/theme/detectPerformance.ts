export type FxLevel = "full" | "balanced" | "lite";

type NavigatorWithHints = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
};

/** Marca deixada pelo vigia de quadros: esta máquina já engasgou uma vez. */
const CHAVE_LENTO = "flow:fx-lento";

/**
 * O navegador está desenhando SEM placa de vídeo?
 *
 * É o caso que mais trava e o que a contagem de núcleos não enxerga: uma
 * máquina de 8 núcleos com a aceleração de hardware desligada, driver de vídeo
 * na lista negra do Chrome, máquina virtual ou acesso remoto. Ali o
 * `backdrop-filter` é calculado pelo processador, quadro a quadro, para cada
 * cartão de vidro da tela — e a tela inteira congela na rolagem.
 *
 * O nome do renderizador do WebGL denuncia: SwiftShader (Chrome), llvmpipe
 * (Linux) e "Microsoft Basic Render Driver" (Windows sem driver) são todos
 * renderização por software. Sem WebGL nenhum, a placa está bloqueada.
 */
const renderizaSemGpu = (): boolean => {
  try {
    const gl = document.createElement("canvas").getContext("webgl") as WebGLRenderingContext | null;
    if (!gl) return true;

    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderizador = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();

    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderizador);
  } catch {
    return false;
  }
};

const marcadoComoLento = () => {
  try {
    return localStorage.getItem(CHAVE_LENTO) === "1";
  } catch {
    return false;
  }
};

/**
 * Estima a capacidade do dispositivo para decidir quanto efeito visual aplicar.
 *
 * `backdrop-filter` é o item mais caro da interface: ele força o compositor a
 * re-renderizar tudo que está atrás do elemento a cada frame. Em máquinas
 * fracas isso derruba a rolagem, então preferimos errar para o lado leve.
 *
 * "Reduzir movimento" do sistema NÃO entra mais aqui: é um pedido sobre
 * animação, não sobre placa de vídeo, e jogava no modo sem vidro toda máquina
 * Windows com os efeitos de animação desligados.
 */
export function detectFxLevel(): FxLevel {
  if (typeof window === "undefined") return "balanced";

  const nav = navigator as NavigatorWithHints;

  if (nav.connection?.saveData) return "lite";
  if (marcadoComoLento()) return "lite";

  // Sem suporte a backdrop-filter, o vidro não renderiza de qualquer forma.
  const suportaBlur = CSS?.supports?.("backdrop-filter", "blur(1px)") || CSS?.supports?.("-webkit-backdrop-filter", "blur(1px)");
  if (!suportaBlur) return "lite";

  if (renderizaSemGpu()) return "lite";

  const cores = nav.hardwareConcurrency ?? 4;
  const memoria = nav.deviceMemory ?? 4;

  if (cores <= 4 || memoria <= 4) return "lite";
  if (cores <= 8 || memoria <= 8) return "balanced";

  return "full";
}

/* Uma detecção por carga de página: as heurísticas não mudam em runtime. */
let detectado: FxLevel | null = null;
export const fxDetectado = (): FxLevel => (detectado ??= detectFxLevel());

/**
 * O vigia de quadros — a prova no uso, depois da estimativa.
 *
 * As heurísticas acima chutam pelo hardware; isto mede. Alguns segundos depois
 * da abertura (para não contar a carga inicial), conta quantos quadros o
 * navegador consegue desenhar. Abaixo de ~20 por segundo a tela já está
 * engasgando, e a máquina passa para o modo leve — e fica marcada, para a
 * próxima abertura já nascer leve em vez de travar de novo até o vigia agir.
 *
 * Aba em segundo plano não conta: o navegador pausa os quadros dela, e isso
 * leria como máquina lenta.
 */
export function vigiarQuadros(aoEngasgar: () => void): () => void {
  let quadro = 0;
  let cancelado = false;

  const espera = window.setTimeout(() => {
    if (document.visibilityState !== "visible") return;

    const inicio = performance.now();
    let quadros = 0;

    const contar = (agora: number) => {
      if (cancelado || document.visibilityState !== "visible") return;

      quadros += 1;
      const passou = agora - inicio;

      if (passou < 4000) {
        quadro = requestAnimationFrame(contar);
        return;
      }

      if ((quadros / passou) * 1000 < 20) {
        detectado = "lite";
        try {
          localStorage.setItem(CHAVE_LENTO, "1");
        } catch {
          /* sem storage, vale só para esta sessão */
        }
        aoEngasgar();
      }
    };

    quadro = requestAnimationFrame(contar);
  }, 3000);

  return () => {
    cancelado = true;
    window.clearTimeout(espera);
    cancelAnimationFrame(quadro);
  };
}

export const FX_LABEL: Record<FxLevel, string> = {
  full: "Completo",
  balanced: "Equilibrado",
  lite: "Leve",
};

export const FX_DESCRIPTION: Record<FxLevel, string> = {
  full: "Vidro, brilho e profundidade no máximo.",
  balanced: "Vidro mais leve, mantendo a estética.",
  lite: "Cores sólidas, sem desfoque. Máxima fluidez.",
};
