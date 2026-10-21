import { useEffect } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Loader2, Package, Search, X } from "lucide-react";

import type ProductType from "@/shared/domain/produto";
import { useNavigate } from "react-router-dom";

/**
 * Peças do app do celular.
 *
 * O celular deixou de ser a tela do computador encolhida: ele tem moldura,
 * telas e folhas próprias, com bem menos informação. O que é compartilhado com
 * o computador é o que está por baixo — stores, serviços e a fila de envio —,
 * então uma venda feita aqui é a mesma venda que o computador mostra.
 */

/**
 * Uma tela do app: cabeçalho, corpo que rola e, se precisar, um rodapé fixo.
 *
 * O corpo é o ÚNICO elemento que rola, e o rodapé e a barra de navegação são
 * irmãos dele dentro de uma coluna flex — não flutuam por cima. É isso que
 * garante que a última linha de cada tela aparece inteira: não existe nada
 * cobrindo o fim da rolagem para alguém esquecer de descontar.
 */
export const Tela = ({
  titulo,
  subtitulo,
  voltar,
  acao,
  rodape,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  /** Mostra a seta de voltar; `true` volta no histórico, string navega para a rota. */
  voltar?: boolean | string;
  acao?: ReactNode;
  rodape?: ReactNode;
  children: ReactNode;
}) => {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-fg/[0.06] bg-canvas/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="flex h-14 items-center gap-2 px-4">
          {voltar && (
            <button
              type="button"
              aria-label="Voltar"
              onClick={() => (typeof voltar === "string" ? navigate(voltar) : navigate(-1))}
              className="-ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-mist active:bg-fg/[0.08]"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[17px] font-semibold leading-tight text-ink">{titulo}</h1>
            {subtitulo && <p className="truncate text-[12px] text-mist">{subtitulo}</p>}
          </div>
          {acao}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="px-4 pb-6 pt-4">{children}</div>
      </div>

      {rodape && <div className="shrink-0 border-t border-fg/[0.06] bg-surface px-4 py-3">{rodape}</div>}
    </div>
  );
};

/**
 * Folha que sobe de baixo — o único "modal" do app do celular.
 *
 * Três saídas, sempre: o X no cabeçalho (alvo de 44px, longe do notch), tocar
 * fora e o Esc do teclado. A folha vai para o `body` por portal: dentro da
 * tela ela herdaria qualquer `transform` ou `backdrop-filter` de um ancestral
 * e deixaria de cobrir o visor — era assim que o modal antigo ficava preso
 * atrás da barra e não fechava.
 */
export const Folha = ({
  aberta,
  aoFechar,
  titulo,
  subtitulo,
  rodape,
  children,
}: {
  aberta: boolean;
  aoFechar: () => void;
  titulo: string;
  subtitulo?: string;
  rodape?: ReactNode;
  children: ReactNode;
}) => {
  useEffect(() => {
    if (!aberta) return;

    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", aoTeclar);

    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberta, aoFechar]);

  if (!aberta) return null;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={titulo}>
      <button type="button" aria-label="Fechar" tabIndex={-1} onClick={aoFechar} className="absolute inset-0 cursor-default bg-black/55" style={{ animation: "m-fade .2s ease both" }} />

      <div
        className="relative flex max-h-[calc(100%-env(safe-area-inset-top)-16px)] flex-col rounded-t-[28px] bg-surface text-ink shadow-[0_-12px_40px_-12px_rgb(0_0_0/0.45)]"
        style={{ animation: "cf-sheet .26s cubic-bezier(.22,.61,.36,1) both" }}
      >
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-fg/15" />

        <div className="flex shrink-0 items-start gap-3 px-5 pb-3 pt-2">
          <div className="min-w-0 flex-1 pt-1.5">
            <p className="truncate text-[16px] font-semibold">{titulo}</p>
            {subtitulo && <p className="mt-0.5 truncate text-[12px] text-mist">{subtitulo}</p>}
          </div>
          <button type="button" aria-label="Fechar" onClick={aoFechar} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-fg/[0.07] text-mist active:bg-fg/[0.14]">
            <X size={18} />
          </button>
        </div>

        <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 ${rodape ? "pb-4" : "pb-[max(1.5rem,env(safe-area-inset-bottom))]"}`}>{children}</div>

        {rodape && <div className="shrink-0 border-t border-fg/[0.06] px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">{rodape}</div>}
      </div>
    </div>,
    document.body,
  );
};

export const CampoBusca = ({ valor, aoMudar, placeholder }: { valor: string; aoMudar: (v: string) => void; placeholder: string }) => (
  <label className="flex h-12 items-center gap-2.5 rounded-2xl bg-fg/[0.06] px-4 text-mist focus-within:ring-2 focus-within:ring-accent/40">
    <Search size={18} className="shrink-0" />
    <input
      type="search"
      inputMode="search"
      value={valor}
      onChange={(e) => aoMudar(e.target.value)}
      placeholder={placeholder}
      className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-faint"
    />
    {valor && (
      <button type="button" aria-label="Limpar busca" onClick={() => aoMudar("")} className="-mr-2 grid h-9 w-9 place-items-center rounded-full active:bg-fg/[0.08]">
        <X size={16} />
      </button>
    )}
  </label>
);

/** Filtros em pílula — rolam de lado quando não cabem. */
export const Pilulas = <T extends string>({ opcoes, valor, aoMudar }: { opcoes: { id: T; label: string }[]; valor: T; aoMudar: (v: T) => void }) => (
  <div className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none]">
    {opcoes.map((o) => (
      <button
        key={o.id}
        type="button"
        onClick={() => aoMudar(o.id)}
        className={`h-9 shrink-0 rounded-full px-4 text-[13px] transition-colors ${valor === o.id ? "bg-ink text-canvas" : "bg-fg/[0.06] text-mist"}`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

export const Botao = ({
  children,
  onClick,
  disabled,
  variante = "primario",
  tipo = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variante?: "primario" | "secundario" | "perigo";
  tipo?: "button" | "submit";
  className?: string;
}) => {
  const cor = {
    primario: "bg-accent text-white",
    secundario: "bg-fg/[0.07] text-ink",
    perigo: "bg-danger/[0.12] text-danger",
  }[variante];

  return (
    <button
      type={tipo}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-12 items-center justify-center gap-2 rounded-2xl px-5 text-[15px] font-medium transition-transform active:scale-[0.98] disabled:opacity-50 ${cor} ${className}`}
    >
      {children}
    </button>
  );
};

