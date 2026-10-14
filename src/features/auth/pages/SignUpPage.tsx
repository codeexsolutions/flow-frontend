import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Building2, User, Mail, Phone, Smartphone, MessageCircle, MapPin, Hash, FileText,
  Image as ImageIcon, ArrowLeft, ArrowRight, Loader2, Lock, Eye, EyeOff, Sparkles,
  Zap, QrCode, Repeat, LogIn,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import RedeAnimada from "@/features/landing/components/RedeAnimada";
import CarrosselPlanos from "@/features/assinatura/components/CarrosselPlanos";

import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import { onlyDigits } from "@/shared/utils/format";
import { maskCep, maskCpfCnpj, maskPhone, UFS } from "@/shared/validation/masks";
import { isValidCpfCnpj } from "@/shared/validation/documento";
import { formatCurrencyFromCents } from "@/shared/utils/currency";

import AuthService from "@/features/auth/services/auth.service";
import useAuth from "@/features/auth/store/auth.store";
import AssinaturaService from "@/features/assinatura/services/assinatura.service";
import { CICLO_LABEL, type RespostasDiagnostico } from "@/features/assinatura/types/assinatura.types";
import useCatalogo from "@/shared/plano/catalogo.store";

const LANDING_ROUTE = "/";

/** Três coisas concretas, não adjetivos. Aparecem só no painel do desktop. */
const DESTAQUES_CAD = [
  { icone: Zap, titulo: "Entra na hora", texto: "Cadastrou, já tem acesso. Sem instalação e sem técnico." },
  { icone: QrCode, titulo: "Paga por Pix", texto: "QR na tela, você manda o comprovante e a gente libera." },
  /* Enquanto a vitrine tem um plano só, prometer troca é prometer uma tela
     que não existe. O que continua verdade é não haver fidelidade. */
  { icone: Repeat, titulo: "Sem fidelidade", texto: "Mês a mês. Parou de usar, parou de pagar." },
];

/* ------------------------------------------------------------------ */
/* Schema Zod */
/* ------------------------------------------------------------------ */

const optionalUrl = z.string().url("URL inválida").or(z.literal("")).optional();

const cadastroSchema = z
  .object({
    planoCodigo: z.string().min(1, "Escolha um plano"),

    nomeFantasia: z.string().min(1, "Obrigatório"),
    nomeRepresentante: z.string().min(1, "Obrigatório"),
    cpfCnpj: z.string().min(1, "Obrigatório").refine(isValidCpfCnpj, "CPF/CNPJ inválido"),
    inscMunicipal: z.string().optional(),
    urlLogo: optionalUrl,

    contato: z.object({
      email: z.string().min(1, "Obrigatório").email("Email inválido"),
      celular: z
        .string()
        .min(1, "Obrigatório")
        .refine((v) => onlyDigits(v).length === 11, "Celular incompleto"),
      telefone: z
        .string()
        .optional()
        .refine((v) => !v || onlyDigits(v).length >= 10, "Telefone incompleto"),
      whatsapp: z
        .string()
        .optional()
        .refine((v) => !v || onlyDigits(v).length === 11, "WhatsApp incompleto"),
    }),

    endereco: z.object({
      cep: z
        .string()
        .min(1, "Obrigatório")
        .refine((v) => onlyDigits(v).length === 8, "CEP incompleto"),
      logradouro: z.string().min(1, "Obrigatório"),
      numero: z.string().min(1, "Obrigatório"),
      complemento: z.string().optional(),
      bairro: z.string().min(1, "Obrigatório"),
      cidade: z.string().min(1, "Obrigatória"),
      uf: z.string().min(1, "UF"),
    }),

    senha: z.string().min(6, "Mínimo de 6 caracteres"),
    confirmarSenha: z.string().min(1, "Confirme a senha"),
    aceite: z.boolean().refine((v) => v === true, "É preciso aceitar para continuar"),
  })
  .refine((d) => d.senha === d.confirmarSenha, {
    message: "As senhas não conferem",
    path: ["confirmarSenha"],
  });

type CadastroFormInputs = z.infer<typeof cadastroSchema>;

/* ------------------------------------------------------------------ */
/* Etapas */
/* ------------------------------------------------------------------ */

/* A primeira etapa chamava "Diagnóstico" desde que existia o questionário de
   três perguntas. Ele saiu; o rótulo tinha ficado. */
const STEPS = ["Plano", "Empresa", "Contato", "Endereço", "Acesso"] as const;

const STEP_FIELDS: Record<number, string[]> = {
  0: ["planoCodigo"],
  1: ["nomeFantasia", "nomeRepresentante", "cpfCnpj", "inscMunicipal", "urlLogo"],
  2: ["contato.email", "contato.celular", "contato.telefone", "contato.whatsapp"],
  3: ["endereco.cep", "endereco.logradouro", "endereco.numero", "endereco.complemento", "endereco.bairro", "endereco.cidade", "endereco.uf"],
  4: ["senha", "confirmarSenha", "aceite"],
};

/* ------------------------------------------------------------------ */
/* Componente */
/* ------------------------------------------------------------------ */

