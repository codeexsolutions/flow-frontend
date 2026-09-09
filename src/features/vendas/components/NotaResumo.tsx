import type { LegacyRef } from "react";

import HeaderInterprise from "@/shared/ui/HeaderInterprise";
import FundoNota from "@/shared/ui/FundoNota";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDate } from "@/shared/utils/date";
import useEnterprise from "@/features/empresa/store/enterprise.store";

import { type PedidoClienteType, totalDoPedido, recebidoDoPedido, valorPendenteDoPedido, estaCancelado } from "@/shared/domain/pedido";

/**
 * A nota de venda para o download rápido na tabela de Vendas.
 *
 * É o MESMO documento que a nota aberta (`Invoice`) manda para o PNG e para o
 * PDF — e "mesmo" aqui é literal, não parecido. Quem baixa pela linha da lista
 * e quem baixa de dentro da nota tem de receber o mesmo papel; o cliente que
 * recebe os dois não sabe (nem deveria saber) por qual caminho a loja gerou o
 * arquivo.
 *
 * ---------------------------------------------------------------------------
 * O que faltava aqui, e por que importa
 * ---------------------------------------------------------------------------
 * O resumo tinha três caixas — Total, Pago, Pendente. A nota tem SEIS:
 * T. Bruto, Desconto, T. Líquido, T. Pago, Pendente e Forma de pagamento. O
 * que sumia no caminho era justamente o que o cliente confere primeiro: o
 * DESCONTO. Quem negociou R$ 80 numa venda de R$ 100 recebia um PDF que dizia
 * só "Total R$ 80" — o abatimento combinado no balcão não aparecia em lugar
 * nenhum, e a próxima conversa começa com o cliente perguntando se o desconto
 * entrou.
 *
 * Pelo mesmo motivo o preço de tabela riscado voltou para a linha do item: é
 * ele que mostra o desconto item a item, e não só na soma.
 *
 * ---------------------------------------------------------------------------
 * Grade de 6 colunas FIXA, sem breakpoint
 * ---------------------------------------------------------------------------
 * A nota usa `lg:grid-cols-6`, que olha a largura da JANELA. Aqui isso seria
 * um defeito: este componente só existe dentro do nó escondido de 900px, e o
 * arquivo tem de sair igual no celular e no desktop. Com breakpoint, a mesma
 * venda baixada do celular sairia com o resumo em duas colunas.
 *
 * Totalmente estático, como o `OrcamentoNota`: só o que vai para o PNG.
 */
type Props = {
  venda: PedidoClienteType;
  /** Quem rasteriza é o botão de download, via `html-to-image`. */
  refNota?: LegacyRef<HTMLDivElement>;
};

