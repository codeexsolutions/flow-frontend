import { useState } from "react";

import { PERIODO_TUDO, periodoDeHoje, periodoDoMes, type Periodo } from "@/shared/ui/SeletorPeriodo";

/**
 * O período de uma tela, lembrado entre uma visita e outra.
 *
 * Quem deixa o painel no mês corrente e vai cadastrar uma venda espera voltar
 * e encontrar o mesmo recorte — não "Todo o período" de novo.
 *
 * O que se guarda é o QUE a pessoa escolheu, não as datas: o mês corrente
 * termina "hoje" (ver `periodoDoMes`), então datas congeladas fariam o painel
 * de amanhã parar no dia de ontem. Por isso:
 *  - "Hoje" volta como o hoje de quando a tela abre;
 *  - o mês corrente volta como o mês corrente — virou o mês, vira junto;
 *  - um mês passado volta como aquele mês;
 *  - um intervalo digitado volta com as mesmas datas.
 *
 * `localStorage` pode lançar (aba anônima, iframe): aí a tela só não lembra.
 */
type Salvo =
  | { tipo: "tudo" }
  | { tipo: "hoje" }
  | { tipo: "mes"; ano: number; mes: number; atual: boolean }
  | { tipo: "intervalo"; de: string; ate: string; rotulo: string };

const mesmoMes = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

const paraSalvo = (p: Periodo): Salvo => {
  if (!p.de || !p.ate) return { tipo: "tudo" };
  if (p.rotulo === periodoDeHoje().rotulo) return { tipo: "hoje" };

  if (p.de.getDate() === 1 && p.rotulo === periodoDoMes(p.de).rotulo) {
    return { tipo: "mes", ano: p.de.getFullYear(), mes: p.de.getMonth(), atual: mesmoMes(p.de, new Date()) };
  }

  return { tipo: "intervalo", de: p.de.toISOString(), ate: p.ate.toISOString(), rotulo: p.rotulo };
};

const doSalvo = (s: Salvo): Periodo | null => {
  switch (s.tipo) {
    case "tudo":
      return PERIODO_TUDO;
    case "hoje":
      return periodoDeHoje();
    case "mes":
      return periodoDoMes(s.atual ? new Date() : new Date(s.ano, s.mes, 1));
    case "intervalo": {
      const de = new Date(s.de);
      const ate = new Date(s.ate);

      return isNaN(de.getTime()) || isNaN(ate.getTime()) ? null : { de, ate, rotulo: s.rotulo };
    }
    default:
      return null;
  }
};

const ler = (chave: string): Periodo | null => {
  try {
    const bruto = localStorage.getItem(chave);

    return bruto ? doSalvo(JSON.parse(bruto) as Salvo) : null;
  } catch {
    return null;
  }
};

export function usePeriodoSalvo(chave: string, inicial: Periodo = PERIODO_TUDO) {
  const [periodo, setPeriodoState] = useState<Periodo>(() => ler(chave) ?? inicial);

  const setPeriodo = (p: Periodo) => {
    setPeriodoState(p);

    try {
      localStorage.setItem(chave, JSON.stringify(paraSalvo(p)));
    } catch {
      /* Sem storage a tela só não lembra da escolha. */
    }
  };

  return [periodo, setPeriodo] as const;
}
