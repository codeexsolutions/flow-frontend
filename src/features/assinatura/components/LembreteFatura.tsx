import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, CalendarClock, CreditCard, Receipt } from "lucide-react";

import { Modal } from "@/shared/ui/Modal";
import useAuth from "@/features/auth/store/auth.store";
import { ehGestor } from "@/features/vendas/components/TabsVendas";
import { jaViuTour } from "@/features/tour/TourInicial";
import { jaViuNovidades } from "@/features/novidades/conteudo";
import AssinaturaService from "@/features/assinatura/services/assinatura.service";
import { competenciaBr } from "@/features/assinatura/utils/fatura.format";
import { ehPagavel, type Fatura, type MinhaAssinatura } from "@/features/assinatura/types/assinatura.types";
import { formatCurrencyFromCents } from "@/shared/utils/currency";
import { formatDate } from "@/shared/utils/date";

/**
 * O lembrete da mensalidade — uma vez por dia, enquanto houver fatura aberta.
 *
 * A cobrança pelo WhatsApp chega fora do sistema e pode ser lida dias depois.
 * O lembrete chega no lugar onde a pessoa já está trabalhando, e com o botão
 * que leva direto ao Pix: entre "lembrei que tenho de pagar" e "paguei" fica
 * um clique, não uma busca por Configurações › Faturas.
 *
 * Quando ele NÃO aparece, e por quê:
 *   • para o vendedor — ele não abre Faturas e não paga a conta da loja;
 *     lembrá-lo seria pedir algo que ele não consegue fazer;
 *   • com o débito automático ativo — quem cobra é o cartão;
 *   • antes do tour e das novidades — três janelas disputando a mesma tela
 *     fazem a de baixo parecer defeito. Fechadas as outras, ele aparece na
 *     próxima troca de tela;
 *   • na própria tela de faturas — a pessoa já está onde ele levaria;
 *   • mais de uma vez no mesmo dia — "Lembrar amanhã" vale até amanhã, e
 *     fechar no X também conta como visto. Insistir a cada tela vira ruído, e
 *     ruído o olho aprende a fechar sem ler.
 *
 * Fatura com comprovante enviado (AGUARDANDO_CONFIRMACAO) não conta: ali a
 * pessoa já fez a parte dela e quem deve uma resposta somos nós.
 */

/** Hoje no fuso do aparelho, "AAAA-MM-DD" — é o dia de quem está na loja. */
const hoje = () => new Date().toLocaleDateString("en-CA");

const chave = (usuarioId: string) => `codeex-flow-lembrete-fatura-${usuarioId}`;

/** Dias de `de` até `para`, as duas como datas puras. */
const diasEntre = (de: string, para: string) =>
  Math.round((Date.parse(`${para.slice(0, 10)}T00:00:00Z`) - Date.parse(`${de.slice(0, 10)}T00:00:00Z`)) / 86_400_000);

/** As telas onde o lembrete não faz sentido: ele levaria para elas mesmas. */
const ROTAS_DE_PAGAMENTO = ["/configuracoes/faturas", "/checkout"];

