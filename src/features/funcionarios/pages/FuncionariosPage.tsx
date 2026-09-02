import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, ShieldCheck, UserPlus, Crown, AlertTriangle,
  UserCog, Trash2, Percent, Clock, ListFilter, Receipt, SlidersHorizontal,
} from "lucide-react";

import { TabelaCard, TabelaHead, TabelaRow, TabelaVazia, type Coluna } from "@/shared/ui/DataTable";
import { AbasTabela } from "@/shared/ui/AbasTabela";
import { KpiFaixa } from "@/shared/ui/Painel";
import { Modal } from "@/shared/ui/Modal";
import { useAlert } from "@/shared/ui/Alert";
import Select from "@/shared/ui/Select";
import BuscaSugestoes from "@/shared/ui/BuscaSugestoes";
import { SkeletonTableRows, SkeletonIdentityCell, Skeleton } from "@/shared/ui/skeleton";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import useAuth from "@/features/auth/store/auth.store";
import FuncionarioService from "@/features/funcionarios/services/funcionario.service";
import FuncionarioForm from "@/features/funcionarios/components/FuncionarioForm";
import ReciboSalarioModal from "@/features/funcionarios/components/ReciboSalarioModal";
import PontoConfigPainel from "@/features/ponto/components/PontoConfigPainel";
import useEquipeStore from "@/features/funcionarios/store/equipe.store";
import { PageScreen } from "@/shared/ui/PageShell";
import { Selo } from "@/shared/ui/StatusBadge";
import type { Equipe, Funcionario } from "@/shared/domain/funcionario";
import { formatNumber } from "@/shared/utils/format";
import { maskCpfCnpj } from "@/shared/validation/masks";

const COLS = "grid-cols-[1.5fr_150px_130px_96px]";

/** Altura de uma linha da tabela — o esqueleto precisa dela para não saltar. */
const ALTURA_LINHA = 56;

type Situacao = "todas" | "trabalhando" | "desligados";
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
 * O acesso ao sistema, na linha da lista.
 *
 * Três estados, e os três precisam de nome — "sem acesso" NÃO é um defeito:
 * é o caso da costureira e do entregador, que a migration 046 veio permitir.
 * Mostrá-lo como um vazio faria parecer cadastro pela metade.
 */
function AcessoBadge({ f }: { f: Funcionario }) {
  const acesso = f.acesso;

  if (!acesso) return <span className="text-[11.5px] text-faint">Sem acesso</span>;

  if (acesso.root) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] text-accent-soft ring-1 ring-accent/25">
        <Crown size={11} /> Master
      </span>
    );
  }

  return acesso.permissao === "ADMIN" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent/[0.1] px-2 py-0.5 text-[11px] text-accent-soft ring-1 ring-accent/20">
      <ShieldCheck size={11} /> Admin
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-fg/[0.06] px-2 py-0.5 text-[11px] text-mist ring-1 ring-fg/[0.08]">
      Vendedor
    </span>
  );
}

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

