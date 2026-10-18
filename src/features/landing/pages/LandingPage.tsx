import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShoppingCart, Package, Users, Wallet, BarChart3, Bell, Smartphone, ShieldCheck,
  QrCode, ArrowRight, Zap, Palette, WifiOff, Store, UserRound, MessageCircle,
  Target, Truck, Sparkles, Factory,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import RedeAnimada from "@/features/landing/components/RedeAnimada";
import { useReveal } from "@/features/landing/hooks/useReveal";
import useCatalogo from "@/shared/plano/catalogo.store";
import { CICLO_LABEL } from "@/features/assinatura/types/assinatura.types";
import { formatCurrencyFromCents } from "@/shared/utils/currency";
import { formatNumber } from "@/shared/utils/format";
import { useContatoSuporte, linkWhatsapp } from "@/shared/suporte/useContatoSuporte";

/* O número vem do painel da plataforma — ver `useContatoSuporte`. */

/* ---------------------------------------------------------------- */
/* Conteúdo                                                          */
/* ---------------------------------------------------------------- */

const MODULOS = [
  { icon: <ShoppingCart size={20} />, titulo: "Ponto de venda", texto: "Abra a nota, lance os produtos e receba — inclusive em partes. O saldo pendente fica visível até o último centavo." },
  { icon: <QrCode size={20} />, titulo: "Pix com QR na nota", texto: "O código é gerado no próprio sistema, com a sua chave. Funciona sem internet e sai junto da nota." },
  { icon: <Package size={20} />, titulo: "Estoque", texto: "Entradas, saídas e alerta de estoque baixo. O que está acabando aparece antes de faltar." },
  { icon: <Users size={20} />, titulo: "Clientes", texto: "Cadastro completo com histórico de compras, contato e o que cada um ainda deve." },
  { icon: <Wallet size={20} />, titulo: "Financeiro", texto: "Notas a receber e fluxo de caixa no mesmo lugar. Entradas, saídas e saldo do dia sem planilha." },
  { icon: <Store size={20} />, titulo: "Vendedores", texto: "Cada funcionário com login próprio. Ele vê só as próprias notas; você vê tudo e quem vendeu o quê." },
  { icon: <BarChart3 size={20} />, titulo: "Relatórios", texto: "Faturamento por período, prontos para imprimir em A4 — do jeito que o contador pede." },
  { icon: <Bell size={20} />, titulo: "Notificações da equipe", texto: "Cadastrou produto, fechou venda, deu baixa no caixa: chega na hora, no seu aparelho." },
];

const DIFERENCIAIS = [
  { icon: <Smartphone size={18} />, titulo: "Funciona no celular", texto: "Instale como aplicativo. Tela pensada para o balcão, não o desktop encolhido." },
  { icon: <WifiOff size={18} />, titulo: "Abre sem internet", texto: "Wi-fi de loja cai. O sistema continua abrindo com os últimos dados." },
  { icon: <Zap size={18} />, titulo: "Começa hoje", texto: "Escolhe o plano, cadastra a empresa e já entra. Sem instalação, sem técnico." },
  { icon: <Palette size={18} />, titulo: "Do seu jeito", texto: "Seis temas e nove cores de destaque, incluindo preto absoluto para telas OLED." },
];

const PASSOS = [
  { n: "1", titulo: "Escolha o plano", texto: "Do essencial ao completo. Você troca depois pagando só a diferença." },
  { n: "2", titulo: "Cadastre a empresa", texto: "Alguns dados e você já entra no sistema — o acesso é criado na hora." },
  { n: "3", titulo: "Pague via Pix", texto: "QR na tela, você envia o comprovante e a gente libera o acesso completo." },
];

/* ---------------------------------------------------------------- */
/* Peças                                                             */
/* ---------------------------------------------------------------- */

const Kicker = ({ children }: { children: React.ReactNode }) => (
  <span className="mb-4 inline-block rounded-full border border-accent/30 px-3 py-1 text-[11.5px] font-semibold uppercase tracking-[0.16em] text-accent-soft">{children}</span>
);

