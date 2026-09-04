import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Plus, Trash2, Loader2, Layers, PackageX, Pencil, Wand2, Boxes, Package,
  ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, History, Sliders,
} from "lucide-react";

import { MOVIMENTO_LABEL, type Atributo, type Movimento, type Variacao, type VariacaoInput } from "@/shared/domain/estoque";
import EstoqueService from "@/features/estoque/services/estoque.service";
import ProductService from "@/features/estoque/services/product.service";
import { Modal } from "@/shared/ui/Modal";
import { AbasTabela } from "@/shared/ui/AbasTabela";
import { Form, FormGrid, TextField, TextArea, CurrencyField, FormActions, SwitchField } from "@/shared/ui/form/FormKit";
import UploadImagem from "@/shared/ui/UploadImagem";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateTime } from "@/shared/utils/date";
import { formatNumber } from "@/shared/utils/format";

/**
 * O estoque do item: o que existe, e por que existe essa quantidade.
 *
 * ---------------------------------------------------------------------------
 * Por que variações e movimentações são UM painel
 * ---------------------------------------------------------------------------
 * Eram dois cartões, e a divisão entre eles não correspondia a nada que quem
 * usa precise separar. Os dois respondem à MESMA pergunta — "quantas eu tenho
 * da azul M?" e "por que só três?" — e estavam em cartões diferentes, cada um
 * com sua lista, obrigando a ir e voltar para conferir um número contra a
 * linha do extrato que o explica.
 *
 * Pior: o estoque estava nos dois e não se editava em nenhum. A quantidade
 * aparecia na linha da variação mas o campo vinha desabilitado ("use
 * entrada/saída"), e a entrada/saída morava no outro cartão, atrás de um
 * seletor onde era preciso reencontrar a variação que já estava à vista.
 *
 * Aqui a lista é uma só, e a edição da linha muda o que ela mostra —
 * inclusive a quantidade.
 *
 * ---------------------------------------------------------------------------
 * Duas tabelas, uma de cada vez
 * ---------------------------------------------------------------------------
 * O que existe e o que aconteceu são duas TABELAS, com colunas diferentes, e
 * empilhá-las no mesmo cartão só trocava o problema de lugar: um produto com
 * 20 variações e 200 lançamentos vira um cartão de dois metros, em que achar
 * o extrato exige rolar por toda a grade de tamanhos.
 *
 * Empilhadas elas competiam; em abas elas se revezam no mesmo espaço, e o
 * espaço passa a ser o do cartão inteiro. A troca é de um clique e o contexto
 * — o total, os botões de entrada e saída — fica no cabeçalho, acima das
 * duas.
 *
 * ---------------------------------------------------------------------------
 * Sem variação, a linha é o PRÓPRIO item
 * ---------------------------------------------------------------------------
 * A maioria dos cadastros não tem variação nenhuma, e para eles o painel
 * antigo dizia "Nenhuma variação" — uma lista vazia no lugar exato onde
 * deveria estar o número que a pessoa veio ver. O item sem variação conta como
 * ele mesmo: uma linha, com a quantidade dele, editável do mesmo jeito.
 *
 * ---------------------------------------------------------------------------
 * Editar a quantidade não fura o extrato
 * ---------------------------------------------------------------------------
 * O saldo continua sendo a única coluna que ninguém escreve à mão: o que a
 * edição faz é lançar uma CONTAGEM (AJUSTE) com o total informado, e a
 * diferença é calculada no banco, no instante da gravação, sobre o saldo real
 * (ver `EstoqueRepository.SalvarVariacao` e `Movimentar`). O resultado na tela
 * é o que se espera — digitou 47, ficou 47 — e o extrato ganha a linha que
 * explica de onde veio o número novo.
 */

type Props = {
  produtoId: string;
  produtoNome: string;
  /** Foto do produto — a linha do item usa a dele quando não há variação. */
  imagemProduto?: string;
  /** un, kg, m… mostrado ao lado do total. */
  unidade?: string;
  valorVendaProduto: number;
  /** Saldo do próprio produto: é o que vale quando não há variação. */
  quantidadeProduto: number;
  estoqueMinimoProduto: number | null;
  variacoes: Variacao[];
  atributos: Atributo[];
  movimentos: Movimento[];
  /** `false` para serviço e item sob encomenda: não há unidade para mexer. */
  podeMovimentar: boolean;
  /**
   * `false` para insumo.
   *
   * Material de produção não se desdobra em tamanho e cor — quem trabalha com
   * dois tecidos cadastra dois insumos. Oferecer "gerar todas as combinações"
   * numa bobina seria uma porta que só produz cadastro errado.
   */
  permiteVariacoes: boolean;
  /**
   * Abre o cadastro de atributos. Ausente = o botão não aparece.
   *
   * Atributo é o EIXO da variação ("Tamanho", "Cor"), e sem ao menos um
   * cadastrado não há variação possível. O botão fica aqui, e não numa barra
   * no topo da página, porque é daqui que se descobre que ele falta: a lista
   * vazia diz "cadastre antes um atributo" e a resposta está na mesma linha.
   */
  onAbrirAtributos?: () => void;
  onMudou: () => Promise<void> | void;
};

