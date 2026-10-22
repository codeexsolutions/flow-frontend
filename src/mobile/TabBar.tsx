import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotionConfig } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, ShoppingCart, BadgeDollarSign, Package, Users, Wallet, BarChart3, MoreHorizontal, Settings, LogOut, UserCircle, Truck, Lock, Factory, MessageCircle, Bell, RefreshCw } from "lucide-react";

import useAuth from "@/features/auth/store/auth.store";
import { ehGestor } from "@/features/vendas/components/TabsVendas";
import useEquipeStore, { planoTemEquipe } from "@/features/funcionarios/store/equipe.store";
import Sheet from "@/shared/ui/Sheet";
import { tocarNavegacao } from "@/shared/session/somSessao";
import { ABAS_SWIPE } from "@/shared/hooks/useSwipeAbas";
import usePlano from "@/shared/plano/plano.store";
import useNaoLidas from "@/features/crm/store/naoLidas.store";
import { BUILD_ID, forcarAtualizacao } from "@/shared/pwa/versao";
import { useIsMobile } from "@/shared/hooks/useIsMobile";

const LARANJA = "234 108 24";
const AZUL = "37 99 235";

/**
 * A cor do carrinho, decidida pelo matiz do destaque (`"r g b"`).
 *
 * O carrinho NUNCA pode ter a cor do destaque — é o destaque que pinta a aba
 * selecionada, e dois blocos da mesma cor lado a lado apagam o "onde estou".
 * Destaque quente (vermelho, rosa, coral, laranja, cobre, dourado) leva o
 * carrinho azul; qualquer outro leva laranja. Por matiz e não por nome:
 * "vinho", "cobre" e "lavanda" só se sabe olhando.
 */
const corDoCarrinho = (accent: string) => {
  const [r, g, b] = accent.trim().split(/\s+/).map((n) => Number(n) / 255);
  if ([r, g, b].some((n) => Number.isNaN(n))) return LARANJA;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  /* Cinza e preto não têm matiz: qualquer cor contrasta, fica o laranja. */
  if (delta < 0.12) return LARANJA;

  let matiz = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  matiz = (matiz * 60 + 360) % 360;

  const quente = matiz < 75 || matiz > 290;
  return quente ? AZUL : LARANJA;
};

/**
 * `familia` só vem preenchida no primeiro item de cada grupo — é ela que
 * imprime o título na folha "Mais".
 *
 * `recurso` é a flag do plano que o item exige. Sem ela no plano, o item
 * aparece apagado e não recebe toque: no celular o alvo é o dedo, e um
 * destino que só leva a uma tela de venda é pior aqui do que no computador.
 */
type Item = {
  rota: string;
  label: string;
  icon: React.ReactNode;
  familia?: string;
  recurso?: string;
  /** Tela que ainda não existe — diferente de módulo fora do plano. */
  emBreve?: boolean;
  /** Rótulo pequeno ao lado do nome. Hoje só o "Teste" do WhatsApp. */
  selo?: string;
  /** O que está esperando lá dentro — as mensagens não lidas. */
  contagem?: number;
};

/**
 * Navegação do celular — barra sólida encostada no rodapé.
 *
 * ---------------------------------------------------------------------------
 * O caminho até aqui, porque ele explica o desenho
 * ---------------------------------------------------------------------------
 * A pílula `w-fit` deixava os alvos apertados no meio; a faixa larga com a
 * área segura inteira dentro ficava alta demais no iPhone; a cápsula de vidro
 * flutuante cobria o fim das telas e lia como enfeite. Esta é a do app próprio
 * do celular trazida para o sistema completo: barra sólida, colada no chão, só
 * a faixa do indicador de início (menos 12px) embaixo dos ícones.
 *
 * ---------------------------------------------------------------------------
 * O que sustenta o desenho
 * ---------------------------------------------------------------------------
 * - **Ela mora no `body`, por portal.** Não é detalhe de organização: é o que
 *   faz o `bottom` significar o chão do visor. Ver a nota em `dock`.
 * - **Os números moram no CSS** (`--dock-h`, `--dock-lift`, `--dock-space`, em
 *   `index.css`). A barra é `fixed`, então o rodapé das telas precisa reservar
 *   a altura dela — mesmo token dos dois lados.
 * - **Toda aba mostra o nome**, menos o carrinho do meio: um cifrão e um
 *   bonequinho não dizem "Vendas" e "Clientes" para quem entrou na segunda vez.
 * - **O bloco da aba ativa desliza** (`layoutId`) em vez de piscar no destino.
 * - **Arrastar a tela troca de aba.** A ordem das abas mora em `ABAS_SWIPE`
 *   (em `useSwipeAbas`) e é lida daqui — uma fonte só para o gesto e a barra.
 */
