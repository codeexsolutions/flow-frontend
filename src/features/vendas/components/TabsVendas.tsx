import type UserType from "@/shared/domain/user";

/**
 * Quem é gestor.
 *
 * Este arquivo era a barra de abas da seção de vendas — cinco destinos:
 * panorama, lista, caixa, a pagar e a receber. A barra deixou de existir: o
 * panorama e a lista viraram uma tela só (`VendasPage`) e as três guias do
 * dinheiro viraram outra (`FinanceiroPage`), cada uma com o seu item no menu
 * lateral. Duas seções, nenhuma aba de topo.
 *
 * O que sobrou é a pergunta que meia dúzia de telas faz — quem pode ver o
 * dinheiro da loja —, e ela continua aqui para não haver duas definições de
 * "gestor" no sistema.
 *
 * Gestor = usuário master ou quem ele promoveu a administrador.
 */
export const ehGestor = (user: UserType | null): boolean => Boolean(user?.root) || user?.permissao === "ADMIN";

/**
 * Quem vê as vendas de TODA a equipe.
 *
 * Não é `ehGestor` — é só o master. ADMIN é um cargo que o dono distribui
 * para alguém tocar a operação (produto, caixa, configuração), e muitas vezes
 * quem recebe esse cargo é um vendedor sênior que continua concorrendo por
 * comissão com os colegas. "Quanto cada um fechou no mês" é o número com que
 * o dono decide comissão, meta e desligamento: sai da mão dele ou de ninguém.
 *
 * Todo o resto — ADMIN incluído — vê apenas as próprias vendas.
 *
 * Esconder aqui é conveniência; quem barra de verdade é a API, que já devolve
 * a lista filtrada pelo autor (`filtroDeVendedor`).
 */
export const veVendasDeTodos = (user: UserType | null): boolean => Boolean(user?.root);
