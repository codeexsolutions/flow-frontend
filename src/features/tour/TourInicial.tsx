import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ShoppingCart, Package, Users, Wallet, Bell, Palette, ArrowRight, X } from "lucide-react";

import useAuth from "@/features/auth/store/auth.store";
import { ehGestor } from "@/features/vendas/components/TabsVendas";
import { useIsMobile } from "@/shared/hooks/useIsMobile";

const marca = (id?: string) => `codeex-flow-tour-${id ?? "anon"}`;

export const jaViuTour = (id?: string): boolean => localStorage.getItem(marca(id)) === "1";

type Passo = { icon: React.ReactNode; titulo: string; texto: string; rota?: string };

const TourInicial = () => {
  const navigate = useNavigate();
  const mobile = useIsMobile();
  const reduzir = useReducedMotion();
  const { user } = useAuth();

  const [passo, setPasso] = useState(0);
  const [aberto, setAberto] = useState(false);

  const gestor = ehGestor(user);

  useEffect(() => {
    if (!user?.id || jaViuTour(user.id)) return;
    const t = setTimeout(() => setAberto(true), 600);

    return () => clearTimeout(t);
  }, [user?.id]);

  const passos: Passo[] = gestor
    ? [
        { icon: <ShoppingCart size={22} />, titulo: "Comece pelo PDV", texto: "É onde a venda acontece: escolhe o cliente, lança os produtos e recebe — inclusive em partes.", rota: "/pdv" },
        { icon: <Package size={22} />, titulo: "Cadastre seu estoque", texto: "Produtos, preço de compra e de venda. O que estiver acabando aparece em destaque no início.", rota: "/estoque" },
        { icon: <Users size={22} />, titulo: "Seus clientes", texto: "Cadastro com contato e histórico. Na hora da venda, é só buscar pelo nome.", rota: "/clientes" },
        { icon: <Wallet size={22} />, titulo: "Acompanhe o dinheiro", texto: "Notas a receber e fluxo de caixa no mesmo lugar — entradas, saídas e o saldo do dia.", rota: "/financeiro" },
        { icon: <Bell size={22} />, titulo: "Sua equipe avisa", texto: "Cadastrou produto, fechou venda, deu baixa no caixa: chega no sino, na hora.", rota: undefined },
        { icon: <Palette size={22} />, titulo: "Deixe com a sua cara", texto: "Seis temas e nove cores de destaque em Configurações → Aparência.", rota: "/configuracoes/aparencia" },
      ]
    : [
        { icon: <ShoppingCart size={22} />, titulo: "Comece pelo PDV", texto: "É onde você vende: escolhe o cliente, lança os produtos e recebe.", rota: "/pdv" },
        { icon: <Package size={22} />, titulo: "Cuide do estoque", texto: "Cadastre produtos e preços. O que estiver acabando aparece em destaque.", rota: "/estoque" },
        { icon: <Users size={22} />, titulo: "Cadastre o cliente", texto: "Se quem está comprando ainda não tem cadastro, você cria na hora.", rota: "/clientes" },
        { icon: <Wallet size={22} />, titulo: "Acompanhe o dinheiro", texto: "Notas a receber e o caixa do dia — entradas, saídas e o saldo.", rota: "/financeiro" },
        { icon: <Palette size={22} />, titulo: "Deixe com a sua cara", texto: "Seis temas e nove cores de destaque em Configurações → Aparência.", rota: "/configuracoes/aparencia" },
      ];

  const atual = passos[passo];
  const ultimo = passo === passos.length - 1;

  const encerrar = () => {
    if (user?.id) localStorage.setItem(marca(user.id), "1");
    setAberto(false);
  };

  const avancar = () => {
    if (ultimo) {
      const destino = atual.rota;
      encerrar();
      if (destino) navigate(destino);
      return;
    }

    setPasso((p) => p + 1);
  };

  useEffect(() => {
    if (!aberto) return;

    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && encerrar();

    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  });

  if (!aberto || !atual) return null;

  return (
    <AnimatePresence>
      {/*
        `pb-[var(--dock-space)]` até o `md`, onde a dock do celular existe.

        O `z-[350]` não basta: o tour mora dentro do `MainLayout`, que anima
        `transform` e abre um contexto de empilhamento próprio, e a dock vive
        pendurada no `body` (ver `TabBar`). Ela ganhava, e cobria justamente o
        "Pular" e o "Próximo" — o cartão ficava sem saída no celular.
      */}
      <motion.div
        className="fixed inset-0 z-[350] flex items-end justify-center p-4 pb-[var(--dock-space)] sm:items-center md:pb-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-canvas/80" style={{ backdropFilter: "blur(var(--blur-md))" }} onClick={encerrar} />

        <motion.div
          key={passo}
          className="glass-strong elev-3 relative w-full max-w-md overflow-hidden rounded-3xl border border-accent/25 p-7 pb-[max(1.75rem,env(safe-area-inset-bottom))]"
          initial={reduzir ? false : { opacity: 0, y: mobile ? 40 : 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
        >
          <span aria-hidden className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-accent-soft to-transparent" />

          <button
            type="button"
            onClick={encerrar}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-faint transition-colors hover:text-ink"
            aria-label="Fechar apresentação"
          >
            <X size={16} />
          </button>

          <motion.span
            className="mb-5 inline-grid h-14 w-14 place-items-center rounded-2xl border border-accent/25 bg-accent/[0.12] text-accent-soft"
            initial={reduzir ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.08, type: "spring", stiffness: 380, damping: 22 }}
          >
            {atual.icon}
          </motion.span>

          <p className="text-[11px] uppercase tracking-[2px] text-faint">
            {passo + 1} de {passos.length}
          </p>

          <h2 className="mt-1.5 text-[22px] leading-tight text-ink">{atual.titulo}</h2>
          <p className="mt-2.5 text-[14px] leading-relaxed text-mist">{atual.texto}</p>

          {/* Progresso: a barra ativa cresce, as demais ficam como pontos. */}
          <div className="mt-6 flex items-center gap-1.5">
            {passos.map((p, i) => (
              <motion.span
                key={p.titulo}
                className={`h-1 rounded-full ${i <= passo ? "bg-accent" : "bg-fg/[0.12]"}`}
                animate={{ width: i === passo ? 26 : 8 }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            ))}
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button type="button" onClick={encerrar} className="min-h-[44px] rounded-xl px-3 text-[13.5px] text-mist transition-colors hover:text-ink">
              Pular
            </button>

            <button
              type="button"
              onClick={avancar}
              className="group ml-auto inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-accent px-5 text-[14px] text-white shadow-[0_10px_28px_-10px_rgb(var(--accent))] transition-all hover:brightness-110 active:scale-[0.99]"
            >
              {ultimo ? "Começar a usar" : "Próximo"}
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default TourInicial;
