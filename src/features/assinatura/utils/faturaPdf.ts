import { formatCurrencyFromCents } from "@/shared/utils/currency";
import { formatDocument } from "@/shared/utils/format";
import { FaturaMeta, type Fatura, type MinhaAssinatura } from "@/features/assinatura/types/assinatura.types";

/* Import dinâmico pelo mesmo motivo de `downloadNota`: o jsPDF pesa e só é
   necessário no clique de "Baixar". Aqui o PDF é desenhado em vetor, não
   rasterizado — o texto sai selecionável, nítido em qualquer zoom e o arquivo
   fica na casa dos KB em vez dos MB de um print de tela.

   O desenho é o mesmo da fatura que a API manda pelo WhatsApp
   (`flow-api/src/infrastructure/documentos/faturaPdf.ts`): o cliente que
   recebe uma e baixa a outra tem de reconhecer o mesmo documento. */

/**
 * Dados de quem emite a cobrança.
 *
 * `cnpj` e `endereco` nascem vazios de propósito: são dados cadastrais reais e
 * inventá-los num documento financeiro seria forjar informação. Campo vazio
 * simplesmente não é impresso — preencha aqui e ele passa a aparecer no PDF.
 */
const EMITENTE = {
  nome: "CodeEx Solutions",
  produto: "CodeEx Flow",
  site: "flow.codeexsolutions.com.br",
  cnpj: "",
  endereco: "",
  email: "",
};

type Rgb = [number, number, number];

/** Violeta da marca — o mesmo `--accent` do tema claro (index.css). */
const MARCA: Rgb = [109, 92, 232];
const MARCA_ESCURA: Rgb = [27, 22, 64];
const MARCA_SUAVE: Rgb = [243, 241, 255];
const LAVANDA: Rgb = [201, 194, 255];
const TINTA: Rgb = [22, 20, 43];
const CINZA: Rgb = [107, 106, 128];
const CINZA_CLARO: Rgb = [155, 154, 174];
const LINHA: Rgb = [230, 229, 239];
const FUNDO_SUAVE: Rgb = [247, 247, 251];
const VERDE: Rgb = [15, 138, 95];
const VERDE_SUAVE: Rgb = [231, 246, 239];
const BRANCO: Rgb = [255, 255, 255];

/** Selo de situação: [fundo, texto]. Escrito por extenso — cor sozinha não sobrevive à impressora P&B. */
const SELO: Record<Fatura["status"], [Rgb, Rgb]> = {
  PENDENTE: [[255, 244, 220], [154, 98, 0]],
  VENCIDA: [[253, 232, 232], [180, 35, 24]],
  AGUARDANDO_CONFIRMACAO: [[232, 239, 255], [41, 73, 184]],
  PAGA: [VERDE_SUAVE, VERDE],
  CANCELADA: [[239, 239, 243], [91, 91, 107]],
};

/** A4 retrato, em milímetros. */
const PAGINA_W = 210;
const PAGINA_H = 297;
const MARGEM = 16;
const CONTEUDO_W = PAGINA_W - MARGEM * 2;

const MESES_EXTENSO = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const dataBr = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
};

/** "2026-09" → "setembro de 2026". */
const competenciaExtenso = (competencia: string) => {
  const [ano, mes] = competencia.split("-");
  return MESES_EXTENSO[Number(mes) - 1] ? `${MESES_EXTENSO[Number(mes) - 1]} de ${ano}` : competencia;
};

/**
 * Número legível da fatura.
 *
 * O id é um UUID: ninguém lê, ninguém dita no telefone. A competência mais um
 * sufixo curto identifica a cobrança e ainda diz de quando ela é.
 */
const numeroDaFatura = (f: Fatura) =>
  `${f.competencia.replace("-", "")}-${f.id.replace(/\D/g, "").slice(-4) || f.id.slice(-4)}`.toUpperCase();

const nomeArquivo = (nome: string) =>
  nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "cliente";

/**
 * O Pix copia e cola desta fatura, quando o servidor mandou um que é dela.
 *
 * O `pix` de `MinhaAssinatura` é da fatura em aberto mais antiga. Imprimir
 * esse código na fatura de outro mês (ou com valor que não bate, depois de um
 * desconto) faria o cliente pagar a conta errada — então só entra quando é
 * desta fatura e do valor dela.
 */
