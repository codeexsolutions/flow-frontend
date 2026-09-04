import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ChevronRight, Pencil, MessageCircle, Mail, CalendarDays, Loader2, AlertTriangle,
  PhoneCall, Receipt, Wallet, ShoppingBag, TrendingUp, Users, Cake, MapPin, IdCard, UserRound,
  ClipboardList, ExternalLink,
} from "lucide-react";

import { PageScreen } from "@/shared/ui/PageShell";
import { Modal } from "@/shared/ui/Modal";
import { StatCard, Dado } from "@/shared/ui/Ficha";
import { ControlesPagina, ListaCabecalho, ListaFantasmas, ListaLinha } from "@/shared/ui/DataTable";
import Invoice from "@/features/vendas/components/Invoice";

import CustomerService from "@/features/clientes/services/client.service";
import NoteService from "@/features/vendas/services/note.service";
import CustomerType, { camposDeLead, completudeCliente, SEXO_LABEL } from "@/shared/domain/cliente";
import type { PedidoClienteType } from "@/shared/domain/pedido";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import { getInitials, onlyDigits, formatDocument, formatNumber } from "@/shared/utils/format";
import { formatDate, toDate } from "@/shared/utils/date";
import { maskCep, maskPhone } from "@/shared/validation/masks";
import { formatTime as horaPedido } from "@/shared/utils/date";
import { ClienteStatusBadge as StatusBadge, PedidoStatusBadge } from "@/shared/ui/StatusBadge";
import { formatCurrency } from "@/shared/utils/currency";

import ClienteForm from "@/features/clientes/components/ClienteForm";
import { ClienteFormData } from "@/features/clientes/schema/cliente.schema";
import ClienteSalesChart from "@/features/clientes/components/ClientesSalesChart";
import { aniversarioBr, diasAteAniversario, idadeEmAnos } from "@/features/clientes/utils/aniversario";

const ITEMS_PER_PAGE = 6;

/*
 * Os pedidos são uma TABELA, com as mesmas peças de Estoque, Vendas e Ponto.
 *
 * Eram botões de 68px com dois textos empilhados à esquerda e três coisas
 * soltas à direita — a mesma informação das outras listas do sistema, num
 * formato que só existia aqui. Em colunas, cada dado tem sempre o mesmo lugar,
 * a fileira de rótulos diz o que é cada um, e a linha ganha a zebra e o cartão
 * de celular que a `ListaLinha` já sabe fazer.
 */
const COLS_PEDIDOS = "grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_84px_minmax(0,110px)]";
const ROTULOS_PEDIDOS = ["Pedido", "Quando", "Situação", "Total"];
const ALTURA_PEDIDO = 56;

/* -------------------------------------------------------------------------- */
/* Peças da ficha */
/* -------------------------------------------------------------------------- */

/* Mesma escala dos KPIs da ficha do produto e da do funcionário: eles são a
   régua da tela, não o assunto dela. */

const SectionHead = ({ icon, title, meta, acao }: { icon: ReactNode; title: string; meta?: string; acao?: ReactNode }) => (
  <div className="flex shrink-0 items-center gap-2.5 border-b border-fg/[0.07] px-4 py-2.5">
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/[0.14] text-accent-soft ring-1 ring-inset ring-accent/20">{icon}</div>
    <div className="min-w-0 flex-1">
      <h2 className="truncate text-[12.5px] text-ink">{title}</h2>
      {meta && <p className="truncate text-[10px] text-faint">{meta}</p>}
    </div>
    {acao}
  </div>
);


/**
 * Anel de completude da ficha.
 *
 * SVG cru, sem biblioteca de gráfico: é um valor único de 0 a 100 — recharts
 * aqui traria um container responsivo e um tooltip para desenhar um arco.
 * O número vem escrito no miolo; a cor é reforço, não o dado.
 */
