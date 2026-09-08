import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { useEffect } from "react";

import useAuth from "@/features/auth/store/auth.store";
import useEnterprise from "@/features/empresa/store/enterprise.store";

import Main from "@/app/layouts/MainLayout";
import LoadingScreen from "@/shared/ui/LoadingScreen";
import NotFoundPage from "@/shared/ui/NotFoundPage";
import useTheme from "@/shared/theme/useTheme";
import { useIsMobile } from "@/shared/hooks/useIsMobile";

import LandingPage from "@/features/landing/pages/LandingPage";

import DashboardPage from "@/features/dashboard/pages/DashboardPage";
import RelatoriosPage from "@/features/relatorios/pages/RelatoriosPage";

import AuthPage from "@/features/auth/pages/LoginPage";
import CadastroEmpresaPage from "@/features/auth/pages/SignUpPage";
import BoasVindasPage from "@/features/auth/pages/BoasVindasPage";

import usePlano from "@/shared/plano/plano.store";
import useCatalogo from "@/shared/plano/catalogo.store";
import RecursoDoPlano from "@/shared/plano/RecursoDoPlano";

import Workflow from "@/features/vendas/pages/PDVPage";
import VendasPage from "@/features/vendas/pages/VendasPage";
import FinanceiroPage from "@/features/financeiro/pages/FinanceiroPage";
import FuncionariosPage from "@/features/funcionarios/pages/FuncionariosPage";
import FuncionarioDetalhe from "@/features/funcionarios/pages/FuncionarioDetailPage";
import OrcamentosPage from "@/features/orcamentos/pages/OrcamentosPage";
import AjudaPage from "@/features/ajuda/pages/AjudaPage";
import ProducoesPage from "@/features/producao/pages/ProducoesPage";
import KanbanPage from "@/features/producao/pages/KanbanPage";
import AcompanharProducaoPage from "@/features/acompanhamento/pages/AcompanharProducaoPage";
import BaterPontoPage from "@/features/ponto/pages/BaterPontoPage";
import AbrirPontoPage from "@/features/ponto/pages/AbrirPontoPage";
import { usarManifestDoPonto } from "@/features/ponto/instalacao";
import { ehGestor } from "@/features/vendas/components/TabsVendas";

import CheckoutPage from "@/features/checkout/pages/CheckoutPage";
import PlanosPage from "@/features/assinatura/pages/PlanosPage";

import CorreiosPage from "@/features/correios/pages/CorreiosPage";
import PrecosPrazosPage from "@/features/correios/pages/PrecosPrazosPage";
import PostagemPage from "@/features/correios/pages/PostagemPage";
import RastrearPage from "@/features/correios/pages/RastrearPage";

import ClientesPage from "@/features/clientes/pages/ClientesPage";
import CrmPage from "@/features/crm/pages/CrmPage";
import CustomerDetailPage from "@/features/clientes/pages/ClienteDetailPage";

import TableStock from "@/features/estoque/pages/StockPage";
import ProdutoDetalhe from "@/features/estoque/pages/ProdutoDetailPage";

import ConfiguracoesPage from "@/features/config/pages/ConfigPage";
import EmpresaPage from "@/features/config/pages/EmpresaPage";
import ProfilePage from "@/features/config/pages/ProfilePage";
import AparenciaTab from "@/features/config/pages/AparenciaPage";

const PUBLIC_PATHS = ["/login", "/cadastro", "/planos", "/page"];

