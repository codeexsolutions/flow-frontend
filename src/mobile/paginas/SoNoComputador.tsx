import { Monitor } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Botao, Tela, Vazio } from "@/mobile/ui";

/** Destino que existe só no computador — link salvo, notificação, atalho antigo. */
const SoNoComputador = () => {
  const navigate = useNavigate();

  return (
    <Tela titulo="Disponível no computador">
      <Vazio icone={<Monitor size={24} />} titulo="Esta área fica no computador" texto="No celular estão as vendas, os clientes e o estoque. Para o resto, abra o Flow no computador.">
        <Botao onClick={() => navigate("/", { replace: true })}>Voltar ao início</Botao>
      </Vazio>
    </Tela>
  );
};

export default SoNoComputador;
