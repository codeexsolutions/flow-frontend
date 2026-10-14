import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  User, Users, Building2, Factory, Store, Wrench, Globe, Package,
  Check, Loader2, ArrowLeft, RefreshCw, Sparkles, ChevronDown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import AssinaturaService from "@/features/assinatura/services/assinatura.service";
import {
  CICLO_LABEL, RECURSO_LABEL, formatarLimite,
  type Plano, type Recomendacao, type RespostasDiagnostico,
  type RespostaCorreios, type RespostaEquipe, type RespostaNegocio,
} from "@/features/assinatura/types/assinatura.types";
import { formatCurrencyFromCents } from "@/shared/utils/currency";

type Opcao<T> = { valor: T; titulo: string; apoio: string; icone: LucideIcon };

const OPCOES_EQUIPE: Opcao<RespostaEquipe>[] = [
  { valor: "SO_EU", titulo: "Só eu", apoio: "Eu vendo, eu entrego, eu cobro", icone: User },
  { valor: "DOIS_A_CINCO", titulo: "2 a 5 pessoas", apoio: "Eu e mais alguns", icone: Users },
  { valor: "SEIS_A_QUINZE", titulo: "6 a 15 pessoas", apoio: "Já tem equipe formada", icone: Building2 },
  { valor: "MAIS_DE_QUINZE", titulo: "Mais de 15", apoio: "Time grande, vários turnos", icone: Factory },
];

const OPCOES_NEGOCIO: Opcao<RespostaNegocio>[] = [
  { valor: "LOJA", titulo: "Loja física", apoio: "Venda no balcão", icone: Store },
  { valor: "SERVICOS", titulo: "Serviços", apoio: "Orçamento, execução, cobrança", icone: Wrench },
  { valor: "ONLINE", titulo: "Venda online", apoio: "Redes sociais, site, marketplace", icone: Globe },
  { valor: "INDUSTRIA", titulo: "Indústria", apoio: "Produção e pedido grande", icone: Package },
];

const OPCOES_CORREIOS: Opcao<RespostaCorreios>[] = [
  { valor: "SEMPRE", titulo: "Todo dia", apoio: "Cada venda vira uma encomenda", icone: Package },
  { valor: "AS_VEZES", titulo: "Às vezes", apoio: "Depende do cliente", icone: Globe },
  { valor: "NAO", titulo: "Não envio", apoio: "Cliente retira ou eu entrego", icone: Store },
];

const PERGUNTAS = [
  { chave: "equipe", titulo: "Quem vai usar o sistema?", apoio: "Contando com você.", opcoes: OPCOES_EQUIPE },
  { chave: "negocio", titulo: "O que o seu negócio faz?", apoio: "O que mais se parece.", opcoes: OPCOES_NEGOCIO },
  { chave: "correios", titulo: "Você envia pelos Correios?", apoio: "Frete, etiqueta e rastreio.", opcoes: OPCOES_CORREIOS },
] as const;

type Props = {
  /** Chamado quando a pessoa confirma um plano — inclusive o alternativo. */
  onSelecionar: (codigo: string) => void;
  /** Sobe junto para virar lead: é o que o vendedor lê antes de responder. */
  onRespostas?: (respostas: RespostasDiagnostico) => void;
  /** Código já escolhido — mantém o cartão marcado ao voltar de outra etapa. */
  selecionado?: string;
  /** "Comparar todos os planos" — a saída para quem não confia em um só. */
  onComparar?: () => void;
};

const VARIANTES = {
  entra: { opacity: 0, y: 12 },
  centro: { opacity: 1, y: 0 },
  sai: { opacity: 0, y: -12 },
};

