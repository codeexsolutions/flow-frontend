import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, ShieldCheck, UserPlus, AlertTriangle,
  UserCog, Clock, ListFilter, SlidersHorizontal, LayoutDashboard,
} from "lucide-react";

import { TabelaCard, TabelaVazia } from "@/shared/ui/DataTable";
import { AbasTabela } from "@/shared/ui/AbasTabela";
import { Modal } from "@/shared/ui/Modal";
import { useAlert } from "@/shared/ui/Alert";
import Select from "@/shared/ui/Select";
import BuscaSugestoes from "@/shared/ui/BuscaSugestoes";
import { Skeleton, SkeletonKpis, SkeletonGrafico } from "@/shared/ui/skeleton";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import useAuth from "@/features/auth/store/auth.store";
import FuncionarioService from "@/features/funcionarios/services/funcionario.service";
import FuncionarioForm from "@/features/funcionarios/components/FuncionarioForm";
import ReciboSalarioModal from "@/features/funcionarios/components/ReciboSalarioModal";
import FuncionariosVisaoGeral from "@/features/funcionarios/components/FuncionariosVisaoGeral";
import FuncionarioCard, { FuncionarioCardFantasma } from "@/features/funcionarios/components/FuncionarioCard";
import PontoConfigPainel from "@/features/ponto/components/PontoConfigPainel";
import useEquipeStore from "@/features/funcionarios/store/equipe.store";
import { PageScreen } from "@/shared/ui/PageShell";
import type { Equipe, Funcionario } from "@/shared/domain/funcionario";

/**
 * A grade da equipe.
 *
 * Quadrados em vez de linhas: a equipe de uma loja é pequena (cinco, dez
 * pessoas) e se reconhece pelo rosto, não por coluna. `auto-fill` com largura
 * mínima deixa a grade decidir quantos cabem — um no celular, quatro num
 * monitor largo — sem breakpoint escrito à mão.
 */
const GRADE = "grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4 p-4";

type Situacao = "todas" | "trabalhando" | "desligados";
/** Visão geral (os números da equipe), a lista e as regras do ponto. */
type Aba = "visao-geral" | "equipe" | "config";
type FiltroAcesso = "todos" | "com" | "sem" | "admin";
type FiltroPonto = "todos" | "bate" | "nao";

const SITUACOES: { valor: Situacao; label: string }[] = [
  { valor: "todas", label: "Todas" },
  { valor: "trabalhando", label: "Trabalhando" },
  { valor: "desligados", label: "Desligados" },
];

const ACESSOS: { valor: FiltroAcesso; label: string }[] = [
  { valor: "todos", label: "Todos" },
  { valor: "com", label: "Com acesso" },
  { valor: "sem", label: "Sem acesso" },
  { valor: "admin", label: "Administradores" },
];

const PONTOS: { valor: FiltroPonto; label: string }[] = [
  { valor: "todos", label: "Todos" },
  { valor: "bate", label: "Bate ponto" },
  { valor: "nao", label: "Não bate" },
];

/**
 * O esqueleto da tela, no formato do conteúdo real.
 *
 * Substitui o spinner centralizado que estava aqui. O spinner troca uma espera
 * por outra: a tela aparecia inteira de uma vez e o olho tinha de reencontrar
 * cabeçalho, colunas e primeira linha. Reproduzindo a forma — a barra de
 * controles, o cabeçalho das colunas e as linhas com a mesma altura —, o
 * layout já nasce no lugar e só falta o dado chegar.
 *
 * As pílulas cinzas no lugar da busca e dos filtros existem pelo mesmo motivo:
 * sem elas a barra nasceria vazia e empurraria a tabela 38px para baixo no
 * instante em que os controles aparecessem.
 */
const ControlesFantasma = () => (
  /* Mesma altura (38px), largura e arredondamento dos controles reais: é o que
     impede a barra de mudar de tamanho no instante em que eles aparecem. */
  <>
    <Skeleton className="h-[38px] w-[190px] rounded-xl" />
    <Skeleton className="h-[38px] w-[132px] rounded-xl" />
    <Skeleton className="h-[38px] w-[152px] rounded-xl" />
    <Skeleton className="h-[38px] w-[132px] rounded-xl" />
  </>
);

const CardsFantasma = ({ count }: { count: number }) => (
  <div className={GRADE}>
    {Array.from({ length: count }, (_, i) => <FuncionarioCardFantasma key={i} />)}
  </div>
);

