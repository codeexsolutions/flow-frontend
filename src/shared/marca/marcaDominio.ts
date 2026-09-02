import { create } from "zustand";

import sysgrafix from "@/shared/api/sysgrafix";

/**
 * A empresa dona do endereço pelo qual o sistema foi aberto.
 *
 * A gráfica que aponta `wiiprintsublimacao.com.br` para cá não quer só um link
 * bonito: ela quer que o sistema seja DELA. Até aqui o endereço mudava e a tela
 * de entrada continuava sendo a nossa — o funcionário digitava o domínio da
 * própria loja e era recebido por outra marca, com um campo pedindo o CNPJ do
 * patrão, que ninguém decora.
 *
 * Com isto, abrir pelo domínio da empresa dá: a aba com a logo e o nome dela, a
 * tela de entrada vestida com a marca dela, e o documento já preenchido. Abrir
 * pelo nosso endereço não muda nada — continua sendo o Flow.
 */
export type MarcaDominio = {
  nome: string;
  documento: string | null;
  logo: string | null;
  cor: string | null;
  wallpaper: string | null;
};

type Estado = {
  /** `null` = o endereço não é de nenhuma empresa (o nosso, ou `localhost`). */
  marca: MarcaDominio | null;
  /**
   * `true` até a resposta chegar.
   *
   * Quem espera é só a tela de ENTRADA, e ela espera de propósito: pintar a
   * nossa marca e trocá-la meio segundo depois é pior do que segurar o
   * conteúdo por um instante — o usuário vê o sistema "se corrigindo", e o
   * campo do documento pularia embaixo do cursor de quem já começou a digitar.
   */
  carregando: boolean;
  carregar: () => Promise<void>;
};

/**
 * Endereços que são NOSSOS — neles a pergunta nem é feita.
 *
 * Poupa uma requisição em toda abertura no domínio principal e em
 * desenvolvimento, que são a esmagadora maioria delas. Comparado por sufixo
 * para cobrir os previews da hospedagem (`*.vercel.app`).
 */
const NOSSOS = ["codeexsolutions.com.br", "vercel.app", "localhost", "127.0.0.1"];

const ehNosso = (host: string) => NOSSOS.some((n) => host === n || host.endsWith(`.${n}`));

const useMarcaDominio = create<Estado>((set) => ({
  marca: null,
  carregando: true,

  async carregar() {
    const host = window.location.hostname;

    if (ehNosso(host)) {
      set({ marca: null, carregando: false });
      return;
    }

    try {
      const { data } = await sysgrafix.get("/publico/marca", {
        params: { host },
        /* Sem o aviso de carregamento: isto roda no boot, e uma caixa
           "carregando" por cima da tela de entrada a cada abertura seria
           barulho para uma pergunta que quase sempre volta em milissegundos. */
        carregamento: false,
      });

      const marca = (data?.data ?? [])[0] as MarcaDominio | undefined;

      set({ marca: marca ?? null, carregando: false });
    } catch {
      /* API fora, endereço desconhecido, o que for: o sistema abre com a nossa
         marca. Uma tela de entrada que não abre porque a logo do cliente não
         pôde ser buscada seria trocar um enfeite por um bloqueio. */
      set({ marca: null, carregando: false });
    }
  },
}));

/**
 * Escreve a identidade da empresa na ABA do navegador.
 *
 * Título e favicon não são React: vivem no `<head>`, fora da árvore. Ficam
 * aqui, numa função só, porque são o par que sempre muda junto — trocar um sem
 * o outro deixa a aba com o nome da loja e o ícone do Flow, que é pior do que
 * não personalizar nada.
 *
 * O favicon precisa ser um elemento NOVO a cada troca: reaproveitar o `<link>`
 * existente só mudando o `href` é ignorado por parte dos navegadores, que
 * mantêm o ícone já desenhado.
 */
export const vestirAba = (marca: MarcaDominio | null) => {
  if (!marca) return;

  if (marca.nome) document.title = marca.nome;

  if (!marca.logo) return;

  for (const antigo of Array.from(document.querySelectorAll("link[rel~='icon']"))) {
    antigo.remove();
  }

  const icone = document.createElement("link");

  icone.rel = "icon";
  icone.href = marca.logo;

  document.head.appendChild(icone);
};

export default useMarcaDominio;