const Titulo = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-[clamp(1.8rem,5.4vw,3rem)] font-bold leading-[1.06] tracking-tight text-ink">{children}</h2>
);

/** Gradiente de destaque no texto — o mesmo em toda a página. */
const Grad = ({ children }: { children: React.ReactNode }) => (
  <span className="bg-gradient-to-r from-accent via-accent-soft to-accent-strong bg-clip-text text-transparent">{children}</span>
);

/* ---------------------------------------------------------------- */
/* Página                                                            */
/* ---------------------------------------------------------------- */

const LandingPage = () => {
  const navigate = useNavigate();

  /* Os preços vêm do catálogo compartilhado — carregado no boot, então a
     seção de planos já nasce com o cartão em vez de com "Carregando planos…". */
  const planos = useCatalogo((s) => s.planos);
  const carregarCatalogo = useCatalogo((s) => s.carregar);

  const [grudado, setGrudado] = useState(false);

  /* Cravar o número no código já colocou um telefone pessoal no ar. */
  const { whatsapp } = useContatoSuporte();
  const zap = (mensagem: string) => linkWhatsapp(whatsapp, mensagem);

  /* Os preços vêm da API. Fixá-los aqui garantiria que um dia ficariam
     diferentes do que o cliente paga de verdade. */
  useEffect(() => {
    carregarCatalogo();
  }, [carregarCatalogo]);

  useEffect(() => {
    const aoRolar = () => setGrudado(window.scrollY > 8);

    window.addEventListener("scroll", aoRolar, { passive: true });
    aoRolar();

    return () => window.removeEventListener("scroll", aoRolar);
  }, []);

  // Reobserva quando os planos chegam: eles nascem depois da primeira pintura.
  useReveal(planos.length);

  const menorPreco = planos.length ? Math.min(...planos.map((p) => p.precoCentavos)) : null;

  const limite = (v: number | null) => (v === null ? "Ilimitado" : formatNumber(v));

  /*
   * Três cartões, não seis.
   *
   * A escada tem seis degraus, e mostrar todos na página inicial devolve o
   * problema que o diagnóstico existe para resolver: quem vende sozinho olha
   * seis preços e conclui que o sistema é grande demais para ele. Aqui ficam
   * as três âncoras — o mais barato, o mais escolhido e o teto — que é o que
   * comunica a faixa. O resto está a um clique, em "ver todos os planos".
   */
  const vitrine = (() => {
    if (planos.length <= 3) return planos;

    const ordenados = [...planos].sort((a, b) => a.precoCentavos - b.precoCentavos);
    const destaque = ordenados.find((p) => p.destaque) ?? ordenados[Math.floor(ordenados.length / 2)];

    const escolhidos = [ordenados[0], destaque, ordenados[ordenados.length - 1]];

    // Se o destaque for o primeiro ou o último, a lista repetiria um cartão.
    return escolhidos.filter((p, i) => escolhidos.findIndex((o) => o.id === p.id) === i);
  })();

  return (
    /* `vitrine` fixa a identidade da marca aqui dentro: o tema que o cliente
       escolheu em Aparência vale no produto, não na propaganda dele. */
    <div className="vitrine relative min-h-[100dvh] overflow-x-hidden bg-canvas text-ink">
      <RedeAnimada />

      {/* Brilhos de ambiente */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0" style={{ opacity: "var(--fx-aurora, 1)" }}>
        <div className="absolute -right-32 -top-40 h-[520px] w-[520px] rounded-full bg-accent opacity-[0.14] blur-[140px]" />
        <div className="absolute -bottom-40 -left-32 h-[520px] w-[520px] rounded-full opacity-[0.12] blur-[140px]" style={{ background: "rgb(var(--aurora-2))" }} />
      </div>

      {/* ===================== HEADER ===================== */}
      <header
        className={`safe-top sticky top-0 z-40 flex items-center gap-4 px-[clamp(16px,4vw,42px)] py-3 transition-all ${
          grudado ? "border-b border-fg/[0.08] bg-canvas/70 backdrop-blur-xl" : "border-b border-transparent"
        }`}
      >
        <a href="#topo" className="mr-auto flex items-center gap-2.5">
          <img src="/logo.png" alt="" width={36} height={36} className="h-9 w-9 rounded-xl" />
          <span className="text-[17px] font-bold tracking-tight">
            CodeEx <span className="text-accent-soft">Flow</span>
          </span>
        </a>

        <nav aria-label="Seções" className="hidden gap-7 text-[13.5px] text-mist md:flex">
          {[
            ["#recursos", "Recursos"],
            ["#planos", "Planos"],
            ["#como-funciona", "Como funciona"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="py-1 transition-colors hover:text-ink">
              {label}
            </a>
          ))}
        </nav>

        <button type="button" onClick={() => navigate("/login")} className="focus-ring hidden rounded-xl px-3.5 py-2 text-[13px] text-mist transition-colors hover:text-ink sm:block">
          Entrar
        </button>

        <button
          type="button"
          onClick={() => navigate("/planos")}
          className="focus-ring rounded-xl bg-accent px-4 py-2 text-[13px] text-white shadow-[0_10px_28px_-10px_rgb(var(--accent))] transition-all hover:brightness-110 active:scale-[0.98]"
        >
          Criar conta
        </button>
      </header>

      <main id="topo" className="relative z-10">
        {/* ===================== HERO ===================== */}
        <section className="mx-auto max-w-4xl px-[clamp(18px,5vw,44px)] pb-[clamp(30px,6vw,60px)] pt-[clamp(50px,10vw,110px)] text-center">
          <span data-reveal className="mb-6 inline-flex items-center gap-2 rounded-full border border-fg/[0.09] bg-fg/[0.03] px-4 py-1.5 text-[12.5px] text-mist">
            <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-accent shadow-[0_0_10px_rgb(var(--accent))]" />
            CodEx Solutions · Sistema de gestão
          </span>

          <h1 data-reveal className="text-[clamp(2.4rem,8.5vw,4.4rem)] font-extrabold leading-[1.02] tracking-tight">
            Sua loja inteira
            <br />
            <Grad>na palma da mão.</Grad>
          </h1>

          <p data-reveal className="mx-auto mt-6 max-w-[54ch] text-[clamp(1rem,2.6vw,1.18rem)] font-light leading-relaxed text-mist">
            <b className="font-medium text-ink">PDV, estoque, clientes e financeiro</b> num sistema só — que abre no celular como
            aplicativo, funciona sem internet e coloca sua equipe pra vender com login próprio.
          </p>

          <div data-reveal className="mt-8 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/planos")}
              className="focus-ring group inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 text-[15px] text-white shadow-[0_12px_32px_-10px_rgb(var(--accent))] transition-all hover:brightness-110 active:scale-[0.99]"
            >
              Ver planos e preços
              <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />
            </button>

            <a
              href={zap("Olá! Vim pelo site do CodeEx Flow e quero saber mais.")}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring inline-flex items-center gap-2 rounded-full border border-fg/[0.1] bg-fg/[0.03] px-7 py-3.5 text-[15px] text-ink transition-all hover:border-accent/40"
            >
              Falar no WhatsApp
            </a>
          </div>

          {menorPreco !== null && (
            <p data-reveal className="mt-6 text-[13.5px] text-faint">
              Planos a partir de <b className="font-semibold text-accent-soft">{formatCurrencyFromCents(menorPreco)}/mês</b> · sem fidelidade
            </p>
          )}
        </section>

        {/* ===================== DIFERENCIAIS ===================== */}
        <section className="mx-auto grid max-w-6xl grid-cols-2 gap-3 px-[clamp(18px,5vw,44px)] pb-6 md:grid-cols-4">
          {DIFERENCIAIS.map((d) => (
            <div key={d.titulo} data-reveal className="rounded-2xl border border-fg/[0.08] bg-fg/[0.02] p-5 backdrop-blur-sm">
              <span className="mb-3 inline-grid h-10 w-10 place-items-center rounded-xl border border-accent/20 bg-accent/[0.08] text-accent-soft">{d.icon}</span>
              <h3 className="text-[15px] font-semibold text-ink">{d.titulo}</h3>
              <p className="mt-1 text-[12.5px] font-light leading-relaxed text-mist">{d.texto}</p>
            </div>
          ))}
        </section>

        {/* ===================== RECURSOS ===================== */}
        <section id="recursos" className="mx-auto max-w-6xl px-[clamp(18px,5vw,44px)] py-[clamp(56px,9vw,100px)]">
          <header className="mx-auto mb-[clamp(32px,5vw,52px)] max-w-[620px] text-center">
            <div data-reveal>
              <Kicker>O que tem dentro</Kicker>
            </div>
            <div data-reveal>
              <Titulo>
                Tudo que a sua loja faz, <Grad>num lugar só</Grad>
              </Titulo>
            </div>
            <p data-reveal className="mt-3 text-[clamp(1rem,2.4vw,1.1rem)] font-light text-mist">
              Sem integrar cinco sistemas. Sem planilha paralela.
            </p>
          </header>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MODULOS.map((m) => (
              <article key={m.titulo} data-reveal className="rounded-2xl border border-fg/[0.08] bg-fg/[0.02] p-5 backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-accent/30">
                <span className="mb-3.5 inline-grid h-11 w-11 place-items-center rounded-xl border border-accent/20 bg-accent/[0.08] text-accent-soft">{m.icon}</span>
                <h3 className="text-[15.5px] font-semibold text-ink">{m.titulo}</h3>
                <p className="mt-1.5 text-[13px] font-light leading-relaxed text-mist">{m.texto}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ===================== PLANOS ===================== */}
        <section id="planos" className="mx-auto max-w-6xl px-[clamp(18px,5vw,44px)] py-[clamp(56px,9vw,100px)]">
          <header className="mx-auto mb-[clamp(32px,5vw,52px)] max-w-[620px] text-center">
            <div data-reveal>
              <Kicker>Planos</Kicker>
            </div>
            <div data-reveal>
              <Titulo>
                {planos.length === 1 ? (
                  <>
                    Um plano, o sistema <Grad>inteiro</Grad>
                  </>
                ) : (
                  <>
                    Escolha o tamanho da sua <Grad>operação</Grad>
                  </>
                )}
              </Titulo>
            </div>
            <p data-reveal className="mt-3 text-[clamp(1rem,2.4vw,1.1rem)] font-light text-mist">
              {planos.length === 1
                ? "Sem pacote para destravar depois. Sem fidelidade."
                : "Trocou de plano depois? Você paga só a diferença."}
            </p>
          </header>

          {planos.length === 0 ? (
            <p className="text-center text-[13px] text-faint">Carregando planos…</p>
          ) : (
            /* Com um cartão só, três colunas deixariam ele encolhido num canto
               da fileira; a largura travada centraliza sem esticar o cartão. */
            <div
              className={
                vitrine.length === 1
                  ? "mx-auto grid max-w-sm grid-cols-1 items-stretch gap-5"
                  : "mx-auto grid max-w-5xl grid-cols-1 items-stretch gap-5 md:grid-cols-3"
              }
            >
              {vitrine.map((p) => (
                <article
                  key={p.id}
                  data-reveal
                  className={`relative flex flex-col rounded-3xl border p-7 backdrop-blur-sm transition-all hover:-translate-y-1 ${
                    p.destaque
                      ? "border-accent/45 bg-gradient-to-b from-accent/[0.08] to-fg/[0.02] shadow-[0_24px_60px_-30px_rgb(var(--accent))]"
                      : "border-fg/[0.08] bg-fg/[0.02]"
                  }`}
                >
                  {p.destaque && (
                    <span className="absolute -top-3 left-7 rounded-full bg-accent px-3 py-1 text-[11px] font-bold text-white shadow-[0_6px_16px_-4px_rgb(var(--accent))]">Mais escolhido</span>
                  )}

                  <h3 className="text-[22px] font-bold text-ink">{p.nome}</h3>

                  <p className="mt-3 flex items-baseline gap-1">
                    <span className="text-[clamp(2.2rem,7vw,2.8rem)] font-extrabold leading-none tracking-tight text-ink">{formatCurrencyFromCents(p.precoCentavos)}</span>
                    <span className="text-[13px] text-faint">{CICLO_LABEL[p.ciclo]}</span>
                  </p>

                  <p className="mt-3 min-h-[42px] text-[13.5px] font-light leading-relaxed text-mist">{p.descricao}</p>

                  <ul className="mt-5 grid gap-2.5 border-t border-fg/[0.06] pt-5">
                    {/* Cada linha leva o ícone do que ela é. Um check repetido
                        sete vezes vira textura: o olho para de ler. */}
                    {(
                      [
                        [`${limite(p.limiteUsuarios)} ${p.limiteUsuarios === 1 ? "usuário" : "usuários"}`, true, Users],
                        [`${limite(p.limiteClientes)} clientes`, true, UserRound],
                        [`${limite(p.limiteProdutos)} produtos`, true, Package],
                        [`${limite(p.limitePedidosMes)} vendas por mês`, true, ShoppingCart],
                        ["Módulo financeiro", Boolean(p.recursos?.financeiro), Wallet],
                        // Produção com equipe, CRM e Correios são o que separa
                        // um degrau do outro hoje. Fora desta lista, os três
                        // cartões pareciam o mesmo plano com preços diferentes.
                        ["Produção, equipe e ponto", Boolean(p.recursos?.producao && p.recursos?.funcionarios), Factory],
                        ["CRM com funil de vendas", Boolean(p.recursos?.crm), Target],
                        ["Correios integrado", Boolean(p.recursos?.correios), Truck],
                        ["Relatórios gerenciais", Boolean(p.recursos?.relatorios), BarChart3],
                        ["Suporte por WhatsApp", Boolean(p.recursos?.suporteWhatsapp), MessageCircle],
                      ] as [string, boolean, LucideIcon][]
                    ).map(([texto, tem, Icone]) => (
                      <li key={texto} className={`flex items-start gap-2.5 text-[13.5px] ${tem ? "text-ink" : "text-muted line-through decoration-fg/20"}`}>
                        <span className={`mt-px grid h-[22px] w-[22px] shrink-0 place-items-center rounded-lg ${tem ? "bg-accent/[0.14] text-accent-soft ring-1 ring-inset ring-accent/25" : "bg-fg/[0.04] text-muted"}`}>
                          <Icone size={12} />
                        </span>
                        {texto}
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => navigate(`/cadastro?plano=${encodeURIComponent(p.codigo)}`)}
                    className={`focus-ring mt-7 w-full rounded-full py-3 text-[14px] transition-all active:scale-[0.99] ${
                      p.destaque ? "bg-accent text-white shadow-[0_10px_28px_-10px_rgb(var(--accent))] hover:brightness-110" : "border border-fg/[0.12] text-ink hover:border-accent/40"
                    }`}
                  >
                    Começar com {p.nome}
                  </button>
                </article>
              ))}
            </div>
          )}

          {/* Os outros degraus e o caminho curto para quem não quer escolher.
              Fica embaixo dos cartões de propósito: quem já se decidiu num
              deles não precisa ler isto. */}
          {planos.length > vitrine.length && (
            <div data-reveal className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => navigate("/cadastro")}
                className="focus-ring group inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-[14px] text-white shadow-[0_10px_28px_-10px_rgb(var(--accent))] transition-all hover:brightness-110 active:scale-[0.99]"
              >
                <Sparkles size={15} />
                Descobrir meu plano em 3 perguntas
              </button>

              <button
                type="button"
                onClick={() => navigate("/planos")}
                className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-fg/[0.12] px-5 py-3 text-[14px] text-ink transition-all hover:border-accent/40"
              >
                Ver os {planos.length} planos
              </button>
            </div>
          )}
        </section>

        {/* ===================== COMO FUNCIONA ===================== */}
        <section id="como-funciona" className="mx-auto max-w-6xl px-[clamp(18px,5vw,44px)] py-[clamp(56px,9vw,100px)]">
          <header className="mx-auto mb-[clamp(32px,5vw,52px)] max-w-[620px] text-center">
            <div data-reveal>
              <Kicker>Como funciona</Kicker>
            </div>
            <div data-reveal>
              <Titulo>
                No ar em <Grad>três passos</Grad>
              </Titulo>
            </div>
          </header>

          <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
            {PASSOS.map((p) => (
              <div key={p.n} data-reveal className="rounded-2xl border border-fg/[0.08] bg-fg/[0.02] p-6 backdrop-blur-sm">
                <span className="grid h-10 w-10 place-items-center rounded-full border border-accent/30 bg-accent/[0.1] text-[15px] font-bold text-accent-soft">{p.n}</span>
                <h3 className="mt-4 text-[16px] font-semibold text-ink">{p.titulo}</h3>
                <p className="mt-1.5 text-[13px] font-light leading-relaxed text-mist">{p.texto}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ===================== CTA FINAL ===================== */}
        <section className="px-[clamp(18px,5vw,44px)] pb-[clamp(50px,8vw,90px)] pt-[clamp(30px,6vw,60px)]">
          <div
            data-reveal
            className="mx-auto max-w-3xl rounded-[30px] border border-accent/25 p-[clamp(38px,6vw,64px)] text-center backdrop-blur-md"
            style={{ background: "radial-gradient(90% 120% at 50% 0%, rgb(var(--accent) / 0.1), transparent 60%), rgb(var(--fg) / 0.02)" }}
          >
            <span className="mb-5 inline-grid h-12 w-12 place-items-center rounded-2xl border border-accent/25 bg-accent/[0.1] text-accent-soft">
              <ShieldCheck size={22} />
            </span>

            <h2 className="text-[clamp(1.7rem,5vw,2.4rem)] font-extrabold tracking-tight text-ink">Ainda com dúvida?</h2>
            <p className="mx-auto mt-3 max-w-[46ch] text-[clamp(1rem,2.4vw,1.08rem)] font-light text-mist">
              Manda uma mensagem que a gente te ajuda a escolher o plano certo para o tamanho da sua loja.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <a
                href={zap("Olá! Quero ajuda para escolher um plano do CodeEx Flow.")}
                target="_blank"
                rel="noopener noreferrer"
                className="focus-ring inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 text-[15px] text-white shadow-[0_12px_32px_-10px_rgb(var(--accent))] transition-all hover:brightness-110"
              >
                Falar no WhatsApp
              </a>

              <button
                type="button"
                onClick={() => navigate("/planos")}
                className="focus-ring inline-flex items-center gap-2 rounded-full border border-fg/[0.12] px-7 py-3.5 text-[15px] text-ink transition-all hover:border-accent/40"
              >
                Ver planos
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* ===================== RODAPÉ ===================== */}
      <footer className="relative z-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-fg/[0.08] px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-7 text-mist">
        <span className="inline-flex items-center gap-2">
          <img src="/logo.png" alt="" width={18} height={18} className="rounded" />
          <span className="text-[14px] font-semibold text-ink">
            CodeEx <span className="text-accent-soft">Flow</span>
          </span>
        </span>

        <button type="button" onClick={() => navigate("/login")} className="focus-ring rounded text-[13px] transition-colors hover:text-accent-soft">
          Entrar no sistema
        </button>

        <span className="text-[12px] text-muted">© {new Date().getFullYear()} CodEx Solutions</span>
      </footer>
    </div>
  );
};

export default LandingPage;
