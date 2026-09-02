import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Lock, Eye, EyeOff, FileText, AlertCircle } from "lucide-react";

import AuthFormInputs, { authSchema } from "@/features/auth/schema/auth.schema";
import { formatDocument } from "@/shared/utils/format";

type AuthFormProps = {
  onSubmit: (data: AuthFormInputs) => Promise<void>;
  isLoading: boolean;
  loginError: boolean;
  /**
   * O documento da empresa dona do endereço, já preenchido.
   *
   * Quem abre o sistema pelo domínio da própria loja não deveria ter de saber
   * o CNPJ do patrão de cabeça — o endereço já diz de quem é. O campo continua
   * na tela e continua editável: recolhê-lo pouparia uma linha e cobraria caro
   * no dia em que a pessoa precisar entrar em outra empresa pelo mesmo
   * endereço, que acontece com contador e com quem tem duas lojas.
   */
  documentoEmpresa?: string | null;
};

const AuthForm = ({ onSubmit, isLoading, loginError, documentoEmpresa }: AuthFormProps) => {
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<AuthFormInputs>({
    resolver: zodResolver(authSchema),
    /* Entra como valor PADRÃO do formulário, e não por `setValue` num efeito:
       assim ele já nasce preenchido e válido, sem o campo piscar vazio no
       primeiro quadro nem marcar erro antes de a marca chegar. */
    defaultValues: documentoEmpresa ? { cpfCnpjEmpresa: formatDocument(documentoEmpresa) } : undefined,
  });

  const regCpfCnpj = register("cpfCnpjEmpresa");

  // Classe base dos inputs — maiores e mais legíveis
  const inputBase = "w-full rounded-xl border bg-fg/[0.04] py-3 pl-11 text-[15px] text-ink outline-none transition-colors placeholder:text-faint focus:bg-fg/[0.06]";
  const borderOk = "border-fg/[0.1] focus:border-accent";
  const borderErr = "border-danger/50 focus:border-danger";

  /*
   * Acessibilidade dos erros.
   *
   * `aria-invalid` sozinho anuncia "inválido" e para aí — a pessoa fica sabendo
   * que errou, não o que errou. `aria-describedby` amarra a mensagem ao campo,
   * e `role="alert"` faz o leitor de tela ler assim que ela aparece, sem
   * esperar o foco voltar ao campo.
   */
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      {loginError && (
        <div className="flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3">
          <AlertCircle className="mt-0.5 h-[18px] w-[18px] shrink-0 text-danger" />
          <p className="text-[13px] leading-snug text-danger">Dados de acesso incorretos. Confira e tente novamente.</p>
        </div>
      )}

      {/* CPF / CNPJ */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="cpfCnpjEmpresa" className="text-[13px] text-mist">
          CPF ou CNPJ da empresa
        </label>
        <div className="relative">
          <FileText className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-mist" />
          <input
            id="cpfCnpjEmpresa"
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
            aria-invalid={!!errors.cpfCnpjEmpresa}
            aria-describedby={errors.cpfCnpjEmpresa ? "erro-cpfCnpjEmpresa" : undefined}
            className={`${inputBase} pr-4 ${errors.cpfCnpjEmpresa ? borderErr : borderOk}`}
            {...regCpfCnpj}
            onChange={(e) => {
              const formatted = formatDocument(e.target.value);
              e.target.value = formatted;
              setValue("cpfCnpjEmpresa", formatted, { shouldValidate: true });
            }}
          />
        </div>
        {errors.cpfCnpjEmpresa?.message && (
          <p id="erro-cpfCnpjEmpresa" role="alert" className="text-[12.5px] text-danger">
            {errors.cpfCnpjEmpresa.message}
          </p>
        )}
      </div>

      {/* Email */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-[13px] text-mist">
          Email
        </label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-mist" />
          <input id="email" type="email" placeholder="seu@email.com" autoComplete="email" aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "erro-email" : undefined} className={`${inputBase} pr-4 ${errors.email ? borderErr : borderOk}`} {...register("email")} />
        </div>
        {errors.email?.message && (
          <p id="erro-email" role="alert" className="text-[12.5px] text-danger">
            {errors.email.message}
          </p>
        )}
      </div>

      {/* Senha */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="senha" className="text-[13px] text-mist">
            Senha
          </label>
          <button type="button" className="text-[13px] text-accent transition-colors hover:text-accent-soft">
            Esqueceu a senha?
          </button>
        </div>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-mist" />
          <input id="senha" type={showPassword ? "text" : "password"} placeholder="••••••••" autoComplete="current-password" aria-invalid={!!errors.senha}
            aria-describedby={errors.senha ? "erro-senha" : undefined} className={`${inputBase} pr-11 ${errors.senha ? borderErr : borderOk}`} {...register("senha")} />
          <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-mist transition-colors hover:text-accent-soft" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {errors.senha?.message && (
          <p id="erro-senha" role="alert" className="text-[12.5px] text-danger">
            {errors.senha.message}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="group relative mt-1 w-full overflow-hidden rounded-xl bg-gradient-to-r from-accent-soft via-accent to-accent-strong py-3 text-[15px] text-white shadow-glow transition-all duration-200 hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-fg/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
        <span className="relative">{isLoading ? "Entrando..." : "Entrar"}</span>
      </button>
    </form>
  );
};

export default AuthForm;