const pixDaFatura = (fatura: Fatura, assinatura: MinhaAssinatura) => {
  const pix = assinatura.pix;
  if (!pix?.copiaECola) return null;
  if (assinatura.faturaEmAberto?.id !== fatura.id) return null;
  if (pix.valorCentavos !== fatura.valorCentavos) return null;
  return pix;
};

/**
 * Monta o documento e devolve o par (doc, nome do arquivo), sem salvar.
 *
 * Separado do download para poder ser gerado fora do navegador — é assim que
 * dá para conferir o layout sem ter de clicar na tela a cada ajuste de
 * coordenada.
 */
export async function montarFaturaPdf(fatura: Fatura, assinatura: MinhaAssinatura) {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const empresa = assinatura.empresa;
  const numero = numeroDaFatura(fatura);

  const desconto = Math.max(0, fatura.descontoCentavos ?? 0);
  const original = fatura.valorCentavos + desconto;
  const quitada = fatura.status === "PAGA" || fatura.status === "CANCELADA";
  const pix = quitada ? null : pixDaFatura(fatura, assinatura);

  /* O QR é gerado antes do desenho: é assíncrono, e o resto é síncrono. */
  const qrPix = pix
    ? await (await import("qrcode")).toDataURL(pix.copiaECola, { errorCorrectionLevel: "M", margin: 1, width: 360 })
    : null;

  /* Metadados do arquivo: é o que aparece na aba do leitor de PDF e na busca
     do sistema operacional. Sem isso o documento se chama "untitled". */
  doc.setDocumentProperties({
    title: `Fatura ${numero} — ${EMITENTE.nome}`,
    subject: `Assinatura ${EMITENTE.produto} · ${competenciaExtenso(fatura.competencia)}`,
    author: EMITENTE.nome,
    creator: EMITENTE.produto,
  });

  type OpcoesTexto = {
    tamanho?: number;
    cor?: Rgb;
    peso?: "normal" | "bold";
    align?: "left" | "right" | "center";
    espaco?: number;
    maxWidth?: number;
    fonte?: "helvetica" | "courier";
  };

  const texto = (str: string | string[], x: number, y: number, o: OpcoesTexto = {}) => {
    doc.setFont(o.fonte ?? "helvetica", o.peso ?? "normal");
    doc.setFontSize(o.tamanho ?? 9);
    doc.setTextColor(...(o.cor ?? TINTA));
    doc.text(str, x, y, {
      align: o.align ?? "left",
      ...(o.espaco ? { charSpace: o.espaco } : {}),
      ...(o.maxWidth ? { maxWidth: o.maxWidth } : {}),
    });
  };

  const largura = (str: string, tamanho: number, peso: "normal" | "bold" = "normal") => {
    doc.setFont("helvetica", peso);
    doc.setFontSize(tamanho);
    return doc.getTextWidth(str);
  };

  /** Rótulo de seção: caixa alta, pequeno, espaçado. */
  const rotulo = (str: string, x: number, y: number, align: "left" | "right" = "left") =>
    texto(str, x, y, { tamanho: 6.8, cor: CINZA, peso: "bold", espaco: 0.3, align });

  const fill = (cor: Rgb) => doc.setFillColor(...cor);
  const stroke = (cor: Rgb) => doc.setDrawColor(...cor);

  /* ---------------- Cabeçalho ---------------- */

  fill(MARCA_ESCURA);
  doc.rect(0, 0, PAGINA_W, 42, "F");
  fill(MARCA);
  doc.rect(0, 42, PAGINA_W, 1, "F");

  /* A marca: um quadrado com a inicial, desenhado — não depende de imagem. */
  fill(MARCA);
  doc.roundedRect(MARGEM, 10.5, 12, 12, 3, 3, "F");
  texto(EMITENTE.nome[0], MARGEM + 6, 18.8, { tamanho: 15, peso: "bold", cor: BRANCO, align: "center" });

  texto(EMITENTE.nome, MARGEM + 16, 16, { tamanho: 14, peso: "bold", cor: BRANCO });
  texto(`Fatura de assinatura · ${EMITENTE.produto}`, MARGEM + 16, 21.5, { tamanho: 8.5, cor: LAVANDA });

  texto("FATURA", PAGINA_W - MARGEM, 13, { tamanho: 7, peso: "bold", cor: LAVANDA, align: "right", espaco: 0.5 });
  texto(`Nº ${numero}`, PAGINA_W - MARGEM, 20, { tamanho: 14, peso: "bold", cor: BRANCO, align: "right" });
  texto(`Emitida em ${new Date().toLocaleDateString("pt-BR")}`, PAGINA_W - MARGEM, 25.5, {
    tamanho: 7.5,
    cor: LAVANDA,
    align: "right",
  });

  /* ---------------- Cartão do valor ----------------
   * Sobe por cima da faixa, grande, antes de qualquer outra coisa: quem abre
   * uma fatura quer saber quanto e até quando. */

  const cartaoY = 32;
  const cartaoH = 34;

  fill(BRANCO);
  stroke(LINHA);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGEM, cartaoY, CONTEUDO_W, cartaoH, 3.5, 3.5, "FD");

  const col2 = MARGEM + CONTEUDO_W * 0.52;
  const col3 = MARGEM + CONTEUDO_W * 0.77;

  doc.line(col2 - 5, cartaoY + 7, col2 - 5, cartaoY + cartaoH - 7);
  doc.line(col3 - 5, cartaoY + 7, col3 - 5, cartaoY + cartaoH - 7);

  rotulo(quitada ? "VALOR" : "VALOR A PAGAR", MARGEM + 8, cartaoY + 8.5);
  texto(formatCurrencyFromCents(fatura.valorCentavos), MARGEM + 8, cartaoY + 19.5, {
    tamanho: 22,
    peso: "bold",
    cor: quitada ? TINTA : MARCA,
  });

  if (desconto > 0) {
    /* O "de / por": o valor cheio riscado e a economia ao lado. */
    const riscado = formatCurrencyFromCents(original);
    const wRiscado = largura(riscado, 8);

    texto(riscado, MARGEM + 8, cartaoY + 27.5, { tamanho: 8, cor: CINZA_CLARO });
    stroke(CINZA_CLARO);
    doc.setLineWidth(0.25);
    doc.line(MARGEM + 8, cartaoY + 26.4, MARGEM + 8 + wRiscado, cartaoY + 26.4);

    const economia = `economia de ${formatCurrencyFromCents(desconto)}`;
    const wSelo = largura(economia, 6.8, "bold") + 5;
    const seloX = MARGEM + 11 + wRiscado;

    fill(VERDE_SUAVE);
    doc.roundedRect(seloX, cartaoY + 23.6, wSelo, 5.4, 2.7, 2.7, "F");
    texto(economia, seloX + 2.5, cartaoY + 27.3, { tamanho: 6.8, peso: "bold", cor: VERDE });

    stroke(LINHA);
    doc.setLineWidth(0.3);
  }

  rotulo("VENCIMENTO", col2, cartaoY + 8.5);
  texto(dataBr(fatura.vencimento), col2, cartaoY + 18.5, { tamanho: 14, peso: "bold" });
  texto(competenciaExtenso(fatura.competencia), col2, cartaoY + 24.5, { tamanho: 7.8, cor: CINZA });

  rotulo("SITUAÇÃO", col3, cartaoY + 8.5);
  {
    const [fundo, cor] = SELO[fatura.status];
    const rotuloSelo = FaturaMeta[fatura.status].label.toUpperCase();
    const w = largura(rotuloSelo, 7.5, "bold") + 10;

    fill(fundo);
    doc.roundedRect(col3, cartaoY + 12.5, w, 7, 3.5, 3.5, "F");
    fill(cor);
    doc.circle(col3 + 3.8, cartaoY + 16, 0.9, "F");
    texto(rotuloSelo, col3 + 6.5, cartaoY + 17.4, { tamanho: 7.5, peso: "bold", cor });
  }

  /* ---------------- Emitente e cliente, lado a lado ---------------- */

  let y = cartaoY + cartaoH + 11;
  const colunaD = MARGEM + CONTEUDO_W / 2 + 4;

  rotulo("COBRANÇA PARA", MARGEM, y);
  rotulo("EMITIDA POR", colunaD, y);

  y += 6;
  texto(empresa.nomeFantasia || "—", MARGEM, y, { tamanho: 10.5, peso: "bold" });
  texto(EMITENTE.nome, colunaD, y, { tamanho: 10.5, peso: "bold" });

  /* Cada bloco cresce por conta própria: o emitente pode não ter CNPJ
     preenchido e o cliente sempre tem. Duas réguas independentes evitam que
     uma coluna curta empurre a outra. */
  let yC = y + 5.5;
  let yE = y + 5.5;

  const linhaCliente = (str: string) => {
    if (!str) return;
    texto(str, MARGEM, yC, { tamanho: 8.3, cor: CINZA });
    yC += 4.4;
  };

  const linhaEmitente = (str: string) => {
    if (!str) return;
    texto(str, colunaD, yE, { tamanho: 8.3, cor: CINZA });
    yE += 4.4;
  };

  linhaCliente(empresa.nomeRepresentante ? `A/C ${empresa.nomeRepresentante}` : "");
  linhaCliente(empresa.cpfCnpj ? `CPF/CNPJ ${formatDocument(empresa.cpfCnpj)}` : "");
  linhaCliente(`Código da empresa: ${empresa.codigoEmpresa}`);

  linhaEmitente(EMITENTE.cnpj ? `CNPJ ${formatDocument(EMITENTE.cnpj)}` : "");
  linhaEmitente(EMITENTE.endereco);
  linhaEmitente(assinatura.suporte?.whatsapp ? `WhatsApp ${assinatura.suporte.whatsapp}` : "");
  linhaEmitente(EMITENTE.email || assinatura.suporte?.email || "");

  y = Math.max(yE, yC) + 5;

  /* ---------------- Itens ---------------- */

  fill(FUNDO_SUAVE);
  doc.roundedRect(MARGEM, y, CONTEUDO_W, 8, 1.8, 1.8, "F");
  rotulo("DESCRIÇÃO", MARGEM + 5, y + 5.3);
  rotulo("VALOR", PAGINA_W - MARGEM - 5, y + 5.3, "right");

  y += 14.5;

  const descricao = fatura.descricao || `Assinatura ${EMITENTE.produto}`;
  const planoNome = fatura.planoNome || assinatura.plano?.nome || "";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  const linhasDescricao = (doc.splitTextToSize(descricao, CONTEUDO_W * 0.66) as string[]).slice(0, 2);

  texto(linhasDescricao, MARGEM + 5, y, { tamanho: 9.5, peso: "bold" });
  texto(formatCurrencyFromCents(original), PAGINA_W - MARGEM - 5, y, { tamanho: 9.5, align: "right" });

  y += (linhasDescricao.length - 1) * 4.4 + 4.6;

  texto(
    [planoNome ? `Plano ${planoNome}` : "", `Competência ${competenciaExtenso(fatura.competencia)}`].filter(Boolean).join("  ·  "),
    MARGEM + 5,
    y,
    { tamanho: 7.8, cor: CINZA },
  );

  y += 5;

  if (desconto > 0) {
    stroke(LINHA);
    doc.setLineWidth(0.25);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(MARGEM + 5, y, PAGINA_W - MARGEM - 5, y);
    doc.setLineDashPattern([], 0);

    y += 6;
    texto("Desconto", MARGEM + 5, y, { tamanho: 9.5, peso: "bold", cor: VERDE });
    texto(`– ${formatCurrencyFromCents(desconto)}`, PAGINA_W - MARGEM - 5, y, { tamanho: 9.5, peso: "bold", cor: VERDE, align: "right" });

    if (fatura.descontoMotivo) {
      y += 4.6;
      texto(fatura.descontoMotivo, MARGEM + 5, y, { tamanho: 7.8, cor: CINZA, maxWidth: CONTEUDO_W * 0.66 });
    }

    y += 5;
  }

  stroke(LINHA);
  doc.setLineWidth(0.3);
  doc.line(MARGEM, y, PAGINA_W - MARGEM, y);

  /* ---------------- Total ---------------- */

  y += 6;
  const resumoW = 78;
  const resumoX = PAGINA_W - MARGEM - resumoW;

  if (desconto > 0) {
    texto("Subtotal", resumoX + 5, y, { tamanho: 8.5, cor: CINZA });
    texto(formatCurrencyFromCents(original), resumoX + resumoW - 5, y, { tamanho: 8.5, peso: "bold", cor: CINZA, align: "right" });
    y += 5.2;
    texto("Desconto", resumoX + 5, y, { tamanho: 8.5, cor: VERDE });
    texto(`– ${formatCurrencyFromCents(desconto)}`, resumoX + resumoW - 5, y, { tamanho: 8.5, peso: "bold", cor: VERDE, align: "right" });
    y += 3.5;
  } else {
    y -= 3;
  }

  fill(MARCA_SUAVE);
  doc.roundedRect(resumoX, y, resumoW, 12, 2.8, 2.8, "F");
  texto(quitada ? "TOTAL" : "TOTAL A PAGAR", resumoX + 5, y + 7.5, { tamanho: 7.5, peso: "bold", cor: MARCA, espaco: 0.3 });
  texto(formatCurrencyFromCents(fatura.valorCentavos), resumoX + resumoW - 5, y + 8, { tamanho: 13, peso: "bold", align: "right" });

  /* Linha de "quando" ao lado do total: pago em, comprovante enviado em… */
  const quando =
    fatura.status === "PAGA"
      ? `Pago em ${dataBr(fatura.pagoEm)}`
      : fatura.status === "AGUARDANDO_CONFIRMACAO"
        ? `Comprovante enviado em ${dataBr(fatura.comprovanteEnviadoEm)}`
        : fatura.status === "CANCELADA"
          ? "Cobrança cancelada"
          : `Vence em ${dataBr(fatura.vencimento)}`;

  texto(quando, MARGEM, y + 5, { tamanho: 8.3, cor: CINZA });
  if (fatura.metodoPagamento && fatura.status === "PAGA") {
    texto(`Forma de pagamento: ${fatura.metodoPagamento}`, MARGEM, y + 9.5, { tamanho: 8.3, cor: CINZA });
  }

  y += 12 + 10;

  /* ---------------- Pagamento / recibo ----------------
   * Quem ainda não pagou precisa dos dados para pagar; quem já pagou precisa
   * da frase que transforma a fatura em recibo — que é justamente o motivo de
   * a pessoa baixar o PDF. */

  if (fatura.status === "PAGA" || fatura.status === "CANCELADA") {
    const paga = fatura.status === "PAGA";

    fill(paga ? VERDE_SUAVE : FUNDO_SUAVE);
    doc.roundedRect(MARGEM, y, CONTEUDO_W, 20, 3, 3, "F");
    texto(paga ? "Pagamento confirmado" : "Cobrança cancelada", MARGEM + 6, y + 7.5, {
      tamanho: 10,
      peso: "bold",
      cor: paga ? VERDE : CINZA,
    });
    texto(
      paga
        ? `Recebemos ${formatCurrencyFromCents(fatura.valorCentavos)} referente a ${competenciaExtenso(fatura.competencia)}. Este documento serve como comprovante da assinatura ${EMITENTE.produto} no período.`
        : "Esta fatura foi cancelada e não deve ser paga.",
      MARGEM + 6,
      y + 13,
      { tamanho: 8, cor: CINZA, maxWidth: CONTEUDO_W - 12 },
    );
  } else {
    rotulo("COMO PAGAR", MARGEM, y);
    y += 4;

    const caixaH = pix ? 58 : 26;

    fill(BRANCO);
    stroke(LINHA);
    doc.setLineWidth(0.3);
    doc.roundedRect(MARGEM, y, CONTEUDO_W, caixaH, 3.5, 3.5, "FD");
    fill(MARCA);
    doc.rect(MARGEM + 3.5, y, CONTEUDO_W - 7, 1.2, "F");

    if (pix && qrPix) {
      const qr = 42;

      doc.addImage(qrPix, "PNG", MARGEM + 6, y + 8, qr, qr);

      const tx = MARGEM + 6 + qr + 6;
      const tw = PAGINA_W - MARGEM - 6 - tx;

      texto("Pague com Pix", tx, y + 12, { tamanho: 11, peso: "bold" });
      texto(
        "Abra o app do banco, escolha Pix › Pagar com QR Code e aponte a câmera. O valor já vai junto.",
        tx,
        y + 18,
        { tamanho: 8, cor: CINZA, maxWidth: tw },
      );

      rotulo("PIX COPIA E COLA", tx, y + 29);

      fill(FUNDO_SUAVE);
      doc.roundedRect(tx, y + 31, tw, 13, 1.5, 1.5, "F");

      doc.setFont("courier", "normal");
      doc.setFontSize(6);
      const linhasPix = (doc.splitTextToSize(pix.copiaECola, tw - 5) as string[]).slice(0, 4);
      texto(linhasPix, tx + 2.5, y + 34.5, { tamanho: 6, fonte: "courier" });

      texto(`Beneficiário: ${pix.beneficiario}`, tx, y + 49, { tamanho: 7.5, peso: "bold" });
    } else {
      const chave = assinatura.pix?.chave;

      texto(chave ? `Pix — chave ${chave}` : "Pague pelo sistema", MARGEM + 6, y + 10, { tamanho: 10, peso: "bold" });
      texto(
        chave
          ? `Beneficiário: ${assinatura.pix?.beneficiario ?? ""} · ou pague em Configurações › Faturas, com QR Code e liberação automática.`
          : "Em Configurações › Faturas o QR Code do Pix é gerado na hora e o acesso é liberado automaticamente.",
        MARGEM + 6,
        y + 16.5,
        { tamanho: 8, cor: CINZA, maxWidth: CONTEUDO_W - 12 },
      );
    }
  }

  /* ---------------- Rodapé ---------------- */

  const rodapeY = PAGINA_H - 26;

  stroke(LINHA);
  doc.setLineWidth(0.3);
  doc.line(MARGEM, rodapeY, PAGINA_W - MARGEM, rodapeY);

  const suporte = assinatura.suporte;
  const canais = [suporte?.whatsapp ? `WhatsApp ${suporte.whatsapp}` : "", suporte?.email].filter(Boolean).join("  ·  ");

  if (canais) texto(`Suporte: ${canais}`, MARGEM, rodapeY + 5.5, { tamanho: 7.5, cor: CINZA });

  /* Ressalva obrigatória: isto é demonstrativo de cobrança, não documento
     fiscal. Sem a frase, um PDF com esta cara passa por nota fiscal. */
  texto(
    "Demonstrativo de cobrança de assinatura — não substitui nota fiscal e não é boleto bancário.",
    MARGEM,
    rodapeY + 10,
    { tamanho: 7, cor: CINZA },
  );
  texto(`Gerado em ${new Date().toLocaleString("pt-BR")} por ${EMITENTE.produto}.`, MARGEM, rodapeY + 14, {
    tamanho: 7,
    cor: CINZA_CLARO,
  });

  texto(EMITENTE.site, PAGINA_W - MARGEM, rodapeY + 5.5, { tamanho: 7.5, peso: "bold", cor: MARCA, align: "right" });
  texto(`Nº ${numero}`, PAGINA_W - MARGEM, rodapeY + 10, { tamanho: 7, cor: CINZA_CLARO, align: "right" });

  return { doc, arquivo: `fatura-${fatura.competencia}-${nomeArquivo(empresa.nomeFantasia)}.pdf` };
}

/**
 * Gera o PDF de uma fatura, em nome da CodeEx Solutions, e baixa.
 *
 * Devolve o nome do arquivo salvo — a tela usa isso na mensagem de sucesso.
 */
export async function baixarFaturaPdf(fatura: Fatura, assinatura: MinhaAssinatura): Promise<string> {
  const { doc, arquivo } = await montarFaturaPdf(fatura, assinatura);

  doc.save(arquivo);

  return arquivo;
}
