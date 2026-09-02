import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, ShoppingCart, DollarSign, Package, Users, Wallet, BarChart3, MoreHorizontal, Settings, LogOut, UserCircle, Truck, Lock, Factory } from "lucide-react";

import useAuth from "@/features/auth/store/auth.store";
import { ehGestor } from "@/features/vendas/components/TabsVendas";
import useEquipeStore, { planoTemEquipe } from "@/features/funcionarios/store/equipe.store";
import Sheet from "@/shared/ui/Sheet";
import { tocarNavegacao } from "@/shared/session/somSessao";
import { ABAS_SWIPE } from "@/shared/hooks/useSwipeAbas";
import usePlano from "@/shared/plano/plano.store";

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
};

/**
 * Navegação do celular — dock flutuante, com a aba ativa expandida.
 *
 * A barra anterior era colada na borda, ocupando a largura toda, com ícone em
 * cima e rótulo embaixo nos quatro itens. Dois problemas nisso: quatro rótulos
 * de 10px competindo entre si o tempo todo — e nenhum deles é lido depois da
 * primeira semana de uso — e uma faixa cheia encostada na base, que fazia a
 * tela terminar num degrau.
 *
 * O desenho novo inverte a lógica: **só a aba em que você está mostra o nome**,
 * deitado ao lado do ícone dentro de uma pílula lavada; as outras ficam em
 * ícone puro. Quem está no PDV não precisa que a tela repita "PDV" — precisa
 * saber onde está e enxergar os outros destinos. E o nome aparecendo só ali dá
 * ao item ativo um peso que cor nenhuma sozinha daria.
 *
 * A dock solta do chão, com margem e cantos arredondados, é o que tira o
 * degrau: a tela continua atrás dela e o conteúdo respira até embaixo.
 *
 * Cuidados que o desenho exige:
 *
 * - **Rótulo escondido não é rótulo removido**: todo botão carrega `aria-label`,
 *   então leitor de tela anuncia o destino igual, ativo ou não.
 * - **A pílula desliza** (`layoutId`) e o nome abre junto, na mesma mola. Dois
 *   movimentos na mesma direção lêem como um só.
 * - **A dock não estica.** Ela tem a largura do próprio conteúdo (`w-fit`), e
 *   a aba ativa cresce só o que o nome precisa. Com `flex-1` ela engolia toda a
 *   sobra da barra e virava um bloco do tamanho de três botões.
 * - **52px de altura + 10 de margem** ficam abaixo dos 72px que o corpo das
 *   telas já reserva no rodapé — nenhuma tela precisou de ajuste.
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
    // Equipe é do dono e só existe em plano que comporta mais de um usuário.
    ...(gestor && planoTemEquipe(equipe) ? [{ rota: "/funcionarios", label: "Funcionários", icon: <UserCircle size={18} /> }] : []),

    { rota: "/clientes", label: "Clientes", icon: <Users size={18} />, familia: "Atendimento" },

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

  return (
    <>
      {/*
       * Barra encostada na borda, e não uma pílula flutuando no meio.
       *
       * ---------------------------------------------------------------------
       * O que a pílula fazia de errado
       * ---------------------------------------------------------------------
       * Ela era `w-fit`, centralizada, com 10px de folga até o fim da tela — e
       * FLUTUAVA sobre o conteúdo. Três consequências, todas vistas no
       * aparelho:
       *
       *   • COBRIA O QUE IMPORTA. No cadastro de cliente ela ficava por cima
       *     da linha "Cancelar / Cadastrar"; no orçamento, por cima do "Gerar
       *     orçamento". O último elemento de toda tela era o único que a barra
       *     escondia — e é sempre o botão que conclui a tarefa.
       *   • DESPERDIÇAVA A LARGURA. Sendo `w-fit` no meio, sobravam faixas
       *     mortas nos dois lados, e os alvos ficavam concentrados no centro
       *     em vez de espalhados onde o polegar alcança.
       *   • NÃO TINHA CHÃO. Sem fundo até a borda, o conteúdo aparecia por
       *     baixo dela ao rolar, atravessando os ícones.
       *
       * Agora ela ocupa a largura inteira, tem fundo próprio até o fim da tela
       * (inclusive dentro da área segura do aparelho) e o corpo da página
       * reserva a altura dela — ver `PAGE_PAD` em `PageShell`. Nada mais passa
       * por baixo, e nada mais fica escondido atrás.
       */}
      <div className="fixed inset-x-0 bottom-0 z-[100] md:hidden">
        <motion.nav
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={reduzir ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }}
          className="glass-strong flex h-[58px] items-stretch justify-around gap-1 border-x-0 border-b-0 border-t px-1"
          style={{
            borderColor: "rgb(var(--glass-border) / calc(var(--glass-border-alpha) + 0.06))",
            boxShadow: "0 -8px 24px -18px rgb(0 0 0 / 0.5)",
            paddingBottom: "env(safe-area-inset-bottom)",
            height: "calc(58px + env(safe-area-inset-bottom))",
          }}
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
                 * Agora É `flex-1`: cada aba fica com a mesma fatia da barra.
                 *
                 * Na pílula os botões tinham largura de conteúdo porque a
                 * própria pílula se ajustava a eles. Numa barra que ocupa a
                 * tela, largura de conteúdo deixa alvos de 48px separados por
                 * vãos mortos — e o dedo erra justamente nas bordas. Divididos
                 * por igual, cada alvo passa de 100px de largura e a linha
                 * inteira é clicável.
                 */
                className={`focus-ring relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${on ? "text-accent-soft" : "text-faint"}`}
              >
                {/* A pílula é um irmão posicionado, não o fundo do botão: assim
                    ela desliza entre os itens em vez de piscar no destino. */}
                {on && (
                  <motion.span
                    layoutId="dock-ativo"
                    transition={mola}
                    /* Fundo lavado com anel, no lugar do accent chapado: a aba
                       fica marcada sem virar o objeto mais pesado da tela. */
                    className="absolute inset-x-1 inset-y-0.5 rounded-xl bg-accent/[0.12]"
                  />
                )}

                {/* 21px, sobrescrevendo o `size={18}` do item por CSS.
                    A lista de rotas é a MESMA da folha "Mais": trocar o `size`
                    lá aumentaria também os ícones de dentro da folha, que já
                    estão no tamanho certo para uma lista de texto. */}
                <span className="relative shrink-0 [&_svg]:h-[20px] [&_svg]:w-[20px]">{it.icon}</span>

                {/*
                 * O nome de TODAS as abas, sempre, embaixo do ícone.
                 *
                 * Antes só a aba ativa mostrava o rótulo, e ele abria em
                 * largura empurrando as vizinhas. Isso resolvia um problema da
                 * pílula (caber num espaço que se ajusta ao conteúdo) e criava
                 * outro: as abas onde você NÃO está — que são justamente as
                 * que você precisa identificar para ir a algum lugar — viravam
                 * ícones sem nome. Um carrinho e um cifrão lado a lado não
                 * dizem qual é "PDV" e qual é "Financeiro".
                 *
                 * Com a barra dividida por igual, cabe o rótulo embaixo do
                 * ícone em todas — e nenhuma se mexe quando a ativa muda.
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
            className={`focus-ring relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${maisAberto ? "text-accent-soft" : "text-faint"}`}
          >
            {maisAberto && (
              <motion.span
                initial={{ opacity: 0, scale: 0.75 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 480, damping: 30 }}
                className="absolute inset-x-1 inset-y-0.5 rounded-xl bg-accent/[0.12]"
              />
            )}

            <motion.span className="relative" animate={reduzir ? {} : { rotate: maisAberto ? 90 : 0 }} transition={{ type: "spring", stiffness: 420, damping: 28 }}>
              <MoreHorizontal size={20} />
            </motion.span>
            <span className="relative whitespace-nowrap text-[10px] leading-none tracking-tight">Mais</span>
          </motion.button>
        </motion.nav>
      </div>

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
                  {it.label}
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
