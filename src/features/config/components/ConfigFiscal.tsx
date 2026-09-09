import { useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, Save, Search } from "lucide-react";

import FiscalService, { type ConfiguracaoFiscal, type ProdutoFiscal } from "@/features/fiscal/services/fiscal.service";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import Select from "@/shared/ui/Select";

/**
 * CONFIGURAÇÕES › FISCAL — o que a empresa precisa para emitir cupom.
 *
 * ---------------------------------------------------------------------------
 * A tela é uma LISTA DE PENDÊNCIAS antes de ser um formulário
 * ---------------------------------------------------------------------------
 * Emitir NFC-e não falha por bug: falha por cadastro incompleto — falta a
 * Inscrição Estadual, falta o CSC, faltam 34 produtos sem NCM. E o pior lugar
 * do mundo para descobrir isso é o balcão, com o cliente esperando o cupom.
 *
 * Por isso o alto da tela responde uma pergunta só: "eu já consigo emitir?".
 * O formulário vem depois, como o caminho para chegar ao sim.
 *
 * ---------------------------------------------------------------------------
 * Os segredos não voltam preenchidos
 * ---------------------------------------------------------------------------
 * A credencial do provedor e o CSC autorizam emitir em nome da empresa. Eles
 * são gravados e nunca mais lidos pela tela: o campo mostra "configurado" e
 * fica vazio. Deixá-lo vazio ao salvar não apaga nada — trocar é digitar por
 * cima. Um formulário que devolvesse o valor real entregaria a credencial a
 * qualquer um que abrisse o DevTools na máquina do caixa.
 *
 * ---------------------------------------------------------------------------
 * Homologação é o padrão, e isso é de propósito
 * ---------------------------------------------------------------------------
 * A primeira nota de toda empresa tem de ser um teste. Em homologação a SEFAZ
 * responde igual, mas o documento não vale — e a descrição do primeiro item
 * sai como "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO". Passar para
 * produção é uma decisão consciente, tomada aqui.
 */

const REGIMES = [
  { valor: "1", label: "Simples Nacional" },
  { valor: "2", label: "Simples Nacional — excesso de sublimite" },
  { valor: "3", label: "Regime Normal" },
];

const AMBIENTES = [
  { valor: "2", label: "Homologação (teste, sem valor fiscal)" },
  { valor: "1", label: "Produção (vale de verdade)" },
];

/** O rótulo curto e o campo, no mesmo desenho dos outros cartões. */
const Campo = ({
  rotulo,
  apoio,
  children,
}: {
  rotulo: string;
  apoio?: string;
  children: React.ReactNode;
}) => (
  <label className="flex min-w-0 flex-col gap-1.5">
    <span className="text-[10px] uppercase tracking-[0.7px] text-faint">{rotulo}</span>
    {children}
    {apoio && <span className="text-[11px] leading-relaxed text-faint">{apoio}</span>}
  </label>
);

const entrada =
  "h-[38px] w-full rounded-xl border border-fg/[0.08] bg-fg/[0.04] px-3 text-[12.5px] text-ink outline-none transition-colors focus:border-accent/50 placeholder:text-faint";

