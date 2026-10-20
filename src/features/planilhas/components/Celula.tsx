import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, ImagePlus, Loader2, Upload } from "lucide-react";

import sysgrafix from "@/shared/api/sysgrafix";
import { corDaOpcao, type Coluna } from "@/features/planilhas/services/planilha.service";
import { formatCurrency } from "@/shared/utils/currency";
import useClienteStore from "@/features/clientes/store/cliente.store";
import ComboCliente from "@/features/planilhas/components/ComboCliente";
import Select from "@/shared/ui/Select";
import Suspenso from "@/shared/ui/Suspenso";
import Calendario from "@/shared/ui/Calendario";

type Props = {
  coluna: Coluna;
  valor: unknown;
  onSalvar: (valor: unknown) => void;
  /** Falso quando a coluna é restrita e esta pessoa não está na lista. */
  editavel?: boolean;
};

/* Célula grande — 14px de texto, linha de ~58px e coluna de 240px: a
   planilha é a tela em que se passa o dia, e em 100% de zoom a versão de
   12,5px e 41px de linha ficava pequena demais para ler e para acertar. */
const base = "h-full w-full bg-transparent px-4 py-[18px] text-[14px] text-ink outline-none";

/**
 * Uma célula da planilha.
 *
 * O tipo da coluna decide o editor: texto vira campo, seleção vira lista,
 * sim/não vira caixa, imagem vira miniatura. É o que faz a planilha parecer
 * planilha em vez de formulário — você digita e sai, sem botão de salvar.
 *
 * A gravação acontece ao SAIR do campo, não a cada tecla. Salvar por tecla
 * geraria uma requisição por letra; salvar por botão obrigaria um clique a
 * mais em cada célula.
 */
