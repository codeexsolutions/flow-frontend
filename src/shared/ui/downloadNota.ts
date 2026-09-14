import { entregarArquivo } from "@/shared/ui/DownloadButton";

/* Import dinâmico de propósito: o jsPDF (e o html2canvas que ele arrasta)
   pesam ~400 kB e só são necessários no clique de "Baixar PDF". Com o import
   estático o bundle principal cresceria além do limite do PWA e o service
   worker falharia. */

/**
 * Nome de arquivo a partir do nome da empresa: sem acentos, sem espaços
 * estranhos — "Loja da Maria" vira "loja-da-maria".
 */
const nomeArquivo = (nome: string) =>
  nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "nota";

/**
 * Gera o PDF da nota a partir do PNG já rasterizado.
 *
 * O PNG da nota (via `handleDownload`) já tem o visual completo — incluindo o
 * wallpaper e a logo. Aqui ele é colado numa página A4 e salvo como
 * `nota-<empresa>.pdf`.
 *
 * Nota longa demais para uma página vira várias: a cada página a imagem é
 * deslocada para cima, revelando a próxima fatia — o mesmo resultado de uma
 * nota que rolaria na tela.
 */
/**
 * O PDF da nota como ARQUIVO, sem baixar nada.
 *
 * Nasceu do envio pelo WhatsApp: a nota que sai da conversa vai para o
 * cliente, não para a pasta de downloads de quem atende. `baixarNotaPdf`
 * continua existindo e passou a usar isto — o desenho da página é o mesmo, o
 * que muda é o destino.
 */
/**
 * `nomeBase`, quando vem, é o nome do arquivo INTEIRO (sem extensão).
 *
 * O padrão — `nota-<empresa>-<data>` — serve à nota baixada de dentro dela
 * mesma, onde não há outro identificador à mão. Nas LISTAS há: a linha sabe se
 * é orçamento ou nota e sabe o número. Sem este parâmetro, o mesmo documento
 * saía como `orcamento-12.png` pela imagem e `nota-orcamento-12-2026-09-08.pdf`
 * pelo PDF — dois nomes, duas categorias e a palavra "nota" num orçamento.
 */
export async function gerarPdfNota(blob: Blob, nomeEmpresa: string, nomeBase?: string): Promise<{ arquivo: Blob; nome: string }> {
  const { jsPDF } = await import("jspdf");
  const data = new Date().toISOString().slice(0, 10);

  return new Promise<{ arquivo: Blob; nome: string }>((resolve, reject) => {
    const leitor = new FileReader();

    leitor.onerror = reject;

    leitor.onload = () => {
      const dataUrl = String(leitor.result);
      const img = new Image();

      img.onerror = () => reject(new Error("Falha ao ler a imagem da nota."));

      img.onload = () => {
        try {
          const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });

          const paginaW = 210;
          const paginaH = 297;
          const margem = 8;
          const areaW = paginaW - margem * 2;
          const areaH = paginaH - margem * 2;

          const proporcao = img.height / img.width;
          const w = areaW;
          const h = w * proporcao;

          const paginas = Math.max(1, Math.ceil(h / areaH));

          for (let i = 0; i < paginas; i++) {
            if (i > 0) doc.addPage();
            // Desloca a imagem para cima a cada página — a fatia visível muda.
            doc.addImage(dataUrl, "PNG", margem, margem - i * areaH, w, h);
          }

          const nome = nomeBase ? `${nomeArquivo(nomeBase)}.pdf` : `nota-${nomeArquivo(nomeEmpresa)}-${data}.pdf`;

          resolve({ arquivo: doc.output("blob"), nome });
        } catch (err) {
          reject(err);
        }
      };

      img.src = dataUrl;
    };

    leitor.readAsDataURL(blob);
  });
}

export async function baixarNotaPdf(blob: Blob, nomeEmpresa: string, nomeBase?: string): Promise<string> {
  const { arquivo, nome } = await gerarPdfNota(blob, nomeEmpresa, nomeBase);

  /* A entrega é a MESMA do PNG — inclusive o menu nativo de salvar, único
     caminho que funciona dentro do app instalado, onde `<a download>` não tem
     para onde salvar. O link solto que morava aqui deixava quem usa o atalho
     da tela de início sem o PDF. */
  await entregarArquivo(arquivo, nome);

  return nome;
}


