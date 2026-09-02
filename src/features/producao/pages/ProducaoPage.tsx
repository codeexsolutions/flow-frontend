import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import useSincronizacao from "@/shared/realtime/useSincronizacao";
import { Factory, Plus, Clock, User, AlertTriangle, Trash2, X, Loader2 } from "lucide-react";

import ProducaoService, { type Etapa, type ItemProducao } from "@/features/producao/services/producao.service";
import { PageScreen } from "@/shared/ui/PageShell";
import { BarraFiltros } from "@/shared/ui/DataTable";
import { Modal } from "@/shared/ui/Modal";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import { ehGestor } from "@/features/vendas/components/TabsVendas";
import useAuth from "@/features/auth/store/auth.store";
import { SkeletonListaPainel } from "@/shared/ui/skeleton";
import PlanilhaProducao from "@/features/producao/components/PlanilhaProducao";
import useEquipeStore from "@/features/funcionarios/store/equipe.store";
import { podemReceberTarefa } from "@/shared/domain/funcionario";

type Periodo = "DIARIO" | "SEMANAL" | "MENSAL";

const PERIODOS: { id: Periodo; label: string }[] = [
  { id: "DIARIO", label: "Hoje" },
  { id: "SEMANAL", label: "Semana" },
  { id: "MENSAL", label: "Mês" },
];

const PRIORIDADE: Record<ItemProducao["prioridade"], string> = {
  ALTA: "border-danger/40 bg-danger/[0.08] text-danger",
  NORMAL: "border-fg/[0.1] text-mist",
  BAIXA: "border-fg/[0.08] text-faint",
};

/** "há 3 dias" — a informação que importa é o tempo parado, não a data. */
function paradoHa(iso: string | null): string {
  if (!iso) return "";

  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

  if (dias <= 0) return "hoje";
  if (dias === 1) return "há 1 dia";

  return `há ${dias} dias`;
}

/** Dias até o prazo. Negativo = atrasado. */
function diasAtePrazo(prazo: string | null): number | null {
  if (!prazo) return null;

  const alvo = new Date(prazo);
  alvo.setHours(23, 59, 59, 999);

  return Math.ceil((alvo.getTime() - Date.now()) / 86400000);
}

/**
 * O CONTROLE DE PRODUÇÃO ANTIGO — fora da navegação.
 *
 * ---------------------------------------------------------------------------
 * Por que ele saiu
 * ---------------------------------------------------------------------------
 * Esta tela tem tabelas próprias (`producao_itens`, `producao_etapas`), que são
 * OUTRA produção: o que se digitava na planilha não aparecia aqui, e o que se
 * arrastava aqui não chegava lá. A pergunta "onde está o pedido da dona
 * Marlene?" tinha duas respostas conforme a tela aberta.
 *
 * A produção passou a ser uma só, a da planilha: o backlog em cartões virou uma
 * VISÃO dela — as mesmas linhas agrupadas por uma coluna de seleção, arrastar
 * grava na célula da etapa. Ver `QuadroPlanilha` e `PlanilhasPage`.
 *
 * ---------------------------------------------------------------------------
 * Por que o arquivo continua aqui
 * ---------------------------------------------------------------------------
 * Nenhuma rota o alcança, mas ele é a única interface que existe para os dados
 * já gravados em `producao_itens`. Apagá-lo tornaria esse conteúdo inalcançável
 * sem passar pelo banco — e quem decide migrar ou descartar esses registros é
 * o dono do sistema, não este refactor. Ele fica de pé, e sem porta.
 */
/**
 * As props sobraram do arranjo anterior, em que esta tela era a visão
 * "backlog" da aba Kanban. Ninguém as passa hoje.
 */
type Props = {
  /** Abas que TROCAM a tela — ponta esquerda da barra. */
  abasSecao?: ReactNode;
  /** Controles da seção — ponta direita, junto dos filtros da tela. */
  controlesSecao?: ReactNode;
  /** Trava a visão e esconde o seletor interno. */
  visaoFixa?: "planilha" | "quadro";
};

