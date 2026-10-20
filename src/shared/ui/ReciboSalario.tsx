import type { RefObject } from "react";

import useEnterprise from "@/features/empresa/store/enterprise.store";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDate } from "@/shared/utils/date";
import { formatDocument } from "@/shared/utils/format";
import { valorPorExtenso } from "@/shared/utils/extenso";
import { liquidoDaFolha } from "@/shared/utils/folha";

/**
 * Recibo de salário — o papel que prova que o pagamento do mês foi feito.
 *
 * É outro documento que o recibo de venda: lá a empresa RECEBE de um cliente,
 * aqui ela PAGA a um funcionário, e quem assina é a pessoa que recebeu. Por
 * isso a declaração está na primeira pessoa ("Recebi de…") e a linha de
 * assinatura leva o nome do funcionário, não o da empresa.
 *
 * Fundo branco e tinta preta, fixos, sem os tokens do tema: este nó é
 * fotografado para virar PNG/PDF, e um recibo em tema escuro sai uma folha
 * preta na impressora de quem recebe. Mesma decisão do `Recibo.tsx`.
 */

export type DadosReciboSalario = {
  funcionarioNome: string;
  funcionarioCpf: string;
  funcionarioCargo: string;

  empregadorNome: string;
  empregadorCpf: string;
  empregadorCnpj: string;

  /** "MM/AAAA" — o mês a que o pagamento se refere. */
  competencia: string;
  salarioBruto: number;
  descontos: number;
  adicionais: number;

  cidade: string;
  /** ISO `AAAA-MM-DD`. */
  data: string;

  /** PNG em data URL. Vazio = o recibo sai com a linha em branco para caneta. */
  assinatura: string | null;
};

const Campo = ({ rotulo, valor }: { rotulo: string; valor: string }) => (
  <div className="flex min-w-0 flex-col gap-0.5">
    <span className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">{rotulo}</span>
    <span className="truncate text-[13px] text-neutral-900">{valor || "—"}</span>
  </div>
);

/** Uma linha da conta. `destaque` é a do total. */
const LinhaConta = ({ rotulo, valor, sinal, destaque }: { rotulo: string; valor: number; sinal?: "+" | "−"; destaque?: boolean }) => (
  <div className={`flex items-center justify-between gap-4 py-2.5 ${destaque ? "border-t-2 border-neutral-900" : "border-t border-neutral-200"}`}>
    <span className={destaque ? "text-[13px] text-neutral-900" : "text-[13px] text-neutral-700"}>{rotulo}</span>
    <span className={`tabular-nums ${destaque ? "text-[17px] text-neutral-900" : "text-[13px] text-neutral-900"}`}>
      {sinal ? `${sinal} ` : ""}
      {formatCurrency(valor)}
    </span>
  </div>
);

