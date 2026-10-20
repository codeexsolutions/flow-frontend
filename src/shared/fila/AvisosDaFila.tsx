import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CloudOff } from "lucide-react";

import useAuth from "@/features/auth/store/auth.store";
import { useAlert } from "@/shared/ui/Alert";
import { aoRecusar, useFilaEnvio } from "@/shared/fila/filaEnvio";
/* Os executores das vendas se registram na carga deste módulo. */
import "@/features/vendas/services/filaVendas";

/**
 * O que a fila de envio mostra a quem usa — e só quando há o que mostrar.
 *
 * Com a internet funcionando, NADA: a tela já disse "feito" no clique e a
 * gravação chega em menos de um segundo. Aparece só quando a conexão caiu e
 * há venda esperando para subir — uma pílula no canto, que diz que ela vai
 * sozinha, para ninguém lançar a mesma venda de novo achando que se perdeu.
 *
 * E é aqui que chega a RECUSA que ninguém está esperando: a nota já fechada,
 * ou a tarefa que vinha de antes do F5 — sem esta camada, ela sumiria calada.
 */
const AvisosDaFila = () => {
  const alert = useAlert();
  const empresa = useAuth((s) => s.user?.codigoEmpresa ?? null);
  const semConexao = useFilaEnvio((s) => s.semConexao);
  const pendentes = useFilaEnvio((s) => s.tarefas.filter((t) => t.empresa === empresa).length);

  useEffect(() => aoRecusar((r) => alert.error(r.titulo, r.mensagem)), [alert]);

  const mostrar = semConexao && pendentes > 0;

  return (
    <AnimatePresence>
      {mostrar && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.25 }}
          className="fixed bottom-4 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-warning/30 bg-surface/95 px-4 py-2 text-[12.5px] text-ink shadow-e3 backdrop-blur"
        >
          <CloudOff size={15} className="shrink-0 text-warning" />
          <span>
            Sem internet — {pendentes === 1 ? "1 gravação aguardando" : `${pendentes} gravações aguardando`}.{" "}
            <span className="text-mist">Sobe sozinho quando a conexão voltar.</span>
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AvisosDaFila;
