import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Check, ChevronLeft, ChevronRight, Copy, Loader2, MessageCircle, Wallet } from "lucide-react";

import { Modal } from "@/shared/ui/Modal";
import PagamentoForm from "@/shared/ui/PagamentoForm";
import BotaoRecibo from "@/shared/ui/BotaoRecibo";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import { formatCurrency } from "@/shared/utils/currency";
import { getInitials, onlyDigits } from "@/shared/utils/format";
import { dataBr, hojeIso, prazo } from "@/shared/utils/parcelas";
import ContaService, { type Conta, type Parcela, type Recibo } from "@/features/financeiro/services/conta.service";
import useClienteStore from "@/features/clientes/store/cliente.store";
import useEnterprise from "@/features/empresa/store/enterprise.store";

/**
 * O carnê — quem paga em que dia, e o que fazer a respeito.
 *
 * A aba do prazo era a mesma lista de parcelas do financeiro: uma coluna
 * ordenada por vencimento, boa para saber o total devido e péssima para a
 * pergunta que quem abre esta tela realmente faz — "hoje é dia 10, quem eu
 * tenho que cobrar?". Numa lista, a resposta é rolar até achar onde o dia 10
 * começa e onde ele termina; e "quanto entra na sexta" não tem resposta
 * nenhuma sem somar linha a linha.
 *
 * Então a tela virou o calendário do mês. Cada dia mostra quantos clientes
 * vencem nele e quanto isso soma — a agenda de cobrança que a loja mantinha
 * no caderno —, e clicar num dia abre a lista daquele dia ao lado.
 *
 * ---------------------------------------------------------------------------
 * O atraso não é um dia do mês
 * ---------------------------------------------------------------------------
 * Quem venceu ontem continua devendo hoje, e amanhã, e no mês que vem: se o
 * atrasado morasse só na casinha do dia em que venceu, virar a página do mês
 * esconderia justamente a cobrança mais urgente. Por isso ele é um destino à
 * parte, fixo acima do calendário e sempre visível — os dias do mês mostram o
 * que ESTÁ POR VIR, e o vermelho lá em cima mostra o que ficou para trás.
 *
 * ---------------------------------------------------------------------------
 * Cobrar e dar baixa na mesma linha
 * ---------------------------------------------------------------------------
 * A cobrança do comércio pequeno tem dois gestos, e os dois aconteciam fora
 * do sistema: mandar a mensagem (abrir o WhatsApp, procurar o contato,
 * escrever o valor e a data de novo) e, quando o dinheiro cai, registrar. Cada
 * linha aqui traz os dois — a mensagem já vem escrita com nome, valor e
 * vencimento, e o "Receber" é o mesmo formulário do resto do sistema.
 *
 * O aviso enviado fica marcado por parcela (no navegador de quem cobrou), para
 * que a lista de amanhã não faça o cliente receber a mesma mensagem duas
 * vezes. É lembrete, não registro contábil — por isso `localStorage` basta.
 */

type Props = {
  contas: Conta[];
  carregando?: boolean;
  onRecarregar: () => void;
};

type Linha = {
  conta: Conta;
  parcela: Parcela;
  /** AAAA-MM-DD — vencimento é dia, nunca instante. */
  venc: string;
  saldo: number;
};

const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const AVISOS_KEY = "codex:cobrancas-avisadas";

/** AAAA-MM-DD de um `Date` local — sem passar por UTC, que muda o dia. */
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "sexta, 12 de setembro" — o dia como quem fala dele. */
const diaPorExtenso = (dia: string) => {
  const [a, m, d] = dia.split("-").map(Number);
  const data = new Date(a, (m ?? 1) - 1, d ?? 1);
  const semana = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][data.getDay()];

  return `${semana}, ${d} de ${MESES[(m ?? 1) - 1]}`;
};

const lerAvisos = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(AVISOS_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
};

