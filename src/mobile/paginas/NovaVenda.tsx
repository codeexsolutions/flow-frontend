import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, ChevronRight, Loader2, Minus, Package, Plus, Share2, ShoppingCart, Trash2, User, UserPlus } from "lucide-react";

import "@/features/vendas/services/filaVendas";
import type { LinhaNaFila, NotaNaFila, PagamentoNaFila } from "@/features/vendas/services/filaVendas";
import useVendaStore from "@/features/vendas/store/venda.store";
import useClienteStore from "@/features/clientes/store/cliente.store";
import useProdutoStore from "@/features/estoque/store/produto.store";
import EstoqueService from "@/features/estoque/services/estoque.service";
import { aguardar, enfileirar, novoId } from "@/shared/fila/filaEnvio";
import { ehVendavel, nivelEstoque } from "@/shared/domain/produto";
import type ProductType from "@/shared/domain/produto";
import type { Variacao } from "@/shared/domain/estoque";
import { FORMAS } from "@/shared/ui/PagamentoForm";
import MoneyInput from "@/shared/ui/inputs/MoneyInput";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import { formatCurrency } from "@/shared/utils/currency";

import { Avatar, Botao, CampoBusca, Carregando, Folha, Linha, Miniatura, Tela, Vazio } from "@/mobile/ui";
import { normalizar, telefoneDo, textoQuantidade } from "@/mobile/util";
import NovoCliente from "@/mobile/paginas/NovoCliente";
import NotaMobile from "@/mobile/NotaMobile";
import useCompartilharNota from "@/mobile/useCompartilharNota";
import type { PedidoClienteType } from "@/shared/domain/pedido";

type ItemCarrinho = {
  chave: string;
  produto: ProductType;
  variacao?: Variacao;
  quantidade: number;
  preco: number;
};

/** Quanto dá para vender deste item; `Infinity` quando o estoque não trava. */
const limiteDe = (produto: ProductType, variacao?: Variacao) => {
  if (produto.controlaEstoque === false || produto.tipo === "SERVICO" || produto.permiteVendaSemEstoque) return Infinity;

  return Math.max(0, Number(variacao ? variacao.quantidade : produto.quantidade) || 0);
};

/**
 * Venda no celular, em três toques: produtos, cliente, receber.
 *
 * O carrinho fica embaixo, sempre à vista, com o total. A venda sobe pela
 * mesma fila do computador: sem internet ela espera e sobe sozinha, e o
 * pagamento vai logo atrás dela.
 */