const AnelFicha = ({ pct, tamanho = 64 }: { pct: number; tamanho?: number }) => {
  const raio = (tamanho - 7) / 2;
  const volta = 2 * Math.PI * raio;

  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} className="-rotate-90" aria-hidden>
        <circle cx={tamanho / 2} cy={tamanho / 2} r={raio} fill="none" stroke="rgb(var(--fg) / 0.08)" strokeWidth={5} />
        <circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={raio}
          fill="none"
          stroke="rgb(var(--accent))"
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={volta}
          strokeDashoffset={volta * (1 - pct / 100)}
          style={{ transition: "stroke-dashoffset .6s ease" }}
        />
      </svg>
      <span className="absolute text-[12px] tabular-nums text-ink">{pct}%</span>
    </span>
  );
};

/**
 * O botão que USA o dado da linha: liga, abre a conversa, escreve o e-mail.
 *
 * ---------------------------------------------------------------------------
 * Por que ele desceu da barra de ferramentas para a linha
 * ---------------------------------------------------------------------------
 * "WhatsApp", "Ligar" e "E-mail" eram três botões de texto no topo da tela, e
 * o número que cada um usa estava três cartões abaixo, no bloco de contato.
 * Quem queria conferir o telefone antes de ligar lia embaixo e clicava em
 * cima; quem clicava em cima não sabia para qual número estava ligando — e o
 * botão apagado (sem o dado cadastrado) não dizia onde cadastrá-lo.
 *
 * Na linha, o dado e a ação são a mesma coisa: o número está escrito ao lado
 * do botão que disca. E a linha sem valor mostra o botão apagado exatamente
 * onde o campo vazio está, que é a resposta para "onde eu ponho isso?".
 *
 * Fica em `title` o que o texto do botão dizia: numa linha de ficha não cabe
 * "WhatsApp" duas vezes — o rótulo da linha já diz qual canal é.
 */
