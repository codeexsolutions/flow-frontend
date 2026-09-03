import { useEffect, useState } from "react";
import { AlertTriangle, BookOpen, Bot, Clock, FlaskConical, Loader2, MessageSquareText, Power, Sparkles, Timer } from "lucide-react";

import CrmService, { type Chatbot, type DiaExpediente } from "@/features/crm/services/crm.service";
import { SettingsCard, SaveRow } from "@/features/config/components/ConfigUI";
import { ListaCabecalho, ListaLinha } from "@/shared/ui/DataTable";
import { PageScreen } from "@/shared/ui/PageShell";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";

/**
 * O robô do WhatsApp.
 *
 * ---------------------------------------------------------------------------
 * Esta tela liga algo que fala com cliente sem ninguém ver
 * ---------------------------------------------------------------------------
 * É a única parte do sistema que manda mensagem em nome da loja sozinha. O
 * desenho sai daí:
 *
 *   • a chave geral fica no TOPO, fora dos cartões — quem precisa desligar às
 *     pressas não deve ter de procurar dentro de um formulário;
 *   • ligado sem texto escrito não manda nada, e a tela diz isso em vez de
 *     deixar a pessoa achar que configurou;
 *   • a prévia mostra o recado como o cliente vai ler, porque é isso que ele
 *     vai ler — e ninguém revisa bem um texto dentro de um campo.
 *
 * O resto é o vocabulário de Configurações: `SettingsCard` com ícone, título e
 * o Salvar no rodapé, e o expediente na MESMA tabela das outras listas do
 * sistema (`ListaCabecalho` / `ListaLinha`), que já sabe virar cartão no
 * celular. Uma tela de ajuste que inventa o próprio desenho obriga a pessoa a
 * reaprender onde ficam as coisas.
 */

const DIAS = [
  { dia: 0, nome: "Domingo" },
  { dia: 1, nome: "Segunda" },
  { dia: 2, nome: "Terça" },
  { dia: 3, nome: "Quarta" },
  { dia: 4, nome: "Quinta" },
  { dia: 5, nome: "Sexta" },
  { dia: 6, nome: "Sábado" },
];

/** As colunas do expediente. Mesma gramática de `cols` das outras tabelas. */
const COLS = "minmax(96px,1fr) 104px minmax(0,1fr)";
const ROTULOS = [undefined, "Situação", "Horário"];
const ALTURA_LINHA = 46;

