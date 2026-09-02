import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Search } from "lucide-react";

type Props = {
  valor: string;
  onChange: (valor: string) => void;
  /** Nomes sugeridos, já na ordem desejada. */
  opcoes: string[];
  /** Quais desses nomes já aparecem na planilha — ganham selo. */
  naPlanilha: Set<string>;
  onConfirmar?: () => void;
  placeholder?: string;
};

/**
 * Campo de cliente com lista suspensa.
 *
 * Substituiu um `<datalist>`. Ele resolvia o caso em uma linha e cobrava caro
 * em cima disso: cada navegador desenha do seu jeito (e o Safari mal desenha),
 * não dá para marcar quais nomes JÁ estão na planilha — que é a informação que
 * evita emitir um link para uma página vazia — e não abre no toque, só depois
 * de digitar. Num celular, que é onde essa tela é usada, o campo parecia
 * quebrado.
 *
 * A lista filtra por trecho, não por começo: quem procura "Silva" acha
 * "Joaquim Silva", que é como as pessoas realmente lembram do nome do cliente.
 */
const SeletorCliente = ({ valor, onChange, opcoes, naPlanilha, onConfirmar, placeholder }: Props) => {
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);

  const caixa = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  const filtradas = useMemo(() => {
    const busca = valor.trim().toLowerCase();

    /* Campo vazio mostra tudo: a lista serve para escolher, não só para
       completar o que já foi digitado. */
    if (!busca) return opcoes;

    return opcoes.filter((o) => o.toLowerCase().includes(busca));
  }, [valor, opcoes]);

  /* Digitar muda a lista e o índice antigo pode não existir mais — sem isto,
     Enter escolheria um nome que saiu da tela. */
  useEffect(() => {
    setAtivo(0);
  }, [valor]);

  /* Clique fora fecha. Sem isto, a lista ficaria aberta por cima do resto do
     modal depois que a pessoa desistiu dela. */
  useEffect(() => {
    if (!aberto) return;

    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };

    document.addEventListener("mousedown", fora);

    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  /* Acompanha a seta: item selecionado fora da área rolável seria invisível. */
  useEffect(() => {
    if (!aberto) return;

    listaRef.current?.querySelector<HTMLElement>(`[data-i="${ativo}"]`)?.scrollIntoView({ block: "nearest" });
  }, [ativo, aberto]);

  const escolher = (nome: string) => {
    onChange(nome);
    setAberto(false);
  };

  const teclado = (e: React.KeyboardEvent) => {
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
      /* Com a lista aberta e um nome sob o cursor, Enter escolhe. Fechada (ou
         sem resultado), Enter confirma o que foi digitado — cliente novo, que
         ainda não está em lugar nenhum, precisa poder ser escrito à mão. */
      if (aberto && filtradas[ativo]) {
        e.preventDefault();
        escolher(filtradas[ativo]);

        return;
      }

      setAberto(false);
      onConfirmar?.();

      return;
    }

    if (e.key === "Escape" && aberto) {
      e.preventDefault();
      setAberto(false);
    }
  };

  return (
    <div ref={caixa} className="relative min-w-0 flex-1">
      <div className="relative">
        <input
          value={valor}
          onChange={(e) => {
            onChange(e.target.value);
            setAberto(true);
          }}
          onFocus={() => setAberto(true)}
          onKeyDown={teclado}
          placeholder={placeholder ?? "Nome do cliente"}
          role="combobox"
          aria-expanded={aberto}
          aria-autocomplete="list"
          className="focus-ring w-full rounded-xl border border-fg/[0.1] bg-transparent py-2 pl-3 pr-9 text-[12.5px] text-ink outline-none"
        />

        <button
          type="button"
          tabIndex={-1}
          onClick={() => setAberto((a) => !a)}
          aria-label={aberto ? "Fechar lista" : "Abrir lista"}
          className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-mist transition-colors hover:text-ink"
        >
          <motion.span animate={{ rotate: aberto ? 180 : 0 }} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}>
            <ChevronDown size={14} />
          </motion.span>
        </button>
      </div>

      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            /* `origin-top` faz a lista crescer a partir do campo, e não do
               próprio centro — o movimento sai de onde o dedo tocou. */
            className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 origin-top overflow-hidden rounded-xl border border-fg/[0.1] bg-surface shadow-lg"
          >
            <div ref={listaRef} className="max-h-56 overflow-y-auto py-1">
              {filtradas.length === 0 ? (
                <p className="flex items-center gap-2 px-3 py-2.5 text-[12px] text-faint">
                  <Search size={13} />
                  {valor.trim() ? "Nenhum cliente com esse nome — dá para usar assim mesmo." : "Nenhum cliente cadastrado ainda."}
                </p>
              ) : (
                filtradas.map((nome, i) => (
                  <button
                    key={nome}
                    type="button"
                    data-i={i}
                    onMouseEnter={() => setAtivo(i)}
                    onClick={() => escolher(nome)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] transition-colors ${
                      i === ativo ? "bg-fg/[0.06] text-ink" : "text-mist"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{nome}</span>

                    {/* O selo é o motivo de a lista existir: emitir link para
                        quem não está na planilha gera página vazia. */}
                    {naPlanilha.has(nome) && (
                      <span className="shrink-0 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                        na produção
                      </span>
                    )}

                    {valor.trim() === nome && <Check size={13} className="shrink-0 text-accent" />}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SeletorCliente;