const NovaVenda = () => {
  const navigate = useNavigate();
  const alert = useAlert();
  const [params] = useSearchParams();

  const { produtos, fetchProdutos, loading } = useProdutoStore();
  const { clientes, fetchClientes } = useClienteStore();
  const fetchVendas = useVendaStore((s) => s.fetchVendas);
  const vendas = useVendaStore((s) => s.vendas);
  const { compartilhar, ocupado, noEscondido } = useCompartilharNota();

  const [busca, setBusca] = useState("");
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [clienteId, setClienteId] = useState<string | null>(() => params.get("cliente"));

  const [escolhendoVariacao, setEscolhendoVariacao] = useState<ProductType | null>(null);
  const [escolhendoCliente, setEscolhendoCliente] = useState(false);
  const [cadastrando, setCadastrando] = useState(false);
  const [finalizando, setFinalizando] = useState(false);

  const [receberAgora, setReceberAgora] = useState(true);
  const [forma, setForma] = useState("Pix");
  const [valorRecebido, setValorRecebido] = useState(0);

  const [concluida, setConcluida] = useState<PedidoClienteType | null>(null);

  useEffect(() => {
    void fetchProdutos();
    void fetchClientes();
  }, [fetchProdutos, fetchClientes]);

  const cliente = clientes.find((c) => String(c.id) === clienteId);
  const total = carrinho.reduce((a, i) => a + i.preco * i.quantidade, 0);
  const pecas = carrinho.reduce((a, i) => a + i.quantidade, 0);

  /* Abrir o "receber" já com o total: quitar na hora é o caso comum. */
  useEffect(() => {
    if (finalizando) setValorRecebido(total);
  }, [finalizando, total]);

  const catalogo = useMemo(() => {
    const termo = normalizar(busca.trim());

    return produtos
      .filter(ehVendavel)
      .filter((p) => !termo || normalizar(`${p.nome} ${p.sku ?? ""} ${p.codigoBarras ?? ""}`).includes(termo))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      .slice(0, 60);
  }, [produtos, busca]);

  const adicionar = (produto: ProductType, variacao?: Variacao) => {
    const chave = `${produto.id}:${variacao?.id ?? ""}`;
    const limite = limiteDe(produto, variacao);
    const atual = carrinho.find((i) => i.chave === chave)?.quantidade ?? 0;

    if (atual + 1 > limite) {
      alert.warning("Sem estoque", limite === 0 ? `${produto.nome} está esgotado.` : `Só há ${limite} em estoque.`);
      return;
    }

    alert.toast("success", "Adicionado ao carrinho", `${produto.nome}${variacao?.descricao ? ` (${variacao.descricao})` : ""}`, { position: "top", timer: 1400 });

    setCarrinho((c) =>
      c.some((i) => i.chave === chave)
        ? c.map((i) => (i.chave === chave ? { ...i, quantidade: i.quantidade + 1 } : i))
        : [...c, { chave, produto, variacao, quantidade: 1, preco: Number(variacao?.valorVendaEfetivo ?? variacao?.valorVenda ?? produto.valorVenda) || 0 }],
    );
  };

  const tocarProduto = (p: ProductType) => (p.usaVariacoes ? setEscolhendoVariacao(p) : adicionar(p));

  const mudarQuantidade = async (chave: string, delta: number) => {
    const item = carrinho.find((i) => i.chave === chave);

    /* Tirar o último é apagar a linha: pergunta antes, porque o toque no
       lixinho fica colado no "−" e escapa fácil. */
    if (item && item.quantidade + delta <= 0) {
      const { confirmed } = await alert.confirm("Tirar do carrinho?", item.produto.nome, { confirmText: "Tirar", cancelText: "Manter" });
      if (!confirmed) return;
    }

    setCarrinho((c) =>
      c
        .map((i) => {
          if (i.chave !== chave) return i;

          const nova = i.quantidade + delta;
          if (nova > limiteDe(i.produto, i.variacao)) {
            alert.warning("Sem estoque", "Não há mais unidades deste item.");
            return i;
          }

          return { ...i, quantidade: nova };
        })
        .filter((i) => i.quantidade > 0),
    );
  };

  const confirmar = async () => {
    if (!cliente?.id || carrinho.length === 0) return;

    const pagoAgora = receberAgora ? Math.min(valorRecebido, total) : 0;
    const { confirmed } = await alert.confirm(
      "Concluir a venda?",
      `${formatCurrency(total)} para ${cliente.nome}${pagoAgora > 0 ? ` · recebendo ${formatCurrency(pagoAgora)} em ${forma}` : " · a receber"}`,
      { confirmText: "Concluir", cancelText: "Voltar" },
    );
    if (!confirmed) return;

    const itens: LinhaNaFila[] = carrinho.map((i) => ({
      produtoId: String(i.produto.id),
      nomeProduto: i.produto.nome,
      quantidade: i.quantidade,
      valorVenda: i.preco,
      variacaoId: i.variacao?.id ?? null,
    }));

    const pago = receberAgora ? Math.min(valorRecebido, total) : 0;
    const quitada = pago >= total - 0.004;

    const nota: NotaNaFila = {
      id: novoId(),
      clienteId: String(cliente.id),
      itens,
      imagensServico: [],
      mostrarQr: !quitada,
      valorQr: null,
    };

    const tarefaNota = enfileirar("nota.criar", nota, `A venda de ${cliente.nome}`);
    const esperas = [aguardar(tarefaNota)];

    if (pago > 0) {
      const pagamento: PagamentoNaFila = { id: novoId(), pedidoId: nota.id, valor: pago, formaPagamento: forma };
      esperas.push(aguardar(enfileirar("nota.pagar", pagamento, `O pagamento de ${formatCurrency(pago)} da venda de ${cliente.nome}`, tarefaNota)));
    }

    /* Otimista, como no computador: a tela de "venda feita" aparece já, e a
       recusa do servidor — se vier — chega como aviso. */
    Promise.all(esperas)
      .then(() => fetchVendas(true))
      .catch((err) => alert.error(getErrorTitle(err), extractErrorMessage(err, "A venda não foi aceita pelo servidor.")));

    /* A venda como o servidor vai devolvê-la, montada daqui: a nota aparece na
       hora, mesmo sem internet. Quando a lista recarrega, a do servidor toma
       o lugar desta (mesmo id). */
    const local: PedidoClienteType = {
      clienteId: String(cliente.id),
      nomeCliente: cliente.nome,
      statusCliente: String(cliente.status ?? ""),
      codigoEmpresa: "",
      pedido: {
        pedidoId: nota.id,
        totalPedido: total,
        dataPedido: new Date(),
        pedidoStatus: quitada ? "PAGO" : "ABERTO",
        valorPago: pago,
        formaPagamento: pago > 0 ? forma : null,
        mostrarQr: nota.mostrarQr,
        valorQr: null,
        itensPedido: carrinho.map((i) => ({
          itemPedidoId: i.chave,
          quantidadeItem: i.quantidade,
          valorVendaItem: i.preco,
          variacaoId: i.variacao?.id ?? null,
          variacaoDescricao: i.variacao?.descricao,
          produto: { produtoId: String(i.produto.id), nomeProduto: i.produto.nome, valorProduto: Number(i.produto.valorVenda) || i.preco },
        })),
      },
    };

    setFinalizando(false);
    setConcluida(local);
    alert.toast("success", "Venda registrada!", pago > 0 && !quitada ? `Falta receber ${formatCurrency(total - pago)}.` : undefined, { position: "top" });
  };

  const recomecar = () => {
    setCarrinho([]);
    setClienteId(null);
    setBusca("");
    setReceberAgora(true);
    setConcluida(null);
  };

  if (concluida) {
    const venda = vendas.find((v) => v.pedido.pedidoId === concluida.pedido.pedidoId) ?? concluida;

    return (
      <Tela
        titulo="Venda registrada"
        rodape={
          <div className="flex flex-col gap-2">
            <Botao className="w-full" disabled={ocupado} onClick={() => void compartilhar(venda)}>
              {ocupado ? <Loader2 size={18} className="animate-spin" /> : <Share2 size={18} />}
              Compartilhar nota
            </Botao>
            <div className="grid grid-cols-2 gap-2">
              <Botao variante="secundario" onClick={recomecar}>
                <Plus size={18} /> Nova venda
              </Botao>
              <Botao variante="secundario" onClick={() => navigate("/vendas")}>
                Ver vendas
              </Botao>
            </div>
          </div>
        }
      >
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-success/[0.14] text-success" style={{ animation: "m-pop .35s cubic-bezier(.22,.61,.36,1) both" }}>
            <Check size={24} strokeWidth={2.6} />
          </span>
          <p className="text-[15px] text-mist">Venda feita! Mostre a nota ao cliente ou mande para ele.</p>
        </div>

        <NotaMobile venda={venda} />
        {noEscondido}
      </Tela>
    );
  }

  return (
    <Tela
      titulo="Nova venda"
      rodape={
        <button
          type="button"
          disabled={carrinho.length === 0}
          onClick={() => setFinalizando(true)}
          className="flex h-14 w-full items-center gap-3 rounded-2xl bg-accent px-4 text-white transition-transform active:scale-[0.99] disabled:bg-fg/[0.08] disabled:text-faint"
        >
          <span className="relative">
            <ShoppingCart size={22} />
            {pecas > 0 && <span className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-[11px] font-semibold text-accent-strong">{pecas}</span>}
          </span>
          <span className="flex-1 text-left text-[15px] font-medium">{carrinho.length === 0 ? "Toque nos produtos para adicionar" : "Continuar"}</span>
          {carrinho.length > 0 && <span className="text-[16px] font-semibold tabular-nums">{formatCurrency(total)}</span>}
        </button>
      }
    >
      <button type="button" onClick={() => setEscolhendoCliente(true)} className="flex w-full items-center gap-3 rounded-2xl bg-surface p-3 text-left active:bg-fg/[0.06]">
        {cliente ? (
          <Avatar nome={cliente.nome} />
        ) : (
          <span className="grid h-10 w-10 place-items-center rounded-full bg-fg/[0.07] text-mist">
            <User size={18} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] text-mist">Cliente</span>
          <span className={`block truncate text-[15px] ${cliente ? "text-ink" : "text-accent-soft"}`}>{cliente?.nome ?? "Escolher cliente"}</span>
        </span>
        <ChevronRight size={18} className="text-faint" />
      </button>

      <div className="mt-4">
        <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Buscar produto ou código" />
      </div>

      <div className="-mx-3 mt-2">
        {loading && produtos.length === 0 ? (
          <Carregando />
        ) : catalogo.length === 0 ? (
          <Vazio icone={<Package size={24} />} titulo={busca ? "Nenhum produto encontrado" : "Nenhum produto cadastrado"} texto="Produtos são cadastrados no computador." />
        ) : (
          catalogo.map((p) => {
            const noCarrinho = carrinho.filter((i) => i.produto.id === p.id).reduce((a, i) => a + i.quantidade, 0);
            const esgotado = nivelEstoque(p) === "esgotado" && !p.permiteVendaSemEstoque && !p.usaVariacoes;

            return (
              <Linha key={p.id} onClick={() => tocarProduto(p)}>
                <Miniatura produto={p} />
                <span className={`min-w-0 flex-1 ${esgotado ? "opacity-50" : ""}`}>
                  <span className="block truncate text-[15px] text-ink">{p.nome}</span>
                  <span className="block text-[12px] tabular-nums text-mist">
                    {formatCurrency(Number(p.valorVenda) || 0)} · {textoQuantidade(p)}
                  </span>
                </span>
                {noCarrinho > 0 ? (
                  <span className="grid h-9 min-w-9 place-items-center rounded-full bg-accent px-2 text-[14px] font-semibold text-white">{noCarrinho}</span>
                ) : (
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-accent/[0.12] text-accent-soft">
                    <Plus size={18} />
                  </span>
                )}
              </Linha>
            );
          })
        )}
      </div>

      {/* ── Escolher variação ── */}
      <EscolherVariacao
        produto={escolhendoVariacao}
        aoFechar={() => setEscolhendoVariacao(null)}
        aoEscolher={(v) => {
          if (escolhendoVariacao) adicionar(escolhendoVariacao, v);
          setEscolhendoVariacao(null);
        }}
      />

      {/* ── Escolher cliente ── */}
      <EscolherCliente
        aberta={escolhendoCliente}
        aoFechar={() => setEscolhendoCliente(false)}
        aoEscolher={(id) => {
          setClienteId(id);
          setEscolhendoCliente(false);
          const nome = clientes.find((c) => String(c.id) === id)?.nome;
          if (nome) alert.toast("info", "Cliente da venda", nome, { position: "top", timer: 1600 });
        }}
        aoCadastrar={() => {
          setEscolhendoCliente(false);
          setCadastrando(true);
        }}
      />
      <NovoCliente aberta={cadastrando} aoFechar={() => setCadastrando(false)} aoCriar={(id) => setClienteId(id)} />

      {/* ── Finalizar ── */}
      <Folha
        aberta={finalizando}
        aoFechar={() => setFinalizando(false)}
        titulo="Finalizar venda"
        subtitulo={`${pecas} ${pecas === 1 ? "item" : "itens"}`}
        rodape={
          !cliente ? (
            <Botao
              className="w-full"
              onClick={() => {
                setFinalizando(false);
                setEscolhendoCliente(true);
              }}
            >
              <User size={18} /> Escolher o cliente
            </Botao>
          ) : (
            <Botao className="w-full" disabled={carrinho.length === 0 || (receberAgora && valorRecebido <= 0)} onClick={() => void confirmar()}>
              <Check size={18} /> Concluir venda · {formatCurrency(total)}
            </Botao>
          )
        }
      >
        <div className="rounded-2xl bg-fg/[0.04] px-3">
          {carrinho.map((i) => (
            <div key={i.chave} className="flex items-center gap-3 border-b border-fg/[0.06] py-3 last:border-0">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px]">{i.produto.nome}</span>
                <span className="block text-[12px] tabular-nums text-mist">
                  {i.variacao?.descricao ? `${i.variacao.descricao} · ` : ""}
                  {formatCurrency(i.preco * i.quantidade)}
                </span>
              </span>
              <div className="flex shrink-0 items-center rounded-full bg-fg/[0.07]">
                <button type="button" aria-label="Menos um" onClick={() => void mudarQuantidade(i.chave, -1)} className="grid h-10 w-10 place-items-center rounded-full text-mist active:bg-fg/[0.1]">
                  {i.quantidade === 1 ? <Trash2 size={16} className="text-danger" /> : <Minus size={16} />}
                </button>
                <span className="w-7 text-center text-[15px] font-medium tabular-nums">{i.quantidade}</span>
                <button type="button" aria-label="Mais um" onClick={() => void mudarQuantidade(i.chave, 1)} className="grid h-10 w-10 place-items-center rounded-full text-mist active:bg-fg/[0.1]">
                  <Plus size={16} />
                </button>
              </div>
            </div>
          ))}
          {carrinho.length === 0 && <p className="py-4 text-center text-[13px] text-mist">O carrinho está vazio.</p>}
        </div>

        <div className="mt-3 flex items-center justify-between px-1">
          <span className="text-[14px] text-mist">Total</span>
          <span className="text-[22px] font-semibold tabular-nums">{formatCurrency(total)}</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-fg/[0.06] p-1">
          {[
            { id: true, label: "Receber agora" },
            { id: false, label: "Receber depois" },
          ].map((o) => (
            <button
              key={String(o.id)}
              type="button"
              onClick={() => setReceberAgora(o.id)}
              className={`h-10 rounded-xl text-[14px] transition-colors ${receberAgora === o.id ? "bg-surface text-ink shadow-sm" : "text-mist"}`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {receberAgora ? (
          <div className="pb-2">
            <div className="mt-4 grid grid-cols-3 gap-2">
              {FORMAS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setForma(f.id)}
                  className={`flex h-16 flex-col items-center justify-center gap-1 rounded-2xl text-[12px] transition-colors ${forma === f.id ? "bg-accent text-white" : "bg-fg/[0.06] text-mist"}`}
                >
                  <f.icone size={18} />
                  {f.label}
                </button>
              ))}
            </div>

            <p className="mb-1.5 mt-4 text-[13px] text-mist">Valor recebido</p>
            <MoneyInput value={valorRecebido} onChange={setValorRecebido} className="h-14 w-full rounded-2xl bg-fg/[0.06] px-4 text-[20px] font-semibold text-ink outline-none focus:ring-2 focus:ring-accent/40" />
            {valorRecebido > 0 && valorRecebido < total - 0.004 && <p className="mt-2 text-[13px] text-warning">Fica faltando {formatCurrency(total - valorRecebido)} — a venda vai para "A receber".</p>}
            {valorRecebido > total + 0.004 && <p className="mt-2 text-[13px] text-success">Troco: {formatCurrency(valorRecebido - total)}</p>}
          </div>
        ) : (
          <p className="mt-4 pb-2 text-[13px] text-mist">A venda fica em "A receber" e o pagamento pode ser registrado depois, em Vendas.</p>
        )}
      </Folha>
    </Tela>
  );
};

const EscolherVariacao = ({ produto, aoFechar, aoEscolher }: { produto: ProductType | null; aoFechar: () => void; aoEscolher: (v: Variacao) => void }) => {
  const [variacoes, setVariacoes] = useState<Variacao[] | null>(null);

  useEffect(() => {
    setVariacoes(null);
    if (!produto) return;

    let vivo = true;
    EstoqueService.variacoes(String(produto.id))
      .then((l) => vivo && setVariacoes(l.filter((v) => v.ativo)))
      .catch(() => vivo && setVariacoes([]));

    return () => {
      vivo = false;
    };
  }, [produto]);

  return (
    <Folha aberta={!!produto} aoFechar={aoFechar} titulo={produto?.nome ?? ""} subtitulo="Escolha a variação">
      {variacoes === null ? (
        <Carregando />
      ) : variacoes.length === 0 ? (
        <p className="py-6 text-center text-[14px] text-mist">Nenhuma variação ativa.</p>
      ) : (
        <div className="-mx-3">
          {variacoes.map((v) => {
            const semEstoque = produto ? limiteDe(produto, v) === 0 : false;

            return (
              <Linha key={v.id} onClick={() => aoEscolher(v)}>
                <span className={`min-w-0 flex-1 ${semEstoque ? "opacity-50" : ""}`}>
                  <span className="block text-[15px]">{v.descricao || v.valores.map((x) => x.valor).join(" / ")}</span>
                  <span className="block text-[12px] tabular-nums text-mist">
                    {formatCurrency(Number(v.valorVendaEfetivo ?? v.valorVenda ?? produto?.valorVenda) || 0)} · {Number(v.quantidade) || 0} un
                  </span>
                </span>
                <span className="grid h-9 w-9 place-items-center rounded-full bg-accent/[0.12] text-accent-soft">
                  <Plus size={18} />
                </span>
              </Linha>
            );
          })}
        </div>
      )}
    </Folha>
  );
};

const EscolherCliente = ({ aberta, aoFechar, aoEscolher, aoCadastrar }: { aberta: boolean; aoFechar: () => void; aoEscolher: (id: string) => void; aoCadastrar: () => void }) => {
  const clientes = useClienteStore((s) => s.clientes);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (aberta) setBusca("");
  }, [aberta]);

  const lista = useMemo(() => {
    const termo = normalizar(busca.trim());

    return clientes
      .filter((c) => !termo || normalizar(`${c.nome} ${telefoneDo(c)}`).includes(termo))
      .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"))
      .slice(0, 50);
  }, [clientes, busca]);

  return (
    <Folha aberta={aberta} aoFechar={aoFechar} titulo="Cliente da venda">
      <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Buscar cliente" />

      <button type="button" onClick={aoCadastrar} className="mt-2 flex min-h-[56px] w-full items-center gap-3 rounded-2xl px-1 text-left text-accent-soft active:bg-fg/[0.06]">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-accent/[0.12]">
          <UserPlus size={18} />
        </span>
        <span className="text-[15px]">Cadastrar novo cliente</span>
      </button>

      <div className="-mx-3">
        {lista.map((c) => (
          <Linha key={c.id} onClick={() => aoEscolher(String(c.id))}>
            <Avatar nome={c.nome ?? "?"} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] text-ink">{c.nome}</span>
              <span className="block truncate text-[12px] text-mist">{telefoneDo(c) || "Sem telefone"}</span>
            </span>
          </Linha>
        ))}
        {lista.length === 0 && <p className="py-6 text-center text-[14px] text-mist">Ninguém com esse nome.</p>}
      </div>
    </Folha>
  );
};

export default NovaVenda;
