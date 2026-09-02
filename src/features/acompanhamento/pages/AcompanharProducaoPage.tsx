import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CalendarCheck, Check, CircleAlert, Clock, ExternalLink, Maximize2, MessageCircle, Paperclip, X } from "lucide-react";

import AcompanhamentoService, { type ProducaoPublica } from "@/features/acompanhamento/services/acompanhamento.service";
import { paleta, rgba, type Paleta } from "@/features/acompanhamento/marca";
import useProducaoAoVivo from "@/features/acompanhamento/aoVivo";

/**
 * A tela que o cliente da gráfica abre — sem login, sem menu, sem app.
 *
 * O que ela NÃO faz é a parte importante:
 *
 * - Não monta o layout do sistema. Quem abre não é usuário do Flow; carregar
 *   sidebar, store de plano e sessão para mostrar quatro linhas seria peso
 *   inútil num link que quase sempre abre no 4G do celular.
 * - Não pede nada além do token. Cliente, colunas e período vêm decididos do
 *   servidor. Se esta tela pudesse escolher, o filtro estaria do lado errado.
 * - Não oferece edição. É acompanhamento; o pedido continua sendo alterado
 *   por quem produz.
 *
 * ---------------------------------------------------------------------
 * Por que não é uma tabela
 * ---------------------------------------------------------------------
 * A planilha de fardamento tem onze etapas. Numa tabela isso vira treze
 * colunas: rolagem horizontal no celular, que é onde o link é aberto, e o
 * cliente teria de arrastar para descobrir o que já ficou pronto.
 *
 * Aqui cada pedido é um cartão com a esteira das etapas. A pergunta que o
 * cliente tem é uma só — "onde está o meu?" — e ela se responde vendo onde a
 * trilha para de estar preenchida.
 *
 * ---------------------------------------------------------------------
 * A ordem de leitura do cartão
 * ---------------------------------------------------------------------
 * Ela não é a ordem das colunas da planilha, e isso é deliberado. Quem abre o
 * link pergunta três coisas, nesta ordem:
 *
 *   1. "é o meu mesmo?"  → a GUIA, a arte do pedido, no topo do cartão
 *   2. "quando chega?"   → o PRAZO, em faixa própria
 *   3. "em que pé está?" → a esteira de etapas
 *
 * A planilha, montada por quem PRODUZ, tem outra ordem — cliente, atendimento,
 * arte, custo. Reproduzi-la aqui obrigaria o cliente a varrer o cartão inteiro
 * para achar a data, que é justamente o que ele mais volta para conferir.
 *
 * ---------------------------------------------------------------------
 * Por que as cores não vêm dos tokens do Flow
 * ---------------------------------------------------------------------
 * O resto do sistema pinta com `bg-canvas`, `text-fg` e afins, que saem do tema
 * guardado no `localStorage` de cada usuário. Aqui isso daria uma página que
 * muda de cara conforme quem abre: o dono da gráfica, com tema escuro, veria
 * uma tela diferente da que o cliente dele vê — e a conferência do link
 * deixaria de valer. Pior, a paleta seria a do Flow, não a da empresa.
 *
 * A paleta sai de `marca.ts`, a mesma que alimenta a prévia na configuração.
 */

const dataBr = (valor: string) => {
  /* `new Date("2026-08-20")` é meia-noite UTC e volta um dia no fuso do
       Brasil — o prazo apareceria sempre um dia antes. Partir a string evita o
       problema sem depender de biblioteca. */
  const [ano, mes, dia] = valor.split("-");

  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
};

