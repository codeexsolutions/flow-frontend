import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Building2, CalendarDays, Check, IdCard, MapPin, User, Wallet } from "lucide-react";

import type { Funcionario } from "@/shared/domain/funcionario";
import useEnterprise from "@/features/empresa/store/enterprise.store";
import { Modal } from "@/shared/ui/Modal";
import BotaoVerDocumento from "@/shared/ui/BotaoVerDocumento";
import AssinaturaPad from "@/shared/ui/AssinaturaPad";
import ReciboSalario, { type DadosReciboSalario } from "@/shared/ui/ReciboSalario";
import { FormGrid, FormSection, TextField, CurrencyField } from "@/shared/ui/form/FormKit";
import { formatCurrency } from "@/shared/utils/currency";
import { valorPorExtenso } from "@/shared/utils/extenso";
import { liquidoDaFolha } from "@/shared/utils/folha";
import { maskCpfCnpj } from "@/shared/validation/masks";
import { onlyDigits } from "@/shared/utils/format";

/**
 * Emitir o recibo de salário de um funcionário.
 *
 * ---------------------------------------------------------------------------
 * O que a tela já sabe, ela não pergunta
 * ---------------------------------------------------------------------------
 * Nome, CPF, cargo e salário vêm do cadastro; razão social e documento vêm da
 * empresa; cidade vem do endereço; a data é hoje e a competência é o mês
 * corrente. Sobra o que só quem está emitindo sabe: desconto, adicional e a
 * assinatura. Um formulário que pede de novo o que já está gravado é um
 * formulário que ninguém preenche até o fim — e recibo é coisa de todo mês.
 *
 * Tudo continua editável. O bruto de um mês pode ser proporcional (admissão no
 * dia 10, afastamento), e travar o campo obrigaria a corrigir o cadastro para
 * emitir um papel — mexer no permanente para resolver o pontual.
 *
 * ---------------------------------------------------------------------------
 * O autosave, e o que ele deliberadamente NÃO salva
 * ---------------------------------------------------------------------------
 * O rascunho é guardado por funcionário E por competência, no próprio
 * aparelho. Fechar sem querer no meio do preenchimento não custa o trabalho de
 * novo; trocar de competência abre uma folha limpa, porque desconto de março
 * não é desconto de abril.
 *
 * A ASSINATURA fica de fora, de propósito. Ela é o que prova que a pessoa
 * recebeu naquele mês; guardá-la para reaproveitar no mês seguinte produziria
 * um recibo assinado por alguém que não assinou — que é exatamente o que a
 * assinatura existe para impedir. Ela se desenha a cada emissão.
 */

type Props = {
  funcionario: Funcionario;
  open: boolean;
  onClose: () => void;
};

/* ── Competência ──────────────────────────────────────────────────────────── */

const maskCompetencia = (valor: string) => {
  /* "8/" vira "08/". Quem digita o mês costuma escrever o dígito e a barra —
     sem esta linha, "8/2026" seria lido como os dígitos "82026" e mostraria
     "82/026", um mês 82 que só se descobre errado no aviso do campo. */
  const cru = /^\d\//.test(valor) ? `0${valor}` : valor;

  const d = onlyDigits(cru).slice(0, 6);

  return d.length <= 2 ? d : `${d.slice(0, 2)}/${d.slice(2)}`;
};

const competenciaValida = (valor: string) => {
  const d = onlyDigits(valor);
  if (d.length !== 6) return false;

  const mes = Number(d.slice(0, 2));
  const ano = Number(d.slice(2));

  return mes >= 1 && mes <= 12 && ano >= 1900 && ano <= 2999;
};

/* O que vem da ficha e se corrige NELA — cinza, para não convidar ao clique. */
const SO_LEITURA = "text-mist cursor-default";

