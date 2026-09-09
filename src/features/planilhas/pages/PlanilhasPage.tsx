import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import useSincronizacao from "@/shared/realtime/useSincronizacao";
import { Table2, Plus, ChevronLeft, ChevronRight, ChevronDown, Settings2, Trash2, X, Loader2, ArrowLeft, Copy, History, LayoutTemplate, EyeOff, Lock, Eraser, Rows3, KanbanSquare, Columns3 } from "lucide-react";

import PlanilhaService, { type Alteracao, type Coluna, type Modelo, type ModeloCatalogo, type Pagina, type Periodicidade, type Periodo, type TipoColuna } from "@/features/planilhas/services/planilha.service";
import { PageScreen } from "@/shared/ui/PageShell";
import { BarraFiltros, ListaAcao, ListaCabecalho, ListaLinha } from "@/shared/ui/DataTable";
import { ROW_HEIGHT } from "@/shared/hooks/useAutoPageSize";
import { Modal } from "@/shared/ui/Modal";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import { ehGestor } from "@/features/vendas/components/TabsVendas";
import useAuth from "@/features/auth/store/auth.store";
import { SkeletonListaPainel } from "@/shared/ui/skeleton";
import Celula from "@/features/planilhas/components/Celula";
import useEquipeStore from "@/features/funcionarios/store/equipe.store";
import { podemReceberTarefa } from "@/shared/domain/funcionario";
import Presenca from "@/features/planilhas/components/Presenca";
import MenuColuna from "@/features/planilhas/components/MenuColuna";
import MenuContexto from "@/features/planilhas/components/MenuContexto";
import QuadroPlanilha from "@/features/planilhas/components/QuadroPlanilha";

/**
 * ============================================================================
 * PLANILHAS — a produção configurável. 2.000 linhas; leia este mapa primeiro.
 * ============================================================================
 *
 * É a maior tela do sistema, e a que mais gente usa o dia inteiro. Vale
 * entender o que ela é antes de procurar onde mexer.
 *
 * ----------------------------------------------------------------------------
 * O QUE ELA É
 * ----------------------------------------------------------------------------
 * Um CONSTRUTOR de planilha, não uma planilha. O gestor desenha o MODELO
 * (quais colunas existem e de que tipo é cada uma); a produção do dia, da
 * semana ou do mês é a consulta dos registros daquele modelo no período.
 *
 * Dois níveis, e a tela alterna entre eles:
 *
 *   • a LISTA de planilhas — "Produção diária", "Estamparia", "Camisaria";
 *   • a planilha ABERTA — as linhas do período, em tabela ou em quadro.
 *
 * A mesma tela é servida em duas rotas: `/producao/kanban` a monta com as abas
 * da seção (ver `KanbanPage`), e `/planilhas` redireciona para lá.
 *
 * ----------------------------------------------------------------------------
 * TABELA ⇄ BACKLOG: é a MESMA coisa
 * ----------------------------------------------------------------------------
 * O quadro não tem dado próprio. Cada cartão é uma LINHA da planilha, cada
 * raia é uma alternativa de uma coluna de Seleção dela, e arrastar um cartão
 * grava naquela célula o mesmo valor que a lista suspensa gravaria na tabela.
 * Trocar de visão não move, não copia e não duplica nada.
 *
 * ----------------------------------------------------------------------------
 * COMO O ARQUIVO ESTÁ DIVIDIDO
 * ----------------------------------------------------------------------------
 * Na ordem em que aparece. Procure pelos separadores em maiúsculas.
 *
 *   1. VOCABULÁRIO (aqui até ~200) — os tipos de coluna, as periodicidades,
 *      os meses, as colunas da lista, e os utilitários de data (`iso`,
 *      `doIso`, `rotuloPeriodo`, `rotuloAba`) mais o `lembrado`/`lembrar` que
 *      guarda a preferência de visão por planilha no `localStorage`.
 *
 *   2. ESTADO E AÇÕES (~206 a ~900) — o miolo. Em blocos:
 *        · colunas: `alternarPermissao`, `alternarPublico`, `renomearColuna`,
 *          `definirCor`, `definirPadrao`, `definirDataMinima`, `criarColuna`,
 *          `removerColuna`;
 *        · planilhas: `carregarModelos`, `criarModelo`, `usarModelo`,
 *          `duplicarAtual`, `excluirPlanilha`;
 *        · dados: `carregarPlanilha`, `novaLinha`, `salvarCelula`,
 *          `copiarDeCima`, `excluirLinha`;
 *        · navegação e páginas: `navegar`, `proximaPagina`, `confirmarRenome`.
 *
 *   3. PLANILHA ⇄ BACKLOG (~900) — `trocarVisao`, a coluna que vira raia, e
 *      `moverNoQuadro` (que é `salvarCelula` por outro gesto).
 *
 *   4. LISTA (~1014) — o render das planilhas existentes e o catálogo.
 *
 *   5. PLANILHA ABERTA (~1307) — o render da grade, do quadro e dos modais
 *      (colunas, histórico, links do cliente, personalização).
 *
 * ----------------------------------------------------------------------------
 * O QUE MORA FORA DAQUI
 * ----------------------------------------------------------------------------
 * `components/Celula` (o editor de cada tipo de célula), `QuadroPlanilha` (o
 * quadro), `MenuColuna` e `MenuContexto`, `Presenca` (quem está olhando),
 * `LinksCliente` e `Personalizacao`. Alterar o comportamento de UMA célula
 * quase sempre é mexer em `Celula`, não aqui.
 *
 * ----------------------------------------------------------------------------
 * DUAS REGRAS QUE JÁ CUSTARAM BUG
 * ----------------------------------------------------------------------------
 *   • TODO aviso desta tela é TOAST, nunca modal. Aqui se digita em rajada, e
 *     o modal rouba o foco e engole a tecla seguinte. Ver `avisar`.
 *   • A recarga é SILENCIOSA por padrão. Acender o esqueleto no meio da
 *     digitação faz a pessoa achar que perdeu o que escreveu. Ver
 *     `carregarPlanilha`.
 *
 * Os números de linha envelhecem — os separadores em maiúsculas, não.
 */

const TIPOS: { id: TipoColuna; label: string }[] = [
  { id: "TEXTO", label: "Texto" },
  { id: "TEXTO_LONGO", label: "Texto longo" },
  { id: "NUMERO", label: "Número" },
  { id: "MOEDA", label: "Moeda" },
  { id: "DATA", label: "Data" },
  { id: "SELECAO", label: "Seleção" },
  { id: "CHECKBOX", label: "Sim/Não" },
  { id: "IMAGEM", label: "Imagem" },
  /* Coluna que puxa o cadastro de clientes em vez de aceitar texto livre.
     Digitado à mão, o mesmo cliente vira "Maria", "maria silva" e "Maria S." em
     três linhas, e a planilha deixa de somar por cliente. */
  { id: "CLIENTE", label: "Cliente" },
];

const PERIODICIDADES: { id: Periodicidade; label: string }[] = [
  { id: "DIARIA", label: "Diária" },
  { id: "SEMANAL", label: "Semanal" },
  { id: "MENSAL", label: "Mensal" },
];

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/* -------------------------------------------------------------------------- */
/* A lista de planilhas — a mesma tabela de Clientes e Estoque                 */
/* -------------------------------------------------------------------------- */

/** As colunas e a largura de cada uma. Mesma forma do `COLS` de Clientes. */
const LISTA_COLS = "grid-cols-[minmax(0,1fr)_128px_96px_96px_112px_88px]";

/** Soma das fixas + folga para a flexível: abaixo disso a tabela rola. */
const LISTA_MIN_WIDTH = 792;

/**
 * Os rótulos das colunas, em UMA lista.
 *
 * Servem ao cabeçalho do desktop e ao cartão do celular (ver `ListaLinha`). A
 * A última posição é a coluna de AÇÕES: ela aparece no cabeçalho do desktop e
 * é omitida do cartão do celular, onde os botões já vão numa faixa própria no
 * pé — ver `ListaLinha`.
 */
const LISTA_ROTULOS = ["Produção", "Período", "Colunas", "Linhas", "Preenchidas", "Ações"];

/**
 * Como cada evento do histórico se lê.
 *
 * O painel mostrava só "coluna: antes → depois", que serve para célula
 * alterada e fica sem sentido em "linha excluída" (sem coluna, sem valores) ou
 * "planilha renomeada" (sem linha). Cada ação ganha a frase que descreve o que
 * de fato aconteceu.
 */
function descreverEvento(h: Alteracao): { titulo: string; detalhe: string | null } {
  const de = h.valor_antes || "vazio";
  const para = h.valor_depois || "vazio";

  switch (h.acao) {
    case "LINHA_CRIADA":
      return { titulo: "Linha criada", detalhe: null };
    case "LINHAS_CRIADAS":
      return { titulo: `${h.valor_depois ?? ""} linhas criadas`.trim(), detalhe: null };
    case "LINHA_EXCLUIDA":
      return { titulo: "Linha excluída", detalhe: null };
    case "COLUNA_CRIADA":
      return { titulo: `Coluna criada: ${h.coluna_nome ?? ""}`.trim(), detalhe: h.valor_depois };
    case "COLUNA_REMOVIDA":
      return { titulo: `Coluna removida: ${h.coluna_nome ?? ""}`.trim(), detalhe: null };
    case "PLANILHA_RENOMEADA":
      return { titulo: "Produção renomeada", detalhe: `${de} → ${para}` };
    case "PAGINA_RENOMEADA":
      return { titulo: "Página renomeada", detalhe: para };
    default:
      return { titulo: h.coluna_nome ?? "Alteração", detalhe: `${de} → ${para}` };
  }
}

