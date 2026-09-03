import { memo, useCallback, useState } from "react";
import type { ReactNode } from "react";
import { Lock, Eye, EyeOff, CircleCheck, Save } from "lucide-react";

/* ------------------------- Cascas visuais (Field) ------------------------- */

const shellBase = "flex min-w-0 items-center gap-2 rounded-lg border bg-fg/[0.035] px-3 transition-all duration-200";
const shellIdle = "border-fg/[0.08] hover:border-fg/[0.14] focus-within:border-accent focus-within:bg-fg/[0.05] focus-within:ring-2 focus-within:ring-accent/15";
const shellError = "border-danger/60 focus-within:border-danger focus-within:ring-2 focus-within:ring-danger/15";
const inputBase = "w-full flex-1 min-w-0 bg-transparent outline-none py-2.5 text-[13px] sm:text-sm text-ink placeholder:text-faint";
const labelBase = "block text-[10px] uppercase tracking-[0.7px] text-faint mb-1";

/* ---------------------------------- Card ---------------------------------- */

export const SettingsCard = memo(({ icon, title, desc, children, footer, className = "", corpoRolavel = false }: {
  icon: ReactNode;
  title: string;
  desc?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /**
   * O CORPO rola, e o cartão tem a altura que lhe deram.
   *
   * O padrão (`false`) é o certo para uma página que cresce: o cartão tem a
   * altura do conteúdo e quem rola é a página. Numa tela presa à janela vale o
   * contrário — o cabeçalho diz o que é o cartão e o rodapé tem o Salvar, e
   * os dois precisam ficar de pé enquanto os campos passam por baixo. Um
   * "Salvar" que só aparece depois de rolar até o fim é um botão que a pessoa
   * procura.
   *
   * Vale a partir de `xl`, e só lá: a tela presa à janela existe onde há duas
   * colunas. No celular a página rola inteira, como sempre rolou — prender a
   * altura ali daria um visor de 200px rolando dentro de outro que também
   * rola, e o polegar nunca sabe qual dos dois vai se mexer.
   */
  corpoRolavel?: boolean;
}) => (
  <section className={`flex flex-col overflow-hidden rounded-2xl border border-fg/[0.07] bg-surface ${corpoRolavel ? "xl:min-h-0 xl:flex-1" : ""} ${className}`}>
    <header className="flex shrink-0 items-center gap-2.5 border-b border-fg/[0.06] px-5 py-3.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/[0.15]">
        <span className="text-accent-soft">{icon}</span>
      </div>
      <div className="min-w-0">
        <h2 className="text-[13px] text-ink">{title}</h2>
        {desc && <p className="truncate text-[11px] text-faint">{desc}</p>}
      </div>
    </header>

    <div className={`p-5 ${corpoRolavel ? "xl:min-h-0 xl:flex-1 xl:overflow-y-auto" : ""}`}>{children}</div>

    {footer && <div className="shrink-0 border-t border-fg/[0.06] bg-fg/[0.02] px-5 py-3.5">{footer}</div>}
  </section>
));
SettingsCard.displayName = "SettingsCard";

/* -------------------------------- SaveRow --------------------------------- */

export const SaveRow = ({
  saving,
  saved,
  onSave,
  label = "Salvar",
  savedLabel = "Alterações salvas",
  icon = <Save className="h-4 w-4" />,
  variant = "primary",
  disabled,
}: {
  saving: boolean;
  saved: boolean;
  onSave: () => void;
  label?: string;
  savedLabel?: string;
  icon?: ReactNode;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}) => (
  <div className="flex flex-wrap items-center justify-end gap-3">
    {saved && !saving && (
      <span className="flex items-center gap-1.5 text-[12px] text-success">
        <CircleCheck className="h-4 w-4" /> {savedLabel}
      </span>
    )}
    <button
      type="button"
      onClick={onSave}
      disabled={saving || disabled}
      className={
        variant === "primary"
          ? "flex cursor-pointer items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13px] text-white shadow-[0_8px_24px_-8px_rgb(var(--accent))] transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          : "flex cursor-pointer items-center gap-2 rounded-xl border border-fg/[0.1] bg-fg/[0.06] px-4 py-2.5 text-[13px] text-accent-soft transition-all hover:bg-fg/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      {icon}
      {saving ? "Salvando…" : label}
    </button>
  </div>
);

/* -------------------------------- useSaver -------------------------------- */

// Troque o setTimeout pela chamada real de serviço ao ligar na API.
export function useSaver(action?: () => Promise<void>) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      if (action) await action();
      else await new Promise((r) => setTimeout(r, 700));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }, [action]);

  return { saving, saved, save };
}

/* ------------------------------ PasswordField ----------------------------- */

export const PasswordField = memo(({ label, value, onChange, show, onToggle, error }: { label: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void; error?: string }) => (
  <div className="flex flex-col">
    <label className={labelBase}>{label}</label>
    <div className={`${shellBase} ${error ? shellError : shellIdle}`}>
      <Lock size={15} className="shrink-0 text-muted" />
      <input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder="••••••••" className={inputBase} />
      <button type="button" onClick={onToggle} aria-label={show ? "Ocultar senha" : "Mostrar senha"} className="shrink-0 cursor-pointer text-muted transition-colors hover:text-accent-soft">
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
    <p role={error ? "alert" : undefined} className={`mt-0.5 min-h-[13px] text-[10px] leading-[13px] ${error ? "text-danger" : "text-transparent"}`}>
      {error || "."}
    </p>
  </div>
));
PasswordField.displayName = "PasswordField";

/* ------------------------------- SelectField ------------------------------ */

export const SelectField = memo(({ label, icon, value, onChange, children }: { label: string; icon?: ReactNode; value: string; onChange: (v: string) => void; children: ReactNode }) => (
  <div className="flex flex-col">
    <label className={labelBase}>{label}</label>
    <div className={`${shellBase} ${shellIdle}`}>
      {icon && <span className="shrink-0 text-muted">{icon}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputBase} cursor-pointer appearance-none [&>option]:bg-surface`}>
        {children}
      </select>
    </div>
    <p className="mt-0.5 min-h-[13px] text-[10px] leading-[13px]" />
  </div>
));
SelectField.displayName = "SelectField";