const DiagnosticoPlano = ({ onSelecionar, onRespostas, selecionado, onComparar }: Props) => {

  const reduzir = useReducedMotion();

  const [passo, setPasso] = useState(0);
  const [respostas, setRespostas] = useState<Partial<RespostasDiagnostico>>({});
  const [recomendacao, setRecomendacao] = useState<Recomendacao | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [verAlternativo, setVerAlternativo] = useState(false);

  const completo = passo >= PERGUNTAS.length;

  /* Buscar a recomendação assim que a terceira resposta entra. */
  useEffect(() => {
    if (!completo || recomendacao || carregando) return;

    const finais = respostas as RespostasDiagnostico;

    setCarregando(true);
    setErro("");

    AssinaturaService.recomendar(finais)
      .then((r) => {
        setRecomendacao(r);
        onRespostas?.(finais);
        // Já deixa o plano escolhido: a pessoa respondeu, o sistema
        // respondeu, e obrigá-la a confirmar de novo só adiciona um clique
        // para dizer o que ela acabou de dizer.
        onSelecionar(r.plano.codigo);
      })
      .catch((e) => setErro(e?.message || "Não foi possível recomendar um plano agora."))
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completo]);

  const responder = (chave: string, valor: string) => {
    setRespostas((r) => ({ ...r, [chave]: valor }));
    setPasso((p) => p + 1);
  };

  const voltar = () => {
    setRecomendacao(null);
    setVerAlternativo(false);
    setPasso((p) => Math.max(0, p - 1));
  };

  const refazer = () => {
    setRecomendacao(null);
    setVerAlternativo(false);
    setRespostas({});
    setPasso(0);
  };

  /* ------------------------------------------------------------------ */
  /* Perguntas */
  /* ------------------------------------------------------------------ */

  if (!completo) {
    const pergunta = PERGUNTAS[passo];

    return (
      <div className="flex flex-col gap-3">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pergunta.chave}
            variants={reduzir ? undefined : VARIANTES}
            initial="entra"
            animate="centro"
            exit="sai"
            transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
            className="flex flex-col gap-3"
          >
            <div>
              <p className="text-[10px] uppercase tracking-[1.4px] text-accent-soft">
                Pergunta {passo + 1} de {PERGUNTAS.length}
              </p>
              <h3 className="mt-1 text-[17px] leading-tight text-ink">{pergunta.titulo}</h3>
              <p className="mt-0.5 text-[12px] text-mist">{pergunta.apoio}</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {pergunta.opcoes.map(({ valor, titulo, apoio, icone: Icone }) => {
                const marcado = (respostas as Record<string, string>)[pergunta.chave] === valor;

                return (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => responder(pergunta.chave, valor)}
                    className={`focus-ring group flex min-h-[62px] items-center gap-3 rounded-xl border p-3 text-left transition-all active:scale-[0.99] ${
                      marcado
                        ? "border-accent bg-accent/[0.1] ring-2 ring-accent/20"
                        : "border-fg/[0.08] bg-fg/[0.02] hover:border-accent/40 hover:bg-accent/[0.05]"
                    }`}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/[0.12] text-accent-soft ring-1 ring-inset ring-accent/20 transition-transform group-hover:scale-105">
                      <Icone size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13.5px] leading-tight text-ink">{titulo}</span>
                      <span className="mt-0.5 block text-[11.5px] leading-snug text-mist">{apoio}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center justify-between gap-3">
          {passo > 0 ? (
            <button type="button" onClick={voltar} className="flex items-center gap-1.5 text-[11.5px] text-mist transition-colors hover:text-ink">
              <ArrowLeft size={12} />
              Pergunta anterior
            </button>
          ) : (
            <span />
          )}

          {onComparar && (
            <button type="button" onClick={onComparar} className="text-[11.5px] text-accent transition-colors hover:text-accent-soft">
              Prefiro ver todos os planos
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Resultado */
  /* ------------------------------------------------------------------ */

  if (carregando) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-14 text-[13px] text-mist">
        <Loader2 size={18} className="animate-spin text-accent" />
        Montando o plano certo para você...
      </div>
    );
  }

  if (erro || !recomendacao) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-[13px] text-danger">{erro || "Não foi possível recomendar um plano."}</p>
        <button type="button" onClick={refazer} className="flex items-center gap-1.5 rounded-lg border border-fg/[0.12] px-3 py-2 text-[12.5px] text-ink transition hover:border-fg/[0.24]">
          <RefreshCw size={13} />
          Tentar de novo
        </button>
      </div>
    );
  }

  const { plano, alternativo, motivos } = recomendacao;

  return (
    <motion.div
      initial={reduzir ? undefined : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 0.61, 0.36, 1] }}
      className="flex flex-col gap-3"
    >
      <div>
        <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[1.4px] text-accent-soft">
          <Sparkles size={11} />
          Seu plano
        </p>
        {/* A chamada vem do banco e é escrita para o perfil, não para o
            produto: é ela que faz a pessoa se reconhecer antes de ver preço. */}
        <h3 className="mt-1 text-[17px] leading-tight text-ink">{plano.chamada ?? plano.descricao}</h3>
      </div>

      <CartaoPlano plano={plano} marcado={selecionado === plano.codigo} destaque onEscolher={() => onSelecionar(plano.codigo)} />

      {motivos.length > 0 && (
        <ul className="flex flex-col gap-1.5 rounded-xl border border-fg/[0.07] bg-fg/[0.02] p-3">
          {motivos.map((motivo) => (
            <li key={motivo} className="flex items-start gap-2 text-[12px] leading-relaxed text-mist">
              <Check size={12} className="mt-[3px] shrink-0 text-accent-soft" />
              {motivo}
            </li>
          ))}
        </ul>
      )}

      {/* A saída para quem não confia numa recomendação só. Fechada por
          padrão de propósito: aberta, vira de novo a vitrine que o
          diagnóstico existe para substituir. */}
      {alternativo && (
        <div>
          <button
            type="button"
            onClick={() => setVerAlternativo((v) => !v)}
            className="flex items-center gap-1.5 text-[11.5px] text-accent transition-colors hover:text-accent-soft"
          >
            <ChevronDown size={13} className={`transition-transform ${verAlternativo ? "rotate-180" : ""}`} />
            {verAlternativo ? "Esconder outras opções" : "Ver outras opções"}
          </button>

          <AnimatePresence initial={false}>
            {verAlternativo && (
              <motion.div
                initial={reduzir ? undefined : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="pt-3">
                  <CartaoPlano plano={alternativo} marcado={selecionado === alternativo.codigo} onEscolher={() => onSelecionar(alternativo.codigo)} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={refazer} className="flex items-center gap-1.5 text-[11.5px] text-mist transition-colors hover:text-ink">
          <RefreshCw size={12} />
          Refazer as perguntas
        </button>

        {onComparar && (
          <button type="button" onClick={onComparar} className="text-[11.5px] text-accent transition-colors hover:text-accent-soft">
            Comparar todos
          </button>
        )}
      </div>
    </motion.div>
  );
};

/* ------------------------------------------------------------------ */
/* Cartão de plano */
/* ------------------------------------------------------------------ */

/**
 * As linhas de limite que entram no cartão.
 *
 * `pedidosMes` é a primeira porque é a única que a pessoa sente todo mês —
 * teto de cadastro se descobre uma vez, teto de venda se descobre sempre.
 * Atendentes só aparece quando o plano tem CRM: linha sobre um módulo que
 * não vem junto é ruído.
 */
const limitesDoPlano = (p: Plano): string[] => {
  const linhas = [
    `${formatarLimite(p.limitePedidosMes)} vendas por mês`,
    `${formatarLimite(p.limiteUsuarios)} ${p.limiteUsuarios === 1 ? "usuário" : "usuários"}`,
    `${formatarLimite(p.limiteClientes)} clientes`,
    `${formatarLimite(p.limiteProdutos)} produtos`,
  ];

  if (p.recursos?.crm === true) {
    linhas.splice(2, 0, `${formatarLimite(p.limiteAtendentes)} ${p.limiteAtendentes === 1 ? "atendente" : "atendentes"} no CRM`);
  }

  return linhas;
};

/** Só os módulos que o plano TEM. Riscar o que falta é vender o concorrente. */
const recursosDoPlano = (p: Plano): string[] =>
  Object.keys(RECURSO_LABEL)
    .filter((chave) => p.recursos?.[chave] === true)
    .map((chave) => RECURSO_LABEL[chave]);

const CartaoPlano = ({
  plano, marcado, destaque, onEscolher,
}: { plano: Plano; marcado: boolean; destaque?: boolean; onEscolher: () => void }) => (

  <button
    type="button"
    onClick={onEscolher}
    className={`relative flex w-full flex-col rounded-2xl border p-4 text-left transition-all active:scale-[0.995] ${
      marcado
        ? "border-accent bg-gradient-to-b from-accent/[0.12] to-fg/[0.02] shadow-[0_20px_50px_-28px_rgb(var(--accent))] ring-2 ring-accent/25"
        : "border-fg/[0.1] bg-fg/[0.02] hover:border-accent/40"
    }`}
  >
    {marcado && (
      <span className="absolute -top-2.5 left-6 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-[10px] text-white shadow-[0_6px_16px_-4px_rgb(var(--accent))]">
        <Check size={11} />
        Escolhido
      </span>
    )}

    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h4 className="text-[17px] leading-tight text-ink">{plano.nome}</h4>
        {plano.publicoAlvo && <p className="mt-0.5 text-[11px] text-faint">{plano.publicoAlvo}</p>}
      </div>

      <p className="flex shrink-0 items-baseline gap-1">
        <span className="text-[24px] leading-none tracking-tight text-ink">
          {formatCurrencyFromCents(plano.precoCentavos)}
        </span>
        <span className="text-[11px] text-faint">{CICLO_LABEL[plano.ciclo]}</span>
      </p>
    </div>

    <p className="mt-2 text-[12px] font-light leading-relaxed text-mist">{plano.descricao}</p>

    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-fg/[0.06] pt-3">
      {limitesDoPlano(plano).map((linha) => (
        <span key={linha} className="rounded-md bg-fg/[0.05] px-2 py-1 text-[11px] text-ink">
          {linha}
        </span>
      ))}
    </div>

    {/* No plano recomendado a lista inteira aparece — é o que justifica o
        preço logo acima. No alternativo ela ficaria competindo com ela
        mesma, então lá entram só os seis primeiros. */}
    <ul className="mt-3 grid gap-1 sm:grid-cols-2">
      {recursosDoPlano(plano).slice(0, destaque ? 99 : 6).map((rotulo) => (
        <li key={rotulo} className="flex items-start gap-1.5 text-[11.5px] text-mist">
          <Check size={11} className="mt-[3px] shrink-0 text-accent-soft" />
          {rotulo}
        </li>
      ))}
    </ul>
  </button>
);

export default DiagnosticoPlano;
