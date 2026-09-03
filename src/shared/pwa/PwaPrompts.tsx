import { useEffect, useState } from "react";
import { Download, WifiOff, X } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";

import { useInstalacaoPwa } from "@/shared/pwa/instalacao";
import useMarcaDominio from "@/shared/marca/marcaDominio";

/**
 * Avisos do app instalável, todos discretos e no rodapé.
 *
 * Duas faixas e uma tarefa invisível:
 *
 * 1. **Convite de instalação** — ninguém descobria que dava para instalar.
 * 2. **Aviso de offline** — sem rede o app continua abrindo (o service worker
 *    serve do cache), mas a pessoa precisa saber que os dados podem estar
 *    desatualizados.
 * 3. **Procura por versão nova** (sem interface) — o motivo de o componente
 *    montar o `useRegisterSW`.
 */

const DISPENSOU_INSTALACAO = "codex-flow-instalacao-dispensada";

const Faixa = ({ icon, texto, acao, onFechar, tom = "accent" }: { icon: React.ReactNode; texto: React.ReactNode; acao?: React.ReactNode; onFechar?: () => void; tom?: "accent" | "warning" }) => (
  <div
    className={`glass-strong elev-3 pointer-events-auto flex items-center gap-3 rounded-2xl border px-4 py-3 ${
      tom === "warning" ? "border-warning/30" : "border-accent/30"
    }`}
  >
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tom === "warning" ? "bg-warning/15 text-warning" : "bg-accent/15 text-accent-soft"}`}>{icon}</span>

    <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-ink">{texto}</p>

    {acao}

    {onFechar && (
      <button type="button" onClick={onFechar} aria-label="Dispensar" className="focus-ring shrink-0 rounded-lg p-1 text-faint transition hover:text-ink">
        <X size={15} />
      </button>
    )}
  </div>
);

const PwaPrompts = () => {
  /*
   * Quem aplica a versão nova é o próprio vite-plugin-pwa.
   *
   * Com `registerType: "autoUpdate"` (ver `vite.config.ts`), o worker novo
   * instala com `skipWaiting`, assume o controle e o plugin recarrega a página
   * no evento `activated`. `needRefresh` NUNCA dispara nesse modo, e
   * `updateServiceWorker()` não faz nada — por isso não há botão "Atualizar"
   * aqui: ele daria a impressão de controlar algo que já acontece sozinho.
   *
   * O que sobra por nossa conta é PROCURAR a versão nova, abaixo: o navegador
   * só procura sozinho quando a página é aberta de novo, e um app instalado
   * pode passar dias sem isso.
   */
  useRegisterSW({
    /*
     * O navegador só procura versão nova quando a página é aberta de novo — e
     * um PWA instalado pode ficar dias sem ser fechado. Sem esta checagem, um
     * deploy seu só chegaria ao cliente quando ele lembrasse de matar o app.
     *
     * Aqui a busca acontece de hora em hora e sempre que a pessoa volta para o
     * app. `cache: "no-store"` porque o próprio sw.js pode estar em cache HTTP,
     * e aí a checagem olharia para a versão antiga.
     */
    onRegisteredSW(url, registro) {
      if (!registro) return;

      const procurar = async () => {
        if (registro.installing || !navigator.onLine) return;

        try {
          const resposta = await fetch(url, { cache: "no-store", headers: { "cache-control": "no-cache" } });
          if (resposta?.status === 200) await registro.update();
        } catch {
          /* Offline ou servidor fora: tenta de novo no próximo ciclo. */
        }
      };

      /*
       * Quatro gatilhos, porque nenhum deles sozinho cobre um app instalado.
       *
       * - `setInterval`: o caso do balcão, com o app aberto o dia inteiro. O
       *   navegador estrangula timers em aba escondida, então ele não basta.
       * - `visibilitychange`: quem volta para o app depois de usar outro.
       * - `pageshow` com `persisted`: no celular a aba volta do bfcache sem
       *   disparar `visibilitychange` — sem isto, quem sai e volta pelo
       *   alternador de apps nunca dispara checagem nenhuma.
       * - `online`: o app que passou horas sem rede procura assim que ela
       *   volta, em vez de esperar a próxima hora cheia.
       */
      const DE_HORA_EM_HORA = 60 * 60 * 1000;

      setInterval(procurar, DE_HORA_EM_HORA);

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void procurar();
      });

      window.addEventListener("pageshow", (evento) => {
        if ((evento as PageTransitionEvent).persisted) void procurar();
      });

      window.addEventListener("online", () => void procurar());
    },
  });

  /* O convite de instalação é capturado num módulo só (`pwa/instalacao`): o
     evento do navegador serve uma vez, e dois donos brigariam por ele. */
  const { podeInstalar, instalar } = useInstalacaoPwa();

  /* Ver a nota em `BotaoInstalar`: no domínio do cliente o app é o dele. */
  const nomeDoApp = useMarcaDominio((s) => s.marca)?.nome || "CodeEx Flow";

  const [dispensou, setDispensou] = useState(() => Boolean(localStorage.getItem(DISPENSOU_INSTALACAO)));
  const [offline, setOffline] = useState(() => !navigator.onLine);

  const instalavel = podeInstalar && !dispensou;

  /* ---------------- Estado da conexão ---------------- */
  useEffect(() => {
    const online = () => setOffline(false);
    const caiu = () => setOffline(true);

    window.addEventListener("online", online);
    window.addEventListener("offline", caiu);

    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", caiu);
    };
  }, []);

  const dispensarInstalacao = () => {
    localStorage.setItem(DISPENSOU_INSTALACAO, "1");
    setDispensou(true);
  };

  if (!instalavel && !offline) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[300] flex flex-col gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:left-auto sm:right-4 sm:w-[380px]">
      {offline && <Faixa tom="warning" icon={<WifiOff size={16} />} texto="Você está sem conexão. O app continua funcionando, mas os dados podem estar desatualizados." />}

      {instalavel && (
        <Faixa
          icon={<Download size={16} />}
          texto={`Instale o ${nomeDoApp} e abra direto da tela de início.`}
          onFechar={dispensarInstalacao}
          acao={
            <button type="button" onClick={() => void instalar()} className="focus-ring shrink-0 rounded-xl bg-accent px-3 py-1.5 text-[12px] text-white transition hover:brightness-110">
              Instalar
            </button>
          }
        />
      )}
    </div>
  );
};

export default PwaPrompts;
