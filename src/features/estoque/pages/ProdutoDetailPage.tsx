import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Package, Pencil, AlertTriangle, RotateCw, Loader2, Wallet,
  TrendingUp, Boxes, Barcode, Bookmark, MapPin, Tag, Layers, Ruler, Wrench,
  Infinity as InfinityIcon,
} from "lucide-react";

import { PageScreen } from "@/shared/ui/PageShell";
import { Modal } from "@/shared/ui/Modal";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import { formatCurrency } from "@/shared/utils/currency";
import { formatNumber, EMPTY } from "@/shared/utils/format";
import useSincronizacao from "@/shared/realtime/useSincronizacao";

import { nivelEstoque, SEM_CATEGORIA, TIPO_ITEM, tipoDoItem } from "@/shared/domain/produto";
import type { ProdutoUpdateDto } from "@/shared/domain/produto";
import type { FichaProduto } from "@/shared/domain/estoque";
import ProductService from "@/features/estoque/services/product.service";
import EstoqueService from "@/features/estoque/services/estoque.service";
import { ProdutoForm } from "@/features/estoque/components/ProdutoForm";
import type { ProductFormData } from "@/features/estoque/schema/product.schema";
import { calcularGanho } from "@/features/estoque/schema/product.schema";
import EstoquePainel from "@/features/estoque/components/EstoquePainel";
import AtributosPainel from "@/features/estoque/components/AtributosPainel";
import { StatCard, Dado, Cartao } from "@/shared/ui/Ficha";

/**
 * A página do produto — tudo o que existe sobre um item, num lugar só.
 *
 * ---------------------------------------------------------------------------
 * Por que uma PÁGINA, e não o modal de edição
 * ---------------------------------------------------------------------------
 * O modal cabia quando produto era "nome, preço e quantidade". Não cabe mais:
 * a ficha de identificação e o estoque — variações e extrato juntos — são dois
 * blocos que precisam ser lidos lado a lado, e um modal de 500 px de altura
 * obriga a rolar dentro de uma caixa que flutua sobre a lista que a pessoa
 * acabou de deixar.
 *
 * Página também significa ENDEREÇO: `/estoque/<id>` pode ser favoritado,
 * mandado no WhatsApp para o colega ("confere esse produto aqui") e aberto de
 * volta pelo histórico. Um modal não tem nada disso.
 *
 * A edição dos campos básicos continua em modal, e continua sendo o mesmo
 * formulário do cadastro — dois formulários para a mesma coisa divergiriam no
 * primeiro campo novo.
 */

/* -------------------------------------------------------------------------- */
/* Peças                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Um número da ficha do produto.
 *
 * ---------------------------------------------------------------------------
 * Por que ele deitou
 * ---------------------------------------------------------------------------
 * Era um cartão em pé — ícone em cima, três linhas embaixo — com 131 px de
 * altura, quatro deles numa fileira só. Ao lado ficava a foto de 240 px, e o
 * conjunto empurrava a FICHA e o ESTOQUE, que é onde se trabalha, para fora
 * da primeira tela: num notebook era preciso rolar para ver o primeiro dado
 * do produto que se acabou de abrir.
 *
 * Deitado, o mesmo conteúdo cabe em ~66 px. Nada saiu: rótulo, número e a
 * explicação do número continuam os três visíveis — e a explicação aqui não
 * é enfeite ("limitado por Tecido preto", "lucro de R$ 12 por unidade") é a
 * razão de o cartão existir.
 *
 * ---------------------------------------------------------------------------
 * Um deles pesa mais que os outros
 * ---------------------------------------------------------------------------
 * `destaque` põe o anel de acento no cartão inteiro. Os quatro tinham
 * exatamente o mesmo peso visual, e não têm o mesmo peso na decisão: "dá para
 * vender" é o número que faz a venda passar ou parar no balcão; margem e
 * valor parado são consulta. Sem nada distinguindo, o olho começa pelo
 * primeiro da esquerda por acaso, não por importância.
 */



/* -------------------------------------------------------------------------- */
/* Página                                                                     */
/* -------------------------------------------------------------------------- */

