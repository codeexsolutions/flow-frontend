import { create } from "zustand";

import AuthService, { type UsuarioSessao } from "@/features/auth/services/auth.service";
import AuthFormInputs from "@/features/auth/schema/auth.schema";
import useAuthProps from "@/features/auth/types/auth.types";
import { alert } from "@/shared/ui/Alert"; // ajuste o caminho se necessário
import useEnterprise from "@/features/empresa/store/enterprise.store";
import { toCodigoEmpresaBase } from "@/shared/domain/empresa";
import useTransicao from "@/shared/session/transicao.store";
import { resetarLojas } from "@/shared/session/resetarLojas";
import { registrarGanchosDeSessao } from "@/shared/api/sysgrafix";
import { lerToken, limparSessao, salvarSessao } from "@/shared/api/sessao";

/*
 * A sessão mora aqui: o token de acesso fica no `localStorage` (veja
 * `shared/api/sessao`) e é espelhado nesta store, junto do usuário devolvido
 * pela API e do estado de navegação. Quem envia o token em cada requisição é o
 * interceptor do `sysgrafix`, lendo do armazenamento — não daqui.
 */

const deSessaoParaUsuario = (sessao: UsuarioSessao) => ({
  id: sessao.id,
  nome: sessao.nome ?? undefined,
  nomeExibicao: sessao.nomeExibicao ?? undefined,
  email: sessao.email,
  cargo: sessao.cargo,
  /* `UserType` sempre declarou `image`, e este mapeamento nunca o preencheu:
     a foto chegava do servidor e era descartada aqui. Era por isso que a tela
     de perfil abria sempre sem foto, mesmo depois de uma gravação bem
     sucedida — ela lê `user.image` para o estado inicial. */
  image: sessao.imagem || undefined,
  permissao: sessao.permissao ?? "",
  root: Boolean(sessao.root),
  codigoEmpresa: sessao.codigoEmpresa,
  ativo: sessao.ativo,
});

type AuthStore = useAuthProps & {
  /** Espelho do que está no `localStorage` — as telas leem daqui. */
  token: string | null;
  loading: boolean;
  initialize: () => void;
  setAuth: (usuario: UsuarioSessao, accessToken?: string, refreshToken?: string) => void;
  clearAuth: () => void;
  atualizarAtivo: (ativo: boolean) => void;
  /**
   * Reflete na sessão o que a tela de perfil acabou de gravar.
   *
   * Sem isto a foto só apareceria no próximo login: a sessão é montada uma vez,
   * na entrada, e nada a reconstrói depois de um PATCH. A pessoa salvava, via a
   * prévia trocar no cartão do perfil e continuava com a foto antiga na barra
   * lateral — o que parece, com toda razão, que a gravação não funcionou.
   */
  atualizarPerfil: (dados: { nome?: string; cargo?: string; image?: string; nomeExibicao?: string }) => void;
};

