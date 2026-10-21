import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

import useEnterprise from "@/features/empresa/store/enterprise.store";
import { useAlert } from "@/shared/ui/Alert";
import { pixDaNota, type PixDaNota } from "@/shared/domain/pixDaNota";
import { estaCancelado, recebidoDoPedido, totalDoPedido, valorPendenteDoPedido, type PedidoClienteType } from "@/shared/domain/pedido";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDate, formatTime } from "@/shared/utils/date";

/**
 * A nota de venda na tela do celular.
 *
 * É a MESMA nota do computador — cabeçalho da loja, cliente, itens, total e
 * Pix —, só que desenhada para 390px: uma coluna, sem as seis caixas do resumo
 * e sem as fotos. O arquivo que vai para o cliente continua sendo o oficial
 * (`NotaResumo`), gerado por `useCompartilharNota`; esta é a versão de olhar.
 */
const NotaMobile = ({ venda }: { venda: PedidoClienteType }) => {
  const empresa = useEnterprise((s) => s.enterprise);
  const alert = useAlert();
  const [pix, setPix] = useState<PixDaNota | null>(null);
  const [copiado, setCopiado] = useState(false);

  const itens = venda.pedido.itensPedido ?? [];
  const total = totalDoPedido(venda);
  const recebido = recebidoDoPedido(venda);
  const falta = valorPendenteDoPedido(venda);
  const cancelada = estaCancelado(venda);

  /* O QR é montado na hora, com a chave Pix da loja: quem está no balcão
     vira o celular para o cliente e ele paga ali mesmo. */
  useEffect(() => {
    let vivo = true;
    setPix(null);

    if (falta > 0.004 && !cancelada)
      pixDaNota(venda)
        .then((p) => vivo && setPix(p))
        .catch(() => {});

    return () => {
      vivo = false;
    };
  }, [venda, falta, cancelada]);

  const copiarPix = async () => {
    if (!pix) return;

    try {
      await navigator.clipboard.writeText(pix.payload);
      setCopiado(true);
      alert.toast("success", "Código Pix copiado", "Cole no app do banco para pagar.", { position: "top", timer: 2000 });
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      alert.toast("warning", "Não deu para copiar", "Peça para o cliente ler o QR Code.", { position: "top" });
    }
  };

  return (
    <article className="overflow-hidden rounded-3xl border border-fg/[0.08] bg-surface-raised">
      {/* Cabeçalho da loja */}
      <header className="flex items-center gap-3 border-b border-dashed border-fg/[0.12] p-4">
        <img
          src={empresa?.urlLogo || "/logo.png"}
          alt=""
          className="h-11 w-11 shrink-0 rounded-xl bg-white object-contain p-1"
          onError={(e) => {
            if (!e.currentTarget.src.endsWith("/logo.png")) e.currentTarget.src = "/logo.png";
          }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{empresa?.nomeFantasia ?? "Nota de venda"}</p>
          <p className="text-[12px] text-mist">
            Nota #{venda.pedido.pedidoId?.slice(-6).toUpperCase()} · {formatDate(venda.pedido.dataPedido)} {formatTime(venda.pedido.dataPedido)}
          </p>
        </div>
        {cancelada && <span className="rounded-full bg-danger/[0.12] px-2 py-0.5 text-[11px] text-danger">Cancelada</span>}
      </header>

      {/* Cliente */}
      <div className="flex justify-between gap-3 px-4 pt-3 text-[13px]">
        <span className="text-mist">Cliente</span>
        <span className="truncate text-right text-ink">{venda.nomeCliente || "—"}</span>
      </div>
      {venda.nomeVendedor && (
        <div className="flex justify-between gap-3 px-4 pt-1 text-[13px]">
          <span className="text-mist">Vendedor</span>
          <span className="truncate text-right text-ink">{venda.nomeVendedor}</span>
        </div>
      )}

      {/* Itens */}
      <ul className="mx-4 mt-3 border-y border-fg/[0.06]">
        {itens.map((i, n) => (
          <li key={i.itemPedidoId ?? n} className="flex items-start justify-between gap-3 border-b border-fg/[0.05] py-2.5 last:border-0">
            <span className="min-w-0">
              <span className="block text-[14px] leading-snug">{i.produto?.nomeProduto ?? "Item"}</span>
              <span className="block text-[12px] tabular-nums text-mist">
                {Number(i.quantidadeItem)} × {formatCurrency(Number(i.valorVendaItem))}
                {i.variacaoDescricao ? ` · ${i.variacaoDescricao}` : ""}
              </span>
            </span>
            <span className="shrink-0 text-[14px] tabular-nums">{formatCurrency(Number(i.valorVendaItem) * Number(i.quantidadeItem))}</span>
          </li>
        ))}
      </ul>

      {/* Totais */}
      <div className="space-y-1 px-4 py-3 text-[13px]">
        <div className="flex items-baseline justify-between">
          <span className="text-[14px] text-ink">Total</span>
          <span className="text-[20px] font-semibold tabular-nums">{formatCurrency(total)}</span>
        </div>
        {!cancelada && (
          <>
            <div className="flex justify-between text-mist">
              <span>Recebido{venda.pedido.formaPagamento ? ` · ${venda.pedido.formaPagamento}` : ""}</span>
              <span className="tabular-nums">{formatCurrency(recebido)}</span>
            </div>
            {falta > 0.004 ? (
              <div className="flex justify-between font-medium text-warning">
                <span>Falta pagar</span>
                <span className="tabular-nums">{formatCurrency(falta)}</span>
              </div>
            ) : (
              <p className="pt-1 text-center text-[12px] text-success">Pago — obrigado pela preferência!</p>
            )}
          </>
        )}
      </div>

      {/* Pix */}
      {pix && (
        <div className="flex items-center gap-3 border-t border-dashed border-fg/[0.12] p-4">
          <img src={pix.qrCode} alt="QR Code do Pix" className="h-28 w-28 shrink-0 rounded-xl bg-white p-1.5" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-mist">Pague com Pix</p>
            <p className="text-[17px] font-semibold tabular-nums">{formatCurrency(pix.valor)}</p>
            <button type="button" onClick={() => void copiarPix()} className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-fg/[0.07] text-[13px] text-ink active:bg-fg/[0.12]">
              {copiado ? <Check size={15} className="text-success" /> : <Copy size={15} />}
              {copiado ? "Copiado!" : "Copiar código"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
};

export default NotaMobile;