/**
 * ============================================================================
 * ESTOQUE DO PRODUTO — 1.020 linhas. Leia este mapa.
 * ============================================================================
 *
 * O painel que fica dentro da ficha do produto. Duas abas sobre o mesmo item:
 *
 *   • ITENS — as variações (P, M, G / cores) e o saldo de cada uma. Produto
 *     sem variação mostra o saldo dele mesmo;
 *   • MOVIMENTAÇÕES — o extrato: toda entrada, saída, ajuste, venda e
 *     devolução, com o saldo depois de cada uma.
 *
 * ----------------------------------------------------------------------------
 * A REGRA QUE EXPLICA METADE DO ARQUIVO
 * ----------------------------------------------------------------------------
 * **Produto com variação não tem estoque próprio.** O saldo é de cada peça, e
 * `produtos.quantidade` é mantido por um gatilho no banco, como a soma das
 * variações ativas. Por isso a movimentação exige escolher a variação quando
 * elas existem: sem isso o lançamento cairia no produto pai e seria
 * sobrescrito pelo gatilho na primeira mudança de qualquer variação — o ajuste
 * "sumiria" sozinho e ninguém saberia por quê.
 *
 * ----------------------------------------------------------------------------
 * COMO O ARQUIVO ESTÁ DIVIDIDO
 * ----------------------------------------------------------------------------
 * Procure pelos separadores `── Nome ──`:
 *
 *   1. VARIAÇÃO EM EDIÇÃO (aqui) — o rascunho de uma variação e o vazio dela.
 *   2. MOVIMENTAÇÃO (~140) — os tipos de lançamento (`ACOES`) e as cores.
 *   3. VARIAÇÕES (~199) — criar, editar, gerar combinações, excluir.
 *   4. MOVIMENTAÇÃO (~330) — lançar entrada, saída e ajuste, e APAGAR um
 *      lançamento (o que desfaz o saldo dele).
 *   5. O ITEM SEM VARIAÇÃO (~431) — o saldo do produto simples.
 *   6. RENDER (~484) — as duas abas.
 *
 * ----------------------------------------------------------------------------
 * APAGAR LANÇAMENTO DESFAZ O SALDO
 * ----------------------------------------------------------------------------
 * A lixeira só aparece em ENTRADA, SAIDA e AJUSTE — o que foi lançado à mão.
 * Movimento de VENDA, CONSUMO e CANCELAMENTO não tem lixeira: apagá-lo
 * devolveria mercadoria ao saldo sem tocar na venda que a tirou. Esses se
 * desfazem cancelando a nota. O servidor recusa igual, se alguém chamar por
 * fora.
 *
 * Os números de linha envelhecem; os separadores, não.
 */

/* ── Variação em edição ───────────────────────────────────────────────────── */

type Rascunho = {
  id?: string;
  /** atributoId → valorId. */
  escolhas: Record<string, string>;
  quantidade: string;
  valorVenda: number | null;
  valorCompra: number | null;
  sku: string;
  codigoBarras: string;
  imagem: string;
  estoqueMinimo: string;
  ativo: boolean;
};

const VAZIO: Rascunho = {
  escolhas: {},
  quantidade: "0",
  valorVenda: null,
  valorCompra: null,
  sku: "",
  codigoBarras: "",
  imagem: "",
  estoqueMinimo: "",
  ativo: true,
};

/** `""` → `null`, e não `0`: vazio herda do produto; zero é um preço válido. */
const numeroOuNulo = (texto: string): number | null => (texto.trim() === "" ? null : Number(texto) || 0);

/* ── Movimentação ─────────────────────────────────────────────────────────── */

type TipoMov = "ENTRADA" | "SAIDA" | "AJUSTE";

const ACOES: { tipo: TipoMov; label: string; icone: typeof ArrowDownToLine; ajuda: string; tom: string }[] = [
  { tipo: "ENTRADA", label: "Entrada", icone: ArrowDownToLine, ajuda: "Chegou mercadoria: compra, devolução de cliente, produção.", tom: "text-success" },
  { tipo: "SAIDA", label: "Saída", icone: ArrowUpFromLine, ajuda: "Saiu sem venda: perda, quebra, brinde, uso interno.", tom: "text-danger" },
  { tipo: "AJUSTE", label: "Contagem", icone: ClipboardCheck, ajuda: "Você contou a prateleira. Informe o total encontrado.", tom: "text-warning" },
];

const TOM_CLASSE = {
  entrada: "text-success",
  saida: "text-danger",
  neutro: "text-mist",
} as const;

/* -------------------------------------------------------------------------- */

