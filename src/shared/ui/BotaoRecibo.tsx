import { useRef } from "react";

import Recibo, { type DadosRecibo } from "@/shared/ui/Recibo";
import BotaoVerDocumento from "@/shared/ui/BotaoVerDocumento";
import useEnterprise from "@/features/empresa/store/enterprise.store";

/**
 * Baixar o recibo de um pagamento, em PNG ou PDF.
 *
 * O recibo é montado num nó fora da tela e fotografado — mesmo caminho da nota
 * e do orçamento. Ele precisa existir no DOM de verdade (nunca `display:none`),
 * senão não há o que rasterizar.
 *
 * Um nó por botão é aceitável aqui porque o botão só aparece em pagamento
 * quitado: numa nota aberta no PDV é um só, e nas listas quem monta o nó é a
 * própria tela, com um alvo de cada vez.
 */
const BotaoRecibo = ({ dados }: { dados: DadosRecibo }) => {
  const refRecibo = useRef<HTMLDivElement>(null);
  const empresa = useEnterprise((s) => s.enterprise);

  return (
    <>
      <BotaoVerDocumento
        refNota={refRecibo}
        nomeEmpresa={empresa?.nomeFantasia ?? "recibo"}
        prefixo={`recibo-${dados.numero}`}
        titulo="Ver ou baixar o recibo"
        documento="recibo"
      />

      <div className="fixed -left-[9999px] top-0" aria-hidden>
        <Recibo dados={dados} refRecibo={refRecibo} />
      </div>
    </>
  );
};

export default BotaoRecibo;
