import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, Check, EyeOff, Lock, Pencil, Trash2, Users } from "lucide-react";

import type { Coluna } from "@/features/planilhas/services/planilha.service";

type Funcionario = { id: string; nome: string };

type Props = {
  coluna: Coluna;
  colunas: Coluna[];
  funcionarios: Funcionario[];
  /** `root` de verdade — não é o mesmo que gestor. Ver a nota abaixo. */
  ehRoot: boolean;
  onRenomear: () => void;
  onExcluir: () => void;
  onAlternarPermissao: (funcionarioId: string) => void;
  onAlternarPublico: (publico: boolean) => void;
  onDefinirDataMinima: (colunaId: string | null) => void;
  onFechar: () => void;
};

/**
 * As configurações de UMA coluna, no cabeçalho dela.
 *
 * Antes isso era um modal "Colunas da planilha" com a lista inteira dentro: para
 * mudar quem edita a coluna "Prazo" era preciso abrir o modal, achar "Prazo" no
 * meio de treze e voltar. O caminho ficava longe do objeto — e a tela cheia de
 * um botão que só o gestor usava.
 *
 * Aqui a configuração está ONDE a coluna está. Clicar no cabeçalho abre o que é
 * daquela coluna, e nada mais.
 *
 * ---------------------------------------------------------------------
 * Por que permissão é `root`, e não `gestor`
 * ---------------------------------------------------------------------
 * `ehGestor` é `root || permissao === "ADMIN"`, e ADMIN é um cargo que o dono
 * distribui para quem toca a operação. Decidir quem pode mexer em qual coluna é
 * outra coisa: é o dono limitando a própria equipe, inclusive os ADMIN. Se um
 * ADMIN pudesse editar essa lista, ele se incluiria — e a trava não seria trava.
 */
const MenuColuna = ({
  coluna,
  colunas,
  funcionarios,
  ehRoot,
  onRenomear,
  onExcluir,
  onAlternarPermissao,
  onAlternarPublico,
  onDefinirDataMinima,
  onFechar,
}: Props) => {
  const caixa = useRef<HTMLDivElement>(null);
  const [aba, setAba] = useState<"acoes" | "permissoes">("acoes");

  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) onFechar();
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onFechar();

    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);

    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [onFechar]);

  /* Só outras colunas DATA podem servir de mínimo — e não ela mesma, que criaria
     uma regra que nunca falha e confunde quem lê a configuração depois. */
  const datas = colunas.filter((c) => c.tipo === "DATA" && c.id !== coluna.id);

  const liberados = coluna.permissoes ?? [];

  return (
    <AnimatePresence>
      <motion.div
        ref={caixa}
        initial={{ opacity: 0, y: -6, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.97 }}
        transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
        className="absolute left-0 top-[calc(100%+6px)] z-50 w-64 origin-top overflow-hidden rounded-xl border border-fg/[0.1] bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-fg/[0.06] px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{coluna.nome}</span>
          <span className="shrink-0 rounded bg-fg/[0.06] px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide text-faint">
            {coluna.tipo.replace("_", " ")}
          </span>
        </div>

        {ehRoot && (
          <div className="flex gap-1 border-b border-fg/[0.06] px-2 py-1.5">
            {(["acoes", "permissoes"] as const).map((a) => (
              <button
                key={a}
                onClick={() => setAba(a)}
                className={`rounded-lg px-2 py-1 text-[11px] transition-colors ${
                  aba === a ? "bg-accent/10 text-accent" : "text-mist hover:text-ink"
                }`}
              >
                {a === "acoes" ? "Ações" : "Quem edita"}
              </button>
            ))}
          </div>
        )}

        {aba === "acoes" || !ehRoot ? (
          <div className="py-1">
            <button
              onClick={() => {
                onFechar();
                onRenomear();
              }}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12.5px] text-mist transition-colors hover:bg-fg/[0.06] hover:text-ink"
            >
              <Pencil size={13} /> Renomear
            </button>

            <button
              onClick={() => onAlternarPublico(!(coluna.publico !== false))}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12.5px] text-mist transition-colors hover:bg-fg/[0.06] hover:text-ink"
            >
              <EyeOff size={13} />
              <span className="flex-1">{coluna.publico === false ? "Mostrar ao cliente" : "Esconder do cliente"}</span>
              {coluna.publico === false && <Lock size={11} className="text-accent" />}
            </button>

            {/* Só faz sentido em coluna de data, e só se houver outra data para
                servir de referência. */}
            {coluna.tipo === "DATA" && datas.length > 0 && (
              <div className="border-t border-fg/[0.06] px-3 py-2">
                <p className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-faint">
                  <CalendarClock size={11} /> Não pode ser antes de
                </p>

                <select
                  value={coluna.nao_antes_de ?? ""}
                  onChange={(e) => onDefinirDataMinima(e.target.value || null)}
                  className="focus-ring w-full rounded-lg border border-fg/[0.1] bg-transparent px-2 py-1.5 text-[11.5px] text-ink outline-none"
                >
                  <option value="">— sem regra —</option>
                  {datas.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="border-t border-fg/[0.06] pt-1">
              <button
                onClick={() => {
                  onFechar();
                  onExcluir();
                }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12.5px] text-danger transition-colors hover:bg-danger/10"
              >
                <Trash2 size={13} /> Excluir coluna
              </button>
            </div>
          </div>
        ) : (
          <div className="max-h-56 overflow-y-auto py-1">
            <p className="px-3 pb-1.5 pt-1 text-[10.5px] leading-relaxed text-faint">
              {liberados.length === 0
                ? "Todos da equipe podem editar esta coluna."
                : `${liberados.length} ${liberados.length === 1 ? "pessoa" : "pessoas"} com acesso. O resto vê, mas não edita.`}
            </p>

            {funcionarios.length === 0 ? (
              <p className="px-3 py-2 text-[11.5px] text-faint">Nenhum funcionário ativo na equipe.</p>
            ) : (
              funcionarios.map((f) => {
                const on = liberados.includes(String(f.id));

                return (
                  <button
                    key={f.id}
                    onClick={() => onAlternarPermissao(String(f.id))}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12.5px] text-mist transition-colors hover:bg-fg/[0.06] hover:text-ink"
                  >
                    <span
                      className={`grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors ${
                        on ? "border-accent bg-accent text-white" : "border-fg/20"
                      }`}
                    >
                      {on && <Check size={10} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{f.nome}</span>
                  </button>
                );
              })
            )}

            {liberados.length > 0 && (
              <button
                onClick={() => liberados.forEach((id) => onAlternarPermissao(id))}
                className="mt-1 flex w-full items-center gap-2.5 border-t border-fg/[0.06] px-3 py-1.5 text-left text-[11.5px] text-faint transition-colors hover:text-mist"
              >
                <Users size={12} /> Liberar para todos
              </button>
            )}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default MenuColuna;
