import type { RefObject } from "react";

import useEnterprise from "@/features/empresa/store/enterprise.store";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDate } from "@/shared/utils/date";
import { formatDocument } from "@/shared/utils/format";
import { valorPorExtenso } from "@/shared/utils/extenso";

/**
 * Recibo de pagamento — o documento que prova que a nota foi quitada.
 *
 * É outro papel que a nota: a nota diz o que foi vendido, o recibo diz que o
 * dinheiro entrou. Quem pede recibo é o cliente que precisa comprovar a
 * despesa, e o que ele precisa ver é quem recebeu, quanto, de quem e por quê —
 * nessa ordem, e com o valor também por extenso.
 *
 * Fundo branco e tinta preta, fixos, sem os tokens do tema: este nó é
 * fotografado para virar PNG/PDF, e um recibo em tema escuro sai uma folha
 * preta na impressora de quem recebe.
 */

export type DadosRecibo = {
  /** Número da nota/pedido a que o pagamento se refere. */
  numero: string;
  clienteNome: string;
  /** Quanto foi efetivamente pago. */
  valor: number;
  formaPagamento?: string | null;
  /** ISO da data do pagamento. Vazio = hoje. */
  pagoEm?: string | null;
};

const Linha = ({ rotulo, valor }: { rotulo: string; valor: string }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">{rotulo}</span>
    <span className="text-[13px] text-neutral-900">{valor}</span>
  </div>
);

const Recibo = ({ dados, refRecibo }: { dados: DadosRecibo; refRecibo: RefObject<HTMLDivElement> }) => {
  const empresa = useEnterprise((s) => s.enterprise);

  const data = dados.pagoEm ?? new Date().toISOString();
  const cidade = empresa?.endereco?.cidade ?? "";
  const uf = empresa?.endereco?.uf ?? "";
  const local = [cidade, uf].filter(Boolean).join("/");

  return (
    <div ref={refRecibo} className="w-[900px] bg-white p-12 text-neutral-900"style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* ---------- Cabeçalho: quem recebeu ---------- */}
      <div className="flex items-start justify-between gap-6 border-b-2 border-neutral-900 pb-5">
        <div className="flex min-w-0 items-center gap-4">
          {empresa?.urlLogo && <img src={empresa.urlLogo} alt=""crossOrigin="anonymous"className="h-16 w-16 rounded-lg object-cover" />}

          <div className="min-w-0">
            <p className="text-[20px] leading-tight text-neutral-900">{empresa?.nomeFantasia ?? "—"}</p>
            {empresa?.cpfCnpj && <p className="text-[12px] text-neutral-600">CNPJ {formatDocument(empresa.cpfCnpj)}</p>}
            {empresa?.contato?.telefone && <p className="text-[12px] text-neutral-600">{empresa.contato.telefone}</p>}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-[26px] leading-none tracking-[0.18em] text-neutral-900">RECIBO</p>
          <p className="mt-1.5 text-[12px] text-neutral-600">Referente à nota nº {dados.numero}</p>
        </div>
      </div>

      {/* ---------- O valor ----------
          Só o algarismo aqui: o valor por extenso vem logo abaixo, dentro da
          declaração, que é onde ele tem peso. Escrito duas vezes em cinco
          centímetros parecia defeito de geração do documento. */}
      <div className="mt-8 flex items-end justify-between gap-6 rounded-xl border border-neutral-300 bg-neutral-50 px-6 py-5">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Valor recebido</p>
          <p className="mt-1 text-[34px] leading-none text-neutral-900">{formatCurrency(dados.valor)}</p>
        </div>

        <p className="shrink-0 text-right text-[11px] uppercase tracking-[0.12em] text-neutral-400">Quitado</p>
      </div>

      {/* ---------- A declaração ---------- */}
      <p className="mt-8 text-[14px] leading-[1.9] text-neutral-900">
        Recebemos de <strong className="">{dados.clienteNome}</strong> a importância de{" "}
        <strong className="">{formatCurrency(dados.valor)}</strong> ({valorPorExtenso(dados.valor)}), referente ao
        pagamento da nota nº {dados.numero}, dando plena e geral quitação do valor aqui declarado.
      </p>

      {/* ---------- Os detalhes, para a contabilidade ---------- */}
      <div className="mt-8 grid grid-cols-3 gap-6 border-t border-neutral-200 pt-5">
        <Linha rotulo="Pago em"valor={formatDate(data)} />
        <Linha rotulo="Forma de pagamento"valor={dados.formaPagamento?.trim() || "Não informado"} />
        <Linha rotulo="Nota"valor={`#${dados.numero}`} />
      </div>

      {/* ---------- Assinatura ---------- */}
      <div className="mt-16 flex flex-col items-center">
        <div className="w-[340px] border-t border-neutral-400" />
        <p className="mt-2 text-[12px] text-neutral-700">{empresa?.nomeFantasia ?? ""}</p>
        <p className="text-[11px] text-neutral-500">{empresa?.cpfCnpj ? formatDocument(empresa.cpfCnpj) : ""}</p>
      </div>

      <p className="mt-10 text-center text-[11px] text-neutral-500">
        {local ? `${local}, ` : ""}
        {formatDate(data)}
      </p>
    </div>
  );
};

export default Recibo;
