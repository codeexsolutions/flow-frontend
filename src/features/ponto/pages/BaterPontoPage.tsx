import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Camera, Check, Clock, Loader2, MapPin, AlertTriangle, RotateCw, User } from "lucide-react";

import PontoService, { type PontoBatido, type PontoLink, type QuemBate } from "@/features/ponto/services/ponto.service";
import { maskCpfCnpj } from "@/shared/validation/masks";
import { cpfValido, soDigitos } from "@/shared/utils/documento";
import { arquivoParaBase64, cameraAoVivoDisponivel, RESTRICOES_CAMERA } from "@/shared/utils/camera";
import { motivoDoErroGps, gpsDisponivel } from "@/shared/utils/geo";

/**
 * A tela em que o funcionário bate o ponto — sem login.
 *
 * ---------------------------------------------------------------------------
 * Quem abre isto não é usuário do sistema
 * ---------------------------------------------------------------------------
 * Não há sessão, não há menu, não há como navegar para outro lugar. A tela faz
 * uma coisa só, e a pessoa provavelmente está de pé na porta da loja, com uma
 * mão. Por isso os alvos são grandes, o passo é único e cada recusa diz o que
 * fazer em vez de "erro ao registrar".
 *
 * ---------------------------------------------------------------------------
 * A ordem: localização primeiro, foto depois
 * ---------------------------------------------------------------------------
 * A localização é pedida assim que a tela abre, porque é ela que pode recusar
 * a batida — e descobrir que está longe demais DEPOIS de tirar a foto é fazer
 * a pessoa trabalhar para nada.
 *
 * ---------------------------------------------------------------------------
 * A câmera tem dois caminhos
 * ---------------------------------------------------------------------------
 * `getUserMedia` só existe em `https://`. No iPhone abrindo pelo IP da rede,
 * `navigator.mediaDevices` é `undefined` — a chamada estoura um `TypeError`
 * que parece "permissão negada" e manda a pessoa liberar o que não é o
 * problema. Onde ele não está disponível, a foto vem do app de câmera do
 * próprio aparelho (`<input capture>`), que funciona em `http://` e não pede
 * permissão de site. Ver `shared/utils/camera`.
 */

const ROTULO: Record<PontoBatido["tipo"], string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saída",
  INTERVALO_INICIO: "Saída para o intervalo",
  INTERVALO_FIM: "Volta do intervalo",
};

