import type { ReactNode } from "react";

/**
 * As peças de uma FICHA — a tela que mostra tudo sobre uma coisa só.
 *
 * ---------------------------------------------------------------------------
 * Por que isto existe
 * ---------------------------------------------------------------------------
 * O sistema tem três fichas — cliente, produto e funcionário — e as três foram
 * copiadas uma da outra. `StatCard`, `Dado` e `Cartao` estavam definidos
 * **três vezes**, com o mesmo HTML e as mesmas classes até o `text-[9.5px]`.
 *
 * A cópia não era inofensiva: as três versões já tinham divergido. O `StatCard`
 * do cliente não aceitava `tom` (então um número em atraso não ficava vermelho
 * ali), e só o do produto tinha `destaque`. Quem mexesse no espaçamento de uma
 * ficha mudaria uma e deixaria duas para trás — e ninguém perceberia, porque
 * as três telas raramente são abertas em sequência.
 *
 * Aqui é o superconjunto: nada foi tirado de ninguém.
 *
 * ---------------------------------------------------------------------------
 * Quando usar
 * ---------------------------------------------------------------------------
 * Numa tela de DETALHE, sobre uma entidade. Para listagem, o vocabulário é
 * outro (`DataTable`); para ajuste, outro ainda (`SettingsCard`).
 */

/** O que se mostra quando o campo está vazio. Um traço, nunca nada. */
export const VAZIO = "—";

const TONS = {
  danger: "bg-danger/[0.14] text-danger ring-danger/20",
  warning: "bg-warning/[0.14] text-warning ring-warning/20",
  success: "bg-success/[0.14] text-success ring-success/20",
  neutro: "bg-accent/[0.14] text-accent-soft ring-accent/20",
} as const;

/**
 * O número em destaque da ficha — total gasto, saldo, faltas.
 *
 * `tom` pinta o ícone quando o número é notícia (vermelho para atraso, verde
 * para em dia). Sem `tom`, ele fica na cor de destaque do tema.
 *
 * `hint` é a linha pequena embaixo — e vai junto no `title`, porque numa
 * coluna estreita ela trunca, e uma dica cortada no meio ("limitado por Tecido
 * pr…") é pior que nenhuma.
 */
export const StatCard = ({
  icon,
  label,
  value,
  hint,
  tom,
  destaque,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  tom?: keyof typeof TONS;
  /** Anel de destaque — o número que a tela quer que se olhe primeiro. */
  destaque?: boolean;
}) => (
  <div
    title={hint ? `${label} — ${hint}` : label}
    className={`card glass-sheen rounded-xl p-2.5 transition-colors hover:border-fg/[0.12] ${
      destaque ? "ring-1 ring-inset ring-accent/30" : ""
    }`}
  >
    <div className={`mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg ring-1 ring-inset ${TONS[tom ?? "neutro"]}`}>
      {icon}
    </div>
    <p className="truncate text-[9.5px] uppercase tracking-[0.08em] text-faint">{label}</p>
    <p className="mt-0.5 truncate text-[14px] tabular-nums tracking-tight text-ink sm:text-[15px]">{value}</p>
    {hint && <p className="truncate text-[9.5px] text-faint">{hint}</p>}
  </div>
);

/**
 * Uma linha de dado: rótulo à esquerda, valor à direita.
 *
 * **Campo vazio NÃO some** — aparece como "—". Sumir faria a ficha mudar de
 * altura conforme a entidade e esconderia justamente o que falta preencher,
 * que costuma ser a informação mais acionável da tela.
 *
 * O valor alinha à DIREITA e leva `title`: na coluna estreita ele é a metade
 * que trunca, e um telefone ou um preço cortado no meio não serve para nada.
 */
export const Dado = ({
  icon,
  label,
  valor,
  vazio = VAZIO,
  acao,
}: {
  icon: ReactNode;
  label: string;
  valor?: string | null;
  vazio?: string;
  /** Botão ao lado do valor — copiar, abrir o WhatsApp, o que a ficha tiver. */
  acao?: ReactNode;
}) => (
  <div className="flex items-center gap-2.5 px-3.5 py-2">
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-fg/[0.04] text-muted">{icon}</span>
    <span className="w-[74px] shrink-0 text-[9.5px] uppercase tracking-[0.06em] text-faint">{label}</span>
    <span title={valor || undefined} className={`min-w-0 flex-1 truncate text-right text-[12px] ${valor ? "text-ink" : "text-faint"}`}>
      {valor || vazio}
    </span>
    {acao}
  </div>
);

/** O cartão que agrupa as linhas de uma seção da ficha. */
export const Cartao = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`card glass-sheen overflow-hidden rounded-2xl ${className}`}>{children}</div>
);

/*
 * `SectionHead` NÃO subiu para cá, e é de propósito.
 *
 * Ele existe só na ficha do cliente. Trazer para o compartilhado um componente
 * com UM consumidor é adivinhar como o segundo vai querer usá-lo — e o custo
 * aparece quando ele chega e precisa de algo que a assinatura não previu.
 * Sobe quando existir o segundo.
 */
