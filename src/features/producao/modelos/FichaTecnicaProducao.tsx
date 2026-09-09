/**
 * FichaTecnicaProducao.tsx
 * ---------------------------------------------------------------------------
 * Molde da FICHA TÉCNICA DE PRODUÇÃO (réplica do PDF em React + TS + Tailwind).
 *
 * É um MODELO DE ORDEM DE SERVIÇO: a empresa o adota em Configurações ›
 * Produção (quando o painel o libera para ela) e, a partir daí, é este papel
 * que sai ao abrir a OS na aba Ordem de Serviço. Ver `modelos/index.ts`.
 *
 * ---------------------------------------------------------------------------
 * Ele é BRANCO E PRETO de propósito
 * ---------------------------------------------------------------------------
 * O resto do sistema segue o tema do usuário; esta folha, não. Ela nasce para
 * a impressora: fundo branco, traço preto, A4 com margem de 10mm e as regras
 * `print:` no rodapé. Um documento que herdasse o tema escuro sairia da
 * impressora como uma mancha de toner.
 *
 * ---------------------------------------------------------------------------
 * Os campos em branco são o produto
 * ---------------------------------------------------------------------------
 * Moldes, tecidos e as grades de tamanho saem VAZIOS mesmo quando a OS tem
 * dados: eles são decididos na bancada, com a peça na mão, e o papel existe
 * justamente para receber isso a caneta. O sistema preenche só o que ele sabe
 * de verdade — número da OS, cliente, contato e as duas datas.
 *
 * Impressão / PDF: o wrapper já vem com dimensões A4 e regras `print:`.
 * Basta chamar window.print() (ou rasterizar o ref, como faz o resto do
 * sistema em `abrirDocumento`).
 *
 * Dependências: react + tailwindcss, mais o `UploadImagem` do sistema — é ele
 * que põe a arte de frente e costa na ficha (só no modo edição; o documento
 * impresso é imagem e nada mais).
 * ---------------------------------------------------------------------------
 */

import React, { forwardRef, useCallback } from "react";

import UploadImagem from "@/shared/ui/UploadImagem";

/* ========================================================================== */
/*  Tipos                                                                      */
/* ========================================================================== */

/** Tamanhos padrão da grade (pode ser sobrescrito via prop `tamanhos`). */
export const TAMANHOS_PADRAO = ["PP", "P", "M", "G", "GG", "G1", "G2", "G3"] as const;

export type TamanhoPadrao = (typeof TAMANHOS_PADRAO)[number];

/** Mapa tamanho -> quantidade. Aceita qualquer chave para grades customizadas. */
export type GradeTamanhos = Record<string, number | string | null | undefined>;

export interface AnexoModelo {
  /** URL (ou data URL) da imagem do modelo. */
  url?: string | null;
  /** Texto alternativo da imagem. */
  alt?: string;
}

export interface FichaTecnicaData {
  /** Número da Ordem de Serviço (canto superior direito). */
  osNumero?: string | number | null;

  /* 1. Dados do pedido */
  cliente?: string | null;
  contato?: string | null;
  /** Aceita 'YYYY-MM-DD' (input date) ou já formatado 'DD/MM/AAAA'. */
  dataFechamento?: string | null;
  dataEntrega?: string | null;

  /* 2. Anexos do modelo */
  modeloFrente?: AnexoModelo | null;
  modeloCosta?: AnexoModelo | null;

  /* 3. Moldes e especificações */
  moldeCamisa?: string | null;
  moldeShort?: string | null;

  /* 4. Tecidos */
  tecidoCamisa?: string | null;
  tecidoShort?: string | null;

  /* 5. Grades de tamanhos e quantidades */
  gradeCamisas?: GradeTamanhos;
  gradeShorts?: GradeTamanhos;

  /* 6. Observações */
  observacoes?: string | null;
}

export interface FichaTecnicaProducaoProps {
  /** Dados da ficha. Qualquer campo é opcional — o que faltar sai em branco. */
  data?: FichaTecnicaData;
  /** Habilita os inputs para preenchimento. Default: false (somente leitura). */
  editable?: boolean;
  /** Disparado a cada alteração quando `editable`. Recebe a ficha completa. */
  onChange?: (data: FichaTecnicaData) => void;
  /** Conteúdo da caixa de logo do cabeçalho. */
  logo?: React.ReactNode;
  /** Título do cabeçalho. Default: "FICHA TÉCNICA DE PRODUÇÃO". */
  titulo?: string;
  /** Grade de tamanhos exibida nas tabelas 5.1 e 5.2. */
  tamanhos?: readonly string[];
  /** Rótulos das duas tabelas de grade. */
  rotuloGrade1?: string;
  rotuloGrade2?: string;
  /** Quantidade de linhas pautadas no bloco de observações. Default: 11. */
  linhasObservacoes?: number;
  /** Aplica a moldura/altura de folha A4. Default: true. */
  a4?: boolean;
  className?: string;
}

