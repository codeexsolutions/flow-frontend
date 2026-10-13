/**
 * Copia um texto para a área de transferência.
 *
 * Aceita uma PROMESSA de texto porque o Safari só deixa copiar dentro do
 * gesto do clique: um `await` de rede antes do `writeText` perde o gesto e a
 * cópia é recusada. Com `ClipboardItem` a cópia começa no clique e o texto
 * chega depois.
 *
 * `execCommand` como reserva: a API moderna exige contexto seguro, e a loja
 * que roda o sistema em `http://` na rede local ficaria sem copiar nada.
 *
 * Devolve `false` quando não havia o que copiar (a promessa veio vazia).
 */
export async function copiarTexto(texto: string | Promise<string | null>): Promise<boolean> {
  const clip = navigator.clipboard;

  if (typeof texto !== "string" && clip?.write && typeof ClipboardItem !== "undefined") {
    let vazio = false;
    const blob = texto.then((t) => {
      if (!t) {
        vazio = true;
        throw new Error("nada a copiar");
      }
      return new Blob([t], { type: "text/plain" });
    });

    try {
      await clip.write([new ClipboardItem({ "text/plain": blob })]);
      return true;
    } catch (err) {
      if (vazio) return false;
      /* Navegador que não aceita promessa no ClipboardItem: segue o caminho comum. */
      void err;
    }
  }

  const valor = await texto;

  if (!valor) return false;

  if (clip?.writeText) {
    try {
      await clip.writeText(valor);
      return true;
    } catch {
      /* cai na reserva */
    }
  }

  const campo = document.createElement("textarea");

  campo.value = valor;
  campo.style.cssText = "position:fixed;left:-9999px;top:0;";
  document.body.appendChild(campo);
  campo.select();
  const ok = document.execCommand("copy");
  campo.remove();

  if (!ok) throw new Error("cópia recusada");

  return true;
}
