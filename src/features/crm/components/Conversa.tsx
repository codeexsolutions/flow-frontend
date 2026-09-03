import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2, Send, UserRound } from "lucide-react";

import CrmService, { type Conversa as ConversaTipo, type Mensagem } from "@/features/crm/services/crm.service";
import MidiaMensagem from "@/features/crm/components/MidiaMensagem";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";

/**
 * A conversa aberta: o histórico e o campo de resposta.
 *
 * ---------------------------------------------------------------------------
 * A mensagem aparece antes de sair, e é de propósito
 * ---------------------------------------------------------------------------
 * O envio grava a linha como PENDENTE no servidor e responde na hora; o
 * WhatsApp recebe depois. Aqui a tela faz o mesmo: a bolha entra na conversa
 * no instante do clique, com o campo já limpo.
 *
 * O caminho óbvio — esperar a confirmação para desenhar — deixaria o atendente
 * olhando a tela parada por até vinte segundos quando a sessão estivesse
 * acordando, e ele digitaria tudo de novo achando que não foi. Numa conversa,
 * a lentidão percebida é a diferença entre parecer atendido e parecer ignorado.
 *
 * Se falhar, a bolha CONTINUA lá, marcada em vermelho: apagá-la esconderia do
 * atendente que o cliente nunca recebeu o que ele acha que respondeu.
 */

/** "14:32" — na conversa a hora importa; a data vira separador de dia. */
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** O rótulo do dia sobre o primeiro recado dele. */
function diaDe(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje.getTime() - 86400000);

  const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();

  if (mesmoDia(d, hoje)) return "Hoje";
  if (mesmoDia(d, ontem)) return "Ontem";

  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
}


type Props = {
  conversa: ConversaTipo;
  /** Só no celular: volta para a lista. No desktop as duas convivem. */
  aoVoltar?: () => void;
  /** A lista precisa saber que a prévia e as não lidas mudaram. */
  aoMudar: () => void;
  podeEnviar: boolean;
};

