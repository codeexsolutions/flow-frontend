import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence, motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { AlertTriangle, CalendarCheck, Check, CircleAlert, Clock, Maximize2, MessageCircle, Paperclip, X } from "lucide-react";

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
 * A pergunta que o cliente tem é uma só — "onde está o meu?" — e ela se
 * responde vendo onde a trilha para de estar preenchida.
 *
 * ---------------------------------------------------------------------
 * Um pedido por TELA, e um navbar entre elas
 * ---------------------------------------------------------------------
 * Os pedidos eram cartões empilhados numa página que crescia. Com dois ou três
 * a leitura já era rolagem: o cliente descia procurando o cartão certo, e o
 * cabeçalho de perfil (logo grande, centralizado, ~180px) cobrava essa altura
 * antes do primeiro deles.
 *
 * Agora a página tem a altura da JANELA e nada mais: marca em cima, um navbar
 * com uma aba por pedido, a tela do pedido no meio e o rodapé no pé. Só o meio
 * rola. Trocar de pedido é um gesto — tocar a aba, ou seta para o lado no
 * computador — e não uma busca visual; a pílula do navbar desliza para onde o
 * olho já vai, e a tela entra pelo lado de onde veio.
 *
 * A aba carrega o que basta para escolher sem abrir: o número do pedido, a
 * porcentagem e um ponto colorido (verde pronto, vermelho atrasado). É o que o
 * cartão empilhado só entregava depois de encontrado.
 *
 * ---------------------------------------------------------------------
 * A ordem de leitura da tela
 * ---------------------------------------------------------------------
 * Ela não é a ordem das colunas da planilha, e isso é deliberado. Quem abre o
 * link pergunta três coisas, nesta ordem:
 *
 *   1. "é o meu mesmo?"  → a GUIA, a arte do pedido
 *   2. "quando chega?"   → o PRAZO, em faixa própria
 *   3. "em que pé está?" → a esteira de etapas
 *
 * A planilha, montada por quem PRODUZ, tem outra ordem — cliente, atendimento,
 * arte, custo. Reproduzi-la aqui obrigaria o cliente a varrer a tela inteira
 * para achar a data, que é justamente o que ele mais volta para conferir.
 *
 * No computador as três viram duas colunas (arte à esquerda, o resto à
 * direita) porque empilhadas sobrava tela vazia ao lado da imagem e o prazo
 * caía abaixo da dobra — o oposto do que uma tela do tamanho da janela existe
 * para fazer.
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
 * Uma cor por pedido — a identidade dele na barra de cima.
 *
 * Todas as abas eram pintadas com a cor da marca, e aí a única coisa que
 * separava "Pedido 1" de "Pedido 3" era o algarismo. Quem tem quatro pedidos na
 * gráfica volta ao link várias vezes por semana para olhar UM deles, e lia o
 * número toda vez para achar qual. Com cor própria, a aba vira lugar: "o meu é
 * o azul" resolve na primeira olhada e continua resolvendo na sétima visita.
 *
 * Por ÍNDICE, e não por sorteio ou por hash do nome: a ordem dos pedidos é
 * estável entre uma visita e outra, então a cor também é — e cor que muda de
 * pedido a cada recarga seria pior do que não ter cor nenhuma.
 *
 * A cor da marca não entra aqui de propósito. Ela veste a página inteira
 * (cabeçalho, botões, barra), e usar a mesma numa aba faria aquele pedido
 * parecer "o principal". Estas são cores de ETIQUETA: existem para se
 * distinguirem entre si.
 */
const CORES_PEDIDO = ["#6366f1", "#0ea5e9", "#f59e0b", "#ec4899", "#14b8a6", "#8b5cf6", "#f97316", "#84cc16"];

