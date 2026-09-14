import { useEffect, useState } from "react";
import { ShieldCheck, Loader2, ChevronDown, ChevronRight } from "lucide-react";

import TermosService, { type AceiteRegistrado, type SituacaoTermos } from "@/features/termos/termos.service";
import { formatDateTime } from "@/shared/utils/date";

/**
 * A prova do aceite — onde ela pode ser lida depois.
 *
 * O modal de aceite promete, com todas as letras, que o registro fica guardado
 * e pode ser consultado. Esta tela é o que torna a frase verdadeira: sem ela, a
 * promessa dependeria de alguém abrir o banco.
 *
 * Serve a três momentos concretos: um cliente pedindo para saber como os dados
 * dele são tratados, uma auditoria perguntando desde quando a empresa
 * concordou, e a própria dúvida de quem administra — "eu aceitei isso?".
 *
 * O histórico traz TODAS as versões, e não só a vigente. Quando um texto muda,
 * o que valia na venda do ano passado é a versão daquele ano, não a de agora.
 */
const TermosEmpresa = () => {
  const [situacao, setSituacao] = useState<SituacaoTermos | null>(null);
  const [historico, setHistorico] = useState<AceiteRegistrado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let vivo = true;

    Promise.all([TermosService.situacao(), TermosService.historico().catch(() => [])])
      .then(([s, h]) => {
        if (!vivo) return;
        setSituacao(s);
        setHistorico(h);
      })
      .catch(() => vivo && setErro(true))
      .finally(() => vivo && setCarregando(false));

    return () => {
      vivo = false;
    };
  }, []);

  if (carregando) {
    return (
      <p className="flex items-center gap-2 text-[13px] text-faint">
        <Loader2 size={14} className="animate-spin" />
        Carregando…
      </p>
    );
  }

  if (erro || !situacao) {
    return <p className="text-[13px] text-faint">Não foi possível carregar os termos agora.</p>;
  }

  const { termos, aceito, aceitoEm, aceitoPor } = situacao;

  return (
    <div className="flex flex-col gap-5">
      {/* A situação, em uma linha que se lê de relance */}
      <div
        className={`flex items-start gap-3 rounded-xl border p-3.5 ${
          aceito ? "border-success/25 bg-success/[0.08]" : "border-warning/25 bg-warning/[0.08]"
        }`}
      >
        <ShieldCheck size={17} className={`mt-0.5 shrink-0 ${aceito ? "text-success" : "text-warning"}`} />

        <div className="min-w-0">
          <p className={`text-[13.5px] ${aceito ? "text-success" : "text-warning"}`}>
            {aceito ? "Termos aceitos e em dia" : "Aceite pendente da versão vigente"}
          </p>

          <p className="mt-0.5 text-[12px] leading-relaxed text-mist">
            {aceito
              ? `Versão ${termos.versao}, aceita ${aceitoEm ? `em ${formatDateTime(aceitoEm)}` : ""}${aceitoPor ? ` por ${aceitoPor}` : ""}.`
              : `A versão ${termos.versao} ainda não foi aceita. O usuário master vê a tela de aceite ao entrar no sistema.`}
          </p>
        </div>
      </div>

      {/* O texto, fechado por padrão: quem abre esta aba quase sempre quer a
          data do aceite, não reler oito cláusulas. */}
      <div>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="focus-ring flex cursor-pointer items-center gap-1.5 text-[13px] text-mist transition-colors hover:text-accent-soft"
        >
          {aberto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          {aberto ? "Esconder o texto" : `Ler o texto da versão ${termos.versao}`}
        </button>

        {aberto && (
          <div className="mt-3 flex max-h-[340px] flex-col gap-5 overflow-y-auto rounded-xl border border-fg/[0.06] bg-fg/[0.02] p-4">
            <p className="text-[13px] leading-relaxed text-mist">{termos.resumo}</p>

            {termos.secoes.map((secao) => (
              <section key={secao.id}>
                <h4 className="mb-1.5 text-[13px] text-ink">{secao.titulo}</h4>

                <div className="flex flex-col gap-2">
                  {secao.paragrafos.map((p, i) => (
                    <p key={i} className="text-[12.5px] leading-relaxed text-faint">
                      {p}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* O histórico */}
      <div>
        <p className="mb-2 text-[11px] uppercase tracking-[0.1em] text-faint">Histórico de aceites</p>

        {historico.length === 0 ? (
          <p className="text-[13px] text-faint">Nenhum aceite registrado ainda.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-fg/[0.06]">
            {historico.map((linha, i) => (
              <div
                key={`${linha.versao}-${i}`}
                className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3.5 py-2.5 ${
                  i > 0 ? "border-t border-fg/[0.05]" : ""
                }`}
              >
                <span className="font-mono text-[12px] text-ink">{linha.versao}</span>
                <span className="text-[12.5px] text-mist">{formatDateTime(linha.aceito_em)}</span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-faint">
                  {linha.usuario_nome ?? "—"}
                  {linha.ip ? ` · ${linha.ip}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TermosEmpresa;
