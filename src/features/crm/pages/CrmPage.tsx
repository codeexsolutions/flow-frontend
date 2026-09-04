import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox, KanbanSquare, Loader2, MessageCircle, Search, Settings2, UserRound, X } from "lucide-react";

import CrmService, { type Conexao, type Conversa, type Etapa } from "@/features/crm/services/crm.service";
import ConexaoWhatsapp from "@/features/crm/components/ConexaoWhatsapp";
import ConversaAberta from "@/features/crm/components/Conversa";
import QuadroFunil from "@/features/crm/components/QuadroFunil";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import { useSincronizacao } from "@/shared/realtime/useSincronizacao";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import { PageScreen } from "@/shared/ui/PageShell";

/**
 * O CRM de WhatsApp.
 *
 * ---------------------------------------------------------------------------
 * Três telas numa, e por quê
 * ---------------------------------------------------------------------------
 * Conexão, caixa de entrada e funil são o mesmo assunto visto de três alturas,
 * e separá-las em destinos de menu criaria o problema que o menu já teve com
 * Planilhas e Produção: a pessoa procura a conversa e acha a tela de conectar.
 *
 * A conexão nem é uma aba — ela TOMA a tela quando não há sessão. Sem WhatsApp
 * conectado não existe caixa de entrada para mostrar, e uma lista vazia com um
 * botão de conectar escondido num canto é como o recurso morre sem nunca ter
 * sido usado.
 *
 * ---------------------------------------------------------------------------
 * O tempo real aqui não é enfeite
 * ---------------------------------------------------------------------------
 * Esta é a única tela do sistema em que o dado chega por um caminho que o
 * usuário não provocou: o cliente escreveu, e o serviço gravou. Sem o aviso de
 * `crm`, a mensagem ficaria esperando alguém apertar F5 — e o cliente,
 * esperando resposta.
 */

type Visao = "caixa" | "funil";

/** Toast no canto, como nas planilhas: esta tela também é de digitar. */
const TOAST = { position: "bottom-right" as const, timer: 4000 };

