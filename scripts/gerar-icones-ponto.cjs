/**
 * Gera o jogo de ícones do PWA do PONTO.
 *
 *   npm run icones:ponto
 *
 * Ícone próprio, e não o do Flow, porque são dois apps instaláveis no mesmo
 * celular — o dono da loja tem os dois. Dois atalhos com a mesma cara é o
 * mesmo que não ter atalho: a pessoa abre no chute e acerta metade das vezes.
 *
 * Desenhado aqui em SVG em vez de sair de um PNG: é um relógio, não a logo da
 * empresa. Vetor rasteriza limpo em qualquer tamanho e não exige que alguém
 * mantenha mais um arquivo de arte no repositório.
 */

const sharp = require("sharp");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const SAIDA = path.join(RAIZ, "public");

/** As mesmas cores do manifest — o recorte não pode destoar do splash. */
const FUNDO = "#0e0d1a";
const MARCA = "#7c6cf5";

/**
 * O desenho. `margem` é a fração livre em cada borda.
 *
 * O maskable precisa de 20% de folga: o Android recorta o ícone em círculo ou
 * squircle conforme o aparelho, e sem a margem o relógio aparece comido.
 */
const svg = (lado, margem) => {
  const util = lado * (1 - margem * 2);
  const centro = lado / 2;
  const raio = util / 2;

  /* Traço proporcional ao tamanho: fixo em px, o ícone de 192 sairia grosso
     demais e o de 512, um fio. */
  const traco = Math.max(2, lado * 0.045);

  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 ${lado} ${lado}">
      <rect width="${lado}" height="${lado}" fill="${FUNDO}"/>
      <circle cx="${centro}" cy="${centro}" r="${raio - traco / 2}"
              fill="none" stroke="${MARCA}" stroke-width="${traco}"/>
      <g stroke="${MARCA}" stroke-width="${traco}" stroke-linecap="round">
        <line x1="${centro}" y1="${centro}" x2="${centro}" y2="${centro - raio * 0.5}"/>
        <line x1="${centro}" y1="${centro}" x2="${centro + raio * 0.36}" y2="${centro}"/>
      </g>
    </svg>
  `);
};

const SAIDAS = [
  { arquivo: "ponto-192.png", tamanho: 192, margem: 0.12 },
  { arquivo: "ponto-512.png", tamanho: 512, margem: 0.12 },
  { arquivo: "ponto-maskable-512.png", tamanho: 512, margem: 0.2 },
];

(async () => {
  for (const { arquivo, tamanho, margem } of SAIDAS) {
    const destino = path.join(SAIDA, arquivo);

    await sharp(svg(tamanho, margem), { density: 300 }).png().toFile(destino);

    console.log(`✓ ${arquivo} (${tamanho}px)`);
  }
})().catch((erro) => {
  console.error("Falha ao gerar os ícones do ponto:", erro?.message ?? erro);
  process.exit(1);
});
