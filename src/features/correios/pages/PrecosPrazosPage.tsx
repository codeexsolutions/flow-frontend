import { useMemo, useState } from "react";
import { Calculator, MapPin, Weight, Ruler, Timer, AlertTriangle, RotateCw, CheckCircle2, TrendingUp, ShieldCheck } from "lucide-react";

import useEnterprise from "@/features/empresa/store/enterprise.store";
import CorreiosService from "@/features/correios/services/correios.service";
import type { CalcFreteDto, FreteResultado } from "@/features/correios/types/correios.types";

import { money } from "@/shared/utils/currency";
import { onlyDigits } from "@/shared/utils/format";
import { maskCep } from "@/shared/validation/masks";
import { unwrapList } from "@/shared/api/types";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";


/**
 * A cor do selo vem da TRANSPORTADORA, não do nome do serviço.
 *
 * Era um mapa de "SEDEX", "PAC", "SEDEX12" — os quatro serviços dos Correios
 * escritos no código. Com Jadlog, Azul, LATAM e Loggi no mesmo resultado,
 * qualquer lista fixa deixa a maioria dos cartões sem cor; então o que colore
 * é a velocidade, que toda transportadora informa.
 */
const corDoCartao = (tipo?: string) =>
  tipo === "express"
    ? "border-accent/40 bg-accent/15 text-accent-soft ring-accent/20"
    : "border-fg/10 bg-fg/[0.04] text-mist ring-fg/10";

const campoBase = "h-11 w-full rounded-xl border border-fg/[0.08] bg-fg/[0.04] px-3 text-sm text-ink placeholder-mist outline-none transition-colors focus:border-accent/60 focus:bg-fg/[0.06]";

