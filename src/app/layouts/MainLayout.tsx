import { useState } from "react";
import { motion, useReducedMotionConfig } from "framer-motion";
import { Outlet, useLocation } from "react-router-dom";

import useTransicao from "@/shared/session/transicao.store";
import TourInicial from "@/features/tour/TourInicial";
import Novidades from "@/features/novidades/Novidades";

import TermosLgpdModal from "@/features/termos/TermosLgpdModal";
import { useTermosLgpd } from "@/features/termos/useTermosLgpd";

import Sidebar from "@/shared/ui/Sidebar";
import TabBar from "@/mobile/TabBar";
import useSwipeAbas from "@/shared/hooks/useSwipeAbas";

const Main = () => {
  const { pathname } = useLocation();

  useSwipeAbas();

  const saindo = useTransicao((s) => s.modo) === "saida";
  const reduzir = useReducedMotionConfig();

  /* Na máquina fraca a moldura só esmaece. Escalar o app inteiro obriga o
     navegador a redesenhar cada vidro da tela a cada quadro — era o
     congelamento na entrada e na saída do sistema. */
  const leve = document.documentElement.dataset.fx === "lite";
  const recuo = leve ? 1 : 0.97;

  const [abriu, setAbriu] = useState(false);

  /* Os termos de tratamento de dados. `bloqueando` já embute quem pode
     resolver: para o vendedor cujo dono ainda não aceitou, isto é sempre
     falso e o sistema abre normal. Ver `useTermosLgpd`. */
  const termos = useTermosLgpd();

  return (
    <motion.div
      className="aurora flex h-[100dvh] w-screen overflow-hidden bg-canvas"
      /* Sem `filter: blur` na moldura: desfocar o app inteiro, com vidro por
         dentro, era o quadro mais caro do sistema — e travava justo na saída. */
      initial={{ opacity: 0, scale: recuo }}
      animate={saindo ? { opacity: 0, scale: recuo } : { opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.22, 0.61, 0.36, 1] }}
      onAnimationComplete={() => !saindo && setAbriu(true)}
      style={abriu && !saindo ? { transform: "none" } : undefined}
    >
      <Sidebar />

      <main className="relative min-w-0 flex-1 overflow-hidden">
        <div key={pathname} className="h-full w-full" style={reduzir ? undefined : { animation: "tela-entra 0.22s cubic-bezier(0.22,0.61,0.36,1) both" }}>
          <Outlet />
        </div>
      </main>

      <TabBar />

      {/*
        O aceite vem ANTES de tudo que fala com a pessoa.

        Tour e novidades são convites a olhar o sistema; os termos são a
        condição para usá-lo. Mostrados juntos, virariam três caixas
        disputando a mesma tela — e a de baixo, coberta por um scrim, pareceria
        um defeito. Enquanto o aceite estiver pendente para quem pode dar, ele
        é a única coisa na tela.
      */}
      {termos.bloqueando && termos.termos ? (
        <TermosLgpdModal
          termos={termos.termos}
          salvando={termos.salvando}
          erro={termos.erro}
          onAceitar={() => void termos.aceitar()}
        />
      ) : (
        <>
          <TourInicial />
          {/* As novidades da versão, uma vez por pessoa. Nunca junto do tour: quem
              está vendo o sistema pela primeira vez não tem "antes" para comparar —
              ver a nota em `Novidades`. */}
          <Novidades />
        </>
      )}
    </motion.div>
  );
};

export default Main;