/**
 * O acompanhamento do cliente — `/<token>`, na raiz.
 *
 * Fica fora de `PUBLIC_PATHS` porque aquela lista é de caminhos exatos e este
 * tem token variável. E não basta acrescentar: `PUBLIC_PATHS` só livra da
 * exigência de login. Esta tela precisa escapar de TODOS os desvios, inclusive
 * os que valem para quem ESTÁ logado — o dono da gráfica conferindo o link do
 * cliente cairia no `/checkout` se a empresa dele estivesse inadimplente, e
 * veria a tela de espera enquanto a empresa carregasse. Nos dois casos, o link
 * pareceria quebrado para quem só queria conferi-lo.
 *
 * ---------------------------------------------------------------------------
 * Por que dá para largar o token na raiz
 * ---------------------------------------------------------------------------
 * O prefixo `/p/` existia para separar o token dos caminhos do sistema. Ele
 * só seria necessário se o token pudesse ser confundido com uma rota — e ele
 * não pode: é `base64url` de 24 bytes, exatamente 32 caracteres de
 * `[A-Za-z0-9_-]` (ver `gerarToken`). Nenhuma rota do sistema tem esse
 * formato, e nenhuma vai ter por acaso. O regex abaixo é o contrato: o que
 * não casa com ele segue o fluxo normal e termina no 404 de sempre, em vez de
 * abrir uma página de acompanhamento vazia para quem digitou errado.
 *
 * O `/p/<token>` continua valendo. Link de acompanhamento vive 30 dias e já
 * está em conversas de WhatsApp que ninguém vai reenviar — derrubar o formato
 * antigo quebraria, hoje, links que a empresa entregou ontem.
 */
const TOKEN_PUBLICO = /^\/[A-Za-z0-9_-]{32}$/;

const ehAcompanhamento = (path: string) => TOKEN_PUBLICO.test(path) || path.startsWith("/p/");

/**
 * O link de ponto também não é do sistema.
 *
 * Quem abre `/ponto/<token>` é o funcionário na porta da loja, sem conta e sem
 * senha. Mandá-lo para o login transformaria o link num beco — e o `/ponto/`
 * precisa vir ANTES da checagem de sessão pelo mesmo motivo do `/p/`.
 */
/*
 * `/ponto` sozinho entra junto: é o `start_url` do app instalado, e é ele que
 * descobre o token guardado neste aparelho. Sem incluí-lo aqui, abrir o ícone
 * instalado cairia na tela de login — o beco que esta checagem existe para
 * evitar, só que agora para quem instalou o atalho.
 */
const ehPonto = (path: string) => path === "/ponto" || path.startsWith("/ponto/");

/**
 * No celular a tela de carregamento não aparece: ela competia com a animação
 * de login e virava um piscar de spinner entre o "Bem-vindo" e o sistema.
 * No lugar entra o fundo liso — a transição cobre o intervalo.
 */
const Espera = ({ mobile }: { mobile: boolean }) => (mobile ? <div className="h-[100dvh] w-full bg-canvas" /> : <LoadingScreen />);

