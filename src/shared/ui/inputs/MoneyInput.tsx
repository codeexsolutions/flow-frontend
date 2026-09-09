import { useRef, useCallback } from "react";

/**
 * Formata valor numérico em reais (R$) para exibição.
 * Ex: 1234.5 → "R$ 1.234,50"
 */
export function formatReal(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

/**
 * Converte string digitada para valor numérico em reais.
 * Aceita digitação progressiva: "1" → 0.01, "12" → 0.12, "123" → 1.23
 */
function parseDigitsToReal(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return 0;
  return Number(digits) / 100;
}

/**
 * Input de valor monetário em REAL (R$).
 *
 * Diferença do CurrencyInput original:
 * - Trabalha com valor decimal (ex: 12.34 = R$ 12,34), NÃO em centavos
 * - Aceita `className` para estilização
 * - Já vem com padding esquerdo para ícone
 *
 * @example
 *   <MoneyInput value={preco} onChange={setPreco} />
 *   <MoneyInput value={produto.valorVenda} onChange={(v) => update({ valorVenda: v })} />
 */
type MoneyInputProps = {
  value: number;
  onChange: (val: number) => void;
  className?: string;
  placeholder?: string;
  /** Se true, adiciona padding à esquerda para ícone (pl-9) */
  withIcon?: boolean;
};

const MoneyInput = ({ value, onChange, className = "", placeholder = "R$ 0,00", withIcon = false }: MoneyInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const real = parseDigitsToReal(e.target.value);
      onChange(real);
    },
    [onChange],
  );

  const handleFocus = useCallback(() => {
    const el = inputRef.current;
    if (el) {
      setTimeout(() => el.setSelectionRange(el.value.length, el.value.length), 0);
    }
  }, []);

  /*
   * Zero aparece VAZIO, e o placeholder diz o que se espera ali.
   *
   * Um campo mostrando "R$ 0,00" obriga a apagar o zero antes de digitar — e
   * quem não apaga acaba com o valor colado no zero. É a mesma queixa do campo
   * de quantidade: "está com 0, eu digito e fica 01".
   *
   * Aqui isso já era a intenção, mas a condição LIA O DOM durante o render
   * (`!inputRef.current?.value`), o que é impuro e não confiável: no primeiro
   * render o ref ainda é nulo, e depois de digitar "00" o campo voltava a
   * escrever "R$ 0,00" em vez de esvaziar. A regra agora é só o valor.
   */
  const displayValue = value === 0 ? "" : formatReal(value);

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      placeholder={placeholder}
      className={className || `h-11 w-full rounded-xl border border-fg/[0.08] bg-fg/[0.04] px-3 text-sm text-ink placeholder-mist outline-none transition-colors focus:border-accent/60 focus:bg-fg/[0.06] ${withIcon ? "pl-9" : ""}`}
    />
  );
};

export { parseDigitsToReal };
export default MoneyInput;
