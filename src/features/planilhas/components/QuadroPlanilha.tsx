import { useMemo, useState } from "react";
import { CalendarDays, Plus, Trash2, User } from "lucide-react";

import type { Coluna, Registro } from "@/features/planilhas/services/planilha.service";
import { formatCurrency } from "@/shared/utils/currency";

type Props = {
  colunas: Coluna[];
  registros: Registro[];
  /** A coluna de SELEÇÃO que vira as raias do quadro. */
  etapa: Coluna;
  /** A coluna de DATA que o modelo marcou como prazo, quando existe. */
  colunaPrazoId?: string | null;
  /** Mesma regra da planilha: coluna restrita não se edita arrastando. */
  podeMover: boolean;
  onMover: (registroId: string, valor: string | null) => void;
  /** Cria uma linha já dentro da raia. */
  onCriar?: (valor: string) => void;
  onExcluir: (registroId: string) => void;
};

/** As alternativas da coluna, sempre como lista — ver a nota em `PlanilhasPage`. */
const listaDeOpcoes = (c: Coluna) => (Array.isArray(c.opcoes) ? c.opcoes : []);

const texto = (v: unknown) => (v == null ? "" : String(v)).trim();

/** "12/08" — no cartão a data serve de relance, e o ano quase nunca muda. */
function dataCurta(valor: unknown): string {
  const s = texto(valor).slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";

  const [, mes, dia] = s.split("-");

  return `${dia}/${mes}`;
}

/** Dias até a data. Negativo = passou. */
function diasAte(valor: unknown): number | null {
  const s = texto(valor).slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;

  const alvo = new Date(`${s}T23:59:59`);

  return Math.ceil((alvo.getTime() - Date.now()) / 86400000);
}

/**
 * A planilha vista como quadro — as mesmas linhas, empilhadas por etapa.
 *
 * ---------------------------------------------------------------------------
 * É a MESMA produção, não uma segunda
 * ---------------------------------------------------------------------------
 * Este quadro não tem dado nenhum próprio. Cada cartão é uma LINHA da planilha
 * aberta, cada raia é uma alternativa de uma coluna de Seleção dela, e arrastar
 * um cartão grava naquela célula exatamente o mesmo valor que a lista suspensa
 * gravaria na visão de tabela. Trocar de visão não move, não copia e não
 * duplica nada: é a mesma tabela, agrupada.
 *
 * Antes o quadro era outro módulo, com tabelas próprias (`producao_itens`,
 * `producao_etapas`). Duas produções coexistiam: o que se digitava na planilha
 * não aparecia no quadro e vice-versa, e a pergunta "onde está o pedido da
 * dona Marlene?" tinha duas respostas conforme a tela aberta. Uma fonte só
 * elimina a divergência pela raiz — e faz o histórico, as permissões por
 * coluna e o link do cliente valerem para as duas leituras, porque são a mesma.
 *
 * ---------------------------------------------------------------------------
 * A raia "Sem etapa"
 * ---------------------------------------------------------------------------
 * Linha em branco é o estado normal de uma planilha: ela nasce com dez linhas
 * vazias, e quem preenche o nome antes da etapa não fez nada de errado. Se essa
 * raia não existisse, essas linhas sumiriam do quadro — e sumir é a pior coisa
 * que uma tela pode fazer com o trabalho de alguém. Ela só aparece quando há o
 * que mostrar.
 */
