import type { NovoPedidoDto, PedidoClienteType, PedidoUpdateDto } from "@/shared/domain/pedido";

import sysgrafix from "@/shared/api/sysgrafix";

const NoteService = {
  /** Cria novo pedido → POST /pedidos/novo-pedido */
  create: (note: NovoPedidoDto) => sysgrafix.post("/pedidos/novo-pedido", note, { carregamento: "Registrando a venda…" }),

  /** Lista todos os pedidos → GET /pedidos/ */
  getAll: () => sysgrafix.get("/pedidos/"),

  /**
   * Busca pedido por ID → GET /pedidos/:id
   * Retorno: { statusCode, message, data: clientePedido }
   */
  getById: async (pedidoId: string): Promise<PedidoClienteType | null> => await sysgrafix.get(`/pedidos/${pedidoId}`).then(({ data }) => data.data ?? null),

  /**
   * Altera pedido → PATCH /pedidos/alterar/:id
   * O controller lê `data.produtosPedido` do body (nome diferente do de criar!)
   */
  update: async (data: PedidoUpdateDto, pedidoId: string) => {
    return await sysgrafix.patch(`/pedidos/alterar/${pedidoId}`, data, { carregamento: "Salvando a nota…" });
  },

  /**
   * Cancela o pedido → PATCH /pedidos/:id/cancelar
   *
   * Substitui o `delete`, que apontava para `DELETE /pedidos/:id` — rota que
   * nunca existiu na API. O botão de excluir respondia 404 e a nota
   * continuava lá.
   *
   * Cancelar preserva itens, valor e data; só o status muda. Nota já paga é
   * recusada pelo servidor: dinheiro que entrou sai pelo financeiro.
   */
  cancelar: (pedidoId: string) => sysgrafix.patch(`/pedidos/${pedidoId}/cancelar`, undefined, { carregamento: "Cancelando a nota…" }),

  /**
   * Apaga de vez uma nota JÁ cancelada → DELETE /pedidos/:id
   *
   * O servidor recusa se a nota não estiver cancelada, se tiver pagamento
   * registrado ou se quem pediu não for gestor. A tela esconde o botão nesses
   * casos; estas são as travas de verdade.
   */
  excluir: (pedidoId: string) => sysgrafix.delete(`/pedidos/${pedidoId}`, { carregamento: "Apagando a nota…" }),
};

export default NoteService;
