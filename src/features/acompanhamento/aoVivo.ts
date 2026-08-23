import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";

import { API_ORIGEM } from "@/shared/api/apiUrl";

/**
 * A página do cliente se atualizando sozinha.
 *
 * Existe separado de `useSincronizacao` pelo mesmo motivo que
 * `acompanhamento.service.ts` usa `axios` cru em vez do `sysgrafix`: aquele
 * hook lê a sessão (`useAuth`, `lerToken`) para se autenticar e para ignorar o
 * próprio eco. Aqui não há sessão nenhuma — quem abre é um estranho com uma
 * string na URL.
 *
 * Duas consequências que valem dizer em voz alta:
 *
 * - **Nada de token de sessão no handshake.** Se o dono da gráfica abrir o
 *   link do próprio cliente na aba em que está logado, mandar o JWT dele
 *   colocaria a aba na sala da EMPRESA — e a conferência ("o Joaquim está
 *   vendo o quê?") passaria a mentir justamente para quem precisa dela.
 * - **Nada de ignorar o próprio eco.** O visitante nunca é o autor da
 *   mudança; toda mudança que chega é de outra pessoa, e é para isso que ele
 *   deixou a página aberta.
 *
 * O token do link vai em `auth.publico`. O servidor confere as mesmas
 * condições da leitura HTTP — ativo, não expirado — e coloca a conexão numa
 * sala só de visitantes, nunca na da empresa.
 */
export function useProducaoAoVivo(token: string, aoMudar: () => void, ativo = true): void {
  /* Ref para não reconectar a cada render: o callback muda de identidade toda
     vez que a página renderiza, e o socket não deveria se importar com isso. */
  const aoMudarRef = useRef(aoMudar);

  aoMudarRef.current = aoMudar;

  useEffect(() => {
    if (!ativo || !token) return;

    let socket: Socket | null = null;
    let agendado: number | undefined;

    try {
      /* `polling` no fallback: o link é aberto no 4G, e rede de operadora com
         proxy bloqueia websocket. Sem ele o tempo real morre em silêncio — e
         numa página SEM botão de atualizar, morrer em silêncio significa
         mostrar dado velho para sempre. */
      socket = io(API_ORIGEM, {
        auth: { publico: token },
        transports: ["websocket", "polling"],
        reconnection: true,
        /* Mais tentativas que o hook interno, e por mais tempo: o celular do
           cliente entra em túnel, troca de antena e dorme com a aba aberta.
           Desistir em cinco tentativas deixaria a página parada sem nenhum
           sinal de que parou. */
        reconnectionAttempts: 20,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 15000,
      });

      /* Reconectou depois de uma queda: busca uma vez. O que mudou enquanto o
         socket esteve fora não é reenviado por ninguém — o evento é um aviso
         do instante, não uma fila. */
      socket.on("reconnect", () => aoMudarRef.current());

      socket.on("connect_error", (erro) => {
        console.warn("Acompanhamento ao vivo indisponível:", erro.message);
      });

      socket.on("dados:alterados", (aviso: { colecao?: string }) => {
        if (aviso?.colecao !== "planilhas") return;

        /* Junta rajadas: preencher cinco células seguidas dispara cinco
           avisos, e sem espera seriam cinco requisições — no 4G de quem só
           queria ver a data da entrega. */
        window.clearTimeout(agendado);
        agendado = window.setTimeout(() => aoMudarRef.current(), 400);
      });
    } catch {
      /* Sem tempo real a página continua inteira — só deixa de se mexer
         sozinha. Ela ainda recarrega ao ser reaberta, que é como a maioria
         das pessoas volta a olhar um link de acompanhamento. */
    }

    return () => {
      window.clearTimeout(agendado);
      socket?.disconnect();
    };
  }, [token, ativo]);
}

export default useProducaoAoVivo;
