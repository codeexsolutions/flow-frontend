import { useEffect, useMemo, useState } from "react";
import { FileText, Link2, Loader2, Search, ShoppingCart, UserPlus, UserRound } from "lucide-react";

import CrmService, { type Conversa } from "@/features/crm/services/crm.service";
import useClienteStore from "@/features/clientes/store/cliente.store";
import { garantirCliente } from "@/features/crm/utils/cadastroRapido";
import { Modal } from "@/shared/ui/Modal";
import Dica from "@/shared/ui/Dica";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";

/**
 * Os atalhos do contato — do lado oposto ao nome, no cabeçalho da conversa.
 *
 * ---------------------------------------------------------------------------
 * Dois botões, e os dois começam o mesmo trabalho
 * ---------------------------------------------------------------------------
 * **Venda** e **Orçamento** são a mesma nota com dois desfechos: uma cobra, a
 * outra propõe. Estão os dois aqui porque a conversa de WhatsApp termina numa
 * das duas — "quanto fica?" vira orçamento, "pode fazer" vira venda — e sair
 * da tela para escolher qual custaria o atendimento.
 *
 * ---------------------------------------------------------------------------
 * Cadastrar deixou de ser um passo
 * ---------------------------------------------------------------------------
 * Existia um botão "Cadastrar" que abria o formulário do cliente para a pessoa
 * preencher, e outro, "Ficha", que abria o painel ao lado. Os dois saíram.
 *
 * O cadastro agora acontece SOZINHO no clique de vender ou orçar: nota precisa
 * de cliente, o contato tem nome e telefone, e pedir para alguém redigitar o
 * que a conversa já sabe — no meio de um atendimento — é o passo em que a
 * pessoa desiste e lança a venda no nome de "Consumidor". O nome usado é o que
 * a LOJA salvou na agenda (ver `nomeLimpo` e a nota em `sessoes.js` do serviço
 * de CRM), não o apelido de perfil do WhatsApp.
 *
 * A ficha completa não sumiu: ela abre clicando na foto ou no nome, em janela
 * e em tamanho de leitura (ver `CartaoContato`). O que sumiu foi o botão que
 * repetia isso no cabeçalho.
 *
 * "Vincular" fica, e só aparece sem cadastro: é o caso que nenhuma automação
 * resolve — a pessoa JÁ é cliente e escreveu de outro número, e só quem
 * atende sabe disso.
 *
 * ---------------------------------------------------------------------------
 * Nada disto TIRA a pessoa da conversa
 * ---------------------------------------------------------------------------
 * O vínculo abre em cima; a nota e o orçamento abrem por cima. Sair da tela
 * custa o atendimento: quem navega perde a conversa de vista, volta pelo menu,
 * procura de novo na lista e recomeça a ler. O cliente do outro lado só vê o
 * silêncio.
 */

/** O que a nota precisa saber para abrir — ver `Conversa`. */
export type AberturaNota = { clienteId?: string; nome?: string; orcamento?: boolean };

type Props = {
  conversa: Conversa;
  /** A lista precisa recarregar quando o vínculo muda — o nome exibido muda junto. */
  aoMudar: () => void;
  /** Abre a nota (ou o orçamento) por cima da conversa. */
  onAbrirNota: (abertura: AberturaNota) => void;
};

