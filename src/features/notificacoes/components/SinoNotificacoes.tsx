import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotionConfig } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import { Bell, BellRing, BellOff, Package, ShoppingCart, UserPlus, Wallet, Users, Trash2, CheckCheck, BadgeCheck, Undo2 } from "lucide-react";

import NotificacaoService, { type Mural, type Notificacao, type TipoNotificacao } from "@/features/notificacoes/services/notificacao.service";
import { formatDateTime } from "@/shared/utils/date";
import { notificarNoAparelho, notificacoesLigadas, pedirPermissao, definirPreferencia, permissaoAtual, suportaNotificacao } from "@/shared/pwa/notificacaoDispositivo";
import { API_ORIGEM } from "@/shared/api/apiUrl";
import { lerToken } from "@/shared/api/sessao";

/** Ícone e cor por tipo de evento — o rótulo sempre acompanha, nunca só a cor. */
const LOOK: Record<TipoNotificacao, { icon: React.ReactNode; cls: string }> = {
  PRODUTO_CRIADO: { icon: <Package size={14} />, cls: "bg-accent/15 text-accent-soft" },
  PRODUTO_ALTERADO: { icon: <Package size={14} />, cls: "bg-accent/15 text-accent-soft" },
  PRODUTO_EXCLUIDO: { icon: <Trash2 size={14} />, cls: "bg-danger/15 text-danger" },
  VENDA_REGISTRADA: { icon: <ShoppingCart size={14} />, cls: "bg-success/15 text-success" },
  VENDA_ALTERADA: { icon: <ShoppingCart size={14} />, cls: "bg-warning/15 text-warning" },
  CLIENTE_CADASTRADO: { icon: <UserPlus size={14} />, cls: "bg-accent/15 text-accent-soft" },
  PAGAMENTO_RECEBIDO: { icon: <BadgeCheck size={14} />, cls: "bg-success/15 text-success" },
  /* Dinheiro que sai do registro é evento de equipe: quem conferir o caixa
     amanhã precisa saber que alguém apagou um recebimento hoje. */
  PAGAMENTO_ESTORNADO: { icon: <Undo2 size={14} />, cls: "bg-warning/15 text-warning" },
  CAIXA_LANCAMENTO: { icon: <Wallet size={14} />, cls: "bg-accent/15 text-accent-soft" },
  CONTA_CRIADA: { icon: <Wallet size={14} />, cls: "bg-warning/15 text-warning" },
  CAIXA_EXCLUSAO: { icon: <Trash2 size={14} />, cls: "bg-danger/15 text-danger" },
  FUNCIONARIO_CADASTRADO: { icon: <Users size={14} />, cls: "bg-accent/15 text-accent-soft" },
  FUNCIONARIO_ALTERADO: { icon: <Users size={14} />, cls: "bg-accent/15 text-accent-soft" },
};

const PADRAO = { icon: <Bell size={14} />, cls: "bg-fg/[0.06] text-mist" };

/**
 * Mural de atividade da equipe.
 *
 * Chega por socket (mesma sala por empresa já usada na liberação do
 * pagamento), então não há polling nem botão de atualizar. A primeira carga é
 * por HTTP porque quem acabou de abrir o sistema precisa ver o que aconteceu
 * enquanto estava fora.
 */
