import { useEffect, useState } from "react";
import { Factory, Loader2, Mail, MapPin, Phone, Receipt, UserRound, X } from "lucide-react";

import sysgrafix from "@/shared/api/sysgrafix";
import type { Conversa } from "@/features/crm/services/crm.service";
import ClientService from "@/features/clientes/services/client.service";
import type ClientType from "@/shared/domain/cliente";
import type { PedidoClienteType } from "@/shared/domain/pedido";
import { totalDoPedido } from "@/features/vendas/store/venda.store";
import { formatCurrency } from "@/shared/utils/currency";

/**
 * O que este cliente tem com a loja — SEM sair da conversa.
 *
 * ---------------------------------------------------------------------------
 * Por que um painel e não um link
 * ---------------------------------------------------------------------------
 * A pergunta que mais chega no WhatsApp de uma loja é "e o meu pedido?". A
 * resposta estava em outra tela: quem atendia tinha de abrir Clientes ou
 * Produção, procurar, ler, voltar e reencontrar a conversa — e enquanto isso o
 * cliente esperava, vendo "digitando…" sumir.
 *
 * Este painel abre POR CIMA da conversa, com a conversa visível ao lado no
 * desktop. Ler e responder passam a ser o mesmo gesto.
 *
 * ---------------------------------------------------------------------------
 * As três perguntas, nesta ordem
 * ---------------------------------------------------------------------------
 * 1. **quem é** — o cadastro, para confirmar que se está falando com quem se
 *    pensa;
 * 2. **o que está em produção** — a resposta ao "e o meu pedido?";
 * 3. **o que já comprou** — o histórico, que diz se é cliente de casa.
 *
 * A produção vem antes das compras de propósito: é a pergunta urgente. O
 * histórico é contexto, e contexto pode esperar a rolagem.
 */

/** Uma linha de planilha em que o nome do cliente aparece. */
type LinhaProducao = {
  id: string;
  competencia: string;
  planilha: string;
  planilha_id: string;
  celulas: { coluna: string; valor: string }[] | null;
};

const dados = <T,>(r: { data?: { data?: T[] } }): T[] => r.data?.data ?? [];

