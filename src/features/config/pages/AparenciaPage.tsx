import type { MouseEvent } from "react";
import { Palette, Check, Type, Sparkles, Accessibility, Layers, Zap, Brush } from "lucide-react";

import { SettingsCard } from "@/features/config/components/ConfigUI";
import { useAlert } from "@/shared/ui/Alert";
import useThemeStore, { type AccentId, type FontScale, type MotionPref, type ThemeMode, type FxPref } from "@/shared/theme/theme.store";
import { THEMES, temaPorId, type ThemeInfo } from "@/shared/theme/theme.catalog";
import { switchThemeWithTransition } from "@/shared/theme/transition";
import useTheme from "@/shared/theme/useTheme";
import { FX_LABEL, FX_DESCRIPTION } from "@/shared/theme/detectPerformance";

const ACCENTS: { id: AccentId; label: string; color: string }[] = [
  { id: "roxo", label: "Roxo", color: "#7c6ef5" },
  { id: "azul", label: "Azul", color: "#4aa8ff" },
  { id: "verde", label: "Verde", color: "#3ecf8e" },
  { id: "rosa", label: "Rosa", color: "#f062a0" },
  { id: "laranja", label: "Laranja", color: "#f5a623" },
  { id: "teal", label: "Teal", color: "#00c8dc" },
  { id: "vinho", label: "Vinho", color: "#dc466e" },
  { id: "dourado", label: "Dourado", color: "#f0be32" },
  { id: "preto", label: "Preto", color: "#3c3c50" },
  { id: "cinza", label: "Cinza", color: "#8a94a6" },
  { id: "coral", label: "Coral", color: "#ff806a" },
  { id: "lima", label: "Lima", color: "#aadc3c" },
  { id: "indigo", label: "Índigo", color: "#787dff" },
  { id: "magenta", label: "Magenta", color: "#eb5aeb" },
  { id: "cobre", label: "Cobre", color: "#e18c5f" },
  { id: "lavanda", label: "Lavanda", color: "#b9a5ff" },
];

const FONT_SCALES: { id: FontScale; label: string; desc: string; sample: string }[] = [
  { id: "sm", label: "Pequeno", desc: "Mais conteúdo por tela", sample: "Aa" },
  { id: "md", label: "Padrão", desc: "Equilíbrio recomendado", sample: "Aa" },
  { id: "lg", label: "Grande", desc: "Melhor legibilidade", sample: "Aa" },
];

const MOTIONS: { id: MotionPref; label: string; desc: string; icon: React.ReactNode }[] = [
  { id: "auto", label: "Automático", desc: "Segue as preferências do sistema", icon: <Sparkles size={15} /> },
  { id: "reduce", label: "Reduzidas", desc: "Só esmaecer, sem deslizar", icon: <Accessibility size={15} /> },
  /* Para quem tem os efeitos de animação do Windows desligados sem ter
     pedido — comum em máquina de escritório e acesso remoto. */
  { id: "full", label: "Sempre animar", desc: "Ignora a configuração do sistema", icon: <Zap size={15} /> },
];

/* Só dois níveis, e o Completo é o padrão: o Flow é desenhado com o vidro e
   os brilhos inteiros. O Equilibrado alivia o desfoque para quem precisar. */
const FX_OPTIONS: { id: FxPref; icon: React.ReactNode }[] = [
  { id: "full", icon: <Layers size={15} /> },
  { id: "balanced", icon: <Sparkles size={15} /> },
];

