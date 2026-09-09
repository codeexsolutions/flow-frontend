import React from "react";
import type { ReactNode } from "react";
import { Loader2, Save, X, Trash2 } from "lucide-react";

/**
 * Kit de formulário do sistema.
 *
 * Antes cada tela reinventava rótulo, casca do input, mensagem de erro e barra
 * de ações — com espaçamentos e tamanhos ligeiramente diferentes. Tudo o que é
 * formulário deve ser montado a partir daqui.
 */

/* ─────────────────────────── Casca compartilhada ─────────────────────────── */

const shellBase = "flex min-w-0 items-center gap-2 rounded-lg px-3 transition-all duration-200";
const shellIdle = "border-fg/[0.09] hover:border-fg/[0.16] focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/15";
const shellError = "border-danger/60 focus-within:border-danger focus-within:ring-2 focus-within:ring-danger/15";

const shell = (error?: string) => `glass-subtle ${shellBase} ${error ? shellError : shellIdle}`;

const labelCls = "mb-1.5 block text-[11px] uppercase tracking-[0.08em] text-faint";
const inputCls = "w-full min-w-0 flex-1 bg-transparent py-2.5 text-sm text-ink outline-none placeholder:text-faint";

/** Linha de mensagem com altura fixa — impede o layout de"pular" ao validar. */
const FieldMessage = ({ error, hint }: { error?: string; hint?: string }) => (
  <p role={error ? "alert" : undefined} className={`mt-1 min-h-[14px] text-[10.5px] leading-[14px] ${error ? "text-danger" : "text-faint"}`}>
    {error ?? hint ?? ""}
  </p>
);

/* ──────────────────────────────── Estrutura ──────────────────────────────── */

export const Form = ({ children, className = "", ...props }: React.FormHTMLAttributes<HTMLFormElement>) => (
  <form {...props} className={`flex flex-col gap-5 ${className}`} noValidate>
    {children}
  </form>
);