const LembreteFatura = () => {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const [assinatura, setAssinatura] = useState<MinhaAssinatura | null>(null);
  const [aberto, setAberto] = useState(false);

  const gestor = ehGestor(user);

  useEffect(() => {
    if (!user?.id || !gestor || aberto) return;
    if (ROTAS_DE_PAGAMENTO.some((r) => pathname.startsWith(r))) return;
    if (localStorage.getItem(chave(user.id)) === hoje()) return;
    if (!jaViuTour(user.id) || !jaViuNovidades(user.id)) return;

    let cancelado = false;

    /* A espera deixa a tela montar antes: um modal por cima de uma tela que
       ainda está desenhando parece erro de carregamento. */
    const t = setTimeout(async () => {
      try {
        const minha = await AssinaturaService.minha();

        if (cancelado) return;
        if (minha.pagamentoAutomatico?.ativo) return;
        if (!minha.faturas.some(ehPagavel)) return;

        setAssinatura(minha);
        setAberto(true);
      } catch {
        /* Sem resposta da API, sem lembrete: nada aqui pode atrapalhar o uso. */
      }
    }, 1200);

    return () => {
      cancelado = true;
      clearTimeout(t);
    };
    // `pathname` está aqui de propósito: é a troca de tela que dá a próxima
    // chance a quem fechou as novidades nesta mesma sessão.
  }, [user?.id, gestor, pathname, aberto]);

  const marcarVisto = () => {
    if (user?.id) localStorage.setItem(chave(user.id), hoje());
  };

  const fechar = () => {
    marcarVisto();
    setAberto(false);
  };

  if (!aberto || !assinatura) return null;

  const abertas = assinatura.faturas
    .filter(ehPagavel)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  /* A mais antiga primeiro: é ela que bloqueia, e é ela que o débito e o
     webhook quitam primeiro. */
  const fatura: Fatura = abertas[0];
  const total = abertas.reduce((soma, f) => soma + f.valorCentavos, 0);

  const dias = diasEntre(hoje(), fatura.vencimento);
  const vencida = dias < 0;

  const prazo = vencida
    ? `Vencida há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? "" : "s"}`
    : dias === 0
      ? "Vence hoje"
      : dias === 1
        ? "Vence amanhã"
        : `Vence em ${dias} dias`;

  const pagar = () => {
    marcarVisto();
    setAberto(false);
    navigate(`/configuracoes/faturas?pagar=${encodeURIComponent(fatura.id)}`);
  };

  const automatico = assinatura.pagamentoAutomatico;

  return (
    <Modal
      open
      onClose={fechar}
      title="Sua mensalidade do CodeEx Flow"
      subtitle={vencida ? "Regularize para não ter o acesso bloqueado" : "Pague em um minuto, pelo Pix"}
      size="sm"
      accent={vencida ? "rgb(var(--danger))" : undefined}
    >
      <div className="flex flex-col gap-4">
        {/* ---------- A fatura ---------- */}
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-fg/[0.08] bg-fg/[0.03] px-5 py-5 text-center">
          <span className={`grid h-12 w-12 place-items-center rounded-2xl ${vencida ? "bg-danger/[0.12] text-danger" : "bg-accent/[0.12] text-accent-soft"}`}>
            {vencida ? <AlertTriangle size={22} /> : <Receipt size={22} />}
          </span>

          <p className="mt-1 text-[30px] font-semibold leading-none tabular-nums text-ink">
            {formatCurrencyFromCents(fatura.valorCentavos)}
          </p>

          <p className={`flex items-center gap-1.5 text-[13px] ${vencida ? "text-danger" : "text-mist"}`}>
            <CalendarClock size={14} />
            {prazo} · {formatDate(fatura.vencimento)}
          </p>

          <p className="text-[12px] text-faint">
            {[fatura.planoNome ?? assinatura.plano?.nome, `competência ${competenciaBr(fatura.competencia)}`].filter(Boolean).join(" · ")}
          </p>
        </div>

        {abertas.length > 1 && (
          <p className="rounded-xl border border-warning/25 bg-warning/[0.08] px-4 py-2.5 text-[12.5px] text-warning">
            Você tem {abertas.length} faturas em aberto, somando {formatCurrencyFromCents(total)}.
          </p>
        )}

        {/* O débito no cartão é a saída para nunca mais ver este lembrete — vale
            dizer isso aqui, onde o incômodo acontece. */}
        {automatico?.disponivel && !automatico.ativo && (
          <p className="flex items-start gap-2 text-[12px] leading-relaxed text-mist">
            <CreditCard size={14} className="mt-0.5 shrink-0 text-accent-soft" />
            Prefere não se preocupar? Ative o débito automático no cartão em Faturas: cobramos sozinho todo dia 10.
          </p>
        )}

        {/* ---------- Ações ---------- */}
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            onClick={pagar}
            className="focus-ring flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-[14px] font-medium text-white transition hover:brightness-110"
          >
            Pagar agora <ArrowRight size={16} />
          </button>
          <button
            type="button"
            onClick={fechar}
            className="focus-ring flex-1 cursor-pointer rounded-xl border border-fg/[0.1] px-4 py-3 text-[13px] text-mist transition hover:bg-fg/[0.04] hover:text-ink"
          >
            Lembrar amanhã
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default LembreteFatura;
