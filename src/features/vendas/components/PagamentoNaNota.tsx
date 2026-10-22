import { useState } from "react";
import { Landmark, Pencil } from "lucide-react";

import useEnterprise from "@/features/empresa/store/enterprise.store";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";

/**
 * Formas de pagamento e dados bancários, DENTRO da nota aberta.
 *
 * O texto é da empresa (`notaPagamento`) e sai igual em toda nota e todo
 * orçamento — o mesmo de Configurações › Empresa. Ele mora aqui também porque
 * é aqui que quem atende sente a falta: o cliente pergunta "como eu pago?" com
 * a nota na tela, e ir até Configurações para isso é o caminho que ninguém faz.
 *
 * O bloco impresso entra na foto; o lápis, o editor e o aviso de vazio são de
 * quem atende (`data-sem-foto`).
 */
type Props = {
  /** Se o bloco vai para o papel (nota quitada/cancelada não precisa). */
  imprimir: boolean;
};

const PagamentoNaNota = ({ imprimir }: Props) => {
  const enterprise = useEnterprise((s) => s.enterprise);
  const updateEnterprise = useEnterprise((s) => s.updateEnterprise);
  const alert = useAlert();

  const texto = enterprise?.notaPagamento?.trim() ?? "";
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState("");
  const [salvando, setSalvando] = useState(false);

  const abrir = () => {
    setRascunho(enterprise?.notaPagamento ?? "");
    setEditando(true);
  };

  const salvar = async () => {
    if (!enterprise?.id) return;
    setSalvando(true);
    try {
      await updateEnterprise(enterprise.id, { notaPagamento: rascunho.trim() });
      setEditando(false);
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível salvar."));
    } finally {
      setSalvando(false);
    }
  };

  if (editando) {
    return (
      <div data-sem-foto className="px-5 pb-5">
        <div className="rounded-2xl border border-accent/40 bg-fg/[0.02] p-4">
          <p className="text-[11px] uppercase tracking-[0.08em] text-faint">Formas de pagamento e dados bancários</p>
          <textarea
            autoFocus
            rows={4}
            maxLength={2000}
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            placeholder={"Pix, cartão (com acréscimo da maquininha) e dinheiro\nBanco do Brasil · Ag. 0000-0 · C/C 00000-0\nFavorecido: Minha Empresa LTDA"}
            className="focus-ring mt-2 w-full resize-y rounded-lg border border-fg/[0.08] bg-fg/[0.03] p-2.5 text-[13px] text-ink placeholder:text-faint"
          />
          <p className="mt-1 text-[11px] text-faint">Vale para todas as notas e orçamentos da empresa. Vazio = não sai no papel.</p>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditando(false)}
              className="focus-ring cursor-pointer rounded-lg px-3 py-1.5 text-[12px] text-mist hover:text-ink"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={salvando}
              onClick={() => void salvar()}
              className="focus-ring cursor-pointer rounded-lg bg-accent px-3 py-1.5 text-[12px] text-white disabled:opacity-60"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!texto) {
    return (
      <div data-sem-foto className="px-5 pb-5">
        <button
          type="button"
          onClick={abrir}
          className="focus-ring flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-fg/[0.12] px-4 py-3 text-left transition-colors hover:border-accent/40"
        >
          <Landmark size={20} className="shrink-0 text-faint" />
          <span className="text-[11.5px] leading-relaxed text-mist">
            Adicionar formas de pagamento e dados bancários
            <span className="block text-[10.5px] text-faint">Pix, cartão, dinheiro, agência e conta — sai impresso na nota e no orçamento.</span>
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="px-5 pb-5">
      {imprimir ? (
        <div className="relative rounded-2xl border border-fg/[0.06] bg-fg/[0.02] p-4">
          <p className="text-[11px] uppercase tracking-[0.08em] text-faint">Formas de pagamento</p>
          <p className="mt-1.5 whitespace-pre-line break-words text-[13px] leading-relaxed text-ink">{texto}</p>
          <button
            type="button"
            data-sem-foto
            onClick={abrir}
            title="Editar formas de pagamento"
            className="focus-ring absolute right-3 top-3 cursor-pointer rounded-lg p-1.5 text-faint transition-colors hover:bg-fg/[0.06] hover:text-ink"
          >
            <Pencil size={13} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          data-sem-foto
          onClick={abrir}
          className="focus-ring flex cursor-pointer items-center gap-2 text-[12px] text-mist hover:text-ink"
        >
          <Pencil size={13} /> Editar formas de pagamento
        </button>
      )}
    </div>
  );
};

export default PagamentoNaNota;
