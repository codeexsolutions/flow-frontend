/**
 * FichaTecnicaProducao.tsx
 * ---------------------------------------------------------------------------
 * Molde da FICHA TÉCNICA DE PRODUÇÃO — a folha que anda junto com a peça.
 *
 * É um MODELO DE ORDEM DE SERVIÇO: a empresa o adota em Configurações ›
 * Produção (quando o painel o libera para ela) e, a partir daí, é este papel
 * que sai ao abrir a OS na aba Ordem de Serviço. Ver `modelos/index.tsx`.
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
 * O desenho: o que mudou, e por quê
 * ---------------------------------------------------------------------------
 * A primeira versão era a réplica fiel do PDF que a oficina usava, e herdou os
 * defeitos dele:
 *
 *   **Fio duplo em toda junção.** Cada célula tinha `border` inteira, então
 *   duas células vizinhas encostavam dois traços de 1px — e a folha ficava
 *   riscada de linhas grossas irregulares, mais pesadas nas junções do que nas
 *   bordas. Agora a MOLDURA é do grupo e as células só desenham a linha que as
 *   separa (`border-l`, `border-t`): fio de 1px em todo lugar, igual.
 *
 *   **Rótulo e valor na mesma linha.** "CLIENTE:" em 9px colado no nome em
 *   11px fazia os dois disputarem a mesma faixa, e o que se lê de longe na
 *   bancada — o valor — era o menor dos dois. Agora o rótulo é uma legenda
 *   miúda EM CIMA, e o valor tem a linha inteira e o corpo maior.
 *
 *   **Tudo no mesmo peso.** Título de seção, rótulo de campo e valor saíam
 *   quase do mesmo tamanho, todos em negrito e caixa alta. A hierarquia agora
 *   é explícita: barra preta para a seção, legenda cinza para o campo, preto
 *   grande para o conteúdo.
 *
 *   **A grade sem cabeçalho e sem total.** A tabela de tamanhos abria com uma
 *   linha "TAM" e uma célula vazia ao lado, e terminava sem somar nada — quem
 *   corta soma de cabeça e escreve o total na margem. Agora tem cabeçalho
 *   (TAM / QTD) e uma linha de TOTAL que o próprio papel calcula.
 *
 * ---------------------------------------------------------------------------
 * Os campos em branco são o produto
 * ---------------------------------------------------------------------------
 * Moldes, tecidos e as grades de tamanho saem VAZIOS mesmo quando a OS tem
 * dados: eles são decididos na bancada, com a peça na mão, e o papel existe
 * justamente para receber isso a caneta. O sistema preenche só o que ele sabe
 * de verdade — número da OS, cliente, contato e as duas datas.
 *
 * Impressão / PDF: o wrapper já vem com dimensões A4 e regras `print:`. Basta
 * chamar window.print() (ou rasterizar o ref, como faz o resto do sistema em
 * `abrirDocumento`).
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
  /** Título do cabeçalho. Default: "Ficha Técnica de Produção". */
  titulo?: string;
  /** Grade de tamanhos exibida nas tabelas 5.1 e 5.2. */
  tamanhos?: readonly string[];
  /** Rótulos das duas tabelas de grade. */
  rotuloGrade1?: string;
  rotuloGrade2?: string;
  /** Quantidade de linhas pautadas no bloco de observações. Default: 9. */
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

/** A moldura de um GRUPO. As células de dentro só desenham a linha que separa. */
const CAIXA = "border border-black";

/**
 * O fundo preto precisa ser pedido DUAS vezes.
 *
 * Por padrão o navegador não imprime cor de fundo, e a barra de seção sairia
 * como texto branco sobre papel branco — ou seja, invisível. As duas
 * propriedades (a `-webkit-` e a padrão) cobrem os motores que ainda pedem o
 * prefixo.
 */
const FUNDO_IMPRESSO: React.CSSProperties = {
  WebkitPrintColorAdjust: "exact",
  printColorAdjust: "exact",
};

/** O que o input e o textarea fazem quando recebem foco — cinza, nunca azul. */
const FOCO = "outline-none focus:bg-neutral-100 print:bg-transparent";

/* ========================================================================== */
/*  Subcomponentes                                                             */
/* ========================================================================== */

/**
 * Barra preta de título de seção.
 *
 * O número vem numa caixinha vazada à esquerda, separado do nome. Ele era
 * parte do texto ("1. Dados do Pedido") e, em caixa alta e negrito como o
 * resto, competia com a palavra que importa — além de empurrar o nome da
 * seção para a direita numa distância diferente em cada barra, conforme o
 * número tivesse um ou dois dígitos.
 */
