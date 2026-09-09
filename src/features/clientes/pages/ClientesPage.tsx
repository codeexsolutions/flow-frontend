import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, UserPlus, AlertTriangle, ChevronRight, Cake, RotateCw, MapPin, MessageCircle, Pencil, Phone, ClipboardList, ListFilter } from "lucide-react";
import CustomerService from "@/features/clientes/services/client.service";
import useClienteStore from "@/features/clientes/store/cliente.store";
import useSincronizacao from "@/shared/realtime/useSincronizacao";
import ClientType, { camposDeLead, completudeCliente, eStatus, type ContactType } from "@/shared/domain/cliente";
import ClienteForm from "@/features/clientes/components/ClienteForm";
import FichaCliente from "@/features/clientes/components/FichaCliente";
import type { ClienteFormData } from "@/features/clientes/schema/cliente.schema";
import ClientesGrowthChart from "@/features/clientes/components/ClientesGrowthChart";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import { formatDocument, formatNumber, getInitials, onlyDigits, toPercent } from "@/shared/utils/format";
import { maskPhone } from "@/shared/validation/masks";
import { ClienteStatusBadge as StatusBadge } from "@/shared/ui/StatusBadge";
import { SkeletonTableRows, SkeletonIdentityCell } from "@/shared/ui/skeleton";
import { useAutoPageSize, ROW_HEIGHT } from "@/shared/hooks/useAutoPageSize";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { PageScreen } from "@/shared/ui/PageShell";
import { KpiFaixa } from "@/shared/ui/Painel";
import Select from "@/shared/ui/Select";
import BuscaSugestoes from "@/shared/ui/BuscaSugestoes";
import { BarraFiltros, ListaAcao, ListaCabecalho, ListaFantasmas, ListaLinha, TabelaPaginacao } from "@/shared/ui/DataTable";
import { aniversarioBr, diaAniversario, ehAniversarianteDoMes, ehAniversarioHoje } from "@/features/clientes/utils/aniversario";

