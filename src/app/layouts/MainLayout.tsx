import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Outlet, useLocation } from "react-router-dom";

import useTransicao from "@/shared/session/transicao.store";
import TourInicial from "@/features/tour/TourInicial";
import Novidades from "@/features/novidades/Novidades";

import Sidebar from "@/shared/ui/Sidebar";
import TabBar from "@/mobile/TabBar";
import useSwipeAbas from "@/shared/hooks/useSwipeAbas";

const Main = () => {
  const { pathname } = useLocation();

  useSwipeAbas();

  const saindo = useTransicao((s) => s.modo) === "saida";
  const reduzir = useReducedMotion();

  const [abriu, setAbriu] = useState(false);

  return (
    <motion.div
      className="aurora flex h-[100dvh] w-screen overflow-hidden bg-canvas"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={saindo ? { opacity: 0, scale: 0.94, filter: "blur(6px)" } : { opacity: 1, scale: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.55, ease: [0.22, 0.61, 0.36, 1] }}
      onAnimationComplete={() => !saindo && setAbriu(true)}
      style={abriu && !saindo ? { transform: "none", filter: "none" } : undefined}
    >
      <Sidebar />

      <main className="relative min-w-0 flex-1 overflow-hidden">
        <div key={pathname} className="h-full w-full" style={reduzir ? undefined : { animation: "tela-entra 0.22s cubic-bezier(0.22,0.61,0.36,1) both" }}>
          <Outlet />
        </div>
      </main>

      <TabBar />
      <TourInicial />
      {/* As novidades da versão, uma vez por pessoa. Nunca junto do tour: quem
          está vendo o sistema pela primeira vez não tem "antes" para comparar —
          ver a nota em `Novidades`. */}
      <Novidades />
    </motion.div>
  );
};

export default Main;
