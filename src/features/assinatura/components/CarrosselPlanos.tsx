import { useEffect, useMemo, useRef, useState } from "react";
import AliceCarousel from "react-alice-carousel";
import "react-alice-carousel/lib/alice-carousel.css";
import { Check, ChevronLeft, ChevronRight, Sparkles, Users, UserRound, Package, ShoppingCart, Infinity as InfinityIcon, Info, Table2, Bot, Headset } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Modal } from "@/shared/ui/Modal";
import { CICLO_LABEL, RECURSO_LABEL, type Plano } from "@/features/assinatura/types/assinatura.types";
import { formatCurrencyFromCents } from "@/shared/utils/currency";
import { formatNumber } from "@/shared/utils/format";

const LIMITES: { chave: keyof Plano; rotulo: string; icone: LucideIcon }[] = [
  { chave: "limiteUsuarios", rotulo: "Usuários", icone: Users },
  { chave: "limiteClientes", rotulo: "Clientes", icone: UserRound },
  { chave: "limiteProdutos", rotulo: "Produtos", icone: Package },
  { chave: "limitePedidosMes", rotulo: "Vendas/mês", icone: ShoppingCart },
];

/** Os que só aparecem no detalhe — importam depois de escolher, não antes. */
const LIMITES_EXTRA: { chave: keyof Plano; rotulo: string; icone: LucideIcon }[] = [
  { chave: "limitePlanilhas", rotulo: "Produções", icone: Table2 },
  { chave: "limiteAtendentes", rotulo: "Atendentes", icone: Headset },
  { chave: "limiteIaMes", rotulo: "Atendimentos IA/mês", icone: Bot },
];

const ORDEM_RECURSOS = Object.keys(RECURSO_LABEL);

const textoLimite = (valor: number | null) => (valor === null ? "∞" : valor === 0 ? "—" : formatNumber(valor));

const Valor = ({ valor }: { valor: number | null }) => (valor === null ? <InfinityIcon size={15} strokeWidth={2.4} className="text-accent-soft" aria-label="Sem limite" /> : <span className="text-[15px] leading-none tabular-nums text-ink">{formatNumber(valor)}</span>);

type Props = {
  planos: Plano[];
  selecionado: string;
  onSelecionar: (codigo: string) => void;
};

