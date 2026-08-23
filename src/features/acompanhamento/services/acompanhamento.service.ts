import axios from "axios";

import { API_URL } from "@/shared/api/apiUrl";

/**
 * O acompanhamento que o cliente abre — a única tela do sistema sem login.
 *
 * Usa `axios` cru, e não o `sysgrafix`, de propósito. Aquele cliente carrega
 * duas coisas que aqui só atrapalham:
 *
 * 1. **O interceptor de Authorization.** Se o dono da gráfica abrir o link do
 *    próprio cliente na mesma aba em que está logado, o token dele iria junto
 *    numa requisição pública — e o que ele veria na tela deixaria de ser o que
 *    o cliente vê. A conferência ("o Joaquim está vendo o quê?") passaria a
 *    mentir exatamente para quem precisa dela.
 *
 * 2. **A renovação de sessão no 401.** Um link expirado dispararia refresh,
 *    e um refresh falho limpa a sessão: abrir um link velho deslogaria o dono
 *    do sistema.
 */
const publico = axios.create({ baseURL: API_URL });

export type MarcaEmpresa = {
  nome: string;
  logo: string | null;
  /** `#rrggbb` já validado pelo servidor, ou null para o neutro. */
  cor: string | null;
  tema: "claro" | "escuro" | "degrade";
  /** URL da imagem de fundo do cabeçalho, já validada pelo servidor. */
  capa: string | null;
  /**
   * O wallpaper do cadastro da empresa — o mesmo da nota e do orçamento.
   *
   * Serve de fundo da PÁGINA, enquanto a capa é a faixa do cabeçalho. Quem já
   * subiu o wallpaper para a nota vê a página do cliente vestida sem ter
   * configurado nada aqui.
   */
  wallpaper: string | null;
  whatsapp: string | null;
};

export type ProducaoPublica = {
  empresa: MarcaEmpresa;
  planilha: string;
  cliente: string;
  /** `prazo` é a coluna marcada como "é o prazo" na planilha. No máximo uma. */
  colunas: { nome: string; tipo: string; opcoes: { valor: string; cor?: string }[]; prazo?: boolean }[];
  /** Uma entrada por coluna, na mesma ordem de `colunas`. */
  linhas: { valores: (string | null)[]; atualizadoEm: string }[];
  atualizadoEm: string | null;
};

const AcompanhamentoService = {
  /**
   * Devolve `null` quando o link não vale mais — inexistente, revogado ou
   * expirado, sem distinção. A tela mostra a mesma mensagem para os três,
   * porque o servidor também não separa.
   */
  async producao(token: string): Promise<ProducaoPublica | null> {
    try {
      const r = await publico.get(`/publico/producao/${encodeURIComponent(token)}`);

      return (r.data?.data ?? [])[0] ?? null;
    } catch {
      return null;
    }
  },
};

export default AcompanhamentoService;