const ProdutoDetalhe = () => {
  const { produtoId } = useParams();
  const navigate = useNavigate();
  const alert = useAlert();

  const [ficha, setFicha] = useState<FichaProduto | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modal, setModal] = useState<"editar" | "atributos" | null>(null);

  const carregar = useCallback(async () => {
    if (!produtoId) return;

    setErro(null);

    try {
      const dados = await EstoqueService.ficha(produtoId);
      setFicha(dados);
    } catch (err) {
      setErro(extractErrorMessage(err, "Não foi possível carregar o produto."));
    } finally {
      setCarregando(false);
    }
  }, [produtoId]);

  useEffect(() => {
    setCarregando(true);
    void carregar();
  }, [carregar]);

  /* Venda em outro caixa, entrada lançada pelo colega: a ficha se atualiza
     sozinha, sem ninguém apertar nada. */
  useSincronizacao(["produtos", "pedidos"], () => { void carregar(); });

  /**
   * Salva os campos do item — todos menos a quantidade.
   *
   * `quantidade` é descartada de propósito: o saldo mora no painel de estoque
   * desta mesma tela, onde mexer nele grava a linha do extrato. Mandá-la aqui
   * escreveria o número direto na coluna (ver `ProdutoService.AlterarProduto`)
   * e o extrato deixaria de bater com o saldo — sem que ninguém pedisse nada
   * disso: bastaria abrir "Editar" para corrigir o NOME e salvar.
   */
  const salvarEdicao = async (dados: ProductFormData) => {
    if (!produtoId) return;

    try {
      const campos: ProdutoUpdateDto = { id: produtoId, ...dados };
      delete campos.quantidade;

      await ProductService.update(campos);
      setModal(null);
      await carregar();
      alert.success("Produto atualizado!", "As alterações foram salvas.");
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível salvar as alterações."));
    }
  };

  const excluir = async () => {
    if (!produtoId) return;

    try {
      const mensagem = await ProductService.remove(produtoId);
      alert.success("Pronto!", mensagem);
      navigate("/estoque");
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível excluir o produto."));
    }
  };

  if (carregando) {
    return (
      <PageScreen title="Produto" icon={<Package className="h-5 w-5" />}>
        <div className="flex flex-1 items-center justify-center text-faint">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </PageScreen>
    );
  }

  if (erro || !ficha) {
    return (
      <PageScreen title="Produto" icon={<Package className="h-5 w-5" />}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <AlertTriangle className="h-6 w-6 text-danger" />
          <p className="text-[13px] text-mist">{erro ?? "Produto não encontrado."}</p>
          <div className="flex gap-2">
            <button onClick={() => void carregar()} className="focus-ring inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-fg/[0.1] px-3 py-2 text-[12.5px] text-mist hover:text-ink">
              <RotateCw className="h-3.5 w-3.5" /> Tentar novamente
            </button>
            <button onClick={() => navigate("/estoque")} className="focus-ring cursor-pointer rounded-lg bg-accent px-3 py-2 text-[12.5px] text-white">
              Voltar ao estoque
            </button>
          </div>
        </div>
      </PageScreen>
    );
  }

  /* `insumos` e `usadoEm` continuam vindo da ficha e não são lidos aqui: a
     receita saiu desta tela (a baixa por venda continua funcionando no
     servidor, ver `EstoqueService.ConsumirInsumos`). */
  const { produto, variacoes, movimentos, atributos, categorias, disponivel, limitadoPor } = ficha;

  const tipo = tipoDoItem(produto);
  const ehServico = tipo === "SERVICO";
  const ehInsumo = tipo === "INSUMO";
  const conta = produto.controlaEstoque !== false && !ehServico;
  const nivel = nivelEstoque(produto);
  const { lucro, margem } = calcularGanho(Number(produto.valorCompra) || 0, Number(produto.valorVenda) || 0);

  /* `-1` é o contrato da API para "nada limita" — ver a nota em
     `EstoqueService.calcularDisponivel`. `Infinity` não sobrevive ao JSON. */
  const ilimitado = disponivel < 0;

  const quantidade = Number(produto.quantidade) || 0;
  const valorEmEstoque = (Number(produto.valorCompra) || 0) * quantidade;

  return (
    <PageScreen
      icon={<Package className="h-5 w-5" />}
      title={produto.nome}
      /* O tipo entra no subtítulo SEMPRE que é insumo, mesmo havendo categoria
         e marca para mostrar: é a única coisa desta tela que explica por que o
         item não aparece na busca do PDV. Para produto e serviço ele continua
         sendo só o fallback — "Produto" ao lado do nome de um produto não
         acrescenta nada a quem chegou aqui pela lista de produtos. */
      subtitle={
        ehInsumo
          ? [TIPO_ITEM.INSUMO.singular, produto.categoria, produto.marca, produto.sku].filter(Boolean).join(" · ")
          : [produto.categoria, produto.marca, produto.sku].filter(Boolean).join(" · ") || TIPO_ITEM[tipo].singular
      }
      onVoltar={() => navigate("/estoque")}
      voltarPara="Estoque"
    >
      {/*
       * A tela em três faixas, e a do meio come o que sobrar.
       *
       * -----------------------------------------------------------------------
       * O que estava errado no arranjo anterior
       * -----------------------------------------------------------------------
       * Eram duas seções soltas num corpo que rola, e nenhuma delas sabia a
       * altura da tela: a foto num quadrado ao lado dos números, e embaixo
       * "Ficha" e "Estoque" lado a lado com a altura do conteúdo. O resultado
       * dependia do produto — um item sem variação deixava o cartão de estoque
       * com 200 px e um deserto abaixo dele até o fim da janela; um com vinte
       * variações estourava a janela e empurrava a ficha para fora.
       *
       * Agora:
       *
       *   1. NÚMEROS — largura inteira, quatro numa fileira. Eles são a régua
       *      da tela e não competem com nada por espaço.
       *   2. IDENTIDADE + ESTOQUE — duas colunas que ESTICAM até o fim do
       *      outlet. A identidade tem tamanho conhecido (foto e uma lista de
       *      campos que não cresce); o estoque é o que varia, então é ele quem
       *      recebe a sobra e rola por dentro.
       *
       * O `min-h-0` em cada nível não é decoração: sem ele o filho de um
       * container flex adota a altura do CONTEÚDO como mínimo, o `overflow`
       * interno nunca entra em ação e a página inteira volta a rolar — que é
       * exatamente o que se está tirando daqui.
       *
       * Abaixo de `xl` nada disso vale: numa coluna só, esticar não significa
       * nada e a página volta a rolar como sempre rolou.
       */}
      <section className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
          {/*
           * "Disponível" e não "quantidade em estoque".
           *
           * São números diferentes quando há receita: uma cesta com 2 prontas e
           * material para mais 5 dá para vender 7. É este o número que decide se
           * a venda passa, então é ele que fica em primeiro lugar.
           */}
          <StatCard
            destaque
            icon={ilimitado ? <InfinityIcon className="h-4 w-4" /> : <Boxes className="h-4 w-4" />}
            label="Disponível"
            value={ilimitado ? "Ilimitado" : formatNumber(disponivel)}
            hint={ilimitado ? (ehServico ? "Serviço não conta estoque" : "Venda liberada sem estoque") : (limitadoPor ?? undefined)}
            tom={ilimitado ? undefined : disponivel <= 0 ? "danger" : nivel === "baixo" ? "warning" : "success"}
          />

          <StatCard
            icon={<Package className="h-4 w-4" />}
            label="Em estoque"
            value={conta ? `${formatNumber(quantidade)} ${produto.unidade || ""}`.trim() : EMPTY}
            hint={conta && produto.estoqueMinimo != null ? `Avisa abaixo de ${formatNumber(produto.estoqueMinimo)}` : undefined}
          />

          <StatCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Margem"
            value={margem === null ? EMPTY : `${margem.toFixed(0)}%`}
            hint={`Lucro de ${formatCurrency(lucro)} por unidade`}
            tom={lucro < 0 ? "danger" : undefined}
          />

          <StatCard
            icon={<Wallet className="h-4 w-4" />}
            label="Valor do estoque"
            value={conta ? formatCurrency(valorEmEstoque) : EMPTY}
            hint={conta ? `${formatCurrency(Number(produto.valorCompra) || 0)} de custo` : undefined}
          />
      </section>

      {/*
       * As duas faixas usam a MESMA grade de quatro colunas.
       *
       * A ficha ocupa uma; o estoque, as outras três. Antes a coluna da ficha
       * era uma medida própria (`minmax(300px,340px)`) e a borda dela caía
       * num ponto qualquer no meio do segundo KPI — duas réguas diferentes
       * empilhadas, e o olho via a página torta sem saber dizer por quê.
       * Agora a divisa das faixas é a mesma linha de cima a baixo.
       */}
      <section className="grid min-h-0 grid-cols-1 gap-3 xl:flex-1 xl:grid-cols-4">
        {/*
         * Identidade: a foto e a ficha no MESMO cartão.
         *
         * Eram dois, e a foto ficava sozinha numa caixa que não dizia nada
         * além do que a própria imagem já dizia — uma moldura de 240 px com
         * uma borda em volta. Aqui ela é o topo da ficha, que é o que ela
         * sempre foi: a primeira linha da identidade do item.
         *
         * A coluna rola por dentro em vez de esticar a página: a lista de
         * campos tem nove linhas fixas e a descrição pode ser longa.
         */}
        <Cartao className="flex flex-col xl:min-h-0">
          {produto.imagem && (
            /* Quadrada, e não uma faixa de 130 px.
               Com as linhas apertadas, a ficha passou a terminar bem antes do
               fim da coluna e sobrava um vazio embaixo dela maior que a foto.
               O quadrado é a proporção em que a foto de produto é tirada e
               ocupa essa sobra com a única coisa desta tela que se olha em vez
               de ler. O teto existe só para ela não empurrar as linhas para
               fora numa coluna larga. */
            <div className="aspect-square max-h-[300px] w-full shrink-0 overflow-hidden bg-fg/[0.03]">
              <img src={produto.imagem} alt={produto.nome} className="h-full w-full object-cover" />
            </div>
          )}

          <div className="flex items-center gap-2.5 border-b border-fg/[0.07] px-3.5 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/[0.14] text-accent-soft ring-1 ring-inset ring-accent/20">
              <Tag className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[12.5px] text-ink">Ficha</h2>
              <p className="truncate text-[10px] text-faint">{TIPO_ITEM[tipo].singular} · {conta ? "controla estoque" : "não conta unidades"}</p>
            </div>
            {/*
             * A edição virou um lápis DENTRO do cartão que ela edita.
             *
             * Era um botão cheio na barra de ações do topo, ao lado de outro
             * que abria os atributos — e os atributos já têm porta na aba de
             * itens do painel de estoque, ao lado da lista que eles governam.
             * Com os dois fora, a barra inteira deixou de existir e a tela
             * começa pelos números, como a do funcionário.
             */}
            <button
              type="button"
              onClick={() => setModal("editar")}
              title="Editar os dados do item"
              aria-label="Editar item"
              className="focus-ring inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-fg/[0.1] px-2 py-1 text-[11.5px] text-mist transition-colors hover:bg-fg/[0.05] hover:text-ink"
            >
              <Pencil size={12} /> Editar
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col xl:overflow-y-auto">
            {/*
             * Nove LINHAS, e não nove cartõezinhos.
             *
             * A ficha é a mesma peça da tela do funcionário: rótulo à
             * esquerda, valor à direita, um por linha. Em cartão, "SKU" e
             * "Cód. barras" ganhavam o mesmo destaque tipográfico de
             * "Disponível" lá em cima — e um código de barras não é um número
             * que se decide nada olhando. Empilhados, cabem na coluna
             * estreita sem truncar e o olho varre a coluna de rótulos de uma
             * vez para achar o campo que falta preencher.
             */}
            <div className="flex flex-col divide-y divide-fg/[0.04]">
              <Dado icon={<Bookmark size={13} />} label="SKU" valor={produto.sku} />
              <Dado icon={<Barcode size={13} />} label="Cód. barras" valor={produto.codigoBarras} />
              <Dado icon={<Layers size={13} />} label="Categoria" valor={produto.categoria} vazio={SEM_CATEGORIA} />
              <Dado icon={<Tag size={13} />} label="Marca" valor={produto.marca} />
              <Dado icon={<Ruler size={13} />} label="Unidade" valor={produto.unidade} />
              <Dado icon={<MapPin size={13} />} label="Localização" valor={produto.localizacao} />
              <Dado icon={<Wallet size={13} />} label="Custo" valor={produto.valorCompra ? formatCurrency(Number(produto.valorCompra)) : ""} />
              <Dado icon={<Wallet size={13} />} label="Venda" valor={produto.valorVenda ? formatCurrency(Number(produto.valorVenda)) : ""} />
              <Dado icon={<Wrench size={13} />} label="Sem estoque" valor={produto.permiteVendaSemEstoque ? "Pode vender" : "Bloqueada"} />
            </div>

            {produto.descricao && (
              /* Borda em cima e a mesma margem lateral das linhas: a descrição
                 é o último item da ficha, não um cartão solto embaixo dela. */
              <div className="border-t border-fg/[0.07] px-3.5 py-2.5">
                <p className="truncate text-[9.5px] uppercase tracking-[0.06em] text-faint">Descrição</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-mist">{produto.descricao}</p>
              </div>
            )}
          </div>
        </Cartao>

        {/* Estoque: as variações e o extrato que as explica, num cartão só.
            É esta coluna que recebe a sobra de altura — ver a nota acima. */}
        <Cartao className="flex min-h-0 flex-col xl:col-span-3">
          <EstoquePainel
            produtoId={String(produto.id)}
            produtoNome={produto.nome}
            imagemProduto={produto.imagem}
            unidade={produto.unidade}
            valorVendaProduto={Number(produto.valorVenda) || 0}
            quantidadeProduto={Number(produto.quantidade) || 0}
            estoqueMinimoProduto={produto.estoqueMinimo ?? null}
            variacoes={variacoes}
            atributos={atributos}
            movimentos={movimentos}
            podeMovimentar={conta}
            permiteVariacoes={!ehInsumo}
            /* Atributos são os eixos das VARIAÇÕES — o cadastro deles pertence
               ao painel que as mostra. Insumo não recebe: sem variações, a
               tela de atributos não muda nada na ficha dele. */
            onAbrirAtributos={ehInsumo ? undefined : () => setModal("atributos")}
            onMudou={carregar}
          />
        </Cartao>
      </section>

      <Modal open={modal === "editar"} onClose={() => setModal(null)} title="Editar item" subtitle="Navegue pelas abas para achar o campo" size="lg" maxWidth="sm:max-w-3xl">
        <ProdutoForm
          submitText="Salvar alterações"
          onCancel={() => setModal(null)}
          onDelete={excluir}
          onSubmit={salvarEdicao}
          /* O saldo é do painel de estoque, logo ali na mesma tela. Duas
             portas para o mesmo número é como as duas divergem. */
          semQuantidade
          /* A ficha já traz as categorias da empresa — ver a nota do campo em
             `fichaProdutoDto`. Buscá-las de novo aqui deixaria o seletor vazio
             pelo tempo de uma requisição, com o modal já aberto. */
          categorias={categorias}
          defaultValues={{
            nome: produto.nome,
            tipo: produto.tipo ?? "PRODUTO",
            valorCompra: produto.valorCompra,
            valorVenda: produto.valorVenda,
            descricao: produto.descricao,
            imagem: produto.imagem,
            sku: produto.sku ?? "",
            codigoBarras: produto.codigoBarras ?? "",
            unidade: produto.unidade ?? "",
            categoriaId: produto.categoriaId ?? "",
            marca: produto.marca ?? "",
            localizacao: produto.localizacao ?? "",
            observacoes: produto.observacoes ?? "",
            estoqueMinimo: produto.estoqueMinimo ?? null,
            controlaEstoque: produto.controlaEstoque ?? true,
            permiteVendaSemEstoque: produto.permiteVendaSemEstoque ?? false,
          }}
        />
      </Modal>

      <Modal
        open={modal === "atributos"}
        onClose={() => setModal(null)}
        title="Atributos"
        subtitle="Os eixos de variação da sua loja — valem para todos os produtos"
        size="lg"
      >
        <AtributosPainel atributos={atributos} onMudou={carregar} />
      </Modal>
    </PageScreen>
  );
};

export default ProdutoDetalhe;