const AcaoLinha = ({ icon, label, href, externo = false, tone = "neutral" }: { icon: ReactNode; label: string; href?: string; externo?: boolean; tone?: "neutral" | "success" }) => {
  if (!href) {
    return (
      <span
        title={`${label} não cadastrado`}
        className="flex h-7 w-7 shrink-0 cursor-not-allowed items-center justify-center rounded-lg border border-fg/[0.06] text-faint opacity-50"
      >
        {icon}
      </span>
    );
  }

  const cls =
    tone === "success"
      ? "border-success/30 bg-success/[0.1] text-success hover:bg-success/20"
      : "border-fg/[0.08] bg-fg/[0.04] text-mist hover:bg-fg/[0.08] hover:text-ink";

  return (
    <a
      href={href}
      title={label}
      aria-label={label}
      {...(externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={`focus-ring flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${cls}`}
    >
      {icon}
    </a>
  );
};

/* -------------------------------------------------------------------------- */
/* Página */
/* -------------------------------------------------------------------------- */

type PedidoAberto = { id?: string; clienteId: string; nome?: string };

const ClienteDetalhe = () => {
  const params = useParams();
  const id = params.id ?? params.clienteId ?? Object.values(params)[0];
  const navigate = useNavigate();
  const alert = useAlert();

  const [client, setClient] = useState<CustomerType | null>(null);
  const [pedidos, setPedidos] = useState<PedidoClienteType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pedidoAberto, setPedidoAberto] = useState<PedidoAberto | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!id) {
        setError("Cliente não informado.");
        return;
      }
      const res = await CustomerService.getAll();
      const list = (Array.isArray(res.data) ? res.data : (res.data?.data ?? [])) as CustomerType[];
      const found = list.find((c) => String(c.id) === String(id)) ?? null;

      if (!found) {
        setError("Cliente não encontrado.");
        return;
      }

      setClient(found);

      try {
        const pres = await NoteService.getAll();
        const all = pres.data?.data ?? [];
        setPedidos((all as PedidoClienteType[]).filter((p) => String(p.clienteId) === String(found.id)));
      } catch {
        setPedidos([]);
      }
    } catch {
      setError("Não foi possível carregar o cliente.");
    } finally {
      setLoading(false);
    }
  };

  /* Só o `id` na dependência: `load` é recriada a cada render e entraria em
     laço se fosse observada. */
  useEffect(() => {
    load();
  }, [id]);

  const handleUpdate = async (data: ClienteFormData) => {
    if (!client?.id) return;
    setSaving(true);
    try {
      await CustomerService.update(client.id, data);
      setShowEdit(false);
      await load();
      alert.success("Cliente atualizado", "As alterações foram salvas com sucesso.");
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível atualizar o cliente."));
    } finally {
      setSaving(false);
    }
  };

  const abrirPedido = (p: PedidoClienteType) => {
    if (!client?.id) return;
    setPedidoAberto({
      id: p.pedido?.pedidoId,
      clienteId: String(client.id),
      nome: client.nome,
    });
  };

  const fecharPedido = () => {
    setPedidoAberto(null);
    load();
  };

  const stats = useMemo(() => {
    const total = pedidos.reduce((a, p) => a + (p.pedido?.totalPedido ?? 0), 0);
    const count = pedidos.length;
    const ticket = count ? total / count : 0;
    const ultimo = pedidos.reduce<Date | null>((acc, p) => {
      const d = toDate(p.pedido?.dataPedido);
      if (!d) return acc;
      return !acc || d > acc ? d : acc;
    }, null);
    return { total, count, ticket, ultimo };
  }, [pedidos]);

  const monthly = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: 6 }).map((_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return {
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
        total: 0,
      };
    });
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    pedidos.forEach((p) => {
      const d = toDate(p.pedido?.dataPedido);
      if (!d) return;
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      const i = idx.get(k);
      if (i !== undefined) buckets[i].total += p.pedido.totalPedido ?? 0;
    });
    return buckets;
  }, [pedidos]);

  const statusBreak = useMemo(() => {
    const c: Record<string, number> = { FECHADO: 0, ABERTO: 0, CANCELADO: 0 };
    pedidos.forEach((p) => {
      const s = p.pedido?.pedidoStatus ?? "";
      if (s in c) c[s] += 1;
    });
    const total = pedidos.length || 1;
    return [
      { key: "FECHADO", label: "Fechados", color: "rgb(var(--success))", count: c.FECHADO, pct: (c.FECHADO / total) * 100 },
      { key: "ABERTO", label: "Abertos", color: "rgb(var(--warning))", count: c.ABERTO, pct: (c.ABERTO / total) * 100 },
      { key: "CANCELADO", label: "Cancelados", color: "rgb(var(--danger))", count: c.CANCELADO, pct: (c.CANCELADO / total) * 100 },
    ];
  }, [pedidos]);

  const pedidosOrdenados = useMemo(
    () =>
      [...pedidos].sort((a, b) => {
        const da = a.pedido?.dataPedido ? new Date(a.pedido.dataPedido).getTime() : 0;
        const db = b.pedido?.dataPedido ? new Date(b.pedido.dataPedido).getTime() : 0;
        return db - da;
      }),
    [pedidos],
  );

  const totalPages = Math.max(1, Math.ceil(pedidosOrdenados.length / ITEMS_PER_PAGE));
  const currentPedidos = pedidosOrdenados.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const emptyRows = Math.max(0, ITEMS_PER_PAGE - currentPedidos.length);

  const waDigits = onlyDigits(client?.contato?.whatsapp ?? "");
  const telDigits = onlyDigits(client?.contato?.celular ?? client?.contato?.telefone ?? "");
  const email = client?.contato?.email;

  /* ---- Ficha: o que já existe e o que falta ---- */
  const completude = client ? completudeCliente(client) : 0;
  const faltando = client ? camposDeLead(client).filter((c) => !c.ok) : [];

  const dias = diasAteAniversario(client?.dataNascimento);
  const idade = idadeEmAnos(client?.dataNascimento);

  /** "hoje", "amanhã" ou "em 12 dias" — a ficha responde quando, não só a data. */
  const proximoAniversario = dias === null ? "" : dias === 0 ? "é hoje" : dias === 1 ? "é amanhã" : `em ${dias} dias`;

  const endereco = client?.endereco;
  const linhaEndereco = [endereco?.logradouro, endereco?.numero].filter(Boolean).join(", ");
  const linhaBairro = [endereco?.bairro, [endereco?.cidade, endereco?.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ");
  const temEndereco = Boolean(linhaEndereco || linhaBairro || endereco?.cep);

  /** Busca no mapa pelo endereço escrito — não guardamos coordenadas. */
  const linkMapa = temEndereco ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([linhaEndereco, linhaBairro, endereco?.cep].filter(Boolean).join(" "))}` : undefined;

  /* ------------------------------- Cabeçalho ------------------------------- */

  /*
   * A barra de ferramentas que ficava aqui foi desfeita.
   *
   * Eram cinco controles numa faixa própria acima de tudo — voltar, três
   * canais de contato e editar —, e nenhum deles pertencia ao topo da tela:
   *
   *   • o VOLTAR é identidade ("você está aqui, veio de lá") e subiu para o
   *     cabeçalho da página, que é onde todo navegador o põe;
   *   • WHATSAPP, LIGAR e E-MAIL desceram para as linhas do cartão de
   *     contato, ao lado do número que cada um usa (ver `AcaoLinha`);
   *   • EDITAR foi para o cartão que identifica o cliente, junto do nome e
   *     dos dados que ele edita.
   *
   * O que sobrou foi uma faixa de 52 px a menos entre o nome do cliente e o
   * primeiro número da tela.
   */

  const headerIcon = client ? <div className="flex h-full w-full items-center justify-center rounded-xl bg-gradient-to-br from-accent/30 to-accent-soft/10 text-[13px] text-accent-soft ring-1 ring-accent/25">{getInitials(client.nome)}</div> : <Users size={22} />;

  /* O subtítulo diz quem é o cliente para a loja — o documento, que pode nem
     existir, virou uma linha da ficha como qualquer outra. */
  const subtitulo = client ? [stats.count > 0 ? `${formatNumber(stats.count)} ${stats.count === 1 ? "pedido" : "pedidos"}` : "Sem pedidos ainda", client.created_at ? `cliente desde ${formatDate(client.created_at)}` : ""].filter(Boolean).join(" · ") : "—";

  /* -------------------------------- Render -------------------------------- */

  return (
    <PageScreen
      title={client?.nome ?? "Cliente"}
      subtitle={subtitulo}
      icon={headerIcon}
      onVoltar={() => navigate("/clientes")}
      voltarPara="Clientes"
    >
      {loading ? (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-faint" />
        </div>
      ) : error ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <AlertTriangle className="h-8 w-8 text-danger" />
          <p className="text-danger">{error}</p>
          <button onClick={load} className="mt-2 cursor-pointer rounded-lg border border-fg/[0.1] bg-fg/[0.05] px-4 py-2 text-sm text-ink transition-colors hover:bg-fg/[0.1]">
            Tentar novamente
          </button>
        </div>
      ) : (
        /*
         * A tela em duas faixas, na mesma grade de quatro colunas.
         *
         *   1. NÚMEROS — largura inteira, quatro numa fileira. Eles estavam
         *      espremidos dentro da coluna de 2/3, e "Total em pedidos" ficava
         *      com metade da largura de "Documento" ao lado. São a régua da
         *      tela: pertencem à tela inteira.
         *   2. QUEM ELE É + O QUE COMPROU — a ficha ocupa uma coluna, o resto
         *      ocupa três. A ficha vai para a ESQUERDA como nas fichas do
         *      produto e do funcionário: as três telas passam a ter a
         *      identidade no mesmo lugar, e a divisa das faixas é a mesma
         *      linha vertical de cima a baixo.
         */
        <div className="flex flex-col gap-3">
          <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard icon={<Wallet size={16} />} label="Total em pedidos" value={formatCurrency(stats.total)} />
            <StatCard icon={<ShoppingBag size={16} />} label="Pedidos" value={formatNumber(stats.count)} />
            <StatCard icon={<TrendingUp size={16} />} label="Ticket médio" value={formatCurrency(stats.ticket)} />
            <StatCard icon={<CalendarDays size={16} />} label="Último pedido" value={stats.ultimo ? formatDate(stats.ultimo) : "—"} />
          </section>

          <section className="grid grid-cols-1 gap-3 xl:grid-cols-4">
          {/* ---------------- Lateral: quem ele é ---------------- */}
          <aside className="flex flex-col gap-3">
            {/* ---- Ficha: identidade + o que falta preencher ---- */}
            {/*
              O cartão de perfil era um retrato: avatar grande, nome, documento.
              Com o documento opcional, a pergunta que a ficha precisa responder
              mudou — "o que eu ainda não sei sobre este cliente?". O anel mede
              isso e as lacunas viram atalho para a edição.
            */}
            {/*
              Identidade, dados e o botão que os edita: um cartão só.
              -----------------------------------------------------------------
              Eram dois cartões colados — "quem é" e "Dados" —, e a separação
              não correspondia a nada: nome, status, documento, nascimento e
              sexo são a MESMA pergunta ("quem é este cliente?"), respondida em
              duas caixas com uma borda no meio.

              "Editar" veio junto porque é exatamente este conteúdo que ele
              abre. No topo da tela ele era um botão genérico longe de tudo o
              que muda; aqui ele fica na moldura do que muda, e o anel de
              completude ao lado dele dá o motivo de clicar.
            */}
            <div className="card glass-sheen overflow-hidden rounded-2xl">
              <div className="flex items-center gap-2.5 px-3.5 py-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/25 bg-gradient-to-br from-accent/30 to-accent-soft/10 text-[14px] text-accent-soft">
                  {client ? getInitials(client.nome) : "?"}
                </span>

                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[13.5px] text-ink">{client?.nome}</h2>
                  <div className="mt-1">{client && <StatusBadge status={client.status} />}</div>
                </div>

                <AnelFicha pct={completude} tamanho={52} />
              </div>

              <div className="flex items-center gap-2.5 border-t border-fg/[0.06] px-3.5 py-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-fg/[0.04] text-muted">
                  <UserRound size={13} />
                </span>
                <p className="min-w-0 flex-1 text-[9.5px] uppercase tracking-[0.06em] text-faint">Dados</p>

                <button
                  type="button"
                  onClick={() => setShowEdit(true)}
                  className="focus-ring inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-fg/[0.1] px-2 py-1 text-[11.5px] text-mist transition-colors hover:bg-fg/[0.05] hover:text-ink"
                >
                  <Pencil size={12} /> Editar
                </button>
              </div>

              <div className="divide-y divide-fg/[0.04] py-1">
                <Dado icon={<IdCard size={14} />} label="Documento" valor={client?.cpfCnpj ? formatDocument(client.cpfCnpj) : ""} />
                <Dado
                  icon={<Cake size={14} />}
                  label="Nascimento"
                  valor={client?.dataNascimento ? `${aniversarioBr(client.dataNascimento)}${idade !== null ? ` · ${idade} anos` : ""}` : ""}
                  acao={proximoAniversario ? <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${dias === 0 ? "bg-accent/20 text-accent-soft" : "text-faint"}`}>{proximoAniversario}</span> : undefined}
                />
                <Dado icon={<UserRound size={14} />} label="Sexo" valor={client?.sexo ? SEXO_LABEL[client.sexo] : ""} />
              </div>

              {faltando.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowEdit(true)}
                  className="flex w-full cursor-pointer items-center gap-2 border-t border-fg/[0.06] bg-fg/[0.02] px-3.5 py-2 text-left text-[11px] text-mist transition-colors hover:bg-fg/[0.05] hover:text-ink"
                >
                  <ClipboardList className="h-3.5 w-3.5 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate">Falta {faltando.map((f) => f.label.toLowerCase()).join(", ")}</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" />
                </button>
              ) : (
                <p className="border-t border-fg/[0.06] bg-success/[0.05] px-3.5 py-2 text-[11px] text-success">Ficha completa</p>
              )}
            </div>

            {/* ---- Contato ---- */}
            <div className="card glass-sheen overflow-hidden rounded-2xl">
              <SectionHead icon={<PhoneCall className="h-4 w-4" />} title="Contato" />

              {/* Cada linha traz o botão que USA o número dela — ver `AcaoLinha`. */}
              <div className="divide-y divide-fg/[0.04] py-1">
                <Dado
                  icon={<MessageCircle size={14} />}
                  label="WhatsApp"
                  valor={client?.contato?.whatsapp ? maskPhone(String(client.contato.whatsapp)) : ""}
                  acao={<AcaoLinha icon={<MessageCircle size={13} />} label="Abrir conversa no WhatsApp" href={waDigits ? `https://wa.me/55${waDigits}` : undefined} externo tone="success" />}
                />
                <Dado
                  icon={<PhoneCall size={14} />}
                  label="Telefone"
                  valor={client?.contato?.celular || client?.contato?.telefone ? maskPhone(String(client?.contato?.celular || client?.contato?.telefone)) : ""}
                  acao={<AcaoLinha icon={<PhoneCall size={13} />} label="Ligar" href={telDigits ? `tel:${telDigits}` : undefined} />}
                />
                <Dado
                  icon={<Mail size={14} />}
                  label="E-mail"
                  valor={email ?? ""}
                  acao={<AcaoLinha icon={<Mail size={13} />} label="Escrever e-mail" href={email ? `mailto:${email}` : undefined} />}
                />
              </div>
            </div>

            {/* ---- Endereço ---- */}
            <div className="card glass-sheen overflow-hidden rounded-2xl">
              <SectionHead
                icon={<MapPin className="h-4 w-4" />}
                title="Endereço"
                acao={
                  linkMapa ? (
                    <a href={linkMapa} target="_blank" rel="noopener noreferrer" className="focus-ring flex shrink-0 items-center gap-1 rounded-lg border border-fg/[0.08] px-2 py-1 text-[11px] text-mist transition-colors hover:bg-fg/[0.05] hover:text-ink">
                      Mapa <ExternalLink size={11} />
                    </a>
                  ) : undefined
                }
              />

              {temEndereco ? (
                <div className="divide-y divide-fg/[0.04] py-1">
                  <Dado icon={<MapPin size={14} />} label="Logradouro" valor={linhaEndereco} />
                  <Dado icon={<MapPin size={14} />} label="Bairro" valor={linhaBairro} />
                  <Dado icon={<MapPin size={14} />} label="CEP" valor={endereco?.cep ? maskCep(String(endereco.cep)) : ""} />
                  {endereco?.complemento && <Dado icon={<MapPin size={14} />} label="Complemento" valor={endereco.complemento} />}
                </div>
              ) : (
                <button type="button" onClick={() => setShowEdit(true)} className="flex w-full cursor-pointer items-center justify-between gap-2 px-3.5 py-3 text-left text-[11.5px] text-faint transition-colors hover:bg-fg/[0.03] hover:text-mist">
                  Nenhum endereço cadastrado — adicione para entregas e rotas.
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                </button>
              )}
            </div>

            {/* ---- Status dos pedidos ---- */}
            {pedidos.length > 0 && (
              <div className="card glass-sheen rounded-2xl p-3.5">
                <p className="mb-3 text-[9.5px] uppercase tracking-[0.08em] text-faint">Status dos pedidos</p>
                <div className="space-y-3">
                  {statusBreak.map((s) => (
                    <div key={s.key}>
                      <div className="mb-1.5 flex items-center justify-between text-[12px]">
                        <span className="flex items-center gap-2 text-mist">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                          {s.label}
                        </span>
                        <span className="tabular-nums text-ink">{s.count}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-fg/[0.06]">
                        <div className="h-full rounded-full transition-all" style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>

          {/* ---------------- Coluna principal: o que ele comprou ---------------- */}
          <div className="flex flex-col gap-3 xl:col-span-3">

            <div className="card glass-sheen overflow-hidden rounded-2xl">
              <SectionHead icon={<TrendingUp className="h-4 w-4" />} title="Vendas" meta="Últimos 6 meses" />
              <div className="h-[280px] p-4">
                <ClienteSalesChart monthlyData={monthly} />
              </div>
            </div>

            <div className="card glass-sheen flex flex-col overflow-hidden rounded-2xl">
              <SectionHead icon={<Receipt className="h-4 w-4" />} title="Pedidos" meta={`${pedidos.length} ${pedidos.length === 1 ? "pedido" : "pedidos"} no total`} />

              <div>
                {pedidosOrdenados.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-fg/[0.06] bg-fg/[0.03]">
                      <Receipt className="h-6 w-6 text-faint" />
                    </div>
                    <p className="text-[13px] text-mist">Nenhum pedido encontrado</p>
                  </div>
                ) : (
                  <>
                    {/* Os rótulos saem de `ROTULOS_PEDIDOS`, a mesma lista que
                        o cartão do celular usa. */}
                    <ListaCabecalho cols={COLS_PEDIDOS}>
                      {ROTULOS_PEDIDOS.map((r, i) => (
                        <p key={r} className={i >= 2 ? "text-right" : undefined}>{r}</p>
                      ))}
                    </ListaCabecalho>

                    {currentPedidos.map((p) => {
                      const total = p.pedido?.totalPedido ?? 0;
                      const nItens = p.pedido?.itensPedido?.length ?? 0;
                      const status = p.pedido?.pedidoStatus;

                      return (
                        <ListaLinha
                          key={p.pedido?.pedidoId}
                          cols={COLS_PEDIDOS}
                          altura={ALTURA_PEDIDO}
                          rotulos={ROTULOS_PEDIDOS}
                          onClick={() => abrirPedido(p)}
                          ariaLabel={`Abrir o pedido ${p.pedido?.pedidoId?.slice(0, 8)}`}
                        >
                          <span className="flex min-w-0 items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/[0.12] text-accent-soft ring-1 ring-inset ring-accent/15">
                              <Receipt size={14} />
                            </span>
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate text-[12.5px] text-ink">
                                <span className="text-faint">#</span>
                                {p.pedido?.pedidoId?.slice(0, 8)}
                              </span>
                              <span className="truncate text-[10.5px] text-faint">
                                {nItens} {nItens === 1 ? "item" : "itens"}
                              </span>
                            </span>
                          </span>

                          <span className="min-w-0 truncate text-[12px] text-mist">
                            {formatDate(p.pedido?.dataPedido)} · {horaPedido(p.pedido?.dataPedido)}
                          </span>

                          <span className="flex justify-end">
                            <PedidoStatusBadge status={status} />
                          </span>

                          <span className="text-right text-[12.5px] tabular-nums text-ink">{formatCurrency(total)}</span>
                        </ListaLinha>
                      );
                    })}

                    {/* Linhas fantasma pra manter altura constante */}
                    <ListaFantasmas quantidade={emptyRows} altura={ALTURA_PEDIDO} />
                  </>
                )}
              </div>

              {pedidosOrdenados.length > 0 && (
                /* O rodapé é o mesmo das outras tabelas: o resumo à esquerda,
                   os controles de página à direita — dois pares de setas
                   diferentes para a mesma coisa era o que havia antes. */
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-fg/[0.06] px-4 py-2.5 text-[12px] text-faint">
                  <span className="flex items-center gap-2">
                    <TrendingUp size={13} className="text-accent-soft" />
                    Ticket médio: <span className="tabular-nums text-ink">{formatCurrency(stats.ticket)}</span>
                  </span>

                  {totalPages > 1 && <ControlesPagina pagina={currentPage} totalPaginas={totalPages} onPagina={setCurrentPage} />}
                </div>
              )}
            </div>
          </div>
          </section>
        </div>
      )}

      {/* Edição — mesma ficha do cadastro */}
      {client && <ClienteForm open={showEdit} cliente={client} saving={saving} onClose={() => setShowEdit(false)} onSubmit={handleUpdate} />}

      {/* Nota do pedido, igual à do PDV */}
      <Modal open={!!pedidoAberto} onClose={fecharPedido} title="Pedido" subtitle={pedidoAberto?.nome} size="full">
        {pedidoAberto && <Invoice id={pedidoAberto.id} clienteId={pedidoAberto.clienteId} nome={pedidoAberto.nome} />}
      </Modal>
    </PageScreen>
  );
};

export default ClienteDetalhe;