/**
 * Cada etapa entra pelo lado para onde o cliente está indo: avançar traz a
 * próxima da direita, voltar traz a anterior da esquerda. É o que dá a sensação
 * de percorrer um caminho em vez de trocar de tela.
 *
 * A troca usa `popLayout`, não `mode="wait"`: esperar a etapa antiga sair deixa
 * o cartão vazio por meio segundo e faz os botões saltarem: quem tocasse nesse
 * intervalo acertaria o nada. Com `popLayout` a etapa que sai deixa o fluxo na
 * hora e a nova já ocupa o lugar dela.
 */
const VARIANTES = {
  entra: (d: number) => ({ opacity: 0, x: d > 0 ? 26 : -26 }),
  centro: { opacity: 1, x: 0 },
  sai: (d: number) => ({ opacity: 0, x: d > 0 ? -26 : 26 }),
};

const CadastroEmpresaPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState(0);
  /* +1 avançando, -1 voltando — decide de que lado a etapa entra. */
  const [direcao, setDirecao] = useState(1);
  const reduzir = useReducedMotion();
  const [isLoading, setIsLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [verSenha, setVerSenha] = useState(false);

  /*
   * Os planos vêm do catálogo compartilhado, carregado no boot do app.
   *
   * A tela não busca mais nada: quando o cadastro abre, a lista já está em
   * memória e a etapa do plano nasce com o cartão pronto. Buscar aqui fazia a
   * etapa abrir vazia e o cartão entrar depois, empurrando o layout.
   */
  const planos = useCatalogo((s) => s.planos);
  const catalogoCarregado = useCatalogo((s) => s.carregado);
  const erroCatalogo = useCatalogo((s) => s.erro);
  const carregarCatalogo = useCatalogo((s) => s.carregar);

  const planosLoading = !catalogoCarregado;

  /*
   * O lead continua sendo criado, mas sem respostas de diagnóstico — o
   * questionário saiu do cadastro.
   *
   * O campo permanece no payload porque a API ainda o aceita e o painel
   * comercial ainda o lê: mandar `undefined` é diferente de mudar o contrato
   * dos dois lados por causa de uma tela. Quando o diagnóstico voltar (ou for
   * aposentado de vez), este é o ponto único a mexer.
   */
  const respostas: RespostasDiagnostico | null = null;

  const {
    register,
    handleSubmit,
    trigger,
    setValue,
    getValues,
    watch,
    formState: { errors },
  } = useForm<CadastroFormInputs>({
    resolver: zodResolver(cadastroSchema),
    defaultValues: { endereco: { uf: "" }, planoCodigo: searchParams.get("plano") ?? "", aceite: false },
  });

  const planoCodigo = watch("planoCodigo");
  const planoEscolhido = useMemo(() => planos.find((p) => p.codigo === planoCodigo) ?? null, [planos, planoCodigo]);

  /* ------------------------- Planos ------------------------- */

  /* Rede de segurança para quem abre `/cadastro` direto: a store ignora o
     pedido repetido, então chamar aqui não custa uma segunda requisição. */
  useEffect(() => {
    carregarCatalogo();
  }, [carregarCatalogo]);

  useEffect(() => {
    if (!planos.length) return;

    // Plano que veio da URL só vale se existir de fato — link antigo apontando
    // para um plano fora de catálogo não pode marcar uma escolha que a API vai
    // recusar depois.
    const daUrl = searchParams.get("plano");
    const valido = planos.some((p) => p.codigo === daUrl);

    if (valido) {
      setValue("planoCodigo", daUrl!, { shouldValidate: true });
      setStep((s) => (s === 0 ? 1 : s));
      return;
    }

    // Catálogo com um plano só: escolher entre uma opção não é escolha. O
    // cartão abre já marcado e a etapa vira confirmação, não decisão. Com mais
    // de um plano o campo volta a nascer vazio, para a pessoa comparar preço.
    const atual = getValues("planoCodigo");

    if (planos.some((p) => p.codigo === atual)) return;

    setValue("planoCodigo", planos.length === 1 ? planos[0].codigo : "", { shouldValidate: false });
  }, [planos, searchParams, setValue, getValues]);

  /* ------------------------- ViaCEP ------------------------- */

  const buscarCep = async () => {
    const cep = onlyDigits(getValues("endereco.cep") ?? "");
    if (cep.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data.erro) {
        toast.warn("CEP não encontrado");
        return;
      }
      setValue("endereco.logradouro", data.logradouro ?? "", { shouldValidate: true });
      setValue("endereco.bairro", data.bairro ?? "", { shouldValidate: true });
      setValue("endereco.cidade", data.localidade ?? "", { shouldValidate: true });
      setValue("endereco.uf", data.uf ?? "", { shouldValidate: true });
    } catch {
      toast.warn("Não foi possível buscar o CEP");
    } finally {
      setCepLoading(false);
    }
  };

  /* ------------------------- Navegação ------------------------- */

  const nextStep = async () => {
    const valid = await trigger(STEP_FIELDS[step] as never[]);
    if (!valid) return;
    setDirecao(1);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const prevStep = () => {
    setDirecao(-1);
    setStep((s) => Math.max(s - 1, 0));
  };

  /* ------------------------- Submit ------------------------- */

  const onSubmit = async (data: CadastroFormInputs) => {
    if (isLoading) return;
    setIsLoading(true);
    const toastId = toast.loading("Cadastrando empresa...");

    const cpfCnpj = onlyDigits(data.cpfCnpj);

    const payload = {
      nomeRepresentante: data.nomeRepresentante,
      nomeFantasia: data.nomeFantasia,
      cpfCnpj,
      inscMunicipal: data.inscMunicipal ?? "",
      urlLogo: data.urlLogo ?? "",
      planoCodigo: data.planoCodigo,
      senha: data.senha,
      contato: {
        email: data.contato.email,
        celular: onlyDigits(data.contato.celular),
        telefone: onlyDigits(data.contato.telefone ?? ""),
        whatsapp: onlyDigits(data.contato.whatsapp ?? ""),
      },
      endereco: {
        cep: onlyDigits(data.endereco.cep),
        logradouro: data.endereco.logradouro,
        numero: data.endereco.numero,
        complemento: data.endereco.complemento ?? "",
        bairro: data.endereco.bairro,
        cidade: data.endereco.cidade,
        uf: data.endereco.uf,
      },
    };

    try {
      const cadastro = await AssinaturaService.cadastrar(payload);

      toast.update(toastId, { render: "Cadastro realizado! Entrando...", type: "success", isLoading: false, autoClose: 1500 });

      /*
       * O cadastro termina numa conversa, não numa tela de Pix.
       *
       * Quem acabou de responder o diagnóstico é o contato mais quente que
       * existe: sabe o que precisa, já digitou os dados e está com a decisão
       * na mão. Despejar essa pessoa numa tela de QR code desperdiça o único
       * momento em que ela quer falar.
       *
       * O lead é gravado ANTES do redirecionamento e num `try` próprio: se
       * a gravação falhar, o cadastro já existe e mandar a pessoa para o
       * pagamento é melhor do que travá-la com um erro que não é dela.
       */
      let destinoWhatsapp = "";

      try {
        const lead = await AssinaturaService.registrarLead({
          nome: data.nomeRepresentante,
          empresa: data.nomeFantasia,
          email: data.contato.email,
          telefone: onlyDigits(data.contato.whatsapp || data.contato.celular),
          cpfCnpj,
          codigoEmpresa: cadastro?.codigoEmpresa ?? null,
          planoRecomendado: data.planoCodigo,
          respostas: respostas ?? undefined,
          origem: "CADASTRO",
        });

        if (lead.whatsappConfigurado) destinoWhatsapp = lead.linkWhatsapp;

      } catch {
        // Sem lead a venda continua: o caminho de pagamento segue de pé.
      }

      // Login automático com as credenciais que o cliente acabou de definir.
      // Sem isso ele cairia na tela de login logo depois de se cadastrar.
      // O servidor devolve os tokens e o usuário da sessão.
      let usuario: Awaited<ReturnType<typeof AuthService.login>>;

      try {
        usuario = await AuthService.login({
          cpfCnpjEmpresa: cpfCnpj,
          email: data.contato.email,
          senha: data.senha,
        });
      } catch {
        throw new Error("login-falhou");
      }

      // `setAuth` direto (e não `login` da store): a empresa ainda está
      // inativa, então buscar os dados dela agora não traz nada de útil. Os
      // tokens vão junto — é o que autentica o checkout logo em seguida.
      useAuth.getState().setAuth(usuario, usuario.accessToken, usuario.refreshToken);

      // Com WhatsApp configurado a pessoa vai para a conversa; sem número,
      // o fluxo antigo continua valendo e ela vai pagar.
      if (destinoWhatsapp) {
        navigate("/bem-vindo", {
          replace: true,
          state: { linkWhatsapp: destinoWhatsapp, nome: data.nomeRepresentante, planoCodigo: data.planoCodigo },
        });
        return;
      }

      navigate("/checkout", { replace: true });

    } catch (error) {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      const mensagem = err?.response?.data?.message ?? err?.message ?? "erro desconhecido";

      // O cadastro pode ter dado certo e só o login ter falhado — nesse caso
      // mandar para o login é melhor do que sugerir cadastrar de novo.
      if (mensagem === "login-falhou") {
        toast.update(toastId, {
          render: "Cadastro criado! Faça login para continuar.",
          type: "info",
          isLoading: false,
          autoClose: 3000,
        });

        navigate("/login", { replace: true });
        return;
      }

      toast.update(toastId, {
        render: `Erro ao cadastrar empresa: ${mensagem}`,
        type: "error",
        isLoading: false,
        autoClose: 4000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  /* ------------------------- Estilos compactos ------------------------- */

  const fieldBox = "flex min-w-0 items-center gap-2 px-3 rounded-lg bg-fg/[0.035] border border-fg/[0.08] transition-all duration-200 hover:border-fg/[0.14] focus-within:border-accent focus-within:bg-fg/[0.05] focus-within:ring-2 focus-within:ring-accent/15";
  const labelCls = "block text-[10px] uppercase tracking-[0.7px] text-faint mb-1";
  const inputCls = "cf-input w-full flex-1 min-w-0 bg-transparent outline-none py-2.5 text-[13px] sm:text-sm text-ink placeholder:text-faint";
  const errCls = "mt-0.5 min-h-[13px] text-[10px] leading-[13px] text-danger";

  /* registros com máscara */
  const regCpfCnpj = register("cpfCnpj");
  const regCep = register("endereco.cep");
  const regTelefone = register("contato.telefone");
  const regCelular = register("contato.celular");
  const regWhatsapp = register("contato.whatsapp");

  /** Resumo mostrado na última etapa, antes de enviar. */
  const resumo = () => {
    const v = getValues();
    return [
      { label: "Empresa", valor: v.nomeFantasia },
      { label: "Representante", valor: v.nomeRepresentante },
      { label: "CPF/CNPJ", valor: v.cpfCnpj },
      { label: "E-mail de acesso", valor: v.contato?.email },
      { label: "Celular", valor: v.contato?.celular },
      {
        label: "Endereço",
        valor: v.endereco?.logradouro ? `${v.endereco.logradouro}, ${v.endereco.numero} — ${v.endereco.cidade}/${v.endereco.uf}` : "",
      },
    ].filter((linha) => linha.valor);
  };

  return (
    /* Mesma moldura do login: painel da marca à esquerda, conteúdo à direita.
       Diferença importante — o cartão do cadastro é alto (cinco etapas, uma
       delas com os planos), então a coluna da direita rola por conta própria em
       vez de esticar a página inteira e levar o painel junto. */
    /* Sem `vitrine`: acompanha o tema escolhido, como o login. */
    <div className="relative min-h-[100dvh] w-full overflow-x-hidden bg-canvas lg:grid lg:h-[100dvh] lg:min-h-0 lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-fg/[0.07] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <RedeAnimada className="absolute inset-0" />

        <div className="relative flex items-center gap-3">
          <img src="/logo.png" alt="" width={40} height={40} className="h-10 w-10 rounded-xl shadow-glow" />
          <span className="text-[19px] tracking-tight text-ink">
            CodeEx <span className="text-accent-soft">Flow</span>
          </span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-[34px] leading-[1.1] tracking-tight text-ink">
            Comece a vender
            <br />
            <span className="text-accent-soft">ainda hoje.</span>
          </h2>

          <ul className="mt-8 flex flex-col gap-4">
            {DESTAQUES_CAD.map(({ icone: Icone, titulo, texto }) => (
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
        </div>

        <p className="relative text-[11.5px] text-faint">© {new Date().getFullYear()} CodeEx Flow · CodEx Solutions</p>
      </aside>

    <div
      /* `items-start` + `my-auto` no filho, e não `items-center`: com centralização
         de flex, conteúdo mais alto que o container transborda para cima e a parte
         de fora fica inalcançável pela rolagem. A margem automática centraliza
         quando sobra espaço e recua quando falta. */
      className="relative flex w-full items-start justify-center overflow-x-hidden px-3 sm:px-4 lg:h-full lg:overflow-y-auto"
      /* No iPhone o rodapé do cartão ficava sob a barra de gestos. */
      style={{ paddingTop: "max(1.5rem, env(safe-area-inset-top))", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
    >
      <ToastContainer position="top-right" theme="dark" />

      <style>{`
 .cf-input:-webkit-autofill,
 .cf-input:-webkit-autofill:hover,
 .cf-input:-webkit-autofill:focus,
 .cf-input:-webkit-autofill:active {
 -webkit-text-fill-color: rgb(var(--ink));
 caret-color: rgb(var(--ink));
 border-radius: 8px;
 -webkit-box-shadow: 0 0 0 1000px rgb(var(--surface)) inset;
 box-shadow: 0 0 0 1000px rgb(var(--surface)) inset;
 transition: background-color 9999999s ease-in-out 0s;
 }

 @keyframes cf-rise {
 from { opacity: 0; transform: translateY(10px); }
 to { opacity: 1; transform: translateY(0); }
 }
 @keyframes cf-halo {
 0%, 100% { opacity: .5; transform: translate(-50%, -50%) scale(1); }
 50% { opacity: .75; transform: translate(-50%, -50%) scale(1.06); }
 }
 .cf-rise { animation: cf-rise .5s cubic-bezier(.22,.61,.36,1) both; }
 .cf-rise-2 { animation: cf-rise .5s cubic-bezier(.22,.61,.36,1) .08s both; }
 .cf-halo { animation: cf-halo 5.5s ease-in-out infinite; }

 @media (prefers-reduced-motion: reduce) {
 .cf-rise, .cf-rise-2, .cf-halo { animation: none; }
 }
 `}</style>

      {/* Glows de fundo — seguem o accent e somem no modo leve */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" style={{ opacity: "var(--fx-aurora, 1)" }}>
        <div className="absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full bg-accent opacity-[0.18] blur-[130px]" />
        <div className="absolute -bottom-24 -right-24 h-[420px] w-[420px] rounded-full opacity-[0.16] blur-[130px]" style={{ background: "rgb(var(--aurora-2))" }} />
        <div className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-soft opacity-[0.1] blur-[110px]" />
      </div>

      {/*
        A etapa dos planos é mais larga que as demais.

        Os outros passos são formulário — campo empilhado em coluna estreita
        lê melhor. A escolha do plano é comparação, e comparar em 576px
        obrigava a espremer o cartão até o preço quebrar linha. Só esta etapa
        abre para 896px; o resto continua como estava.
      */}
      <div className={`relative z-10 my-auto flex w-full max-w-sm flex-col transition-[max-width] duration-300 ${step === 0 ? "sm:max-w-4xl" : "sm:max-w-xl"}`}>
        {/* Logo e nome na horizontal, não empilhados.
            Empilhado, este bloco custava ~90px de altura — e o cadastro tem
            cinco etapas para caber na tela sem rolar. Deitado, custa 40px. */}
        <div className="cf-rise mb-3 flex items-center justify-center gap-2.5">
          <img src="/logo.png" alt="CodeEx Flow" width={36} height={36} className="h-9 w-9 rounded-lg shadow-glow" />
          <div className="flex flex-col leading-none">
            <span className="text-[17px] tracking-tight text-ink">
              CodeEx <span className="text-accent-soft">Flow</span>
            </span>
            <span className="mt-1 text-[9.5px] uppercase tracking-[2px] text-faint">Cadastro de empresa</span>
          </div>
        </div>

        {/* Card */}
        <div className="glass-liquid cf-rise-2 relative rounded-2xl p-4 sm:p-5">
          <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-accent-soft to-transparent opacity-70" />

          <div className="mb-0.5 flex items-baseline justify-between">
            <h1 className="text-base text-ink sm:text-lg">Cadastre sua empresa</h1>
            <span className="text-[11px] text-mist">
              {step + 1}/{STEPS.length}
            </span>
          </div>

          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-[11px] text-mist">{STEPS[step]}</p>

            {/* O plano escolhido acompanha o cliente em todas as etapas */}
            {planoEscolhido && step > 0 && (
              <button
                type="button"
                onClick={() => {
                  setDirecao(-1);
                  setStep(0);
                }}
                className="flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/[0.1] px-2.5 py-1 text-[10px] text-accent-soft transition hover:bg-accent/[0.18]"
              >
                <Sparkles size={11} />
                {planoEscolhido.nome} · {formatCurrencyFromCents(planoEscolhido.precoCentavos)}
                {CICLO_LABEL[planoEscolhido.ciclo]}
              </button>
            )}
          </div>

          {/* Indicador de etapas.
              `role="progressbar"` com os valores: sem isso, o leitor de tela
              via cinco divs coloridas e não sabia dizer em que passo a pessoa
              está — que é a única informação que a barra carrega. */}
          <div
            className="mb-3 flex gap-1.5 sm:mb-4"
            role="progressbar"
            aria-valuenow={step + 1}
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            aria-label={`Etapa ${step + 1} de ${STEPS.length}: ${STEPS[step]}`}
          >
            {STEPS.map((label, i) => (
              <div key={label} className="flex-1">
                <div className={`h-[3px] rounded-full transition-all duration-300 ${i <= step ? "bg-gradient-to-r from-accent-soft to-accent-strong" : "bg-fg/[0.08]"}`} />
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-1.5">
            <AnimatePresence mode="popLayout" initial={false} custom={direcao}>
              <motion.div
                key={step}
                custom={direcao}
                variants={reduzir ? undefined : VARIANTES}
                initial="entra"
                animate="centro"
                exit="sai"
                transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
                className="flex flex-col gap-1.5 sm:gap-2"
              >
            {/* ---------------- Etapa 1: Plano ---------------- */}
            {step === 0 && (
              <>
                {planosLoading && (
                  <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-mist">
                    <Loader2 size={15} className="animate-spin text-accent" />
                    Carregando...
                  </div>
                )}

                {!planosLoading && planos.length === 0 && (
                  <div className="flex flex-col items-center gap-3 py-8 text-center">
                    <p className="text-[13px] text-faint">
                      {erroCatalogo || "Nenhum plano disponível agora. Fale com o suporte para liberar seu cadastro."}
                    </p>

                    {/* A falha aqui costuma ser de rede, não de catálogo vazio:
                        sem esta saída a pessoa precisa recarregar a página e
                        perde o que já digitou. */}
                    {erroCatalogo && (
                      <button
                        type="button"
                        onClick={() => carregarCatalogo(true)}
                        className="focus-ring rounded-xl border border-fg/[0.1] px-3 py-1.5 text-[12px] text-mist transition hover:bg-fg/[0.04] hover:text-ink"
                      >
                        Tentar de novo
                      </button>
                    )}
                  </div>
                )}

                {/*
                  Os planos como cartões de KPI, num carrossel.

                  Saiu o diagnóstico de três perguntas: responder um
                  questionário para descobrir um plano é uma etapa a mais entre
                  a pessoa e a conta dela, e quem chegou até aqui já decidiu
                  que quer o sistema — falta só escolher o tamanho.

                  Quem quer detalhe abre o "Saber mais" no próprio cartão, sem
                  sair do cadastro. Mandar para outra página para ler sobre um
                  plano é mandar para fora do cadastro, e boa parte não volta.
                */}
                {!planosLoading && planos.length > 0 && (
                  <CarrosselPlanos
                    planos={planos}
                    selecionado={planoCodigo}
                    onSelecionar={(codigo) => setValue("planoCodigo", codigo, { shouldValidate: true })}
                  />
                )}

                <p role="alert" className={errCls}>{errors.planoCodigo?.message}</p>
              </>
            )}

            {/* ---------------- Etapa 2: Empresa ---------------- */}
            {step === 1 && (
              <>
                <div>
                  <label className={labelCls}>Nome fantasia</label>
                  <div className={fieldBox}>
                    <Building2 size={14} className="shrink-0 text-muted" />
                    <input {...register("nomeFantasia")} placeholder="Nome da sua empresa" className={inputCls} />
                  </div>
                  <p role="alert" className={errCls}>{errors.nomeFantasia?.message}</p>
                </div>

                <div>
                  <label className={labelCls}>Representante</label>
                  <div className={fieldBox}>
                    <User size={14} className="shrink-0 text-muted" />
                    <input {...register("nomeRepresentante")} placeholder="Nome completo do responsável" className={inputCls} />
                  </div>
                  <p role="alert" className={errCls}>{errors.nomeRepresentante?.message}</p>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <div>
                    <label className={labelCls}>CPF ou CNPJ</label>
                    <div className={fieldBox}>
                      <FileText size={14} className="shrink-0 text-muted" />
                      <input
                        {...regCpfCnpj}
                        onChange={(e) => {
                          e.target.value = maskCpfCnpj(e.target.value);
                          regCpfCnpj.onChange(e);
                        }}
                        inputMode="numeric"
                        placeholder="000.000.000-00"
                        className={inputCls}
                      />
                    </div>
                    <p role="alert" className={errCls}>{errors.cpfCnpj?.message}</p>
                  </div>

                  <div>
                    <label className={labelCls}>Insc. municipal</label>
                    <div className={fieldBox}>
                      <Hash size={14} className="shrink-0 text-muted" />
                      <input {...register("inscMunicipal")} placeholder="Opcional" className={inputCls} />
                    </div>
                    <p role="alert" className={errCls}>{errors.inscMunicipal?.message}</p>
                  </div>
                </div>

                {/* Só o logo. A "URL da imagem" ao lado apontava para um
                    campo que nenhuma tela usava — e, num cadastro, um campo
                    sem destino é trabalho pedido à toa. A logo em si se envia
                    depois, por arquivo, em Configurações › Empresa. */}
                <div>
                  <label className={labelCls}>URL do logo</label>
                  <div className={fieldBox}>
                    <ImageIcon size={14} className="shrink-0 text-muted" />
                    <input {...register("urlLogo")} placeholder="Opcional" className={inputCls} />
                  </div>
                  <p role="alert" className={errCls}>{errors.urlLogo?.message}</p>
                </div>
              </>
            )}

            {/* ---------------- Etapa 3: Contato ---------------- */}
            {step === 2 && (
              <>
                <div>
                  <label className={labelCls}>Email</label>
                  <div className={fieldBox}>
                    <Mail size={14} className="shrink-0 text-muted" />
                    <input {...register("contato.email")} type="email" placeholder="empresa@email.com" autoComplete="email" className={inputCls} />
                  </div>
                  {errors.contato?.email ? (
                    <p role="alert" className={errCls}>{errors.contato.email.message}</p>
                  ) : (
                    <p className="mt-0.5 min-h-[13px] text-[10px] leading-[13px] text-faint">Este e-mail será seu login no sistema.</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <div>
                    <label className={labelCls}>Celular</label>
                    <div className={fieldBox}>
                      <Smartphone size={14} className="shrink-0 text-muted" />
                      <input
                        {...regCelular}
                        onChange={(e) => {
                          e.target.value = maskPhone(e.target.value);
                          regCelular.onChange(e);
                        }}
                        inputMode="numeric"
                        placeholder="(00) 00000-0000"
                        className={inputCls}
                      />
                    </div>
                    <p role="alert" className={errCls}>{errors.contato?.celular?.message}</p>
                  </div>

                  <div>
                    <label className={labelCls}>Telefone</label>
                    <div className={fieldBox}>
                      <Phone size={14} className="shrink-0 text-muted" />
                      <input
                        {...regTelefone}
                        onChange={(e) => {
                          e.target.value = maskPhone(e.target.value);
                          regTelefone.onChange(e);
                        }}
                        inputMode="numeric"
                        placeholder="Opcional"
                        className={inputCls}
                      />
                    </div>
                    <p role="alert" className={errCls}>{errors.contato?.telefone?.message}</p>
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className={`${labelCls} mb-0`}>WhatsApp</label>
                    <button
                      type="button"
                      onClick={() =>
                        setValue("contato.whatsapp", getValues("contato.celular") ?? "", {
                          shouldValidate: true,
                        })
                      }
                      className="text-[10px] text-accent transition-colors hover:text-accent-soft"
                    >
                      Usar mesmo do celular
                    </button>
                  </div>
                  <div className={fieldBox}>
                    <MessageCircle size={14} className="shrink-0 text-muted" />
                    <input
                      {...regWhatsapp}
                      onChange={(e) => {
                        e.target.value = maskPhone(e.target.value);
                        regWhatsapp.onChange(e);
                      }}
                      inputMode="numeric"
                      placeholder="(00) 00000-0000 (opcional)"
                      className={inputCls}
                    />
                  </div>
                  <p role="alert" className={errCls}>{errors.contato?.whatsapp?.message}</p>
                </div>
              </>
            )}

            {/* ---------------- Etapa 4: Endereço ---------------- */}
            {step === 3 && (
              <>
                <div className="grid grid-cols-[1fr_90px] gap-x-3 gap-y-1.5">
                  <div>
                    <label className={labelCls}>CEP</label>
                    <div className={fieldBox}>
                      <MapPin size={14} className="shrink-0 text-muted" />
                      <input
                        {...regCep}
                        onChange={(e) => {
                          e.target.value = maskCep(e.target.value);
                          regCep.onChange(e);
                        }}
                        onBlur={(e) => {
                          regCep.onBlur(e);
                          buscarCep();
                        }}
                        inputMode="numeric"
                        placeholder="00000-000"
                        className={inputCls}
                      />
                      {cepLoading && <Loader2 size={14} className="shrink-0 animate-spin text-accent" />}
                    </div>
                    <p role="alert" className={errCls}>{errors.endereco?.cep?.message}</p>
                  </div>

                  <div>
                    <label className={labelCls}>Número</label>
                    <div className={fieldBox}>
                      <Hash size={14} className="shrink-0 text-muted" />
                      <input {...register("endereco.numero")} placeholder="123" className={inputCls} />
                    </div>
                    <p role="alert" className={errCls}>{errors.endereco?.numero?.message}</p>
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Logradouro</label>
                  <div className={fieldBox}>
                    <MapPin size={14} className="shrink-0 text-muted" />
                    <input {...register("endereco.logradouro")} placeholder="Rua, avenida..." className={inputCls} />
                  </div>
                  <p role="alert" className={errCls}>{errors.endereco?.logradouro?.message}</p>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <div>
                    <label className={labelCls}>Complemento</label>
                    <div className={fieldBox}>
                      <Hash size={14} className="shrink-0 text-muted" />
                      <input {...register("endereco.complemento")} placeholder="Opcional" className={inputCls} />
                    </div>
                    <p role="alert" className={errCls}>{errors.endereco?.complemento?.message}</p>
                  </div>

                  <div>
                    <label className={labelCls}>Bairro</label>
                    <div className={fieldBox}>
                      <MapPin size={14} className="shrink-0 text-muted" />
                      <input {...register("endereco.bairro")} placeholder="Seu bairro" className={inputCls} />
                    </div>
                    <p role="alert" className={errCls}>{errors.endereco?.bairro?.message}</p>
                  </div>
                </div>

                <div className="grid grid-cols-[1fr_90px] gap-x-3 gap-y-1.5">
                  <div>
                    <label className={labelCls}>Cidade</label>
                    <div className={fieldBox}>
                      <Building2 size={14} className="shrink-0 text-muted" />
                      <input {...register("endereco.cidade")} placeholder="Sua cidade" className={inputCls} />
                    </div>
                    <p role="alert" className={errCls}>{errors.endereco?.cidade?.message}</p>
                  </div>

                  <div>
                    <label className={labelCls}>UF</label>
                    <div className={fieldBox}>
                      <select {...register("endereco.uf")} className={`${inputCls} cursor-pointer appearance-none [&>option]:bg-surface-raised`}>
                        <option value="">UF</option>
                        {UFS.map((uf) => (
                          <option key={uf} value={uf}>
                            {uf}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p role="alert" className={errCls}>{errors.endereco?.uf?.message}</p>
                  </div>
                </div>
              </>
            )}

            {/* ---------------- Etapa 5: Acesso e revisão ---------------- */}
            {step === 4 && (
              <>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <div>
                    <label className={labelCls}>Senha</label>
                    <div className={fieldBox}>
                      <Lock size={14} className="shrink-0 text-muted" />
                      <input {...register("senha")} type={verSenha ? "text" : "password"} placeholder="Mínimo 6 caracteres" autoComplete="new-password" className={inputCls} />
                      <button type="button" onClick={() => setVerSenha((v) => !v)} className="shrink-0 text-muted transition hover:text-ink" aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}>
                        {verSenha ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <p role="alert" className={errCls}>{errors.senha?.message}</p>
                  </div>

                  <div>
                    <label className={labelCls}>Confirmar senha</label>
                    <div className={fieldBox}>
                      <Lock size={14} className="shrink-0 text-muted" />
                      <input {...register("confirmarSenha")} type={verSenha ? "text" : "password"} placeholder="Repita a senha" autoComplete="new-password" className={inputCls} />
                    </div>
                    <p role="alert" className={errCls}>{errors.confirmarSenha?.message}</p>
                  </div>
                </div>

                {/* Revisão — o cliente confere antes de enviar */}
                <div className="mt-1 rounded-xl border border-fg/[0.08] bg-fg/[0.02] p-3.5">
                  <p className={labelCls}>Confira seus dados</p>

                  <div className="flex flex-col divide-y divide-fg/[0.05]">
                    {planoEscolhido && (
                      <div className="flex items-center justify-between gap-3 py-1.5">
                        <span className="text-[12px] text-mist">Plano</span>
                        <span className="truncate text-[12px] text-ink">
                          {planoEscolhido.nome} — {formatCurrencyFromCents(planoEscolhido.precoCentavos)}
                          {CICLO_LABEL[planoEscolhido.ciclo]}
                        </span>
                      </div>
                    )}

                    {resumo().map((linha) => (
                      <div key={linha.label} className="flex items-center justify-between gap-3 py-1.5">
                        <span className="shrink-0 text-[12px] text-mist">{linha.label}</span>
                        <span className="min-w-0 truncate text-right text-[12px] text-ink">{linha.valor}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <label className="mt-1 flex cursor-pointer items-start gap-2 text-[11px] leading-relaxed text-mist">
                  <input type="checkbox" {...register("aceite")} className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[rgb(var(--accent))]" />
                  <span>
                    Concordo em pagar a assinatura via Pix e entendo que o acesso é liberado após a confirmação do
                    primeiro pagamento.
                  </span>
                </label>
                <p role="alert" className={errCls}>{errors.aceite?.message}</p>
              </>
            )}

              </motion.div>
            </AnimatePresence>

            {/* ---------------- Navegação entre etapas ---------------- */}
            <div className="mt-1 flex gap-2">
              {step > 0 && (
                <button type="button" onClick={prevStep} className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border border-fg/[0.08] bg-fg/[0.04] px-5 text-[14px] text-mist transition hover:border-fg/[0.14] hover:bg-fg/[0.07] active:scale-[0.99] sm:min-h-0 sm:rounded-lg sm:px-4 sm:py-2.5 sm:text-sm">
                  <ArrowLeft size={13} />
                  Voltar
                </button>
              )}

              {step < STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={nextStep}
                  className="group relative flex min-h-[48px] flex-1 items-center justify-center gap-1.5 overflow-hidden rounded-xl bg-gradient-to-r from-accent-soft via-accent to-accent-strong text-[14px] text-white sm:min-h-0 sm:rounded-lg sm:py-2.5 shadow-[0_10px_25px_-8px_rgba(108,92,231,0.7)] transition-all duration-200 hover:brightness-110 hover:shadow-[0_14px_35px_-8px_rgba(59,110,245,0.65)] active:scale-[0.99] sm:text-sm"
                >
                  <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-fg/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                  <span className="relative flex items-center gap-1.5">
                    Continuar
                    <ArrowRight size={13} />
                  </span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isLoading}
                  className="group relative min-h-[48px] flex-1 overflow-hidden rounded-xl bg-gradient-to-r from-accent-soft via-accent to-accent-strong px-3 text-[14px] text-white sm:min-h-0 sm:rounded-lg sm:py-2.5 shadow-[0_10px_25px_-8px_rgba(108,92,231,0.7)] transition-all duration-200 hover:brightness-110 hover:shadow-[0_14px_35px_-8px_rgba(59,110,245,0.65)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100 sm:text-sm"
                >
                  <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-fg/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                  <span className="relative">{isLoading ? "Cadastrando..." : "Criar conta e falar com a gente"}</span>
                </button>
              )}
            </div>
          </form>

        </div>

        {/* As duas saídas com o mesmo peso: quem já tem conta e quem ainda está
            conhecendo estão igualmente fora do cadastro. Um link de 11px perdido
            no rodapé fazia quem já é cliente procurar como voltar. */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="focus-ring flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-fg/[0.1] text-[13px] text-mist transition-colors hover:border-fg/[0.2] hover:text-ink active:bg-fg/[0.05]"
          >
            <LogIn size={15} className="text-accent-soft" />
            Já tenho conta
          </button>

          <button
            type="button"
            onClick={() => navigate(LANDING_ROUTE)}
            className="focus-ring flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-fg/[0.1] text-[13px] text-mist transition-colors hover:border-fg/[0.2] hover:text-ink active:bg-fg/[0.05]"
          >
            <Sparkles size={15} className="text-accent-soft" />
            Conhecer o Flow
          </button>
        </div>

        <p className="mt-3 text-center text-[10px] text-muted">© {new Date().getFullYear()} CodeEx Flow</p>
      </div>
      </div>
    </div>
  );
};

export default CadastroEmpresaPage;
