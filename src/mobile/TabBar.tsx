import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, ShoppingCart, DollarSign, Package, Users, Wallet, BarChart3, MoreHorizontal, Settings, LogOut, UserCircle, Truck, Lock, Factory, MessageCircle, Bell } from "lucide-react";

import useAuth from "@/features/auth/store/auth.store";
import { ehGestor } from "@/features/vendas/components/TabsVendas";
import useEquipeStore, { planoTemEquipe } from "@/features/funcionarios/store/equipe.store";
import Sheet from "@/shared/ui/Sheet";
import { tocarNavegacao } from "@/shared/session/somSessao";
import { ABAS_SWIPE } from "@/shared/hooks/useSwipeAbas";
import usePlano from "@/shared/plano/plano.store";
import useNaoLidas from "@/features/crm/store/naoLidas.store";

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
 * Navegação do celular — cápsula de vidro líquido flutuando no rodapé.
 *
 * ---------------------------------------------------------------------------
 * O caminho até aqui, porque ele explica o desenho
 * ---------------------------------------------------------------------------
 * Já foram duas barras antes desta, e as duas erraram por motivos opostos:
 *
 *   1. **Pílula `w-fit` centralizada.** Bonita e inútil: sendo do tamanho do
 *      conteúdo, sobravam faixas mortas nos dois lados e os alvos ficavam
 *      apertados no meio, longe de onde o polegar cai.
 *   2. **Faixa colada na borda, largura inteira.** Resolveu os alvos e criou
 *      outro problema, este só visível no iPhone: com a área segura do
 *      aparelho DENTRO dela, sobravam 34px de vidro vazio embaixo dos ícones.
 *      A barra tinha 92px de altura para mostrar 58px de conteúdo, e a leitura
 *      no aparelho era exatamente esta — "a barra está alta demais".
 *
 * Esta terceira fica no meio: uma cápsula que flutua (como a do iOS 26), mas
 * que ocupa quase a largura toda (`max-w-md`, `px-3`) em vez de se encolher ao
 * conteúdo. Os alvos passam de 80px, e a área segura fica FORA dela — o vidro
 * termina onde os ícones terminam.
 *
 * ---------------------------------------------------------------------------
 * O que sustenta o desenho
 * ---------------------------------------------------------------------------
 * - **Ela mora no `body`, por portal.** Não é detalhe de organização: é o que
 *   faz o `bottom` significar o chão do visor. Ver a nota longa em `dock`.
 * - **Os números moram no CSS** (`--dock-h`, `--dock-lift`, `--dock-space`, em
 *   `index.css`). A cápsula flutua SOBRE o conteúdo, então o rodapé das telas
 *   precisa reservar a altura dela — e foi justamente esse par que já
 *   divergiu uma vez, com a barra crescendo e o respiro ficando para trás.
 *   Agora é o mesmo token dos dois lados.
 * - **Toda aba mostra o nome.** O Instagram não mostra nenhum, e ali funciona:
 *   são cinco destinos abertos cinquenta vezes por dia. Aqui um carrinho e um
 *   cifrão lado a lado não dizem qual é "PDV" e qual é "Vendas" para quem
 *   entrou na segunda vez.
 * - **A pílula do item ativo desliza** (`layoutId`) em vez de piscar no
 *   destino. Um movimento lê como um lugar; dois piscas leem como um erro.
 * - **Só a cápsula recebe toque.** O envelope é `pointer-events-none`: as
 *   faixas ao lado dela mostram conteúdo, e conteúdo que se vê e não se toca é
 *   pior do que conteúdo escondido.
 * - **Arrastar a tela troca de aba.** A ordem das abas mora em `ABAS_SWIPE`
 *   (em `useSwipeAbas`) e é lida daqui — uma fonte só para o gesto e a dock.
 */
