import type { KeyboardEvent, ReactNode } from "react";
import { AlertTriangle, Clock, Crown, Percent, Receipt, ShieldCheck, Trash2, Wallet } from "lucide-react";

import { Selo } from "@/shared/ui/StatusBadge";
import { formatCurrency } from "@/shared/utils/currency";
import { formatNumber } from "@/shared/utils/format";
import type { Funcionario } from "@/shared/domain/funcionario";

/**
 * Cores do avatar, escolhidas pelo nome.
 *
 * Sem foto no cadastro, a inicial é o que diferencia um quadrado do outro na
 * grade. Todo mundo da mesma cor faria a grade virar uma parede de bolinhas
 * iguais; a cor sai do nome para a mesma pessoa ter sempre a mesma.
 */
const CORES_AVATAR = [
  "bg-accent/[0.14] text-accent-soft",
  "bg-success/[0.14] text-success",
  "bg-warning/[0.14] text-warning",
  "bg-sky-500/[0.14] text-sky-400",
  "bg-pink-500/[0.14] text-pink-400",
  "bg-violet-500/[0.14] text-violet-400",
];

const corDoNome = (nome: string) => {
  let soma = 0;
  for (const letra of nome) soma = (soma * 31 + letra.charCodeAt(0)) >>> 0;
  return CORES_AVATAR[soma % CORES_AVATAR.length];
};

const iniciais = (nome: string) =>
  nome.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";

/** O acesso ao sistema — "sem acesso" é um estado legítimo, não cadastro pela metade. */
function Acesso({ f }: { f: Funcionario }) {
  const acesso = f.acesso;

  if (!acesso) {
    return <span className="rounded-full bg-fg/[0.04] px-2 py-0.5 text-[11px] text-faint ring-1 ring-fg/[0.06]">Sem acesso</span>;
  }

  if (acesso.root) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] text-accent-soft ring-1 ring-accent/25">
        <Crown size={11} /> Master
      </span>
    );
  }

  return acesso.permissao === "ADMIN" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent/[0.1] px-2 py-0.5 text-[11px] text-accent-soft ring-1 ring-accent/20">
      <ShieldCheck size={11} /> Admin
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-fg/[0.06] px-2 py-0.5 text-[11px] text-mist ring-1 ring-fg/[0.08]">
      Vendedor
    </span>
  );
}

function Dado({ icone, rotulo, children }: { icone: ReactNode; rotulo: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="flex items-center gap-1 text-[10.5px] uppercase tracking-[0.8px] text-faint">
        {icone} {rotulo}
      </span>
      <span className="truncate text-[13.5px] tabular-nums text-ink">{children}</span>
    </div>
  );
}

type Props = {
  f: Funcionario;
  onAbrir: () => void;
  onRecibo: () => void;
  onExcluir: () => void;
};

/**
 * Um quadrado da grade da equipe.
 *
 * O cartão inteiro abre a ficha. Os dois botões do canto (recibo e remover)
 * param o clique ali: emitir recibo é trabalho de lote no fim do mês, e
 * obrigar a entrar na ficha de cada pessoa para isso transformaria seis
 * recibos em dezoito cliques.
 */