const BaterPontoPage = () => {
  const { token = "" } = useParams();
  const reduzir = useReducedMotion();

  const [link, setLink] = useState<PontoLink | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroLink, setErroLink] = useState("");

  const [cpf, setCpf] = useState("");
  const [quem, setQuem] = useState<QuemBate | null>(null);
  const [procurando, setProcurando] = useState(false);

  const [local, setLocal] = useState<{ lat: number; lng: number } | null>(null);
  const [erroLocal, setErroLocal] = useState("");

  const [foto, setFoto] = useState<string | null>(null);
  const [camAberta, setCamAberta] = useState(false);
  const [erroCam, setErroCam] = useState("");
  const [lendoArquivo, setLendoArquivo] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [batido, setBatido] = useState<PontoBatido | null>(null);

  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  /* Calculados no render: dependem só do navegador e não mudam na sessão. */
  const camera = cameraAoVivoDisponivel();
  const gps = gpsDisponivel();

  /* ── O link ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    PontoService.abrir(token)
      .then(setLink)
      .catch((e) => setErroLink((e as Error).message))
      .finally(() => setCarregando(false));
  }, [token]);

  /* ── Quem é o dono do CPF ─────────────────────────────────────────────── */

  /**
   * O nome aparece enquanto se digita, com uma pausa curta.
   *
   * A pausa existe para não disparar uma consulta por tecla — são onze
   * dígitos, e o freio do servidor é por minuto. Só busca com o CPF completo e
   * válido: mandar número pela metade só gastaria tentativa do limite.
   */
  useEffect(() => {
    const digitos = soDigitos(cpf);

    if (!cpfValido(digitos)) {
      setQuem(null);
      setProcurando(false);
      return;
    }

    setProcurando(true);

    const id = setTimeout(async () => {
      setQuem(await PontoService.identificar(token, digitos));
      setProcurando(false);
    }, 350);

    return () => clearTimeout(id);
  }, [cpf, token]);

  /* ── A localização, pedida de saída ───────────────────────────────────── */

  const pedirLocal = () => {
    setErroLocal("");

    if (!gps.ok) {
      setErroLocal(gps.motivo ?? "Localização indisponível.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => setLocal({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (e) => setErroLocal(motivoDoErroGps(e)),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  useEffect(pedirLocal, []);

  /* ── A câmera ao vivo ─────────────────────────────────────────────────── */

  const fecharCamera = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCamAberta(false);
  };

  /* Desligada ao sair da tela: deixá-la ligada mantém a luz do aparelho acesa
     e o navegador marcando "em uso" depois do ponto batido. */
  useEffect(() => fecharCamera, []);

  /**
   * Abre a câmera dentro da página.
   *
   * O `<video>` já está no DOM antes do clique (escondido por CSS), então o
   * `srcObject` e o `play()` acontecem aqui mesmo, logo depois do `await`.
   * Montá-lo só agora e atribuir num `requestAnimationFrame` posterior é o que
   * quebrava no Safari — ele exige que o `play()` fique perto do gesto.
   */
  const abrirCamera = async () => {
    setErroCam("");

    try {
      const s = await navigator.mediaDevices.getUserMedia(RESTRICOES_CAMERA);

      stream.current = s;
      setCamAberta(true);

      if (video.current) {
        video.current.srcObject = s;
        await video.current.play().catch(() => undefined);
      }
    } catch (e) {
      const nome = (e as DOMException)?.name;

      setErroCam(
        nome === "NotAllowedError"
          ? "Permissão negada. Libere a câmera nas configurações do site e tente de novo."
          : nome === "NotFoundError"
            ? "Nenhuma câmera encontrada neste aparelho."
            : "Não foi possível abrir a câmera. Use o botão de tirar foto pelo aparelho.",
      );
      fecharCamera();
    }
  };

  const capturar = () => {
    const v = video.current;
    if (!v) return;

    const canvas = document.createElement("canvas");

    /* 640px de largura: o suficiente para reconhecer quem bateu, e pequeno o
       bastante para subir numa rede de loja. */
    const escala = 640 / (v.videoWidth || 640);
    canvas.width = 640;
    canvas.height = Math.round((v.videoHeight || 480) * escala);

    const ctx = canvas.getContext("2d");

    if (ctx) {
      /*
       * A foto sai ESPELHADA, igual à prévia.
       *
       * A prévia tem `-scale-x-100` — sem isso, mover a mão para a direita a
       * faz ir para a esquerda na tela, e ninguém consegue se enquadrar. Só
       * que o `drawImage` copiava o quadro CRU do vídeo, sem o espelho.
       * Resultado: a pessoa se via de um jeito, apertava o botão e a foto
       * aparecia invertida — o rosto trocando de lado entre um toque e o
       * outro, o que se lê como defeito mesmo sem saber o motivo.
       *
       * Espelhar aqui faz a foto ser o que estava na tela. É o que a pessoa
       * pode conferir: ela viu aquilo antes de apertar. A alternativa — tirar
       * o espelho da prévia — deixaria a foto "certa" e o enquadramento
       * impossível, trocando um incômodo por um obstáculo.
       */
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    }

    setFoto(canvas.toDataURL("image/jpeg", 0.8));
    fecharCamera();
  };

  /* ── A câmera do aparelho (o caminho que funciona em http) ────────────── */

  const aoEscolherArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const escolhido = e.target.files?.[0];

    /* O valor é limpo para que escolher a MESMA foto de novo dispare o evento
       outra vez — sem isso, refazer a foto depois de recusar não funciona. */
    e.target.value = "";

    if (!escolhido) return;

    setErroCam("");
    setLendoArquivo(true);

    try {
      setFoto(await arquivoParaBase64(escolhido));
    } catch {
      setErroCam("Não foi possível ler a foto. Tente novamente.");
    } finally {
      setLendoArquivo(false);
    }
  };

  /* ── Registrar ────────────────────────────────────────────────────────── */

  const podeBater = Boolean(local) && cpfValido(cpf) && (!link?.exigeFoto || Boolean(foto));

  const bater = async () => {
    if (!local || enviando) return;

    setEnviando(true);
    setErro("");

    try {
      setBatido(await PontoService.bater(token, {
        cpf: soDigitos(cpf),
        latitude: local.lat,
        longitude: local.lng,
        foto,
      }));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  /* ── Render ───────────────────────────────────────────────────────────── */

  const caixa = "w-full rounded-2xl border border-fg/[0.08] bg-fg/[0.03] px-4 py-3.5 text-[17px] text-ink outline-none transition-colors focus:border-accent/60";

  if (carregando) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-canvas text-mist">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  if (erroLink || !link) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
        <AlertTriangle className="h-8 w-8 text-warning" />
        <p className="max-w-xs text-[14px] text-mist">{erroLink || "Este link não está mais disponível."}</p>
      </div>
    );
  }

  /* Confirmação: a tela troca de assunto por inteiro. Quem bateu não tem mais
     nada a fazer aqui, e deixar o formulário à vista convida a bater de novo. */
  if (batido) {
    const quando = new Date(batido.momento);

    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
        <motion.span
          initial={reduzir ? false : { scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 22 }}
          className="flex h-20 w-20 items-center justify-center rounded-full bg-success/15 text-success ring-1 ring-success/30"
        >
          <Check size={38} />
        </motion.span>

        <div>
          <p className="text-[22px] leading-tight text-ink">{ROTULO[batido.tipo]} registrada</p>
          <p className="mt-1 text-[15px] text-mist">{batido.funcionarioNome}</p>
        </div>

        <p className="nums text-[34px] leading-none tracking-tight text-ink">
          {quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </p>

        <p className="text-[12.5px] text-faint">
          {quando.toLocaleDateString("pt-BR")} · batida {batido.indice} de {batido.total}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center bg-canvas px-5 py-8">
      <div className="flex w-full max-w-sm flex-col gap-5">

        {/* Identidade da empresa — e nada além dela. */}
        <div className="flex flex-col items-center gap-2 text-center">
          {link.logoUrl
            ? <img src={link.logoUrl} alt="" className="h-14 w-14 rounded-2xl object-cover" />
            : <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/[0.14] text-accent-soft"><Clock size={24} /></span>}

          <p className="text-[18px] leading-tight text-ink">{link.empresaNome || "Registro de ponto"}</p>
          <p className="text-[12.5px] text-faint">Informe seu CPF para registrar</p>
        </div>

        {!link.abertaAgora && (
          <p className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/[0.08] px-3.5 py-3 text-[12.5px] leading-[17px] text-warning">
            <AlertTriangle size={15} className="mt-px shrink-0" />
            A loja está fora do horário de funcionamento. O ponto não será aceito agora.
          </p>
        )}

        {!link.cercaConfigurada && (
          <p className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/[0.08] px-3.5 py-3 text-[12.5px] leading-[17px] text-warning">
            <AlertTriangle size={15} className="mt-px shrink-0" />
            A empresa ainda não marcou a localização da loja. Avise o responsável — o ponto não será aceito até lá.
          </p>
        )}

        {/* ---------- CPF ---------- */}
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-[0.08em] text-faint">Seu CPF</span>
            <input
              value={cpf}
              onChange={(e) => setCpf(maskCpfCnpj(e.target.value))}
              inputMode="numeric"
              autoComplete="off"
              placeholder="000.000.000-00"
              /* 17px: abaixo de 16 o iOS dá zoom sozinho ao focar, e a tela
                 inteira salta na cara de quem está batendo o ponto. */
              className={`${caixa} nums tracking-wide`}
            />
          </label>

          {/*
            O nome confirma o CPF ANTES da foto.
            Errar um dígito e só descobrir depois da selfie é a ida e volta que
            faz alguém desistir na porta da loja.
          */}
          <AnimatePresence mode="wait" initial={false}>
            {procurando ? (
              <motion.p
                key="procurando"
                initial={reduzir ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 px-1 text-[12.5px] text-faint"
              >
                <Loader2 size={13} className="animate-spin" /> Conferindo…
              </motion.p>
            ) : quem ? (
              <motion.div
                key={quem.nome}
                initial={reduzir ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-2.5 rounded-xl border border-success/25 bg-success/[0.07] px-3.5 py-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                  <User size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] text-ink">{quem.nome}</span>
                  <span className="block text-[11.5px] text-mist">
                    {ROTULO[quem.proxima]} · batida {quem.indice} de {quem.total}
                  </span>
                </span>
              </motion.div>
            ) : cpfValido(cpf) ? (
              <motion.p
                key="nao-achou"
                initial={reduzir ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-1 text-[12.5px] text-warning"
              >
                Não encontramos este CPF entre quem bate ponto aqui.
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>

        {/* ---------- Localização ---------- */}
        <div className="flex items-center gap-2.5 rounded-xl border border-fg/[0.07] bg-fg/[0.02] px-3.5 py-3">
          <MapPin size={16} className={local ? "shrink-0 text-success" : "shrink-0 text-faint"} />

          <span className="min-w-0 flex-1 text-[12.5px] leading-[17px]">
            {local
              ? <span className="text-mist">Localização confirmada</span>
              : <span className="text-faint">{erroLocal || "Obtendo sua localização…"}</span>}
          </span>

          {!local && (
            <button type="button" onClick={pedirLocal} className="focus-ring shrink-0 rounded-lg border border-fg/[0.1] px-2.5 py-1.5 text-[12px] text-mist">
              <RotateCw size={13} />
            </button>
          )}
        </div>

        {/* ---------- Foto ---------- */}
        {link.exigeFoto && (
          <div className="flex flex-col gap-2">
            {/*
              O `<video>` fica SEMPRE montado, escondido por CSS quando a
              câmera está fechada. É isso que permite atribuir o `srcObject` e
              chamar `play()` logo depois do clique — o Safari do iPhone exige
              essa proximidade com o gesto.
            */}
            <video
              ref={video}
              playsInline
              muted
              autoPlay
              className={camAberta
                ? "aspect-[3/4] w-full -scale-x-100 rounded-2xl bg-fg/[0.06] object-cover"
                : "hidden"}
            />

            {/* A câmera do próprio aparelho. Funciona em http e não pede
                permissão de site — é o caminho do iPhone na rede local. */}
            <input
              ref={arquivo}
              type="file"
              accept="image/*"
              capture="user"
              onChange={(e) => void aoEscolherArquivo(e)}
              className="hidden"
            />

            {camAberta ? (
              <div className="flex gap-2">
                <button type="button" onClick={fecharCamera} className="focus-ring flex-1 rounded-xl border border-fg/[0.1] py-3 text-[13px] text-mist">
                  Cancelar
                </button>
                <button type="button" onClick={capturar} className="focus-ring flex-[2] rounded-xl bg-accent py-3 text-[13px] text-white">
                  Tirar foto
                </button>
              </div>
            ) : foto ? (
              <>
                <img src={foto} alt="Foto do ponto" className="aspect-[3/4] w-full rounded-2xl object-cover" />
                <button
                  type="button"
                  onClick={() => { setFoto(null); if (camera.ok) void abrirCamera(); else arquivo.current?.click(); }}
                  className="focus-ring rounded-xl border border-fg/[0.1] py-2.5 text-[12.5px] text-mist"
                >
                  Tirar outra
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={lendoArquivo}
                  /* Um botão só, com dois caminhos por trás: quem usa não
                     precisa saber que existe diferença entre eles. */
                  onClick={() => { if (camera.ok) void abrirCamera(); else arquivo.current?.click(); }}
                  className="focus-ring flex min-h-[64px] w-full items-center justify-center gap-2.5 rounded-2xl border border-dashed border-fg/[0.14] text-[14px] text-mist transition-colors hover:border-accent/40 hover:text-ink disabled:opacity-50"
                >
                  {lendoArquivo ? <Loader2 size={19} className="animate-spin" /> : <Camera size={19} />}
                  {lendoArquivo ? "Carregando a foto…" : "Tirar a foto"}
                </button>

                {/* Quando a câmera ao vivo não existe, o motivo fica à vista —
                    senão o botão parece se comportar de forma diferente sem
                    explicação. */}
                {!camera.ok && (
                  <p className="px-1 text-[11.5px] leading-[16px] text-faint">{camera.motivo}</p>
                )}

                {erroCam && <p className="px-1 text-[12px] text-danger">{erroCam}</p>}
              </>
            )}
          </div>
        )}

        {erro && (
          <p className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/[0.08] px-3.5 py-3 text-[12.5px] leading-[17px] text-danger">
            <AlertTriangle size={15} className="mt-px shrink-0" />
            {erro}
          </p>
        )}

        <button
          type="button"
          onClick={() => void bater()}
          disabled={!podeBater || enviando}
          /* Alvo de 56px: a tela é usada de pé, com uma mão, muitas vezes com
             o aparelho na altura do peito. */
          /* Uma cor só, como na tela de entrada do domínio próprio: esta
             página é da EMPRESA — quem a abre é funcionário dela, pelo link
             que ela mandou —, e degradê de dois tons é desenho nosso. */
          className="focus-ring flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[16px] text-white transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {enviando ? <Loader2 size={19} className="animate-spin" /> : <Clock size={19} />}
          {enviando ? "Registrando…" : quem ? `Bater ${ROTULO[quem.proxima].toLowerCase()}` : "Bater ponto"}
        </button>

        <p className="text-center text-[11px] leading-[16px] text-faint">
          O horário registrado é o do servidor, não o do seu aparelho.
        </p>
      </div>
    </div>
  );
};

export default BaterPontoPage;
