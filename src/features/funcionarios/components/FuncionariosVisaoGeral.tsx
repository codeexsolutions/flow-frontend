import { useMemo } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Briefcase, Cake, ChevronRight, Clock, Percent, ShieldCheck, UserCog, Users, Wallet } from "lucide-react";

import type { Equipe, Funcionario } from "@/shared/domain/funcionario";
import { Ranking } from "@/features/dashboard/components/graficos";
import { diaAniversario, ehAniversarianteDoMes, ehAniversarioHoje } from "@/features/clientes/utils/aniversario";
import { formatCurrency } from "@/shared/utils/currency";
import { formatNumber, getInitials } from "@/shared/utils/format";

/**
 * A visão geral da equipe — a aba de cima da tabela, como em Estoque e Clientes.
 *
 * Os quatro números que moravam numa faixa acima da tabela vieram para cá e
 * ganharam companhia: quanto custa a folha fixa, como o acesso ao sistema se
 * divide, em que cargo está a gente, quem faz aniversário e — o que mais
 * importa — o cadastro que está pela metade e vai dar problema no fim do mês.
 *
 * Fala de QUEM TRABALHA AQUI. Desligado entra só na contagem total: o salário
 * dele não está na folha, o login não usa vaga e a jornada não vale mais.
 */

const TONS = {
  accent: "bg-accent/[0.15] text-accent-soft ring-accent/20",
  success: "bg-success/15 text-success ring-success/20",
  warning: "bg-warning/15 text-warning ring-warning/20",
  danger: "bg-danger/15 text-danger ring-danger/20",
} as const;

const Numero = ({ icon, label, valor, hint, tom = "accent" }: { icon: ReactNode; label: string; valor: string; hint?: string; tom?: keyof typeof TONS }) => (
  <div className="card glass-sheen hud-cantos relative overflow-hidden p-4">
    <div className={`mb-2.5 flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset ${TONS[tom]}`}>{icon}</div>
    <p className="truncate text-[12px] text-mist">{label}</p>
    <p className="nums mt-1 truncate text-[20px] tracking-tight text-ink">{valor}</p>
    {hint && <p className="mt-0.5 truncate text-[11px] text-faint">{hint}</p>}
  </div>
);

const Painel = ({ titulo, subtitulo, icon, children, className = "" }: { titulo: string; subtitulo?: string; icon: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`card glass-sheen hud-cantos relative flex min-w-0 flex-col overflow-hidden ${className}`}>
    <header className="flex items-center gap-2.5 border-b border-fg/[0.07] px-4 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/[0.14] text-accent-soft ring-1 ring-inset ring-accent/20">{icon}</span>
      <span className="min-w-0">
        <h3 className="truncate text-[13.5px] leading-none text-ink">{titulo}</h3>
        {subtitulo && <p className="mt-1 truncate text-[11.5px] text-faint">{subtitulo}</p>}
      </span>
    </header>
    <div className="hud-grade min-h-0 flex-1">{children}</div>
  </section>
);

const Vazio = ({ children }: { children: ReactNode }) => <p className="px-4 py-8 text-center text-[12.5px] text-faint">{children}</p>;

/* O acesso ao sistema, nas mesmas quatro leituras do selo da lista. */
type NivelAcesso = "master" | "admin" | "vendedor" | "sem";

const ACESSO: Record<NivelAcesso, { nome: string; cor: string }> = {
  master: { nome: "Master", cor: "rgb(var(--accent))" },
  admin: { nome: "Administradores", cor: "rgb(var(--accent) / 0.55)" },
  vendedor: { nome: "Vendedores", cor: "rgb(var(--success))" },
  sem: { nome: "Sem acesso", cor: "rgb(var(--fg) / 0.28)" },
};

const ORDEM_ACESSO: NivelAcesso[] = ["master", "admin", "vendedor", "sem"];

const nivelAcesso = (f: Funcionario): NivelAcesso => {
  if (!f.acesso) return "sem";
  if (f.acesso.root) return "master";
  return f.acesso.permissao === "ADMIN" ? "admin" : "vendedor";
};

type Pendencia = { f: Funcionario; motivo: string };

type Props = { equipe: Equipe };

