import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CircleCheck, CircleSlash, FileDown, Hourglass, Loader2,
  QrCode, ReceiptText, Search, Timer, TriangleAlert,
} from "lucide-react";

import { formatCurrencyFromCents } from "@/shared/utils/currency";
import { formatDate, formatDateShort } from "@/shared/utils/date";
import { formatNumber, onlyDigits } from "@/shared/utils/format";
import { TabelaPaginacao } from "@/shared/ui/DataTable";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { competenciaBr, prazoAte, tituloFatura } from "@/features/assinatura/utils/fatura.format";
import { ehPagavel, type Fatura, type StatusFatura } from "@/features/assinatura/types/assinatura.types";

/**
 * Extrato de faturas.
 *
 * A tela antiga tratava fatura como cartão de vitrine: badge colorido, muito
 * respiro e uma tabela que só existia acima de `md`. Aqui ela é o que é —
 * lançamento de um extrato financeiro. Cada linha carrega uma barra de situação
 * na borda esquerda, então a coluna de cores lida de cima a baixo responde
 * "o que está em aberto?" antes de qualquer leitura de texto.
 *
 * A paginação é o outro motivo do formato: uma assinatura antiga acumula
 * dezenas de faturas, e uma lista sem fim empurrava plano, empresa e suporte
 * para fora da tela.
 */

/* Colunas do extrato — as larguras são fixas para que datas e valores fiquem
   na mesma coluna óptica de uma linha para a outra. */
/*
 * Sem coluna de competência: ela vive na segunda linha do título, junto do
 * plano. O extrato agora divide a largura com o cartão do plano, e uma coluna
 * inteira para repetir "Ago/2026" — que o próprio nome da fatura já diz —
 * custava mais do que informava.
 */
const COLS = "grid-cols-[minmax(0,1fr)_136px_140px_124px_140px]";
/** Abaixo disso a tabela rola na horizontal em vez de espremer as colunas. */
const LARGURA_MIN = 620;
/** Altura da linha: fixa, para a página não mudar de tamanho ao trocar de filtro. */
const ALTURA_LINHA = 58;
const POR_PAGINA = 8;

type Filtro = "TODAS" | "ABERTAS" | "PAGAS";

/**
 * Situação: ícone + palavra + cor.
 *
 * Cor de status é reservada e nunca aparece sozinha — quem não distingue verde
 * de vermelho lê o ícone e o rótulo. `rail` é a barra da borda esquerda.
 */
const SITUACAO: Record<StatusFatura, { label: string; icone: ReactNode; texto: string; rail: string }> = {
  PAGA: { label: "Paga", icone: <CircleCheck size={13} />, texto: "text-success", rail: "before:bg-success" },
  PENDENTE: { label: "Pendente", icone: <Timer size={13} />, texto: "text-warning", rail: "before:bg-warning" },
  AGUARDANDO_CONFIRMACAO: { label: "Em confirmação", icone: <Hourglass size={13} />, texto: "text-accent-soft", rail: "before:bg-accent-soft" },
  VENCIDA: { label: "Vencida", icone: <TriangleAlert size={13} />, texto: "text-danger", rail: "before:bg-danger" },
  CANCELADA: { label: "Cancelada", icone: <CircleSlash size={13} />, texto: "text-mist", rail: "before:bg-fg/[0.25]" },
};