const NotaResumo = ({ venda: v, refNota }: Props) => {
  const itens = v.pedido.itensPedido ?? [];

  /* As mesmas três contas do `Invoice`, com os mesmos nomes — quando uma
     mudar, é para as duas mudarem juntas. O líquido sai de `totalDoPedido`
     (o total gravado, que já cai na soma dos itens quando falta). */
  const totalLiquido = totalDoPedido(v);
  const totalBruto = itens.reduce((acc, i) => acc + Number(i.produto?.valorProduto ?? 0) * Number(i.quantidadeItem ?? 0), 0);
  const totalDesconto = Math.max(totalBruto - totalLiquido, 0);
  const temDesconto = totalDesconto > 0 && totalBruto > 0;

  const pago = recebidoDoPedido(v);
  const pendente = valorPendenteDoPedido(v);
  const cancelada = estaCancelado(v);
  const formaPagamento = v.pedido.formaPagamento?.trim() || "Não consta";

  const enterprise = useEnterprise((s) => s.enterprise);

  /* Os mesmos rótulos e valores do resumo da nota. */
  const lblResumo = "block text-[11px] uppercase tracking-[0.08em] text-faint";
  const valResumo = "mt-1 block truncate text-sm text-ink";

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
              {itens.length > 0 ? (
                itens.map((item) => {
                  const unitario = Number(item.valorVendaItem);
                  const tabela = Number(item.produto?.valorProduto ?? 0);

                  return (
                    <tr key={item.itemPedidoId}>
                      <td className="max-w-[280px] p-2 align-middle">
                        <p className="truncate px-1 text-ink" title={item.produto.nomeProduto}>
                          {item.produto.nomeProduto}
                          {/* A variação vira selo ao lado do nome: sem ela, duas
                              linhas de "Camiseta preta" ficam idênticas na nota
                              e o cliente não sabe o que levou. */}
                          {item.variacaoDescricao && (
                            <span className="ml-1.5 rounded bg-fg/[0.07] px-1.5 py-px text-[10px] text-mist">{item.variacaoDescricao}</span>
                          )}
                        </p>
                      </td>
                      <td className="p-2 align-middle">
                        <p className="px-1 tabular-nums text-ink">{Number(item.quantidadeItem)}</p>
                      </td>
                      <td className="p-2 align-middle">
                        {/* O preço de tabela riscado ao lado do praticado — é o
                            desconto item a item, do mesmo jeito que a nota
                            aberta mostra. */}
                        <div className="flex items-center gap-1.5 px-1">
                          <span className="tabular-nums text-ink">{formatCurrency(unitario)}</span>
                          {tabela > 0 && unitario !== tabela && (
                            <span className="text-[10px] text-mist line-through">{formatCurrency(tabela)}</span>
                          )}
                        </div>
                      </td>
                      <td className="p-2 align-middle">
                        <p className="px-1 tabular-nums text-ink">{formatCurrency(unitario * Number(item.quantidadeItem))}</p>
                      </td>
                    </tr>
                  );
                })
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

      {/* Resumo — as SEIS caixas da nota, na mesma ordem e com o mesmo desenho */}
      <div className="p-5 pt-6">
        <div className="grid grid-cols-6 gap-2">
          <div className="rounded-xl border border-fg/[0.06] bg-fg/[0.03] p-3">
            <span className={lblResumo}>T. Bruto</span>
            <span className={`${valResumo} tabular-nums`}>{formatCurrency(totalBruto)}</span>
          </div>

          <div className={`rounded-xl border p-3 ${temDesconto ? "border-warning/20 bg-warning/[0.12]" : "border-fg/[0.06] bg-fg/[0.03]"}`}>
            <span className={`${lblResumo} ${temDesconto ? "text-warning" : "text-faint"}`}>Desconto</span>
            <span className={`mt-1 block truncate text-sm tabular-nums ${temDesconto ? "text-warning" : "text-ink"}`}>{temDesconto ? `- ${formatCurrency(totalDesconto)}` : formatCurrency(0)}</span>
          </div>

          <div className="rounded-xl border border-fg/[0.06] bg-fg/[0.03] p-3">
            <span className={lblResumo}>T. Líquido</span>
            {/* Nota cancelada risca o líquido: é o único lugar do documento em
                que o cancelamento precisa aparecer para quem lê. */}
            <span className={`mt-1 block truncate text-sm tabular-nums ${cancelada ? "text-mist line-through" : "text-ink"}`}>{formatCurrency(totalLiquido)}</span>
          </div>

          <div className="rounded-xl border border-fg/[0.06] bg-fg/[0.03] p-3">
            <span className={lblResumo}>T. Pago</span>
            <span className={`${valResumo} tabular-nums`}>{formatCurrency(pago)}</span>
          </div>

          <div className={`rounded-xl border p-3 ${pendente > 0 ? "border-warning/20 bg-warning/[0.12]" : "border-success/20 bg-success/[0.12]"}`}>
            <span className={`${lblResumo} ${pendente > 0 ? "text-warning" : "text-success"}`}>Pendente</span>
            <span className={`mt-1 block truncate text-sm tabular-nums ${pendente > 0 ? "text-warning" : "text-success"}`}>{formatCurrency(pendente)}</span>
          </div>

          <div className="rounded-xl border border-fg/[0.06] bg-fg/[0.03] p-3">
            <span className={lblResumo}>F. Pagamento</span>
            <span className={valResumo}>{formaPagamento}</span>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default NotaResumo;
