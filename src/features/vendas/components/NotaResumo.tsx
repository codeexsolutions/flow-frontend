import type { LegacyRef } from "react";

import HeaderInterprise from "@/shared/ui/HeaderInterprise";
import FundoNota from "@/shared/ui/FundoNota";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDate } from "@/shared/utils/date";
import useEnterprise from "@/features/empresa/store/enterprise.store";

import { type PedidoClienteType, totalDoPedido, valorPagoDoPedido, valorPendenteDoPedido, estaCancelado } from "@/shared/domain/pedido";

/**
 * A nota de venda para o download rápido na tabela de Vendas.
 *
 * É a mesma linguagem da nota completa (`Invoice`), mas leve: recebe o
 * `PedidoClienteType` já carregado e não monta nenhum controle. O botão da
 * linha a rasteriza com `handleDownload` — sem abrir a tela da nota.
 *
 * Totalmente estático, como o `OrcamentoNota`: só o que vai para o PNG.
 */
type Props = {
  venda: PedidoClienteType;
  /** Quem rasteriza é o botão de download, via `html-to-image`. */
  refNota?: LegacyRef<HTMLDivElement>;
};

const NotaResumo = ({ venda: v, refNota }: Props) => {
  const total = totalDoPedido(v);
  const pago = valorPagoDoPedido(v);
  const pendente = valorPendenteDoPedido(v);
  const cancelada = estaCancelado(v);
  const enterprise = useEnterprise((s) => s.enterprise);

  return (
    <div ref={refNota} className="relative flex w-full flex-col overflow-hidden bg-surface">
      <FundoNota imagem={enterprise?.notaBackground} />

      <div className="relative flex flex-col">
      {/* Cabeçalho — empresa à esquerda, nota à direita */}
      <div className="flex flex-col gap-3 border-b border-fg/[0.05] p-6 md:flex-row md:items-end md:justify-between">
        <HeaderInterprise />
        <div className="md:text-right">
          <h2 className="text-xl leading-none text-ink md:text-2xl">Nota de Venda</h2>
          <p className="mt-1.5 text-sm text-mist">Data: {formatDate(v.pedido.dataPedido)}</p>
          <p className="mt-0.5 text-[11.5px] uppercase tracking-wide text-faint">#{v.pedido.pedidoId?.slice(-6).toUpperCase() ?? "—"}</p>
        </div>
      </div>

      {/* Identificação — para quem é a nota */}
      <div className="flex flex-col gap-4 px-6 pt-6">
        <dl className="flex min-w-0 flex-1 flex-col gap-3.5">
          <div className="min-w-0">
            <dt className="text-[10.5px] uppercase tracking-[0.1em] text-faint">Cliente</dt>
            <dd className="mt-0.5 min-w-0 truncate text-[14.5px] leading-snug text-ink">{v.nomeCliente || "—"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10.5px] uppercase tracking-[0.1em] text-faint">Vendedor</dt>
            <dd className="mt-0.5 min-w-0 truncate text-[14.5px] leading-snug text-ink">{v.nomeVendedor || "—"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10.5px] uppercase tracking-[0.1em] text-faint">Código</dt>
            <dd className="mt-0.5 min-w-0 truncate text-[14.5px] leading-snug text-ink">{v.pedido.pedidoId || "—"}</dd>
          </div>
        </dl>
      </div>

      {/* Tabela de itens */}
      <div className="px-6 pt-6">
        <div className="overflow-hidden rounded-xl border border-fg/[0.06]">
          <table className="w-full text-sm">
            <thead className="bg-surface-raised">
              <tr className="border-b border-fg/[0.06] text-[11px] uppercase tracking-[0.08em] text-faint">
                <td className="px-3 py-2.5 text-left">Produto</td>
                <td className="px-3 py-2.5 text-left">Qtde</td>
                <td className="px-3 py-2.5 text-left">V. Unit</td>
                <td className="px-3 py-2.5 text-left">Subtotal</td>
              </tr>
            </thead>
            <tbody className="divide-y divide-fg/[0.05]">
              {(v.pedido.itensPedido ?? []).length > 0 ? (
                (v.pedido.itensPedido ?? []).map((item) => (
                  <tr key={item.itemPedidoId}>
                    <td className="max-w-[280px] p-2 align-middle">
                      <p className="truncate px-1 text-ink" title={item.produto.nomeProduto}>{item.produto.nomeProduto}</p>
                    </td>
                    <td className="p-2 align-middle">
                      <p className="px-1 tabular-nums text-ink">{Number(item.quantidadeItem)}</p>
                    </td>
                    <td className="p-2 align-middle">
                      <p className="px-1 tabular-nums text-ink">{formatCurrency(Number(item.valorVendaItem))}</p>
                    </td>
                    <td className="p-2 align-middle">
                      <p className="px-1 tabular-nums text-ink">{formatCurrency(Number(item.valorVendaItem) * Number(item.quantidadeItem))}</p>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-mist">
                    <p className="text-sm">Nenhum item na nota</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* As fotos do serviço — as mesmas que a nota completa mostra.
          Sem elas aqui, a nota baixada pela LISTA sairia diferente da baixada
          pela tela da venda, e a diferença apareceria justo no que o cliente
          guarda como prova do serviço. */}
      {(v.pedido.imagensServico ?? []).length > 0 && (
        <div className="px-6 pt-6">
          <span className="text-[10.5px] uppercase tracking-[0.1em] text-faint">Fotos do serviço</span>

          <div className="mt-2 grid grid-cols-2 gap-3">
            {(v.pedido.imagensServico ?? []).map((url, i) => (
              <img key={url} src={url} alt={`Foto ${i + 1} do serviço`} className="aspect-square w-full rounded-xl border border-fg/[0.06] object-cover" />
            ))}
          </div>
        </div>
      )}

      {/* Resumo — total, pago e pendente */}
      <div className="flex flex-wrap justify-end gap-2 p-6">
        <div className="min-w-[150px] rounded-xl border border-fg/[0.06] bg-fg/[0.03] p-4 text-right">
          <span className="text-[10.5px] uppercase tracking-wide text-faint">Total</span>
          <span className={`mt-1 block text-xl tabular-nums ${cancelada ? "text-mist line-through" : "text-ink"}`}>{formatCurrency(total)}</span>
        </div>

        {!cancelada && (
          <>
            <div className="min-w-[120px] rounded-xl border border-success/20 bg-success/[0.1] p-4 text-right">
              <span className="text-[10.5px] uppercase tracking-wide text-faint">Pago</span>
              <span className="mt-1 block text-xl tabular-nums text-success">{formatCurrency(pago)}</span>
            </div>
            <div className={`min-w-[120px] rounded-xl border p-4 text-right ${pendente > 0 ? "border-warning/20 bg-warning/[0.1]" : "border-success/20 bg-success/[0.1]"}`}>
              <span className="text-[10.5px] uppercase tracking-wide text-faint">Pendente</span>
              <span className={`mt-1 block text-xl tabular-nums ${pendente > 0 ? "text-warning" : "text-success"}`}>{formatCurrency(pendente)}</span>
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
};

export default NotaResumo;