/** Helper para iniciar uma ficha vazia com a grade padrão zerada. */
export function criarFichaVazia(
  tamanhos: readonly string[] = TAMANHOS_PADRAO,
): FichaTecnicaData {
  const grade = () =>
    tamanhos.reduce<GradeTamanhos>((acc, t) => ({ ...acc, [t]: "" }), {});
  return {
    osNumero: "",
    cliente: "",
    contato: "",
    dataFechamento: "",
    dataEntrega: "",
    modeloFrente: { url: null, alt: "Modelo frente" },
    modeloCosta: { url: null, alt: "Modelo costa" },
    moldeCamisa: "",
    moldeShort: "",
    tecidoCamisa: "",
    tecidoShort: "",
    gradeCamisas: grade(),
    gradeShorts: grade(),
    observacoes: "",
  };
}

/** Soma as quantidades de uma grade (útil para totais fora do componente). */
export function totalGrade(grade?: GradeTamanhos): number {
  if (!grade) return 0;
  return Object.values(grade).reduce<number>((soma, v) => {
    const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
    return soma + (Number.isFinite(n) ? n : 0);
  }, 0);
}

/* ========================================================================== */
/*  Utilitários internos                                                       */
/* ========================================================================== */

/** Converte 'YYYY-MM-DD' em 'DD/MM/AAAA'; devolve o valor original caso já esteja formatado. */
function formatarData(valor?: string | null): string {
  if (!valor) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return valor;
}

const BORDA = "border border-black";

/* ========================================================================== */
/*  Subcomponentes                                                             */
/* ========================================================================== */

/** Barra preta de título de seção. */
function SectionBar({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`${BORDA} bg-black px-2 py-[3px] text-[12px] font-bold uppercase leading-tight tracking-wide text-white print:bg-black print:text-white ${className}`}
      style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
    >
      {children}
    </div>
  );
}

/** Célula "RÓTULO: valor" com input opcional. */
function Field({
  label,
  value,
  onChange,
  editable,
  placeholder,
  type = "text",
  className = "",
}: {
  label: string;
  value?: string | number | null;
  onChange?: (v: string) => void;
  editable?: boolean;
  placeholder?: string;
  type?: "text" | "date";
  className?: string;
}) {
  return (
    <div className={`${BORDA} flex min-h-[30px] items-center gap-1 px-2 py-1 ${className}`}>
      <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide">
        {label}
      </span>
      {editable ? (
        <input
          type={type}
          value={value == null ? "" : String(value)}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.target.value)}
          className="min-w-0 flex-1 border-0 bg-transparent px-1 text-[11px] outline-none focus:bg-neutral-100 print:bg-transparent"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate px-1 text-[11px]">
          {type === "date"
            ? formatarData(value as string) || "__ / __ / __"
            : (value ?? "")}
        </span>
      )}
    </div>
  );
}

/**
 * Área de anexo do modelo (frente/costa).
 *
 * ---------------------------------------------------------------------------
 * No preenchimento é um BOTÃO de enviar; no papel é só a imagem
 * ---------------------------------------------------------------------------
 * É a maior área da folha — 110mm dos 297 — e era a única que o sistema não
 * sabia preencher: a arte chegava por WhatsApp e alguém imprimia, recortava e
 * grampeava na ficha. Aqui a mesma caixa recebe o arquivo.
 *
 * O upload existe SÓ em `editable`. O documento que vai para a impressora não
 * pode ter borda tracejada, ícone de "escolher" nem botão de remover — e o nó
 * que vira PNG é montado com `editable` desligado, então nada disso o alcança.
 *
 * `object-contain`, e não `cover`: recortar a arte para preencher o quadrado
 * cortaria justamente a manga ou a gola que a bancada precisa ver.
 */
function AnexoBox({
  titulo,
  anexo,
  editable,
  onChange,
  className = "",
}: {
  titulo: string;
  anexo?: AnexoModelo | null;
  editable?: boolean;
  onChange?: (url: string | null) => void;
  className?: string;
}) {
  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div
        className={`${BORDA} py-[3px] text-center text-[13px] font-bold uppercase tracking-wide`}
      >
        {titulo}
      </div>
      <div className={`${BORDA} flex flex-1 items-center justify-center overflow-hidden p-1`}>
        {editable ? (
          /* `min-h` para a caixa não colapsar quando a ficha é aberta fora da
             folha A4 (`a4={false}`, que é como o preenchimento a mostra): sem
             altura o alvo de clique viraria uma faixa de poucos pixels. */
          <div className="h-full min-h-[220px] w-full">
            <UploadImagem
              tipo="servico"
              formato="miniatura"
              rotulo={titulo}
              valor={anexo?.url ?? null}
              onChange={(url) => onChange?.(url)}
            />
          </div>
        ) : anexo?.url ? (
          <img
            src={anexo.url}
            alt={anexo.alt ?? titulo}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="select-none text-[10px] uppercase tracking-widest text-neutral-300 print:hidden">
            {titulo}
          </span>
        )}
      </div>
    </div>
  );
}

