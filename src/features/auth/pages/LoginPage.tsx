import { useState } from "react";
import type { CSSProperties } from "react";
import { motion } from "framer-motion";
import { Sparkles, ShoppingCart, Package, Wallet, WifiOff, Building2, ArrowRight, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import useAuth from "@/features/auth/store/auth.store";

import AuthForm from "@/features/auth/components/AuthForm";
import AuthFormInputs from "@/features/auth/schema/auth.schema";
import { onlyDigits } from "@/shared/utils/format";
import useTransicao from "@/shared/session/transicao.store";
import RedeAnimada from "@/features/landing/components/RedeAnimada";
import BotaoInstalar from "@/shared/pwa/BotaoInstalar";
import useMarcaDominio from "@/shared/marca/marcaDominio";

const LANDING_ROUTE = "/page";

/**
 * `#7c3aed` → `"124 58 237"`, que é o formato que os tokens do tema usam.
 *
 * O CSS do projeto guarda a cor como TRIPLA crua (`--accent: 109 92 232`) para
 * poder escrever `rgb(var(--accent) / 0.28)` e variar a opacidade sem uma
 * segunda variável. Um `#hex` cravado na variável quebraria toda linha que faz
 * isso — e são dezenas.
 */
const paraTripla = (hex: string): string | null => {
  const limpo = hex.replace("#", "");
  const cheio = limpo.length === 3 ? limpo.split("").map((c) => c + c).join("") : limpo;

  if (!/^[0-9a-fA-F]{6}$/.test(cheio)) return null;

  const n = parseInt(cheio, 16);

  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

/** Três coisas concretas, não adjetivos. Aparecem só no painel do desktop. */
const DESTAQUES = [
  { icone: ShoppingCart, titulo: "PDV de balcão", texto: "Lança a venda, recebe em partes e emite a nota." },
  { icone: Package, titulo: "Estoque que avisa", texto: "O que está acabando aparece antes de faltar." },
  { icone: Wallet, titulo: "Dinheiro no lugar", texto: "Notas a receber e caixa do dia na mesma tela." },
  { icone: WifiOff, titulo: "Wi-Fi caiu, e daí", texto: "O sistema continua abrindo com os últimos dados." },
];

const AuthPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  /*
   * De quem é o endereço por onde esta pessoa chegou.
   *
   * `null` no nosso domínio — e aí a tela é a de sempre. Vindo pelo domínio da
   * empresa, ela veste a marca dela: a aba já foi trocada no boot (ver
   * `vestirAba`), e daqui para baixo é a tela.
   */
  const marca = useMarcaDominio((s) => s.marca);
  const carregandoMarca = useMarcaDominio((s) => s.carregando);

  const corDaMarca = marca?.cor ? paraTripla(marca.cor) : null;

  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState(false);

  /* O overlay mora acima do roteador (`CamadaTransicao`); aqui só disparamos.
     `consumindo` serve para o card se desfazer junto. */
  const [consumindo, setConsumindo] = useState(false);
  const tocarTransicao = useTransicao((s) => s.tocar);

  const onSubmit = async (data: AuthFormInputs) => {
    if (isLoading) return;

    setLoginError(false);
    setIsLoading(true);

    try {
      await login(
        {
          email: data.email,
          senha: data.senha,
          cpfCnpjEmpresa: onlyDigits(data.cpfCnpjEmpresa),
        },
        // Toca a animação e segura o login aqui até ela acabar.
        (nome) => {
          setConsumindo(true);
          return tocarTransicao("entrada", nome);
        },
      );
    } catch {
      setLoginError(true);
      setConsumindo(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    /* No desktop o cartão sozinho boiava num monitor inteiro. Vira duas colunas:
       à esquerda a marca com a mesma rede animada da página inicial — quem entra
       reconhece de onde veio; à direita o formulário. Abaixo de `lg` nada muda. */
    /* Sem `vitrine`: estas telas passam a seguir o tema e o destaque que a
       pessoa escolheu. Quem já é cliente reconhece o próprio sistema antes de
       entrar; a identidade fixa fica só na página pública de vendas. */
    <div
      className="relative h-[100dvh] w-full overflow-hidden bg-canvas lg:grid lg:grid-cols-[1.05fr_1fr]"
      /*
       * A cor da empresa entra como TOKEN, na raiz desta tela.
       *
       * Sobrescrever `--accent` aqui repinta tudo o que já lê o token — botão,
       * foco, glows, o brilho da logo — sem uma linha condicional em cada um
       * deles. E fica preso a esta tela: o resto do sistema continua com o tema
       * que a pessoa escolheu, que é escolha dela e não da marca.
       */
      style={corDaMarca ? ({ "--accent": corDaMarca, "--accent-soft": corDaMarca } as CSSProperties) : undefined}
    >
      {/* O wallpaper da empresa, atrás de tudo e por baixo de um véu — a tela
          precisa continuar legível sobre qualquer imagem que tenham subido. */}
      {marca?.wallpaper && (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center opacity-[0.18]" style={{ backgroundImage: `url("${marca.wallpaper}")` }} />
          <div aria-hidden className="pointer-events-none absolute inset-0 z-0 bg-canvas/60" />
        </>
      )}
      <aside className="relative hidden overflow-hidden border-r border-fg/[0.07] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <RedeAnimada className="absolute inset-0" />

        <div className="relative flex items-center gap-3">
          <img
            src={marca?.logo || "/logo.png"}
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 rounded-xl object-cover shadow-glow"
          />
          <span className="font-display text-[19px] tracking-tight text-ink">
            {marca ? marca.nome : <>CodeEx <span className="text-accent-soft">Flow</span></>}
          </span>
        </div>

        <div className="relative max-w-md">
          {/*
           * A vitrine é NOSSA e só aparece no nosso endereço.
           *
           * "Sua loja inteira num lugar só" e a lista de recursos são propaganda
           * do Flow para quem ainda não é cliente. No domínio da empresa quem
           * chega já é da casa — é o funcionário abrindo o sistema para
           * trabalhar —, e vender o produto para ele seria ocupar a tela com um
           * argumento dirigido a outra pessoa.
           */}
          {marca ? (
            <h2 className="text-[34px] leading-[1.1] tracking-tight text-ink">{marca.nome}</h2>
          ) : (
            <>
              <h2 className="text-[34px] leading-[1.1] tracking-tight text-ink">
                Sua loja inteira
                <br />
                <span className="text-accent-soft">num lugar só.</span>
              </h2>

              <ul className="mt-8 flex flex-col gap-4">
                {DESTAQUES.map(({ icone: Icone, titulo, texto }) => (
                  <li key={titulo} className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/[0.12] text-accent-soft ring-1 ring-inset ring-accent/20">
                      <Icone size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13.5px] text-ink">{titulo}</span>
                      <span className="block text-[12.5px] leading-relaxed text-mist">{texto}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* O rodapé continua nos nomeando mesmo na marca do cliente — em letra
            miúda, porque é honestidade sobre quem faz o sistema, e não vitrine. */}
        <p className="relative text-[11.5px] text-faint">
          © {new Date().getFullYear()} {marca ? `${marca.nome} · movido por CodeEx Flow` : "CodeEx Flow · CodEx Solutions"}
        </p>
      </aside>

    <div className="relative flex h-full w-full items-center justify-center overflow-hidden px-3 py-3 sm:px-4 sm:py-5">
      {/* Glows de fundo — seguem o accent e somem no modo leve */}
      {/* `absolute`, não `fixed`: preso à coluna do formulário. Fixo na viewport
          ele passaria por cima da rede animada do painel da esquerda. */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" style={{ opacity: "var(--fx-aurora, 1)" }}>
        <div className="absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full bg-accent opacity-[0.18] blur-[130px]" />
        <div className="absolute -bottom-24 -right-24 h-[420px] w-[420px] rounded-full opacity-[0.16] blur-[130px]" style={{ background: "rgb(var(--aurora-2))" }} />
        <div className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-soft opacity-[0.1] blur-[110px]" />
      </div>

      <motion.div
        className="relative z-10 flex max-h-full w-full max-w-sm flex-col sm:max-w-md"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}
      >
        {/* Marca */}
        <motion.div
          className="mb-3 flex items-center justify-center gap-3 sm:mb-4"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}
        >
          {/* No domínio da empresa a logo não é botão: ela não leva à nossa
              página de vendas. Quem chegou por ali quer entrar no sistema da
              loja, e um clique que o joga na propaganda de outra marca é uma
              porta que ele não pediu. */}
          {marca ? (
            <span className="relative inline-flex items-center justify-center">
              <span className="pointer-events-none absolute left-1/2 top-1/2 h-[80px] w-[80px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent blur-[36px]" style={{ opacity: "calc(0.5 * var(--fx-glow, 1))" }} />
              <img src={marca.logo || "/logo.png"} alt={marca.nome} width={48} height={48} className="relative h-11 w-11 rounded-xl object-cover shadow-glow" />
            </span>
          ) : (
            <button type="button" onClick={() => navigate(LANDING_ROUTE)} className="group relative inline-flex items-center justify-center transition-transform duration-300 hover:scale-[1.04]" aria-label="Ir para a página inicial do CodeEx Flow">
              <span className="pointer-events-none absolute left-1/2 top-1/2 h-[80px] w-[80px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent blur-[36px]" style={{ opacity: "calc(0.5 * var(--fx-glow, 1))" }} />
              <img src="/logo.png" alt="CodeEx Flow" width={48} height={48} className="relative h-11 w-11 rounded-xl shadow-glow" />
            </button>
          )}

          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-display text-[19px] tracking-tight text-ink">
              {marca ? marca.nome : <>CodeEx <span className="text-accent-soft">Flow</span></>}
            </span>
            <span className="text-[10px] uppercase tracking-[2px] text-faint">Painel da empresa</span>
          </div>
        </motion.div>

        {/* Card — ao entrar, ele é "consumido": encolhe, desfoca e some. */}
        <motion.div
          className="glass-liquid glass-sheen relative rounded-2xl p-5 sm:p-7"
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={consumindo ? { opacity: 0, scale: 0.94, filter: "blur(10px)", y: -12 } : { opacity: 1, scale: 1, filter: "blur(0px)", y: 0 }}
          transition={{ duration: consumindo ? 0.55 : 0.6, delay: consumindo ? 0 : 0.12, ease: [0.22, 0.61, 0.36, 1] }}
        >
          <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-accent-soft to-transparent opacity-70" />

          <h1 className="mb-0.5 text-base text-ink sm:text-lg">Entrar</h1>
          <p className="mb-3 text-[11px] text-mist sm:mb-4">Acesse sua conta para continuar</p>

          {/* O formulário só é montado depois de a marca chegar: o documento
              entra como valor PADRÃO dele, e um campo que nasce vazio e é
              preenchido meio segundo depois pula embaixo do cursor de quem já
              começou a digitar. */}
          {carregandoMarca ? (
            <div className="flex h-[280px] items-center justify-center text-faint">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : (
            <AuthForm onSubmit={onSubmit} isLoading={isLoading} loginError={loginError} documentoEmpresa={marca?.documento} />
          )}

          {/*
           * "Cadastrar minha empresa" e "Conhecer o CodeEx Flow" somem no
           * domínio do cliente.
           *
           * São o nosso funil de vendas. Numa tela que a gráfica manda para a
           * própria equipe, eles convidam o funcionário dela a abrir uma
           * empresa concorrente no nosso sistema — e, no melhor caso, ocupam a
           * tela com uma oferta dirigida a outra pessoa.
           */}
          {!marca && (
          <>
          {/* Era uma linha de 11px no rodapé do cartão — justamente o convite
              para quem ainda não é cliente ficava sendo a coisa menos visível
              da tela. Vira botão, com um separador que o desgruda do formulário
              sem competir com o "Entrar". */}
          <div className="mt-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-fg/[0.08]" />
            <span className="text-[10.5px] uppercase tracking-[1.4px] text-faint">Ainda não tem conta?</span>
            <span className="h-px flex-1 bg-fg/[0.08]" />
          </div>

          <button
            type="button"
            onClick={() => navigate("/cadastro")}
            className="focus-ring group mt-3 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent/[0.08] text-[13.5px] text-accent-soft transition-all hover:border-accent/50 hover:bg-accent/[0.14] active:scale-[0.99]"
          >
            <Building2 size={16} />
            Cadastrar minha empresa
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </button>
          </>
          )}
        </motion.div>

        {/* Vale para as duas larguras: no desktop isto era um link de 10px
            perdido no aviso de copyright. */}
        {!marca && (
        <motion.button
          type="button"
          onClick={() => navigate(LANDING_ROUTE)}
          className="focus-ring mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-fg/[0.1] text-[13.5px] text-mist transition-colors hover:border-fg/[0.2] hover:text-ink active:bg-fg/[0.05]"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.28 }}
        >
          <Sparkles size={15} className="text-accent-soft" />
          Conhecer o CodeEx Flow
        </motion.button>
        )}

        {/* Instalar o app.
            Aqui, e não só depois de entrar: quem usa no balcão abre o sistema
            todo dia pelo navegador, e é na tela de login que ele percebe que
            teria um ícone na tela de início. Some sozinho quando já está
            instalado ou quando o navegador não instala PWA. */}
        <motion.div
          className="mt-3 flex justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.32, duration: 0.5 }}
        >
          <BotaoInstalar className="w-full sm:w-auto" />
        </motion.div>

        <motion.p
          className="mt-3 hidden text-center text-[10px] text-muted sm:block"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.5 }}
        >
          © {new Date().getFullYear()} {marca ? marca.nome : "CodeEx Flow"}
        </motion.p>

        <p className="mt-3 text-center text-[10px] text-muted sm:hidden">© {new Date().getFullYear()} {marca ? marca.nome : "CodeEx Flow"}</p>
      </motion.div>

      </div>
    </div>
  );
};

export default AuthPage;