const AgendaCobrancas = ({ contas, carregando = false, onRecarregar }: Props) => {
  const alert = useAlert();
  const hoje = hojeIso();

  const clientes = useClienteStore((s) => s.clientes);
  const fetchClientes = useClienteStore((s) => s.fetchClientes);
  const enterprise = useEnterprise((s) => s.enterprise);

  /* Os telefones vêm da base de clientes: a conta guarda o nome, não o
     contato. Sem eles o botão de cobrar continua existindo — só cai no
     "copiar mensagem" em vez de abrir a conversa. */
  useEffect(() => {
    void fetchClientes();
  }, [fetchClientes]);

  const [mes, setMes] = useState(() => {
    const d = new Date();
    return { ano: d.getFullYear(), mes: d.getMonth() };
  });

  const [selecionado, setSelecionado] = useState<string | "atrasadas" | null>(null);
  const [recebendo, setRecebendo] = useState<Linha | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [recibo, setRecibo] = useState<Recibo | null>(null);
  const [avisadas, setAvisadas] = useState<Record<string, string>>(lerAvisos);

  /* ─────────────── Os dados: parcela por parcela ─────────────── */

  /** Tudo o que ainda se cobra — a parcela é a unidade, não a conta. */
  const linhas = useMemo(() => {
    const lista: Linha[] = [];

    for (const conta of contas) {
      if (conta.status === "CANCELADA") continue;

      for (const parcela of conta.parcelas) {
        if (parcela.situacao === "PAGA") continue;

        lista.push({
          conta,
          parcela,
          venc: String(parcela.vencimento).slice(0, 10),
          saldo: Math.round((parcela.valor - parcela.valorPago) * 100) / 100,
        });
      }
    }

    return lista.sort((x, y) => x.venc.localeCompare(y.venc) || (y.saldo - x.saldo));
  }, [contas]);

  /** Um balde por dia — é o que pinta o calendário e o que abre no painel. */
  const porDia = useMemo(() => {
    const mapa = new Map<string, Linha[]>();

    for (const l of linhas) {
      const atual = mapa.get(l.venc);
      if (atual) atual.push(l);
      else mapa.set(l.venc, [l]);
    }

    return mapa;
  }, [linhas]);

  const atrasadas = useMemo(() => linhas.filter((l) => l.venc < hoje), [linhas, hoje]);
  const totalAtrasado = useMemo(() => atrasadas.reduce((acc, l) => acc + l.saldo, 0), [atrasadas]);

  /* ─────────────── O mês desenhado ─────────────── */

  const grade = useMemo(() => {
    const primeiro = new Date(mes.ano, mes.mes, 1);
    const dias = new Date(mes.ano, mes.mes + 1, 0).getDate();

    /* As casas vazias antes do dia 1: sem elas o dia cai na coluna errada da
       semana, e o calendário mente sobre em que dia da semana o cliente paga. */
    const vazias = Array.from({ length: primeiro.getDay() }, () => null);
    const doMes = Array.from({ length: dias }, (_, i) => iso(new Date(mes.ano, mes.mes, i + 1)));

    return [...vazias, ...doMes];
  }, [mes]);

  const doMes = useMemo(
    () => linhas.filter((l) => l.venc.startsWith(`${mes.ano}-${String(mes.mes + 1).padStart(2, "0")}`)),
    [linhas, mes],
  );

  const totalDoMes = useMemo(() => doMes.reduce((acc, l) => acc + l.saldo, 0), [doMes]);

  /*
   * O que abre sozinho.
   *
   * Atraso primeiro: é a cobrança que já devia ter acontecido. Sem atraso, o
   * dia de hoje; sem nada hoje, o próximo dia que tem alguém para cobrar —
   * abrir num dia vazio faria a tela parecer sem dados.
   */
  useEffect(() => {
    if (selecionado || carregando || linhas.length === 0) return;

    if (atrasadas.length > 0) setSelecionado("atrasadas");
    else if (porDia.has(hoje)) setSelecionado(hoje);
    else setSelecionado(linhas.find((l) => l.venc >= hoje)?.venc ?? null);
  }, [selecionado, carregando, linhas, atrasadas, porDia, hoje]);

  const doDia = useMemo(() => {
    if (!selecionado) return [];
    return selecionado === "atrasadas" ? atrasadas : (porDia.get(selecionado) ?? []);
  }, [selecionado, atrasadas, porDia]);

  const totalDoDia = useMemo(() => doDia.reduce((acc, l) => acc + l.saldo, 0), [doDia]);

  /* ─────────────── Cobrar ─────────────── */

  /** O WhatsApp do cliente da conta — vazio quando a ficha não tem contato. */
  const telefoneDe = (conta: Conta): string => {
    const c = clientes.find(
      (x) => (conta.clienteId && String(x.id) === String(conta.clienteId)) ||
        (!!conta.clienteNome && x.nome?.trim().toLowerCase() === conta.clienteNome.trim().toLowerCase()),
    );

    const bruto = c?.contato?.whatsapp || c?.contato?.celular || c?.contato?.telefone || "";
    return onlyDigits(bruto);
  };

  /**
   * A mensagem de cobrança.
   *
   * Escrita por extenso com valor e data porque é ela que o cliente lê no
   * celular — "sua parcela venceu" sem número obriga a resposta "qual?". O tom
   * muda com o atraso: lembrete antes do vencimento, cobrança depois.
   */
  const mensagemDe = (l: Linha): string => {
    const nome = (l.conta.clienteNome || "").trim().split(/\s+/)[0];
    const p = prazo(l.venc);
    const loja = enterprise?.nomeFantasia ? ` — ${enterprise.nomeFantasia}` : "";
    const qual = l.conta.parcelas.length > 1 ? `a parcela ${l.parcela.numero}/${l.conta.parcelas.length}` : "o pagamento";

    const abertura = nome ? `Olá, ${nome}!` : "Olá!";

    const corpo = p.atrasada
      ? `Passando para lembrar de ${qual} de ${l.conta.descricao}, no valor de ${formatCurrency(l.saldo)}, que venceu em ${dataBr(l.venc)}.`
      : `Passando para lembrar de ${qual} de ${l.conta.descricao}, no valor de ${formatCurrency(l.saldo)}, com vencimento em ${dataBr(l.venc)}${p.dias === 0 ? " (hoje)" : ""}.`;

    return `${abertura} ${corpo} Qualquer dúvida é só chamar por aqui.${loja}`;
  };

  const marcarAvisada = (l: Linha) => {
    const novo = { ...avisadas, [l.parcela.id]: hoje };
    setAvisadas(novo);

    try {
      localStorage.setItem(AVISOS_KEY, JSON.stringify(novo));
    } catch {
      /* Navegador sem armazenamento: perde-se a marca, não a cobrança. */
    }
  };

  const cobrar = async (l: Linha) => {
    const texto = mensagemDe(l);
    const digitos = telefoneDe(l.conta);

    if (!digitos) {
      /* Sem telefone na ficha, o atalho ainda economiza a parte chata: a
         mensagem pronta vai para a área de transferência. */
      try {
        await navigator.clipboard.writeText(texto);
        alert.info("Mensagem copiada", `${l.conta.clienteNome || "Este cliente"} não tem WhatsApp na ficha. A cobrança foi copiada — é só colar na conversa.`);
      } catch {
        alert.warning("Sem WhatsApp na ficha", "Cadastre o contato do cliente para cobrar por aqui.");
      }

      return;
    }

    const destino = digitos.length <= 11 ? `55${digitos}` : digitos;
    window.open(`https://wa.me/${destino}?text=${encodeURIComponent(texto)}`, "_blank", "noopener,noreferrer");
    marcarAvisada(l);
  };

  /* ─────────────── Receber ─────────────── */

  const receber = async (valor: number, forma: string) => {
    if (!recebendo) return;

    setSalvando(true);

    try {
      const gerado = await ContaService.pagar(recebendo.parcela.id, { valor, formaPagamento: forma });

      setRecebendo(null);
      setRecibo(gerado);
      onRecarregar();

      alert.success("Recebimento registrado!", `Recibo nº ${gerado.reciboNumero}. A parcela sai da cobrança do dia.`);
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível registrar o recebimento."));
    } finally {
      setSalvando(false);
    }
  };

  /* ─────────────── Tela ─────────────── */

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-mist">
        <Loader2 size={15} className="animate-spin text-accent" /> Carregando o carnê…
      </div>
    );
  }

  if (linhas.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2.5 px-6 py-16 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-xl border border-fg/[0.07] bg-fg/[0.03] text-faint">
          <CalendarDays size={20} />
        </span>
        <p className="text-[13px] text-mist">Ninguém a cobrar</p>
        <p className="max-w-[300px] text-[11.5px] leading-relaxed text-faint">
          As vendas que você fechar a prazo aparecem aqui no dia em que cada parcela vence.
        </p>
      </div>
    );
  }

  const mesAtual = new Date().getMonth() === mes.mes && new Date().getFullYear() === mes.ano;

  return (
    /* A tela OCUPA o corpo do cartão (ver `corpoCheio` na `TabelaCard`): as
       semanas dividem entre si a altura que sobra, em vez de o calendário
       terminar no meio e deixar faixa vazia até a borda. No celular as duas
       colunas viram uma pilha de altura natural — lá o que rola é a página. */
    <div className="grid gap-3 p-3 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
      {/* ═══════════ O calendário ═══════════ */}
      <div className="flex min-w-0 flex-col lg:min-h-0">
        {/* O atraso mora fora do mês: quem venceu em agosto continua devendo
            em setembro, e virar a página não pode escondê-lo. */}
        {atrasadas.length > 0 && (
          <button
            type="button"
            onClick={() => setSelecionado("atrasadas")}
            className={`focus-ring mb-2.5 flex w-full cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
              selecionado === "atrasadas" ? "border-danger/60 bg-danger/[0.12]" : "border-danger/30 bg-danger/[0.06] hover:bg-danger/[0.1]"
            }`}
          >
            <AlertTriangle size={16} className="shrink-0 text-danger" />
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] text-danger">
                {atrasadas.length} {atrasadas.length === 1 ? "cobrança atrasada" : "cobranças atrasadas"}
              </span>
              <span className="block truncate text-[11px] text-faint">de {new Set(atrasadas.map((l) => l.conta.clienteNome || l.conta.descricao)).size} clientes · cobrar hoje</span>
            </span>
            <span className="shrink-0 text-right text-[13.5px] tabular-nums text-danger">{formatCurrency(totalAtrasado)}</span>
          </button>
        )}

        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Mês anterior"
              onClick={() => setMes((m) => (m.mes === 0 ? { ano: m.ano - 1, mes: 11 } : { ...m, mes: m.mes - 1 }))}
              className="focus-ring grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-fg/[0.05] hover:text-ink"
            >
              <ChevronLeft size={15} />
            </button>

            <p className="min-w-[132px] text-center text-[12.5px] capitalize text-ink">
              {MESES[mes.mes]} <span className="tabular-nums text-faint">{mes.ano}</span>
            </p>

            <button
              type="button"
              aria-label="Próximo mês"
              onClick={() => setMes((m) => (m.mes === 11 ? { ano: m.ano + 1, mes: 0 } : { ...m, mes: m.mes + 1 }))}
              className="focus-ring grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-fg/[0.05] hover:text-ink"
            >
              <ChevronRight size={15} />
            </button>

            {!mesAtual && (
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  setMes({ ano: d.getFullYear(), mes: d.getMonth() });
                  setSelecionado(hoje);
                }}
                className="focus-ring ml-1 cursor-pointer rounded-lg border border-fg/[0.09] px-2 py-1 text-[11px] text-mist transition-colors hover:border-accent/50 hover:text-accent-soft"
              >
                Hoje
              </button>
            )}
          </div>

          {/* Quanto o mês inteiro tem a receber — o número que responde
              "dá para pagar o fornecedor dia 20?" sem abrir dia a dia. */}
          <p className="text-right text-[11px] text-faint">
            {doMes.length} {doMes.length === 1 ? "parcela no mês" : "parcelas no mês"}
            <span className="ml-1.5 text-[12.5px] tabular-nums text-ink">{formatCurrency(totalDoMes)}</span>
          </p>
        </div>

        <div className="mb-1 grid grid-cols-7 gap-1">
          {DIAS_SEMANA.map((d, i) => (
            <span key={`${d}-${i}`} className="text-center text-[10px] uppercase tracking-[0.08em] text-faint">{d}</span>
          ))}
        </div>

        {/* `auto-rows-fr` + `flex-1`: as semanas repartem a altura restante,
            e cada casa cresce junto. O piso de 62px é para o celular, onde
            não há altura sobrando para repartir. */}
        <div className="grid auto-rows-fr grid-cols-7 gap-1 lg:min-h-0 lg:flex-1">
          {grade.map((dia, i) => {
            if (!dia) return <span key={`vazio-${i}`} />;

            const lista = porDia.get(dia) ?? [];
            const valor = lista.reduce((acc, l) => acc + l.saldo, 0);
            const atrasado = lista.length > 0 && dia < hoje;
            const ehHoje = dia === hoje;
            const on = selecionado === dia;

            return (
              <button
                key={dia}
                type="button"
                disabled={lista.length === 0}
                onClick={() => setSelecionado(dia)}
                aria-label={`${diaPorExtenso(dia)} — ${lista.length} a receber`}
                className={`focus-ring flex min-h-[62px] flex-col items-start justify-between rounded-lg border p-1.5 text-left transition-colors ${
                  on
                    ? "border-accent bg-accent/[0.12]"
                    : lista.length === 0
                      ? "cursor-default border-fg/[0.05] bg-fg/[0.01]"
                      : atrasado
                        ? "cursor-pointer border-danger/35 bg-danger/[0.07] hover:border-danger/60"
                        : "cursor-pointer border-fg/[0.08] bg-fg/[0.03] hover:border-accent/50"
                }`}
              >
                <span
                  className={`text-[11.5px] tabular-nums ${
                    ehHoje ? "grid h-[18px] w-[18px] place-items-center rounded-full bg-accent text-[10.5px] text-white" : lista.length ? "text-ink" : "text-faint"
                  }`}
                >
                  {Number(dia.slice(8))}
                </span>

                {lista.length > 0 && (
                  <span className="w-full">
                    {/* O valor primeiro, a contagem depois: o dia é escolhido
                        pelo dinheiro que ele traz, e "3 clientes" é o detalhe
                        que só importa depois de escolher o dia. */}
                    <span className={`block truncate text-[10.5px] tabular-nums ${atrasado ? "text-danger" : "text-mist"}`}>{formatCurrency(valor)}</span>
                    <span className="block truncate text-[9.5px] text-faint">{lista.length} {lista.length === 1 ? "cliente" : "clientes"}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══════════ O dia escolhido ═══════════ */}
      <div className="flex max-h-[520px] min-h-[240px] min-w-0 flex-col rounded-xl border border-fg/[0.07] bg-fg/[0.02] lg:max-h-full lg:min-h-0">
        <header className="shrink-0 border-b border-fg/[0.06] px-3 py-2.5">
          <p className={`text-[12.5px] capitalize ${selecionado === "atrasadas" ? "text-danger" : "text-ink"}`}>
            {selecionado === "atrasadas" ? "Cobranças atrasadas" : selecionado ? diaPorExtenso(selecionado) : "Escolha um dia"}
          </p>
          <p className="mt-0.5 text-[11px] text-faint">
            {doDia.length > 0 ? (
              <>
                {doDia.length} {doDia.length === 1 ? "cliente" : "clientes"} ·
                <span className="ml-1 tabular-nums text-mist">{formatCurrency(totalDoDia)}</span>
              </>
            ) : (
              "ninguém a cobrar"
            )}
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {doDia.length === 0 ? (
            <p className="px-2 py-10 text-center text-[11.5px] leading-relaxed text-faint">
              Toque num dia com valor no calendário para ver quem paga nele.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {doDia.map((l) => {
                const p = prazo(l.venc);
                const avisadaEm = avisadas[l.parcela.id];

                return (
                  <li key={l.parcela.id} className="rounded-xl border border-fg/[0.07] bg-surface px-2.5 py-2">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-accent/25 bg-accent/[0.12] text-[10.5px] text-accent-soft">
                        {getInitials(l.conta.clienteNome || l.conta.descricao)}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] text-ink">{l.conta.clienteNome || l.conta.descricao}</span>
                        <span className="block truncate text-[10.5px] text-faint">
                          {l.conta.parcelas.length > 1 && <>parcela {l.parcela.numero}/{l.conta.parcelas.length} · </>}
                          <span className={p.atrasada ? "text-danger" : ""}>{p.texto}</span>
                          {l.parcela.valorPago > 0 && ` · pago ${formatCurrency(l.parcela.valorPago)}`}
                        </span>
                      </span>

                      <span className={`shrink-0 text-right text-[13px] tabular-nums ${p.atrasada ? "text-danger" : "text-ink"}`}>
                        {formatCurrency(l.saldo)}
                      </span>
                    </div>

                    {/* Os dois gestos da cobrança, lado a lado: avisar e dar
                        baixa. Fora daqui, os dois custavam trocar de tela. */}
                    <div className="mt-2 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void cobrar(l)}
                        className={`focus-ring flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border py-1.5 text-[11.5px] transition-colors ${
                          avisadaEm === hoje
                            ? "border-success/35 text-success"
                            : "border-fg/[0.09] text-mist hover:border-success/50 hover:text-success"
                        }`}
                        title={telefoneDe(l.conta) ? "Abrir o WhatsApp com a cobrança escrita" : "Copiar a mensagem de cobrança"}
                      >
                        {avisadaEm === hoje ? <Check size={12} /> : telefoneDe(l.conta) ? <MessageCircle size={12} /> : <Copy size={12} />}
                        {avisadaEm === hoje ? "Avisado hoje" : "Cobrar"}
                      </button>

                      <button
                        type="button"
                        onClick={() => setRecebendo(l)}
                        className="focus-ring flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-success/[0.12] py-1.5 text-[11.5px] text-success transition-colors hover:bg-success/20"
                      >
                        <Wallet size={12} />
                        Receber
                      </button>
                    </div>

                    {/* Cobrança de outro dia continua dizendo quando venceu —
                        na lista de atrasadas, "há 12 dias" é o que decide
                        quem se liga primeiro. */}
                    {avisadaEm && avisadaEm !== hoje && (
                      <p className="mt-1 text-[10px] text-faint">último aviso em {dataBr(avisadaEm)}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ── Baixa de UMA parcela ── */}
      <Modal
        open={!!recebendo}
        onClose={() => !salvando && setRecebendo(null)}
        title="Registrar recebimento"
        subtitle={recebendo ? `${recebendo.conta.clienteNome || recebendo.conta.descricao} · vence em ${dataBr(recebendo.venc)}` : ""}
        size="sm"
      >
        {recebendo && (
          <PagamentoForm
            total={recebendo.parcela.valor}
            jaPago={recebendo.parcela.valorPago}
            alvo="parcela"
            salvando={salvando}
            textoConfirmar="Registrar recebimento"
            onConfirmar={(valor, forma) => void receber(valor, forma)}
            onCancelar={() => setRecebendo(null)}
          />
        )}
      </Modal>

      {/* O recibo — é o que o cliente leva depois de pagar. */}
      <Modal open={!!recibo} onClose={() => setRecibo(null)} title="Parcela recebida" subtitle={recibo ? `Recibo nº ${recibo.reciboNumero}` : ""} size="sm">
        {recibo && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-success/25 bg-success/[0.07] px-4 py-3">
              <p className="text-[11px] text-success">Recebido</p>
              <p className="text-[22px] tabular-nums text-ink">{formatCurrency(recibo.valor)}</p>
              <p className="mt-0.5 text-[11px] text-faint">
                {recibo.contaDescricao} · parcela {recibo.parcelaNumero}
                {recibo.formaPagamento && ` · ${recibo.formaPagamento}`}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-fg/[0.07] pt-3.5">
              <BotaoRecibo
                dados={{
                  numero: String(recibo.reciboNumero),
                  clienteNome: recibo.contaDescricao,
                  valor: recibo.valor,
                  formaPagamento: recibo.formaPagamento,
                  pagoEm: recibo.pagoEm,
                }}
              />

              <button type="button" onClick={() => setRecibo(null)} className="focus-ring min-h-[38px] cursor-pointer rounded-lg bg-fg/[0.06] px-4 text-[12.5px] text-ink transition-colors hover:bg-fg/[0.1]">
                Fechar
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AgendaCobrancas;
