import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2, Send, UserRound } from "lucide-react";

import CrmService, { type Conversa as ConversaTipo, type Mensagem } from "@/features/crm/services/crm.service";
import MidiaMensagem from "@/features/crm/components/MidiaMensagem";
import AtalhosContato from "@/features/crm/components/AtalhosContato";
import PainelCliente from "@/features/crm/components/PainelCliente";
import Invoice from "@/features/vendas/components/Invoice";
import { Modal } from "@/shared/ui/Modal";
import Dica from "@/shared/ui/Dica";
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


/**
 * As cores da conversa são FIXAS, e não os tokens do tema.
 *
 * O resto do Flow segue claro/escuro conforme a preferência. Aqui não: a
 * conversa é a reprodução de um WhatsApp, e quem atende passa o dia lendo
 * transcrição — o pareamento verde/branco é o que o olho dele já decodifica
 * sem pensar. Trocar o significado das cores por causa do tema faria a mesma
 * bolha querer dizer coisas diferentes de manhã e à noite.
 *
 * É a mesma decisão do QR, logo ao lado: fundo branco fixo porque o que
 * importa ali é o contraste real, não a preferência da tela.
 *
 * O que continua seguindo o tema: tudo FORA do quadro da conversa — a lista,
 * o cabeçalho, o painel do cliente, os botões.
 */
const FUNDO = "#efeae2";
const BOLHA_SAIDA = "#d9fdd3";
const BOLHA_ENTRADA = "#ffffff";
const TEXTO = "#111b21";
const TEXTO_FRACO = "#667781";
const AZUL_LIDA = "#53bdeb";

/**
 * A confirmação de leitura, em tiques — o que o WhatsApp mostra.
 *
 * ---------------------------------------------------------------------------
 * O que a tela pode e o que NÃO pode afirmar
 * ---------------------------------------------------------------------------
 * Quando a pessoa desliga a confirmação de leitura no WhatsApp dela, o aviso
 * simplesmente para em "entregue" para sempre. Não existe um sinal de "leitura
 * desligada": daqui, **"não leu" e "leu mas não conta" são o mesmo dado**.
 *
 * Por isso o ✓✓ cinza nunca diz "não leu". O texto da dica é o que separa o
 * que sabemos ("chegou no celular") do que não sabemos ("se abriu"), e cita a
 * possibilidade de a confirmação estar desligada.
 *
 * Afirmar o que não se sabe seria pior que não mostrar nada: o atendente
 * cobraria de novo um cliente que já leu, achando que a mensagem nem chegou.
 */
const CONFIRMACAO: Record<string, { tiques: 1 | 2; azul: boolean; dica: string }> = {
  ENVIADA:  { tiques: 1, azul: false, dica: "Enviada — o WhatsApp recebeu" },
  ENTREGUE: { tiques: 2, azul: false, dica: "Entregue no celular. Não dá para saber se abriu: ela pode estar com a confirmação de leitura desligada." },
  LIDA:     { tiques: 2, azul: true,  dica: "Lida" },
};

