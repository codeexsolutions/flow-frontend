import { useRef, useState } from "react";
import { createPortal } from "react-dom";

import NotaResumo from "@/features/vendas/components/NotaResumo";
import useEnterprise from "@/features/empresa/store/enterprise.store";
import { pixDaNota, type PixDaNota } from "@/shared/domain/pixDaNota";
import type { PedidoClienteType } from "@/shared/domain/pedido";
import { gerarBlobNota, proximoQuadro } from "@/shared/ui/DownloadButton";
import { entregarDocumento } from "@/shared/ui/downloadNota";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";

/**
 * Gera a nota OFICIAL (a do computador, 900px) e a entrega pelo celular.
 *
 * No celular o caminho natural é a folha de compartilhar do sistema — é ela
 * que leva a imagem direto para a conversa do WhatsApp. Onde o navegador não
 * compartilha arquivo, a nota abre numa guia, como no computador.
 */
const useCompartilharNota = () => {
  const alert = useAlert();
  const empresa = useEnterprise((s) => s.enterprise);
  const ref = useRef<HTMLDivElement>(null);

  const [alvo, setAlvo] = useState<{ venda: PedidoClienteType; pix: PixDaNota | null } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const compartilhar = async (venda: PedidoClienteType) => {
    if (ocupado) return;
    setOcupado(true);
    const fecharCarregando = alert.loading("Gerando a nota…");

    try {
      /* O QR antes do nó: quando ele montar, o data URI já existe. */
      const pix = await pixDaNota(venda).catch(() => null);
      setAlvo({ venda, pix });
      await proximoQuadro();

      const blob = await gerarBlobNota(ref);
      fecharCarregando();
      const nome = `nota-${venda.pedido.pedidoId.slice(-6).toUpperCase()}`;
      const arquivo = new File([blob], `${nome}.png`, { type: "image/png" });

      if (navigator.canShare?.({ files: [arquivo] })) {
        try {
          await navigator.share({ files: [arquivo], title: `Nota de ${venda.nomeCliente}` });
        } catch (err) {
          /* Fechar a folha de compartilhar não é erro. */
          if ((err as DOMException)?.name !== "AbortError") throw err;
        }
      } else {
        await entregarDocumento(blob, "ver", nome, empresa?.nomeFantasia ?? nome);
      }
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível gerar a nota."));
    } finally {
      fecharCarregando();
      setOcupado(false);
      setAlvo(null);
    }
  };

  /* Fora do visor e não `display:none`: o `html-to-image` precisa do nó desenhado. */
  const noEscondido = createPortal(
    <div className="pointer-events-none fixed -left-[9999px] top-0 w-[900px]" aria-hidden>
      {alvo && <NotaResumo venda={alvo.venda} pix={alvo.pix} refNota={ref} />}
    </div>,
    document.body,
  );

  return { compartilhar, ocupado, noEscondido };
};

export default useCompartilharNota;