const Situacao = ({ status }: { status: StatusFatura }) => {
  const s = SITUACAO[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] ${s.texto}`}>
      {s.icone}
      {s.label}
    </span>
  );
};

/** Baixar o PDF: cabe em qualquer situação, inclusive cancelada — a contabilidade pede o documento do mesmo jeito. */
const BotaoBaixar = ({ fatura, baixando, onBaixar }: { fatura: Fatura; baixando: boolean; onBaixar: (f: Fatura) => void }) => (
  <button
    type="button"
    onClick={() => onBaixar(fatura)}
    disabled={baixando}
    title={`Baixar a fatura de ${competenciaBr(fatura.competencia)} em PDF`}
    aria-label={`Baixar a fatura de ${competenciaBr(fatura.competencia)} em PDF`}
    className="focus-ring inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-fg/[0.08] text-mist transition-colors hover:bg-fg/[0.06] hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
  >
    {baixando ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
  </button>
);

const BotaoPagar = ({ fatura, onPagar }: { fatura: Fatura; onPagar: (f: Fatura) => void }) => (
  <button
    type="button"
    onClick={() => onPagar(fatura)}
    className="focus-ring inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/[0.1] px-2.5 text-[11.5px] text-accent-soft transition-colors hover:bg-accent/[0.18]"
  >
    <QrCode size={12} /> Pagar
  </button>
);

const ExtratoFaturas = ({
  faturas,
  planoNome,
  baixando,
  onPagar,
  onBaixar,
}: {
  faturas: Fatura[];
  planoNome?: string | null;
  /** Id da fatura cujo PDF está sendo gerado — trava só aquela linha. */
  baixando: string | null;
  onPagar: (f: Fatura) => void;
  onBaixar: (f: Fatura) => void;
}) => {
  const [filtro, setFiltro] = useState<Filtro>("TODAS");
  const [busca, setBusca] = useState("");
  const buscaDebounced = useDebouncedValue(busca);
  const [pagina, setPagina] = useState(1);

  const abertas = useMemo(() => faturas.filter((f) => f.status !== "PAGA" && f.status !== "CANCELADA"), [faturas]);
  const pagas = useMemo(() => faturas.filter((f) => f.status === "PAGA"), [faturas]);

  const filtradas = useMemo(() => {
    const base = filtro === "ABERTAS" ? abertas : filtro === "PAGAS" ? pagas : faturas;
    const termo = buscaDebounced.trim().toLowerCase();
    if (!termo) return base;

    const digitos = onlyDigits(termo);

    return base.filter((f) => {
      const alvo = `${tituloFatura(f.descricao, f.competencia)} ${competenciaBr(f.competencia)} ${f.planoNome ?? ""} ${SITUACAO[f.status].label}`.toLowerCase();
      if (alvo.includes(termo)) return true;
      // Busca por valor ("249", "24900") e por data ("12/08").
      return digitos.length > 0 && (String(f.valorCentavos).includes(digitos) || onlyDigits(formatDate(f.vencimento)).includes(digitos));
    });
  }, [faturas, abertas, pagas, filtro, buscaDebounced]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const itens = filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const vazias = Math.max(0, POR_PAGINA - itens.length);
  const primeiro = filtradas.length === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1;
  const ultimo = (pagina - 1) * POR_PAGINA + itens.length;

  /* Trocar filtro ou busca sempre volta para a primeira página: paginar sobre
     um resultado que encolheu deixava a pessoa numa página vazia. */
  useEffect(() => setPagina(1), [filtro, buscaDebounced]);
  useEffect(() => {
    if (pagina > totalPaginas) setPagina(totalPaginas);
  }, [pagina, totalPaginas]);

  const filtros: [Filtro, string, number][] = [
    ["TODAS", "Todas", faturas.length],
    ["ABERTAS", "Em aberto", abertas.length],
    ["PAGAS", "Pagas", pagas.length],
  ];

  const filtrando = Boolean(busca) || filtro !== "TODAS";

  return (
    <section className="card glass-sheen flex min-w-0 flex-col overflow-hidden">
      {/* ---------- Barra do extrato ---------- */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-fg/[0.06] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/[0.14] text-accent-soft ring-1 ring-inset ring-accent/20">
            <ReceiptText className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[13px] text-ink">Extrato de faturas</h2>
            <p className="text-[11px] text-faint">
              {formatNumber(filtradas.length)} {filtradas.length === 1 ? "lançamento" : "lançamentos"}
            </p>
          </div>
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <div className="flex min-w-[190px] flex-1 items-center gap-2 rounded-lg border border-fg/[0.08] bg-fg/[0.04] px-3 transition-colors focus-within:border-accent/60 focus-within:bg-fg/[0.06] sm:max-w-[260px]">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por mês, valor ou situação…"
              aria-label="Buscar faturas"
              className="w-full flex-1 bg-transparent py-1.5 text-[12.5px] text-ink outline-none placeholder:text-faint"
            />
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-fg/[0.07] bg-fg/[0.03] p-1">
            {filtros.map(([id, label, n]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFiltro(id)}
                aria-pressed={filtro === id}
                className={`focus-ring cursor-pointer whitespace-nowrap rounded-md px-2.5 py-1 text-[11.5px] transition-colors ${filtro === id ? "bg-accent text-white shadow-glow" : "text-mist hover:text-ink"}`}
              >
                {label}
                <span className={`ml-1.5 tabular-nums ${filtro === id ? "text-white/70" : "text-faint"}`}>{n}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ---------- Extrato: linhas no desktop ---------- */}
      <div className="hidden min-w-0 overflow-x-auto sm:block">
        <div style={{ minWidth: LARGURA_MIN }}>
          <div className={`grid ${COLS} shrink-0 items-center gap-2 border-b border-fg/[0.06] bg-fg/[0.02] px-5 py-2 text-[10px] uppercase tracking-[0.12em] text-muted`}>
            <p>Fatura</p>
            <p>Vencimento</p>
            <p>Situação</p>
            <p className="text-right">Valor</p>
            <p className="text-right">Ações</p>
          </div>

          {itens.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2.5 px-6 py-16 text-center" style={{ minHeight: POR_PAGINA * ALTURA_LINHA }}>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-fg/[0.06] bg-fg/[0.03] text-faint">
                <ReceiptText className="h-5 w-5" />
              </span>
              <p className="text-[13px] text-mist">{filtrando ? "Nenhuma fatura neste recorte" : "Nenhuma fatura por aqui"}</p>
              <p className="text-[11.5px] text-faint">{filtrando ? "Ajuste a busca ou troque o filtro." : "As faturas aparecem assim que o primeiro ciclo é gerado."}</p>
            </div>
          ) : (
            <>
              {itens.map((f) => {
                const s = SITUACAO[f.status];
                const prazo = prazoAte(f.vencimento);
                const atrasada = f.status === "VENCIDA";

                return (
                  <div
                    key={f.id}
                    className={`group relative grid ${COLS} items-center gap-2 border-b border-fg/[0.04] px-5 transition-colors before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:rounded-r before:opacity-70 before:transition-opacity before:content-[''] hover:bg-fg/[0.03] hover:before:opacity-100 ${s.rail}`}
                    style={{ height: ALTURA_LINHA }}
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-[12.5px] text-ink">{tituloFatura(f.descricao, f.competencia)}</span>
                      <span className="truncate text-[10.5px] text-faint">
                        {competenciaBr(f.competencia)}
                        {(f.planoNome || planoNome) && ` · plano ${f.planoNome || planoNome}`}
                      </span>
                    </div>

                    <div className="flex min-w-0 flex-col">
                      <span className="text-[12px] tabular-nums text-mist">{formatDate(f.vencimento)}</span>
                      {/* Cancelada não conta prazo: a data já não cobra nada,
                          e "há 148 dias" ali só fazia a linha parecer atrasada. */}
                      <span className={`truncate text-[10.5px] ${atrasada ? "text-danger" : "text-faint"}`}>
                        {f.status === "PAGA" ? `pago em ${formatDateShort(f.pagoEm)}` : f.status === "CANCELADA" ? "sem cobrança" : prazo.texto}
                      </span>
                    </div>

                    <span className="min-w-0 truncate">
                      <Situacao status={f.status} />
                    </span>

                    <ValorFatura fatura={f} className="text-right text-[13px]" />

                    <div className="flex items-center justify-end gap-1.5">
                      {ehPagavel(f) && <BotaoPagar fatura={f} onPagar={onPagar} />}
                      <BotaoBaixar fatura={f} baixando={baixando === f.id} onBaixar={onBaixar} />
                    </div>
                  </div>
                );
              })}

              {/* Linhas fantasma: a página mantém a mesma altura mesmo na última
                  virada, então o rodapé não sobe e desce a cada clique. */}
              {Array.from({ length: vazias }).map((_, i) => (
                <div key={`vazia-${i}`} aria-hidden className="border-b border-fg/[0.03]" style={{ height: ALTURA_LINHA }} />
              ))}
            </>
          )}
        </div>
      </div>

      {/* ---------- Extrato: cartões no celular ---------- */}
      {/* Abaixo de `sm` a tabela viraria rolagem horizontal — e este app é usado
          no balcão. Mesmo conteúdo, empilhado, com a mesma barra de situação. */}
      <ul className="divide-y divide-fg/[0.04] sm:hidden">
        {itens.length === 0 ? (
          <li className="px-5 py-12 text-center text-[12.5px] text-faint">{filtrando ? "Nenhuma fatura neste recorte." : "Nenhuma fatura por aqui."}</li>
        ) : (
          itens.map((f) => {
            const s = SITUACAO[f.status];
            const prazo = prazoAte(f.vencimento);

            return (
              <li key={f.id} className={`relative px-5 py-3.5 before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:rounded-r before:opacity-70 before:content-[''] ${s.rail}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-ink">{tituloFatura(f.descricao, f.competencia)}</p>
                    <p className="mt-0.5 text-[11px] text-faint">
                      {f.status === "PAGA"
                        ? `Pago em ${formatDate(f.pagoEm)}`
                        : f.status === "CANCELADA"
                          ? `${competenciaBr(f.competencia)} · sem cobrança`
                          : `Vence em ${formatDate(f.vencimento)} · ${prazo.texto}`}
                    </p>
                  </div>
                  <ValorFatura fatura={f} className="shrink-0 text-right text-[13.5px]" />
                </div>

                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <Situacao status={f.status} />
                  <div className="flex items-center gap-1.5">
                    {ehPagavel(f) && <BotaoPagar fatura={f} onPagar={onPagar} />}
                    <BotaoBaixar fatura={f} baixando={baixando === f.id} onBaixar={onBaixar} />
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ul>

      <TabelaPaginacao
        pagina={pagina}
        totalPaginas={totalPaginas}
        onPagina={setPagina}
        resumo={<span className="tabular-nums">{primeiro === 0 ? "Nenhuma fatura" : `Mostrando ${primeiro}–${ultimo} de ${formatNumber(filtradas.length)}`}</span>}
      />
    </section>
  );
};

export default ExtratoFaturas;

/**
 * O valor da fatura — com o original riscado em cima quando houve desconto.
 * O "de / por" é o jeito como o desconto se lê de relance numa lista.
 */
function ValorFatura({ fatura, className = "" }: { fatura: Fatura; className?: string }) {
  const desconto = fatura.descontoCentavos ?? 0;

  return (
    <span className={`flex flex-col leading-tight tabular-nums text-ink ${className}`}>
      {desconto > 0 && (
        <span
          className="text-[10.5px] text-faint line-through"
          title={fatura.descontoMotivo ? `Desconto: ${fatura.descontoMotivo}` : "Valor antes do desconto"}
        >
          {formatCurrencyFromCents(fatura.valorCentavos + desconto)}
        </span>
      )}
      <span>{formatCurrencyFromCents(fatura.valorCentavos)}</span>
      {desconto > 0 && <span className="text-[10px] text-success">– {formatCurrencyFromCents(desconto)} de desconto</span>}
    </span>
  );
}
