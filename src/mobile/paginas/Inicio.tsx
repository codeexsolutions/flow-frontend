import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronRight, LogOut, Monitor, Plus, RefreshCw, Receipt } from "lucide-react";

import useAuth from "@/features/auth/store/auth.store";
import useEnterprise from "@/features/empresa/store/enterprise.store";
import useVendaStore from "@/features/vendas/store/venda.store";
import useProdutoStore from "@/features/estoque/store/produto.store";
import { ehVendavel, nivelEstoque } from "@/shared/domain/produto";
import { estaCancelado, totalDoPedido, valorPendenteDoPedido } from "@/shared/domain/pedido";
import { formatCurrency } from "@/shared/utils/currency";
import { BUILD_ID, forcarAtualizacao } from "@/shared/pwa/versao";
import { useAlert } from "@/shared/ui/Alert";

import { Avatar, Botao, Carregando, Folha, Linha, Tela } from "@/mobile/ui";
import { CLASSE_TOM, ordenarVendas, quandoFoi, statusDaVenda } from "@/mobile/util";

/**
 * Início do celular: quanto entrou hoje, o botão de vender e as últimas vendas.
 *
 * Só isso. Gráfico, comparativo e ranking ficam no computador — no celular a
 * pergunta é "como está o dia?", e ela cabe em dois números.
 */
const Inicio = () => {
  const navigate = useNavigate();
  const alert = useAlert();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const empresa = useEnterprise((s) => s.enterprise);

  const { vendas, fetchVendas, loading } = useVendaStore();
  const { produtos, fetchProdutos } = useProdutoStore();

  const [conta, setConta] = useState(false);
  const [atualizando, setAtualizando] = useState(false);

  useEffect(() => {
    void fetchVendas();
    void fetchProdutos();
  }, [fetchVendas, fetchProdutos]);

  const hoje = useMemo(() => {
    const doDia = vendas.filter((v) => new Date(v.pedido.dataPedido).toDateString() === new Date().toDateString() && !estaCancelado(v));

    return {
      total: doDia.reduce((a, v) => a + totalDoPedido(v), 0),
      quantidade: doDia.length,
    };
  }, [vendas]);

  const aReceber = useMemo(() => vendas.filter((v) => !estaCancelado(v)).reduce((a, v) => a + valorPendenteDoPedido(v), 0), [vendas]);

  const acabando = useMemo(() => produtos.filter((p) => ehVendavel(p) && ["baixo", "esgotado"].includes(nivelEstoque(p))).length, [produtos]);

  const ultimas = useMemo(() => ordenarVendas(vendas).slice(0, 5), [vendas]);

  const nome = user?.nomeExibicao || user?.nome || "";
  const primeiroNome = nome.split(" ")[0];
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";

  return (
    <Tela
      titulo={`${saudacao}${primeiroNome ? `, ${primeiroNome}` : ""}`}
      subtitulo={empresa?.nomeFantasia}
      acao={
        <button type="button" aria-label="Minha conta" onClick={() => setConta(true)} className="rounded-full active:opacity-70">
          <Avatar nome={nome || "?"} />
        </button>
      }
    >
      {/* O número do dia, grande. */}
      <section className="rounded-3xl bg-gradient-to-br from-accent to-accent-strong p-5 text-white shadow-[0_16px_40px_-18px_rgb(var(--accent)/0.9)]">
        <p className="text-[13px] text-white/75">Vendido hoje</p>
        <p className="mt-1 text-[34px] font-semibold leading-none tracking-tight tabular-nums">{formatCurrency(hoje.total)}</p>
        <p className="mt-2 text-[13px] text-white/75">
          {hoje.quantidade === 0 ? "Nenhuma venda ainda" : `${hoje.quantidade} ${hoje.quantidade === 1 ? "venda" : "vendas"}`}
        </p>

        <button
          type="button"
          onClick={() => navigate("/pdv")}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[15px] font-medium text-accent-strong active:scale-[0.98]"
        >
          <Plus size={20} strokeWidth={2.4} />
          Nova venda
        </button>
      </section>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => navigate("/vendas?filtro=receber")} className="rounded-2xl bg-surface p-4 text-left active:bg-fg/[0.06]">
          <p className="text-[12px] text-mist">A receber</p>
          <p className="mt-1 text-[18px] font-semibold tabular-nums text-ink">{formatCurrency(aReceber)}</p>
        </button>
        <button type="button" onClick={() => navigate("/estoque?filtro=acabando")} className="rounded-2xl bg-surface p-4 text-left active:bg-fg/[0.06]">
          <p className="flex items-center gap-1 text-[12px] text-mist">
            {acabando > 0 && <AlertTriangle size={12} className="text-warning" />}
            Estoque acabando
          </p>
          <p className="mt-1 text-[18px] font-semibold tabular-nums text-ink">
            {acabando} {acabando === 1 ? "item" : "itens"}
          </p>
        </button>
      </div>

      <div className="mb-1 mt-6 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">Últimas vendas</h2>
        <button type="button" onClick={() => navigate("/vendas")} className="flex h-9 items-center gap-0.5 px-1 text-[13px] text-accent-soft">
          Ver todas <ChevronRight size={16} />
        </button>
      </div>

      {loading && vendas.length === 0 ? (
        <Carregando />
      ) : ultimas.length === 0 ? (
        <p className="py-8 text-center text-[14px] text-mist">As vendas do dia aparecem aqui.</p>
      ) : (
        <div className="-mx-3">
          {ultimas.map((v) => {
            const st = statusDaVenda(v);

            return (
              <Linha key={v.pedido.pedidoId} onClick={() => navigate(`/vendas?venda=${v.pedido.pedidoId}`)}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fg/[0.06] text-mist">
                  <Receipt size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-ink">{v.nomeCliente || "Cliente"}</span>
                  <span className="block text-[12px] text-mist">{quandoFoi(v.pedido.dataPedido)}</span>
                </span>
                <span className="text-right">
                  <span className="block text-[15px] tabular-nums text-ink">{formatCurrency(totalDoPedido(v))}</span>
                  <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10.5px] ${CLASSE_TOM[st.tom]}`}>{st.texto}</span>
                </span>
              </Linha>
            );
          })}
        </div>
      )}

      <Folha aberta={conta} aoFechar={() => setConta(false)} titulo={nome || "Minha conta"} subtitulo={empresa?.nomeFantasia}>
        <div className="flex items-start gap-3 rounded-2xl bg-fg/[0.05] p-4 text-[13px] text-mist">
          <Monitor size={18} className="mt-0.5 shrink-0" />
          <p>Financeiro, relatórios, produção e configurações ficam no computador. Aqui no celular estão as vendas, os clientes e o estoque.</p>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <Botao
            variante="secundario"
            disabled={atualizando}
            onClick={() => {
              setAtualizando(true);
              void forcarAtualizacao();
            }}
          >
            <RefreshCw size={18} className={atualizando ? "animate-spin" : ""} />
            {atualizando ? "Buscando atualização…" : "Buscar atualização"}
          </Botao>
          <Botao
            variante="perigo"
            onClick={async () => {
              const { confirmed } = await alert.confirm("Sair da conta?", "Você vai precisar entrar de novo neste aparelho.", { confirmText: "Sair", cancelText: "Ficar" });
              if (!confirmed) return;

              setConta(false);
              Promise.resolve(logout()).catch(() => {});
            }}
          >
            <LogOut size={18} />
            Sair
          </Botao>
        </div>

        <p className="mt-4 text-center text-[11px] text-faint">Versão {BUILD_ID}</p>
      </Folha>
    </Tela>
  );
};

export default Inicio;