/* ══════════════════════ Ver antes de baixar ══════════════════════ */

/**
 * A aba reservada no clique, esperando o documento ficar pronto.
 *
 * Rasterizar a nota leva de meio a dois segundos, e `window.open` chamado
 * DEPOIS disso é bloqueado como pop-up em todo navegador: o bloqueador só
 * libera a janela que nasce dentro do gesto da pessoa. Então a aba é aberta
 * em branco no instante do clique e preenchida quando o arquivo existe.
 */
let abaReservada: Window | null = null;

/** Chame no `onClick`, antes de qualquer `await`. */
export function reservarAba(): void {
  try {
    abaReservada = window.open("", "_blank");

    if (abaReservada) {
      /* A aba em branco fica um tempo sem nada, e aba vazia parece travada. */
      abaReservada.document.write(
        '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
        "<title>Preparando o documento…</title></head>" +
        '<body style="margin:0;display:grid;place-items:center;height:100vh;' +
        'font:15px system-ui,sans-serif;background:#0f1115;color:#8b90a0">' +
        "Preparando o documento…</body></html>",
      );

      /*
       * FECHAR O STREAM AQUI é o que faz a troca de conteúdo funcionar.
       *
       * `document.write` sem `close()` deixa o parser da aba aberto, esperando
       * mais texto. Enquanto ele está assim, escrever de novo APENDA ao que já
       * está lá em vez de substituir — e o resultado é a aba presa no
       * "Preparando o documento…" com o documento real nunca aparecendo.
       *
       * Com o stream fechado, a aba tem um documento completo e pronto, e
       * `abrirDocumento` troca o conteúdo pelo DOM (ver lá), que é definido e
       * não depende de timing nenhum.
       */
      abaReservada.document.close();
    }
  } catch {
    /* Bloqueador agressivo: `abrirDocumento` cai no download direto. */
    abaReservada = null;
  }
}

/** Escapa o que vai para dentro do HTML da aba. */
const escapar = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/**
 * Mostra o documento numa aba — e é LÁ que se escolhe baixar.
 *
 * ---------------------------------------------------------------------------
 * Por que existir
 * ---------------------------------------------------------------------------
 * Até aqui, ver a nota pronta exigia BAIXAR a nota. Conferir se o desconto
 * saiu certo antes de mandar para o cliente custava um arquivo na pasta de
 * downloads — e, no fim do dia, uma pasta cheia de notas que ninguém queria
 * guardar. A conferência é o gesto comum; o download é a exceção.
 *
 * A aba mostra a imagem da nota em tamanho de leitura e oferece os dois
 * formatos em botões. Quem só queria conferir fecha a aba e não deixa nada
 * para trás.
 *
 * ---------------------------------------------------------------------------
 * A imagem primeiro, o PDF depois
 * ---------------------------------------------------------------------------
 * A aba é escrita assim que o PNG existe — é ele que a pessoa precisa ver. O
 * PDF é montado em seguida, com a aba já aberta, e acende o próprio botão
 * quando fica pronto. Esperar os dois antes de escrever nada era o que fazia a
 * espera parecer o dobro do que é.
 *
 * As URLs NÃO são revogadas: revogar mataria a imagem e os botões da aba que
 * acabou de abrir. Elas morrem quando a aba (ou a que a abriu) fecha.
 */
