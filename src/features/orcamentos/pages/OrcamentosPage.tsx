import { useState } from "react";
import { Info, Search, ShoppingCart } from "lucide-react";

import { type Orcamento, type StatusOrcamento } from "@/features/orcamentos/services/orcamento.service";
import { PageScreen } from "@/shared/ui/PageShell";
import ListaOrcamentos from "@/features/orcamentos/components/ListaOrcamentos";

const FILTROS: { id: "todos" | StatusOrcamento; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "ABERTO", label: "Aguardando" },
  { id: "APROVADO", label: "Aprovados" },
  { id: "RECUSADO", label: "Recusados" },
];

/**
 * Orçamentos: propostas enviadas, ainda sem compromisso.
 *
 * A tela é deliberadamente diferente de Vendas em uma coisa: **não há totais no
 * topo**. Somar orçamento dá um número que parece faturamento e não é — bastaria
 * alguém olhar de longe para tomar proposta por venda. O que interessa aqui é
 * quantas propostas estão paradas esperando resposta, e essa contagem fica no
 * próprio filtro.
 *
 * A página é a moldura: o aviso do que é um orçamento, a busca e as pílulas de
 * situação. A lista em si mora em `ListaOrcamentos`, porque a aba de vendas
 * mostra a mesma lista sem trocar de rota.
 */
const OrcamentosPage = () => {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | StatusOrcamento>("todos");
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);

  const aguardando = orcamentos.filter((o) => o.status === "ABERTO").length;

  return (
    <PageScreen icon={<ShoppingCart className="h-5 w-5" />} title="Ponto de Venda" subtitle="Registre vendas e monte orçamentos">
      <div className="flex h-full min-h-0 flex-col gap-3">
        {/* Explica a regra uma vez, onde ela importa. */}
        <div className="flex shrink-0 items-start gap-2.5 rounded-xl border border-fg/[0.07] bg-fg/[0.02] px-4 py-2.5">
          <Info size={14} className="mt-0.5 shrink-0 text-accent-soft" />
          <p className="text-[12px] leading-relaxed text-mist">
            Orçamento é proposta: <span className="text-ink">não entra no faturamento, não baixa estoque e não gera conta a receber</span>. Quando o cliente aceitar, “Cliente aprovou” abre a venda já montada no balcão.
          </p>
        </div>

        {/* Filtros */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="flex max-w-xs flex-1 items-center gap-2 rounded-lg border border-fg/[0.08] bg-fg/[0.05] px-3 focus-within:border-accent">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por cliente ou número..." className="flex-1 bg-transparent py-2 text-xs text-ink outline-none placeholder:text-faint" />
          </div>

          <div className="flex gap-1.5">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFiltro(f.id)}
                className={`cursor-pointer rounded-lg px-3 py-2 text-[11px] transition-colors ${filtro === f.id ? "bg-accent text-white" : "border border-fg/[0.08] bg-fg/[0.05] text-mist hover:bg-fg/[0.09]"}`}
              >
                {f.label}
                {f.id === "ABERTO" && aguardando > 0 && <span className="ml-1.5 rounded-full bg-warning/25 px-1.5 text-[10px] text-warning">{aguardando}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        <div className="card glass-sheen min-h-0 flex-1 overflow-y-auto">
          <ListaOrcamentos busca={busca} filtro={filtro} onCarregado={setOrcamentos} />
        </div>
      </div>
    </PageScreen>
  );
};

export default OrcamentosPage;
