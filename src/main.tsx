import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
/*
 * As fontes vêm do pacote, não do Google Fonts.
 *
 * Com `@import` de CDN, quem abre o app sem rede — ou antes da fonte chegar —
 * caía na `system-ui`, que é San Francisco no iPhone e Roboto no Android: a
 * mesma tela com duas larguras de texto, duas alturas de linha e quebras
 * diferentes. Empacotadas, o desenho é byte a byte o mesmo nos dois, e continua
 * o mesmo offline, que é requisito de PWA instalado.
 */
import "@fontsource-variable/inter";
import "@fontsource-variable/sora";

import "./index.css";

import AppRoutes from "@/app/routes/AppRoutes";
import { AlertProvider } from "@/shared/ui/Alert";
import PwaPrompts from "@/shared/pwa/PwaPrompts";
import CamadaTransicao from "@/shared/session/CamadaTransicao";
import { aplicarModoApp, observarModoApp } from "@/shared/pwa/appMode";
import useMarcaDominio, { vestirAba } from "@/shared/marca/marcaDominio";

// Antes de pintar: define se o zoom fica livre (navegador) ou travado (app).
aplicarModoApp();
observarModoApp();

/*
 * Quem mora neste endereço.
 *
 * Disparado AQUI, e não dentro de um componente: a pergunta é sobre a URL, não
 * sobre uma tela, e num `useEffect` ela só sairia depois do primeiro render —
 * tempo suficiente para a aba piscar o nosso nome antes de virar o da empresa.
 * A resposta veste a aba assim que chega e fica no store para as telas usarem.
 */
void useMarcaDominio.getState().carregar().then(() => vestirAba(useMarcaDominio.getState().marca));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AlertProvider>
      <AppRoutes />
      {/* Entrada e saída da sessão — acima do roteador, para sobreviver à troca de rota. */}
      <CamadaTransicao />
      {/* Nova versão, convite de instalação e aviso de offline. */}
      <PwaPrompts />
    </AlertProvider>
  </StrictMode>,
);
