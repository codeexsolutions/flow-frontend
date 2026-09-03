import { useEffect, useState } from "react";
import { AlertTriangle, Bot, Clock, Loader2, MessageSquareText, Power, Save } from "lucide-react";

import CrmService, { type Chatbot, type DiaExpediente } from "@/features/crm/services/crm.service";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";

/**
 * O robô do WhatsApp.
 *
 * ---------------------------------------------------------------------------
 * Esta tela liga algo que fala com cliente sem ninguém ver
 * ---------------------------------------------------------------------------
 * É a única parte do sistema que manda mensagem em nome da loja sozinha. O
 * desenho todo sai daí:
 *
 *   • a chave geral fica no TOPO, não escondida no fim de um formulário — quem
 *     precisa desligar às pressas não deve ter de procurar;
 *   • ligado sem texto escrito não manda nada, e a tela diz isso em vez de
 *     deixar a pessoa achar que está funcionando;
 *   • a prévia mostra o recado como o cliente vai ler, porque é isso que ele
 *     vai ler — e ninguém revisa bem um texto dentro de um campo de formulário.
 */

const DIAS = [
  { dia: 0, nome: "Domingo", curto: "Dom" },
  { dia: 1, nome: "Segunda", curto: "Seg" },
  { dia: 2, nome: "Terça", curto: "Ter" },
  { dia: 3, nome: "Quarta", curto: "Qua" },
  { dia: 4, nome: "Quinta", curto: "Qui" },
  { dia: 5, nome: "Sexta", curto: "Sex" },
  { dia: 6, nome: "Sábado", curto: "Sáb" },
];

