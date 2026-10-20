import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotionConfig } from "framer-motion";
import {
  Clock, Copy, Check, Loader2, MapPin, RotateCw, Link2, AlertTriangle, ListChecks, ChevronDown, Save,
} from "lucide-react";

import PontoService, { type ConfigPonto, type HorarioDia } from "@/features/ponto/services/ponto.service";
import { DIAS_SEMANA } from "@/shared/domain/funcionario";
import { SwitchField } from "@/shared/ui/form/FormKit";
import { Skeleton } from "@/shared/ui/skeleton";
import { useAlert } from "@/shared/ui/Alert";
import { useBuscaCep } from "@/shared/hooks/useBuscaCep";
import { maskCep } from "@/shared/validation/masks";
import { coordenadaDoEndereco, gpsDisponivel, pedirPosicao } from "@/shared/utils/geo";

/**
 * Onde a empresa configura o ponto que os funcionários batem pelo link.
 *
 * ---------------------------------------------------------------------------
 * Uma tela só, e não mais abas
 * ---------------------------------------------------------------------------
 * Eram quatro abas (Link, Local, Horário, Regras) dentro de uma caixa de
 * altura fixa. Separava bem, mas escondia: para conferir se o horário batia
 * com as batidas por dia era preciso ir e voltar, e o salvar no rodapé gravava
 * coisas que não estavam à vista. Agora tudo cabe numa tela, em blocos:
 *
 *   • no topo, o LINK — é o que se copia e se manda para a equipe;
 *   • à esquerda, o HORÁRIO — o maior bloco, com atalhos de semana e um
 *     "mesmo horário para todos", porque a loja quase sempre abre igual;
 *   • à direita, as REGRAS e o LOCAL — curtos, um sobre o outro.
 *
 * ---------------------------------------------------------------------------
 * Foto é opcional
 * ---------------------------------------------------------------------------
 * A selfie nasce DESLIGADA: a maioria das lojas não precisa dela, e pedir a
 * câmera a cada batida é o atrito que faz a equipe esquecer o ponto. Quem
 * exige a prova liga aqui, e só então o link passa a pedir a foto.
 */

/** O horário com que um dia recém-marcado nasce. */
const PADRAO: Omit<HorarioDia, "diaSemana"> = { abre: "08:00", fecha: "18:00" };

/* A semana começa na segunda, como a do balcão. */
const DIAS = [1, 2, 3, 4, 5, 6, 0].map((v) => DIAS_SEMANA.find((d) => d.valor === v)!);

/** Os atalhos de semana — o que se configura quase sempre, em um clique. */
const ATALHOS: { rotulo: string; dias: number[] }[] = [
  { rotulo: "Seg a Sex", dias: [1, 2, 3, 4, 5] },
  { rotulo: "Seg a Sáb", dias: [1, 2, 3, 4, 5, 6] },
  { rotulo: "Todos os dias", dias: [0, 1, 2, 3, 4, 5, 6] },
];

const OPCOES_BATIDAS = [
  { valor: 2, rotulo: "2", detalhe: "Entrada e saída" },
  { valor: 4, rotulo: "4", detalhe: "Com almoço" },
  { valor: 6, rotulo: "6", detalhe: "Dois intervalos" },
];

/* Os raios mais usados. O GPS erra de 20 a 50 m dentro de prédio, então
   nada abaixo de 100 entra como atalho. */
const RAIOS = [100, 200, 500];

const rotuloBatida = (i: number, total: number) => (i === 0 ? "Entrada" : i === total - 1 ? "Saída" : i % 2 === 1 ? "Sai p/ intervalo" : "Volta");

/** Abre e fecha por altura — o bloco empurra o resto em vez de cobrir. */
const REVELA = {
  fechado: { opacity: 0, height: 0 },
  aberto: { opacity: 1, height: "auto" },
};

const campo =
  "rounded-lg border border-fg/[0.09] bg-transparent px-2.5 py-2 text-[13px] text-ink outline-none transition-colors focus:border-accent/60 placeholder:text-faint";

