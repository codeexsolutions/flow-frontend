import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  LifeBuoy, MessageCircle, Mail, ChevronDown, ShieldCheck, Building2, Store,
  Loader2, Receipt, Users, Wallet, Smartphone, Search, HelpCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { PageScreen } from "@/shared/ui/PageShell";
import { useContatoSuporte, linkWhatsapp } from "@/shared/suporte/useContatoSuporte";
import { useAlert } from "@/shared/ui/Alert";
import useAuth from "@/features/auth/store/auth.store";
import sysgrafix from "@/shared/api/sysgrafix";
import RedeAnimada from "@/features/landing/components/RedeAnimada";

/**
 * Ajuda e suporte.
 *
 * Sanfona em vez de tudo aberto. A versão anterior despejava quatro seções de
 * uma vez e obrigava a rolar para achar o telefone — que é o que 90% das
 * pessoas vem buscar. Fechado, cabe tudo numa tela; quem quer detalhe abre.
 *
 * A animação é a mesma da entrada do sistema e do 404: opacidade e um
 * deslocamento curto, com mola suave. Sem escala — escala em bloco de texto
 * borra a letra enquanto anima.
 */

type Secao = { id: string; icone: LucideIcon; titulo: string; resumo: string };

const SECOES: Secao[] = [
  { id: "produto", icone: Store, titulo: "O que é o CodeEx Flow", resumo: "Para que serve e para quem" },
  { id: "privacidade", icone: ShieldCheck, titulo: "Privacidade dos seus dados", resumo: "O que fazemos e o que não fazemos" },
  { id: "empresa", icone: Building2, titulo: "Quem mantém o sistema", resumo: "CodEx Solutions" },
];

/**
 * Perguntas frequentes.
 *
 * Escritas a partir do que chega no WhatsApp do suporte — não do que seria
 * bonito documentar. Cada resposta termina no que a pessoa faz a seguir, e
 * não numa definição: quem abre o FAQ está travado, não estudando.
 *
 * Agrupadas por assunto porque a lista corrida de vinte perguntas obriga a
 * ler todas para achar a sua.
 */
type Pergunta = { p: string; r: React.ReactNode };
type GrupoFaq = { id: string; titulo: string; icone: LucideIcon; itens: Pergunta[] };