/** Card de destaque numérico — o mesmo visual da fichaIndividual, em formato compacto. */
const KpiCard = ({ icon, label, value, hint, tom }: { icon: ReactNode; label: string; value: string; hint?: string; tom?: "danger" | "warning" | "success" }) => (
  <div className="card glass-sheen flex items-center gap-2.5 rounded-xl px-3 py-2.5">
    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${
      tom === "danger" ? "bg-danger/[0.14] text-danger ring-danger/20"
        : tom === "warning" ? "bg-warning/[0.14] text-warning ring-warning/20"
        : tom === "success" ? "bg-success/[0.14] text-success ring-success/20"
        : "bg-accent/[0.14] text-accent-soft ring-accent/20"
    }`}>
      {icon}
    </span>
    <div className="flex min-w-0 flex-1 flex-col">
      <p className="truncate text-[10px] uppercase tracking-[0.09em] text-faint">{label}</p>
      {/* O número não trunca — ele quebra. "R$ 190.87…" não é um número,
          é um enigma; a dica embaixo continua truncando, porque explicação
          sobrevive cortada. */}
        <p className="text-[15px] leading-[19px] tabular-nums tracking-tight text-ink [overflow-wrap:anywhere]">{value}</p>
      {hint && <p className="truncate text-[10px] leading-[13px] text-faint">{hint}</p>}
    </div>
  </div>
);

const LinhasFantasma = ({ count }: { count: number }) => (
  <SkeletonTableRows count={count} cols={COLS} rowHeight={ALTURA_LINHA}>
    <SkeletonIdentityCell />
    <div className="h-4 w-20 rounded-full bg-fg/[0.05]" />
    <div className="h-3 w-16 rounded bg-fg/[0.05]" />
    <div className="h-3 w-12 rounded bg-fg/[0.05]" />
    <div className="ml-auto flex gap-1">
      <div className="h-7 w-7 rounded-lg bg-fg/[0.05]" />
      <div className="h-7 w-7 rounded-lg bg-fg/[0.05]" />
    </div>
  </SkeletonTableRows>
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
  const [aba, setAba] = useState<"equipe" | "config">("equipe");

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

  /* ----------------------------- Colunas ----------------------------- */

  const colunas: Coluna<Funcionario>[] = [
    {
      id: "nome",
      header: "Funcionário",
      cell: (f) => (
        <span className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-ink">{f.nome}</span>
            {/* Desligado continua na lista: o histórico de ponto e as vendas
                dele seguem valendo, e sumir com a linha esconderia isso. */}
            {!f.ativo && <Selo tom="neutro">Desligado</Selo>}
          </span>
          <span className="truncate text-[11px] text-faint">
            {f.cargo || "Sem cargo"}
            {f.cpf ? ` · ${maskCpfCnpj(f.cpf)}` : ""}
          </span>
        </span>
      ),
    },
    {
      id: "acesso",
      header: "Acesso",
      cell: (f) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <AcessoBadge f={f} />
          {f.acesso && (
            <span className="truncate text-[10.5px] text-faint">
              {f.acesso.status === "ATIVO" ? f.acesso.email : "desativado"}
            </span>
          )}
        </span>
      ),
    },
    {
      id: "comissao",
      header: "Comissão",
      cell: (f) =>
        f.ganhaComissao ? (
          <span className="flex items-center gap-1.5 text-[12px] text-mist">
            <Percent size={12} className="shrink-0 text-muted" />
            <span className="tabular-nums">
              {f.comissaoPercentual != null ? `${formatNumber(f.comissaoPercentual)}%` : "a definir"}
            </span>
          </span>
        ) : (
          <span className="text-[11.5px] text-faint">Não</span>
        ),
    },
    {
      id: "acoes",
      header: "Ações",
      align: "right",
      cell: (f) => (
        <span className="flex items-center justify-end gap-1">
          {/* O recibo abre da LISTA porque emitir folha é trabalho de lote:
              fim do mês, a equipe inteira, um depois do outro. Obrigar a
              entrar na página de cada pessoa e voltar transformaria seis
              recibos em dezoito cliques. */}
          <button
            type="button"
            onClick={() => setRecibo(f)}
            title="Emitir recibo de salário"
            className="focus-ring flex h-7 w-7 items-center justify-center rounded-lg border border-fg/[0.08] text-mist transition hover:bg-fg/[0.05] hover:text-ink"
          >
            <Receipt size={13} />
          </button>

          {/* O usuário master não sai da equipe: sobraria empresa sem dono. */}
          {!f.acesso?.root && (
            <button
              type="button"
              onClick={() => void excluir(f)}
              title="Remover da equipe"
              className="focus-ring flex h-7 w-7 items-center justify-center rounded-lg border border-fg/[0.08] text-mist transition hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 size={13} />
            </button>
          )}
        </span>
      ),
    },
  ];

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

        {/* KPIs da equipe */}
        <KpiFaixa className="shrink-0 sm:grid-cols-4">
          <KpiCard
            icon={<Users size={14} />}
            label="Total"
            value={carregando ? "—" : formatNumber(funcionarios.length)}
            hint={funcionarios.length === 1 ? "pessoa" : "pessoas"}
          />
          <KpiCard
            icon={<UserCog size={14} />}
            label="Ativos"
            value={carregando ? "—" : formatNumber(funcionarios.filter((f) => f.ativo).length)}
            hint={funcionarios.filter((f) => f.ativo).length === 1 ? "trabalhando" : "trabalham"}
            tom={funcionarios.length > 0 && funcionarios.filter((f) => f.ativo).length === 0 ? "danger" : undefined}
          />
          <KpiCard
            icon={<ShieldCheck size={14} />}
            label="Com acesso"
            value={carregando ? "—" : formatNumber(funcionarios.filter((f) => f.acesso).length)}
            hint="usuários cadastrados"
          />
          <KpiCard
            icon={<Percent size={14} />}
            label="Comissão"
            value={carregando ? "—" : formatNumber(funcionarios.filter((f) => f.ganhaComissao).length)}
            hint="recebem comissão"
          />
        </KpiFaixa>

        <TabelaCard
          title={naEquipe ? "Equipe" : "Configurações da equipe"}
          icon={naEquipe ? <Users size={15} /> : <SlidersHorizontal size={15} />}
          count={naEquipe && !carregando ? filtrados.length : undefined}
          countLabel={filtrados.length === 1 ? "pessoa" : "pessoas"}
          navegacao={
            <AbasTabela<"equipe" | "config">
              grupo="abas-funcionarios"
              valor={aba}
              onValor={setAba}
              abas={[
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
          minWidth={naEquipe ? 720 : 0}
        >
          {!naEquipe ? (
            <div className="p-4">
              <PontoConfigPainel />
            </div>
          ) : (
          <>
          <TabelaHead colunas={colunas} cols={COLS} />

          {carregando ? (
            <LinhasFantasma count={8} />
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
            filtrados.map((f) => (
              <TabelaRow
                key={f.id}
                colunas={colunas}
                cols={COLS}
                row={f}
                onClick={() => navigate(`/funcionarios/${f.id}`)}
              />
            ))
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
