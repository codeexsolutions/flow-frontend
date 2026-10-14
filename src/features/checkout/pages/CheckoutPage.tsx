import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ChevronLeft, Building2, Loader2, QrCode, Check, Copy, Sparkles, ArrowRight,
  CircleCheck, Clock, AlertTriangle, MessageCircle, Mail, RefreshCw, LogOut, CalendarClock,
  WalletMinimal, ShieldCheck,
} from "lucide-react";

import { Modal } from "@/shared/ui/Modal";
import { SkeletonFaturas } from "@/shared/ui/skeleton";
import { useAlert } from "@/shared/ui/Alert";
import { formatCurrencyFromCents } from "@/shared/utils/currency";
import { formatDocument } from "@/shared/utils/format";
import { formatDate } from "@/shared/utils/date";

import useAuth from "@/features/auth/store/auth.store";
import { useLiberacaoEmpresa } from "@/shared/realtime/useLiberacaoEmpresa";
import AssinaturaService from "@/features/assinatura/services/assinatura.service";
import CardPlano from "@/features/assinatura/components/CardPlano";
import { baixarFaturaPdf } from "@/features/assinatura/utils/faturaPdf";
import { competenciaBr, prazoAte } from "@/features/assinatura/utils/fatura.format";
import ExtratoFaturas from "@/features/checkout/components/ExtratoFaturas";
import useCatalogo from "@/shared/plano/catalogo.store";
import {
  CICLO_LABEL, FaturaMeta, ehPagavel, type CobrancaPix, type Fatura, type MinhaAssinatura,
} from "@/features/assinatura/types/assinatura.types";

/* ================================================================== */
/* Peças da tela */
/* ================================================================== */

/**
 * Indicador da faixa da conta.
 *
 * Antes eram quatro tiles de 19px, cada um disputando atenção com o total em
 * aberto logo acima. Aqui o rótulo vem em cima, em versalete, e o valor abaixo
 * em corpo de texto: a faixa vira a linha de referência da conta, não um
 * segundo herói.
 *
 * O fundo é opaco de propósito: as divisórias são os vãos de 1px do grid, e um
 * fundo translúcido deixaria a linha atravessar a célula.
 */
function Indicador({ label, valor, apoio, icone }: { label: string; valor: React.ReactNode; apoio?: string; icone: React.ReactNode }) {
  return (
    <div className="min-w-0 bg-canvas px-4 py-3">
      <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-muted">
        <span className="text-faint">{icone}</span>
        {label}
      </p>
      <p className="mt-1.5 truncate text-[14px] leading-tight text-ink">{valor}</p>
      {apoio && <p className="mt-0.5 truncate text-[11px] text-faint">{apoio}</p>}
    </div>
  );
}

/** Aviso de uma linha — substitui os banners em degradê que poluíam o topo. */
function Aviso({ icon, titulo, texto, acao }: { icon: React.ReactNode; titulo: string; texto: string; acao?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-accent/20 bg-accent/[0.06] px-5 py-4 sm:flex-row sm:items-center">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent-soft">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-ink">{titulo}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-mist">{texto}</p>
      </div>
      {acao}
    </div>
  );
}

/* ================================================================== */
/* Página */
/* ================================================================== */
/**
 * `embutido` = a tela está dentro de Configurações → Faturas, que já tem
 * cabeçalho, padding e área de rolagem próprios. Sem isso a página repetia o
 * cabeçalho, dobrava o padding e ainda centralizava o conteúdo num container
 * que já estava centralizado — era a "formatação fora do lugar".
 */
