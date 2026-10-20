import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";

type Props = {
  valor: string;
  opcoes: string[];
  /** Vai para `data-celula`, que é como a célula sabe se está em edição. */
  colunaId: string;
  onEscolher: (valor: string) => void;
};

/**
 * A célula de cliente: digita ou escolhe.
 *
 * Fica separada do `SeletorCliente` (o do modal de links) de propósito. Aquele
 * é um campo de formulário, com borda, rótulo e espaço próprio. Este vive
 * DENTRO de uma célula de planilha: sem borda, altura exata da linha, e a lista
 * precisa flutuar por cima das linhas de baixo sem empurrar nada. Unificar os
 * dois daria um componente com um punhado de `if` de aparência — e mudar o
 * modal quebraria a planilha.
 *
 * A gravação acontece ao SAIR do campo, como nas outras células: salvar por
 * tecla geraria uma requisição por letra.
 */
const ComboCliente = ({ valor, opcoes, colunaId, onEscolher }: Props) => {
  const [rascunho, setRascunho] = useState(valor);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);

  const caixa = useRef<HTMLDivElement>(null);

  /* Valor mudou por fora (outra pessoa editando, recarga): acompanha, desde que
     esta célula não esteja sendo digitada agora. */
  useEffect(() => {
    if (!aberto) setRascunho(valor);
  }, [valor, aberto]);

  const filtradas = useMemo(() => {
    const busca = rascunho.trim().toLowerCase();

    if (!busca) return opcoes;

    return opcoes.filter((o) => o.toLowerCase().includes(busca));
  }, [rascunho, opcoes]);

  useEffect(() => {
    setAtivo(0);
  }, [rascunho]);

  useEffect(() => {
    if (!aberto) return;

    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) {
        setAberto(false);
        onEscolher(rascunho.trim());
      }
    };

    document.addEventListener("mousedown", fora);

    return () => document.removeEventListener("mousedown", fora);
  }, [aberto, rascunho, onEscolher]);

  const escolher = (nome: string) => {
    setRascunho(nome);
    setAberto(false);
    onEscolher(nome);
  };

  return (
    <div ref={caixa} className="relative h-full">
      <input
        data-celula={colunaId}
        value={rascunho}
        onChange={(e) => {
          setRascunho(e.target.value);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        onBlur={(e) => {
          /* Clique num item da lista tira o foco do input antes do `onClick`
             dele rodar. Sem esta checagem, o blur fecharia a lista e o clique
             cairia no vazio. */
          if (caixa.current?.contains(e.relatedTarget as Node)) return;

          setAberto(false);
          onEscolher(rascunho.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();

            if (!aberto) return setAberto(true);

            setAtivo((i) => {
              const total = filtradas.length;

              if (!total) return 0;

              return e.key === "ArrowDown" ? (i + 1) % total : (i - 1 + total) % total;
            });

            return;
          }

          if (e.key === "Enter") {
            e.preventDefault();

            /* Com item sob o cursor, Enter escolhe. Sem, grava o que foi
               digitado — cliente novo precisa poder entrar à mão. */
            escolher(aberto && filtradas[ativo] ? filtradas[ativo] : rascunho.trim());
            (e.target as HTMLInputElement).blur();

            return;
          }

          if (e.key === "Escape") {
            e.preventDefault();
            setRascunho(valor);
            setAberto(false);
          }
        }}
        placeholder=""
        className="h-full w-full bg-transparent px-4 py-[18px] text-[14px] text-ink outline-none placeholder:text-faint"
      />

      <AnimatePresence>
        {aberto && filtradas.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.13, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-0 right-0 top-full z-50 max-h-48 min-w-[11rem] overflow-y-auto rounded-lg border border-fg/[0.1] bg-surface py-1 shadow-xl"
          >
            {filtradas.slice(0, 50).map((nome, i) => (
              <button
                key={nome}
                type="button"
                /* `onMouseDown` em vez de `onClick`: o blur do input dispara
                   antes do click e fecharia a lista primeiro. */
                onMouseDown={(e) => {
                  e.preventDefault();
                  escolher(nome);
                }}
                onMouseEnter={() => setAtivo(i)}
                className={`flex w-full items-center gap-2 px-2.5 py-2 text-left text-[13px] transition-colors ${
                  i === ativo ? "bg-fg/[0.06] text-ink" : "text-mist"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{nome}</span>
                {valor === nome && <Check size={12} className="shrink-0 text-accent" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ComboCliente;