const Bloco = ({ icone, titulo, extra, children, className = "" }: { icone: ReactNode; titulo: string; extra?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`flex min-w-0 flex-col rounded-xl border border-fg/[0.07] bg-fg/[0.02] ${className}`}>
    <header className="flex items-center gap-2 border-b border-fg/[0.06] px-3.5 py-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/[0.14] text-accent-soft">{icone}</span>
      <h3 className="min-w-0 flex-1 truncate text-[14px] tracking-tight text-ink">{titulo}</h3>
      {extra}
    </header>
    <div className="flex flex-col gap-3 p-3.5">{children}</div>
  </section>
);

const PontoConfigPainel = () => {
  const alert = useAlert();
  const reduzir = useReducedMotionConfig();

  const [config, setConfig] = useState<ConfigPonto | null>(null);
  /* O que está gravado no servidor — é contra ele que se sabe se há o que salvar. */
  const [salvo, setSalvo] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [pegandoLocal, setPegandoLocal] = useState(false);

  /* "Mesmo horário para todos": o par que se aplica de uma vez aos dias marcados. */
  const [todosAbre, setTodosAbre] = useState(PADRAO.abre);
  const [todosFecha, setTodosFecha] = useState(PADRAO.fecha);

  /* A segunda via da coordenada — ver a nota em `shared/utils/geo`. Fica
     recolhida: o GPS de dentro da loja resolve quase sempre. */
  const [porEndereco, setPorEndereco] = useState(false);
  const { buscar: buscarCep, buscando: buscandoCep } = useBuscaCep();
  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState("");
  const [buscandoEndereco, setBuscandoEndereco] = useState(false);
  const [ondeDeu, setOndeDeu] = useState("");

  const gps = gpsDisponivel();

  useEffect(() => {
    PontoService.config()
      .then((c) => {
        setConfig(c);
        setSalvo(JSON.stringify(c));
      })
      .catch((e) => alert.error("Não foi possível carregar", (e as Error).message))
      .finally(() => setCarregando(false));
  }, []);

  const alterado = useMemo(() => Boolean(config) && JSON.stringify(config) !== salvo, [config, salvo]);

  const url = config?.token ? `${window.location.origin}/ponto/${config.token}` : "";

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      alert.warning("Não foi possível copiar", "Selecione o endereço e copie à mão.");
    }
  };

  const renovar = async () => {
    const { confirmed } = await alert.confirm(
      "Gerar um link novo?",
      "O link atual para de funcionar na mesma hora. Quem já tiver o antigo — inclusive no mural da loja — precisa receber o novo.",
      { type: "warning", confirmText: "Gerar novo" },
    );

    if (!confirmed) return;

    try {
      /* Só o token muda: o que está sendo editado e ainda não foi salvo fica. */
      const novo = await PontoService.renovarLink();
      setConfig((c) => (c ? { ...c, token: novo.token } : novo));
      setSalvo((s) => (s ? JSON.stringify({ ...JSON.parse(s), token: novo.token }) : s));
      alert.success("Link novo gerado", "O anterior parou de funcionar.");
    } catch (e) {
      alert.error("Não foi possível gerar", (e as Error).message);
    }
  };

  /** Caminho 1: a coordenada do próprio aparelho, com o gestor dentro da loja. */
  const marcarLocalAtual = async () => {
    setPegandoLocal(true);
    setOndeDeu("");

    try {
      const { lat, lng } = await pedirPosicao();
      setConfig((c) => (c ? { ...c, latitude: lat, longitude: lng } : c));
    } catch (e) {
      alert.warning("Não foi possível usar o GPS", (e as Error).message);
    } finally {
      setPegandoLocal(false);
    }
  };

  /** Caminho 2: pelo endereço escrito (o CEP preenche a rua). */
  const preencherPeloCep = async () => {
    const achado = await buscarCep(cep);

    if (!achado) {
      alert.warning("CEP não encontrado", "Confira o número ou escreva o endereço à mão abaixo.");
      return;
    }

    setEndereco([achado.logradouro, achado.bairro, achado.cidade, achado.uf].filter(Boolean).join(", "));
  };

  const marcarPeloEndereco = async () => {
    setBuscandoEndereco(true);
    setOndeDeu("");

    try {
      const achado = await coordenadaDoEndereco(endereco);

      if (!achado) {
        alert.warning("Endereço não encontrado", "Tente incluir o número, o bairro e a cidade.");
        return;
      }

      setConfig((c) => (c ? { ...c, latitude: achado.coord.lat, longitude: achado.coord.lng } : c));

      /* O que o mapa entendeu volta para a tela: endereço aproximado é o risco
         desta via, e quem configurou precisa poder conferir antes de salvar. */
      setOndeDeu(achado.rotulo);
    } finally {
      setBuscandoEndereco(false);
    }
  };

  const salvar = async () => {
    if (!config || salvando) return;

    setSalvando(true);

    try {
      const gravada = await PontoService.salvarConfig(config);
      setConfig(gravada);
      setSalvo(JSON.stringify(gravada));
      alert.toast("success", "Configuração salva", undefined, { position: "bottom-right", timer: 1800 });
    } catch (e) {
      alert.error("Não foi possível salvar", (e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  /* ── Horários ─────────────────────────────────────────────────────────── */

  const diaMarcado = (valor: number) => config?.horarios.find((h) => h.diaSemana === valor);

  const ordenar = (hs: HorarioDia[]) => [...hs].sort((a, b) => a.diaSemana - b.diaSemana);

  const alternarDia = (valor: number) =>
    setConfig((c) => {
      if (!c) return c;

      const tem = c.horarios.some((h) => h.diaSemana === valor);

      return {
        ...c,
        horarios: tem ? c.horarios.filter((h) => h.diaSemana !== valor) : ordenar([...c.horarios, { diaSemana: valor, abre: todosAbre, fecha: todosFecha }]),
      };
    });

  const mudarDia = (valor: number, campoHora: "abre" | "fecha", texto: string) =>
    setConfig((c) => (c ? { ...c, horarios: c.horarios.map((h) => (h.diaSemana === valor ? { ...h, [campoHora]: texto } : h)) } : c));

  /* Um atalho de semana marca exatamente aqueles dias, com o horário do
     "mesmo horário para todos" — e mantém o horário de quem já estava marcado. */
  const aplicarAtalho = (dias: number[]) =>
    setConfig((c) => {
      if (!c) return c;

      return {
        ...c,
        horarios: ordenar(dias.map((d) => c.horarios.find((h) => h.diaSemana === d) ?? { diaSemana: d, abre: todosAbre, fecha: todosFecha })),
      };
    });

  const aplicarATodos = () =>
    setConfig((c) => (c ? { ...c, horarios: c.horarios.map((h) => ({ ...h, abre: todosAbre, fecha: todosFecha })) } : c));

  /* ── Render ───────────────────────────────────────────────────────────── */

  if (carregando) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-[86px] rounded-xl" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <Skeleton className="h-[380px] rounded-xl" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[200px] rounded-xl" />
            <Skeleton className="h-[168px] rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!config) {
    return <p className="py-8 text-center text-[12.5px] text-faint">Não foi possível carregar a configuração.</p>;
  }

  const semCerca = config.latitude == null || config.longitude == null;
  const marcados = config.horarios.map((h) => h.diaSemana).sort().join(",");

  return (
    <div className="flex flex-col gap-3">
      {/* ═══════════════════════════ Link ═══════════════════════════ */}
      <Bloco
        icone={<Link2 size={14} />}
        titulo="Link do ponto"
        extra={
          semCerca ? (
            <span className="flex items-center gap-1 rounded-full bg-danger/[0.12] px-2 py-0.5 text-[10.5px] text-danger">
              <AlertTriangle size={10} /> Falta o local da loja
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-success/[0.12] px-2 py-0.5 text-[10.5px] text-success">
              <Check size={10} /> Funcionando
            </span>
          )
        }
      >
        <div className="flex items-center gap-1.5">
          <input value={url} readOnly onFocus={(e) => e.currentTarget.select()} className={`${campo} min-w-0 flex-1 text-mist`} />

          <button
            type="button"
            onClick={() => void copiar()}
            className="focus-ring inline-flex h-[36px] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-3 text-[12.5px] text-white transition-all hover:brightness-110"
          >
            <AnimatePresence mode="wait"initial={false}>
              <motion.span
                key={copiado ? "ok" : "copiar"}
                initial={reduzir ? false : { opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduzir ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
                transition={{ duration: 0.14 }}
              >
                {copiado ? <Check size={14} /> : <Copy size={14} />}
              </motion.span>
            </AnimatePresence>
            <span className="hidden sm:inline">{copiado ? "Copiado" : "Copiar"}</span>
          </button>

          <button
            type="button"
            onClick={() => void renovar()}
            title="Gerar um link novo (o atual para de funcionar)"
            aria-label="Gerar um link novo"
            className="focus-ring flex h-[36px] w-[36px] shrink-0 cursor-pointer items-center justify-center rounded-lg border border-fg/[0.09] text-mist transition-colors hover:text-ink"
          >
            <RotateCw size={14} />
          </button>
        </div>
      </Bloco>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* ═══════════════════════════ Horário ═══════════════════════════ */}
        <Bloco icone={<Clock size={14} />} titulo="Horário de funcionamento">
          {/* Atalhos de semana: o caso comum em um clique, em vez de sete. */}
          <div className="flex flex-wrap gap-1.5">
            {ATALHOS.map((a) => {
              const ativo = marcados === [...a.dias].sort().join(",");

              return (
                <button
                  key={a.rotulo}
                  type="button"
                  onClick={() => aplicarAtalho(a.dias)}
                  aria-pressed={ativo}
                  className={`focus-ring cursor-pointer rounded-full border px-3 py-1 text-[11.5px] transition-colors ${
                    ativo ? "border-accent bg-accent text-white" : "border-fg/[0.1] text-mist hover:border-accent/40 hover:text-ink"
                  }`}
                >
                  {a.rotulo}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => aplicarAtalho([])}
              aria-pressed={config.horarios.length === 0}
              className={`focus-ring cursor-pointer rounded-full border px-3 py-1 text-[11.5px] transition-colors ${
                config.horarios.length === 0 ? "border-accent bg-accent text-white" : "border-fg/[0.1] text-mist hover:border-accent/40 hover:text-ink"
              }`}
            >
              Qualquer hora
            </button>
          </div>

          {/* "Mesmo horário para todos" — a loja quase sempre abre igual. */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-fg/[0.07] bg-fg/[0.02] px-3 py-2">
            <span className="text-[12.5px] text-ink">Mesmo horário</span>
            <input type="time"value={todosAbre} onChange={(e) => setTodosAbre(e.target.value)} className={`${campo} nums py-1`} aria-label="Abre às" />
            <span className="text-[11.5px] text-faint">às</span>
            <input type="time"value={todosFecha} onChange={(e) => setTodosFecha(e.target.value)} className={`${campo} nums py-1`} aria-label="Fecha às" />
            <button
              type="button"
              onClick={aplicarATodos}
              disabled={config.horarios.length === 0}
              className="focus-ring ml-auto cursor-pointer rounded-lg border border-fg/[0.1] px-2.5 py-1.5 text-[11.5px] text-mist transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              Aplicar aos dias marcados
            </button>
          </div>

          <ul className="flex flex-col gap-1">
            {DIAS.map((dia) => {
              const marcado = diaMarcado(dia.valor);

              return (
                <li key={dia.valor} className={`flex min-h-[40px] items-center gap-2.5 rounded-lg border px-2.5 py-1.5 transition-colors ${marcado ? "border-fg/[0.1] bg-fg/[0.03]" : "border-transparent"}`}>
                  {/* O dia é a chave liga/desliga: alvo grande, e o estado se lê pela cor. */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(marcado)}
                    onClick={() => alternarDia(dia.valor)}
                    className={`focus-ring w-[92px] shrink-0 cursor-pointer rounded-lg px-2.5 py-1.5 text-left text-[13px] tracking-tight transition-colors ${
                      marcado ? "bg-accent/[0.14] text-ink" : "text-mist hover:bg-fg/[0.04] hover:text-ink"
                    }`}
                  >
                    {dia.longo}
                  </button>

                  {marcado ? (
                    <span className="flex items-center gap-1.5">
                      <input type="time"value={marcado.abre} onChange={(e) => mudarDia(dia.valor, "abre", e.target.value)} className={`${campo} nums px-2 py-1`} aria-label={`${dia.longo}: abre às`} />
                      <span className="text-[12px] text-faint">às</span>
                      <input type="time"value={marcado.fecha} onChange={(e) => mudarDia(dia.valor, "fecha", e.target.value)} className={`${campo} nums px-2 py-1`} aria-label={`${dia.longo}: fecha às`} />
                    </span>
                  ) : (
                    <span className="text-[12.5px] text-faint">Fechado</span>
                  )}
                </li>
              );
            })}
          </ul>
        </Bloco>

        <div className="flex min-w-0 flex-col gap-3">
          {/* ═══════════════════════════ Regras ═══════════════════════════ */}
          <Bloco icone={<ListChecks size={14} />} titulo="Regras da batida">
            <div className="flex flex-col gap-1.5">
              <span className="text-[12.5px] text-ink">Batidas por dia</span>
              {/* Três botões em vez de um select: as opções cabem à vista, e
                  escolher é um toque. */}
              <div className="grid grid-cols-3 gap-1.5">
                {OPCOES_BATIDAS.map((o) => {
                  const on = config.pontosPorDia === o.valor;

                  return (
                    <button
                      key={o.valor}
                      type="button"
                      onClick={() => setConfig({ ...config, pontosPorDia: o.valor })}
                      aria-pressed={on}
                      className={`focus-ring flex cursor-pointer flex-col items-center rounded-lg border px-2 py-1.5 transition-colors ${
                        on ? "border-accent bg-accent/[0.12] text-ink" : "border-fg/[0.09] text-mist hover:border-accent/40"
                      }`}
                    >
                      <span className="nums text-[17px] leading-tight tracking-tight">{o.rotulo}</span>
                      <span className="text-[11px] text-faint">{o.detalhe}</span>
                    </button>
                  );
                })}
              </div>

              {/* A sequência resultante, desenhada — mais rápida de conferir
                  do que a regra escrita. */}
              <div className="flex flex-wrap items-center gap-1">
                {Array.from({ length: config.pontosPorDia }).map((_, i) => (
                  <motion.span
                    key={`${config.pontosPorDia}-${i}`}
                    initial={reduzir ? false : { opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.16, delay: reduzir ? 0 : i * 0.04 }}
                    className="rounded-full bg-fg/[0.05] px-2.5 py-0.5 text-[11px] text-mist"
                  >
                    {i + 1}. {rotuloBatida(i, config.pontosPorDia)}
                  </motion.span>
                ))}
              </div>
            </div>

            <SwitchField
              label="Exigir foto na batida"
              hint={
                config.exigeFoto
                  ? "Cada batida pede uma selfie, que fica como prova do registro."
                  : "Desligado: a batida usa só o CPF e a localização. Ligue se a empresa exige a selfie como prova."
              }
              checked={config.exigeFoto}
              onChange={(v) => setConfig({ ...config, exigeFoto: v })}
            />
          </Bloco>

          {/* ═══════════════════════════ Local ═══════════════════════════ */}
          <Bloco icone={<MapPin size={14} />} titulo="Local da loja">
            {semCerca ? (
              <p className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/[0.07] px-3 py-2 text-[11.5px] leading-[16px] text-danger">
                <AlertTriangle size={13} className="mt-px shrink-0" />
                Sem o local marcado, o link recusa todo mundo. Marque de dentro da loja.
              </p>
            ) : (
              <p className="flex items-center gap-2 text-[11.5px] text-mist">
                <Check size={13} className="shrink-0 text-success" />
                Marcado
                <span className="nums text-faint">
                  {config.latitude!.toFixed(5)}, {config.longitude!.toFixed(5)}
                </span>
              </p>
            )}

            <button
              type="button"
              onClick={() => void marcarLocalAtual()}
              disabled={pegandoLocal || !gps.ok}
              title={gps.ok ? undefined : gps.motivo}
              className="focus-ring inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-fg/[0.09] px-3 py-2 text-[12.5px] text-mist transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pegandoLocal ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
              {semCerca ? "Usar minha localização agora" : "Atualizar pela minha localização"}
            </button>

            {/* O motivo de o GPS não servir fica à vista: em `http://`o
                navegador simplesmente nunca responde, e o botão pareceria
                quebrado. */}
            {!gps.ok && <p className="text-[11px] leading-[15px] text-faint">{gps.motivo}</p>}

            {/* O endereço é a segunda via — recolhido até alguém precisar. */}
            <button
              type="button"
              onClick={() => setPorEndereco((v) => !v)}
              aria-expanded={porEndereco}
              className="focus-ring flex cursor-pointer items-center gap-1 self-start text-[11.5px] text-accent transition-colors hover:text-accent-soft"
            >
              Ou marcar pelo endereço
              <ChevronDown size={12} className={`transition-transform ${porEndereco ? "rotate-180" : ""}`} />
            </button>

            <AnimatePresence initial={false}>
              {porEndereco && (
                <motion.div
                  variants={reduzir ? undefined : REVELA}
                  initial="fechado"
                  animate="aberto"
                  exit="fechado"
                  transition={{ duration: 0.18 }}
                  className="flex flex-col gap-2 overflow-hidden"
                >
                  <div className="flex items-center gap-1.5">
                    <input value={cep} onChange={(e) => setCep(maskCep(e.target.value))} inputMode="numeric"placeholder="CEP"className={`${campo} nums w-[104px] shrink-0`} />
                    <button
                      type="button"
                      onClick={() => void preencherPeloCep()}
                      disabled={buscandoCep}
                      className="focus-ring shrink-0 cursor-pointer rounded-lg border border-fg/[0.09] px-2.5 py-2 text-[12px] text-mist transition-colors hover:text-ink disabled:opacity-50"
                    >
                      {buscandoCep ? <Loader2 size={13} className="animate-spin" /> : "Buscar"}
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <input value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, número, bairro, cidade"className={`${campo} min-w-0 flex-1`} />
                    <button
                      type="button"
                      onClick={() => void marcarPeloEndereco()}
                      disabled={buscandoEndereco || endereco.trim().length < 6}
                      className="focus-ring inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-fg/[0.09] px-2.5 py-2 text-[12px] text-mist transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {buscandoEndereco ? <Loader2 size={13} className="animate-spin" /> : <MapPin size={13} />}
                      Marcar
                    </button>
                  </div>

                  {ondeDeu && (
                    <p className="rounded-lg border border-success/25 bg-success/[0.07] px-2.5 py-2 text-[11.5px] leading-[16px] text-mist">
                      O mapa encontrou: <span className="text-ink">{ondeDeu}</span>
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12.5px] text-ink">Aceita até</span>
              {RAIOS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setConfig({ ...config, raioMetros: r })}
                  aria-pressed={config.raioMetros === r}
                  className={`focus-ring nums cursor-pointer rounded-full border px-2.5 py-1 text-[11.5px] transition-colors ${
                    config.raioMetros === r ? "border-accent bg-accent text-white" : "border-fg/[0.1] text-mist hover:border-accent/40"
                  }`}
                >
                  {r} m
                </button>
              ))}
              <input
                type="number"
                min={20}
                max={5000}
                step={10}
                value={config.raioMetros}
                onChange={(e) => setConfig({ ...config, raioMetros: Number(e.target.value) })}
                aria-label="Raio em metros"
                className={`${campo} nums w-[80px] py-1`}
              />
              <span className="text-[12.5px] text-mist">m da loja</span>
            </div>
          </Bloco>
        </div>
      </div>

      {/* O salvar grava a configuração INTEIRA, e diz quando há o que gravar —
          com tudo numa tela, é fácil mexer em dois blocos e esquecer de salvar. */}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-fg/[0.06] pt-3">
        <AnimatePresence initial={false}>
          {alterado && (
            <motion.span
              initial={reduzir ? false : { opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="flex items-center gap-1.5 text-[11.5px] text-warning"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-warning" />
              Alterações não salvas
            </motion.span>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => void salvar()}
          disabled={salvando || !alterado}
          className="focus-ring inline-flex min-h-[38px] cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-accent-soft to-accent px-5 text-[12.5px] text-white shadow-glow transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Salvar configuração
        </button>
      </div>
    </div>
  );
};

export default PontoConfigPainel;
