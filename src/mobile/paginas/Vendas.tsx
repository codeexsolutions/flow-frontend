import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Receipt } from "lucide-react";

import Invoice from "@/features/vendas/components/Invoice";
import useVendaStore from "@/features/vendas/store/venda.store";
import { estaCancelado, totalDoPedido, valorPendenteDoPedido } from "@/shared/domain/pedido";
import { formatCurrency } from "@/shared/utils/currency";

import { Botao, CampoBusca, Carregando, Linha, Pilulas, Tela, Vazio } from "@/mobile/ui";
import TelaCheia from "@/mobile/TelaCheia";
import useFolhaNaUrl from "@/mobile/useFolhaNaUrl";
import { CLASSE_TOM, normalizar, ordenarVendas, quandoFoi, statusDaVenda } from "@/mobile/util";

type Filtro = "hoje" | "receber" | "todas";

const Vendas = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { vendas, fetchVendas, loading, error } = useVendaStore();

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>(() => (params.get("filtro") === "receber" ? "receber" : "todas"));

  useEffect(() => {
    void fetchVendas();
  }, [fetchVendas]);

  /* A venda aberta mora na URL — ver `useFolhaNaUrl`. */
  const { valor: abertaId, abrir, fechar } = useFolhaNaUrl("venda");
  const aberta = vendas.find((v) => v.pedido.pedidoId === abertaId) ?? null;

  const lista = useMemo(() => {
    const termo = normalizar(busca.trim());
    const hoje = new Date().toDateString();

    return ordenarVendas(vendas).filter((v) => {
      if (filtro === "hoje" && new Date(v.pedido.dataPedido).toDateString() !== hoje) return false;
      if (filtro === "receber" && (estaCancelado(v) || valorPendenteDoPedido(v) <= 0.004)) return false;
      if (termo && !normalizar(v.nomeCliente ?? "").includes(termo)) return false;

      return true;
    });
  }, [vendas, busca, filtro]);

  /* Uma lista de mil vendas desenhada inteira trava o celular; 80 cobre a busca. */
  const visiveis = lista.slice(0, 80);

  return (
    <Tela
      titulo="Vendas"
      subtitulo={`${lista.length} ${lista.length === 1 ? "venda" : "vendas"}`}
      acao={
        <button type="button" aria-label="Nova venda" onClick={() => navigate("/pdv")} className="grid h-11 w-11 place-items-center rounded-full bg-accent/[0.12] text-accent-soft active:bg-accent/[0.2]">
          <Plus size={20} />
        </button>
      }
    >
      <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Buscar pelo cliente" />

      <div className="mt-3">
        <Pilulas<Filtro>
          valor={filtro}
          aoMudar={setFiltro}
          opcoes={[
            { id: "todas", label: "Todas" },
            { id: "hoje", label: "Hoje" },
            { id: "receber", label: "A receber" },
          ]}
        />
      </div>

      <div className="-mx-3 mt-2">
        {loading && vendas.length === 0 ? (
          <Carregando />
        ) : error && vendas.length === 0 ? (
          <Vazio icone={<Receipt size={24} />} titulo="Não deu para carregar" texto={error}>
            <Botao variante="secundario" onClick={() => void fetchVendas(true)}>
              Tentar de novo
            </Botao>
          </Vazio>
        ) : visiveis.length === 0 ? (
          <Vazio icone={<Receipt size={24} />} titulo="Nenhuma venda aqui" texto={busca ? "Tente outro nome." : undefined} />
        ) : (
          visiveis.map((v) => {
            const st = statusDaVenda(v);

            return (
              <Linha key={v.pedido.pedidoId} onClick={() => abrir(v.pedido.pedidoId)}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-ink">{v.nomeCliente || "Cliente"}</span>
                  <span className="block text-[12px] text-mist">
                    {quandoFoi(v.pedido.dataPedido)} · {(v.pedido.itensPedido ?? []).length} {(v.pedido.itensPedido ?? []).length === 1 ? "item" : "itens"}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-[15px] tabular-nums text-ink">{formatCurrency(totalDoPedido(v))}</span>
                  <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10.5px] ${CLASSE_TOM[st.tom]}`}>{st.texto}</span>
                </span>
              </Linha>
            );
          })
        )}
      </div>

      {lista.length > visiveis.length && <p className="mt-3 text-center text-[12px] text-faint">Mostrando as 80 mais recentes. Use a busca para achar outras.</p>}

      {/* A nota completa, a mesma do computador: itens, pagamento, Pix, ver e
          baixar. Salvar, cancelar ou apagar fecha e recarrega a lista. */}
      <TelaCheia aberta={!!abertaId} aoFechar={fechar} titulo="Venda" subtitulo={aberta?.nomeCliente}>
        {abertaId && (
          <Invoice
            id={abertaId}
            clienteId={aberta?.clienteId}
            nome={aberta?.nomeCliente}
            fecharAoSalvar
            onSaved={() => {
              fechar();
              void fetchVendas(true);
            }}
          />
        )}
      </TelaCheia>
    </Tela>
  );
};

export default Vendas;