function SectionBar({
  numero,
  children,
  className = "",
}: {
  numero: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-2 border border-black bg-black px-2 py-[3.5px] text-white print:bg-black print:text-white ${className}`}
      style={FUNDO_IMPRESSO}
    >
      <span className="grid h-[14px] min-w-[14px] place-items-center border border-white/80 px-[3px] text-[8px] font-bold leading-none">
        {numero}
      </span>
      <span className="text-[10.5px] font-bold uppercase leading-none tracking-[0.16em]">
        {children}
      </span>
    </div>
  );
}

/**
 * Campo do formulário: legenda miúda em cima, valor grande embaixo.
 *
 * O `min-h` é o que garante que a linha do papel não encolha quando o campo
 * está vazio — e vazio é como a maior parte dela sai da impressora.
 */
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
    <div className={`flex min-h-[12mm] flex-col justify-center gap-[2px] px-2.5 py-1.5 ${className}`}>
      <span className="text-[7.5px] font-bold uppercase leading-none tracking-[0.14em] text-neutral-500">
        {label}
      </span>

      {editable ? (
        <input
          type={type}
          value={value == null ? "" : String(value)}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.target.value)}
          className={`w-full min-w-0 border-0 bg-transparent p-0 text-[12.5px] font-semibold leading-tight ${FOCO}`}
        />
      ) : (
        /* Vazio sai VAZIO: o campo em branco é o produto, é nele que a
           bancada escreve a caneta. Só a data ganha a pauta pontilhada, que
           diz o formato sem preencher nada. */
        <span className="block min-w-0 truncate text-[12.5px] font-semibold leading-tight">
          {type === "date"
            ? formatarData(value as string) || (
                <span className="font-normal tracking-[0.2em] text-neutral-300">__/__/____</span>
              )
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
 * É a maior área da folha — 105mm dos 297 — e era a única que o sistema não
 * sabia preencher: a arte chegava por WhatsApp e alguém imprimia, recortava e
 * grampeava na ficha. Aqui a mesma caixa recebe o arquivo.
 *
 * O upload existe SÓ em `editable`, e pede o `tom="papel"` do `UploadImagem`:
 * a caixa padrão é desenhada com as cores do TEMA (borda clara sobre fundo
 * escuro), e sobre a folha branca ela sumia — tracejado quase invisível e
 * texto cinza-claro em cima de branco. O documento que vai para a impressora
 * não tem nada disso: o nó que vira PNG é montado com `editable` desligado.
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
      <div className="border-b border-black py-[3px] text-center text-[9px] font-bold uppercase leading-none tracking-[0.18em]">
        {titulo}
      </div>

      <div className="flex flex-1 items-center justify-center overflow-hidden p-1.5">
        {editable ? (
          /* `min-h` para a caixa não colapsar quando a ficha é aberta fora da
             folha A4 (`a4={false}`): sem altura o alvo de clique viraria uma
             faixa de poucos pixels. */
          <div className="h-full min-h-[180px] w-full">
            <UploadImagem
              tipo="servico"
              formato="miniatura"
              tom="papel"
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
          /* Vazio, o quadro não escreve nada no papel: é lugar para desenhar a
             mão ou grampear a arte. Na tela fica a marca d'água do que ele é. */
          <span className="select-none text-[9px] uppercase tracking-[0.3em] text-neutral-200 print:hidden">
            {titulo}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Tabela de grade (TAM | QTD), com cabeçalho e total.
 *
 * O total é somado pelo papel, não pela bancada: `totalGrade` já existia para
 * quem consome a ficha de fora e agora serve à própria folha. Uma grade de
 * oito tamanhos somada de cabeça no fim do dia é onde nasce a peça a mais — e
 * a peça a menos.
 */
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
  const total = totalGrade(grade);

  return (
    <div className={`flex flex-col ${CAIXA} ${className}`}>
      <div
        className="border-b border-black bg-black px-2 py-[3px] text-center text-[9px] font-bold uppercase leading-none tracking-[0.14em] text-white print:bg-black print:text-white"
        style={FUNDO_IMPRESSO}
      >
        {titulo}
      </div>

      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr>
            <th className="w-[46%] border-b border-r border-black px-2 py-[2px] text-left text-[7.5px] font-bold uppercase tracking-[0.14em] text-neutral-500">
              Tam
            </th>
            <th className="border-b border-black px-2 py-[2px] text-center text-[7.5px] font-bold uppercase tracking-[0.14em] text-neutral-500">
              Qtd
            </th>
          </tr>
        </thead>

        <tbody>
          {tamanhos.map((tam) => (
            <tr key={tam}>
              <td className="border-b border-r border-black px-2 py-[2.5px] text-[10.5px] font-bold uppercase leading-tight">
                {tam}
              </td>
              <td className="border-b border-black px-1 py-[2.5px] text-center text-[11px] leading-tight">
                {editable ? (
                  <input
                    type="text"
                    inputMode="numeric"
                    value={grade?.[tam] == null ? "" : String(grade[tam])}
                    onChange={(e) => onChange?.(tam, e.target.value)}
                    className={`w-full border-0 bg-transparent p-0 text-center text-[11px] font-semibold ${FOCO}`}
                  />
                ) : (
                  <span className="font-semibold">{grade?.[tam] ?? ""}</span>
                )}
              </td>
            </tr>
          ))}

          {/* O total fecha a tabela — e some quando não há o que somar, para a
              folha em branco não sair com um "0" impresso onde a bancada vai
              escrever à mão. */}
          <tr>
            <td className="border-r border-black px-2 py-[2.5px] text-[7.5px] font-bold uppercase tracking-[0.14em] text-neutral-500">
              Total
            </td>
            <td className="px-1 py-[2.5px] text-center text-[11px] font-bold leading-tight">
              {total > 0 ? total : ""}
            </td>
          </tr>
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
      rotuloGrade1 = "5.1 Camisas",
      rotuloGrade2 = "5.2 Shorts",
      linhasObservacoes = 9,
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

    /*
     * Os fios de dentro, escritos célula a célula.
     *
     * A moldura é do GRUPO; cada célula desenha só a linha que a separa da
     * vizinha — a da esquerda (`border-l`) e a de cima (`border-t`). É o que
     * dá 1px em toda junção em vez do traço dobrado de antes.
     *
     * Escrito assim, e não com `[&>*:nth-child(2n)]`: a variante arbitrária
     * resolve as quatro células numa linha só, mas some da folha inteira se o
     * scanner do Tailwind não reconhecer a classe — e uma ficha sem fio
     * interno é uma página quebrada. Quatro strings valem a certeza.
     */
    const FIO_ESQ = "border-l border-black";
    const FIO_CIMA = "border-t border-black";

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
        {/* ---------------- Cabeçalho ----------------
            Uma moldura só, três compartimentos: a marca, o nome do papel e o
            número. Eram três caixas independentes encostadas, com fio duplo
            entre elas e o título espremido numa altura diferente da do logo. */}
        <header className={`grid grid-cols-[22%_1fr_24%] items-stretch ${CAIXA}`}>
          <div className="flex items-center justify-center p-1.5">
            {logo ?? (
              <span className="select-none text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-300 print:hidden">
                Logo
              </span>
            )}
          </div>

          <div className="flex flex-col items-center justify-center border-l border-r border-black px-2 py-3 text-center">
            <h1 className="text-[17px] font-bold uppercase leading-none tracking-[0.06em]">
              {titulo}
            </h1>
            {/* O que o papel É, em letra miúda: quem recebe a folha na bancada
                nem sempre sabe que "ficha técnica" e "ordem de serviço" são a
                mesma coisa nesta casa. */}
            <span className="mt-1.5 text-[8px] uppercase tracking-[0.3em] text-neutral-500">
              Ordem de serviço
            </span>
          </div>

          <div className="flex flex-col justify-center gap-[3px] px-2.5 py-2">
            <span className="text-[7.5px] font-bold uppercase leading-none tracking-[0.14em] text-neutral-500">
              OS Nº
            </span>
            {editable ? (
              <input
                type="text"
                value={data.osNumero == null ? "" : String(data.osNumero)}
                onChange={(e) => set("osNumero", e.target.value)}
                className={`w-full min-w-0 border-0 bg-transparent p-0 text-[20px] font-bold leading-none ${FOCO}`}
              />
            ) : (
              <span className="block w-full min-w-0 truncate text-[20px] font-bold leading-none">
                {data.osNumero ?? ""}
              </span>
            )}
          </div>
        </header>

        {/* ---------------- 1. Dados do pedido ---------------- */}
        <SectionBar numero="1" className="mt-2.5">
          Dados do pedido
        </SectionBar>
        <div className={`grid grid-cols-2 ${CAIXA} border-t-0`}>
          <Field label="Cliente" value={data.cliente} editable={editable} onChange={(v) => set("cliente", v)} />
          <Field label="Contato" className={FIO_ESQ} value={data.contato} editable={editable} onChange={(v) => set("contato", v)} />
          <Field
            label="Data de fechamento"
            className={FIO_CIMA}
            type="date"
            value={data.dataFechamento}
            editable={editable}
            onChange={(v) => set("dataFechamento", v)}
          />
          <Field
            label="Data de entrega"
            className={`${FIO_ESQ} ${FIO_CIMA}`}
            type="date"
            value={data.dataEntrega}
            editable={editable}
            onChange={(v) => set("dataEntrega", v)}
          />
        </div>

        {/* ---------------- 2. Anexos do modelo ---------------- */}
        <SectionBar numero="2" className="mt-2.5">
          Anexos do modelo
        </SectionBar>
        <div className={`grid min-h-[105mm] flex-1 grid-cols-2 ${CAIXA} border-t-0`}>
          <AnexoBox
            titulo="Modelo frente"
            anexo={data.modeloFrente}
            editable={editable}
            onChange={(url) => set("modeloFrente", { url, alt: "Modelo frente" })}
          />
          <AnexoBox
            className="border-l border-black"
            titulo="Modelo costa"
            anexo={data.modeloCosta}
            editable={editable}
            onChange={(url) => set("modeloCosta", { url, alt: "Modelo costa" })}
          />
        </div>

        {/* ------- 3. Moldes e especificações  |  4. Tecidos ------- */}
        <div className="mt-2.5 grid grid-cols-2 gap-x-2">
          <SectionBar numero="3">Moldes e especificações</SectionBar>
          <SectionBar numero="4">Tecidos</SectionBar>

          <div className={`${CAIXA} border-t-0`}>
            <Field label="Molde camisa" value={data.moldeCamisa} editable={editable} onChange={(v) => set("moldeCamisa", v)} />
            <Field label="Molde short" className={FIO_CIMA} value={data.moldeShort} editable={editable} onChange={(v) => set("moldeShort", v)} />
          </div>

          <div className={`${CAIXA} border-t-0`}>
            <Field label="Tecido camisa" value={data.tecidoCamisa} editable={editable} onChange={(v) => set("tecidoCamisa", v)} />
            <Field label="Tecido short" className={FIO_CIMA} value={data.tecidoShort} editable={editable} onChange={(v) => set("tecidoShort", v)} />
          </div>
        </div>

        {/* ---------------- 5. Grades / 6. Observações ---------------- */}
        <SectionBar numero="5" className="mt-2.5">
          Grades de tamanhos e quantidades
        </SectionBar>

        <div className="mt-1.5 flex items-stretch gap-2">
          <GradeTable
            className="w-[23%]"
            titulo={rotuloGrade1}
            tamanhos={tamanhos}
            grade={data.gradeCamisas}
            editable={editable}
            onChange={(tam, v) => setGrade("gradeCamisas", tam, v)}
          />
          <GradeTable
            className="w-[23%]"
            titulo={rotuloGrade2}
            tamanhos={tamanhos}
            grade={data.gradeShorts}
            editable={editable}
            onChange={(tam, v) => setGrade("gradeShorts", tam, v)}
          />

          {/* 6. Observações — ao lado das grades, e não embaixo: é o bloco que
              mais recebe caneta, e o que sobra de altura na folha é dele. */}
          <div className={`flex flex-1 flex-col ${CAIXA}`}>
            <div
              className="flex items-center gap-2 border-b border-black bg-black px-2 py-[3.5px] text-white print:bg-black print:text-white"
              style={FUNDO_IMPRESSO}
            >
              <span className="grid h-[14px] min-w-[14px] place-items-center border border-white/80 px-[3px] text-[8px] font-bold leading-none">
                6
              </span>
              <span className="text-[10.5px] font-bold uppercase leading-none tracking-[0.16em]">
                Obs. gerais e pós-produção
              </span>
            </div>

            <div className="flex flex-1 flex-col p-2">
              {editable ? (
                <textarea
                  value={data.observacoes ?? ""}
                  onChange={(e) => set("observacoes", e.target.value)}
                  placeholder="Ajustes, prazos combinados, o que conferir na entrega…"
                  className={`h-full min-h-[70mm] w-full resize-none border-0 bg-transparent p-0 text-[11px] leading-[2] placeholder:text-neutral-300 ${FOCO}`}
                />
              ) : data.observacoes ? (
                <p className="whitespace-pre-wrap text-[11px] leading-[2]">{data.observacoes}</p>
              ) : (
                /* Pauta: o bloco existe para receber caneta, e linha guia é o
                   que faz a letra sair reta na bancada. Cinza, não preta — a
                   pauta é apoio, não conteúdo, e em preto ela competia com o
                   que fosse escrito por cima. */
                <div className="flex flex-1 flex-col justify-between gap-[3px] py-1">
                  {Array.from({ length: linhasObservacoes }).map((_, i) => (
                    <span key={i} className="block border-b border-neutral-300" />
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