const ReciboSalario = ({ dados, refRecibo }: { dados: DadosReciboSalario; refRecibo: RefObject<HTMLDivElement> }) => {
  const empresa = useEnterprise((s) => s.enterprise);

  const liquido = liquidoDaFolha(dados);
  const local = [dados.cidade, empresa?.endereco?.uf].filter(Boolean).join("/");

  /* CPF e CNPJ do empregador numa linha só: um dos dois costuma estar vazio
     (a empresa tem um documento, não dois), e duas etiquetas com travessão
     ficariam ocupando meia página para não dizer nada. */
  const documentosEmpregador = [
    dados.empregadorCnpj ? `CNPJ ${formatDocument(dados.empregadorCnpj)}` : "",
    dados.empregadorCpf ? `CPF ${formatDocument(dados.empregadorCpf)}` : "",
  ].filter(Boolean).join(" · ");

  return (
    <div ref={refRecibo} className="w-[900px] bg-white p-12 text-neutral-900"style={{ fontFamily: "Inter, system-ui, sans-serif" }}>

      {/* ---------- Cabeçalho: quem paga ---------- */}
      <div className="flex items-start justify-between gap-6 border-b-2 border-neutral-900 pb-5">
        <div className="flex min-w-0 items-center gap-4">
          {empresa?.urlLogo && <img src={empresa.urlLogo} alt=""crossOrigin="anonymous"className="h-16 w-16 rounded-lg object-cover" />}

          <div className="min-w-0">
            <p className="text-[20px] leading-tight text-neutral-900">{dados.empregadorNome || "—"}</p>
            {documentosEmpregador && <p className="text-[12px] text-neutral-600">{documentosEmpregador}</p>}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-[22px] leading-none tracking-[0.14em] text-neutral-900">RECIBO DE SALÁRIO</p>
          <p className="mt-1.5 text-[12px] text-neutral-600">Competência {dados.competencia}</p>
        </div>
      </div>

      {/* ---------- O valor ----------
          Só o algarismo aqui: o extenso vem dentro da declaração, que é onde
          ele tem peso jurídico. Escrito duas vezes em cinco centímetros
          parecia defeito de geração. Mesma escolha do recibo de venda. */}
      <div className="mt-8 flex items-end justify-between gap-6 rounded-xl border border-neutral-300 bg-neutral-50 px-6 py-5">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Salário líquido</p>
          <p className="mt-1 text-[34px] leading-none text-neutral-900">{formatCurrency(liquido)}</p>
        </div>

        <p className="shrink-0 text-right text-[11px] uppercase tracking-[0.12em] text-neutral-400">Quitado</p>
      </div>

      {/* ---------- A declaração ---------- */}
      <p className="mt-8 text-[14px] leading-[1.9] text-neutral-900">
        Recebi de <strong className="">{dados.empregadorNome || "—"}</strong>
        {documentosEmpregador ? `, ${documentosEmpregador},` : ","} a importância de{" "}
        <strong className="">{formatCurrency(liquido)}</strong> ({valorPorExtenso(liquido)}), referente ao
        pagamento de salário da competência {dados.competencia}, dando plena e geral quitação do valor aqui declarado.
      </p>

      {/* ---------- Quem recebeu ---------- */}
      <div className="mt-8 grid grid-cols-3 gap-6 border-t border-neutral-200 pt-5">
        <Campo rotulo="Funcionário"valor={dados.funcionarioNome} />
        <Campo rotulo="CPF"valor={dados.funcionarioCpf ? formatDocument(dados.funcionarioCpf) : ""} />
        <Campo rotulo="Cargo"valor={dados.funcionarioCargo} />
      </div>

      {/* ---------- A conta ----------
          Aberta linha a linha porque um líquido sozinho não se confere. Quem
          recebe quer ver de onde saiu o desconto, e quem paga precisa
          conseguir explicar o número seis meses depois. */}
      <div className="mt-8">
        <p className="mb-1 text-[10px] uppercase tracking-[0.12em] text-neutral-500">Composição</p>

        <LinhaConta rotulo="Salário bruto"valor={dados.salarioBruto} />
        {dados.adicionais > 0 && <LinhaConta rotulo="Adicionais"valor={dados.adicionais} sinal="+" />}
        {dados.descontos > 0 && <LinhaConta rotulo="Descontos"valor={dados.descontos} sinal="−" />}
        <LinhaConta rotulo="Salário líquido"valor={liquido} destaque />
      </div>

      {/* ---------- Assinatura ---------- */}
      <div className="mt-14 flex flex-col items-center">
        {/* A imagem pousa ACIMA da linha, encostada nela — é onde a caneta
            encostaria. Sem assinatura a linha sai limpa, para assinar no papel. */}
        <div className="flex h-[70px] w-[340px] items-end justify-center">
          {dados.assinatura && <img src={dados.assinatura} alt=""className="max-h-[70px] max-w-full object-contain" />}
        </div>

        <div className="w-[340px] border-t border-neutral-400" />
        <p className="mt-2 text-[12px] text-neutral-700">{dados.funcionarioNome || ""}</p>
        <p className="text-[11px] text-neutral-500">{dados.funcionarioCpf ? formatDocument(dados.funcionarioCpf) : ""}</p>
      </div>

      <p className="mt-10 text-center text-[11px] text-neutral-500">
        {local ? `${local}, ` : ""}
        {formatDate(dados.data)}
      </p>
    </div>
  );
};

export default ReciboSalario;
