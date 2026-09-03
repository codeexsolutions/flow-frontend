import { useMemo, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { User, Mail, Phone, Briefcase, Camera, Trash2, Lock, Shield, CalendarDays, Loader2, RefreshCw, Signature } from "lucide-react";
import useAuth from "@/features/auth/store/auth.store";
import { useAlert } from "@/shared/ui/Alert";
import Field from "@/shared/ui/inputs/Field";

import { maskPhone } from "@/shared/validation/masks";
import sysgrafix from "@/shared/api/sysgrafix";
import { SettingsCard, SaveRow, PasswordField, useSaver } from "@/features/config/components/ConfigUI";
import CorporateBadge from "@/features/config/components/CorporateBadge";
import { profileSchema, type ProfileData, type ProfileInput, passwordSchema, type PasswordData } from "@/features/config/schema/profile.schema";
import ProfileService from "@/features/config/services/profile.service";
import { BUILD_ID, forcarAtualizacao } from "@/shared/pwa/versao";

/*
 * A foto vai para o STORAGE, não para dentro do JSON.
 *
 * Ela era lida como data URL (base64) e enviada no corpo do PATCH. Duas
 * coisas quebravam nisso, e a primeira sozinha já impedia qualquer foto de
 * funcionar: `express.json()` recusa corpo acima de 100 kB, e base64 engorda
 * o arquivo em ~33% — uma foto de 100 kB vira 133 kB de texto e o servidor
 * responde 413 antes de olhar o conteúdo. A segunda é que, mesmo passando,
 * a imagem inteira ficaria guardada como texto na linha do usuário e viajaria
 * junto em toda leitura de perfil.
 *
 * O endpoint `/upload/usuario` já existia, já converte para WebP de 256px e
 * já guarda no Supabase. O que se salva no usuário passa a ser a URL.
 */
const MAX_PHOTO = 10 * 1024 * 1024;

const ProfilePage = () => {
  /* Busca a versão mais recente na marra — ver `forcarAtualizacao`. */
  const [atualizando, setAtualizando] = useState(false);

  const atualizarAgora = () => {
    setAtualizando(true);
    void forcarAtualizacao();
  };

  const { user } = useAuth();
  const atualizarPerfil = useAuth((s) => s.atualizarPerfil);
  const alert = useAlert();
  const profileSaver = useSaver(async () => {
    const data = watchProfile();
    const cargo = data.role ?? "";

    await ProfileService.updateProfile({
      nome: data.name,
      cargo,
      /* Sempre enviado, mesmo vazio: campo em branco significa "volte a me
         chamar pelo nome do cadastro", e omitir diria "não mexi". */
      nomeExibicao: data.nomeExibicao ?? "",
      /* `""` e não `undefined` ao remover: `undefined` some no
         `JSON.stringify` e o servidor só sobrescreve o que chega — a foto
         antiga voltaria na próxima carga da tela. */
      imagem: photo ?? "",
    });

    /* A sessão é montada no login e nada a reconstrói depois de um PATCH. Sem
       este aviso a foto nova ficava só no estado local desta tela: a barra
       lateral seguia com a antiga até o próximo login, e a impressão era de
       que salvar não tinha funcionado. */
    atualizarPerfil({ nome: data.name, cargo, image: photo ?? "", nomeExibicao: data.nomeExibicao ?? "" });
  });
  const pwdSaver = useSaver();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(user?.image ?? null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const {
    register: regProfile,
    handleSubmit: submitProfile,
    watch: watchProfile,
  } = useForm<ProfileInput, unknown, ProfileData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.nome ?? "",
      email: user?.email ?? "",
      phone: maskPhone(String(user?.phone ?? "")),
      role: user?.cargo ?? "",
      nomeExibicao: user?.nomeExibicao ?? "",
    },
  });

  const {
    control,
    handleSubmit: submitPwd,
    reset: resetPwd,
    watch: watchPwd,
    formState: { errors: pwdErrors },
  } = useForm<PasswordData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current: "", next: "", confirm: "" },
  });

  const nameValue = watchProfile("name");
  const initials = useMemo(
    () =>
      nameValue
        ?.split("")
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase() || "U",
    [nameValue],
  );

  const pwdValues = watchPwd();
  const canUpdatePwd = Boolean(pwdValues.current && pwdValues.next && pwdValues.next === pwdValues.confirm);

  /**
   * Grava a foto no usuário na hora, sem esperar o "Salvar" do cartão.
   *
   * Era o "Salvar" que gravava — e essa era a causa de "a imagem não está sendo
   * guardada". O upload já tinha acontecido e a foto JÁ APARECIA na tela, então
   * não havia nada indicando que faltava um passo: a pessoa trocava a foto, via
   * a foto nova, saía da tela e voltava para a antiga.
   *
   * Escolher uma foto é a ação completa; não existe "rascunho de foto" que
   * justifique confirmar depois. Nome e cargo continuam no botão, porque ali o
   * rascunho existe de verdade — quem está digitando o nome pode desistir no
   * meio.
   *
   * O nome vai junto porque o servidor o exige, e o do formulário é o que a
   * pessoa está vendo; mandar o da sessão sobrescreveria uma edição em curso.
   */
  const gravarFoto = async (url: string | null) => {
    const nome = watchProfile("name") || user?.nome || "";
    const cargo = watchProfile("role") ?? user?.cargo ?? "";

    const anterior = photo;

    setPhoto(url);

    try {
      await ProfileService.updateProfile({ nome, cargo, imagem: url ?? "" });
      atualizarPerfil({ image: url ?? "" });
    } catch (e) {
      setPhoto(anterior);

      const err = e as { response?: { data?: { message?: string } }; message?: string };
      alert.error("Não foi possível salvar a foto", err?.response?.data?.message ?? err?.message ?? "Tente de novo em instantes.");
    }
  };

  const onPick = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];

    /* Limpa o input antes de sair: sem isso, escolher o MESMO arquivo depois
       de um erro não dispara `change` de novo, e a tela parece travada. */
    ev.target.value = "";

    if (!file) return;

    if (file.size > MAX_PHOTO) {
      alert.warning("Imagem muito grande", "Escolha uma imagem de até 10 MB.");
      return;
    }

    setEnviandoFoto(true);

    try {
      const corpo = new FormData();
      corpo.append("imagem", file);

      /* Sem `Content-Type` à mão: o browser precisa montar o `boundary` do
         multipart sozinho. */
      const { data } = await sysgrafix.post("/upload/usuario", corpo);
      const url = data?.data?.[0]?.url;

      if (!url) throw new Error(data?.message || "Falha ao enviar a foto.");

      await gravarFoto(url);
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      alert.error("Não foi possível enviar a foto", err?.response?.data?.message ?? err?.message ?? "Tente de novo em instantes.");
    } finally {
      setEnviandoFoto(false);
    }
  };

  const regPhone = regProfile("phone");

  const onProfileValid = async () => {
    await profileSaver.save();
    alert.success("Perfil atualizado", "Suas informações foram salvas.");
  };

  const onPwdValid = async () => {
    await pwdSaver.save();
    alert.success("Senha atualizada", "Sua senha foi alterada com sucesso.");
    resetPwd({ current: "", next: "", confirm: "" });
  };

  const onInvalid = () => alert.error("Campos inválidos", "Revise os campos destacados.");

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/*
        Duas colunas: o que se PREENCHE à esquerda, a empresa à direita.

        À esquerda o cartão único do perfil — dados, senha e conta, cada um em
        sua seção. À direita a empresa, em leitura.

        Sem `items-start`: as duas colunas ESTICAM até o fim da tela. Alinhadas
        ao topo, a mais curta terminava no meio e deixava um vazio embaixo que
        fazia a coluna parecer um resto — algo que ficou ali por falta de lugar
        melhor. Preenchendo, as duas são metade da tela cada.
      */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-y-auto xl:grid-cols-2 xl:overflow-hidden">
        {/* Perfil */}
        <SettingsCard corpoRolavel icon={<User className="h-4 w-4" />} title="Meu perfil" desc="Foto e informações pessoais." footer={
            <div className="flex flex-wrap items-center gap-2">
              <SaveRow {...profileSaver} onSave={submitProfile(onProfileValid, onInvalid)} savedLabel="Perfil atualizado" />
              <SaveRow {...pwdSaver} onSave={submitPwd(onPwdValid, onInvalid)} label="Atualizar senha" savedLabel="Senha atualizada" icon={<Shield className="h-4 w-4" />} variant="secondary" disabled={!canUpdatePwd} />
            </div>
          }>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="flex shrink-0 flex-col items-center gap-2">
              <div className="relative h-24 w-24 shrink-0">
                {photo ? (
                  <img
                    src={photo}
                    alt="Foto do perfil"
                    className="h-24 w-24 rounded-2xl border border-accent/40 object-cover"
                    /* Foto apagada do storage por fora não pode virar ícone
                       quebrado: volta para as iniciais. */
                    onError={() => setPhoto(null)}
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-accent/40 bg-gradient-to-br from-accent-strong to-accent-soft text-2xl text-white">{initials}</div>
                )}

                {enviandoFoto && (
                  <span className="absolute inset-0 grid place-items-center rounded-2xl bg-surface/80">
                    <Loader2 size={20} className="animate-spin text-accent" />
                  </span>
                )}
              </div>
              <div className="flex gap-1.5">
                <input ref={fileRef} type="file" accept="image/*" onChange={(ev) => void onPick(ev)} className="hidden" />
                <button type="button" disabled={enviandoFoto} onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-lg border border-fg/[0.1] bg-fg/[0.06] px-3 py-1.5 text-[12px] text-accent-soft transition-colors hover:bg-fg/[0.12] disabled:cursor-not-allowed disabled:opacity-50">
                  <Camera size={14} /> {enviandoFoto ? "Enviando…" : "Trocar"}
                </button>
                {photo && (
                  /* Remover também grava na hora, pelo mesmo motivo de trocar:
                     apagar e ver a foto voltar depois é o mesmo defeito ao
                     contrário. */
                  <button type="button" disabled={enviandoFoto} onClick={() => void gravarFoto(null)} className="flex items-center gap-1.5 rounded-lg border border-danger/25 bg-danger/20 px-3 py-1.5 text-[12px] text-danger transition-colors hover:bg-danger/30 disabled:opacity-50">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>

            <div className="grid min-w-0 flex-1 grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
              <Field label="Nome completo" icon={<User size={15} />} {...regProfile("name")} />
              <Field label="E-mail" icon={<Mail size={15} />} type="email" {...regProfile("email")} />
              <Field
                label="Telefone"
                icon={<Phone size={15} />}
                placeholder="(00) 00000-0000"
                inputMode="tel"
                {...regPhone}
                onChange={(e) => {
                  e.target.value = maskPhone(e.target.value);
                  regPhone.onChange(e);
                }}
              />
              <Field label="Cargo" icon={<Briefcase size={15} />} hint="Definido pela empresa" disabled readOnly {...regProfile("role")} />

              {/*
                Como a pessoa quer ser chamada POR FORA.
                Ocupa a linha inteira (`sm:col-span-2`) porque a dica embaixo é
                mais comprida que a dos outros campos — espremida em meia
                largura ela quebra em três linhas e desalinha a grade.
              */}
              <div className="sm:col-span-2">
                <Field
                  label="Como quer ser chamado"
                  icon={<Signature size={15} />}
                  placeholder={user?.nome?.split(" ")[0] || "Seu primeiro nome"}
                  maxLength={24}
                  hint="Aparece no campo Vendedor da nota e assina suas mensagens no WhatsApp. Em branco, usamos seu primeiro nome."
                  {...regProfile("nomeExibicao")}
                />
              </div>
            </div>
          </div>

          {/*
            A senha mora DENTRO do perfil, e não num cartão ao lado.

            Eram duas caixas com o mesmo peso visual, e a segunda respondia a
            uma pergunta que ninguém faz separado: trocar a senha é mexer no
            próprio cadastro, no mesmo minuto em que se corrige o telefone ou a
            foto. Como seção abaixo dos dados, ela fica no lugar onde a pessoa
            já está — e o cartão de Conta, que é leitura e não formulário, deixa
            de dividir a coluna com um formulário.

            As duas ações continuam SEPARADAS no rodapé: são duas requisições
            e dois resultados, e um botão só obrigaria a mandar a senha atual
            toda vez que alguém troca a foto.
          */}
          <div className="mt-6 border-t border-fg/[0.06] pt-5">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/[0.12] text-accent-soft">
                <Lock className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-[13px] text-ink">Alterar senha</h3>
                <p className="truncate text-[11px] text-faint">Use uma senha forte e única.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Controller control={control} name="current" render={({ field }) => <PasswordField label="Senha atual" {...field} show={showPwd} onToggle={() => setShowPwd((v) => !v)} error={pwdErrors.current?.message} />} />
              <Controller control={control} name="next" render={({ field }) => <PasswordField label="Nova senha" {...field} show={showPwd} onToggle={() => setShowPwd((v) => !v)} error={pwdErrors.next?.message} />} />
              <Controller control={control} name="confirm" render={({ field }) => <PasswordField label="Confirmar nova senha" {...field} show={showPwd} onToggle={() => setShowPwd((v) => !v)} error={pwdErrors.confirm?.message} />} />
            </div>
          </div>

          {/*
            A conta — também dentro do perfil.

            Era o terceiro cartão da tela, e o único que não é formulário: diz
            que a conta está ativa e qual versão do sistema está instalada. Com
            peso de cartão próprio ele parecia oferecer algo para configurar, e
            não oferece — são duas leituras e um botão de emergência. Como
            seção no pé do perfil, fica onde se procura o que é sobre a
            INSTALAÇÃO e não sobre o trabalho.
          */}
          <div className="mt-6 border-t border-fg/[0.06] pt-5">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/[0.12] text-accent-soft">
                <CalendarDays className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-[13px] text-ink">Conta</h3>
                <p className="truncate text-[11px] text-faint">Informações da sua conta no CodeEx Flow</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-xl border border-success/20 bg-success/[0.08] px-4 py-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/25">
                  <Shield size={15} className="text-success" />
                </div>
                <div>
                  <p className="text-sm text-ink">Conta ativa</p>
                  <p className="text-[11px] text-faint">Membro desde {new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</p>
                </div>
              </div>

              {/*
               * A versão do sistema, e o botão que força a atualização.
               *
               * Morava no rodapé da sidebar, onde era a única linha do menu que
               * não levava a lugar nenhum — e o menu é sobre para onde ir, não
               * sobre qual build está instalada. Aqui ela fica junto do resto
               * do que é sobre a INSTALAÇÃO e não sobre o trabalho.
               *
               * O botão continua existindo porque é a única saída para o caso
               * real: o service worker que travou numa versão antiga e serve
               * telas velhas sem avisar. Ele limpa o cache e recarrega — ver
               * `forcarAtualizacao`.
               */}
              <div className="flex items-center gap-3 rounded-xl border border-fg/[0.08] bg-fg/[0.02] px-4 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fg/[0.05] text-faint">
                  <RefreshCw size={15} className={atualizando ? "animate-spin" : ""} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">Versão do sistema</p>
                  <p className="truncate text-[11px] text-faint">{BUILD_ID}</p>
                </div>

                <button
                  type="button"
                  onClick={atualizarAgora}
                  disabled={atualizando}
                  className="focus-ring shrink-0 cursor-pointer rounded-lg border border-fg/[0.1] px-3 py-1.5 text-[12px] text-mist transition-colors hover:text-ink disabled:opacity-60"
                >
                  {atualizando ? "Buscando…" : "Buscar atualização"}
                </button>
              </div>
            </div>
          </div>
        </SettingsCard>


        <CorporateBadge />
      </div>
    </div>
  );
};

export default ProfilePage;