const Celula = ({ coluna, valor, onSalvar, editavel = true }: Props) => {
  const [rascunho, setRascunho] = useState(() => (valor == null ? "" : String(valor)));
  const original = useRef(rascunho);

  /* A lista vem da store, que só busca uma vez por sessão — sem isso, uma
     planilha de cem linhas dispararia cem buscas de clientes iguais. */
  const clientes = useClienteStore((s) => s.clientes);
  const buscarClientes = useClienteStore((s) => s.fetchClientes);

  useEffect(() => {
    if (coluna.tipo === "CLIENTE") buscarClientes();
  }, [coluna.tipo, buscarClientes]);

  /* Valor mudou por fora (recarga, outra pessoa editando): acompanha, desde
     que o usuário não esteja no meio de uma edição. */
  useEffect(() => {
    const novo = valor == null ? "" : String(valor);

    if (document.activeElement?.getAttribute("data-celula") !== coluna.id) {
      setRascunho(novo);
      original.current = novo;
    }
  }, [valor, coluna.id]);

  /* Envio da imagem da célula.
     Fica aqui em cima, e não junto do editor de imagem, porque abaixo há um
     `return` para célula sem permissão: hook depois dele só rodaria em parte
     das células, e o React conta hooks por posição. */
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState("");

  const enviarImagem = async (arquivo: File) => {
    setErroEnvio("");
    setEnviando(true);

    try {
      const corpo = new FormData();
      corpo.append("imagem", arquivo);

      /* Sem `Content-Type` à mão: o browser precisa montar o `boundary` do
         multipart sozinho, senão o multer não acha o arquivo. */
      const { data } = await sysgrafix.post("/upload/planilha", corpo);
      const url = data?.data?.[0]?.url;

      if (!url) throw new Error(data?.message || "Falha ao enviar.");

      /* Grava direto, sem esperar o blur: aqui não houve digitação, houve uma
         escolha de arquivo — e a pessoa já saiu para olhar a miniatura. */
      setRascunho(url);
      original.current = url;
      onSalvar(url);

    } catch (e) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };

      setErroEnvio(err?.response?.data?.message ?? err?.message ?? "Não foi possível enviar.");
    } finally {
      setEnviando(false);
      if (arquivoRef.current) arquivoRef.current.value = "";
    }
  };


  /* Célula sem permissão mostra o valor e recusa o foco: apagar da tela
     esconderia informação que a pessoa pode ver, só não pode mudar. */
  if (!editavel) {
    return <div className={`${base} cursor-not-allowed truncate text-mist/70`}>{coluna.tipo === "DATA" ? dataCurta(rascunho) : rascunho}</div>;
  }

  const confirmar = (v: string) => {
    if (v === original.current) return; // nada mudou: não gasta requisição

    original.current = v;
    onSalvar(v === "" ? null : v);
  };

  if (coluna.tipo === "CHECKBOX") {
    const marcado = valor === true || valor === "true";

    return (
      <button
        onClick={() => onSalvar(!marcado)}
        className="flex h-full w-full items-center justify-center py-2 transition-colors hover:bg-fg/[0.03]"
        aria-pressed={marcado}
      >
        <span className={`grid h-4 w-4 place-items-center rounded border ${marcado ? "border-accent bg-accent text-white" : "border-fg/[0.2]"}`}>
          {marcado && <Check size={11} />}
        </span>
      </button>
    );
  }

  if (coluna.tipo === "SELECAO") {
    /*
     * `Array.isArray` antes de usar, e não confiança no tipo.
     *
     * O tipo diz `Opcao[]`, mas o que chega vem de um JSONB: havia colunas
     * gravadas com `{}` no lugar de `[]`, e `{}.find` não existe. O erro
     * estourava no meio do render e derrubava a planilha inteira — uma coluna
     * malformada não pode custar a tela toda. A API também normaliza
     * (`ListarColunas`); isto aqui é o cinto de segurança para o dado que já
     * está no navegador de alguém.
     */
    const opcoes = Array.isArray(coluna.opcoes) ? coluna.opcoes : [];

    return (
      /* O seletor do sistema, sem moldura: a lista segue o tema e mostra a cor
         de cada alternativa. A cor fica num ponto ao lado, não no fundo da
         célula — fundo colorido em planilha vira mancha e come o texto. */
      <Select
        variante="celula"
        dataCelula={coluna.id}
        aria-label={coluna.nome}
        valor={rascunho}
        disabled={!editavel}
        placeholder=""
        onChange={(v) => {
          setRascunho(v);
          confirmar(v);
        }}
        opcoes={[{ valor: "", label: "Nenhuma" }, ...opcoes.map((o) => ({ valor: o.valor, label: o.valor, cor: corDaOpcao(o) }))]}
      />
    );
  }

  /*
   * Coluna de cliente: escolhe do cadastro, não digita.
   *
   * Em texto livre o mesmo cliente entra como "Maria", "maria silva" e
   * "Maria S." em três linhas diferentes, e a planilha perde a capacidade de
   * agrupar por cliente — que costuma ser a única pergunta que se faz a ela
   * no fim do mês.
   *
   * Guardamos o NOME e não o id: a planilha é lida por gente, e uma célula
   * que mostra um UUID quando o cadastro some não ajuda ninguém. O vínculo
   * forte fica para quando existir relatório cruzando as duas coisas.
   */
  if (coluna.tipo === "CLIENTE") {
    /*
     * Campo com lista, e não uma lista fechada.
     *
     * Era um `<select>`: só dava para escolher o que já estava no cadastro.
     * Num balcão isso trava o trabalho — o pedido chega antes de o cliente
     * virar cadastro, e a pessoa precisava sair da planilha, cadastrar, voltar
     * e achar a linha de novo. Pior num cadastro grande, onde achar o nome numa
     * lista de trezentos sem poder digitar é rolagem pura.
     *
     * Agora dá para digitar e escolher. O nome digitado à mão é gravado como
     * está, que é o mesmo que a planilha sempre fez com cliente excluído do
     * cadastro — o valor é o NOME, não uma referência.
     */
    return (
      <ComboCliente
        valor={rascunho}
        opcoes={clientes.map((c) => c.nome).filter(Boolean)}
        colunaId={coluna.id}
        onEscolher={(v) => {
          setRascunho(v);
          confirmar(v);
        }}
      />
    );
  }

  if (coluna.tipo === "IMAGEM") {
    /*
     * A guia do pedido: a arte, o mockup, a prova impressa.
     *
     * Era só um campo de link, porque não havia onde guardar arquivo. Havia
     * agora: o mesmo `/upload` da logo e do wallpaper. E a diferença importa
     * mais aqui do que na logo — quem tem a arte tem um ARQUIVO na máquina,
     * não uma URL; para colar um link teria de subir a imagem em algum lugar
     * antes, e o "algum lugar" que as pessoas usam é o WhatsApp Web, cujo link
     * EXPIRA. A guia sumiria da tela do cliente sozinha, dias depois.
     *
     * O campo de texto continua: quem já tem a imagem hospedada cola e segue.
     */
    return (
      <div className="flex h-full items-center gap-2.5 px-3 py-2">
        <button
          type="button"
          onClick={() => arquivoRef.current?.click()}
          disabled={enviando}
          title={rascunho ? "Trocar a imagem" : "Enviar uma imagem"}
          className="focus-ring group relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded bg-fg/[0.05] text-muted ring-1 ring-fg/10 transition-colors hover:text-accent"
        >
          {enviando ? (
            <Loader2 size={13} className="animate-spin text-accent" />
          ) : rascunho ? (
            <>
              <img src={rascunho} alt="" className="h-full w-full object-cover" />
              {/* O sinal de troca só no hover: a miniatura existe para
                  CONFERIR a arte, e um ícone permanente por cima a tampa. */}
              <span className="absolute inset-0 hidden place-items-center bg-canvas/70 group-hover:grid">
                <Upload size={12} className="text-accent" />
              </span>
            </>
          ) : (
            <ImagePlus size={13} />
          )}
        </button>

        <input
          ref={arquivoRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const arquivo = e.target.files?.[0];

            if (arquivo) void enviarImagem(arquivo);
          }}
        />

        <input
          data-celula={coluna.id}
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          onBlur={(e) => confirmar(e.target.value)}
          placeholder={erroEnvio || "Enviar ou colar link"}
          title={erroEnvio || undefined}
          className={`min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none ${erroEnvio ? "placeholder:text-danger" : "placeholder:text-faint"}`}
        />
      </div>
    );
  }

  if (coluna.tipo === "TEXTO_LONGO") {
    return (
      <textarea
        data-celula={coluna.id}
        value={rascunho}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={(e) => confirmar(e.target.value)}
        rows={1}
        className={`${base} resize-none`}
      />
    );
  }

  if (coluna.tipo === "DATA") {
    return (
      <CampoData
        valor={rascunho}
        colunaId={coluna.id}
        rotulo={coluna.nome}
        onEscolher={(v) => {
          setRascunho(v);
          confirmar(v);
        }}
      />
    );
  }

  const tipoHtml = coluna.tipo === "NUMERO" || coluna.tipo === "MOEDA" ? "number" : "text";

  return (
    <input
      data-celula={coluna.id}
      type={tipoHtml}
      value={rascunho}
      onChange={(e) => setRascunho(e.target.value)}
      onBlur={(e) => confirmar(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setRascunho(original.current);
          (e.target as HTMLInputElement).blur();
        }
      }}
      /* Moeda mostra formatado quando não está em edição — na edição, o número
         cru, senão o cursor briga com a máscara. */
      title={coluna.tipo === "MOEDA" && rascunho ? formatCurrency(Number(rascunho) || 0) : undefined}
      className={`${base} ${coluna.tipo === "NUMERO" || coluna.tipo === "MOEDA" ? "text-right tabular-nums" : ""}`}
    />
  );
};