/** Tabela de grade (TAM | quantidade). */
function GradeTable({
  titulo,
  tamanhos,
  grade,
  onChange,
  editable,
  className = "",
}: {
  titulo: string;
  tamanhos: readonly string[];
  grade?: GradeTamanhos;
  onChange?: (tamanho: string, valor: string) => void;
  editable?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-col ${className}`}>
      <div
        className="border border-black bg-black px-1 py-[3px] text-center text-[11px] font-bold uppercase tracking-wide text-white print:bg-black print:text-white"
        style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
      >
        {titulo}
      </div>
      <table className="w-full table-fixed border-collapse">
        <tbody>
          <tr>
            <td className={`${BORDA} w-[38%] px-2 py-[3px] text-[11px] font-bold uppercase`}>
              Tam
            </td>
            <td className={`${BORDA} px-2 py-[3px]`} />
          </tr>
          {tamanhos.map((tam) => (
            <tr key={tam}>
              <td className={`${BORDA} px-2 py-[3px] text-[11px] font-bold uppercase`}>
                {tam}
              </td>
              <td className={`${BORDA} px-1 py-[3px] text-center text-[11px]`}>
                {editable ? (
                  <input
                    type="text"
                    inputMode="numeric"
                    value={grade?.[tam] == null ? "" : String(grade[tam])}
                    onChange={(e) => onChange?.(tam, e.target.value)}
                    className="w-full border-0 bg-transparent text-center text-[11px] outline-none focus:bg-neutral-100 print:bg-transparent"
                  />
                ) : (
                  (grade?.[tam] ?? "")
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ========================================================================== */
/*  Componente principal                                                       */
/* ========================================================================== */

const FichaTecnicaProducao = forwardRef<HTMLDivElement, FichaTecnicaProducaoProps>(
  function FichaTecnicaProducao(
    {
      data = {},
      editable = false,
      onChange,
      logo,
      titulo = "Ficha Técnica de Produção",
      tamanhos = TAMANHOS_PADRAO,
      rotuloGrade1 = "5.1-Camisas",
      rotuloGrade2 = "5.2-Shorts",
      linhasObservacoes = 11,
      a4 = true,
      className = "",
    },
    ref,
  ) {
    /** Atualiza um campo simples da ficha. */
    const set = useCallback(
      <K extends keyof FichaTecnicaData>(campo: K, valor: FichaTecnicaData[K]) => {
        onChange?.({ ...data, [campo]: valor });
      },
      [data, onChange],
    );

    /** Atualiza uma célula de grade. */
    const setGrade = useCallback(
      (campo: "gradeCamisas" | "gradeShorts", tam: string, valor: string) => {
        onChange?.({ ...data, [campo]: { ...(data[campo] ?? {}), [tam]: valor } });
      },
      [data, onChange],
    );

    return (
      <div
        ref={ref}
        className={[
          "ficha-tecnica mx-auto flex flex-col bg-white text-black",
          "font-['Arial',_Helvetica,_sans-serif]",
          a4 ? "w-[210mm] min-h-[297mm] p-[10mm]" : "w-full p-4",
          "print:m-0 print:w-full print:min-h-0 print:p-0 print:shadow-none",
          className,
        ].join(" ")}
      >
        {/* ---------------- Cabeçalho ---------------- */}
        <header className="flex items-stretch">
          <div className={`${BORDA} flex w-[16%] items-center justify-center p-1`}>
            {logo ?? (
              <span className="select-none text-[10px] font-bold uppercase tracking-widest text-neutral-300 print:hidden">
                Logo
              </span>
            )}
          </div>
          <div className={`${BORDA} flex flex-1 items-center justify-center px-2 py-3`}>
            <h1 className="text-center text-[20px] font-bold uppercase leading-tight tracking-wide">
              {titulo}
            </h1>
          </div>
          <div className={`${BORDA} flex w-[22%] items-center gap-1 px-2`}>
            <span className="whitespace-nowrap text-[11px] font-bold uppercase">OS Nº:</span>
            {editable ? (
              <input
                type="text"
                value={data.osNumero == null ? "" : String(data.osNumero)}
                onChange={(e) => set("osNumero", e.target.value)}
                className="w-full min-w-0 border-b border-black bg-transparent text-[12px] font-bold outline-none focus:bg-neutral-100 print:bg-transparent"
              />
            ) : (
              <span className="w-full min-w-0 truncate border-b border-black text-[12px] font-bold">
                {data.osNumero ?? " "}
              </span>
            )}
          </div>
        </header>

        {/* ---------------- 1. Dados do pedido ---------------- */}
        <SectionBar className="mt-2">1. Dados do Pedido</SectionBar>
        <div className="grid grid-cols-2">
          <Field
            label="Cliente:"
            value={data.cliente}
            editable={editable}
            onChange={(v) => set("cliente", v)}
          />
          <Field
            label="Contato:"
            value={data.contato}
            editable={editable}
            onChange={(v) => set("contato", v)}
          />
          <Field
            label="Data Fechamento:"
            type="date"
            value={data.dataFechamento}
            editable={editable}
            onChange={(v) => set("dataFechamento", v)}
          />
          <Field
            label="Data Entrega:"
            type="date"
            value={data.dataEntrega}
            editable={editable}
            onChange={(v) => set("dataEntrega", v)}
          />
        </div>

        {/* ---------------- 2. Anexos do modelo ---------------- */}
        <SectionBar className="mt-2">2. Anexos do Modelo</SectionBar>
        <div className="grid min-h-[110mm] flex-1 grid-cols-2">
          <AnexoBox
            titulo="Modelo Frente"
            anexo={data.modeloFrente}
            editable={editable}
            onChange={(url) => set("modeloFrente", { url, alt: "Modelo frente" })}
          />
          <AnexoBox
            titulo="Modelo Costa"
            anexo={data.modeloCosta}
            editable={editable}
            onChange={(url) => set("modeloCosta", { url, alt: "Modelo costa" })}
          />
        </div>

        {/* ------- 3. Moldes e especificações  |  4. Tecidos ------- */}
        <div className="mt-2 grid grid-cols-2">
          <SectionBar>3. Moldes e Especificações</SectionBar>
          <SectionBar>4. Tecidos</SectionBar>

          <Field
            label="Molde Camisa:"
            value={data.moldeCamisa}
            editable={editable}
            onChange={(v) => set("moldeCamisa", v)}
          />
          <Field
            label="Tecido Camisa:"
            value={data.tecidoCamisa}
            editable={editable}
            onChange={(v) => set("tecidoCamisa", v)}
          />
          <Field
            label="Molde Short:"
            value={data.moldeShort}
            editable={editable}
            onChange={(v) => set("moldeShort", v)}
          />
          <Field
            label="Tecido Short:"
            value={data.tecidoShort}
            editable={editable}
            onChange={(v) => set("tecidoShort", v)}
          />
        </div>

        {/* ---------------- 5. Grades / 6. Observações ---------------- */}
        <SectionBar className="mt-2">5. Grades de Tamanhos e Quantidades</SectionBar>
        <div className="mt-1 flex items-stretch gap-2">
          <GradeTable
            className="w-[24%]"
            titulo={rotuloGrade1}
            tamanhos={tamanhos}
            grade={data.gradeCamisas}
            editable={editable}
            onChange={(tam, v) => setGrade("gradeCamisas", tam, v)}
          />
          <GradeTable
            className="w-[24%]"
            titulo={rotuloGrade2}
            tamanhos={tamanhos}
            grade={data.gradeShorts}
            editable={editable}
            onChange={(tam, v) => setGrade("gradeShorts", tam, v)}
          />

          {/* 6. Observações */}
          <div className="flex flex-1 flex-col">
            <div
              className="border border-black bg-black px-2 py-[3px] text-center text-[12px] font-bold uppercase tracking-wide text-white print:bg-black print:text-white"
              style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
            >
              6. Obs Gerais e Pós-Produção
            </div>
            <div className={`${BORDA} flex flex-1 flex-col p-2`}>
              {editable ? (
                <textarea
                  value={data.observacoes ?? ""}
                  onChange={(e) => set("observacoes", e.target.value)}
                  className="h-full min-h-[80mm] w-full resize-none border-0 bg-transparent text-[11px] leading-[1.9] outline-none focus:bg-neutral-50 print:bg-transparent"
                />
              ) : data.observacoes ? (
                <p className="whitespace-pre-wrap text-[11px] leading-[1.9]">
                  {data.observacoes}
                </p>
              ) : (
                <div className="flex flex-1 flex-col justify-between gap-[3px] py-1">
                  {Array.from({ length: linhasObservacoes }).map((_, i) => (
                    <span key={i} className="block border-b border-black" />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ---------------- Regras de impressão ---------------- */}
        <style>{`
          @media print {
            @page { size: A4 portrait; margin: 10mm; }
            .ficha-tecnica { break-inside: avoid; page-break-inside: avoid; }
            .ficha-tecnica * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .ficha-tecnica input,
            .ficha-tecnica textarea { border: 0 !important; background: transparent !important; }
          }
        `}</style>
      </div>
    );
  },
);

export default FichaTecnicaProducao;