const Conversa = ({ conversa, aoVoltar, aoMudar, podeEnviar }: Props) => {
  const alert = useAlert();

  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  const fim = useRef<HTMLDivElement>(null);

  const carregar = async (silencioso = false) => {
    if (!silencioso) setCarregando(true);

    try {
      /* O servidor devolve as mais novas primeiro (é o que o LIMIT precisa
         para não cortar o fim da conversa); a tela lê de cima para baixo. */
      const lista = await CrmService.mensagens(conversa.id);

      setMensagens(lista.slice().reverse());
    } catch (err) {
      alert.toast("error", getErrorTitle(err), extractErrorMessage(err, "Não foi possível abrir a conversa."), {
        position: "bottom-right",
        timer: 4000,
      });
    } finally {
      if (!silencioso) setCarregando(false);
    }
  };

  useEffect(() => {
    void carregar();

    /* Abrir a conversa já marcou como lida no servidor — a lista precisa
       saber para tirar o contador. */
    aoMudar();
  }, [conversa.id]);

  /* Desce para a última mensagem. `auto` e não `smooth` na abertura: uma
     conversa de duzentas mensagens rolando com animação demora mais do que a
     pessoa espera para ver o que acabou de chegar. */
  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [mensagens.length]);

  const enviar = async () => {
    const corpo = texto.trim();

    if (!corpo || enviando) return;

    setEnviando(true);
    setTexto("");

    /* A bolha otimista. `id` temporário para o React ter chave — ela é
       substituída pela lista do servidor na recarga logo abaixo. */
    const provisoria: Mensagem = {
      id: `provisoria-${Date.now()}`,
      direcao: "SAIDA",
      tipo: "TEXTO",
      corpo,
      midia_url: null,
      status: "PENDENTE",
      erro: null,
      criado_em: new Date().toISOString(),
      autor_nome: null,
    };

    setMensagens((m) => [...m, provisoria]);

    try {
      await CrmService.enviar(conversa.id, corpo);

      /* Recarrega em silêncio: troca a bolha provisória pela linha de verdade,
         com o id e o status que o servidor gravou. */
      await carregar(true);
      aoMudar();
    } catch (err) {
      /* O envio nem chegou ao servidor (rede, sessão fora). A bolha vira
         FALHOU na hora — e o texto volta para o campo, porque o que a pessoa
         quer neste segundo é tentar de novo, não redigitar. */
      setMensagens((m) => m.map((x) => (x.id === provisoria.id ? { ...x, status: "FALHOU", erro: extractErrorMessage(err, "Não saiu.") } : x)));
      setTexto(corpo);

      alert.toast("error", getErrorTitle(err), extractErrorMessage(err, "Não foi possível enviar."), {
        position: "bottom-right",
        timer: 4000,
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Cabeçalho */}
      <div className="flex shrink-0 items-center gap-3 border-b border-fg/[0.06] px-4 py-3">
        {aoVoltar && (
          <button
            type="button"
            onClick={aoVoltar}
            aria-label="Voltar para a lista"
            className="focus-ring flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-mist transition-colors hover:bg-fg/[0.06] hover:text-ink lg:hidden"
          >
            <ArrowLeft size={16} />
          </button>
        )}

        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-accent/25 bg-accent/[0.12] text-accent-soft">
          {conversa.foto ? <img src={conversa.foto} alt="" className="h-full w-full object-cover" /> : <UserRound size={16} />}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] text-ink">{conversa.nome}</p>
          <p className="truncate font-mono text-[10.5px] text-faint">
            {conversa.telefone}
            {/* Contato sem cadastro é oportunidade, não erro — a tela diz isso
                sem alarde, e o vínculo se faz no painel lateral. */}
            {!conversa.cliente_fk && " · sem cadastro"}
          </p>
        </div>
      </div>

      {/* Histórico */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {carregando ? (
          <div className="flex h-full items-center justify-center text-faint">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : mensagens.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-[12px] text-faint">
            Nenhuma mensagem ainda. Escreva abaixo para começar.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {mensagens.map((m, i) => {
              const anterior = mensagens[i - 1];
              const novoDia = !anterior || diaDe(anterior.criado_em) !== diaDe(m.criado_em);
              const saiu = m.direcao === "SAIDA";
              const falhou = m.status === "FALHOU";

              return (
                <div key={m.id}>
                  {novoDia && (
                    <p className="my-3 text-center text-[10.5px] uppercase tracking-[0.1em] text-faint">{diaDe(m.criado_em)}</p>
                  )}

                  <div className={`flex ${saiu ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[78%] rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed ${
                        falhou
                          ? "border border-danger/30 bg-danger/[0.08] text-ink"
                          : saiu
                            ? "bg-accent/[0.16] text-ink"
                            : "border border-fg/[0.07] bg-fg/[0.03] text-ink"
                      }`}
                    >
                      {/*
                        O arquivo é buscado no WhatsApp na hora de mostrar — não
                        guardamos cópia. Ver `MidiaMensagem`, que também trata a
                        mensagem antiga cujo arquivo não existe mais.
                      */}
                      {m.tipo !== "TEXTO" && <MidiaMensagem mensagem={m} />}

                      {m.corpo && <p className="whitespace-pre-wrap break-words">{m.corpo}</p>}

                      <p className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-faint">
                        {/* Quem respondeu, quando três pessoas atendem pelo
                            mesmo número. Só na saída: na entrada o autor é o
                            cliente, e o nome dele já está no cabeçalho. */}
                        {saiu && m.autor_nome && <span className="truncate">{m.autor_nome}</span>}
                        {m.status === "PENDENTE" && <Loader2 size={10} className="animate-spin" />}
                        {falhou && <AlertTriangle size={10} className="text-danger" />}
                        {hora(m.criado_em)}
                      </p>

                      {falhou && m.erro && <p className="mt-1 text-[10.5px] text-danger">{m.erro}</p>}
                    </div>
                  </div>
                </div>
              );
            })}

            <div ref={fim} />
          </div>
        )}
      </div>

      {/* Resposta */}
      <div className="shrink-0 border-t border-fg/[0.06] p-3">
        {!podeEnviar ? (
          /* Sem sessão conectada o campo some, e não fica desabilitado com um
             título explicando: campo cinza convida a clicar e descobrir. */
          <p className="rounded-xl border border-warning/25 bg-warning/[0.07] px-3 py-2.5 text-center text-[12px] text-warning">
            Conecte o WhatsApp da loja para responder.
          </p>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                /* Enter envia, Shift+Enter quebra linha — o que todo mundo já
                   espera de um campo de conversa. */
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void enviar();
                }
              }}
              rows={1}
              placeholder="Escreva uma mensagem…"
              className="max-h-32 min-h-[42px] flex-1 resize-y rounded-xl border border-fg/[0.08] bg-fg/[0.03] px-3 py-2.5 text-[12.5px] text-ink outline-none transition-colors placeholder:text-faint focus:border-accent/40"
            />

            <button
              type="button"
              disabled={enviando || !texto.trim()}
              onClick={() => void enviar()}
              aria-label="Enviar mensagem"
              className="focus-ring flex h-[42px] w-[42px] shrink-0 cursor-pointer items-center justify-center rounded-xl bg-accent text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Conversa;
