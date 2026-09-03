import { useState } from "react";
import { Check, Download, Share, SquarePlus } from "lucide-react";

import { Modal } from "@/shared/ui/Modal";
import useMarcaDominio from "@/shared/marca/marcaDominio";
import { useInstalacaoPwa } from "@/shared/pwa/instalacao";

/**
 * "Instalar o aplicativo" — o mesmo botão no menu lateral e na tela de login.
 *
 * Três estados, porque instalar PWA não é igual em todo lugar:
 *
 * - **Chrome/Edge/Android**: o navegador ofereceu o convite; um clique instala.
 * - **iPhone**: não existe convite. O botão abre as instruções, porque esconder
 *   a opção faria o usuário de iPhone concluir que não dá para instalar.
 * - **Já instalado**: some. Oferecer instalar o que já está instalado é ruído.
 */

type Props = {
  /** `menu` = linha do menu lateral. `solto` = botão da tela de login. */
  variante?: "menu" | "solto";
  className?: string;
};

const BotaoInstalar = ({ variante = "solto", className = "" }: Props) => {
  const { podeInstalar, instalado, ehIos, instalar } = useInstalacaoPwa();
  const [ajudaIos, setAjudaIos] = useState(false);

  // Nada a oferecer: ou já está instalado, ou o navegador não instala PWA
  // (Firefox no desktop, por exemplo) e um botão morto seria pior que nada.
  if (instalado || (!podeInstalar && !ehIos)) return null;

  const aoClicar = async () => {
    if (ehIos && !podeInstalar) {
      setAjudaIos(true);
      return;
    }

    await instalar();
  };

  const rotulo = "Instalar aplicativo";

  /* Empresa com domínio próprio instala o app COM O NOME DELA — é o que o
     manifest servido por host devolve (ver `manifestDaMarca`). O texto da
     ajuda acompanha, senão a instrução descreve outro app. */
  const nomeDoApp = useMarcaDominio((s) => s.marca)?.nome || "CodeEx Flow";

  return (
    <>
      {variante === "menu" ? (
        <button
          type="button"
          onClick={aoClicar}
          className={`group focus-ring relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-[13.5px] text-mist transition-colors duration-200 hover:bg-fg/[0.05] hover:text-ink ${className}`}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-fg/[0.04] text-faint transition-colors group-hover:bg-fg/[0.08] group-hover:text-accent-soft">
            <Download size={17} />
          </span>
          <span className="flex-1">{rotulo}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={aoClicar}
          className={`focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-fg/[0.1] bg-fg/[0.03] px-4 py-2.5 text-[13px] text-mist transition-colors hover:border-accent/40 hover:bg-fg/[0.06] hover:text-ink ${className}`}
        >
          <Download size={15} />
          {rotulo}
        </button>
      )}

      {/* ---------- iPhone: o passo a passo, porque não há botão ---------- */}
      <Modal open={ajudaIos} onClose={() => setAjudaIos(false)} title="Instalar no iPhone" subtitle="São três toques, pelo Safari" size="sm">
        <ol className="flex flex-col gap-3">
          {[
            { icone: <Share size={15} />, texto: "Toque em Compartilhar, na barra de baixo do Safari." },
            { icone: <SquarePlus size={15} />, texto: "Role a lista e toque em “Adicionar à Tela de Início”." },
            /* No domínio da empresa, o app que aparece na tela de início é o
               DELA — e é o nome dela que o iPhone vai mostrar embaixo do
               ícone. Prometer "CodeEx Flow" faria a instrução não bater com o
               que a pessoa vê no fim dos três toques. */
            { icone: <Check size={15} />, texto: `Confirme em “Adicionar”. O ${nomeDoApp} aparece como um app.` },
          ].map((passo, i) => (
            <li key={i} className="flex items-center gap-3 rounded-xl border border-fg/[0.06] bg-fg/[0.02] px-3.5 py-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/[0.14] text-accent-soft">{passo.icone}</span>
              <span className="text-[12.5px] leading-relaxed text-mist">{passo.texto}</span>
            </li>
          ))}
        </ol>

        <p className="mt-4 text-[11.5px] leading-relaxed text-faint">
          Precisa ser pelo Safari: no iPhone, só ele instala aplicativos web. Pelo Chrome a opção não aparece.
        </p>
      </Modal>
    </>
  );
};

export default BotaoInstalar;