const FuncionariosPage = () => {
  const alert = useAlert();
  const navigate = useNavigate();

  /* Quem está com o recibo aberto. Um de cada vez: o documento é montado
     fora da tela para ser rasterizado, e um nó por linha da lista seria uma
     folha inteira renderizada para cada funcionário sem ninguém pedir. */
  const [recibo, setRecibo] = useState<Funcionario | null>(null);
  const { user } = useAuth();

  const [equipe, setEquipe] = useState<Equipe | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [busca, setBusca] = useState("");
  const buscaAdiada = useDebouncedValue(busca);
  const [situacao, setSituacao] = useState<Situacao>("todas");
  const [filtroAcesso, setFiltroAcesso] = useState<FiltroAcesso>("todos");
  const [filtroPonto, setFiltroPonto] = useState<FiltroPonto>("todos");

  /** `"novo"` abre o cadastro; um funcionário abre a ficha dele. */
  const [editando, setEditando] = useState<Funcionario | "novo" | null>(null);
  /**
   * Qual metade da tela está aberta.
   *
   * A configuração do ponto era um MODAL, aberto por um botão espremido entre
   * três filtros na barra. Ela não é filtro nem ação de linha: é a segunda
   * metade do assunto "equipe" — de um lado quem trabalha aqui, do outro as
   * regras que valem para todos (o link do ponto, o horário da loja, o raio
   * da localização). Duas abas dizem isso pela forma; um botão escondido entre
   * filtros dizia que era mais um filtro.
   *
   * E, como painel, ele deixa de ser uma janela sobre a lista: dá para ajustar
   * o horário e voltar para conferir quem bateu sem fechar nada.
   */
  const [aba, setAba] = useState<Aba>("equipe");

  const naEquipe = aba === "equipe";

  const ehRoot = Boolean(user?.root);

  const carregar = useCallback(async () => {
    try {
      const nova = await FuncionarioService.listar();

      setEquipe(nova);
      // A sidebar usa o mesmo dado para decidir se mostra "Funcionários".
      useEquipeStore.getState().definir(nova);
      setErro("");

      return nova;
    } catch (e) {
      setErro((e as Error).message);
      return null;
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const funcionarios = useMemo(() => equipe?.funcionarios ?? [], [equipe]);

  /* ----------------------------- Filtros ----------------------------- */

  /**
   * A regra de filtragem, como função pura.
   *
   * Escrita assim, e não embutida num `useMemo`, porque ela é usada duas vezes
   * com propósitos diferentes: para montar a lista e para CONTAR quantas
   * pessoas cada opção do filtro deixaria passar. O número ao lado de "Sem
   * acesso" só é confiável se sair exatamente da mesma regra que a lista
   * aplica — duas cópias divergem no primeiro campo novo.
   */
  const passa = (
    f: Funcionario,
    filtro: { situacao: Situacao; acesso: FiltroAcesso; ponto: FiltroPonto; q: string },
  ) => {
    if (filtro.situacao === "trabalhando" && !f.ativo) return false;
    if (filtro.situacao === "desligados" && f.ativo) return false;

    if (filtro.acesso === "com" && !f.acesso) return false;
    if (filtro.acesso === "sem" && f.acesso) return false;
    /* "Administradores" inclui o master: ele é administrador por definição, e
       escondê-lo faria a contagem não bater com o que a coluna mostra. */
    if (filtro.acesso === "admin" && !(f.acesso?.permissao === "ADMIN" || f.acesso?.root)) return false;

    if (filtro.ponto === "bate" && !f.batePonto) return false;
    if (filtro.ponto === "nao" && f.batePonto) return false;

    if (!filtro.q) return true;

    /* O CPF casa por dígitos: quem digita "529" na busca não escreveu o ponto,
       e quem cola "529.982.247-25" também precisa achar. */
    const digitos = filtro.q.replace(/\D/g, "");

    return (
      f.nome.toLowerCase().includes(filtro.q)
      || f.cargo.toLowerCase().includes(filtro.q)
      || Boolean(f.acesso?.email.toLowerCase().includes(filtro.q))
      || Boolean(digitos && f.cpf?.includes(digitos))
    );
  };

  const q = buscaAdiada.trim().toLowerCase();
  const atual = { situacao, acesso: filtroAcesso, ponto: filtroPonto, q };

  const filtrados = useMemo(
    () => funcionarios.filter((f) => passa(f, atual)),
    [funcionarios, situacao, filtroAcesso, filtroPonto, q],
  );

  /**
   * Quantas pessoas cada opção deixaria passar.
   *
   * Contado com os OUTROS filtros aplicados e o próprio suspenso — que é o que
   * torna o número útil: dentro de "Desligados", "Sem acesso 2" quer dizer dois
   * desligados sem acesso, não dois na equipe inteira. Contando com o próprio
   * filtro junto, toda opção não escolhida marcaria zero.
   */
  const contar = (mudanca: Partial<typeof atual>) =>
    funcionarios.filter((f) => passa(f, { ...atual, ...mudanca })).length;

  const opcoesSituacao = useMemo(
    () => SITUACOES.map((o) => ({ valor: o.valor, label: o.label, contagem: contar({ situacao: o.valor }) })),
    [funcionarios, situacao, filtroAcesso, filtroPonto, q],
  );

  const opcoesAcesso = useMemo(
    () => ACESSOS.map((o) => ({ valor: o.valor, label: o.label, contagem: contar({ acesso: o.valor }) })),
    [funcionarios, situacao, filtroAcesso, filtroPonto, q],
  );

  const opcoesPonto = useMemo(
    () => PONTOS.map((o) => ({
      valor: o.valor,
      label: o.label,
      contagem: contar({ ponto: o.valor }),
      /* Ponto pendente é o único aviso desta tela: alguém marcado para bater
         ponto e sem jornada nenhuma configurada. O ponto vermelho só acende
         quando há mesmo o caso — aviso sempre aceso deixa de ser aviso. */
      alerta: o.valor === "bate" && funcionarios.some((f) => f.batePonto && f.jornada.length === 0),
    })),
    [funcionarios, situacao, filtroAcesso, filtroPonto, q],
  );

  /**
   * As sugestões da busca.
   *
   * Saem da lista JÁ FILTRADA: sugerir alguém que os filtros escondem levaria a
   * pessoa a uma ficha que ela não consegue achar de volta na tabela. Quem casa
   * o texto com o rótulo é o próprio `BuscaSugestoes`.
   */
  const sugestoes = useMemo(
    () => filtrados.map((f) => ({
      id: f.id,
      label: f.nome,
      sub: [f.cargo, f.acesso ? f.acesso.email : "sem acesso"].filter(Boolean).join(" · "),
    })),
    [filtrados],
  );

  const temFiltro = Boolean(busca) || situacao !== "todas" || filtroAcesso !== "todos" || filtroPonto !== "todos";

  const limpar = () => {
    setBusca("");
    setSituacao("todas");
    setFiltroAcesso("todos");
    setFiltroPonto("todos");
  };

  /* ------------------------------ Ações ------------------------------ */

  /**
   * Depois de gravar, a ficha aberta é RECARREGADA em vez de fechada.
   *
   * As abas de acesso e ponto agem sozinhas (criar login, bater ponto), e
   * fechar o modal a cada ação obrigaria a reabrir a ficha para fazer a
   * seguinte. Só o botão de salvar a pessoa fecha — e é ele que passa `fechar`.
   */
  const aoMudar = async (fechar = false) => {
    const nova = await carregar();

    if (fechar || !nova) {
      setEditando(null);
      return;
    }

    setEditando((atualEdicao) => {
      if (!atualEdicao || atualEdicao === "novo") return atualEdicao;
      return nova.funcionarios.find((f) => f.id === atualEdicao.id) ?? null;
    });
  };

  const excluir = async (f: Funcionario) => {
    const { confirmed } = await alert.confirm(
      `Remover ${f.nome} da equipe?`,
      f.acesso
        ? "A ficha e o histórico de ponto são apagados, e o login dela sai junto. Se ela já registrou vendas, o login é apenas desativado — apagá-lo deixaria as vendas sem vendedor."
        : "A ficha e o histórico de ponto são apagados. Essa ação não pode ser desfeita.",
      { type: "warning", confirmText: "Remover" },
    );

    if (!confirmed) return;

    try {
      await FuncionarioService.excluir(f.id);
      await carregar();
      alert.success("Funcionário removido", `${f.nome} não faz mais parte da equipe.`);
    } catch (e) {
      alert.error("Não foi possível remover", (e as Error).message);
    }
  };

  /* ------------------------------ Render ------------------------------ */

  // Vendedor não abre esta aba — a API responde 403 e a mensagem vem dela.
  if (erro) {
    return (
      <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertTriangle className="h-7 w-7 text-warning" />
        <p className="max-w-md text-[13px] text-mist">{erro}</p>
      </div>
    );
  }

  const aberto = editando !== null;
  const emEdicao = editando && editando !== "novo" ? editando : null;

  const controles = carregando ? (
    <ControlesFantasma />
  ) : (
    <>
      {/*
       * A sugestão ABRE a ficha; ela não filtra a tabela.
       *
       * Filtrar já é o que o próprio texto faz enquanto se digita — a tabela
       * reage sozinha. O que a lista acrescenta é o atalho para quem já sabe
       * de quem está atrás e não quer procurar a linha depois.
       */}
      <BuscaSugestoes
        valor={busca}
        onValor={setBusca}
        sugestoes={sugestoes}
        onEscolher={(s) => navigate(`/funcionarios/${s.id}`)}
        placeholder="Buscar pessoa…"
        aria-label="Buscar funcionário por nome, cargo, CPF ou e-mail"
        className="w-[190px] shrink-0"
      />

      <Select
        valor={situacao}
        onChange={(v) => setSituacao(v as Situacao)}
        opcoes={opcoesSituacao}
        icone={<ListFilter size={14} />}
        aria-label="Filtrar por situação do funcionário"
        className="w-[132px] shrink-0"
      />

      <Select
        valor={filtroAcesso}
        onChange={(v) => setFiltroAcesso(v as FiltroAcesso)}
        opcoes={opcoesAcesso}
        icone={<ShieldCheck size={14} />}
        aria-label="Filtrar por acesso ao sistema"
        className="w-[152px] shrink-0"
      />

      <Select
        valor={filtroPonto}
        onChange={(v) => setFiltroPonto(v as FiltroPonto)}
        opcoes={opcoesPonto}
        icone={<Clock size={14} />}
        aria-label="Filtrar por registro de ponto"
        className="w-[132px] shrink-0"
      />

      {temFiltro && (
        <button
          type="button"
          onClick={limpar}
          className="focus-ring h-[38px] shrink-0 cursor-pointer whitespace-nowrap rounded-xl px-2.5 text-[12px] text-faint transition-colors hover:text-ink"
        >
          Limpar
        </button>
      )}
    </>
  );

  return (
    <PageScreen
      icon={<UserCog className="h-5 w-5" />}
      title="Funcionários"
      subtitle="Quem trabalha na loja, o que cada um ganha e o que cada um pode abrir"
    >
      <div className="flex h-full min-h-0 flex-col gap-3">
        {/*
         * O contador de usuários do plano SAIU daqui.
         *
         * Ele ocupava uma faixa inteira no topo para dizer "3 de 10 usuários",
         * um número que só importa no instante em que se cria um login — e a
         * partir da migration 046 nem descreve mais a equipe, porque quem não
         * tem acesso não ocupa vaga. O limite continua sendo dito no lugar
         * onde ele decide alguma coisa: a aba "Acesso" da ficha.
         */}

        <TabelaCard
          title={aba === "visao-geral" ? "Visão geral" : naEquipe ? "Equipe" : "Configurações da equipe"}
          icon={aba === "visao-geral" ? <LayoutDashboard size={15} /> : naEquipe ? <Users size={15} /> : <SlidersHorizontal size={15} />}
          count={naEquipe && !carregando ? filtrados.length : undefined}
          countLabel={filtrados.length === 1 ? "pessoa" : "pessoas"}
          navegacao={
            /*
             * A visão geral virou ABA, como em Estoque e Clientes.
             *
             * Os quatro KPIs moravam numa faixa acima da tabela e cobravam a
             * altura deles de quem estava lendo a LISTA — que é o que se abre
             * nesta tela quase sempre. Como aba, os números ganham a tela toda
             * e companhia (folha, acesso, cargos, pendências), e a lista fica
             * com a altura inteira quando é ela que está aberta. A lista
             * continua sendo a aba inicial.
             */
            <AbasTabela<Aba>
              grupo="abas-funcionarios"
              valor={aba}
              onValor={setAba}
              abas={[
                { id: "visao-geral", label: "Visão geral", icone: <LayoutDashboard size={13} /> },
                { id: "equipe", label: "Funcionários", icone: <UserCog size={14} />, contagem: carregando ? undefined : funcionarios.length },
                { id: "config", label: "Configurações", icone: <SlidersHorizontal size={14} /> },
              ]}
            />
          }
          /* Os filtros restringem a LISTA. Na aba de configurações não há lista
             para restringir, e deixá-los ali seria oferecer um controle que não
             faz nada — pior do que não oferecer nenhum. */
          controles={naEquipe ? controles : undefined}
          /* O botão fica de pé durante o carregamento, e não escondido: some
             daqui e a barra inteira se rearranja quando ele volta, que é
             exatamente o salto que o esqueleto existe para evitar. Cadastrar
             não depende da lista ter chegado — o formulário novo só precisa
             dos campos da pessoa. */
          onAdd={naEquipe ? () => setEditando("novo") : undefined}
          addLabel="Novo funcionário"
          /* Sem largura mínima na aba de configurações: os 720px existem para a
             grade de colunas da tabela, e imporiam rolagem lateral a um painel
             que cabe na tela. */
          minWidth={0}
          /* No celular os painéis empurram o cartão em vez de rolar dentro
             dele — mesmo arranjo de Clientes. */
          corpoLivre={aba === "visao-geral"}
        >
          {aba === "visao-geral" ? (
            <div className="p-3">
              {carregando || !equipe ? (
                <div className="flex flex-col gap-3">
                  <SkeletonKpis cards={6} />
                  <SkeletonGrafico altura={200} />
                </div>
              ) : (
                <FuncionariosVisaoGeral equipe={equipe} />
              )}
            </div>
          ) : !naEquipe ? (
            <div className="p-4">
              <PontoConfigPainel />
            </div>
          ) : (
          <>
          {carregando ? (
            <CardsFantasma count={8} />
          ) : filtrados.length === 0 ? (
            /* Dois vazios diferentes: "não achei com esse filtro" e "não há
               ninguém cadastrado" pedem ações opostas — limpar a busca ou
               cadastrar a primeira pessoa. */
            temFiltro ? (
              <TabelaVazia
                icon={<ListFilter size={20} />}
                title="Nenhuma pessoa nesse filtro"
                description="Ajuste a busca ou os filtros para ver o resto da equipe."
                action={<button type="button" onClick={limpar} className="focus-ring mt-1 cursor-pointer rounded-lg border border-fg/[0.1] px-3.5 py-2 text-[12px] text-mist transition-colors hover:text-ink">Limpar filtros</button>}
              />
            ) : (
              <TabelaVazia
                icon={<UserPlus size={20} />}
                title="Nenhum funcionário cadastrado"
                description="Cadastre quem trabalha na loja. O acesso ao sistema é opcional e se cria depois, na ficha de cada um."
              />
            )
          ) : (
            <div className={GRADE}>
              {filtrados.map((f) => (
                <FuncionarioCard
                  key={f.id}
                  f={f}
                  onAbrir={() => navigate(`/funcionarios/${f.id}`)}
                  onRecibo={() => setRecibo(f)}
                  onExcluir={() => void excluir(f)}
                />
              ))}
            </div>
          )}
          </>
          )}
        </TabelaCard>

        {/* -------------------- Ficha do funcionário -------------------- */}
        {/* `maxWidth` acima do `lg` padrão pelo mesmo motivo da ficha do
            produto: a aba de ponto tem linhas de quatro horários, e em 672px
            elas se espremem a ponto de "Volta almoço" caber em duas letras. */}
        <Modal
          open={aberto}
          onClose={() => setEditando(null)}
          title={emEdicao ? emEdicao.nome : "Novo funcionário"}
          subtitle={emEdicao ? "Dados, ponto e acesso ao sistema" : "Só o nome é obrigatório"}
          size="lg"
          maxWidth="sm:max-w-3xl"
        >
          {/* `key` remonta o formulário ao trocar de funcionário: sem ela, os
              campos guardariam o estado da ficha anterior. */}
          <FuncionarioForm
            key={emEdicao?.id ?? "novo"}
            funcionario={emEdicao}
            areas={equipe?.areas ?? []}
            ehRoot={ehRoot}
            podeCriarAcesso={Boolean(equipe?.podeAdicionar)}
            onCancel={() => setEditando(null)}
            onMudou={aoMudar}
          />
        </Modal>

        {/* `key` pelo id: trocar de funcionário com o recibo aberto precisa
            recarregar salário, cargo e rascunho da pessoa certa. */}
        {recibo && (
          <ReciboSalarioModal
            key={recibo.id}
            funcionario={recibo}
            open
            onClose={() => setRecibo(null)}
          />
        )}
      </div>
    </PageScreen>
  );
};

export default FuncionariosPage;
