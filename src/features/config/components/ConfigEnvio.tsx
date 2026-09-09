import { useEffect, useState } from "react";
import { AlertTriangle, Check, ExternalLink, Loader2, Save } from "lucide-react";

import CorreiosService from "@/features/correios/services/correios.service";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import { unwrapList } from "@/shared/api/types";
import Select from "@/shared/ui/Select";

/**
 * CONFIGURAÇÕES › ENVIO — a conta que paga o frete.
 *
 * ---------------------------------------------------------------------------
 * Por que Melhor Envio, e não os Correios direto
 * ---------------------------------------------------------------------------
 * As APIs de preço e prazo dos Correios só existem para quem tem CONTRATO na
 * modalidade "a faturar". Sem contrato — que é a situação da maioria das
 * empresas do sistema — não dá nem para cotar. O Melhor Envio é intermediador:
 * cota e emite etiqueta sem contrato próprio, e traz Jadlog, Azul e Loggi junto
 * dos Correios no mesmo resultado.
 *
 * ---------------------------------------------------------------------------
 * O token gasta dinheiro, então ele não volta
 * ---------------------------------------------------------------------------
 * Ele autoriza comprar frete com o saldo da carteira daquela conta. É gravado e
 * nunca mais lido pela tela: o campo diz "conectado" e fica vazio, e vazio ao
 * salvar significa "não mexi". Mesmo desenho da credencial fiscal.
 *
 * ---------------------------------------------------------------------------
 * Sandbox é outra conta, não um interruptor
 * ---------------------------------------------------------------------------
 * `sandbox.melhorenvio.com.br` e o site de produção são ambientes separados,
 * com tokens separados. Trocar o ambiente sem trocar o token dá
 * "Unauthenticated" — é o engano mais comum de quem integra, e é por isso que
 * o aviso está escrito aqui e não numa documentação que ninguém abre.
 */

const AMBIENTES = [
  { valor: "2", label: "Sandbox (teste, não gasta saldo)" },
  { valor: "1", label: "Produção (compra frete de verdade)" },
];

type Configuracao = {
  envio_provedor: string | null;
  envio_ambiente: number;
  tem_token: boolean;
};

const ConfigEnvio = () => {
  const alert = useAlert();

  const [cfg, setCfg] = useState<Configuracao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const [token, setToken] = useState("");
  const [ambiente, setAmbiente] = useState<string>("");

  const carregar = async () => {
    try {
      const r = await CorreiosService.obterConfiguracao();
      const [c] = unwrapList<Configuracao>(r.data);

      setCfg(c ?? null);
      setAmbiente(String(c?.envio_ambiente ?? 2));
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível carregar a configuração de envio."));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    void carregar();
    // Só na montagem.
  }, []);

  const salvar = async () => {
    setSalvando(true);

    try {
      await CorreiosService.salvarConfiguracao({ token, ambiente: Number(ambiente) });

      setToken("");
      await carregar();

      setSalvo(true);
      setTimeout(() => setSalvo(false), 2000);
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível salvar."));
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <span className="flex items-center gap-2 text-[12px] text-faint">
        <Loader2 size={13} className="animate-spin" /> Carregando...
      </span>
    );
  }

  const conectado = Boolean(cfg?.tem_token);

  return (
    <div className="flex flex-col gap-4">
      {/* "Eu já consigo cotar?" — a mesma pergunta da tela fiscal, e pelo
          mesmo motivo: descobrir que falta token na hora de despachar é o
          pior momento possível. */}
      <div className={`rounded-xl border p-3.5 ${conectado ? "border-success/25 bg-success/[0.08]" : "border-warning/30 bg-warning/[0.08]"}`}>
        <div className="flex items-start gap-2.5">
          {conectado ? <Check size={16} className="mt-0.5 shrink-0 text-success" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />}

          <div className="min-w-0">
            <p className="text-[13px] text-ink">
              {conectado ? "Conta do Melhor Envio conectada." : "Conecte a conta do Melhor Envio para calcular frete e gerar etiqueta."}
            </p>

            <p className="mt-1 text-[11.5px] leading-relaxed text-mist">
              O token sai do painel do Melhor Envio, em Configurações › Tokens.{" "}
              {Number(ambiente) === 2
                ? "No sandbox o token é OUTRO — o do site de produção não funciona lá."
                : "Em produção, a etiqueta é comprada com o saldo da sua carteira."}
            </p>

            <a
              href={Number(ambiente) === 2 ? "https://sandbox.melhorenvio.com.br" : "https://melhorenvio.com.br"}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 flex items-center gap-1 text-[12px] text-accent-soft transition-colors hover:text-accent"
            >
              Abrir o Melhor Envio <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </div>

      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-[0.7px] text-faint">Ambiente</span>
        <Select valor={ambiente} aria-label="Ambiente do Melhor Envio" onChange={setAmbiente} opcoes={AMBIENTES} />
      </label>

      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-[0.7px] text-faint">Token</span>
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          type="password"
          autoComplete="off"
          placeholder={conectado ? "••••••••  (preencha só para trocar)" : "Cole o token do Melhor Envio"}
          className="h-[38px] w-full rounded-xl border border-fg/[0.08] bg-fg/[0.04] px-3 text-[12.5px] text-ink outline-none transition-colors focus:border-accent/50 placeholder:text-faint"
        />
      </label>

      <div className="flex items-center gap-2">
        <button
          onClick={() => void salvar()}
          disabled={salvando}
          className="focus-ring flex h-[38px] cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-br from-accent-soft to-accent px-4 text-[12.5px] text-white shadow-glow transition-all hover:brightness-110 disabled:opacity-50"
        >
          {salvando ? <Loader2 size={15} className="animate-spin" /> : salvo ? <Check size={15} /> : <Save size={15} />}
          {salvo ? "Salvo" : "Salvar"}
        </button>

        <span className="text-[11.5px] text-faint">O CEP de origem das cotações é o do endereço da empresa.</span>
      </div>
    </div>
  );
};

export default ConfigEnvio;