const AtalhosContato = ({ conversa, aoMudar, onAbrirNota }: Props) => {
  const alert = useAlert();

  const [vinculando, setVinculando] = useState(false);
  const [busca, setBusca] = useState("");
  const [ligando, setLigando] = useState(false);
  const [abrindo, setAbrindo] = useState<"venda" | "orcamento" | null>(null);

  const clientes = useClienteStore((s) => s.clientes);
  const buscarClientes = useClienteStore((s) => s.fetchClientes);

  /* A lista só é buscada quando o seletor abre: a store guarda por sessão, e
     carregar trezentos clientes ao abrir cada conversa seria desperdício numa
     tela em que se troca de conversa o tempo todo. */
  useEffect(() => {
    if (vinculando) void buscarClientes();
  }, [vinculando, buscarClientes]);

  const encontrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const lista = t ? clientes.filter((c) => c.nome?.toLowerCase().includes(t)) : clientes;

    return lista.slice(0, 40);
  }, [clientes, busca]);

  /**
   * Abre a nota — cadastrando o cliente antes, se ele ainda não existir.
   *
   * O cadastro automático mora em `garantirCliente`, porque a janela da ficha
   * abre a venda pelo mesmo caminho e as duas não podem divergir na regra do
   * nome. A falha dele NÃO impede a venda: a nota abre assim mesmo, com o
   * campo do cliente em branco, e quem está atendendo resolve ali.
   */
  const abrir = async (orcamento: boolean) => {
    if (conversa.cliente_fk) {
      onAbrirNota({ clienteId: String(conversa.cliente_fk), nome: conversa.nome, orcamento });
      return;
    }

    setAbrindo(orcamento ? "orcamento" : "venda");

    const { clienteId, nome, erro } = await garantirCliente(conversa);

    setAbrindo(null);
    onAbrirNota({ clienteId, nome, orcamento });

    if (erro) {
      alert.toast("warning", "Cliente não foi cadastrado", extractErrorMessage(erro, "Escolha o cliente na própria nota."), {
        position: "bottom-right",
        timer: 5000,
      });

      return;
    }

    aoMudar();

    alert.toast("success", "Cliente cadastrado", `${nome} entrou no cadastro e a conversa já está ligada à ficha dele.`, {
      position: "bottom-right",
      timer: 4000,
    });
  };

  const vincular = async (clienteId: string) => {
    setLigando(true);

    try {
      await CrmService.vincularCliente(conversa.contato_id, clienteId);

      setVinculando(false);
      setBusca("");
      aoMudar();

      alert.toast("success", "Contato vinculado", "A conversa passa a mostrar o nome do cadastro.", {
        position: "bottom-right",
        timer: 4000,
      });
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível vincular."));
    } finally {
      setLigando(false);
    }
  };

  const botao =
    "focus-ring flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-fg/[0.08] px-2.5 text-[11.5px] text-mist transition-colors hover:border-accent/40 hover:text-accent-soft disabled:opacity-50";

  return (
    <>
      <div className="flex shrink-0 items-center gap-1.5">
        {/* Para quem JÁ é cliente e escreveu de outro número — o caso que o
            casamento automático por telefone não pega, e que o cadastro
            automático da venda não deve resolver: criaria uma segunda ficha
            para a mesma pessoa. */}
        {!conversa.cliente_fk && (
          <Dica texto="Ligar a um cliente que já está no cadastro">
            <button type="button" onClick={() => setVinculando(true)} className={botao}>
              <Link2 size={13} />
              <span className="hidden lg:inline">Vincular</span>
            </button>
          </Dica>
        )}

        <Dica texto="Propor um orçamento para este cliente, sem sair da conversa">
          <button type="button" onClick={() => void abrir(true)} disabled={abrindo !== null} className={botao}>
            {abrindo === "orcamento" ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
            <span className="hidden md:inline">Orçamento</span>
          </button>
        </Dica>

        <Dica texto={conversa.cliente_fk ? "Abrir uma nota para este cliente" : "Abrir uma nota — o cliente é cadastrado automaticamente"}>
          <button
            type="button"
            onClick={() => void abrir(false)}
            disabled={abrindo !== null}
            className={`${botao} border-accent/40 text-accent-soft hover:bg-accent/[0.08]`}
          >
            {abrindo === "venda" ? <Loader2 size={13} className="animate-spin" /> : <ShoppingCart size={13} />}
            <span className="hidden md:inline">Venda</span>
          </button>
        </Dica>
      </div>

      {/* Seletor de cliente existente. */}
      <Modal
        open={vinculando}
        onClose={() => {
          setVinculando(false);
          setBusca("");
        }}
        title="Vincular ao cadastro"
        subtitle={conversa.nome}
        size="sm"
      >
        <div className="flex flex-col gap-3">
          <div className="overflow-hidden rounded-xl border border-fg/[0.06]">
            {/* A busca DENTRO da lista, grudada no topo: ela filtra o que está
                logo abaixo, e fora da caixa parecia buscar outra coisa. Mesma
                decisão da busca de contatos, em `CrmPage`. */}
            <div className="sticky top-0 z-10 flex h-[38px] items-center gap-2 border-b border-fg/[0.06] bg-surface px-3">
              <Search className="h-4 w-4 shrink-0 text-muted" />
              <input
                autoFocus
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar cliente pelo nome"
                className="w-full flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-faint"
              />
            </div>

            <div className="max-h-72 overflow-y-auto">
              {encontrados.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12px] text-faint">
                  {busca.trim() ? "Nenhum cliente com esse nome." : "Nenhum cliente cadastrado ainda."}
                </p>
              ) : (
                encontrados.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={ligando}
                    onClick={() => void vincular(String(c.id))}
                    className="flex w-full items-center gap-2 border-b border-fg/[0.04] px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-fg/[0.05] disabled:opacity-50"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent/25 bg-accent/[0.12] text-accent-soft">
                      <UserRound size={13} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] text-ink">{c.nome}</span>
                      {c.contato?.whatsapp && (
                        <span className="block truncate text-[11px] text-faint">{c.contato.whatsapp}</span>
                      )}
                    </span>
                    {ligando && <Loader2 size={13} className="shrink-0 animate-spin text-accent" />}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* A saída para quem abriu o seletor e viu que a pessoa não tem
              cadastro nenhum: a venda cadastra sozinha, e é por ela que se
              sai daqui. */}
          <p className="flex items-center justify-center gap-1.5 text-center text-[11.5px] leading-relaxed text-faint">
            <UserPlus size={13} className="shrink-0" />
            Não está na lista? Abra a venda: o cadastro é criado com o nome e o telefone da conversa.
          </p>
        </div>
      </Modal>
    </>
  );
};

export default AtalhosContato;
