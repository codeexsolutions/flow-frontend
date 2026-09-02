const PRODUCAO = "https://codex-flow-api-production.up.railway.app/v1";
const LOCAL = "http://26.242.6.51:3000/v1";

const doAmbiente = import.meta.env.PROD ? import.meta.env.VITE_API_PRODUCTION : import.meta.env.VITE_API_LOCAL;

const normalizar = (url: string) => url.trim().replace(/\/+$/, "");

export const API_URL = normalizar(String(doAmbiente || (import.meta.env.PROD ? PRODUCAO : LOCAL)));
export const API_ORIGEM = API_URL.replace(/\/v1$/, "");
