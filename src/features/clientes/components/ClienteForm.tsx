import { useEffect, useMemo, useState } from "react";
import { useForm, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, useReducedMotionConfig } from "framer-motion";
import {
  BadgeCheck, Cake, Check, Home, IdCard, Mail, MapPin,
  MessageCircle, Phone, Save, Search, Smartphone, Loader2, UserRound, Users,
} from "lucide-react";

import ClientType, { eSexo, eStatus, SEXO_LABEL } from "@/shared/domain/cliente";
import { Modal } from "@/shared/ui/Modal";
import { useAlert } from "@/shared/ui/Alert";
import { FormSection, SelectBox, TextField } from "@/shared/ui/form/FormKit";
import { useBuscaCep } from "@/shared/hooks/useBuscaCep";
import { onlyDigits } from "@/shared/utils/format";
import { maskCep, maskCpfCnpj, maskPhone, UFS } from "@/shared/validation/masks";
import { clienteSchema, type ClienteFormData, type ClienteFormInput } from "@/features/clientes/schema/cliente.schema";

/**
 * Ficha do cliente — a mesma no cadastro e na edição.
 *
 * Antes eram dois formulários: um com input próprio e tooltip de ajuda (o novo
 * cliente, aberto pelo PDV e pela lista) e outro montado no FormKit (a edição).
 * Divergiam nos rótulos, na máscara e até no que era obrigatório — e cada campo
 * novo precisava ser escrito duas vezes. Aqui é um só: `cliente` presente
 * significa edição.
 *
 * A regra da tela: **só o nome é obrigatório**. Documento, nascimento, sexo,
 * contato e endereço são o que se descobre sobre o cliente com o tempo, não
 * um pedágio para o cadastro acontecer.
 *
 * As catorze perguntas vêm em TRÊS ABAS, não numa coluna só: catorze campos
 * de uma vez leem como formulário de banco, e quem está com cliente no balcão
 * olha a pilha e adia o cadastro.
 *
 * As abas NÃO são um caminho obrigatório. Não há "Continuar": o botão de
 * cadastrar está disponível desde a primeira, e as outras duas são para quem
 * tem o dado na mão agora. Fatiar um formulário e depois obrigar a atravessar
 * as três telas seria trocar uma pilha por um corredor.
 */

/** As três perguntas do cadastro, na ordem em que a loja as responde. */
const ETAPAS = [
  { titulo: "Identificação", resumo: "Quem é o cliente", icone: UserRound },
  { titulo: "Contato", resumo: "Como falar com ele", icone: Phone },
  { titulo: "Endereço", resumo: "Onde ele está", icone: MapPin },
] as const;

/**
 * A entrada do conteúdo ao trocar de etapa.
 *
 * Animação de CSS, e não `AnimatePresence` como nas fichas de produto e de
 * funcionário. Lá a aba que sai é DESMONTADA — é o que o `AnimatePresence`
 * precisa para animar a saída. Aqui as três etapas ficam montadas de propósito
 * (ver a nota logo acima delas), então não há o que desmontar, e forçar isso
 * para ganhar a animação trocaria um enfeite por um formulário que perde o que
 * foi digitado.
 *
 * O `fade-up` do tema resolve sem esse custo: uma animação de CSS REINICIA
 * sozinha quando o elemento sai de `display: none`, que é exatamente o que a
 * troca de aba faz. `motion-reduce` desliga para quem pediu menos movimento.
 */
const ETAPA_VISIVEL = "flex flex-col gap-5 animate-fade-up motion-reduce:animate-none";