const competenciaDeHoje = () => {
  const hoje = new Date();
  return `${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;
};

/* ── Rascunho ─────────────────────────────────────────────────────────────── */

/** O que sobrevive a fechar o modal. Sem assinatura — ver o cabeçalho. */
type Rascunho = {
  cargo: string;
  empregadorNome: string;
  empregadorCpf: string;
  empregadorCnpj: string;
  salarioBruto: number;
  descontos: number;
  adicionais: number;
  cidade: string;
  data: string;
};

const chaveRascunho = (funcionarioId: string, competencia: string) =>
  `recibo-salario:${funcionarioId}:${onlyDigits(competencia)}`;

const lerRascunho = (chave: string): Partial<Rascunho> | null => {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? (JSON.parse(bruto) as Partial<Rascunho>) : null;
  } catch {
    /* localStorage cheio, desligado ou com JSON corrompido de uma versão
       anterior: o recibo ainda pode ser emitido do zero. */
    return null;
  }
};

/* ── O modal ──────────────────────────────────────────────────────────────── */

const ReciboSalarioModal = ({ funcionario, open, onClose }: Props) => {
  const empresa = useEnterprise((s) => s.enterprise);
  const refRecibo = useRef<HTMLDivElement>(null);

  const [competencia, setCompetencia] = useState(competenciaDeHoje);

  const [cargo, setCargo] = useState("");
  const [empregadorNome, setEmpregadorNome] = useState("");
  const [empregadorCpf, setEmpregadorCpf] = useState("");
  const [empregadorCnpj, setEmpregadorCnpj] = useState("");

  const [salarioBruto, setSalarioBruto] = useState(0);
  const [descontos, setDescontos] = useState(0);
  const [adicionais, setAdicionais] = useState(0);

  const [cidade, setCidade] = useState("");
  const [data, setData] = useState("");

  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [salvou, setSalvou] = useState(false);

  /*
   * Os padrões da empresa, calculados uma vez.
   *
   * O sistema guarda UM documento por empresa (`cpfCnpj`), e o recibo tem duas
   * linhas. Quem decide em qual delas ele entra é a contagem de dígitos: 14 é
   * CNPJ, 11 é CPF. Chutar errado aqui colocaria um CNPJ na linha do CPF de um
   * MEI — e o papel iria assim para a contabilidade.
   */
  const padroesEmpresa = useMemo(() => {
    const digitos = onlyDigits(empresa?.cpfCnpj);

    return {
      nome: empresa?.nomeFantasia ?? "",
      cpf: digitos.length === 11 ? digitos : "",
      cnpj: digitos.length === 14 ? digitos : "",
      cidade: empresa?.endereco?.cidade ?? "",
    };
  }, [empresa]);

  /*
   * Preenche a folha: cadastro primeiro, rascunho por cima.
   *
   * Roda ao abrir e a cada troca de competência — é o que faz "trocar o mês"
   * significar "outra folha", com o rascunho daquele mês se ele existir.
   */
  useEffect(() => {
    if (!open) return;

    const salvo = competenciaValida(competencia)
      ? lerRascunho(chaveRascunho(funcionario.id, competencia))
      : null;

    setCargo(salvo?.cargo ?? funcionario.cargo ?? "");
    setEmpregadorNome(salvo?.empregadorNome ?? padroesEmpresa.nome);
    setEmpregadorCpf(salvo?.empregadorCpf ?? padroesEmpresa.cpf);
    setEmpregadorCnpj(salvo?.empregadorCnpj ?? padroesEmpresa.cnpj);
    setSalarioBruto(salvo?.salarioBruto ?? funcionario.salario ?? 0);
    setDescontos(salvo?.descontos ?? 0);
    setAdicionais(salvo?.adicionais ?? 0);
    setCidade(salvo?.cidade ?? padroesEmpresa.cidade);
    setData(salvo?.data ?? new Date().toISOString().slice(0, 10));

    /* A assinatura NÃO volta do rascunho, e some ao trocar de competência:
       ela pertence a um mês só. */
    setAssinatura(null);
  }, [open, competencia, funcionario, padroesEmpresa]);

  /* Guarda o rascunho. O atraso evita escrever no disco a cada tecla. */
  useEffect(() => {
    if (!open || !competenciaValida(competencia)) return;

    const id = setTimeout(() => {
      const rascunho: Rascunho = {
        cargo, empregadorNome, empregadorCpf, empregadorCnpj,
        salarioBruto, descontos, adicionais, cidade, data,
      };

      try {
        localStorage.setItem(chaveRascunho(funcionario.id, competencia), JSON.stringify(rascunho));
        setSalvou(true);
        setTimeout(() => setSalvou(false), 1400);
      } catch {
        /* Sem espaço ou em aba anônima: o recibo continua emitível, só não
           sobrevive a fechar o modal. Não vale interromper por isso. */
      }
    }, 600);

    return () => clearTimeout(id);
  }, [open, funcionario.id, competencia, cargo, empregadorNome, empregadorCpf, empregadorCnpj, salarioBruto, descontos, adicionais, cidade, data]);

  /* ── O que o documento recebe ─────────────────────────────────────────── */

  const dados: DadosReciboSalario = {
    funcionarioNome: funcionario.nome,
    funcionarioCpf: funcionario.cpf ?? "",
    funcionarioCargo: cargo,
    empregadorNome,
    empregadorCpf: onlyDigits(empregadorCpf),
    empregadorCnpj: onlyDigits(empregadorCnpj),
    competencia,
    salarioBruto,
    descontos,
    adicionais,
    cidade,
    data,
    assinatura,
  };

  const liquido = liquidoDaFolha(dados);

  /*
   * O que impede a emissão — e só isso.
   *
   * Competência errada deixaria o papel sem dizer a que mês se refere, e
   * líquido negativo é um recibo que afirma que a pessoa recebeu menos que
   * nada. Assinatura em branco NÃO bloqueia: assinar no papel impresso é o
   * fluxo de quem não tem tela sensível ao toque, e é legítimo.
   */
  const impedimento = !competenciaValida(competencia)
    ? "Informe a competência no formato MM/AAAA."
    : liquido < 0
      ? "Os descontos passam do salário bruto — o líquido ficou negativo."
      : "";

  const salarioDoCadastro = funcionario.salario;
  const brutoDivergente = salarioDoCadastro != null && Math.abs(salarioDoCadastro - salarioBruto) > 0.005;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Recibo de salário"
      subtitle={funcionario.nome}
      size="xl"
    >
      {/* Sem scroller próprio: o corpo do Modal já é `overflow-y-auto`, e um
          segundo dentro dele criaria duas barras de rolagem disputando o
          mesmo gesto. O rodapé gruda com `sticky` nesse mesmo corpo. */}
      <div>
        <FormSection title="Dados do funcionário" icon={<User className="h-4 w-4" />}>
          <FormGrid cols={3}>
            {/* Nome e CPF vêm da ficha e se corrigem NELA: um recibo com nome
                diferente do cadastro é divergência que ninguém rastreia
                depois. O cargo muda de mês para mês (promoção, função
                temporária) e por isso é editável aqui. */}
            {/* `readOnly` e não `disabled`: campo desabilitado não deixa
                selecionar o texto, e um CPF que não dá para copiar obriga a
                redigitar à mão o número que está bem ali na tela. */}
            <TextField label="Nome completo" value={funcionario.nome} readOnly className={SO_LEITURA} />
            <TextField
              label="CPF"
              value={funcionario.cpf ? maskCpfCnpj(funcionario.cpf) : ""}
              placeholder="Não cadastrado"
              readOnly
              className={SO_LEITURA}
              hint={funcionario.cpf ? undefined : "Preencha na ficha do funcionário"}
            />
            <TextField label="Cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Sem cargo" />
          </FormGrid>
        </FormSection>

        <FormSection title="Dados do empregador" icon={<Building2 className="h-4 w-4" />}>
          <FormGrid cols={3}>
            <TextField label="Nome / Razão social" value={empregadorNome} onChange={(e) => setEmpregadorNome(e.target.value)} />
            <TextField
              label="CPF"
              icon={<IdCard className="h-4 w-4" />}
              value={empregadorCpf ? maskCpfCnpj(empregadorCpf) : ""}
              onChange={(e) => setEmpregadorCpf(onlyDigits(e.target.value).slice(0, 11))}
              placeholder="Se pessoa física"
            />
            <TextField
              label="CNPJ"
              icon={<Building2 className="h-4 w-4" />}
              value={empregadorCnpj ? maskCpfCnpj(empregadorCnpj) : ""}
              onChange={(e) => setEmpregadorCnpj(onlyDigits(e.target.value).slice(0, 14))}
              placeholder="Se pessoa jurídica"
            />
          </FormGrid>
        </FormSection>

        <FormSection title="Dados do salário" icon={<Wallet className="h-4 w-4" />}>
          <FormGrid cols={2}>
            <TextField
              label="Competência (MM/AAAA)"
              icon={<CalendarDays className="h-4 w-4" />}
              value={competencia}
              onChange={(e) => setCompetencia(maskCompetencia(e.target.value))}
              inputMode="numeric"
              placeholder="08/2026"
              error={competencia && !competenciaValida(competencia) ? "Mês ou ano inválido" : undefined}
              hint="Trocar o mês abre outra folha"
            />
            <CurrencyField
              label="Salário bruto"
              value={salarioBruto}
              onValueChange={setSalarioBruto}
              hint={brutoDivergente ? `No cadastro: ${formatCurrency(salarioDoCadastro)}` : undefined}
            />
            <CurrencyField label="Descontos" value={descontos} onValueChange={setDescontos} hint="Faltas, adiantamentos, vale" />
            <CurrencyField label="Adicionais" value={adicionais} onValueChange={setAdicionais} hint="Horas extras, comissão, bônus" />
          </FormGrid>

          {/* ---------- O líquido ----------
              Fica aqui, colado nos campos que o produzem, e não numa seção
              própria: o número muda enquanto se digita, e é olhando ele que
              se percebe o desconto lançado com um zero a mais. */}
          <div className="mt-4 flex flex-col gap-1 rounded-xl border border-accent/25 bg-accent/[0.06] px-4 py-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] uppercase tracking-[0.08em] text-mist">Salário líquido</span>
              <span className={`tabular-nums text-[24px] leading-none ${liquido < 0 ? "text-danger" : "text-ink"}`}>
                {formatCurrency(liquido)}
              </span>
            </div>

            {/* O extenso some no negativo: `valorPorExtenso` escreve o
                módulo, e "quinhentos reais" embaixo de −R$ 500,00 diria o
                contrário do número que está logo acima. */}
            {liquido >= 0 && (
              <p className="text-right text-[11.5px] leading-[16px] text-faint first-letter:uppercase">
                {valorPorExtenso(liquido)}
              </p>
            )}
          </div>
        </FormSection>

        <FormSection title="Local e data" icon={<MapPin className="h-4 w-4" />}>
          <FormGrid cols={2}>
            <TextField label="Cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Cidade" />
            <TextField label="Data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </FormGrid>
        </FormSection>

        <FormSection title="Assinatura de quem recebeu">
          <AssinaturaPad
            valor={assinatura}
            onChange={setAssinatura}
            label={`Assinatura de ${funcionario.nome}`}
            hint="Opcional — sem assinar, o recibo sai com a linha em branco para assinar no papel."
          />
        </FormSection>

        {/* ---------- Rodapé ----------
            `sticky` no fim do corpo que rola: o botão de baixar fica sempre
            à vista, e a margem negativa faz a barra encostar nas bordas do
            painel em vez de flutuar dentro do respiro do modal. */}
        <div className="sticky bottom-0 -mx-4 -mb-4 mt-2 flex flex-wrap items-center gap-2 border-t border-fg/[0.07] bg-surface px-4 py-3 sm:-mx-5 sm:-mb-5 sm:px-5">
          <span className="flex items-center gap-1.5 text-[11.5px] text-faint">
            {salvou
              ? <><Check size={12} className="text-success" /> Rascunho salvo</>
              : <>Autosave ativado</>}
          </span>

          <div className="flex-1" />

          {impedimento ? (
            <span className="flex items-center gap-1.5 text-[12px] text-warning">
              <AlertTriangle size={13} className="shrink-0" /> {impedimento}
            </span>
          ) : (
            <BotaoVerDocumento
              refNota={refRecibo}
              nomeEmpresa={empregadorNome || "empresa"}
              prefixo={`recibo-salario-${onlyDigits(competencia)}`}
              titulo="Ver ou baixar o recibo"
              documento="recibo"
            />
          )}
        </div>
      </div>

      {/* O documento existe no DOM de verdade, fora da tela: `display:none` não
          rasteriza. Mesmo caminho da nota, do orçamento e do recibo de venda. */}
      <div className="fixed -left-[9999px] top-0" aria-hidden>
        <ReciboSalario dados={dados} refRecibo={refRecibo} />
      </div>
    </Modal>
  );
};

export default ReciboSalarioModal;