const TabBar = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [maisAberto, setMaisAberto] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const reduzir = useReducedMotionConfig();

  const gestor = ehGestor(user);

  /** Item fora do plano aparece apagado e sem toque. */
  const temRecurso = usePlano((s) => s.recurso);

  /* O mesmo número do menu do computador — quem alimenta é a caixa de
     entrada e o tempo real, não uma segunda consulta daqui. */
  const naoLidas = useNaoLidas((s) => s.total);

  /* No celular a sidebar não existe, então a busca precisa acontecer aqui —
     senão "Funcionários" nunca apareceria no menu "Mais". */
  const equipe = useEquipeStore((s) => s.equipe);
  const buscarEquipe = useEquipeStore((s) => s.buscar);

  useEffect(() => {
    if (gestor) buscarEquipe();
  }, [gestor, buscarEquipe]);

  /* Só no celular: os pesos de fonte mais firmes (`html.app-celular` no
     `index.css`) e a cor do carrinho, refeita quando o tema troca. */
  const celular = useIsMobile();

  useEffect(() => {
    if (!celular) return;

    const raiz = document.documentElement;
    raiz.classList.add("app-celular");

    const pintarCarrinho = () => raiz.style.setProperty("--carrinho", corDoCarrinho(getComputedStyle(raiz).getPropertyValue("--accent")));
    pintarCarrinho();

    const observador = new MutationObserver(pintarCarrinho);
    observador.observe(raiz, { attributes: true, attributeFilter: ["class", "data-accent", "data-theme"] });

    return () => {
      observador.disconnect();
      raiz.classList.remove("app-celular");
      raiz.style.removeProperty("--carrinho");
    };
  }, [celular]);

  /*
   * A barra é a mesma para todos: o funcionário opera a loja inteira.
   *
   * A ORDEM vem de `ABAS_SWIPE`, não daqui: o gesto de arrastar navega por
   * aquela lista, e se as duas divergissem o dedo iria para um lado e a pílula
   * para outro. Aqui ficam só o rótulo e o ícone de cada rota.
   */
  const APARENCIA: Record<string, { label: string; icon: React.ReactNode }> = {
    "/": { label: "Início", icon: <Home size={18} /> },
    "/pdv": { label: "Nova venda", icon: <ShoppingCart size={18} /> },
    /* O panorama e a lista viraram a mesma tela — ver `VendasPage`. */
    "/vendas": { label: gestor ? "Vendas" : "Minhas", icon: <BadgeDollarSign size={18} /> },
    "/clientes": { label: "Clientes", icon: <Users size={18} /> },
  };

  const principais: Item[] = ABAS_SWIPE.map((rota) => ({ rota, ...APARENCIA[rota] }));

  /*
   * O resto vai para a folha "Mais" — não cabe e não é de uso constante.
   *
   * Os grupos e a ordem acompanham a sidebar — Meu dia, Gestão da empresa,
   * Atendimento, Entregas, Conta. Não é simetria por simetria: quem usou o
   * computador procura no celular pelo nome que já viu, e dois vocabulários
   * para os mesmos dez destinos fazem a pessoa concluir que são menus
   * diferentes.
   *
   * A sigla (ERP, CRM, TMS) fica só na sidebar, na etiqueta ao lado do nome.
   * Aqui a folha não tem a mesma largura para dois textos por título, e o que
   * não pode faltar é a palavra que se entende — a sigla é o extra.
   *
   * O que muda é só a moldura: a sidebar tem uma faixa de atalhos em cima da
   * lista, aqui os mesmos atalhos são as abas de baixo e o resto desce nesta
   * folha. Numa folha que já custou um toque para abrir, esconder metade dos
   * destinos atrás de uma segunda troca cobraria caro demais; os títulos
   * separam o suficiente.
   */
  const secundarios: Item[] = [
    /* Produção abre a folha, como na sidebar. Ela absorveu as planilhas: o
       destino "/planilhas" virou uma das duas leituras de Produção › Kanban,
       e manter os dois aqui ofereceria duas portas para a mesma sala. */
    { rota: "/producao", label: "Produção", icon: <Factory size={18} />, recurso: "producao", familia: "Meu dia" },

    { rota: "/estoque", label: "Estoque/Serviços", icon: <Package size={18} />, familia: "Gestão da empresa" },
    // Financeiro voltou a ser destino próprio: caixa, a pagar e a receber numa tela só.
    ...(gestor ? [{ rota: "/financeiro", label: "Financeiro", icon: <Wallet size={18} />, recurso: "financeiro" }] : []),
    { rota: "/relatorios", label: "Relatórios", icon: <BarChart3 size={18} />, recurso: "relatorios" },
    /* Equipe é do dono, é módulo pago (`recurso`), e some de vez em plano de um
       login só — sem segunda pessoa não há equipe para gerenciar, e o cadeado
       prometeria uma tela que o upgrade não entregaria sozinho. */
    ...(gestor && planoTemEquipe(equipe) ? [{ rota: "/funcionarios", label: "Funcionários", icon: <UserCircle size={18} />, recurso: "funcionarios" }] : []),

    /*
     * WhatsApp no celular não é conveniência: é ONDE a loja responde.
     *
     * Ficou de fora quando a tela nasceu, e o resultado foi o destino existir
     * só no computador — quem atende do balcão, com o telefone na mão, não
     * tinha como chegar nele. O contador vem junto porque esta é a única tela
     * em que o trabalho chega sozinho, e a folha "Mais" já é o segundo toque:
     * sem o número, é preciso abrir para descobrir que não havia nada.
     */
    { rota: "/whatsapp", label: "WhatsApp", icon: <MessageCircle size={18} />, selo: "Teste", contagem: naoLidas, familia: "Atendimento" },

    // Correios voltou para "em breve" enquanto o módulo é finalizado. Fica na
    // folha, apagado: some do menu e ninguém descobre que existe. O selo é
    // "Em breve", não o cadeado de plano — o cadeado promete uma tela que o
    // upgrade destrava hoje, e essa ainda não está de pé.
    { rota: "/correios", label: "Correios", icon: <Truck size={18} />, emBreve: true, familia: "Entregas" },

    { rota: "/configuracoes", label: "Configurações", icon: <Settings size={18} />, familia: "Conta" },
  ];

  const ativo = (rota: string) => (rota === "/" ? pathname === "/" : pathname === rota || pathname.startsWith(`${rota}/`));

  const ir = (rota: string) => {
    // Mesmo critério da sidebar: sem som quando já se está no destino.
    if (!ativo(rota)) tocarNavegacao();

    setMaisAberto(false);
    navigate(rota);
  };

  /*
   * A dock vai para o `body` por portal, e não fica onde está escrita.
   *
   * Este é o conserto do "no iPhone ela fica alta demais". `position: fixed`
   * NÃO se resolve contra o visor quando algum ancestral tem `transform` ou
   * `filter` — o elemento passa a se posicionar contra esse ancestral. E o
   * `MainLayout` tem os dois: ele anima `scale` e `blur` na entrada e na saída
   * de cada tela. Enquanto a animação corre (e sempre que uma transição de
   * saída começa), a barra passa a medir "de baixo" a partir de uma caixa de
   * `100dvh` — que no iPhone raramente coincide com o que se está vendo,
   * porque a barra do Safari entra e sai e o `dvh` acompanha com atraso.
   * Resultado: a dock sobe.
   *
   * Pendurada no `body`, ela não tem ancestral transformado nenhum e o
   * `bottom` volta a significar "o chão do visor" — instalada na tela de
   * início ou aberta no Safari, dá no mesmo.
   */
  const dock = (
    /*
     * Barra encostada no chão, largura inteira, fundo sólido — não flutua.
     *
     * A cápsula de vidro deixava o fim das telas atrás dela e lia como enfeite
     * por cima do sistema; a barra é parte da moldura. Continua no `body` por
     * portal pelo mesmo motivo de antes: o `MainLayout` anima `scale`, e
     * `position: fixed` dentro de ancestral transformado não mede o visor.
     *
     * Cinco alvos: Início, Vendas, o carrinho (PDV) no meio — onde o polegar
     * cai —, Clientes e Mais. O carrinho não tem rótulo e usa `--carrinho`, que
     * nunca coincide com o destaque que marca a aba selecionada.
     */
    <motion.nav
      initial={{ y: 90 }}
      animate={{ y: 0 }}
      transition={reduzir ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }}
      className="fixed inset-x-0 bottom-0 z-[100] border-t border-fg/[0.07] bg-surface md:hidden"
      style={{ paddingBottom: "var(--dock-lift)" }}
    >
      <div className="mx-auto grid max-w-md grid-cols-5 items-center px-2" style={{ height: "var(--dock-h)" }}>
        {principais.map((it) =>
          it.rota === "/pdv" ? (
            <button
              key={it.rota}
              type="button"
              onClick={() => ir(it.rota)}
              aria-label={it.label}
              aria-current={ativo(it.rota) ? "page" : undefined}
              className="focus-ring relative z-10 flex justify-center rounded-full"
            >
              <span
                className={`grid h-[52px] w-[52px] place-items-center rounded-full bg-[rgb(var(--carrinho))] text-white shadow-[0_8px_20px_-6px_rgb(var(--carrinho)/0.75)] transition-all active:scale-95 ${ativo(it.rota) ? "scale-105 ring-4 ring-[rgb(var(--carrinho)/0.22)]" : ""}`}
              >
                <ShoppingCart size={24} strokeWidth={2.3} />
              </span>
            </button>
          ) : (
            <Aba key={it.rota} label={it.label} icon={it.icon} on={ativo(it.rota)} onClick={() => ir(it.rota)} reduzir={!!reduzir} />
          ),
        )}

        <Aba label="Mais" icon={<MoreHorizontal size={18} />} on={maisAberto} onClick={() => setMaisAberto(true)} reduzir={!!reduzir} expandido={maisAberto} />
      </div>
    </motion.nav>
  );

  return (
    <>
      {createPortal(dock, document.body)}

      <Sheet open={maisAberto} onClose={() => setMaisAberto(false)} title="Mais" subtitle={user?.nome ? `Conectado como ${user.nome}` : undefined}>
        <div className="flex flex-col gap-1 pb-2">
          {secundarios.map((it) => (
            <div key={it.rota}>
              {/* O mesmo corte da sidebar: Atendimento primeiro, Minha loja
                  depois. Aqui os títulos são uma linha de 10px e não uma aba —
                  numa folha que rola, trocar de aba esconderia metade dos
                  destinos atrás de um toque, e no celular a folha "Mais" já é
                  o segundo toque. Separar basta; dividir atrapalharia. */}
              {it.familia && (
                <p className="px-3 pb-1.5 pt-4 text-[10px] uppercase tracking-[0.18em] text-muted first:pt-1">
                  {it.familia}
                </p>
              )}

              {it.emBreve ? (
                <div className="flex min-h-[48px] w-full cursor-not-allowed items-center gap-3 rounded-xl px-3 text-left text-[14px] text-mist opacity-45">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fg/[0.05] text-faint">{it.icon}</span>
                  <span className="flex-1">{it.label}</span>
                  <span className="rounded-full border border-fg/[0.08] bg-fg/[0.03] px-2 py-0.5 text-[9px] uppercase tracking-wider text-faint">
                    Em breve
                  </span>
                </div>
              ) : it.recurso && !temRecurso(it.recurso) ? (
                <div className="flex min-h-[48px] w-full cursor-not-allowed items-center gap-3 rounded-xl px-3 text-left text-[14px] text-mist opacity-55">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fg/[0.05] text-faint">{it.icon}</span>
                  <span className="flex-1">{it.label}</span>
                  <span className="flex items-center gap-1 rounded-full border border-accent/20 bg-accent/[0.08] px-2 py-0.5 text-[9px] uppercase tracking-wider text-accent-soft">
                    <Lock size={9} />
                    Plano
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => ir(it.rota)}
                  className="focus-ring flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-left text-[14px] text-ink transition-colors hover:bg-fg/[0.05]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fg/[0.05] text-mist">{it.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>

                  {it.selo && (
                    <span className="shrink-0 rounded-full border border-accent/25 bg-accent/[0.10] px-2 py-0.5 text-[9px] uppercase tracking-wider text-accent-soft">
                      {it.selo}
                    </span>
                  )}

                  {Boolean(it.contagem) && (
                    <span
                      aria-label={`${it.contagem} ${it.contagem === 1 ? "mensagem não lida" : "mensagens não lidas"}`}
                      className="flex h-[18px] shrink-0 items-center gap-1 rounded-full border border-danger/30 bg-danger/[0.14] px-1.5 text-[10px] tabular-nums text-danger"
                    >
                      <Bell size={9} className="shrink-0" />
                      {(it.contagem ?? 0) > 99 ? "99+" : it.contagem}
                    </span>
                  )}
                </button>
              )}
            </div>
          ))}

          {/*
            A saída de emergência do service worker — ver `forcarAtualizacao`.

            No computador ela fica no Perfil, e lá basta. No celular o Perfil
            é o fim de uma tela dentro de Configurações dentro desta folha: três
            toques e uma rolagem até um botão que a pessoa nem sabe que existe.
            E é justamente no celular, com o app instalado, que o worker prende
            uma versão velha. Aqui ela fica a um toque do "Mais".
          */}
          <button
            type="button"
            onClick={() => {
              setAtualizando(true);
              void forcarAtualizacao();
            }}
            disabled={atualizando}
            className="focus-ring mt-3 flex min-h-[48px] items-center gap-3 rounded-xl border-t border-fg/[0.06] px-3 pt-3 text-left text-[14px] text-ink transition-colors hover:bg-fg/[0.05] disabled:opacity-60"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fg/[0.05] text-mist">
              <RefreshCw size={18} className={atualizando ? "animate-spin" : ""} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block">{atualizando ? "Buscando atualização…" : "Buscar atualização"}</span>
              <span className="block truncate text-[11px] text-faint">Versão {BUILD_ID}</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMaisAberto(false);
              Promise.resolve(logout()).catch(() => {});
            }}
            className="focus-ring mt-1 flex min-h-[48px] items-center gap-3 rounded-xl px-3 text-left text-[14px] text-danger transition-colors hover:bg-danger/10"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger/10">
              <LogOut size={18} />
            </span>
            Sair
          </button>
        </div>
      </Sheet>
    </>
  );
};