export async function abrirDocumento(png: Blob, nomeBase: string, nomeEmpresa: string): Promise<void> {
  const aba = abaReservada;
  abaReservada = null;

  /*
   * Vale para a aba que nunca existiu E para a que não serve mais: fechada por
   * quem clicou enquanto a foto era gerada, ou sem `body` porque o navegador
   * recusou o `document.write` da reserva. Nos três casos a pessoa pediu um
   * documento e precisa recebê-lo — e mexer no DOM de uma aba fechada
   * lançaria um erro que as telas engolem calado.
   */
  if (!aba || aba.closed || !aba.document?.body) {
    await baixarNotaPdf(png, nomeEmpresa, nomeBase);
    return;
  }

  const nome = nomeArquivo(nomeBase);
  const urlPng = URL.createObjectURL(png);

  const botao = "display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:10px;text-decoration:none;font:14px system-ui,sans-serif;border:1px solid #2b2f3a";

  /*
   * O conteúdo entra pelo DOM, e NÃO por um segundo `document.write`.
   *
   * Reabrir o stream (`document.open()` + `write`) era o que prendia a aba no
   * "Preparando o documento…": o primeiro write havia deixado o parser aberto,
   * e o segundo apendava em vez de substituir. Com a aba já fechada em
   * `reservarAba`, trocar `title` e `body` é uma operação definida, sem corrida
   * com o parser e sem depender de quanto tempo levou para a foto ficar pronta.
   */
  aba.document.title = nome;

  aba.document.body.setAttribute(
    "style",
    "margin:0;background:#0f1115;color:#e6e8ef;font:15px system-ui,sans-serif",
  );

  aba.document.body.innerHTML = `
  <div style="position:sticky;top:0;display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:12px 16px;background:#151822;border-bottom:1px solid #2b2f3a">
    <span style="margin-right:auto;font-size:13px;color:#8b90a0">${escapar(nome)}</span>
    <a id="pdf" style="${botao};background:#1c2030;border-color:#2b2f3a;color:#8b90a0;cursor:progress">Preparando PDF…</a>
    <a href="${urlPng}" download="${escapar(nome)}.png" style="${botao};background:#1c2030;color:#e6e8ef">Baixar imagem</a>
  </div>
  <div style="padding:24px 16px;display:flex;justify-content:center">
    <img src="${urlPng}" alt="Documento" style="max-width:900px;width:100%;height:auto;border-radius:12px;box-shadow:0 20px 60px -20px #000">
  </div>`;

  /*
   * O PDF vem DEPOIS da aba, não antes.
   *
   * Montar o PDF custa mais um segundo sobre a rasterização, e enquanto ele
   * não existia a pessoa ficava olhando "Preparando o documento…" sem ter o
   * que conferir — sendo que conferir é para o que a aba serve, e a imagem já
   * estava pronta. Agora a nota aparece assim que a foto sai; o botão de PDF
   * nasce apagado e acende quando o arquivo fica pronto.
   */
  try {
    const { arquivo: pdf } = await gerarPdfNota(png, nomeEmpresa, nomeBase);

    if (aba.closed) return;

    const link = aba.document.getElementById("pdf") as HTMLAnchorElement | null;
    if (!link) return;

    link.href = URL.createObjectURL(pdf);
    link.download = `${nome}.pdf`;
    link.textContent = "Baixar PDF";
    link.style.background = "#6c5ce7";
    link.style.borderColor = "#6c5ce7";
    link.style.color = "#fff";
    link.style.cursor = "pointer";
  } catch (err) {
    console.error("Falha ao preparar o PDF do documento", err);

    if (aba.closed) return;

    const link = aba.document.getElementById("pdf");
    if (link) link.textContent = "PDF indisponível";
  }
}

/**
 * O documento direto na pasta de downloads, sem passar por aba nenhuma.
 *
 * A aba resolveu a conferência, mas nem todo mundo quer conferir: quem já
 * sabe o que tem na nota só quer o arquivo para mandar, e para essa pessoa a
 * guia é um passo a mais — abre, espera, clica em "Baixar PDF", fecha. Por
 * isso os dois gestos convivem lado a lado no botão, e este é o atalho.
 */
export async function baixarDocumento(png: Blob, nomeBase: string, nomeEmpresa: string): Promise<void> {
  await baixarNotaPdf(png, nomeEmpresa, nomeBase);
}

/** Desfaz a aba reservada quando o documento não vai mais abrir (erro, ou o
    clique era de baixar). Aba em branco esquecida é pior que aba nenhuma. */
export function descartarAba(): void {
  try {
    abaReservada?.close();
  } catch {
    /* Navegador que recusa fechar o que abriu: nada a fazer. */
  }

  abaReservada = null;
}