const CrmPage = () => {
  const alert = useAlert();
  const celular = useIsMobile();

  const [conexao, setConexao] = useState<Conexao | null>(null);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [conversas, setConversas] = useState<Conversa[]>([]);

  const [carregando, setCarregando] = useState(true);
  const [visao, setVisao] = useState<Visao>("caixa");
  const [busca, setBusca] = useState("");
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [mostrarConexao, setMostrarConexao] = useState(false);

  const conectado = conexao?.status === "CONECTADA";

  const avisar = (err: unknown, padrao: string) =>
    alert.toast("error", getErrorTitle(err), extractErrorMessage(err, padrao), TOAST);

  /* ------------------------------ Carga ------------------------------- */

  /** Só o estado da conexão — é o que o laço do QR consulta. */
  const carregarConexao = useCallback(async () => {
    try {
      setConexao(await CrmService.conexao());
    } catch {
      /* Falha aqui não pode limpar a tela: a lista já carregada continua
         servindo, e a próxima consulta corrige o estado. */
    }
  }, []);

  /**
   * As conversas e o funil.
   *
   * `silencioso` mantém o conteúdo na tela — mesma decisão das planilhas:
   * quem está lendo uma conversa e recebe a lista inteira piscando a cada
   * mensagem nova conclui que perdeu o lugar. A carga barulhenta é só a
   * primeira.
   */
  const carregarDados = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);

    try {
      const [lista, funil] = await Promise.all([CrmService.conversas(), CrmService.etapas()]);

      setConversas(lista);
      setEtapas(funil);
    } catch (err) {
      avisar(err, "Não foi possível carregar as conversas.");
    } finally {
      if (!silencioso) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregarConexao();
    void carregarDados();
  }, [carregarConexao, carregarDados]);

  /* Mensagem nova chega sem ninguém pedir — ver a nota no topo. Silenciosa,
     senão a lista pisca embaixo de quem está lendo. */
  useSincronizacao(["crm"], () => {
    void carregarDados(true);
  });

  /* --------------------------- Ações da lista -------------------------- */

  const mover = async (conversaId: string, etapaId: string | null) => {
    /* Otimista: o cartão fica onde foi solto e só volta se o servidor
       recusar. Esperar a resposta faria o cartão saltar de volta e ir de novo
       — o arrasto pareceria não ter funcionado. */
    const antes = conversas;

    setConversas((c) => c.map((x) => (x.id === conversaId ? { ...x, etapa_fk: etapaId } : x)));

    try {
      await CrmService.alterarConversa(conversaId, { etapaId });
    } catch (err) {
      setConversas(antes);
      avisar(err, "Não foi possível mover a conversa.");
    }
  };

  /* ------------------------------ Filtro ------------------------------ */

  /*
   * A busca filtra NA TELA, e não no servidor.
   *
   * A lista já vem inteira (o teto é 300), e uma requisição por tecla numa
   * caixa de entrada aberta o dia todo seria barulho puro — além de deixar a
   * busca mais lenta que a digitação. Quando trezentas conversas não bastarem,
   * o filtro do servidor já existe em `CrmService.conversas`.
   */
  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();

    if (!t) return conversas;

    return conversas.filter((c) => c.nome.toLowerCase().includes(t) || c.telefone.includes(t.replace(/\D/g, "")));
  }, [conversas, busca]);

  const aberta = conversas.find((c) => c.id === abertaId) ?? null;

  /* ------------------------------ Render ------------------------------ */

  /* Sem conexão a tela inteira é a conexão. Ver a nota no topo: caixa de
     entrada sem WhatsApp conectado não tem o que mostrar. */
  if (!carregando && !conectado && !mostrarConexao) {
    return (
      <PageScreen title="WhatsApp" subtitle="Converse com seus clientes pelo número da loja" icon={<MessageCircle />} corpoCheio>
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-md">
          <ConexaoWhatsapp conexao={conexao} aoAtualizar={() => void carregarConexao()} />

          {/* A saída para quem já usou: o histórico continua aqui mesmo
              desconectado, e prendê-lo atrás da conexão seria esconder o
              trabalho da loja porque o celular ficou sem bateria. */}
          {conversas.length > 0 && (
            <button
              type="button"
              onClick={() => setMostrarConexao(true)}
              className="mt-3 w-full cursor-pointer text-center text-[12px] text-mist underline-offset-4 transition-colors hover:text-ink hover:underline"
            >
              Ver as conversas anteriores
            </button>
          )}
        </div>
      </div>
      </PageScreen>
    );
  }

  /* `corpoCheio`: a caixa de entrada, a conversa e o painel do cliente rolam
     cada um por dentro. Sem isso a página inteira ganharia uma segunda barra de
     rolagem por fora, e a roda do mouse pararia no visor errado. */
  return (
    <PageScreen
      title="WhatsApp"
      subtitle={conectado ? "Caixa de entrada e funil" : "Converse com seus clientes pelo número da loja"}
      icon={<MessageCircle />}
      corpoCheio
    >
    <div className="flex h-full min-h-0 flex-col">
      {/* Barra de controles */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-fg/[0.06] px-3 py-2.5">
        {/*
          A busca saiu daqui e foi para dentro da lista de contatos.
          Ela procura CONVERSA — nome e telefone —, e na barra de cima parecia
          buscar a tela inteira: quem estava no funil digitava ali esperando
          filtrar cartão, e quem estava lendo uma conversa esperava achar
          mensagem. Junto da lista, o que ela faz fica óbvio.
        */}
        <div className="flex-1" />

        {/* Caixa ⇄ Funil: as MESMAS conversas, em duas leituras. Mesma
            decisão do Tabela ⇄ Backlog das planilhas — é forma de olhar o que
            já está aberto, não destino de menu. */}
        <div className="glass-subtle flex h-[38px] shrink-0 items-center gap-1 rounded-xl p-1">
          {(
            [
              { id: "caixa", label: "Caixa", icone: <Inbox size={14} /> },
              { id: "funil", label: "Funil", icone: <KanbanSquare size={14} /> },
            ] as const
          ).map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setVisao(v.id)}
              aria-pressed={visao === v.id}
              className={`focus-ring flex h-full cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[12px] transition-colors ${
                visao === v.id ? "bg-accent text-white shadow-glow" : "text-mist hover:text-ink"
              }`}
            >
              {v.icone}
              <span className="hidden sm:inline">{v.label}</span>
            </button>
          ))}
        </div>

        {/* O estado da conexão vira botão: é onde se reconecta quando cai, e
            a bolinha diz se está no ar sem ocupar uma linha de texto. */}
        <button
          type="button"
          onClick={() => setMostrarConexao((v) => !v)}
          title={conectado ? `Conectado${conexao?.numero ? ` — ${conexao.numero}` : ""}` : "WhatsApp desconectado"}
          className="focus-ring flex h-[38px] shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-fg/[0.08] px-3 text-[12px] text-mist transition-colors hover:border-accent/40 hover:text-ink"
        >
          <span className={`h-2 w-2 rounded-full ${conectado ? "bg-success" : "bg-danger"}`} />
          <Settings2 size={14} />
          <span className="hidden md:inline">WhatsApp</span>
        </button>
      </div>

      {/* O painel de conexão, quando pedido pela barra. */}
      {mostrarConexao && (
        <div className="shrink-0 border-b border-fg/[0.06] p-3">
          <ConexaoWhatsapp conexao={conexao} aoAtualizar={() => void carregarConexao()} />
        </div>
      )}

      {carregando ? (
        <div className="flex flex-1 items-center justify-center text-faint">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : visao === "funil" ? (
        <div className="min-h-0 flex-1">
          <QuadroFunil
            etapas={etapas}
            /* O quadro mostra TODAS: a busca agora é da lista de contatos, e
               esconder cartão por causa do que ficou escrito numa caixa de
               outra visão faria o funil mentir sobre o que a loja tem em
               andamento. */
            conversas={conversas}
            onMover={(id, etapa) => void mover(id, etapa)}
            onAbrir={(c) => {
              setAbertaId(c.id);
              setVisao("caixa");
            }}
          />
        </div>
      ) : (
        /*
         * Lista e conversa lado a lado no desktop; uma de cada vez no celular.
         *
         * No celular a conversa OCUPA a tela: 360px divididos entre lista e
         * thread não servem a nenhuma das duas, e é no celular que a loja
         * responde cliente.
         */
        <div className="flex min-h-0 flex-1">
          <div
            className={`flex min-h-0 w-full flex-col border-r border-fg/[0.06] lg:w-[320px] lg:shrink-0 ${
              celular && aberta ? "hidden" : ""
            }`}
          >
            {/* A busca da lista, dentro da lista. */}
            <div className="shrink-0 border-b border-fg/[0.06] p-2">
              <div className="flex h-[34px] items-center gap-2 rounded-lg border border-fg/[0.08] bg-fg/[0.03] px-2.5">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar contato"
                  className="w-full flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-faint"
                />
                {busca && (
                  <button
                    type="button"
                    onClick={() => setBusca("")}
                    aria-label="Limpar busca"
                    className="shrink-0 cursor-pointer text-faint transition-colors hover:text-ink"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {filtradas.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-faint">
                  <MessageCircle size={22} />
                  <p className="text-[12.5px] text-mist">
                    {busca.trim() ? "Nenhuma conversa encontrada" : "Nenhuma conversa ainda"}
                  </p>
                  {!busca.trim() && (
                    <p className="text-[11px]">As mensagens que chegarem no WhatsApp da loja aparecem aqui.</p>
                  )}
                </div>
              ) : (
                filtradas.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setAbertaId(c.id)}
                    className={`flex w-full items-center gap-2.5 border-b border-fg/[0.04] px-3 py-2.5 text-left transition-colors hover:bg-fg/[0.04] ${
                      abertaId === c.id ? "bg-accent/[0.08]" : ""
                    }`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-accent/25 bg-accent/[0.12] text-accent-soft">
                      {c.foto ? <img src={c.foto} alt="" className="h-full w-full object-cover" /> : <UserRound size={15} />}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{c.nome}</span>
                        {c.nao_lidas > 0 && (
                          <span className="shrink-0 rounded-full bg-accent px-1.5 text-[10px] text-white">{c.nao_lidas}</span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-mist">
                        {/* "Você:" quando quem falou por último foi a loja.
                            A mesma prévia significa coisas opostas conforme
                            quem escreveu: "beleza, obrigado" vindo do cliente
                            é conversa que talvez peça resposta; escrito por
                            nós é conversa encerrada. */}
                        {c.ultima_direcao === "SAIDA" && <span className="text-faint">Você: </span>}
                        {c.ultima_mensagem ?? "Sem mensagens"}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className={`min-h-0 flex-1 ${celular && !aberta ? "hidden" : ""}`}>
            {aberta ? (
              <ConversaAberta
                key={aberta.id}
                conversa={aberta}
                podeEnviar={Boolean(conectado)}
                aoVoltar={celular ? () => setAbertaId(null) : undefined}
                aoMudar={() => void carregarDados(true)}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-faint">
                <MessageCircle size={26} />
                <p className="text-[12.5px] text-mist">Escolha uma conversa</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </PageScreen>
  );
};

export default CrmPage;
