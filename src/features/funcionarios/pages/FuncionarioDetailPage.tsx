import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Pencil, Loader2, AlertTriangle, RotateCw, Wallet, Percent,
  Clock, IdCard, Cake, Briefcase, ShieldCheck, Crown, MapPin, Camera,
  UserCog, CalendarDays, Receipt,
} from "lucide-react";

import { PageScreen } from "@/shared/ui/PageShell";
import { Modal } from "@/shared/ui/Modal";
import { Selo } from "@/shared/ui/StatusBadge";
import { ListaCabecalho } from "@/shared/ui/DataTable";
import { formatCurrency } from "@/shared/utils/currency";
import { formatNumber, EMPTY } from "@/shared/utils/format";
import { maskCpfCnpj } from "@/shared/validation/masks";
import FuncionarioService from "@/features/funcionarios/services/funcionario.service";
import FuncionarioForm from "@/features/funcionarios/components/FuncionarioForm";
import ReciboSalarioModal from "@/features/funcionarios/components/ReciboSalarioModal";
import { PONTO_LABEL, type Equipe, type Funcionario, type PontoRegistro } from "@/shared/domain/funcionario";
import { StatCard, Dado, Cartao } from "@/shared/ui/Ficha";

/**
 * A página do funcionário — tudo o que existe sobre uma pessoa, num lugar só.
 *
 * ---------------------------------------------------------------------------
 * Por que uma PÁGINA, e não o modal de edição
 * ---------------------------------------------------------------------------
 * O modal cabia quando funcionário era "nome, e-mail e senha". Não cabe mais:
 * a ficha, o salário, a comissão, o acesso e o extrato de ponto são cinco
 * blocos que se leem JUNTOS — "esta pessoa faltou três dias e ganha por
 * comissão" é uma frase só, e ela não se forma se cada metade estiver numa
 * aba diferente.
 *
 * Página também significa ENDEREÇO: `/funcionarios/<id>` pode ser mandado no
 * WhatsApp para o contador e aberto de volta pelo histórico. Um modal não tem
 * nada disso.
 *
 * A edição dos campos continua em modal, e continua sendo o MESMO formulário
 * do cadastro — dois formulários para a mesma coisa divergiriam no primeiro
 * campo novo.
 */

/* -------------------------------------------------------------------------- */
/* Peças                                                                      */
/* -------------------------------------------------------------------------- */




/*
 * O extrato de ponto é uma TABELA, e não uma lista de frases.
 *
 * Cada batida tem quatro dados — o que foi, a que horas, a que distância da
 * loja e a prova — e eles estavam soltos numa fileira flex, sem rótulo em
 * lugar nenhum: descobrir que "180 m" era distância exigia adivinhar. Em
 * colunas fixas, o número da terceira coluna é sempre a mesma coisa, e a
 * fileira de rótulos (a mesma peça das outras tabelas do sistema) escreve o
 * que ela é uma vez só, no topo.
 */
const COLS_PONTO = "grid-cols-[minmax(0,1fr)_64px_74px_40px]";
const ROTULOS_PONTO = ["Batida", "Hora", "Distância", "Foto"];

/** As batidas de um dia, agrupadas — é assim que uma folha de ponto se lê. */
type Dia = { data: string; registros: PontoRegistro[] };

const agruparPorDia = (pontos: PontoRegistro[]): Dia[] => {
  const mapa = new Map<string, PontoRegistro[]>();

  for (const p of pontos) {
    const dia = new Date(p.momento).toLocaleDateString("pt-BR");
    mapa.set(dia, [...(mapa.get(dia) ?? []), p]);
  }

  /* Dentro do dia, da primeira para a última: o extrato vem do servidor em
     ordem decrescente (o mais recente primeiro), que é a ordem certa para a
     LISTA de dias e a errada para as batidas dentro de um. */
  return [...mapa.entries()].map(([data, registros]) => ({
    data,
    registros: [...registros].sort((a, b) => +new Date(a.momento) - +new Date(b.momento)),
  }));
};

/* -------------------------------------------------------------------------- */
/* Página                                                                     */
/* -------------------------------------------------------------------------- */

