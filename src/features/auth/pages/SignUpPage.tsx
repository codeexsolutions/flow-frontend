import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Building2, User, Mail, Smartphone, MessageCircle, MapPin, Hash, FileText,
  ArrowLeft, ArrowRight, Loader2, Lock, Eye, EyeOff, Sparkles,
  Zap, QrCode, Repeat, LogIn,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotionConfig } from "framer-motion";
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

/*
 * As mensagens falam com a pessoa, não com o formulário.
 *
 * Quem se cadastra aqui muitas vezes nunca usou um sistema de gestão:
 * "Obrigatório" e "CPF/CNPJ inválido" soam como bronca e não dizem o que
 * fazer. Cada mensagem diz o que falta e como resolver.
 *
 * Saíram do cadastro a inscrição municipal, o logo, o telefone fixo e a
 * confirmação de senha. Nenhum deles é preciso para começar a usar — a
 * inscrição e o logo se preenchem depois, em Configurações › Empresa — e
 * cada campo a mais é um motivo para a pessoa leiga parar no meio.
 */
const cadastroSchema = z.object({
  planoCodigo: z.string().min(1, "Escolha um dos planos para continuar."),

  nomeFantasia: z.string().trim().min(1, "Escreva o nome do seu negócio."),
  nomeRepresentante: z.string().trim().min(1, "Escreva o seu nome."),
  cpfCnpj: z
    .string()
    .min(1, "Digite o seu CPF ou o CNPJ da empresa.")
    .refine(isValidCpfCnpj, "Esse número não está certo. Confere de novo?"),

  contato: z.object({
    email: z.string().trim().min(1, "Digite o seu e-mail.").email("Esse e-mail não parece certo. Confere de novo?"),
    celular: z
      .string()
      .min(1, "Digite o seu celular.")
      .refine((v) => onlyDigits(v).length === 11, "Faltam números. Coloque o DDD e os 9 dígitos."),
    /* Marcado de início: para quase todo mundo o celular É o WhatsApp, e
       perguntar o mesmo número duas vezes faz a pessoa achar que entendeu
       errado. */
    mesmoWhatsapp: z.boolean(),
    whatsapp: z
      .string()
      .optional()
      .refine((v) => !v || onlyDigits(v).length === 11, "Faltam números. Coloque o DDD e os 9 dígitos."),
  }),

  endereco: z.object({
    cep: z
      .string()
      .min(1, "Digite o CEP.")
      .refine((v) => onlyDigits(v).length === 8, "O CEP tem 8 números."),
    logradouro: z.string().trim().min(1, "Escreva o nome da rua."),
    numero: z.string().trim().min(1, "Coloque o número (se não tiver, escreva S/N)."),
    complemento: z.string().optional(),
    bairro: z.string().trim().min(1, "Escreva o bairro."),
    cidade: z.string().trim().min(1, "Escreva a cidade."),
    uf: z.string().min(1, "Escolha"),
  }),

  senha: z.string().min(6, "A senha precisa ter pelo menos 6 letras ou números."),
  aceite: z.boolean().refine((v) => v === true, "Marque aqui para continuar."),
});

type CadastroFormInputs = z.infer<typeof cadastroSchema>;

/* ------------------------------------------------------------------ */
/* Etapas */
/* ------------------------------------------------------------------ */

/*
 * Uma pergunta por tela.
 *
 * O cadastro era cinco telas de formulário; para quem nunca usou sistema,
 * uma tela com três campos já é um formulário de banco. Agora o Flow faz
 * uma pergunta de cada vez, a pessoa responde e aperta Enter (ou
 * "Continuar"). São mais telas, mas cada uma se responde sem pensar.
 */
const STEPS = ["Plano", "Negócio", "Seu nome", "CPF ou CNPJ", "E-mail", "Celular", "CEP", "Endereço", "Senha", "Confirmar"] as const;

const PASSO = {
  PLANO: 0, NEGOCIO: 1, NOME: 2, DOCUMENTO: 3, EMAIL: 4, CELULAR: 5, CEP: 6, ENDERECO: 7, SENHA: 8, CONFIRMAR: 9,
} as const;

