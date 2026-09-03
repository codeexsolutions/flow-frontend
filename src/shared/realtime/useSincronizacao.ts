import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";

import { API_ORIGEM } from "@/shared/api/apiUrl";
import useAuth from "@/features/auth/store/auth.store";
import { lerToken } from "@/shared/api/sessao";

/* `crm` é a única coleção em que o dado chega por um caminho que a tela não
   provocou: o cliente mandou mensagem no WhatsApp e o serviço gravou. Sem
   ela, a conversa ficaria esperando alguém apertar F5. */
export type Colecao = "clientes" | "produtos" | "pedidos" | "producao" | "planilhas" | "crm";

type Aviso = { colecao: Colecao; porUsuarioId: string | null; em: string };

/**
 * Recarrega a tela quando outra pessoa mexe nos mesmos dados.
 *
 * O caso concreto: dois balcões com o PDV aberto. Um cadastra um produto, o
 * outro não o encontra na busca e refaz a venda no caderno. Aqui a lista chega
 * sozinha, sem ninguém apertar atualizar.
 *
 * Três decisões que valem explicar:
 *
 * - **Ignora o próprio eco.** Quem provocou a mudança já atualizou a tela
 *   localmente; recarregar de novo faria a lista piscar logo depois de salvar.
 *   O servidor manda quem fez, e comparamos com o usuário da sessão.
 * - **Junta rajadas.** Lançar cinco produtos numa nota dispara cinco avisos.
 *   Sem espera, seriam cinco `GET` seguidos. Um atraso curto agrupa tudo numa
 *   recarga só.
 * - **Uma conexão por tela, encerrada ao sair.** Socket que sobrevive à
 *   desmontagem vira listener duplicado e recarga em dobro.
 */
export function useSincronizacao(colecoes: Colecao[], aoMudar: () => void, ativo = true): void {
  /* Refs para não reconectar a cada render: o callback e a lista mudam de
     identidade toda vez que a tela renderiza, e o socket não deveria se
     importar com isso. */
  const aoMudarRef = useRef(aoMudar);
  const colecoesRef = useRef(colecoes);

  aoMudarRef.current = aoMudar;
  colecoesRef.current = colecoes;

  const usuarioId = useAuth((s) => s.user?.id);

  useEffect(() => {
    if (!ativo) return;

    let socket: Socket | null = null;
    let agendado: number | undefined;

    try {
      // O socket é autenticado pelo mesmo token das requisições HTTP, mandado
      // em `auth.token` no handshake.
      // `polling` no fallback: rede que bloqueia websocket (proxy, 3G) ainda
      // sincroniza — sem ele o socket morre em silêncio.
      socket = io(API_ORIGEM, {
        auth: { token: lerToken() ?? "" },
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });

      socket.on("connect_error", (erro) => {
        console.warn("Realtime indisponível:", erro.message);
      });

      socket.on("dados:alterados", (aviso: Aviso) => {
        if (!colecoesRef.current.includes(aviso.colecao)) return;
        if (aviso.porUsuarioId && usuarioId && String(aviso.porUsuarioId) === String(usuarioId)) return;

        window.clearTimeout(agendado);
        agendado = window.setTimeout(() => aoMudarRef.current(), 350);
      });
    } catch {
      /* Sem realtime a tela continua funcionando — só não atualiza sozinha. */
    }

    return () => {
      window.clearTimeout(agendado);
      socket?.disconnect();
    };
    // `colecoes` fica de fora porque vive numa ref: incluir aqui reconectaria
    // o socket a cada render, já que o array é recriado toda vez.
  }, [ativo, usuarioId]);
}

export default useSincronizacao;
