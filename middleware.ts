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

/*
 * Dois alvos, por motivos diferentes.
 *
 * O primeiro são DOCUMENTOS — `assets/`, fontes e qualquer coisa com extensão
 * ficam de fora, porque o robô de prévia não pede JavaScript e interceptar isso
 * seria custo em toda requisição da aplicação.
 *
 * O segundo é o manifest do PWA da empresa, num caminho PRÓPRIO — ver a nota em
 * `manifestDaMarca` sobre por que o endereço precisa ser outro.
 */
export const config = {
    matcher: ["/((?!assets/|icons/|fonts/|.*\\.[a-zA-Z0-9]+$).*)", "/marca/manifest.webmanifest"],
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

/** Busca quem é o dono do endereço. `null` no nosso domínio e em qualquer falha. */
async function marcaDoHost(host: string): Promise<Marca | null> {
    const resposta = await fetch(`${API}/publico/marca?host=${encodeURIComponent(host)}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(3000),
    });

    if (!resposta.ok) return null;

    const corpo = await resposta.json();
    const marca = (corpo?.data ?? [])[0] as Marca | undefined;

    return marca?.nome ? marca : null;
}

/**
 * O manifest do app instalado, com a marca da empresa.
 *
 * Instalado na tela de início, o sistema virava um ícone do Flow com o nome do
 * Flow — dentro do celular do funcionário de outra loja. O manifest é o arquivo
 * que decide isso, e ele é estático: um só, servido igual para todos os
 * domínios.
 *
 * ---------------------------------------------------------------------------
 * Por que num endereço PRÓPRIO, e não no `/manifest.webmanifest`
 * ---------------------------------------------------------------------------
 * O `manifest.webmanifest` está no precache do service worker. Servi-lo daqui
 * funcionaria na primeira visita e pararia de funcionar na segunda, quando o
 * cache assume — o pior tipo de defeito, o que só aparece depois e não deixa
 * rastro. Num caminho que o worker não conhece, todo pedido vai à rede.
 *
 * Quem aponta o `<link rel="manifest">` para cá é a aplicação, ao descobrir que
 * o endereço tem dono (ver `vestirAba`). No nosso domínio nada aponta para
 * aqui, e o manifest de sempre continua valendo.
 *
 * ---------------------------------------------------------------------------
 * Os ícones
 * ---------------------------------------------------------------------------
 * A logo da empresa é um arquivo só, de tamanho que não controlamos, e o
 * manifest exige `sizes`. Declará-la nos dois tamanhos que o Android procura
 * (192 e 512) é o que faz o ícone ser aceito; o navegador redimensiona. A
 * alternativa — `sizes: "any"` — leva o Chrome a recusar o app como instalável
 * em parte dos casos, e aí não há ícone nenhum porque não há instalação.
 *
 * `maskable` fica de FORA de propósito: o Android recorta o ícone maskable em
 * círculo, e uma logo sem margem de segurança perde as bordas. Sem a marcação
 * ele desenha a logo inteira sobre um fundo — feio é melhor que cortado.
 */
function manifestDaMarca(marca: Marca): Response {
    const icones = marca.logo
        ? [
              { src: marca.logo, sizes: "192x192", type: "image/webp", purpose: "any" },
              { src: marca.logo, sizes: "512x512", type: "image/webp", purpose: "any" },
          ]
        : [
              { src: "/pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
              { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          ];

    const corpo = {
        name: marca.nome,
        short_name: marca.nome.length > 12 ? marca.nome.slice(0, 12).trim() : marca.nome,
        description: `Sistema de gestão de ${marca.nome}.`,
        lang: "pt-BR",
        /* A cor da empresa pinta a barra do sistema no app instalado. Sem cor
           gravada, o escuro de sempre — que combina com o tema padrão. */
        theme_color: marca.cor || "#0e0d1a",
        background_color: marca.cor || "#0e0d1a",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        scope: "/",
        icons: icones,
    };

    return new Response(JSON.stringify(corpo), {
        headers: {
            "content-type": "application/manifest+json; charset=utf-8",
            "cache-control": "public, max-age=300",
        },
    });
}

export default async function middleware(request: Request) {
    try {
        const url = new URL(request.url);
        const host = url.hostname.replace(/^www\./, "");

        /* O manifest é pedido pelo NAVEGADOR, não pelo robô: vem antes de
           qualquer checagem de user-agent. */
        if (url.pathname === "/marca/manifest.webmanifest") {
            const marca = await marcaDoHost(host);

            /* Endereço sem dono pedindo o manifest da marca não deveria
               acontecer — a aplicação só aponta para cá quando há dono. Se
               acontecer, devolve o caminho normal em vez de um 404, que
               desinstalaria o app de quem já o tem. */
            return marca ? manifestDaMarca(marca) : next();
        }

        if (!ehRobo(request.headers.get("user-agent") ?? "")) return next();

        const marca = await marcaDoHost(host);

        /* Endereço sem empresa própria — o nosso, por exemplo. A prévia do Flow
           é a que já vem do `index.html`, e reescrevê-la aqui seria manter duas
           versões da mesma coisa. */
        if (!marca) return next();

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
