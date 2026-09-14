import sysgrafix from "@/shared/api/sysgrafix";

export type SecaoTermos = {
  id: string;
  titulo: string;
  paragrafos: string[];
};

export type TermosLgpd = {
  versao: string;
  titulo: string;
  resumo: string;
  secoes: SecaoTermos[];
};

export type SituacaoTermos = {
  termos: TermosLgpd;
  /** Esta empresa ainda não aceitou a versão vigente. */
  pendente: boolean;
  aceito: boolean;
  aceitoEm: string | null;
  aceitoPor: string | null;
  /** Só o master aceita em nome da empresa — quem decide é a API. */
  podeAceitar: boolean;
};

export type AceiteRegistrado = {
  versao: string;
  aceito_em: string;
  usuario_nome: string | null;
  usuario_email: string | null;
  ip: string | null;
};

const TermosService = {
  /** O texto vigente e a situação da empresa, numa chamada só. */
  async situacao(): Promise<SituacaoTermos> {
    const r = await sysgrafix.get("/termos");
    return r.data?.data as SituacaoTermos;
  },

  async aceitar(): Promise<void> {
    await sysgrafix.post("/termos/aceite");
  },

  /** Todas as versões que a empresa já aceitou — a prova, quando pedirem. */
  async historico(): Promise<AceiteRegistrado[]> {
    const r = await sysgrafix.get("/termos/historico");
    return (r.data?.data ?? []) as AceiteRegistrado[];
  },
};

export default TermosService;