const CheckoutPage = ({ embutido = false }: { embutido?: boolean }) => {
  const navigate = useNavigate();
  const alert = useAlert();
  const { logout } = useAuth();

  const [assinatura, setAssinatura] = useState<MinhaAssinatura | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [faturaSelecionada, setFaturaSelecionada] = useState<Fatura | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  /** Id da fatura cujo PDF está sendo gerado — trava só aquele botão. */
  const [baixando, setBaixando] = useState<string | null>(null);
  const [trocandoPlano, setTrocandoPlano] = useState(false);
  /** Código do plano cuja troca está em andamento — trava só aquele cartão. */
  const [salvandoPlano, setSalvandoPlano] = useState<string | null>(null);
  /* A vitrine da troca vem do catálogo compartilhado — o mesmo que a página
     pública mostra. Duas listas de plano no mesmo produto dariam duas
     respostas para "o que existe à venda". */
  const planos = useCatalogo((s) => s.planos);
  const carregarCatalogo = useCatalogo((s) => s.carregar);

  const carregar = useCallback(async () => {
    try {
      setAssinatura(await AssinaturaService.minha());
      setErro("");
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      setErro(err?.response?.data?.message ?? err?.message ?? "Não foi possível carregar sua assinatura.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const faturas = assinatura?.faturas ?? [];

  const faturasAbertas = useMemo(() => faturas.filter((f) => f.status !== "PAGA" && f.status !== "CANCELADA"), [faturas]);
  const faturasPagas = useMemo(() => faturas.filter((f) => f.status === "PAGA"), [faturas]);

  const totalAPagar = useMemo(() => faturasAbertas.reduce((acc, f) => acc + f.valorCentavos, 0), [faturasAbertas]);
  const totalPago = useMemo(() => faturasPagas.reduce((acc, f) => acc + f.valorCentavos, 0), [faturasPagas]);

  const proximaFatura = assinatura?.faturaEmAberto ?? null;
  const emConfirmacao = faturasAbertas.filter((f) => f.status === "AGUARDANDO_CONFIRMACAO");

  /*
   * Teste grátis.
   *
   * Enquanto ele corre, a empresa usa o sistema inteiro sem ter pago — e a
   * fatura que está em aberto só passa a valer quando o período acaba. Sem
   * dizer isso na tela, quem está em teste vê "saldo em aberto" e acha que
   * está devendo agora.
   */
  const teste = assinatura?.teste;
  const emTesteGratis = Boolean(teste?.emTeste);
  const diasDeTeste = teste?.diasRestantes ?? null;

  /** "acaba hoje", "falta 1 dia", "faltam 5 dias". */
  const prazoDoTeste =
    diasDeTeste === null ? "" : diasDeTeste === 0 ? "acaba hoje" : diasDeTeste === 1 ? "falta 1 dia" : `faltam ${diasDeTeste} dias`;

  /** Quanto falta (ou faz) para o vencimento da próxima — a faixa lê disso. */
  const prazoProxima = prazoAte(proximaFatura?.vencimento);
  const vencido = proximaFatura?.status === "VENCIDA";

  const empresa = assinatura?.empresa;
  const plano = assinatura?.plano;
  const pix = assinatura?.pix;
  const suporte = assinatura?.suporte;

  /*
   * Trocar de plano é uma vez por ciclo.
   *
   * Sem a trava dava para subir de plano, gerar a fatura da diferença, voltar
   * para o barato antes de pagar e repetir — cada volta mexendo no valor de
   * uma cobrança ainda não quitada. Quem decide é o servidor; a tela só lê a
   * resposta dele para não oferecer um botão que a API vai recusar.
   */
  /* ---- Pix pelo Mercado Pago ---- */
  const automatico = assinatura?.pagamentoAutomatico;
  const automaticoDisponivel = Boolean(automatico?.disponivel);
  const [cobranca, setCobranca] = useState<CobrancaPix | null>(null);

  const troca = assinatura?.trocaDePlano;
  const trocaLiberada = troca?.liberada ?? true;
  const trocaLiberaEm = troca?.liberaEm ?? null;
  /*
   * Não existe "trocar" quando não há para onde ir.
   *
   * Com um plano em catálogo, o botão abriria um modal com o cartão do plano
   * que a pessoa já tem — uma porta que só leva de volta. A checagem é pelo
   * que o catálogo REALMENTE trouxe: catálogo vazio (rede caída) mantém o
   * botão, porque aí não sabemos, e sumir por falha de rede lê como defeito.
   */
  const temParaOndeTrocar = planos.length === 0 || planos.some((p) => p.codigo !== assinatura?.plano?.codigo);

  const podeTrocarPlano = Boolean(assinatura?.plano) && temParaOndeTrocar;

  /* ------------------------- Ações ------------------------- */

  /**
   * Abre o pagamento da fatura.
   *
   * Com o Mercado Pago ligado, gera uma cobrança Pix identificada: o dinheiro
   * que cai é reconhecido sozinho e a fatura quita por webhook. Sem ele, cai
   * no Pix estático da chave da empresa, que continua exigindo comprovante.
   *
   * A falha ao gerar não fecha o modal — mostra o Pix manual como alternativa
   * em vez de deixar quem quer pagar sem caminho nenhum.
   */
  const abrirPagamento = async (f: Fatura) => {
    if (!ehPagavel(f)) return;

    setQrLoading(true);
    setCopiado(false);
    setCobranca(null);
    setFaturaSelecionada(f);

    if (!automaticoDisponivel) return;

    try {
      setCobranca(await AssinaturaService.cobrancaPix(f.id));
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      alert.warning(
        "Cobrança automática indisponível",
        err?.response?.data?.message ?? err?.message ?? "Use o Pix abaixo e envie o comprovante.",
      );
    } finally {
      setQrLoading(false);
    }
  };

  const fecharModal = () => {
    setFaturaSelecionada(null);
    setCopiado(false);
  };

  const copiarTexto = async (texto: string) => {
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      alert.success("Código copiado!", "Cole no aplicativo do seu banco.");
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      alert.error("Falha ao copiar", "Copie o código manualmente.");
    }
  };

  const copiarPix = () => copiarTexto(pix?.copiaECola ?? "");

  /**
   * Abre o WhatsApp com a mensagem pronta e marca a fatura como aguardando
   * confirmação — é assim que ela entra na fila do painel do dono.
   *
   * A janela abre ANTES do await de propósito: navegador bloqueia popup que
   * não venha direto do clique.
   */
  const avisarPagamento = async (f: Fatura) => {
    if (enviando) return;

    if (suporte?.linkWhatsapp) {
      window.open(suporte.linkWhatsapp, "_blank", "noopener,noreferrer");
    }

    setEnviando(true);

    try {
      setAssinatura(await AssinaturaService.enviarComprovante(f.id));
      fecharModal();

      await alert.success(
        "Recebemos seu aviso!",
        suporte?.linkWhatsapp
          ? "Envie o comprovante na conversa do WhatsApp que abrimos. Assim que confirmarmos, seu acesso é liberado."
          : `Envie o comprovante para ${suporte?.email || "o suporte"}. Assim que confirmarmos, seu acesso é liberado.`,
      );
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      alert.error("O aviso não foi registrado", err?.response?.data?.message ?? err?.message ?? "Tente de novo em instantes.");
    } finally {
      setEnviando(false);
    }
  };

  const abrirTrocaDePlano = async () => {
    setTrocandoPlano(true);
    await carregarCatalogo();
  };

  const trocarPlano = async (codigo: string) => {
    if (codigo === plano?.codigo || salvandoPlano) return;

    /*
     * Confirmação antes de trocar.
     *
     * A troca vale por um ciclo inteiro e mexe no valor da fatura. Um clique
     * sem volta num cartão de plano é fácil demais de dar sem querer — e a
     * pessoa só descobre depois que não pode desfazer.
     */
    const ok = await alert.confirm(
      `Trocar para o plano ${codigo}?`,
      "Você pode trocar uma vez por ciclo. Depois de confirmar, a próxima troca só fica disponível no mês que vem.",
      { confirmText: "Trocar de plano" },
    );

    if (!ok) return;

    setSalvandoPlano(codigo);

    try {
      const atualizada = await AssinaturaService.trocarPlano(codigo);
      const anterior = plano?.precoCentavos ?? 0;
      const novo = atualizada.plano?.precoCentavos ?? 0;

      setAssinatura(atualizada);
      setTrocandoPlano(false);

      alert.success(
        "Plano atualizado!",
        novo > anterior && assinatura?.status === "ATIVA"
          ? `Geramos uma fatura de ${formatCurrencyFromCents(novo - anterior)} com a diferença.`
          : "Sua fatura em aberto já está com o novo valor.",
      );
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      alert.error("O plano não foi trocado", err?.response?.data?.message ?? err?.message ?? "Tente de novo em instantes.");
    } finally {
      setSalvandoPlano(null);
    }
  };

  const recarregar = () => {
    setCarregando(true);
    carregar();
  };

  /**
   * Gera e baixa o PDF da fatura, em nome da CodeEx Solutions.
   *
   * O jsPDF entra por import dinâmico dentro de `baixarFaturaPdf`, então o
   * primeiro clique tem um instante de espera — daí o estado por fatura, e não
   * um booleano global: baixar uma linha não pode travar as outras.
   */
  const baixarFatura = async (f: Fatura) => {
    if (!assinatura || baixando) return;

    setBaixando(f.id);

    try {
      const arquivo = await baixarFaturaPdf(f, assinatura);
      alert.success("Fatura baixada", `Salvamos o arquivo ${arquivo} na sua pasta de downloads.`);
    } catch (e) {
      const err = e as { message?: string };
      alert.error("Não foi possível gerar o PDF", err?.message ?? "Tente de novo em instantes.");
    } finally {
      setBaixando(null);
    }
  };

  /**
   * Pagamento confirmado pelo dono: o socket avisa, a sessão já foi renovada
   * com o token novo e aqui só resta comemorar e levar o cliente para dentro.
   */
  const aoLiberar = useCallback(async () => {
    await alert.success(
      "Empresa verificada! 🎉",
      "Confirmamos seu pagamento e liberamos o acesso completo ao CodeEx Flow. Bom trabalho!",
      { confirmText: "Entrar no sistema" },
    );

    navigate("/", { replace: true });
  }, [alert, navigate]);

  useLiberacaoEmpresa(aoLiberar);

  /**
   * QR em preto no branco: é o que os apps de banco leem com folga. Colorir o
   * código para combinar com o tema derruba o contraste que a leitura exige.
   */
  const qrCodeUrl = pix?.copiaECola
    ? `https://api.qrserver.com/v1/create-qr-code/?size=440x440&margin=12&data=${encodeURIComponent(pix.copiaECola)}`
    : "";

  /* ------------------------- Estados de carga ------------------------- */

  /* O esqueleto respeita o mesmo container da tela pronta: embutido em
     Configurações ele não repete padding, e sozinho ele centraliza — senão o
     conteúdo salta de posição no instante em que os dados chegam. */
  if (carregando) {
    return (
      <div className={embutido ? "w-full" : "mx-auto w-full max-w-5xl px-5 py-8 lg:px-8"}>
        <SkeletonFaturas />
      </div>
    );
  }

  if (erro || !assinatura) {
    return (
      <div className="flex min-h-[60dvh] w-full flex-col items-center justify-center gap-4 px-6 text-center">
        <AlertTriangle className="h-8 w-8 text-danger" />
        <p className="max-w-md text-sm text-mist">{erro || "Assinatura não encontrada."}</p>
        <div className="flex gap-2">
          <button onClick={recarregar} className="focus-ring flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm text-white transition hover:brightness-110">
            <RefreshCw size={14} /> Tentar de novo
          </button>
          <button onClick={logout} className="focus-ring flex items-center gap-2 rounded-xl border border-fg/[0.08] px-4 py-2 text-sm text-mist transition hover:bg-fg/[0.04]">
            <LogOut size={14} /> Sair
          </button>
        </div>
      </div>
    );
  }

  const contaLiberada = Boolean(empresa?.ativo);

  return (
    <div className="relative w-full text-ink">
      {/* Cabeçalho — só quando a tela é a página inteira */}
      <header className={`safe-top sticky top-0 z-20 border-b border-fg/[0.06] bg-canvas/80 backdrop-blur-xl ${embutido ? "hidden" : ""}`}>
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-3.5 lg:px-8">
          {contaLiberada && (
            <button onClick={() => navigate(-1)} className="focus-ring flex h-9 w-9 items-center justify-center rounded-xl border border-fg/[0.07] text-mist transition-colors hover:bg-fg/[0.04]" aria-label="Voltar">
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}

          <img src="/logo.png" alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-lg shadow-glow" />

          <div className="min-w-0 flex-1">
            {/* O título fala da situação, não do módulo. Quem chega aqui com a
                conta bloqueada quer saber o que fazer para entrar; "Assinatura
                e faturas" descreve a tela e não responde nada. */}
            <h1 className="text-[15.5px] tracking-tight text-ink">
              {contaLiberada ? "Assinatura e faturas" : "Falta pouco para começar"}
            </h1>
            <p className="truncate text-[11px] text-faint">
              {contaLiberada ? empresa?.nomeFantasia : "Confirme o pagamento e o acesso é liberado na hora"}
            </p>
          </div>

          {/* Sem botão de atualizar: a liberação chega pelo socket. */}
          {!contaLiberada && (
            <button onClick={logout} className="focus-ring flex h-9 items-center gap-1.5 rounded-xl border border-fg/[0.07] px-3 text-xs text-mist transition hover:bg-fg/[0.04]">
              <LogOut size={13} />
              <span className="hidden sm:inline">Sair</span>
            </button>
          )}
        </div>
      </header>

      {/* Embutido: alinhado à esquerda, sem padding próprio — quem cuida disso
          é a página de Configurações. Sozinho: centralizado na viewport. */}
      <div className={embutido ? "flex w-full flex-col gap-4" : "mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-8 lg:px-8"}>
        {/* ---------- Aviso contextual (só um, quando faz sentido) ---------- */}
        {emTesteGratis ? (
          <Aviso
            icon={<Sparkles className="h-4 w-4" />}
            titulo={`Teste grátis — ${prazoDoTeste}`}
            texto={
              proximaFatura
                ? `Você está usando o Flow completo, sem pagar nada. Quando o teste terminar, a fatura de ${formatCurrencyFromCents(proximaFatura.valorCentavos)} abaixo passa a valer — pode adiantar o pagamento quando quiser.`
                : "Você está usando o Flow completo, sem pagar nada. Quando o teste terminar, geramos a primeira cobrança."
            }
            acao={
              proximaFatura && ehPagavel(proximaFatura) ? (
                <button
                  onClick={() => abrirPagamento(proximaFatura)}
                  className="focus-ring inline-flex shrink-0 items-center gap-2 rounded-xl border border-fg/[0.08] px-3 py-2 text-[12px] text-mist transition hover:bg-fg/[0.04] hover:text-ink"
                >
                  <QrCode size={14} /> Pagar agora
                </button>
              ) : undefined
            }
          />
        ) : emConfirmacao.length > 0 ? (
          <Aviso
            icon={<Clock className="h-4 w-4" />}
            titulo="Recebemos seu aviso de pagamento"
            texto={`Estamos conferindo ${emConfirmacao.length === 1 ? "a fatura" : "as faturas"} e liberamos seu acesso assim que confirmarmos — normalmente em algumas horas.`}
            acao={
              suporte?.linkWhatsapp ? (
                <a
                  href={suporte.linkWhatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="focus-ring inline-flex shrink-0 items-center gap-2 rounded-xl border border-fg/[0.08] px-3 py-2 text-[12px] text-mist transition hover:bg-fg/[0.04] hover:text-ink"
                >
                  <MessageCircle size={14} /> Enviar comprovante
                </a>
              ) : undefined
            }
          />
        ) : (
          !contaLiberada && (
            <Aviso
              icon={<ShieldCheck className="h-4 w-4" />}
              titulo="Falta só o primeiro pagamento"
              texto="Pague a fatura abaixo via Pix e nos envie o comprovante. Assim que confirmarmos, todo o sistema é liberado."
            />
          )
        )}

        {/* ---------- Duas colunas: a conta à esquerda, o plano à direita ---------- */}
        {/*
          O extrato é o que se consulta; o plano é o que se confere. Empilhados,
          o cartão do plano só aparecia depois de rolar a lista inteira — e o
          resumo pobre que existia ali no rodapé não era o mesmo cartão que a
          pessoa viu quando escolheu o plano. Agora é: o cartão completo da tela
          de planos, ao lado da conta.

          Abaixo de `xl` volta a empilhar — em tela estreita não há largura para
          o extrato e o cartão sem espremer os dois.
        */}
        <section className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {/* ---------- Faixa da conta: o saldo e a próxima obrigação ---------- */}
            {/*
              O topo virou cabeçalho de extrato: uma faixa só, com o saldo em aberto
              à esquerda, a ação à direita e os indicadores na régua de baixo. O
              herói de 44px que existia aqui gritava o mesmo número duas vezes — uma
              no título, outra no primeiro tile — e empurrava o extrato para fora da
              primeira tela, que é justamente o que a pessoa veio ver.

              Entra como as demais telas: opacidade e um passo curto. Sem escala —
              o número do saldo borraria enquanto anima.
            */}
            <motion.section
              className="card glass-sheen overflow-hidden"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 0.61, 0.36, 1] }}
            >
              <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-6">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted">
                {faturasAbertas.length === 0 ? "Nada em aberto" : emTesteGratis ? "A pagar quando o teste acabar" : "Saldo em aberto"}
              </p>

                  <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5">
                    <span className="text-[34px] leading-none tracking-tight tabular-nums text-ink sm:text-[38px]">{formatCurrencyFromCents(totalAPagar)}</span>
                    {faturasAbertas.length > 0 && (
                      <span className="text-[12px] text-faint">
                        em {faturasAbertas.length} {faturasAbertas.length === 1 ? "fatura" : "faturas"}
                      </span>
                    )}
                  </p>

                  {/* A linha de apoio responde "e daí?": quando vence e há quanto
                      tempo passou. Data sozinha obriga a pessoa a fazer a conta. */}
                  <p className={`mt-2 text-[12.5px] ${vencido ? "text-danger" : "text-mist"}`}>
                    {faturasAbertas.length === 0
                      ? "Todas as faturas estão quitadas — nada a fazer por aqui."
                      : emTesteGratis
                        ? `Nada a pagar agora · a cobrança começa em ${formatDate(proximaFatura?.vencimento)}`
                        : `Próxima: ${competenciaBr(proximaFatura?.competencia ?? "")} · vence em ${formatDate(proximaFatura?.vencimento)}${prazoProxima.texto ? ` (${prazoProxima.texto})` : ""}`}
                  </p>
                </div>

                {proximaFatura && ehPagavel(proximaFatura) && (
                  <button
                    onClick={() => abrirPagamento(proximaFatura)}
                    className="focus-ring group inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-[13px] text-white shadow-[0_10px_30px_-12px_rgb(var(--accent))] transition-all hover:brightness-110 active:scale-[0.99]"
                  >
                    <QrCode size={15} />
                    Pagar com Pix
                    <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                  </button>
                )}
              </div>

              {/* Régua da conta — quatro leituras curtas, mesmo peso entre si */}
              <div className="grid grid-cols-2 gap-px bg-fg/[0.06] pt-px lg:grid-cols-4">
                <Indicador
                  icone={<Sparkles size={11} />}
                  label="Plano"
                  valor={plano?.nome ?? "—"}
                  apoio={plano ? `${formatCurrencyFromCents(plano.precoCentavos)}${CICLO_LABEL[plano.ciclo]}` : "Sem plano definido"}
                />
                <Indicador
                  icone={<CalendarClock size={11} />}
                  label="Próximo vencimento"
                  valor={formatDate(proximaFatura?.vencimento ?? assinatura.proximoVencimento)}
                  apoio={proximaFatura ? FaturaMeta[proximaFatura.status].label : "Em dia"}
                />
                <Indicador
                  icone={<WalletMinimal size={11} />}
                  label="Total pago"
                  valor={formatCurrencyFromCents(totalPago)}
                  apoio={`${faturasPagas.length} ${faturasPagas.length === 1 ? "fatura" : "faturas"}`}
                />
                <Indicador
                  icone={emTesteGratis ? <Sparkles size={11} /> : contaLiberada ? <CircleCheck size={11} /> : <Clock size={11} />}
                  label="Conta"
                  valor={emTesteGratis ? "Teste grátis" : contaLiberada ? "Liberada" : "Aguardando"}
                  apoio={emTesteGratis ? prazoDoTeste : contaLiberada ? "Acesso completo" : "Liberamos após o pagamento"}
                />
              </div>
            </motion.section>

            {/* ---------- Pix com confirmação automática ---------- */}
            {/*
              Aviso, não botão: não há nada para ativar. Com o Mercado Pago ligado,
              toda cobrança já sai identificada — o cliente só precisa saber que
              não vai mais precisar mandar comprovante, senão continua mandando.
            */}
            {automaticoDisponivel && faturasAbertas.length > 0 && (
              <div className="flex items-center gap-3 rounded-2xl border border-success/20 bg-success/[0.05] px-5 py-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success/15 text-success">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <p className="min-w-0 text-[12.5px] leading-relaxed text-mist">
                  <span className="text-ink">Pagou, liberou.</span> O Pix daqui é identificado: assim que o dinheiro cai, sua conta é
                  liberada sozinha — sem enviar comprovante nem esperar confirmação.
                </p>
              </div>
            )}

            {/* ---------- Extrato de faturas: a tabela padrão do sistema ---------- */}
            {/*
              O extrato mora num componente próprio porque ele tem estado seu —
              busca, filtro e página — que não interessa a mais ninguém nesta tela.
            */}
            <ExtratoFaturas
              faturas={faturas}
              planoNome={plano?.nome}
              baixando={baixando}
              onPagar={abrirPagamento}
              onBaixar={baixarFatura}
            />
          </div>

          {/* ---------- Coluna do plano ---------- */}
          <aside className="flex w-full shrink-0 flex-col gap-4 xl:w-[336px]">
            {plano ? (
              <div className="flex flex-col gap-2">
                {/* O mesmo `CardPlano` da vitrine e do modal de troca: limites,
                    recursos e o selo de plano vigente, sem versão resumida. */}
                <CardPlano plano={plano} atual />

                {podeTrocarPlano &&
                  (trocaLiberada ? (
                    <button onClick={abrirTrocaDePlano} className="focus-ring flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-fg/[0.07] py-2 text-[12px] text-mist transition hover:bg-fg/[0.04] hover:text-ink">
                      <Sparkles size={13} />
                      Ver planos e trocar
                    </button>
                  ) : (
                    /* Travado: o botão continua na tela, explicando o porquê.
                       Sumir com ele faria a pessoa procurar onde estava — e o
                       "sumiu" é sempre lido como defeito, não como regra. */
                    <p className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-fg/[0.1] py-2 text-center text-[11.5px] leading-relaxed text-faint">
                      <Clock size={12} className="shrink-0" />
                      Nova troca de plano em {formatDate(trocaLiberaEm)}
                    </p>
                  ))}
              </div>
            ) : (
              <div className="card glass-sheen p-5">
                <p className="text-[11px] uppercase tracking-[1.2px] text-faint">Plano atual</p>
                <p className="mt-2 text-[13px] text-faint">Nenhum plano definido. Fale com o suporte.</p>
              </div>
            )}

            {/* ---- Empresa ---- */}
            <div className="card glass-sheen p-5">
              <p className="text-[11px] uppercase tracking-[1.2px] text-faint">Empresa</p>

              <div className="mt-3 flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-fg/[0.07] bg-fg/[0.03]">
                  {empresa?.urlLogo ? <img src={empresa.urlLogo} alt="" className="h-full w-full object-cover" /> : <Building2 className="h-5 w-5 text-muted" />}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-ink">{empresa?.nomeFantasia}</p>
                  <p className="truncate text-[11px] text-faint">
                    {empresa?.cpfCnpj ? formatDocument(empresa.cpfCnpj) : "—"} · {empresa?.codigoEmpresa}
                  </p>
                </div>
              </div>

              <p className="mt-4 flex items-center gap-2 rounded-xl border border-fg/[0.06] px-3 py-2 text-[12px] text-mist">
                {contaLiberada ? <CircleCheck size={14} className="shrink-0 text-success" /> : <Clock size={14} className="shrink-0 text-warning" />}
                {contaLiberada ? "Conta liberada, acesso completo" : "Liberamos após confirmar o pagamento"}
              </p>
            </div>

            {/* ---- Suporte ---- */}
            <div className="card glass-sheen flex flex-col gap-2 p-5">
              <p className="text-[11px] uppercase tracking-[1.2px] text-faint">Precisa de ajuda?</p>

              {suporte?.linkWhatsapp && (
                <a href={suporte.linkWhatsapp} target="_blank" rel="noopener noreferrer" className="focus-ring flex items-center gap-2.5 rounded-xl border border-fg/[0.06] px-3.5 py-2.5 text-[13px] text-mist transition hover:bg-fg/[0.04] hover:text-ink">
                  <MessageCircle size={15} className="text-muted" /> WhatsApp {suporte.whatsapp}
                </a>
              )}

              {suporte?.email && (
                <a href={`mailto:${suporte.email}`} className="focus-ring flex items-center gap-2.5 rounded-xl border border-fg/[0.06] px-3.5 py-2.5 text-[13px] text-mist transition hover:bg-fg/[0.04] hover:text-ink">
                  <Mail size={15} className="text-muted" /> {suporte.email}
                </a>
              )}

              {!suporte?.linkWhatsapp && !suporte?.email && <p className="text-[13px] text-faint">Nenhum canal de suporte configurado.</p>}
            </div>
          </aside>
        </section>
      </div>

      {/* ==================== MODAL PIX ==================== */}
      <Modal
        open={!!faturaSelecionada}
        onClose={fecharModal}
        title="Pagamento via Pix"
        subtitle={faturaSelecionada ? `${competenciaBr(faturaSelecionada.competencia)} · ${formatCurrencyFromCents(faturaSelecionada.valorCentavos)}` : undefined}
        size="sm"
      >
        <div className="flex flex-col items-center">
          {/* ---- Pix do Mercado Pago: confirma sozinho ---- */}
          {cobranca?.qrCode ? (
            <>
              <div className="relative mb-4 rounded-2xl bg-white p-3 shadow-e2">
                {cobranca.qrCodeBase64 ? (
                  <img src={`data:image/png;base64,${cobranca.qrCodeBase64}`} alt="QR Code do Pix" className="h-52 w-52 rounded-lg" />
                ) : (
                  <div className="grid h-52 w-52 place-items-center text-[12px] text-slate-500">Use o código abaixo</div>
                )}
              </div>

              <p className="flex items-center gap-1.5 text-[13px] text-success">
                <ShieldCheck size={14} />
                Confirmação automática
              </p>
              <p className="mt-1 max-w-[280px] text-center text-[11.5px] leading-relaxed text-faint">
                Assim que o pagamento cair, sua conta é liberada sozinha — sem enviar comprovante.
              </p>

              <button
                onClick={() => copiarTexto(cobranca.qrCode)}
                className="focus-ring mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm text-white transition-all hover:brightness-110"
              >
                {copiado ? (
                  <>
                    <Check size={16} /> Código copiado
                  </>
                ) : (
                  <>
                    <Copy size={16} /> Copiar código Pix
                  </>
                )}
              </button>

              {cobranca.expiraEm && (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-faint">
                  <Clock size={11} />
                  Este código vale até {new Date(cobranca.expiraEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}

              <details className="mt-3 w-full">
                <summary className="cursor-pointer list-none text-center text-[11px] text-faint transition-colors hover:text-mist">Ver o código completo</summary>
                <p className="mt-2 max-h-24 select-all overflow-y-auto break-all rounded-xl border border-fg/[0.07] bg-canvas p-3 text-[11px] leading-relaxed text-mist">{cobranca.qrCode}</p>
              </details>
            </>
          ) : qrLoading && automaticoDisponivel ? (
            <div className="flex flex-col items-center gap-3 py-16 text-[13px] text-mist">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
              Gerando sua cobrança Pix…
            </div>
          ) : pix?.copiaECola ? (
            <>
              {/* Cartão branco e QR preto: contraste é requisito de leitura. */}
              <div className="relative mb-4 rounded-2xl bg-white p-3 shadow-e2">
                <img src={qrCodeUrl} alt="QR Code do Pix" className="h-52 w-52 rounded-lg" onLoad={() => setQrLoading(false)} onError={() => setQrLoading(false)} />
                {qrLoading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white">
                    <Loader2 className="h-7 w-7 animate-spin text-accent" />
                  </div>
                )}
              </div>

              <p className="text-[13px] text-mist">Escaneie o QR Code ou copie o código</p>
              <p className="mt-1 text-center text-[11px] text-faint">
                {pix.beneficiario} · {pix.chave}
              </p>

              <button onClick={copiarPix} className="focus-ring mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm text-white transition-all hover:brightness-110">
                {copiado ? (
                  <>
                    <Check size={16} /> Código copiado
                  </>
                ) : (
                  <>
                    <Copy size={16} /> Copiar código Pix
                  </>
                )}
              </button>

              <details className="mt-3 w-full">
                <summary className="cursor-pointer list-none text-center text-[11px] text-faint transition-colors hover:text-mist">Ver o código completo</summary>
                <p className="mt-2 max-h-24 select-all overflow-y-auto break-all rounded-xl border border-fg/[0.07] bg-canvas p-3 text-[11px] leading-relaxed text-mist">{pix.copiaECola}</p>
              </details>
            </>
          ) : (
            <p className="py-6 text-center text-[13px] text-mist">A chave Pix ainda não foi configurada. Fale com o suporte para receber os dados de pagamento.</p>
          )}

          {/* "Já paguei" é do Pix manual. Na cobrança do Mercado Pago o aviso
              não serve para nada — quem confirma é o webhook, e oferecer o
              botão faria a pessoa achar que precisa avisar alguém. */}
          {faturaSelecionada && !cobranca?.qrCode && (
            <button
              onClick={() => avisarPagamento(faturaSelecionada)}
              disabled={enviando}
              className="focus-ring mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-success/30 bg-success/[0.1] py-3 text-sm text-success transition-all hover:bg-success/[0.18] disabled:opacity-60"
            >
              {enviando ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
              {suporte?.linkWhatsapp ? "Já paguei — enviar comprovante" : "Já paguei — avisar o suporte"}
            </button>
          )}

          <p className="mt-3 text-center text-[11px] leading-relaxed text-faint">Confirmamos o pagamento e liberamos seu acesso — normalmente em algumas horas.</p>
        </div>
      </Modal>

      {/* ==================== TROCA DE PLANO ==================== */}
      {/*
        A vitrine inteira, dentro do sistema.

        Antes era uma lista de botões com nome e preço — a versão pobre dos
        planos, mostrada justamente na hora de gastar mais. Aqui vale o mesmo
        cartão da página pública (`CardPlano`), com limites, recursos e o
        destaque do plano vigente, no tema que a pessoa escolheu.
      */}
      <Modal
        open={trocandoPlano}
        onClose={() => !salvandoPlano && setTrocandoPlano(false)}
        title="Escolha seu plano"
        subtitle={
          assinatura?.status === "ATIVA"
            ? "No upgrade geramos uma fatura só com a diferença. No downgrade não há cobrança: o preço menor vale no próximo ciclo."
            : "A fatura em aberto passa a valer o preço do novo plano."
        }
        size="full"
      >
        {planos.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-mist">
            <Loader2 className="h-4 w-4 animate-spin text-accent" /> Carregando planos...
          </div>
        ) : (
          <div className="p-4 sm:p-6">
            <p className="mb-4 flex items-center gap-2 rounded-xl border border-warning/25 bg-warning/[0.07] px-3.5 py-2.5 text-[12px] leading-relaxed text-warning">
              <Clock size={14} className="shrink-0" />
              Você troca de plano uma vez por ciclo. Depois de confirmar, a próxima troca fica disponível só no mês que vem.
            </p>

            {/* Cartões da mesma altura, como na vitrine pública — a mesma
                escada de planos não pode ter duas aparências. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
              {planos.map((p) => (
                <CardPlano
                  key={p.id}
                  plano={p}
                  atual={p.codigo === plano?.codigo}
                  bloqueado={Boolean(salvandoPlano) && salvandoPlano !== p.codigo}
                  ocupado={salvandoPlano === p.codigo}
                  rotuloAcao={`Mudar para ${p.nome}`}
                  onEscolher={() => trocarPlano(p.codigo)}
                />
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default CheckoutPage;