const formatarData = (iso: string | null) => {
  if (!iso) return null;

  const d = new Date(iso);

  return Number.isNaN(d.getTime()) ? null : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

/**
 * Quantos dias faltam para a data — negativo já passou.
 *
 * Compara DIA com DIA, e não instante com instante: um prazo marcado para hoje
 * vira meia-noite, e às 14h a conta por instante diria "atrasado". Não é o que
 * "a entrega é hoje" significa para quem espera a encomenda.
 */
const diasAte = (valor: string): number | null => {
  const [ano, mes, dia] = valor.split("-").map(Number);

  if (!ano || !mes || !dia) return null;

  const alvo = new Date(ano, mes - 1, dia);
  const hoje = new Date();

  hoje.setHours(0, 0, 0, 0);

  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
};

/** Só dígitos — `wa.me` recusa parênteses e traços. */
const soDigitos = (t: string) => t.replace(/\D/g, "");

type Coluna = ProducaoPublica["colunas"][number];

/**
 * Quanto daquela etapa já andou, de 0 a 1.
 *
 * Sai da POSIÇÃO do valor na lista de alternativas, não de um dicionário de
 * palavras. A lista é escrita na ordem do trabalho por quem montou a planilha
 * ("NÃO INICIADO, ANDAMENTO, FINALIZADO"), então a posição já carrega o
 * progresso — e a mesma conta serve para "0%, 50%, 100%" sem saber que uma
 * fala de produção e a outra de dinheiro.
 *
 * Um dicionário quebraria na primeira empresa que escrevesse "concluído",
 * "pronto" ou "OK". A posição não depende da palavra.
 */
const progressoDa = (coluna: Coluna, valor: string | null): number | null => {
  if (valor == null || coluna.opcoes.length < 2) return null;

  const i = coluna.opcoes.findIndex((o) => o.valor === valor);

  return i < 0 ? null : i / (coluna.opcoes.length - 1);
};

const VERDE = "#22c55e";
const AMBAR = "#f59e0b";
const VERMELHO = "#ef4444";

/**
 * Como o prazo aparece: cor e frase.
 *
 * A data sozinha ("20/08/2026") obriga o cliente a fazer a conta de cabeça — e
 * é justamente a conta que ele quer pronta. A frase responde direto, e a cor dá
 * a resposta antes mesmo da leitura.
 *
 * Pedido concluído nunca fica vermelho: prazo vencido DEPOIS da entrega é um
 * fato irrelevante, e pintá-lo de alerta deixaria o cliente achando que algo
 * deu errado com o pedido que ele já recebeu.
 */
const situacaoPrazo = (valor: string, concluido: boolean, p: Paleta) => {
  const dias = diasAte(valor);

  if (concluido) return { cor: VERDE, frase: "entrega concluída", alerta: false };

  if (dias == null) return { cor: p.destaque, frase: "", alerta: false };

  if (dias < 0) return { cor: VERMELHO, frase: dias === -1 ? "1 dia de atraso" : `${Math.abs(dias)} dias de atraso`, alerta: true };

  if (dias === 0) return { cor: AMBAR, frase: "é hoje", alerta: false };

  if (dias === 1) return { cor: AMBAR, frase: "é amanhã", alerta: false };

  if (dias <= 3) return { cor: AMBAR, frase: `faltam ${dias} dias`, alerta: false };

  return { cor: p.destaque, frase: `faltam ${dias} dias`, alerta: false };
};

const AcompanharProducaoPage = () => {
  const { token = "" } = useParams();

  const [dados, setDados] = useState<ProducaoPublica | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [ampliada, setAmpliada] = useState<string | null>(null);

  const carregar = useCallback(
    async (silencioso = false) => {
      /* A recarga do tempo real NÃO apaga a tela.
           Quem está com a página aberta está olhando o cartão; trocá-lo pelo
           estado de carregamento a cada célula que alguém preenche na gráfica
           faria a página piscar sozinha na mão do cliente — que é pior do que
           o botão de atualizar que isto veio substituir. */
      if (silencioso) setAtualizando(true);
      else setCarregando(true);

      const novo = await AcompanhamentoService.producao(token);

      /* Aviso de mudança não pode APAGAR a página.
           A recarga silenciosa pode voltar `null` por queda de rede ou pelo
           link ter sido revogado no meio; trocar o conteúdo por "Link
           indisponível" numa página que já estava aberta e correta é um susto
           gratuito. Sem resposta, fica o que já estava. */
      if (novo || !silencioso) setDados(novo);

      setCarregando(false);
      setAtualizando(false);
    },
    [token],
  );

  useEffect(() => {
    carregar();
  }, [carregar]);

  /* O tempo real no lugar do botão.
       O que a página responde ("em que pé está o meu pedido?") muda enquanto
       ela está aberta — é a tela que o cliente deixa num canto e volta a olhar.
       Um botão de atualizar transfere para ele o trabalho de descobrir se
       mudou, e a resposta é "não" quase sempre. */
  useProducaoAoVivo(token, () => carregar(true), Boolean(dados));

  const p = useMemo(() => paleta(dados?.empresa.cor ?? null, dados?.empresa.tema ?? "claro"), [dados?.empresa.cor, dados?.empresa.tema]);

  /* A aba do navegador é parte da personalização: o cliente costuma deixar o
       link aberto entre uma conferida e outra, e "Codex Flow" ali diria o nome
       do sistema em vez do de quem ele contratou. */
  useEffect(() => {
    if (dados?.empresa.nome) document.title = `${dados.cliente} · ${dados.empresa.nome}`;

    return () => {
      document.title = "Codex Flow";
    };
  }, [dados?.empresa.nome, dados?.cliente]);

  useEffect(() => {
    if (!ampliada) return;

    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAmpliada(null);

    document.addEventListener("keydown", tecla);

    return () => document.removeEventListener("keydown", tecla);
  }, [ampliada]);

  /* As colunas são separadas UMA vez, e não a cada cartão: com onze etapas e
       várias linhas, refazer a classificação por linha seria trabalho repetido
       para uma resposta que não muda. */
  const grupos = useMemo(() => {
    const cols = dados?.colunas ?? [];
    const indices = cols.map((_, i) => i);

    /* O prazo sai da marcação "é o prazo" da planilha, não do NOME da
           coluna: "Prazo", "Entrega" e "Data de entrega" são a mesma coisa em
           três empresas, e adivinhar por texto erraria na quarta. */
    const prazo = indices.find((i) => cols[i].prazo && cols[i].tipo === "DATA");

    return {
      prazo: prazo ?? null,
      etapas: indices.filter((i) => cols[i].tipo === "SELECAO" && cols[i].opcoes.length >= 2),
      /* A coluna de prazo sai das datas comuns: ela ganhou faixa própria
               no cartão, e repeti-la embaixo faria o cliente conferir duas
               vezes a mesma data só para ter certeza de que são a mesma. */
      datas: indices.filter((i) => cols[i].tipo === "DATA" && i !== prazo),
      imagens: indices.filter((i) => cols[i].tipo === "IMAGEM"),
      outros: indices.filter((i) => !["DATA", "IMAGEM"].includes(cols[i].tipo) && !(cols[i].tipo === "SELECAO" && cols[i].opcoes.length >= 2)),
    };
  }, [dados?.colunas]);

  /* Havia socket em todo o sistema, menos aqui: o visitante não tem token de
       sessão para autenticar o handshake, e o canal era por empresa. A saída
       era um botão de atualizar — que empurra para o cliente o trabalho de
       descobrir se algo mudou, com a resposta sendo "não" quase sempre.

       Agora o handshake aceita o token DO LINK e coloca a conexão numa sala só
       de visitantes. Ver `aoVivo.ts` e `realtime/eventos.ts`. */

  /**
   * O wallpaper da empresa — o mesmo que já veste a nota e o orçamento.
   *
   * Entra como fundo FIXO da página, atrás de um véu da cor do tema. Sem o
   * véu, o texto do cartão disputaria com a foto, e wallpaper de gráfica é
   * escolhido pensando em papel timbrado, nunca em contraste de leitura. Com
   * ele, a imagem vira ambiente: dá a cara da empresa sem cobrar nada da
   * legibilidade.
   *
   * Vem do cadastro, não da personalização: quem já subiu o wallpaper para a
   * nota ganha a página vestida sem configurar nada de novo.
   */
  const wallpaper = dados?.empresa.wallpaper ?? null;

  const fundo = (
    <>
      <div className="fixed inset-0 -z-20" style={{ backgroundColor: p.fundo }} />

      {wallpaper && (
        <>
          <div className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: `url("${wallpaper}")`, opacity: p.escuro ? 0.18 : 0.14 }} />
          {/* O degradê tira a imagem de baixo do conteúdo denso e a
                        deixa respirar no topo, onde só existe a marca. */}
          <div className="fixed inset-0 -z-10" style={{ background: `linear-gradient(to bottom, ${rgba(p.fundo, 0.2)} 0%, ${rgba(p.fundo, 0.8)} 55%, ${p.fundo} 100%)` }} />
        </>
      )}
    </>
  );

  if (carregando) {
    return (
      <div className="grid min-h-[100dvh] place-items-center px-6">
        {fundo}
        <motion.div animate={{ opacity: [0.35, 1, 0.35] }} transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }} className="h-9 w-9 rounded-xl" style={{ backgroundColor: rgba(p.destaque, 0.35) }} />
      </div>
    );
  }

  if (!dados) {
    return (
      <div className="grid min-h-[100dvh] place-items-center px-6">
        {fundo}
        <div className="w-full max-w-sm rounded-3xl p-8 text-center shadow-lg" style={{ backgroundColor: p.cartao, border: `1px solid ${p.linha}` }}>
          <CircleAlert className="mx-auto mb-3" size={28} style={{ color: p.fraco }} />
          <h1 className="text-base font-semibold" style={{ color: p.tinta }}>
            Link indisponível
          </h1>
          <p className="mt-2 text-sm" style={{ color: p.apagado }}>
            Este link de acompanhamento não está mais válido. Peça um novo a quem enviou.
          </p>
        </div>
      </div>
    );
  }

  const { empresa, colunas } = dados;
  const atualizado = formatarData(dados.atualizadoEm);
  const whats = empresa.whatsapp ? soDigitos(empresa.whatsapp) : "";

  /* A faixa do cabeçalho: a capa, se houver; senão o próprio wallpaper. É o
       reaproveitamento que faz a página já nascer vestida para quem subiu a
       imagem da nota e nunca abriu a personalização. */
  const faixa = empresa.capa ?? wallpaper;

  return (
    <div className="min-h-[100dvh]">
      {fundo}

      {/* Cabeçalho da marca: é o que faz o cliente reconhecer de quem é a
                página antes de ler qualquer palavra. Centralizado e alto porque
                este link é aberto como um perfil — vem de uma mensagem, não de
                dentro de um sistema. */}
      <header className="relative overflow-hidden" style={{ background: p.capa, color: p.sobreCapa }}>
        {faixa && (
          /* A imagem entra por baixo, com opacidade: em cima dela o
                       cabeçalho continua legível qualquer que seja a foto — e
                       foto de cliente nunca é escolhida pensando em contraste. */
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${faixa}")`, opacity: 0.3 }} />
        )}

        <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, ${rgba("#000000", 0.04)}, ${rgba("#000000", 0.2)})` }} />

        <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center gap-3 px-4 pb-14 pt-9 text-center sm:px-6 sm:pb-16 sm:pt-11">
          {empresa.logo && (
            <img
              src={empresa.logo}
              alt={empresa.nome}
              className="h-16 w-16 shrink-0 rounded-2xl bg-white/95 object-contain p-1.5 shadow-lg ring-1 ring-white/25 sm:h-[70px] sm:w-[70px]"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}

          <div className="min-w-0 max-w-full">
            <p className="truncate text-lg font-semibold leading-tight sm:text-xl">{empresa.nome || "Acompanhamento"}</p>
            <p className="truncate text-xs opacity-75">{dados.planilha}</p>
          </div>

          {whats && (
            <a
              href={`https://wa.me/${whats.length <= 11 ? `55${whats}` : whats}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium ring-1 ring-white/20 backdrop-blur transition hover:opacity-90"
              style={{ backgroundColor: rgba(p.sobreCapa === "#ffffff" ? "#ffffff" : "#000000", 0.18) }}
            >
              <MessageCircle size={14} />
              Falar com a gente
            </a>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-10 sm:px-6">
        {/* O cartão do cliente monta em cima do cabeçalho: costura as
                    duas faixas e evita a linha reta que corta a página no meio. */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="relative -mt-9 mb-5 rounded-3xl px-5 py-4 shadow-lg sm:-mt-10" style={{ backgroundColor: p.cartao, border: `1px solid ${p.linha}` }}>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl" style={{ color: p.tinta }}>
                {dados.cliente}
              </h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px]" style={{ color: p.apagado }}>
                {dados.linhas.length === 0 ? "Acompanhamento de produção" : `${dados.linhas.length} ${dados.linhas.length === 1 ? "pedido" : "pedidos"}`}
                {atualizado && (
                  <>
                    <span style={{ color: p.fraco }}>·</span>
                    <Clock size={12} />
                    {atualizado}
                  </>
                )}
              </p>
            </div>

            {/* Onde havia o botão de atualizar, agora há o aviso de
                            que não é preciso apertar nada.
                            Sem ele a página seria só uma tela que muda sozinha,
                            e a reação de quem vê isso é desconfiar do que está
                            lendo — ou recarregar no dedo, que é justamente o
                            gesto que o tempo real veio dispensar. */}
            <span className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-medium" style={{ backgroundColor: rgba(atualizando ? p.destaque : VERDE, 0.12), color: atualizando ? p.destaque : VERDE }} title="Esta página se atualiza sozinha">
              <motion.span animate={{ opacity: [1, 0.25, 1] }} transition={{ duration: atualizando ? 0.7 : 2.2, repeat: Infinity, ease: "easeInOut" }} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: atualizando ? p.destaque : VERDE }} />
              {atualizando ? "atualizando" : "ao vivo"}
            </span>
          </div>
        </motion.div>

        {dados.linhas.length === 0 ? (
          <div className="rounded-3xl p-8 text-center shadow-sm" style={{ backgroundColor: p.cartao, border: `1px solid ${p.linha}` }}>
            <p className="text-sm" style={{ color: p.apagado }}>
              Ainda não há nada em produção no seu nome.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {dados.linhas.map((linha, n) => {
              const feitas = grupos.etapas.map((i) => progressoDa(colunas[i], linha.valores[i])).filter((x): x is number => x != null);

              const pct = feitas.length ? Math.round((feitas.reduce((a, b) => a + b, 0) / feitas.length) * 100) : 0;
              const concluido = pct === 100;

              /* O prazo só existe na tela se estiver PREENCHIDO.
                               Sem valor, nada aparece — nem rótulo, nem traço:
                               "Entrega: —" é uma pergunta sem resposta na cara
                               de quem abriu o link para ter a resposta, e gera
                               a ligação que o acompanhamento deveria evitar. */
              const iPrazo = grupos.prazo;
              const prazoValor = iPrazo != null ? linha.valores[iPrazo] : null;
              const prazo = prazoValor ? situacaoPrazo(prazoValor, concluido, p) : null;

              /* A guia é a primeira imagem preenchida da linha — a
                               arte do pedido. As demais viram miniaturas no pé
                               do cartão. */
              const comImagem = grupos.imagens.filter((i) => linha.valores[i]);
              const guia = comImagem.length ? comImagem[0] : null;
              const extras = comImagem.slice(1);

              return (
                <motion.article
                  key={n}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(n * 0.06, 0.3), ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden rounded-3xl shadow-sm"
                  style={{ backgroundColor: p.cartao, border: `1px solid ${p.linha}` }}
                >
                  {/* ─── A guia do pedido, no topo ───
                                        Em tamanho de conferir, não de ícone: é a
                                        arte que o cliente aprovou, e a pergunta
                                        que ela responde ("é o meu mesmo?") não
                                        se responde num quadrado de 64px. Segue
                                        sendo miniatura, porém — o arquivo cheio
                                        abre no toque, e não no carregamento. */}
                  {guia != null && (
                    <div className="px-4 pt-4 sm:px-5">
                      {/* Quadrada, e com largura limitada.
                                                Arte de fardamento é quase sempre
                                                quadrada ou vertical, e a faixa
                                                deitada cortava a estampa em cima
                                                e embaixo — justo o miolo, que é
                                                o que o cliente quer conferir. O
                                                teto de 22rem evita que no celular
                                                ela tome a tela toda e empurre o
                                                prazo para fora do primeiro
                                                olhar. */}
                      <button
                        onClick={() => setAmpliada(linha.valores[guia] as string)}
                        className="group relative mx-auto block aspect-square w-full max-w-[22rem] overflow-hidden rounded-2xl"
                        style={{ backgroundColor: rgba(p.destaque, 0.08), border: `1px solid ${p.linha}` }}
                        aria-label={`Ampliar ${colunas[guia].nome}`}
                      >
                        <img
                          src={linha.valores[guia] as string}
                          alt={colunas[guia].nome}
                          loading="lazy"
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />

                        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-20" style={{ background: `linear-gradient(to top, ${rgba("#000000", 0.6)}, transparent)` }} />

                        <span className="absolute bottom-3 left-3.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/85">{colunas[guia].nome}</span>

                        <span className="absolute bottom-2.5 right-3 grid h-7 w-7 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm transition group-hover:bg-black/65">
                          <Maximize2 size={13} />
                        </span>

                        {dados.linhas.length > 1 && <span className="absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[10.5px] font-semibold text-white backdrop-blur-sm">Pedido {n + 1}</span>}
                      </button>

                      {/* O anexo: a mesma imagem, no arquivo
                                                inteiro, fora da página.
                                                A do cartão é miniatura e a do
                                                zoom cabe na tela — nenhuma das
                                                duas serve para salvar no celular
                                                ou reenviar no grupo, que é o que
                                                se faz com uma arte aprovada.
                                                Abre em aba nova porque o link É o
                                                arquivo: forçar download de outro
                                                domínio o navegador ignora, e no
                                                iOS o resultado seria uma tela em
                                                branco. */}
                      <a
                        href={linha.valores[guia] as string}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mx-auto mt-2 flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-medium transition hover:opacity-75"
                        style={{ backgroundColor: rgba(p.destaque, 0.1), color: p.destaque }}
                      >
                        <Paperclip size={12} />
                        Abrir anexo
                        <ExternalLink size={11} className="opacity-70" />
                      </a>
                    </div>
                  )}

                  {feitas.length > 0 && (
                    <div className="px-4 pt-4 sm:px-5">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium" style={{ color: p.apagado }}>
                          {dados.linhas.length > 1 && guia == null ? `Pedido ${n + 1}` : "Andamento"}
                        </span>

                        <span className="flex items-center gap-1 text-sm font-bold tabular-nums" style={{ color: concluido ? VERDE : p.destaque }}>
                          {concluido && <Check size={14} />}
                          {pct}%
                        </span>
                      </div>

                      <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: rgba(p.destaque, 0.14) }}>
                        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }} className="h-full rounded-full" style={{ backgroundColor: concluido ? VERDE : p.destaque }} />
                      </div>
                    </div>
                  )}

                  {/* ─── O prazo de entrega ───
                                        Faixa própria, logo abaixo do andamento,
                                        porque é a segunda pergunta do cliente e
                                        a que ele volta para reconferir. Some por
                                        inteiro quando a célula está vazia. */}
                  {prazo && prazoValor && iPrazo != null && (
                    <div className="px-4 pt-3 sm:px-5">
                      <div className="flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5" style={{ backgroundColor: rgba(prazo.cor, 0.11), border: `1px solid ${rgba(prazo.cor, 0.24)}` }}>
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: rgba(prazo.cor, 0.16), color: prazo.cor }}>
                          {prazo.alerta ? <AlertTriangle size={15} /> : <CalendarCheck size={15} />}
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[9.5px] font-bold uppercase tracking-[0.14em]" style={{ color: rgba(prazo.cor, 0.85) }}>
                            {colunas[iPrazo].nome}
                          </p>
                          <p className="truncate text-[15px] font-semibold tabular-nums" style={{ color: p.tinta }}>
                            {dataBr(prazoValor)}
                          </p>
                        </div>

                        {prazo.frase && (
                          <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ backgroundColor: rgba(prazo.cor, 0.16), color: prazo.cor }}>
                            {prazo.frase}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* A esteira. Cada etapa com a cor definida na
                                        planilha; sem valor, fica apagada — é o
                                        "ainda não chegou aqui". */}
                  {grupos.etapas.length > 0 && (
                    <div className="grid grid-cols-2 gap-1.5 p-4 sm:grid-cols-3 sm:px-5">
                      {grupos.etapas.map((i) => {
                        const coluna = colunas[i];
                        const valor = linha.valores[i];
                        const cor = coluna.opcoes.find((o) => o.valor === valor)?.cor ?? p.destaque;
                        const vazio = valor == null;

                        return (
                          <div
                            key={coluna.nome}
                            className="min-w-0 rounded-xl px-2.5 py-2"
                            style={{
                              backgroundColor: vazio ? rgba(p.escuro ? "#ffffff" : "#000000", 0.03) : rgba(cor, 0.12),
                              border: `1px solid ${vazio ? "transparent" : rgba(cor, 0.22)}`,
                            }}
                          >
                            <p className="truncate text-[9px] font-bold uppercase tracking-wider" style={{ color: vazio ? p.fraco : rgba(cor, 0.9) }}>
                              {coluna.nome}
                            </p>
                            <p className="truncate text-[11.5px] font-semibold" style={{ color: vazio ? p.fraco : cor }}>
                              {valor ?? "—"}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Datas e textos: o que ele procura depois de
                                        já ter visto onde a peça está. */}
                  {[...grupos.datas, ...grupos.outros].some((i) => linha.valores[i]) && (
                    <div className="flex flex-wrap gap-x-6 gap-y-2 px-4 py-3 sm:px-5" style={{ borderTop: `1px solid ${p.linha}` }}>
                      {[...grupos.datas, ...grupos.outros].map((i) => {
                        const coluna = colunas[i];
                        const valor = linha.valores[i];

                        if (valor == null) return null;

                        return (
                          <div key={coluna.nome} className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: p.fraco }}>
                              {coluna.nome}
                            </p>
                            <p className="truncate text-[13px] font-medium tabular-nums" style={{ color: p.tinta }}>
                              {coluna.tipo === "DATA" ? dataBr(valor) : valor}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* As outras imagens do pedido — a primeira já
                                        virou a capa do cartão. Miniatura mesmo:
                                        são anexos de conferência, e abri-las em
                                        tamanho real derrubaria a página no 4G. */}
                  {extras.length > 0 && (
                    <div className="flex flex-wrap gap-3 px-4 py-3 sm:px-5" style={{ borderTop: `1px solid ${p.linha}` }}>
                      {extras.map((i) => (
                        <button key={colunas[i].nome} onClick={() => setAmpliada(linha.valores[i] as string)} className="group text-left">
                          <p className="mb-1 text-[9px] font-bold uppercase tracking-wider" style={{ color: p.fraco }}>
                            {colunas[i].nome}
                          </p>
                          <img
                            src={linha.valores[i] as string}
                            alt={colunas[i].nome}
                            loading="lazy"
                            className="h-16 w-16 rounded-xl object-cover transition group-hover:opacity-80"
                            style={{ border: `1px solid ${p.linha}` }}
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </motion.article>
              );
            })}
          </div>
        )}

        <p className="mt-8 text-center text-[11px]" style={{ color: p.fraco }}>
          {empresa.nome && `${empresa.nome} · `}acompanhamento de produção
        </p>
      </main>

      <AnimatePresence>
        {ampliada && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAmpliada(null)} className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
            {/* O anexo também aqui: quem ampliou a imagem é quem
                            está tentando enxergar o detalhe, e é nesse momento
                            que se descobre que a tela não basta. Vale para as
                            imagens do rodapé do cartão, que não têm o botão de
                            anexo próprio. */}
            <a href={ampliada} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2.5 text-[12px] font-medium text-white backdrop-blur transition hover:bg-white/20">
              <Paperclip size={13} />
              Abrir anexo
            </a>

            <button onClick={() => setAmpliada(null)} aria-label="Fechar" className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white">
              <X size={18} />
            </button>
            <motion.img initial={{ scale: 0.94 }} animate={{ scale: 1 }} exit={{ scale: 0.94 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }} src={ampliada} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AcompanharProducaoPage;
