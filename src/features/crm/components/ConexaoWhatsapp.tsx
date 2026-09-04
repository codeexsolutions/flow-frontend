import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { DownloadCloud, Loader2, MessageCircle, Power, RefreshCw, ShieldAlert, Smartphone } from "lucide-react";

import CrmService, { type Conexao } from "@/features/crm/services/crm.service";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";

const INTERVALO_MS = 3000;

const LEGENDA: Record<Conexao["status"], { titulo: string; texto: string }> = {
  DESLIGADA: {
    titulo: "WhatsApp desconectado",
    texto: "Conecte o número da loja para receber e responder mensagens por aqui.",
  },
  INICIANDO: {
    titulo: "Preparando a conexão",
    texto: "Isso leva alguns segundos. O código para leitura aparece aqui.",
  },
  AGUARDANDO_QR: {
    titulo: "Leia o código com o WhatsApp da loja",
    texto: "WhatsApp › Dispositivos conectados › Conectar dispositivo.",
  },
  CONECTADA: {
    titulo: "WhatsApp conectado",
    texto: "As mensagens dos clientes chegam na caixa de entrada.",
  },
  DERRUBADA: {
    titulo: "A conexão caiu",
    texto: "Reconecte para voltar a receber. Talvez seja preciso ler o código de novo.",
  },
};

type Props = {
  conexao: Conexao | null;

  aoAtualizar: () => void;
};

