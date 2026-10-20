import { motion, useReducedMotionConfig } from "framer-motion";
import { Search } from "lucide-react";

/**
 * Página não encontrada.
 *
 * Duas decisões que separam isto de um 404 genérico:
 *
 * **O "404" é a peça, não um ícone de alerta.** Triângulo vermelho comunica
 * erro grave — e errar o caminho não é grave, é banal. O número grande, com o
 * zero desenhado como uma lupa, conta a mesma coisa sem assustar.
 *
 * **Sem botões.** A navegação do sistema — barra lateral no computador, barra
 * inferior no celular — continua visível em volta desta tela, porque ela é
 * conteúdo do `Outlet`. Repetir "Início" aqui seria oferecer de novo o que já
 * está a um clique de distância.
 *
 * A animação é uma sequência curta, não efeitos soltos: os dígitos entram em
 * escada, a lupa assenta girando, o texto sobe depois. `useReducedMotionConfig`
 * desliga tudo — quem pediu menos movimento não recebe entrada coreografada.
 */
const NotFoundPage = () => {
  const reduzir = useReducedMotionConfig();

  const entra = (atraso: number) =>
    reduzir
      ? {}
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { delay: atraso, duration: 0.5, ease: [0.22, 0.61, 0.36, 1] as const },
        };

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden px-6 text-center">
      {/*
       * Órbita em volta do 404.
       *
       * O brilho grande que havia aqui saiu: `bg-accent` desfocado em 130px
       * perde a saturação do roxo e assenta em rosa — num fundo escuro isso lê
       * como cor de outro sistema. Movimento contido em volta do número diz
       * "procurando" muito melhor que uma mancha atrás dele.
       *
       * Duas voltas em ritmos diferentes: o anel tracejado devagar, o ponto
       * mais rápido no sentido contrário. É o que evita a leitura de "carregando".
       */}
      <div className="relative flex items-center justify-center">
        {!reduzir && (
          <>
            <motion.span
              aria-hidden
              className="pointer-events-none absolute h-[240px] w-[240px] rounded-full border border-dashed border-accent/25 sm:h-[300px] sm:w-[300px]"
              animate={{ rotate: 360 }}
              transition={{ duration: 26, repeat: Infinity, ease: "linear" }}
            />

            <motion.span
              aria-hidden
              className="pointer-events-none absolute h-[190px] w-[190px] rounded-full border border-accent/[0.12] sm:h-[240px] sm:w-[240px]"
              animate={{ rotate: -360 }}
              transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
            >
              {/* O ponto vive na borda do anel e é carregado por ele. */}
              <span className="absolute -top-[3px] left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-accent shadow-[0_0_10px_rgb(var(--accent))]" />
            </motion.span>
          </>
        )}

      <div className="relative flex items-center gap-1 sm:gap-2">
        {["4", "0", "4"].map((d, i) =>
          d === "0" ? (
            <motion.span
              key={i}
              className="grid h-[68px] w-[68px] place-items-center rounded-full border-[3px] border-accent text-accent sm:h-[92px] sm:w-[92px]"
              initial={reduzir ? false : { opacity: 0, y: 18, rotate: -25 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ delay: 0.12, type: "spring", stiffness: 260, damping: 18 }}
            >
              <Search className="h-7 w-7 sm:h-10 sm:w-10" strokeWidth={2.5} />
            </motion.span>
          ) : (
            <motion.span
              key={i}
              className="text-[76px] leading-none tracking-tight text-ink sm:text-[104px]"
              initial={reduzir ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.12, duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}
            >
              {d}
            </motion.span>
          ),
        )}
        </div>
      </div>

      <motion.h1 className="relative mt-6 text-[19px] tracking-tight text-ink" {...entra(0.3)}>
        Página não encontrada
      </motion.h1>

    </div>
  );
};

export default NotFoundPage;
