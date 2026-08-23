import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Clock, Link2 } from "lucide-react";

import { pontoLembrado } from "@/features/ponto/instalacao";

/**
 * A porta de entrada do app de ponto instalado — `/ponto`, sem token.
 *
 * ---------------------------------------------------------------------------
 * Por que ela existe
 * ---------------------------------------------------------------------------
 * O `start_url` de um manifest é um endereço fixo, escrito num arquivo que
 * vale para todos os clientes. O link do ponto, não: ele carrega o token da
 * empresa. Sem esta rota, o atalho instalado teria de apontar para o token de
 * ALGUÉM — e abriria a loja errada no celular de todo mundo.
 *
 * Então o atalho abre aqui, e aqui se descobre qual token este APARELHO usou
 * da última vez. O funcionário abre o link do WhatsApp uma vez, instala, e
 * daí em diante entra pelo ícone — sem caçar a conversa onde o link estava.
 *
 * ---------------------------------------------------------------------------
 * Quando não há token guardado
 * ---------------------------------------------------------------------------
 * Acontece em dois casos reais: alguém digitou `/ponto` na mão sem nunca ter
 * aberto o link, e o navegador em modo privado, que recusa a escrita. A tela
 * explica em uma frase o que fazer, em vez de mostrar erro — não houve erro
 * nenhum, só falta o link.
 */
const AbrirPontoPage = () => {
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setToken(pontoLembrado());
  }, []);

  /* `undefined` é "ainda lendo"; `null` é "não tem". Sem separar os dois, a
     tela de instrução pisca por um quadro antes do redirecionamento. */
  if (token === undefined) return <div className="min-h-[100dvh] bg-canvas" />;

  if (token) return <Navigate to={`/ponto/${token}`} replace />;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-canvas px-8 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/[0.14] text-accent-soft">
        <Clock size={28} />
      </span>

      <div>
        <p className="text-[18px] leading-tight text-ink">Registro de ponto</p>
        <p className="mt-2 max-w-[17rem] text-[13px] leading-relaxed text-faint">
          Abra o link que a empresa enviou uma vez neste aparelho. Depois disso, este ícone entra direto.
        </p>
      </div>

      <p className="flex items-center gap-1.5 text-[11.5px] text-muted">
        <Link2 size={12} />
        O link tem o endereço da sua empresa
      </p>
    </div>
  );
};

export default AbrirPontoPage;
