import type { LegacyRef } from "react";

import HeaderInterprise from "@/shared/ui/HeaderInterprise";
import FundoNota from "@/shared/ui/FundoNota";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDate } from "@/shared/utils/date";
import { maskPhone } from "@/shared/validation/masks";
import useEnterprise from "@/features/empresa/store/enterprise.store";

import type { Orcamento } from "@/features/orcamentos/services/orcamento.service";

/**
 * O orçamento como o cliente recebe.
 *
 * Mesma linguagem visual da nota de venda (quem recebe reconhece que veio do
 * mesmo sistema), mas com a diferença que importa: diz **ORÇAMENTO** e não
 * "Nota de Venda". Nada de pagamento/Pix aqui — orçamento é proposta, não
 * cobrança.
 *
 * O componente é 100% estático: não há nada editável. É só o que vai para o
 * PNG no download (o botão da linha o rasteriza com `handleDownload`).
 */

type Props = {
  orcamento: Orcamento;
  /** Quem rasteriza é o botão de download, via `html-to-image`. */
  refNota?: LegacyRef<HTMLDivElement>;
};

const OrcamentoNota = ({ orcamento: o, refNota }: Props) => {
  const subtotal = (i: { quantidade: number; valorUnitario: number; subtotal?: number }) =>
    Number(i.subtotal ?? Number(i.valorUnitario) * Number(i.quantidade));

  const telefone = o.clienteContato ? maskPhone(String(o.clienteContato)) : "";
  const enterprise = useEnterprise((s) => s.enterprise);

  return (
    <div ref={refNota} className="relative flex w-full flex-col overflow-hidden bg-surface">
      <FundoNota imagem={enterprise?.notaBackground} />

      <div className="relative flex flex-col">
      {/* Cabeçalho — empresa à esquerda, ORÇAMENTO à direita */}
      <div className="flex flex-col gap-3 border-b border-fg/[0.05] p-6 md:flex-row md:items-end md:justify-between">
        <HeaderInterprise />
        <div className="md:text-right">
          <h2 className="text-xl leading-none text-ink md:text-2xl">ORÇAMENTO</h2>
          <p className="mt-1.5 text-sm text-mist">Data: {formatDate(o.criadoEm)}</p>
          <p className="mt-0.5 text-[11.5px] uppercase tracking-wide text-faint">Proposta #{o.codigo}</p>
        </div>
      </div>

      {/*
        Identificação — quem é o cliente e até quando a proposta vale.

        O vendedor SAIU daqui. A proposta é da empresa, não da pessoa que a
        digitou: o nome do funcionário no papel que vai para o cliente convida
        a cobrar aquele nome depois ("me atende só o João"), envelhece na hora
        em que ele sai da loja e expõe a equipe para fora sem necessidade.
        Quem vendeu continua gravado e visível por DENTRO — na lista de
        orçamentos e nos relatórios —, que é onde a informação serve.

        Aqui havia, à direita, uma caixa tracejada de 176px com a situação da
        proposta: mesma posição, mesmo tamanho e mesma moldura do QR da nota de
        venda. Na tela isso lia como um QR que não carregou, e no documento que
        o cliente recebe ela não tinha o que fazer — a situação é informação de
        quem vende (está na tabela, com selo colorido), não de quem recebe a
        proposta.

        Sem ela, os dados ocupam a largura toda em duas colunas: menos altura,
        e nada de vão à direita.
      */}
      <div className="grid grid-cols-1 gap-x-8 gap-y-3.5 px-6 pt-6 sm:grid-cols-2">
        {[
          { rotulo: "Cliente", valor: o.clienteNome || "—" },
          { rotulo: "Telefone", valor: telefone || "Não informado" },
          { rotulo: "Validade", valor: o.validade ? formatDate(o.validade) : "—" },
        ].map((linha) => (
          <div key={linha.rotulo} className="min-w-0">
            <dt className="text-[10.5px] uppercase tracking-[0.1em] text-faint">{linha.rotulo}</dt>
            <dd className="mt-0.5 min-w-0 truncate text-[14.5px] leading-snug text-ink">{linha.valor}</dd>
          </div>
        ))}
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
              {o.itens.length > 0 ? (
                o.itens.map((i, n) => (
                  <tr key={i.id ?? n}>
                    <td className="max-w-[280px] p-2 align-middle">
                      <p className="truncate px-1 text-ink" title={i.nomeProduto}>{i.nomeProduto}</p>
                    </td>
                    <td className="p-2 align-middle">
                      <p className="px-1 tabular-nums text-ink">{Number(i.quantidade)}</p>
                    </td>
                    <td className="p-2 align-middle">
                      <p className="px-1 tabular-nums text-ink">{formatCurrency(Number(i.valorUnitario))}</p>
                    </td>
                    <td className="p-2 align-middle">
                      <p className="px-1 tabular-nums text-ink">{formatCurrency(subtotal(i))}</p>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-mist">
                    <p className="text-sm">Nenhum item no orçamento</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Observação, se houver */}
      {o.observacao && (
        <div className="px-6 pt-5">
          <p className="text-[10.5px] uppercase tracking-[0.1em] text-faint">Observação</p>
          <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-mist">{o.observacao}</p>
        </div>
      )}

      {/* Total — o único número que importa para a proposta */}
      <div className="flex justify-end p-6">
        <div className="min-w-[200px] rounded-xl border border-fg/[0.06] bg-fg/[0.03] p-4 text-right">
          <span className="text-[10.5px] uppercase tracking-wide text-faint">Total do orçamento</span>
          <span className="mt-1 block text-2xl tabular-nums text-ink">{formatCurrency(o.total)}</span>
        </div>
      </div>
      </div>
    </div>
  );
};

export default OrcamentoNota;
