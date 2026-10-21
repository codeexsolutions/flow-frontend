import { useEffect } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";

/**
 * Tela cheia por cima do app — onde a nota completa (`Invoice`) abre no celular.
 *
 * A nota é o mesmo componente do computador, e lá ela morava num `Modal`
 * `size="full"`. No celular era essa moldura que falhava: presa dentro da tela,
 * ela não cobria o visor, e o X nascia embaixo do relógio do iPhone, onde o
 * toque não chega. Aqui a moldura é do app: vai para o `body` por portal, o
 * cabeçalho desconta a área segura e o voltar fica onde o polegar alcança.
 */
const TelaCheia = ({ aberta, aoFechar, titulo, subtitulo, children }: { aberta: boolean; aoFechar: () => void; titulo: string; subtitulo?: string; children: ReactNode }) => {
  useEffect(() => {
    if (!aberta) return;

    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", aoTeclar);

    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberta, aoFechar]);

  if (!aberta) return null;

  return createPortal(
    <div className="fixed inset-0 z-[250] flex flex-col bg-canvas text-ink" role="dialog" aria-modal="true" aria-label={titulo} style={{ animation: "m-entra .24s cubic-bezier(.22,.61,.36,1) both" }}>
      <header className="shrink-0 border-b border-fg/[0.06] bg-surface pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center gap-1 px-2">
          <button type="button" aria-label="Fechar" onClick={aoFechar} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink active:bg-fg/[0.08]">
            <ArrowLeft size={22} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-semibold leading-tight">{titulo}</p>
            {subtitulo && <p className="truncate text-[12px] text-mist">{subtitulo}</p>}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">{children}</div>
    </div>,
    document.body,
  );
};

export default TelaCheia;
