import sysgrafix from "@/shared/api/sysgrafix";

/** O registro que falta criar no provedor do domínio. Vem da hospedagem. */
export type RegistroDns = {
  tipo: "A" | "CNAME" | "TXT";
  /** O que vai no campo "nome"/"host" do painel do provedor. */
  nome: string;
  valor: string;
};

/** O que a conferência do domínio respondeu. `responde: null` = ninguém pediu ainda. */
export type EstadoDominio = {
  dominio: string | null;
  responde: boolean | null;
  detalhe: string | null;
  /** `null` = sem integração com a hospedagem; o cadastro lá é manual. */
  naHospedagem: boolean | null;
  registro: RegistroDns | null;
  /**
   * O TXT de posse, quando a hospedagem ainda não confirmou que o domínio é
   * seu. Enquanto ele existir, o certificado NÃO é emitido — e o endereço
   * responde derrubando a conexão, sem cara de "falta configurar".
   */
  verificacao: RegistroDns | null;
  /** O DNS aponta para cá, segundo a hospedagem. `null` = sem integração. */
  apontado: boolean | null;
};

const um = <T>(r: { data?: { data?: T[] } }): T => (r.data?.data ?? [])[0] as T;

/**
 * O endereço próprio da empresa — `joseanfardamentos.com` no lugar do nosso
 * domínio nos links que ela manda para os clientes.
 *
 * A empresa sai do token; nenhuma destas chamadas leva id. Ver a nota na rota.
 */
const DominioService = {
  async ler() {
    return um<{ dominio: string | null }>(await sysgrafix.get("/empresas/dominio"));
  },

  /**
   * Vazio ou `null` volta ao endereço padrão do sistema.
   *
   * Salvar também CADASTRA o domínio no projeto da hospedagem, quando há
   * integração — é o passo que antes alguém fazia à mão no painel, uma vez por
   * cliente, e que por isso era esquecido.
   */
  async salvar(dominio: string | null) {
    return um<{ dominio: string | null; problema: string | null }>(
      await sysgrafix.patch("/empresas/dominio", { dominio }),
    );
  },

  /**
   * Pergunta ao servidor se o endereço já está no ar servindo este app.
   *
   * Quem confere é a API, e não esta tela: do navegador, a tentativa esbarraria
   * no CORS do próprio domínio sendo testado — e um erro de CORS é
   * indistinguível de "não existe" para quem está olhando.
   */
  async verificar() {
    return um<EstadoDominio>(await sysgrafix.post("/empresas/dominio/verificar"));
  },
};

export default DominioService;
