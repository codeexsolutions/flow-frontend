import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  User, Percent, ShieldCheck, Check, Loader2, KeyRound, Power,
  Trash2, UserPlus, IdCard, Cake, Briefcase, AlertTriangle, Wallet,
} from "lucide-react";

import type { AreaSistema, Funcionario, PermissaoFuncionario } from "@/shared/domain/funcionario";
import FuncionarioService from "@/features/funcionarios/services/funcionario.service";
import { Form, FormGrid, FormSection, TextField, SwitchField, FormActions } from "@/shared/ui/form/FormKit";
import { useAlert } from "@/shared/ui/Alert";
import { maskCpfCnpj } from "@/shared/validation/masks";
import { cpfValido, soDigitos } from "@/shared/utils/documento";

/**
 * A ficha do funcionário.
 *
 * ---------------------------------------------------------------------------
 * Por que "Dados" e "Comissão" são a MESMA aba
 * ---------------------------------------------------------------------------
 * Foram separadas por um tempo e não deviam ter sido. Comissão é uma chave e
 * um número — meia dúzia de pixels que não sustentam uma aba própria, e cuja
 * separação obrigava a atravessar duas telas para responder "quem é essa
 * pessoa e quanto ela ganha", que é uma pergunta só. Aba com dois campos
 * dentro custa mais clique do que economiza rolagem.
 *
 * ---------------------------------------------------------------------------
 * Por que "Ponto" e "Acesso" continuam separadas — e condicionais
 * ---------------------------------------------------------------------------
 * As duas só existem DEPOIS que o funcionário existe: a jornada e o login se
 * penduram num id que ainda não foi gerado. E "Ponto" some também para quem
 * não bate ponto: numa mesma equipe convivem o caixa (bate) e o sócio ou o
 * comissionado (não batem), e uma aba de horário para quem não tem horário é
 * uma aba que ninguém vai preencher.
 *
 * ---------------------------------------------------------------------------
 * Por que o botão de salvar NÃO salva a aba "Acesso"
 * ---------------------------------------------------------------------------
 * As demais abas descrevem a PESSOA e vão para o mesmo lugar. "Acesso" mexe no
 * LOGIN, que é outro registro, com outras regras (consome vaga do plano, exige
 * e-mail único, só o dono cria administrador) e outros desfechos — criar
 * acesso não é "salvar um campo", é fabricar uma credencial.
 *
 * Num botão só, corrigir o CPF de alguém dispararia a criação de um usuário, e
 * um e-mail repetido impediria de salvar a data de nascimento.
 */

type Aba = "dados" | "contrato" | "acesso" | "permissoes";

const ABAS: { id: Aba; titulo: string; icone: typeof User }[] = [
  { id: "dados", titulo: "Dados", icone: User },
  { id: "contrato", titulo: "Contrato", icone: Wallet },
  { id: "acesso", titulo: "Acesso", icone: KeyRound },
  { id: "permissoes", titulo: "Permissões", icone: ShieldCheck },
];

type Props = {
  /** Ausente = cadastro novo. */
  funcionario?: Funcionario | null;
  areas: AreaSistema[];
  /** Só o dono promove alguém a administrador. */
  ehRoot: boolean;
  /** O plano ainda tem vaga para mais um login? */
  podeCriarAcesso: boolean;
  onCancel: () => void;
  /** Recarrega a lista — os dados vêm da API, não de estado local. */
  onMudou: (fechar?: boolean) => Promise<void> | void;
};