const corDoPedido = (i: number) => CORES_PEDIDO[i % CORES_PEDIDO.length];

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
  const reduzir = useReducedMotion();

  const [dados, setDados] = useState<ProducaoPublica | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [ampliada, setAmpliada] = useState<string | null>(null);

  /**
   * Qual pedido está na tela, e por que lado o próximo entra.
   *
   * A direção viaja junto do índice porque a animação precisa dela no MESMO
   * render em que o índice muda: guardada à parte, a tela nova entrava sempre
   * pela direita e voltar para o pedido anterior parecia avançar.
   */
  const [[indice, direcao], setAba] = useState<[number, number]>([0, 0]);

  /**
   * Profundidade é só para quem tem MOUSE e tela grande.
   *
   * Inclínar cartão e mover camadas com o ponteiro não tem gesto equivalente
   * no toque: no celular o efeito ou fica parado (nada acontece) ou dispara no
   * scroll, o que embrulha o estômago de quem só queria descer a página. E o
   * mascote precisa de margem lateral que a tela de 390px não tem — ali ele
   * cobriria a arte do pedido.
   *
   * `hover: hover` separa o notebook do tablet melhor do que a largura sozinha.
   */
  const [temPonteiro, setTemPonteiro] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px) and (hover: hover)");
    const aplicar = () => setTemPonteiro(mq.matches);

    aplicar();
    mq.addEventListener("change", aplicar);

    return () => mq.removeEventListener("change", aplicar);
  }, []);

  const efeitos = temPonteiro && !reduzir;

  /*
   * A posição do ponteiro, de -0.5 a 0.5 em cada eixo.
   *
   * Guardada em `MotionValue` e não em estado: `setState` a cada `mousemove`
   * re-renderizaria a página inteira umas cem vezes por segundo — com as
   * imagens, a esteira e o navbar junto. O `MotionValue` escreve direto no
   * estilo, fora do ciclo do React.
   *
   * A mola tira o efeito de "colado no cursor": sem ela o cartão acompanha o
   * ponteiro instantaneamente e parece preso nele, em vez de pesado.
   */
  const ponteiroX = useMotionValue(0);
  const ponteiroY = useMotionValue(0);

  const molaX = useSpring(ponteiroX, { stiffness: 110, damping: 18, mass: 0.5 });
  const molaY = useSpring(ponteiroY, { stiffness: 110, damping: 18, mass: 0.5 });

  /* Cada camada anda uma distância diferente — é disso que a profundidade é
     feita. O fundo, mais longe, anda pouco; a arte, na frente, inclina. */
  const fundoX = useTransform(molaX, [-0.5, 0.5], [16, -16]);
  const fundoY = useTransform(molaY, [-0.5, 0.5], [12, -12]);
  const giroY = useTransform(molaX, [-0.5, 0.5], [9, -9]);
  const giroX = useTransform(molaY, [-0.5, 0.5], [-7, 7]);
  const brilhoX = useTransform(molaX, [-0.5, 0.5], ["18%", "82%"]);
  const brilhoY = useTransform(molaY, [-0.5, 0.5], ["18%", "82%"]);
  const mascoteX = useTransform(molaX, [-0.5, 0.5], [-18, 18]);
  const mascoteY = useTransform(molaY, [-0.5, 0.5], [-10, 10]);

  /* O brilho é uma STRING que se remonta a cada quadro — `useMotionTemplate`
     costura os dois valores dentro do gradiente sem passar pelo React. */
  const brilho = useMotionTemplate`radial-gradient(circle at ${brilhoX} ${brilhoY}, ${rgba("#ffffff", 0.5)}, transparent 58%)`;

  const seguirPonteiro = (e: { clientX: number; clientY: number }) => {
    if (!efeitos) return;

    ponteiroX.set(e.clientX / window.innerWidth - 0.5);
    ponteiroY.set(e.clientY / window.innerHeight - 0.5);
  };

  const carregar = useCallback(
    async (silencioso = false) => {
      /* A recarga do tempo real NÃO apaga a tela.
           Quem está com a página aberta está olhando o pedido; trocá-lo pelo
           estado de carregamento a cada célula que alguém preenche na gráfica
           faria a página piscar sozinha na mão do cliente — que é pior do que
           o botão de atualizar que isto veio substituir. */
      if (!silencioso) setCarregando(true);

      const novo = await AcompanhamentoService.producao(token);

      if (novo || !silencioso) setDados(novo);

      setCarregando(false);
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
       mudou, e a resposta é "não" quase sempre.

       O selo de "ao vivo"/"atualizando" que ficava no cabeçalho saiu: ocupava a
       linha mais visível da página para anunciar um MECANISMO, não para
       responder nada que o cliente tivesse perguntado. A página se atualizar
       sozinha é obrigação dela, não novidade a exibir. */
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

  const total = dados?.linhas.length ?? 0;

  /* O pedido aberto tem de continuar existindo.
       A gráfica pode remover uma linha enquanto a página está aberta, e o
       índice guardado apontaria para o vazio — tela em branco, sem explicação,
       numa página que se atualiza sozinha. */
  useEffect(() => {
    setAba(([i, d]) => (total === 0 || i < total ? [i, d] : [total - 1, d]));
  }, [total]);

  const irPara = useCallback(
    (destino: number) => setAba(([atual]) => [Math.max(0, Math.min(destino, total - 1)), destino > atual ? 1 : -1]),
    [total],
  );

  /* Seta para o lado troca de pedido — no computador é o gesto natural de quem
     vê abas, e sai de graça. No celular quem troca é o toque na aba. */
  useEffect(() => {
    if (total < 2 || ampliada) return;

    const tecla = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") irPara(indice + 1);
      if (e.key === "ArrowLeft") irPara(indice - 1);
    };

    document.addEventListener("keydown", tecla);

    return () => document.removeEventListener("keydown", tecla);
  }, [total, indice, irPara, ampliada]);

  /* As colunas são separadas UMA vez, e não a cada pedido: com onze etapas e
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
      /* A coluna de prazo sai das datas comuns: ela tem faixa própria na
               tela, e repeti-la embaixo faria o cliente conferir duas vezes a
               mesma data só para ter certeza de que são a mesma. */
      datas: indices.filter((i) => cols[i].tipo === "DATA" && i !== prazo),
      imagens: indices.filter((i) => cols[i].tipo === "IMAGEM"),
      outros: indices.filter((i) => !["DATA", "IMAGEM"].includes(cols[i].tipo) && !(cols[i].tipo === "SELECAO" && cols[i].opcoes.length >= 2)),
    };
  }, [dados?.colunas]);

  /**
   * O resumo de cada pedido — o que a aba precisa saber sem abrir a tela.
   *
   * Sai daqui, e não de dentro da tela do pedido, porque o navbar mostra TODOS
   * ao mesmo tempo: calcular por dentro obrigaria a montar as sete telas para
   * desenhar sete abas.
   */
  const resumos = useMemo(() => {
    const colunas = dados?.colunas ?? [];

    return (dados?.linhas ?? []).map((linha) => {
      const feitas = grupos.etapas.map((i) => progressoDa(colunas[i], linha.valores[i])).filter((x): x is number => x != null);
      const pct = feitas.length ? Math.round((feitas.reduce((a, b) => a + b, 0) / feitas.length) * 100) : 0;
      const concluido = feitas.length > 0 && pct === 100;

      const iPrazo = grupos.prazo;
      const prazoValor = iPrazo != null ? linha.valores[iPrazo] : null;
      const dias = prazoValor ? diasAte(prazoValor) : null;

      /* A guia é a primeira imagem preenchida da linha — a arte do pedido. As
         demais viram miniaturas no pé da tela. */
      const comImagem = grupos.imagens.filter((i) => linha.valores[i]);

      return {
        pct,
        concluido,
        temEtapas: feitas.length > 0,
        atrasado: !concluido && dias != null && dias < 0,
        prazoValor,
        guia: comImagem.length ? comImagem[0] : null,
        extras: comImagem.slice(1),
      };
    });
  }, [dados, grupos]);

  /**
   * O wallpaper da empresa — o mesmo que já veste a nota e o orçamento.
   *
   * Entra como fundo FIXO da página, atrás de um véu da cor do tema. Sem o
   * véu, o texto disputaria com a foto, e wallpaper de gráfica é escolhido
   * pensando em papel timbrado, nunca em contraste de leitura. Com ele, a
   * imagem vira ambiente: dá a cara da empresa sem cobrar nada da
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
          {/* O fundo anda MENOS que o ponteiro, e ao contrário dele — é o que
              o olho lê como distância. O `scale` de 1.06 existe para a borda
              da imagem nunca entrar na tela durante esse deslocamento. */}
          <motion.div
            className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: `url("${wallpaper}")`,
              opacity: p.escuro ? 0.18 : 0.14,
              x: efeitos ? fundoX : 0,
              y: efeitos ? fundoY : 0,
              scale: efeitos ? 1.06 : 1,
            }}
          />
          {/* O degradê tira a imagem de baixo do conteúdo denso e a
                        deixa respirar no topo, onde só existe a marca. */}
          <div className="fixed inset-0 -z-10" style={{ background: `linear-gradient(to bottom, ${rgba(p.fundo, 0.2)} 0%, ${rgba(p.fundo, 0.8)} 55%, ${p.fundo} 100%)` }} />
        </>
      )}
    </>
  );

  if (carregando) {
    return (
      <div className="grid h-[100dvh] place-items-center px-6">
        {fundo}
        <motion.div animate={{ opacity: [0.35, 1, 0.35] }} transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }} className="h-9 w-9 rounded-xl" style={{ backgroundColor: rgba(p.destaque, 0.35) }} />
      </div>
    );
  }

  if (!dados) {
    return (
      <div className="grid h-[100dvh] place-items-center px-6">
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

  const linha = dados.linhas[indice];
  const r = resumos[indice];
  const iPrazo = grupos.prazo;
  const prazo = r?.prazoValor ? situacaoPrazo(r.prazoValor, r.concluido, p) : null;

  /* A fatia entra pelo lado de onde veio o dedo e sai pelo outro. O
     deslocamento é curto de propósito: tela inteira voando cobra tempo de quem
     só quis conferir o pedido ao lado. */
  const desliza = {
    entra: (d: number) => ({ opacity: 0, x: reduzir ? 0 : d >= 0 ? 28 : -28 }),
    fica: { opacity: 1, x: 0 },
    sai: (d: number) => ({ opacity: 0, x: reduzir ? 0 : d >= 0 ? -28 : 28 }),
  };

  return (
    /*
     * A página ocupa a JANELA, e não o documento.
     *
     * Ela era uma coluna que crescia: cabeçalho alto de perfil, um cartão por
     * pedido empilhado embaixo do outro, e o cliente com três pedidos rolava a
     * tela inteira para descobrir onde o terceiro tinha parado. Presa em
     * `100dvh`, a marca fica no topo, o navbar embaixo dela, o rodapé no pé — e
     * só o corpo do pedido rola. É o esqueleto de um aplicativo, que é o que
     * este link é para quem o recebe.
     *
     * `dvh` e não `vh`: no Safari do iPhone a barra de endereço entra na conta
     * do `vh` e o rodapé nasceria escondido atrás dela.
     */
    <div className="flex h-[100dvh] flex-col overflow-hidden" onMouseMove={seguirPonteiro}>
      {fundo}

      {/* ─────────────────────────────── O mascote ───────────────────────────────
          O boneco da empresa, que ENTRA deslizando pela direita quando a página
          abre e depois fica flutuando no canto.

          Três camadas aninhadas, e não uma só, porque as três animam a MESMA
          propriedade: a de fora faz a entrada (x de fora da tela até o lugar), a
          do meio segue o ponteiro e a de dentro flutua. Numa camada só, a
          última a ser escrita ganharia e as outras duas simplesmente não
          aconteceriam.

          ---------------------------------------------------------------------
          No celular ele TAMBÉM aparece — só que discreto
          ---------------------------------------------------------------------
          Ele nascia só no computador, e a razão era boa: a tela de 390px não
          tem margem, e um boneco de 400px ali cobriria a arte do pedido. Mas
          "não cobrir" e "não existir" são coisas diferentes, e o link é aberto
          no celular quase sempre — esconder justo ali é esconder da maioria.

          Então no celular ele entra menor (30vh contra 46vh), encostado na
          quina e com um pedaço para FORA da tela: aparece no canto de baixo
          como quem espia, e o que o olho recebe é movimento na periferia, não
          uma figura no meio do caminho.

          O que garante que nada seja tapado é o `-z-[5]`: ele fica sobre o
          wallpaper e SOB os cartões. Onde houver andamento, prazo ou esteira,
          eles passam por cima — o boneco só ocupa o que sobrou. E
          `pointer-events-none`, porque ninguém clica num boneco. */}
      {empresa.mascote && (
        <motion.div
          aria-hidden
          className="pointer-events-none fixed -right-6 bottom-0 -z-[5] select-none sm:right-0"
          /* Com movimento reduzido ele aparece sem viajar: quem pediu menos
             animação no sistema não quer um boneco atravessando a tela. */
          initial={reduzir ? { opacity: 0 } : { x: "115%", opacity: 0 }}
          animate={reduzir ? { opacity: 1 } : { x: "0%", opacity: 1 }}
          /* Mola mole e pesada: o boneco CHEGA e assenta, com um respiro no
             fim. Uma transição linear faria ele deslizar como um banner.
             O atraso deixa a tela do pedido desenhar primeiro — o mascote é a
             última coisa a entrar, nunca a que disputa o primeiro olhar. */
          transition={reduzir ? { duration: 0.3, delay: 0.2 } : { type: "spring", stiffness: 52, damping: 14, mass: 1.1, delay: 0.45 }}
        >
          {/* O parallax do ponteiro só no computador: no toque não há ponteiro,
              e as molas ficariam paradas em zero de qualquer forma. */}
          <motion.div style={efeitos ? { x: mascoteX, y: mascoteY } : undefined}>
            <motion.img
              src={empresa.mascote}
              alt=""
              animate={reduzir ? undefined : { y: [0, -12, 0] }}
              transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
              /* Menor e mais apagado no celular; inteiro no computador, onde
                 existe margem para ele viver sem disputar com nada. */
              className="h-[30vh] max-h-[260px] w-auto object-contain object-bottom opacity-85 sm:h-[36vh] sm:max-h-[310px] sm:opacity-90 lg:h-[46vh] lg:max-h-[430px] lg:opacity-100"
              style={{ filter: `drop-shadow(0 18px 30px ${rgba("#000000", p.escuro ? 0.55 : 0.22)})` }}
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </motion.div>
        </motion.div>
      )}

      {/* ─────────────────────── A marca, numa faixa só ───────────────────────
          Era um cabeçalho de perfil, centralizado, com logo de 70px e uns
          180px de altura. Numa tela presa à janela essa altura sai do pedido,
          que é o que a pessoa veio ver: virou uma linha — logo à esquerda,
          nome da empresa e de quem acompanha, WhatsApp na ponta. */}
      <header className="relative shrink-0 overflow-hidden" style={{ background: p.capa, color: p.sobreCapa }}>
        {faixa && (
          /* A imagem entra por baixo, com opacidade: em cima dela o cabeçalho
             continua legível qualquer que seja a foto — e foto de cliente
             nunca é escolhida pensando em contraste. */
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${faixa}")`, opacity: 0.3 }} />
        )}

        <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, ${rgba("#000000", 0.04)}, ${rgba("#000000", 0.22)})` }} />

        <div className="relative mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
          {empresa.logo && (
            <img
              src={empresa.logo}
              alt={empresa.nome}
              className="h-11 w-11 shrink-0 rounded-xl bg-white/95 object-contain p-1 shadow-md ring-1 ring-white/25"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-tight">{empresa.nome || "Acompanhamento"}</p>
            {/* O nome de quem acompanha subiu para cá: era um título grande no
                cartão que sumiu junto com ele, e responde a "esta página é
                minha mesmo?" — pergunta que se faz uma vez, ao abrir. */}
            <p className="truncate text-[11.5px] opacity-75">{dados.cliente}</p>
          </div>

          {whats && (
            <a
              href={`https://wa.me/${whats.length <= 11 ? `55${whats}` : whats}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium ring-1 ring-white/20 backdrop-blur transition hover:opacity-90"
              style={{ backgroundColor: rgba(p.sobreCapa === "#ffffff" ? "#ffffff" : "#000000", 0.18) }}
            >
              <MessageCircle size={14} />
              <span className="hidden sm:inline">Falar com a gente</span>
            </a>
          )}
        </div>
      </header>

      {/* ───────────────────────── O navbar dos pedidos ─────────────────────────
          Uma aba por pedido, com a pílula que desliza (`layoutId`): existe um só
          destaque na barra e ele é reposicionado com mola, em vez de um fundo
          por botão acendendo e apagando — o olho segue para onde ele foi em vez
          de procurar o que mudou.

          Com um pedido só a barra não aparece: uma aba sozinha não navega para
          lugar nenhum e viraria enfeite cobrando altura. */}
      {total > 1 && (
        <nav
          aria-label="Seus pedidos"
          className="relative shrink-0 overflow-x-auto"
          style={{ backgroundColor: rgba(p.cartao, p.escuro ? 0.55 : 0.7), borderBottom: `1px solid ${p.linha}`, backdropFilter: "blur(8px)" }}
        >
          <div className="mx-auto flex w-full max-w-5xl items-center gap-1 px-3 py-2 sm:px-5">
            {resumos.map((res, i) => {
              const on = i === indice;
              const cor = corDoPedido(i);

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => irPara(i)}
                  aria-current={on ? "page" : undefined}
                  className="relative flex shrink-0 cursor-pointer items-center gap-2 rounded-xl px-3 py-1.5 text-[12.5px] font-medium transition-colors"
                  style={{ color: on ? p.tinta : p.apagado }}
                >
                  {on && (
                    <motion.span
                      layoutId="aba-pedido"
                      transition={reduzir ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 38 }}
                      className="absolute inset-0 rounded-xl"
                      style={{ backgroundColor: rgba(cor, 0.16), border: `1px solid ${rgba(cor, 0.42)}` }}
                    />
                  )}

                  {/* A etiqueta de cor é a identidade do pedido, e fica acesa
                      mesmo na aba fechada — é por ela que se acha o pedido sem
                      ler o número. Ela some quando a aba está aberta? Não: a
                      pílula ao redor é da mesma cor, e as duas juntas são o que
                      diz "você está no verde". */}
                  <span className="relative h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: cor }} />

                  <span className="relative whitespace-nowrap">Pedido {i + 1}</span>

                  {/* A SITUAÇÃO vem por ícone, e não mais recolorindo a aba: a cor
                      agora é nome próprio do pedido, e pintá-la de vermelho no dia
                      do atraso trocaria a identidade justamente quando a pessoa
                      mais precisa reencontrá-la. */}
                  {res.concluido && <Check size={12} className="relative shrink-0" style={{ color: VERDE }} />}
                  {res.atrasado && <AlertTriangle size={12} className="relative shrink-0" style={{ color: VERMELHO }} />}

                  {res.temEtapas && (
                    <span className="relative tabular-nums text-[11px]" style={{ color: on ? cor : p.fraco }}>
                      {res.pct}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* ─────────────────── O andamento, colado no cabeçalho ───────────────────
          Ele era um cartão dentro da tela do pedido, terceiro na fila de leitura,
          e no celular começava abaixo da arte — rolagem para ver o número que a
          pessoa abriu o link para ver. Como faixa presa embaixo do navbar, ele
          fica FORA da área que rola: a barra e a porcentagem do pedido aberto
          estão sempre à vista, em qualquer altura da página.

          A barra usa a cor do pedido, a mesma da aba logo acima — as duas juntas
          dizem qual pedido está sendo medido, sem precisar de rótulo. */}
      {r?.temEtapas && (
        <div
          className="relative z-10 shrink-0 px-4 pb-2.5 pt-2 sm:px-6"
          style={{ backgroundColor: rgba(p.cartao, p.escuro ? 0.55 : 0.7), borderBottom: `1px solid ${p.linha}`, backdropFilter: "blur(8px)" }}
        >
          <div className="mx-auto w-full max-w-5xl xl:max-w-6xl">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11.5px] font-medium" style={{ color: p.apagado }}>
                Andamento
              </span>

              <span className="flex items-center gap-1 text-[13px] font-bold tabular-nums" style={{ color: r.concluido ? VERDE : corDoPedido(indice) }}>
                {r.concluido && <Check size={13} />}
                {r.pct}%
              </span>
            </div>

            <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: rgba(corDoPedido(indice), 0.16) }}>
              {/* `key` no índice: sem ela a barra ficaria parada na largura do
                  pedido anterior ao trocar de aba — o nó é o mesmo e o
                  `initial` não roda de novo. */}
              <motion.div
                key={indice}
                initial={{ width: reduzir ? `${r.pct}%` : 0 }}
                animate={{ width: `${r.pct}%` }}
                transition={{ duration: reduzir ? 0 : 0.7, delay: reduzir ? 0 : 0.12, ease: [0.22, 1, 0.36, 1] }}
                className="h-full rounded-full"
                style={{ backgroundColor: r.concluido ? VERDE : corDoPedido(indice) }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────── A tela do pedido ───────────────────────────
          Só ESTE bloco rola. O cabeçalho, o navbar, a faixa de andamento e o
          rodapé ficam de pé, como a moldura de um aplicativo. */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        {total === 0 || !linha || !r ? (
          <div className="grid h-full place-items-center px-6">
            <p className="text-center text-sm" style={{ color: p.apagado }}>
              Ainda não há nada em produção no seu nome.
            </p>
          </div>
        ) : (
          <AnimatePresence mode="wait" custom={direcao} initial={false}>
            <motion.section
              key={indice}
              custom={direcao}
              variants={desliza}
              initial="entra"
              animate="fica"
              exit="sai"
              transition={{ duration: reduzir ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
              /* `min-h-full` + `justify-center`: numa tela de 1440x900 o
                 conteúdo ficava grudado no topo com meio metro de vazio
                 embaixo — o defeito mais gritante da versão de computador.
                 Centrado, a tela respira e o mascote tem margem para aparecer. */
              className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-center px-4 py-4 sm:px-6 xl:max-w-6xl"
            >
              {/*
                Duas colunas no computador, empilhado no celular.

                A arte é grande e quadrada; o andamento, o prazo e a esteira são
                blocos largos e baixos. Um embaixo do outro sobrava tela vazia à
                direita da imagem, e o prazo caía abaixo da dobra. Lado a lado, a
                resposta inteira cabe num olhar — que é o ponto de a tela ser do
                tamanho da janela.
              */}
              <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-center lg:gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
                {/* ─── A guia: a arte do pedido ───
                    Em tamanho de conferir, não de ícone: é a arte que o cliente
                    aprovou, e a pergunta que ela responde ("é o meu mesmo?")
                    não se responde num quadrado de 64px. */}
                {r.guia != null && (
                  <div className="flex flex-col gap-2">
                    {/*
                      A arte inclina com o ponteiro.

                      A `perspective` mora no PAI: aplicada no mesmo nó que
                      gira, cada cartão teria o próprio ponto de fuga e a
                      inclição pareceria uma distorção de imagem em vez de um
                      objeto virando. 1200px é uma câmera longe: o suficiente
                      para dar volume sem o exagero de olho de peixe.
                    */}
                    <div className="mx-auto w-full max-w-[20rem] lg:max-w-[22rem]" style={{ perspective: efeitos ? 1200 : undefined }}>
                      <motion.button
                        onClick={() => setAmpliada(linha.valores[r.guia as number] as string)}
                        className="group relative block aspect-square w-full overflow-hidden rounded-2xl"
                        style={{
                          backgroundColor: rgba(p.destaque, 0.08),
                          border: `1px solid ${p.linha}`,
                          rotateX: efeitos ? giroX : 0,
                          rotateY: efeitos ? giroY : 0,
                          transformStyle: "preserve-3d",
                          boxShadow: efeitos ? `0 26px 50px -18px ${rgba("#000000", p.escuro ? 0.75 : 0.32)}` : undefined,
                        }}
                        whileHover={efeitos ? { scale: 1.015 } : undefined}
                        transition={{ type: "spring", stiffness: 260, damping: 24 }}
                        aria-label={`Ampliar ${colunas[r.guia].nome}`}
                      >
                        <img
                          src={linha.valores[r.guia] as string}
                          alt={colunas[r.guia].nome}
                          loading="lazy"
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />

                        {/* O brilho que corre pelo vidro: um claro suave que
                            segue o ponteiro. É ele que faz a inclição ler como
                            SUPERFÍCIE, e não como a imagem entortando. */}
                        {efeitos && (
                          <motion.span
                            className="pointer-events-none absolute inset-0 opacity-60 mix-blend-soft-light"
                            style={{ background: brilho }}
                          />
                        )}

                        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-20" style={{ background: `linear-gradient(to top, ${rgba("#000000", 0.6)}, transparent)` }} />

                        <span className="absolute bottom-3 left-3.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/85">{colunas[r.guia].nome}</span>

                        <span className="absolute bottom-2.5 right-3 grid h-7 w-7 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm transition group-hover:bg-black/65">
                          <Maximize2 size={13} />
                        </span>
                      </motion.button>
                    </div>

                    {/* O botão "Abrir anexo" ficava aqui, embaixo da arte. Saiu:
                        era uma pílula com ícone competindo com a própria imagem
                        que ela abria, e o gesto de quem quer ver a arte inteira
                        é TOCAR NELA — que já amplia. O acesso ao arquivo cheio
                        continua existindo, lá dentro do zoom, que é o momento em
                        que se descobre que a tela não basta. */}
                  </div>
                )}

                <div className="flex min-w-0 flex-col gap-3">
                  {/* O andamento subiu para a faixa embaixo do cabeçalho — ver
                      a nota lá. Aqui ele era mais um cartão na fila, lido depois
                      da arte e do prazo; a pergunta que ele responde é a
                      primeira de todas. */}

                  {/* ─── O prazo ───
                      Some por inteiro quando a célula está vazia: "Entrega: —"
                      é uma pergunta sem resposta na cara de quem abriu o link
                      justamente para ter a resposta. */}
                  {prazo && r.prazoValor && iPrazo != null && (
                    <div className="flex items-center gap-2.5 rounded-2xl px-3.5 py-3" style={{ backgroundColor: rgba(prazo.cor, 0.11), border: `1px solid ${rgba(prazo.cor, 0.24)}` }}>
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: rgba(prazo.cor, 0.16), color: prazo.cor }}>
                        {prazo.alerta ? <AlertTriangle size={16} /> : <CalendarCheck size={16} />}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[9.5px] font-bold uppercase tracking-[0.14em]" style={{ color: rgba(prazo.cor, 0.85) }}>
                          {colunas[iPrazo].nome}
                        </p>
                        <p className="truncate text-[15px] font-semibold tabular-nums" style={{ color: p.tinta }}>
                          {dataBr(r.prazoValor)}
                        </p>
                      </div>

                      {prazo.frase && (
                        <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ backgroundColor: rgba(prazo.cor, 0.16), color: prazo.cor }}>
                          {prazo.frase}
                        </span>
                      )}
                    </div>
                  )}

                  {/* ─── A esteira ───
                      Cada etapa com a cor definida na planilha; sem valor, fica
                      apagada — é o "ainda não chegou aqui". Entram escalonadas
                      para o olho percorrer a ordem do trabalho, em vez de
                      receber onze caixas de uma vez. */}
                  {grupos.etapas.length > 0 && (
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-4">
                      {grupos.etapas.map((i, n) => {
                        const coluna = colunas[i];
                        const valor = linha.valores[i];
                        const cor = coluna.opcoes.find((o) => o.valor === valor)?.cor ?? p.destaque;
                        const vazio = valor == null;

                        return (
                          <motion.div
                            key={coluna.nome}
                            initial={reduzir ? false : { opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.22, delay: Math.min(n * 0.025, 0.2), ease: [0.22, 1, 0.36, 1] }}
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
                          </motion.div>
                        );
                      })}
                    </div>
                  )}

                  {/* ─── Datas e textos ───
                      O que ele procura depois de já ter visto onde a peça
                      está. */}
                  {[...grupos.datas, ...grupos.outros].some((i) => linha.valores[i]) && (
                    <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-2xl px-4 py-3" style={{ backgroundColor: p.cartao, border: `1px solid ${p.linha}` }}>
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

                  {/* ─── Os outros anexos ───
                      A primeira imagem já é a guia. Miniatura mesmo: são anexos
                      de conferência, e abri-las em tamanho real derrubaria a
                      página no 4G. */}
                  {r.extras.length > 0 && (
                    <div className="flex flex-wrap gap-3 rounded-2xl px-4 py-3" style={{ backgroundColor: p.cartao, border: `1px solid ${p.linha}` }}>
                      {r.extras.map((i) => (
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
                </div>
              </div>
            </motion.section>
          </AnimatePresence>
        )}
      </main>

      {/* ──────────────────────────── O rodapé ────────────────────────────
          A hora da última mudança desceu para cá. Ela vivia ao lado do nome do
          cliente, disputando a linha mais visível da página com a informação
          que ninguém abre o link para ver — mas sumir de vez também não pode: é
          o que responde "isto está atualizado?" quando o pedido passa dias
          parado na mesma etapa. */}
      {/* O rodapé precisou de FUNDO quando o mascote passou a existir no celular:
          transparente, o boneco aparecia por trás da data e das duas linhas de
          texto se cruzavam. Com o véu, ele passa atrás como quem está atrás de
          um balcão. */}
      <footer
        className="relative z-10 flex shrink-0 items-center justify-center gap-1.5 px-4 py-2 text-[11px]"
        style={{ borderTop: `1px solid ${p.linha}`, color: p.fraco, backgroundColor: rgba(p.cartao, p.escuro ? 0.7 : 0.82), backdropFilter: "blur(8px)" }}
      >
        {atualizado && (
          <>
            <Clock size={11} />
            <span className="tabular-nums">{atualizado}</span>
            <span aria-hidden>·</span>
          </>
        )}
        <span className="truncate">{empresa.nome || "acompanhamento de produção"}</span>
      </footer>

      <AnimatePresence>
        {ampliada && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAmpliada(null)} className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
            {/* O anexo também aqui: quem ampliou a imagem é quem está tentando
                enxergar o detalhe, e é nesse momento que se descobre que a tela
                não basta. Vale para as miniaturas, que não têm botão próprio. */}
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
