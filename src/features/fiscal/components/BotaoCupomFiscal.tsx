import { useEffect, useState } from "react";
import { AlertTriangle, Check, ExternalLink, Loader2, Receipt, RefreshCw } from "lucide-react";

import FiscalService, { type Cupom } from "@/features/fiscal/services/fiscal.service";
import usePlano from "@/shared/plano/plano.store";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";

/**
 * O CUPOM FISCAL de uma venda — o botão e o que ele vira depois.
 *
 * ---------------------------------------------------------------------------
 * Ele não é um botão: são três estados de um documento
 * ---------------------------------------------------------------------------
 *   • sem cupom   → o botão de emitir, com o campo de CPF ao lado;
 *   • autorizado  → o número, a chave e o link do DANFE. Não há o que clicar:
 *                   emitir de novo seria emitir dois cupons do mesmo dinheiro;
 *   • rejeitado   → o MOTIVO da SEFAZ em letra legível, e o botão de tentar de
 *                   novo. É o estado mais importante da tela, porque é o único
 *                   em que alguém precisa fazer alguma coisa.
 *
 * ---------------------------------------------------------------------------
 * "CPF na nota?" é pergunta de balcão
 * ---------------------------------------------------------------------------
 * Por isso o campo fica aqui, ao lado do botão, e não no cadastro do cliente: o
 * mesmo cliente pede numa compra e não pede na outra. Vazio sai como consumidor
 * não identificado, que é o caso normal — e é assim que o cupom é cupom.
 *
 * ---------------------------------------------------------------------------
 * Rejeição chega como sucesso HTTP
 * ---------------------------------------------------------------------------
 * "NCM inválido" é resposta da SEFAZ, não erro de rede: vem num 200 com o
 * motivo dentro. Por isso o `catch` daqui trata só o que impede a tentativa de
 * existir (plano, cadastro incompleto, credencial recusada) — o resto é lido do
 * cupom que voltou.
 */

type Props = {
  /** A venda. Sem id não há o que emitir: a nota precisa existir antes. */
  pedidoId?: string;
  /** Redesenha quando o pagamento muda — a forma entra no cupom. */
  versao?: number;
};

const BotaoCupomFiscal = ({ pedidoId, versao }: Props) => {
  const alert = useAlert();
  const podeFiscal = usePlano((s) => s.recurso("fiscal"));

  const [cupom, setCupom] = useState<Cupom | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [emitindo, setEmitindo] = useState(false);
  const [cpf, setCpf] = useState("");

  const carregar = async () => {
    if (!pedidoId) return;

    try {
      const lista = await FiscalService.daVenda(pedidoId);

      /* O que vale é o mais recente: a tentativa de agora conta a história, e
         as anteriores ficam na base para quem for auditar. */
      setCupom(lista[0] ?? null);
    } catch {
      /* Sem o histórico o botão continua funcionando — some o estado, não a
         ação. Falhar aqui não pode esconder a emissão. */
      setCupom(null);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    void carregar();
    // Recarrega quando a venda ou o pagamento muda.
  }, [pedidoId, versao]);

  if (!podeFiscal || !pedidoId) return null;

  const emitir = async () => {
    setEmitindo(true);

    try {
      const { cupom: novo, mensagem } = await FiscalService.emitir(pedidoId, cpf.replace(/\D/g, ""));

      setCupom(novo);

      if (novo?.situacao === "AUTORIZADA") alert.success("Cupom emitido!", mensagem);
      else if (novo?.situacao === "REJEITADA") alert.warning("A SEFAZ recusou", novo.motivo ?? mensagem);
      else alert.info("Em processamento", mensagem);
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível emitir o cupom."));
    } finally {
      setEmitindo(false);
    }
  };

  const sincronizar = async () => {
    if (!cupom) return;

    setEmitindo(true);

    try {
      const { cupom: novo } = await FiscalService.sincronizar(cupom.id);
      setCupom(novo);
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível consultar a SEFAZ."));
    } finally {
      setEmitindo(false);
    }
  };

  if (carregando) return null;

  /* ─────────────── Autorizado: o documento, e nada a clicar ─────────────── */
  if (cupom?.situacao === "AUTORIZADA" && !cupom.cancelada_em) {
    return (
      <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-success/25 bg-success/[0.08] px-3 py-2">
        <span className="flex items-center gap-1.5 text-[12px] text-success">
          <Check size={13} className="shrink-0" />
          Cupom nº {cupom.numero}
          {cupom.ambiente === 2 && <span className="text-warning">· homologação</span>}
        </span>

        {cupom.chave && <span className="truncate font-mono text-[10px] text-faint">{cupom.chave}</span>}

        <button
          type="button"
          onClick={() => void FiscalService.abrirDanfe(cupom.id).catch((err) => alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível abrir o DANFE.")))}
          className="focus-ring flex cursor-pointer items-center gap-1 text-left text-[11.5px] text-accent-soft transition-colors hover:text-accent"
        >
          Ver o DANFE <ExternalLink size={11} />
        </button>
      </div>
    );
  }

  /* ─────────────── Pendente: a SEFAZ ainda não respondeu ─────────────── */
  if (cupom?.situacao === "PENDENTE") {
    return (
      <button
        type="button"
        onClick={() => void sincronizar()}
        disabled={emitindo}
        title="Consultar a SEFAZ"
        className="focus-ring flex h-12 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-warning/30 bg-warning/[0.08] px-3 text-[12.5px] text-warning transition-colors hover:brightness-110 disabled:opacity-50"
      >
        {emitindo ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        Cupom em processamento
      </button>
    );
  }

  /* ─────────── Sem cupom, ou recusado: emitir (de novo) ─────────── */
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <input
          value={cpf}
          onChange={(e) => setCpf(e.target.value.replace(/\D/g, "").slice(0, 14))}
          inputMode="numeric"
          placeholder="CPF na nota?"
          aria-label="CPF do consumidor no cupom"
          className="h-12 w-[130px] shrink-0 rounded-xl border border-fg/[0.1] bg-transparent px-3 text-[12.5px] text-ink outline-none transition-colors focus:border-accent/50 placeholder:text-faint"
        />

        <button
          type="button"
          onClick={() => void emitir()}
          disabled={emitindo}
          title="Emitir o cupom fiscal desta venda"
          className="focus-ring flex h-12 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-fg/[0.1] px-3 text-mist transition-colors hover:border-accent/40 hover:text-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          {emitindo ? <Loader2 size={17} className="animate-spin" /> : <Receipt size={17} />}
          <span className="hidden whitespace-nowrap text-[13px] sm:inline">
            {cupom?.situacao === "REJEITADA" ? "Emitir de novo" : "Emitir cupom"}
          </span>
        </button>
      </div>

      {/* O motivo da recusa, por extenso. É o que diz o que corrigir — e sem
          ele "rejeitada" não serve para nada. */}
      {cupom?.situacao === "REJEITADA" && cupom.motivo && (
        <span className="flex max-w-[320px] items-start gap-1.5 text-[11px] leading-relaxed text-warning">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          {cupom.motivo}
        </span>
      )}
    </div>
  );
};

export default BotaoCupomFiscal;
