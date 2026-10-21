import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Package } from "lucide-react";

import useProdutoStore from "@/features/estoque/store/produto.store";
import EstoqueService from "@/features/estoque/services/estoque.service";
import { ehVendavel, nivelEstoque, TIPO_ITEM, tipoDoItem, type NivelEstoque } from "@/shared/domain/produto";
import type ProductType from "@/shared/domain/produto";
import type { Variacao } from "@/shared/domain/estoque";
import { formatCurrency } from "@/shared/utils/currency";

import { Botao, CampoBusca, Carregando, Dado, Folha, Linha, Miniatura, Pilulas, Tela, Vazio } from "@/mobile/ui";
import { normalizar, textoQuantidade } from "@/mobile/util";
import useFolhaNaUrl from "@/mobile/useFolhaNaUrl";

type Filtro = "todos" | "acabando";

const SELO: Record<NivelEstoque, string> = {
  disponivel: "bg-success/[0.12] text-success",
  baixo: "bg-warning/[0.14] text-warning",
  esgotado: "bg-danger/[0.12] text-danger",
  ilimitado: "bg-fg/[0.07] text-mist",
};

/**
 * Consulta de estoque: "tem?" e "quanto custa?".
 *
 * Cadastro, entrada de mercadoria e variações ficam no computador — no celular
 * a pergunta vem do balcão, com o cliente esperando a resposta.
 */
const Estoque = () => {
  const [params] = useSearchParams();
  const { produtos, fetchProdutos, loading, error } = useProdutoStore();

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>(() => (params.get("filtro") === "acabando" ? "acabando" : "todos"));
  const folha = useFolhaNaUrl("produto");

  useEffect(() => {
    void fetchProdutos();
  }, [fetchProdutos]);

  const lista = useMemo(() => {
    const termo = normalizar(busca.trim());

    return produtos
      .filter(ehVendavel)
      .filter((p) => filtro === "todos" || ["baixo", "esgotado"].includes(nivelEstoque(p)))
      .filter((p) => !termo || normalizar(`${p.nome} ${p.sku ?? ""} ${p.codigoBarras ?? ""} ${p.categoria ?? ""}`).includes(termo))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [produtos, busca, filtro]);

  const visiveis = lista.slice(0, 100);
  const aberto = produtos.find((p) => String(p.id) === folha.valor);

  return (
    <Tela titulo="Estoque" subtitulo={`${produtos.filter(ehVendavel).length} itens`}>
      <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Nome, código ou categoria" />

      <div className="mt-3">
        <Pilulas<Filtro>
          valor={filtro}
          aoMudar={setFiltro}
          opcoes={[
            { id: "todos", label: "Todos" },
            { id: "acabando", label: "Acabando" },
          ]}
        />
      </div>

      <div className="-mx-3 mt-2">
        {loading && produtos.length === 0 ? (
          <Carregando />
        ) : error && produtos.length === 0 ? (
          <Vazio icone={<Package size={24} />} titulo="Não deu para carregar" texto={error}>
            <Botao variante="secundario" onClick={() => void fetchProdutos(true)}>
              Tentar de novo
            </Botao>
          </Vazio>
        ) : visiveis.length === 0 ? (
          <Vazio icone={<Package size={24} />} titulo={filtro === "acabando" && !busca ? "Nada acabando" : "Nenhum item encontrado"} />
        ) : (
          visiveis.map((p) => {
            const nivel = nivelEstoque(p);

            return (
              <Linha key={p.id} onClick={() => folha.abrir(String(p.id))}>
                <Miniatura produto={p} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-ink">{p.nome}</span>
                  <span className="block text-[13px] tabular-nums text-mist">{formatCurrency(Number(p.valorVenda) || 0)}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] tabular-nums ${SELO[nivel]}`}>{textoQuantidade(p)}</span>
              </Linha>
            );
          })
        )}
      </div>

      {lista.length > visiveis.length && <p className="mt-3 text-center text-[12px] text-faint">Use a busca para achar os outros {lista.length - visiveis.length}.</p>}

      <FichaProduto produto={aberto} aoFechar={folha.fechar} />
    </Tela>
  );
};

const FichaProduto = ({ produto, aoFechar }: { produto?: ProductType; aoFechar: () => void }) => {
  const [variacoes, setVariacoes] = useState<Variacao[] | null>(null);

  useEffect(() => {
    setVariacoes(null);
    if (!produto?.usaVariacoes) return;

    let vivo = true;
    EstoqueService.variacoes(String(produto.id))
      .then((l) => vivo && setVariacoes(l.filter((v) => v.ativo)))
      .catch(() => vivo && setVariacoes([]));

    return () => {
      vivo = false;
    };
  }, [produto?.id, produto?.usaVariacoes]);

  if (!produto) return null;

  return (
    <Folha aberta aoFechar={aoFechar} titulo={produto.nome} subtitulo={TIPO_ITEM[tipoDoItem(produto)].singular}>
      {produto.imagem && <img src={produto.imagem} alt="" className="mb-3 aspect-[4/3] w-full rounded-2xl bg-fg/[0.05] object-cover" />}

      <div className="flex items-end justify-between rounded-2xl bg-fg/[0.04] p-4">
        <div>
          <p className="text-[12px] text-mist">Preço</p>
          <p className="text-[24px] font-semibold tabular-nums">{formatCurrency(Number(produto.valorVenda) || 0)}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[13px] tabular-nums ${SELO[nivelEstoque(produto)]}`}>{textoQuantidade(produto)}</span>
      </div>

      <div className="mt-2">
        {produto.categoria && <Dado rotulo="Categoria">{produto.categoria}</Dado>}
        {produto.sku && <Dado rotulo="Código">{produto.sku}</Dado>}
        {produto.codigoBarras && <Dado rotulo="Código de barras">{produto.codigoBarras}</Dado>}
        {produto.localizacao && <Dado rotulo="Onde está">{produto.localizacao}</Dado>}
        {produto.marca && <Dado rotulo="Marca">{produto.marca}</Dado>}
      </div>

      {produto.usaVariacoes && (
        <>
          <p className="mb-1 mt-4 text-[13px] font-medium text-mist">Variações</p>
          {variacoes === null ? (
            <Carregando />
          ) : variacoes.length === 0 ? (
            <p className="py-3 text-[13px] text-mist">Nenhuma variação ativa.</p>
          ) : (
            <div className="rounded-2xl bg-fg/[0.04] px-4">
              {variacoes.map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-3 border-b border-fg/[0.06] py-3 last:border-0">
                  <span className="min-w-0">
                    <span className="block truncate text-[14px]">{v.descricao || v.valores.map((x) => x.valor).join(" / ")}</span>
                    <span className="block text-[12px] tabular-nums text-mist">{formatCurrency(Number(v.valorVendaEfetivo ?? v.valorVenda ?? produto.valorVenda) || 0)}</span>
                  </span>
                  <span className={`shrink-0 text-[13px] tabular-nums ${Number(v.quantidade) <= 0 ? "text-danger" : "text-ink"}`}>{Number(v.quantidade) || 0} un</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Folha>
  );
};

export default Estoque;