const CarrosselPlanos = ({ planos, selecionado, onSelecionar }: Props) => {
  const carrossel = useRef<AliceCarousel>(null);

  const [indice, setIndice] = useState(() => {
    const i = planos.findIndex((p) => p.codigo === selecionado);
    return i >= 0
      ? i
      : Math.max(
          planos.findIndex((p) => p.destaque),
          0,
        );
  });

  const irPara = (i: number) => {
    const alvo = Math.min(Math.max(i, 0), planos.length - 1);

    setIndice(alvo);
    carrossel.current?.slideTo(alvo);
  };

  const [detalhe, setDetalhe] = useState<Plano | null>(null);

  useEffect(() => {
    const i = planos.findIndex((p) => p.codigo === selecionado);
    if (i >= 0) irPara(i);
  }, [selecionado, planos]);

  const itens = useMemo(
    () =>
      planos.map((plano) => {
        const escolhido = plano.codigo === selecionado;

        return (
          <div key={plano.id} className="px-2 pb-1">
            <div className={`flex min-h-[356px] flex-col rounded-2xl border transition-all ${escolhido ? "border-accent bg-accent/[0.08] shadow-[0_18px_50px_-24px_rgb(var(--accent))]" : "border-fg/[0.1] bg-fg/[0.02] hover:border-accent/40"}`}>
              <button type="button" onClick={() => onSelecionar(plano.codigo)} aria-pressed={escolhido} className="focus-ring flex flex-1 select-none flex-col rounded-t-2xl p-5 text-left">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[17px] text-ink">{plano.nome}</p>
                    {plano.publicoAlvo && <p className="mt-0.5 truncate text-[11.5px] text-accent-soft">{plano.publicoAlvo}</p>}
                  </div>

                  {escolhido ? (
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-white">
                      <Check size={13} />
                    </span>
                  ) : plano.destaque ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[9.5px] uppercase tracking-[0.5px] text-accent-soft">
                      <Sparkles size={9} />
                      Popular
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap items-baseline gap-x-1.5">
                  <span className="text-[34px] leading-none tracking-tight text-ink">{formatCurrencyFromCents(plano.precoCentavos)}</span>
                  <span className="text-[12px] text-faint">{CICLO_LABEL[plano.ciclo]}</span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-fg/[0.08]">
                  {LIMITES.map(({ chave, rotulo, icone: Icone }) => (
                    <div key={rotulo} className="flex items-center justify-between gap-2 bg-surface px-3 py-2.5">
                      <span className="flex min-w-0 items-center gap-1.5 text-[10.5px] leading-none text-faint">
                        <Icone size={11} className="shrink-0 text-muted" />
                        <span className="truncate">{rotulo}</span>
                      </span>
                      <Valor valor={plano[chave] as number | null} />
                    </div>
                  ))}
                </div>

                <p className="mt-4 line-clamp-3 text-[12.5px] leading-relaxed text-mist">{plano.descricao}</p>

                <span className="flex-1" />
              </button>

              <button type="button" onClick={() => setDetalhe(plano)} className="focus-ring flex items-center justify-center gap-1.5 rounded-b-2xl border-t border-fg/[0.08] px-4 py-3 text-[12.5px] text-mist transition-colors hover:bg-fg/[0.04] hover:text-accent-soft">
                <Info size={14} />
                Saber mais sobre o {plano.nome}
              </button>
            </div>
          </div>
        );
      }),
    [planos, selecionado, onSelecionar],
  );

  if (planos.length === 0) return null;

  const seta = "focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-fg/[0.1] text-mist transition-colors hover:border-accent/40 hover:text-ink disabled:opacity-30";

  const inclusos = detalhe ? ORDEM_RECURSOS.filter((c) => detalhe.recursos?.[c] === true) : [];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-faint">{planos.length} planos · deslize para comparar, toque para escolher</p>

      <div className="-mx-2">
        <AliceCarousel
          ref={carrossel}
          items={itens}
          activeIndex={indice}
          onSlideChanged={(e) => setIndice(e.item)}
          responsive={{ 0: { items: 1 } }}
          disableButtonsControls
          disableDotsControls
          mouseTracking
          /* Sem `infinite`: numa escada de preço, voltar do Enterprise para o
             Starter num passo confunde quem compara de baixo para cima. */
          keyboardNavigation
        />
      </div>

      <div className={`items-center justify-between gap-3 ${planos.length > 1 ? "flex" : "hidden"}`}>
        <button type="button" aria-label="Plano anterior" className={seta} disabled={indice === 0} onClick={() => irPara(indice - 1)}>
          <ChevronLeft size={15} />
        </button>

        <div className="flex items-center gap-1.5">
          {planos.map((p, i) => (
            <button key={p.id} type="button" aria-label={`Ir para ${p.nome}`} onClick={() => irPara(i)} className={`h-1.5 rounded-full transition-all ${i === indice ? "w-5 bg-accent" : "w-1.5 bg-fg/[0.18] hover:bg-fg/[0.3]"}`} />
          ))}
        </div>

        <button type="button" aria-label="Próximo plano" className={seta} disabled={indice >= planos.length - 1} onClick={() => irPara(indice + 1)}>
          <ChevronRight size={15} />
        </button>
      </div>

      {/* ==================== DETALHE DO PLANO ==================== */}
      <Modal open={!!detalhe} onClose={() => setDetalhe(null)} title={detalhe ? detalhe.nome : ""} subtitle={detalhe?.publicoAlvo ?? undefined} size="lg">
        {detalhe && (
          <div className="flex flex-col gap-5">
            {/* Preço e chamada: o porquê antes do quanto. */}
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-fg/[0.06] pb-4">
              <div className="min-w-0">
                {detalhe.chamada && <p className="text-[13px] leading-relaxed text-mist">{detalhe.chamada}</p>}
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-faint">{detalhe.descricao}</p>
              </div>

              <p className="shrink-0 text-right">
                <span className="block text-[30px] leading-none tracking-tight text-ink">{formatCurrencyFromCents(detalhe.precoCentavos)}</span>
                <span className="text-[11px] text-faint">{CICLO_LABEL[detalhe.ciclo]}</span>
              </p>
            </div>

            {/* Todos os limites, inclusive os que não cabem no cartão. */}
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-[0.1em] text-faint">Até quanto vai</p>

              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-fg/[0.06] sm:grid-cols-4">
                {[...LIMITES, ...LIMITES_EXTRA].map(({ chave, rotulo, icone: Icone }) => (
                  <div key={rotulo} className="bg-surface px-3 py-2.5 text-center">
                    <p className="text-[15px] leading-none tabular-nums text-ink">{textoLimite(detalhe[chave] as number | null)}</p>
                    <p className="mt-1.5 flex items-center justify-center gap-1 text-[9.5px] leading-tight text-faint">
                      <Icone size={9} className="shrink-0 text-muted" />
                      {rotulo}
                    </p>
                  </div>
                ))}
              </div>

              <p className="mt-2 text-[11px] text-faint">
                <span className="text-mist">∞</span> sem limite · <span className="text-mist">—</span> não incluído neste plano
              </p>
            </div>

            {/* O que está dentro. Só o que TEM: listar o que falta e riscar é
                o argumento do concorrente, não o nosso. */}
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-[0.1em] text-faint">O que vem junto</p>

              <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {inclusos.map((chave) => (
                  <li key={chave} className="flex items-center gap-2 rounded-lg bg-fg/[0.03] px-3 py-2 text-[12.5px] text-mist">
                    <Check size={13} className="shrink-0 text-success" />
                    {RECURSO_LABEL[chave] ?? chave}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-2 border-t border-fg/[0.06] pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setDetalhe(null)} className="focus-ring min-h-[42px] rounded-xl border border-fg/[0.1] px-4 text-[13px] text-mist transition-colors hover:text-ink">
                Voltar
              </button>

              <button
                type="button"
                onClick={() => {
                  onSelecionar(detalhe.codigo);
                  setDetalhe(null);
                }}
                className="focus-ring flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl bg-accent px-5 text-[13px] text-white transition-all hover:brightness-110 active:scale-[0.99]"
              >
                <Check size={14} />
                Escolher o {detalhe.nome}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default CarrosselPlanos;