const PrecosPrazosPage = () => {
  const { enterprise } = useEnterprise();
  const alert = useAlert();

  const [cepDestino, setCepDestino] = useState("");
  const [peso, setPeso] = useState("0.5");
  const [comprimento, setComprimento] = useState("20");
  const [altura, setAltura] = useState("10");
  const [largura, setLargura] = useState("15");

  /* As opções que mexem no preço além da caixa. Todas nascem desligadas: são
     serviços a mais, e ninguém deve pagar por um que não pediu. */
  const [valorSegurado, setValorSegurado] = useState("");
  const [avisoRecebimento, setAvisoRecebimento] = useState(false);
  const [maoPropria, setMaoPropria] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [resultados, setResultados] = useState<FreteResultado[]>([]);
  const [jaConsultou, setJaConsultou] = useState(false);

  const cepOrigem = enterprise?.endereco?.cep ? maskCep(enterprise.endereco.cep) : "";
  const endereco = enterprise?.endereco;

  const handleCalcular = async () => {
    if (cepDestino.length < 9) {
      alert.warning("CEP incompleto", "Informe o CEP de destino completo.");
      return;
    }
    if (!enterprise?.endereco?.cep) {
      alert.warning("Endereço da empresa", "Configure o endereço da empresa em Configurações.");
      return;
    }

    setCarregando(true);
    setResultados([]);

    try {
      /*
       * UMA chamada, sem filtro de serviço.
       *
       * Eram três — SEDEX, PAC e SEDEX 12 —, uma lista dos Correios escrita no
       * código, e o resultado é que Jadlog, Azul Cargo, LATAM e Loggi nunca
       * apareciam mesmo estando habilitadas na conta. Sem `servicos`, o
       * provedor devolve tudo o que atende a rota.
       */
      const r = await CorreiosService.calcularFrete({
        cepOrigem: onlyDigits(cepOrigem),
        cepDestino: onlyDigits(cepDestino),
        peso: Number(peso) || 0.5,
        comprimento: Number(comprimento) || 20,
        altura: Number(altura) || 10,
        largura: Number(largura) || 15,
        valorSegurado: Number(valorSegurado.replace(",", ".")) || 0,
        avisoRecebimento,
        maoPropria,
      } as CalcFreteDto);

      const todos = unwrapList<FreteResultado>(r.data);

      if (todos.length === 0) {
        alert.warning("Sem resposta", "Não foi possível calcular o frete. Verifique os dados.");
      }
      setResultados(todos);
    } catch (err) {

      alert.error(getErrorTitle(err), extractErrorMessage(err, "Falha na comunicação com os Correios."));
    } finally {
      setCarregando(false);
      setJaConsultou(true);
    }
  };

  const melhorResultado = useMemo(() => {
    if (resultados.length === 0) return null;
    return resultados.reduce((best, r) => (r.valor < best.valor ? r : best), resultados[0]);
  }, [resultados]);

  return (
    <div className="flex flex-col gap-5">
      {/* Formulário */}
      <div className="card glass-sheen rounded-xl p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm text-ink">
          <Calculator size={16} className="text-accent-soft" /> Dados da encomenda
        </h2>
        <p className="mb-5 text-[12px] text-faint">Informe os dados para calcular preços e prazos de entrega</p>

        {/* Grid principal do formulário */}
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-5">
          {/* Origem — ocupa 2 colunas no LG */}
          <div className="flex flex-col sm:col-span-2">
            <label className="mb-1.5 text-[10px] uppercase tracking-[0.08em] text-faint">Origem (sua empresa)</label>
            <div className={`${campoBase} flex items-center gap-2 cursor-default`}>
              <MapPin size={15} className="shrink-0 text-accent-soft" />
              <span className="truncate text-ink text-[13px]">
                {endereco ? `${endereco.cidade}/${endereco.uf} · ${maskCep(endereco.cep)}` : "Configure o endereço da empresa"}
              </span>
            </div>
          </div>

          {/* CEP destino */}
          <div className="flex flex-col">
            <label className="mb-1.5 text-[10px] uppercase tracking-[0.08em] text-faint">CEP de destino</label>
            <div className={`${campoBase} flex items-center`}>
              <MapPin size={15} className="shrink-0 text-muted" />
              <input
                value={cepDestino}
                onChange={(e) => setCepDestino(maskCep(e.target.value))}
                placeholder="00000-000"
                inputMode="numeric"
                maxLength={9}
                className="w-full bg-transparent outline-none text-ink placeholder-mist"
              />
            </div>
          </div>

          {/* Peso */}
          <div className="flex flex-col">
            <label className="mb-1.5 text-[10px] uppercase tracking-[0.08em] text-faint">Peso (kg)</label>
            <div className={`${campoBase} flex items-center`}>
              <Weight size={15} className="shrink-0 text-muted" />
              <input value={peso} onChange={(e) => setPeso(e.target.value)} type="number" min={0} step="0.1" className="w-full bg-transparent outline-none text-ink" />
            </div>
          </div>

          {/* Valor declarado — o seguro, que é opção de preço e não de serviço. */}
          <div className="flex flex-col">
            <label className="mb-1.5 text-[10px] uppercase tracking-[0.08em] text-faint">Valor declarado (R$)</label>
            <div className={`${campoBase} flex items-center`}>
              <ShieldCheck size={15} className="shrink-0 text-muted" />
              <input
                value={valorSegurado}
                onChange={(e) => setValorSegurado(e.target.value)}
                inputMode="decimal"
                placeholder="sem seguro"
                className="w-full bg-transparent outline-none text-ink placeholder-mist"
              />
            </div>
          </div>
        </div>

        {/* Dimensões */}
        <div className="mt-4 grid grid-cols-2 gap-x-5 sm:grid-cols-5 lg:grid-cols-3">
          <div className="flex flex-col">
            <label className="mb-1.5 text-[10px] uppercase tracking-[0.08em] text-faint">Comprimento (cm)</label>
            <div className={`${campoBase} flex items-center`}>
              <Ruler size={15} className="shrink-0 text-muted" />
              <input value={comprimento} onChange={(e) => setComprimento(e.target.value)} type="number" min={0} className="w-full bg-transparent outline-none text-ink" />
            </div>
          </div>
          <div className="flex flex-col">
            <label className="mb-1.5 text-[10px] uppercase tracking-[0.08em] text-faint">Altura (cm)</label>
            <div className={`${campoBase} flex items-center`}>
              <Ruler size={15} className="shrink-0 text-muted" />
              <input value={altura} onChange={(e) => setAltura(e.target.value)} type="number" min={0} className="w-full bg-transparent outline-none text-ink" />
            </div>
          </div>
          <div className="flex flex-col">
            <label className="mb-1.5 text-[10px] uppercase tracking-[0.08em] text-faint">Largura (cm)</label>
            <div className={`${campoBase} flex items-center`}>
              <Ruler size={15} className="shrink-0 text-muted" />
              <input value={largura} onChange={(e) => setLargura(e.target.value)} type="number" min={0} className="w-full bg-transparent outline-none text-ink" />
            </div>
          </div>
        </div>

        {/* Os adicionais dos Correios. Desligados por padrão: são serviços a
            mais, e o preço sobe com eles. */}
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-mist">
            <input
              type="checkbox"
              checked={avisoRecebimento}
              onChange={(e) => setAvisoRecebimento(e.target.checked)}
              className="h-4 w-4 accent-[rgb(var(--accent))]"
            />
            Aviso de recebimento
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-mist">
            <input
              type="checkbox"
              checked={maoPropria}
              onChange={(e) => setMaoPropria(e.target.checked)}
              className="h-4 w-4 accent-[rgb(var(--accent))]"
            />
            Mão própria
          </label>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={handleCalcular}
            disabled={carregando}
            className="flex cursor-pointer items-center gap-2 rounded-xl bg-accent px-6 py-2.5 text-sm text-white shadow-lg shadow-accent/25 transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
          >
            {carregando ? <RotateCw size={16} className="animate-spin" /> : <Calculator size={16} />}
            {carregando ? "Calculando..." : "Calcular frete"}
          </button>
        </div>
      </div>

      {/* Resultados */}
      {jaConsultou && (
        <div className="flex flex-col gap-4">
          {resultados.length > 0 ? (
            <>
              <div className="flex items-center gap-2 text-[12px] text-faint">
                <CheckCircle2 size={15} className="text-success" />
                {resultados.length} {resultados.length === 1 ? "serviço disponível" : "serviços disponíveis"} para o CEP informado
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {resultados.map((r) => {
                  const indisponivel = Boolean(r.erro);
                  const isMelhor = !indisponivel && melhorResultado && r.valor === melhorResultado.valor;
                  const cor = corDoCartao(r.tipo);
                  return (
                    <div
                      key={`${r.servicoId}-${r.servico}`}
                      className={`relative overflow-hidden rounded-xl border p-5 transition-all hover:shadow-md ${
                        isMelhor ? "border-accent/40 bg-gradient-to-br from-accent/[0.08] to-transparent ring-1 ring-accent/20" : "border-fg/[0.07] bg-surface"
                      }`}
                    >
                      {isMelhor && (
                        <div className="absolute right-0 top-0">
                          <span className="inline-flex items-center gap-1 rounded-bl-lg bg-accent px-2.5 py-0.5 text-[9px] text-white shadow-sm">
                            <TrendingUp size={10} /> Melhor preço
                          </span>
                        </div>
                      )}

                      {/* O logo da transportadora — é por ele que se reconhece a
                          linha de relance, mais do que pelo nome do serviço. */}
                      <div className="mb-3 flex items-center gap-2">
                        {r.transportadoraLogo && (
                          <img src={r.transportadoraLogo} alt={r.transportadora ?? ""} className="h-5 w-5 shrink-0 rounded object-contain" />
                        )}
                        <span className={`inline-flex min-w-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] ${cor}`}>
                          <span className="truncate">{r.servico}</span>
                        </span>
                        {r.tipo === "express" && <span className="shrink-0 text-[10px] uppercase tracking-wider text-accent-soft">expresso</span>}
                      </div>

                      {indisponivel ? (
                        /* A transportadora que recusou a rota fica no resultado
                           com o motivo: "não atende este CEP" é resposta, e
                           escondê-la faz procurar por uma opção que não existe. */
                        <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-faint">
                          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" />
                          {r.erro}
                        </p>
                      ) : (
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.08em] text-faint">Valor</p>
                          <p className="mt-0.5 text-3xl tracking-tight text-ink">{money(r.valor)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] uppercase tracking-[0.08em] text-faint">Prazo</p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-mist">
                            <Timer size={14} className="text-accent-soft" />
                            {r.prazo} {r.prazo === 1 ? "dia útil" : "dias úteis"}
                          </p>
                          {r.exigeAgencia && <p className="mt-1 text-[10.5px] text-faint">exige agência na postagem</p>}
                        </div>
                      </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/[0.08] px-5 py-4 text-sm text-warning">
              <AlertTriangle size={18} />
              Nenhum serviço disponível para os dados informados. Verifique o CEP e as dimensões.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PrecosPrazosPage;
