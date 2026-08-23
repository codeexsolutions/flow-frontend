import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, CalendarDays, CircleAlert, Loader2 } from "lucide-react";

import PontoService, { type DiaDePonto, type ExtratoPonto } from "@/features/ponto/services/ponto.service";

/**
 * Os horários do próprio funcionário, abertos com o CPF.
 *
 * ---------------------------------------------------------------------------
 * Por que esta tela existe
 * ---------------------------------------------------------------------------
 * Quem bate o ponto via só a confirmação da batida que acabou de fazer. Para
 * saber a que horas entrou na terça, ou quanto trabalhou na semana, tinha de
 * perguntar ao gestor — que abre o painel e lê em voz alta. É a informação mais
 * conferida por quem bate ponto e a única a que só a outra parte tinha acesso.
 *
 * ---------------------------------------------------------------------------
 * O que ela não mostra, e não é esquecimento
 * ---------------------------------------------------------------------------
 * Foto e localização. As duas existem como PROVA para o gestor, e prova só
 * serve a quem audita. Aqui, atrás de um CPF que qualquer colega sabe de cor,
 * elas entregariam a selfie e o rastro de quem trabalha ao lado. O servidor
 * também não as devolve — a tela não filtra nada; ela recebe só horário.
 *
 * ---------------------------------------------------------------------------
 * As horas vêm calculadas do servidor
 * ---------------------------------------------------------------------------
 * Somar aqui criaria uma terceira versão da verdade: a que a pessoa vê
 * primeiro, e leva para a conversa sobre o holerite. O número tem de ser o
 * mesmo aqui, no painel do gestor e no fechamento do mês.
 */

const ROTULO: Record<DiaDePonto["batidas"][number]["tipo"], string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saída",
  INTERVALO_INICIO: "Saída p/ intervalo",
  INTERVALO_FIM: "Volta do intervalo",
};

/** `ENTRADA` e `INTERVALO_FIM` abrem o relógio — a mesma regra do servidor. */
const ABRE = ["ENTRADA", "INTERVALO_FIM"];

/** 505 → "8h 25min". Zero vira "—": um "0h 00min" parece defeito. */
const emHoras = (minutos: number): string => {
  if (!minutos) return "—";

  const h = Math.floor(minutos / 60);
  const m = minutos % 60;

  return h ? `${h}h${m ? ` ${String(m).padStart(2, "0")}min` : ""}` : `${m}min`;
};

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/**
 * "Hoje", "Ontem" ou "seg, 24/08".
 *
 * A data crua obriga a conta de cabeça para responder "isto é de hoje?", que é
 * a primeira pergunta de quem abre o extrato.
 */
const rotuloDoDia = (dia: string): string => {
  const [ano, mes, d] = dia.split("-").map(Number);
  const data = new Date(ano, mes - 1, d);

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const diferenca = Math.round((hoje.getTime() - data.getTime()) / 86400000);

  if (diferenca === 0) return "Hoje";
  if (diferenca === 1) return "Ontem";

  return data.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
};

type Props = {
  token: string;
  cpf: string;
  onVoltar: () => void;
};

const MeusHorarios = ({ token, cpf, onVoltar }: Props) => {
  const [extrato, setExtrato] = useState<ExtratoPonto | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;

    PontoService.meusPontos(token, cpf).then((r) => {
      if (!vivo) return;

      setExtrato(r);
      setCarregando(false);
    });

    return () => {
      vivo = false;
    };
  }, [token, cpf]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center bg-canvas px-5 py-8">
      <div className="flex w-full max-w-sm flex-col gap-5">

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onVoltar}
            aria-label="Voltar"
            className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-fg/[0.1] text-mist transition-colors hover:text-ink"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="min-w-0">
            <p className="text-[17px] leading-tight text-ink">Meus horários</p>
            {extrato && <p className="truncate text-[12.5px] text-mist">{extrato.nome}</p>}
          </div>
        </div>

        {carregando ? (
          <div className="flex items-center justify-center gap-2 py-16 text-mist">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-[13px]">Buscando…</span>
          </div>
        ) : !extrato || extrato.dias.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-fg/[0.05] text-faint">
              <CalendarDays size={22} />
            </span>
            <p className="text-[14px] text-ink">Nenhuma batida ainda</p>
            <p className="max-w-[16rem] text-[12.5px] leading-relaxed text-faint">
              Assim que você bater o primeiro ponto, ele aparece aqui — com o horário e o total do dia.
            </p>
          </div>
        ) : (
          <>
            {/* O total do período, no topo: é o número que a pessoa abriu o
                extrato para ver. Enterrá-lo no fim da lista obrigaria a rolar
                por trinta dias para chegar na resposta. */}
            <div className="rounded-2xl border border-fg/[0.07] bg-fg/[0.02] px-4 py-3.5">
              <p className="text-[10px] uppercase tracking-[0.7px] text-faint">Total do período</p>
              <p className="nums mt-0.5 text-[26px] leading-none tracking-tight text-ink">
                {emHoras(extrato.minutosTotal)}
              </p>
              <p className="mt-1 text-[11.5px] text-faint">
                {extrato.dias.length} {extrato.dias.length === 1 ? "dia trabalhado" : "dias trabalhados"} · últimos 45 dias
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              {extrato.dias.map((d, i) => (
                <motion.div
                  key={d.dia}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: Math.min(i * 0.03, 0.25) }}
                  className="rounded-2xl border border-fg/[0.07] px-4 py-3"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[13.5px] capitalize text-ink">{rotuloDoDia(d.dia)}</p>

                    <p className="nums text-[13.5px] text-mist">{emHoras(d.minutos)}</p>
                  </div>

                  <div className="mt-2 flex flex-col gap-1">
                    {d.batidas.map((b, n) => (
                      <div key={n} className="flex items-baseline justify-between gap-2 text-[12px]">
                        <span className="flex items-center gap-1.5 text-faint">
                          {/* Bolinha cheia abre o expediente, vazia fecha: dá
                              para ler a coluna sem ler as palavras. */}
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              ABRE.includes(b.tipo) ? "bg-success" : "border border-fg/25"
                            }`}
                          />
                          {ROTULO[b.tipo]}
                        </span>
                        <span className="nums text-mist">{hora(b.momento)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Dia com par em aberto: o total NÃO é estimado.
                      Inventar o fechamento produziria um número que ninguém
                      consegue conferir e que entraria numa conversa sobre
                      salário como se fosse fato. */}
                  {d.aberto && (
                    <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-warning">
                      <CircleAlert size={12} className="shrink-0" />
                      Falta a saída deste dia — o total não conta este período.
                    </p>
                  )}
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MeusHorarios;
