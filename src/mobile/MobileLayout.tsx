import { useCallback, useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { BadgeDollarSign, Home, Package, ShoppingCart, Users } from "lucide-react";

import useVendaStore from "@/features/vendas/store/venda.store";
import useClienteStore from "@/features/clientes/store/cliente.store";
import useProdutoStore from "@/features/estoque/store/produto.store";
import useSincronizacao from "@/shared/realtime/useSincronizacao";
import TermosLgpdModal from "@/features/termos/TermosLgpdModal";
import { useTermosLgpd } from "@/features/termos/useTermosLgpd";

const ABAS = [
  { rota: "/", label: "Início", icone: Home },
  { rota: "/vendas", label: "Vendas", icone: BadgeDollarSign },
  { rota: "/clientes", label: "Clientes", icone: Users },
  { rota: "/estoque", label: "Estoque", icone: Package },
];

/**
 * A moldura do app do celular.
 *
 * É uma coluna `fixed inset-0`: tela em cima, barra embaixo, e só o corpo de
 * cada tela rola. Nada de `100dvh` (que no Safari acompanha a barra de
 * endereço com atraso) e nada flutuando por cima do conteúdo — a barra ocupa o
 * próprio espaço, então o fim da rolagem é sempre visível.
 *
 * A barra tem cinco alvos: quatro abas e, no meio, o carrinho de nova venda — a
 * única ação que justifica abrir o sistema no celular, no lugar onde o polegar
 * cai. Sem rótulo, e na cor `--carrinho` (ver `index.css`), que nunca coincide
 * com o destaque — é ele que marca a aba selecionada.
 */
const MobileLayout = () => {
  const { pathname } = useLocation();
  const termos = useTermosLgpd();

  /* Os pesos de fonte do celular — ver `html.app-celular` no `index.css`. Na
     raiz e não neste nó: as folhas abrem no `body`, fora desta moldura. */
  useEffect(() => {
    document.documentElement.classList.add("app-celular");
    return () => document.documentElement.classList.remove("app-celular");
  }, []);

  /* As três listas do app se atualizam sozinhas quando outro aparelho mexe. */
  const recarregar = useCallback(() => {
    void useVendaStore.getState().fetchVendas(true);
    void useClienteStore.getState().fetchClientes(true);
    void useProdutoStore.getState().fetchProdutos(true);
  }, []);

  useSincronizacao(["pedidos", "clientes", "produtos"], recarregar);

  const ativo = (rota: string) => (rota === "/" ? pathname === "/" : pathname.startsWith(rota));

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-canvas text-ink">
      {/* A chave é só o caminho: abrir uma folha (`?venda=…`) não remonta a tela. */}
      <div key={pathname} className="flex min-h-0 flex-1 flex-col" style={{ animation: "m-fade .2s ease both" }}>
        <Outlet />
      </div>

      <nav className="relative shrink-0 border-t border-fg/[0.07] bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <div className="mx-auto grid h-[62px] max-w-md grid-cols-5 items-center px-2">
          {ABAS.slice(0, 2).map((a) => (
            <Aba key={a.rota} {...a} on={ativo(a.rota)} />
          ))}

          <NavLink to="/pdv" aria-label="Nova venda" className="relative z-10 flex flex-col items-center justify-center">
            <span
              className={`grid h-[52px] w-[52px] place-items-center rounded-full transition-all active:scale-95 bg-[rgb(var(--carrinho))] text-white shadow-[0_8px_20px_-6px_rgb(var(--carrinho)/0.75)] ${pathname === "/pdv" ? "scale-105 ring-4 ring-[rgb(var(--carrinho)/0.22)]" : ""}`}
            >
              <ShoppingCart size={24} strokeWidth={2.3} />
            </span>
          </NavLink>

          {ABAS.slice(2).map((a) => (
            <Aba key={a.rota} {...a} on={ativo(a.rota)} />
          ))}
        </div>
      </nav>

      {termos.bloqueando && termos.termos && (
        <TermosLgpdModal termos={termos.termos} salvando={termos.salvando} erro={termos.erro} onAceitar={() => void termos.aceitar()} />
      )}
    </div>
  );
};

/**
 * A aba ativa é um bloco inteiro preenchido — ícone e nome juntos —, não só o
 * ícone aceso.
 *
 * O bloco é UM só (`layoutId`) e desliza de uma aba para a outra no toque, em
 * vez de sumir numa e aparecer na outra: o movimento mostra de onde se saiu e
 * para onde se foi. Ele passa por trás do carrinho no caminho, e é por isso
 * que o carrinho fica acima (`z-10`).
 */
const Aba = ({ rota, label, icone: Icone, on }: { rota: string; label: string; icone: typeof Home; on: boolean }) => {
  const reduzir = useReducedMotion();

  return (
    <NavLink to={rota} aria-current={on ? "page" : undefined} className="flex h-full items-center justify-center px-0.5">
      <span className={`relative flex h-[52px] w-full max-w-[72px] flex-col items-center justify-center gap-1 rounded-2xl transition-colors duration-200 ${on ? "text-white" : "text-mist active:bg-fg/[0.06]"}`}>
        {on && (
          <motion.span
            layoutId="aba-ativa"
            transition={reduzir ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 38 }}
            className="absolute inset-0 rounded-2xl bg-accent shadow-[0_6px_16px_-8px_rgb(var(--accent)/0.8)]"
          />
        )}
        <motion.span
          className="relative"
          animate={on && !reduzir ? { y: [0, -3, 0], scale: [1, 1.12, 1] } : { y: 0, scale: 1 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <Icone size={21} strokeWidth={on ? 2.4 : 2} />
        </motion.span>
        <span className={`relative text-[11px] leading-none tracking-tight ${on ? "font-semibold" : "font-medium"}`}>{label}</span>
      </span>
    </NavLink>
  );
};

export default MobileLayout;