const QuadroPlanilha = ({ colunas, registros, etapa, colunaPrazoId, podeMover, onMover, onCriar, onExcluir }: Props) => {
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);

  const opcoes = useMemo(() => listaDeOpcoes(etapa), [etapa]);

  /**
   * O que o cartão mostra, escolhido por TIPO e não por posição.
   *
   * "A primeira coluna" seria a regra mais simples e a errada: numa planilha
   * cuja primeira coluna é a data, todo cartão se chamaria "12/08". O título é
   * o primeiro texto ou cliente — que é como a pessoa chama o trabalho —, e as
   * etiquetas de baixo são o cliente, o prazo e o primeiro valor em dinheiro.
   */
  const titulo = useMemo(
    () => colunas.find((c) => c.id !== etapa.id && (c.tipo === "TEXTO" || c.tipo === "TEXTO_LONGO" || c.tipo === "CLIENTE")),
    [colunas, etapa.id],
  );

  const cliente = useMemo(
    () => colunas.find((c) => c.tipo === "CLIENTE" && c.id !== titulo?.id),
    [colunas, titulo?.id],
  );

  const prazo = useMemo(
    () => colunas.find((c) => c.id === colunaPrazoId) ?? colunas.find((c) => c.tipo === "DATA"),
    [colunas, colunaPrazoId],
  );

  const dinheiro = useMemo(() => colunas.find((c) => c.tipo === "MOEDA"), [colunas]);

  /** Uma raia por alternativa, mais a das linhas ainda sem etapa. */
  const raias = useMemo(() => {
    const porValor = new Map<string, Registro[]>();

    porValor.set("", []);
    for (const o of opcoes) porValor.set(o.valor, []);

    for (const r of registros) {
      const v = texto(r.valores[etapa.id]);

      /* Valor que não está mais entre as alternativas (a opção foi renomeada
         ou removida) cai em "Sem etapa" em vez de sumir: a linha continua
         existindo, e é assim que alguém percebe que precisa recolocá-la. */
      porValor.get(porValor.has(v) ? v : "")!.push(r);
    }

    const lista = opcoes.map((o) => ({ valor: o.valor, rotulo: o.valor, cor: o.cor, itens: porValor.get(o.valor) ?? [] }));
    const semEtapa = porValor.get("") ?? [];

    return semEtapa.length > 0
      ? [{ valor: "", rotulo: "Sem etapa", cor: undefined as string | undefined, itens: semEtapa }, ...lista]
      : lista;
  }, [opcoes, registros, etapa.id]);

  const soltar = (valor: string) => {
    const id = arrastando;

    setArrastando(null);
    setSobre(null);

    if (!id || !podeMover) return;

    const registro = registros.find((r) => r.id === id);

    if (!registro || texto(registro.valores[etapa.id]) === valor) return;

    onMover(id, valor || null);
  };

  if (opcoes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[14px] text-ink">A coluna “{etapa.nome}” ainda não tem alternativas</p>
        <p className="max-w-sm text-[12.5px] leading-relaxed text-faint">
          As raias do quadro são as alternativas dessa coluna — atendimento, arte, sublimação, o que for do seu processo.
          Cadastre-as em <strong className="text-mist">Colunas</strong> e elas viram as pilhas daqui.
        </p>
      </div>
    );
  }

  return (
    /* Rolagem horizontal: fluxo com sete etapas não cabe na tela, e espremer as
       raias tornaria os cartões ilegíveis. */
    <div className="flex h-full min-h-0 gap-3 overflow-x-auto p-3">
      {raias.map((raia) => {
        const alvo = sobre === raia.valor;

        return (
          <section
            key={raia.valor || "__sem__"}
            onDragOver={(e) => {
              if (!podeMover) return;
              e.preventDefault();
              setSobre(raia.valor);
            }}
            onDragLeave={() => setSobre((s) => (s === raia.valor ? null : s))}
            onDrop={() => soltar(raia.valor)}
            className={`flex w-[280px] shrink-0 flex-col overflow-hidden rounded-2xl border transition-colors ${
              alvo ? "border-accent/50 bg-accent/[0.05]" : "border-fg/[0.07] bg-fg/[0.02]"
            }`}
          >
            <header className="flex shrink-0 items-center gap-2 border-b border-fg/[0.06] px-3.5 py-2.5">
              {/* A cor é a MESMA que a alternativa tem na célula da tabela —
                  quem decorou "amarelo é sublimação" não reaprende no quadro. */}
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: raia.cor ?? (raia.valor ? "rgb(var(--accent))" : "rgb(var(--fg) / 0.25)") }}
              />
              <h2 className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{raia.rotulo}</h2>
              <span className="rounded-full bg-fg/[0.06] px-1.5 text-[10.5px] text-mist">{raia.itens.length}</span>

              {/* Criar já dentro da raia poupa o passo de criar e depois
                  arrastar — que é como toda linha nova nasceria aqui. */}
              {onCriar && raia.valor && (
                <button
                  onClick={() => onCriar(raia.valor)}
                  aria-label={`Nova linha em ${raia.rotulo}`}
                  title={`Nova linha em ${raia.rotulo}`}
                  className="focus-ring grid h-6 w-6 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-fg/[0.06] hover:text-accent-soft"
                >
                  <Plus size={13} />
                </button>
              )}
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5">
              {raia.itens.length === 0 && (
                <p className="py-6 text-center text-[11.5px] text-faint">{alvo ? "Solte aqui" : "Vazio"}</p>
              )}

              {raia.itens.map((r) => {
                const nome = titulo ? texto(r.valores[titulo.id]) : "";
                const quem = cliente ? texto(r.valores[cliente.id]) : "";
                const quando = prazo ? dataCurta(r.valores[prazo.id]) : "";
                const dias = prazo ? diasAte(r.valores[prazo.id]) : null;
                const valor = dinheiro ? texto(r.valores[dinheiro.id]) : "";
                const atrasado = dias !== null && dias < 0;

                return (
                  <article
                    key={r.id}
                    draggable={podeMover}
                    onDragStart={() => setArrastando(r.id)}
                    onDragEnd={() => setArrastando(null)}
                    className={`group rounded-xl border border-fg/[0.07] bg-surface p-3 transition-all ${
                      podeMover ? "cursor-grab active:cursor-grabbing" : ""
                    } ${arrastando === r.id ? "opacity-40" : "hover:border-fg/[0.16]"}`}
                  >
                    <div className="flex items-start gap-2">
                      {/* Linha em branco não vira cartão sem nome: o texto
                          apagado diz o que fazer com ela. */}
                      <p className={`min-w-0 flex-1 text-[13px] leading-snug ${nome ? "text-ink" : "text-faint"}`}>
                        {nome || "Linha em branco"}
                      </p>

                      <button
                        onClick={() => onExcluir(r.id)}
                        aria-label="Excluir linha"
                        title="Excluir linha"
                        className="shrink-0 text-muted opacity-0 transition-opacity hover:text-danger focus:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {(quem || quando || valor) && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        {quem && (
                          <span className="flex items-center gap-1 rounded-full bg-fg/[0.06] px-1.5 py-0.5 text-[10px] text-mist">
                            <User size={9} className="shrink-0" />
                            <span className="max-w-[130px] truncate">{quem}</span>
                          </span>
                        )}

                        {quando && (
                          <span
                            className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] ${
                              atrasado
                                ? "bg-danger/15 text-danger"
                                : dias !== null && dias <= 1
                                  ? "bg-warning/15 text-warning"
                                  : "bg-fg/[0.06] text-mist"
                            }`}
                            title={prazo?.nome}
                          >
                            <CalendarDays size={9} className="shrink-0" />
                            {quando}
                          </span>
                        )}

                        {valor && (
                          <span className="rounded-full bg-fg/[0.06] px-1.5 py-0.5 text-[10px] tabular-nums text-mist">
                            {formatCurrency(Number(valor) || 0)}
                          </span>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default QuadroPlanilha;
