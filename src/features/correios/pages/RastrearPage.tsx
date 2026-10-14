import { useState } from "react";
import { Search, Hash, Package, Clock, AlertTriangle, RotateCw, MapPin } from "lucide-react";

import CorreiosService from "@/features/correios/services/correios.service";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";

const campoBase = "h-11 w-full rounded-xl border border-fg/[0.08] bg-fg/[0.04] px-3 text-sm text-ink placeholder-mist outline-none transition-colors focus:border-accent/60 focus:bg-fg/[0.06]";

type RastreioEvento = {
  data: string;
  hora: string;
  local: string;
  descricao: string;
};

const RastrearPage = () => {
  const alert = useAlert();

  const [codigo, setCodigo] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [eventos, setEventos] = useState<RastreioEvento[]>([]);
  const [jaBuscou, setJaBuscou] = useState(false);
  const [codigoAtual, setCodigoAtual] = useState("");

  const handleRastrear = async () => {
    const cod = codigo.trim().toUpperCase();
    if (cod.length < 5) {
      alert.warning("Código inválido", "Informe um código de rastreio válido (ex: XX000000000BR).");
      return;
    }

    setBuscando(true);
    setJaBuscou(true);
    setCodigoAtual(cod);

    try {
      const res = await CorreiosService.rastrear(cod);
      const data = res.data?.data?.[0];
      const eventosLista = data?.eventos;
      if (eventosLista && Array.isArray(eventosLista) && eventosLista.length > 0) {
        setEventos(eventosLista);
      } else {
        setEventos([]);
        alert.warning("Sem eventos", "Nenhum evento encontrado para este código.");
      }
    } catch (err) {

      alert.error(getErrorTitle(err), extractErrorMessage(err, "Falha na comunicação com os Correios."));
      setEventos([]);
    } finally {
      setBuscando(false);
    }
  };

  const ultimoEvento = eventos[0];

  return (
    <div className="flex flex-col gap-5">
      {/* Busca */}
      <div className="card glass-sheen rounded-xl p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm text-ink">
          <Search size={16} className="text-accent-soft" /> Rastrear objeto
        </h2>
        <p className="mb-5 text-[12px] text-faint">Informe o código de rastreio dos Correios para acompanhar a entrega</p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Hash size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              placeholder="XX000000000BR"
              className={`${campoBase} pl-9`}
              onKeyDown={(e) => e.key === "Enter" && handleRastrear()}
            />
          </div>
          <button
            onClick={handleRastrear}
            disabled={buscando}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent px-8 py-3 text-sm text-white shadow-lg shadow-accent/25 transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
          >
            {buscando ? <RotateCw size={16} className="animate-spin" /> : <Search size={16} />}
            {buscando ? "Buscando..." : "Rastrear"}
          </button>
        </div>
      </div>

      {/* Resultado */}
      {jaBuscou && (
        <>
          {/* Banner do último evento */}
          {ultimoEvento ? (
            <div className="rounded-xl border border-accent/25 bg-gradient-to-br from-accent/[0.08] to-transparent p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-accent-soft">
                    <Clock size={13} /> Última atualização
                  </p>
                  <p className="mt-1.5 text-base text-ink">{ultimoEvento.descricao}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-mist">
                    <span className="flex items-center gap-1">
                      <MapPin size={12} /> {ultimoEvento.local}
                    </span>
                    <span>·</span>
                    <span>
                      {ultimoEvento.data} {ultimoEvento.hora}
                    </span>
                  </p>
                </div>
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent/20">
                  <Package size={24} className="text-accent-soft" />
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-warning/30 bg-warning/[0.08] px-5 py-4 text-sm text-warning">
              <span className="flex items-center gap-2">
                <AlertTriangle size={16} /> Nenhum evento encontrado para o código <strong >{codigoAtual}</strong>
              </span>
            </div>
          )}

          {/* Timeline */}
          {eventos.length > 0 && (
            <div className="card glass-sheen rounded-xl p-5">
              <h3 className="mb-5 flex items-center gap-2 text-sm text-ink">
                <Clock size={16} className="text-accent-soft" /> Eventos do objeto
              </h3>
              <div className="relative flex flex-col">
                {eventos.map((evt, i) => (
                  <div key={`${evt.data}-${evt.hora}-${i}`} className="flex gap-4 pb-6 last:pb-0">
                    <div className="flex flex-col items-center">
                      <div className={`h-3.5 w-3.5 rounded-full ring-2 ${
                        i === 0 ? "bg-accent ring-accent/30" : "bg-fg/[0.2] ring-fg/[0.08]"
                      }`} />
                      {i < eventos.length - 1 && <div className="mt-1 h-full w-px bg-fg/[0.08]" />}
                    </div>
                    <div className="min-w-0 flex-1 pb-2">
                      <p className="text-sm text-ink">{evt.descricao}</p>
                      <p className="mt-0.5 text-[12px] text-mist">
                        {evt.local}
                        <span className="mx-1.5 text-faint">·</span>
                        {evt.data} {evt.hora}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Estado inicial (antes da primeira busca) */}
      {!jaBuscou && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-fg/[0.12] px-6 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-fg/[0.06] bg-fg/[0.03]">
            <Package size={28} className="text-faint" />
          </div>
          <p className="mt-4 text-sm text-mist">Acompanhe suas encomendas</p>
          <p className="mt-1 text-[12px] text-faint">Digite o código de rastreio acima para consultar</p>
        </div>
      )}
    </div>
  );
};

export default RastrearPage;