/**
 * A aba ativa é um bloco inteiro preenchido — ícone e nome juntos —, não só o
 * ícone aceso. O bloco é UM só (`layoutId`) e desliza de uma aba para a outra:
 * o movimento mostra de onde se saiu e para onde se foi. Passa por trás do
 * carrinho no caminho, por isso o carrinho fica acima (`z-10`).
 *
 * O "Mais" fica fora do `layoutId`: ele abre uma folha, não é um lugar — o
 * bloco aparece nele sem sair da aba em que a pessoa está.
 */
const Aba = ({ label, icon, on, onClick, reduzir, expandido }: { label: string; icon: React.ReactNode; on: boolean; onClick: () => void; reduzir: boolean; expandido?: boolean }) => {
  const ehMais = expandido !== undefined;
  const bloco = "absolute inset-0 rounded-2xl bg-accent shadow-[0_6px_16px_-8px_rgb(var(--accent)/0.8)]";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ehMais ? "Mais opções" : label}
      aria-current={on && !ehMais ? "page" : undefined}
      aria-expanded={ehMais ? expandido : undefined}
      className="focus-ring flex h-full items-center justify-center rounded-2xl px-0.5"
    >
      <span className={`relative flex h-[52px] w-full max-w-[72px] flex-col items-center justify-center gap-1 rounded-2xl transition-colors duration-200 ${on ? "text-white" : "text-mist active:bg-fg/[0.06]"}`}>
        {on &&
          (ehMais ? (
            <motion.span initial={reduzir ? false : { opacity: 0, scale: 0.75 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 480, damping: 30 }} className={bloco} />
          ) : (
            <motion.span layoutId="dock-ativo" transition={reduzir ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 38 }} className={bloco} />
          ))}

        {/* 21px, sobrescrevendo o `size={18}` do item por CSS: a lista de
            rotas é a mesma da folha "Mais", onde 18 é o tamanho certo. */}
        <motion.span
          className="relative [&_svg]:h-[21px] [&_svg]:w-[21px]"
          animate={reduzir ? {} : ehMais ? { rotate: expandido ? 90 : 0 } : on ? { y: [0, -3, 0], scale: [1, 1.12, 1] } : { y: 0, scale: 1 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          {icon}
        </motion.span>
        <span className={`relative whitespace-nowrap text-[11px] leading-none tracking-tight ${on ? "font-semibold" : "font-medium"}`}>{label}</span>
      </span>
    </button>
  );
};

export default TabBar;
