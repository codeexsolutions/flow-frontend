import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, MessageCircle, MapPin, Save, CircleCheck, Factory, Truck } from "lucide-react";

import useEnterprise from "@/features/empresa/store/enterprise.store";
import { useAlert } from "@/shared/ui/Alert";
import { onlyDigits, formatDocument } from "@/shared/utils/format";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import { ehCpf } from "@/shared/utils/documento";
import { maskCep, maskPhone } from "@/shared/validation/masks";

import { SettingsCard } from "@/features/config/components/ConfigUI";
import { empresaSchema, identificacaoSchema, type EmpresaData, type EmpresaInput } from "@/features/config/schema/company.schema";
import EmpresaIdentificacao from "@/features/config/components/EmpresaIdentificacao";
import EmpresaContato from "@/features/config/components/EmpresaContato";
import EmpresaEndereco from "@/features/config/components/EmpresaEndereco";
import PixEmpresa from "@/features/config/components/PixEmpresa";
import DominioProprio from "@/features/config/components/DominioProprio";
import ProducaoAutomatica from "@/features/config/components/ProducaoAutomatica";
import ConfigEnvio from "@/features/config/components/ConfigEnvio";
import usePlano from "@/shared/plano/plano.store";

type EnterpriseLike = {
  id?: string;
  nomeFantasia?: string;
  name?: string;
  nomeRepresentante?: string;
  cpfCnpj?: string;
  inscMunicipal?: string;
  urlLogo?: string;
  notaBackground?: string;
  ocultarCpfNota?: boolean;
  /** O QR do Pix com que a nota nasce — ver `notaMostrarQr` no domínio. */
  notaMostrarQr?: boolean;
  producaoAutomatica?: boolean;
  producaoPlanilhaId?: string | null;
  contato?: { email?: string; celular?: string | number; telefone?: string | number; whatsapp?: string | number };
  endereco?: {
    cep?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade?: string;
    uf?: string;
  };
};

type TabId = "identificacao" | "contato" | "endereco" | "producao" | "envio";

/**
 * A aba de Produção só existe para quem tem o módulo.
 *
 * Ela configura uma automação da produção, e produção é módulo do plano
 * Professional para cima. Mostrá-la a quem não tem seria oferecer uma chave
 * que não liga nada — e o lugar de anunciar o que falta no plano é a tela de
 * planos, não uma aba de configuração que não faz efeito.
 */
const TABS: { id: TabId; label: string; icon: React.ReactNode; recurso?: string }[] = [
  { id: "identificacao", label: "Identificação", icon: <Building2 size={15} /> },
  { id: "contato", label: "Contato", icon: <MessageCircle size={15} /> },
  { id: "endereco", label: "Endereço", icon: <MapPin size={15} /> },
  { id: "producao", label: "Produção", icon: <Factory size={15} />, recurso: "producao" },
  /* O FISCAL mudou de casa: ele agora é a aba Fiscal do Balcão (PDV).
     A falta de NCM ou de CSC aparece na hora de emitir o cupom, e é lá que se
     resolve — não a duas telas de distância. */
  { id: "envio", label: "Envio", icon: <Truck size={15} />, recurso: "correios" },
];

