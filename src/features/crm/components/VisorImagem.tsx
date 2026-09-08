import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Download, ExternalLink, X } from "lucide-react";

/**
 * A foto em tela cheia — o visor da conversa.
 *
 * Clicar na imagem abria uma ABA NOVA com o `blob:` do arquivo: o navegador
 * saía do sistema, mostrava a foto sozinha numa página cinza e o caminho de
 * volta era o botão de voltar. No meio de um atendimento, isso é perder a
 * conversa de vista para olhar uma foto que o cliente acabou de mandar — e o
 * endereço `blob:` nem sobrevive a um F5 naquela aba.
 *
 * Aqui a foto abre POR CIMA da conversa, como no WhatsApp: fundo escuro, a
 * imagem inteira no maior tamanho que couber, e as duas coisas que se faz com
 * ela — baixar e abrir à parte — numa barra no alto. Fechar é Esc, é o X, e é
 * clicar no fundo; três saídas porque a pressa de voltar para a conversa é o
 * estado normal de quem abriu.
 *
 * Vai num `portal` para o `body`: dentro da bolha, ele herdaria o `overflow`
 * do histórico e ficaria preso rolando dentro da conversa, além de aparecer
 * por baixo do painel do cliente.
 */

type Props = {
  url: string;
  /** Legenda ou nome do arquivo — vira o `alt` e o nome do download. */
  alt?: string;
  onFechar: () => void;
};

const VisorImagem = ({ url, alt, onFechar }: Props) => {
  const reduzir = useReducedMotion();

  /* Esc fecha, e a página atrás não rola enquanto o visor está aberto: rolar o
     histórico por baixo de uma foto em tela cheia faz a conversa aparecer em
     outro lugar quando ela fecha. */
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };

    const antes = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", aoTeclar);

    return () => {
      document.body.style.overflow = antes;
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [onFechar]);

  return createPortal(
    <AnimatePresence>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Foto da conversa"
        initial={reduzir ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        onClick={onFechar}
        className="fixed inset-0 z-[120] flex flex-col bg-black/85 backdrop-blur-sm"
      >
        {/* A barra: o que se faz com a foto. `stopPropagation` porque o clique
            no fundo fecha, e um botão que fecha antes de agir não é botão. */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex shrink-0 items-center justify-end gap-1 px-3 py-2.5"
        >
          <a
            href={url}
            download={`${(alt || "foto").slice(0, 40).replace(/[^\w\s-]/g, "").trim() || "foto"}.jpg`}
            title="Baixar a foto"
            aria-label="Baixar a foto"
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Download size={17} />
          </a>

          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            title="Abrir em outra aba"
            aria-label="Abrir em outra aba"
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ExternalLink size={17} />
          </a>

          <button
            type="button"
            onClick={onFechar}
            title="Fechar (Esc)"
            aria-label="Fechar"
            className="focus-ring flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-4">
          {/* `contain`: aqui a foto é o assunto, e cortar para preencher a tela
              esconderia justamente o que a pessoa abriu para ver de perto. */}
          <motion.img
            src={url}
            alt={alt || "Foto da conversa"}
            onClick={(e) => e.stopPropagation()}
            initial={reduzir ? false : { scale: 0.96 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          />
        </div>

        {/* A legenda embaixo, como no WhatsApp — é ela que diz o que a foto é. */}
        {alt && (
          <p
            onClick={(e) => e.stopPropagation()}
            className="mx-auto mb-4 max-w-2xl shrink-0 px-4 text-center text-[12.5px] leading-relaxed text-white/85"
          >
            {alt}
          </p>
        )}
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
};

export default VisorImagem;
