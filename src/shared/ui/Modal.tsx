import { memo, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  accent?: string;
  size?: ModalSize;
  maxWidth?: string;
  children: ReactNode;
};

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
  full: "sm:max-w-[1200px]",
};

const HEIGHT_CLASS: Record<ModalSize, string> = {
  sm: "max-h-[85dvh]",
  md: "max-h-[85dvh]",
  lg: "max-h-[90dvh]",
  xl: "max-h-[92dvh]",
  full: "h-dvh sm:h-[92dvh]",
};

const Modal = memo(({ open, onClose, title, subtitle, accent = "rgb(var(--accent))", size = "md", maxWidth, children }: ModalProps) => {
  const [show, setShow] = useState(false);

  /** O gesto que fecha começou no fundo? Ver o comentário no `onPointerDown`. */
  const gestoComecouNoFundo = useRef(false);

  useEffect(() => {
    if (!open) return;
    const r = requestAnimationFrame(() => setShow(true));
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(r);
      setShow(false);
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const isFull = size === "full";

  return (
    <div
      /*
       * Fechar exige que o gesto INTEIRO tenha acontecido no fundo.
       *
       * Com `onClick={onClose}` puro, o modal fechava sozinho numa situação
       * corriqueira: a pessoa clica dentro de um campo, arrasta para
       * selecionar o texto e solta o botão fora do painel. O `click` do
       * navegador é disparado no ancestral comum dos dois pontos — o fundo —
       * e o formulário inteiro sumia com o que estava digitado. Selecionar
       * texto num input é o gesto mais banal que existe num cadastro, e ele
       * não pode custar o cadastro.
       *
       * Guardar onde o gesto COMEÇOU resolve: só fecha quem apertou e soltou
       * no fundo. Arrastar de dentro para fora não fecha mais nada.
       */
      onPointerDown={(e) => {
        gestoComecouNoFundo.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        if (!gestoComecouNoFundo.current) return;

        gestoComecouNoFundo.current = false;
        onClose();
      }}
      className={`aa-scrim fixed inset-0 z-[200] flex justify-center transition-opacity duration-200
 ${isFull ? "items-stretch p-0 sm:items-center sm:p-6" : "items-end p-0 sm:items-center sm:p-4"}
 ${show ? "opacity-100" : "opacity-0"}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`aa-surface elev-3 flex w-full flex-col overflow-hidden
 transition-all duration-200
 ${isFull ? "rounded-none sm:rounded-lg" : "rounded-t-2xl sm:rounded-lg"}
 ${maxWidth ?? SIZE_CLASS[size]}
 ${HEIGHT_CLASS[size]}
 ${show ? "translate-y-0 scale-100" : "translate-y-6 sm:translate-y-0 sm:scale-95"}`}
      >
        <div className="h-[3px] flex-shrink-0" style={{ background: accent }} />

        <div className="flex flex-shrink-0 items-center justify-between border-b border-fg/[0.08] px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <p className="truncate text-sm text-ink">{title}</p>
            {subtitle && <p className="mt-0.5 truncate text-xs text-mist">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Fechar" className="focus-ring grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-fg/[0.06] text-mist transition-colors hover:bg-fg/[0.12] hover:text-ink">
            <X size={15} />
          </button>
        </div>

        {/* flex-1 + overflow: o conteúdo rola e o painel respeita a altura da tela */}
        {/* O respiro do corpo vive aqui: nenhum formulário do sistema traz
            padding próprio, e sem ele o conteúdo encostava na borda.
            Exceção é o size="full", usado pela nota — essa desenha as
            próprias margens e dobraria a moldura. */}
        {/* `min-h-0`: sem ele o corpo se recusa a encolher abaixo do conteúdo
            (é o `min-height: auto` de todo item flex) e empurra o painel para
            além da tela — o que sobra some no `overflow-hidden` do painel. Com
            ele, conteúdo grande rola em vez de ser cortado. */}
        {/*
         * No celular a folha termina ACIMA da barra de abas.
         *
         * A barra é fixa no rodapé e ficava por cima do fim da folha: o botão
         * de salvar — a única coisa que a pessoa veio fazer aqui — nascia
         * encostado nela, e num aparelho com faixa de gestos ficava embaixo
         * dela. O valor vem de `--dock-space`, o mesmo token que posiciona a
         * dock e que o corpo das telas reserva: um número digitado aqui
         * envelheceria na primeira vez que a barra mudasse de altura.
         */}
        <div className={`min-h-0 flex-1 overflow-y-auto ${isFull ? "" : "p-4 pb-[var(--dock-space)] sm:p-5"}`}>{children}</div>
      </div>
    </div>
  );
});

export { Modal };
export type { ModalSize };