const FuncionarioForm = ({ funcionario, areas, ehRoot, podeCriarAcesso, onCancel, onMudou }: Props) => {
  const alert = useAlert();
  const reduzir = useReducedMotion();

  const novo = !funcionario;

  const [aba, setAba] = useState<Aba>("dados");
  const [salvando, setSalvando] = useState(false);

  /* ── A pessoa ─────────────────────────────────────────────────────────── */

  const [nome, setNome] = useState(funcionario?.nome ?? "");
  const [nascimento, setNascimento] = useState(funcionario?.dataNascimento ?? "");
  const [cpf, setCpf] = useState(funcionario?.cpf ? maskCpfCnpj(funcionario.cpf) : "");
  const [cargo, setCargo] = useState(funcionario?.cargo ?? "");
  const [salario, setSalario] = useState(funcionario?.salario != null ? String(funcionario.salario) : "");

  const [ganhaComissao, setGanhaComissao] = useState(funcionario?.ganhaComissao ?? false);
  const [percentual, setPercentual] = useState(
    funcionario?.comissaoPercentual != null ? String(funcionario.comissaoPercentual) : "",
  );

  /*
   * Cadastro NOVO já nasce batendo ponto.
   *
   * O padrão era desligado, e ele descrevia a exceção em vez da regra: numa
   * loja, quase todo mundo cumpre horário — sócio, comissionado e autônomo são
   * os poucos que não. Desligado, a jornada de cada pessoa só passava a existir
   * depois que alguém voltasse na ficha para ligar a chave, e o link do ponto
   * chegava à equipe sem ninguém reconhecido do outro lado.
   *
   * `??` e não `||`: funcionário existente com a chave desligada tem de
   * continuar desligado, e `false || true` daria `true`.
   */
  const [batePonto, setBatePonto] = useState(funcionario?.batePonto ?? true);

  /* ── O acesso ─────────────────────────────────────────────────────────── */

  const acesso = funcionario?.acesso ?? null;

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [permissao, setPermissao] = useState<PermissaoFuncionario>(acesso?.permissao ?? "USUARIO");
  const [marcadas, setMarcadas] = useState<string[]>(acesso?.areas ?? []);
  const [novaSenha, setNovaSenha] = useState("");

  /* ── Quais abas existem agora ─────────────────────────────────────────── */

  /*
   * "Acesso" e "Permissões" precisam de um funcionário JÁ GRAVADO: o login se
   * pendura num id que ainda não existe no cadastro novo. "Dados" e "Contrato"
   * descrevem a pessoa e valem desde o primeiro campo.
   */
  const abas = useMemo(
    () => ABAS.filter((a) => (novo ? a.id === "dados" || a.id === "contrato" : true)),
    [novo],
  );

  /* Se a aba aberta deixar de existir, a tela ficaria em branco: nenhum bloco
     casa com o valor. Volta para Dados. */
  useEffect(() => {
    if (!abas.some((a) => a.id === aba)) setAba("dados");
  }, [abas, aba]);

  /* ── Validação ────────────────────────────────────────────────────────── */

  /**
   * Só o NOME é obrigatório.
   *
   * Nascimento e CPF raramente estão à mão na hora em que a equipe é
   * cadastrada — isso acontece de memória, com a loja aberta. Exigi-los ali
   * empurra o cadastro para "depois", e depois não vem.
   *
   * O que não se abre mão é da correção do que FOI preenchido: CPF digitado
   * errado e nascimento no futuro continuam sendo barrados. A diferença entre
   * "não informou" e "informou errado" é toda a regra daqui.
   *
   * Calculado a cada render, e não guardado em estado: estado exigiria lembrar
   * de recalcular a cada tecla, e o esquecimento aparece como um erro que
   * continua na tela depois de corrigido.
   */
  const erros = useMemo(() => {
    const lista: Partial<Record<"nome" | "nascimento" | "cpf" | "percentual" | "salario", string>> = {};

    if (!nome.trim()) lista.nome = "Informe o nome";
    else if (nome.trim().length < 3) lista.nome = "Nome muito curto";

    if (nascimento && nascimento > new Date().toISOString().slice(0, 10)) {
      lista.nascimento = "A data não pode ser no futuro";
    }

    if (soDigitos(cpf) && !cpfValido(cpf)) lista.cpf = "CPF inválido — confira os números";

    if (ganhaComissao && percentual) {
      const pct = Number(percentual.replace(",", "."));
      if (Number.isNaN(pct) || pct < 0 || pct > 100) lista.percentual = "Entre 0 e 100";
    }

    if (salario) {
      const valor = Number(salario.replace(",", "."));
      if (Number.isNaN(valor) || valor < 0) lista.salario = "Valor inválido";
    }

    return lista;
  }, [nome, nascimento, cpf, ganhaComissao, percentual, salario]);

  const temErro = Object.keys(erros).length > 0;

  /* ── Ações ────────────────────────────────────────────────────────────── */

  const executar = async (acao: () => Promise<unknown>, sucesso: string, fechar = false): Promise<boolean> => {
    setSalvando(true);
    try {
      await acao();
      await onMudou(fechar);
      alert.success(sucesso, "");
      return true;
    } catch (e) {
      alert.error("Não foi possível salvar", (e as Error).message);
      return false;
    } finally {
      setSalvando(false);
    }
  };

  /**
   * Salva a PESSOA — dados, comissão, a chave do ponto e a jornada.
   *
   * A jornada só é gravada de quem bate ponto. Quem tem a chave desligada
   * mantém o que já estava lá, intocado: desligar não é apagar, e religar
   * depois devolve o horário como estava.
   */
  const salvar = async () => {
    if (temErro) {
      /* O erro pode estar em qualquer uma das duas abas da pessoa; a submissão
         leva junto para onde ele está, senão o aviso manda "revise os campos
         destacados" sem nada destacado à vista. */
      setAba(erros.salario || erros.percentual ? "contrato" : "dados");
      alert.error("Campos inválidos", "Revise os campos destacados e tente novamente.");
      return;
    }

    const base = {
      nome: nome.trim(),
      dataNascimento: nascimento || null,
      cpf: soDigitos(cpf) || null,
      cargo: cargo.trim(),
      /* Vazio é `null` ("não informado"), e não zero ("sem salário fixo"):
         confundir os dois faria a folha tratar "não sei" como "não deve". */
      salario: salario ? Number(salario.replace(",", ".")) : null,
      ganhaComissao,
      comissaoPercentual: ganhaComissao && percentual ? Number(percentual.replace(",", ".")) : null,
      batePonto,
    };

    if (novo) {
      await executar(() => FuncionarioService.cadastrar(base), "Funcionário cadastrado!", true);
      return;
    }

    await executar(() => FuncionarioService.alterar(funcionario.id, base), "Alterações salvas!", true);
  };

  const criarAcesso = () =>
    executar(
      () => FuncionarioService.criarAcesso(funcionario!.id, { email: email.trim(), senha, permissao, areas: marcadas }),
      "Acesso criado! Passe o e-mail e a senha para o funcionário.",
    );

  const salvarPermissoes = () =>
    executar(
      () => FuncionarioService.alterarAcesso(funcionario!.id, { permissao, areas: marcadas }),
      "Permissões atualizadas!",
    );

  const redefinirSenha = async () => {
    const ok = await executar(() => FuncionarioService.redefinirSenha(funcionario!.id, novaSenha), "Senha redefinida!");
    if (ok) setNovaSenha("");
  };

  const alternarStatusAcesso = async () => {
    const ativando = acesso?.status !== "ATIVO";

    if (!ativando) {
      const { confirmed } = await alert.confirm(
        "Desativar acesso?",
        `${funcionario?.nome} não conseguirá mais entrar no sistema até ser reativado. Ele continua na equipe.`,
      );
      if (!confirmed) return;
    }

    void executar(
      () => FuncionarioService.alterarStatus(funcionario!.id, ativando),
      ativando ? "Acesso liberado!" : "Acesso desativado.",
    );
  };

  const removerAcesso = async () => {
    const { confirmed } = await alert.confirm(
      "Remover o acesso?",
      "O login é apagado e a vaga do plano volta a ficar livre. O funcionário CONTINUA na equipe, com ponto e comissão intactos. " +
      "Se ele já registrou vendas, o login é apenas desativado — apagá-lo deixaria as vendas sem vendedor.",
      { type: "warning", confirmText: "Remover acesso" },
    );

    if (!confirmed) return;

    void executar(() => FuncionarioService.removerAcesso(funcionario!.id), "Acesso removido.");
  };

  /* ── Áreas, agrupadas ────────────────────────────────────────────────── */

  const areasPorGrupo = useMemo(() => {
    const mapa = new Map<string, AreaSistema[]>();

    for (const area of areas) {
      mapa.set(area.grupo, [...(mapa.get(area.grupo) ?? []), area]);
    }

    return [...mapa.entries()];
  }, [areas]);

  /**
   * Gestor e dono passam por cima da lista de áreas.
   *
   * É a regra do servidor (`areasEfetivas`), e a tela precisa dizer a mesma
   * coisa: caixinhas marcáveis para um administrador prometeriam um controle
   * que não existe — ele vê tudo de qualquer jeito.
   */
  const areasIgnoradas = permissao === "ADMIN" || Boolean(acesso?.root);

  const alternarArea = (id: string) =>
    setMarcadas((atual) => (atual.includes(id) ? atual.filter((a) => a !== id) : [...atual, id]));

  /* ── Render ───────────────────────────────────────────────────────────── */

  const preenchida: Record<Aba, boolean> = {
    dados: Boolean(nome.trim()),
    contrato: salario !== "" || ganhaComissao || batePonto,
    acesso: Boolean(acesso),
    permissoes: Boolean(acesso),
  };

  return (
    <Form onSubmit={(e) => { e.preventDefault(); void salvar(); }} className="!gap-4">

      {/* Uma aba só não é navegação: no cadastro novo a barra sumiria de
          qualquer jeito ao ficar com um botão, e um botão que não leva a lugar
          nenhum é ruído. */}
      {abas.length > 1 && (
        <div
          className="grid gap-0.5 rounded-xl border border-fg/[0.07] bg-fg/[0.02] p-0.5"
          style={{ gridTemplateColumns: `repeat(${abas.length}, minmax(0, 1fr))` }}
        >
          {abas.map((a) => {
            const Icone = a.icone;
            const on = a.id === aba;

            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setAba(a.id)}
                aria-current={on ? "step" : undefined}
                className="focus-ring relative flex min-h-[38px] cursor-pointer items-center justify-center gap-1.5 rounded-[10px] px-2 text-[12.5px] transition-colors"
              >
                {on && (
                  <motion.span
                    layoutId="aba-funcionario-form"
                    transition={reduzir ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 38 }}
                    className="absolute inset-0 rounded-[10px] bg-accent"
                  />
                )}

                <span className={`relative flex items-center gap-1.5 ${on ? "text-white" : "text-mist"}`}>
                  {preenchida[a.id] && !on ? <Check size={13} className="text-faint" /> : <Icone size={13} className={on ? "" : "text-faint"} />}
                  <span className={`min-w-0 truncate ${on ? "" : "hidden sm:inline"}`}>{a.titulo}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Altura fixa: sem ela o modal encolhe e cresce a cada troca de aba e o
          botão de salvar sobe e desce debaixo do cursor. Mesma decisão do
          formulário de produto. */}
      <div className="relative h-[58dvh] overflow-y-auto overflow-x-hidden pr-1 sm:h-[382px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={aba}
            initial={reduzir ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduzir ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="flex flex-col gap-3"
          >

            {/* ═══════════════════ Dados (com comissão junto) ═══════════════════ */}
            {aba === "dados" && (
              <div className="flex flex-col gap-3">
                <TextField
                  label="Nome"
                  icon={<User className="h-3.5 w-3.5" />}
                  placeholder="Maria Souza"
                  autoFocus
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  error={erros.nome}
                />

                {/* Nascimento e CPF são OPCIONAIS — ver a nota de `erros`. O
                    "opcional" fica escrito no campo para ninguém travar
                    procurando o documento. */}
                <FormGrid cols={2}>
                  <TextField
                    label="Data de nascimento"
                    type="date"
                    icon={<Cake className="h-3.5 w-3.5" />}
                    hint="Opcional"
                    value={nascimento}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setNascimento(e.target.value)}
                    error={erros.nascimento}
                  />

                  <TextField
                    label="CPF"
                    icon={<IdCard className="h-3.5 w-3.5" />}
                    placeholder="000.000.000-00"
                    hint="Opcional"
                    inputMode="numeric"
                    value={cpf}
                    onChange={(e) => setCpf(maskCpfCnpj(e.target.value))}
                    error={erros.cpf}
                  />
                </FormGrid>

                <TextField
                  label="Cargo"
                  icon={<Briefcase className="h-3.5 w-3.5" />}
                  placeholder="Vendedora, costureiro, entregador…"
                  hint="Opcional"
                  value={cargo}
                  onChange={(e) => setCargo(e.target.value)}
                />

                {funcionario && (
                  <SwitchField
                    label="Trabalha aqui"
                    hint="Desligue quando a pessoa sair da empresa. O histórico de ponto e as vendas dela continuam guardados."
                    checked={funcionario.ativo}
                    onChange={(v) => void executar(
                      () => FuncionarioService.alterar(funcionario.id, { ativo: v }),
                      v ? "Funcionário reativado." : "Funcionário desligado.",
                    )}
                  />
                )}
              </div>
            )}

            {/* ═══════════════════════ Contrato ═══════════════════════ */}
            {/*
              Salário, comissão e ponto numa aba só.
              As três respondem a mesma pergunta — o que esta pessoa custa e
              como ela trabalha — e antes dividiam espaço com nome, CPF e
              nascimento, que respondem outra. Junto de tudo, a aba "Dados"
              virou uma coluna de oito campos e três chaves.
            */}
            {aba === "contrato" && (
              <div className="flex flex-col gap-3">
                <FormGrid cols={2}>
                  {/*
                   * Vazio e zero dizem coisas diferentes, e os dois existem:
                   * vazio é "ainda não sei", zero é "não tem salário fixo" —
                   * o comissionado puro. Por isso o campo não nasce em 0.
                   */}
                  <TextField
                    label="Salário mensal"
                    icon={<Wallet className="h-3.5 w-3.5" />}
                    placeholder="2.000,00"
                    inputMode="decimal"
                    hint="Vazio = não informado. Zero = só comissão."
                    value={salario}
                    onChange={(e) => setSalario(e.target.value)}
                    error={erros.salario}
                  />
                </FormGrid>

                <FormSection title="Comissão e ponto" icon={<Percent size={13} />}>
                  <div className="flex flex-col gap-2">
                    <SwitchField
                      label="Ganha comissão"
                      hint="Ligue para quem recebe um percentual sobre o que vende."
                      checked={ganhaComissao}
                      onChange={setGanhaComissao}
                    />

                    {/*
                     * O percentual só aparece com a chave ligada.
                     *
                     * Um campo sempre visível convida a preencher "0" para quem
                     * não ganha comissão — e zero por cento é uma configuração,
                     * não uma decisão. Depois ninguém distingue "combinamos
                     * zero" de "ainda não combinamos".
                     */}
                    <AnimatePresence initial={false}>
                      {ganhaComissao && (
                        <motion.div
                          initial={reduzir ? false : { opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.18 }}
                          className="overflow-hidden"
                        >
                          <FormGrid cols={2}>
                            <TextField
                              label="Percentual"
                              icon={<Percent className="h-3.5 w-3.5" />}
                              placeholder="3"
                              inputMode="decimal"
                              hint="Sobre o valor das vendas dele"
                              value={percentual}
                              onChange={(e) => setPercentual(e.target.value)}
                              error={erros.percentual}
                            />
                          </FormGrid>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* A chave que decide se a aba "Ponto" existe. Fica aqui, e
                        não lá dentro, porque é uma característica da PESSOA —
                        do mesmo tipo que a comissão. */}
                    <SwitchField
                      label="Bate ponto"
                      hint={
                        novo
                          ? "Vem ligado porque é o caso da maioria. Desligue para sócio, comissionado ou autônomo. A jornada é configurada depois de cadastrar."
                          : "Ligue para quem registra horário. Sócio, comissionado e autônomo normalmente não batem."
                      }
                      checked={batePonto}
                      onChange={setBatePonto}
                    />
                  </div>
                </FormSection>

                {ganhaComissao && (
                  <p className="flex items-start gap-2 rounded-lg border border-fg/[0.07] bg-fg/[0.02] px-3 py-2.5 text-[11px] leading-[16px] text-faint">
                    <AlertTriangle size={13} className="mt-px shrink-0" />
                    Por enquanto isto é só o cadastro do percentual. O cálculo da comissão sobre as vendas e o relatório de quanto cada um tem a receber ainda não existem.
                  </p>
                )}
              </div>
            )}

            {/* ═══════════════════════ Acesso ═══════════════════════ */}
            {aba === "acesso" && funcionario && (
              <div className="flex flex-col gap-3">
                {!acesso ? (
                  <>
                    <p className="rounded-lg border border-fg/[0.07] bg-fg/[0.02] px-3 py-2.5 text-[11.5px] leading-[16px] text-faint">
                      <span className="text-mist">{funcionario.nome} ainda não entra no sistema.</span>{" "}
                      Enquanto for assim, ela não ocupa vaga do plano. Crie um acesso só para quem precisa abrir o programa.
                    </p>

                    {!podeCriarAcesso && (
                      <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/[0.08] px-3 py-2.5 text-[11.5px] leading-[16px] text-warning">
                        <AlertTriangle size={13} className="mt-px shrink-0" />
                        O plano já está com todas as vagas de acesso ocupadas. Faça upgrade para liberar mais logins — cadastrar funcionário sem acesso continua ilimitado.
                      </p>
                    )}

                    <FormGrid cols={2}>
                      <TextField
                        label="E-mail de acesso"
                        type="email"
                        placeholder="maria@empresa.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                      <TextField
                        label="Senha inicial"
                        placeholder="Mínimo 6 caracteres"
                        hint="Aparece em texto para você passar a ela"
                        value={senha}
                        onChange={(e) => setSenha(e.target.value)}
                      />
                    </FormGrid>
                  </>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-fg/[0.07] bg-fg/[0.02] px-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] text-ink">{acesso.email}</span>
                      <span className="block text-[11px] text-faint">
                        {acesso.root ? "Usuário master" : acesso.permissao === "ADMIN" ? "Administrador" : "Vendedor"}
                        {" · "}
                        {acesso.status === "ATIVO" ? "acesso liberado" : "acesso desativado"}
                      </span>
                    </span>

                    {!acesso.root && (
                      <span className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          onClick={() => void alternarStatusAcesso()}
                          disabled={salvando}
                          title={acesso.status === "ATIVO" ? "Desativar acesso" : "Reativar acesso"}
                          className={`focus-ring flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border transition disabled:opacity-50 ${
                            acesso.status === "ATIVO" ? "border-fg/[0.08] text-mist hover:bg-danger/10 hover:text-danger" : "border-success/30 text-success hover:bg-success/10"
                          }`}
                        >
                          <Power size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void removerAcesso()}
                          disabled={salvando}
                          title="Remover o acesso (o funcionário continua na equipe)"
                          className="focus-ring flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-fg/[0.08] text-mist transition hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                        >
                          <Trash2 size={13} />
                        </button>
                      </span>
                    )}
                  </div>
                )}

                {/* ---------- Ações do acesso ---------- */}
                <div className="flex flex-wrap items-center gap-2 border-t border-fg/[0.06] pt-3">
                  {!acesso ? (
                    <button
                      type="button"
                      onClick={() => void criarAcesso()}
                      disabled={salvando || !podeCriarAcesso || !email.trim() || senha.length < 6}
                      className="focus-ring inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-[12.5px] text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {salvando ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                      Criar acesso
                    </button>
                  ) : (
                    <>
                      {/* Só o que mexe no LOGIN. O "salvar permissões" foi para
                          a aba Permissões, ao lado das caixinhas que ele grava —
                          um botão longe do que ele salva é um botão que ninguém
                          associa ao próprio efeito. */}
                      <span className="flex flex-1 items-center gap-1.5">
                        <input
                          value={novaSenha}
                          onChange={(e) => setNovaSenha(e.target.value)}
                          placeholder="Nova senha (mín. 6)"
                          className="min-w-[130px] flex-1 rounded-lg border border-fg/[0.09] bg-transparent px-2.5 py-2 text-[12px] text-ink outline-none transition-colors focus:border-accent/60 placeholder:text-faint"
                        />
                        <button
                          type="button"
                          onClick={() => void redefinirSenha()}
                          disabled={salvando || novaSenha.length < 6}
                          title="Redefinir senha"
                          className="focus-ring flex h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-lg border border-fg/[0.09] text-mist transition-colors hover:text-ink disabled:opacity-40"
                        >
                          <KeyRound size={14} />
                        </button>
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ═══════════════════════ Permissões ═══════════════════════ */}
            {/*
              O nível e as áreas em aba própria.
              Eram doze caixinhas em três grupos empilhadas embaixo do e-mail e
              da senha — a aba "Acesso" rolava três telas e a pessoa perdia de
              vista o que tinha acabado de marcar. Aqui elas ocupam a tela toda,
              que é o que doze opções pedem.
            */}
            {aba === "permissoes" && funcionario && (
              <div className="flex flex-col gap-3">
                {!acesso && (
                  <p className="rounded-lg border border-fg/[0.07] bg-fg/[0.02] px-3 py-2.5 text-[11.5px] leading-[16px] text-faint">
                    As permissões valem a partir do momento em que {funcionario.nome} tiver um acesso. Marque aqui e crie o login na aba ao lado — ele já nasce com o que estiver escolhido.
                  </p>
                )}

                {/* ---------- Nível ---------- */}
                {ehRoot && !acesso?.root && (
                  <SwitchField
                    label="Administrador"
                    hint="Além de vender, gerencia funcionários e vê o financeiro e todas as vendas. Administrador enxerga o sistema inteiro — as áreas abaixo deixam de valer."
                    checked={permissao === "ADMIN"}
                    onChange={(v) => setPermissao(v ? "ADMIN" : "USUARIO")}
                  />
                )}

                {/* ---------- Áreas ---------- */}
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-faint">Áreas que pode abrir</p>

                  {areasIgnoradas ? (
                    <p className="rounded-lg border border-dashed border-fg/[0.1] px-3 py-4 text-center text-[11.5px] leading-[16px] text-faint">
                      {acesso?.root ? "O usuário master" : "Um administrador"} enxerga o sistema inteiro. As áreas só valem para vendedor.
                    </p>
                  ) : (
                    areasPorGrupo.map(([grupo, lista]) => (
                      <div key={grupo} className="rounded-lg border border-fg/[0.07]">
                        <p className="border-b border-fg/[0.06] px-2.5 py-1.5 text-[10.5px] uppercase tracking-[0.08em] text-faint">{grupo}</p>
                        <div className="grid grid-cols-1 gap-x-3 gap-y-0.5 p-2 sm:grid-cols-2">
                          {lista.map((area) => (
                            <label key={area.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-fg/[0.04]">
                              <input
                                type="checkbox"
                                checked={marcadas.includes(area.id)}
                                onChange={() => alternarArea(area.id)}
                                className="h-3.5 w-3.5 shrink-0 accent-[rgb(var(--accent))]"
                              />
                              <span className="min-w-0 truncate text-[12px] text-mist">{area.rotulo}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>


                {acesso && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-fg/[0.06] pt-3">
                    <button
                      type="button"
                      onClick={() => void salvarPermissoes()}
                      disabled={salvando}
                      className="focus-ring inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-[12.5px] text-white transition-all hover:brightness-110 disabled:opacity-50"
                    >
                      {salvando ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                      Salvar permissões
                    </button>
                  </div>
                )}
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>

      {/* O botão salva a PESSOA. A aba "Acesso" tem as próprias ações — ver a
          nota do cabeçalho sobre por que os dois não se misturam. */}
      <FormActions
        onCancel={onCancel}
        saving={salvando}
        submitText={novo ? "Cadastrar funcionário" : "Salvar alterações"}
      />
    </Form>
  );
};

export default FuncionarioForm;