const FAQ: GrupoFaq[] = [
  {
    id: "vendas",
    titulo: "Vendas e notas",
    icone: Receipt,
    itens: [
      {
        p: "Errei uma nota. Como desfaço?",
        r: <>Abra a nota e use a <b className="text-ink">lixeira no topo</b>: ela <b className="text-ink">cancela</b>, não apaga. A nota sai das vendas ativas e continua no histórico, com itens e valores — é o que permite explicar depois o que aconteceu. Nota já paga não cancela por aqui: estorne o pagamento no financeiro primeiro.</>,
      },
      {
        p: "O cliente pagou só uma parte. Dá para registrar?",
        r: <>Dá. No painel de pagamento, digite o valor recebido em vez de usar o "Tudo". A nota fica com o saldo em aberto à vista, e você lança o restante quando ele pagar — quantas vezes precisar.</>,
      },
      {
        p: "Consigo mudar o preço de um item só nesta venda?",
        r: <>Sim. O valor unitário na linha é editável e vale só para aquela nota; o cadastro do produto não muda. Quando o preço difere do cadastrado, o valor original aparece riscado ao lado — para você conferir o desconto que deu.</>,
      },
      {
        p: "Orçamento vira venda sozinho?",
        r: <>Não, e é de propósito. Orçamento é proposta: não baixa estoque e não gera cobrança. Quando o cliente aprovar, abra a venda no PDV. Marcar o orçamento como aprovado serve para você acompanhar, não para faturar.</>,
      },
      {
        p: "Como mando a nota para o cliente?",
        r: <>Botão <b className="text-ink">Baixar</b> no rodapé da nota: sai em imagem (PNG) ou PDF, com a sua marca e o papel de parede que você configurou. No celular, o próprio menu do sistema abre o compartilhamento — dá para mandar direto no WhatsApp.</>,
      },
    ],
  },
  {
    id: "acesso",
    titulo: "Equipe e acesso",
    icone: Users,
    itens: [
      {
        p: "Meu funcionário precisa ver o financeiro?",
        r: <>Você decide, por pessoa. Em <b className="text-ink">Funcionários</b>, cada funcionário tem as áreas que enxerga marcadas uma a uma — dá para liberar o PDV e as produções sem abrir o caixa. Quem não tem a área marcada não acessa nem digitando o endereço.</>,
      },
      {
        p: "Esqueci minha senha. E agora?",
        r: <>Se você é o dono da conta, fale com o suporte pelos canais abaixo. Se é funcionário, quem redefine é o dono da empresa, em Funcionários. Ninguém — nem nós — consegue ler sua senha: ela é guardada cifrada.</>,
      },
      {
        p: "Posso usar em dois computadores ao mesmo tempo?",
        r: <>Pode, e no celular junto. O que limita é a quantidade de usuários do seu plano, não de aparelhos. As telas se atualizam entre si: uma venda lançada no caixa aparece na hora no computador do escritório.</>,
      },
    ],
  },
  {
    id: "plano",
    titulo: "Plano e faturas",
    icone: Wallet,
    itens: [
      {
        p: "Como pago a mensalidade?",
        r: <>Por Pix, em <b className="text-ink">Configurações › Faturas</b>. Pague pelo QR Code ou copie o código, e depois toque em "Já paguei" para nos avisar. A liberação é feita depois que confirmamos — normalmente em algumas horas.</>,
      },
      {
        p: "Posso trocar de plano quando quiser?",
        r: <>Uma vez por ciclo. No upgrade, geramos uma fatura só com a diferença; no downgrade não há cobrança e o preço menor vale no próximo ciclo. O limite de uma troca existe porque cada troca reprecifica a fatura em aberto — trocar e destrocar deixaria a cobrança sem pé nem cabeça. Precisa mudar antes do prazo? Fale com a gente.</>,
      },
      {
        p: "Bati o limite de vendas do mês. O que acontece?",
        r: <>Você continua vendendo. O sistema avisa quando você chega perto do teto e de novo quando passa, mas <b className="text-ink">não trava o balcão</b> — travar uma venda com cliente esperando não é aceitável. O caminho é subir de plano em Faturas.</>,
      },
      {
        p: "Se eu atrasar, perco meus dados?",
        r: <>Não. O acesso é suspenso até a regularização, mas nada é apagado: cadastros, vendas e financeiro continuam lá e voltam exatamente como estavam assim que a fatura for confirmada.</>,
      },
    ],
  },
  {
    id: "tecnico",
    titulo: "No dia a dia",
    icone: Smartphone,
    itens: [
      {
        p: "A internet da loja caiu. Paro de vender?",
        r: <>O sistema continua abrindo e você segue consultando o que já tinha carregado. O que depende da internet é gravar — assim que a conexão voltar, o que ficou pendente sobe. Mesmo assim, confira as últimas vendas quando voltar.</>,
      },
      {
        p: "Dá para instalar como aplicativo?",
        r: <>Dá, sem loja de aplicativos. No celular, use "Adicionar à tela de início" no menu do navegador. No computador, o ícone de instalar aparece na barra de endereço. Instalado, ele abre em tela cheia e carrega mais rápido.</>,
      },
      {
        p: "Posso deixar o sistema com a cara da minha loja?",
        r: <>Pode. Em <b className="text-ink">Configurações › Aparência</b> você escolhe entre seis temas e nove cores de destaque. E em Minha empresa dá para subir a logo e um papel de parede que aparece nas notas que o cliente recebe.</>,
      },
    ],
  },
];