const TabBar = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [maisAberto, setMaisAberto] = useState(false);
  const reduzir = useReducedMotion();

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

  /*
   * A barra é a mesma para todos: o funcionário opera a loja inteira.
   *
   * A ORDEM vem de `ABAS_SWIPE`, não daqui: o gesto de arrastar navega por
   * aquela lista, e se as duas divergissem o dedo iria para um lado e a pílula
   * para outro. Aqui ficam só o rótulo e o ícone de cada rota.
   */
  const APARENCIA: Record<string, { label: string; icon: React.ReactNode }> = {
    "/": { label: "Início", icon: <LayoutDashboard size={18} /> },
    "/pdv": { label: "PDV", icon: <ShoppingCart size={18} /> },
    /* O panorama e a lista viraram a mesma tela — ver `VendasPage`. */
    "/vendas": { label: gestor ? "Vendas" : "Minhas vendas", icon: <DollarSign size={18} /> },
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

    { rota: "/clientes", label: "Clientes", icon: <Users size={18} />, familia: "Atendimento" },

    /*
     * WhatsApp no celular não é conveniência: é ONDE a loja responde.
     *
     * Ficou de fora quando a tela nasceu, e o resultado foi o destino existir
     * só no computador — quem atende do balcão, com o telefone na mão, não
     * tinha como chegar nele. O contador vem junto porque esta é a única tela
     * em que o trabalho chega sozinho, e a folha "Mais" já é o segundo toque:
     * sem o número, é preciso abrir para descobrir que não havia nada.
     */
    { rota: "/whatsapp", label: "WhatsApp", icon: <MessageCircle size={18} />, selo: "Teste", contagem: naoLidas },

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

  const mola = reduzir ? { duration: 0 } : ({ type: "spring", stiffness: 440, damping: 36 } as const);

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
    <div
      /*
       * O envelope não recebe toque (`pointer-events-none`); só a cápsula
       * recebe. Sendo uma pílula que não ocupa a largura toda, as faixas ao
       * lado dela mostram conteúdo — e conteúdo que se vê e não se toca é pior
       * do que conteúdo escondido, porque a pessoa tenta.
       */
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] px-3 md:hidden"
      style={{ paddingBottom: "var(--dock-lift)" }}
    >
      <motion.nav
        initial={{ y: 90, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={reduzir ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }}
        /*
         * `max-w-md` e centralizada: num aparelho de 390px ela ocupa quase a
         * largura inteira (os alvos continuam com mais de 80px), e num tablet
         * estreito ela para de crescer em vez de virar uma régua de ponta a
         * ponta com quatro ícones perdidos no meio.
         *
         * O raio é quase metade da altura — é o que faz a forma ler como
         * cápsula, e não como cartão de cantos arredondados.
         */
        className="glass-dock pointer-events-auto mx-auto flex w-full max-w-md items-stretch justify-around gap-1 rounded-[26px] px-1.5"
        style={{ height: "var(--dock-h)" }}
      >
        {principais.map((it) => {
          const on = ativo(it.rota);

          return (
            <motion.button
              key={it.rota}
              type="button"
              layout
              onClick={() => ir(it.rota)}
              aria-label={it.label}
              aria-current={on ? "page" : undefined}
              whileTap={reduzir ? undefined : { scale: 0.94 }}
              transition={mola}
              /*
               * `flex-1`: cada aba fica com a mesma fatia da cápsula. Com
               * largura de conteúdo sobrariam vãos mortos entre alvos de 48px,
               * e o dedo erra justamente nas bordas.
               */
              className={`focus-ring relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-[20px] transition-colors ${on ? "text-accent-soft" : "text-faint"}`}
            >
              {/* A pílula é um irmão posicionado, não o fundo do botão: assim
                  ela desliza entre os itens em vez de piscar no destino. */}
              {on && (
                <motion.span
                  layoutId="dock-ativo"
                  transition={mola}
                  /* Fundo lavado com um fio de luz em cima — a mesma leitura
                     de vidro da cápsula, uma camada acima dela. */
                  className="absolute inset-x-1 inset-y-1 rounded-[18px] bg-accent/[0.14] shadow-[inset_0_1px_0_rgb(var(--glass-highlight)/0.18)]"
                />
              )}

              {/* 20px, sobrescrevendo o `size={18}` do item por CSS.
                  A lista de rotas é a MESMA da folha "Mais": trocar o `size`
                  lá aumentaria também os ícones de dentro da folha, que já
                  estão no tamanho certo para uma lista de texto. */}
              <span className="relative shrink-0 [&_svg]:h-[20px] [&_svg]:w-[20px]">{it.icon}</span>

              {/*
               * O nome de TODAS as abas, sempre, embaixo do ícone.
               *
               * O Instagram não tem rótulo nenhum, e aqui isso não serve: lá
               * são cinco destinos que a pessoa abre cinquenta vezes por dia.
               * Aqui um carrinho e um cifrão lado a lado não dizem qual é
               * "PDV" e qual é "Vendas" para quem entrou na segunda vez.
               */}
              <span className="relative whitespace-nowrap text-[10px] leading-none tracking-tight">{it.label}</span>
            </motion.button>
          );
        })}

        <motion.button
          type="button"
          layout
          onClick={() => setMaisAberto(true)}
          aria-label="Mais opções"
          aria-expanded={maisAberto}
          whileTap={reduzir ? undefined : { scale: 0.94 }}
          transition={mola}
          className={`focus-ring relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-[20px] transition-colors ${maisAberto ? "text-accent-soft" : "text-faint"}`}
        >
          {maisAberto && (
            <motion.span
              initial={{ opacity: 0, scale: 0.75 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 480, damping: 30 }}
              className="absolute inset-x-1 inset-y-1 rounded-[18px] bg-accent/[0.14] shadow-[inset_0_1px_0_rgb(var(--glass-highlight)/0.18)]"
            />
          )}

          <motion.span className="relative" animate={reduzir ? {} : { rotate: maisAberto ? 90 : 0 }} transition={{ type: "spring", stiffness: 420, damping: 28 }}>
            <MoreHorizontal size={20} />
          </motion.span>
          <span className="relative whitespace-nowrap text-[10px] leading-none tracking-tight">Mais</span>
        </motion.button>
      </motion.nav>
    </div>
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

export default TabBar;
