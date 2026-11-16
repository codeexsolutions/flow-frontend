import { execSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";


function identidadeDoBuild(): string {
  const data = new Date().toISOString().slice(0, 16).replace("T", " ");

  const commit = (() => {
    if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);

    try {
      return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
      return "";
    }
  })();

  return commit ? `${data} · ${commit}` : data;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  console.log(`Ambiente: ${env.ENVIRONMENT_CONSOLE}`);
  console.log(`Produção: ${env.PRODUCTION}`);

  return {
    /* Substituído em tempo de build — vira uma string literal no bundle. */
    define: {
      __BUILD_ID__: JSON.stringify(identidadeDoBuild()),
    },

    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },

    plugins: [
      react(),

      VitePWA({
        // "autoUpdate": a versão nova entra sozinha, sem depender de clique.
        //
        // Era "prompt", e o aviso podia ser dispensado no X — o worker ficava
        // parado em `waiting` e o aviso não voltava para aquela versão, então um
        // clique acidental prendia o cliente na versão antiga para sempre. O
        // preço conhecido desta troca é a versão poder mudar durante o uso;
        // ver a proteção do PDV em `PwaPrompts`.
        registerType: "autoUpdate",
        injectRegister: "auto",

        includeAssets: ["apple-touch-icon.png", "favicon-32.png", "offline.html"],

        manifest: {
          name: "CodeEx Flow",
          short_name: "CodeEx Flow",
          description: "Sistema de gestão para o seu negócio: PDV, estoque, clientes e financeiro.",
          lang: "pt-BR",
          theme_color: "#0e0d1a",
          background_color: "#0e0d1a",
          display: "standalone",
          // Sem travar em "portrait": em tablet e desktop instalado o app
          // precisa acompanhar a rotação da tela.
          orientation: "any",
          start_url: "/",
          scope: "/",
          categories: ["business", "productivity", "finance"],

          icons: [
            { src: "/pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            // Maskable é um arquivo PRÓPRIO, com margem de segurança: o Android
            // recorta o ícone e, sem a margem, comia a logo.
            { src: "/pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],

          shortcuts: [
            { name: "Ponto de Venda", short_name: "PDV", url: "/pdv" },
            { name: "Vendas", short_name: "Vendas", url: "/vendas" },
          ],
        },

        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],

          /*
           * O teto do que entra no precache.
           *
           * O padrão do workbox é 2 MiB, e o bundle do app passou disso. O
           * sintoma não é um aviso: é o `vite build` FALHANDO, com uma
           * mensagem sobre "assets exceeding the limit" que parece problema de
           * configuração de cache e não de tamanho de bundle.
           *
           * Deixar o arquivo de fora do precache seria pior do que parece: ele
           * É o app. Sem ele no cache, abrir offline serve o `index.html` e
           * trava numa tela em branco esperando um script que não vem — que é
           * exatamente o que o PWA existe para evitar.
           *
           * 5 MiB dá folga para o app crescer sem que o build volte a morrer
           * por um kilobyte. Continua sendo um teto: se um dia algum asset
           * único passar disso, o erro volta — e aí é para ser investigado
           * mesmo, porque nada num app deste tamanho deveria ter 5 MB.
           */
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,

          cleanupOutdatedCaches: true,
          clientsClaim: true,
          // Ligado junto com o `autoUpdate`: sem ele o worker novo instala mas
          // fica esperando todas as abas fecharem, e num PWA que passa o dia
          // aberto isso é o mesmo que não atualizar.
          skipWaiting: true,

          // Sem isto, abrir o app offline dava tela de erro do navegador.
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api/, /^\/v1/, /^\/socket\.io/],

          runtimeCaching: [
            {
              // Fontes do Google: imutáveis, cache longo.
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "fontes-google",
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Imagens (logos de empresa, QR): serve do cache e atualiza atrás.
              urlPattern: ({ request }) => request.destination === "image",
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "imagens",
                expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            {
              // Leituras da API: rede primeiro, cache como rede de segurança.
              // Dá ao app uma última versão dos dados quando a conexão cai.
              //
              // Sessão e status da empresa ficam FORA: a API responde 200 para
              // empresa inativa, e um 200 é cacheável. O efeito era cruel —
              // empresa que pagava e era reativada continuava vendo a tela de
              // bloqueio por até 24h, servida do cache, sem jeito de forçar.
              // Estado de autorização não pode vir de cache.
              //
              // A lista vai inline de propósito: o Workbox serializa esta
              // função para dentro do sw.js, e uma constante de fora do escopo
              // não existiria lá — viraria erro em tempo de execução.
              urlPattern: ({ url, request }) =>
                request.method === "GET" &&
                url.pathname.startsWith("/v1") &&
                !["/v1/auth", "/v1/usuarios/me", "/v1/assinatura"].some((rota) =>
                  url.pathname.startsWith(rota),
                ),
              handler: "NetworkFirst",
              options: {
                cacheName: "api-leitura",
                // Sem `networkTimeoutSeconds` de propósito. Com 5s, qualquer
                // leitura mais lenta que isso (lista grande, 4G ruim) voltava
                // DO CACHE — a nota recém-salva aparecia com os dados antigos
                // e só um F5 mostrava a certa. Sem rede de verdade o fetch
                // falha na hora e o cache entra igual; com rede lenta, espera
                // a resposta certa (a lista já abre com a cópia local).
                expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },

        devOptions: {
          enabled: true,
          type: "module",
        },
      }),
    ],

    /*
     * `host: true` — escuta em todas as interfaces, inclusive o IP da VPN
     * (`26.242.6.51:2000`), e não só no loopback.
     *
     * Antes isto lia `env.APPLICATION_ENVIRONMENT`, uma variável que NÃO existe
     * no `.env` (lá o nome é `ENVIRONMENT_CONSOLE`). O valor chegava
     * `undefined`, o Vite caía no padrão `localhost`, e o servidor recusava
     * conexão de qualquer outra máquina — sem erro nenhum no terminal, porque
     * do ponto de vista dele estava tudo certo.
     *
     * `APPLICATION_HOST` continua podendo restringir, para quem precisar.
     */
    server: {
      host: env.APPLICATION_HOST || true,
      port: Number(env.APPLICATION_PORT),
    },

    preview: {
      host: env.APPLICATION_HOST || true,
      port: Number(env.APPLICATION_PORT),
    },
  };
});
