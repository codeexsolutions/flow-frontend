import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { FxLevel } from "./detectPerformance";
import type { ThemeId } from "./theme.catalog";

/** O tema é a paleta inteira; o catálogo em `theme.catalog.ts` é quem manda. */
export type ThemeMode = ThemeId;
export type AccentId =
  | "roxo"
  | "azul"
  | "verde"
  | "rosa"
  | "laranja"
  | "cinza"
  | "preto"
  | "teal"
  | "vinho"
  | "dourado"
  | "coral"
  | "lima"
  | "indigo"
  | "magenta"
  | "cobre"
  | "lavanda";
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
      /* Efeitos COMPLETOS por padrão: vidro, aurora e brilhos inteiros. O
         nível continua escolhível em Aparência para quem precisar aliviar. */
      fx: "full",
      setMode: (mode) => set({ mode }),
      setAccent: (accent) => set({ accent }),
      setFontScale: (fontScale) => set({ fontScale }),
      setMotion: (motion) => set({ motion }),
      setFx: (fx) => set({ fx }),
    }),
    {
      name: "codex-flow-theme",
      version: 5,
      /*
       * Efeitos: só Completo e Equilibrado, e Completo por padrão.
       *
       * Da 3 para a 4, todo mundo passou para o Completo. Da 4 para a 5 os
       * níveis "Automático" e "Leve" deixaram de existir: quem ainda estiver
       * em um deles vai para o Completo. Quem escolheu Equilibrado continua.
       */
      migrate: (salvo) => {
        const anterior = salvo as Partial<ThemeState>;
        return { ...anterior, fx: anterior.fx === "balanced" ? "balanced" : "full" } as ThemeState;
      },
    },
  ),
);

export default useThemeStore;
