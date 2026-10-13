import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { ListaAcao } from "@/shared/ui/DataTable";
import { useAlert } from "@/shared/ui/Alert";
import { codigoPixDaNota, vendaCobraPix } from "@/shared/domain/pixDaNota";
import { copiarTexto } from "@/shared/utils/copiar";
import type { PedidoClienteType } from "@/shared/domain/pedido";

/**
 * O copia-e-cola do Pix na fileira de ações da lista.
 *
 * A nota baixada pela linha sai com o QR, mas quem a recebe no WhatsApp abre
 * a imagem no próprio celular e não tem como apontar a câmera para ela — o
 * código escrito é o que essa pessoa usa para pagar. Antes ele só podia ser
 * copiado de dentro da nota aberta; aqui fica ao lado do download.
 *
 * Só aparece quando a nota sairia com QR (`vendaCobraPix`): quitada,
 * cancelada ou com o Pix desligado não tem o que copiar.
 */
const BotaoCopiarPix = ({ venda }: { venda: PedidoClienteType }) => {
  const alert = useAlert();
  const [copiado, setCopiado] = useState(false);

  if (!vendaCobraPix(venda)) return null;

  const copiar = async () => {
    try {
      const ok = await copiarTexto(codigoPixDaNota(venda).then((c) => c?.payload ?? null));

      if (!ok) {
        alert.warning("Pix não configurado", "Cadastre a chave Pix em Configurações → Empresa.");
        return;
      }

      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
      alert.toast("success", "Código Pix copiado!", "Cole na conversa com o cliente.", { position: "bottom-right", timer: 2200 });
    } catch {
      alert.error("Não foi possível copiar", "O navegador bloqueou o acesso à área de transferência.");
    }
  };

  return (
    <ListaAcao
      icon={copiado ? <Check size={14} /> : <Copy size={14} />}
      label="Copiar Pix copia e cola"
      tom={copiado ? "sucesso" : "neutro"}
      onClick={() => void copiar()}
    />
  );
};

export default BotaoCopiarPix;