/** Cartão de número do topo — o mesmo visual do StockPage. */
const Kpi = ({ icon, label, value, hint, tom }: { icon: React.ReactNode; label: string; value: string; hint?: string; tom?: "danger" | "warning" }) => (
  <div className="card glass-sheen flex items-center gap-3 rounded-lg px-4 py-3.5">
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${
      tom === "danger" ? "bg-danger/[0.14] text-danger ring-danger/20"
        : tom === "warning" ? "bg-warning/[0.14] text-warning ring-warning/20"
        : "bg-accent/[0.15] text-accent-soft ring-accent/20"
    }`}>
      {icon}
    </span>
    <div className="min-w-0">
      <p className="truncate text-[10.5px] uppercase tracking-[0.1em] text-faint">{label}</p>
      <p className="truncate text-[17px] leading-[19px] tabular-nums tracking-tight text-ink">{value}</p>
      {hint && <p className="truncate text-[10px] leading-[13px] text-faint">{hint}</p>}
    </div>
  </div>
);

type Filtro = "todos" | "ativo" | "inativo" | "incompletos";

const FILTROS: { value: Filtro; label: string }[] = [
  { value: "todos", label: "Todas" },
  { value: "ativo", label: "Ativos" },
  { value: "inativo", label: "Inativos" },
  /* Filtro novo: com CPF opcional, "quem está pela metade" virou uma pergunta
     que se faz de verdade — e sem ele não havia como agir sobre a resposta. */
  { value: "incompletos", label: "A completar" },
];

/**
 * Aniversário como FILTRO, e não só como painel lateral.
 *
 * A lista de aniversariantes já existia na coluna da direita, mas ela é uma
 * vitrine: mostra doze nomes e acaba. Como filtro, a mesma pergunta passa a
 * devolver a tabela inteira — com telefone, WhatsApp e situação —, que é o que
 * transforma "quem faz aniversário" em ligações de verdade.
 */
type Aniversario = "todos" | "mes" | "hoje";

const ANIVERSARIOS: { value: Aniversario; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "mes", label: "Aniversário no mês" },
  { value: "hoje", label: "Aniversário hoje" },
];

/*
 * Colunas.
 *
 * "Documento" saiu do lugar de destaque: agora que o CPF é opcional, a coluna
 * ficaria vazia na maior parte das linhas — e uma coluna majoritariamente vazia
 * ensina que o dado não importa. No lugar entram as três coisas que se procura
 * numa base de clientes: como falar com ele, onde ele está e o quanto a ficha
 * está preenchida.
 */
const COLS = "grid-cols-[minmax(0,1fr)_148px_152px_84px_104px_104px]";
/** Soma das colunas fixas + folga para a flexível: abaixo disso a tabela rola. */
const TABLE_MIN_WIDTH = 824;

/**
 * Os rótulos das colunas, em UMA lista.
 *
 * Servem ao cabeçalho do desktop e ao cartão do celular (ver `ListaLinha`). A
 * A última posição é a coluna de AÇÕES: ela aparece no cabeçalho do desktop e
 * é omitida do cartão do celular, onde os botões já vão numa faixa própria no
 * pé — ver `ListaLinha`.
 */
const ROTULOS = ["Cliente", "Contato", "Local", "Ficha", "Situação", "Ações"];

function contactDigits(contato?: ContactType) {
  if (!contato) return "";
  return onlyDigits(`${contato.telefone ?? ""}${contato.celular ?? ""}${contato.whatsapp ?? ""}`);
}

/** O número que a loja usa para falar com o cliente, na ordem de preferência. */
const numeroDeContato = (c: ClientType) => c.contato?.whatsapp || c.contato?.celular || c.contato?.telefone || "";

const localDoCliente = (c: ClientType) => {
  const cidade = c.endereco?.cidade?.trim();
  const uf = c.endereco?.uf?.trim();

  if (cidade && uf) return `${cidade}/${uf}`;
  return cidade || uf || "";
};

const SkeletonRows = ({ count }: { count: number }) => (
  <SkeletonTableRows count={count} cols={COLS} rowHeight={ROW_HEIGHT}>
    <SkeletonIdentityCell />
    <div className="h-3 w-24 rounded bg-fg/[0.05]" />
    <div className="h-3 w-20 rounded bg-fg/[0.05]" />
    <div className="h-3 w-12 rounded bg-fg/[0.05]" />
    <div className="h-5 w-16 rounded-full bg-fg/[0.05]" />
    <div className="ml-auto h-7 w-[68px] rounded-lg bg-fg/[0.05]" />
  </SkeletonTableRows>
);

/** Cartão da coluna lateral — mesma casca para gráfico, aniversários e ficha. */
const PainelLateral = ({ icon, title, meta, children }: { icon: React.ReactNode; title: string; meta?: string; children: React.ReactNode }) => (
  <div className="card glass-sheen rounded-lg p-4">
    <div className="mb-3.5 flex items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/[0.15] text-accent-soft">{icon}</span>
      <div className="min-w-0">
        <h2 className="truncate text-[13px] text-ink">{title}</h2>
        {meta && <p className="text-[11px] text-faint">{meta}</p>}
      </div>
    </div>
    {children}
  </div>
);

const Clientes = () => {
  const navigate = useNavigate();
  const alert = useAlert();

  // Estado dos clientes vive no store — assim PDV, Dashboard e Relatórios
  // enxergam a mesma lista e uma criação aqui reflete em todos.
  const customers = useClienteStore((s) => s.clientes) as ClientType[];
  const loading = useClienteStore((s) => s.loading);
  const error = useClienteStore((s) => s.error);
  const fetchClientes = useClienteStore((s) => s.fetchClientes);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [local, setLocal] = useState("todos");
  const [aniversario, setAniversario] = useState<Aniversario>("todos");
  const [page, setPage] = useState(1);

  const [showCreate, setShowCreate] = useState(false);
  /* Cliente em edição pela própria lista — antes era preciso abrir a ficha,
     achar "Editar" e voltar, três telas para corrigir um telefone. */
  const [editando, setEditando] = useState<ClientType | null>(null);
  const [saving, setSaving] = useState(false);

  const { bodyRef, perPage } = useAutoPageSize<HTMLDivElement>();

  const load = async () => {
    await fetchClientes(true);
  };

  useEffect(() => {
    fetchClientes();
  }, [fetchClientes]);

  /* Cliente cadastrado no PDV de outro balcão aparece aqui sem recarregar. */
  useSincronizacao(["clientes"], () => fetchClientes(true));

  /**
   * A regra de filtragem, como função pura.
   *
   * Escrita assim, e não embutida no `useMemo`, porque ela é usada duas vezes
   * com propósitos diferentes: para montar a lista e para CONTAR quantos
   * clientes cada opção do filtro deixaria passar. O número ao lado de "A
   * completar" só é confiável se sair exatamente da mesma regra que a lista
   * aplica — duas cópias divergem no primeiro campo novo, e aí o filtro promete
   * doze e entrega nove.
   */
  const passa = (c: ClientType, f: { filtro: Filtro; local: string; aniversario: Aniversario; q: string }) => {
    const situacaoOk =
      f.filtro === "todos" ||
      (f.filtro === "ativo" && c.status === eStatus.ATIVO) ||
      (f.filtro === "inativo" && c.status === eStatus.INATIVO) ||
      (f.filtro === "incompletos" && completudeCliente(c) < 100);

    if (!situacaoOk) return false;

    if (f.local !== "todos" && localDoCliente(c) !== f.local) return false;

    if (f.aniversario === "mes" && !ehAniversarianteDoMes(c.dataNascimento)) return false;
    if (f.aniversario === "hoje" && !ehAniversarioHoje(c.dataNascimento)) return false;

    if (!f.q) return true;

    const digits = onlyDigits(f.q);

    return Boolean(
      c.nome?.toLowerCase().includes(f.q)
      || c.contato?.email?.toLowerCase().includes(f.q)
      || localDoCliente(c).toLowerCase().includes(f.q)
      || (digits.length > 0 && (onlyDigits(c.cpfCnpj ?? "").includes(digits) || contactDigits(c.contato).includes(digits))),
    );
  };

  const q = debouncedSearch.trim().toLowerCase();
  const atual = { filtro, local, aniversario, q };

  const filtered = useMemo(
    () =>
      customers
        .filter((c) => passa(c, atual))
        // Mais recentes primeiro; clientes sem data vão para o fim.
        .sort((a, b) => {
          const da = a.created_at ? new Date(a.created_at).getTime() : 0;
          const db = b.created_at ? new Date(b.created_at).getTime() : 0;
          return db - da;
        }),
    [customers, filtro, local, aniversario, q],
  );

  /**
   * As cidades saem do que ESTÁ cadastrado.
   *
   * Nenhuma lista fixa: quem nunca preencheu endereço não vê o filtro de
   * cidade. Um select com opções que não existem em nenhum cliente só produz
   * resultado vazio — e quem filtra por ele conclui que a busca está quebrada.
   */
  const locais = useMemo(
    () => [...new Set(customers.map(localDoCliente).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [customers],
  );

  /**
   * Quantos clientes cada opção deixaria passar.
   *
   * Contado com os OUTROS filtros aplicados e o próprio suspenso — que é o que
   * torna o número útil: dentro de "São Paulo/SP", "Aniversário no mês 3" quer
   * dizer três paulistanos fazendo aniversário, não três na base inteira.
   * Contando com o próprio filtro junto, toda opção não escolhida marcaria zero.
   */
  const contar = (mudanca: Partial<typeof atual>) => customers.filter((c) => passa(c, { ...atual, ...mudanca })).length;

  const opcoesFiltro = useMemo(
    () => FILTROS.map((o) => ({
      valor: o.value,
      label: o.label,
      contagem: contar({ filtro: o.value }),
      /* O ponto vermelho só acende quando há mesmo ficha pela metade. Um
         alerta permanentemente aceso deixa de ser alerta em uma semana. */
      alerta: o.value === "incompletos" && contar({ filtro: "incompletos" }) > 0,
    })),
    [customers, filtro, local, aniversario, q],
  );

  const opcoesLocal = useMemo(
    () => [
      { valor: "todos", label: "Todas as cidades", contagem: contar({ local: "todos" }) },
      ...locais.map((l) => ({ valor: l, label: l, contagem: contar({ local: l }) })),
    ],
    [customers, locais, filtro, local, aniversario, q],
  );

  const opcoesAniversario = useMemo(
    () => ANIVERSARIOS.map((o) => ({ valor: o.value, label: o.label, contagem: contar({ aniversario: o.value }) })),
    [customers, filtro, local, aniversario, q],
  );

  /**
   * As sugestões da busca.
   *
   * Saem da lista JÁ FILTRADA: sugerir um cliente que os filtros escondem
   * levaria a pessoa a uma ficha que ela não consegue achar de volta na tabela.
   * Quem casa o texto com o rótulo é o próprio `BuscaSugestoes`.
   */
  const sugestoes = useMemo(
    () => filtered.map((c) => ({
      id: String(c.id ?? ""),
      label: c.nome,
      sub: [numeroDeContato(c) ? maskPhone(String(numeroDeContato(c))) : "", localDoCliente(c)].filter(Boolean).join(" · "),
    })),
    [filtered],
  );

  const stats = useMemo(() => {
    const total = customers.length;
    const ativos = customers.filter((c) => c.status === eStatus.ATIVO).length;
    return { total, ativos, inativos: total - ativos };
  }, [customers]);

  const pctAtivos = toPercent(stats.ativos, stats.total);

  /* ---- Aniversariantes do mês ---- */
  /* O dado de nascimento só vale se alguém puder agir sobre ele; sem esta
     lista ele seria mais um campo preenchido que ninguém lê. */
  const aniversariantes = useMemo(
    () =>
      customers
        .filter((c) => ehAniversarianteDoMes(c.dataNascimento))
        .sort((a, b) => (diaAniversario(a.dataNascimento) ?? 0) - (diaAniversario(b.dataNascimento) ?? 0)),
    [customers],
  );

  /* ---- Saúde da base: média das fichas e a lacuna mais comum ---- */
  const ficha = useMemo(() => {
    if (customers.length === 0) return { media: 0, lacuna: null as null | { label: string; faltam: number } };

    const media = Math.round(customers.reduce((acc, c) => acc + completudeCliente(c), 0) / customers.length);

    const faltas = new Map<string, number>();
    customers.forEach((c) =>
      camposDeLead(c)
        .filter((campo) => !campo.ok)
        .forEach((campo) => faltas.set(campo.label, (faltas.get(campo.label) ?? 0) + 1)),
    );

    const pior = [...faltas.entries()].sort((a, b) => b[1] - a[1])[0];

    return { media, lacuna: pior ? { label: pior[0], faltam: pior[1] } : null };
  }, [customers]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageItems = filtered.slice((page - 1) * perPage, page * perPage);
  const emptySlots = Math.max(0, perPage - pageItems.length);

  useEffect(() => setPage(1), [debouncedSearch, filtro, local, aniversario]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handleCreate = async (data: ClienteFormData) => {
    setSaving(true);
    try {
      await CustomerService.create(data);
      setShowCreate(false);
      await load();
      alert.success("Cliente cadastrado!", "O cliente foi adicionado com sucesso.");
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível cadastrar o cliente."));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (data: ClienteFormData) => {
    if (!editando?.id) return;

    setSaving(true);
    try {
      await CustomerService.update(String(editando.id), data);
      setEditando(null);
      await load();
      alert.success("Cliente atualizado", "As alterações foram salvas com sucesso.");
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível atualizar o cliente."));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Abre a conversa no WhatsApp já com o número do cliente.
   *
   * É a ação que mais se faz com uma base de clientes e a que mais custava:
   * abrir a ficha, selecionar o número, copiar, trocar de aplicativo. O `55`
   * entra só quando falta — número já salvo com DDI não pode virar `5555…`.
   */
  const abrirWhatsapp = (c: ClientType) => {
    const digitos = onlyDigits(String(numeroDeContato(c)));
    if (!digitos) return;

    const destino = digitos.length <= 11 ? `55${digitos}` : digitos;
    window.open(`https://wa.me/${destino}`, "_blank", "noopener,noreferrer");
  };

  const hasFilters = Boolean(search) || filtro !== "todos" || local !== "todos" || aniversario !== "todos";

  const limpar = () => {
    setSearch("");
    setFiltro("todos");
    setLocal("todos");
    setAniversario("todos");
  };

  /*
   * Cidade que deixou de existir não pode travar a lista.
   *
   * O único cliente de uma cidade muda de endereço e aquela opção some da
   * lista — mas o filtro continua apontando para ela, o seletor fica sem
   * rótulo e a tabela zera. Um beco sem saída em que a única pista é o botão
   * "Limpar", que não parece ter relação com o que acabou de acontecer.
   */
  useEffect(() => {
    if (local !== "todos" && !locais.includes(local)) setLocal("todos");
  }, [locais, local]);

  return (
    <PageScreen title="Clientes" subtitle="Cadastre, organize e acompanhe sua base de clientes" icon={<Users />}>
      {error && (
        <div className="flex shrink-0 items-center justify-between gap-2.5 rounded-xl border border-danger/40 bg-danger/15 px-4 py-3 text-[13px] text-danger">
          <span className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </span>
          <button onClick={load} className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-danger/30 px-2.5 py-1 text-[12px] text-danger transition-colors hover:bg-danger/10">
            <RotateCw className="h-3.5 w-3.5" /> Tentar novamente
          </button>
        </div>
      )}

      {/* KPIs do topo — o que a base responde de cara. */}
      {/*
       * O percentual de ativos mostra a saúde da base; o de incompletos mostra
       * o que falta melhorar. Ambos saem do filtro aplicado, então refletem o
       * recorte que a pessoa está olhando — não o catálogo inteiro.
       */}
      <KpiFaixa className="shrink-0 sm:grid-cols-4">
        <Kpi
          icon={<Users size={16} />}
          label="Clientes"
          value={formatNumber(filtered.length)}
          hint={filtered.length === 1 ? "cliente" : "clientes"}
        />
        <Kpi
          icon={<Users size={16} />}
          label="Ativos"
          value={formatNumber(filtered.filter((c) => c.status === eStatus.ATIVO).length)}
          hint={pctAtivos > 0 ? `${pctAtivos}% da base` : undefined}
        />
        <Kpi
          icon={<Cake size={16} />}
          label="Aniversários"
          value={formatNumber(aniversariantes.length)}
          hint="Este mês"
        />
        <Kpi
          icon={<ClipboardList size={16} />}
          label="Fichas incompletas"
          value={formatNumber(ficha.media > 0 ? customers.filter((c) => completudeCliente(c) < 100).length : 0)}
          hint={ficha.media > 0 ? `${ficha.media}% em média` : undefined}
          tom={customers.filter((c) => completudeCliente(c) < 100).length > 0 ? "warning" : undefined}
        />
      </KpiFaixa>

      {/*
       * Duas colunas: a lista à esquerda, os painéis à direita.
       *
       * Abaixo de `lg` volta a empilhar: em tela estreita não há largura para
       * duas colunas sem espremer as duas.
       */}
      <section className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* ---------- Lista ---------- */}
        {/*
         * `min-h` no celular, `flex-1` só a partir de `lg`.
         *
         * A lista foi desenhada para ESTICAR até o fim da janela: é assim que
         * a paginação sabe quantas linhas cabem (ver `useAutoPageSize`) e é
         * assim que o rodapé fica colado embaixo. No celular não existe "fim
         * da janela" para esticar — a página inteira rola —, e um `flex-1`
         * dentro de uma coluna que rola encolhe até a altura do conteúdo mais
         * curto. O resultado era o cartão com uma linha e meia e o rodapé de
         * paginação DESENHADO POR CIMA da primeira linha.
         */}
        <div className="card glass-sheen flex min-h-[460px] min-w-0 flex-col overflow-hidden rounded-lg lg:min-h-[260px] lg:flex-1">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-fg/[0.06] px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/[0.15]">
                <Users className="h-4 w-4 text-accent-soft" />
              </div>
              <div>
                <h2 className="text-[13px] text-ink">Todos os clientes</h2>
                <p className="text-[11px] text-faint">
                  {formatNumber(filtered.length)} {filtered.length === 1 ? "resultado" : "resultados"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="focus-ring inline-flex h-[38px] shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-gradient-to-br from-accent-soft to-accent px-3 text-[12.5px] text-white shadow-glow transition-all hover:brightness-110 active:scale-[0.98]"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Novo cliente
            </button>
          </div>

          {/*
           * Busca e filtros descem para a barra colada na tabela.
           *
           * As quatro coisas fazem o mesmo trabalho — restringir a lista — e
           * ficam na ponta direita, alinhadas com o botão de criar do
           * cabeçalho. É o mesmo arranjo do estoque, da equipe e do PDV; a
           * barra é a mesma peça (ver `BarraFiltros`).
           *
           * A fileira de botões de situação virou um seletor: com quatro
           * opções ela já ocupava metade da barra, e não sobrava largura para
           * os filtros de cidade e aniversário. Fechado, um seletor ocupa o
           * espaço de uma opção e mostra a contagem de todas.
           */}
          <BarraFiltros pagina={{ label: "Clientes", icon: <Users className="h-3.5 w-3.5" /> }}>
          {/*
           * A sugestão ABRE a ficha; ela não filtra a tabela.
           *
           * Filtrar já é o que o próprio texto faz enquanto se digita — a
           * tabela reage sozinha. O que a lista acrescenta é o atalho para
           * quem já sabe de quem está atrás e não quer procurar a linha na
           * página certa depois.
           */}
          <BuscaSugestoes
            valor={search}
            onValor={setSearch}
            sugestoes={sugestoes}
            onEscolher={(s) => s.id && navigate(`/clientes/${s.id}`)}
            placeholder="Buscar cliente…"
            aria-label="Buscar cliente por nome, telefone, documento, e-mail ou cidade"
            className="w-[212px] shrink-0"
          />

          <Select
            valor={filtro}
            onChange={(v) => setFiltro(v as Filtro)}
            opcoes={opcoesFiltro}
            icone={<ListFilter size={14} />}
            aria-label="Filtrar por situação do cliente"
            className="w-[150px] shrink-0"
          />

          {/* Cidade só existe quando há o que escolher: um seletor com uma
              opção só ocupa espaço para não decidir nada. */}
          {locais.length > 0 && (
            <Select
              valor={local}
              onChange={setLocal}
              opcoes={opcoesLocal}
              icone={<MapPin size={14} />}
              aria-label="Filtrar por cidade"
              className="w-[168px] shrink-0"
            />
          )}

          <Select
            valor={aniversario}
            onChange={(v) => setAniversario(v as Aniversario)}
            opcoes={opcoesAniversario}
            icone={<Cake size={14} />}
            aria-label="Filtrar por aniversário"
            className="w-[178px] shrink-0"
          />

          {hasFilters && (
            <button
              type="button"
              onClick={limpar}
              className="focus-ring h-[38px] shrink-0 cursor-pointer whitespace-nowrap rounded-xl px-2.5 text-[12px] text-faint transition-colors hover:text-ink"
            >
              Limpar
            </button>
          )}
          </BarraFiltros>

          {/* Colunas + linhas rolam juntas na horizontal quando a tela é estreita. */}
          {/* Largura mínima e rolagem horizontal são do DESKTOP: no celular a
              linha virou cartão e já cabe em pé. */}
          <div className="flex min-h-0 flex-1 flex-col sm:overflow-x-auto">
            <div
              className="flex min-h-0 flex-1 flex-col sm:[min-width:var(--tabela-min)]"
              style={{ "--tabela-min": `${TABLE_MIN_WIDTH}px` } as React.CSSProperties}
            >
              {/* Os rótulos saem de `ROTULOS`, a mesma lista do cartão do
                  celular. "Ações" é escrito à parte: no cartão os botões ficam
                  numa faixa própria, sem rótulo. */}
              <ListaCabecalho cols={COLS}>
                {ROTULOS.slice(0, 5).map((r, i) => (
                  <p key={r} className={i >= 4 ? "text-right" : undefined}>{r}</p>
                ))}
                <p className="text-right">Ações</p>
              </ListaCabecalho>

              {/* Corpo: sem scroll — o que não cabe vai pra próxima página */}
              {/* `overflow-hidden` é do desktop, que mostra exatamente as
                  linhas que couberem; no celular os cartões são mais altos e o
                  resto da página rola aqui. */}
              <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto sm:overflow-hidden">
                {loading ? (
                  <SkeletonRows count={perPage} />
                ) : filtered.length === 0 ? (
                  <div className="flex h-full items-center justify-center py-10">
                    <div className="flex max-w-xs flex-col items-center gap-3 text-center text-faint">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-fg/[0.06] bg-fg/[0.03]">
                        <Users className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-[13px] text-mist">Nenhum cliente encontrado</p>
                        <p className="mt-0.5 text-[11px]">{hasFilters ? "Ajuste a busca ou os filtros." : "Comece cadastrando seu primeiro cliente."}</p>
                      </div>
                      {/* Dois vazios diferentes pedem ações opostas: limpar o
                          que está escondendo a lista, ou criar a primeira
                          linha dela. */}
                      {hasFilters ? (
                        <button onClick={limpar} className="mt-1 cursor-pointer rounded-xl border border-fg/[0.1] px-3.5 py-2 text-[12px] text-mist transition-colors hover:text-ink">
                          Limpar filtros
                        </button>
                      ) : (
                        <button onClick={() => setShowCreate(true)} className="mt-1 cursor-pointer rounded-xl bg-accent px-3.5 py-2 text-[12px] text-white transition-colors hover:bg-accent">
                          Cadastrar primeiro cliente
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    {pageItems.map((c) => {
                      const numero = numeroDeContato(c);
                      const local = localDoCliente(c);
                      const fazAniversarioHoje = ehAniversarioHoje(c.dataNascimento);
                      const doMes = ehAniversarianteDoMes(c.dataNascimento);

                      return (
                        <ListaLinha
                          key={c.id ?? c.nome}
                          cols={COLS}
                          altura={ROW_HEIGHT}
                          rotulos={ROTULOS}
                          onClick={() => c.id && navigate(`/clientes/${c.id}`)}
                          ariaLabel={`Abrir cliente ${c.nome}`}
                          /*
                           * Três ações, e não um menu de três pontinhos.
                           *
                           * Um menu esconde as ações atrás de um clique e de
                           * uma leitura; com três itens ele custa mais do que
                           * economiza. WhatsApp só aparece para quem tem
                           * número — botão que não faz nada ensina a não
                           * clicar nos que fazem.
                           */
                          acoes={
                            <>
                              {numero && (
                                <ListaAcao
                                  icon={<MessageCircle size={14} />}
                                  label="WhatsApp"
                                  tom="sucesso"
                                  onClick={() => abrirWhatsapp(c)}
                                />
                              )}

                              <ListaAcao icon={<Pencil size={14} />} label="Editar" onClick={() => setEditando(c)} />

                              <ListaAcao
                                icon={<ChevronRight size={14} />}
                                label="Abrir ficha"
                                onClick={() => c.id && navigate(`/clientes/${c.id}`)}
                              />
                            </>
                          }
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent/25 bg-gradient-to-br from-accent/25 to-accent-soft/10 text-[11px] text-accent-soft">{getInitials(c.nome)}</div>

                            <div className="flex min-w-0 flex-col">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span className="truncate text-[13px] text-ink">{c.nome}</span>

                                {/* Bolo só no mês do aniversário: o ícone existe
                                    para provocar a ligação, não para decorar. */}
                                {doMes && (
                                  <span
                                    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] ${fazAniversarioHoje ? "bg-accent/20 text-accent-soft" : "text-faint"}`}
                                    title={fazAniversarioHoje ? "Faz aniversário hoje" : `Aniversário em ${aniversarioBr(c.dataNascimento)}`}
                                  >
                                    <Cake size={10} />
                                    {fazAniversarioHoje ? "hoje" : aniversarioBr(c.dataNascimento)}
                                  </span>
                                )}
                              </span>

                              <span className="truncate text-[11px] text-faint">{c.contato?.email || (c.cpfCnpj ? formatDocument(c.cpfCnpj) : "Sem documento")}</span>
                            </div>
                          </div>

                          <span className="flex min-w-0 items-center gap-1.5 text-[12px] tabular-nums text-mist">
                            {numero ? (
                              <>
                                {c.contato?.whatsapp ? <MessageCircle size={12} className="shrink-0 text-success" /> : <Phone size={12} className="shrink-0 text-muted" />}
                                <span className="truncate">{maskPhone(String(numero))}</span>
                              </>
                            ) : (
                              <span className="text-faint">—</span>
                            )}
                          </span>

                          <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-mist">
                            {local ? (
                              <>
                                <MapPin size={12} className="shrink-0 text-muted" />
                                <span className="truncate">{local}</span>
                              </>
                            ) : (
                              <span className="text-faint">—</span>
                            )}
                          </span>

                          <span>
                            <FichaCliente cliente={c} />
                          </span>

                          <span className="flex justify-end">
                            <StatusBadge status={c.status} />
                          </span>

                          {/* Célula vazia: reserva a largura das ações, que
                              são desenhadas sobrepostas pela `ListaLinha`. */}
                          <span aria-hidden />
                        </ListaLinha>
                      );
                    })}

                    <ListaFantasmas quantidade={emptySlots} altura={ROW_HEIGHT} />
                  </>
                )}
              </div>
            </div>
          </div>

          <TabelaPaginacao
            pagina={page}
            totalPaginas={totalPages}
            onPagina={setPage}
            resumo={`${formatNumber(filtered.length)} ${filtered.length === 1 ? "cliente" : "clientes"}`}
          />
        </div>

        {/* ---------- Painéis ---------- */}
        <aside className="flex shrink-0 flex-col gap-3 overflow-y-auto lg:w-[300px]">
          <div className="flex min-h-[240px] flex-col [&>*]:h-full">
            <ClientesGrowthChart customers={customers} />
          </div>

          {/* ---- Aniversariantes do mês ---- */}
          <PainelLateral
            icon={<Cake className="h-4 w-4" />}
            title="Aniversariantes do mês"
            meta={aniversariantes.length > 0 ? `${aniversariantes.length} ${aniversariantes.length === 1 ? "cliente" : "clientes"}` : undefined}
          >
            {aniversariantes.length === 0 ? (
              <p className="text-[11.5px] leading-relaxed text-faint">Ninguém faz aniversário este mês — ou a data de nascimento ainda não foi preenchida nas fichas.</p>
            ) : (
              <ul className="flex max-h-[168px] flex-col gap-1 overflow-y-auto">
                {aniversariantes.slice(0, 12).map((c) => {
                  const hoje = ehAniversarioHoje(c.dataNascimento);

                  return (
                    <li key={c.id ?? c.nome}>
                      <button
                        type="button"
                        onClick={() => c.id && navigate(`/clientes/${c.id}`)}
                        className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-fg/[0.04]"
                      >
                        {/* O dia é o dado que decide a ação — por isso vem primeiro
                            e em caixa própria, não escondido no fim da linha. */}
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] tabular-nums ${hoje ? "bg-accent text-white" : "bg-fg/[0.05] text-mist"}`}>
                          {diaAniversario(c.dataNascimento)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-mist">{c.nome}</span>
                        {hoje && <span className="shrink-0 text-[10px] uppercase tracking-wide text-accent-soft">hoje</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </PainelLateral>

          {/* ---- Saúde das fichas + composição da base ---- */}
          <PainelLateral icon={<ClipboardList className="h-4 w-4" />} title="Fichas da base" meta={`${ficha.media}% preenchidas em média`}>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-fg/[0.05]">
              <div className="bg-gradient-to-r from-accent-soft to-accent transition-all" style={{ width: `${ficha.media}%` }} />
            </div>

            {ficha.lacuna && (
              <button
                type="button"
                onClick={() => setFiltro("incompletos")}
                className="mt-3 flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-fg/[0.06] px-3 py-2 text-left text-[11.5px] text-mist transition-colors hover:bg-fg/[0.04] hover:text-ink"
              >
                <span className="min-w-0 truncate">
                  {formatNumber(ficha.lacuna.faltam)} sem {ficha.lacuna.label.toLowerCase()}
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" />
              </button>
            )}

            <div className="mt-4 flex items-center justify-between border-t border-fg/[0.06] pt-3 text-[12px]">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-success" />
                <span className="text-mist">Ativos</span>
                <span className="tabular-nums text-ink">{formatNumber(stats.ativos)}</span>
                <span className="tabular-nums text-faint">({pctAtivos}%)</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-faint" />
                <span className="text-mist">Inativos</span>
                <span className="tabular-nums text-ink">{formatNumber(stats.inativos)}</span>
              </span>
            </div>
          </PainelLateral>
        </aside>
      </section>

      {showCreate && <ClienteForm saving={saving} onClose={() => setShowCreate(false)} onSubmit={handleCreate} />}

      {/* Edição pela lista: mesma ficha da tela de detalhe, sem sair daqui. */}
      {editando && <ClienteForm cliente={editando} saving={saving} onClose={() => setEditando(null)} onSubmit={handleUpdate} />}
    </PageScreen>
  );
};

export default Clientes;
