import { useEffect, useState } from "react";
import useThemeStore, { type ThemeMode, type MotionPref, type FxPref } from "@/shared/theme/theme.store";
import { fxDetectado, vigiarQuadros, type FxLevel } from "@/shared/theme/detectPerformance";
import { temaPorId } from "@/shared/theme/theme.catalog";

const applyMode = (mode: ThemeMode) => {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  // "sistema" não é paleta: resolve para escuro/claro conforme o aparelho.
  const tema = mode === "sistema" ? (prefersDark ? "escuro" : "claro") : mode;
  const isDark = temaPorId(tema).dark;

  root.dataset.theme = tema;
  root.classList.toggle("dark", isDark);
  // Faz os controles nativos (scrollbar, inputs) acompanharem o tema.
  root.style.colorScheme = isDark ? "dark" : "light";

  // A barra do navegador (e a status bar do app instalado) segue a paleta:
  // um valor fixo no HTML deixava a moldura roxa mesmo no tema Sépia.
  const meta = document.querySelector('meta[name="theme-color"]');
  const canvas = getComputedStyle(root).getPropertyValue("--canvas").trim();

  if (meta && canvas) meta.setAttribute("content", `rgb(${canvas})`);
};

/**
 * A decisão final sobre movimento — a única que a tela consulta.
 *
 * O CSS (`[data-motion]`) e o framer-motion (`MovimentoConfig`) leem daqui.
 * Antes o CSS seguia o sistema por conta própria numa media query, e o
 * framer também: escolher "Sempre animar" não tinha como vencer o Windows.
 */
export const reduzMovimento = (pref: MotionPref) =>
  pref === "reduce" || (pref === "auto" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

const applyMotion = (pref: MotionPref) => {
  document.documentElement.dataset.motion = reduzMovimento(pref) ? "reduce" : "full";
};

const resolveFx = (pref: FxPref, detected: FxLevel): FxLevel => (pref === "auto" ? detected : pref);

/**
 * Aplica movimento e efeitos ANTES do primeiro render.
 *
 * Pelos efeitos do hook, o `data-fx` só chegava depois da primeira pintura —
 * e a máquina fraca desenhava a tela de entrada com o vidro no máximo, que é
 * exatamente o quadro que travava. O store já está hidratado aqui (o
 * `persist` lê o localStorage de forma síncrona).
 */
export const aplicarPreferenciasIniciais = () => {
  const { motion, fx } = useThemeStore.getState();
  applyMotion(motion);
  document.documentElement.dataset.fx = resolveFx(fx, fxDetectado());
};

const useTheme = () => {
  const mode = useThemeStore((s) => s.mode);
  const accent = useThemeStore((s) => s.accent);
  const fontScale = useThemeStore((s) => s.fontScale);
  const motion = useThemeStore((s) => s.motion);
  const fx = useThemeStore((s) => s.fx);

  // Detecta uma única vez por sessão; só o vigia de quadros rebaixa depois.
  const [detected, setDetected] = useState<FxLevel>(() => fxDetectado());

  useEffect(() => {
    applyMode(mode);
  }, [mode]);

  useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);

  useEffect(() => {
    document.documentElement.dataset.fontScale = fontScale;
  }, [fontScale]);

  useEffect(() => {
    applyMotion(motion);
  }, [motion]);

  useEffect(() => {
    document.documentElement.dataset.fx = resolveFx(fx, detected);
  }, [fx, detected]);

  /* No automático, confere no uso se a estimativa acertou — ver
     `vigiarQuadros`. Já leve não tem para onde descer. */
  useEffect(() => {
    if (fx !== "auto" || detected === "lite") return;
    return vigiarQuadros(() => setDetected("lite"));
  }, [fx, detected]);

  // Reage ao sistema quando estiver em "sistema"
  useEffect(() => {
    if (mode !== "sistema") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyMode("sistema");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  // Reage ao sistema quando motion estiver em "auto"
  useEffect(() => {
    if (motion !== "auto") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => applyMotion("auto");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [motion]);

  return { detectedFx: detected, activeFx: resolveFx(fx, detected) };
};

export default useTheme;