const AjudaPage = () => {
  const { whatsapp, email } = useContatoSuporte();
  const reduzir = useReducedMotion();
  const alerta = useAlert();

  const { user } = useAuth();
  const ehMaster = Boolean(user?.root);

  /* Uma por vez: duas abertas voltariam ao problema de rolar para achar. */
  const [aberta, setAberta] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);

  /* FAQ: pergunta aberta e filtro de busca. */
  const [perguntaAberta, setPerguntaAberta] = useState<string | null>(null);
  const [buscaFaq, setBuscaFaq] = useState("");

  /*
   * Filtra pela pergunta, não pela resposta.
   *
   * A resposta é JSX (tem negrito no meio) e não vira texto sem gambiarra;
   * mais importante, buscar dentro dela traz resultados que não parecem ter
   * relação com o termo — a pessoa digita "senha" e recebe uma pergunta sobre
   * plano porque a palavra aparece no meio do parágrafo.
   */
  const termoFaq = buscaFaq.trim().toLowerCase();

  const faqFiltrado = termoFaq
    ? FAQ.map((g) => ({ ...g, itens: g.itens.filter((i) => i.p.toLowerCase().includes(termoFaq)) })).filter((g) => g.itens.length > 0)
    : FAQ;

  const totalPerguntas = FAQ.reduce((acc, g) => acc + g.itens.length, 0);

  const entra = (atraso: number) =>
    reduzir ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { delay: atraso, duration: 0.45, ease: [0.22, 0.61, 0.36, 1] as const } };

  const baixarDados = async () => {
    setBaixando(true);

    try {
      const r = await sysgrafix.get("/exportacao", { responseType: "blob" });

      const url = URL.createObjectURL(r.data as Blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `codeex-flow-dados-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();

      URL.revokeObjectURL(url);
      alerta.success("Cópia gerada!", "O arquivo foi baixado.");
    } catch {
      alerta.error("Não foi possível exportar", "Tente de novo em instantes.");
    } finally {
      setBaixando(false);
    }
  };

  return (
    <PageScreen icon={<LifeBuoy className="h-5 w-5" />} title="Ajuda e suporte" subtitle="Fale com a gente e entenda o sistema">
      {/*
       * A mesma rede da tela de entrada, agora como fundo.
       *
       * `absolute` e não `fixed`: presa ao conteúdo da página, senão cobriria
       * a sidebar e o cabeçalho. E `-z-10` para o texto continuar clicável.
       *
       * Opacidade baixa de propósito: aqui a rede é textura de fundo, não
       * assunto. Na entrada ela pode aparecer porque não há o que ler por cima;
       * numa tela de leitura, forte demais ela briga com o texto.
       */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-[0.18]">
        <RedeAnimada className="absolute inset-0" />
      </div>

      {/* ---------- Marca e contato, na mesma faixa ----------
           Empilhados, a marca ocupava uma tela inteira de altura sem dizer
           nada de novo — o nome do sistema já está no menu. Lado a lado, a
           faixa preenche a largura e o contato sobe para o primeiro olhar. */}
      <motion.div className="grid shrink-0 items-center gap-3 lg:grid-cols-[auto_1fr]" {...entra(0)}>
        {/* A marca é a peça da tela: ela ancora tudo o que vem depois. Cartão
            largo com o nome em corpo grande, não uma etiqueta discreta. */}
        <div className="flex items-center gap-5 rounded-2xl border border-fg/[0.07] bg-fg/[0.02] px-7 py-7">
          <motion.img
            src="/logo.png"
            alt="CodeEx Flow"
            width={80}
            height={80}
            className="h-[68px] w-[68px] shrink-0 rounded-2xl shadow-glow"
            animate={reduzir ? {} : { y: [0, -5, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          />

          <div className="min-w-0">
            <p className="font-display text-[30px] leading-none tracking-tight text-ink">
              CodeEx <span className="text-accent-soft">Flow</span>
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-mist">Gestão para quem vende no balcão</p>
            <p className="mt-0.5 text-[11.5px] text-faint">Segunda a sexta, 8h às 18h</p>
          </div>
        </div>

        <div className="grid h-full gap-3 sm:grid-cols-2">
        {whatsapp && (
          <a
            href={linkWhatsapp(whatsapp, "Olá! Preciso de ajuda com o CodeEx Flow.")}
            target="_blank"
            rel="noopener noreferrer"
            className="card glass-sheen flex items-center gap-3 p-4 transition-transform hover:-translate-y-0.5"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-success/15 text-success">
              <MessageCircle size={18} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13.5px] text-ink">WhatsApp</span>
              <span className="block truncate text-[12.5px] text-accent">{whatsapp}</span>
            </span>
          </a>
        )}

        {email && (
          <a href={`mailto:${email}`} className="card glass-sheen flex items-center gap-3 p-4 transition-transform hover:-translate-y-0.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/[0.14] text-accent-soft">
              <Mail size={18} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13.5px] text-ink">E-mail</span>
              <span className="block truncate text-[12.5px] text-accent">{email}</span>
            </span>
          </a>
        )}
        </div>
      </motion.div>

      {/* ---------- Seções ---------- */}
      <motion.div className="flex shrink-0 flex-col gap-2" {...entra(0.1)}>
        {SECOES.map(({ id, icone: Icone, titulo, resumo }) => {
          const on = aberta === id;

          return (
            <div key={id} className="overflow-hidden rounded-2xl border border-fg/[0.07] bg-fg/[0.02]">
              <button
                type="button"
                onClick={() => setAberta(on ? null : id)}
                aria-expanded={on}
                className="focus-ring flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-fg/[0.03]"
              >
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors ${on ? "bg-accent/[0.16] text-accent-soft" : "bg-fg/[0.05] text-mist"}`}>
                  <Icone size={16} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] text-ink">{titulo}</span>
                  <span className="block truncate text-[11.5px] text-faint">{resumo}</span>
                </span>

                <motion.span animate={{ rotate: on ? 180 : 0 }} transition={{ duration: 0.25, ease: "easeOut" }} className="shrink-0 text-muted">
                  <ChevronDown size={16} />
                </motion.span>
              </button>

              {/* `height: auto` animado dá a sensação de abrir. `AnimatePresence`
                  garante que fechar também seja suave — abrir bonito e fechar
                  seco fica pior do que não animar. */}
              <AnimatePresence initial={false}>
                {on && (
                  <motion.div
                    initial={reduzir ? false : { height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={reduzir ? { opacity: 0 } : { height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-fg/[0.06] px-4 py-4 text-[12.5px] leading-relaxed text-mist">
                      {id === "produto" && (
                        <div className="flex flex-col gap-3">
                          <p>
                            O Flow é um sistema de gestão para <span className="text-ink">quem vende no balcão</span>: loja de roupa, papelaria, gráfica, assistência, distribuidora. Reúne num lugar só o que hoje costuma estar espalhado entre caderno, planilha e WhatsApp.
                          </p>

                          <p>
                            Você <span className="text-ink">abre a nota, lança os produtos e recebe</span> — inclusive em partes, com o saldo pendente sempre à vista. O estoque baixa sozinho, o cliente fica no cadastro com histórico, e o dinheiro aparece no financeiro sem você digitar de novo.
                          </p>

                          <p>
                            <span className="text-ink">Para quem tem equipe:</span> cada funcionário entra com login próprio e vê só o que é dele. O dono acompanha quem vendeu o quê e recebe aviso do que a equipe faz.
                          </p>

                          <p>
                            Funciona no computador e no celular — instala como aplicativo — e <span className="text-ink">continua abrindo quando a internet da loja cai</span>.
                          </p>
                        </div>
                      )}

                      {id === "privacidade" && (
                        <div className="flex flex-col gap-3">
                          <p>
                            <span className="text-ink">Os dados são seus.</span> Cadastros, vendas e financeiro pertencem à sua empresa. Não vendemos, não cedemos e não usamos para publicidade.
                          </p>

                          <p>
                            <span className="text-ink">Cada loja vê só a própria loja.</span> Nenhuma consulta atravessa de uma empresa para outra. Senhas ficam cifradas — não podem ser lidas nem por nós.
                          </p>

                          <p>
                            <span className="text-ink">Só entramos quando você chama.</span> A nossa equipe acessa seus dados apenas em atendimento de suporte, e apenas no necessário para resolver.
                          </p>

                          <p>Você pode pedir uma cópia ou a exclusão dos seus dados quando quiser, conforme a LGPD.</p>

                          {/* Link, não botão. Exportar a base é coisa rara — uma
                              vez por ano, se tanto. Como botão destacado, competia
                              com o texto e sugeria uma ação corriqueira que não é. */}
                          {ehMaster && (
                            <p className="text-[11.5px] text-faint">
                              Quer uma cópia agora?{" "}
                              <button
                                type="button"
                                onClick={baixarDados}
                                disabled={baixando}
                                className="focus-ring inline-flex items-center gap-1 rounded text-accent underline decoration-accent/30 underline-offset-2 transition-colors hover:text-accent-soft disabled:opacity-50"
                              >
                                {baixando && <Loader2 size={11} className="animate-spin" />}
                                {baixando ? "gerando…" : "clique aqui"}
                              </button>
                              .
                            </p>
                          )}
                        </div>
                      )}

                      {id === "empresa" && (
                        <div className="flex flex-col gap-3">
                          {/* Grade em vez de lista: os quatro dados são curtos e
                              lado a lado ocupam a largura que a seção já tem —
                              empilhados, sobrava metade da linha em branco. */}
                          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-fg/[0.06] lg:grid-cols-4">
                            {[
                              ["Empresa", "CodEx Solutions"],
                              ["Produto", "CodeEx Flow"],
                              ["WhatsApp", whatsapp || "—"],
                              ["E-mail", email || "—"],
                            ].map(([rotulo, valor]) => (
                              <div key={rotulo} className="min-w-0 bg-surface px-3.5 py-3">
                                <dt className="text-[10px] uppercase tracking-[0.1em] text-faint">{rotulo}</dt>
                                <dd className="mt-1 truncate text-[13px] text-ink" title={valor}>
                                  {valor}
                                </dd>
                              </div>
                            ))}
                          </dl>

                          <p className="text-[11.5px] leading-relaxed text-faint">
                            © {new Date().getFullYear()} CodEx Solutions — o CodeEx Flow é licenciado por assinatura, e o uso segue os termos aceitos no cadastro.
                          </p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </motion.div>

      {/* ==================== FAQ ==================== */}
      <motion.section {...entra(0.18)} className="mt-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-[15px] text-ink">
              <HelpCircle size={16} className="text-accent-soft" />
              Perguntas frequentes
            </h2>
            <p className="mt-0.5 text-[12px] text-mist">
              {totalPerguntas} respostas do que mais chega no nosso WhatsApp.
            </p>
          </div>

          {/* Busca: com vinte perguntas, ler todas para achar a sua é o mesmo
              problema que a sanfona acima resolveu. */}
          <div className="flex items-center gap-2 rounded-xl border border-fg/[0.08] bg-fg/[0.03] px-3 transition-colors focus-within:border-accent/60 sm:w-64">
            <Search size={14} className="shrink-0 text-muted" />
            <input
              value={buscaFaq}
              onChange={(e) => setBuscaFaq(e.target.value)}
              placeholder="Buscar pergunta…"
              aria-label="Buscar nas perguntas frequentes"
              className="w-full bg-transparent py-2 text-[12.5px] text-ink outline-none placeholder:text-faint"
            />
            {buscaFaq && (
              <button type="button" onClick={() => setBuscaFaq("")} className="shrink-0 text-[11px] text-faint hover:text-ink">
                Limpar
              </button>
            )}
          </div>
        </div>

        {faqFiltrado.length === 0 ? (
          <p className="mt-5 rounded-2xl border border-dashed border-fg/[0.12] px-5 py-10 text-center text-[12.5px] leading-relaxed text-faint">
            Nenhuma pergunta com esse termo.
            <br />
            Chame a gente no WhatsApp — a dúvida vira pergunta nova aqui.
          </p>
        ) : (
          /* Duas colunas em tela larga: os grupos são curtos e empilhados
             deixavam metade da página vazia num monitor. */
          <div className="mt-5 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            {faqFiltrado.map((grupo) => {
              const Icone = grupo.icone;

              return (
                <div key={grupo.id} className="card overflow-hidden">
                  <p className="flex items-center gap-2 border-b border-fg/[0.06] px-4 py-3 text-[12px] uppercase tracking-[0.08em] text-faint">
                    <Icone size={13} className="text-muted" />
                    {grupo.titulo}
                  </p>

                  <div className="divide-y divide-fg/[0.05]">
                    {grupo.itens.map((item) => {
                      const chave = `${grupo.id}:${item.p}`;
                      const on = perguntaAberta === chave;

                      return (
                        <div key={chave}>
                          <button
                            type="button"
                            onClick={() => setPerguntaAberta(on ? null : chave)}
                            aria-expanded={on}
                            className="focus-ring flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-fg/[0.02]"
                          >
                            <span className={`min-w-0 flex-1 text-[12.5px] leading-snug transition-colors ${on ? "text-ink" : "text-mist"}`}>
                              {item.p}
                            </span>
                            <ChevronDown
                              size={14}
                              className={`shrink-0 text-muted transition-transform duration-200 ${on ? "rotate-180 text-accent-soft" : ""}`}
                            />
                          </button>

                          <AnimatePresence initial={false}>
                            {on && (
                              <motion.div
                                initial={reduzir ? false : { height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={reduzir ? { opacity: 0 } : { height: 0, opacity: 0 }}
                                transition={{ duration: 0.26, ease: [0.22, 0.61, 0.36, 1] }}
                                className="overflow-hidden"
                              >
                                <p className="px-4 pb-4 text-[12.5px] leading-relaxed text-mist">{item.r}</p>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* A saída para quem não achou: o FAQ nunca cobre tudo, e a pessoa que
            chegou ao fim dele já gastou a paciência que tinha. */}
        <div className="mt-5 flex flex-col items-center gap-3 rounded-2xl border border-accent/20 bg-accent/[0.05] px-5 py-5 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="min-w-0">
            <p className="text-[13px] text-ink">Não achou o que precisava?</p>
            <p className="mt-0.5 text-[12px] text-mist">Chame a gente — respondemos em horário comercial.</p>
          </div>

          {whatsapp && (
            <a
              href={linkWhatsapp(whatsapp, "Olá! Vi as perguntas frequentes no CodeEx Flow e ainda fiquei com uma dúvida.")}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring inline-flex shrink-0 items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13px] text-white transition hover:brightness-110"
            >
              <MessageCircle size={15} />
              Falar no WhatsApp
            </a>
          )}
        </div>
      </motion.section>
    </PageScreen>
  );
};

export default AjudaPage;
