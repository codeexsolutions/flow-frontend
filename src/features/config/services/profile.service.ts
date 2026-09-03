import sysgrafix from "@/shared/api/sysgrafix";

export interface ProfileUpdateData {
  nome: string;
  cargo: string;
  imagem?: string;
  /**
   * Como a pessoa quer ser chamada na nota e no WhatsApp.
   *
   * `""` é um valor com significado — "volte a me chamar pelo cadastro" —, e é
   * por isso que ele é enviado em vez de omitido. Omitir diz "não mexi", e o
   * apelido antigo continuaria valendo depois de a pessoa apagar o campo.
   */
  nomeExibicao?: string;
}

const ProfileService = {
  updateProfile: async (data: ProfileUpdateData) => {
    await sysgrafix.patch("/usuarios/alterar-dados", data);
  },
};

export default ProfileService;
