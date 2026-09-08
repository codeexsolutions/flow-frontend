import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles, Wand2, Wrench, X } from "lucide-react";

import useAuth from "@/features/auth/store/auth.store";
import { jaViuTour } from "@/features/tour/TourInicial";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import useNovidades from "@/features/novidades/novidades.store";
import {
    NOVIDADES, RESUMO, jaViuNovidades, marcarNovidadesVistas, type TipoNovidade,
} from "@/features/novidades/conteudo";

/**
 * "O que mudou desde a última vez" — uma vez só, para quem já usa o sistema.
 *
 * ---------------------------------------------------------------------------
 * Uma lista, e não um passo a passo
 * ---------------------------------------------------------------------------
 * O tour de boas-vindas avança de tela em tela porque ele ENSINA: cada passo é
 * uma coisa para fazer, e a ordem importa. Aqui é o contrário — quem lê já sabe
 * usar o sistema e quer varrer a lista, achar o que interessa a ele e ir. Seis
 * cliques para descobrir que nenhuma das novidades era sobre o trabalho dele é
 * exatamente o que faz a pessoa fechar no primeiro passo.
 *
 * ---------------------------------------------------------------------------
 * Por que o botão de cada item leva embora
 * ---------------------------------------------------------------------------
 * "Ver agora" fecha o aviso e navega. É o único jeito de a novidade virar uso
 * no mesmo minuto: lido e fechado, o item vira uma intenção para depois, e
 * depois ninguém volta. O que a pessoa não abriu continua no menu, onde sempre
 * esteve.
 */

const ROTULO: Record<TipoNovidade, { texto: string; classe: string; icone: React.ReactNode }> = {
    novo: {
        texto: "Novo",
        classe: "border-accent/25 bg-accent/[0.10] text-accent-soft",
        icone: <Sparkles size={13} />,
    },
    melhor: {
        texto: "Melhorou",
        classe: "border-fg/[0.10] bg-fg/[0.04] text-mist",
        icone: <Wand2 size={13} />,
    },
    corrigido: {
        texto: "Corrigido",
        classe: "border-success/25 bg-success/[0.10] text-success",
        icone: <Wrench size={13} />,
    },
};

const Novidades = () => {
    const navigate = useNavigate();
    const mobile = useIsMobile();
    const reduzir = useReducedMotion();
    const { user } = useAuth();

    const forcado = useNovidades((s) => s.aberto);
    const fecharForcado = useNovidades((s) => s.fechar);

    const [aberto, setAberto] = useState(false);

    /*
     * Quem acabou de chegar não vê isto.
     *
     * O tour cuida de quem nunca usou o sistema, e "agora a baixa leva ao
     * extrato" não significa nada para quem não conhece o extrato de antes.
     * Quem ainda não viu o tour já sai daqui com a leva marcada como lida: o
     * changelog dele é o sistema inteiro, que ele está vendo pela primeira vez.
     */
    useEffect(() => {
        if (!user?.id) return;
        if (jaViuNovidades(user.id)) return;

        if (!jaViuTour(user.id)) {
            marcarNovidadesVistas(user.id);
            return;
        }

        /* A espera deixa a tela montar antes: aparecer por cima de uma tela que
           ainda está desenhando faz a novidade parecer um erro de carregamento. */
        const t = setTimeout(() => setAberto(true), 900);

        return () => clearTimeout(t);
    }, [user?.id]);

    const visivel = aberto || forcado;

    const encerrar = () => {
        if (user?.id) marcarNovidadesVistas(user.id);

        setAberto(false);
        fecharForcado();
    };

    const irPara = (rota: string) => {
        encerrar();
        navigate(rota);
    };

    useEffect(() => {
        if (!visivel) return;

        const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && encerrar();

        window.addEventListener("keydown", aoTeclar);
        return () => window.removeEventListener("keydown", aoTeclar);
    });

    if (!visivel) return null;

    return (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 z-[350] flex items-end justify-center p-4 sm:items-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
            >
                <div
                    className="absolute inset-0 bg-canvas/80"
                    style={{ backdropFilter: "blur(var(--blur-md))" }}
                    onClick={encerrar}
                />

                <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Novidades do sistema"
                    className="glass-strong elev-3 relative flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-accent/25"
                    initial={reduzir ? false : { opacity: 0, y: mobile ? 40 : 16, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
                >
                    <span
                        aria-hidden
                        className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-accent-soft to-transparent"
                    />

                    {/* Cabeçalho fixo: a lista rola por baixo dele. */}
                    <div className="shrink-0 border-b border-fg/[0.07] px-7 pb-5 pt-7">
                        <button
                            type="button"
                            onClick={encerrar}
                            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-faint transition-colors hover:text-ink"
                            aria-label="Fechar novidades"
                        >
                            <X size={16} />
                        </button>

                        <motion.span
                            className="mb-4 inline-grid h-12 w-12 place-items-center rounded-2xl border border-accent/25 bg-accent/[0.12] text-accent-soft"
                            initial={reduzir ? false : { scale: 0.6, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.08, type: "spring", stiffness: 380, damping: 22 }}
                        >
                            <Sparkles size={20} />
                        </motion.span>

                        <p className="text-[11px] uppercase tracking-[2px] text-faint">O que mudou</p>
                        <h2 className="mt-1.5 text-[21px] leading-tight text-ink">{RESUMO}</h2>
                        <p className="mt-2 text-[13px] leading-relaxed text-mist">
                            Este aviso aparece uma vez só. Depois, ele fica em Configurações › Meu perfil.
                        </p>
                    </div>

                    {/* A lista. Rola por dentro para o rodapé com o botão nunca
                        sair da tela — no celular, um botão abaixo da dobra é um
                        botão que não existe. */}
                    <div className="min-h-0 flex-1 overflow-y-auto px-7 py-5">
                        <ul className="flex flex-col gap-5">
                            {NOVIDADES.map((n) => {
                                const rotulo = ROTULO[n.tipo];

                                return (
                                    <li key={n.titulo} className="flex flex-col gap-1.5">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span
                                                className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider ${rotulo.classe}`}
                                            >
                                                {rotulo.icone}
                                                {rotulo.texto}
                                            </span>

                                            <p className="text-[14px] leading-tight text-ink">{n.titulo}</p>
                                        </div>

                                        <p className="text-[12.5px] leading-relaxed text-mist">{n.texto}</p>

                                        {n.rota && (
                                            <button
                                                type="button"
                                                onClick={() => irPara(n.rota!)}
                                                className="group inline-flex w-fit cursor-pointer items-center gap-1.5 text-[12px] text-accent-soft transition-colors hover:text-ink"
                                            >
                                                Ver agora
                                                <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                                            </button>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>

                    <div className="shrink-0 border-t border-fg/[0.07] px-7 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                        <button
                            type="button"
                            onClick={encerrar}
                            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-accent px-5 text-[14px] text-white shadow-[0_10px_28px_-10px_rgb(var(--accent))] transition-all hover:brightness-110 active:scale-[0.99]"
                        >
                            Entendi, voltar ao trabalho
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default Novidades;
