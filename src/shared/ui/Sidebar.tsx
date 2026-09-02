import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { Package, Users, DollarSign, Settings, LogOut, ShoppingCart, BarChart3, LayoutDashboard, Truck, UserCog, Wallet, LifeBuoy, Lock, MessageCircle, Factory } from "lucide-react";
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
 * A faixa do topo continua — e agora ela NAVEGA
 * ---------------------------------------------------------------------------
 * O lugar de destaque no alto do menu era bom demais para um interruptor. Ele
 * continua ali, com o mesmo peso visual, mas os três botões agora são
 * DESTINOS: Início, PDV e Planilhas — o que se abre dez vezes por dia. Antes
 * eles eram três linhas na lista, do mesmo tamanho de "Relatórios", que se
 * abre uma vez por mês.
 *
 * ---------------------------------------------------------------------------
 * Os grupos: ERP, CRM e TMS
 * ---------------------------------------------------------------------------
 * O resto da lista é separado pelos três domínios do produto. A versão
 * anterior usava nomes de área ("Cadastros", "Dinheiro", "Loja"), e são seis
 * grupos de um ou dois itens: mais cabeçalho do que conteúdo. Três domínios
 * agrupam os mesmos dez destinos em três cabeçalhos.
 */

/* -------------------------------------------------------------------------- */

/**
 * Os atalhos do alto.
 *
 * `rota` é o que `navigate` recebe — `""` é a raiz, e é assim que o `isActive`
 * distingue "/" de "qualquer coisa que começa com /".
 */