const ChatbotPage = () => {
  const alert = useAlert();

  const [cfg, setCfg] = useState<Chatbot | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    CrmService.chatbot()
      .then(setCfg)
      .catch((err) => alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível abrir o robô.")))
      .finally(() => setCarregando(false));
  }, []);

  const dia = (n: number): DiaExpediente =>
    cfg?.expediente?.find((d) => Number(d.dia) === n) ?? { dia: n, fechado: true };

  const mudarDia = (n: number, patch: Partial<DiaExpediente>) => {
    setCfg((c) => {
      if (!c) return c;

      const atual = c.expediente?.find((d) => Number(d.dia) === n) ?? { dia: n, fechado: true };
      const novo = { ...atual, ...patch, dia: n };

      const resto = (c.expediente ?? []).filter((d) => Number(d.dia) !== n);

      return { ...c, expediente: [...resto, novo].sort((a, b) => a.dia - b.dia) };
    });
  };

  const salvar = async (patch: Partial<Chatbot>) => {
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
      });

      alert.toast("success", "Salvo", undefined, { position: "bottom-right", timer: 2500 });
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível salvar."));
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <div className="flex h-full items-center justify-center text-faint">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (!cfg) return null;

  const semTexto = !String(cfg.mensagem_fora ?? "").trim();

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto p-4">
      {/* ---------------- A chave geral ---------------- */}
      <section
        className={`flex items-center gap-3 rounded-2xl border p-4 transition-colors ${
          cfg.ativo ? "border-success/30 bg-success/[0.06]" : "border-fg/[0.08] bg-fg/[0.02]"
        }`}
      >
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
            cfg.ativo ? "bg-success/[0.15] text-success" : "bg-fg/[0.05] text-faint"
          }`}
        >
          <Bot size={20} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] text-ink">{cfg.ativo ? "Robô ligado" : "Robô desligado"}</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-mist">
            {cfg.ativo
              ? "Fora do expediente, quem escrever recebe sua mensagem automaticamente."
              : "Ninguém recebe resposta automática. As mensagens ficam esperando você na caixa de entrada."}
          </p>
        </div>

        <button
          type="button"
          disabled={salvando}
          onClick={() => void salvar({ ativo: !cfg.ativo })}
          className={`focus-ring flex min-h-[38px] shrink-0 cursor-pointer items-center gap-2 rounded-xl px-4 text-[12.5px] transition-colors disabled:opacity-50 ${
            cfg.ativo
              ? "border border-danger/25 bg-danger/[0.08] text-danger hover:bg-danger/[0.14]"
              : "bg-accent text-white hover:bg-accent"
          }`}
        >
          {salvando ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
          {cfg.ativo ? "Desligar" : "Ligar"}
        </button>
      </section>

      {/* Ligado e sem texto não manda nada — a tela precisa dizer, senão a
          pessoa sai daqui achando que configurou. */}
      {cfg.ativo && semTexto && (
        <p className="flex items-start gap-2 rounded-xl border border-warning/25 bg-warning/[0.07] px-3 py-2.5 text-[12px] leading-relaxed text-warning">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          O robô está ligado, mas sem mensagem escrita nada é enviado. Escreva o recado abaixo.
        </p>
      )}

      {/* ---------------- A mensagem ---------------- */}
      <section className="rounded-2xl border border-fg/[0.07] bg-fg/[0.02] p-4">
        <p className="flex items-center gap-2 text-[13px] text-ink">
          <MessageSquareText size={15} className="text-accent-soft" /> Mensagem fora do expediente
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-mist">
          Enviada uma vez para quem escrever com a loja fechada. Diga quando você volta — é a informação que a pessoa
          está procurando.
        </p>

        <textarea
          value={cfg.mensagem_fora ?? ""}
          onChange={(e) => setCfg({ ...cfg, mensagem_fora: e.target.value })}
          onBlur={() => void salvar({})}
          rows={4}
          maxLength={1000}
          placeholder="Oi! Recebemos sua mensagem. Estamos fechados agora e respondemos amanhã a partir das 8h."
          className="mt-3 w-full resize-y rounded-xl border border-fg/[0.08] bg-fg/[0.03] p-3 text-[12.5px] leading-relaxed text-ink outline-none transition-colors placeholder:text-faint focus:border-accent/40"
        />

        {/* A prévia como o cliente vê: bolha verde, as cores da conversa. Um
            texto revisado dentro do campo de formulário não é o mesmo texto
            que chega no celular de alguém. */}
        {!semTexto && (
          <div className="mt-3">
            <p className="mb-1.5 text-[10.5px] uppercase tracking-[0.1em] text-faint">Como o cliente vê</p>
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
      </section>

      {/* ---------------- O expediente ---------------- */}
      <section className="rounded-2xl border border-fg/[0.07] bg-fg/[0.02] p-4">
        <p className="flex items-center gap-2 text-[13px] text-ink">
          <Clock size={15} className="text-accent-soft" /> Expediente
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-mist">
          Dentro destes horários ninguém recebe resposta automática — quem responde é você.
        </p>

        <div className="mt-3 space-y-1.5">
          {DIAS.map((d) => {
            const cfgDia = dia(d.dia);
            const fechado = Boolean(cfgDia.fechado);

            return (
              <div key={d.dia} className="flex items-center gap-2 rounded-xl border border-fg/[0.06] px-3 py-2">
                <span className="w-[62px] shrink-0 text-[12px] text-ink">{d.nome}</span>

                <button
                  type="button"
                  onClick={() => mudarDia(d.dia, { fechado: !fechado, abre: cfgDia.abre ?? "08:00", fecha: cfgDia.fecha ?? "18:00" })}
                  className={`focus-ring shrink-0 cursor-pointer rounded-lg border px-2 py-1 text-[11px] transition-colors ${
                    fechado
                      ? "border-fg/[0.08] text-faint hover:text-mist"
                      : "border-success/30 bg-success/[0.08] text-success"
                  }`}
                >
                  {fechado ? "Fechado" : "Aberto"}
                </button>

                {!fechado && (
                  <span className="flex items-center gap-1.5">
                    <input
                      type="time"
                      value={cfgDia.abre ?? "08:00"}
                      onChange={(e) => mudarDia(d.dia, { abre: e.target.value })}
                      className="rounded-lg border border-fg/[0.08] bg-fg/[0.03] px-2 py-1 text-[12px] text-ink outline-none focus:border-accent/40"
                    />
                    <span className="text-[11px] text-faint">às</span>
                    <input
                      type="time"
                      value={cfgDia.fecha ?? "18:00"}
                      onChange={(e) => mudarDia(d.dia, { fecha: e.target.value })}
                      className="rounded-lg border border-fg/[0.08] bg-fg/[0.03] px-2 py-1 text-[12px] text-ink outline-none focus:border-accent/40"
                    />
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          disabled={salvando}
          onClick={() => void salvar({})}
          className="focus-ring mt-3 flex min-h-[38px] cursor-pointer items-center gap-2 rounded-xl bg-accent px-4 text-[12.5px] text-white transition-colors hover:bg-accent disabled:opacity-50"
        >
          {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar expediente
        </button>

        {/* O fuso é fixo no sistema inteiro. Dizer isso aqui evita a dúvida de
            quem configura de outro estado — e a suspeita de que o horário
            "não está pegando". */}
        <p className="mt-2 text-[11px] text-faint">Horário de Brasília.</p>
      </section>

      {/* ---------------- Repetição ---------------- */}
      <section className="rounded-2xl border border-fg/[0.07] bg-fg/[0.02] p-4">
        <p className="text-[13px] text-ink">Não repetir por</p>
        <p className="mt-1 text-[12px] leading-relaxed text-mist">
          Quem mandar várias mensagens seguidas recebe o recado uma vez só neste período. É o que separa um
          atendimento de um robô com defeito.
        </p>

        <div className="mt-3 flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={72}
            value={cfg.silencio_horas}
            onChange={(e) => setCfg({ ...cfg, silencio_horas: Number(e.target.value) })}
            onBlur={() => void salvar({})}
            className="w-20 rounded-lg border border-fg/[0.08] bg-fg/[0.03] px-2 py-1.5 text-[12.5px] text-ink outline-none focus:border-accent/40"
          />
          <span className="text-[12px] text-mist">horas</span>
        </div>
      </section>

      {/* A parte de IA vem depois — dizer isso evita a pergunta "cadê?" e
          promete o que já está combinado, sem prometer data. */}
      <p className="rounded-xl border border-fg/[0.06] bg-fg/[0.02] px-3 py-2.5 text-[11.5px] leading-relaxed text-faint">
        Em seguida: documentar a empresa aqui para a IA responder as perguntas dos clientes com base nisso.
      </p>
    </div>
  );
};

export default ChatbotPage;
