import {
  ArrowRight, Users, Package, ShoppingCart, UserRound, Wallet, BarChart3,
  MessageCircle, Zap, Sparkles, Check, Infinity as InfinityIcon, Store, Truck,
  Target, Workflow, Table2, FileText, Code2, Building2, Headset, Bot, Factory,
  ShieldCheck, Loader2, ReceiptText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { CICLO_LABEL, RECURSO_LABEL, type Plano } from "@/features/assinatura/types/assinatura.types";
import { formatCurrencyFromCents } from "@/shared/utils/currency";
import { formatNumber } from "@/shared/utils/format";

/**
 * O cartão de um plano — um só, usado na vitrine pública e na troca de plano
 * dentro do sistema.
 *
 * Antes existiam dois: o cartão bonito da página pública e uma lista seca de
 * botões no modal de troca. Quem já era cliente via a versão pobre justamente
 * na hora de gastar mais — e as duas listas divergiam a cada plano novo.
 */
const RECURSO_ICONE: Record<string, LucideIcon> = {
  pdv: Store,
  clientes: UserRound,
  produtos: Package,
  vendas: ShoppingCart,
  financeiro: Wallet,
  orcamentos: FileText,
  planilhas: Table2,
  producao: Factory,
  funcionarios: Users,
  fiscal: ReceiptText,
  areas: ShieldCheck,
  crm: Target,
  crmMultiAtendente: Headset,
  metas: Target,
  automacoes: Workflow,
  relatorios: BarChart3,
  correios: Truck,
  whatsappIntegrado: MessageCircle,
  iaAtendimento: Bot,
  multiLoja: Building2,
  api: Code2,
  apiLeitura: Code2,
  suporteWhatsapp: MessageCircle,
  suportePrioritario: Zap,
};

/** Ordem fixa das linhas — a mesma em todo cartão, para comparar de relance. */
const ORDEM_RECURSOS = Object.keys(RECURSO_LABEL);

const LIMITES: { chave: keyof Plano; label: string; icone: LucideIcon }[] = [
  { chave: "limiteUsuarios", label: "Usuários", icone: Users },
  { chave: "limiteClientes", label: "Clientes", icone: UserRound },
  { chave: "limiteProdutos", label: "Produtos", icone: Package },
  { chave: "limitePedidosMes", label: "Vendas/mês", icone: ShoppingCart },
];

/** Limite nulo no banco significa "sem teto". */
const LimiteValor = ({ valor }: { valor: number | null }) =>
  valor === null ? (
    <span className="flex items-center justify-center text-accent-soft" title="Sem limite">
      <InfinityIcon size={16} strokeWidth={2.4} />
    </span>
  ) : (
    <span className="text-[15px] leading-none tabular-nums text-ink sm:text-[17px]">{formatNumber(valor)}</span>
  );

type Props = {
  plano: Plano;
  /** Marca o cartão como o plano vigente da empresa. */
  atual?: boolean;
  /** Trava o botão — usado quando a troca do ciclo já foi consumida. */
  bloqueado?: boolean;
  /** Mostra spinner no botão deste cartão. */
  ocupado?: boolean;
  rotuloAcao?: string;
  onEscolher?: (p: Plano) => void;
};

const CardPlano = ({ plano, atual = false, bloqueado = false, ocupado = false, rotuloAcao, onEscolher }: Props) => {

  /*
   * Só o que o plano TEM.
   *
   * A versão antiga listava tudo e riscava o que faltava, para as linhas se
   * alinharem entre cartões. Com cinco planos e vinte recursos, o cartão do
   * Starter virava uma lista de quinze coisas riscadas — que é o argumento do
   * concorrente, não o nosso.
   */
  const inclusos = ORDEM_RECURSOS.filter((chave) => plano.recursos?.[chave] === true);

  const acaoDesabilitada = atual || bloqueado || ocupado || !onEscolher;

  return (
    <div
      className={`card glass-sheen relative flex h-full flex-col overflow-hidden transition-all duration-300 ${
        atual
          ? "border-success/40 shadow-[0_24px_70px_-32px_rgb(var(--success))]"
          : plano.destaque
            ? "border-accent/40 shadow-[0_24px_70px_-32px_rgb(var(--accent))] hover:-translate-y-1"
            : "hover:-translate-y-1 hover:border-fg/[0.16]"
      }`}
    >
      {/* Fio de luz no topo: marca o cartão sem gritar. */}
      {(plano.destaque || atual) && (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent ${
            atual ? "via-success" : "via-accent-soft"
          }`}
        />
      )}

      {/* Padding menor no celular: com `p-6` em 360px sobra pouca largura para
          o preço, e ele quebrava linha no meio do número. */}
      <div className="p-4 pb-4 sm:p-6 sm:pb-5">
        <div className="flex items-start justify-between gap-2 sm:gap-3">
          <div className="min-w-0">
            <h3 className="text-[15px] text-ink sm:text-[16px]">{plano.nome}</h3>
            {/* Para quem é, antes do que faz: é assim que a pessoa se
                reconhece num cartão em vez de comparar vinte linhas. */}
            {plano.publicoAlvo && <p className="mt-0.5 text-[11px] text-accent-soft">{plano.publicoAlvo}</p>}
            <p className="mt-1.5 text-[12px] leading-relaxed text-mist sm:min-h-[34px]">{plano.descricao}</p>
          </div>

          {atual ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-2 py-1 text-[10px] uppercase tracking-[0.6px] text-success ring-1 ring-success/25">
              <Check size={10} />
              Atual
            </span>
          ) : plano.destaque ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/15 px-2 py-1 text-[10px] uppercase tracking-[0.6px] text-accent-soft ring-1 ring-accent/25">
              <Sparkles size={10} />
              <span className="hidden sm:inline">Mais escolhido</span>
              <span className="sm:hidden">Popular</span>
            </span>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-baseline gap-x-1.5 sm:mt-5">
          <span className="text-[28px] leading-none tracking-tight text-ink sm:text-[34px]">
            {formatCurrencyFromCents(plano.precoCentavos)}
          </span>
          <span className="text-[12px] text-faint">{CICLO_LABEL[plano.ciclo]}</span>
        </div>
      </div>

      {/* Limites — as divisórias são os vãos de 1px do próprio grid.
          Duas colunas no celular: quatro em 360px deixavam "Vendas/mês" em
          três linhas de duas letras. */}
      <div className="grid grid-cols-2 gap-px bg-fg/[0.06] py-px sm:grid-cols-4">
        {LIMITES.map(({ chave, label, icone: Icone }) => (
          <div key={label} className="flex flex-col items-center gap-1.5 bg-canvas px-2 py-3">
            <LimiteValor valor={plano[chave] as number | null} />
            <span className="flex items-center gap-1 text-center text-[9.5px] leading-none text-faint">
              <Icone size={10} className="shrink-0 text-muted" />
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* `flex-1` na lista e não no container: é ela que estica para ocupar a
          sobra, empurrando o botão para a base. Sem isso, o cartão com menos
          recursos deixava o botão no meio e os cinco botões da fileira ficavam
          em alturas diferentes. */}
      <div className="flex flex-1 flex-col gap-5 p-4 sm:gap-6 sm:p-6">
        <ul className="flex flex-1 flex-col gap-2">
          {inclusos.map((chave) => {
            const Icone = RECURSO_ICONE[chave] ?? Check;

            return (
              <li key={chave} className="flex items-center gap-2.5 text-[12.5px] text-mist">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent/[0.12] text-accent-soft ring-1 ring-inset ring-accent/20">
                  <Icone size={13} />
                </span>
                {RECURSO_LABEL[chave] ?? chave}
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={() => onEscolher?.(plano)}
          disabled={acaoDesabilitada}
          className={`focus-ring group inline-flex min-h-[46px] w-full items-center justify-center gap-1.5 rounded-xl text-[13.5px] transition-all active:scale-[0.99] disabled:cursor-not-allowed ${
            atual
              ? "border border-success/30 bg-success/[0.08] text-success disabled:opacity-100"
              : plano.destaque
                ? "bg-accent text-white shadow-[0_12px_32px_-12px_rgb(var(--accent))] hover:brightness-110 disabled:opacity-40"
                : "border border-fg/[0.12] text-ink hover:border-accent/40 hover:bg-fg/[0.04] disabled:opacity-40"
          }`}
        >
          {ocupado ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Trocando...
            </>
          ) : atual ? (
            <>
              <Check size={14} /> Seu plano
            </>
          ) : (
            <>
              <span className="truncate">{rotuloAcao ?? `Escolher ${plano.nome}`}</span>
              <ArrowRight size={14} className="shrink-0 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default CardPlano;