function AppRoutesContent({ isLogged, mobile }: { isLogged: boolean; mobile: boolean }) {
  const location = useLocation();
  const { enterprise } = useEnterprise();
  const { user } = useAuth();
  const path = location.pathname;
  const isPublic = PUBLIC_PATHS.includes(path);

  const carregarPlano = usePlano((s) => s.carregar);
  const limparPlano = usePlano((s) => s.limpar);
  const carregarCatalogo = useCatalogo((s) => s.carregar);

  /*
   * O catálogo é buscado no boot, antes de qualquer tela pedir.
   *
   * A rota é pública, então isso vale também para quem ainda não entrou — que
   * é justamente quem vai ao cadastro. Quando a etapa do plano abre, o cartão
   * já está lá: nada de spinner nem de layout pulando quando a lista chega.
   */
  useEffect(() => {
    carregarCatalogo();
  }, [carregarCatalogo]);

  /*
   * Nas telas de ponto o navegador oferece instalar o APP DE PONTO.
   *
   * O manifest do `index.html` é o do Flow — um sistema de gestão que o
   * funcionário não usa e nem consegue abrir. Deixá-lo valendo aqui faria o
   * celular dele ganhar o ícone errado, com um atalho que cai no login.
   *
   * A troca é desfeita ao sair: sem isso, quem abrisse o ponto e navegasse
   * para o sistema levaria junto o manifest do ponto — e o Flow passaria a ser
   * oferecido para instalação com o nome e o ícone errados.
   */
  const noPonto = ehPonto(path);

  useEffect(() => {
    if (!noPonto) return;

    return usarManifestDoPonto();
  }, [noPonto]);

  /*
   * O plano é buscado uma vez, quando a empresa ativa entra.
   *
   * Não é controle de acesso — é o que decide menu visível e módulo aberto,
   * para a pessoa não bater numa porta que o plano dela não abre. Enquanto
   * não chega, a interface fica inteira: esconder primeiro e mostrar depois
   * faria o menu piscar a cada navegação.
   */
  useEffect(() => {
    if (isLogged && user?.ativo) carregarPlano();
    else limparPlano();
  }, [isLogged, user?.ativo, carregarPlano, limparPlano]);

  /* Antes de qualquer desvio, e depois de todos os hooks: quem chega por um
     link de acompanhamento não é usuário do sistema e não deve ser mandado a
     lugar nenhum. Ver `ehAcompanhamento`. */
  if (ehAcompanhamento(path) || ehPonto(path)) {
    return (
      <Routes>
        <Route path="/:token" element={<AcompanharProducaoPage />} />
        {/* O endereço antigo, mantido vivo pelos links já entregues. */}
        <Route path="/p/:token" element={<AcompanharProducaoPage />} />
        <Route path="/ponto" element={<AbrirPontoPage />} />
        <Route path="/ponto/:token" element={<BaterPontoPage />} />
      </Routes>
    );
  }

  if (!isLogged && !isPublic) {
    return <Navigate to="/login" replace />;
  }

  // Usuário inativo (sem pagamento) → só o checkout e a tela que o leva ao
  // WhatsApp. `/bem-vindo` precisa estar aqui: ela aparece logo depois do
  // cadastro, quando a empresa é, por definição, inativa — sem esta exceção
  // o cadastro cairia direto no Pix, que é justamente o que ele deixou de
  // fazer.
  if (isLogged && user && !user.ativo) {
    if (path === "/bem-vindo") return <BoasVindasPage />;

    if (path !== "/checkout") {
      return <Navigate to="/checkout" replace />;
    }
    // Não carrega MainLayout — renderiza checkout sem sidebar
    return <CheckoutPage />;
  }

  if (isLogged && !enterprise) {
    return <Espera mobile={mobile} />;
  }

  if (isLogged && user?.ativo && (path === "/checkout" || path === "/login")) {
    return <Navigate to="/" replace />;
  }

  // O funcionário opera a loja inteira. O que é do dono são duas coisas: o
  // cadastro da empresa (com a assinatura e as faturas) e a gestão de quem tem
  // acesso. O resto — PDV, estoque, clientes, vendas, financeiro, relatórios —
  // é trabalho do dia e fica aberto.
  //
  // A lista é de bloqueio, não de liberação: tela nova nasce acessível, e
  // esquecer de incluí-la aqui não tranca ninguém para fora do próprio serviço.
  // Esconder do menu não basta — digitar a rota na mão não pode abrir a tela.
  if (isLogged && user?.ativo && !ehGestor(user)) {
    const soDoDono =
      path.startsWith("/configuracoes/empresa") ||
      path.startsWith("/configuracoes/faturas") ||
      path.startsWith("/funcionarios") ||
      /* Caixa e contas são do dono — esconder do menu não basta. A lista cobre
         o endereço novo e os antigos: digitar /vendas/a-pagar na mão também
         não pode abrir. */
      path.startsWith("/financeiro") ||
      path.startsWith("/vendas/financeiro") ||
      path.startsWith("/vendas/caixa") ||
      path.startsWith("/vendas/a-pagar") ||
      path.startsWith("/vendas/a-receber");

    if (soDoDono) return <Navigate to="/" replace />;
  }

  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route path="/cadastro" element={<CadastroEmpresaPage />} />
      <Route path="/planos" element={<PlanosPage />} />
      <Route path="/bem-vindo" element={<BoasVindasPage />} />
      <Route path="/page" element={<LandingPage />} />

      {isLogged && (
        <Route path="/" element={<Main />}>
          {/* Dashboard é a home; o PDV passou a ter rota própria. */}
          <Route index element={<DashboardPage />} />
          <Route path="pdv" element={<Workflow />} />
          {/* Orçamento é ato de balcão: mora ao lado do PDV, não em Vendas. */}
          {/* Orçamento, produção e planilhas ficam SEM trava de plano por
              enquanto: os três já são configuráveis e o pacote comercial
              ainda vai ser reorganizado. Travar agora só criaria porta para
              destrancar depois. */}
          <Route path="pdv/orcamentos" element={<OrcamentosPage />} />

          <Route path="checkout" element={<CheckoutPage />} />

          <Route path="clientes" element={<ClientesPage />} />
          {/*
            CRM de WhatsApp — vive ao lado de Clientes porque é o mesmo
            assunto: as pessoas do outro lado do balcão. Sem trava de
            plano, pelo mesmo motivo de orçamento e produção — o pacote
            comercial ainda vai ser reorganizado, e travar agora só
            criaria porta para destrancar depois.

            `/whatsapp` e não `/crm`: é o nome que o menu já usava
            ("Em breve") e o nome pelo qual o lojista procura. "CRM" é
            vocabulário nosso, não dele.
          */}
          <Route path="whatsapp" element={<CrmPage />} />
          {/*
            O Chatbot fica FORA desta versão.

            O WhatsApp entra em teste, e a resposta automática é justamente a
            parte que não pode entrar assim: o que o robô escreve chega ao
            cliente da loja sem ninguém ver, em nome da loja. O tamanho do erro
            é outro — um cartão na raia errada se arrasta de volta, um prazo
            prometido errado não.

            A rota continua existindo e leva à caixa de entrada: quem tiver o
            link salvo, o atalho no celular ou a aba aberta cai num lugar que
            faz sentido, e não num 404. A tela (`ChatbotPage`) segue no
            repositório esperando a liberação do robô.
          */}
          <Route path="chatbot" element={<Navigate to="/whatsapp" replace />} />
          <Route path="crm" element={<Navigate to="/whatsapp" replace />} />
          <Route path="clientes/:clienteId" element={<CustomerDetailPage />} />

          <Route path="estoque" element={<TableStock />} />
          {/* A ficha do produto tem endereço próprio de propósito: dá para
              favoritar, mandar o link para o colega e voltar pelo histórico —
              nada disso um modal oferece. Ver a nota no topo da página. */}
          <Route path="estoque/:produtoId" element={<ProdutoDetalhe />} />

          {/*
            Financeiro é seção própria de novo — e agora com as três guias
            dentro de uma tela só (ver `FinanceiroPage`). As rotas antigas de
            `/vendas/*` viraram redirecionamento para não quebrar link salvo,
            atalho do celular ou aba deixada aberta.
          */}
          <Route
            path="financeiro/:aba?"
            element={
              <RecursoDoPlano recurso="financeiro" promessa="Caixa, contas a pagar e a receber no mesmo lugar em que a venda acontece.">
                <FinanceiroPage />
              </RecursoDoPlano>
            }
          />
          <Route path="vendas/caixa" element={<Navigate to="/financeiro" replace />} />
          <Route path="vendas/financeiro" element={<Navigate to="/financeiro" replace />} />
          <Route path="vendas/a-pagar" element={<Navigate to="/financeiro/a-pagar" replace />} />
          <Route path="vendas/a-receber" element={<Navigate to="/financeiro/a-receber" replace />} />
          <Route path="vendas/lista" element={<Navigate to="/vendas" replace />} />
          <Route path="vendas/orcamentos" element={<Navigate to="/pdv/orcamentos" replace />} />

          {/*
            Funcionários é módulo pago.
            Antes a aba era decidida por `planoTemEquipe` — "o plano deixa mais
            de um usuário?" —, o que a mostrava em qualquer plano de duas
            pessoas para cima, e a ROTA não era travada por nada: quem digitasse
            o endereço entrava. Agora é a mesma trava dos outros módulos, e a
            de verdade está no servidor (`funcionario.route.ts`).
          */}
          <Route
            path="funcionarios"
            element={
              <RecursoDoPlano
                recurso="funcionarios"
                promessa="Cadastre a equipe, dê acesso ao sistema com as áreas de cada um, monte a jornada e receba o ponto batido pelo celular."
              >
                <FuncionariosPage />
              </RecursoDoPlano>
            }
          />
          <Route
            path="funcionarios/:funcionarioId"
            element={
              <RecursoDoPlano
                recurso="funcionarios"
                promessa="Cadastre a equipe, dê acesso ao sistema com as áreas de cada um, monte a jornada e receba o ponto batido pelo celular."
              >
                <FuncionarioDetalhe />
              </RecursoDoPlano>
            }
          />

          {/* Módulos que dependem do plano. O `RecursoDoPlano` mostra a
              oferta no lugar da tela — não redireciona: quem clicou em
              "Correios" quer Correios, e voltar para a home não responde
              nada. Quem barra de verdade é o `planoMiddleware` da API. */}
          <Route
            path="correios"
            element={
              <RecursoDoPlano
                recurso="correios"
                promessa="Calcule frete, gere etiqueta, poste e rastreie sem sair do sistema — e sem redigitar endereço no site dos Correios."
              >
                <CorreiosPage />
              </RecursoDoPlano>
            }
          >
            <Route index element={<PrecosPrazosPage />} />
            <Route path="postagem" element={<PostagemPage />} />
            <Route path="rastrear" element={<RastrearPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>

          <Route
            path="relatorios"
            element={
              <RecursoDoPlano
                recurso="relatorios"
                promessa="Veja o que vende, quem vende e o que encalhou — com número, não com impressão."
              >
                <RelatoriosPage />
              </RecursoDoPlano>
            }
          />
          {/*
            Produção é uma SEÇÃO, e não uma tela: duas abas sob a mesma casca.

              • `/producao`         — a lista de clientes e o link de
                                      acompanhamento de cada um;
              • `/producao/kanban`  — o trabalho, em planilha ou em quadro.

            As planilhas moraram em `/planilhas` como destino próprio do menu.
            Elas não sumiram: viraram uma das duas leituras do Kanban, porque
            planilha e quadro são a mesma fila vista de dois jeitos — e um
            destino de menu para cada leitura fazia a pessoa escolher a VISÃO
            antes de escolher o ASSUNTO. A rota antiga redireciona para não
            quebrar link salvo, atalho do celular nem aba deixada aberta.

            A trava é `producao`, e não `planilhas`: a seção inteira entra a
            partir do Professional. Quem tem plano abaixo cai na oferta do
            `RecursoDoPlano` em vez de numa tela vazia.
          */}
          <Route
            path="producao"
            element={
              <RecursoDoPlano
                recurso="producao"
                promessa="Acompanhe cada pedido por etapa, monte a produção em tabela ou quadro e mande a cada cliente o link do pedido dele."
              >
                <ProducoesPage />
              </RecursoDoPlano>
            }
          />
          <Route
            path="producao/kanban"
            element={
              <RecursoDoPlano
                recurso="producao"
                promessa="Acompanhe cada pedido por etapa, monte a produção em tabela ou quadro e mande a cada cliente o link do pedido dele."
              >
                <KanbanPage />
              </RecursoDoPlano>
            }
          />
          <Route path="planilhas" element={<Navigate to="/producao/kanban" replace />} />
          <Route path="ajuda" element={<AjudaPage />} />

          <Route path="configuracoes" element={<ConfiguracoesPage />}>
            <Route index element={<Navigate to="perfil" replace />} />
            <Route path="perfil" element={<ProfilePage />} />
            <Route path="empresa" element={<EmpresaPage />} />
            {/* Mesma tela do checkout: faturas, Pix e comprovante vêm da API.
                `embutido` tira o cabeçalho e o padding próprios — Configurações
                já fornece os dois. */}
            <Route path="faturas" element={<CheckoutPage embutido />} />
            <Route path="aparencia" element={<AparenciaTab />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>

          {/* Panorama, notas e a prazo em ABAS do mesmo cartão — ver `VendasPage`. */}
          <Route path="vendas" element={<VendasPage />} />

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      )}

      <Route path="*" element={<Navigate to={isLogged ? "/" : "/login"} replace />} />
    </Routes>
  );
}

const AppRoutes = () => {
  useTheme();
  const mobile = useIsMobile();
  const { isLogged, initialize, loading } = useAuth();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (loading) {
    return <Espera mobile={mobile} />;
  }
  return (
    <BrowserRouter>
      <AppRoutesContent isLogged={isLogged} mobile={mobile} />
    </BrowserRouter>
  );
};

export default AppRoutes;
