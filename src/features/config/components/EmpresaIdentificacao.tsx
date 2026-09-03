import { Building2, User, FileText, Hash } from "lucide-react";
import type { UseFormRegister, FieldErrors, UseFormSetValue, UseFormWatch } from "react-hook-form";
import Field from "@/shared/ui/inputs/Field";
import UploadImagem from "@/shared/ui/UploadImagem";
import { fieldError } from "@/shared/validation/fieldError";
import type { EmpresaInput } from "@/features/config/schema/company.schema";

type EmpresaIdentificacaoProps = {
  register: UseFormRegister<EmpresaInput>;
  errors: FieldErrors<EmpresaInput>;
  setValue: UseFormSetValue<EmpresaInput>;
  watch: UseFormWatch<EmpresaInput>;
};

/**
 * As três imagens da empresa eram campos de "cole a URL aqui".
 *
 * O que isso produziu em produção foi link de CDN do WhatsApp, que expira: a
 * logo some da nota sozinha, e o dono descobre pelo PDF que já mandou pro
 * cliente. Agora escolhe-se o arquivo, ele vira WebP e fica no nosso storage.
 *
 * `shouldDirty` é o que faz o botão Salvar acordar — sem ele a pessoa envia a
 * imagem, vê a prévia trocar, sai da tela e perde tudo.
 */
const EmpresaIdentificacao = ({ register, errors, setValue, watch }: EmpresaIdentificacaoProps) => {
  const definir = (campo: "urlLogo" | "notaBackground") => (url: string | null) =>
    setValue(campo, url ?? "", { shouldDirty: true });

  return (
    <div className="flex flex-col gap-4">
      {/*
        Dois campos por linha.

        Eram quatro campos empilhados, um por linha, cada um com uns 64px — o
        formulário inteiro começava alto demais para caber numa tela presa à
        janela, e sobrava metade da largura do cartão vazia à direita de cada
        um. Os pares não são arbitrários: nome fantasia e representante são os
        dois NOMES da empresa (o que ela se chama e quem responde por ela), e
        documento e inscrição são os dois números dela.

        Numa coluna só abaixo de `sm`: dois campos de texto lado a lado num
        celular dão 150px cada, e o que se digita aí não cabe.
      */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nome fantasia" icon={<Building2 size={15} />} placeholder="Nome da empresa" error={fieldError(errors.nomeFantasia)} {...register("nomeFantasia")} />
        <Field label="Representante" icon={<User size={15} />} placeholder="Nome do responsável" error={fieldError(errors.nomeRepresentante)} {...register("nomeRepresentante")} />
        <Field label="CPF ou CNPJ" icon={<FileText size={15} />} hint="Não editável" disabled readOnly {...register("cpfCnpj")} />
        <Field label="Inscrição municipal" icon={<Hash size={15} />} placeholder="Opcional" error={fieldError(errors.inscMunicipal)} {...register("inscMunicipal")} />
      </div>

      {/*
        As duas imagens lado a lado.

        O wallpaper estava com a largura inteira do cartão num `aspect-[16/6]`:
        na coluna de dois terços isso passava de 250px de altura, mais que os
        quatro campos somados, para escolher uma imagem que aparece a 14% de
        opacidade atrás da nota. Dividindo a linha com a logo, ele cai para
        menos da metade disso e a decisão continua visível — é uma prévia,
        não o documento.

        Uma imagem só para a marca: havia uma segunda caixa, "Imagem da
        empresa", que não aparecia em lugar nenhum além de servir de reserva
        para a própria logo — duas caixas iguais lado a lado, e a pergunta
        inevitável de qual das duas é a que sai na nota.
      */}
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
        <UploadImagem tipo="logo" rotulo="Logo" valor={watch("urlLogo")} onChange={definir("urlLogo")} />

        <div className="flex flex-col gap-1.5">
          <UploadImagem
            tipo="wallpaper"
            rotulo="Fundo da nota"
            formato="largo"
            valor={watch("notaBackground")}
            onChange={definir("notaBackground")}
          />
          <p className="text-[11px] leading-relaxed text-faint">
            Aparece suave atrás da nota e do orçamento, com o conteúdo por cima.
          </p>
        </div>
      </div>
    </div>
  );
};

export default EmpresaIdentificacao;