/** Os dois tiques do WhatsApp, desenhados — não há ícone pronto com essa forma. */
const Tiques = ({ tiques, azul }: { tiques: 1 | 2; azul: boolean }) => (
  <svg
    viewBox="0 0 18 12"
    aria-hidden
    style={{ color: azul ? AZUL_LIDA : TEXTO_FRACO }}
    className="h-3 w-[18px] shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M1 6.5 L4.2 9.8 L10.2 2.4" />
    {tiques === 2 && <path d="M7.4 6.5 L10.6 9.8 L16.6 2.4" />}
  </svg>
);

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

  /* O painel do cliente e a nota vivem AQUI, e não em `AtalhosContato`: os
     dois ocupam a tela toda ou a coluna ao lado, e um componente de botões não
     deve mandar no layout de quem o contém. */
  const [painel, setPainel] = useState(false);
  const [nota, setNota] = useState<null | { id?: string }>(null);

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

  /*
   * Bate ponto na conversa enquanto ela está aberta.
   *
   * É o que faz o robô se calar: com gente lendo, IA respondendo junto são
   * duas vozes na mesma boca. Ela continua LENDO o histórico — só não fala.
   *
   * Meio minuto, e a marca no servidor vale dois: a folga cobre a janela entre
   * duas batidas, senão o robô voltaria a falar no intervalo, justamente com a
   * pessoa olhando.
   *
   * A primeira batida é imediata — esperar trinta segundos deixaria uma brecha
   * bem no momento em que alguém acabou de abrir para responder.
   */
  useEffect(() => {
    const bater = () => {
      CrmService.presenca(conversa.id).catch(() => {
        /* Falha aqui só faz o robô achar que não tem ninguém — e ele volta a
           responder, que é o comportamento normal. Não vale um aviso. */
      });
    };

    bater();

    const t = setInterval(bater, 30_000);

    return () => clearInterval(t);
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
    <div className="relative flex h-full min-h-0">
      <div className="flex min-h-0 flex-1 flex-col">
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
                sem alarde, e o botão de cadastrar está logo ao lado. */}
            {!conversa.cliente_fk && " · sem cadastro"}
          </p>
        </div>

        {/* Os atalhos do lado oposto ao nome: cadastrar, vincular, ficha,
            vender. Ver a nota no topo de `AtalhosContato` — atendimento e
            cadastro são o mesmo momento, e estavam em telas diferentes. */}
        <AtalhosContato
          conversa={conversa}
          aoMudar={aoMudar}
          painelAberto={painel}
          onAlternarPainel={() => setPainel((v) => !v)}
          onNovaVenda={() => setNota({})}
        />
      </div>

      {/* Histórico */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" style={{ background: FUNDO }}>
        {carregando ? (
          <div className="flex h-full items-center justify-center" style={{ color: TEXTO_FRACO }}>
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : mensagens.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-[12px]" style={{ color: TEXTO_FRACO }}>
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
                    <p className="my-3 text-center">
                      <span
                        className="rounded-full px-2.5 py-1 text-[10.5px] uppercase tracking-[0.1em] shadow-[0_1px_1px_rgba(0,0,0,0.08)]"
                        style={{ background: BOLHA_ENTRADA, color: TEXTO_FRACO }}
                      >
                        {diaDe(m.criado_em)}
                      </span>
                    </p>
                  )}

                  <div className={`flex ${saiu ? "justify-end" : "justify-start"}`}>
                    <div
                      style={{
                        background: falhou ? "#ffdcdc" : saiu ? BOLHA_SAIDA : BOLHA_ENTRADA,
                        color: TEXTO,
                      }}
                      className="max-w-[78%] rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed shadow-[0_1px_1px_rgba(0,0,0,0.08)]"
                    >
                      {/*
                        O arquivo é buscado no WhatsApp na hora de mostrar — não
                        guardamos cópia. Ver `MidiaMensagem`, que também trata a
                        mensagem antiga cujo arquivo não existe mais.
                      */}
                      {m.tipo !== "TEXTO" && <MidiaMensagem mensagem={m} />}

                      {m.corpo && <p className="whitespace-pre-wrap break-words">{m.corpo}</p>}

                      <p className="mt-1 flex items-center justify-end gap-1.5 text-[10px]" style={{ color: TEXTO_FRACO }}>
                        {/* Quem respondeu, quando três pessoas atendem pelo
                            mesmo número. Só na saída: na entrada o autor é o
                            cliente, e o nome dele já está no cabeçalho. */}
                        {/* Quem escreveu. O robô é dito com essas palavras: sem
                            isso a mensagem dele apareceria como SAIDA sem
                            autor — igual às que a loja manda pelo celular — e
                            quem lesse o histórico concluiria que alguém da
                            equipe respondeu de madrugada. */}
                        {saiu && m.automatica && <span className="truncate">resposta automática</span>}
                        {saiu && !m.automatica && m.autor_nome && <span className="truncate">{m.autor_nome}</span>}
                        {m.status === "PENDENTE" && <Loader2 size={10} className="animate-spin" />}
                        {falhou && <AlertTriangle size={10} className="text-danger" />}
                        {hora(m.criado_em)}

                        {/* A confirmação só existe no que SAIU: na entrada ela
                            seria o aviso que nós demos ao cliente, que não
                            interessa a ninguém desta tela. */}
                        {saiu && CONFIRMACAO[m.status] && (
                          <Dica texto={CONFIRMACAO[m.status].dica}>
                            <span className="flex items-center">
                              <Tiques tiques={CONFIRMACAO[m.status].tiques} azul={CONFIRMACAO[m.status].azul} />
                            </span>
                          </Dica>
                        )}
                      </p>

                      {falhou && m.erro && <p className="mt-1 text-[10.5px]" style={{ color: "#b42318" }}>{m.erro}</p>}
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

      {/*
        O painel do cliente, ao LADO da conversa.
        No celular ele toma a tela: 360px divididos entre conversa e painel não
        servem a nenhum dos dois. No desktop os dois convivem, que é o ponto —
        ler a produção e responder viram o mesmo gesto.
      */}
      {painel && (
        <div className="absolute inset-0 z-20 bg-surface lg:static lg:z-auto lg:w-auto lg:bg-transparent">
          <PainelCliente
            conversa={conversa}
            onFechar={() => setPainel(false)}
            onAbrirNota={(pedidoId) => setNota({ id: pedidoId })}
          />
        </div>
      )}

      {/*
        A nota, por cima — nova para este cliente, ou uma compra antiga aberta
        pelo painel. `clienteId` só é passado quando há vínculo: sem cadastro a
        nota abre em branco, e é o próprio fluxo dela que pede o cliente.
      */}
      <Modal
        open={!!nota}
        onClose={() => setNota(null)}
        title={nota?.id ? "Venda" : "Nova venda"}
        subtitle={conversa.nome}
        size="full"
      >
        {nota && (
          <Invoice
            id={nota.id}
            clienteId={conversa.cliente_fk ?? undefined}
            nome={conversa.cliente_fk ? conversa.nome : undefined}
            onSaved={() => {
              setNota(null);
              aoMudar();
            }}
          />
        )}
      </Modal>
    </div>
  );
};

export default Conversa;