const FuncionarioDetalhe = () => {
  const { funcionarioId } = useParams();
  const navigate = useNavigate();

  const [equipe, setEquipe] = useState<Equipe | null>(null);
  const [pontos, setPontos] = useState<PontoRegistro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState(false);
  const [recibo, setRecibo] = useState(false);
  const [foto, setFoto] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!funcionarioId) return;

    setErro("");

    try {
      /* As duas juntas: a lista traz a pessoa e o catálogo de áreas (que o
         formulário de edição precisa), e o extrato vem à parte porque tem
         limite próprio. Em série seriam duas esperas antes do primeiro pixel. */
      const [nova, registros] = await Promise.all([
        FuncionarioService.listar(),
        FuncionarioService.ponto(funcionarioId, 200).catch(() => [] as PontoRegistro[]),
      ]);

      setEquipe(nova);
      setPontos(registros);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [funcionarioId]);

  useEffect(() => {
    setCarregando(true);
    void carregar();
  }, [carregar]);

  const funcionario: Funcionario | undefined = useMemo(
    () => equipe?.funcionarios.find((f) => f.id === funcionarioId),
    [equipe, funcionarioId],
  );

  const dias = useMemo(() => agruparPorDia(pontos), [pontos]);

  /**
   * O custo mensal desta pessoa, hoje.
   *
   * Só o salário: a comissão depende do que ela vender no mês e ainda não é
   * calculada (ver a nota do rodapé). Somar um número que não existe daria um
   * total falso — e total falso numa tela de folha é pior do que total nenhum.
   */
  const custo = funcionario?.salario ?? null;

  if (carregando) {
    return (
      <PageScreen title="Funcionário" icon={<UserCog className="h-5 w-5" />}>
        <div className="flex flex-1 items-center justify-center text-faint">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </PageScreen>
    );
  }

  if (erro || !funcionario) {
    return (
      <PageScreen title="Funcionário" icon={<UserCog className="h-5 w-5" />}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <AlertTriangle className="h-6 w-6 text-danger" />
          <p className="text-[13px] text-mist">{erro || "Funcionário não encontrado."}</p>
          <div className="flex gap-2">
            <button onClick={() => void carregar()} className="focus-ring inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-fg/[0.1] px-3 py-2 text-[12.5px] text-mist hover:text-ink">
              <RotateCw className="h-3.5 w-3.5" /> Tentar novamente
            </button>
            <button onClick={() => navigate("/funcionarios")} className="focus-ring cursor-pointer rounded-lg bg-accent px-3 py-2 text-[12.5px] text-white">
              Voltar à equipe
            </button>
          </div>
        </div>
      </PageScreen>
    );
  }

  const acesso = funcionario.acesso;

  return (
    <PageScreen
      icon={<UserCog className="h-5 w-5" />}
      title={funcionario.nome}
      subtitle={[funcionario.cargo, acesso ? acesso.email : "sem acesso ao sistema"].filter(Boolean).join(" · ")}
      /* O voltar mora no cabeçalho da página, colado no nome — e não numa
         barra própria dentro do corpo, que custava uma faixa inteira de altura
         para um botão que se procura no canto superior esquerdo. */
      onVoltar={() => navigate("/funcionarios")}
      voltarPara="Equipe"
    >
      {/*
       * A tela em duas faixas, e a de baixo come o que sobrar.
       *
       *   1. NÚMEROS — largura inteira, quatro numa fileira. São a régua da
       *      tela e não competem com nada por espaço.
       *   2. FICHA + PONTO — a MESMA grade de quatro colunas: a ficha ocupa
       *      uma, o histórico as outras três. Antes eram duas metades iguais
       *      (`xl:grid-cols-2`), e a ficha — seis linhas curtas — ficava com
       *      metade da tela e um deserto embaixo, enquanto o extrato, que é
       *      onde se trabalha, rolava dentro de 420px.
       *
       * O `min-h-0` em cada nível não é decoração: sem ele o filho de um
       * container flex adota a altura do CONTEÚDO como mínimo, o `overflow`
       * interno nunca entra em ação e a página inteira volta a rolar.
       */}
      <section className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="Salário"
          value={custo == null ? "A informar" : formatCurrency(custo)}
          hint={custo === 0 ? "Só comissão" : custo == null ? "Preencha na edição" : "por mês"}
          tom={custo == null ? "warning" : undefined}
        />

        <StatCard
          icon={<Percent className="h-4 w-4" />}
          label="Comissão"
          value={funcionario.ganhaComissao
            ? (funcionario.comissaoPercentual != null ? `${formatNumber(funcionario.comissaoPercentual)}%` : "A definir")
            : "Não"}
          hint={funcionario.ganhaComissao ? "sobre o que vender" : undefined}
        />

        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Batidas"
          value={formatNumber(pontos.length)}
          hint={funcionario.batePonto ? `em ${formatNumber(dias.length)} ${dias.length === 1 ? "dia" : "dias"}` : "não bate ponto"}
        />

        <StatCard
          icon={acesso?.root ? <Crown className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
          label="Acesso"
          value={!acesso ? "Sem acesso" : acesso.root ? "Master" : acesso.permissao === "ADMIN" ? "Admin" : "Vendedor"}
          hint={acesso ? (acesso.status === "ATIVO" ? "liberado" : "desativado") : "não entra no sistema"}
          tom={acesso && acesso.status !== "ATIVO" ? "danger" : undefined}
        />
      </section>

      <section className="grid min-h-0 grid-cols-1 gap-3 xl:flex-1 xl:grid-cols-4">
        {/* ---------- Ficha ---------- */}
        <Cartao className="flex flex-col xl:min-h-0">
          <div className="flex items-center gap-2.5 border-b border-fg/[0.07] px-3.5 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/[0.14] text-accent-soft ring-1 ring-inset ring-accent/20">
              <IdCard className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[12.5px] text-ink">Ficha</h2>
              <p className="truncate text-[10px] text-faint">
                {funcionario.ativo ? "Trabalha aqui" : "Desligado"} · {funcionario.batePonto ? "bate ponto" : "sem controle de horário"}
              </p>
            </div>
            {!funcionario.ativo && <Selo tom="neutro">Desligado</Selo>}
          </div>

          {/*
           * As duas ações da pessoa ficam NA FAIXA da ficha.
           *
           * Elas moravam numa barra de ações no topo do corpo — uma faixa
           * inteira de altura acima dos números, com o voltar de um lado e
           * dois botões do outro. As duas agem sobre o que este cartão mostra:
           * "Editar" muda estas linhas, e o recibo é montado com o salário
           * que está escrito nelas. Na faixa do cartão, a ação está do lado do
           * dado que ela toca, e a tela começa pelos números.
           */}
          <div className="flex shrink-0 items-center gap-2 border-b border-fg/[0.06] px-3.5 py-2">
            <button
              type="button"
              onClick={() => setRecibo(true)}
              title="Emitir recibo de salário"
              className="focus-ring inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-fg/[0.1] px-2 py-1 text-[11.5px] text-mist transition-colors hover:bg-fg/[0.05] hover:text-ink"
            >
              <Receipt size={12} /> Recibo
            </button>

            <button
              type="button"
              onClick={() => setEditando(true)}
              title="Editar os dados e o acesso"
              className="focus-ring ml-auto inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-fg/[0.1] px-2 py-1 text-[11.5px] text-mist transition-colors hover:bg-fg/[0.05] hover:text-ink"
            >
              <Pencil size={12} /> Editar
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col divide-y divide-fg/[0.04] xl:overflow-y-auto">
            <Dado icon={<IdCard size={13} />} label="CPF" valor={funcionario.cpf ? maskCpfCnpj(funcionario.cpf) : ""} />
            <Dado
              icon={<Cake size={13} />}
              label="Nascimento"
              valor={funcionario.dataNascimento ? new Date(`${funcionario.dataNascimento}T00:00:00`).toLocaleDateString("pt-BR") : ""}
            />
            <Dado icon={<Briefcase size={13} />} label="Cargo" valor={funcionario.cargo} />
            <Dado icon={<Wallet size={13} />} label="Salário" valor={custo == null ? "" : formatCurrency(custo)} />
            <Dado
              icon={<Percent size={13} />}
              label="Comissão"
              valor={funcionario.ganhaComissao
                ? (funcionario.comissaoPercentual != null ? `${formatNumber(funcionario.comissaoPercentual)}% sobre as vendas` : "Sim, percentual a definir")
                : "Não recebe"}
            />
            <Dado icon={<ShieldCheck size={13} />} label="E-mail" valor={acesso?.email} />
          </div>
        </Cartao>

        {/* ---------- Extrato de ponto ---------- */}
        {/* É esta coluna que recebe a sobra de altura: a ficha tem seis linhas
            fixas, o extrato tem duzentas batidas. */}
        <Cartao className="flex min-h-0 flex-col xl:col-span-3">
          <div className="flex shrink-0 items-center gap-2.5 border-b border-fg/[0.07] px-4 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/[0.14] text-accent-soft ring-1 ring-inset ring-accent/20">
              <CalendarDays className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[12.5px] text-ink">Histórico de ponto</h2>
              <p className="truncate text-[10px] text-faint">
                {pontos.length === 0 ? "Nada registrado" : `${formatNumber(pontos.length)} batidas · mais recentes primeiro`}
              </p>
            </div>
          </div>

          {!funcionario.batePonto ? (
            <p className="px-5 py-8 text-center text-[12px] leading-[17px] text-faint">
              Esta pessoa não bate ponto. Ligue a chave na edição para ela passar a registrar pelo link.
            </p>
          ) : dias.length === 0 ? (
            <p className="px-5 py-8 text-center text-[12px] leading-[17px] text-faint">
              Nenhuma batida ainda. Passe o link do ponto para ela — está em Funcionários, no botão “Ponto”.
            </p>
          ) : (
            <>
              {/* Os rótulos, uma vez só no topo — a mesma peça das tabelas de
                  Estoque, Clientes e Vendas. */}
              <ListaCabecalho cols={COLS_PONTO}>
                {ROTULOS_PONTO.map((r, i) => (
                  <p key={r} className={i >= 1 ? "text-right" : undefined}>{r}</p>
                ))}
              </ListaCabecalho>

              <div className="min-h-0 flex-1 overflow-y-auto">
              {dias.map((dia) => (
                <div key={dia.data} className="border-b border-fg/[0.04] last:border-0">
                  <p className="sticky top-0 z-10 bg-surface/85 px-4 py-1.5 text-[10.5px] uppercase tracking-[0.1em] text-faint backdrop-blur">
                    {dia.data}
                  </p>

                  {dia.registros.map((p) => {
                    const quando = new Date(p.momento);
                    const tom = PONTO_LABEL[p.tipo].tom;

                    return (
                      /* Zebra igual à das outras tabelas: numa folha de ponto
                         o olho atravessa a largura para casar a batida da
                         esquerda com a foto da direita, e sem faixa ele
                         escorrega uma linha no caminho. */
                      <div key={p.id} className={`grid ${COLS_PONTO} items-center gap-2.5 px-4 py-2 odd:bg-fg/[0.025]`}>
                        <span className={`min-w-0 truncate text-[12px] ${tom === "entrada" ? "text-success" : tom === "saida" ? "text-warning" : "text-mist"}`}>
                          {PONTO_LABEL[p.tipo].texto}
                        </span>

                        <span className="text-right text-[13px] tabular-nums text-ink">
                          {quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </span>

                        {/* A distância só existe no ponto batido pelo link: o
                            lançado pelo gestor não tem coordenada. */}
                        <span className="flex items-center justify-end gap-1 text-[11px] tabular-nums text-faint">
                          {p.distanciaMetros != null ? (
                            <>
                              <MapPin size={11} /> {formatNumber(p.distanciaMetros)} m
                            </>
                          ) : (
                            EMPTY
                          )}
                        </span>

                        <span className="flex justify-end">
                          {p.fotoUrl ? (
                            <button
                              type="button"
                              onClick={() => setFoto(p.fotoUrl)}
                              title="Ver a foto do momento"
                              className="focus-ring h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-fg/[0.08]"
                            >
                              <img src={p.fotoUrl} alt="" className="h-full w-full object-cover" />
                            </button>
                          ) : (
                            <span title={p.origem === "PUBLICO" ? "Batido pelo link, sem foto" : "Lançado pelo gestor"} className="shrink-0 text-[10.5px] text-faint">
                              {p.origem === "PUBLICO" ? <Camera size={12} /> : EMPTY}
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
              </div>
            </>
          )}
        </Cartao>
      </section>

      {/*
        O que esta tela ainda NÃO faz.
        Fica escrito para ninguém somar de cabeça um número que o sistema não
        calculou — que é o erro que uma tela de folha pela metade provoca.
      */}
      <p className="flex shrink-0 items-start gap-2 rounded-xl border border-fg/[0.07] bg-fg/[0.02] px-4 py-3 text-[11.5px] leading-[16px] text-faint">
        <AlertTriangle size={14} className="mt-px shrink-0" />
        A comissão sobre as vendas do mês e as horas trabalhadas contra a jornada ainda não são calculadas — o salário acima é o valor cadastrado, não o total a pagar.
      </p>

      {/* ---------- Modais ---------- */}
      <Modal
        open={editando}
        onClose={() => setEditando(false)}
        title={funcionario.nome}
        subtitle="Dados e acesso ao sistema"
        size="lg"
        maxWidth="sm:max-w-3xl"
      >
        {editando && (
          <FuncionarioForm
            funcionario={funcionario}
            areas={equipe?.areas ?? []}
            ehRoot={Boolean(acesso?.root)}
            podeCriarAcesso={Boolean(equipe?.podeAdicionar)}
            onCancel={() => setEditando(false)}
            onMudou={async (fechar) => {
              await carregar();
              if (fechar) setEditando(false);
            }}
          />
        )}
      </Modal>

      {/* A foto em tamanho de verdade: no extrato ela tem 32px, e reconhecer
          alguém em 32px não é possível. */}
      <Modal open={Boolean(foto)} onClose={() => setFoto(null)} title="Foto do ponto" size="sm">
        {foto && <img src={foto} alt="Foto registrada no ponto" className="w-full rounded-xl" />}
      </Modal>

      <ReciboSalarioModal funcionario={funcionario} open={recibo} onClose={() => setRecibo(false)} />
    </PageScreen>
  );
};

export default FuncionarioDetalhe;
