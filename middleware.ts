import { next } from "@vercel/edge";

/**
 * O cartão que aparece quando alguém cola o link numa conversa.
 *
 * ---------------------------------------------------------------------------
 * Por que isto não dá para resolver no React
 * ---------------------------------------------------------------------------
 * WhatsApp, Telegram, Facebook e Slack montam a prévia lendo o HTML CRU. Eles
 * não executam JavaScript — então o `vestirAba`, que troca favicon e título no
 * navegador, é invisível para eles. E o `index.html` é um arquivo estático,
 * servido igual para `flow.codeexsolutions.com.br` e para o domínio de cada
 * cliente: não há onde escrever a logo de uma empresa específica.
 *
 * Quem sabe de qual empresa é o endereço é o SERVIDOR, no momento do pedido,
 * olhando o `Host`. É o que esta função faz.
 *
 * ---------------------------------------------------------------------------
 * Só o robô passa por aqui
 * ---------------------------------------------------------------------------
 * Gente é devolvida com `next()` na primeira linha útil, sem nenhuma consulta
 * e sem nenhuma alteração — o app continua sendo servido exatamente como
 * antes. A escolha é deliberada e é sobre risco: esta função intercepta o
 * pedido do documento, e um defeito nela derrubaria o sistema inteiro. Restrita
 * ao robô, o pior caso possível é uma prévia sem logo.
 *
 * Pelo mesmo motivo tudo está dentro de um `try`: qualquer erro — API fora,
 * host desconhecido, resposta estranha — cai no `next()` e o pedido segue.
 */

/* Documentos, não arquivos. `assets/`, fontes e qualquer coisa com extensão
   ficam de fora: o robô não pede JavaScript, e interceptar isso seria custo em
   toda requisição da aplicação. */
export const config = {
    matcher: ["/((?!assets/|icons/|fonts/|.*\\.[a-zA-Z0-9]+$).*)"],
};

/**
 * Quem monta prévia de link.
 *
 * Lista de nomes conhecidos em vez de "tudo que não parece navegador": errar
 * para o lado de tratar um humano como robô entregaria a ele uma página em
 * branco com meta tags. Errar para o outro lado só custa a logo na prévia.
 */
const ROBOS = [
    "whatsapp",
    "telegrambot",
    "facebookexternalhit",
    "twitterbot",
    "slackbot",
    "linkedinbot",
    "discordbot",
    "skypeuripreview",
    "embedly",
    "iframely",
    "pinterest",
    "vkshare",
    "redditbot",
    "googlebot",
    "bingbot",
];

const ehRobo = (ua: string) => {
    const baixo = ua.toLowerCase();

    return ROBOS.some((r) => baixo.includes(r));
};

const API =
    (process.env.VITE_API_PRODUCTION || "https://api.codeexsolutions.com.br/v1").replace(/\/+$/, "");

type Marca = {
    nome: string;
    logo: string | null;
    cor: string | null;
    wallpaper: string | null;
};

/** Fecha as aspas e os sinais que quebrariam o atributo do `<meta>`. */
const escapar = (t: string) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export default async function middleware(request: Request) {
    try {
        if (!ehRobo(request.headers.get("user-agent") ?? "")) return next();

        const url = new URL(request.url);
        const host = url.hostname.replace(/^www\./, "");

        const resposta = await fetch(`${API}/publico/marca?host=${encodeURIComponent(host)}`, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(3000),
        });

        if (!resposta.ok) return next();

        const corpo = await resposta.json();
        const marca = (corpo?.data ?? [])[0] as Marca | undefined;

        /* Endereço sem empresa própria — o nosso, por exemplo. A prévia do Flow
           é a que já vem do `index.html`, e reescrevê-la aqui seria manter duas
           versões da mesma coisa. */
        if (!marca?.nome) return next();

        const nome = escapar(marca.nome);
        const descricao = escapar(`Acesse o sistema de ${marca.nome}.`);

        /* A logo é a imagem do cartão; sem ela, o wallpaper serve — é a única
           outra imagem que a empresa já subiu. Sem os dois, o cartão sai sem
           imagem, que é melhor do que sair com a logo de OUTRA marca. */
        const imagem = marca.logo || marca.wallpaper || null;

        const pagina = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${nome}</title>
<meta name="description" content="${descricao}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${nome}" />
<meta property="og:title" content="${nome}" />
<meta property="og:description" content="${descricao}" />
<meta property="og:url" content="${escapar(url.origin + url.pathname)}" />
${imagem ? `<meta property="og:image" content="${escapar(imagem)}" />` : ""}
<meta name="twitter:card" content="${imagem ? "summary_large_image" : "summary"}" />
<meta name="twitter:title" content="${nome}" />
<meta name="twitter:description" content="${descricao}" />
${imagem ? `<meta name="twitter:image" content="${escapar(imagem)}" />` : ""}
${imagem ? `<link rel="icon" href="${escapar(imagem)}" />` : ""}
</head>
<body><h1>${nome}</h1><p>${descricao}</p></body>
</html>`;

        return new Response(pagina, {
            headers: {
                "content-type": "text/html; charset=utf-8",
                /* Cinco minutos: a prévia muda quando o dono troca a logo, o que
                   acontece uma vez por ano. Sem cache, cada compartilhamento
                   viraria uma consulta ao banco. */
                "cache-control": "public, max-age=300",
            },
        });
    } catch {
        /* Ver a nota do topo: qualquer falha aqui devolve o pedido ao caminho
           normal. Prévia sem logo é um enfeite perdido; documento que não
           carrega é o sistema fora do ar. */
        return next();
    }
}
