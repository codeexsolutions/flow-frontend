import { useMemo } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Boxes, ChevronRight, Coins, FolderTree, Package, PiggyBank, TrendingUp, Wallet } from "lucide-react";

import ProductType, { nivelEstoque, SEM_CATEGORIA, TIPO_ITEM, tipoDoItem, type NivelEstoque } from "@/shared/domain/produto";
import type { Categoria } from "@/shared/domain/estoque";
import { Ranking } from "@/features/dashboard/components/graficos";
import { formatCurrency } from "@/shared/utils/currency";
import { formatNumber } from "@/shared/utils/format";

/**
 * A visão geral do estoque — a aba de cima da tabela, como em Vendas.
 *
 * Os quatro números que moravam numa faixa acima da tabela vieram para cá e
 * ganharam companhia: quanto o estoque vale a preço de venda, quanto de lucro
 * está parado na prateleira, como os itens se dividem entre ok, baixo e
 * esgotado, em que categoria está o dinheiro e o que precisa de compra.
 *
 * Fala do recorte de TIPO escolhido na barra (catálogo, produtos, serviços ou
 * insumos) e de mais nenhum filtro: busca e situação recortam a LISTA, e uma
 * visão geral que mudasse a cada letra digitada deixaria de ser geral.
 */

/* As cores de cada situação — as mesmas do selo da lista. */
const SITUACAO: Record<NivelEstoque, { nome: string; cor: string }> = {
  disponivel: { nome: "Em estoque", cor: "rgb(var(--success))" },
  baixo: { nome: "Estoque baixo", cor: "rgb(var(--warning))" },
  esgotado: { nome: "Esgotado", cor: "rgb(var(--danger))" },
  ilimitado: { nome: "Sem controle", cor: "rgb(var(--fg) / 0.28)" },
};

const ORDEM_SITUACAO: NivelEstoque[] = ["disponivel", "baixo", "esgotado", "ilimitado"];

const TONS = {
  accent: "bg-accent/[0.15] text-accent-soft ring-accent/20",
  success: "bg-success/15 text-success ring-success/20",
  warning: "bg-warning/15 text-warning ring-warning/20",
  danger: "bg-danger/15 text-danger ring-danger/20",
} as const;

const Numero = ({ icon, label, valor, hint, tom = "accent" }: { icon: ReactNode; label: string; valor: string; hint?: string; tom?: keyof typeof TONS }) => (
  <div className="card glass-sheen hud-cantos relative overflow-hidden p-4">
    <div className={`mb-2.5 flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset ${TONS[tom]}`}>{icon}</div>
    <p className="truncate text-[12px] text-mist">{label}</p>
    <p className="nums mt-1 truncate text-[20px] tracking-tight text-ink">{valor}</p>
    {hint && <p className="mt-0.5 truncate text-[11px] text-faint">{hint}</p>}
  </div>
);

const Painel = ({ titulo, subtitulo, icon, children, className = "" }: { titulo: string; subtitulo?: string; icon: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`card glass-sheen hud-cantos relative flex min-w-0 flex-col overflow-hidden ${className}`}>
    <header className="flex items-center gap-2.5 border-b border-fg/[0.07] px-4 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/[0.14] text-accent-soft ring-1 ring-inset ring-accent/20">{icon}</span>
      <span className="min-w-0">
        <h3 className="truncate text-[13.5px] leading-none text-ink">{titulo}</h3>
        {subtitulo && <p className="mt-1 truncate text-[11.5px] text-faint">{subtitulo}</p>}
      </span>
    </header>
    <div className="hud-grade min-h-0 flex-1">{children}</div>
  </section>
);

const Vazio = ({ children }: { children: ReactNode }) => <p className="px-4 py-8 text-center text-[12.5px] text-faint">{children}</p>;

type Props = {
  /** Os itens do tipo escolhido na barra — sem os outros filtros. */
  itens: ProductType[];
  categorias: Categoria[];
  /** "Tudo que você vende", "Produtos", "Insumos"… — o nome do recorte. */
  rotulo: string;
};

