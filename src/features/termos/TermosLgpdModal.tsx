import { useEffect, useRef, useState } from "react";
import { ShieldCheck, Loader2, AlertCircle } from "lucide-react";

import useAuth from "@/features/auth/store/auth.store";
import type { TermosLgpd } from "@/features/termos/termos.service";

/**
 * O aceite dos termos de tratamento de dados — a tela que não dá para fechar.
 *
 * ---------------------------------------------------------------------------
 * Por que não usa o `Modal` do sistema
 * ---------------------------------------------------------------------------
 * O `Modal` compartilhado fecha com Escape e com clique no fundo, e está certo
 * em fazer isso: todos os outros modais do sistema são interrompíveis. Este
 * não é — um consentimento que se dispensa apertando Escape não é
 * consentimento, e passar a aceitar um `fechavel={false}` ali dentro colocaria
 * um caso especial no caminho de trinta telas para servir a uma. O overlay
 * daqui é curto e não tem saída por engano.
 *
 * A única saída é sair da conta, e ela existe de propósito: prender alguém
 * numa tela sem nenhuma porta é o tipo de coisa que faz a pessoa matar o
 * aplicativo e ligar reclamando.
 *
 * ---------------------------------------------------------------------------
 * Ler até o fim, e depois marcar
 * ---------------------------------------------------------------------------
 * O botão só acende quando o texto chegou ao fim E a caixa foi marcada. Não é
 * burocracia: um aceite que a pessoa deu sem ter como ter lido é o primeiro
 * argumento contra a validade dele. O rolar até o fim é a única evidência que
 * a tela tem de que o texto passou pelos olhos.
 *
 * O caso que quebra essa regra é a tela grande, onde o texto inteiro cabe sem
 * rolagem e o evento de rolar nunca acontece — o botão ficaria desabilitado
 * para sempre. Por isso, quando não há o que rolar, o texto já conta como
 * lido.
 */

type Props = {
  termos: TermosLgpd;
  salvando: boolean;
  erro: string | null;
  onAceitar: () => void;
};

const TermosLgpdModal = ({ termos, salvando, erro, onAceitar }: Props) => {
  const { logout } = useAuth();

  const [leu, setLeu] = useState(false);
  const [concordou, setConcordou] = useState(false);

  const corpo = useRef<HTMLDivElement>(null);
  const painel = useRef<HTMLDivElement>(null);

  /*
   * Foco no painel assim que ele aparece.
   *
   * Sem isto, o foco continua no botão da tela de trás — que o overlay cobriu
   * — e quem navega por teclado fica tabulando dentro de uma tela invisível,
   * sem entender por que nada responde.
   */
  useEffect(() => {
    painel.current?.focus();
  }, []);

  /* Texto que cabe inteiro na tela já nasce lido: sem barra de rolagem, o
     evento abaixo nunca dispararia. Reavaliado quando a janela muda de
     tamanho, que é quando um texto que rolava deixa de rolar. */
  useEffect(() => {
    const conferir = () => {
      const no = corpo.current;
      if (no && no.scrollHeight <= no.clientHeight + 4) setLeu(true);
    };

    conferir();
    window.addEventListener("resize", conferir);

    return () => window.removeEventListener("resize", conferir);
  }, [termos]);

  const aoRolar = () => {
    const no = corpo.current;
    if (!no) return;

    /* 24px de folga: em tela com zoom ou meio pixel de arredondamento, a soma
       nunca bate exatamente no total e o fim nunca seria alcançado. */
    if (no.scrollTop + no.clientHeight >= no.scrollHeight - 24) setLeu(true);
  };

  const pronto = leu && concordou && !salvando;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="termos-titulo"
    >
      <div
        ref={painel}
        tabIndex={-1}
        className="flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-fg/[0.08] bg-surface shadow-2xl outline-none sm:max-h-[88vh] sm:max-w-[720px] sm:rounded-2xl"
      >
        {/* Cabeçalho */}
        <div className="flex shrink-0 items-start gap-3 border-b border-fg/[0.06] px-5 py-4 sm:px-7 sm:py-5">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/[0.15] text-accent-soft">
            <ShieldCheck size={18} />
          </span>

          <div className="min-w-0">
            <h2 id="termos-titulo" className="text-[17px] leading-tight text-ink sm:text-[19px]">
              {termos.titulo}
            </h2>
            <p className="mt-1 text-[11.5px] uppercase tracking-[0.08em] text-faint">
              Versão {termos.versao} · leitura obrigatória
            </p>
          </div>
        </div>

        {/* O texto */}
        <div ref={corpo} onScroll={aoRolar} className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          <p className="mb-6 border-l-2 border-accent/50 pl-4 text-[14.5px] leading-relaxed text-mist">
            {termos.resumo}
          </p>

          <div className="flex flex-col gap-6">
            {termos.secoes.map((secao) => (
              <section key={secao.id}>
                <h3 className="mb-2 text-[14px] text-ink">{secao.titulo}</h3>

                <div className="flex flex-col gap-2.5">
                  {secao.paragrafos.map((p, i) => (
                    <p key={i} className="text-[13.5px] leading-relaxed text-mist">
                      {p}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <p className="mt-7 rounded-xl border border-fg/[0.06] bg-fg/[0.02] p-3 text-[12px] leading-relaxed text-faint">
            Ao aceitar, o sistema registra a data e a hora, a versão deste texto, o seu nome e o
            endereço de onde o aceite partiu. Esse registro fica guardado como prova, e você pode
            consultá-lo depois em Configurações.
          </p>
        </div>

        {/* Rodapé: o aceite */}
        <div className="shrink-0 border-t border-fg/[0.06] bg-surface px-5 py-4 sm:px-7">
          {erro && (
            <p role="alert" className="mb-3 flex items-start gap-2 text-[13px] text-danger">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              {erro}
            </p>
          )}

          <label htmlFor="termos-concordo" className="mb-3.5 flex cursor-pointer items-start gap-2.5 text-[13.5px] leading-snug text-mist">
            <input
              id="termos-concordo"
              type="checkbox"
              checked={concordou}
              onChange={(e) => setConcordou(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[rgb(var(--accent))]"
            />
            <span>
              Li o documento e concordo com ele em nome da minha empresa. Entendo que sou o
              responsável pelos dados dos clientes que cadastro aqui.
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!pronto}
              onClick={onAceitar}
              className="focus-ring flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:px-7"
            >
              {salvando ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              {salvando ? "Registrando..." : "Aceitar e continuar"}
            </button>

            {/* A única porta que não é o aceite. Discreta de propósito: existe
                para quem não é quem deveria estar aceitando isso. */}
            <button
              type="button"
              onClick={() => void Promise.resolve(logout()).catch(() => {})}
              className="focus-ring cursor-pointer text-[12.5px] text-faint underline-offset-2 transition-colors hover:text-mist hover:underline"
            >
              Sair da conta
            </button>
          </div>

          {/* O motivo de o botão estar apagado, escrito. Botão desabilitado sem
              explicação é o que faz a pessoa clicar três vezes e desistir. */}
          {!leu && (
            <p className="mt-2.5 text-[12px] text-faint">Role o texto até o fim para liberar o aceite.</p>
          )}
          {leu && !concordou && (
            <p className="mt-2.5 text-[12px] text-faint">Marque a caixa acima para liberar o aceite.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default TermosLgpdModal;