const EmpresaPage = () => {
  const { enterprise, updateEnterprise, changeDocument } = useEnterprise();
  const ent = (enterprise ?? {}) as EnterpriseLike;
  const alert = useAlert();
  const [tab, setTab] = useState<TabId>("identificacao");

  /* Plano ainda não carregado esconde a aba paga: melhor ela aparecer um
     instante depois do que piscar e sumir para quem não a tem. */
  const meuPlano = usePlano((s) => s.meu);
  const abas = TABS.filter((t) => !t.recurso || meuPlano?.recursos?.[t.recurso] === true);

  /* ─── Save states individuais ─── */
  const [saving, setSaving] = useState<TabId | null>(null);
  const [savedTab, setSavedTab] = useState<TabId | null>(null);

  const {
    register,
    control,
    setValue,
    watch,
    getValues,
    formState: { errors },
  } = useForm<EmpresaInput, unknown, EmpresaData>({
    resolver: zodResolver(empresaSchema),
    defaultValues: {
      nomeFantasia: ent.nomeFantasia ?? ent.name ?? "",
      nomeRepresentante: ent.nomeRepresentante ?? "",
      cpfCnpj: formatDocument(ent.cpfCnpj ?? ""),
      inscMunicipal: ent.inscMunicipal ?? "",
      urlLogo: ent.urlLogo ?? "",
      notaBackground: ent.notaBackground ?? "",
      email: ent.contato?.email ?? "",
      celular: maskPhone(String(ent.contato?.celular ?? "")),
      telefone: maskPhone(String(ent.contato?.telefone ?? "")),
      whatsapp: maskPhone(String(ent.contato?.whatsapp ?? "")),
      cep: maskCep(ent.endereco?.cep ?? ""),
      logradouro: ent.endereco?.logradouro ?? "",
      numero: ent.endereco?.numero ?? "",
      complemento: ent.endereco?.complemento ?? "",
      bairro: ent.endereco?.bairro ?? "",
      cidade: ent.endereco?.cidade ?? "",
      uf: ent.endereco?.uf ?? "",
    },
  });

  const allData = () => getValues() as EmpresaData;

  const buscarCep = async () => {
    const cep = onlyDigits(getValues("cep"));
    if (cep.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data.erro) return;
      if (data.logradouro) setValue("logradouro", data.logradouro);
      if (data.bairro) setValue("bairro", data.bairro);
      if (data.localidade) setValue("cidade", data.localidade);
      if (data.uf) setValue("uf", data.uf);
    } catch {
      /* silencioso */
    }
  };

  const doSave = async (tabId: TabId, saveFn: () => Promise<void>) => {
    setSaving(tabId);
    setSavedTab(null);
    try {
      await saveFn();
      setSavedTab(tabId);
      setTimeout(() => setSavedTab(null), 2500);
    } catch (err) {
      if (!(err instanceof Error && err.message === "VALIDATION_HANDLED")) {
        /* A frase do servidor vem primeiro: as recusas do documento ("já existe
           empresa com este documento", "informe 11 ou 14 dígitos") dizem o que
           corrigir, e "Não foi possível salvar" não diz nada. */
        alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível salvar."));
      }
    } finally {
      setSaving(null);
    }
  };

  const salvarIdentificacao = async () => {
    const id = ent.id;
    if (!id) return;

    // Valida só os campos desta aba — usar o schema inteiro faria essa aba
    // falhar por causa de um campo obrigatório de Contato/Endereço (ex:
    // e-mail vazio) que nem está sendo editado agora.
    const parsed = identificacaoSchema.safeParse(getValues());
    if (!parsed.success) {
      alert.error("Campos inválidos", "Revise os campos de Identificação.");
      throw new Error("VALIDATION_HANDLED");
    }

    const data = parsed.data;

    await updateEnterprise(id, {
      nomeFantasia: data.nomeFantasia,
      nomeRepresentante: data.nomeRepresentante,
      inscMunicipal: data.inscMunicipal,
      urlLogo: data.urlLogo,
      notaBackground: data.notaBackground,
    });

    /*
     * O documento vai por outra rota, e só quando muda.
     *
     * Ele saiu do PATCH geral porque é a identidade da empresa: a rota própria
     * valida o formato, recusa um documento já usado por outro cadastro e
     * preserva o `codigo_empresa` — a chave que liga a empresa aos seus dados
     * em trinta tabelas e que não pode se mover. É o que permite abrir a conta
     * no CPF e passar para o CNPJ depois sem perder nada.
     *
     * Fica DEPOIS do update geral: se o documento for recusado, o resto já foi
     * salvo e o erro fala só do que falhou.
     */
    const documento = onlyDigits(data.cpfCnpj);

    if (documento && documento !== onlyDigits(ent.cpfCnpj ?? "")) {
      await changeDocument(id, documento);
    }
  };

  const salvarContato = async () => {
    if (!ent.id) return;
    const data = allData();
    await updateEnterprise(ent.id, {
      contato: {
        email: data.email,
        celular: onlyDigits(data.celular),
        telefone: onlyDigits(data.telefone),
        whatsapp: onlyDigits(data.whatsapp),
      },
    });
  };

  const salvarEndereco = async () => {
    if (!ent.id) return;
    const data = allData();
    await updateEnterprise(ent.id, {
      endereco: {
        cep: onlyDigits(data.cep),
        logradouro: data.logradouro,
        numero: data.numero,
        complemento: data.complemento,
        bairro: data.bairro,
        cidade: data.cidade,
        uf: data.uf,
      },
    });
  };

  const SaveBtn = ({ tabId, onClick }: { tabId: TabId; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={saving === tabId}
      className={`flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-[12px] transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${
        savedTab === tabId ? "bg-success/20 text-success" : "bg-accent text-white shadow-[0_6px_20px_-6px_rgb(var(--accent))] hover:brightness-110"
      }`}
    >
      {saving === tabId ? (
        "Salvando..."
      ) : savedTab === tabId ? (
        <>
          <CircleCheck size={15} /> Salvo
        </>
      ) : (
        <>
          <Save size={15} /> Salvar
        </>
      )}
    </button>
  );

  return (
    /*
     * A tela tem a altura da JANELA, e quem troca o conteúdo é a barra de abas.
     *
     * As seções continuam separadas (Identificação / Contato / Endereço) e cada
     * uma salva o seu — o que mudou foi o esqueleto. Antes a página crescia e
     * quem rolava era Configurações inteira: o cabeçalho da seção e o botão
     * Salvar saíam de vista junto com os campos, e o Salvar é justamente o que
     * se procura depois de mexer no último deles.
     *
     * Agora só o CORPO do cartão rola (`corpoRolavel`): cabeçalho e Salvar
     * ficam de pé. A coluna da direita — o cartão da empresa, o Pix e o
     * domínio — continua onde estava, porque é ela que fecha o grid; ela rola
     * por conta própria quando não couber.
     */
    <div className="grid grid-cols-1 items-start gap-4 pb-2 xl:min-h-0 xl:flex-1 xl:grid-cols-3 xl:items-stretch xl:pb-0">
      <div className="flex min-w-0 flex-col gap-4 xl:col-span-2 xl:min-h-0">
        <div className="flex w-fit shrink-0 items-center gap-1 rounded-lg border border-fg/[0.07] bg-fg/[0.03] p-1">
          {abas.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`focus-ring flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-[12px] transition-all ${tab === t.id ? "bg-accent text-white shadow-glow" : "text-mist hover:bg-fg/[0.06] hover:text-ink"}`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {tab === "identificacao" && (
          <SettingsCard corpoRolavel icon={<Building2 className="h-4 w-4" />} title="Identificação" desc="Dados principais da empresa" footer={<SaveBtn tabId="identificacao" onClick={() => doSave("identificacao", salvarIdentificacao)} />}>
            <EmpresaIdentificacao register={register} errors={errors} setValue={setValue} watch={watch} />

            {/*
             * A opção só aparece quando o documento É um CPF.
             *
             * Para quem tem CNPJ ela não decide nada — o CNPJ sempre sai na
             * nota — e um interruptor que não muda nada é pior que ausente:
             * quem o vê passa a duvidar do que está impresso.
             */}
            {/* O QR do Pix com que a nota NASCE. Fica ao lado do CPF porque
                as duas chaves decidem a mesma coisa: o que está impresso no
                papel que o cliente leva. Dentro da nota o interruptor
                continua, e é a escolha de lá que fica gravada na venda. */}
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-fg/[0.08] p-3">
              <input
                type="checkbox"
                checked={ent.notaMostrarQr !== false}
                onChange={(e) => {
                  if (ent.id) {
                    updateEnterprise(ent.id, { notaMostrarQr: e.target.checked }).catch((err) =>
                      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível salvar.")),
                    );
                  }
                }}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]"
              />

              <span className="min-w-0">
                <span className="block text-[13px] text-ink">Nota nasce com o QR do Pix</span>
                <span className="mt-0.5 block text-[11.5px] leading-relaxed text-faint">
                  Vale para as notas novas. Desligue se a sua loja recebe no cartão e o QR só ocupa espaço no papel.
                </span>
              </span>
            </label>

            {ehCpf(ent.cpfCnpj) && (
              <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-fg/[0.08] p-3">
                <input
                  type="checkbox"
                  checked={ent.ocultarCpfNota !== false}
                  onChange={(e) => {
                    if (ent.id) {
                      updateEnterprise(ent.id, { ocultarCpfNota: e.target.checked }).catch((err) =>
                        alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível salvar.")),
                      );
                    }
                  }}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]"
                />

                <span className="min-w-0">
                  <span className="block text-[13px] text-ink">Esconder o CPF nas notas</span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-faint">
                    Vale para o seu CPF e para o do cliente. A nota circula por WhatsApp e balcão — CNPJ é público, CPF
                    não. Desmarque se precisar do documento impresso.
                  </span>
                </span>
              </label>
            )}
          </SettingsCard>
        )}

        {tab === "producao" && (
          <SettingsCard corpoRolavel icon={<Factory className="h-4 w-4" />} title="Produção" desc="O que acontece com a venda de serviço depois de registrada">
            <ProducaoAutomatica />
          </SettingsCard>
        )}

        {tab === "envio" && (
          <SettingsCard corpoRolavel icon={<Truck className="h-4 w-4" />} title="Envio" desc="A conta que cota o frete e compra as etiquetas">
            <ConfigEnvio />
          </SettingsCard>
        )}

        {tab === "contato" && (
          <SettingsCard corpoRolavel icon={<MessageCircle className="h-4 w-4" />} title="Contato" desc="Telefones e e-mail da empresa" footer={<SaveBtn tabId="contato" onClick={() => doSave("contato", salvarContato)} />}>
            <EmpresaContato register={register} errors={errors} />
          </SettingsCard>
        )}

        {tab === "endereco" && (
          <SettingsCard corpoRolavel icon={<MapPin className="h-4 w-4" />} title="Endereço" desc="CEP e localização da empresa" footer={<SaveBtn tabId="endereco" onClick={() => doSave("endereco", salvarEndereco)} />}>
            <EmpresaEndereco register={register} control={control} errors={errors} onBuscarCep={buscarCep} />
          </SettingsCard>
        )}
      </div>

      {/* A coluna da empresa. Rola por dentro em vez de esticar a página: são
          três cartões de altura variável (o do domínio cresce com o passo a
          passo do DNS) e sem isto eles voltariam a empurrar a tela para baixo
          dos 100vh que ela acabou de ganhar. */}
      <aside className="flex min-w-0 flex-col gap-3 xl:min-h-0 xl:overflow-y-auto xl:pb-1 xl:pr-0.5">
        {/* O cartão da empresa saiu daqui para Configurações › Meu perfil: nesta
            tela ele repetia, em modo leitura, os mesmos campos que o
            formulário ao lado estava editando. */}
        {/* Chave Pix mora aqui: é cadastro da empresa, não assunto de nota. */}
        <PixEmpresa />
        {/* O endereço próprio também: é a identidade da empresa vista de fora,
            como o nome e a logo — e não configuração de planilha, apesar de
            quem o usa ser o link do cliente. */}
        <DominioProprio />
      </aside>
    </div>
  );
};

export default EmpresaPage;