const EstoquePainel = ({
  produtoId, produtoNome, imagemProduto, unidade, valorVendaProduto,
  quantidadeProduto, estoqueMinimoProduto, variacoes, atributos, movimentos,
  podeMovimentar, permiteVariacoes, onAbrirAtributos, onMudou,
}: Props) => {
  const alert = useAlert();
  const reduzir = useReducedMotion();

  /* Abre no que existe, não no que aconteceu: quem entra na ficha vem
     perguntar "quantas eu tenho", e o extrato é a resposta do "por quê" que
     só se procura depois de estranhar o número. */
  const [aba, setAba] = useState<"itens" | "movimentos">("itens");
  const [apagandoMov, setApagandoMov] = useState<string | null>(null);

  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [movimento, setMovimento] = useState<TipoMov | null>(null);
  const [editandoItem, setEditandoItem] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);

  /* Campos da movimentação — fora do `rascunho` porque são outro formulário. */
  const [quantidadeMov, setQuantidadeMov] = useState("");
  const [variacaoMov, setVariacaoMov] = useState("");
  const [motivoMov, setMotivoMov] = useState("");
  const [custoMov, setCustoMov] = useState(0);

  /* Campos da edição do item sem variação. */
  const [quantidadeItem, setQuantidadeItem] = useState("0");
  const [minimoItem, setMinimoItem] = useState("");

  /* Só atributos COM valores entram no formulário: um atributo vazio ocuparia
     uma linha inteira oferecendo apenas "Selecione". */
  const utilizaveis = useMemo(() => atributos.filter((a) => a.valores.length > 0), [atributos]);

  const ativas = variacoes.filter((v) => v.ativo);
  const temVariacoes = variacoes.length > 0;

  const total = temVariacoes
    ? ativas.reduce((soma, v) => soma + (Number(v.quantidade) || 0), 0)
    : Number(quantidadeProduto) || 0;

  /* ── Variações ──────────────────────────────────────────────────────────── */

  const abrirNova = () => setRascunho(VAZIO);

  const abrirEdicao = (variacao: Variacao) => setRascunho({
    id: variacao.id,
    escolhas: Object.fromEntries(variacao.valores.map((v) => [v.atributoId, v.valorId])),
    quantidade: String(Number(variacao.quantidade) || 0),
    valorVenda: variacao.valorVenda ?? null,
    valorCompra: variacao.valorCompra ?? null,
    sku: variacao.sku ?? "",
    codigoBarras: variacao.codigoBarras ?? "",
    imagem: variacao.imagem ?? "",
    estoqueMinimo: variacao.estoqueMinimo == null ? "" : String(variacao.estoqueMinimo),
    ativo: variacao.ativo,
  });

  const salvarVariacao = async () => {
    if (!rascunho) return;

    const payload: VariacaoInput = {
      id: rascunho.id,
      valores: Object.entries(rascunho.escolhas)
        .filter(([, valorId]) => Boolean(valorId))
        .map(([atributoId, valorId]) => ({ atributoId, valorId })),
      quantidade: Number(rascunho.quantidade) || 0,
      valorVenda: rascunho.valorVenda,
      valorCompra: rascunho.valorCompra,
      sku: rascunho.sku.trim() || null,
      codigoBarras: rascunho.codigoBarras.trim() || null,
      imagem: rascunho.imagem.trim() || null,
      estoqueMinimo: numeroOuNulo(rascunho.estoqueMinimo),
      ativo: rascunho.ativo,
    };

    if (payload.valores.length === 0) {
      alert.error("Falta o essencial", "Escolha ao menos um valor (tamanho, cor…) para identificar esta variação.");
      return;
    }

    setSalvando(true);
    try {
      await EstoqueService.salvarVariacao(produtoId, payload);
      await onMudou();
      setRascunho(null);
      alert.success("Variação salva!", "");
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível salvar a variação."));
    } finally {
      setSalvando(false);
    }
  };

  const excluirVariacao = async (variacao: Variacao) => {
    const { confirmed } = await alert.confirm(
      `Remover ${variacao.descricao || "esta variação"}?`,
      "O estoque dela sai do total do produto.",
      { type: "warning", confirmText: "Remover" },
    );

    if (!confirmed) return;

    try {
      /* A frase vem do servidor: só ele sabe se a variação sumiu ou apenas
         saiu do estoque por já estar em pedidos. */
      const mensagem = await EstoqueService.excluirVariacao(variacao.id);
      await onMudou();
      alert.success("Pronto!", mensagem);
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível remover."));
    }
  };

  /**
   * Cria todas as combinações que ainda não existem.
   *
   * 5 tamanhos × 4 cores são 20 variações. Cadastradas uma a uma, são 20
   * aberturas de modal para uma tarefa mecânica — e é onde a pessoa desiste do
   * recurso. As que já existem são puladas, então rodar de novo depois de
   * acrescentar uma cor cria só as 5 novas.
   */
  const gerarCombinacoes = async () => {
    if (utilizaveis.length === 0) return;

    const combinacoes = utilizaveis.reduce<Record<string, string>[]>(
      (acc, atributo) => acc.flatMap((parcial) => atributo.valores.map((v) => ({ ...parcial, [atributo.id]: v.id }))),
      [{}],
    );

    /* Assinatura ordenada: a MESMA combinação em ordem diferente tem de bater
       com a existente, senão a geração recria tudo o que já existe e o
       servidor recusa uma por uma. */
    const assinatura = (escolhas: Record<string, string>) => Object.values(escolhas).sort().join("|");
    const existentes = new Set(variacoes.map((v) => v.valores.map((x) => x.valorId).sort().join("|")));

    const novas = combinacoes.filter((c) => !existentes.has(assinatura(c)));

    if (novas.length === 0) {
      alert.info("Nada a criar", "Todas as combinações já existem.");
      return;
    }

    const { confirmed } = await alert.confirm(
      `Criar ${novas.length} ${novas.length === 1 ? "variação" : "variações"}?`,
      "Todas nascem zeradas — a quantidade você lança depois pela contagem ou pela entrada.",
    );

    if (!confirmed) return;

    setGerando(true);
    try {
      for (const escolhas of novas) {
        await EstoqueService.salvarVariacao(produtoId, {
          valores: Object.entries(escolhas).map(([atributoId, valorId]) => ({ atributoId, valorId })),
          quantidade: 0,
          ativo: true,
        });
      }

      await onMudou();
      alert.success("Pronto!", `${novas.length} ${novas.length === 1 ? "variação criada" : "variações criadas"}.`);
    } catch (err) {
      /* Recarrega mesmo com erro: as que passaram antes da falha já existem, e
         a tela não pode continuar mostrando a lista de antes. */
      await onMudou();
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Algumas variações não foram criadas."));
    } finally {
      setGerando(false);
    }
  };

  /* ── Movimentação ───────────────────────────────────────────────────────── */

  const abrirMovimento = (tipo: TipoMov) => {
    setQuantidadeMov("");
    setMotivoMov("");
    setCustoMov(0);
    /* Com uma variação só, ela já vem escolhida: obrigar a selecionar o único
       item possível é um passo que não decide nada. */
    setVariacaoMov(ativas.length === 1 ? ativas[0].id : "");
    setMovimento(tipo);
  };

  const salvarMovimento = async () => {
    if (!movimento) return;

    const quanto = Number(quantidadeMov);

    if (!Number.isFinite(quanto) || quanto < 0) {
      alert.error("Quantidade inválida", "Informe um número.");
      return;
    }

    if (movimento !== "AJUSTE" && quanto === 0) {
      alert.error("Quantidade zerada", "Informe quanto entrou ou saiu.");
      return;
    }

    /* Produto com variações não tem estoque próprio — o saldo é das peças. Sem
       esta trava, o movimento cairia no produto pai e seria sobrescrito na
       primeira mudança de qualquer variação, pelo gatilho que recalcula a
       soma: o ajuste "sumiria" sozinho e ninguém saberia por quê. */
    if (ativas.length > 0 && !variacaoMov) {
      alert.error("Escolha a variação", "Este produto tem variações — o estoque é de cada uma, não do produto inteiro.");
      return;
    }

    setSalvando(true);
    try {
      await EstoqueService.movimentar({
        produtoId,
        variacaoId: variacaoMov || null,
        tipo: movimento,
        quantidade: quanto,
        motivo: motivoMov.trim() || undefined,
        custoUnitario: movimento === "ENTRADA" && custoMov > 0 ? custoMov : null,
      });

      await onMudou();
      setMovimento(null);

      /*
       * Depois de lançar, a tela vai para o extrato.
       *
       * Quem acabou de dar baixa quer ver a baixa: conferir a quantidade, o
       * saldo que ficou e — se errou — apagar ali mesmo. Ficando na aba de
       * itens, a pessoa via só o número do saldo mudar e tinha de procurar a
       * aba para conferir o que foi lançado.
       */
      setAba("movimentos");

      alert.success("Estoque atualizado!", "");
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível movimentar o estoque."));
    } finally {
      setSalvando(false);
    }
  };

  /**
   * Apaga um lançamento e desfaz o saldo dele.
   *
   * A confirmação diz o que vai acontecer com o SALDO, não só que a linha
   * some: apagar uma entrada de 50 tira 50 do estoque, e quem clica precisa
   * saber disso antes — é o efeito que importa, não a linha.
   */
  const apagarMovimento = async (mov: Movimento) => {
    const quanto = Number(mov.quantidade) || 0;
    const efeito = quanto > 0 ? `sairão ${formatNumber(quanto)}` : `voltarão ${formatNumber(Math.abs(quanto))}`;

    const { confirmed } = await alert.confirm(
      "Apagar este lançamento?",
      `O lançamento sai do extrato e o saldo é desfeito: ${efeito} do estoque.`,
    );

    if (!confirmed) return;

    setApagandoMov(mov.id);

    try {
      await EstoqueService.excluirMovimento(mov.id);

      await onMudou();

      alert.toast("success", "Lançamento apagado", "O saldo foi desfeito.", { position: "bottom-right", timer: 3000 });
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível apagar a movimentação."));
    } finally {
      setApagandoMov(null);
    }
  };

  /* ── O item sem variação ────────────────────────────────────────────────── */

  const abrirEdicaoItem = () => {
    setQuantidadeItem(String(Number(quantidadeProduto) || 0));
    setMinimoItem(estoqueMinimoProduto == null ? "" : String(estoqueMinimoProduto));
    setEditandoItem(true);
  };

  /**
   * Salva o estoque do item que não tem variação.
   *
   * São dois destinos diferentes, e é por isso que são duas chamadas: o aviso
   * de estoque baixo é um CAMPO do produto e se grava direto; a quantidade é
   * SALDO e só muda por movimento. Mandar a quantidade junto no `update` do
   * produto a escreveria por fora do extrato — a única porta que este painel
   * existe para fechar.
   */
  const salvarItem = async () => {
    const quanto = Number(quantidadeItem);

    if (!Number.isFinite(quanto) || quanto < 0) {
      alert.error("Quantidade inválida", "Informe um número.");
      return;
    }

    setSalvando(true);
    try {
      const minimo = minimoItem.trim() === "" ? null : Number(minimoItem);

      if (minimo !== (estoqueMinimoProduto ?? null))
        await ProductService.update({ id: produtoId, estoqueMinimo: minimo });

      /* Igual ao que já está gravado não vira movimento: quem só mexeu no
         aviso não pode ganhar uma linha de ajuste de zero no extrato. */
      if (quanto !== (Number(quantidadeProduto) || 0))
        await EstoqueService.movimentar({
          produtoId,
          variacaoId: null,
          tipo: "AJUSTE",
          quantidade: quanto,
          motivo: "Quantidade corrigida na edição do item",
        });

      await onMudou();
      setEditandoItem(false);
      alert.success("Estoque atualizado!", "");
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível salvar o estoque."));
    } finally {
      setSalvando(false);
    }
  };

  /* ── Render ─────────────────────────────────────────────────────────────── */

  const acao = ACOES.find((a) => a.tipo === movimento);

  const resumo = !podeMovimentar
    ? "Este item não conta unidades"
    : temVariacoes
      ? `${formatNumber(variacoes.length)} ${variacoes.length === 1 ? "variação" : "variações"} · ${formatNumber(total)} ${unidade || "un"}. no total`
      : `${formatNumber(total)} ${unidade || "un"}. — item sem variação`;

  /*
   * `min-h-0 flex-1` da raiz até a lista.
   *
   * O painel mora numa coluna que estica até o fim do outlet (ver a nota do
   * arranjo em `ProdutoDetailPage`), e é ele quem recebe a sobra de altura.
   * Para a sobra virar LISTA ROLÁVEL em vez de cartão esticado com o conteúdo
   * grudado no topo, cada nível entre o cartão e a lista precisa dizer duas
   * coisas: "estico" (`flex-1`) e "posso ser menor que meu conteúdo"
   * (`min-h-0`). Sem o segundo, o flex adota a altura do conteúdo como mínimo,
   * o `overflow` interno nunca entra em ação e quem rola é a página.
   */
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-fg/[0.07] px-5 py-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/[0.14] text-accent-soft ring-1 ring-inset ring-accent/20">
          <Boxes className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] text-ink">Estoque</h2>
          <p className="text-[11px] text-faint">{resumo}</p>
        </div>

        {/*
         * Cada aba traz os botões QUE AGEM SOBRE ELA.
         *
         * Entrada, saída e contagem produzem linha de extrato — pertencem à
         * aba de movimentações. Criar variação e gerar combinações mexem na
         * lista de peças — pertencem à outra. Juntos no cabeçalho eram seis
         * botões sempre visíveis, metade deles sem efeito no que estava à
         * vista, e a fileira quebrava em duas linhas em qualquer tela menor
         * que 1280 px.
         */}
        {aba === "movimentos" && podeMovimentar && ACOES.map(({ tipo, label, icone: Icone, tom }) => (
          <button
            key={tipo}
            type="button"
            onClick={() => abrirMovimento(tipo)}
            className={`focus-ring inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-fg/[0.1] px-2.5 py-1.5 text-[12px] transition-colors hover:bg-fg/[0.05] ${tom}`}
          >
            <Icone size={13} /> {label}
          </button>
        ))}

        {aba === "itens" && permiteVariacoes && (
          <>
            {/* Sem atributo cadastrado não existe variação possível, e é a
                aba de itens que diz isso na lista vazia. O botão fica ao lado
                da frase que o pede. */}
            {onAbrirAtributos && (
              <button
                type="button"
                onClick={onAbrirAtributos}
                title="Cadastrar tamanhos, cores e outros eixos de variação"
                className="focus-ring inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-fg/[0.1] px-2.5 py-1.5 text-[12px] text-mist transition-colors hover:text-ink"
              >
                <Sliders size={13} /> Atributos
              </button>
            )}

            {utilizaveis.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => void gerarCombinacoes()}
                  disabled={gerando}
                  title="Cria de uma vez todas as combinações que faltam"
                  className="focus-ring inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-fg/[0.1] px-2.5 py-1.5 text-[12px] text-mist transition-colors hover:text-ink disabled:opacity-50"
                >
                  {gerando ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} Gerar todas
                </button>

                <button
                  type="button"
                  onClick={abrirNova}
                  title="Nova variação"
                  className="focus-ring inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-[12px] text-white transition-all hover:brightness-110"
                >
                  <Plus size={13} /> Variação
                </button>
              </>
            )}
          </>
        )}
      </div>

      {/*
       * A navegação entre as duas tabelas.
       *
       * A pílula do destaque é UM elemento que se move, e não um fundo que
       * acende e apaga em cada botão — o mesmo `layoutId` das abas do
       * formulário de produto e da configuração de ponto. O olho segue para
       * onde ela foi em vez de procurar o que mudou.
       */}
      <div className="flex shrink-0 items-center gap-0.5 border-b border-fg/[0.07] px-3 py-2">
        <AbasTabela
          grupo="aba-estoque-painel"
          valor={aba}
          onValor={setAba}
          abas={[
            { id: "itens", label: temVariacoes ? "Variações" : "Item", icone: <Layers size={13} />, contagem: temVariacoes ? variacoes.length : 1 },
            { id: "movimentos", label: "Movimentações", icone: <History size={13} />, contagem: movimentos.length },
          ]}
        />
      </div>

      {/* ---------- A lista: as variações, ou o próprio item ---------- */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={aba}
          initial={reduzir ? undefined : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduzir ? undefined : { opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="flex min-h-0 flex-1 flex-col"
        >
        {aba === "itens" ? (
        <>
          <div className="flex min-h-0 flex-1 flex-col divide-y divide-fg/[0.05] overflow-y-auto">
            {temVariacoes ? (
              variacoes.map((variacao) => (
                <div key={variacao.id} className={`flex items-center gap-3 px-5 py-2.5 ${variacao.ativo ? "" : "opacity-50"}`}>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-fg/[0.08] bg-fg/[0.03]">
                    {variacao.imagem ? (
                      <img src={variacao.imagem} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Layers className="h-4 w-4 text-muted" />
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {variacao.valores.map((valor) => (
                        <span key={valor.valorId} className="inline-flex items-center gap-1 rounded bg-fg/[0.06] px-1.5 py-px text-[11px] text-mist">
                          {valor.corHex && <span aria-hidden className="h-2.5 w-2.5 rounded-full border border-fg/[0.2]" style={{ background: valor.corHex }} />}
                          {valor.valor}
                        </span>
                      ))}
                      {!variacao.ativo && <span className="rounded bg-danger/[0.12] px-1.5 py-px text-[10px] text-danger">inativa</span>}
                    </span>
                    <span className="truncate text-[10.5px] text-faint">{variacao.sku || "sem SKU"}</span>
                  </div>

                  <span className="shrink-0 text-right text-[12px] tabular-nums text-mist">
                    {formatCurrency(variacao.valorVendaEfetivo ?? valorVendaProduto)}
                    {variacao.valorVenda == null && <span className="ml-1 text-[10px] text-faint">herda</span>}
                  </span>

                  <span className={`w-[70px] shrink-0 text-right text-[12.5px] tabular-nums ${Number(variacao.quantidade) <= 0 ? "text-danger" : "text-ink"}`}>
                    {formatNumber(Number(variacao.quantidade) || 0)}
                  </span>

                  <button type="button" onClick={() => abrirEdicao(variacao)} title="Editar tudo desta variação" className="focus-ring shrink-0 cursor-pointer rounded-md p-1.5 text-muted transition-colors hover:text-ink">
                    <Pencil size={13} />
                  </button>
                  <button type="button" onClick={() => void excluirVariacao(variacao)} title="Remover" className="focus-ring shrink-0 cursor-pointer rounded-md p-1.5 text-muted transition-colors hover:text-danger">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            ) : (
              /* Sem variação, o item conta como ele mesmo — uma linha, com a mesma
                 forma das outras, para o olho não ter de aprender dois formatos. */
              <div className="flex items-center gap-3 px-5 py-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-fg/[0.08] bg-fg/[0.03]">
                  {imagemProduto ? (
                    <img src={imagemProduto} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Package className="h-4 w-4 text-muted" />
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[12.5px] text-ink">{produtoNome}</span>
                  <span className="truncate text-[10.5px] text-faint">
                    {podeMovimentar ? "Item único — sem variações" : "Não conta unidades"}
                  </span>
                </div>

                <span className="shrink-0 text-right text-[12px] tabular-nums text-mist">{formatCurrency(valorVendaProduto)}</span>

                <span className={`w-[70px] shrink-0 text-right text-[12.5px] tabular-nums ${podeMovimentar && total <= 0 ? "text-danger" : "text-ink"}`}>
                  {podeMovimentar ? formatNumber(total) : "—"}
                </span>

                {podeMovimentar && (
                  <button type="button" onClick={abrirEdicaoItem} title="Corrigir a quantidade e o aviso de estoque baixo" className="focus-ring shrink-0 cursor-pointer rounded-md p-1.5 text-muted transition-colors hover:text-ink">
                    <Pencil size={13} />
                  </button>
                )}
              </div>
            )}
          </div>

          {permiteVariacoes && !temVariacoes && utilizaveis.length === 0 && (
            <p className="border-t border-fg/[0.06] px-5 py-3 text-center text-[11.5px] text-faint">
              Para dividir este item em tamanhos ou cores, cadastre antes um atributo com valores — “Tamanho” com P, M, G, por exemplo.
            </p>
          )}

          {temVariacoes && variacoes.every((v) => Number(v.quantidade) <= 0) && (
            <p className="flex items-center gap-2 border-t border-fg/[0.06] px-5 py-2.5 text-[11.5px] text-danger">
              <PackageX size={13} /> Todas as variações estão zeradas — nenhuma venda deste produto vai passar.
            </p>
          )}
        </>
      ) : (
        <>
          {/* ---------- O extrato: por que o número é esse ---------- */}
          {movimentos.length === 0 ? (
            <p className="px-5 py-6 text-center text-[12px] text-faint">
              {podeMovimentar
                ? "Nenhuma movimentação ainda. Lance uma entrada quando chegar mercadoria."
                : "Este item não conta unidades, então não há movimentação a registrar."}
            </p>
          ) : (
            /*
             * A altura vem da COLUNA a partir de `xl`, e de um teto abaixo dela.
             *
             * Em `xl` a coluna tem altura definida e o extrato ocupa a sobra —
             * o `max-h` fixo de antes sobrava em tela grande e faltava em tela
             * pequena. Abaixo de `xl` não há altura definida (a página é que
             * rola), e sem teto duzentos lançamentos viram um cartão de dois
             * metros no celular.
             */
            <div className="flex max-h-[420px] min-h-0 flex-1 flex-col divide-y divide-fg/[0.05] overflow-y-auto xl:max-h-none">
              {movimentos.map((mov) => {
                const rotulo = MOVIMENTO_LABEL[mov.tipo] ?? { texto: mov.tipo, tom: "neutro" as const };
                const quanto = Number(mov.quantidade) || 0;

                return (
                  <div key={mov.id} className="flex items-center gap-3 px-5 py-2">
                    <span className={`w-[86px] shrink-0 text-[11.5px] ${TOM_CLASSE[rotulo.tom]}`}>{rotulo.texto}</span>

                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[12px] text-mist">{mov.variacaoDescricao || mov.motivo || "—"}</span>
                      <span className="truncate text-[10.5px] text-faint">
                        {formatDateTime(mov.criadoEm)}
                        {mov.usuarioNome ? ` · ${mov.usuarioNome}` : ""}
                        {mov.variacaoDescricao && mov.motivo ? ` · ${mov.motivo}` : ""}
                      </span>
                    </div>

                    {/* O sinal vem do próprio número (a API grava assinado), então
                        entrada e saída se distinguem sem depender só da cor. */}
                    <span className={`shrink-0 text-[12.5px] tabular-nums ${quanto < 0 ? "text-danger" : "text-success"}`}>
                      {quanto > 0 ? "+" : ""}{formatNumber(quanto)}
                    </span>

                    <span className="w-[64px] shrink-0 text-right text-[11.5px] tabular-nums text-faint">
                      {mov.saldoApos == null ? "—" : formatNumber(mov.saldoApos)}
                    </span>

                    {/*
                      A lixeira só no que foi lançado À MÃO.

                      Movimento de VENDA, CONSUMO e CANCELAMENTO é consequência
                      de uma nota: apagá-lo aqui devolveria mercadoria ao saldo
                      sem tocar na venda que a tirou, e o estoque passaria a
                      discordar do que foi vendido. Quem desfaz esses é o
                      cancelamento da nota.

                      Sobram ENTRADA, SAIDA e AJUSTE — justamente os que alguém
                      erra digitando, que é o motivo de este botão existir.
                    */}
                    <span className="w-7 shrink-0 text-right">
                      {podeMovimentar && ["ENTRADA", "SAIDA", "AJUSTE"].includes(mov.tipo) && (
                        <button
                          type="button"
                          disabled={apagandoMov === mov.id}
                          onClick={() => void apagarMovimento(mov)}
                          title="Apagar este lançamento e desfazer o saldo"
                          aria-label="Apagar lançamento"
                          className="focus-ring cursor-pointer rounded-lg p-1 text-faint transition-colors hover:bg-danger/20 hover:text-danger disabled:opacity-40"
                        >
                          {apagandoMov === mov.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
        </motion.div>
      </AnimatePresence>

      {/* ---------- Modal: a variação inteira ---------- */}
      <Modal
        open={rascunho !== null}
        onClose={() => setRascunho(null)}
        title={rascunho?.id ? "Editar variação" : "Nova variação"}
        subtitle="Estoque, preço e foto — tudo desta peça, num lugar só"
      >
        {rascunho && (
          <Form onSubmit={(e) => { e.preventDefault(); void salvarVariacao(); }} className="!gap-3">
            <FormGrid cols={2}>
              {utilizaveis.map((atributo) => (
                <div key={atributo.id} className="flex flex-col">
                  <label htmlFor={`attr-${atributo.id}`} className="mb-1.5 block text-[11px] uppercase tracking-[0.08em] text-faint">
                    {atributo.nome}
                  </label>
                  <div className="glass-subtle flex min-w-0 items-center gap-2 rounded-lg border-fg/[0.09] px-3 transition-all focus-within:border-accent/60">
                    <select
                      id={`attr-${atributo.id}`}
                      value={rascunho.escolhas[atributo.id] ?? ""}
                      onChange={(e) => setRascunho((r) => r && ({ ...r, escolhas: { ...r.escolhas, [atributo.id]: e.target.value } }))}
                      className="w-full min-w-0 flex-1 cursor-pointer appearance-none bg-transparent py-2.5 pr-6 text-sm text-ink outline-none [&>option]:bg-surface"
                    >
                      <option value="">—</option>
                      {atributo.valores.map((valor) => (
                        <option key={valor.id} value={valor.id}>{valor.valor}</option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-1 min-h-[14px] text-[10.5px] leading-[14px] text-faint" />
                </div>
              ))}
            </FormGrid>

            <UploadImagem
              tipo="produto"
              rotulo="Foto desta variação"
              valor={rascunho.imagem}
              onChange={(url) => setRascunho((r) => r && ({ ...r, imagem: url ?? "" }))}
            />

            <FormGrid cols={2}>
              <CurrencyField
                label="Venda"
                hint={rascunho.valorVenda == null ? `Vazio herda ${formatCurrency(valorVendaProduto)}` : undefined}
                value={rascunho.valorVenda ?? 0}
                onValueChange={(v) => setRascunho((r) => r && ({ ...r, valorVenda: v }))}
              />
              <CurrencyField
                label="Custo"
                value={rascunho.valorCompra ?? 0}
                onValueChange={(v) => setRascunho((r) => r && ({ ...r, valorCompra: v }))}
              />
            </FormGrid>

            <FormGrid cols={3}>
              <TextField
                label="Quantidade"
                type="number"
                min="0"
                step="any"
                /*
                 * Editável também na edição — e é o ponto do painel.
                 *
                 * O campo já esteve desabilitado aqui, com "use entrada/saída
                 * para mexer": a informação certa, no lugar errado. Quem abriu
                 * a variação para corrigir o número tinha de fechar, achar o
                 * outro cartão e reencontrar a mesma variação num seletor.
                 *
                 * O que o número significa muda com o contexto, e o `hint` diz
                 * qual: no cadastro é o estoque inicial; na edição é o TOTAL
                 * contado, que o servidor transforma em ajuste (ver a nota no
                 * topo do arquivo).
                 */
                hint={rascunho.id ? "O total que existe hoje — vira contagem no extrato" : "Estoque inicial"}
                value={rascunho.quantidade}
                onChange={(e) => setRascunho((r) => r && ({ ...r, quantidade: e.target.value }))}
              />
              <TextField
                label="Avisar abaixo de"
                type="number"
                min="0"
                step="any"
                hint="Vazio usa o do produto"
                value={rascunho.estoqueMinimo}
                onChange={(e) => setRascunho((r) => r && ({ ...r, estoqueMinimo: e.target.value }))}
              />
              <TextField
                label="SKU"
                placeholder="CAM-PRT-M"
                value={rascunho.sku}
                onChange={(e) => setRascunho((r) => r && ({ ...r, sku: e.target.value }))}
              />
            </FormGrid>

            <TextField
              label="Código de barras"
              placeholder="7891234567890"
              value={rascunho.codigoBarras}
              onChange={(e) => setRascunho((r) => r && ({ ...r, codigoBarras: e.target.value }))}
            />

            {rascunho.id && (
              <SwitchField
                label="Variação ativa"
                hint="Desligada, ela some do PDV e do total do produto — sem apagar o histórico de vendas."
                checked={rascunho.ativo}
                onChange={(v) => setRascunho((r) => r && ({ ...r, ativo: v }))}
              />
            )}

            <FormActions onCancel={() => setRascunho(null)} saving={salvando} submitText="Salvar variação" />
          </Form>
        )}
      </Modal>

      {/* ---------- Modal: o estoque do item sem variação ---------- */}
      <Modal
        open={editandoItem}
        onClose={() => setEditandoItem(false)}
        title="Estoque do item"
        subtitle="Sem variações, o estoque é o do próprio item"
      >
        <Form onSubmit={(e) => { e.preventDefault(); void salvarItem(); }} className="!gap-3">
          <FormGrid cols={2}>
            <TextField
              label="Quantidade"
              type="number"
              min="0"
              step="any"
              autoFocus
              hint="O total que existe hoje — vira contagem no extrato"
              value={quantidadeItem}
              onChange={(e) => setQuantidadeItem(e.target.value)}
            />
            <TextField
              label="Avisar abaixo de"
              type="number"
              min="0"
              step="any"
              placeholder="5"
              hint="Vazio usa o padrão da tela"
              value={minimoItem}
              onChange={(e) => setMinimoItem(e.target.value)}
            />
          </FormGrid>

          <FormActions onCancel={() => setEditandoItem(false)} saving={salvando} submitText="Salvar estoque" />
        </Form>
      </Modal>

      {/* ---------- Modal: entrada, saída, contagem ---------- */}
      <Modal
        open={movimento !== null}
        onClose={() => setMovimento(null)}
        title={acao?.label ?? ""}
        subtitle={acao?.ajuda}
      >
        <Form onSubmit={(e) => { e.preventDefault(); void salvarMovimento(); }} className="!gap-3">
          {/*
           * Onde o lançamento cai, dito antes de digitar o número.
           *
           * Com variações, é a escolha da peça — e o saldo de cada uma aparece
           * na opção, porque a contagem se confere contra ele. Sem variação
           * nenhuma, o destino é o próprio item, e a linha existe para isso
           * não ficar implícito: os botões agora vivem na aba de
           * movimentações, longe da lista, e quem abre o modal não tem mais a
           * linha do item à vista para deduzir onde vai cair.
           */}
          {ativas.length === 0 ? (
            <div className="flex items-center gap-2.5 rounded-lg border border-fg/[0.08] bg-fg/[0.03] px-3 py-2.5">
              <Package size={14} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-mist">{produtoNome}</span>
              <span className="shrink-0 text-[11.5px] tabular-nums text-faint">
                {formatNumber(Number(quantidadeProduto) || 0)} {unidade || "un"}.
              </span>
            </div>
          ) : (
            <div className="flex flex-col">
              <label htmlFor="mov-variacao" className="mb-1.5 text-[11px] uppercase tracking-[0.08em] text-faint">Variação</label>
              <div className="glass-subtle flex items-center rounded-lg border-fg/[0.09] px-3 focus-within:border-accent/60">
                <select
                  id="mov-variacao"
                  value={variacaoMov}
                  onChange={(e) => setVariacaoMov(e.target.value)}
                  className="w-full min-w-0 flex-1 cursor-pointer appearance-none bg-transparent py-2.5 text-sm text-ink outline-none [&>option]:bg-surface"
                >
                  <option value="">Escolha…</option>
                  {ativas.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.descricao || v.sku || v.id.substring(0, 6)} — {formatNumber(Number(v.quantidade) || 0)} un.
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-1 min-h-[14px] text-[10.5px] leading-[14px] text-faint" />
            </div>
          )}

          <FormGrid cols={movimento === "ENTRADA" ? 2 : 1}>
            <TextField
              label={movimento === "AJUSTE" ? "Total contado" : "Quantidade"}
              type="number"
              min="0"
              step="any"
              autoFocus
              hint={movimento === "AJUSTE" ? "O que você encontrou na prateleira" : undefined}
              value={quantidadeMov}
              onChange={(e) => setQuantidadeMov(e.target.value)}
            />

            {/* Só na entrada: é o único momento em que existe um custo novo a
                registrar — e ele atualiza o custo do item, o que faz o "valor
                do estoque" da tela parar de usar o preço da primeira compra
                para sempre. */}
            {movimento === "ENTRADA" && (
              <CurrencyField
                label="Custo unitário"
                hint="Opcional — atualiza o custo do item"
                value={custoMov}
                onValueChange={setCustoMov}
              />
            )}
          </FormGrid>

          <TextArea
            label="Motivo"
            rows={2}
            placeholder={movimento === "SAIDA" ? "Quebrou no transporte" : movimento === "ENTRADA" ? "Nota 4521 — fornecedor X" : "Contagem mensal"}
            value={motivoMov}
            onChange={(e) => setMotivoMov(e.target.value)}
          />

          <FormActions onCancel={() => setMovimento(null)} saving={salvando} submitText="Lançar" />
        </Form>
      </Modal>
    </div>
  );
};

export default EstoquePainel;
