import { useEffect, useMemo, useState } from "react";
import { Package, ClipboardList, CheckCircle2, Clock, MapPin, FileText, XCircle, Printer, Truck, Loader2 } from "lucide-react";

import CorreiosService from "@/features/correios/services/correios.service";
import type { FreteResultado, PostagemType, PrePostagemDto } from "@/features/correios/types/correios.types";

import { TabelaCard, TabelaVazia, ListaCabecalho, ListaLinha, ListaFantasmas } from "@/shared/ui/DataTable";
import { Kpi, KpiFaixa } from "@/shared/ui/Painel";
import { Modal } from "@/shared/ui/Modal";
import { useAutoPageSize } from "@/shared/hooks/useAutoPageSize";
import { TabelaPaginacao } from "@/shared/ui/DataTable";
import { Form, FormSection, FormGrid, FormActions, TextField, SelectBox } from "@/shared/ui/form/FormKit";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import { money, formatCurrency } from "@/shared/utils/currency";
import { brDate } from "@/shared/utils/date";
import { onlyDigits } from "@/shared/utils/format";
import { maskCep } from "@/shared/validation/masks";
import { unwrapList } from "@/shared/api/types";
import useEnterprise from "@/features/empresa/store/enterprise.store";
import { Selo, type TomSelo } from "@/shared/ui/StatusBadge";


const SWATCH: Record<string, { label: string; tom: TomSelo }> = {
  PENDENTE: { label: "Pendente", tom: "alerta" },
  POSTADO: { label: "Postado", tom: "sucesso" },
  CANCELADO: { label: "Cancelado", tom: "neutro" },
  EM_TRANSITO: { label: "Em trânsito", tom: "info" },
  ENTREGUE: { label: "Entregue", tom: "sucesso" },
};

const StatusBadge = ({ status }: { status: string }) => {
  const s = SWATCH[status];
  return <Selo tom={s?.tom}>{s?.label ?? status}</Selo>;
};

const TOM_SERVICO: Record<string, TomSelo> = { SEDEX: "info", PAC: "alerta", SEDEX12: "sucesso" };

const ServicoBadge = ({ servico }: { servico: string }) => <Selo tom={TOM_SERVICO[servico]}>{servico}</Selo>;

type NovaPostagemForm = {
  /** 0 = ainda não cotou. É o id do serviço no provedor. */
  servicoId: number;
  servicoNome: string;
  cepDestino: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  peso: string;
  altura: string;
  largura: string;
  comprimento: string;
};

const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

