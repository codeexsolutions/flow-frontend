import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PackageSearch, PackagePlus, Plus, Loader2, CornerDownLeft, Ban, Layers } from "lucide-react";

import ProductType, { ehVendavel, nivelEstoque } from "@/shared/domain/produto";
import type { Variacao } from "@/shared/domain/estoque";
import EstoqueService from "@/features/estoque/services/estoque.service";
import { formatCurrency } from "@/shared/utils/currency";
import { formatNumber } from "@/shared/utils/format";

/**
 * Busca de produtos, logo acima da tabela de itens da nota (e do orçamento).
 *
 * Substitui o modal de "Adicionar produto": quem opera digita e vê o produto na
 * hora, sem trocar de tela.
 *
 * Fica FORA da tabela de propósito. Como célula, a lista de sugestões era
 * recortada pelo `overflow-hidden` do quadro da tabela — as opções existiam no
 * DOM e simplesmente não apareciam. Acima da tabela, a lista tem para onde
 * crescer.
 *
 * Teclado é o caminho principal: quem atende no balcão digita, desce até o
 * produto e aperta Enter, sem soltar o teclado para pegar o mouse.
 *
 * ---------------------------------------------------------------------------
 * O estoque aparece AQUI, e o esgotado não entra na nota
 * ---------------------------------------------------------------------------
 * A trava de verdade é do servidor — ele recusa a nota que não tem o que
 * entregar. Mas descobrir isso só no "Salvar" é descobrir tarde: a nota está
 * montada, o cliente esperando, e o erro fala de uma linha entre dez. Mostrar o
 * saldo na sugestão e recusar o clique no que está zerado faz o problema
 * aparecer no instante em que ele pode ser resolvido — trocando o item, ainda
 * com o cliente escolhendo.
 */
type Props = {
  produtos: ProductType[];
  carregando?: boolean;
  /** `variacao` vem preenchida quando o produto se vende por tamanho/cor. */
  onAdicionar: (produto: ProductType, variacao?: Variacao) => void;
  /**
   * Abre o cadastro de produto já com o que foi digitado.
   *
   * O balcão descobre que o produto não existe exatamente aqui: a busca não
   * acha e a venda para. Mandar a pessoa até Estoque e voltar é o que faz a
   * nota ser abandonada no meio. Opcional porque nem todo lugar que usa esta
   * busca tem para onde cadastrar.
   */
  onCadastrar?: (nome: string) => void;
  /**
   * Lança o que foi digitado como item LIVRE, sem passar pelo cadastro.
   *
   * Existe para o orçamento, e só para ele. Orçar é dizer um preço por algo
   * que muitas vezes ainda não é produto — "banner 2x1 em lona", "arte + 200
   * cartões" —, e exigir a ficha completa antes de conseguir escrever a linha
   * é pedir que se cadastre no estoque uma coisa que talvez nem seja vendida:
   * o cliente pode dizer não, e o catálogo fica com o resto.
   *
   * O item nasce sem `produtoId`. Se a proposta virar venda, o produto é
   * criado ali — quando existe motivo para ele existir. Ver `materializarAvulsos`
   * na nota.
   */
  onItemAvulso?: (nome: string) => void;
};

/**
 * Espera antes de mostrar o resultado.
 *
 * O filtro é local e instantâneo — as opções apareceriam no mesmo quadro da
 * tecla. Sem uma pausa curta, a lista pisca e se reordena a cada letra, e o
 * olho não acompanha. Este intervalo dá tempo de a pessoa terminar a palavra e
 * transforma a busca num movimento só: digita, carrega, aparece.
 */
const ESPERA_MS = 180;

/** Item sem saldo não pode entrar na nota — a menos que o produto libere. */
const bloqueado = (p: ProductType) => nivelEstoque(p) === "esgotado" && !p.permiteVendaSemEstoque;

