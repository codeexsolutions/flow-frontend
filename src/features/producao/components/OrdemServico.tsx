import type { LegacyRef } from "react";

import HeaderInterprise from "@/shared/ui/HeaderInterprise";
import FundoNota from "@/shared/ui/FundoNota";
import { formatDate, formatDateTime } from "@/shared/utils/date";
import useEnterprise from "@/features/empresa/store/enterprise.store";
import type { ItemProducao } from "@/features/producao/services/producao.service";

/**
 * A ORDEM DE SERVIÇO — o papel que anda junto com a peça.
 *
 * ---------------------------------------------------------------------------
 * Não é a nota, e a diferença é o público
 * ---------------------------------------------------------------------------
 * A nota é do CLIENTE: diz preço, desconto, total, forma de pagamento. Esta é
 * de quem PRODUZ, e por isso não traz dinheiro em lugar nenhum. Uma OS com o
 * valor da venda circula pela bancada, cai na mesa do estagiário, vai junto na
 * sacola — e o preço é a única informação ali que ninguém precisa e que
 * incomoda quando vaza.
 *
 * O que ela traz é o que a bancada pergunta: para quem é, o que fazer, quanto,
 * até quando, em que etapa está e com quem.
 *
 * ---------------------------------------------------------------------------
 * Os dois campos em branco no pé
 * ---------------------------------------------------------------------------
 * "Observações" e "Recebi" são linhas para caneta, de propósito. A OS é
 * impressa e volta rabiscada: o ajuste que o cliente pediu no balcão, a
 * assinatura de quem retirou. Isso não cabe num campo do sistema porque
 * acontece longe dele — e um espaço em branco no papel é o formato mais
 * confiável que existe para o que não estava previsto.
 *
 * Estático, como a nota e o orçamento: é só o que vai para o PNG/PDF.
 */

type Props = {
  ordem: ItemProducao;
  /** Quem rasteriza é o botão, via `html-to-image`. */
  refDoc?: LegacyRef<HTMLDivElement>;
};

const OrdemServico = ({ ordem: o, refDoc }: Props) => {
  const enterprise = useEnterprise((s) => s.enterprise);

  const PRIORIDADE: Record<string, string> = {
    ALTA: "Alta",
    NORMAL: "Normal",
    BAIXA: "Baixa",
  };

  return (
    <div ref={refDoc} className="relative flex w-full flex-col overflow-hidden bg-surface">
      <FundoNota imagem={enterprise?.notaBackground} />

      <div className="relative flex flex-col">
        {/* Cabeçalho — empresa à esquerda, OS à direita */}
        <div className="flex flex-col gap-3 border-b border-fg/[0.05] p-6 md:flex-row md:items-end md:justify-between">
          <HeaderInterprise />
          <div className="md:text-right">
            <h2 className="text-xl leading-none text-ink md:text-2xl">ORDEM DE SERVIÇO</h2>
            <p className="mt-1.5 text-sm text-mist">Aberta em: {formatDate(o.criado_em)}</p>
            <p className="mt-0.5 text-[11.5px] uppercase tracking-wide text-faint">OS #{o.codigo}</p>
          </div>
        </div>

        {/* Identificação — o mesmo desenho da nota e do orçamento */}
        <div className="flex flex-col gap-4 px-6 pt-6">
          <dl className="flex min-w-0 flex-1 flex-col gap-3.5">
            {[
              { rotulo: "Cliente", valor: o.cliente_nome || "—", extra: "" },
              { rotulo: "Etapa atual", valor: o.etapa_nome || "Sem etapa", extra: o.entrou_na_etapa ? `Desde ${formatDateTime(o.entrou_na_etapa)}` : "" },
              { rotulo: "Responsável", valor: o.responsavel_nome || "Não atribuído", extra: "" },
              {
                rotulo: "Prazo",
                valor: o.prazo ? formatDate(o.prazo) : "Sem prazo definido",
                extra: `Prioridade ${PRIORIDADE[o.prioridade] ?? "Normal"}`,
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

        {/* O que produzir */}
        <div className="px-6 pt-6">
          <span className="text-[10.5px] uppercase tracking-[0.1em] text-faint">O que produzir</span>

          <div className="mt-2 rounded-xl border border-fg/[0.06] bg-fg/[0.02] p-4">
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink">{o.titulo}</p>

            {o.descricao && <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-mist">{o.descricao}</p>}

            <p className="mt-3 text-[12px] tabular-nums text-mist">
              Quantidade total: <span className="text-ink">{Number(o.quantidade) || 1}</span>
            </p>
          </div>
        </div>

        {/* As linhas para caneta */}
        <div className="px-6 pt-6">
          <span className="text-[10.5px] uppercase tracking-[0.1em] text-faint">Observações</span>
          <div className="mt-2 space-y-5">
            <div className="border-b border-dashed border-fg/[0.18]" />
            <div className="border-b border-dashed border-fg/[0.18]" />
            <div className="border-b border-dashed border-fg/[0.18]" />
          </div>
        </div>

        <div className="flex flex-wrap gap-8 px-6 pb-8 pt-10">
          <div className="min-w-[220px] flex-1">
            <div className="border-b border-fg/[0.25]" />
            <p className="mt-1.5 text-[11px] text-faint">Produzido por · data</p>
          </div>
          <div className="min-w-[220px] flex-1">
            <div className="border-b border-fg/[0.25]" />
            <p className="mt-1.5 text-[11px] text-faint">Recebi conforme · assinatura do cliente</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrdemServico;
