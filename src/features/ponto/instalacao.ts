/**
 * O ponto como um app instalável separado do Flow.
 *
 * ---------------------------------------------------------------------------
 * Por que um PWA próprio, e não o mesmo
 * ---------------------------------------------------------------------------
 * Quem bate o ponto não é usuário do sistema. Instalar "CodeEx Flow" no
 * celular do funcionário poria na tela dele o ícone de um sistema de gestão
 * que ele não usa e não pode abrir — e o atalho cairia na tela de login. O que
 * ele precisa é de um botão que abre direto no lugar de digitar o CPF.
 *
 * Um segundo `manifest` resolve isso sem um segundo deploy: mesmo domínio,
 * mesmo service worker, outra identidade de instalação. Nome, ícone, cor e
 * `start_url` próprios; `scope` preso em `/ponto`, para o app instalado não
 * virar porta de entrada do resto do sistema.
 *
 * ---------------------------------------------------------------------------
 * O problema do token, e como ele se resolve
 * ---------------------------------------------------------------------------
 * O link do ponto é `/ponto/<token>`, e o token é de cada empresa — não dá
 * para escrevê-lo num arquivo estático que vale para todo mundo. Por isso o
 * `start_url` é `/ponto`, sem token, e essa rota descobre o token guardado
 * neste aparelho na primeira vez que o link foi aberto.
 *
 * É o que permite ao funcionário abrir o link do WhatsApp UMA vez, instalar, e
 * a partir daí entrar pelo ícone — sem procurar a conversa onde o link estava.
 */

const CHAVE = "ponto:ultimo-token";

/** Guarda o token do link que acabou de abrir com sucesso. */
export const lembrarPonto = (token: string): void => {
  if (!token) return;

  try {
    localStorage.setItem(CHAVE, token);
  } catch {
    /* Modo privado do Safari recusa escrita. O link continua funcionando pelo
       endereço completo; só o atalho instalado é que não terá para onde ir. */
  }
};

/** O token guardado neste aparelho, se houver. */
export const pontoLembrado = (): string | null => {
  try {
    return localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
};

export const esquecerPonto = (): void => {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* ver acima */
  }
};

/**
 * Troca o `manifest` da página pelo do ponto.
 *
 * O `index.html` traz o manifest do Flow, injetado no build. Nas rotas do
 * ponto ele é substituído em tempo de execução — é o que faz o navegador
 * oferecer "instalar Ponto" em vez de "instalar CodeEx Flow", com o outro
 * ícone e o outro nome.
 *
 * Também troca o título da tela de início do iOS, que ignora o manifest e lê
 * a meta própria dele.
 *
 * Devolve a função que desfaz: sem ela, quem abrisse o ponto e navegasse para
 * o sistema levaria junto o manifest errado — e o Flow passaria a ser
 * oferecido para instalação com o nome "Ponto".
 */
export const usarManifestDoPonto = (): (() => void) => {
  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  const anterior = link?.getAttribute("href") ?? null;

  const titulo = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
  const tituloAnterior = titulo?.getAttribute("content") ?? null;

  if (link) link.setAttribute("href", "/ponto.webmanifest");
  else {
    const novo = document.createElement("link");

    novo.rel = "manifest";
    novo.href = "/ponto.webmanifest";
    novo.dataset.doPonto = "1";

    document.head.appendChild(novo);
  }

  if (titulo) titulo.setAttribute("content", "Ponto");

  return () => {
    const atual = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');

    if (atual?.dataset.doPonto) atual.remove();
    else if (atual && anterior) atual.setAttribute("href", anterior);

    const t = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');

    if (t && tituloAnterior) t.setAttribute("content", tituloAnterior);
  };
};