export const Vazio = ({ icone, titulo, texto, children }: { icone: ReactNode; titulo: string; texto?: string; children?: ReactNode }) => (
  <div className="flex flex-col items-center px-6 py-14 text-center">
    <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-fg/[0.06] text-faint">{icone}</div>
    <p className="text-[15px] text-ink">{titulo}</p>
    {texto && <p className="mt-1 text-[13px] text-mist">{texto}</p>}
    {children && <div className="mt-4">{children}</div>}
  </div>
);

export const Carregando = () => (
  <div className="flex justify-center py-14 text-faint">
    <Loader2 size={22} className="animate-spin" />
  </div>
);

/** Linha de lista tocável — o bloco básico de todas as listas do app. */
export const Linha = ({ onClick, children }: { onClick?: () => void; children: ReactNode }) => (
  <button type="button" onClick={onClick} className="flex min-h-[64px] w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left active:bg-fg/[0.06]">
    {children}
  </button>
);

export const Avatar = ({ nome }: { nome: string }) => {
  const letras =
    nome
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/[0.14] text-[13px] font-medium text-accent-soft">{letras}</span>;
};

/** Par rótulo/valor das fichas. */
export const Dado = ({ rotulo, children }: { rotulo: string; children: ReactNode }) => (
  <div className="flex items-start justify-between gap-4 border-b border-fg/[0.06] py-3 last:border-0">
    <span className="shrink-0 text-[13px] text-mist">{rotulo}</span>
    <span className="min-w-0 text-right text-[14px] text-ink">{children}</span>
  </div>
);

export const Campo = ({ rotulo, children }: { rotulo: string; children: ReactNode }) => (
  <label className="block">
    <span className="mb-1.5 block text-[13px] text-mist">{rotulo}</span>
    {children}
  </label>
);

export const CLASSE_INPUT = "h-12 w-full rounded-2xl bg-fg/[0.06] px-4 text-ink outline-none placeholder:text-faint focus:ring-2 focus:ring-accent/40";

/** Foto do produto, ou a caixinha quando ele não tem. */
export const Miniatura = ({ produto }: { produto: ProductType }) =>
  produto.imagem ? (
    <img src={produto.imagem} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-xl bg-fg/[0.06] object-cover" />
  ) : (
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-fg/[0.06] text-faint">
      <Package size={18} />
    </span>
  );