const toDefaults = (c?: Partial<ClientType> | null): ClienteFormInput => ({
  nome: c?.nome ?? "",
  cpfCnpj: c?.cpfCnpj ? maskCpfCnpj(c.cpfCnpj) : "",
  status: c?.status ?? eStatus.ATIVO,
  dataNascimento: c?.dataNascimento ?? "",
  sexo: c?.sexo ?? "",
  contato: {
    telefone: maskPhone(String(c?.contato?.telefone ?? "")),
    celular: maskPhone(String(c?.contato?.celular ?? "")),
    whatsapp: maskPhone(String(c?.contato?.whatsapp ?? "")),
    email: c?.contato?.email ?? "",
  },
  endereco: {
    cep: maskCep(String(c?.endereco?.cep ?? "")),
    logradouro: c?.endereco?.logradouro ?? "",
    numero: c?.endereco?.numero ?? "",
    complemento: c?.endereco?.complemento ?? "",
    bairro: c?.endereco?.bairro ?? "",
    cidade: c?.endereco?.cidade ?? "",
    uf: c?.endereco?.uf ?? "",
  },
});

type Props = {
  /** Padrão `true`: a lista e o PDV montam o formulário só quando ele abre. */
  open?: boolean;
  /** Presente = edição. Ausente = cadastro novo. */
  cliente?: ClientType | null;
  /**
   * Campos com que um cadastro NOVO já nasce preenchido.
   *
   * Diferente de `cliente`: aqui continua sendo cadastro, com o título e o
   * botão de cadastro. Serve para quem chega de um orçamento feito para nome
   * livre — o nome e o telefone já estão escritos na proposta, e pedir para
   * redigitá-los é o tipo de trabalho que faz o cadastro não acontecer.
   */
  prefill?: Partial<ClientType> | null;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (data: ClienteFormData) => void | Promise<void>;
};