/** Título de seção com filete — separa blocos dentro do formulário. */
export const FormSection = ({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) => (
  <section className="flex flex-col gap-3.5">
    <div className="flex items-center gap-2.5">
      {icon && <span className="text-accent-soft">{icon}</span>}
      <span className="text-[11px] uppercase tracking-[0.12em] text-mist">{title}</span>
      <span className="h-px flex-1 bg-fg/[0.08]" />
    </div>
    {children}
  </section>
);

/** Grade responsiva padrão dos campos. */
export const FormGrid = ({ cols = 2, children }: { cols?: 1 | 2 | 3; children: ReactNode }) => {
  const map = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3" } as const;
  return <div className={`grid grid-cols-1 gap-x-4 gap-y-1 ${map[cols]}`}>{children}</div>;
};

/* ────────────────────────────────── Campos ───────────────────────────────── */

type TextFieldProps = {
  label: string;
  hint?: string;
  icon?: ReactNode;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>;

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(({ label, hint, icon, error, className = "", id, ...props }, ref) => {
  const fieldId = id ?? props.name;

  /*
   * Campo de NÚMERO seleciona o conteúdo ao receber o foco.
   *
   * Número quase sempre se TROCA por inteiro — a quantidade, o estoque
   * mínimo, o número de parcelas. Sem a seleção, o campo que está com 0 (ou
   * com o valor anterior) recebe o dígito ao lado do que já havia: digita-se
   * "1" e fica "01", "02", "03", e para corrigir é preciso selecionar e apagar
   * antes de cada troca.
   *
   * Só em `number`: em texto o normal é EMENDAR — completar um nome, corrigir
   * o fim de um endereço —, e selecionar tudo ali faria a primeira tecla
   * apagar o que a pessoa queria manter.
   *
   * `onFocus` explícito de quem chama continua valendo: o padrão só entra
   * quando ninguém pediu outra coisa.
   */
  const selecionarSeNumero =
    props.type === "number" && !props.onFocus
      ? (e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.select()
      : props.onFocus;

  return (
    <div className="flex flex-col">
      <label htmlFor={fieldId} className={labelCls}>
        {label}
      </label>
      <div className={shell(error)}>
        {icon && <span className="shrink-0 text-muted">{icon}</span>}
        <input id={fieldId} ref={ref} aria-invalid={!!error} {...props} onFocus={selecionarSeNumero} className={`${inputCls} ${className}`} />
      </div>
      <FieldMessage error={error} hint={hint} />
    </div>
  );
});
TextField.displayName = "TextField";

type CurrencyFieldProps = {
  label: string;
  hint?: string;
  error?: string;
  value: number;
  onValueChange: (valor: number) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">;

/**
 * Campo de dinheiro que se escreve como dinheiro.
 *
 * `<input type="number">` é errado para preço: aceita "12.5" e "12,5" de
 * formas diferentes conforme o teclado, mostra setinha de incremento que
 * ninguém usa, e deixa o valor cru na tela — quem digita 1250 vê "1250" e não
 * "R$ 12,50", que é o que ele queria dizer.
 *
 * Aqui só entram dígitos, lidos sempre como CENTAVOS, da direita para a
 * esquerda — o mesmo comportamento de qualquer maquininha de cartão. Digitar
 * 1, 2, 5, 0 mostra R$ 0,01 → R$ 0,12 → R$ 1,25 → R$ 12,50. Não existe estado
 * inválido possível, então não há o que validar.
 */
export const CurrencyField = ({ label, hint, error, value, onValueChange, className = "", id, ...props }: CurrencyFieldProps) => {
  const fieldId = id ?? props.name;

  const formatar = (centavos: number) =>
    (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // `Math.round` antes de exibir: o valor chega como reais em float e
  // 0.1 + 0.2 basta para virar 30.000000000000004 centavos.
  const centavos = Math.round((Number(value) || 0) * 100);

  return (
    <div className="flex flex-col">
      <label htmlFor={fieldId} className={labelCls}>
        {label}
      </label>
      <div className={shell(error)}>
        <span className="shrink-0 text-[13px] text-muted">R$</span>
        <input
          id={fieldId}
          inputMode="numeric"
          aria-invalid={!!error}
          {...props}
          value={formatar(centavos)}
          onChange={(e) => {
            const digitos = e.target.value.replace(/\D/g, "").slice(0, 11);
            onValueChange(Number(digitos) / 100);
          }}
          /* O cursor vai para o fim a cada foco: no meio do texto formatado,
             digitar inseriria o dígito onde ele não pertence — o valor sempre
             cresce pela direita. */
          onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
          className={`${inputCls} text-right tabular-nums ${className}`}
        />
      </div>
      <FieldMessage error={error} hint={hint} />
    </div>
  );
};

type SelectFieldProps = {
  label: string;
  hint?: string;
  icon?: ReactNode;
  error?: string;
  children: ReactNode;
} & React.SelectHTMLAttributes<HTMLSelectElement>;

export const SelectBox = React.forwardRef<HTMLSelectElement, SelectFieldProps>(({ label, hint, icon, error, children, className = "", id, ...props }, ref) => {
  const fieldId = id ?? props.name;
  return (
    <div className="flex flex-col">
      <label htmlFor={fieldId} className={labelCls}>
        {label}
      </label>
      <div className={`${shell(error)} relative`}>
        {icon && <span className="shrink-0 text-muted">{icon}</span>}
        <select id={fieldId} ref={ref} aria-invalid={!!error} {...props} className={`${inputCls} cursor-pointer appearance-none pr-6 [&>option]:bg-surface ${className}`}>
          {children}
        </select>
        <span className="pointer-events-none absolute right-3 text-[10px] text-faint">▼</span>
      </div>
      <FieldMessage error={error} hint={hint} />
    </div>
  );
});
SelectBox.displayName = "SelectBox";

type TextAreaProps = {
  label: string;
  hint?: string;
  error?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(({ label, hint, error, className = "", id, ...props }, ref) => {
  const fieldId = id ?? props.name;
  return (
    <div className="flex flex-col">
      <label htmlFor={fieldId} className={labelCls}>
        {label}
      </label>
      <div className={`${shell(error)} !items-start py-1`}>
        <textarea id={fieldId} ref={ref} aria-invalid={!!error} rows={3} {...props} className={`${inputCls} resize-y ${className}`} />
      </div>
      <FieldMessage error={error} hint={hint} />
    </div>
  );
});
TextArea.displayName = "TextArea";

type SwitchFieldProps = {
  label: string;
  /** Explica a CONSEQUÊNCIA de ligar. Ver a nota abaixo. */
  hint?: string;
  checked: boolean;
  onChange: (valor: boolean) => void;
  disabled?: boolean;
};

/**
 * Chave liga/desliga com rótulo e explicação.
 *
 * A linha inteira é o alvo do clique, não só o quadradinho: num campo de
 * 20 px, quem usa no celular erra mais do que acerta.
 *
 * O `hint` não é decoração. Estas chaves decidem regra de negócio ("pode
 * vender sem estoque?"), e o rótulo sozinho não diz o que acontece ao ligar —
 * a pessoa marca para descobrir, e descobre numa venda.
 */
export const SwitchField = ({ label, hint, checked, onChange, disabled }: SwitchFieldProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className="focus-ring flex w-full cursor-pointer items-start gap-3 rounded-lg border border-fg/[0.07] bg-fg/[0.02] px-3 py-2.5 text-left transition-colors hover:border-fg/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
  >
    <span
      aria-hidden
      className={`mt-0.5 flex h-[18px] w-[32px] shrink-0 items-center rounded-full p-[2px] transition-colors ${checked ? "bg-accent" : "bg-fg/[0.16]"}`}
    >
      <span className={`h-[14px] w-[14px] rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[14px]" : "translate-x-0"}`} />
    </span>

    <span className="min-w-0 flex-1">
      <span className="block text-[12.5px] text-ink">{label}</span>
      {hint && <span className="mt-0.5 block text-[11px] leading-[15px] text-faint">{hint}</span>}
    </span>
  </button>
);

/* ───────────────────────────────── Ações ─────────────────────────────────── */

/**
 * Botão em coluna: ícone em cima, legenda embaixo — assim a função de cada
 * ação fica explícita mesmo quando o ícone sozinho seria ambíguo.
 */
export const AcaoIcone = ({ icon, label, onClick, disabled, tone = "neutral", type = "button", title }: { icon: ReactNode; label: string; onClick?: () => void; disabled?: boolean; tone?: "neutral" | "danger" | "primary"; type?: "button" | "submit"; title?: string }) => {
  const tones = {
    neutral: "glass-subtle text-mist hover:text-ink",
    danger: "border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20",
    primary: "bg-gradient-to-br from-accent-soft to-accent text-white shadow-glow hover:brightness-110",
  } as const;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={`focus-ring inline-flex min-w-[86px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg px-4 py-2 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]}`}
    >
      <span className="flex h-4 items-center">{icon}</span>
      <span className="text-[11px] leading-none">{label}</span>
    </button>
  );
};

export const FormActions = ({ onCancel, onDelete, saving = false, submitText = "Salvar", cancelText = "Cancelar", deleteText = "Excluir" }: { onCancel?: () => void; onDelete?: () => void; saving?: boolean; submitText?: string; cancelText?: string; deleteText?: string }) => (
  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-fg/[0.07] pt-4">
    {onDelete && <AcaoIcone icon={<Trash2 className="h-4 w-4" />} label={deleteText} onClick={onDelete} disabled={saving} tone="danger" />}
    {onCancel && <AcaoIcone icon={<X className="h-4 w-4" />} label={cancelText} onClick={onCancel} disabled={saving} />}
    <AcaoIcone type="submit" icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} label={saving ? "Salvando…" : submitText} disabled={saving} tone="primary" />
  </div>
);
