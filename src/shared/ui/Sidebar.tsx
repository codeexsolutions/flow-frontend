import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { Package, Users, DollarSign, Settings, LogOut, ShoppingCart, BarChart3, LayoutDashboard, UserCog, Wallet, LifeBuoy, Lock, MessageCircle, Factory, Bell } from "lucide-react";
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

/**
 * O menu do sistema — uma lista só, sem painel que troca.
 *
 * ---------------------------------------------------------------------------
 * O que saiu daqui: as abas
 * ---------------------------------------------------------------------------
 * A sidebar tinha três abas (Gerenciamento, Logística, Atendimento) e um
 * painel que trocava de conteúdo conforme a escolhida. Custava caro e resolvia
 * pouco:
 *
 *   • METADE DO MENU FICAVA ESCONDIDA. Ir do estoque para o financeiro eram
 *     dois cliques — um para trocar de aba, outro no item —, e o primeiro
 *     exigia lembrar em qual aba o destino morava. Quem não lembrava
 *     procurava nas três.
 *   • O SELETOR CUSTAVA O ESPAÇO DE SEIS ITENS. Três colunas com ícone em
 *     cima do rótulo, mais a borda e o respiro, ocupavam ~86 px para exibir
 *     zero destinos.
 *   • DUAS DELAS TINHAM UM ITEM ÚTIL CADA. Logística era Estoque + Correios
 *     ("em breve"); Atendimento era Clientes (repetido de Gerenciamento) +
 *     WhatsApp (sem tela). Uma aba para um item é uma gaveta com uma folha
 *     dentro.
 *
 * O sistema inteiro são dez destinos. Dez cabem numa lista, e uma lista
 * responde "onde está X?" sem obrigar a abrir gaveta.
 *
 * ---------------------------------------------------------------------------
 * O que saiu depois: a faixa de atalhos
 * ---------------------------------------------------------------------------
 * No lugar das abas ficou uma faixa com dois botões grandes — Início e PDV,
 * ícone em cima do rótulo, dois quadrados ocupando a largura do menu. A ideia
 * era destacar o que se abre dez vezes por dia, mas o preço apareceu no uso:
 * ~70 px de altura para DOIS destinos, uma segunda gramática de navegação
 * (quadrado preenchido) convivendo com a da lista (linha com ícone à
 * esquerda), e o olho tendo que procurar em dois lugares diferentes de que
 * jeito o sistema mostra "você está aqui".
 *
 * Agora eles são os dois primeiros ITENS da lista, num bloco próprio no alto.
 * Continuam sendo os primeiros que a vista encontra — o alto do menu já é o
 * destaque —, custam a altura de duas linhas e acendem igual a todo o resto.
 *
 * ---------------------------------------------------------------------------
 * Os grupos são só um título
 * ---------------------------------------------------------------------------
 * O resto da lista é separado por assunto — Gestão e Atendimento —, com
 * palavras do balcão e não siglas (ERP, CRM).
 *
 * Entregas (Correios) saiu do menu: a tela continua existindo pela URL, mas
 * deixou de ocupar um bloco inteiro para um item só.
 *
 * Eles já foram sanfonas que abriam e fechavam. Saíram: com os três sempre
 * abertos desde que o WhatsApp entrou em Atendimento, a seta e o clique no
 * título eram um controle que ninguém usava, mais um enfeite em cada grupo e
 * mais uma coisa que podia esconder o lugar onde a pessoa está. O menu inteiro
 * cabe na tela; o título agora só nomeia.
 *
 * ---------------------------------------------------------------------------
 * Onde você está, de longe
 * ---------------------------------------------------------------------------
 * O item da tela aberta é PREENCHIDO na cor de destaque, com o texto em
 * branco. Era um véu de 10% da cor sobre o fundo de vidro — legível de perto,
 * mas que sumia na visão periférica e em metade dos temas. Preenchido, o menu
 * responde "onde estou?" sem precisar ser lido.
 */

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

  /*
   * As mensagens de cliente esperando resposta — o número ao lado de WhatsApp.
   *
   * A caixa de entrada é a única tela em que o trabalho CHEGA sozinho, e o
   * menu era o último lugar a saber: sem o selo, descobrir que alguém escreveu
   * exigia abrir o WhatsApp de tempos em tempos. Uma vez na abertura e depois
   * só quando o tempo real avisa — a mesma escuta que a caixa de entrada usa.
   */
  const naoLidas = useNaoLidas((s) => s.total);
  const buscarNaoLidas = useNaoLidas((s) => s.buscar);

  useEffect(() => {
    void buscarNaoLidas();
  }, [buscarNaoLidas]);

  useSincronizacao(["crm"], () => {
    void buscarNaoLidas();
  });

  /* Só o gestor pergunta: a API recusa para vendedor, e uma chamada que sempre
     falha em toda navegação é ruído no log e na rede. */
  const equipe = useEquipeStore((s) => s.equipe);
  const buscarEquipe = useEquipeStore((s) => s.buscar);

  useEffect(() => {
    if (gestor) buscarEquipe();
  }, [gestor, buscarEquipe]);

  /**
   * Rotas que são filhas de outra no menu. Sem esta lista, estar em
   * `/vendas/orcamentos` acenderia "Vendas" **e** "Orçamentos" ao mesmo tempo,
   * porque Vendas casa por prefixo.
   */
  const FILHAS_COM_ITEM_PROPRIO = ["/vendas/orcamentos"];

  const isActive = (route: string) => {
    if (route === "") return pathname === "/";

    const alvo = `/${route}`;

    if (pathname === alvo) return true;
    if (!pathname.startsWith(`${alvo}/`)) return false;

    // O pai não acende quando a filha tem item próprio no menu.
    return !FILHAS_COM_ITEM_PROPRIO.some((f) => f !== alvo && pathname.startsWith(f));
  };

  const reduzir = useReducedMotion();

  const goto = (route: string) => {
    // Não toca ao clicar onde já se está: som sem mudança confunde.
    if (!isActive(route)) tocarNavegacao();

    navigate(route);
  };

  const handleLogout = () => {
    Promise.resolve(logout()).catch(() => {});
  };

  /**
   * `bloqueado` é diferente de `disabled`, mas os dois são inertes.
   *
   * "Em breve" é tela que ainda não existe. "Plano" é módulo que existe e não
   * foi contratado. A distinção continua valendo no rótulo — são notícias
   * diferentes e a segunda tem conserto —, mas nenhum dos dois recebe clique.
   *
   * Chegar a uma oferta é o clique de quem procurou a oferta. Quem clica em
   * "Correios" quer despachar uma encomenda, e receber uma tela de venda no
   * lugar é uma troca que a pessoa não pediu; feita todo dia, no mesmo item,
   * vira ruído no menu. O cadeado já diz o que precisa ser dito, e o `title`
   * explica no hover — sem cobrar nada por isso.
   *
   * A tela de oferta (`RecursoDoPlano`) continua de pé para quem chega pela
   * URL, pelo celular ou por link salvo. O que deixou de existir é o convite
   * disfarçado de destino.
   */
  /**
   * `selo` é o rótulo pequeno ao lado do nome — hoje só o "Teste" do WhatsApp.
   *
   * Diferente do "Breve" e do cadeado de plano: aqueles dizem que a tela NÃO
   * abre. Este diz que ela abre e ainda está sendo acertada, que é uma
   * informação que o lojista precisa ANTES de apostar o atendimento dele nela.
   */
  const item = (route: string, icon: ReactNode, label: string, disabled = false, bloqueado = false, contagem = 0, selo?: string) => {
    if (bloqueado && !disabled) {
      return (
        <div
          className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] text-mist opacity-55"
          title={`${label} não está incluído no seu plano. Veja as opções em Configurações › Faturas.`}
        >
          <span className="flex w-6 shrink-0 justify-center text-faint">{icon}</span>
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <Lock size={11} className="shrink-0 text-accent-soft" />
        </div>
      );
    }

    if (disabled) {
      return (
        <div className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] text-mist opacity-45" title={`${label} está em breve`}>
          <span className="flex w-6 shrink-0 justify-center text-faint">{icon}</span>
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <span className="shrink-0 rounded-full border border-fg/[0.08] bg-fg/[0.03] px-1.5 py-0.5 text-[8.5px] uppercase tracking-wider text-faint">Breve</span>
        </div>
      );
    }

    const active = isActive(route);

    return (
      <button
        type="button"
        onClick={() => goto(route)}
        aria-current={active ? "page" : undefined}
        className={`group focus-ring relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] transition-colors duration-200 ${
          active ? "text-white" : "text-mist hover:bg-fg/[0.06] hover:text-ink"
        }`}
      >
        {/*
         * O fundo preenchido do item aberto.
         *
         * Sem `layoutId`, de propósito: a pílula deslizante distorcia, porque
         * a sidebar vive num contêiner que o `MainLayout` anima com `scale` e
         * o framer mede o layout na escala errada. Um surgimento firme no
         * próprio item comunica o mesmo e nunca quebra.
         */}
        {active && (
          <motion.span
            aria-hidden
            /* A cor sólida do tema com um reflexo branco por cima — e não um
               degradê até o `accent-strong`, que no tema escuro é MAIS claro e
               deixava o texto branco sem contraste no fim da pílula. */
            className="absolute inset-0 rounded-xl bg-accent"
            style={{
              backgroundImage: "linear-gradient(90deg, rgb(255 255 255 / 0.14), transparent 70%)",
              boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.18), 0 8px 24px -10px rgb(var(--accent) / 0.75)",
            }}
            initial={reduzir ? false : { opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          />
        )}

        <span className={`relative flex w-6 shrink-0 justify-center transition-colors duration-200 ${active ? "text-white" : "text-faint group-hover:text-accent-soft"}`}>{icon}</span>

        <span className="relative min-w-0 flex-1 truncate">{label}</span>

        {/* O selo vem ANTES do contador: "Teste" é sobre a tela, o número é
            sobre o que está esperando lá dentro. */}
        {selo && (
          <span
            className={`relative shrink-0 rounded-full border px-2 py-0.5 text-[9.5px] uppercase tracking-wider ${
              active ? "border-white/30 bg-white/15 text-white" : "border-accent/25 bg-accent/[0.10] text-accent-soft"
            }`}
          >
            {selo}
          </span>
        )}

        {/* O que está esperando: um sininho e o número, parados — e só quando
            há algo, porque um zero permanente ensina o olho a ignorar o lugar
            onde o aviso apareceria. A cor é a do TEMA (`--danger`). */}
        {contagem > 0 && (
          <span
            aria-label={`${contagem} ${contagem === 1 ? "mensagem não lida" : "mensagens não lidas"}`}
            className={`relative flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] tabular-nums ${
              active ? "bg-white text-danger" : "border border-danger/30 bg-danger/[0.14] text-danger"
            }`}
          >
            <Bell size={9} className="shrink-0" />
            {contagem > 99 ? "99+" : contagem}
          </span>
        )}
      </button>
    );
  };

  /**
   * Um grupo do menu, em bloco próprio.
   *
   * Cada assunto mora numa caixa com moldura e o nome no topo: a divisão é
   * visível de relance, e o olho acha o grupo pela caixa antes de ler
   * qualquer item. O traço depois do nome fecha a linha até a borda.
   *
   * `explicacao` fica no `title`: a frase inteira ajuda quem procura onde
   * mora um assunto, e no hover ela não custa linha nenhuma do menu.
   */
  const bloco = (filhos: ReactNode, cabecalho?: { nome: string; explicacao: string }) => (
    <div className="rounded-2xl border border-fg/[0.07] bg-fg/[0.025] p-1.5 shadow-[inset_0_1px_0_rgb(var(--glass-highlight)/0.06)]">
      {cabecalho && (
        <p title={cabecalho.explicacao} className="flex items-center gap-2 px-3 pb-2 pt-2 text-[12px] uppercase tracking-[0.12em] text-accent-soft">
          {cabecalho.nome}
          <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-fg/[0.1] to-transparent" />
        </p>
      )}
      <div className="space-y-0.5">{filhos}</div>
    </div>
  );

  return (
    <>
      {/* `relative` é obrigatório: o brilho do topo é `absolute` e, sem um
          ancestral posicionado, ele se prende à viewport e cobre a tela toda. */}
      <aside
        className="glass-strong relative hidden w-72 flex-shrink-0 flex-col overflow-hidden border-y-0 border-l-0 border-r md:flex"
        style={{ borderColor: "rgb(var(--glass-border) / calc(var(--glass-border-alpha) + 0.03))" }}
      >
        {/* Fio de luz na borda direita — separa o menu do conteúdo com a cor do
            tema, em vez de uma linha cinza que some no vidro. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-px"
          style={{ background: "linear-gradient(to bottom, rgb(var(--accent) / 0.55), rgb(var(--accent) / 0.12) 45%, transparent)" }}
        />

        {/* Malha de pontos — o mesmo fundo de "instrumento" do painel do
            Início, apagando para baixo para não pesar atrás da lista. */}
        <div
          aria-hidden
          className="hud-grade pointer-events-none absolute inset-0 opacity-70"
          style={{ maskImage: "linear-gradient(to bottom, black, transparent 75%)", WebkitMaskImage: "linear-gradient(to bottom, black, transparent 75%)" }}
        />

        {/* Brilho ambiente no topo */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-44"
          style={{
            opacity: "var(--fx-aurora, 1)",
            background: "radial-gradient(ellipse 70% 100% at 50% 0%, rgb(var(--accent) / 0.18), transparent 70%)",
          }}
        />

        {/*
         * Marca da empresa — o logo, o nome e o que esta tela é.
         *
         * O nome sozinho ao lado do logo dizia DE QUEM é o sistema e nada
         * sobre o que está aberto: a mesma marca aparece no PDV do balcão, no
         * acompanhamento que o cliente abre pelo link e na tela de login. A
         * segunda linha nomeia o lugar — é o cabeçalho de um painel, e quem
         * abre precisa saber que entrou na administração da loja, não numa
         * das telas públicas que levam a mesma marca.
         *
         * Ela acompanha quem está logado: o vendedor não administra nada, e
         * chamar de "administrativo" a tela dele prometeria um poder que a
         * própria lista abaixo não dá.
         */}
        <div className="relative flex items-center gap-3.5 px-5 pb-3 pt-5">
          <div className="relative h-12 w-12 shrink-0">
            <div aria-hidden className="absolute -inset-1 rounded-xl bg-accent/40 blur-md" style={{ opacity: "calc(0.7 * var(--fx-glow, 1))" }} />
            <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-surface-raised to-surface ring-1 ring-accent/30">
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
                <span className="text-[19px] text-accent-soft">{companyInitial}</span>
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] leading-tight tracking-tight text-ink">{enterprise?.nomeFantasia || "Sua Empresa"}</p>
            <p className="mt-1 truncate text-[10.5px] uppercase leading-tight tracking-[0.14em] text-accent-soft/80">
              {gestor ? "Painel administrativo" : "Painel do vendedor"}
            </p>
          </div>
        </div>

        {/*
         * A lista inteira, sem gaveta.
         *
         * `overflow-y-auto` continua aqui para a tela baixa e para o dia em
         * que aparecer o décimo primeiro destino — mas com as sanfonas ele
         * quase nunca entra em ação: fechadas, os grupos custam
         * uma linha cada.
         */}
        <nav className="relative flex-1 space-y-3 overflow-y-auto px-3 py-4">
          {/*
           * O bloco do dia a dia — sem cabeçalho de grupo.
           *
           * São os dois destinos que se abrem toda hora, e nomeá-los custaria
           * uma linha para dizer o óbvio de duas: "Início" e "PDV" não
           * pertencem a um domínio do produto, são o começo do expediente. O
           * traço abaixo os separa dos grupos sem gastar altura com título.
           */}
          {bloco(
            <>
              {item("", <LayoutDashboard size={18} />, "Início")}
              {/* "PDV" fica: não é jargão de software, é o nome que o lojista já
                  usa, e é como a tela se chama no tour e na barra do celular. */}
              {item("pdv", <ShoppingCart size={18} />, "PDV")}
            </>,
          )}

          {bloco(
            <>
              {/* "e serviços" no rótulo: é a mesma tela de sempre, mas quem
                  presta serviço cadastra serviço nela, e sem isso metade dos
                  clientes procurava um menu que não existe. */}
              {item("estoque", <Package size={18} />, "Estoque/Serviços")}

              {/*
               * Dois itens, dois assuntos.
               *
               * Eram um só ("Financeiro"), porque vendas e dinheiro eram a
               * mesma tela em cinco abas — e o menu mandava para uma tela cujo
               * título era outro. Agora a divisão é a que o lojista já faz de
               * cabeça: o que EU VENDI (panorama e notas, juntos) e o DINHEIRO
               * DA EMPRESA (caixa, a pagar, a receber, juntos).
               *
               * O vendedor fica só com o primeiro, e ele se chama "Minhas
               * vendas": a lista dele já traz só as próprias notas.
               */}
              {item("vendas", <DollarSign size={16} />, gestor ? "Vendas" : "Minhas vendas")}
              {gestor && item("financeiro", <Wallet size={18} />, "Financeiro", false, !temRecurso("financeiro"))}
              {item("relatorios", <BarChart3 size={18} />, "Relatórios", false, !temRecurso("relatorios"))}

              {/*
               * Produção reúne o que era Planilhas mais o quadro de etapas.
               *
               * É UM item, e não uma gaveta com as duas telas dentro: a
               * navegação entre Produções e Kanban mora na barra da própria
               * tabela, junto do conteúdo que ela troca (ver `AbasProducao`).
               *
               * Fica com o cadeado abaixo do Professional porque é lá que o
               * módulo entra — e o cadeado, não a ausência, é de propósito:
               * quem não vê o item nunca descobre que o upgrade destrava um
               * controle de produção, e essa é a razão de subir de plano.
               */}
              {item("producao", <Factory size={18} />, "Produção", false, !temRecurso("producao"))}


              {/* Equipe só existe em plano que comporta mais de um usuário:
                  mostrar para quem tem uma vaga só seria oferecer porta que
                  não abre. `planoTemEquipe` vale por CIMA da trava de plano —
                  um plano que inclui o módulo mas só permite um login não tem
                  equipe para gerenciar, e a tela apareceria vazia. */}
              {gestor && planoTemEquipe(equipe) && item("funcionarios", <UserCog size={18} />, "Funcionários", false, !temRecurso("funcionarios"))}
            </>,
          { nome: "Gestão", explicacao: "A empresa por dentro: o que você tem em estoque, quanto entra e sai de dinheiro, o que sai da oficina, quem trabalha com você e o que os números dizem." },
          )}

          {bloco(
            <>
              {/* Clientes aparecia duas vezes no menu antigo, uma em cada aba,
                  para não cobrar troca de gaveta no destino mais visitado do
                  sistema. Sem gavetas, uma vez basta. */}
              {item("clientes", <Users size={18} />, "Clientes")}
              {/* Deixou de ser "Em breve": a caixa de entrada, o funil e a
                  conexão do número da loja moram em `/whatsapp` (ver `CrmPage`). */}
              {item("whatsapp", <MessageCircle size={18} />, "WhatsApp", false, false, naoLidas, "Teste")}
              {/*
                O Chatbot NÃO entra nesta versão.
                
                O WhatsApp sai em teste, e resposta automática é a parte que não
                pode sair assim: o que ela escreve chega ao cliente da loja sem
                ninguém ver, em nome da loja. Errar no funil é um cartão na raia
                errada; errar aqui é a loja prometendo prazo que não cumpre.
                
                O código da tela continua no repositório (`ChatbotPage`), e a
                rota `/chatbot` leva ao WhatsApp para não quebrar link salvo —
                ver `AppRoutes`. Quando o robô for liberado, é devolver esta
                linha e a rota.
              */}
            </>,
          { nome: "Atendimento", explicacao: "As pessoas do outro lado do balcão: quem compra de você, o histórico de cada uma e os canais para falar com elas." },
          )}
        </nav>

        {/* Ajuda — fica fora da navegação: não é lugar que se visita no fluxo de
            trabalho, é a saída para quando algo trava. */}
        <div className="relative mx-3 mb-3 rounded-2xl border border-fg/[0.07] bg-fg/[0.025] p-1.5">
          {item("ajuda", <LifeBuoy size={18} />, "Ajuda e suporte")}

          {/* Instalar o app: some sozinho quando já está instalado ou quando o
              navegador não instala PWA — ver `BotaoInstalar`. */}
          <BotaoInstalar variante="menu" />
        </div>

        {/*
         * Rodapé: quem está usando, e as duas coisas que se faz com isso.
         *
         * Eram dois blocos empilhados — um cartão de usuário e uma faixa com
         * logo, versão e "Sair" — somando ~130 px no pé da sidebar, e o "Sair"
         * ficava a dois blocos de distância do avatar de quem sai. Numa linha
         * só, com configurações e sair como ícones ao lado do nome, custa ~50.
         *
         * A versão do sistema saiu daqui: era a única linha do menu que não
         * levava a lugar nenhum. Ela e o "buscar atualização" foram para
         * Configurações › Meu perfil › Conta, que é onde se procura o que é
         * sobre a instalação e não sobre o trabalho.
         */}
        <div className="relative border-t border-fg/[0.07] p-2.5">
          <div className="flex items-center gap-2.5 rounded-2xl border border-fg/[0.07] bg-fg/[0.03] p-2">
            {user?.image ? (
              <img src={user.image} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-fg/10" />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-soft to-accent text-[13px] text-white ring-1 ring-fg/10">{userInitials}</div>
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] leading-tight text-ink">{user?.nome || "Usuário"}</p>
              <p className="mt-0.5 truncate text-[12px] leading-tight text-faint">{user?.cargo || "Conectado"}</p>
            </div>

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
      </aside>
    </>
  );
};

export default Sidebar;
