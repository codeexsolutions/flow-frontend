import type { LegacyRef } from "react";

import type { ItemProducao } from "@/features/producao/services/producao.service";
import OrdemServico from "@/features/producao/components/OrdemServico";
import FichaTecnicaProducao, { criarFichaVazia, type FichaTecnicaData } from "@/features/producao/modelos/FichaTecnicaProducao";

/**
 * OS MODELOS DE ORDEM DE SERVIÇO — o catálogo do lado do sistema.
 *
 * ---------------------------------------------------------------------------
 * Por que o modelo é CÓDIGO, e o catálogo é dado
 * ---------------------------------------------------------------------------
 * Uma ficha técnica de camisaria tem grade de tamanhos, moldes, tecidos e duas
 * áreas de anexo. Uma OS de gráfica teria outra coisa inteira. Isso não é
 * configuração — é layout, e layout se escreve, não se cadastra: tentar montar
 * essa folha a partir de colunas genéricas daria um formulário que não se
 * parece com o papel que a oficina usa hoje, que é justamente o ponto.
 *
 * Então o COMPONENTE mora aqui, versionado, e o painel controla apenas UMA
 * coisa: quais chaves cada empresa pode adotar. É o mesmo mecanismo do
 * catálogo de planilhas (`planilha_catalogo`) — o painel publica, a empresa
 * escolhe —, e pela mesma razão: modelo que aparece para todo mundo vira uma
 * lista que ninguém lê, e modelo que ninguém libera não existe.
 *
 * ---------------------------------------------------------------------------
 * Acrescentar um modelo novo
 * ---------------------------------------------------------------------------
 *   1. escreva o componente em `modelos/`;
 *   2. registre a chave aqui, com o `de()` que traduz a ordem para os dados
 *      que ele espera;
 *   3. cadastre a mesma chave no painel (Modelos de OS).
 *
 * A chave tem de bater nos três lugares. Sem o passo 3 o modelo não aparece
 * para ninguém; sem o passo 2 a chave do painel não encontra componente e a
 * empresa cai no documento padrão — que é o desfecho certo para "o painel
 * conhece um modelo que esta versão do sistema ainda não tem".
 */

/** A chave que viaja entre painel, banco e sistema. */
export type ChaveModeloOS = "PADRAO" | "FICHA_TECNICA_PRODUCAO";

type Props = {
  ordem: ItemProducao;
  refDoc?: LegacyRef<HTMLDivElement>;
};

/** `YYYY-MM-DD` — o formato que a ficha entende como data. */
const dia = (iso?: string | null): string => (iso ? String(iso).slice(0, 10) : "");

/**
 * A ordem traduzida para a ficha técnica.
 *
 * Preenche SÓ o que o sistema sabe de verdade. Moldes, tecidos e as grades
 * saem em branco de propósito: são decididos na bancada, com a peça na mão, e
 * o papel existe para receber isso a caneta. Inventar um "M: 10" a partir da
 * quantidade da venda seria escrever no lugar de quem corta.
 */
const daOrdemParaFicha = (o: ItemProducao): FichaTecnicaData => ({
  osNumero: o.codigo,
  cliente: o.cliente_nome ?? "",
  contato: "",
  dataFechamento: dia(o.criado_em),
  dataEntrega: dia(o.prazo),
  observacoes: "",
});

type PropsEdicao = {
  ordem: ItemProducao;
  dados: Record<string, unknown>;
  onChange: (dados: Record<string, unknown>) => void;
};

export type ModeloOS = {
  chave: ChaveModeloOS;
  nome: string;
  descricao: string;
  /** A folha pronta, para ver e imprimir. */
  Documento: (props: Props) => JSX.Element;
  /**
   * A MESMA folha, para preencher na tela.
   *
   * `undefined` quando o modelo não tem o que preencher — é o caso do
   * documento simples, que só mostra o que a ordem já sabe. A tela usa a
   * ausência para decidir se abre a ficha ou não.
   */
  Edicao?: (props: PropsEdicao) => JSX.Element;
  /** O que uma ficha em branco deste modelo contém. */
  vazio?: () => Record<string, unknown>;
};

export const MODELOS_OS: Record<ChaveModeloOS, ModeloOS> = {
  PADRAO: {
    chave: "PADRAO",
    nome: "Ordem de serviço simples",
    descricao: "Cliente, etapa, responsável, prazo e o que produzir. Serve a qualquer ramo.",
    Documento: ({ ordem, refDoc }) => <OrdemServico ordem={ordem} refDoc={refDoc} />,
  },

  FICHA_TECNICA_PRODUCAO: {
    chave: "FICHA_TECNICA_PRODUCAO",
    nome: "Ficha técnica de produção",
    descricao: "Camisaria: anexos de frente e costa, moldes, tecidos e as grades de tamanho.",
    /*
     * O que a ORDEM sabe entra sempre; o que a BANCADA escreveu vem por cima.
     *
     * Nesta ordem, e não na inversa: cliente e prazo mudam na venda e na
     * ordem, e a ficha precisa refletir a mudança em vez de congelar o valor
     * do dia em que foi aberta. Já moldes, tecidos e grades só existem aqui —
     * ninguém os sobrescreve.
     */
    Documento: ({ ordem, refDoc }) => (
      <FichaTecnicaProducao
        ref={refDoc as never}
        data={{ ...daOrdemParaFicha(ordem), ...((ordem.os_dados ?? {}) as FichaTecnicaData) }}
      />
    ),

    Edicao: ({ ordem, dados, onChange }) => (
      <FichaTecnicaProducao
        editable
        a4={false}
        data={{ ...daOrdemParaFicha(ordem), ...(dados as FichaTecnicaData) }}
        onChange={(d) => onChange(d as Record<string, unknown>)}
      />
    ),

    vazio: () => criarFichaVazia() as Record<string, unknown>,
  },
};

/**
 * O modelo de uma chave — com o PADRÃO como rede.
 *
 * Chave desconhecida cai no padrão em vez de quebrar: é o que acontece quando
 * o painel libera um modelo que esta versão do sistema ainda não tem, e a
 * resposta certa para isso é um documento simples, não uma tela em branco.
 */
export const modeloOS = (chave?: string | null): ModeloOS =>
  MODELOS_OS[(chave ?? "PADRAO") as ChaveModeloOS] ?? MODELOS_OS.PADRAO;
