import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { Package, Users, DollarSign, Settings, LogOut, ShoppingCart, BarChart3, LayoutDashboard, Truck, UserCog, Wallet, LifeBuoy, Lock, MessageCircle, Factory, ChevronDown, Bell } from "lucide-react";
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
 * Os grupos são sanfonas, e só o primeiro vem aberto
 * ---------------------------------------------------------------------------
 * O resto da lista é separado em três assuntos. Eles já se chamaram ERP, CRM
 * e TMS: as siglas são do nosso mercado, não do balcão — ninguém pensa "vou
 * abrir o CRM", pensa "vou ver o cliente". Três siglas de três letras
 * separando dez itens não dizem a ninguém o que há embaixo de cada uma, e um
 * menu cujos títulos não ajudam é lido item a item, todas as vezes. Ficaram
 * as palavras: Gestão da empresa, Atendimento, Entregas.
 *
 * E os três abrem e fecham. Aberta vem só a gestão — estoque, vendas,
 * financeiro, relatórios, produção, equipe: é o trabalho do dia e responde
 * pela maioria dos cliques. Atendimento e Entregas ficam recolhidos em uma
 * linha cada, e continuam a um clique de distância; assim o menu inteiro cabe
 * na tela baixa sem rolagem, em vez de gastar altura com dez destinos abertos
 * dos quais oito não serão usados agora.
 *
 * A sanfona ABRE SOZINHA a seção de onde você está: chegar em Clientes por um
 * link e encontrar "Atendimento" fechado faria o menu mentir sobre a tela
 * aberta. Depois disso, quem fechar manda — a escolha da pessoa não é
 * desfeita a cada navegação dentro da mesma seção.
 */

/* -------------------------------------------------------------------------- */

/** Os três assuntos da lista — o `id` é a chave do aberto/fechado. */
type IdSecao = "gestao" | "atendimento" | "entregas";

/**
 * As rotas de cada seção.
 *
 * Serve a uma coisa só: saber em qual sanfona está a tela aberta, para
 * escancará-la sozinha. Sem isso, quem chega em `/clientes` por um link vê
 * "Atendimento" fechado e o menu deixa de dizer onde a pessoa está.
 */
