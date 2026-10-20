import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { FxLevel } from "./detectPerformance";
import type { ThemeId } from "./theme.catalog";

/** O tema é a paleta inteira; o catálogo em `theme.catalog.ts` é quem manda. */
export type ThemeMode = ThemeId;
export type AccentId = "roxo" | "azul" | "verde" | "rosa" | "laranja" | "cinza" | "preto" | "teal" | "vinho" | "dourado";
export type FontScale = "sm" | "md" | "lg";
/** "full" anima sempre, mesmo com o sistema pedindo menos movimento. */
export type MotionPref = "auto" | "reduce" | "full";
/** "auto" delega para a detecção de hardware. */
export type FxPref = FxLevel | "auto";

interface ThemeState {
  mode: ThemeMode;
  accent: AccentId;
  fontScale: FontScale;
  motion: MotionPref;
  fx: FxPref;
  setMode: (m: ThemeMode) => void;
  setAccent: (a: AccentId) => void;
  setFontScale: (f: FontScale) => void;
  setMotion: (m: MotionPref) => void;
  setFx: (f: FxPref) => void;
}

const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      /*
       * O Flow começa claro e verde.
       *
       * É a identidade da marca e o que a maioria espera de um sistema de
       * balcão — tela clara aguenta luz de loja, e o verde é a cor do
       * "deu certo" no PDV.
       *
       * Só vale para quem ainda não escolheu: o `persist` guarda a
       * preferência de quem já mexeu em Aparência, e essa preferência
       * continua vencendo. Trocar o tema de quem escolheu seria desfazer
       * uma decisão da pessoa.
       */
      mode: "claro",
      accent: "verde",
      fontScale: "md",
      motion: "auto",
      fx: "auto",
      setMode: (mode) => set({ mode }),
      setAccent: (accent) => set({ accent }),
      setFontScale: (fontScale) => set({ fontScale }),
      setMotion: (motion) => set({ motion }),
      setFx: (fx) => set({ fx }),
    }),
    { name: "codex-flow-theme", version: 3 },
  ),
);

export default useThemeStore;
