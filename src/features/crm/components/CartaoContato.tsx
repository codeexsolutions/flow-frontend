import { useState } from "react";
import { Loader2, ShoppingCart, UserRound } from "lucide-react";

import type { Conversa } from "@/features/crm/services/crm.service";
import { telefoneBr } from "@/features/crm/utils/contato";
import { garantirCliente } from "@/features/crm/utils/cadastroRapido";
import PainelCliente from "@/features/crm/components/PainelCliente";
import { Modal } from "@/shared/ui/Modal";

/**
 * A identidade do contato — e a ficha inteira quando se clica nela.
 *
 * ---------------------------------------------------------------------------
 * Dois pesos, dois lugares
 * ---------------------------------------------------------------------------
 * O cabeçalho da conversa tem os atalhos do atendimento (ficha ao lado,
 * cadastrar, vincular, vender — ver `AtalhosContato`): gestos rápidos, feitos
 * no meio de uma resposta, que não podem custar uma janela.
 *
 * Isto aqui é o outro peso. Clicar na FOTO ou no NOME abre a ficha em tamanho
 * de leitura, por cima: quem é a pessoa, o que ela tem em produção e o que já
 * comprou, sem o aperto da coluna de 320px que o painel lateral tem. É o gesto
 * de quem parou para entender o cliente antes de responder — e é o gesto que
 * todo aplicativo de conversa ensinou: no nome do contato, no alto, mora a
 * ficha dele.
 *
 * O painel lateral continua existindo, e não compete com isto: ele serve para
 * ficar ABERTO enquanto se conversa (ler a produção e responder no mesmo
 * gesto). A janela serve para consultar e fechar.
 *
 * O telefone aparece formatado — ver `telefoneBr`. Quando o WhatsApp entrega
 * um LID em vez de um número (conta sem telefone visível), mostramos o
 * identificador cru: é feio, mas é o que existe, e esconder deixaria o
 * cabeçalho sem nada onde deveria haver o contato.
 */

type Props = {
  conversa: Conversa;
  /** A lista recarrega quando um cadastro nasce daqui — o nome exibido muda. */
  aoMudar: () => void;
  /** Abre a nota — nova, para este cliente — por cima da conversa. */
  onNovaVenda: (abertura: { clienteId?: string; nome?: string }) => void;
  /** Abre uma compra antiga, escolhida na ficha. */
  onAbrirNota: (pedidoId: string) => void;
};

const CartaoContato = ({ conversa, aoMudar, onNovaVenda, onAbrirNota }: Props) => {
  const [aberto, setAberto] = useState(false);
  const [vendendo, setVendendo] = useState(false);

  /* Mesma regra do cabeçalho: vender cadastra o cliente sozinho quando ele
     ainda não existe — ver `garantirCliente`. */
  const vender = async () => {
    setVendendo(true);

    const { clienteId, nome } = await garantirCliente(conversa);

    setVendendo(false);
    setAberto(false);

    if (!conversa.cliente_fk && clienteId) aoMudar();

    onNovaVenda({ clienteId, nome });
  };

  const telefone = telefoneBr(conversa.telefone) ?? conversa.telefone;

  return (
    <>
      {/* O gatilho É a identidade: foto, nome e número, como sempre foram —
          só que agora clicáveis. */}
      <button
        type="button"
        onClick={() => setAberto(true)}
        title="Ver a ficha completa deste contato"
        className="focus-ring flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl px-1.5 py-1 text-left transition-colors hover:bg-fg/[0.05]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-accent/25 bg-accent/[0.12] text-accent-soft">
          {conversa.foto ? <img src={conversa.foto} alt="" className="h-full w-full object-cover" /> : <UserRound size={16} />}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] text-ink">{conversa.nome}</span>
          <span className="block truncate font-mono text-[10.5px] text-faint">
            {telefone}
            {/* Contato sem cadastro é oportunidade, não erro — a tela diz isso
                sem alarde, e o botão de cadastrar está logo ao lado. */}
            {!conversa.cliente_fk && <span className="font-sans"> · sem cadastro</span>}
          </span>
        </span>
      </button>

      <Modal
        open={aberto}
        onClose={() => setAberto(false)}
        title={conversa.nome}
        subtitle={`${telefone}${conversa.cliente_fk ? "" : " · sem cadastro"}`}
        size="lg"
      >
        <div className="flex flex-col gap-3">
          {/* Quem é, em corpo grande. O cabeçalho do modal já diz o nome, mas
              a foto ampliada é o que confirma o contato de relance — é a mesma
              conferência que se faz abrindo o perfil no aplicativo. */}
          <div className="flex items-center gap-3 rounded-2xl border border-fg/[0.06] bg-fg/[0.02] p-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-accent/25 bg-accent/[0.12] text-accent-soft">
              {conversa.foto ? <img src={conversa.foto} alt="" className="h-full w-full object-cover" /> : <UserRound size={24} />}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] text-ink">{conversa.nome}</p>
              <p className="truncate font-mono text-[12px] text-faint">{telefone}</p>

              <span
                className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] ${
                  conversa.cliente_fk
                    ? "border-success/30 bg-success/[0.1] text-success"
                    : "border-warning/30 bg-warning/[0.1] text-warning"
                }`}
              >
                {conversa.cliente_fk ? "Cliente cadastrado" : "Sem cadastro"}
              </span>
            </div>

            {/* A venda também aqui: quem abriu a ficha para conferir o
                histórico costuma abri-la porque vai vender de novo. */}
            <button
              type="button"
              onClick={() => void vender()}
              disabled={vendendo}
              className="focus-ring flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-gradient-to-br from-accent-soft to-accent px-3 text-[12.5px] text-white shadow-glow transition-all hover:brightness-110 disabled:opacity-60"
            >
              {vendendo ? <Loader2 size={14} className="animate-spin" /> : <ShoppingCart size={14} />}
              <span className="hidden sm:inline">Nova venda</span>
            </button>
          </div>

          {/* A ficha de verdade — a mesma peça do painel lateral, sem a
              moldura dele (ver `embutida` em `PainelCliente`). Uma
              implementação, dois lugares. */}
          <div className="min-h-[320px]">
            <PainelCliente
              embutida
              conversa={conversa}
              onFechar={() => setAberto(false)}
              onAbrirNota={(pedidoId) => {
                setAberto(false);
                onAbrirNota(pedidoId);
              }}
            />
          </div>
        </div>
      </Modal>
    </>
  );
};

export default CartaoContato;