const STEP_FIELDS: Record<number, string[]> = {
  [PASSO.PLANO]: ["planoCodigo"],
  [PASSO.NEGOCIO]: ["nomeFantasia"],
  [PASSO.NOME]: ["nomeRepresentante"],
  [PASSO.DOCUMENTO]: ["cpfCnpj"],
  [PASSO.EMAIL]: ["contato.email"],
  [PASSO.CELULAR]: ["contato.celular", "contato.whatsapp"],
  [PASSO.CEP]: ["endereco.cep"],
  [PASSO.ENDERECO]: ["endereco.logradouro", "endereco.numero", "endereco.complemento", "endereco.bairro", "endereco.cidade", "endereco.uf"],
  [PASSO.SENHA]: ["senha"],
  [PASSO.CONFIRMAR]: ["aceite"],
};

type Valores = {
  nome: string;
  endereco: { logradouro?: string; bairro?: string; cidade?: string; uf?: string };
  enderecoManual: boolean;
};

/**
 * O que o Flow pergunta em cada tela — a pergunta é o próprio rótulo do
 * campo. Depois que a pessoa diz o nome, o Flow passa a chamá-la por ele.
 */
const falaDoPasso = (passo: number, v: Valores): { titulo: string; texto: string } => {
  const primeiroNome = v.nome.trim().split(/\s+/)[0] ?? "";

  switch (passo) {
    case PASSO.PLANO:
      return {
        titulo: "Oi! Vamos criar a sua conta juntos.",
        texto: "Primeiro, escolha um plano. Se você só quer conhecer o sistema, comece pelo Starter. Dá para mudar depois.",
      };
    case PASSO.NEGOCIO:
      return { titulo: "Qual é o nome do seu negócio?", texto: "É o nome que os seus clientes conhecem." };
    case PASSO.NOME:
      return { titulo: "E qual é o seu nome?", texto: "Para a gente saber com quem está falando." };
    case PASSO.DOCUMENTO:
      return {
        titulo: primeiroNome ? `Prazer, ${primeiroNome}! Qual é o seu CPF ou o CNPJ da empresa?` : "Qual é o seu CPF ou o CNPJ da empresa?",
        texto: "Não tem CNPJ? Sem problema, use o seu CPF.",
      };
    case PASSO.EMAIL:
      return { titulo: "Qual é o seu e-mail?", texto: "Guarde bem: você vai usar ele para entrar no sistema." };
    case PASSO.CELULAR:
      return { titulo: "Qual é o seu celular, com DDD?", texto: "É por ele que a gente fala com você se precisar." };
    case PASSO.CEP:
      return { titulo: "Qual é o CEP do seu negócio?", texto: "A gente completa a rua, o bairro e a cidade para você." };
    case PASSO.ENDERECO:
      return v.enderecoManual
        ? { titulo: "Me conta o endereço, então.", texto: "Não encontrei esse CEP. Preencha aqui embaixo." }
        : {
            titulo: "Achei! Qual é o número?",
            texto: [v.endereco.logradouro, v.endereco.bairro].filter(Boolean).join(", ")
              + (v.endereco.cidade ? ` — ${v.endereco.cidade}/${v.endereco.uf ?? ""}` : ""),
          };
    case PASSO.SENHA:
      return { titulo: "Agora crie uma senha.", texto: "Pelo menos 6 letras ou números. Toque em \"Mostrar\" para conferir o que digitou." };
    default:
      return { titulo: "Prontinho! Está tudo certo?", texto: "Confira os seus dados. Se estiver tudo certo, é só criar a conta." };
  }
};

/**
 * Só estes planos aparecem no cadastro.
 *
 * A API já filtra a vitrine (`catalogo.ts`); o filtro aqui é a segunda
 * trava, para um ajuste no banco ou na API não fazer o cadastro oferecer
 * Premium ou Enterprise a quem está começando.
 */