/** `2026-10-20` → `20/10/2026`. Vazio continua vazio — sem traço. */
const dataCurta = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

/** `Date` local → `2026-10-20`, sem passar por UTC (que mudaria o dia à noite). */
const paraIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * A célula de data: a CÉLULA INTEIRA é o botão, e ela abre o calendário do
 * sistema.
 *
 * Era um `<input type="date">`: só o ícone minúsculo do canto abria o
 * calendário, o resto da célula pedia para digitar dia, mês e ano em três
 * pedaços, e o calendário que abria era o do navegador, fora do tema. Agora um
 * clique em qualquer ponto da célula abre a grade do mês, e escolher o dia já
 * grava. Abre num `Suspenso` porque a grade da planilha corta o que transborda.
 */
const CampoData = ({ valor, colunaId, rotulo, onEscolher }: { valor: string; colunaId: string; rotulo: string; onEscolher: (v: string) => void }) => {
  const [aberto, setAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  const dia = valor ? new Date(`${valor.slice(0, 10)}T12:00:00`) : null;

  const escolher = (v: string) => {
    onEscolher(v);
    setAberto(false);
    botao.current?.focus();
  };

  return (
    <>
      <button
        ref={botao}
        type="button"
        data-celula={colunaId}
        aria-label={`${rotulo}: ${valor ? dataCurta(valor) : "sem data"}`}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
        className={`${base} flex cursor-pointer items-center gap-2 text-left tabular-nums transition-colors hover:bg-fg/[0.03] ${aberto ? "bg-accent/[0.06]" : ""}`}
      >
        {/* Vazia, a célula mostra o formato que vai receber — sem isso ela
            parecia menor que as outras, só com um ícone solto no canto. */}
        <span className={`min-w-0 flex-1 truncate ${valor ? "" : "text-faint"}`}>{valor ? dataCurta(valor) : "DD / MM / AAAA"}</span>
        <CalendarDays size={15} className="shrink-0 text-muted" />
      </button>

      <Suspenso aberto={aberto} onFechar={() => setAberto(false)} ancora={botao} largura={288} alturaMax={420}>
        <Calendario
          valor={dia && !Number.isNaN(dia.getTime()) ? dia : null}
          onEscolher={(d) => escolher(paraIso(d))}
          rodape={
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => escolher(paraIso(new Date()))}
                className="focus-ring flex-1 cursor-pointer rounded-lg border border-fg/[0.08] py-1.5 text-[12px] text-mist transition-colors hover:bg-fg/[0.05] hover:text-ink"
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => escolher("")}
                disabled={!valor}
                className="focus-ring flex-1 cursor-pointer rounded-lg border border-fg/[0.08] py-1.5 text-[12px] text-mist transition-colors hover:bg-fg/[0.05] hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                Limpar
              </button>
            </div>
          }
        />
      </Suspenso>
    </>
  );
};

export default Celula;