/** Rótulo curto para a aba do rodapé: "3/8", "3–9/8", "agosto". */
function rotuloAba(de: string, periodicidade: Periodicidade | undefined): string {
  const d = new Date(`${de}T12:00:00`);

  if (periodicidade === "MENSAL") return MESES[d.getMonth()];
  if (periodicidade === "SEMANAL") return `sem. ${d.getDate()}/${d.getMonth() + 1}`;

  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/**
 * As alternativas da coluna, sempre como lista.
 *
 * `opcoes` vem de um JSONB e o banco tem colunas antigas gravadas com `{}` em
 * vez de `[]`. O tipo promete `Opcao[]`, a realidade nem sempre cumpre — e
 * `{}.map` derruba o render inteiro.
 */
const listaDeOpcoes = (c: Coluna) => (Array.isArray(c.opcoes) ? c.opcoes : []);

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Texto do servidor vira Date.
 *
 * Corta em 10 caracteres antes de montar: se algum campo voltar com carimbo
 * de hora ("2026-08-01T00:00:00.000Z"), concatenar "T12:00:00" produziria
 * Invalid Date — e o `iso()` dessa data gera a string "NaN-NaN-NaN", que segue
 * viagem até o banco e derruba a consulta com "invalid input syntax for type
 * date". Foi exatamente esse o caminho do erro. O meio-dia continua ali para a
 * data não escorregar um dia por causa de fuso.
 */
const doIso = (s: string) => new Date(`${String(s ?? "").slice(0, 10)}T12:00:00`);

/** Data inválida não pode virar parâmetro: cai para hoje. */
const isoSeguro = (d: Date) => (Number.isNaN(d.getTime()) ? iso(new Date()) : iso(d));

/** "3 de agosto", "semana de 3 a 9 de agosto", "agosto de 2026". */
function rotuloPeriodo(p: Pagina | null): string {
  if (!p) return "";

  const de = doIso(p.de);
  const ate = doIso(p.ate);

  if (p.periodicidade === "DIARIA") return `${de.getDate()} de ${MESES[de.getMonth()]}`;
  if (p.periodicidade === "MENSAL") return `${MESES[de.getMonth()]} de ${de.getFullYear()}`;

  return `${de.getDate()} a ${ate.getDate()} de ${MESES[ate.getMonth()]}`;
}

/**
 * Planilhas configuráveis.
 *
 * Duas telas em uma, por escolha: a lista de modelos e a planilha aberta. São
 * o mesmo assunto em zoom diferente, e separá-las em rotas obrigaria a voltar
 * e reabrir a cada troca de planilha.
 *
 * O que o administrador desenha é o MODELO — quais colunas, de que tipo, com
 * que periodicidade. O que a equipe preenche é o período: a planilha de hoje,
 * desta semana ou deste mês, conforme o modelo diz.
 */
/**
 * O que a tela recebe de quem a hospeda.
 *
 * A planilha deixou de ser um destino do menu e passou a ser uma das duas
 * leituras da aba Kanban, dentro de Produção (ver `KanbanPage`). Ela continua
 * dona da própria casca — o título é o nome da planilha aberta, e os controles
 * de período, histórico, colunas e link são dela —, mas quem a hospeda injeta
 * as abas da SEÇÃO (Produções · Kanban), que entram na ponta esquerda da
 * `BarraFiltros` colada na tabela. É o mesmo arranjo de Vendas, do PDV e do
 * caixa; no cabeçalho da página elas ficariam a meia tela do que trocam, com
 * uma peça diferente da que o resto do sistema usa.
 *
 * O alternador PLANILHA/BACKLOG **não** vem de fora: as duas visões são desta
 * tela, sobre os mesmos registros já carregados aqui. Ver `QuadroPlanilha`.
 *
 * `abasSecao` é opcional: sem ela a tela funciona sozinha, como funcionava.
 */
type Props = {
  /** Abas que TROCAM a tela — ponta esquerda da barra. */
  abasSecao?: ReactNode;
  /** Controles extras da seção — ponta direita, junto dos desta tela. */
  controlesSecao?: ReactNode;
};

/** Como a pessoa está olhando a planilha aberta. */
type Visao = "planilha" | "backlog";

const CHAVE_VISAO = "planilhas:visao";
const CHAVE_ETAPA = "planilhas:colunaEtapa";

/** Preferência gravada por planilha. Falha em silêncio: é conforto, não regra. */
const lembrado = (chave: string, id: string): string | null => {
  try {
    return localStorage.getItem(`${chave}:${id}`);
  } catch {
    return null;
  }
};

const lembrar = (chave: string, id: string, valor: string) => {
  try {
    localStorage.setItem(`${chave}:${id}`, valor);
  } catch {
    /* Modo privado, cookies bloqueados: a tela abre no padrão e funciona. */
  }
};

const PlanilhasPage = ({ abasSecao, controlesSecao }: Props = {}) => {
  const alert = useAlert();

  /**
   * Todo aviso desta tela é TOAST, nunca modal.
   *
   * ---------------------------------------------------------------------------
   * Por que o modal era errado AQUI
   * ---------------------------------------------------------------------------
   * A planilha é a única tela do sistema em que se digita em rajada: dez, vinte
   * células seguidas, sem parar entre uma e outra. O modal de erro é uma caixa
   * no meio da tela com um botão de OK — ele ROUBA O FOCO do campo em que a
   * pessoa está e engole a próxima tecla digitada. Numa tela de digitação
   * contínua, um aviso que interrompe custa mais do que o erro que ele relata:
   * a pessoa perde a linha em que estava e tem de reencontrá-la.
   *
   * O toast diz a mesma coisa no canto, some sozinho e não tira o cursor de
   * onde ele está. Se a gravação falhou, a célula já voltou ao valor de antes
   * — o aviso é notícia, não decisão.
   */
  const TOAST = { position: "bottom-right" as const, timer: 4000 };

  const avisar = (titulo: string, mensagem?: string) => alert.toast("error", titulo, mensagem, TOAST);
  const { user } = useAuth();
  const gestor = ehGestor(user);

  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [aberta, setAberta] = useState<Modelo | null>(null);
  const [colunas, setColunas] = useState<Coluna[]>([]);
  const [pagina, setPagina] = useState<Pagina | null>(null);
  const [dataAtual, setDataAtual] = useState(() => iso(new Date()));
  const [carregando, setCarregando] = useState(true);

  const [novaAberta, setNovaAberta] = useState(false);
  const [configAberta, setConfigAberta] = useState(false);
  const [salvando, setSalvando] = useState(false);

  /* Modelos prontos — os que publicamos para todos e os desenhados para esta
     empresa. Carregam junto da lista: são a resposta para a planilha vazia. */
  const [catalogo, setCatalogo] = useState<ModeloCatalogo[]>([]);
  const [modelosAberto, setModelosAberto] = useState(false);
  const [usando, setUsando] = useState<string | null>(null);

  /* Planilha na mira da lixeira. Excluir é o único caminho sem volta desta
     tela — pede uma confirmação, mesmo estando vazia. */
  const [excluindo, setExcluindo] = useState<Modelo | null>(null);
  const [removendo, setRemovendo] = useState(false);

  /*
   * A visão da planilha aberta — e a coluna que faz as raias do quadro.
   *
   * As duas são PREFERÊNCIA, não conteúdo: nada aqui muda um dado. Ficam
   * gravadas por planilha porque são hábito de trabalho — quem administra a
   * Estamparia pelo quadro a abre no quadro amanhã de manhã, e a Camisaria,
   * que é de digitar, continua abrindo na grade.
   */
  /* Tokens já anunciados nesta sessão — é o que evita repetir o toast do link
     a cada vez que o mesmo nome é digitado. Ref, e não estado: ninguém
     redesenha por causa dele. */
  const linksEmitidos = useRef<Set<string>>(new Set());

  const [visao, setVisao] = useState<Visao>("planilha");
  const [colunaEtapaId, setColunaEtapaId] = useState("");

  const [formModelo, setFormModelo] = useState<{ nome: string; periodicidade: Periodicidade }>({ nome: "", periodicidade: "DIARIA" });
  const [formColuna, setFormColuna] = useState<{ nome: string; tipo: TipoColuna; opcoes: string; valorPadrao: string }>({ nome: "", tipo: "TEXTO", opcoes: "", valorPadrao: "" });

  const equipe = useEquipeStore((s) => s.equipe);
  const buscarEquipe = useEquipeStore((s) => s.buscar);

  useEffect(() => {
    if (gestor) buscarEquipe();
  }, [gestor, buscarEquipe]);

  /* O `id` aqui é o do LOGIN, não o do funcionário: ele é comparado com
     `user?.id` da sessão para decidir quem edita a coluna. Ver a nota de
     `podemReceberTarefa`. */
  const funcionarios = useMemo(() => podemReceberTarefa(equipe?.funcionarios ?? []), [equipe]);

  /* A trava de plano saiu daqui junto com a das rotas: a planilha é a
     ferramenta de produção de todo mundo, e o pacote comercial ainda vai ser
     reorganizado. */

  /** Quem pode editar a coluna. Lista vazia = todos; gestor sempre pode. */
  const podeEditar = (c: Coluna) => gestor || !c.permissoes?.length || c.permissoes.includes(String(user?.id));

  const alternarPermissao = async (c: Coluna, funcionarioId: string) => {
    const atual = c.permissoes ?? [];
    const nova = atual.includes(funcionarioId) ? atual.filter((x) => x !== funcionarioId) : [...atual, funcionarioId];

    setColunas((prev) => prev.map((x) => (x.id === c.id ? { ...x, permissoes: nova } : x)));
    await PlanilhaService.alterarColuna(c.id, { permissoes: nova });
  };

  /** Esconde ou mostra a coluna no link do cliente — vale para TODO link. */
  const alternarPublico = async (c: Coluna, publico: boolean) => {
    setColunas((prev) => prev.map((x) => (x.id === c.id ? { ...x, publico } : x)));

    try {
      await PlanilhaService.alterarColuna(c.id, { publico });
    } catch (err) {
      setColunas((prev) => prev.map((x) => (x.id === c.id ? { ...x, publico: !publico } : x)));
      avisar(getErrorTitle(err), extractErrorMessage(err, "Não foi possível salvar."));
    }
  };

  /** A data que esta coluna não pode preceder. `null` remove a regra. */
  const definirDataMinima = async (c: Coluna, alvo: string | null) => {
    const antes = c.nao_antes_de;

    setColunas((prev) => prev.map((x) => (x.id === c.id ? { ...x, nao_antes_de: alvo } : x)));

    try {
      await PlanilhaService.alterarColuna(c.id, { naoAntesDe: alvo });
    } catch (err) {
      setColunas((prev) => prev.map((x) => (x.id === c.id ? { ...x, nao_antes_de: antes } : x)));
      avisar(getErrorTitle(err), extractErrorMessage(err, "Não foi possível salvar a regra."));
    }
  };

  const renomearColuna = async (c: Coluna) => {
    const nome = window.prompt("Novo nome da coluna", c.nome)?.trim();

    if (!nome || nome === c.nome) return;

    setColunas((prev) => prev.map((x) => (x.id === c.id ? { ...x, nome } : x)));

    try {
      await PlanilhaService.alterarColuna(c.id, { nome });
    } catch (err) {
      setColunas((prev) => prev.map((x) => (x.id === c.id ? { ...x, nome: c.nome } : x)));
      avisar(getErrorTitle(err), extractErrorMessage(err, "Não foi possível renomear."));
    }
  };

  /* Cor livre, do seletor do sistema operacional. A paleta fixa de seis que
     havia antes economizava um clique e tirava a decisão de quem conhece a
     própria operação — verde para "pronto" e vermelho para "atrasado" são
     convenções da casa, não do sistema. */
  const definirCor = async (c: Coluna, indice: number, cor: string) => {
    const opcoes = listaDeOpcoes(c).map((op, i) => (i === indice ? { ...op, cor } : op));

    setColunas((prev) => prev.map((x) => (x.id === c.id ? { ...x, opcoes } : x)));
    await PlanilhaService.alterarColuna(c.id, { opcoes });
  };

  const removerOpcao = async (c: Coluna, indice: number) => {
    const opcoes = listaDeOpcoes(c).filter((_, i) => i !== indice);

    setColunas((prev) => prev.map((x) => (x.id === c.id ? { ...x, opcoes } : x)));
    await PlanilhaService.alterarColuna(c.id, { opcoes });
  };

  const definirPadrao = async (c: Coluna, valor: string) => {
    setColunas((prev) => prev.map((x) => (x.id === c.id ? { ...x, valor_padrao: valor } : x)));
    await PlanilhaService.alterarColuna(c.id, { valorPadrao: valor });
  };

  const carregarModelos = useCallback(async () => {
    setCarregando(true);

    try {
      setModelos(await PlanilhaService.modelos());
    } catch (err) {
      avisar(getErrorTitle(err), extractErrorMessage(err, "Não foi possível carregar as produções."));
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    carregarModelos();
  }, [carregarModelos]);

  /* O catálogo não bloqueia a tela: falhar aqui deixa a lista sem modelos
     prontos, e criar do zero continua funcionando. */
  useEffect(() => {
    let vivo = true;

    PlanilhaService.catalogo()
      .then((lista) => vivo && setCatalogo(lista))
      .catch(() => vivo && setCatalogo([]));

    return () => {
      vivo = false;
    };
  }, []);

  /**
   * Exclui a planilha vazia.
   *
   * A trava de "tem dados" existe nos dois lados: aqui o botão nem acende, e o
   * servidor recusa de novo (`RemoverModelo`). Botão escondido não é controle
   * de acesso — a rota responde a quem a chamar direto. Se o servidor recusar,
   * a mensagem dele vai para a tela: ela diz quantas linhas estão preenchidas.
   */
  const excluirPlanilha = async () => {
    if (!excluindo) return;

    setRemovendo(true);

    try {
      await PlanilhaService.removerModelo(excluindo.id);

      setModelos((ms) => ms.filter((m) => m.id !== excluindo.id));
      setExcluindo(null);
      alert.toast("success", "Produção excluída", "Ela saiu da lista.", TOAST);
    } catch (err) {
      avisar(getErrorTitle(err), extractErrorMessage(err, "Não foi possível excluir a produção."));
    } finally {
      setRemovendo(false);
    }
  };

  /** Cria a planilha a partir de um modelo pronto e já entra nela. */
  const usarModelo = async (m: ModeloCatalogo) => {
    if (usando) return;

    setUsando(m.id);

    try {
      const novoId = await PlanilhaService.usarModelo(m.id);
      const lista = await PlanilhaService.modelos();

      setModelos(lista);
      setModelosAberto(false);

      /* Entrar direto é o passo seguinte óbvio — quem escolheu o modelo quer
         começar a preencher, não voltar para a lista e procurá-lo. */
      const nova = lista.find((x) => x.id === novoId);

      if (nova) {
        setAberta(nova);
        setDataAtual(iso(new Date()));
      }
    } catch (err) {
      avisar(getErrorTitle(err), extractErrorMessage(err, "Não foi possível criar a produção a partir do modelo."));
    } finally {
      setUsando(null);
    }
  };

  /**
   * Recarrega a planilha. `silencioso` mantém o conteúdo na tela enquanto isso.
   *
   * ---------------------------------------------------------------------------
   * Por que a maioria das recargas é silenciosa
   * ---------------------------------------------------------------------------
   * `setCarregando(true)` troca a planilha inteira por um esqueleto cinza. Isso
   * é certo quando ainda não há nada na tela — abrir a planilha, virar de mês —
   * e é péssimo em todo o resto: quem digita numa célula e recebe a grade
   * inteira piscando conclui que perdeu o que escreveu, e quem trabalha com
   * outra pessoa na mesma planilha via a tela apagar sozinha a cada tecla dela
   * (o aviso de tempo real chega a cada alteração).
   *
   * Silenciosa, a recarga troca os dados por baixo: a grade fica onde está, as
   * linhas atualizam e ninguém percebe que houve uma requisição — que é
   * exatamente o que se espera de uma sincronização.
   */
  const carregarPlanilha = useCallback(async (modelo: Modelo, data: string, silencioso = false) => {
    if (!silencioso) setCarregando(true);

    try {
      const [cols, pag] = await Promise.all([PlanilhaService.colunas(modelo.id), PlanilhaService.registros(modelo.id, data)]);

      /* Período novo nasce com um bloco de linhas em branco: planilha vazia não
         convida a escrever, e criar a primeira linha manualmente é um passo que
         ninguém deveria precisar dar. Só quando já há colunas — sem elas, as
         linhas não teriam onde ser preenchidas. */
      if (cols.length > 0 && pag.registros.length === 0) {
        await PlanilhaService.criarLote(modelo.id, 10, pag.de);
        setPagina(await PlanilhaService.registros(modelo.id, data));
      } else {
        setPagina(pag);
      }

      setColunas(cols);
    } catch (err) {
      avisar(getErrorTitle(err), extractErrorMessage(err, "Não foi possível abrir a produção."));
    } finally {
      if (!silencioso) setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (aberta) carregarPlanilha(aberta, dataAtual);
  }, [aberta, dataAtual, carregarPlanilha]);

  /* Mesma fila do quadro de produção, em linhas: o que muda de um lado tem de
     aparecer do outro sem ninguém apertar atualizar. Só com planilha aberta —
     sem ela não há o que recarregar. */
  useSincronizacao(["planilhas", "producao"], () => {
    if (aberta) carregarPlanilha(aberta, dataAtual, true);
  }, Boolean(aberta));

  /** Anda um período inteiro para frente ou para trás. */
  const navegar = (passo: 1 | -1) => {
    const d = doIso(dataAtual);

    if (pagina?.periodicidade === "MENSAL") d.setMonth(d.getMonth() + passo);
    else if (pagina?.periodicidade === "SEMANAL") d.setDate(d.getDate() + 7 * passo);
    else d.setDate(d.getDate() + passo);

    setDataAtual(isoSeguro(d));
  };

  const criarModelo = async () => {
    if (!formModelo.nome.trim()) return;

    setSalvando(true);

    try {
      await PlanilhaService.criarModelo({ nome: formModelo.nome.trim(), periodicidade: formModelo.periodicidade });
      setNovaAberta(false);
      setFormModelo({ nome: "", periodicidade: "DIARIA" });
      carregarModelos();
    } catch (err) {
      avisar(getErrorTitle(err), extractErrorMessage(err, "Não foi possível criar."));
    } finally {
      setSalvando(false);
    }
  };

  const criarColuna = async () => {
    if (!aberta || !formColuna.nome.trim()) return;

    setSalvando(true);

    try {
      /* Opções digitadas separadas por vírgula: pedir um formulário por
         alternativa transformaria "criar um seletor" numa tarefa de minutos. */
      const opcoes = formColuna.opcoes
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
        .map((valor) => ({ valor }));

      await PlanilhaService.criarColuna(aberta.id, { nome: formColuna.nome.trim(), tipo: formColuna.tipo, opcoes, valorPadrao: formColuna.valorPadrao.trim() || null });
      setFormColuna({ nome: "", tipo: "TEXTO", opcoes: "", valorPadrao: "" });
      carregarPlanilha(aberta, dataAtual);
    } catch (err) {
      avisar(getErrorTitle(err), extractErrorMessage(err, "Não foi possível criar a coluna."));
    } finally {
      setSalvando(false);
    }
  };

  const removerColuna = async (c: Coluna) => {
    if (!aberta) return;

    try {
      await PlanilhaService.removerColuna(c.id);
      carregarPlanilha(aberta, dataAtual);
    } catch (err) {
      avisar(getErrorTitle(err), extractErrorMessage(err, "Não foi possível remover."));
    }
  };

  const novaLinha = async () => {
    if (!aberta || !pagina) return;

    try {
      /* A linha nasce dentro do período aberto: criar em "hoje" enquanto se
         olha o mês que vem faria a linha sumir na frente de quem a criou.
         Em bloco de dez, porque quem clica em "adicionar" quase nunca quer
         só uma. */
      await PlanilhaService.criarLote(aberta.id, 10, pagina.de);
      carregarPlanilha(aberta, dataAtual);
    } catch (err) {
      avisar(getErrorTitle(err), extractErrorMessage(err, "Não foi possível criar a linha."));
    }
  };

  /* Grava a célula e atualiza só ela na memória — recarregar a planilha
     inteira a cada tecla seria lento e faria o cursor pular. */
  const salvarCelula = async (registroId: string, colunaId: string, valor: unknown) => {
    /*
     * A regra de data mínima é conferida aqui ANTES de gravar.
     *
     * O servidor também recusa, e é ele quem manda — esta checagem não é a
     * segurança, é a experiência. Sem ela o valor impossível aparece na tela
     * (a gravação é otimista), some meio segundo depois quando a resposta
     * chega, e a planilha inteira recarrega. O usuário vê um piscar sem
     * entender o que aconteceu.
     */
    const coluna = colunas.find((c) => c.id === colunaId);

    if (coluna?.nao_antes_de && valor) {
      const registro = pagina?.registros.find((r) => r.id === registroId);
      const limite = registro?.valores[coluna.nao_antes_de];
      const refNome = colunas.find((c) => c.id === coluna.nao_antes_de)?.nome ?? "a data de referência";

      /* Datas em ISO (`YYYY-MM-DD`) comparam como string na ordem certa —
         virar `Date` traria fuso para uma conta que não precisa dele. */
      if (limite && String(valor) < String(limite)) {
        avisar(
          "Data inválida",
          `${coluna.nome} não pode ser antes de ${refNome} (${String(limite).split("-").reverse().join("/")}).`,
        );

        /* Recarrega para o campo voltar ao valor bom: o editor da célula já
           guardou o rascunho, e sem isso ele ficaria mostrando o recusado. */
        if (aberta) carregarPlanilha(aberta, dataAtual, true);

        return;
      }
    }

    setPagina((p) =>
      p ? { ...p, registros: p.registros.map((r) => (r.id === registroId ? { ...r, valores: { ...r.valores, [colunaId]: valor } } : r)) } : p,
    );

    try {
      await PlanilhaService.alterarRegistro(registroId, { valores: { [colunaId]: valor } });

      /* Depois de gravar, e sem esperar: o link é consequência da célula, não
         condição dela. Se demorar, a digitação não espera por ele. */
      if (coluna) emitirLinkDoCliente(coluna, valor);
    } catch (err) {
      avisar(getErrorTitle(err), extractErrorMessage(err, "Não foi possível salvar."));
      if (aberta) carregarPlanilha(aberta, dataAtual, true);
    }
  };

  const excluirLinha = async (id: string) => {
    setPagina((p) => (p ? { ...p, registros: p.registros.filter((r) => r.id !== id) } : p));

    try {
      await PlanilhaService.excluirRegistro(id);
    } catch {
      if (aberta) carregarPlanilha(aberta, dataAtual, true);
    }
  };

  /**
   * Repete a linha de cima nesta.
   *
   * O trabalho desta tela é quase todo repetição com uma diferença: o mesmo
   * cliente, o mesmo prazo, a mesma etapa — muda a peça. Redigitar treze
   * células para trocar uma é o gesto que mais se faz aqui, e era o único sem
   * atalho: dava para excluir a linha, dava para ver o histórico dela, mas
   * copiar a de cima exigia célula por célula.
   *
   * Copia SÓ o que esta pessoa poderia digitar à mão. Coluna restrita fica
   * como está: o servidor recusaria a gravação inteira, e — pior — copiar
   * seria uma porta lateral para escrever onde a permissão diz que não.
   *
   * Uma requisição só, com todos os valores. Treze chamadas de `salvarCelula`
   * seriam treze linhas de histórico para um gesto que a pessoa entende como
   * um.
   */
  const copiarDeCima = async (registroId: string) => {
    const lista = pagina?.registros ?? [];
    const i = lista.findIndex((r) => r.id === registroId);

    /* A primeira linha não tem de onde copiar — o menu já desabilita o item,
       isto é o cinto de segurança. */
    if (i <= 0) return;

    const acima = lista[i - 1];
    const editaveis = colunas.filter((c) => podeEditar(c));

    if (editaveis.length === 0) {
      avisar("Nada para copiar", "Você não pode editar nenhuma coluna desta produção.");
      return;
    }

    /* `?? null` e não `?? undefined`: célula vazia em cima tem de ESVAZIAR a
       de baixo. Omitir a chave deixaria o valor antigo, e o resultado seria
       uma linha que não é cópia de nada. */
    const valores: Record<string, unknown> = {};

    for (const c of editaveis) valores[c.id] = acima.valores[c.id] ?? null;

    setPagina((p) =>
      p ? { ...p, registros: p.registros.map((r) => (r.id === registroId ? { ...r, valores: { ...r.valores, ...valores } } : r)) } : p,
    );

    try {
      await PlanilhaService.alterarRegistro(registroId, { valores });

      /* Mesma consequência de digitar o nome à mão: a coluna de Cliente emite
         o link. Como o cliente é o mesmo da linha de cima, o servidor devolve
         o token que já existe e nenhum toast repete. */
      for (const c of editaveis) {
        if (c.tipo === "CLIENTE") emitirLinkDoCliente(c, valores[c.id]);
      }
    } catch (err) {
      avisar(getErrorTitle(err), extractErrorMessage(err, "Não foi possível copiar a linha de cima."));
      if (aberta) carregarPlanilha(aberta, dataAtual, true);
    }
  };

  /*
   * As páginas desta planilha, para o rodapé.
   *
   * Recarrega junto com a planilha porque criar linhas num período novo faz
   * uma página nascer — e a aba tem de aparecer sem exigir F5.
   */
  const [periodos, setPeriodos] = useState<Periodo[]>([]);

  useEffect(() => {
    if (!aberta) {
      setPeriodos([]);
      return;
    }

    let vivo = true;

    PlanilhaService.periodos(aberta.id)
      .then((lista) => vivo && setPeriodos(lista))
      .catch(() => vivo && setPeriodos([]));

    return () => {
      vivo = false;
    };
  }, [aberta, pagina]);

  /*
   * Histórico de alterações.
   *
   * A planilha salva sozinha, célula a célula, sem botão nenhum — ótimo para
   * o ritmo do trabalho e péssimo para a pergunta que vem depois: "esse prazo
   * era dia 12, quem mudou para 20?". Sem trilha, o valor antigo simplesmente
   * deixa de existir e a conversa vira a palavra de um contra a do outro.
   *
   * Carrega só quando o painel abre: é consulta de exceção, não custa nada
   * ficar fora do carregamento da tela.
   */
  const [historico, setHistorico] = useState<Alteracao[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);

  /**
   * O recorte do histórico aberto agora.
   *
   * `null` = fechado. Sem filtro = a planilha inteira. Com `registro` e
   * `coluna` = uma célula só, que é o caso do botão direito — e o motivo de
   * isto ser um objeto em vez de um booleano: o painel é o mesmo, o que muda é
   * o que ele pergunta ao servidor.
   */
  const [historicoAlvo, setHistoricoAlvo] = useState<null | { registro?: string; coluna?: string; rotulo?: string }>(null);

  const abrirHistorico = (alvo: { registro?: string; coluna?: string; rotulo?: string } = {}) => setHistoricoAlvo(alvo);

  useEffect(() => {
    if (!historicoAlvo || !aberta) return;

    let vivo = true;

    setCarregandoHistorico(true);

    PlanilhaService.historico(aberta.id, historicoAlvo.registro, historicoAlvo.coluna)
      .then((lista) => vivo && setHistorico(lista))
      .catch(() => vivo && setHistorico([]))
      .finally(() => vivo && setCarregandoHistorico(false));

    return () => {
      vivo = false;
    };
  }, [historicoAlvo, aberta]);

  /* Menu de configuração aberto, por id de coluna. Um por vez: dois abertos ao
     mesmo tempo é ruído, e nenhum menu de planilha do mundo faz isso. */
  const [menuColuna, setMenuColuna] = useState<string | null>(null);

  /*
   * Menu do botão direito: onde clicou e sobre o quê.
   *
   * `alvo` separa os dois cliques que abrem o MESMO menu. Na célula, cabem as
   * ações dela — histórico, limpar, configurar a coluna. No número da linha
   * não cabe nenhuma: ali não há célula sob o cursor, e oferecer "limpar
   * célula" apontando para a primeira coluna limparia uma que a pessoa nem
   * mirou. Sobram as ações de linha, que são as mesmas nos dois casos.
   */
  const [menuCelula, setMenuCelula] = useState<
    null | { x: number; y: number; registroId: string; coluna: Coluna; linha: number; alvo: "celula" | "linha" }
  >(null);

  const abrirMenuCelula = (e: React.MouseEvent, registroId: string, coluna: Coluna, linha: number, alvo: "celula" | "linha" = "celula") => {
    e.preventDefault();
    setMenuCelula({ x: e.clientX, y: e.clientY, registroId, coluna, linha, alvo });
  };

  /**
   * `root` de verdade, não `gestor`.
   *
   * `ehGestor` inclui quem tem cargo ADMIN, e ADMIN é distribuído por quem
   * toca a operação. Quem pode editar qual coluna é o dono limitando a própria
   * equipe — inclusive os ADMIN. Um ADMIN que pudesse editar essa lista se
   * incluiria nela, e a trava deixaria de ser trava.
   */
  const ehRoot = Boolean(user?.root);

  /*
   * Renomear por duplo clique, na própria célula do nome.
   *
   * Um lápis ao lado do título ocuparia espaço permanente para uma ação que
   * se usa duas vezes por ano; um item em menu de contexto ninguém encontra.
   * Duplo clique é o gesto que qualquer pessoa já tenta primeiro num nome de
   * aba de planilha — não custa pixel nenhum e não precisa ser ensinado.
   */
  const [renomeando, setRenomeando] = useState<null | { alvo: "planilha" | "pagina"; chave: string; valor: string }>(null);

  const confirmarRenome = async () => {
    if (!renomeando || !aberta) return;

    const { alvo, chave, valor } = renomeando;

    setRenomeando(null);

    try {
      if (alvo === "planilha") {
        const nome = valor.trim();
        if (!nome || nome === aberta.nome) return;

        /* Local primeiro: o nome está no cabeçalho e na lista, e esperar a
           rede para ver a própria digitação é o tipo de atraso que faz a
           pessoa clicar de novo achando que não salvou. */
        setAberta({ ...aberta, nome });
        setModelos((ms) => ms.map((m) => (m.id === aberta.id ? { ...m, nome } : m)));

        await PlanilhaService.alterarModelo(aberta.id, { nome });
        return;
      }

      setPeriodos((ps) => ps.map((p) => (p.de === chave ? { ...p, nome: valor.trim() || null } : p)));

      await PlanilhaService.renomearPagina(aberta.id, chave, valor);
    } catch (err) {
      avisar(getErrorTitle(err), extractErrorMessage(err, "Não foi possível renomear."));
      carregarModelos();
      if (aberta) carregarPlanilha(aberta, dataAtual);
    }
  };

  /** Campo de edição inline — mesmo comportamento nos dois lugares. */
  const campoRenome = (largura: string) => (
    <input
      autoFocus
      value={renomeando?.valor ?? ""}
      onChange={(e) => setRenomeando((r) => (r ? { ...r, valor: e.target.value } : r))}
      onBlur={confirmarRenome}
      onKeyDown={(e) => {
        if (e.key === "Enter") confirmarRenome();
        if (e.key === "Escape") setRenomeando(null);
      }}
      className={`${largura} rounded-lg border border-accent/60 bg-fg/[0.04] px-2 py-1 text-ink outline-none`}
    />
  );

  /**
   * Abre o período seguinte ao mais recente que já existe, em branco.
   *
   * Anda a partir da página MAIS NOVA, e não da que está aberta: quem está
   * consultando agosto e clica em "+ Página" quer a próxima da planilha, não
   * criar setembro de novo por cima do que já existe.
   */
  const proximaPagina = () => {
    const maisRecente = periodos[0]?.de ?? pagina?.de ?? dataAtual;
    const d = doIso(maisRecente);

    if (pagina?.periodicidade === "MENSAL") d.setMonth(d.getMonth() + 1);
    else if (pagina?.periodicidade === "SEMANAL") d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);

    setDataAtual(isoSeguro(d));
  };

  /** Copia a planilha aberta e já entra na cópia — é o que se quer em seguida. */
  const duplicarAtual = async () => {
    if (!aberta) return;

    setSalvando(true);

    try {
      const novoId = await PlanilhaService.duplicarModelo(aberta.id);
      const lista = await PlanilhaService.modelos();

      setModelos(lista);

      const nova = lista.find((m) => m.id === novoId);
      if (nova) setAberta(nova);
    } catch (err) {
      avisar(getErrorTitle(err), extractErrorMessage(err, "Não foi possível duplicar a produção."));
    } finally {
      setSalvando(false);
    }
  };

  const larguraTotal = useMemo(() => colunas.reduce((soma, c) => soma + (c.largura ?? 180), 56), [colunas]);

  /* ===================== 3. PLANILHA ⇄ BACKLOG ===================== */

  /**
   * As colunas que podem virar raias.
   *
   * Só SELEÇÃO: é a única cujo conjunto de valores é FECHADO e conhecido, e
   * raia de quadro é isso — uma pilha por valor possível. Agrupar por texto
   * livre produziria uma raia por jeito de escrever a mesma etapa, que é o
   * problema que a coluna de seleção existe para resolver.
   */
  const colunasEtapa = useMemo(() => colunas.filter((c) => c.tipo === "SELECAO"), [colunas]);

  const etapa = useMemo(
    () => colunasEtapa.find((c) => c.id === colunaEtapaId) ?? colunasEtapa[0] ?? null,
    [colunasEtapa, colunaEtapaId],
  );

  /* Ao abrir uma planilha, retoma como ela estava da última vez. A coluna
     lembrada só vale se ainda existir: removida, cai na primeira. */
  useEffect(() => {
    if (!aberta) return;

    setVisao(lembrado(CHAVE_VISAO, aberta.id) === "backlog" ? "backlog" : "planilha");
    setColunaEtapaId(lembrado(CHAVE_ETAPA, aberta.id) ?? "");
  }, [aberta]);

  const trocarVisao = (v: Visao) => {
    setVisao(v);
    if (aberta) lembrar(CHAVE_VISAO, aberta.id, v);
  };

  const trocarColunaEtapa = (id: string) => {
    setColunaEtapaId(id);
    if (aberta) lembrar(CHAVE_ETAPA, aberta.id, id);
  };

  /**
   * Arrastar o cartão é gravar a célula da etapa — o MESMO caminho da lista
   * suspensa na grade.
   *
   * Não há endpoint de "mover" nem tabela de quadro: por isso as duas visões
   * nunca divergem, e o histórico registra a mudança com o nome da coluna,
   * como registraria se alguém tivesse escolhido na tabela.
   */
  const moverNoQuadro = (registroId: string, valor: string | null) => {
    if (!etapa) return;

    salvarCelula(registroId, etapa.id, valor);
  };

  /**
   * Escrever o nome do cliente numa coluna de Cliente já emite o link dele.
   *
   * ---------------------------------------------------------------------------
   * Por que automático
   * ---------------------------------------------------------------------------
   * O link não é uma decisão: quem põe o nome de alguém numa linha de produção
   * está dizendo que aquele trabalho é daquela pessoa, e é exatamente disso que
   * o link é feito. O passo manual só existia por causa da tela — havia um
   * botão, então havia um clique — e o custo dele não era o clique: era o link
   * que NUNCA foi emitido, porque ninguém lembrou de abrir o painel depois de
   * preencher a planilha. Cliente sem link é cliente ligando para perguntar
   * como está o pedido.
   *
   * Reemitir para o mesmo nome não duplica: o servidor devolve o link que já
   * existe com a validade renovada. Então digitar o mesmo cliente em cinco
   * linhas resulta em um link, não em cinco.
   *
   * Falha em silêncio de propósito. A gravação da célula deu certo — que é o
   * que a pessoa pediu —, e um aviso de erro sobre algo que ela não pediu, no
   * meio da digitação, seria ruído sobre trabalho que não se perdeu: o link
   * continua podendo ser emitido pela aba Produções.
   */
  const emitirLinkDoCliente = async (coluna: Coluna, valor: unknown) => {
    if (!aberta || coluna.tipo !== "CLIENTE") return;

    const nome = String(valor ?? "").trim();

    /* Apagar o nome não revoga nada: revogar é cortar o acesso de alguém, e
       isso é decisão — não efeito colateral de limpar uma célula. */
    if (!nome) return;

    try {
      const link = await PlanilhaService.criarLink(aberta.id, { clienteNome: nome, colunaClienteId: coluna.id }, true);

      /* Só avisa quando o link é NOVO. Reescrever o nome de quem já tem
         devolveria o mesmo link, e um toast a cada célula viraria o barulho
         que este toast existe para evitar. */
      if (!linksEmitidos.current.has(link.token)) {
        linksEmitidos.current.add(link.token);
        alert.toast("success", `Link de ${nome} criado`, "Está na aba Produções, pronto para copiar.", TOAST);
      }
    } catch {
      /* Ver a nota acima: a célula foi gravada, e é isso que importa aqui. */
    }
  };

  /** Nova linha já dentro da raia: uma requisição, no período aberto. */
  const criarNaRaia = async (valor: string) => {
    if (!aberta || !pagina || !etapa) return;

    try {
      await PlanilhaService.criarRegistro(aberta.id, {
        valores: { [etapa.id]: valor },
        competencia: pagina.de,
      });
      carregarPlanilha(aberta, dataAtual);
    } catch (err) {
      avisar(getErrorTitle(err), extractErrorMessage(err, "Não foi possível criar a linha."));
    }
  };

  /* ------------------------- Fora do plano ------------------------- */


  /* ========================== 4. LISTA ========================== */

  if (!aberta) {
    return (
      <PageScreen icon={<Table2 className="h-5 w-5" />} title="Produção" subtitle="As produções que a sua operação usa">
        {/*
         * Uma tabela só, com a mesma anatomia de Clientes, Estoque e Vendas:
         * cabeçalho com o nome da lista e os botões de criar, barra de
         * navegação colada nele, fileira de rótulos e as linhas embaixo.
         *
         * Eram cards em grade. Card é bom para três ou quatro destinos e
         * péssimo para responder o que se pergunta aqui — "qual delas tem linha
         * preenchida?", "qual é mensal?" —, porque os números ficavam
         * espremidos numa legenda de 11px embaixo do nome, em posição diferente
         * conforme o tamanho de cada nome. Em colunas, a mesma pergunta se
         * responde correndo o olho por uma coluna só. E o formato passa a ser o
         * do resto do sistema: quem aprendeu a ler uma tabela aqui não aprende
         * nada de novo.
         */}
        <div className="card glass-sheen flex min-h-[460px] min-w-0 flex-col overflow-hidden rounded-lg sm:min-h-[260px] sm:flex-1">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-fg/[0.06] px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/[0.15]">
                <Table2 className="h-4 w-4 text-accent-soft" />
              </div>
              <div>
                <h2 className="text-[13px] text-ink">Produções</h2>
                <p className="text-[11px] text-faint">
                  {modelos.length} {modelos.length === 1 ? "produção" : "produções"}
                </p>
              </div>
            </div>

            {/*
             * Os botões de criar ficam no ALTO do cartão, como em toda tabela
             * do sistema.
             *
             * "Usar modelo" vem ANTES de "Nova planilha", e não é ordem
             * decorativa: montar quinze colunas do zero é meia hora de trabalho,
             * e quem chega a esta tela quase sempre quer algo que já existe
             * pronto. O caminho em branco continua ali, ao lado, para quem sabe
             * exatamente o que quer.
             */}
            {gestor && (
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none">
                {catalogo.length > 0 && (
                  <button
                    onClick={() => setModelosAberto(true)}
                    className="focus-ring inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-fg/[0.1] px-3 py-2 text-[12.5px] text-mist transition-colors hover:border-accent/40 hover:text-accent-soft"
                  >
                    <LayoutTemplate size={15} /> Usar modelo
                  </button>
                )}

                <button
                  onClick={() => setNovaAberta(true)}
                  className="focus-ring inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-gradient-to-br from-accent-soft to-accent px-3 py-2 text-[12.5px] text-white shadow-glow transition-all hover:brightness-110 active:scale-[0.98]"
                >
                  <Plus size={15} /> Nova produção
                </button>
              </div>
            )}
          </div>

          {(abasSecao || controlesSecao) && <BarraFiltros navegacao={abasSecao}>{controlesSecao}</BarraFiltros>}

          <div className="flex min-h-0 flex-1 flex-col sm:overflow-x-auto">
            <div
              className="flex min-h-0 flex-1 flex-col sm:[min-width:var(--tabela-min)]"
              style={{ "--tabela-min": `${LISTA_MIN_WIDTH}px` } as CSSProperties}
            >
              <ListaCabecalho cols={LISTA_COLS}>
                {LISTA_ROTULOS.slice(0, 5).map((r, i) => (
                  <p key={r} className={i >= 2 ? "text-right" : undefined}>
                    {r}
                  </p>
                ))}
                <p className="text-right">Ações</p>
              </ListaCabecalho>

              {/* São poucas planilhas por empresa — três no Standard, meia dúzia
                  acima disso —, então aqui o corpo ROLA em vez de paginar: uma
                  barra de paginação para seis linhas é rodapé para não dizer
                  nada. */}
              <div className="min-h-0 flex-1 overflow-y-auto">
                {carregando ? (
                  <SkeletonListaPainel linhas={4} />
                ) : modelos.length === 0 ? (
                  <div className="flex h-full items-center justify-center py-10">
                    <div className="flex max-w-xs flex-col items-center gap-3 text-center text-faint">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-fg/[0.06] bg-fg/[0.03]">
                        <Table2 className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-[13px] text-mist">Nenhuma produção ainda</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed">
                          Comece por um modelo pronto — produção, estamparia, entregas — ou monte a sua do zero, escolhendo as colunas e o recorte de período.
                        </p>
                      </div>

                      {gestor && catalogo.length > 0 && (
                        <button
                          onClick={() => setModelosAberto(true)}
                          className="focus-ring flex cursor-pointer items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-[12.5px] text-white transition-all hover:brightness-110"
                        >
                          <LayoutTemplate size={15} /> Ver modelos prontos
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  modelos.map((m) => {
                    const temDados = m.total_preenchidas > 0;

                    return (
                      <ListaLinha
                        key={m.id}
                        cols={LISTA_COLS}
                        altura={ROW_HEIGHT}
                        rotulos={LISTA_ROTULOS}
                        onClick={() => {
                          setAberta(m);
                          setDataAtual(iso(new Date()));
                        }}
                        ariaLabel={`Abrir a produção ${m.nome}`}
                        acoes={
                          gestor ? (
                            /*
                             * Desabilitada quando há linha preenchida, não
                             * escondida.
                             *
                             * Some, e a pessoa procura o botão achando que o
                             * sistema não exclui. Apagada com o motivo no
                             * rótulo, ela aprende a regra de uma vez: esvazie a
                             * planilha e a lixeira acende.
                             */
                            <ListaAcao
                              icon={<Trash2 size={14} />}
                              label={
                                temDados
                                  ? `Não dá para excluir: ${m.total_preenchidas} ${m.total_preenchidas === 1 ? "linha preenchida" : "linhas preenchidas"}. Apague as linhas primeiro.`
                                  : "Excluir produção"
                              }
                              onClick={() => !temDados && setExcluindo(m)}
                            />
                          ) : undefined
                        }
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/[0.14] text-accent-soft">
                            <Table2 size={17} />
                          </span>

                          <div className="flex min-w-0 flex-col">
                            <span className="truncate text-[13px] text-ink">{m.nome}</span>
                            <span className="truncate text-[11px] text-faint">{m.descricao || "Sem descrição"}</span>
                          </div>
                        </div>

                        <span className="flex min-w-0 items-center text-[12px] text-mist">
                          <span className="truncate rounded-full border border-fg/[0.08] bg-fg/[0.03] px-2 py-0.5 text-[10.5px]">
                            {PERIODICIDADES.find((p) => p.id === m.periodicidade)?.label}
                          </span>
                        </span>

                        <span className="flex items-center justify-end text-[12px] tabular-nums text-mist">{m.total_colunas}</span>

                        <span className="flex items-center justify-end text-[12px] tabular-nums text-mist">{m.total_registros}</span>

                        {/* Preenchidas é o número que decide se a planilha pode
                            ser excluída — e o único que diz se ela está em uso
                            de verdade. Zero é notícia, não é célula vazia. */}
                        <span className="flex items-center justify-end text-[12px] tabular-nums">
                          {temDados ? <span className="text-mist">{m.total_preenchidas}</span> : <span className="text-faint">vazia</span>}
                        </span>

                        {/* Célula vazia: reserva a largura das ações, que são
                            desenhadas sobrepostas pela `ListaLinha`. */}
                        <span aria-hidden />
                      </ListaLinha>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Confirmação da exclusão. Só chega aqui planilha sem linha
            preenchida — a lixeira nem acende nas outras. */}
        <Modal open={!!excluindo} onClose={() => setExcluindo(null)} title="Excluir produção" subtitle={excluindo?.nome} accent="rgb(var(--danger))" maxWidth="max-w-sm">
          <p className="text-[13px] leading-relaxed text-mist">
            A produção sai da lista com as colunas que você montou. Não há linha preenchida nela, então nenhum trabalho se perde — mas a estrutura terá de ser refeita.
          </p>

          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setExcluindo(null)} className="min-h-[40px] rounded-xl bg-fg/[0.05] px-4 text-[13px] text-ink transition-colors hover:bg-fg/[0.1]">
              Cancelar
            </button>
            <button
              onClick={() => void excluirPlanilha()}
              disabled={removendo}
              className="flex min-h-[40px] items-center gap-2 rounded-xl bg-danger px-4 text-[13px] text-white transition-all hover:brightness-110 disabled:opacity-50"
            >
              {removendo && <Loader2 size={14} className="animate-spin" />}
              Excluir
            </button>
          </div>
        </Modal>

        {/* Modelos prontos — o catálogo que publicamos e o que foi desenhado
            para esta empresa em particular. */}
        <Modal open={modelosAberto} onClose={() => setModelosAberto(false)} title="Modelos prontos" subtitle="A produção nasce com as colunas já definidas" size="lg">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {catalogo.map((m) => (
              <button
                key={m.id}
                onClick={() => void usarModelo(m)}
                disabled={Boolean(usando)}
                className="focus-ring flex flex-col items-start gap-2 rounded-xl border border-fg/[0.08] bg-fg/[0.02] p-3.5 text-left transition-colors hover:border-accent/40 hover:bg-fg/[0.04] disabled:opacity-50"
              >
                <span className="flex w-full items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{m.nome}</span>

                  {/* Desenhado para esta empresa, não parte do catálogo geral —
                      vale dizer, porque muda o que a pessoa espera encontrar. */}
                  {m.exclusivo && !m.publicado && (
                    <span className="shrink-0 rounded-full bg-accent/[0.14] px-2 py-0.5 text-[10px] text-accent-soft">seu</span>
                  )}

                  {usando === m.id ? <Loader2 size={14} className="shrink-0 animate-spin text-accent" /> : null}
                </span>

                {m.descricao && <span className="line-clamp-2 text-[11.5px] leading-relaxed text-faint">{m.descricao}</span>}

                <span className="flex flex-wrap gap-1">
                  {m.colunas.slice(0, 4).map((c) => (
                    <span key={c.nome} className="rounded-md bg-fg/[0.05] px-1.5 py-0.5 text-[10.5px] text-mist">
                      {c.nome}
                    </span>
                  ))}
                  {m.colunas.length > 4 && <span className="px-1 text-[10.5px] text-faint">+{m.colunas.length - 4}</span>}
                </span>

                <span className="text-[10.5px] uppercase tracking-[0.08em] text-faint">
                  {PERIODICIDADES.find((p) => p.id === m.periodicidade)?.label}
                </span>
              </button>
            ))}
          </div>
        </Modal>

        <Modal open={novaAberta} onClose={() => setNovaAberta(false)} title="Nova produção" subtitle="Você define as colunas depois">
          <div className="flex flex-col gap-3">
            <input
              autoFocus
              value={formModelo.nome}
              onChange={(e) => setFormModelo({ ...formModelo, nome: e.target.value })}
              placeholder="Nome (ex.: Produção camisaria)"
              className="w-full rounded-xl border border-fg/[0.08] bg-fg/[0.03] px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent/60"
            />

            <div>
              <p className="mb-2 text-[11px] uppercase tracking-[0.08em] text-faint">Período</p>
              <div className="flex gap-2">
                {PERIODICIDADES.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setFormModelo({ ...formModelo, periodicidade: p.id })}
                    className={`flex-1 rounded-xl border py-2 text-[12.5px] transition-colors ${formModelo.periodicidade === p.id ? "border-accent bg-accent/[0.12] text-accent-soft" : "border-fg/[0.1] text-mist"}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-faint">Define o recorte: a produção mostra o dia, a semana ou o mês de cada vez.</p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setNovaAberta(false)} className="min-h-[42px] rounded-xl border border-fg/[0.1] px-4 text-[13px] text-mist">
                Cancelar
              </button>
              <button onClick={criarModelo} disabled={salvando || !formModelo.nome.trim()} className="flex min-h-[42px] items-center gap-2 rounded-xl bg-accent px-5 text-[13px] text-white disabled:opacity-40">
                {salvando && <Loader2 size={14} className="animate-spin" />}
                Criar
              </button>
            </div>
          </div>
        </Modal>
      </PageScreen>
    );
  }

  /* ===================== 5. PLANILHA ABERTA ===================== */

  /*
   * Os controles sobem para o cabeçalho da página.
   *
   * Eram uma barra própria acima da tabela, e ela custava caro: ~52px de altura
   * permanente numa tela cujo conteúdo é justamente uma grade que se quer ver o
   * máximo possível — em notebook isso é duas ou três linhas a menos, sempre. E
   * a barra ainda repetia informação ("Planilhas" no header, o nome logo
   * abaixo), gastando espaço para dizer duas vezes onde a pessoa está.
   */
  const acoes = (
    <>
      <Presenca planilhaId={aberta.id} />

      <span className="hidden text-[11.5px] tabular-nums text-faint sm:inline">
        {pagina?.registros.length ?? 0} {(pagina?.registros.length ?? 0) === 1 ? "linha" : "linhas"}
      </span>

      <div className="flex items-center rounded-xl border border-fg/[0.1]">
        <button onClick={() => navegar(-1)} aria-label="Período anterior" title="Período anterior" className="focus-ring grid h-8 w-8 place-items-center rounded-l-xl text-mist transition-colors hover:bg-fg/[0.05] hover:text-ink">
          <ChevronLeft size={15} />
        </button>
        <span className="h-4 w-px bg-fg/[0.1]" />
        <button onClick={() => navegar(1)} aria-label="Próximo período" title="Próximo período" className="focus-ring grid h-8 w-8 place-items-center rounded-r-xl text-mist transition-colors hover:bg-fg/[0.05] hover:text-ink">
          <ChevronRight size={15} />
        </button>
      </div>

      {/*
       * "Histórico" e "Cliente" saíram daqui.
       *
       * O HISTÓRICO virou pergunta de contexto: ele quase nunca é "o que mudou
       * nesta planilha?" e quase sempre "quem mexeu NESTA célula?". A resposta
       * continua a um clique direito na célula (ver `MenuContexto`), que é
       * onde a pergunta nasce — e o botão do cabeçalho custava a largura de um
       * atalho para abrir uma lista que ninguém lia de cabo a rabo.
       *
       * O LINK DO CLIENTE deixou de ser um botão porque deixou de ser um ato:
       * escrever o nome numa coluna de Cliente já emite o link (ver
       * `salvarCelula`). Pedir um clique a mais para a consequência óbvia do
       * que a pessoa acabou de digitar era trabalho sem decisão. Os links
       * emitidos ficam na aba Produções, onde se copia, se abre e se revoga.
       */}
      <button
        onClick={() => setAberta(null)}
        title="Ver todas as produções"
        className="focus-ring flex h-8 items-center gap-1.5 rounded-xl border border-fg/[0.1] px-2.5 text-[12px] text-mist transition-colors hover:bg-fg/[0.05] hover:text-ink"
      >
        <ArrowLeft size={14} />
        <span className="hidden md:inline">Produções</span>
      </button>
    </>
  );

  return (
    <PageScreen
      icon={<Table2 className="h-5 w-5" />}
      /* O nome da planilha É o título agora. Antes o título dizia "Planilhas" —
         o módulo, que a barra lateral já indica — e o nome ficava numa linha
         abaixo. Quem está dentro de uma planilha quer ver qual. */
      title={aberta.nome}
      subtitle={rotuloPeriodo(pagina)}
      actions={acoes}
    >
      {/* Renomear continua por duplo clique, agora no cabeçalho da tabela. */}
      {renomeando?.alvo === "planilha" && (
        <div className="flex shrink-0 items-center gap-2">{campoRenome("w-56 text-[14px]")}</div>
      )}

      {/* A planilha ocupa todo o espaço restante do outlet. */}
      <div className="card glass-sheen flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* A barra fica FORA do quadro que rola: os controles cabem em qualquer
            largura, e arrastá-los junto com as colunas faria as abas saírem da
            tela quando alguém rolasse a planilha para o lado. */}
        <BarraFiltros navegacao={abasSecao} pagina={abasSecao ? undefined : { label: aberta.nome, icon: <Table2 className="h-3.5 w-3.5" /> }}>
          {controlesSecao}

          {/*
           * Qual coluna faz as raias.
           *
           * Só no quadro, e só com mais de uma coluna de seleção: na grade ele
           * não decide nada, e com uma coluna só não há o que escolher — o
           * seletor ocuparia largura para não perguntar nada.
           */}
          {visao === "backlog" && colunasEtapa.length > 1 && (
            <select
              value={etapa?.id ?? ""}
              onChange={(e) => trocarColunaEtapa(e.target.value)}
              title="Qual coluna vira as raias do quadro"
              aria-label="Coluna que agrupa o quadro"
              className="focus-ring h-[38px] shrink-0 rounded-xl border border-fg/[0.1] bg-transparent px-3 text-[12.5px] text-ink outline-none"
            >
              {colunasEtapa.map((c) => (
                <option key={c.id} value={c.id}>
                  Agrupar por {c.nome}
                </option>
              ))}
            </select>
          )}

          {/*
           * As colunas se mexem nas DUAS visões.
           *
           * Na grade dá para clicar no rótulo de cada uma, mas no quadro não
           * existe rótulo para clicar — e sem esta porta, mudar uma alternativa
           * de etapa exigiria voltar para a tabela. Este é o mesmo painel do
           * "+" do cabeçalho da grade: criar, renomear, remover, escolher
           * alternativas e cores, e dizer quem edita o quê.
           */}
          {ehRoot && (
            <button
              type="button"
              onClick={() => setConfigAberta(true)}
              title="Criar, renomear e configurar as colunas desta produção"
              className="focus-ring flex h-[38px] shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-fg/[0.1] px-3 text-[12px] text-mist transition-colors hover:text-ink"
            >
              <Columns3 size={14} />
              <span className="hidden sm:inline">Colunas</span>
            </button>
          )}

          {/*
           * Planilha ⇄ Backlog: a MESMA produção, em duas leituras.
           *
           * Não é um filtro nem um destino — é a forma de olhar o que já está
           * aberto. Por isso mora aqui, na ponta dos controles, e não nas abas
           * da esquerda, que trocam de tela.
           */}
          <div className="glass-subtle flex h-[38px] shrink-0 items-center gap-1 rounded-xl p-1">
            {(
              [
                { id: "planilha", label: "Tabela", icone: <Table2 size={14} /> },
                { id: "backlog", label: "Backlog", icone: <KanbanSquare size={14} /> },
              ] as const
            ).map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => trocarVisao(v.id)}
                aria-pressed={visao === v.id}
                title={v.id === "planilha" ? "Ver como tabela" : "Ver como quadro de etapas"}
                className={`focus-ring flex h-full cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[12px] transition-colors ${
                  visao === v.id ? "bg-accent text-white shadow-glow" : "text-mist hover:text-ink"
                }`}
              >
                {v.icone}
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            ))}
          </div>
        </BarraFiltros>

        <div className="min-h-0 flex-1 overflow-auto">
        {colunas.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-[14px] text-ink">Esta produção ainda não tem colunas</p>
            <p className="max-w-sm text-[12.5px] leading-relaxed text-faint">Defina o que cada coluna representa e de que tipo ela é — texto, seleção, data, imagem.</p>

            {ehRoot ? (
              <button onClick={() => setConfigAberta(true)} className="mt-1 rounded-xl bg-accent px-5 py-2 text-[13px] text-white">
                Criar colunas
              </button>
            ) : (
              /* Quem não é root vê o motivo, e não um vazio sem explicação. */
              <p className="mt-1 text-[12px] text-faint">Peça ao responsável pela conta para configurar as colunas.</p>
            )}
          </div>
        ) : visao === "backlog" ? (
          /*
           * O quadro é a MESMA página que a tabela mostra — os mesmos
           * `pagina.registros`, já carregados, sem uma segunda busca e sem uma
           * segunda tabela no banco. Trocar de visão não move nem copia nada.
           */
          !etapa ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl border border-fg/[0.08] bg-fg/[0.03] text-faint">
                <KanbanSquare size={22} />
              </span>
              <p className="text-[14px] text-ink">Esta produção ainda não tem coluna de etapa</p>
              <p className="max-w-sm text-[12.5px] leading-relaxed text-faint">
                O quadro empilha as linhas por uma coluna do tipo <strong className="text-mist">Seleção</strong> — as
                alternativas dela viram as raias. Crie uma (Etapa, Status, Situação) e as mesmas linhas desta produção
                aparecem aqui como cartões.
              </p>

              {ehRoot ? (
                <button
                  onClick={() => setConfigAberta(true)}
                  className="mt-1 flex items-center gap-1.5 rounded-xl bg-accent px-5 py-2 text-[13px] text-white transition-all hover:brightness-110"
                >
                  <Columns3 size={15} /> Criar coluna de etapa
                </button>
              ) : (
                <p className="mt-1 text-[12px] text-faint">Peça ao responsável pela conta para criar a coluna.</p>
              )}
            </div>
          ) : (
            <QuadroPlanilha
              colunas={colunas}
              registros={pagina?.registros ?? []}
              etapa={etapa}
              colunaPrazoId={aberta.coluna_prazo_fk}
              /* Mesma regra da célula: coluna restrita não se edita arrastando
                 — seria um jeito de contornar a permissão pelo mouse. */
              podeMover={podeEditar(etapa)}
              onMover={moverNoQuadro}
              onCriar={podeEditar(etapa) ? criarNaRaia : undefined}
              onExcluir={excluirLinha}
            />
          )
        ) : (
          <table className="border-separate border-spacing-0 text-left" style={{ minWidth: larguraTotal }}>
            <thead className="sticky top-0 z-20">
              <tr>
                {/* Número da linha, como em planilha de verdade. Gruda na
                    esquerda para não se perder o eixo ao rolar na horizontal. */}
                <th className="sticky left-0 z-30 w-12 border-b border-r border-fg/[0.07] bg-surface-raised px-2 py-2.5 text-center text-[10px] font-medium text-faint">#</th>

                {colunas.map((c) => {
                  const restrita = (c.permissoes?.length ?? 0) > 0;
                  const interna = c.publico === false;

                  return (
                    <th
                      key={c.id}
                      style={{ minWidth: c.largura ?? 180 }}
                      className="relative border-b border-r border-fg/[0.07] bg-surface-raised p-0 font-medium"
                    >
                      {/*
                       * A configuração da coluna mora NO cabeçalho dela.
                       *
                       * Era um modal com a lista das treze colunas dentro: para
                       * mexer em "Prazo" era preciso abrir, achar no meio e
                       * voltar. Aqui o alvo é o próprio rótulo — clicou, é
                       * daquela.
                       */}
                      {/* Configurar coluna é do root, igual ao painel de
                          Configurações — renomear e excluir mudam a estrutura
                          que a equipe inteira preenche. */}
                      <button
                        onClick={() => ehRoot && setMenuColuna(menuColuna === c.id ? null : c.id)}
                        disabled={!ehRoot}
                        title={ehRoot ? "Configurar coluna" : undefined}
                        className={`flex w-full items-center gap-1.5 px-3 py-2.5 text-left text-[11px] uppercase tracking-[0.07em] text-mist transition-colors ${
                          ehRoot ? "hover:bg-fg/[0.04] hover:text-ink" : "cursor-default"
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">{c.nome}</span>

                        {/* Os dois estados que mudam o comportamento da coluna
                            ficam visíveis para TODO MUNDO, não só para o root:
                            descobrir que uma coluna é restrita só ao tentar
                            editá-la é tarde. */}
                        {interna && <EyeOff size={11} className="shrink-0 text-faint" />}
                        {restrita && <Lock size={11} className="shrink-0 text-accent-soft" />}

                        {ehRoot && <ChevronDown size={11} className={`shrink-0 text-faint transition-transform ${menuColuna === c.id ? "rotate-180" : ""}`} />}
                      </button>

                      {menuColuna === c.id && ehRoot && (
                        <MenuColuna
                          coluna={c}
                          colunas={colunas}
                          funcionarios={funcionarios}
                          ehRoot={ehRoot}
                          onFechar={() => setMenuColuna(null)}
                          onRenomear={() => renomearColuna(c)}
                          onExcluir={() => removerColuna(c)}
                          onAlternarPermissao={(fid) => alternarPermissao(c, fid)}
                          onAlternarPublico={(pub) => alternarPublico(c, pub)}
                          onDefinirDataMinima={(alvo) => definirDataMinima(c, alvo)}
                        />
                      )}
                    </th>
                  );
                })}

                {/* Criar coluna virou a última do cabeçalho — o mesmo gesto de
                    "adicionar linha" no fim da tabela, no outro eixo. */}
                <th className="w-10 border-b border-fg/[0.07] bg-surface-raised p-0">
                  {ehRoot && (
                    <button
                      onClick={() => setConfigAberta(true)}
                      title="Configurações da produção"
                      aria-label="Configurações da produção"
                      className="grid h-full w-full place-items-center py-2.5 text-faint transition-colors hover:bg-fg/[0.04] hover:text-accent-soft"
                    >
                      <Plus size={14} />
                    </button>
                  )}
                </th>
              </tr>
            </thead>

            <tbody>
              {(pagina?.registros ?? []).map((r, i) => (
                <tr key={r.id} className="group transition-colors hover:bg-fg/[0.02]">
                  {/* O número da linha também abre o menu: as ações de LINHA
                      (copiar a de cima, excluir, histórico) são as mesmas, e
                      quem quer a linha inteira mira o número, não uma célula
                      qualquer dela. */}
                  <td
                    onContextMenu={(e) => abrirMenuCelula(e, r.id, colunas[0], i + 1, "linha")}
                    className="sticky left-0 z-10 cursor-context-menu border-b border-r border-fg/[0.05] bg-surface px-2 py-1 text-center text-[11px] tabular-nums text-faint transition-colors group-hover:text-mist"
                  >
                    {i + 1}
                  </td>

                  {colunas.map((c) => (
                    <td
                      key={c.id}
                      onContextMenu={(e) => abrirMenuCelula(e, r.id, c, i + 1)}
                      className="border-b border-r border-fg/[0.05] p-0 align-top"
                    >
                      <Celula coluna={c} valor={r.valores[c.id]} editavel={podeEditar(c)} onSalvar={(v) => salvarCelula(r.id, c.id, v)} />
                    </td>
                  ))}

                  <td className="border-b border-fg/[0.05] px-1 text-center">
                    <button
                      onClick={() => excluirLinha(r.id)}
                      aria-label={`Excluir linha ${i + 1}`}
                      className="text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}

              {/* A última linha É o botão — como em planilha de verdade, onde se
                  desce até o fim e continua escrevendo. Sem teto: cada clique
                  acrescenta mais dez. */}
              <tr>
                <td colSpan={colunas.length + 2} className="border-b border-fg/[0.05] p-0">
                  <button
                    onClick={novaLinha}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[12.5px] text-faint transition-colors hover:bg-fg/[0.03] hover:text-accent-soft"
                  >
                    <Plus size={14} />
                    Adicionar linha
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        )}
        </div>
      </div>

      {/*
        * Rodapé: as PÁGINAS desta planilha — Agosto, Setembro, Outubro.
        *
        * Não são as outras planilhas: Camisaria e Estamparia são coisas
        * separadas, e trocar entre elas é sair desta tela. O que se troca aqui
        * é o período dentro da mesma planilha, que é exatamente o papel das
        * abas de baixo em qualquer planilha do mundo.
        *
        * Antes só existiam as setas "← Hoje →", que respondem um passo por
        * clique e às cegas: achar um mês de três atrás custava seis cliques
        * sem saber se havia algo lá. A lista vem do banco já agrupada pela
        * periodicidade do modelo — na Estamparia, que é diária, cada dia é uma
        * aba; na Camisaria, mensal, cada mês é uma.
        */}
      <div className="mt-2 flex shrink-0 items-center gap-1 overflow-x-auto border-t border-fg/[0.07] pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className="shrink-0 pr-1 text-[10px] uppercase tracking-[0.12em] text-faint">Páginas</span>

        {periodos.map((p) => {
          const atual = pagina?.de === p.de;

          if (renomeando?.alvo === "pagina" && renomeando.chave === p.de) {
            return <span key={p.de}>{campoRenome("w-32 text-[12px]")}</span>;
          }

          return (
            <button
              key={p.de}
              onClick={() => setDataAtual(p.de)}
              /* Renomear a página só depois de abri-la seria um clique a mais
                 para uma ação que já custa dois. O duplo clique funciona em
                 qualquer aba, aberta ou não. */
              onDoubleClick={() => setRenomeando({ alvo: "pagina", chave: p.de, valor: p.nome ?? "" })}
              title={`${p.linhas} ${p.linhas === 1 ? "linha" : "linhas"} · clique duas vezes para renomear`}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] transition-colors ${p.nome ? "" : "capitalize"} ${
                atual ? "bg-accent/[0.14] text-accent-soft ring-1 ring-inset ring-accent/25" : "text-mist hover:bg-fg/[0.05] hover:text-ink"
              }`}
            >
              {p.nome || rotuloAba(p.de, pagina?.periodicidade)}
            </button>
          );
        })}

        {/* O período aberto ainda sem nenhuma linha não está na lista do banco
            — mas a pessoa está olhando para ele, então ele precisa de aba. */}
        {pagina && !periodos.some((p) => p.de === pagina.de) && (
          <span className="shrink-0 rounded-lg bg-accent/[0.14] px-3 py-1.5 text-[12px] capitalize text-accent-soft ring-1 ring-inset ring-accent/25">
            {rotuloAba(pagina.de, pagina.periodicidade)}
          </span>
        )}

        <span className="mx-1 h-4 w-px shrink-0 bg-fg/[0.1]" />

        {/* "+" abre o período SEGUINTE ao mais recente, em branco. É como a
            página de setembro nasce quando agosto acaba. */}
        <button
          onClick={proximaPagina}
          title="Abrir o próximo período em branco"
          className="focus-ring flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] text-mist transition-colors hover:text-ink"
        >
          <Plus size={13} />
          Página
        </button>

        <button
          onClick={duplicarAtual}
          disabled={salvando}
          title={`Criar outra produção com as mesmas colunas de ${aberta.nome}`}
          aria-label="Duplicar produção"
          className="focus-ring ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-lg text-mist transition-colors hover:bg-fg/[0.05] hover:text-ink disabled:opacity-40"
        >
          <Copy size={13} />
        </button>
      </div>

      {/* Histórico — leitura, sem ação: a planilha não desfaz mudança, ela
          responde quem fez. Voltar o valor é digitar de novo, e isso a pessoa
          já sabe fazer. */}
      <Modal
        open={!!historicoAlvo}
        onClose={() => setHistoricoAlvo(null)}
        title="Histórico"
        subtitle={historicoAlvo?.rotulo ?? aberta.nome}
        size="lg"
      >
        {carregandoHistorico ? (
          <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-mist">
            <Loader2 size={15} className="animate-spin text-accent" />
            Carregando...
          </div>
        ) : historico.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-[13px] text-faint">
              {historicoAlvo?.coluna ? "Esta célula nunca foi alterada." : "Nenhuma alteração registrada ainda."}
            </p>

            {/* Sem esta saída, quem chegou pelo botão direito e caiu no vazio
                teria de fechar e procurar o botão do histórico geral. */}
            {historicoAlvo?.coluna && (
              <button onClick={() => abrirHistorico()} className="mt-2 text-[12px] text-accent-soft hover:underline">
                Ver o histórico da produção inteira
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-fg/[0.06]">
            {historico.map((h) => {
              const { titulo, detalhe } = descreverEvento(h);
              const celula = h.acao === "CELULA_ALTERADA";

              return (
                <div key={h.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2.5">
                  <span className="text-[12.5px] text-ink">{titulo}</span>

                  {detalhe &&
                    (celula ? (
                      <span className="flex items-baseline gap-1.5 text-[12px]">
                        <span className="text-mist line-through decoration-fg/25">{h.valor_antes || "vazio"}</span>
                        <span className="text-faint">→</span>
                        <span className="text-accent-soft">{h.valor_depois || "vazio"}</span>
                      </span>
                    ) : (
                      <span className="text-[12px] text-mist">{detalhe}</span>
                    ))}

                  <span className="ml-auto text-[11px] text-faint">
                    {h.usuario_nome ?? "—"} · {new Date(h.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      {menuCelula && (
        <MenuContexto
          x={menuCelula.x}
          y={menuCelula.y}
          titulo={menuCelula.alvo === "linha" ? `Linha ${menuCelula.linha}` : `${menuCelula.coluna.nome} · linha ${menuCelula.linha}`}
          onFechar={() => setMenuCelula(null)}
          itens={[
            ...(menuCelula.alvo === "celula"
              ? [
                  {
                    id: "hist-celula",
                    rotulo: "Histórico desta célula",
                    icone: History,
                    onClick: () =>
                      abrirHistorico({
                        registro: menuCelula.registroId,
                        coluna: menuCelula.coluna.id,
                        rotulo: `${menuCelula.coluna.nome} · linha ${menuCelula.linha}`,
                      }),
                  },
                ]
              : []),
            {
              id: "hist-linha",
              rotulo: "Histórico da linha",
              icone: Rows3,
              onClick: () => abrirHistorico({ registro: menuCelula.registroId, rotulo: `Linha ${menuCelula.linha}` }),
            },
            {
              id: "copiar-cima",
              rotulo: "Copiar a linha de cima",
              icone: Copy,
              separar: true,
              /* Sem linha acima não há o que copiar — e "linha 1" é justamente
                 onde o item apareceria mais vezes se ficasse ativo. */
              desabilitado: menuCelula.linha <= 1,
              onClick: () => copiarDeCima(menuCelula.registroId),
            },
            ...(menuCelula.alvo === "celula"
              ? [
                  {
                    id: "limpar",
                    rotulo: "Limpar célula",
                    icone: Eraser,
                    /* Coluna restrita não é limpável por quem não pode editá-la
                       — o servidor recusaria, e oferecer a ação seria mentira. */
                    desabilitado: !podeEditar(menuCelula.coluna),
                    onClick: () => salvarCelula(menuCelula.registroId, menuCelula.coluna.id, null),
                  },
                  {
                    id: "config",
                    rotulo: "Configurar coluna",
                    icone: Settings2,
                    desabilitado: !ehRoot,
                    onClick: () => setMenuColuna(menuCelula.coluna.id),
                  },
                ]
              : []),
            {
              id: "excluir",
              rotulo: `Excluir linha ${menuCelula.linha}`,
              icone: Trash2,
              separar: true,
              perigo: true,
              onClick: () => excluirLinha(menuCelula.registroId),
            },
          ]}
        />
      )}

      {/*
       * Configurações da planilha — só o root.
       *
       * Era "Colunas", aberto a todo gestor. Virou o painel onde se decide QUEM
       * mexe em quê, e isso é o dono limitando a própria equipe: `ehGestor`
       * inclui o cargo ADMIN, que o dono distribui para quem toca a operação.
       * Um ADMIN com acesso a esta tela se incluiria em qualquer coluna, e a
       * restrição deixaria de restringir.
       *
       * O atalho por coluna (menu do cabeçalho) mostra o mesmo e obedece à
       * mesma regra — os dois chamam `alternarPermissao`, então não há como um
       * dizer uma coisa e o outro dizer outra.
       */}
      <Modal open={configAberta && ehRoot} onClose={() => setConfigAberta(false)} title="Configurações" subtitle={aberta.nome}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            {colunas.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-xl border border-fg/[0.07] px-3 py-2 text-[13px] text-ink">
                <span className="min-w-0 flex-1 truncate">{c.nome}</span>
                <span className="shrink-0 rounded-full bg-fg/[0.06] px-2 py-0.5 text-[10.5px] text-mist">{TIPOS.find((t) => t.id === c.tipo)?.label ?? c.tipo}</span>

                {/* Marcar a coluna de prazo aqui: é ela que o sistema usa para
                    saber o que está atrasado, com o nome que você deu. */}
                {c.tipo === "DATA" && (
                  <button
                    onClick={async () => {
                      await PlanilhaService.alterarModelo(aberta.id, { colunaPrazoId: c.id });
                      setAberta({ ...aberta, coluna_prazo_fk: c.id });
                    }}
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] transition-colors ${aberta.coluna_prazo_fk === c.id ? "bg-accent/20 text-accent-soft" : "text-muted hover:text-mist"}`}
                  >
                    {aberta.coluna_prazo_fk === c.id ? "é o prazo" : "usar como prazo"}
                  </button>
                )}

                <button onClick={() => removerColuna(c)} aria-label={`Remover ${c.nome}`} className="shrink-0 text-muted transition-colors hover:text-danger">
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>

          {/* Detalhe de cada coluna: alternativas com cor e quem pode editar. */}
          {colunas.map((c) => (
            <div key={"cfg-" + c.id} className="flex flex-col gap-2 rounded-xl border border-fg/[0.06] bg-fg/[0.02] p-3">
              <p className="text-[11.5px] text-ink">{c.nome}</p>

              {c.tipo === "SELECAO" && listaDeOpcoes(c).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {listaDeOpcoes(c).map((op, i) => (
                    <span key={op.valor} className="inline-flex items-center gap-1 rounded-full border border-fg/[0.1] px-2 py-0.5 text-[11px] text-mist">
                      {/* `type="color"` abre o seletor nativo — qualquer cor,
                          sem componente extra no bundle. */}
                      <label className="relative h-3 w-3 shrink-0 cursor-pointer rounded-full ring-1 ring-fg/20" style={{ background: op.cor ?? "transparent" }} title={"Cor de " + op.valor}>
                        <input
                          type="color"
                          value={op.cor ?? "#8d70ff"}
                          onChange={(e) => definirCor(c, i, e.target.value)}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                          aria-label={"Cor de " + op.valor}
                        />
                      </label>
                      {op.valor}
                      <button onClick={() => definirPadrao(c, op.valor)} title="Definir como padrao" className={c.valor_padrao === op.valor ? "text-accent-soft" : "text-muted hover:text-accent-soft"}>
                        &#9733;
                      </button>
                      <button onClick={() => removerOpcao(c, i)} aria-label={"Remover " + op.valor} className="text-muted hover:text-danger">
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {funcionarios.length > 0 && (
                <div>
                  <p className="mb-1 text-[10.5px] text-faint">
                    {c.permissoes?.length ? "So estas pessoas editam:" : "Todos podem editar. Marque para restringir:"}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {funcionarios.map((f) => {
                      const on = c.permissoes?.includes(String(f.id));

                      return (
                        <button
                          key={f.id}
                          onClick={() => alternarPermissao(c, String(f.id))}
                          className={"rounded-full border px-2 py-0.5 text-[11px] transition-colors " + (on ? "border-accent bg-accent/[0.14] text-accent-soft" : "border-fg/[0.1] text-mist")}
                        >
                          {f.nome}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}

          <div className="flex flex-col gap-2 border-t border-fg/[0.07] pt-3">
            <input
              value={formColuna.nome}
              onChange={(e) => setFormColuna({ ...formColuna, nome: e.target.value })}
              placeholder="Nome da coluna (ex.: Etapa)"
              className="w-full rounded-xl border border-fg/[0.08] bg-fg/[0.03] px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent/60"
            />

            <div className="grid grid-cols-4 gap-1.5">
              {TIPOS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setFormColuna({ ...formColuna, tipo: t.id })}
                  className={`rounded-lg border py-1.5 text-[11px] transition-colors ${formColuna.tipo === t.id ? "border-accent bg-accent/[0.12] text-accent-soft" : "border-fg/[0.1] text-mist"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {formColuna.tipo === "SELECAO" && (
              <input
                value={formColuna.opcoes}
                onChange={(e) => setFormColuna({ ...formColuna, opcoes: e.target.value })}
                placeholder="Alternativas separadas por vírgula"
                className="w-full rounded-xl border border-fg/[0.08] bg-fg/[0.03] px-3.5 py-2.5 text-[13px] text-ink outline-none focus:border-accent/60"
              />
            )}

            <input
              value={formColuna.valorPadrao}
              onChange={(e) => setFormColuna({ ...formColuna, valorPadrao: e.target.value })}
              placeholder="Valor padrao (opcional) - ja vem preenchido na linha nova"
              className="w-full rounded-xl border border-fg/[0.08] bg-fg/[0.03] px-3.5 py-2.5 text-[13px] text-ink outline-none focus:border-accent/60"
            />

            <button onClick={criarColuna} disabled={salvando || !formColuna.nome.trim()} className="min-h-[42px] self-start rounded-xl bg-accent px-5 text-[13px] text-white disabled:opacity-40">
              Adicionar coluna
            </button>
          </div>
        </div>
      </Modal>
    </PageScreen>
  );
};

export default PlanilhasPage;