const ProducaoPage = ({ abasSecao, controlesSecao, visaoFixa }: Props = {}) => {
  const alert = useAlert();
  const { user } = useAuth();
  const gestor = ehGestor(user);

  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [itens, setItens] = useState<ItemProducao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [periodo, setPeriodo] = useState<Periodo>("SEMANAL");
  /* Duas visões porque são duas perguntas: o quadro responde "em que etapa
     está o pedido"; a planilha, "o que cada um faz na quinta". */
  const [visao, setVisao] = useState<"planilha" | "quadro">(visaoFixa ?? "planilha");
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);

  useEffect(() => {
    if (visaoFixa) setVisao(visaoFixa);
  }, [visaoFixa]);

  const equipe = useEquipeStore((s) => s.equipe);
  const buscarEquipe = useEquipeStore((s) => s.buscar);

  useEffect(() => {
    if (gestor) buscarEquipe();
  }, [gestor, buscarEquipe]);

  /* Só quem está ativo: linha de quem saiu da empresa é ruído na semana. E o
     `id` é o do LOGIN, porque é ele que vai para `producao_itens.responsavel_fk`
     — ver a nota de `podemReceberTarefa`. */
  const funcionarios = useMemo(() => podemReceberTarefa(equipe?.funcionarios ?? []), [equipe]);

  const [novoAberto, setNovoAberto] = useState(false);
  const [etapaAberta, setEtapaAberta] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [form, setForm] = useState({ titulo: "", clienteNome: "", quantidade: "1", prazo: "", prioridade: "NORMAL" });
  const [nomeEtapa, setNomeEtapa] = useState("");
  const [etapaConclui, setEtapaConclui] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);

    try {
      const [e, i] = await Promise.all([ProducaoService.etapas(), ProducaoService.itens({ periodo })]);
      setEtapas(e);
      setItens(i);
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível carregar a produção."));
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /*
   * O quadro se atualiza sozinho quando outra pessoa mexe.
   *
   * É a tela que a equipe inteira deixa aberta o dia todo — e o que ela
   * responde ("em que etapa está este serviço?") tem validade de minutos.
   * Sem isto, quem move um cartão vê a mudança e o resto do time continua
   * olhando o estado de meia hora atrás, que é exatamente como dois
   * atendentes acabam refazendo o mesmo serviço.
   *
   * `planilhas` entra junto porque é a mesma fila em outra vista: linha
   * alterada lá pode ser a mesma coisa que anda de coluna aqui.
   */
  useSincronizacao(["producao", "planilhas"], carregar);

  const porEtapa = useMemo(() => {
    const mapa = new Map<string, ItemProducao[]>();

    for (const e of etapas) mapa.set(e.id, []);
    for (const i of itens) if (i.etapa_fk && mapa.has(i.etapa_fk)) mapa.get(i.etapa_fk)!.push(i);

    return mapa;
  }, [etapas, itens]);

  const soltar = async (etapaId: string) => {
    const id = arrastando;

    setArrastando(null);
    setSobre(null);

    if (!id) return;

    const item = itens.find((x) => x.id === id);
    if (!item || item.etapa_fk === etapaId) return;

    const destino = etapas.find((e) => e.id === etapaId);

    /* Move na tela antes da resposta: arrastar precisa parecer instantâneo, e
       o servidor confirma logo em seguida. Se recusar, recarregamos. */
    setItens((prev) => prev.map((x) => (x.id === id ? { ...x, etapa_fk: etapaId, etapa_nome: destino?.nome ?? null } : x)));

    try {
      await ProducaoService.mover(id, etapaId, { titulo: item.titulo, etapaNome: destino?.nome });

      // Etapa final tira o cartão do quadro ativo.
      if (destino?.conclui) setItens((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível mover."));
      carregar();
    }
  };

  const criarItem = async () => {
    if (!form.titulo.trim()) {
      alert.warning("Informe o que será produzido", "O cartão precisa de um título.");
      return;
    }

    setSalvando(true);

    try {
      await ProducaoService.criarItem({
        titulo: form.titulo.trim(),
        clienteNome: form.clienteNome.trim() || null,
        quantidade: Number(form.quantidade) || 1,
        prazo: form.prazo || null,
        prioridade: form.prioridade,
        periodo,
      });

      setNovoAberto(false);
      setForm({ titulo: "", clienteNome: "", quantidade: "1", prazo: "", prioridade: "NORMAL" });
      carregar();
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível criar."));
    } finally {
      setSalvando(false);
    }
  };

  const criarEtapa = async () => {
    if (!nomeEtapa.trim()) return;

    setSalvando(true);

    try {
      await ProducaoService.criarEtapa(nomeEtapa.trim(), etapaConclui);
      setNomeEtapa("");
      setEtapaConclui(false);
      setEtapaAberta(false);
      carregar();
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível criar a etapa."));
    } finally {
      setSalvando(false);
    }
  };

  const removerEtapa = async (e: Etapa) => {
    try {
      await ProducaoService.removerEtapa(e.id);
      carregar();
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível remover a etapa."));
    }
  };

  return (
    <PageScreen icon={<Factory className="h-5 w-5" />} title="Produção" subtitle="Onde está cada pedido, e com quem">
      {/* A barra da seção acima da fileira de filtros do quadro: as abas
          trocam a tela, os filtros logo abaixo restringem o que ela mostra. */}
      {(abasSecao || controlesSecao) && (
        <div className="card glass-sheen shrink-0 overflow-hidden rounded-lg">
          <BarraFiltros navegacao={abasSecao}>{controlesSecao}</BarraFiltros>
        </div>
      )}

      {/* Filtros e ações */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="glass-subtle flex items-center gap-1 rounded-xl p-1">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriodo(p.id)}
              aria-pressed={periodo === p.id}
              className={`cursor-pointer rounded-lg px-3 py-1.5 text-[12px] transition-colors ${periodo === p.id ? "bg-accent text-white shadow-glow" : "text-mist hover:text-ink"}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <span className="text-[11.5px] text-faint">
          {itens.length} {itens.length === 1 ? "item" : "itens"} no período
        </span>

        {/* Seletor interno some quando a seção já tem o dela: dois controles
            para a mesma decisão é um deles sempre errado. */}
        <div className={`glass-subtle ml-auto items-center gap-1 rounded-xl p-1 ${visaoFixa ? "hidden" : "flex"}`}>
          {(["planilha", "quadro"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVisao(v)}
              aria-pressed={visao === v}
              className={`cursor-pointer rounded-lg px-3 py-1.5 text-[12px] transition-colors ${visao === v ? "bg-accent text-white shadow-glow" : "text-mist hover:text-ink"}`}
            >
              {v === "planilha" ? "Tabela" : "Quadro"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {gestor && (
            <button onClick={() => setEtapaAberta(true)} className="focus-ring rounded-xl border border-fg/[0.1] px-3 py-2 text-[12px] text-mist transition-colors hover:text-ink">
              Etapas
            </button>
          )}

          <button
            onClick={() => setNovoAberto(true)}
            disabled={etapas.length === 0}
            title={etapas.length === 0 ? "Crie ao menos uma etapa antes" : undefined}
            className="focus-ring flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-[12.5px] text-white transition-all hover:brightness-110 disabled:opacity-40"
          >
            <Plus size={15} /> Nova produção
          </button>
        </div>
      </div>

      {/* Quadro */}
      {carregando ? (
        <div className="card glass-sheen min-h-0 flex-1 overflow-hidden">
          <SkeletonListaPainel linhas={6} />
        </div>
      ) : etapas.length === 0 ? (
        <div className="card glass-sheen flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl border border-fg/[0.08] bg-fg/[0.03] text-faint">
            <Factory size={22} />
          </span>
          <p className="text-[14px] text-ink">Monte o seu fluxo</p>
          <p className="max-w-sm text-[12.5px] leading-relaxed text-faint">
            Cadastre as etapas pelas quais um pedido passa — atendimento, criação de arte, sublimação, o que for do seu processo. Marque a última como concluinte.
          </p>
          {gestor && (
            <button onClick={() => setEtapaAberta(true)} className="mt-1 rounded-xl bg-accent px-5 py-2 text-[13px] text-white">
              Criar primeira etapa
            </button>
          )}
        </div>
      ) : visao === "planilha" ? (
        <PlanilhaProducao
          itens={itens}
          etapas={etapas}
          funcionarios={funcionarios}
          onCriar={async ({ titulo, responsavelId, prazo }) => {
            await ProducaoService.criarItem({ titulo, responsavelId, prazo, periodo, prioridade: "NORMAL", quantidade: 1 });
            carregar();
          }}
          onMover={async (itemId, responsavelId, prazo) => {
            await ProducaoService.reatribuir(itemId, responsavelId, prazo);
            carregar();
          }}
          onAbrir={() => {}}
        />
      ) : (
        /* Rolagem horizontal: fluxo com sete etapas não cabe na tela, e
           espremer as colunas tornaria os cartões ilegíveis. */
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
          {etapas.map((etapa) => {
            const lista = porEtapa.get(etapa.id) ?? [];
            const alvo = sobre === etapa.id;

            return (
              <section
                key={etapa.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setSobre(etapa.id);
                }}
                onDragLeave={() => setSobre((s) => (s === etapa.id ? null : s))}
                onDrop={() => soltar(etapa.id)}
                className={`flex w-[280px] shrink-0 flex-col overflow-hidden rounded-2xl border transition-colors ${
                  alvo ? "border-accent/50 bg-accent/[0.05]" : "border-fg/[0.07] bg-fg/[0.02]"
                }`}
              >
                <header className="flex shrink-0 items-center gap-2 border-b border-fg/[0.06] px-3.5 py-2.5">
                  <span className={`h-2 w-2 rounded-full ${etapa.conclui ? "bg-success" : "bg-accent"}`} />
                  <h2 className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{etapa.nome}</h2>
                  <span className="rounded-full bg-fg/[0.06] px-1.5 text-[10.5px] text-mist">{lista.length}</span>

                  {gestor && lista.length === 0 && (
                    <button onClick={() => removerEtapa(etapa)} aria-label={`Remover ${etapa.nome}`} className="text-muted transition-colors hover:text-danger">
                      <X size={13} />
                    </button>
                  )}
                </header>

                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5">
                  {lista.length === 0 && <p className="py-6 text-center text-[11.5px] text-faint">{alvo ? "Solte aqui" : "Vazio"}</p>}

                  {lista.map((item) => {
                    const dias = diasAtePrazo(item.prazo);
                    const atrasado = dias !== null && dias < 0;

                    return (
                      <article
                        key={item.id}
                        draggable
                        onDragStart={() => setArrastando(item.id)}
                        onDragEnd={() => setArrastando(null)}
                        className={`cursor-grab rounded-xl border border-fg/[0.07] bg-surface p-3 transition-all active:cursor-grabbing ${
                          arrastando === item.id ? "opacity-40" : "hover:border-fg/[0.16]"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 shrink-0 text-[10.5px] tabular-nums text-faint">#{item.codigo}</span>
                          <p className="min-w-0 flex-1 text-[13px] leading-snug text-ink">{item.titulo}</p>
                        </div>

                        {item.cliente_nome && <p className="mt-1 truncate text-[11.5px] text-mist">{item.cliente_nome}</p>}

                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${PRIORIDADE[item.prioridade]}`}>{item.prioridade === "NORMAL" ? "Normal" : item.prioridade === "ALTA" ? "Alta" : "Baixa"}</span>

                          {Number(item.quantidade) > 1 && <span className="rounded-full bg-fg/[0.06] px-1.5 py-0.5 text-[10px] text-mist">{Number(item.quantidade)} un.</span>}

                          {dias !== null && (
                            <span className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] ${atrasado ? "bg-danger/15 text-danger" : dias <= 1 ? "bg-warning/15 text-warning" : "bg-fg/[0.06] text-mist"}`}>
                              {atrasado ? <AlertTriangle size={9} /> : <Clock size={9} />}
                              {atrasado ? `${Math.abs(dias)}d atrasado` : dias === 0 ? "hoje" : `${dias}d`}
                            </span>
                          )}
                        </div>

                        <div className="mt-2 flex items-center gap-2 border-t border-fg/[0.05] pt-2 text-[10.5px] text-faint">
                          {item.responsavel_nome ? (
                            <span className="flex min-w-0 items-center gap-1 truncate">
                              <User size={10} className="shrink-0" />
                              {item.responsavel_nome}
                            </span>
                          ) : (
                            <span className="text-muted">Sem responsável</span>
                          )}

                          {/* O tempo parado é o que denuncia gargalo — mais útil
                              que a data de entrada, que exige conta de cabeça. */}
                          {item.entrou_na_etapa && <span className="ml-auto shrink-0">{paradoHa(item.entrou_na_etapa)}</span>}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Nova produção */}
      <Modal open={novoAberto} onClose={() => setNovoAberto(false)} title="Nova produção" subtitle="Entra na primeira etapa do fluxo">
        <div className="flex flex-col gap-3">
          <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="O que será produzido" autoFocus className="w-full rounded-xl border border-fg/[0.08] bg-fg/[0.03] px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent/60" />
          <input value={form.clienteNome} onChange={(e) => setForm({ ...form, clienteNome: e.target.value })} placeholder="Cliente (opcional)" className="w-full rounded-xl border border-fg/[0.08] bg-fg/[0.03] px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent/60" />

          <div className="grid grid-cols-3 gap-2">
            <input value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" placeholder="Qtd." className="rounded-xl border border-fg/[0.08] bg-fg/[0.03] px-3 py-2.5 text-center text-[13.5px] text-ink outline-none focus:border-accent/60" />
            <input type="date" value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} className="col-span-2 rounded-xl border border-fg/[0.08] bg-fg/[0.03] px-3 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent/60" />
          </div>

          <div className="flex gap-2">
            {(["BAIXA", "NORMAL", "ALTA"] as const).map((p) => (
              <button key={p} onClick={() => setForm({ ...form, prioridade: p })} className={`flex-1 rounded-xl border py-2 text-[12px] transition-colors ${form.prioridade === p ? "border-accent bg-accent/[0.12] text-accent-soft" : "border-fg/[0.1] text-mist"}`}>
                {p === "NORMAL" ? "Normal" : p === "ALTA" ? "Alta" : "Baixa"}
              </button>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setNovoAberto(false)} className="min-h-[42px] rounded-xl border border-fg/[0.1] px-4 text-[13px] text-mist">
              Cancelar
            </button>
            <button onClick={criarItem} disabled={salvando} className="flex min-h-[42px] items-center gap-2 rounded-xl bg-accent px-5 text-[13px] text-white disabled:opacity-50">
              {salvando && <Loader2 size={14} className="animate-spin" />}
              Criar
            </button>
          </div>
        </div>
      </Modal>

      {/* Etapas */}
      <Modal open={etapaAberta} onClose={() => setEtapaAberta(false)} title="Etapas da produção" subtitle="As colunas do seu quadro">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            {etapas.map((e) => (
              <div key={e.id} className="flex items-center gap-2 rounded-xl border border-fg/[0.07] px-3 py-2 text-[13px] text-ink">
                <span className={`h-2 w-2 rounded-full ${e.conclui ? "bg-success" : "bg-accent"}`} />
                <span className="min-w-0 flex-1 truncate">{e.nome}</span>
                {e.conclui && <span className="text-[10.5px] text-success">conclui</span>}
                <button onClick={() => removerEtapa(e)} aria-label={`Remover ${e.nome}`} className="text-muted transition-colors hover:text-danger">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 border-t border-fg/[0.07] pt-3">
            <input value={nomeEtapa} onChange={(e) => setNomeEtapa(e.target.value)} placeholder="Nome da etapa (ex.: Sublimação)" className="w-full rounded-xl border border-fg/[0.08] bg-fg/[0.03] px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent/60" />

            <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-mist">
              <input type="checkbox" checked={etapaConclui} onChange={(e) => setEtapaConclui(e.target.checked)} className="accent-accent" />
              É a etapa final — ao chegar aqui, sai do quadro
            </label>

            <button onClick={criarEtapa} disabled={salvando || !nomeEtapa.trim()} className="min-h-[42px] self-start rounded-xl bg-accent px-5 text-[13px] text-white disabled:opacity-40">
              Adicionar etapa
            </button>
          </div>
        </div>
      </Modal>
    </PageScreen>
  );
};

export default ProducaoPage;