const PostagemPage = () => {
  const { enterprise } = useEnterprise();
  const alert = useAlert();

  const [postagens, setPostagens] = useState<PostagemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<"TODAS" | "PENDENTE" | "POSTADO">("TODAS");
  const [showNova, setShowNova] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [detalheAberto, setDetalheAberto] = useState<PostagemType | null>(null);

  const abrirDetalhe = (p: PostagemType) => setDetalheAberto(p);

  /**
   * As opções de frete da cotação — e a escolhida.
   *
   * Elas só existem depois de "Calcular frete": preço e prazo dependem do CEP
   * e da caixa, e mostrar uma lista fixa de serviços antes disso é oferecer
   * escolha sobre o que ninguém sabe ainda.
   */
  const [opcoes, setOpcoes] = useState<FreteResultado[]>([]);
  const [cotando, setCotando] = useState(false);

  const [form, setForm] = useState<NovaPostagemForm>({
    servicoId: 0,
    servicoNome: "",
    cepDestino: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: "",
    peso: "0.5",
    altura: "4",
    largura: "12",
    comprimento: "18",
  });

  /**
   * Cota o frete para a caixa e o destino digitados.
   *
   * Limpa a escolha anterior de propósito: mudou o CEP ou a caixa, o preço que
   * estava na tela deixou de valer — e postar com ele seria despachar por um
   * valor que não existe mais.
   */
  const cotarFrete = async () => {
    if (!form.cepDestino) {
      alert.warning("Falta o CEP", "Informe o CEP de destino para calcular o frete.");
      return;
    }

    setCotando(true);
    setOpcoes([]);
    setForm((f) => ({ ...f, servicoId: 0, servicoNome: "" }));

    try {
      const r = await CorreiosService.calcularFrete({
        cepOrigem: onlyDigits(enterprise?.endereco?.cep ?? ""),
        cepDestino: onlyDigits(form.cepDestino),
        peso: Number(form.peso) || 0.5,
        altura: Number(form.altura) || 4,
        largura: Number(form.largura) || 12,
        comprimento: Number(form.comprimento) || 18,
      });

      const lista = unwrapList<FreteResultado>(r.data);

      setOpcoes(lista);

      if (!lista.some((o) => !o.erro)) {
        alert.warning("Nenhuma transportadora atende", "Confira o CEP e as medidas da caixa.");
      }
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível calcular o frete."));
    } finally {
      setCotando(false);
    }
  };

  const [page, setPage] = useState(1);

  const carregar = async () => {
    setLoading(true);
    try {
      const res = await CorreiosService.listarPostagens();
      const lista = unwrapList<PostagemType>(res.data);
      setPostagens(lista);
    } catch {
      setPostagens([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const postagensFiltradas = useMemo(() => {
    if (filtro === "TODAS") return postagens;
    return postagens.filter((p) => p.status === filtro);
  }, [postagens, filtro]);

  const resumo = useMemo(() => ({
    total: postagens.length,
    pendentes: postagens.filter((p) => p.status === "PENDENTE").length,
    postadas: postagens.filter((p) => p.status === "POSTADO" || p.status === "EM_TRANSITO" || p.status === "ENTREGUE").length,
  }), [postagens]);

  /* Paginação — mesmo padrão de Clientes e Estoque. */
  const ROTULOS = ["Objeto", "Serviço", "Valor", "Data", "Status", "Ações"];
  const COLS = "grid-cols-[minmax(160px,1.2fr)_120px_110px_110px_120px_100px]";
  const ALTURA_LINHA = 56;
  const { bodyRef, perPage } = useAutoPageSize<HTMLDivElement>({ rowHeight: ALTURA_LINHA + 1, offset: 40 });
  const totalPages = Math.max(1, Math.ceil(postagensFiltradas.length / perPage));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handleCriarPostagem = async () => {
    if (!enterprise) return;
    if (!form.cepDestino || !form.logradouro || !form.bairro || !form.cidade || !form.uf) {
      alert.warning("Campos obrigatórios", "Preencha o endereço de destino completo.");
      return;
    }

    /* Sem serviço escolhido não há o que comprar — e comprar é o que esta tela
       faz: o frete sai do saldo da conta assim que a etiqueta é gerada. */
    if (!form.servicoId) {
      alert.warning("Falta escolher o frete", "Calcule o frete e escolha uma transportadora antes de gerar a etiqueta.");
      return;
    }

    setSalvando(true);
    try {
      const payload: PrePostagemDto = {
        contrato: enterprise.codigoEmpresa,
        servicoId: form.servicoId,
        servico: form.servicoNome,
        remetente: {
          nome: enterprise.nomeFantasia,
          cpfCnpj: enterprise.cpfCnpj,
          logradouro: enterprise.endereco?.logradouro ?? "",
          numero: enterprise.endereco?.numero ?? "",
          complemento: enterprise.endereco?.complemento,
          bairro: enterprise.endereco?.bairro ?? "",
          cidade: enterprise.endereco?.cidade ?? "",
          uf: enterprise.endereco?.uf ?? "",
          cep: enterprise.endereco?.cep ?? "",
          telefone: enterprise.contato?.telefone,
          email: enterprise.contato?.email,
        },
        destinatario: {
          nome: "Cliente",
          cpfCnpj: "",
          logradouro: form.logradouro,
          numero: form.numero,
          complemento: form.complemento,
          bairro: form.bairro,
          cidade: form.cidade,
          uf: form.uf,
          cep: onlyDigits(form.cepDestino),
        },
        itensDeclaracao: [],
        peso: Number(form.peso) || 0.5,
        comprimento: Number(form.comprimento) || 18,
        altura: Number(form.altura) || 4,
        largura: Number(form.largura) || 12,
      };

      await CorreiosService.solicitarPostagem(payload);
      alert.success("Postagem solicitada!", "O objeto foi registrado com sucesso.");
      setShowNova(false);
      await carregar();
    } catch (err) {

      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível solicitar a postagem."));
    } finally {
      setSalvando(false);
    }
  };

  const handleEmitirDAE = async (id: string) => {
    try {
      const res = await CorreiosService.emitirDAE(id);
      const daeUrl = res.data?.data?.[0]?.urlDAE;
      if (daeUrl) {
        window.open(daeUrl, "_blank");
        alert.success("DAE emitido!", "O Documento de Arrecadação foi aberto.");
      } else {
        alert.success("DAE emitido!", "Documento gerado com sucesso.");
      }
      await carregar();
    } catch (err) {

      alert.error(getErrorTitle(err), extractErrorMessage(err, "Falha ao emitir o DAE."));
    }
  };

  const handleCancelar = async (id: string) => {
    try {
      await CorreiosService.cancelarPostagem(id);
      alert.success("Cancelada", "A postagem foi cancelada.");
      await carregar();
    } catch (err) {

      alert.error(getErrorTitle(err), extractErrorMessage(err, "Falha ao cancelar a postagem."));
    }
  };

  /* A tabela desta tela usa `ListaCabecalho`/`ListaLinha` (altura fixa,
     paginação sem rolagem). O array `Coluna[]` do outro formato ficou aqui
     órfão de um refactor anterior e foi removido. */

  return (
    <div className="flex flex-col gap-4">
      {/* KPIs no topo — o mesmo padrão do Stock e Funcionarios. */}
      <KpiFaixa className="shrink-0 sm:grid-cols-3">
        <Kpi icon={<Package size={17} />} tone="accent" label="Total de postagens" value={String(resumo.total)} />
        <Kpi icon={<Clock size={17} />} tone="warning" label="Pendentes" value={String(resumo.pendentes)} />
        <Kpi icon={<CheckCircle2 size={17} />} tone="success" label="Postadas" value={String(resumo.postadas)} />
      </KpiFaixa>

      {/* Tabela */}
      <TabelaCard
        title="Postagens"
        icon={<ClipboardList size={15} />}
        count={postagensFiltradas.length}
        countLabel={postagensFiltradas.length === 1 ? "postagem" : "postagens"}
        onAdd={() => setShowNova(true)}
        addLabel="Nova postagem"
        bodyRef={bodyRef}
        footer={
          totalPages > 1 && (
            <TabelaPaginacao
              pagina={page}
              totalPaginas={totalPages}
              onPagina={setPage}
              resumo={`${postagensFiltradas.length} ${postagensFiltradas.length === 1 ? "postagem" : "postagens"}`}
            />
          )
        }
        pagina={{ label: "Postagens", icon: <ClipboardList size={13} /> }}
        filters={
          <div className="flex items-center gap-1 rounded-lg border border-fg/[0.07] bg-fg/[0.03] p-1">
            {([["TODAS", "Todas"], ["PENDENTE", "Pendentes"], ["POSTADO", "Postadas"]] as const).map(([id, label]) => (
              <button key={id} onClick={() => setFiltro(id)} className={`cursor-pointer rounded-md px-2.5 py-1 text-[11px] transition-colors ${filtro === id ? "bg-accent text-white" : "text-mist hover:text-ink"}`}>
                {label}
              </button>
            ))}
          </div>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-faint">Carregando...</div>
        ) : postagensFiltradas.length === 0 ? (
          <TabelaVazia icon={<Package size={20} />} title="Nenhuma postagem encontrada" description="Solicite uma pré-postagem para gerar etiqueta e DAE." />
        ) : (
          <>
            {/* Cabeçalho — desktop */}
            <ListaCabecalho cols={COLS}>
              {ROTULOS.map((r, i) => (
                <p key={r ?? `vazio-${i}`} className={i >= 2 ? "text-right" : undefined}>{r}</p>
              ))}
            </ListaCabecalho>

            {/* Linhas clicáveis — navegam para o detalhe da postagem. */}
            {postagensFiltradas.slice((page - 1) * perPage, page * perPage).map((p) => (
              <ListaLinha
                key={p.id}
                cols={COLS}
                altura={ALTURA_LINHA}
                rotulos={ROTULOS}
                ariaLabel={`Abrir postagem ${p.codigoObjeto || p.id}`}
                onClick={() => abrirDetalhe(p)}
                destaque={p.status === "PENDENTE" ? "warning" : undefined}
                acoes={
                  <span className="flex items-center gap-1">
                    {p.status === "PENDENTE" && (
                      <>
                        <button onClick={() => handleEmitirDAE(p.id)} title="Emitir DAE" className="focus-ring rounded-lg bg-fg/[0.05] p-1.5 text-faint transition-colors hover:bg-success/20 hover:text-success">
                          <FileText size={14} />
                        </button>
                        <button onClick={() => handleCancelar(p.id)} title="Cancelar" className="focus-ring rounded-lg bg-fg/[0.05] p-1.5 text-faint transition-colors hover:bg-danger/20 hover:text-danger">
                          <XCircle size={14} />
                        </button>
                      </>
                    )}
                    {p.etiqueta && (
                      <button
                        onClick={() => window.open(`/api/correios/postagens/${p.id}/etiqueta`, "_blank")}
                        title="Imprimir etiqueta"
                        className="focus-ring rounded-lg bg-fg/[0.05] p-1.5 text-faint transition-colors hover:bg-accent/20 hover:text-accent-soft"
                      >
                        <Printer size={14} />
                      </button>
                    )}
                  </span>
                }
              >
                {/* Objeto */}
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/[0.12] text-accent-soft ring-1 ring-inset">
                    <Package size={13} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-mono text-[11px] text-accent-soft">{p.codigoObjeto || "—"}</span>
                    <span className="block truncate text-[11px] text-faint">{p.cliente}</span>
                  </span>
                </span>

                {/* Serviço */}
                <span><ServicoBadge servico={p.servico} /></span>

                {/* Valor */}
                <span className="nums text-right text-[12px] text-ink">{money(p.valorFrete)}</span>

                {/* Data */}
                <span className="nums text-right text-[12px] text-mist">{brDate(p.dataPostagem)}</span>

                {/* Status */}
                <span className="flex justify-end"><StatusBadge status={p.status} /></span>
              </ListaLinha>
            ))}

            <ListaFantasmas quantidade={Math.max(0, perPage - postagensFiltradas.length)} altura={ALTURA_LINHA} />
          </>
        )}
      </TabelaCard>

      {/* Modal: Nova Postagem */}
      <Modal open={showNova} onClose={() => setShowNova(false)} title="Nova postagem" subtitle="Preencha os dados do destinatário" size="lg">
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            handleCriarPostagem();
          }}
        >
          {/* ─────────────── O FRETE, cotado de verdade ───────────────
              A escolha vem DEPOIS do preço, não antes. As opções chegam com
              transportadora, valor e prazo juntos — inclusive as que recusaram
              a rota, porque "a Jadlog não entrega neste CEP" é resposta, e
              escondê-la faz procurar por uma opção que nunca vai aparecer. */}
          <FormSection title="Frete" icon={<Truck size={14} />}>
            <button
              type="button"
              onClick={() => void cotarFrete()}
              disabled={cotando}
              className="focus-ring flex h-[38px] cursor-pointer items-center gap-2 rounded-lg border border-fg/[0.1] px-3 text-[12.5px] text-mist transition-colors hover:border-accent/40 hover:text-accent-soft disabled:opacity-50"
            >
              {cotando ? <Loader2 size={14} className="animate-spin" /> : <Truck size={14} />}
              {opcoes.length ? "Calcular de novo" : "Calcular frete"}
            </button>

            {opcoes.length > 0 && (
              <div className="mt-2 flex flex-col gap-1.5">
                {opcoes.map((o) => {
                  const indisponivel = Boolean(o.erro);
                  const escolhido = form.servicoId === o.servicoId;

                  return (
                    <button
                      key={`${o.servicoId}-${o.servico}`}
                      type="button"
                      disabled={indisponivel}
                      onClick={() => setForm({ ...form, servicoId: o.servicoId, servicoNome: o.servico })}
                      className={`focus-ring flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-[12.5px] transition-colors ${
                        escolhido
                          ? "border-accent/50 bg-accent/15 text-accent-soft"
                          : indisponivel
                            ? "cursor-not-allowed border-fg/[0.06] text-faint"
                            : "cursor-pointer border-fg/[0.1] text-mist hover:border-accent/40 hover:text-ink"
                      }`}
                    >
                      <span className="min-w-0 truncate">{o.servico}</span>

                      {indisponivel ? (
                        <span className="shrink-0 text-[11px] text-faint">{o.erro}</span>
                      ) : (
                        <span className="shrink-0 nums">
                          {formatCurrency(o.valor)}
                          <span className="ml-2 text-faint">{o.prazo} {o.prazo === 1 ? "dia" : "dias"}</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </FormSection>

          <FormSection title="Destinatário" icon={<MapPin size={14} />}>
            <FormGrid cols={2}>
              <TextField
                label="CEP"
                value={form.cepDestino}
                onChange={(e) => setForm({ ...form, cepDestino: maskCep(e.target.value) })}
                placeholder="00000-000"
                inputMode="numeric"
              />
              <TextField label="Número" value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} placeholder="123" />
            </FormGrid>
            <TextField label="Logradouro" value={form.logradouro} onChange={(e) => setForm({ ...form, logradouro: e.target.value })} placeholder="Rua, avenida..." />
            <FormGrid cols={2}>
              <TextField label="Bairro" value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} placeholder="Bairro" />
              <TextField label="Complemento" value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} placeholder="Opcional" />
            </FormGrid>
            <FormGrid cols={2}>
              <TextField label="Cidade" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} placeholder="Cidade" />
              <SelectBox label="UF" value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value })}>
                <option value="">—</option>
                {UFS.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </SelectBox>
            </FormGrid>
            {/* A CAIXA — é ela que define o preço, junto do CEP. Os valores
                iniciais são os de um envelope pequeno: quem despacha sempre a
                mesma coisa não precisa mexer. */}
            <FormGrid cols={2}>
              <TextField
                label="Peso (kg)"
                type="number"
                min={0}
                step="0.1"
                value={form.peso}
                onChange={(e) => setForm({ ...form, peso: e.target.value })}
              />
              <TextField
                label="Altura (cm)"
                type="number"
                min={0}
                value={form.altura}
                onChange={(e) => setForm({ ...form, altura: e.target.value })}
              />
              <TextField
                label="Largura (cm)"
                type="number"
                min={0}
                value={form.largura}
                onChange={(e) => setForm({ ...form, largura: e.target.value })}
              />
              <TextField
                label="Comprimento (cm)"
                type="number"
                min={0}
                value={form.comprimento}
                onChange={(e) => setForm({ ...form, comprimento: e.target.value })}
              />
            </FormGrid>
          </FormSection>

          <FormActions onCancel={() => setShowNova(false)} saving={salvando} submitText="Solicitar postagem" />
        </Form>
      </Modal>

      {/* Detalhe da postagem — abre ao clicar na linha. */}
      <Modal
        open={!!detalheAberto}
        onClose={() => setDetalheAberto(null)}
        title="Detalhes da postagem"
        subtitle={detalheAberto?.codigoObjeto || detalheAberto?.id}
        size="md"
      >
        {detalheAberto && (
          <div className="flex flex-col gap-4 text-[13px]">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <dt className="text-[10px] uppercase tracking-wider text-faint">Código do objeto</dt>
              <dd className="font-mono text-ink">{detalheAberto.codigoObjeto || "—"}</dd>

              <dt className="text-[10px] uppercase tracking-wider text-faint">Cliente</dt>
              <dd className="text-ink">{detalheAberto.cliente || "—"}</dd>

              <dt className="text-[10px] uppercase tracking-wider text-faint">Serviço</dt>
              <dd><ServicoBadge servico={detalheAberto.servico} /></dd>

              <dt className="text-[10px] uppercase tracking-wider text-faint">Valor</dt>
              <dd className="nums text-ink">{money(detalheAberto.valorFrete)}</dd>

              <dt className="text-[10px] uppercase tracking-wider text-faint">Data de postagem</dt>
              <dd className="nums text-mist">{brDate(detalheAberto.dataPostagem)}</dd>

              <dt className="text-[10px] uppercase tracking-wider text-faint">Situação</dt>
              <dd><StatusBadge status={detalheAberto.status} /></dd>

              {detalheAberto.etiqueta && (
                <>
                  <dt className="text-[10px] uppercase tracking-wider text-faint">Etiqueta</dt>
                  <dd className="truncate"><a href={`/api/correios/postagens/${detalheAberto.id}/etiqueta`} target="_blank" rel="noopener noreferrer" className="text-accent-soft hover:underline">Ver etiqueta</a></dd>
                </>
              )}
            </dl>

            <div className="flex justify-end gap-2 border-t border-fg/[0.06] pt-4">
              {detalheAberto.status === "PENDENTE" && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      void handleEmitirDAE(detalheAberto.id);
                    }}
                    className="focus-ring flex items-center gap-1.5 rounded-lg border border-success/30 bg-success/[0.12] px-3 py-2 text-[12px] text-success transition-colors hover:bg-success/20"
                  >
                    <FileText size={13} /> Emitir DAE
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleCancelar(detalheAberto.id)}
                    className="focus-ring flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/[0.12] px-3 py-2 text-[12px] text-danger transition-colors hover:bg-danger/20"
                  >
                    <XCircle size={13} /> Cancelar postagem
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => setDetalheAberto(null)}
                className="focus-ring rounded-lg border border-fg/[0.1] px-3 py-2 text-[12px] text-mist transition-colors hover:text-ink"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default PostagemPage;
