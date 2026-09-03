import { useMemo, useState } from "react";
import { MessageCircle, UserRound } from "lucide-react";

import type { Conversa, Etapa } from "@/features/crm/services/crm.service";

/**
 * O funil: as mesmas conversas da caixa de entrada, empilhadas por etapa.
 *
 * ---------------------------------------------------------------------------
 * É a MESMA conversa, não uma segunda entidade
 * ---------------------------------------------------------------------------
 * Cada cartão é uma linha de `crm_conversas`, e arrastar grava `etapa_fk` —
 * exatamente o que um seletor na lista gravaria. Não existe "oportunidade"
 * separada da conversa, e é por isso que mover um cartão nunca duplica nada.
 *
 * O desenho é o do `QuadroPlanilha`, e a semelhança é intencional: quem já usa
 * o Backlog da produção não aprende nada novo aqui. O que ele NÃO é: uma cópia
 * do componente. Aquele arrasta linhas de planilha (valores em JSONB, colunas
 * configuráveis); este arrasta conversas. Tentar servir aos dois com um
 * componente só exigiria abstrair "cartão" a ponto de nenhum dos dois ficar
 * bom — e o custo real de um quadro é o arrasto, que é trinta linhas.
 *
 * ---------------------------------------------------------------------------
 * A raia "Sem etapa"
 * ---------------------------------------------------------------------------
 * Conversa cujo funil foi apagado fica com `etapa_fk` nulo (o `ON DELETE SET
 * NULL` da migração). Sem esta raia ela sumiria do quadro — e sumir é a pior
 * coisa que uma tela pode fazer com o trabalho de alguém. Só aparece quando há
 * o que mostrar.
 */

/** "há 3 h", "ontem" — no cartão o que importa é a idade, não a data. */
function desde(iso: string | null): string {
  if (!iso) return "";

  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);

  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;

  const horas = Math.floor(minutos / 60);

  if (horas < 24) return `há ${horas} h`;

  const dias = Math.floor(horas / 24);

  return dias === 1 ? "ontem" : `há ${dias} dias`;
}

type Props = {
  etapas: Etapa[];
  conversas: Conversa[];
  onMover: (conversaId: string, etapaId: string | null) => void;
  onAbrir: (conversa: Conversa) => void;
};

const SEM_ETAPA = "__sem__";

const QuadroFunil = ({ etapas, conversas, onMover, onAbrir }: Props) => {
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);

  /* Agrupa uma vez por render, e não uma varredura por raia: com cinco etapas
     e trezentas conversas seriam 1500 comparações a cada movimento do mouse
     durante o arrasto. */
  const porEtapa = useMemo(() => {
    const mapa = new Map<string, Conversa[]>();

    for (const c of conversas) {
      const chave = c.etapa_fk ?? SEM_ETAPA;

      if (!mapa.has(chave)) mapa.set(chave, []);

      mapa.get(chave)!.push(c);
    }

    return mapa;
  }, [conversas]);

  const orfas = porEtapa.get(SEM_ETAPA) ?? [];

  const raias: { id: string; nome: string; cor: string | null }[] = [
    ...etapas.map((e) => ({ id: e.id, nome: e.nome, cor: e.cor })),
    ...(orfas.length ? [{ id: SEM_ETAPA, nome: "Sem etapa", cor: null }] : []),
  ];

  const soltar = (etapaId: string) => {
    if (!arrastando) return;

    setSobre(null);

    const alvo = etapaId === SEM_ETAPA ? null : etapaId;
    const atual = conversas.find((c) => c.id === arrastando);

    setArrastando(null);

    /* Soltar na mesma raia de onde saiu não é movimento: gravar aqui gastaria
       uma requisição para não mudar nada. */
    if ((atual?.etapa_fk ?? null) === alvo) return;

    onMover(arrastando, alvo);
  };

  return (
    <div className="flex h-full min-h-0 gap-3 overflow-x-auto p-3">
      {raias.map((raia) => {
        const lista = porEtapa.get(raia.id) ?? [];
        const alvo = sobre === raia.id;

        return (
          <section
            key={raia.id}
            onDragOver={(e) => {
              /* `preventDefault` é o que autoriza o soltar. Sem ele o
                 navegador recusa o drop e o cartão "volta" — parecendo que o
                 arrasto não funciona. */
              e.preventDefault();
              setSobre(raia.id);
            }}
            onDragLeave={() => setSobre((s) => (s === raia.id ? null : s))}
            onDrop={() => soltar(raia.id)}
            className={`flex w-[260px] shrink-0 flex-col rounded-2xl border transition-colors ${
              alvo ? "border-accent/40 bg-accent/[0.05]" : "border-fg/[0.07] bg-fg/[0.02]"
            }`}
          >
            <header className="flex shrink-0 items-center gap-2 border-b border-fg/[0.06] px-3 py-2.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: raia.cor ?? "rgb(var(--muted))" }}
              />
              <p className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{raia.nome}</p>
              <span className="shrink-0 rounded-full border border-fg/[0.08] bg-fg/[0.03] px-1.5 text-[10.5px] text-faint">
                {lista.length}
              </span>
            </header>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
              {lista.map((c) => (
                <article
                  key={c.id}
                  draggable
                  onDragStart={() => setArrastando(c.id)}
                  onDragEnd={() => {
                    setArrastando(null);
                    setSobre(null);
                  }}
                  onClick={() => onAbrir(c)}
                  className={`cursor-pointer rounded-xl border border-fg/[0.07] bg-surface/60 p-2.5 transition-colors hover:border-accent/30 ${
                    arrastando === c.id ? "opacity-40" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-accent/25 bg-accent/[0.12] text-accent-soft">
                      {c.foto ? <img src={c.foto} alt="" className="h-full w-full object-cover" /> : <UserRound size={13} />}
                    </span>

                    <p className="min-w-0 flex-1 truncate text-[12px] text-ink">{c.nome}</p>

                    {/* O contador é o que faz o quadro servir de fila: sem ele
                        a raia diz onde a negociação está, mas não quem está
                        esperando resposta. */}
                    {c.nao_lidas > 0 && (
                      <span className="shrink-0 rounded-full bg-accent px-1.5 text-[10px] text-white">{c.nao_lidas}</span>
                    )}
                  </div>

                  {c.ultima_mensagem && (
                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-mist">
                      {/* Mesma pista da lista — ver a nota em `CrmPage`. */}
                      {c.ultima_direcao === "SAIDA" && <span className="text-faint">Você: </span>}
                      {c.ultima_mensagem}
                    </p>
                  )}

                  <p className="mt-1.5 flex items-center gap-1 text-[10px] text-faint">
                    <MessageCircle size={10} /> {desde(c.ultima_mensagem_em)}
                    {c.responsavel_nome && ` · ${c.responsavel_nome}`}
                  </p>
                </article>
              ))}

              {lista.length === 0 && (
                <p className="px-2 py-6 text-center text-[11px] text-faint">
                  {alvo ? "Solte aqui" : "Vazio"}
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default QuadroFunil;
