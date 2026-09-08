import { create } from "zustand";

import CrmService from "@/features/crm/services/crm.service";

/**
 * Quantas mensagens de cliente estão esperando resposta.
 *
 * Existe para o MENU: a caixa de entrada é a única tela do sistema em que o
 * trabalho chega sem ninguém pedir — o cliente escreveu e a mensagem ficou
 * lá. Sem um número no menu, descobrir isso exigia abrir o WhatsApp de tempos
 * em tempos para ver se tinha alguém falando; quem não abria, não respondia.
 *
 * O total é a soma das não lidas de todas as conversas. Não há endpoint só
 * para o número, e criar um não pagaria: a mesma consulta da caixa de entrada
 * já traz o campo, e ela roda uma vez ao abrir o sistema e depois só quando o
 * tempo real avisa que chegou mensagem.
 *
 * `definir` é o atalho de quem JÁ tem a lista na mão — a tela do CRM a
 * recarrega o tempo todo, e mandar o total de lá evita uma segunda viagem
 * dizendo o que a primeira já disse (além de zerar o contador no instante em
 * que a conversa é aberta, e não na batida seguinte).
 */
type Estado = {
  total: number;
  buscar: () => Promise<void>;
  definir: (total: number) => void;
};

const useNaoLidas = create<Estado>((set) => ({
  total: 0,

  async buscar() {
    try {
      const conversas = await CrmService.conversas();
      set({ total: conversas.reduce((acc, c) => acc + (Number(c.nao_lidas) || 0), 0) });
    } catch {
      /* Sem WhatsApp configurado, sem permissão ou sem rede: o menu fica sem
         o número, que é o estado de antes deste arquivo existir. Um aviso de
         erro por causa de um badge seria pior que a falta dele. */
    }
  },

  definir(total) {
    set({ total });
  },
}));

export default useNaoLidas;
