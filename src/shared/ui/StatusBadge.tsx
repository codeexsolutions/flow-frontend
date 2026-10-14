import type { ReactNode } from "react";

import { PEDIDO_STATUS } from "../domain/pedido";
import { eStatus } from "../domain/cliente";

/**
 * Badges de status.
 *
 * `Selo` é a casca — pílula, ponto colorido, tipografia. Os badges de domínio
 * abaixo (pedido, cliente) e os das telas de Correios, Funcionários e PDV
 * usam todos ele: antes eram seis implementações com `px-2.5 py-1` de um lado,
 * `px-2 py-0.5` do outro, umas com `ring` e outras com `border` — o mesmo
 * estado aparecia com dois tamanhos conforme a tela.
 *
 * O tom é semântico, não uma cor: quem escreve a tela diz "isto é sucesso",
 * não "isto é verde". Trocar a paleta do tema não exige varrer as telas.
 *
 * Cor nunca vem sozinha — todo selo carrega o rótulo escrito ao lado do ponto.
 */

export type TomSelo = "sucesso" | "alerta" | "perigo" | "info" | "neutro";

const TONS: Record<TomSelo, { wrap: string; dot: string }> = {
  sucesso: { wrap: "border-success/40 bg-success/20 text-success", dot: "bg-success" },
  alerta: { wrap: "border-warning/50 bg-warning/20 text-warning", dot: "bg-warning" },
  perigo: { wrap: "border-danger/40 bg-danger/20 text-danger", dot: "bg-danger" },
  info: { wrap: "border-accent/40 bg-accent/20 text-accent-soft", dot: "bg-accent-soft" },
  neutro: { wrap: "border-fg/[0.08] bg-fg/[0.04] text-mist", dot: "bg-faint" },
};

const base = "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]";
const dot = "h-1.5 w-1.5 rounded-full";

export function Selo({ tom = "neutro", children }: { tom?: TomSelo; children: ReactNode }) {
  const t = TONS[tom];

  return (
    <span className={`${base} ${t.wrap}`}>
      <span className={`${dot} ${t.dot}`} />
      {children}
    </span>
  );
}

/**
 * Como cada status de pedido se apresenta. Vocabulário único do sistema.
 *
 * Uma cor por situação, a mesma em toda tela: verde é pago, amarelo é o que
 * ainda espera dinheiro, vermelho é cancelado. `PAGO` faltava aqui e a nota
 * paga aparecia cinza, com o texto cru do banco ("PAGO").
 */
const PEDIDO_LOOK: Record<string, { label: string; tom: TomSelo }> = {
  [PEDIDO_STATUS.PAGO]: { label: "Pago", tom: "sucesso" },
  [PEDIDO_STATUS.FECHADO]: { label: "Pago", tom: "sucesso" },
  [PEDIDO_STATUS.ABERTO]: { label: "Em aberto", tom: "alerta" },
  [PEDIDO_STATUS.PENDENTE]: { label: "Pendente", tom: "alerta" },
  [PEDIDO_STATUS.CANCELADO]: { label: "Cancelado", tom: "perigo" },
};

export function PedidoStatusBadge({ status }: { status: string }) {
  const look = PEDIDO_LOOK[status];

  return <Selo tom={look?.tom}>{look?.label ?? status ?? "—"}</Selo>;
}

export function ClienteStatusBadge({ status }: { status: eStatus }) {
  const ativo = status === eStatus.ATIVO;

  return <Selo tom={ativo ? "sucesso" : "neutro"}>{ativo ? "Ativo" : "Inativo"}</Selo>;
}