const dataBr = (iso?: string | null) =>
  iso ? new Date(String(iso).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "—";

type Props = {
  conversa: Conversa;
  onFechar: () => void;
  /** Abre a nota de uma venda existente, por cima — ver `Conversa`. */
  onAbrirNota: (pedidoId: string) => void;
  /**
   * O painel dentro de OUTRA moldura — a janela da ficha (ver `CartaoContato`).
   *
   * Sem isto ele desenha a coluna de 320px com borda à esquerda e o próprio
   * cabeçalho: dentro do modal, viraria uma faixa estreita encostada na
   * borda, com o nome do contato dito duas vezes e dois botões de fechar.
   * Embutido, ele é só o conteúdo — quem dá moldura, título e saída é a
   * janela.
   */
  embutida?: boolean;
};

const PainelCliente = ({ conversa, onFechar, onAbrirNota, embutida = false }: Props) => {
  const [cliente, setCliente] = useState<ClientType | null>(null);
  const [producao, setProducao] = useState<LinhaProducao[]>([]);
  const [compras, setCompras] = useState<PedidoClienteType[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;

    setCarregando(true);

    /*
     * As três consultas juntas, e nenhuma derruba as outras.
     *
     * `allSettled` e não `all`: contato sem cadastro não tem ficha nem
     * compras, e um 404 ali não pode esconder a produção — que é justamente a
     * informação que o contato sem cadastro costuma ter (ele mandou fazer
     * antes de virar cliente).
     */
    const pedidos: Promise<unknown> = conversa.cliente_fk
      ? sysgrafix.get(`/pedidos/cliente/${conversa.cliente_fk}`, { carregamento: false })
      : Promise.resolve(null);

    const ficha: Promise<unknown> = conversa.cliente_fk
      ? ClientService.getById(String(conversa.cliente_fk))
      : Promise.resolve(null);

    void Promise.allSettled([
      ficha,
      sysgrafix.get(`/crm/contatos/${conversa.contato_id}/producao`, { carregamento: false }),
      pedidos,
    ]).then(([f, p, c]) => {
      if (!vivo) return;

      if (f.status === "fulfilled" && f.value) setCliente(dados<ClientType>(f.value as never)[0] ?? null);
      if (p.status === "fulfilled") setProducao(dados<LinhaProducao>(p.value as never));
      if (c.status === "fulfilled" && c.value) setCompras(dados<PedidoClienteType>(c.value as never));

      setCarregando(false);
    });

    return () => {
      vivo = false;
    };
  }, [conversa.contato_id, conversa.cliente_fk]);

  const contato = cliente?.contato;

  return (
    <aside
      className={
        embutida
          ? "flex h-full min-h-0 w-full flex-col"
          : "flex h-full min-h-0 w-full flex-col border-l border-fg/[0.06] bg-surface/40 lg:w-[320px] lg:shrink-0"
      }
    >
      {!embutida && (
      <header className="flex shrink-0 items-center gap-2 border-b border-fg/[0.06] px-3 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-accent/25 bg-accent/[0.12] text-accent-soft">
          {conversa.foto ? <img src={conversa.foto} alt="" className="h-full w-full object-cover" /> : <UserRound size={14} />}
        </span>

        <p className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{conversa.nome}</p>

        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar o painel"
          className="focus-ring flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-mist transition-colors hover:bg-fg/[0.06] hover:text-ink"
        >
          <X size={14} />
        </button>
      </header>
      )}

      {carregando ? (
        <div className="flex flex-1 items-center justify-center text-faint">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : (
        <div className={`min-h-0 flex-1 space-y-4 overflow-y-auto ${embutida ? "p-0" : "p-3"}`}>
          {/* ---------------- Quem é ---------------- */}
          <section>
            <p className="mb-1.5 text-[10.5px] uppercase tracking-[0.1em] text-faint">Cadastro</p>

            {cliente ? (
              <div className="space-y-1.5 rounded-xl border border-fg/[0.06] bg-fg/[0.02] p-2.5">
                <p className="text-[12.5px] text-ink">{cliente.nome}</p>

                {(contato?.whatsapp || contato?.celular || contato?.telefone) && (
                  <p className="flex items-center gap-1.5 text-[11.5px] text-mist">
                    <Phone size={11} className="shrink-0 text-faint" />
                    {contato.whatsapp || contato.celular || contato.telefone}
                  </p>
                )}

                {contato?.email && (
                  <p className="flex items-center gap-1.5 truncate text-[11.5px] text-mist">
                    <Mail size={11} className="shrink-0 text-faint" /> {contato.email}
                  </p>
                )}

                {(cliente.endereco?.cidade || cliente.endereco?.logradouro) && (
                  <p className="flex items-center gap-1.5 text-[11.5px] text-mist">
                    <MapPin size={11} className="shrink-0 text-faint" />
                    {[cliente.endereco?.logradouro, cliente.endereco?.numero, cliente.endereco?.cidade]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}

                {cliente.cpfCnpj && <p className="text-[11px] text-faint">{cliente.cpfCnpj}</p>}
              </div>
            ) : (
              /* Sem cadastro não é erro: é o estado normal de quem acabou de
                 escrever. O botão de cadastrar está no cabeçalho da conversa. */
              <p className="rounded-xl border border-fg/[0.06] bg-fg/[0.02] p-2.5 text-[11.5px] leading-relaxed text-mist">
                Esta pessoa ainda não tem cadastro. Use <span className="text-ink">Cadastrar</span>, no cabeçalho da
                conversa, para criar a ficha dela com o que a conversa já sabe.
              </p>
            )}
          </section>

          {/* ---------------- Produção ---------------- */}
          <section>
            <p className="mb-1.5 flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.1em] text-faint">
              <Factory size={11} /> Produção
              {producao.length > 0 && <span className="text-mist">· {producao.length}</span>}
            </p>

            {producao.length === 0 ? (
              <p className="rounded-xl border border-fg/[0.06] bg-fg/[0.02] p-2.5 text-[11.5px] text-mist">
                Nada em produção com este nome.
              </p>
            ) : (
              <div className="space-y-1.5">
                {producao.map((l) => (
                  <div key={l.id} className="rounded-xl border border-fg/[0.06] bg-fg/[0.02] p-2.5">
                    <p className="flex items-center justify-between gap-2 text-[11.5px] text-ink">
                      <span className="min-w-0 truncate">{l.planilha}</span>
                      <span className="shrink-0 text-[10.5px] text-faint">{dataBr(l.competencia)}</span>
                    </p>

                    {/* As células preenchidas, em pares. Limitadas a quatro: o
                        painel é uma resposta rápida, não a planilha inteira. */}
                    {l.celulas && l.celulas.length > 0 && (
                      <div className="mt-1.5 space-y-0.5">
                        {l.celulas.slice(0, 4).map((c, i) => (
                          <p key={`${l.id}-${i}`} className="flex gap-1.5 text-[11px]">
                            <span className="shrink-0 text-faint">{c.coluna}:</span>
                            <span className="min-w-0 truncate text-mist">{c.valor}</span>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ---------------- Compras ---------------- */}
          <section>
            <p className="mb-1.5 flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.1em] text-faint">
              <Receipt size={11} /> Compras
              {compras.length > 0 && <span className="text-mist">· {compras.length}</span>}
            </p>

            {compras.length === 0 ? (
              <p className="rounded-xl border border-fg/[0.06] bg-fg/[0.02] p-2.5 text-[11.5px] text-mist">
                {conversa.cliente_fk ? "Ainda não comprou." : "Sem cadastro, não há compras para mostrar."}
              </p>
            ) : (
              <div className="space-y-1.5">
                {compras.slice(0, 10).map((v) => (
                  <button
                    key={v.pedido.pedidoId}
                    type="button"
                    onClick={() => onAbrirNota(v.pedido.pedidoId)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-fg/[0.06] bg-fg/[0.02] p-2.5 text-left transition-colors hover:border-accent/30"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-[10.5px] text-faint">
                        #{v.pedido.pedidoId?.slice(-6).toUpperCase()}
                      </span>
                      <span className="block text-[11px] text-mist">{dataBr(String(v.pedido.dataPedido))}</span>
                    </span>
                    <span className="shrink-0 text-[12px] tabular-nums text-ink">
                      {formatCurrency(totalDoPedido(v))}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </aside>
  );
};

export default PainelCliente;