const FuncionariosVisaoGeral = ({ equipe }: Props) => {
  const navigate = useNavigate();

  const d = useMemo(() => {
    const todos = equipe.funcionarios;
    const ativos = todos.filter((f) => f.ativo);

    const porAcesso = Object.fromEntries(ORDEM_ACESSO.map((n) => [n, 0])) as Record<NivelAcesso, number>;
    ativos.forEach((f) => (porAcesso[nivelAcesso(f)] += 1));

    /* A folha FIXA: só salário. A comissão depende do que cada um vender no
       mês e ainda não é calculada — somá-la daria um total falso (mesma regra
       da ficha do funcionário). */
    const folha = ativos.reduce((a, f) => a + (f.salario ?? 0), 0);
    const semSalario = ativos.filter((f) => f.salario == null).length;

    const comissionados = ativos.filter((f) => f.ganhaComissao);
    const comPercentual = comissionados.filter((f) => f.comissaoPercentual != null);
    const mediaComissao = comPercentual.length ? comPercentual.reduce((a, f) => a + (f.comissaoPercentual ?? 0), 0) / comPercentual.length : 0;

    const batem = ativos.filter((f) => f.batePonto);

    /* Cargo em branco vira um grupo próprio, e não some: é justamente o
       cadastro que alguém precisa completar. */
    const porCargo = new Map<string, number>();
    ativos.forEach((f) => {
      const cargo = f.cargo.trim() || "Sem cargo";
      porCargo.set(cargo, (porCargo.get(cargo) ?? 0) + 1);
    });

    /*
     * O que vai dar problema — cada item é uma pessoa e um motivo.
     *
     * Ponto sem horário é o mais grave (o registro do dia não tem jornada com
     * que comparar), depois comissão sem percentual (o fechamento do mês não
     * tem como calcular) e por fim o salário em branco (o recibo sai vazio).
     */
    const pendencias: Pendencia[] = [
      ...batem.filter((f) => f.jornada.length === 0).map((f) => ({ f, motivo: "Bate ponto sem horário definido" })),
      ...comissionados.filter((f) => f.comissaoPercentual == null).map((f) => ({ f, motivo: "Comissão sem percentual" })),
      ...ativos.filter((f) => f.salario == null).map((f) => ({ f, motivo: "Salário não informado" })),
    ];

    const aniversariantes = ativos
      .filter((f) => ehAniversarianteDoMes(f.dataNascimento))
      .sort((a, b) => (diaAniversario(a.dataNascimento) ?? 0) - (diaAniversario(b.dataNascimento) ?? 0));

    return {
      total: todos.length,
      ativos: ativos.length,
      desligados: todos.length - ativos.length,
      porAcesso,
      comAcesso: ativos.length - porAcesso.sem,
      folha,
      semSalario,
      comissionados: comissionados.length,
      mediaComissao,
      batem: batem.length,
      semJornada: batem.filter((f) => f.jornada.length === 0).length,
      cargos: [...porCargo.entries()].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor).slice(0, 8),
      pendencias,
      aniversariantes,
    };
  }, [equipe]);

  /* As vagas do plano contam LOGINS, não pessoas — ver `Equipe.usados`. */
  const vagas = equipe.limiteUsuarios == null ? `${formatNumber(equipe.usados)} logins · ilimitado` : `${formatNumber(equipe.usados)} de ${formatNumber(equipe.limiteUsuarios)} logins do plano`;

  return (
    <div className="flex flex-col gap-3">
      {/* Os números */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <Numero
          icon={<Users size={16} />}
          label="Equipe"
          valor={formatNumber(d.total)}
          hint={d.desligados > 0 ? `${formatNumber(d.ativos)} trabalhando · ${formatNumber(d.desligados)} desligados` : `${formatNumber(d.ativos)} trabalhando`}
          tom={d.total > 0 && d.ativos === 0 ? "danger" : "accent"}
        />
        <Numero icon={<ShieldCheck size={16} />} label="Com acesso" valor={formatNumber(d.comAcesso)} hint={vagas} />
        <Numero
          icon={<Wallet size={16} />}
          label="Folha fixa"
          valor={formatCurrency(d.folha)}
          hint={d.semSalario > 0 ? `${formatNumber(d.semSalario)} sem salário informado` : "Salários de quem trabalha"}
          tom={d.semSalario > 0 ? "warning" : "success"}
        />
        <Numero
          icon={<Percent size={16} />}
          label="Comissionados"
          valor={formatNumber(d.comissionados)}
          hint={d.comissionados > 0 ? `Média de ${formatNumber(Math.round(d.mediaComissao * 10) / 10)}%` : "Ninguém recebe comissão"}
        />
        <Numero
          icon={<Clock size={16} />}
          label="Batem ponto"
          valor={formatNumber(d.batem)}
          hint={d.semJornada > 0 ? `${formatNumber(d.semJornada)} sem horário definido` : "Todos com horário"}
          tom={d.semJornada > 0 ? "warning" : "accent"}
        />
        <Numero
          icon={<AlertTriangle size={16} />}
          label="Cadastros pendentes"
          valor={formatNumber(d.pendencias.length)}
          hint={d.pendencias.length > 0 ? "Veja a lista abaixo" : "Tudo em dia"}
          tom={d.pendencias.length > 0 ? "warning" : "success"}
        />
      </div>

      {/* Acesso e cargos */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Painel titulo="Acesso ao sistema" subtitulo={vagas} icon={<ShieldCheck size={15} />}>
          {d.ativos === 0 ? (
            <Vazio>Ninguém trabalhando na equipe ainda.</Vazio>
          ) : (
            <div className="flex flex-col gap-4 px-4 py-5">
              {/* Uma barra só, dividida pelo nível: as partes somam a equipe, e
                  a proporção é o que se quer ver de relance. */}
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-fg/[0.06]" role="img" aria-label="Divisão da equipe por acesso ao sistema">
                {ORDEM_ACESSO.filter((n) => d.porAcesso[n] > 0).map((n) => (
                  <span
                    key={n}
                    title={`${ACESSO[n].nome}: ${d.porAcesso[n]}`}
                    className="h-full border-r-2 border-surface transition-[width] duration-700 last:border-r-0"
                    style={{ width: `${(d.porAcesso[n] / d.ativos) * 100}%`, background: ACESSO[n].cor }}
                  />
                ))}
              </div>

              <ul className="grid grid-cols-2 gap-2">
                {ORDEM_ACESSO.map((n) => (
                  <li key={n} className="flex items-center gap-2.5 rounded-xl border border-fg/[0.07] bg-fg/[0.025] px-3 py-2.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ACESSO[n].cor }} />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-mist">{ACESSO[n].nome}</span>
                    <span className="nums text-[14px] text-ink">{formatNumber(d.porAcesso[n])}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Painel>

        <Painel titulo="Por cargo" subtitulo="Quantas pessoas em cada função" icon={<Briefcase size={15} />}>
          {d.cargos.length === 0 ? (
            <Vazio>Ninguém trabalhando na equipe ainda.</Vazio>
          ) : (
            <Ranking itens={d.cargos} formatar={(n) => `${formatNumber(n)} ${n === 1 ? "pessoa" : "pessoas"}`} />
          )}
        </Painel>
      </div>

      {/* O que fazer e quem comemorar */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Painel titulo="Cadastros pendentes" subtitulo="O que falta para o ponto e a folha fecharem certo" icon={<AlertTriangle size={15} />}>
          {d.pendencias.length === 0 ? (
            <Vazio>Nenhuma pendência. Todo mundo com horário, salário e comissão definidos. 👌</Vazio>
          ) : (
            <ul className="flex max-h-[320px] flex-col overflow-y-auto">
              {d.pendencias.map(({ f, motivo }) => (
                <li key={`${f.id}-${motivo}`}>
                  <button
                    type="button"
                    onClick={() => navigate(`/funcionarios/${f.id}`)}
                    className="focus-ring flex w-full cursor-pointer items-center gap-3 border-b border-fg/[0.04] px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-fg/[0.03]"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-warning/25 bg-warning/15 text-[10px] text-warning">{getInitials(f.nome)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] text-ink">{f.nome}</span>
                      <span className="block truncate text-[11px] text-warning">{motivo}</span>
                    </span>
                    <ChevronRight size={14} className="shrink-0 text-muted" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Painel>

        <Painel
          titulo="Aniversariantes do mês"
          subtitulo={d.aniversariantes.length > 0 ? `${d.aniversariantes.length} ${d.aniversariantes.length === 1 ? "pessoa" : "pessoas"}` : undefined}
          icon={<Cake size={15} />}
        >
          {d.aniversariantes.length === 0 ? (
            <Vazio>Ninguém da equipe faz aniversário este mês — ou a data de nascimento ainda não foi preenchida.</Vazio>
          ) : (
            <ul className="flex max-h-[320px] flex-col overflow-y-auto">
              {d.aniversariantes.map((f) => {
                const hoje = ehAniversarioHoje(f.dataNascimento);

                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/funcionarios/${f.id}`)}
                      className="focus-ring flex w-full cursor-pointer items-center gap-3 border-b border-fg/[0.04] px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-fg/[0.03]"
                    >
                      {/* O dia vem primeiro, em caixa própria: é o dado que decide a ação. */}
                      <span className={`nums flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[12px] ring-1 ring-inset ${hoje ? "bg-accent text-white ring-accent" : "bg-accent/[0.12] text-accent-soft ring-accent/20"}`}>
                        {diaAniversario(f.dataNascimento)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] text-ink">{f.nome}</span>
                        <span className="block truncate text-[11px] text-faint">{hoje ? "Hoje! 🎉" : f.cargo || "Sem cargo"}</span>
                      </span>
                      <UserCog size={14} className="shrink-0 text-muted" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Painel>
      </div>
    </div>
  );
};

export default FuncionariosVisaoGeral;