const useAuth = create<AuthStore>((set, get) => ({
  user: null,

  // Lido na criação da store: um F5 não pode derrubar quem já estava logado.
  token: lerToken(),

  isLogged: false,

  loading: true,

  setAuth(usuario: UsuarioSessao, accessToken?: string, refreshToken?: string) {
    if (accessToken) salvarSessao(accessToken, refreshToken);

    set({
      user: deSessaoParaUsuario(usuario),
      token: accessToken ?? lerToken(),
      isLogged: true,
      loading: false,
    });
  },

  atualizarPerfil(dados) {
    const atual = get().user;

    if (!atual) return;

    /* `image: ""` limpa a foto; ausente preserva. São coisas diferentes, e
       tratar as duas como `undefined` faria a remoção não pegar até o F5. */
    set({
      user: {
        ...atual,
        ...(dados.nome !== undefined ? { nome: dados.nome } : {}),
        ...(dados.nomeExibicao !== undefined ? { nomeExibicao: dados.nomeExibicao } : {}),
        ...(dados.cargo !== undefined ? { cargo: dados.cargo } : {}),
        ...(dados.image !== undefined ? { image: dados.image || undefined } : {}),
      },
    });
  },

  clearAuth() {
    // O token sai primeiro: a partir daqui nenhuma requisição em voo sai
    // autenticada, mesmo que o aviso à API demore ou falhe.
    limparSessao();

    // Melhor esforço — a saída local não pode depender da rede.
    AuthService.logout().catch(() => {});

    // Zera clientes, produtos, vendas, financeiro e empresa: sem isso os dados
    // de quem saiu ficariam visíveis para quem entrar em seguida.
    resetarLojas();

    set({
      user: null,
      token: null,
      isLogged: false,
      loading: false,
    });
  },

  async login(data: AuthFormInputs, aoAutenticar) {
    try {
      const sessao = await AuthService.login(data);

      /*
       * O token é guardado ANTES de qualquer outra chamada: a busca da empresa
       * logo abaixo já sai autenticada, em paralelo com a animação. A sessão só
       * vale depois do `Promise.all`: sem isso o roteador trocaria a tela com
       * a empresa ainda carregando e o sistema abriria numa tela de espera.
       */
      salvarSessao(sessao.accessToken, sessao.refreshToken ?? null);

      const usuario = sessao;

      const carregarEmpresa = usuario.codigoEmpresa
        ? useEnterprise.getState().fetchEnterprise(toCodigoEmpresaBase(usuario.codigoEmpresa))
        : Promise.resolve();

      await Promise.all([aoAutenticar ? aoAutenticar(usuario.nome ?? "") : Promise.resolve(), carregarEmpresa]);

      // Só agora a sessão vale — e o roteador troca de tela com tudo carregado.
      set({ user: deSessaoParaUsuario(usuario), token: sessao.accessToken, isLogged: true, loading: false });

      // Com o sistema montado atrás, o overlay dissolve revelando-o.
      useTransicao.getState().fechar();

      // Sem alerta quando a tela já deu as boas-vindas com a animação.
      if (!aoAutenticar) await alert.success("Login realizado", `Bem-vindo, ${usuario.nome}!`);
    } catch (error) {
      // Token pela metade não serve para nada: se o login falhou depois de
      // gravar, apaga — senão o próximo boot tentaria uma sessão inexistente.
      limparSessao();

      const err = error as { response?: { data?: { message?: string } }; message?: string };

      await alert.error("Erro ao entrar", err?.response?.data?.message ?? err?.message ?? "Usuário ou senha inválidos.");

      throw error;
    }
  },

  initialize: async () => {
    /* Sem token guardado não há sessão para restaurar — e bater em `/me` só
       para tomar 401 atrasaria a tela de login de toda visita. */
    if (!lerToken()) {
      set({ user: null, token: null, isLogged: false, loading: false });
      return;
    }

    try {
      // O token está aqui, mas quem diz se ele ainda vale é a API: um JWT
      // decodificado no navegador é só um texto que ninguém conferiu.
      const usuario = await AuthService.me();

      set({
        user: deSessaoParaUsuario(usuario),
        token: lerToken(),
        isLogged: true,
        loading: true,
      });

      if (usuario.codigoEmpresa) {
        await useEnterprise.getState().fetchEnterprise(toCodigoEmpresaBase(usuario.codigoEmpresa));
      }

      set({
        loading: false,
      });
    } catch (error) {
      get().clearAuth();

      // Token guardado que a API recusou: a sessão EXISTIA e morreu, então o
      // aviso cabe. Quem nunca logou nem chega aqui — saiu no `if` acima.
      const err = error as { response?: { data?: { message?: string } } };
      const mensagem = String(err?.response?.data?.message ?? "").toLowerCase();

      if (mensagem.includes("inválido") || mensagem.includes("expirad")) {
        alert.warning("Sessão expirada", "Sua sessão expirou. Faça login novamente.");
      }
    }
  },

  /** Empresa liberada (pagamento confirmado): o checkout passa a entrar. */
  atualizarAtivo(ativo: boolean) {
    const usuario = get().user;

    if (!usuario) return;

    set({ user: { ...usuario, ativo } });
  },

  async logout() {
    // A animação roda ANTES de a sessão cair; o overlay vive acima do roteador
    // (ver `CamadaTransicao`), então sobrevive ao desmonte da tela atual.
    await useTransicao.getState().tocar("saida", get().user?.nome ?? "");

    get().clearAuth();

    // Login já montado atrás: só então o overlay sai.
    useTransicao.getState().fechar();
  },
}));

/*
 * Liga a renovação automática de sessão à store.
 *
 * `aoRenovar` reaproveita o usuário que o refresh devolve — ele vem relido do
 * banco, então é por aqui que uma empresa reativada volta a valer sem logout.
 * `aoExpirar` derruba a sessão, e o roteador leva para o login sozinho.
 */
registrarGanchosDeSessao({
  aoRenovar: (usuario) => {
    // O `sysgrafix` já gravou o par novo antes de avisar; aqui a store só
    // espelha o que passou a valer.
    useAuth.setState({
      user: deSessaoParaUsuario(usuario as UsuarioSessao),
      token: lerToken(),
      isLogged: true,
    });
  },

  aoExpirar: () => {
    // Só avisa quem de fato tinha sessão: para quem nunca logou, o 401 é o
    // estado normal da tela de login e o alerta seria ruído.
    const tinhaSessao = useAuth.getState().isLogged;

    useAuth.getState().clearAuth();

    if (tinhaSessao) {
      alert.warning("Sessão expirada", "Sua sessão expirou. Faça login novamente.");
    }
  },
});

export default useAuth;
