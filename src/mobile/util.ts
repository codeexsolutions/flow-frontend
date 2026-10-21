import { estaCancelado, estaQuitado, recebidoDoPedido, valorPendenteDoPedido, type PedidoClienteType } from "@/shared/domain/pedido";
import { nivelEstoque, tipoDoItem } from "@/shared/domain/produto";
import type ProductType from "@/shared/domain/produto";
import type ClientType from "@/shared/domain/cliente";
import { formatDate, formatTime } from "@/shared/utils/date";

export type TomStatus = "ok" | "pendente" | "cancelado";

/** Uma palavra para o estado da venda — o que o lojista pergunta no balcão. */
export const statusDaVenda = (v: PedidoClienteType): { texto: string; tom: TomStatus } => {
  if (estaCancelado(v)) return { texto: "Cancelada", tom: "cancelado" };
  if (estaQuitado(v) || valorPendenteDoPedido(v) <= 0.004) return { texto: "Paga", tom: "ok" };
  if (recebidoDoPedido(v) > 0) return { texto: "Parcial", tom: "pendente" };
  return { texto: "A receber", tom: "pendente" };
};

export const CLASSE_TOM: Record<TomStatus, string> = {
  ok: "bg-success/[0.12] text-success",
  pendente: "bg-warning/[0.14] text-warning",
  cancelado: "bg-fg/[0.07] text-faint line-through",
};

/** Mais recente primeiro. */
export const ordenarVendas = (lista: PedidoClienteType[]) => [...lista].sort((a, b) => +new Date(b.pedido.dataPedido) - +new Date(a.pedido.dataPedido));

/** "Hoje, 14:32" ou "12/10/2026". */
export const quandoFoi = (data: Date | string) => {
  const d = new Date(data);
  const hoje = new Date();

  return d.toDateString() === hoje.toDateString() ? `Hoje, ${formatTime(d)}` : formatDate(d);
};

/** Link do WhatsApp — com o número do cliente quando há, senão o seletor de contato. */
export const linkWhatsapp = (texto: string, numero?: string | null) => {
  let digitos = (numero ?? "").replace(/\D/g, "");
  if (digitos && digitos.length <= 11) digitos = `55${digitos}`;

  return `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`;
};

/** Para busca: sem acento e sem caixa — "joão" acha "JOAO". */
export const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** O melhor número para falar com o cliente. */
export const telefoneDo = (c?: ClientType) => c?.contato?.whatsapp || c?.contato?.celular || c?.contato?.telefone || "";

/** "12 un", "Serviço", "Sem controle". */
export const textoQuantidade = (p: ProductType) => {
  const nivel = nivelEstoque(p);
  if (nivel === "ilimitado") return tipoDoItem(p) === "SERVICO" ? "Serviço" : "Sem controle";

  const q = Number(p.quantidade) || 0;
  return `${q.toLocaleString("pt-BR")} ${p.unidade || "un"}`;
};
