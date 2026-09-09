import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import PlanilhaService, { type Modelo } from "@/features/planilhas/services/planilha.service";
import useEnterprise from "@/features/empresa/store/enterprise.store";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import Select from "@/shared/ui/Select";

/**
 * "Toda venda vira uma linha na produção" — a chave e o destino.
 *
 * ---------------------------------------------------------------------------
 * Por que são DOIS controles, e não um
 * ---------------------------------------------------------------------------
 * A chave responde "quero isto?"; o seletor responde "onde?". Juntá-los num
 * seletor só ("nenhuma planilha" = desligado) pareceria economia, mas apaga a
 * diferença entre desligar de propósito e ainda não ter escolhido — e são
 * situações opostas: a primeira é uma decisão, a segunda é uma pendência que a
 * tela precisa apontar.
 *
 * ---------------------------------------------------------------------------
 * Uma planilha só: o seletor some
 * ---------------------------------------------------------------------------
 * Com uma planilha não há escolha a fazer, e o servidor já usa a única que
 * existe. Um seletor de uma opção é uma pergunta cuja resposta já está dada —
 * ocupa espaço e faz duvidar se algo está por configurar.
 *
 * ---------------------------------------------------------------------------
 * Salva no clique, sem botão "Salvar"
 * ---------------------------------------------------------------------------
 * Mesma escolha do "Esconder o CPF nas notas" ao lado: é preferência de uma
 * chave só, e um rodapé de salvar para um interruptor faz a pessoa desligá-lo,
 * sair da tela e descobrir depois que não valeu.
 */
const ProducaoAutomatica = () => {
  const navigate = useNavigate();
  const alert = useAlert();
  const { enterprise, updateEnterprise } = useEnterprise();

  const [planilhas, setPlanilhas] = useState<Modelo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        const lista = await PlanilhaService.modelos();
        if (vivo) setPlanilhas(lista);
      } catch {
        /* Sem a lista, a chave continua funcionando — o servidor resolve a
           planilha sozinho quando há uma só. O que se perde é a escolha. */
        if (vivo) setPlanilhas([]);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();

    return () => {
      vivo = false;
    };
  }, []);

  if (!enterprise) return null;

  const ligada = enterprise.producaoAutomatica !== false;
  const escolhida = enterprise.producaoPlanilhaId ?? "";

  const salvar = async (dados: { producaoAutomatica?: boolean; producaoPlanilhaId?: string | null }) => {
    setSalvando(true);

    try {
      await updateEnterprise(enterprise.id, dados);
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível salvar."));
    } finally {
      setSalvando(false);
    }
  };

  /* Duas ou mais planilhas e nenhuma escolhida: o servidor não adivinha, e a
     venda não vai para lugar nenhum. É a única situação em que a tela precisa
     dizer que falta algo. */
  const precisaEscolher = ligada && planilhas.length > 1 && !escolhida;

  return (
    <div className="flex flex-col gap-4">
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-fg/[0.08] p-3">
        <input
          type="checkbox"
          checked={ligada}
          disabled={salvando}
          onChange={(e) => void salvar({ producaoAutomatica: e.target.checked })}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]"
        />

        <span className="min-w-0">
          <span className="block text-[13px] text-ink">Venda com serviço vira uma linha na produção</span>
          <span className="mt-0.5 block text-[11.5px] leading-relaxed text-faint">
            Ao registrar a nota, a linha nasce na planilha com o cliente, os itens e o total preenchidos — parada na
            primeira etapa, esperando alguém movê-la. Ninguém digita o mesmo pedido duas vezes. Só entra a nota que tem
            ao menos um item do tipo <span className="text-mist">serviço</span> — incluindo o item avulso lançado direto
            na nota: venda de estoque pronto não é trabalho a fazer, e encheria o quadro de cartão que ninguém move.
          </span>
        </span>
      </label>

      {ligada && (
        <div className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-[0.7px] text-faint">Planilha que recebe as vendas</span>

          {carregando ? (
            <span className="flex items-center gap-2 text-[12px] text-faint">
              <Loader2 size={13} className="animate-spin" /> Carregando as planilhas...
            </span>
          ) : planilhas.length === 0 ? (
            <div className="rounded-xl border border-warning/30 bg-warning/[0.08] p-3">
              <p className="text-[12.5px] text-ink">Você ainda não tem nenhuma planilha de produção.</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-mist">
                Sem ela não há onde a venda cair. Crie a primeira em Produção › Kanban — o catálogo tem um modelo pronto,
                com as etapas já montadas.
              </p>
              <button
                type="button"
                onClick={() => navigate("/producao/kanban")}
                className="mt-2.5 flex items-center gap-1.5 text-[12px] text-accent-soft transition-colors hover:text-accent"
              >
                Abrir a produção <ExternalLink size={12} />
              </button>
            </div>
          ) : planilhas.length === 1 ? (
            /* Uma só: não há o que escolher, mas dizer QUAL evita a dúvida de
               quem só vê uma chave ligada e nenhum destino. */
            <p className="text-[12.5px] text-mist">
              As vendas vão para <span className="text-ink">{planilhas[0].nome}</span>, a sua única planilha.
            </p>
          ) : (
            <>
              <Select
                valor={escolhida}
                aria-label="Planilha que recebe as vendas"
                onChange={(v) => void salvar({ producaoPlanilhaId: v || null })}
                placeholder="Escolha a planilha"
                opcoes={planilhas.map((p) => ({ valor: p.id, label: p.nome }))}
              />

              {precisaEscolher && (
                <p className="text-[11.5px] leading-relaxed text-warning">
                  Você tem mais de uma planilha. Enquanto nenhuma estiver escolhida, a venda não vira linha — pôr o
                  pedido na planilha errada seria pior do que não pôr.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ProducaoAutomatica;