const PLANOS_DO_CADASTRO = ["STARTER", "STANDARD", "PROFESSIONAL"];

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
  const reduzir = useReducedMotionConfig();
  const [isLoading, setIsLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [verSenha, setVerSenha] = useState(false);
  /* CEP não encontrado (ou endereço errado): abre os campos para digitar. */
  const [enderecoManual, setEnderecoManual] = useState(false);

  /*
   * Os planos vêm do catálogo compartilhado, carregado no boot do app.
   *
   * A tela não busca mais nada: quando o cadastro abre, a lista já está em
   * memória e a etapa do plano nasce com o cartão pronto. Buscar aqui fazia a
   * etapa abrir vazia e o cartão entrar depois, empurrando o layout.
   */
  const todosPlanos = useCatalogo((s) => s.planos);
  const planos = useMemo(() => todosPlanos.filter((p) => PLANOS_DO_CADASTRO.includes(p.codigo)), [todosPlanos]);
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
    defaultValues: {
      endereco: { uf: "" },
      contato: { mesmoWhatsapp: true },
      planoCodigo: searchParams.get("plano") ?? "",
      aceite: false,
    },
  });

  const planoCodigo = watch("planoCodigo");
  const mesmoWhatsapp = watch("contato.mesmoWhatsapp");
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

  /** Preenche o endereço pelo CEP. Devolve `true` se encontrou. */
  const buscarCep = async (): Promise<boolean> => {
    const cep = onlyDigits(getValues("endereco.cep") ?? "");
    if (cep.length !== 8) return false;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data.erro) return false;
      setValue("endereco.logradouro", data.logradouro ?? "", { shouldValidate: false });
      setValue("endereco.bairro", data.bairro ?? "", { shouldValidate: false });
      setValue("endereco.cidade", data.localidade ?? "", { shouldValidate: false });
      setValue("endereco.uf", data.uf ?? "", { shouldValidate: false });
      // CEP de cidade pequena vem sem rua: aí a pessoa precisa digitar.
      return Boolean(data.logradouro);
    } catch {
      return false;
    } finally {
      setCepLoading(false);
    }
  };

  /* ------------------------- Navegação ------------------------- */

  const nextStep = async () => {
    const valid = await trigger(STEP_FIELDS[step] as never[]);

    if (!valid) {
      // Faltou rua, bairro ou cidade: mostra os campos em vez de um erro
      // sobre algo que a pessoa nem está vendo.
      if (step === PASSO.ENDERECO) setEnderecoManual(true);
      return;
    }

    if (step === PASSO.CEP) {
      const achou = await buscarCep();
      setEnderecoManual(!achou);
    }

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
    const toastId = toast.loading("Criando a sua conta...");

    const cpfCnpj = onlyDigits(data.cpfCnpj);

    const payload = {
      nomeRepresentante: data.nomeRepresentante,
      nomeFantasia: data.nomeFantasia,
      cpfCnpj,
      // Fora do cadastro: preenchidos depois, em Configurações › Empresa.
      inscMunicipal: "",
      urlLogo: "",
      planoCodigo: data.planoCodigo,
      senha: data.senha,
      contato: {
        email: data.contato.email,
        celular: onlyDigits(data.contato.celular),
        telefone: "",
        whatsapp: onlyDigits(data.contato.mesmoWhatsapp ? data.contato.celular : data.contato.whatsapp ?? ""),
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

      toast.update(toastId, { render: "Pronto! Sua conta foi criada. Entrando...", type: "success", isLoading: false, autoClose: 1500 });

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
          telefone: onlyDigits((!data.contato.mesmoWhatsapp && data.contato.whatsapp) || data.contato.celular),
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
          render: "Sua conta foi criada! Agora é só entrar com o seu e-mail e senha.",
          type: "info",
          isLoading: false,
          autoClose: 3000,
        });

        navigate("/login", { replace: true });
        return;
      }

      toast.update(toastId, {
        render: `Não deu para criar a conta: ${mensagem}`,
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
  /* Rótulo em frase e em tamanho de leitura: a etiqueta de 10px em caixa
     alta lia como formulário de repartição, não como pergunta. */
  const labelCls = "block text-[13px] text-ink mb-1";
  /* Campo grande: é uma pergunta por tela, então sobra espaço — e letra
     de 13px é pequena para quem digita devagar no celular. */
  const inputCls = "cf-input w-full flex-1 min-w-0 bg-transparent outline-none py-3.5 text-base text-ink placeholder:text-faint";
  const errCls = "mt-1 min-h-[15px] text-[12px] leading-[15px] text-danger";

  /* registros com máscara */
  const regCpfCnpj = register("cpfCnpj");
  const regCep = register("endereco.cep");
  const regCelular = register("contato.celular");
  const regWhatsapp = register("contato.whatsapp");

  /** Resumo mostrado na última etapa, antes de enviar. */
  const resumo = () => {
    const v = getValues();
    return [
      { label: "Negócio", valor: v.nomeFantasia },
      { label: "Seu nome", valor: v.nomeRepresentante },
      { label: "CPF ou CNPJ", valor: v.cpfCnpj },
      { label: "E-mail (seu login)", valor: v.contato?.email },
      { label: "Celular", valor: v.contato?.celular },
      {
        label: "Endereço",
        valor: v.endereco?.logradouro ? `${v.endereco.logradouro}, ${v.endereco.numero} — ${v.endereco.cidade}/${v.endereco.uf}` : "",
      },
    ].filter((linha) => linha.valor);
  };

  const fala = falaDoPasso(step, {
    nome: getValues("nomeRepresentante") ?? "",
    endereco: getValues("endereco") ?? {},
    enderecoManual,
  });

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
            <span className="mt-1 text-[9.5px] uppercase tracking-[2px] text-faint">Criar conta</span>
          </div>
        </div>

        {/* Card */}
        <div className="glass-liquid cf-rise-2 relative rounded-2xl p-4 sm:p-5">
          <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-accent-soft to-transparent opacity-70" />

          <div className="mb-0.5 flex items-baseline justify-between">
            <h1 className="text-base text-ink sm:text-lg">Vamos criar a sua conta</h1>
            <span className="text-[11px] text-mist">
              Passo {step + 1} de {STEPS.length}
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

          <form
            onSubmit={handleSubmit(onSubmit)}
            /* Enter responde e vai para a próxima pergunta, como numa conversa.
               Só na última tela ele envia o formulário. */
            onKeyDown={(e) => {
              if (e.key !== "Enter" || step >= STEPS.length - 1) return;
              if ((e.target as HTMLElement).tagName === "BUTTON") return;
              e.preventDefault();
              nextStep();
            }}
            className="flex flex-col gap-1.5"
          >
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
            {/* A fala do Flow abre cada etapa, como numa conversa. */}
            <div className="mb-1.5 flex items-start gap-2.5">
              <img src="/logo.png" alt="" width={28} height={28} className="mt-0.5 h-7 w-7 shrink-0 rounded-full" />
              <div className="min-w-0 rounded-2xl rounded-tl-sm border border-accent/20 bg-accent/[0.07] px-3.5 py-2.5">
                <p className="text-[15px] text-ink">{fala.titulo}</p>
                {fala.texto && <p className="mt-0.5 text-[13px] leading-relaxed text-mist">{fala.texto}</p>}
              </div>
            </div>

            {/* ---------------- Etapa 1: Plano ---------------- */}
            {step === PASSO.PLANO && (
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

            {/* ---------------- Nome do negócio ---------------- */}
            {step === PASSO.NEGOCIO && (
              <div>
                <div className={fieldBox}>
                  <Building2 size={16} className="shrink-0 text-muted" />
                  <input {...register("nomeFantasia")} autoFocus placeholder="Ex.: Gráfica Bom Preço" autoComplete="organization" className={inputCls} />
                </div>
                <p role="alert" className={errCls}>{errors.nomeFantasia?.message}</p>
              </div>
            )}

            {/* ---------------- Nome da pessoa ---------------- */}
            {step === PASSO.NOME && (
              <div>
                <div className={fieldBox}>
                  <User size={16} className="shrink-0 text-muted" />
                  <input {...register("nomeRepresentante")} autoFocus placeholder="Seu nome completo" autoComplete="name" className={inputCls} />
                </div>
                <p role="alert" className={errCls}>{errors.nomeRepresentante?.message}</p>
              </div>
            )}

            {/* ---------------- CPF ou CNPJ ---------------- */}
            {step === PASSO.DOCUMENTO && (
              <div>
                <div className={fieldBox}>
                  <FileText size={16} className="shrink-0 text-muted" />
                  <input
                    {...regCpfCnpj}
                    onChange={(e) => {
                      e.target.value = maskCpfCnpj(e.target.value);
                      regCpfCnpj.onChange(e);
                    }}
                    autoFocus
                    inputMode="numeric"
                    placeholder="Só os números"
                    className={inputCls}
                  />
                </div>
                <p role="alert" className={errCls}>{errors.cpfCnpj?.message}</p>
              </div>
            )}

            {/* ---------------- E-mail ---------------- */}
            {step === PASSO.EMAIL && (
              <div>
                <div className={fieldBox}>
                  <Mail size={16} className="shrink-0 text-muted" />
                  <input {...register("contato.email")} autoFocus type="email" placeholder="voce@email.com" autoComplete="email" className={inputCls} />
                </div>
                <p role="alert" className={errCls}>{errors.contato?.email?.message}</p>
              </div>
            )}

            {/* ---------------- Celular ---------------- */}
            {step === PASSO.CELULAR && (
              <>
                <div>
                  <div className={fieldBox}>
                    <Smartphone size={16} className="shrink-0 text-muted" />
                    <input
                      {...regCelular}
                      onChange={(e) => {
                        e.target.value = maskPhone(e.target.value);
                        regCelular.onChange(e);
                      }}
                      autoFocus
                      inputMode="numeric"
                      autoComplete="tel"
                      placeholder="(00) 00000-0000"
                      className={inputCls}
                    />
                  </div>
                  <p role="alert" className={errCls}>{errors.contato?.celular?.message}</p>
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-[14px] text-mist">
                  <input type="checkbox" {...register("contato.mesmoWhatsapp")} className="h-[18px] w-[18px] shrink-0 accent-[rgb(var(--accent))]" />
                  Esse celular também é o meu WhatsApp
                </label>

                {!mesmoWhatsapp && (
                  <div className="mt-2">
                    <label className={labelCls}>Qual é o seu WhatsApp? (se não tiver, deixe em branco)</label>
                    <div className={fieldBox}>
                      <MessageCircle size={16} className="shrink-0 text-muted" />
                      <input
                        {...regWhatsapp}
                        onChange={(e) => {
                          e.target.value = maskPhone(e.target.value);
                          regWhatsapp.onChange(e);
                        }}
                        inputMode="numeric"
                        placeholder="(00) 00000-0000"
                        className={inputCls}
                      />
                    </div>
                    <p role="alert" className={errCls}>{errors.contato?.whatsapp?.message}</p>
                  </div>
                )}
              </>
            )}

            {/* ---------------- CEP ---------------- */}
            {step === PASSO.CEP && (
              <div>
                <div className={fieldBox}>
                  <MapPin size={16} className="shrink-0 text-muted" />
                  <input
                    {...regCep}
                    onChange={(e) => {
                      e.target.value = maskCep(e.target.value);
                      regCep.onChange(e);
                    }}
                    autoFocus
                    inputMode="numeric"
                    placeholder="00000-000"
                    className={inputCls}
                  />
                  {cepLoading && <Loader2 size={16} className="shrink-0 animate-spin text-accent" />}
                </div>
                <p role="alert" className={errCls}>{errors.endereco?.cep?.message}</p>
              </div>
            )}

            {/* ---------------- Número (e o resto, se o CEP não achou) ---------------- */}
            {step === PASSO.ENDERECO && (
              <>
                <div className="grid grid-cols-2 gap-x-3">
                  <div>
                    <label className={labelCls}>Número</label>
                    <div className={fieldBox}>
                      <Hash size={16} className="shrink-0 text-muted" />
                      <input {...register("endereco.numero")} autoFocus={!enderecoManual} placeholder="Ex.: 123" className={inputCls} />
                    </div>
                    <p role="alert" className={errCls}>{errors.endereco?.numero?.message}</p>
                  </div>

                  <div>
                    <label className={labelCls}>Complemento</label>
                    <div className={fieldBox}>
                      <input {...register("endereco.complemento")} placeholder="Se tiver" className={inputCls} />
                    </div>
                  </div>
                </div>

                {enderecoManual ? (
                  <>
                    <div>
                      <label className={labelCls}>Rua</label>
                      <div className={fieldBox}>
                        <MapPin size={16} className="shrink-0 text-muted" />
                        <input {...register("endereco.logradouro")} autoFocus placeholder="Rua, avenida, travessa..." className={inputCls} />
                      </div>
                      <p role="alert" className={errCls}>{errors.endereco?.logradouro?.message}</p>
                    </div>

                    <div>
                      <label className={labelCls}>Bairro</label>
                      <div className={fieldBox}>
                        <input {...register("endereco.bairro")} placeholder="Seu bairro" className={inputCls} />
                      </div>
                      <p role="alert" className={errCls}>{errors.endereco?.bairro?.message}</p>
                    </div>

                    <div className="grid grid-cols-[1fr_96px] gap-x-3">
                      <div>
                        <label className={labelCls}>Cidade</label>
                        <div className={fieldBox}>
                          <input {...register("endereco.cidade")} placeholder="Sua cidade" className={inputCls} />
                        </div>
                        <p role="alert" className={errCls}>{errors.endereco?.cidade?.message}</p>
                      </div>

                      <div>
                        <label className={labelCls}>Estado</label>
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
                ) : (
                  <button type="button" onClick={() => setEnderecoManual(true)} className="w-fit text-[13px] text-accent transition-colors hover:text-accent-soft">
                    O endereço está errado? Corrigir
                  </button>
                )}
              </>
            )}

            {/* ---------------- Senha ---------------- */}
            {step === PASSO.SENHA && (
              <div>
                <div className={fieldBox}>
                  <Lock size={16} className="shrink-0 text-muted" />
                  <input {...register("senha")} autoFocus type={verSenha ? "text" : "password"} placeholder="Sua senha" autoComplete="new-password" className={inputCls} />
                  <button type="button" onClick={() => setVerSenha((v) => !v)} className="flex shrink-0 items-center gap-1 text-[12px] text-muted transition hover:text-ink" aria-label={verSenha ? "Esconder senha" : "Mostrar senha"}>
                    {verSenha ? <EyeOff size={15} /> : <Eye size={15} />}
                    {verSenha ? "Esconder" : "Mostrar"}
                  </button>
                </div>
                <p role="alert" className={errCls}>{errors.senha?.message}</p>
              </div>
            )}

            {/* ---------------- Confirmar ---------------- */}
            {step === PASSO.CONFIRMAR && (
              <>
                <div className="rounded-xl border border-fg/[0.08] bg-fg/[0.02] p-3.5">
                  <div className="flex flex-col divide-y divide-fg/[0.05]">
                    {planoEscolhido && (
                      <div className="flex items-center justify-between gap-3 py-2">
                        <span className="text-[13px] text-mist">Plano</span>
                        <span className="truncate text-[13px] text-ink">
                          {planoEscolhido.nome} — {formatCurrencyFromCents(planoEscolhido.precoCentavos)}
                          {CICLO_LABEL[planoEscolhido.ciclo]}
                        </span>
                      </div>
                    )}

                    {resumo().map((linha) => (
                      <div key={linha.label} className="flex items-center justify-between gap-3 py-2">
                        <span className="shrink-0 text-[13px] text-mist">{linha.label}</span>
                        <span className="min-w-0 truncate text-right text-[13px] text-ink">{linha.valor}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <label className="mt-2 flex cursor-pointer items-start gap-2.5 text-[13px] leading-relaxed text-mist">
                  <input type="checkbox" {...register("aceite")} className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[rgb(var(--accent))]" />
                  <span>
                    Entendi que pago a mensalidade por Pix e que o sistema é liberado depois que o primeiro pagamento
                    for confirmado.
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
                  <span className="relative">{isLoading ? "Criando sua conta..." : "Criar minha conta"}</span>
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