const EstoqueVisaoGeral = ({ itens, categorias, rotulo }: Props) => {
  const navigate = useNavigate();

  const d = useMemo(() => {
    /* Quantidade e valores chegam como texto do banco — ver `nivelEstoque`. */
    const qtd = (p: ProductType) => Number(p.quantidade) || 0;
    const custo = (p: ProductType) => Number(p.valorCompra) || 0;
    const venda = (p: ProductType) => Number(p.valorVenda) || 0;

    /* Valor só conta para o que tem unidades: serviço e item sem controle de
       estoque não têm prateleira, e "0 × preço" é zero de qualquer jeito, mas
       quantidade negativa (venda sem estoque) não pode descontar do total. */
    const contaValor = (p: ProductType) => nivelEstoque(p) !== "ilimitado" && qtd(p) > 0;

    const comValor = itens.filter(contaValor);
    const valorCusto = comValor.reduce((a, p) => a + custo(p) * qtd(p), 0);
    const valorVenda = comValor.reduce((a, p) => a + venda(p) * qtd(p), 0);
    const unidades = comValor.reduce((a, p) => a + qtd(p), 0);

    const porSituacao = Object.fromEntries(ORDEM_SITUACAO.map((s) => [s, 0])) as Record<NivelEstoque, number>;
    itens.forEach((p) => (porSituacao[nivelEstoque(p)] += 1));

    const porTipo = { PRODUTO: 0, SERVICO: 0, INSUMO: 0 } as Record<keyof typeof TIPO_ITEM, number>;
    itens.forEach((p) => (porTipo[tipoDoItem(p)] += 1));

    /* Onde está o dinheiro parado, por categoria. */
    const nomeCategoria = new Map(categorias.map((c) => [c.id, c.nome]));
    const porCategoria = new Map<string, { nome: string; valor: number; itens: number }>();
    comValor.forEach((p) => {
      const chave = p.categoriaId ?? "__sem__";
      const atual = porCategoria.get(chave) ?? { nome: (p.categoriaId && nomeCategoria.get(p.categoriaId)) || p.categoria || SEM_CATEGORIA, valor: 0, itens: 0 };
      atual.valor += custo(p) * qtd(p);
      atual.itens += 1;
      porCategoria.set(chave, atual);
    });

    const maiorValor = [...comValor].sort((a, b) => custo(b) * qtd(b) - custo(a) * qtd(a)).slice(0, 6);

    /* Esgotado antes de baixo: é o que já está fazendo perder venda. */
    const atencao = itens
      .filter((p) => ["esgotado", "baixo"].includes(nivelEstoque(p)))
      .sort((a, b) => (nivelEstoque(a) === nivelEstoque(b) ? qtd(a) - qtd(b) : nivelEstoque(a) === "esgotado" ? -1 : 1))
      .slice(0, 8);

    return {
      total: itens.length,
      valorCusto,
      valorVenda,
      lucro: valorVenda - valorCusto,
      margem: valorVenda > 0 ? ((valorVenda - valorCusto) / valorVenda) * 100 : 0,
      unidades,
      porSituacao,
      porTipo,
      categorias: [...porCategoria.values()].sort((a, b) => b.valor - a.valor).slice(0, 6),
      maiorValor: maiorValor.map((p) => ({ nome: p.nome, valor: custo(p) * qtd(p), sub: `${formatNumber(qtd(p))} un.` })),
      atencao,
    };
  }, [itens, categorias]);

  const precisam = d.porSituacao.esgotado + d.porSituacao.baixo;
  const comControle = d.total - d.porSituacao.ilimitado;

  const resumoTipos = (["PRODUTO", "SERVICO", "INSUMO"] as const)
    .filter((t) => d.porTipo[t] > 0)
    .map((t) => `${formatNumber(d.porTipo[t])} ${(d.porTipo[t] === 1 ? TIPO_ITEM[t].singular : TIPO_ITEM[t].plural).toLowerCase()}`)
    .join(" · ");

  return (
    <div className="flex flex-col gap-3">
      {/* Os números */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <Numero icon={<Package size={16} />} label={rotulo} valor={formatNumber(d.total)} hint={resumoTipos || "Nenhum item cadastrado"} />
        <Numero icon={<Wallet size={16} />} label="Valor em estoque" valor={formatCurrency(d.valorCusto)} hint="Pelo preço de custo" />
        <Numero icon={<Coins size={16} />} label="Valor de venda" valor={formatCurrency(d.valorVenda)} hint="Se vender tudo pelo preço atual" tom="success" />
        <Numero
          icon={<PiggyBank size={16} />}
          label="Lucro em estoque"
          valor={formatCurrency(d.lucro)}
          hint={d.valorVenda > 0 ? `Margem de ${d.margem.toFixed(1).replace(".", ",")}%` : "Sem preço de venda"}
          tom="success"
        />
        <Numero icon={<Boxes size={16} />} label="Unidades" valor={formatNumber(d.unidades)} hint="Somando todas as peças" />
        {/* Vermelho só com item esgotado — o único caso em que a venda para.
            "Baixo" é aviso de compra, não emergência. */}
        <Numero
          icon={<AlertTriangle size={16} />}
          label="Precisam de atenção"
          valor={formatNumber(precisam)}
          hint={`${formatNumber(d.porSituacao.esgotado)} esgotados · ${formatNumber(d.porSituacao.baixo)} baixos`}
          tom={d.porSituacao.esgotado > 0 ? "danger" : d.porSituacao.baixo > 0 ? "warning" : "accent"}
        />
      </div>

      {/* Situação e categorias */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Painel titulo="Situação do estoque" subtitulo={`${formatNumber(comControle)} itens com controle de quantidade`} icon={<TrendingUp size={15} />}>
          {d.total === 0 ? (
            <Vazio>Nenhum item cadastrado.</Vazio>
          ) : (
            <div className="flex flex-col gap-4 px-4 py-5">
              {/* Uma barra só, dividida pela situação: as quatro partes somam o
                  catálogo, e a proporção é o que se quer ver de relance. */}
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-fg/[0.06]" role="img" aria-label="Divisão dos itens por situação do estoque">
                {ORDEM_SITUACAO.filter((s) => d.porSituacao[s] > 0).map((s) => (
                  <span
                    key={s}
                    title={`${SITUACAO[s].nome}: ${d.porSituacao[s]}`}
                    className="h-full border-r-2 border-surface transition-[width] duration-700 last:border-r-0"
                    style={{ width: `${(d.porSituacao[s] / d.total) * 100}%`, background: SITUACAO[s].cor }}
                  />
                ))}
              </div>

              <ul className="grid grid-cols-2 gap-2">
                {ORDEM_SITUACAO.map((s) => (
                  <li key={s} className="flex items-center gap-2.5 rounded-xl border border-fg/[0.07] bg-fg/[0.025] px-3 py-2.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SITUACAO[s].cor }} />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-mist">{SITUACAO[s].nome}</span>
                    <span className="nums text-[14px] text-ink">{formatNumber(d.porSituacao[s])}</span>
                    <span className="nums w-10 text-right text-[11px] text-faint">{Math.round((d.porSituacao[s] / d.total) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Painel>

        <Painel titulo="Valor por categoria" subtitulo="Onde está o dinheiro do estoque, a preço de custo" icon={<FolderTree size={15} />}>
          {d.categorias.length === 0 ? (
            <Vazio>Nenhum item com quantidade em estoque.</Vazio>
          ) : (
            <Ranking
              formatar={formatCurrency}
              itens={d.categorias.map((c) => ({ nome: c.nome, valor: c.valor, sub: `${formatNumber(c.itens)} ${c.itens === 1 ? "item" : "itens"}` }))}
            />
          )}
        </Painel>
      </div>

      {/* Dinheiro parado e reposição */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Painel titulo="Maior valor parado" subtitulo="Os itens que mais seguram dinheiro na prateleira" icon={<Wallet size={15} />}>
          {d.maiorValor.length === 0 ? <Vazio>Nenhum item com quantidade em estoque.</Vazio> : <Ranking formatar={formatCurrency} itens={d.maiorValor} />}
        </Painel>

        <Painel titulo="Precisam de reposição" subtitulo="Esgotados primeiro, depois os de estoque baixo" icon={<AlertTriangle size={15} />}>
          {d.atencao.length === 0 ? (
            <Vazio>Nada para repor agora. 👌</Vazio>
          ) : (
            <ul>
              {d.atencao.map((p) => {
                const esgotado = nivelEstoque(p) === "esgotado";

                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/estoque/${p.id}`)}
                      className="group flex w-full cursor-pointer items-center gap-3 border-b border-fg/[0.04] px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-fg/[0.03]"
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${esgotado ? "bg-danger/15 text-danger ring-danger/20" : "bg-warning/15 text-warning ring-warning/20"}`}>
                        <AlertTriangle size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-ink">{p.nome}</span>
                        <span className="block truncate text-[11px] text-faint">{p.categoria || SEM_CATEGORIA}</span>
                      </span>
                      <span className={`nums shrink-0 text-[13px] ${esgotado ? "text-danger" : "text-warning"}`}>{formatNumber(Number(p.quantidade) || 0)} un.</span>
                      <ChevronRight size={14} className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Painel>
      </div>
    </div>
  );
};

export default EstoqueVisaoGeral;