const ROTAS_DA_SECAO: Record<IdSecao, string[]> = {
  gestao: ["estoque", "vendas", "financeiro", "relatorios", "producao", "funcionarios"],
  atendimento: ["clientes", "whatsapp", "chatbot"],
  entregas: ["correios"],
};

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

  /* Só a gestão vem aberta: é o trabalho do dia. As outras duas custam uma
     linha cada enquanto ninguém precisa delas. */
  /*
   * Atendimento nasce ABERTA desde que o WhatsApp entrou nela.
   *
   * Fechada, a seção escondia a única tela do sistema em que o trabalho CHEGA
   * sozinho: o cliente escreveu, a mensagem está lá, e o menu mostrava um
   * título cinza que ninguém clica. "Não dá para acessar o WhatsApp" foi
   * exatamente isso — o destino existia e estava a um toque invisível de
   * distância.
   *
   * Entregas continua fechada: lá dentro só há o Correios, que ainda é "em
   * breve". Abrir uma gaveta para mostrar uma porta que não abre é pior que
   * deixá-la fechada.
   */
  const [abertas, setAbertas] = useState<Record<IdSecao, boolean>>({ gestao: true, atendimento: true, entregas: false });

  /* A seção da tela aberta se escancara — e só ela, e só quando entra: quem
     fechou uma seção continua com ela fechada enquanto navega dentro dela. */
  useEffect(() => {
    const dona = (Object.keys(ROTAS_DA_SECAO) as IdSecao[]).find((id) =>
      ROTAS_DA_SECAO[id].some((r) => pathname === `/${r}` || pathname.startsWith(`/${r}/`)),
    );

    if (dona) setAbertas((atual) => (atual[dona] ? atual : { ...atual, [dona]: true }));
  }, [pathname]);

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
          className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2 opacity-55"
          title={`${label} não está incluído no seu plano. Veja as opções em Configurações › Faturas.`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-fg/[0.04] text-faint">{icon}</span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-mist">{label}</span>
          <Lock size={10} className="shrink-0 text-accent-soft" />
        </div>
      );
    }

    if (disabled) {
      return (
        <div className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2 opacity-45" title={`${label} está em breve`}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-fg/[0.04] text-faint">{icon}</span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-mist">{label}</span>
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
        className={`group focus-ring relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px] transition-all duration-200 ${
          active
            ? "bg-accent/[0.10] text-ink"
            : "text-mist hover:bg-fg/[0.05] hover:text-ink"
        }`}
      >
        {/*
         * Sem `layoutId` aqui, de propósito.
         *
         * A pílula deslizante distorcia: animação de layout precisa medir o
         * elemento em pixels reais, e a sidebar vive dentro de um contêiner que
         * o `MainLayout` anima com `scale`. O framer mede na escala errada e o
         * resultado é a borda esticada, atravessando os itens vizinhos.
         *
         * A troca aqui é rápida e curta — quem clica no menu já está olhando
         * para o item que clicou. Um surgimento firme com o traço lateral
         * comunica a mesma coisa, e nunca quebra.
         */}
        {active && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-xl border border-accent/20 bg-gradient-to-r from-accent/[0.18] via-accent/[0.06] to-transparent"
            style={{ boxShadow: "inset 0 1px 0 rgb(var(--glass-highlight) / 0.14)" }}
            initial={reduzir ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          />
        )}

        <span
          className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200 ${
            active
              ? "bg-accent/25 text-accent-soft ring-1 ring-inset ring-accent/30"
              : "bg-fg/[0.04] text-faint group-hover:bg-fg/[0.08] group-hover:text-accent-soft"
          }`}
        >
          {icon}
        </span>

        <span className="relative min-w-0 flex-1 truncate">{label}</span>

        {/* O selo vem ANTES do contador: "Teste" é sobre a tela, o número é
            sobre o que está esperando lá dentro. Trocados, o aviso de versão
            pareceria um rótulo das mensagens. */}
        {selo && (
          <span className="relative shrink-0 rounded-full border border-accent/25 bg-accent/[0.10] px-1.5 py-0.5 text-[8.5px] uppercase tracking-wider text-accent-soft">
            {selo}
          </span>
        )}

        {/*
         * O que está esperando: um sininho e o número, parados.
         *
         * O selo piscava entre o verde e o vermelho do tema para chamar de
         * longe, e chamava demais — um ponto se acendendo e apagando no canto
         * do olho, o tempo todo, na tela em que a pessoa está trabalhando em
         * outra coisa. O sino já diz "tem recado" sem se mexer, e a cor
         * continua sendo a do TEMA (`--danger`), não um vermelho cravado que
         * brigaria com metade das aparências.
         *
         * Só existe quando há algo: um zero permanente ensina o olho a ignorar
         * o lugar onde o aviso apareceria.
         */}
        {contagem > 0 && (
          <span
            aria-label={`${contagem} ${contagem === 1 ? "mensagem não lida" : "mensagens não lidas"}`}
            className="relative flex h-[18px] shrink-0 items-center gap-1 rounded-full border border-danger/30 bg-danger/[0.14] px-1.5 text-[10px] tabular-nums text-danger"
          >
            <Bell size={9} className="shrink-0" />
            {contagem > 99 ? "99+" : contagem}
          </span>
        )}
      </button>
    );
  };

  /**
   * Uma seção da sanfona: o título que abre e fecha, e os itens dentro.
   *
   * O título é uma PALAVRA, não uma sigla — ver a nota no alto do arquivo. O
   * traço à direita fecha a linha até a borda: sem ele o título flutua no meio
   * da lista e o menu volta a parecer uma pilha só. A seta diz de que lado a
   * seção está, e é o único enfeite: o cabeçalho inteiro é o alvo do clique,
   * porque mirar numa seta de 13px é trabalho que ninguém pediu.
   *
   * `explicacao` fica no `title`: a frase inteira ajuda quem está procurando
   * onde mora um assunto, e no hover ela não cobra linha nenhuma do menu.
   */
  const secao = (id: IdSecao, nome: string, explicacao: string, filhos: ReactNode, pendencias = 0) => {
    const aberta = abertas[id];

    return (
      <div className="pt-2.5 first:pt-0">
        <button
          type="button"
          onClick={() => setAbertas((atual) => ({ ...atual, [id]: !atual[id] }))}
          aria-expanded={aberta}
          title={explicacao}
          className="focus-ring flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-fg/[0.04]"
        >
          <p className="min-w-0 truncate text-[10px] uppercase tracking-[0.16em] text-muted">{nome}</p>
          <span aria-hidden className="h-px flex-1 bg-fg/[0.07]" />

          {/* Fechada, a seção ainda precisa dizer que tem gente esperando lá
              dentro: o selo do item some junto com o item, e sem isto quem
              recolhe Atendimento deixa de ver que o cliente escreveu. Aberta,
              o número aparece na própria linha do WhatsApp — mostrar nos dois
              lugares seria contar a mesma coisa duas vezes. */}
          {!aberta && pendencias > 0 && (
            <span
              aria-label={`${pendencias} ${pendencias === 1 ? "mensagem não lida" : "mensagens não lidas"}`}
              className="flex h-[16px] shrink-0 items-center gap-1 rounded-full border border-danger/30 bg-danger/[0.14] px-1.5 text-[9.5px] tabular-nums text-danger"
            >
              <Bell size={8} className="shrink-0" />
              {pendencias > 99 ? "99+" : pendencias}
            </span>
          )}

          <ChevronDown size={13} className={`shrink-0 text-faint transition-transform duration-200 ${aberta ? "" : "-rotate-90"}`} />
        </button>

        <AnimatePresence initial={false}>
          {aberta && (
            <motion.div
              key="itens"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={reduzir ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div className="space-y-1 pt-1">{filhos}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <>
      {/* `relative` é obrigatório: o brilho do topo é `absolute` e, sem um
          ancestral posicionado, ele se prende à viewport e cobre a tela toda. */}
      <aside
        className="glass-strong relative hidden w-64 flex-shrink-0 flex-col overflow-hidden border-y-0 border-l-0 border-r md:flex"
        style={{ borderColor: "rgb(var(--glass-border) / calc(var(--glass-border-alpha) + 0.03))" }}
      >
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
        <div className="relative flex items-center gap-2.5 border-b border-fg/[0.07] px-4 py-3">
          <div className="relative h-9 w-9 shrink-0">
            <div aria-hidden className="absolute -inset-1 rounded-xl bg-accent/30 blur-md" style={{ opacity: "calc(0.6 * var(--fx-glow, 1))" }} />
            <div className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-surface-raised to-surface ring-1 ring-fg/10">
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
                <span className="text-[14px] text-accent-soft">{companyInitial}</span>
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] leading-tight tracking-tight text-ink">{enterprise?.nomeFantasia || "Sua Empresa"}</p>
            <p className="truncate text-[9.5px] uppercase leading-tight tracking-[0.14em] text-faint">
              {gestor ? "Painel administrativo" : "Painel do vendedor"}
            </p>
          </div>
        </div>

        {/*
         * A lista inteira, sem gaveta.
         *
         * `overflow-y-auto` continua aqui para a tela baixa e para o dia em
         * que aparecer o décimo primeiro destino — mas com as sanfonas ele
         * quase nunca entra em ação: fechadas, Atendimento e Entregas custam
         * uma linha cada.
         */}
        <nav className="relative flex-1 space-y-1 overflow-y-auto px-3 py-2.5">
          {/*
           * O bloco do dia a dia — sem cabeçalho de grupo.
           *
           * São os dois destinos que se abrem toda hora, e nomeá-los custaria
           * uma linha para dizer o óbvio de duas: "Início" e "PDV" não
           * pertencem a um domínio do produto, são o começo do expediente. O
           * traço abaixo os separa dos grupos sem gastar altura com título.
           */}
          {item("", <LayoutDashboard size={16} />, "Início")}
          {/* "PDV" fica: não é jargão de software, é o nome que o lojista já
              usa, e é como a tela se chama no tour e na barra do celular. */}
          {item("pdv", <ShoppingCart size={16} />, "PDV")}

          <div aria-hidden className="!my-1 h-px bg-fg/[0.06]" />

          {secao(
            "gestao",
            "Gestão da empresa",
            "A empresa por dentro: o que você tem em estoque, quanto entra e sai de dinheiro, o que sai da oficina, quem trabalha com você e o que os números dizem.",
            <>
              {/* "e serviços" no rótulo: é a mesma tela de sempre, mas quem
                  presta serviço cadastra serviço nela, e sem isso metade dos
                  clientes procurava um menu que não existe. */}
              {item("estoque", <Package size={16} />, "Estoque/Serviços")}

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
              {gestor && item("financeiro", <Wallet size={16} />, "Financeiro", false, !temRecurso("financeiro"))}
              {item("relatorios", <BarChart3 size={16} />, "Relatórios", false, !temRecurso("relatorios"))}

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
              {item("producao", <Factory size={16} />, "Produção", false, !temRecurso("producao"))}


              {/* Equipe só existe em plano que comporta mais de um usuário:
                  mostrar para quem tem uma vaga só seria oferecer porta que
                  não abre. `planoTemEquipe` vale por CIMA da trava de plano —
                  um plano que inclui o módulo mas só permite um login não tem
                  equipe para gerenciar, e a tela apareceria vazia. */}
              {gestor && planoTemEquipe(equipe) && item("funcionarios", <UserCog size={16} />, "Funcionários", false, !temRecurso("funcionarios"))}
            </>,
          )}

          {secao(
            "atendimento",
            "Atendimento",
            "As pessoas do outro lado do balcão: quem compra de você, o histórico de cada uma e os canais para falar com elas.",
            <>
              {/* Clientes aparecia duas vezes no menu antigo, uma em cada aba,
                  para não cobrar troca de gaveta no destino mais visitado do
                  sistema. Sem gavetas, uma vez basta. */}
              {item("clientes", <Users size={16} />, "Clientes")}
              {/* Deixou de ser "Em breve": a caixa de entrada, o funil e a
                  conexão do número da loja moram em `/whatsapp` (ver `CrmPage`). */}
              {item("whatsapp", <MessageCircle size={16} />, "WhatsApp", false, false, naoLidas, "Teste")}
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
            naoLidas,
          )}

          {secao(
            "entregas",
            "Entregas",
            "O que sai da loja e vira encomenda: postagem, frete e rastreio até a mão do cliente.",
            <>
              {/* Correios está "Em breve" enquanto o módulo é finalizado. Não é
                  "Plano": o cadeado promete uma tela que o upgrade destrava
                  hoje, e essa ainda não está de pé. */}
              {item("correios", <Truck size={16} />, "Correios", true)}
            </>,
          )}
        </nav>

        {/* Ajuda — fica fora da navegação: não é lugar que se visita no fluxo de
            trabalho, é a saída para quando algo trava. */}
        <div className="relative border-t border-fg/[0.07] px-2.5 pb-1 pt-2">
          {item("ajuda", <LifeBuoy size={16} />, "Ajuda e suporte")}

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
          <div className="flex items-center gap-2.5">
            {user?.image ? (
              <img src={user.image} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-fg/10" />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-soft to-accent text-[11px] text-white ring-1 ring-fg/10">{userInitials}</div>
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] leading-tight text-ink">{user?.nome || "Usuário"}</p>
              <p className="truncate text-[10.5px] leading-tight text-faint">{user?.cargo || "Conectado"}</p>
            </div>

            {/* Mural da equipe — só gestor recebe (a API responde 403 ao vendedor). */}
            {gestor && <SinoNotificacoes />}

            <button
              type="button"
              onClick={() => goto("/configuracoes")}
              aria-label="Configurações"
              title="Configurações"
              className={`focus-ring flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-200 hover:rotate-45 hover:bg-fg/[0.08] ${isActive("configuracoes") ? "text-accent-soft" : "text-faint hover:text-accent-soft"}`}
            >
              <Settings size={15} />
            </button>

            <button
              type="button"
              onClick={handleLogout}
              aria-label="Sair"
              title="Sair"
              className="focus-ring flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-faint transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