const ConfigFiscal = () => {
  const alert = useAlert();

  const [cfg, setCfg] = useState<ConfiguracaoFiscal | null>(null);
  const [pendencias, setPendencias] = useState<{ empresa: string[]; produtos: number }>({ empresa: [], produtos: 0 });
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  /* O formulário é um rascunho separado do que está gravado: sem isso, cada
     tecla digitada já contaria como "configurado" na lista de pendências. */
  const [form, setForm] = useState<Record<string, string>>({});

  const [produtos, setProdutos] = useState<ProdutoFiscal[]>([]);
  const [busca, setBusca] = useState("");
  const [salvandoProduto, setSalvandoProduto] = useState<string | null>(null);

  const carregar = async () => {
    try {
      const [c, p, lista] = await Promise.all([
        FiscalService.configuracao(),
        FiscalService.pendencias(),
        FiscalService.produtos(),
      ]);

      setCfg(c);
      setPendencias(p);
      setProdutos(lista);
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível carregar a configuração fiscal."));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    void carregar();
    // Só na montagem.
  }, []);

  const campo = (nome: string, atual?: string | number | null) => ({
    value: form[nome] ?? (atual === null || atual === undefined ? "" : String(atual)),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [nome]: e.target.value })),
  });

  const salvar = async () => {
    setSalvando(true);

    try {
      await FiscalService.salvarConfiguracao({
        inscricaoEstadual: form.inscricaoEstadual ?? cfg?.insc_estadual ?? "",
        regime: form.regime ?? cfg?.regime_tributario ?? "",
        uf: form.uf ?? cfg?.fiscal_uf ?? "",
        municipioIbge: form.municipioIbge ?? cfg?.fiscal_municipio_ibge ?? "",
        ambiente: form.ambiente ?? cfg?.fiscal_ambiente ?? 2,
        serie: form.serie ?? cfg?.nfce_serie ?? 1,
        proximoNumero: form.proximoNumero ?? "",
        cscId: form.cscId ?? cfg?.nfce_csc_id ?? "",
        /* Vazio = não mexi. Ver o cabeçalho. */
        csc: form.csc ?? "",
        token: form.token ?? "",
        provedor: "NUVEM_FISCAL",
      });

      setForm({});
      await carregar();

      setSalvo(true);
      setTimeout(() => setSalvo(false), 2000);
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível salvar."));
    } finally {
      setSalvando(false);
    }
  };

  /* ─────────────── A classificação de um produto ─────────────── */

  const classificar = async (p: ProdutoFiscal, mudanca: Partial<Record<string, string>>) => {
    setSalvandoProduto(p.id);

    try {
      await FiscalService.classificarProduto(p.id, {
        ncm: mudanca.ncm ?? p.ncm ?? "",
        cest: mudanca.cest ?? p.cest ?? "",
        cfop: mudanca.cfop ?? p.cfop ?? "",
        cst: mudanca.cst ?? p.cst ?? "",
        origem: mudanca.origem ?? (p.origem === null ? "" : String(p.origem)),
        unidadeTributavel: mudanca.unidadeTributavel ?? p.unidade_tributavel ?? "",
      });

      /* Otimista na linha, e a contagem de pendências relida: é ela que diz
         quando o catálogo ficou pronto, e é o número que a pessoa acompanha. */
      setProdutos((lista) => lista.map((x) => (x.id === p.id ? { ...x, ...renomear(mudanca) } : x)));
      setPendencias(await FiscalService.pendencias());
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível classificar o produto."));
    } finally {
      setSalvandoProduto(null);
    }
  };

  /** Do nome do formulário para o nome da coluna. */
  const renomear = (m: Partial<Record<string, string>>) => ({
    ...(m.ncm !== undefined ? { ncm: m.ncm } : {}),
    ...(m.cest !== undefined ? { cest: m.cest } : {}),
    ...(m.cfop !== undefined ? { cfop: m.cfop } : {}),
    ...(m.cst !== undefined ? { cst: m.cst } : {}),
    ...(m.origem !== undefined ? { origem: Number(m.origem) } : {}),
    ...(m.unidadeTributavel !== undefined ? { unidade_tributavel: m.unidadeTributavel } : {}),
  });

  const filtrados = produtos.filter((p) => {
    const termo = busca.trim().toLowerCase();
    return !termo || p.nome.toLowerCase().includes(termo) || (p.sku ?? "").toLowerCase().includes(termo);
  });

  const pronto = pendencias.empresa.length === 0;

  if (carregando) {
    return (
      <span className="flex items-center gap-2 text-[12px] text-faint">
        <Loader2 size={13} className="animate-spin" /> Carregando a configuração fiscal...
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ─────────── "Eu já consigo emitir?" ─────────── */}
      <div className={`rounded-xl border p-3.5 ${pronto ? "border-success/25 bg-success/[0.08]" : "border-warning/30 bg-warning/[0.08]"}`}>
        <div className="flex items-start gap-2.5">
          {pronto ? <Check size={16} className="mt-0.5 shrink-0 text-success" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />}

          <div className="min-w-0">
            <p className="text-[13px] text-ink">
              {pronto ? "O cadastro da empresa está completo." : "Falta preencher para emitir cupom."}
            </p>

            {!pronto && (
              <p className="mt-1 text-[11.5px] leading-relaxed text-mist">
                {pendencias.empresa.join(" · ")}
              </p>
            )}

            {pendencias.produtos > 0 && (
              <p className="mt-1 text-[11.5px] leading-relaxed text-mist">
                <span className="text-warning">{pendencias.produtos}</span>{" "}
                {pendencias.produtos === 1 ? "produto ainda não está classificado" : "produtos ainda não estão classificados"} —
                a venda que incluir um deles é recusada dizendo qual.
              </p>
            )}

            {/* Homologação é estado normal, mas precisa ser dito: um cupom
                emitido aqui não vale, e o cliente que o levar não tem nota. */}
            {cfg?.fiscal_ambiente === 2 && (
              <p className="mt-1 text-[11.5px] leading-relaxed text-faint">
                Ambiente de <span className="text-ink">homologação</span>: os cupons são de teste e não têm valor fiscal.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ─────────── O cadastro ─────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo rotulo="Inscrição Estadual" apoio="Só os números, sem pontos.">
          <input {...campo("inscricaoEstadual", cfg?.insc_estadual)} className={entrada} placeholder="000000000" />
        </Campo>

        <Campo rotulo="Regime tributário" apoio="Decide se o produto usa CSOSN (Simples) ou CST (Normal).">
          <Select
            valor={form.regime ?? String(cfg?.regime_tributario ?? "")}
            aria-label="Regime tributário"
            placeholder="Escolha o regime"
            onChange={(v) => setForm((f) => ({ ...f, regime: v }))}
            opcoes={REGIMES}
          />
        </Campo>

        <Campo rotulo="UF" apoio="A sigla do estado do emitente.">
          <input {...campo("uf", cfg?.fiscal_uf)} maxLength={2} className={`${entrada} uppercase`} placeholder="PB" />
        </Campo>

        <Campo rotulo="Código IBGE do município" apoio="7 dígitos. Os dois primeiros são o código da UF na chave.">
          <input {...campo("municipioIbge", cfg?.fiscal_municipio_ibge)} className={entrada} placeholder="2507507" />
        </Campo>

        <Campo rotulo="Ambiente">
          <Select
            valor={form.ambiente ?? String(cfg?.fiscal_ambiente ?? 2)}
            aria-label="Ambiente de emissão"
            onChange={(v) => setForm((f) => ({ ...f, ambiente: v }))}
            opcoes={AMBIENTES}
          />
        </Campo>

        <Campo rotulo="Série da NFC-e" apoio={`Próximo número: ${cfg?.nfce_proximo_numero ?? 1}`}>
          <input {...campo("serie", cfg?.nfce_serie)} inputMode="numeric" className={entrada} placeholder="1" />
        </Campo>

        <Campo rotulo="Identificador do CSC (CSC ID)" apoio="Entregue pela SEFAZ no credenciamento da NFC-e.">
          <input {...campo("cscId", cfg?.nfce_csc_id)} className={entrada} placeholder="000001" />
        </Campo>

        <Campo rotulo="CSC" apoio={cfg?.tem_csc ? "Já configurado. Preencha só para trocar." : "Sem ele não há QR Code no cupom."}>
          <input
            value={form.csc ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, csc: e.target.value }))}
            type="password"
            autoComplete="off"
            className={entrada}
            placeholder={cfg?.tem_csc ? "••••••••" : "Cole o código da SEFAZ"}
          />
        </Campo>

        <Campo
          rotulo="Credencial da Nuvem Fiscal"
          apoio={
            cfg?.tem_token
              ? "Já configurada. Preencha só para trocar."
              : "No formato client_id:client_secret, do painel da Nuvem Fiscal."
          }
        >
          <input
            value={form.token ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))}
            type="password"
            autoComplete="off"
            className={entrada}
            placeholder={cfg?.tem_token ? "••••••••" : "client_id:client_secret"}
          />
        </Campo>

        <Campo rotulo="Ajustar o próximo número" apoio="Só para quem migrou de outro emissor e precisa continuar a numeração.">
          <input value={form.proximoNumero ?? ""} onChange={(e) => setForm((f) => ({ ...f, proximoNumero: e.target.value }))} inputMode="numeric" className={entrada} placeholder="deixe vazio para não mexer" />
        </Campo>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => void salvar()}
          disabled={salvando}
          className="focus-ring flex h-[38px] cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-br from-accent-soft to-accent px-4 text-[12.5px] text-white shadow-glow transition-all hover:brightness-110 disabled:opacity-50"
        >
          {salvando ? <Loader2 size={15} className="animate-spin" /> : salvo ? <Check size={15} /> : <Save size={15} />}
          {salvo ? "Salvo" : "Salvar"}
        </button>

        <span className="text-[11.5px] text-faint">
          O certificado digital A1 é enviado no painel da Nuvem Fiscal, não aqui.
        </span>
      </div>

      {/* ─────────── A classificação do catálogo ─────────── */}
      <div className="mt-1 flex flex-col gap-2.5 border-t border-fg/[0.06] pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[13px] text-ink">Classificação fiscal dos produtos</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-faint">
              NCM, CFOP, CST e origem de cada item. Sem palpite: o sistema deixa em branco até alguém classificar,
              porque NCM chutado é autuação.
            </p>
          </div>

          <div className="glass-subtle flex min-w-[180px] items-center gap-2 rounded-xl px-3">
            <Search className="h-4 w-4 shrink-0 text-muted" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar produto…"
              className="w-full flex-1 bg-transparent py-2 text-[12.5px] text-ink outline-none placeholder:text-faint"
            />
          </div>
        </div>

        {filtrados.length === 0 ? (
          <p className="rounded-xl border border-success/25 bg-success/[0.08] p-3 text-[12.5px] text-ink">
            {produtos.length === 0 ? "Todos os produtos ativos estão classificados." : "Nenhum produto encontrado nesta busca."}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {filtrados.map((p) => (
              <div key={p.id} className="rounded-xl border border-fg/[0.07] p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{p.nome}</span>
                  {p.sku && <span className="shrink-0 font-mono text-[10.5px] text-faint">{p.sku}</span>}
                  {salvandoProduto === p.id && <Loader2 size={13} className="shrink-0 animate-spin text-accent" />}
                </div>

                {/* `onBlur` e não `onChange`: gravar a cada tecla mandaria um
                    NCM pela metade ao servidor e o rejeitaria por tamanho. */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                  <input defaultValue={p.ncm ?? ""} onBlur={(e) => e.target.value !== (p.ncm ?? "") && void classificar(p, { ncm: e.target.value })} placeholder="NCM" className={entrada} />
                  <input defaultValue={p.cfop ?? ""} onBlur={(e) => e.target.value !== (p.cfop ?? "") && void classificar(p, { cfop: e.target.value })} placeholder="CFOP" className={entrada} />
                  <input defaultValue={p.cst ?? ""} onBlur={(e) => e.target.value !== (p.cst ?? "") && void classificar(p, { cst: e.target.value })} placeholder="CST/CSOSN" className={entrada} />
                  <input defaultValue={p.origem === null ? "" : String(p.origem)} onBlur={(e) => e.target.value !== (p.origem === null ? "" : String(p.origem)) && void classificar(p, { origem: e.target.value })} placeholder="Origem" className={entrada} />
                  <input defaultValue={p.cest ?? ""} onBlur={(e) => e.target.value !== (p.cest ?? "") && void classificar(p, { cest: e.target.value })} placeholder="CEST" className={entrada} />
                  <input defaultValue={p.unidade_tributavel ?? ""} onBlur={(e) => e.target.value !== (p.unidade_tributavel ?? "") && void classificar(p, { unidadeTributavel: e.target.value })} placeholder={p.unidade || "UN"} className={entrada} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ConfigFiscal;