export default function FuncionarioCard({ f, onAbrir, onRecibo, onExcluir }: Props) {

  const pontoPendente = f.batePonto && f.jornada.length === 0;

  const teclado = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onAbrir();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onAbrir}
      onKeyDown={teclado}
      aria-label={`Abrir ficha de ${f.nome}`}
      className={`focus-ring group relative flex cursor-pointer flex-col gap-4 rounded-2xl border border-fg/[0.09] bg-fg/[0.035] p-5 shadow-[0_14px_34px_-14px_rgba(0,0,0,0.55)] transition duration-200 hover:-translate-y-1 hover:border-fg/[0.16] hover:bg-fg/[0.05] hover:shadow-[0_22px_48px_-16px_rgba(0,0,0,0.7)] ${f.ativo ? "" : "opacity-60 hover:opacity-90"}`}
    >
      {/* ---------- Acesso, no canto ---------- */}
      <div className="absolute right-4 top-4">
        <Acesso f={f} />
      </div>

      {/* ---------- Quem é ---------- */}
      <div className="flex items-center gap-3.5 pr-24">
        <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-[17px] font-semibold ${corDoNome(f.nome)}`}>
          {iniciais(f.nome)}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[15.5px] font-medium text-ink">{f.nome}</span>
          <span className="truncate text-[12.5px] text-faint">{f.cargo || "Sem cargo"}</span>
          {/* Desligado continua na grade: o histórico de ponto e as vendas
              dele seguem valendo, e sumir com o card esconderia isso. */}
          {!f.ativo && <span className="mt-0.5 w-fit"><Selo tom="neutro">Desligado</Selo></span>}
        </div>
      </div>

      {/* ---------- Números ---------- */}
      <div className="mt-auto grid grid-cols-3 gap-3 rounded-xl border border-fg/[0.06] bg-fg/[0.025] px-3.5 py-3">
        {/* Salário não informado sai como R$ 0,00: na grade, "—" parecia
            dado faltando no sistema, não na ficha. */}
        <Dado icone={<Wallet size={11} />} rotulo="Salário">
          {formatCurrency(f.salario ?? 0)}
        </Dado>

        <Dado icone={<Percent size={11} />} rotulo="Comissão">
          {f.ganhaComissao
            ? f.comissaoPercentual != null ? `${formatNumber(f.comissaoPercentual)}%` : "a definir"
            : "Não"}
        </Dado>

        <Dado icone={<Clock size={11} />} rotulo="Ponto">
          {pontoPendente ? (
            <span className="inline-flex items-center gap-1 text-warning" title="Bate ponto, mas não tem jornada configurada">
              <AlertTriangle size={12} /> Sem jornada
            </span>
          ) : f.batePonto ? "Bate" : "Não bate"}
        </Dado>
      </div>

      {/* ---------- Ações ---------- */}
      <div className="-mb-1 flex items-center justify-between">
        <span className="text-[11.5px] text-faint transition group-hover:text-mist">Abrir ficha →</span>

        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRecibo(); }}
            title="Emitir recibo de salário"
            className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg border border-fg/[0.08] text-mist transition hover:bg-fg/[0.06] hover:text-ink"
          >
            <Receipt size={14} />
          </button>

          {/* O master não sai da equipe: sobraria empresa sem dono. */}
          {!f.acesso?.root && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onExcluir(); }}
              title="Remover da equipe"
              className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg border border-fg/[0.08] text-mist transition hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** O esqueleto de um card — mesma altura, para a grade não saltar quando os dados chegam. */
export function FuncionarioCardFantasma() {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-fg/[0.09] bg-fg/[0.035] p-5 shadow-[0_14px_34px_-14px_rgba(0,0,0,0.55)]">
      <div className="flex items-center gap-3.5">
        <div className="h-14 w-14 animate-pulse rounded-2xl bg-fg/[0.06]" />
        <div className="flex flex-col gap-2">
          <div className="h-4 w-32 animate-pulse rounded bg-fg/[0.06]" />
          <div className="h-3 w-20 animate-pulse rounded bg-fg/[0.05]" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 rounded-xl border border-fg/[0.06] px-3.5 py-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <div className="h-2.5 w-12 animate-pulse rounded bg-fg/[0.05]" />
            <div className="h-3.5 w-16 animate-pulse rounded bg-fg/[0.06]" />
          </div>
        ))}
      </div>
      <div className="flex justify-between">
        <div className="h-3 w-20 animate-pulse rounded bg-fg/[0.05]" />
        <div className="h-8 w-[70px] animate-pulse rounded-lg bg-fg/[0.05]" />
      </div>
    </div>
  );
}