const BuscaProduto = ({ produtos, carregando = false, onAdicionar, onCadastrar, onItemAvulso }: Props) => {
  const [busca, setBusca] = useState("");
  const [procurando, setProcurando] = useState(false);
  /* Qual sugestão está sob o cursor do teclado. */
  const [indice, setIndice] = useState(0);

  /* Produto com variações abre um segundo passo: qual peça. Não dá para
     adivinhar — vender "a camiseta" sem dizer o tamanho baixaria o estoque
     errado. */
  const [escolhendo, setEscolhendo] = useState<ProductType | null>(null);
  const [variacoes, setVariacoes] = useState<Variacao[]>([]);
  const [carregandoVariacoes, setCarregandoVariacoes] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);

  const termo = busca.trim().toLowerCase();

  /* Enquanto `procurando`, a lista não é calculada: é o que faz a animação de
     carregamento aparecer em vez de o resultado saltar pronto. */
  const sugestoes = useMemo(() => {
    if (!termo || procurando) return [];

    /*
     * Insumo fica FORA da busca do balcão.
     *
     * O rolo de tecido e a folha de transfer existem no estoque, contam
     * unidade e têm ficha — mas não são o que se vende. Aparecendo aqui, eles
     * disputam as oito sugestões com o produto certo e, pior, deixam lançar
     * material na nota do cliente: a venda baixaria o insumo diretamente, e a
     * peça pronta que ele deveria virar continuaria em estoque.
     */
    return produtos
      .filter(ehVendavel)
      .filter((p) =>
        p.nome?.toLowerCase().includes(termo) ||
        /* SKU e código de barras entram na busca porque são o que se digita
           (ou se bipa) no balcão — procurar pelo nome quando a etiqueta está
           na mão é o caminho mais longo. */
        p.sku?.toLowerCase().includes(termo) ||
        p.codigoBarras?.toLowerCase() === termo,
      )
      .slice(0, 8);
  }, [produtos, termo, procurando]);

  /* Cada tecla reinicia a espera — só para de "procurar" quando a digitação
     para. */
  useEffect(() => {
    if (!termo) {
      setProcurando(false);
      return;
    }

    setProcurando(true);
    const t = setTimeout(() => setProcurando(false), ESPERA_MS);

    return () => clearTimeout(t);
  }, [termo]);

  /* Termo novo, cursor de volta ao topo: manter o índice antigo deixaria o
     destaque num item que não existe mais na lista. */
  useEffect(() => setIndice(0), [termo]);

  /* Mantém o item destacado visível quando se desce além do que cabe. */
  useEffect(() => {
    listaRef.current?.querySelectorAll("li")[indice]?.scrollIntoView({ block: "nearest" });
  }, [indice]);

  const limpar = () => {
    setBusca("");
    setIndice(0);
    inputRef.current?.focus();
  };

  /**
   * Adiciona e zera a busca.
   *
   * Zerar devolve o cursor pronto para o próximo produto, que é o passo
   * seguinte na esmagadora maioria das vezes. Para lançar o mesmo item de
   * novo, a quantidade na linha resolve — e é menos trabalho que redigitar.
   */
  const adicionar = async (produto: ProductType) => {
    if (bloqueado(produto)) return;

    if (produto.usaVariacoes) {
      setEscolhendo(produto);
      setVariacoes([]);
      setCarregandoVariacoes(true);

      try {
        const lista = await EstoqueService.variacoes(String(produto.id));
        setVariacoes(lista.filter((v) => v.ativo));
      } catch {
        /* Sem a lista não há o que escolher, e insistir num painel vazio é
           pior do que voltar: o produto continua na busca e a pessoa tenta de
           novo ou lança outro item. */
        setEscolhendo(null);
      } finally {
        setCarregandoVariacoes(false);
      }

      return;
    }

    onAdicionar(produto);
    limpar();
  };

  const escolherVariacao = (variacao: Variacao) => {
    if (!escolhendo) return;
    if (Number(variacao.quantidade) <= 0 && !escolhendo.permiteVendaSemEstoque) return;

    onAdicionar(escolhendo, variacao);
    setEscolhendo(null);
    limpar();
  };

  const aoTeclar = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setBusca("");
      return;
    }

    /* Enter sem nenhuma sugestão lança o item livre: no orçamento é o caminho
       principal, não a exceção. Digita, Enter, está na proposta. */
    if (sugestoes.length === 0) {
      if (e.key === "Enter" && onItemAvulso && termo) {
        e.preventDefault();
        onItemAvulso(busca.trim());
        limpar();
      }

      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndice((i) => (i + 1) % sugestoes.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndice((i) => (i - 1 + sugestoes.length) % sugestoes.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const escolhido = sugestoes[indice] ?? sugestoes[0];
      if (escolhido) void adicionar(escolhido);
    }
  };

  const mostrarLista = Boolean(termo) && !procurando && !carregando && sugestoes.length > 0;
  const semResultado = Boolean(termo) && !procurando && !carregando && sugestoes.length === 0;

  return (
    <div className="relative">
      <div className="flex items-center gap-2.5 rounded-xl border border-fg/[0.08] bg-fg/[0.03] py-0 pl-3 pr-1.5 transition-colors focus-within:border-accent/60">
        {/* O ícone vira spinner enquanto procura: o mesmo lugar responde pela
            busca parada e pela busca em andamento, sem a linha pular de
            largura. */}
        <span className="grid h-4 w-4 shrink-0 place-items-center">
          <AnimatePresence mode="wait" initial={false}>
            {procurando || carregando ? (
              <motion.span key="load" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} transition={{ duration: 0.12 }}>
                <Loader2 size={15} className="animate-spin text-accent-soft" />
              </motion.span>
            ) : (
              <motion.span key="lupa" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} transition={{ duration: 0.12 }}>
                <PackageSearch size={15} className="text-muted" />
              </motion.span>
            )}
          </AnimatePresence>
        </span>

        <input
          ref={inputRef}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={aoTeclar}
          placeholder={onItemAvulso ? "Digite o item, o produto ou bipe o código…" : "Digite o produto, SKU ou bipe o código…"}
          aria-label="Buscar produto para adicionar"
          className="w-full flex-1 bg-transparent py-2.5 text-[13px] text-ink outline-none placeholder:text-faint"
        />

        {/* A dica de teclado só aparece quando há o que escolher — ou, no
            orçamento, quando o Enter já resolve sozinho. */}
        {(mostrarLista || (semResultado && onItemAvulso)) && (
          <span className="hidden shrink-0 items-center gap-1 text-[10.5px] text-faint sm:flex">
            <CornerDownLeft size={11} /> adiciona
          </span>
        )}

        {busca && (
          <button type="button" onClick={() => setBusca("")} className="shrink-0 text-[11px] text-faint hover:text-ink">
            Limpar
          </button>
        )}

        {/*
         * Cadastrar produto sem sair da nota.
         *
         * Posição fixa, do lado de dentro do campo: o momento em que se
         * descobre que o produto não existe é este, com o cursor na busca. O
         * ícone não muda de lugar conforme o que foi digitado, então quem opera
         * decora o alvo. O CTA com o nome digitado, logo abaixo, é o mesmo
         * caminho para quem só percebe no "nenhum produto encontrado".
         */}
        {onCadastrar && (
          <button
            type="button"
            onClick={() => {
              onCadastrar(busca.trim());
              setBusca("");
            }}
            title="Cadastrar um produto novo"
            aria-label="Cadastrar um produto novo"
            className="focus-ring my-1.5 grid h-[34px] w-[34px] shrink-0 cursor-pointer place-items-center rounded-lg border border-fg/[0.1] text-mist transition-colors hover:bg-fg/[0.06] hover:text-ink"
          >
            <PackagePlus size={16} />
          </button>
        )}
      </div>

      {/* Barra de progresso fina sob o campo — o "puxando os produtos". */}
      <AnimatePresence>
        {(procurando || carregando) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-x-3 top-full h-[2px] overflow-hidden rounded-full bg-fg/[0.06]"
          >
            <motion.div
              className="h-full w-1/3 rounded-full bg-accent"
              animate={{ x: ["-100%", "300%"] }}
              transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {semResultado && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 px-3 text-[12px] text-faint">
          {/*
           * A ordem inverte quando o item livre existe.
           *
           * "Não está no estoque" deixa de ser um beco: o primeiro caminho
           * oferecido passa a ser escrever a linha assim mesmo, que é o que se
           * quer na maioria das vezes — tanto na proposta quanto na nota, onde
           * o item avulso é o frete, a mão de obra, a peça encomendada.
           * Cadastrar continua ali, de propósito em segundo plano: é a decisão
           * maior das duas, e ela pode esperar o fim do atendimento.
           */}
          {onItemAvulso ? (
            <>
              <button
                type="button"
                onClick={() => {
                  onItemAvulso(busca.trim());
                  limpar();
                }}
                className="focus-ring inline-flex items-center gap-1 rounded-md text-accent-soft underline-offset-2 hover:underline"
              >
                <Plus size={13} />
                Lançar “{busca.trim()}” como item avulso
              </button>

              <span>— sem cadastrar no estoque.</span>

              {onCadastrar && (
                <button
                  type="button"
                  onClick={() => {
                    onCadastrar(busca.trim());
                    setBusca("");
                  }}
                  className="focus-ring inline-flex items-center gap-1 rounded-md underline-offset-2 hover:text-ink hover:underline"
                >
                  <PackagePlus size={13} />
                  Cadastrar
                </button>
              )}
            </>
          ) : (
            <>
              <span>Nenhum produto encontrado.</span>
              {onCadastrar && (
                <button
                  type="button"
                  onClick={() => {
                    onCadastrar(busca.trim());
                    setBusca("");
                  }}
                  className="focus-ring inline-flex items-center gap-1 rounded-md text-accent-soft underline-offset-2 hover:underline"
                >
                  <PackagePlus size={13} />
                  Cadastrar “{busca.trim()}”
                </button>
              )}
            </>
          )}
        </div>
      )}

      <AnimatePresence>
        {mostrarLista && (
          <motion.ul
            ref={listaRef}
            initial={{ opacity: 0, y: -6, scaleY: 0.92 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: -4, scaleY: 0.96 }}
            transition={{ type: "spring", stiffness: 500, damping: 34, mass: 0.6 }}
            className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-[280px] origin-top overflow-y-auto rounded-xl border border-fg/[0.1] bg-surface shadow-[0_24px_60px_-20px_rgba(0,0,0,0.5)]"
          >
            {sugestoes.map((p, i) => {
              const nivel = nivelEstoque(p);
              const semSaldo = bloqueado(p);

              return (
                <motion.li
                  key={String(p.id)}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.025 * i, duration: 0.15, ease: "easeOut" }}
                >
                  <button
                    type="button"
                    onClick={() => void adicionar(p)}
                    onMouseEnter={() => setIndice(i)}
                    disabled={semSaldo}
                    title={semSaldo ? "Sem estoque — lance uma entrada ou libere a venda sem estoque no cadastro" : undefined}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors ${
                      semSaldo ? "cursor-not-allowed opacity-60" : i === indice ? "bg-accent/[0.12]" : "hover:bg-fg/[0.06]"
                    }`}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[13px] text-ink">{p.nome}</span>
                        {p.usaVariacoes && <Layers size={11} className="shrink-0 text-muted" />}
                      </span>

                      {/* O saldo fica embaixo do nome, sempre — não só quando
                          é problema. Quem atende decide "levo 3 ou 5?" olhando
                          para cá, e um número que só aparece na falta obriga a
                          abrir o estoque para a pergunta comum. */}
                      <span className={`text-[10.5px] ${
                        nivel === "esgotado" ? "text-danger" : nivel === "baixo" ? "text-warning" : "text-faint"
                      }`}>
                        {nivel === "ilimitado"
                          ? p.tipo === "SERVICO" ? "serviço" : "sem controle de estoque"
                          : nivel === "esgotado"
                            ? p.permiteVendaSemEstoque ? "sem estoque — venda liberada" : "sem estoque"
                            : `${formatNumber(Number(p.quantidade) || 0)} ${p.unidade || "un"}`}
                      </span>
                    </span>

                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-[12px] tabular-nums text-mist">{formatCurrency(Number(p.valorVenda) || 0)}</span>
                      <span className={`grid h-6 w-6 place-items-center rounded-md transition-colors ${
                        semSaldo ? "bg-danger/15 text-danger" : i === indice ? "bg-success text-white" : "bg-success/15 text-success"
                      }`}>
                        {semSaldo ? <Ban size={12} /> : <Plus size={13} />}
                      </span>
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>

      {/* Segundo passo: qual peça. */}
      <AnimatePresence>
        {escolhendo && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute left-0 right-0 top-full z-40 mt-1.5 overflow-hidden rounded-xl border border-fg/[0.12] bg-surface shadow-[0_24px_60px_-20px_rgba(0,0,0,0.5)]"
          >
            <div className="flex items-center gap-2 border-b border-fg/[0.07] px-3 py-2">
              <Layers size={13} className="text-accent-soft" />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{escolhendo.nome}</span>
              <button type="button" onClick={() => setEscolhendo(null)} className="focus-ring cursor-pointer text-[11px] text-faint hover:text-ink">
                Cancelar
              </button>
            </div>

            {carregandoVariacoes ? (
              <div className="flex items-center justify-center py-6 text-faint">
                <Loader2 size={16} className="animate-spin" />
              </div>
            ) : variacoes.length === 0 ? (
              <p className="px-3 py-5 text-center text-[12px] text-faint">Este produto não tem variação ativa para vender.</p>
            ) : (
              <div className="flex max-h-[240px] flex-col overflow-y-auto">
                {variacoes.map((variacao) => {
                  const saldo = Number(variacao.quantidade) || 0;
                  const semSaldo = saldo <= 0 && !escolhendo.permiteVendaSemEstoque;

                  return (
                    <button
                      key={variacao.id}
                      type="button"
                      onClick={() => escolherVariacao(variacao)}
                      disabled={semSaldo}
                      title={semSaldo ? "Sem estoque desta peça" : undefined}
                      className={`flex items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors ${
                        semSaldo ? "cursor-not-allowed opacity-55" : "hover:bg-accent/[0.1]"
                      }`}
                    >
                      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                        {variacao.valores.map((valor) => (
                          <span key={valor.valorId} className="inline-flex items-center gap-1 rounded bg-fg/[0.06] px-1.5 py-px text-[11px] text-mist">
                            {valor.corHex && <span aria-hidden className="h-2.5 w-2.5 rounded-full border border-fg/[0.2]" style={{ background: valor.corHex }} />}
                            {valor.valor}
                          </span>
                        ))}
                      </span>

                      <span className="flex shrink-0 items-center gap-2.5">
                        <span className={`text-[10.5px] ${semSaldo ? "text-danger" : "text-faint"}`}>
                          {semSaldo ? "sem estoque" : `${formatNumber(saldo)} un.`}
                        </span>
                        <span className="text-[12px] tabular-nums text-mist">
                          {formatCurrency(variacao.valorVendaEfetivo ?? (Number(escolhendo.valorVenda) || 0))}
                        </span>
                        <span className={`grid h-6 w-6 place-items-center rounded-md ${semSaldo ? "bg-danger/15 text-danger" : "bg-success/15 text-success"}`}>
                          {semSaldo ? <Ban size={12} /> : <Plus size={13} />}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BuscaProduto;