/** Miniatura da paleta: as cores vêm do catálogo, não dos tokens ativos. */
const ThemePreview = ({ tema, accent }: { tema: ThemeInfo; accent: string }) => {
  const { bg, panel, line, soft } = tema.preview;

  return (
    <div className="relative mb-2.5 h-16 w-full overflow-hidden rounded-lg border border-fg/[0.08]" style={{ background: bg }}>
      {/* "Sistema" mostra os dois lados porque é o que ele faz. */}
      {tema.id === "sistema" && (
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(90deg, ${temaPorId("escuro").preview.bg} 50%, ${temaPorId("claro").preview.bg} 50%)` }}
        />
      )}
      <div className="relative flex h-full gap-1 p-1.5">
        <div className="flex w-1/4 flex-col gap-1 rounded p-1" style={{ background: panel }}>
          <div className="h-1.5 w-full rounded-full" style={{ background: accent }} />
          <div className="h-1 w-3/4 rounded-full" style={{ background: soft }} />
          <div className="h-1 w-2/3 rounded-full" style={{ background: soft }} />
        </div>
        <div className="flex flex-1 flex-col gap-1 rounded p-1.5" style={{ background: panel }}>
          <div className="h-1.5 w-1/2 rounded-full" style={{ background: line }} />
          <div className="h-1 w-full rounded-full" style={{ background: soft }} />
          <div className="mt-auto h-2 w-1/3 self-end rounded" style={{ background: accent }} />
        </div>
      </div>
    </div>
  );
};

/** Selo de "opção ativa" — sempre no fluxo, nunca posicionado por cima. */
const Ativo = () => (
  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent text-white">
    <Check size={11} strokeWidth={3} />
  </span>
);

const AparenciaTab = () => {
  const alert = useAlert();
  const mode = useThemeStore((s) => s.mode);
  const accentId = useThemeStore((s) => s.accent);
  const fontScale = useThemeStore((s) => s.fontScale);
  const motion = useThemeStore((s) => s.motion);
  const fx = useThemeStore((s) => s.fx);
  const setMode = useThemeStore((s) => s.setMode);
  const setAccent = useThemeStore((s) => s.setAccent);
  const setFontScale = useThemeStore((s) => s.setFontScale);
  const setMotion = useThemeStore((s) => s.setMotion);
  const setFx = useThemeStore((s) => s.setFx);

  const { detectedFx, activeFx } = useTheme();

  const accent = ACCENTS.find((a) => a.id === accentId) ?? ACCENTS[0];

  const notify = (msg: string) => alert.toast("success", msg, undefined, { position: "bottom-right", timer: 1800 });

  const trocarTema = (e: MouseEvent<HTMLButtonElement>, id: ThemeMode) => {
    if (id === mode) return;
    switchThemeWithTransition(e, () => setMode(id));
    notify(`Tema ${temaPorId(id).label.toLowerCase()} aplicado`);
  };

  const trocarAccent = (a: (typeof ACCENTS)[number]) => {
    if (a.id === accent.id) return;
    setAccent(a.id);
    notify(`Cor ${a.label.toLowerCase()} aplicada`);
  };

  const trocarFontScale = (id: FontScale) => {
    if (id === fontScale) return;
    setFontScale(id);
    notify(`Tamanho ${FONT_SCALES.find((f) => f.id === id)?.label.toLowerCase()} aplicado`);
  };

  const trocarMotion = (id: MotionPref) => {
    if (id === motion) return;
    setMotion(id);
    notify(`Animações: ${MOTIONS.find((m) => m.id === id)?.label.toLowerCase()}`);
  };

  const trocarFx = (id: FxPref) => {
    if (id === fx) return;
    setFx(id);
    notify(`Efeitos: ${id === "auto" ? FX_LABEL.full.toLowerCase() : FX_LABEL[id].toLowerCase()}`);
  };

  const fxLabel = (id: FxPref) => (id === "auto" ? "Automático" : FX_LABEL[id]);
  const fxDesc = (id: FxPref) => (id === "auto" ? `Detectado: ${FX_LABEL[detectedFx]}` : FX_DESCRIPTION[id]);

  /* Cartão de opção: a diferença entre eles é só o conteúdo, então o estado
     visual (ativo/inativo) mora num lugar só. */
  const cardCls = (active: boolean) =>
    `focus-ring relative flex cursor-pointer flex-col rounded-xl border p-2.5 text-left transition-all ${
      active ? "border-accent/60 bg-accent/[0.1] ring-1 ring-accent/40" : "border-fg/[0.08] hover:border-fg/[0.16] hover:bg-fg/[0.02]"
    }`;

  return (
    // `items-start` evita que um card curto seja esticado até a altura do
    // vizinho — era isso que deixava a grade com buracos.
    <div className="grid grid-cols-1 items-start gap-4 pb-2 xl:grid-cols-2">
      {/* Tema — ocupa a linha inteira: são 7 opções com miniatura */}
      <SettingsCard
        icon={<Palette className="h-4 w-4" />}
        title="Tema"
        desc="Doze paletas completas. A troca é aplicada na hora."
        className="xl:col-span-2"
      >
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7">
          {THEMES.map((t) => {
            const active = t.id === mode;
            return (
              <button key={t.id} type="button" onClick={(e) => trocarTema(e, t.id)} className={cardCls(active)}>
                <ThemePreview tema={t} accent={accent.color} />
                <span className="flex items-center justify-between gap-1.5">
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] text-ink">{t.label}</span>
                    <span className="block truncate text-[10.5px] text-faint">{t.desc}</span>
                  </span>
                  {active && <Ativo />}
                </span>
              </button>
            );
          })}
        </div>
      </SettingsCard>

      {/* Cor de destaque */}
      <SettingsCard icon={<Brush className="h-4 w-4" />} title="Cor de destaque" desc="Usada em botões, links e elementos ativos. Funciona em qualquer tema.">
        <div className="flex flex-wrap items-center gap-2.5">
          {ACCENTS.map((a) => {
            const active = a.id === accent.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => trocarAccent(a)}
                title={a.label}
                aria-label={a.label}
                className={`focus-ring relative h-9 w-9 shrink-0 cursor-pointer rounded-full transition-transform hover:scale-105 ${active ? "ring-2 ring-fg/70 ring-offset-2 ring-offset-surface" : ""}`}
                style={{ background: a.color }}
              >
                {active && <Check size={15} strokeWidth={3} className="absolute inset-0 m-auto text-white drop-shadow" />}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-fg/[0.06] bg-fg/[0.02] p-3">
          <span className="text-[12px] text-mist">Prévia:</span>
          <button type="button" className="rounded-lg bg-accent px-3.5 py-1.5 text-[12px] text-white">
            Botão
          </button>
          <span className="text-[12px] text-accent">Link de exemplo</span>
        </div>
      </SettingsCard>

      {/* Tamanho do texto */}
      <SettingsCard icon={<Type className="h-4 w-4" />} title="Tamanho do texto" desc="Ajusta a escala geral da interface.">
        <div className="grid grid-cols-3 gap-2.5">
          {FONT_SCALES.map((f) => {
            const active = f.id === fontScale;
            const size = f.id === "sm" ? "text-[15px]" : f.id === "md" ? "text-[19px]" : "text-[23px]";
            return (
              <button key={f.id} type="button" onClick={() => trocarFontScale(f.id)} className={`${cardCls(active)} items-center gap-2 text-center`}>
                {/* O selo fica no canto, mas dentro do card: o botão é `relative`. */}
                {active && (
                  <span className="absolute right-2 top-2">
                    <Ativo />
                  </span>
                )}
                <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${size} ${active ? "bg-accent/20 text-accent-soft" : "bg-fg/[0.05] text-mist"}`}>{f.sample}</span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] text-ink">{f.label}</span>
                  <span className="block text-[10.5px] leading-tight text-faint">{f.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </SettingsCard>

      {/* Animações */}
      <SettingsCard icon={<Sparkles className="h-4 w-4" />} title="Animações" desc="“Automático” segue a configuração de acessibilidade do seu sistema.">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {MOTIONS.map((m) => {
            const active = m.id === motion;
            return (
              <button key={m.id} type="button" onClick={() => trocarMotion(m.id)} className={`${cardCls(active)} flex-row items-center gap-3`}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? "bg-accent/20 text-accent-soft" : "bg-fg/[0.05] text-mist"}`}>{m.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-ink">{m.label}</span>
                  <span className="block truncate text-[11px] text-faint">{m.desc}</span>
                </span>
                {active && <Ativo />}
              </button>
            );
          })}
        </div>
      </SettingsCard>

      {/* Efeitos visuais */}
      <SettingsCard icon={<Layers className="h-4 w-4" />} title="Efeitos visuais" desc="O desfoque de vidro é o efeito mais pesado. Se a rolagem travar, escolha um nível mais leve.">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {FX_OPTIONS.map((o) => {
            const active = o.id === fx;
            return (
              <button key={o.id} type="button" onClick={() => trocarFx(o.id)} className={`${cardCls(active)} flex-row items-center gap-3`}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? "bg-accent/20 text-accent-soft" : "bg-fg/[0.05] text-mist"}`}>{o.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-ink">{fxLabel(o.id)}</span>
                  <span className="block truncate text-[11px] text-faint">{fxDesc(o.id)}</span>
                </span>
                {active && <Ativo />}
              </button>
            );
          })}
        </div>

        <div className="relative mt-4 overflow-hidden rounded-xl border border-fg/[0.06] p-4">
          <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(120deg, rgb(var(--accent) / 0.5), rgb(var(--aurora-2) / 0.45))" }} />
          <div className="glass-strong relative flex items-center justify-between gap-3 rounded-lg px-3.5 py-3">
            <span className="text-[12.5px] text-ink">Prévia do vidro</span>
            <span className="rounded-full bg-accent/20 px-2.5 py-1 text-[11px] text-accent-soft">{FX_LABEL[activeFx]}</span>
          </div>
        </div>
      </SettingsCard>
    </div>
  );
};

export default AparenciaTab;