const ChatbotPage = () => {
  const alert = useAlert();

  const [cfg, setCfg] = useState<Chatbot | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    CrmService.chatbot()
      .then(setCfg)
      .catch((err) => alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível abrir o robô.")))
      .finally(() => setCarregando(false));
  }, []);

  const dia = (n: number): DiaExpediente =>
    cfg?.expediente?.find((d) => Number(d.dia) === n) ?? { dia: n, fechado: true };

  const mudarDia = (n: number, patch: Partial<DiaExpediente>) => {
    setSalvo(false);
    setCfg((c) => {
      if (!c) return c;

      const atual = c.expediente?.find((d) => Number(d.dia) === n) ?? { dia: n, fechado: true };
      const resto = (c.expediente ?? []).filter((d) => Number(d.dia) !== n);

      return { ...c, expediente: [...resto, { ...atual, ...patch, dia: n }].sort((a, b) => a.dia - b.dia) };
    });
  };

  const salvar = async (patch: Partial<Chatbot> = {}) => {
    if (!cfg) return;

    const proximo = { ...cfg, ...patch };

    setSalvando(true);
    setCfg(proximo);

    try {
      await CrmService.salvarChatbot({
        ativo: proximo.ativo,
        mensagemFora: proximo.mensagem_fora ?? "",
        expediente: proximo.expediente,
        silencioHoras: proximo.silencio_horas,
        iaAtiva: proximo.ia_ativa,
        documentacao: proximo.documentacao ?? "",
        iaEsperaMinutos: proximo.ia_espera_minutos,
        iaNumeroTeste: proximo.ia_numero_teste ?? "",
      });

      setSalvo(true);
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível salvar."));
    } finally {
      setSalvando(false);
    }
  };

  const semTexto = !String(cfg?.mensagem_fora ?? "").trim();

  /* `PageScreen` é a casca canônica de todo destino de rota — fundo, brilho,
     cabeçalho e espaçamento. Montar isso à mão foi o que produziu dez telas
     com três espaçamentos diferentes; ver a nota em `PageShell`. */
  return (
    <PageScreen
      title="Chatbot"
      subtitle="Responde no WhatsApp quando a loja está fechada"
      icon={<Bot />}
    >
      {carregando || !cfg ? (
        <div className="flex flex-1 items-center justify-center text-faint">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : (
      <div className="grid grid-cols-1 items-start gap-4 pb-2 xl:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-4 xl:col-span-2">
        {/* ---------------- A chave geral ---------------- */}
        {/* Fora dos cartões, de propósito: é a única coisa desta tela que
            alguém vai procurar com pressa. */}
        <section
          className={`flex flex-wrap items-center gap-3 rounded-2xl border p-4 transition-colors ${
            cfg.ativo ? "border-success/30 bg-success/[0.06]" : "border-fg/[0.07] bg-surface"
          }`}
        >
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              cfg.ativo ? "bg-success/[0.15] text-success" : "bg-fg/[0.05] text-faint"
            }`}
          >
            <Bot size={18} />
          </span>

          <div className="min-w-[180px] flex-1">
            <p className="text-[13px] text-ink">{cfg.ativo ? "Robô ligado" : "Robô desligado"}</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-mist">
              {cfg.ativo
                ? "Fora do expediente, quem escrever recebe sua mensagem automaticamente."
                : "Ninguém recebe resposta automática. As mensagens esperam você na caixa de entrada."}
            </p>
          </div>

          <button
            type="button"
            disabled={salvando}
            onClick={() => void salvar({ ativo: !cfg.ativo })}
            className={`focus-ring flex min-h-[38px] shrink-0 cursor-pointer items-center gap-2 rounded-xl px-4 text-[12.5px] transition-all active:scale-[0.98] disabled:opacity-50 ${
              cfg.ativo
                ? "border border-danger/25 bg-danger/[0.08] text-danger hover:bg-danger/[0.14]"
                : "bg-accent text-white shadow-[0_8px_24px_-8px_rgb(var(--accent))] hover:brightness-110"
            }`}
          >
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
            {cfg.ativo ? "Desligar" : "Ligar"}
          </button>
        </section>

        {cfg.ativo && semTexto && (
          <p className="flex items-start gap-2 rounded-xl border border-warning/25 bg-warning/[0.07] px-3.5 py-2.5 text-[12px] leading-relaxed text-warning">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            O robô está ligado, mas sem mensagem escrita nada é enviado. Escreva o recado ao lado.
          </p>
        )}

        {/* ---------------- Expediente ---------------- */}
        <SettingsCard
          icon={<Clock size={16} />}
          title="Expediente"
          desc="Dentro destes horários quem responde é você — horário de Brasília"
          footer={<SaveRow saving={salvando} saved={salvo} onSave={() => void salvar()} label="Salvar expediente" />}
        >
          <div className="overflow-hidden rounded-xl border border-fg/[0.06]">
            <ListaCabecalho cols={COLS}>
              <span>Dia</span>
              <span>Situação</span>
              <span>Horário</span>
            </ListaCabecalho>

            {DIAS.map((d) => {
              const cfgDia = dia(d.dia);
              const fechado = Boolean(cfgDia.fechado);

              return (
                <ListaLinha key={d.dia} cols={COLS} rotulos={ROTULOS} altura={ALTURA_LINHA}>
                  <span className="text-[12.5px] text-ink">{d.nome}</span>

                  <span>
                    <button
                      type="button"
                      onClick={() =>
                        mudarDia(d.dia, {
                          fechado: !fechado,
                          abre: cfgDia.abre ?? "08:00",
                          fecha: cfgDia.fecha ?? "18:00",
                        })
                      }
                      className={`focus-ring cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] transition-colors ${
                        fechado
                          ? "border-fg/[0.08] text-faint hover:text-mist"
                          : "border-success/30 bg-success/[0.08] text-success"
                      }`}
                    >
                      {fechado ? "Fechado" : "Aberto"}
                    </button>
                  </span>

                  <span>
                    {fechado ? (
                      <span className="text-[12px] text-faint">—</span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <input
                          type="time"
                          value={cfgDia.abre ?? "08:00"}
                          onChange={(e) => mudarDia(d.dia, { abre: e.target.value })}
                          className="rounded-lg border border-fg/[0.08] bg-fg/[0.035] px-2 py-1 text-[12px] text-ink outline-none transition-colors focus:border-accent"
                        />
                        <span className="text-[11px] text-faint">às</span>
                        <input
                          type="time"
                          value={cfgDia.fecha ?? "18:00"}
                          onChange={(e) => mudarDia(d.dia, { fecha: e.target.value })}
                          className="rounded-lg border border-fg/[0.08] bg-fg/[0.035] px-2 py-1 text-[12px] text-ink outline-none transition-colors focus:border-accent"
                        />
                      </span>
                    )}
                  </span>
                </ListaLinha>
              );
            })}
          </div>
        </SettingsCard>

        {/* ---------------- A IA ---------------- */}
        <SettingsCard
          icon={<Sparkles size={16} />}
          title="Atendimento por IA"
          desc="Responde quando ninguém respondeu — dentro e fora do expediente"
          footer={<SaveRow saving={salvando} saved={salvo} onSave={() => void salvar()} label="Salvar documentação" />}
        >
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-fg/[0.06] bg-fg/[0.02] p-3">
            <div className="min-w-[180px] flex-1">
              <p className="text-[12.5px] text-ink">{cfg.ia_ativa ? "IA ligada" : "IA desligada"}</p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-mist">
                {cfg.ia_ativa
                  ? "Ela substitui a mensagem fixa: responde de madrugada e também no meio do dia, se ninguém pegar a conversa."
                  : "Só a mensagem fixa de fora de expediente é enviada."}
              </p>
            </div>

            <button
              type="button"
              disabled={salvando}
              onClick={() => void salvar({ ia_ativa: !cfg.ia_ativa })}
              className={`focus-ring flex min-h-[34px] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-[12px] transition-colors disabled:opacity-50 ${
                cfg.ia_ativa
                  ? "border-danger/25 bg-danger/[0.08] text-danger hover:bg-danger/[0.14]"
                  : "border-accent/30 bg-accent/[0.1] text-accent-soft hover:bg-accent/[0.16]"
              }`}
            >
              <Power size={13} /> {cfg.ia_ativa ? "Desligar IA" : "Ligar IA"}
            </button>
          </div>

          {/*
            O modo de teste vem ANTES de tudo, e não escondido no fim.

            A falta dele foi o que transformou a primeira ativação em 32
            mensagens para 29 clientes reais: não havia como experimentar. Quem
            chega aqui para ligar a IA precisa ver a saída segura antes de ver
            a chave.
          */}
          <div
            className={`mb-4 rounded-xl border p-3 ${
              cfg.ia_numero_teste ? "border-warning/30 bg-warning/[0.07]" : "border-fg/[0.06] bg-fg/[0.02]"
            }`}
          >
            <label className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.7px] text-faint">
              <FlaskConical size={11} /> Modo de teste
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <input
                value={cfg.ia_numero_teste ?? ""}
                onChange={(e) => {
                  setSalvo(false);
                  setCfg({ ...cfg, ia_numero_teste: e.target.value });
                }}
                placeholder="Seu número, ex: 85988849894"
                inputMode="tel"
                className="w-56 rounded-lg border border-fg/[0.08] bg-fg/[0.035] px-3 py-2 text-[13px] text-ink outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/15"
              />

              {cfg.ia_numero_teste && (
                <button
                  type="button"
                  onClick={() => void salvar({ ia_numero_teste: "" })}
                  className="focus-ring cursor-pointer rounded-lg border border-fg/[0.08] px-2.5 py-2 text-[11.5px] text-mist transition-colors hover:text-ink"
                >
                  Liberar para todos
                </button>
              )}
            </div>

            <p className="mt-1.5 text-[11px] leading-relaxed text-mist">
              {cfg.ia_numero_teste ? (
                <>
                  <span className="text-warning">Só este número recebe resposta da IA.</span> Mande mensagem para o
                  WhatsApp da loja por ele e converse com o robô à vontade — nenhum cliente recebe nada.
                </>
              ) : (
                <>
                  Preencha com o seu número para conversar com o robô sem que nenhum cliente receba. Em branco, a IA
                  responde todo mundo.
                </>
              )}
            </p>
          </div>

          <label className="mb-1 block text-[10px] uppercase tracking-[0.7px] text-faint">
            Esperar antes de responder
          </label>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={0}
              max={1440}
              value={cfg.ia_espera_minutos}
              onChange={(e) => {
                setSalvo(false);
                setCfg({ ...cfg, ia_espera_minutos: Number(e.target.value) });
              }}
              className="w-24 rounded-lg border border-fg/[0.08] bg-fg/[0.035] px-3 py-2.5 text-[13px] text-ink outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/15"
            />
            <span className="text-[12.5px] text-mist">minutos sem ninguém responder</span>

            {/* O atalho para testar: zero é o modo "responde na hora". */}
            {cfg.ia_espera_minutos !== 0 && (
              <button
                type="button"
                onClick={() => void salvar({ ia_espera_minutos: 0 })}
                className="focus-ring cursor-pointer rounded-lg border border-fg/[0.08] px-2.5 py-1.5 text-[11.5px] text-mist transition-colors hover:border-accent/40 hover:text-accent-soft"
              >
                Responder na hora
              </button>
            )}
          </div>

          <p className="mb-4 text-[11px] leading-relaxed text-faint">
            {cfg.ia_espera_minutos === 0
              ? "Zero: ela responde no instante em que a mensagem chega, sem dar tempo de alguém pegar a conversa. É o certo para testar."
              : "A IA espera esse tempo para ver se alguém da equipe responde. Só entra se ninguém entrar."}
          </p>

          <label className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.7px] text-faint">
            <BookOpen size={11} /> O que a empresa faz
          </label>

          <textarea
            value={cfg.documentacao ?? ""}
            onChange={(e) => {
              setSalvo(false);
              setCfg({ ...cfg, documentacao: e.target.value });
            }}
            rows={12}
            placeholder={`Escreva como explicaria para um funcionário no primeiro dia. Por exemplo:

O que fazemos: camisas personalizadas, uniformes, canecas, banners.
Prazo: 5 dias úteis para até 50 peças. Urgência custa 30% a mais.
Pedido mínimo: 10 peças para camisa.
Pagamento: Pix, cartão em até 3x, 50% de entrada em encomendas.
Entrega: retirada na loja ou motoboy dentro de Fortaleza (R$ 15).
Endereço: Rua X, 123 — Centro.
Não fazemos: impressão em papel, adesivo de carro.`}
            className="w-full resize-y rounded-lg border border-fg/[0.08] bg-fg/[0.035] p-3 text-[12.5px] leading-relaxed text-ink outline-none transition-all placeholder:text-faint/70 focus:border-accent focus:ring-2 focus:ring-accent/15"
          />

          {/* O que a IA NÃO faz importa mais que o que ela faz — é o que evita
              a loja descobrir na reclamação do cliente. */}
          <div className="mt-3 rounded-xl border border-fg/[0.06] bg-fg/[0.02] px-3 py-2.5">
            <p className="text-[11px] leading-relaxed text-mist">
              A IA só afirma o que está escrito aqui. Quando não souber, ela diz que vai confirmar em vez de chutar — e
              nunca fecha negócio, não dá desconto e não confirma pedido.
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
              Quanto mais específico o texto, melhor ela responde. Preço, prazo e o que vocês NÃO fazem são o que mais
              muda o resultado.
            </p>
            {/* Dito na tela porque é a garantia que faltava — quem liga a
                chave precisa saber que ela não vale para trás. */}
            <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
              Ao ligar, a IA passa a valer só para mensagens que chegarem daí em diante. Conversas antigas não recebem
              nada.
            </p>
          </div>
        </SettingsCard>
      </div>

      {/* ---------------- Coluna da direita ---------------- */}
      <div className="flex min-w-0 flex-col gap-4">
        <SettingsCard
          icon={<MessageSquareText size={16} />}
          title="Mensagem fora do expediente"
          desc="Enviada uma vez para quem escrever com a loja fechada"
          footer={<SaveRow saving={salvando} saved={salvo} onSave={() => void salvar()} label="Salvar mensagem" />}
        >
          <label className="mb-1 block text-[10px] uppercase tracking-[0.7px] text-faint">O recado</label>

          <textarea
            value={cfg.mensagem_fora ?? ""}
            onChange={(e) => {
              setSalvo(false);
              setCfg({ ...cfg, mensagem_fora: e.target.value });
            }}
            rows={4}
            maxLength={1000}
            placeholder="Oi! Recebemos sua mensagem. Estamos fechados agora e respondemos amanhã a partir das 8h."
            className="w-full resize-y rounded-lg border border-fg/[0.08] bg-fg/[0.035] p-3 text-[13px] leading-relaxed text-ink outline-none transition-all placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/15"
          />

          <p className="mt-1.5 text-[11px] text-faint">
            Diga quando você volta — é a informação que a pessoa está procurando.
          </p>

          {/* A prévia nas cores da conversa: um texto revisado dentro do campo
              não é o mesmo texto que chega no celular de alguém. */}
          {!semTexto && (
            <div className="mt-3">
              <p className="mb-1.5 text-[10px] uppercase tracking-[0.7px] text-faint">Como o cliente vê</p>
              <div className="rounded-xl p-3" style={{ background: "#efeae2" }}>
                <div className="flex justify-end">
                  <p
                    className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed shadow-[0_1px_1px_rgba(0,0,0,0.08)]"
                    style={{ background: "#d9fdd3", color: "#111b21" }}
                  >
                    {cfg.mensagem_fora}
                  </p>
                </div>
              </div>
            </div>
          )}
        </SettingsCard>

        <SettingsCard
          icon={<Timer size={16} />}
          title="Não repetir"
          desc="O que separa um atendimento de um robô com defeito"
          footer={<SaveRow saving={salvando} saved={salvo} onSave={() => void salvar()} label="Salvar" />}
        >
          <label className="mb-1 block text-[10px] uppercase tracking-[0.7px] text-faint">Silêncio, em horas</label>

          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={72}
              value={cfg.silencio_horas}
              onChange={(e) => {
                setSalvo(false);
                setCfg({ ...cfg, silencio_horas: Number(e.target.value) });
              }}
              className="w-24 rounded-lg border border-fg/[0.08] bg-fg/[0.035] px-3 py-2.5 text-[13px] text-ink outline-none transition-all focus:border-accent focus:ring-2 focus:ring-accent/15"
            />
            <span className="text-[12.5px] text-mist">horas</span>
          </div>

          <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
            Quem mandar várias mensagens seguidas recebe o recado uma vez só neste período.
          </p>
        </SettingsCard>

        <p className="rounded-xl border border-fg/[0.06] bg-fg/[0.02] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-faint">
          Em seguida: documentar a empresa aqui para a IA responder as perguntas dos clientes com base nisso.
        </p>
      </div>
      </div>
      )}
    </PageScreen>
  );
};

export default ChatbotPage;