const SinoNotificacoes = () => {
  const navigate = useNavigate();

  const [mural, setMural] = useState<Mural>({ notificacoes: [], naoLidas: 0 });
  const [aberto, setAberto] = useState(false);
  const reduzir = useReducedMotionConfig();
  const [ancora, setAncora] = useState<DOMRect | null>(null);
  const [noAparelho, setNoAparelho] = useState(() => notificacoesLigadas() && permissaoAtual() === "granted");
  const painelRef = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);

  const carregar = useCallback(async () => {
    try {
      setMural(await NotificacaoService.listar());
    } catch {
      /* Silencioso: é um acessório, não pode atrapalhar a tela. */
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /* ---------------- Tempo real ---------------- */
  useEffect(() => {
    const origem = API_ORIGEM;

    let socket: Socket | null = null;

    try {
      socket = io(origem, {
        // Mesmo token das requisições HTTP, mandado no handshake.
        auth: { token: lerToken() ?? "" },
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 5000,
      });

      socket.on("connect_error", (erro) => {
        console.warn("Mural de notificações indisponível:", erro.message);
      });

      socket.on("notificacao:nova", (nova: Notificacao) => {
        setMural((atual) => ({
          notificacoes: [nova, ...atual.notificacoes].slice(0, 40),
          naoLidas: atual.naoLidas + 1,
        }));

        // Faixa do sistema — só sai com o app fora de foco (ver o módulo).
        void notificarNoAparelho(nova.titulo, nova.descricao, { rota: nova.rota });
      });
    } catch {
      /* Sem socket o mural ainda funciona: recarrega ao reabrir a tela. */
    }

    return () => {
      socket?.disconnect();
    };
  }, []);

  /* ---------------- Fechar ao clicar fora ---------------- */
  useEffect(() => {
    if (!aberto) return;

    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (painelRef.current?.contains(alvo) || botaoRef.current?.contains(alvo)) return;
      setAberto(false);
    };

    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const abrir = (n: Notificacao) => {
    if (!n.lida) {
      NotificacaoService.marcarLida(n.id).catch(() => {});
      setMural((atual) => ({
        notificacoes: atual.notificacoes.map((x) => (x.id === n.id ? { ...x, lida: true } : x)),
        naoLidas: Math.max(0, atual.naoLidas - 1),
      }));
    }

    setAberto(false);
    if (n.rota) navigate(n.rota);
  };

  const lerTudo = async () => {
    await NotificacaoService.marcarTodasLidas().catch(() => {});
    setMural((atual) => ({ notificacoes: atual.notificacoes.map((n) => ({ ...n, lida: true })), naoLidas: 0 }));
  };

  const alternarAparelho = async () => {
    if (noAparelho) {
      definirPreferencia(false);
      setNoAparelho(false);
      return;
    }

    const liberado = await pedirPermissao();

    if (!liberado) {
      // Negado no nível do sistema: não adianta ligar a preferência.
      setNoAparelho(false);
      return;
    }

    definirPreferencia(true);
    setNoAparelho(true);
  };

  const alternar = () => {
    // O painel vive num portal porque a sidebar é `overflow-hidden` e recortava
    // o balão pela metade. Fora dela, a posição precisa vir do botão.
    setAncora(botaoRef.current?.getBoundingClientRect() ?? null);
    setAberto((v) => !v);
  };

  return (
    <>
      <motion.button
        ref={botaoRef}
        type="button"
        onClick={alternar}
        aria-label={mural.naoLidas > 0 ? `Notificações: ${mural.naoLidas} não lidas` : "Notificações"}
        whileTap={reduzir ? undefined : { scale: 0.88 }}
        transition={{ type: "spring", stiffness: 520, damping: 26 }}
        className={`focus-ring relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-fg/[0.08] ${aberto ? "text-accent-soft" : "text-faint hover:text-accent-soft"}`}
      >
        {/* O sino balança quando o painel abre — dá o "toque" que o ícone
            promete e liga o clique ao painel que aparece. */}
        <motion.span
          animate={reduzir || !aberto ? { rotate: 0 } : { rotate: [0, -18, 14, -8, 0] }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          style={{ transformOrigin: "50% 15%" }}
        >
          <Bell size={16} />
        </motion.span>

        {mural.naoLidas > 0 && (
          <motion.span
            /* `key` no número: quando ele muda, o selo pulsa em vez de trocar
               o texto em silêncio. */
            key={mural.naoLidas}
            initial={reduzir ? false : { scale: 0.4 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 600, damping: 18 }}
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[9px] leading-none text-white"
          >
            {mural.naoLidas > 9 ? "9+" : mural.naoLidas}
          </motion.span>
        )}
      </motion.button>

      {ancora && createPortal(
        /* `AnimatePresence` para a saída existir: sem ela o painel sumiria de
           um frame para o outro, e abrir suave para fechar seco fica pior do
           que não animar. */
        <AnimatePresence>
          {aberto && (
        <motion.div
          ref={painelRef}
          className="glass-strong elev-3 fixed z-[260] w-[320px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-fg/[0.08]"
          style={{
            left: Math.max(12, ancora.left),
            bottom: Math.max(12, window.innerHeight - ancora.top + 8),
            /* Cresce a partir do canto de baixo à esquerda, que é onde o sino
               está: o painel parece sair do botão, não aparecer no meio do nada. */
            transformOrigin: "bottom left",
          }}
          initial={reduzir ? false : { opacity: 0, scale: 0.92, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reduzir ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 6 }}
          transition={{ type: "spring", stiffness: 420, damping: 30, mass: 0.7 }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-fg/[0.07] px-4 py-2.5">
            <p className="text-[12.5px] text-ink">Atividade da equipe</p>
            {mural.naoLidas > 0 && (
              <button type="button" onClick={lerTudo} className="focus-ring flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-accent transition hover:text-accent-soft">
                <CheckCheck size={12} /> Marcar lidas
              </button>
            )}
          </div>

          {suportaNotificacao() && (
            <button
              type="button"
              onClick={alternarAparelho}
              className="flex w-full items-center justify-between gap-2 border-b border-fg/[0.05] px-4 py-2 text-left text-[11.5px] text-mist transition-colors hover:bg-fg/[0.03]"
            >
              <span className="flex items-center gap-1.5">
                {noAparelho ? <BellRing size={12} className="text-accent-soft" /> : <BellOff size={12} />}
                Avisar neste aparelho
              </span>
              <span className={`h-4 w-7 shrink-0 rounded-full p-0.5 transition-colors ${noAparelho ? "bg-accent" : "bg-fg/15"}`}>
                <span className={`block h-3 w-3 rounded-full bg-white transition-transform ${noAparelho ? "translate-x-3" : ""}`} />
              </span>
            </button>
          )}

          <div className="max-h-[min(60vh,420px)] overflow-y-auto">
            {mural.notificacoes.length === 0 ? (
              <p className="px-4 py-10 text-center text-[12px] text-faint">Nada por aqui ainda. O que a equipe fizer aparece nesta lista.</p>
            ) : (
              mural.notificacoes.map((n) => {
                const look = LOOK[n.tipo] ?? PADRAO;

                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => abrir(n)}
                    className={`flex w-full items-start gap-2.5 border-b border-fg/[0.04] px-4 py-2.5 text-left transition-colors hover:bg-fg/[0.03] ${n.lida ? "" : "bg-accent/[0.04]"}`}
                  >
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${look.cls}`}>{look.icon}</span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] text-ink">{n.titulo}</span>
                      {n.descricao && <span className="block truncate text-[11px] text-mist">{n.descricao}</span>}
                      <span className="mt-0.5 block truncate text-[10.5px] text-faint">
                        {n.usuarioNome ? `${n.usuarioNome} · ` : ""}
                        {formatDateTime(n.criadoEm)}
                      </span>
                    </span>

                    {!n.lida && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                  </button>
                );
              })
            )}
          </div>
        </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
};

export default SinoNotificacoes;
