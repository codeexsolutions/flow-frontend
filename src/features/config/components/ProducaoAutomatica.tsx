import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import ProducaoService, { type ModeloOsDisponivel } from "@/features/producao/services/producao.service";
import useEnterprise from "@/features/empresa/store/enterprise.store";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import Select from "@/shared/ui/Select";

/**
 * "Toda venda com serviço vira uma ordem de serviço" — a chave e o papel.
 *
 * ---------------------------------------------------------------------------
 * A pergunta mudou: era "qual planilha", virou "qual modelo"
 * ---------------------------------------------------------------------------
 * Aqui se escolhia a PLANILHA que recebia as vendas, porque era lá que a venda
 * caía. Só que a planilha nunca produziu papel: quem vendia via a linha nascer
 * e depois precisava gerar a ordem à mão para ter o que levar à bancada.
 *
 * Agora a venda vira ORDEM DE SERVIÇO direto, e a pergunta que sobra é a que
 * importa para quem produz: qual ficha esta oficina usa. Ver
 * `ProducaoAutomaticaService`.
 *
 * ---------------------------------------------------------------------------
 * Por que são DOIS controles, e não um
 * ---------------------------------------------------------------------------
 * A chave responde "quero isto?"; o seletor responde "em que papel?". Juntá-los
 * num seletor só ("nenhum modelo" = desligado) pareceria economia, mas apaga a
 * diferença entre desligar de propósito e ainda não ter escolhido — e são
 * situações opostas.
 *
 * ---------------------------------------------------------------------------
 * O modelo vale para as PRÓXIMAS ordens
 * ---------------------------------------------------------------------------
 * Cada ordem guarda o modelo com que nasceu, e a lista da aba Ordem de Serviço
 * troca o de uma ordem só. Trocar aqui não reescreve o papel do que já está na
 * bancada — e é assim que tem de ser: a folha impressa e a tela não podem
 * contar histórias diferentes por causa de uma configuração mudada no meio do
 * expediente.
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

  const [modelos, setModelos] = useState<ModeloOsDisponivel[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        const lista = await ProducaoService.modelosDeOs();
        if (vivo) setModelos(lista);
      } catch {
        /* Sem a lista, a chave continua funcionando — a ordem nasce no
           documento simples, que é o padrão. O que se perde é a escolha. */
        if (vivo) setModelos([]);
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
  /* "PADRAO" é a ausência de modelo escrita de um jeito que o seletor sabe
     mostrar: no banco isso é NULL, e é o documento simples. */
  const escolhido = enterprise.osModelo || "PADRAO";

  const salvar = async (dados: { producaoAutomatica?: boolean; osModelo?: string | null }) => {
    setSalvando(true);

    try {
      await updateEnterprise(enterprise.id, dados);
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível salvar."));
    } finally {
      setSalvando(false);
    }
  };

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
          <span className="block text-[13px] text-ink">Venda com serviço vira uma ordem de serviço</span>
          <span className="mt-0.5 block text-[11.5px] leading-relaxed text-faint">
            Ao registrar a nota, a ordem nasce em Produção › Ordem de Serviço com o cliente, o que produzir e a
            quantidade preenchidos — parada na primeira etapa, com o papel pronto para imprimir. Ninguém digita o mesmo
            pedido duas vezes. Só entra a nota que tem ao menos um item do tipo <span className="text-mist">serviço</span>{" "}
            — incluindo o item avulso lançado direto na nota: venda de estoque pronto não é trabalho a fazer, e encheria
            a bancada de papel que ninguém pediu.
          </span>
        </span>
      </label>

      {ligada && (
        <div className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-[0.7px] text-faint">Modelo da ordem de serviço</span>

          {carregando ? (
            <span className="flex items-center gap-2 text-[12px] text-faint">
              <Loader2 size={13} className="animate-spin" /> Carregando os modelos...
            </span>
          ) : (
            <>
              <Select
                valor={escolhido}
                aria-label="Modelo da ordem de serviço"
                onChange={(v) => void salvar({ osModelo: v === "PADRAO" ? null : v })}
                opcoes={[
                  { valor: "PADRAO", label: "Ordem de serviço simples" },
                  ...modelos.map((m) => ({ valor: m.chave, label: m.nome })),
                ]}
              />

              {/* A descrição do modelo escolhido, e não a de todos: é uma linha
                  que responde "o que sai da impressora?" sem abrir a lista. */}
              <p className="text-[11.5px] leading-relaxed text-mist">
                {modelos.find((m) => m.chave === escolhido)?.descricao ??
                  "Cliente, etapa, responsável, prazo e o que produzir. Serve a qualquer ramo."}
              </p>

              {/* Sem etapa não há onde a ordem parar, e o automático não cria
                  nada — em silêncio, porque é o servidor que desiste. Dizer
                  aqui é o que evita a pessoa achar que a chave não funciona. */}
              <div className="mt-1 rounded-xl border border-fg/[0.08] p-3">
                <p className="text-[11.5px] leading-relaxed text-mist">
                  A ordem nasce na primeira etapa do seu fluxo. Se ainda não houver nenhuma etapa cadastrada, nada é
                  criado — cadastre-as em Produção › Kanban, no botão Etapas.
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/producao/os")}
                  className="mt-2 flex items-center gap-1.5 text-[12px] text-accent-soft transition-colors hover:text-accent"
                >
                  Abrir as ordens de serviço <ExternalLink size={12} />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ProducaoAutomatica;