const ConexaoWhatsapp = ({ conexao, aoAtualizar }: Props) => {
  const alert = useAlert();
  const [ocupado, setOcupado] = useState(false);
  const [importando, setImportando] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);

  const status = conexao?.status ?? "DESLIGADA";
  const legenda = LEGENDA[status];
  const acompanhando = status === "INICIANDO" || status === "AGUARDANDO_QR";

  useEffect(() => {
    if (!acompanhando) return;

    const t = setInterval(aoAtualizar, INTERVALO_MS);

    return () => clearInterval(t);
  }, [acompanhando]);

  useEffect(() => {
    if (!conexao?.qr || !canvas.current) return;

    QRCode.toCanvas(canvas.current, conexao.qr, { width: 240, margin: 1 }).catch(() => {
      /* QR ilegível não trava a tela: o próximo chega em três segundos. */
    });
  }, [conexao?.qr]);

  const conectar = async () => {
    setOcupado(true);

    try {
      await CrmService.conectar();
      aoAtualizar();
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível conectar."));
    } finally {
      setOcupado(false);
    }
  };

  const desconectar = async () => {
    /*
     * Confirmação de verdade aqui, e não um toast depois.
     *
     * Desconectar derruba o atendimento da loja inteira e APAGA a credencial:
     * voltar exige o celular na mão para ler o QR de novo. É a única ação
     * desta tela que não dá para desfazer sozinho.
     */
    const { confirmed } = await alert.confirm(
      "Desconectar o WhatsApp?",
      "As mensagens param de chegar e será preciso ler o QR de novo para voltar. O histórico das conversas continua aqui.",
    );

    if (!confirmed) return;

    setOcupado(true);

    try {
      await CrmService.desconectar();
      aoAtualizar();
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível desconectar."));
    } finally {
      setOcupado(false);
    }
  };

  const importar = async () => {
    setImportando(true);

    try {
      await CrmService.importar();

      /* Toast e não modal: a importação leva minutos e roda no servidor. Uma
         caixa com "OK" prenderia a pessoa numa espera que ela não precisa
         fazer — as conversas aparecem sozinhas conforme entram. */
      alert.toast("success", "Importando as conversas", "Elas vão aparecer aqui aos poucos.", {
        position: "bottom-right",
        timer: 5000,
      });
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível importar."));
    } finally {
      setImportando(false);
    }
  };

  /* Instalação sem o serviço de WhatsApp: nem oferece o botão. Um "Conectar"
     que sempre falha é pior do que dizer que o recurso não está disponível. */
  if (conexao && !conexao.configurado) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-fg/[0.07] bg-fg/[0.02] px-6 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-fg/[0.06] bg-fg/[0.03] text-faint">
          <ShieldAlert size={22} />
        </span>
        <p className="text-[13.5px] text-ink">O WhatsApp não está disponível nesta instalação</p>
        <p className="max-w-sm text-[12px] leading-relaxed text-mist">
          O serviço de mensagens não está configurado. Fale com o suporte para habilitar o CRM de WhatsApp.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-fg/[0.07] bg-fg/[0.02] px-6 py-8 text-center">
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${
          status === "CONECTADA"
            ? "border-success/25 bg-success/[0.1] text-success"
            : status === "DERRUBADA"
              ? "border-danger/25 bg-danger/[0.1] text-danger"
              : "border-fg/[0.06] bg-fg/[0.03] text-accent-soft"
        }`}
      >
        {status === "INICIANDO" ? <Loader2 size={22} className="animate-spin" /> : <MessageCircle size={22} />}
      </span>

      <div>
        <p className="text-[13.5px] text-ink">{legenda.titulo}</p>
        <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-mist">{legenda.texto}</p>
      </div>

      {/* O QR só existe em AGUARDANDO_QR. Fundo branco fixo, e não o do tema:
          o leitor do celular precisa de contraste real, e no tema escuro um
          QR sobre fundo escuro simplesmente não é lido. */}
      {status === "AGUARDANDO_QR" && conexao?.qr && (
        <div className="rounded-2xl bg-white p-3">
          <canvas ref={canvas} />
        </div>
      )}

      {status === "CONECTADA" && conexao?.numero && ( 
        <p className="flex items-center gap-1.5 rounded-full border border-fg/[0.08] bg-fg/[0.03] px-3 py-1 text-[12px] text-mist">
          <Smartphone size={13} className="text-success" /> {conexao.numero}
        </p>
      )}

      {status === "DERRUBADA" && conexao?.erro && (
        <p className="max-w-sm rounded-xl border border-danger/20 bg-danger/[0.06] px-3 py-2 text-[11.5px] leading-relaxed text-danger">
          {conexao.erro}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        {status === "CONECTADA" ? (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void desconectar()}
            className="focus-ring flex min-h-[38px] cursor-pointer items-center gap-2 rounded-xl border border-danger/25 bg-danger/[0.08] px-4 text-[12.5px] text-danger transition-colors hover:bg-danger/[0.14] disabled:opacity-50"
          >
            {ocupado ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />} Desconectar
          </button>
        ) : null}

        {/* Importar só faz sentido com sessão conectada — é dela que as
            conversas antigas são lidas. */}
        {status === "CONECTADA" ? (
          <button
            type="button"
            disabled={importando}
            onClick={() => void importar()}
            title="Busca no WhatsApp as conversas que já existiam e traz para cá"
            className="focus-ring flex min-h-[38px] cursor-pointer items-center gap-2 rounded-xl border border-fg/[0.1] px-4 text-[12.5px] text-mist transition-colors hover:border-accent/40 hover:text-accent-soft disabled:opacity-50"
          >
            {importando ? <Loader2 size={14} className="animate-spin" /> : <DownloadCloud size={14} />} Importar conversas
          </button>
        ) : (
          <button
            type="button"
            disabled={ocupado || status === "INICIANDO"}
            onClick={() => void conectar()}
            className="focus-ring flex min-h-[38px] cursor-pointer items-center gap-2 rounded-xl bg-accent px-4 text-[12.5px] text-white transition-colors hover:bg-accent disabled:opacity-50"
          >
            {ocupado || status === "INICIANDO" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {status === "AGUARDANDO_QR" ? "Gerar outro código" : "Conectar WhatsApp"}
          </button>
        )}
      </div>
    </div>
  );
};

export default ConexaoWhatsapp;