const ATALHOS: { rota: string; label: string; icone: typeof LayoutDashboard; recurso?: string }[] = [
  { rota: "", label: "Início", icone: LayoutDashboard },
  /* "PDV" fica: não é jargão de software, é o nome que o lojista já usa, e é
     como a tela se chama no tour e na barra do celular. */
  { rota: "pdv", label: "PDV", icone: ShoppingCart },
  /*
   * Planilhas saiu daqui, e não foi por espaço.
   *
   * Ela era um destino de menu ao lado de Início e PDV — mas planilha não é
   * um ASSUNTO, é um jeito de olhar a produção. Ao lado dela existia o quadro
   * de etapas, com os mesmos pedidos e as mesmas pessoas, e ter os dois no
   * menu obrigava a escolher a VISÃO antes de escolher o TRABALHO. Agora os
   * dois são as duas leituras de Produção › Kanban, e o menu tem um destino
   * onde tinha dois conceitos.
   *
   * A faixa fica com dois atalhos em vez de três, e a grade acompanha: dois
   * botões espremidos em três colunas deixariam um vão morto à direita.
   */
];

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
  const item = (route: string, icon: ReactNode, label: string, disabled = false, bloqueado = false) => {
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
      </button>
    );
  };

  /**
   * Cabeçalho de grupo: o nome que se entende, e a sigla ao lado.
   *
   * ---------------------------------------------------------------------------
   * Por que os dois, e não só a sigla
   * ---------------------------------------------------------------------------
   * A primeira versão deste menu usava "ERP", "CRM" e "TMS" sozinhos. Elas são
   * as siglas do nosso mercado, não as palavras de quem vende: ninguém no
   * balcão pensa "vou abrir o CRM", pensa "vou ver o cliente". Três siglas de
   * três letras separando dez itens não dizem a ninguém o que há embaixo de
   * cada uma — e um menu em que os títulos não ajudam é um menu lido item a
   * item, todas as vezes.
   *
   * Só as palavras simples também não bastavam: quem contrata o sistema
   * conhece as siglas, e a mesma tela é o que ele compara com o concorrente.
   *
   * Então são os dois, com pesos diferentes: a PALAVRA lidera (é ela que
   * responde "o que tem aqui?") e a SIGLA vem numa etiqueta ao lado, pequena,
   * para quem a procura. A frase inteira fica no `title`, para o hover de quem
   * quer saber mais sem ocupar linha nenhuma da sidebar.
   *
   * O traço à direita fecha a linha até a borda: sem ele o título flutua no
   * meio da lista e o menu volta a parecer uma pilha só.
   */

  /**
   * Cabeçalho de grupo: o nome que se entende, e a sigla ao lado.
   *
   * ---------------------------------------------------------------------------
   * Por que os dois, e não só a sigla
   * ---------------------------------------------------------------------------
   * A primeira versão deste menu usava "ERP", "CRM" e "TMS" sozinhos. Elas são
   * as siglas do nosso mercado, não as palavras de quem vende: ninguém no
   * balcão pensa "vou abrir o CRM", pensa "vou ver o cliente". Três siglas de
   * três letras separando dez itens não dizem a ninguém o que há embaixo de
   * cada uma — e um menu em que os títulos não ajudam é um menu lido item a
   * item, todas as vezes.
   *
   * Só as palavras simples também não bastavam: quem contrata o sistema
   * conhece as siglas, e a mesma tela é o que ele compara com o concorrente.
   *
   * Então são os dois, com pesos diferentes: a PALAVRA lidera (é ela que
   * responde "o que tem aqui?") e a SIGLA vem numa etiqueta ao lado, pequena,
   * para quem a procura. A frase inteira fica no `title`, para o hover de quem
   * quer saber mais sem ocupar linha nenhuma da sidebar.
   *
   * O traço à direita fecha a linha até a borda: sem ele o título flutua no
   * meio da lista e o menu volta a parecer uma pilha só.
   */
  const grupo = (nome: string, sigla: string, explicacao: string) => (
    <div className="flex items-center gap-2 px-2 pb-1.5 pt-4 first:pt-1" title={explicacao}>
      <span className="shrink-0 rounded-md border border-accent/20 bg-accent/[0.10] px-1.5 py-[3px] text-[8px] uppercase tracking-[0.14em] text-accent-soft">
        {sigla}
      </span>
      <p className="min-w-0 truncate text-[10px] uppercase tracking-[0.16em] text-muted">{nome}</p>
      <span aria-hidden className="h-px flex-1 bg-fg/[0.07]" />
    </div>
  );

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
         * Marca da empresa, numa linha.
         *
         * Tinha um logo de 44 px e a legenda "Painel de gestão" embaixo do
         * nome — 76 px de cabeçalho para dizer o nome da empresa, sendo que a
         * legenda não informava nada que a tela ao lado não dissesse. Em 36 px
         * e uma linha, o mesmo dado ocupa metade.
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

          <p className="min-w-0 flex-1 truncate text-[14px] tracking-tight text-ink">{enterprise?.nomeFantasia || "Sua Empresa"}</p>
        </div>

        {/*
         * A faixa de atalhos — o lugar mais visível do menu, com destinos.
         *
         * Herdou a forma do seletor de abas que morava aqui (três colunas,
         * ícone em cima do rótulo) porque a forma estava certa: é a única
         * coisa do menu que se lê como um bloco, e não como item de lista. O
         * que mudou é que agora ela LEVA a algum lugar em vez de trocar o
         * conteúdo de baixo.
         *
         * Ativo é preenchido de acento, e não um contorno como nos itens da
         * lista: aqui são alvos grandes lado a lado, e o preenchimento é o que
         * se enxerga de relance, sem ler.
         *
         * O PARADO também tem forma — borda e sombra rasa. Ver a nota no botão
         * sobre por que a borda existe nos dois estados.
         */}
        <div className="relative border-b border-fg/[0.07] p-2.5">
          <div className="grid grid-cols-2 gap-1">
            {ATALHOS.map(({ rota, label, icone: Icone, recurso }) => {
              const on = isActive(rota);
              const travado = Boolean(recurso && !temRecurso(recurso));

              if (travado) {
                return (
                  <div
                    key={label}
                    title={`${label} não está incluído no seu plano. Veja as opções em Configurações › Faturas.`}
                    className="flex cursor-not-allowed flex-col items-center justify-center gap-1 rounded-lg border border-fg/[0.1] bg-fg/[0.02] py-2 text-[10.5px] text-faint opacity-55"
                  >
                    <span className="relative">
                      <Icone size={17} />
                      <Lock size={9} className="absolute -right-1.5 -top-1 text-accent-soft" />
                    </span>
                    <span className="w-full truncate px-1 text-center leading-none">{label}</span>
                  </div>
                );
              }

              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => goto(rota)}
                  aria-current={on ? "page" : undefined}
                  /*
                   * Parado, o atalho agora TEM CORPO: borda, fundo e uma
                   * sombra rasa.
                   *
                   * Antes só o ativo se via — os dois eram texto solto sobre o
                   * mesmo fundo do menu, e a faixa que existe para destacar
                   * Início e PDV entregava um botão aceso e um desaparecido.
                   * Quem procurava o PDV com o Início aberto tinha de ler, e
                   * ler é o que um atalho existe para evitar.
                   *
                   * A borda está nos DOIS estados, com cores diferentes: só no
                   * parado, o botão mudaria de tamanho ao ser clicado e a
                   * fileira inteira daria um pulo.
                   *
                   * `shadow-e1` e não uma sombra crua: é o token que acompanha
                   * os sete temas — no tema plano ele vira um fio de contorno,
                   * onde sombra de verdade ficaria suja.
                   */
                  className={`focus-ring relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg border py-2 text-[10.5px] transition-colors duration-200 ${
                    on
                      ? "border-accent/60 text-white"
                      : "border-fg/[0.1] bg-fg/[0.04] text-mist shadow-e1 hover:border-accent/40 hover:bg-fg/[0.07] hover:text-ink"
                  }`}
                >
                  {/* Sem `layoutId`, pelo mesmo motivo dos itens da lista: o pai
                      é animado com `scale` e medição de layout sai errada. */}
                  {on && (
                    <motion.span
                      aria-hidden
                      className="absolute inset-0 rounded-lg bg-gradient-to-br from-accent-soft to-accent"
                      style={{ boxShadow: "0 6px 18px -8px rgb(var(--accent) / calc(0.9 * var(--fx-glow, 1)))" }}
                      initial={reduzir ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.16, ease: "easeOut" }}
                    />
                  )}

                  <span className={`relative ${on ? "" : "text-faint"}`}>
                    <Icone size={17} />
                  </span>
                  <span className="relative w-full truncate px-1 text-center leading-none">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/*
         * A lista inteira, sem gaveta.
         *
         * `overflow-y-auto` continua aqui e não deve incomodar: dez itens em
         * três grupos cabem sem rolagem em qualquer tela de 700 px para cima.
         * Ele existe para a tela baixa e para o dia em que aparecer o
         * décimo primeiro.
         */}
        <nav className="relative flex-1 overflow-y-auto px-3 py-2.5 space-y-1">
          {grupo(
            "Gestão da empresa",
            "ERP",
            "ERP — a empresa por dentro: o que você tem em estoque, quanto entra e sai de dinheiro, quem trabalha com você e o que os números dizem.",
          )}
          {/* "e serviços" no rótulo: é a mesma tela de sempre, mas quem presta
              serviço cadastra serviço nela, e sem isso metade dos clientes
              procurava um menu que não existe. */}
          {item("estoque", <Package size={16} />, "Estoque/Serviços")}
          {/*
           * Dois itens, dois assuntos.
           *
           * Eram um só ("Financeiro"), porque vendas e dinheiro eram a mesma
           * tela em cinco abas — e o menu mandava para uma tela cujo título
           * era outro. Agora a divisão é a que o lojista já faz de cabeça: o
           * que EU VENDI (panorama e notas, juntos) e o DINHEIRO DA EMPRESA
           * (caixa, a pagar, a receber, juntos).
           *
           * O vendedor fica só com o primeiro, e ele se chama "Minhas vendas":
           * a lista dele já traz só as próprias notas.
           */}
          {item("vendas", <DollarSign size={16} />, gestor ? "Vendas" : "Minhas vendas")}
          {gestor && item("financeiro", <Wallet size={16} />, "Financeiro", false, !temRecurso("financeiro"))}
          {item("relatorios", <BarChart3 size={16} />, "Relatórios", false, !temRecurso("relatorios"))}
          {/*
           * Produção reúne o que era Planilhas mais o quadro de etapas.
           *
           * É UM item, e não uma gaveta com as duas telas dentro: a navegação
           * entre Produções e Kanban mora na barra da própria tabela, junto do
           * conteúdo que ela troca (ver `AbasProducao`). Repeti-la aqui daria
           * dois lugares para o mesmo gesto, e o menu voltaria a ter gaveta.
           *
           * Fica com o cadeado abaixo do Professional porque é lá que o
           * módulo entra — e o cadeado, não a ausência, é de propósito: quem
           * não vê o item nunca descobre que o upgrade destrava um controle
           * de produção, e essa é justamente a razão de subir de plano nessa
           * faixa.
           */}
          {item("producao", <Factory size={16} />, "Produção", false, !temRecurso("producao"))}
          {/* Equipe só existe em plano que comporta mais de um usuário: mostrar
              para quem tem uma vaga só seria oferecer porta que não abre. */}
          {/* `planoTemEquipe` continua valendo por CIMA da trava de plano: um
              plano que inclui o módulo mas só permite um login não tem equipe
              para gerenciar, e a aba apareceria vazia. */}
          {gestor && planoTemEquipe(equipe) && item("funcionarios", <UserCog size={16} />, "Funcionários", false, !temRecurso("funcionarios"))}

          {/* Clientes aparecia duas vezes no menu antigo, uma em cada aba, para
              não cobrar troca de gaveta no destino mais visitado do sistema.
              Sem gavetas, uma vez basta. */}
          {grupo(
            "Atendimento",
            "CRM",
            "CRM — as pessoas do outro lado do balcão: quem compra de você, o histórico de cada uma e os canais para falar com elas.",
          )}
          {item("clientes", <Users size={16} />, "Clientes")}
          {/* Sem tela ainda. Fica visível e cinza em vez de escondido: quem não
              sabe que existe não pergunta, e o item apagado é o que faz o dono
              querer saber quando chegar. */}
          {item("whatsapp", <MessageCircle size={16} />, "WhatsApp", true)}

          {grupo(
            "Entregas",
            "TMS",
            "TMS — o que sai da loja e vira encomenda: postagem, frete e rastreio até a mão do cliente.",
          )}
          {/* Correios está "Em breve" enquanto o módulo é finalizado. Não é
              "Plano": o cadeado promete uma tela que o upgrade destrava hoje, e
              essa ainda não está de pé. */}
          {item("correios", <Truck size={16} />, "Correios", true)}
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
