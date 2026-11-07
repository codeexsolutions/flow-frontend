import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotionConfig } from "framer-motion";
import type { ReactNode } from "react";
import {
  Package, Users, DollarSign, Settings, LogOut, ShoppingCart, BarChart3, LayoutDashboard, UserCog, Wallet,
  LifeBuoy, Lock, MessageCircle, Factory, Moon, Sun, Pin, PinOff,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import useAuth from "@/features/auth/store/auth.store";
import useEnterprise from "@/features/empresa/store/enterprise.store";
import { ehGestor } from "@/features/vendas/components/TabsVendas";
import SinoNotificacoes from "@/features/notificacoes/components/SinoNotificacoes";
import { getInitials } from "@/shared/utils/format";
import { tocarNavegacao } from "@/shared/session/somSessao";
import useEquipeStore, { planoTemEquipe } from "@/features/funcionarios/store/equipe.store";
import usePlano from "@/shared/plano/plano.store";
import BotaoInstalar from "@/shared/pwa/BotaoInstalar";
import useNaoLidas from "@/features/crm/store/naoLidas.store";
import { useSincronizacao } from "@/shared/realtime/useSincronizacao";
import useThemeStore from "@/shared/theme/theme.store";
import { temaPorId } from "@/shared/theme/theme.catalog";

/**
 * O menu do sistema — no desenho do CodeEx Optmize.
 *
 * ---------------------------------------------------------------------------
 * Ela recolhe sozinha
 * ---------------------------------------------------------------------------
 * No computador a barra fica RECOLHIDA, com 76px — só os ícones. Quando o
 * mouse entra (ou o foco, pelo teclado) ela abre para 288px POR CIMA da tela,
 * sem empurrar nada; quando o mouse sai, ela recolhe. Quem guarda o espaço é
 * o invólucro de 76px — por isso o conteúdo não pula quando ela abre.
 *
 * Os ícones nunca se mexem: ficam sempre na mesma coluna à esquerda, e o que
 * some é o texto, apagando enquanto a barra o corta.
 *
 * Quem prefere o menu aberto o tempo todo fixa no alfinete do topo. A escolha
 * fica no aparelho (`localStorage`), não na conta: é sobre o tamanho da tela
 * de cada um, não sobre a pessoa.
 *
 * ---------------------------------------------------------------------------
 * O resto que vale saber
 * ---------------------------------------------------------------------------
 *   • Uma lista só, sem abas nem sanfonas: o sistema são dez destinos e dez
 *     cabem numa coluna. Início e PDV no alto, depois Gestão e Atendimento.
 *   • O item aberto é PREENCHIDO na cor do tema: responde "onde estou?" de
 *     longe, inclusive com a barra recolhida (vira o quadrado do ícone).
 *   • Módulo fora do plano continua visível, com cadeado — quem não vê o
 *     item nunca descobre que o upgrade o destrava. Não recebe clique.
 */

/** Larguras da barra. A recolhida casa com a coluna dos ícones. */
const LARGURA_RECOLHIDA = 76;
const LARGURA_ABERTA = 288;

const CHAVE_FIXA = "flow.menu.fixo";

/* -------------------------------------------------------------------------- */

const Sidebar = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { enterprise } = useEnterprise();

  const userInitials = getInitials(user?.nome, "U");
  const companyInitial = (enterprise?.nomeFantasia || "E").trim().charAt(0).toUpperCase();
  const companyImage = enterprise?.urlLogo || "";

  /** Dono ou administrador promovido: vê o sistema inteiro. */
  const gestor = ehGestor(user);

  /** Módulo que o plano não cobre continua no menu, com cadeado. */
  const temRecurso = usePlano((s) => s.recurso);

  /* As mensagens de cliente esperando resposta — o número no WhatsApp. */
  const naoLidas = useNaoLidas((s) => s.total);
  const buscarNaoLidas = useNaoLidas((s) => s.buscar);

  useEffect(() => {
    void buscarNaoLidas();
  }, [buscarNaoLidas]);

  useSincronizacao(["crm"], () => {
    void buscarNaoLidas();
  });

  /* Só o gestor pergunta: a API recusa para vendedor. */
  const equipe = useEquipeStore((s) => s.equipe);
  const buscarEquipe = useEquipeStore((s) => s.buscar);

  useEffect(() => {
    if (gestor) buscarEquipe();
  }, [gestor, buscarEquipe]);

  /* ----------------------------- Recolher ----------------------------- */

  const [fixa, setFixa] = useState(() => localStorage.getItem(CHAVE_FIXA) === "1");
  const [expandida, setExpandida] = useState(false);
  const saida = useRef<number | undefined>(undefined);
  const barra = useRef<HTMLElement>(null);

  const alternarFixa = () => {
    setFixa((atual) => {
      localStorage.setItem(CHAVE_FIXA, atual ? "0" : "1");
      return !atual;
    });
  };

  const abrir = () => {
    window.clearTimeout(saida.current);
    setExpandida(true);
  };

  /*
   * A saída espera um instante: passar rente à borda não pode fazer a barra
   * piscar. E o foco só a segura aberta quando veio do TECLADO — o clique num
   * item também deixa o foco nele, e aí a barra ficaria aberta depois de o
   * mouse sair.
   */
  const recolher = () => {
    window.clearTimeout(saida.current);
    saida.current = window.setTimeout(() => {
      const foco = document.activeElement;
      const comMouse = barra.current?.matches(":hover");
      const focoDoTeclado = !!foco && !!barra.current?.contains(foco) && foco.matches(":focus-visible");

      if (!comMouse && !focoDoTeclado) setExpandida(false);
    }, 180);
  };

  useEffect(() => () => window.clearTimeout(saida.current), []);

  const recolhida = !fixa && !expandida;

  /** O texto que apaga quando a barra recolhe — sobra o ícone. */
  const some = `whitespace-nowrap transition-opacity duration-200 ${recolhida ? "pointer-events-none opacity-0" : "opacity-100"}`;

  /* ------------------------------ Tema ------------------------------ */

  const modo = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  /* Lido do catálogo, e não da classe `.dark` do <html>: o efeito que aplica
     a classe roda DEPOIS deste componente, e a leitura sairia um tema atrasada.
     No modo "sistema" vale o que o aparelho está mostrando. */
  const escuro = modo === "sistema"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : temaPorId(modo).dark;

  const alternarTema = () => setMode(escuro ? "claro" : "escuro");

  /* ----------------------------- Navegação ----------------------------- */

  /** Filhas com item próprio não acendem o pai (`/vendas/orcamentos`). */
  const FILHAS_COM_ITEM_PROPRIO = ["/vendas/orcamentos"];

  const isActive = (route: string) => {
    if (route === "") return pathname === "/";

    const alvo = `/${route}`;

    if (pathname === alvo) return true;
    if (!pathname.startsWith(`${alvo}/`)) return false;

    return !FILHAS_COM_ITEM_PROPRIO.some((f) => f !== alvo && pathname.startsWith(f));
  };

  const reduzir = useReducedMotionConfig();

  const goto = (route: string) => {
    // Não toca ao clicar onde já se está: som sem mudança confunde.
    if (!isActive(route)) tocarNavegacao();

    navigate(route);
  };

  const handleLogout = () => {
    Promise.resolve(logout()).catch(() => {});
  };

  /* ------------------------------- Peças ------------------------------- */

  const ITEM = "group focus-ring relative flex min-h-[46px] w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-[15px] transition-colors duration-200";

  /**
   * Uma linha do menu.
   *
   * O nome vai também no `title`: com a barra recolhida, o balão do mouse é o
   * único lugar onde ele aparece.
   *
   * `bloqueado` (fora do plano) e `disabled` (em breve) são inertes. O cadeado
   * fica preso no canto do ÍCONE, e não no fim da linha, para continuar
   * visível com a barra recolhida.
   */
  const item = (route: string, icon: ReactNode, label: string, disabled = false, bloqueado = false, contagem = 0, selo?: string) => {
    if (bloqueado || disabled) {
      return (
        <div
          className={`${ITEM} cursor-not-allowed text-mist ${disabled ? "opacity-45" : "opacity-55"}`}
          title={disabled ? `${label} está em breve` : `${label} não está incluído no seu plano. Veja as opções em Configurações › Faturas.`}
        >
          <span className="relative flex w-6 shrink-0 justify-center text-faint">
            {icon}
            {bloqueado && !disabled && (
              <span className="absolute -bottom-1 -right-1.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-surface ring-1 ring-fg/10">
                <Lock size={8} className="text-accent-soft" />
              </span>
            )}
          </span>
          <span className={`min-w-0 flex-1 truncate ${some}`}>{label}</span>
          {disabled && (
            <span className={`shrink-0 rounded-full border border-fg/[0.08] bg-fg/[0.03] px-1.5 py-0.5 text-[8.5px] uppercase tracking-wider text-faint ${some}`}>Breve</span>
          )}
        </div>
      );
    }

    const active = isActive(route);

    return (
      <button
        type="button"
        onClick={() => goto(route)}
        aria-current={active ? "page" : undefined}
        title={label}
        className={`${ITEM} ${active ? "text-white" : "text-mist hover:bg-fg/[0.06] hover:text-ink"}`}
      >
        {/*
         * O fundo preenchido do item aberto. Sem `layoutId`: a pílula
         * deslizante distorcia dentro do contêiner que o `MainLayout` escala.
         */}
        {active && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-xl bg-accent"
            style={{
              backgroundImage: "linear-gradient(90deg, rgb(255 255 255 / 0.16), transparent 70%)",
              boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.2), 0 10px 26px -10px rgb(var(--accent) / 0.85)",
            }}
            initial={reduzir ? false : { opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          />
        )}

        <span className={`relative flex w-6 shrink-0 justify-center transition-colors duration-200 ${active ? "text-white" : "text-faint group-hover:text-accent-soft"}`}>
          {icon}

          {/* Com a barra recolhida o número some junto do texto — sobra um
              ponto no ícone, para o aviso não desaparecer de vez. */}
          {contagem > 0 && recolhida && (
            <span aria-hidden className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-surface" />
          )}
        </span>

        <span className={`relative min-w-0 flex-1 truncate ${some}`}>{label}</span>

        {selo && (
          <span
            className={`relative shrink-0 rounded-full border px-2 py-0.5 text-[9.5px] uppercase tracking-wider ${some} ${
              active ? "border-white/30 bg-white/15 text-white" : "border-accent/25 bg-accent/[0.10] text-accent-soft"
            }`}
          >
            {selo}
          </span>
        )}

        {contagem > 0 && (
          <span
            aria-label={`${contagem} ${contagem === 1 ? "mensagem não lida" : "mensagens não lidas"}`}
            className={`relative flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] tabular-nums ${some} ${
              active ? "bg-white text-danger" : "border border-danger/30 bg-danger/[0.14] text-danger"
            }`}
          >
            {contagem > 99 ? "99+" : contagem}
          </span>
        )}
      </button>
    );
  };

  /**
   * Um grupo: o título em cor de destaque com um traço que apaga. Recolhida,
   * o título vira só um traço curto no meio da coluna — separa sem ocupar.
   */
  const bloco = (filhos: ReactNode, cabecalho?: { nome: string; explicacao: string }) => (
    <div>
      {cabecalho && (
        <div className="relative h-8" title={cabecalho.explicacao}>
          <p className={`flex h-full items-center gap-2 px-3.5 text-[11.5px] uppercase tracking-[0.14em] text-accent-soft ${some}`}>
            {cabecalho.nome}
            <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-fg/[0.12] to-transparent" />
          </p>
          <span
            aria-hidden
            className={`absolute left-[14px] top-1/2 h-px w-6 bg-fg/[0.14] transition-opacity duration-200 ${recolhida ? "opacity-100" : "opacity-0"}`}
          />
        </div>
      )}
      <div className="space-y-1">{filhos}</div>
    </div>
  );

  /* ------------------------------ Render ------------------------------ */

  return (
    /* O invólucro guarda o espaço da barra recolhida (ou da aberta, quando
       fixa). A barra mesmo é `absolute` dentro dele, e por isso abre por cima
       do conteúdo em vez de empurrá-lo. */
    <div
      className="relative z-40 hidden shrink-0 transition-[width] duration-200 md:block"
      style={{ width: fixa ? LARGURA_ABERTA : LARGURA_RECOLHIDA }}
    >
      <aside
        ref={barra}
        onMouseEnter={abrir}
        onMouseLeave={recolher}
        onFocus={(e) => { if (e.target.matches(":focus-visible")) abrir(); }}
        onBlur={recolher}
        className="absolute inset-y-0 left-0 flex flex-col overflow-hidden border-r bg-surface transition-[width,box-shadow] duration-200"
        style={{
          width: recolhida ? LARGURA_RECOLHIDA : LARGURA_ABERTA,
          borderColor: "rgb(var(--glass-border) / calc(var(--glass-border-alpha) + 0.03))",
          /* Aberta por cima da tela, a sombra diz que está por cima. Fixa,
             ela é parte do layout e não precisa de sombra. */
          boxShadow: !recolhida && !fixa ? "18px 0 44px -18px rgb(0 0 0 / 0.5)" : "none",
        }}
      >
        {/* Fio de luz na borda direita, na cor do tema, apagando para baixo. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-px"
          style={{ background: "linear-gradient(to bottom, rgb(var(--accent) / 0.6), rgb(var(--accent) / 0.12) 45%, transparent)" }}
        />

        {/* Malha de pontos, apagando para baixo. */}
        <div
          aria-hidden
          className="hud-grade pointer-events-none absolute inset-0 opacity-70"
          style={{ maskImage: "linear-gradient(to bottom, black, transparent 70%)", WebkitMaskImage: "linear-gradient(to bottom, black, transparent 70%)" }}
        />

        {/* Brilho do tema no alto. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-48"
          style={{
            opacity: "var(--fx-aurora, 1)",
            background: "radial-gradient(ellipse 80% 100% at 30% 0%, rgb(var(--accent) / 0.2), transparent 70%)",
          }}
        />

        {/* ---------------- A marca ---------------- */}
        <div className="relative flex shrink-0 items-center gap-3.5 px-[14px] pb-3 pt-5">
          <div className="relative h-12 w-12 shrink-0">
            <div aria-hidden className="absolute -inset-1 rounded-2xl bg-accent/40 blur-md" style={{ opacity: "calc(0.7 * var(--fx-glow, 1))" }} />
            <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-surface-raised to-surface ring-1 ring-accent/35">
              {companyImage ? (
                <img
                  src={companyImage}
                  alt={enterprise?.nomeFantasia || "Logo"}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <span className="text-[19px] font-medium text-accent-soft">{companyInitial}</span>
              )}
            </div>
          </div>

          <div className={`min-w-0 flex-1 ${some}`}>
            <p className="truncate text-[17px] leading-tight tracking-tight text-ink">{enterprise?.nomeFantasia || "Sua Empresa"}</p>
            <p className="mt-1 truncate text-[10.5px] uppercase leading-tight tracking-[0.14em] text-accent-soft/80">
              {gestor ? "Painel administrativo" : "Painel do vendedor"}
            </p>
          </div>

          <button
            type="button"
            onClick={alternarFixa}
            title={fixa ? "Recolher o menu" : "Manter o menu aberto"}
            aria-label={fixa ? "Recolher o menu" : "Manter o menu aberto"}
            aria-pressed={fixa}
            className={`focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors hover:bg-fg/[0.08] ${fixa ? "text-accent-soft" : "text-faint hover:text-ink"} ${some}`}
          >
            {fixa ? <PinOff size={15} /> : <Pin size={15} />}
          </button>
        </div>

        {/* ---------------- A lista ---------------- */}
        <nav className="relative flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-3 py-4">
          {bloco(
            <>
              {item("", <LayoutDashboard size={20} />, "Início")}
              {item("pdv", <ShoppingCart size={20} />, "PDV")}
            </>,
          )}

          {bloco(
            <>
              {item("estoque", <Package size={20} />, "Estoque/Serviços")}
              {item("vendas", <DollarSign size={20} />, gestor ? "Vendas" : "Minhas vendas")}
              {gestor && item("financeiro", <Wallet size={20} />, "Financeiro", false, !temRecurso("financeiro"))}
              {item("relatorios", <BarChart3 size={20} />, "Relatórios", false, !temRecurso("relatorios"))}
              {item("producao", <Factory size={20} />, "Produção", false, !temRecurso("producao"))}
              {/* Equipe só existe em plano com mais de um usuário. */}
              {gestor && planoTemEquipe(equipe) && item("funcionarios", <UserCog size={20} />, "Funcionários", false, !temRecurso("funcionarios"))}
            </>,
            { nome: "Gestão", explicacao: "A empresa por dentro: o que você tem em estoque, quanto entra e sai de dinheiro, o que sai da oficina, quem trabalha com você e o que os números dizem." },
          )}

          {bloco(
            <>
              {item("clientes", <Users size={20} />, "Clientes")}
              {/* O Chatbot não entra nesta versão — ver `ChatbotPage` e `AppRoutes`. */}
              {item("whatsapp", <MessageCircle size={20} />, "WhatsApp", false, false, naoLidas, "Teste")}
            </>,
            { nome: "Atendimento", explicacao: "As pessoas do outro lado do balcão: quem compra de você, o histórico de cada uma e os canais para falar com elas." },
          )}
        </nav>

        {/* ---------------- Tema, ajuda e instalar ---------------- */}
        <div className="relative mx-3 mb-3 shrink-0 space-y-1">
          {/* Claro ou escuro num clique. Os outros temas (Sépia, Oceano...)
              continuam em Configurações › Aparência. */}
          <button
            type="button"
            onClick={alternarTema}
            title={escuro ? "Mudar para o tema claro" : "Mudar para o tema escuro"}
            className={`${ITEM} text-mist hover:bg-fg/[0.06] hover:text-ink`}
          >
            <span className="relative flex w-6 shrink-0 justify-center text-faint transition-colors group-hover:text-accent-soft">
              {escuro ? <Moon size={20} /> : <Sun size={20} />}
            </span>
            <span className={`min-w-0 flex-1 truncate ${some}`}>{escuro ? "Tema escuro" : "Tema claro"}</span>
            <span aria-hidden className={`flex shrink-0 gap-0.5 rounded-lg border border-fg/[0.08] p-0.5 ${some}`}>
              <span className={`grid h-6 w-6 place-items-center rounded-md ${escuro ? "text-faint" : "bg-fg/[0.08] text-accent-soft"}`}>
                <Sun size={13} />
              </span>
              <span className={`grid h-6 w-6 place-items-center rounded-md ${escuro ? "bg-fg/[0.08] text-accent-soft" : "text-faint"}`}>
                <Moon size={13} />
              </span>
            </span>
          </button>

          {item("ajuda", <LifeBuoy size={20} />, "Ajuda e suporte")}

          {/* Some sozinho quando já está instalado — ver `BotaoInstalar`. */}
          <BotaoInstalar variante="menu" rotuloClassName={some} />
        </div>

        {/* ---------------- Quem está usando ---------------- */}
        <div className="relative shrink-0 border-t border-fg/[0.07] p-2.5">
          <div className="flex items-center gap-2.5 rounded-2xl border border-fg/[0.07] bg-fg/[0.03] p-2">
            {user?.image ? (
              <img src={user.image} alt="" title={user?.nome} className="h-10 w-10 shrink-0 rounded-xl object-cover ring-1 ring-fg/10" />
            ) : (
              <div
                title={user?.nome}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent-soft to-accent text-[13px] text-white ring-1 ring-fg/10"
              >
                {userInitials}
              </div>
            )}

            <div className={`min-w-0 flex-1 ${some}`}>
              <p className="truncate text-[14px] leading-tight text-ink">{user?.nome || "Usuário"}</p>
              <p className="mt-0.5 truncate text-[12px] leading-tight text-faint">{user?.cargo || "Conectado"}</p>
            </div>

            <div className={`flex shrink-0 items-center ${some}`}>
              {/* Mural da equipe — só gestor recebe (a API responde 403 ao vendedor). */}
              {gestor && <SinoNotificacoes />}

              <button
                type="button"
                onClick={() => goto("/configuracoes")}
                aria-label="Configurações"
                title="Configurações"
                className={`focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all duration-200 hover:rotate-45 hover:bg-fg/[0.08] ${isActive("configuracoes") ? "text-accent-soft" : "text-faint hover:text-accent-soft"}`}
              >
                <Settings size={18} />
              </button>

              <button
                type="button"
                onClick={handleLogout}
                aria-label="Sair"
                title="Sair"
                className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-faint transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
};

export default Sidebar;
