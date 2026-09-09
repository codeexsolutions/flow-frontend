import type { LegacyRef } from "react";

import HeaderInterprise from "@/shared/ui/HeaderInterprise";
import FundoNota from "@/shared/ui/FundoNota";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDate, formatDateTime, toDate } from "@/shared/utils/date";
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
 * A identificação segue o MESMO desenho da `NotaResumo`: lista empilhada, com
 * rótulo pequeno, valor legível e uma linha fina de apoio embaixo. Antes era
 * uma grade de duas colunas com outra tipografia e outra caixa de total — o
 * arquivo baixado não parecia ter saído do mesmo sistema que a nota, que é
 * justamente o que o cliente compara quando recebe os dois.
 *
 * O componente é 100% estático: não há nada editável. É só o que vai para o
 * PNG no download (o botão da linha o rasteriza com `handleDownload`).
 */

type Props = {
  orcamento: Orcamento;
  /** Quem rasteriza é o botão de download, via `html-to-image`. */
  refNota?: LegacyRef<HTMLDivElement>;
};

/** Dias inteiros entre a emissão e o vencimento — o PRAZO da proposta. */
const prazoEmDias = (criadoEm: string, validade?: string | null): number | null => {
  const inicio = toDate(criadoEm);
  const fim = toDate(validade);

  if (!inicio || !fim) return null;

  const dia = 24 * 60 * 60 * 1000;
  const zerar = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  return Math.round((zerar(fim) - zerar(inicio)) / dia);
};

const OrcamentoNota = ({ orcamento: o, refNota }: Props) => {
  const subtotal = (i: { quantidade: number; valorUnitario: number; subtotal?: number }) =>
    Number(i.subtotal ?? Number(i.valorUnitario) * Number(i.quantidade));

  const telefone = o.clienteContato ? maskPhone(String(o.clienteContato)) : "";
  const enterprise = useEnterprise((s) => s.enterprise);

  /* O prazo por extenso ao lado da data: "válido até 23/09" sozinho obriga
     quem lê a contar no calendário para saber quanto tempo ainda tem. */
  const dias = prazoEmDias(o.criadoEm, o.validade);
  const prazo = dias === null ? "" : dias === 1 ? "Prazo de 1 dia" : `Prazo de ${dias} dias`;

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
        Identificação — quem é o cliente, quando a proposta saiu e até quando
        ela vale.

        O vendedor SAIU daqui. A proposta é da empresa, não da pessoa que a
        digitou: o nome do funcionário no papel que vai para o cliente convida
        a cobrar aquele nome depois ("me atende só o João"), envelhece na hora
        em que ele sai da loja e expõe a equipe para fora sem necessidade.
        Quem vendeu continua gravado e visível por DENTRO — na lista de
        orçamentos e nos relatórios —, que é onde a informação serve.

        No lugar dele entrou o que FALTAVA para a proposta se defender sozinha:
        o telefone digitado no balcão, o número da proposta, a hora da emissão
        e o prazo de validade. Sem a emissão e o prazo, o papel que o cliente
        guarda não diz de quando é nem até quando aquele preço vale — e é
        exatamente essa a discussão que aparece quando ele volta um mês depois.
      */}
      <div className="flex flex-col gap-4 px-6 pt-6">
        <dl className="flex min-w-0 flex-1 flex-col gap-3.5">
          {[
            { rotulo: "Cliente", valor: o.clienteNome || "—", extra: "" },
            { rotulo: "Telefone", valor: telefone || "Não informado", extra: "" },
            { rotulo: "Código", valor: `#${o.codigo}`, extra: "" },
            { rotulo: "Emitido em", valor: formatDateTime(o.criadoEm), extra: "" },
            {
              rotulo: "Validade",
              valor: o.validade ? `Válido até ${formatDate(o.validade)}` : "Sem prazo definido",
              extra: o.validade ? prazo : "Combine o prazo com o cliente antes de fechar.",
            },
          ].map((linha) => (
            <div key={linha.rotulo} className="min-w-0">
              <dt className="text-[10.5px] uppercase tracking-[0.1em] text-faint">{linha.rotulo}</dt>
              <dd className="mt-0.5 min-w-0 truncate text-[14.5px] leading-snug text-ink">{linha.valor}</dd>
              {linha.extra && <dd className="truncate text-[11.5px] text-faint">{linha.extra}</dd>}
            </div>
          ))}
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

      {/* Total — o único número que importa para a proposta.
          Mesma caixa do resumo da nota (`NotaResumo`): mesma largura mínima,
          mesmo corpo de texto, mesmo canto. O que muda é só não haver "Pago" e
          "Pendente" ao lado — proposta não tem dinheiro recebido. */}
      <div className="flex flex-wrap justify-end gap-2 p-6">
        <div className="min-w-[150px] rounded-xl border border-fg/[0.06] bg-fg/[0.03] p-4 text-right">
          <span className="text-[10.5px] uppercase tracking-wide text-faint">Total do orçamento</span>
          <span className="mt-1 block text-xl tabular-nums text-ink">{formatCurrency(o.total)}</span>
        </div>
      </div>
      </div>
    </div>
  );
};

export default OrcamentoNota;