const ClienteForm = ({ open = true, cliente, prefill, saving = false, onClose, onSubmit }: Props) => {
  const alert = useAlert();
  const { buscar, buscando } = useBuscaCep();
  const reduzir = useReducedMotionConfig();
  const editando = Boolean(cliente);

  const [etapa, setEtapa] = useState(0);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    trigger,
    formState: { errors },
  } = useForm<ClienteFormInput, unknown, ClienteFormData>({
    resolver: zodResolver(clienteSchema),
    defaultValues: toDefaults(cliente ?? prefill),
  });

  useEffect(() => {
    if (open) {
      reset(toDefaults(cliente ?? prefill));
      setEtapa(0);
    }
    // `cliente` é reconstruído a cada recarga da página; comparar por objeto
    // reabriria o formulário com os campos limpos no meio da digitação.
  }, [open, cliente?.id]);

  /** Aplica a máscara antes de entregar o valor ao react-hook-form. */
  const masked = (name: Path<ClienteFormInput>, mask: (v: string) => string) => {
    const reg = register(name);
    return {
      ...reg,
      onChange: (ev: React.ChangeEvent<HTMLInputElement>) => {
        ev.target.value = mask(ev.target.value);
        return reg.onChange(ev);
      },
    };
  };

  const valores = watch();

  /*
   * O que cada etapa já tem.
   *
   * Alimenta o tique verde na navegação — que é o que permite pular direto
   * para a etapa que falta em vez de reler as três. Numa ficha editada meses
   * depois, essa é a diferença entre "onde estava o e-mail?" e um clique.
   *
   * É o que sobrou do medidor de preenchimento: a informação útil (o que já
   * está respondido) sem a barra de progresso, que só media o quanto ainda
   * faltava de campos que ninguém é obrigado a preencher.
   */
  const preenchida = useMemo(() => {
    const contato = valores.contato ?? {};
    const endereco = valores.endereco ?? {};
    const algum = (obj: Record<string, unknown>) => Object.values(obj).some((v) => String(v ?? "").trim() !== "");

    return [
      Boolean(valores.cpfCnpj?.trim() || valores.dataNascimento?.trim() || valores.sexo?.trim()),
      algum(contato),
      algum(endereco),
    ];
  }, [valores]);

  /**
   * Sair da primeira etapa valida o nome, e só ele.
   *
   * É o único campo obrigatório da ficha: exigir qualquer outro para trocar
   * de aba seria inventar obrigatoriedade que o cadastro não tem. Descobrir o
   * nome vazio depois de digitar o endereço é que sairia caro.
   */
  const irPara = async (destino: number) => {
    if (destino === etapa) return;
    // Voltar nunca valida: quem clica em "Identificação" quer justamente
    // corrigir o que está lá.
    if (destino > 0 && !(await trigger("nome"))) return setEtapa(0);
    setEtapa(destino);
  };

  const preencherPeloCep = async () => {
    const cep = onlyDigits(getValues("endereco.cep") ?? "");
    if (cep.length !== 8) {
      alert.warning("CEP incompleto", "Digite os 8 dígitos do CEP para buscarmos o endereço.");
      return;
    }

    const endereco = await buscar(cep);

    if (!endereco) {
      alert.warning("CEP não encontrado", "Confira o número ou preencha o endereço à mão.");
      return;
    }

    setValue("endereco.logradouro", endereco.logradouro, { shouldValidate: true });
    setValue("endereco.bairro", endereco.bairro, { shouldValidate: true });
    setValue("endereco.cidade", endereco.cidade, { shouldValidate: true });
    setValue("endereco.uf", endereco.uf, { shouldValidate: true });
  };

  /**
   * Erro numa etapa fechada é erro invisível.
   *
   * Com o formulário fatiado, um campo inválido pode estar em outra tela — e
   * o aviso mandaria "revise os campos destacados" sem nada destacado à
   * vista. Então a submissão inválida leva junto para onde está o problema.
   */
  const onInvalid = (erros: typeof errors) => {
    const etapaDoErro = erros.nome || erros.status || erros.cpfCnpj || erros.dataNascimento || erros.sexo
      ? 0
      : erros.contato
        ? 1
        : erros.endereco
          ? 2
          : etapa;

    setEtapa(etapaDoErro);
    alert.error("Campos inválidos", "Revise os campos destacados e tente de novo.");
  };

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title={editando ? "Editar cliente" : "Novo cliente"}
      subtitle={editando ? undefined : "Só o nome é obrigatório"}
      size="lg"
      /*
       * Um pouco mais largo que o `lg` padrão (672px).
       *
       * A ficha tem catorze campos, e em 672px quase todos caíam em duas
       * colunas ou ocupavam a linha inteira — o formulário virava uma escada
       * de quinze andares que só terminava rolando. Em 768px cabem três
       * colunas de verdade, e cada seção passa a ocupar uma ou duas linhas.
       */
      maxWidth="sm:max-w-3xl"
    >
      <form onSubmit={handleSubmit((data) => onSubmit(data), onInvalid)} className="flex flex-col gap-4" noValidate>
        {/* ---------- Navegação das etapas ---------- */}
        {/*
          As abas são a navegação inteira — não há mais "Voltar"/"Continuar".

          Com o botão de cadastrar disponível o tempo todo, o "Continuar" era
          um segundo caminho para a mesma tela e dava a impressão de que a
          ficha só termina no fim das três etapas. Clicar na aba faz o mesmo,
          em qualquer ordem, e não compete com o botão que fecha o cadastro.

          Saiu também o cabeçalho com iniciais e medidor de preenchimento: era
          decoração ocupando 70px acima de um formulário que a pessoa abriu
          para digitar um nome.
        */}
        {/*
          A pílula do destaque é UM elemento que se move, não um fundo que
          acende e apaga em cada botão.

          É o mesmo `layoutId` das fichas de produto e de funcionário — e o
          motivo é o mesmo: o framer interpola a posição entre um render e
          outro, e o olho SEGUE o destaque para onde ele foi. Acendendo e
          apagando, o olho tem de procurar o que mudou a cada troca de aba, e
          três abas com ícone parecido tornam essa procura real.
        */}
        <div className="grid grid-cols-3 gap-0.5 rounded-xl border border-fg/[0.07] bg-fg/[0.02] p-0.5">
          {ETAPAS.map((e, i) => {
            const Icone = e.icone;
            const atual = i === etapa;

            return (
              <button
                key={e.titulo}
                type="button"
                onClick={() => void irPara(i)}
                aria-current={atual ? "step" : undefined}
                className="focus-ring relative flex min-h-[38px] cursor-pointer items-center justify-center gap-2 rounded-[10px] px-2 text-[12.5px] transition-colors"
              >
                {atual && (
                  <motion.span
                    layoutId="aba-cliente-form"
                    /* Sem animação de layout para quem pediu menos movimento: o
                       destaque continua aparecendo, só não desliza. */
                    transition={reduzir ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 38 }}
                    className="absolute inset-0 rounded-[10px] bg-accent"
                  />
                )}

                <span className={`relative flex items-center gap-2 ${atual ? "text-white" : "text-mist"}`}>
                  {preenchida[i] && !atual ? <Check size={13} className="text-faint" /> : <Icone size={13} className={atual ? "" : "text-faint"} />}

                  {/* No celular só a etapa atual mostra o rótulo: três nomes
                      lado a lado em 360px quebram linha e a barra dobra de
                      altura. O ícone continua identificando as outras. */}
                  <span className={`min-w-0 truncate ${atual ? "" : "hidden sm:inline"}`}>{e.titulo}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* ---------- Identificação ---------- */}
        {/*
          Documento, nascimento e sexo entram aqui, e não numa seção "Sobre o
          cliente" própria: são a mesma pergunta — quem é essa pessoa. Duas
          seções para cinco campos davam mais título do que conteúdo.
        */}
        {/*
          As três etapas ficam MONTADAS e escondidas com `hidden`, em vez de
          serem trocadas por renderização condicional.

          Campo desmontado é campo que some do formulário — e, na volta, a
          pessoa encontra o que digitou em branco. Escondido no CSS o valor
          continua no react-hook-form, o estado de erro continua de pé e a
          submissão enxerga a ficha inteira, esteja qual etapa estiver aberta.
          Elemento com `display: none` também não recebe foco, então o Tab não
          passeia por campos invisíveis.
        */}
        <div className={etapa === 0 ? ETAPA_VISIVEL : "hidden"}>
        <FormSection title="Identificação" icon={<UserRound className="h-3.5 w-3.5" />}>
          <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <TextField
                label="Nome"
                icon={<Users className="h-3.5 w-3.5" />}
                placeholder="Como o cliente é chamado"
                autoFocus={!editando}
                error={errors.nome?.message}
                {...register("nome")}
              />
            </div>

            <SelectBox label="Situação" icon={<BadgeCheck className="h-3.5 w-3.5" />} error={errors.status?.message} {...register("status")}>
              <option value={eStatus.ATIVO}>Ativo</option>
              <option value={eStatus.INATIVO}>Inativo</option>
            </SelectBox>
          </div>

          <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-3">
            <TextField
              label="CPF / CNPJ"
              icon={<IdCard className="h-3.5 w-3.5" />}
              placeholder="Opcional"
              inputMode="numeric"
              error={errors.cpfCnpj?.message}
              {...masked("cpfCnpj", maskCpfCnpj)}
            />

            {/* Nascimento vira o lembrete de aniversário na tela de Clientes —
                é por isso que ele está aqui, e não por burocracia. */}
            <TextField
              label="Nascimento"
              type="date"
              icon={<Cake className="h-3.5 w-3.5" />}
              max={new Date().toISOString().slice(0, 10)}
              error={errors.dataNascimento?.message}
              {...register("dataNascimento")}
            />

            <SelectBox label="Sexo" icon={<UserRound className="h-3.5 w-3.5" />} error={errors.sexo?.message} {...register("sexo")}>
              <option value="">Não informado</option>
              {Object.values(eSexo).map((s) => (
                <option key={s} value={s}>
                  {SEXO_LABEL[s]}
                </option>
              ))}
            </SelectBox>
          </div>
        </FormSection>
        </div>

        {/* ---------- Contato ---------- */}
        {/* Os três números na mesma linha, na ordem em que a loja usa: o
            WhatsApp primeiro, que é por onde se fala com o cliente. */}
        <div className={etapa === 1 ? ETAPA_VISIVEL : "hidden"}>
        <FormSection title="Contato" icon={<Phone className="h-3.5 w-3.5" />}>
          <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-3">
            <TextField label="WhatsApp" icon={<MessageCircle className="h-3.5 w-3.5" />} placeholder="(00) 00000-0000" inputMode="tel" error={errors.contato?.whatsapp?.message} {...masked("contato.whatsapp", maskPhone)} />
            <TextField label="Celular" icon={<Smartphone className="h-3.5 w-3.5" />} placeholder="(00) 00000-0000" inputMode="tel" error={errors.contato?.celular?.message} {...masked("contato.celular", maskPhone)} />
            <TextField label="Telefone" icon={<Phone className="h-3.5 w-3.5" />} placeholder="(00) 0000-0000" inputMode="tel" error={errors.contato?.telefone?.message} {...masked("contato.telefone", maskPhone)} />
          </div>

          <TextField label="E-mail" icon={<Mail className="h-3.5 w-3.5" />} placeholder="email@exemplo.com" inputMode="email" error={errors.contato?.email?.message} {...register("contato.email")} />
        </FormSection>
        </div>

        {/* ---------- Endereço ---------- */}
        <div className={etapa === 2 ? ETAPA_VISIVEL : "hidden"}>
        <FormSection title="Endereço" icon={<MapPin className="h-3.5 w-3.5" />}>
          {/* O CEP e o que ele preenche na mesma linha: digitar rua, bairro,
              cidade e UF à mão é onde o cadastro de endereço morre. */}
          <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-[172px_auto_minmax(0,1fr)_104px]">
            <TextField
              label="CEP"
              icon={<MapPin className="h-3.5 w-3.5" />}
              placeholder="00000-000"
              inputMode="numeric"
              error={errors.endereco?.cep?.message}
              {...masked("endereco.cep", maskCep)}
            />

            {/* `pt-[26px]` alinha o botão com a casca do campo, não com o
                rótulo que fica acima dela. */}
            <div className="pt-[26px]">
              <button
                type="button"
                onClick={preencherPeloCep}
                disabled={buscando}
                className="focus-ring inline-flex h-[42px] w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-fg/[0.09] px-3 text-[12.5px] text-mist transition-colors hover:bg-fg/[0.05] hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                {buscando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                Buscar
              </button>
            </div>

            <TextField label="Logradouro" icon={<Home className="h-3.5 w-3.5" />} placeholder="Rua, avenida, travessa…" error={errors.endereco?.logradouro?.message} {...register("endereco.logradouro")} />
            <TextField label="Número" placeholder="123" error={errors.endereco?.numero?.message} {...register("endereco.numero")} />
          </div>

          <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_104px]">
            <TextField label="Complemento" placeholder="Apto, bloco" error={errors.endereco?.complemento?.message} {...register("endereco.complemento")} />
            <TextField label="Bairro" placeholder="Centro" error={errors.endereco?.bairro?.message} {...register("endereco.bairro")} />
            <TextField label="Cidade" placeholder="São Paulo" error={errors.endereco?.cidade?.message} {...register("endereco.cidade")} />

            <SelectBox label="UF" error={errors.endereco?.uf?.message} {...register("endereco.uf")}>
              <option value="">—</option>
              {UFS.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </SelectBox>
          </div>
        </FormSection>
        </div>

        {/*
          Dois botões, e o de cadastrar em destaque desde a primeira etapa.

          Antes eram quatro (Voltar, Cancelar, Salvar agora, Continuar), e o
          destaque estava no "Continuar" — o que ensinava que a ficha só
          termina depois de três telas, justamente o contrário da regra desta
          tela. Agora o botão que fecha o cadastro é o único em destaque, e as
          abas acima levam a quem quiser preencher o resto.
        */}
        <div className="flex items-center justify-end gap-2 border-t border-fg/[0.07] pt-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="focus-ring inline-flex min-h-[38px] cursor-pointer items-center rounded-lg px-3 text-[12.5px] text-mist transition-colors hover:bg-fg/[0.05] hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancelar
          </button>

          <button
            type="submit"
            disabled={saving}
            className="focus-ring inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-lg bg-gradient-to-br from-accent-soft to-accent px-4 text-[12.5px] text-white shadow-glow transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? "Salvando…" : editando ? "Salvar" : "Cadastrar"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default ClienteForm;