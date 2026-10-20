/**
 * O que o PDV guarda no aparelho para abrir na hora — só texto, e pouco.
 *
 * As notas do dia, os clientes e o catálogo eram pedidos ao servidor a cada
 * abertura, e até a resposta chegar a tela ficava vazia. Guardados aqui, eles
 * aparecem no primeiro quadro e a lista do servidor chega por baixo.
 *
 * Tudo sob o prefixo `codeex-flow:cache:`, e tudo apagado ao SAIR da conta
 * (`limparCacheLocal`, chamado em `resetarLojas`): o próximo a entrar no
 * mesmo aparelho não pode ver as vendas e os clientes de quem saiu.
 *
 * A fila de envio NÃO é apagada: ela guarda vendas que ainda não chegaram ao
 * servidor, e cada tarefa só sobe com a sessão da própria empresa.
 */

export const PREFIXO_CACHE = "codeex-flow:cache:";

export const lerCache = <T>(nome: string): T | null => {
  try {
    const v = localStorage.getItem(PREFIXO_CACHE + nome);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
};

export const gravarCache = (nome: string, valor: unknown) => {
  try {
    localStorage.setItem(PREFIXO_CACHE + nome, JSON.stringify(valor));
  } catch {
    /* Armazenamento cheio ou bloqueado: a tela segue com o servidor. */
  }
};

/** Apaga tudo o que o PDV guardou — notas, clientes e catálogo. */
export const limparCacheLocal = () => {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIXO_CACHE))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* Sem acesso ao armazenamento não há o que apagar. */
  }
};
