import axios from "axios";
import { create } from "zustand";

import useAuth from "@/features/auth/store/auth.store";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";

/**
 * A FILA DE ENVIO — o que garante que a venda confirmada na tela chega ao
 * servidor, mesmo que a internet caia no meio.
 *
 * ---------------------------------------------------------------------------
 * O problema
 * ---------------------------------------------------------------------------
 * A tela é otimista: "Nota criada!" sai no clique e a gravação corre por
 * baixo. Numa loja com internet ruim, uma em cada dez gravações pode não
 * chegar — e uma venda que a tela disse que existia e o servidor nunca viu é
 * pior que uma espera: some sem ninguém perceber.
 *
 * ---------------------------------------------------------------------------
 * Como a fila resolve
 * ---------------------------------------------------------------------------
 *   • cada gravação vira uma TAREFA guardada no aparelho (`localStorage`):
 *     fechar a aba, dar F5 ou o computador desligar não a perde;
 *   • as tarefas vão uma por vez, NA ORDEM em que nasceram — o pagamento só
 *     sai depois da nota que ele paga;
 *   • falha de CONEXÃO (sem resposta, servidor fora do ar) não descarta nada:
 *     a fila espera e tenta de novo — ao voltar a internet, ao voltar para a
 *     aba e de tempos em tempos;
 *   • RECUSA do servidor (falta de estoque, dado inválido) não adianta
 *     repetir: a tarefa sai da fila e o aviso diz qual venda e por quê.
 *
 * Repetir não duplica: a nota e o recebimento levam um id gerado AQUI, e o
 * servidor reconhece o reenvio (ver `novoPedidoDto.id` na API).
 */

export type Tarefa = {
  id: string;
  /** Qual executor roda esta tarefa — ver `registrarExecutor`. */
  tipo: string;
  dados: unknown;
  /** O que a tarefa é, em português — vai no aviso se ela for recusada. */
  descricao: string;
  /** A fila de uma empresa nunca é enviada com a sessão de outra. */
  empresa: string | null;
  /** Se a tarefa de que esta depende for recusada, esta sai junto. */
  depende?: string;
  criadaEm: number;
  tentativas: number;
};

type Executor = (dados: never) => Promise<void>;

export type Recusa = { tarefa: Tarefa; titulo: string; mensagem: string; erro: unknown };

const CHAVE = "codeex-flow:fila-envio:v1";

const ler = (): Tarefa[] => {
  try {
    const salvas = JSON.parse(localStorage.getItem(CHAVE) ?? "[]");
    return Array.isArray(salvas) ? salvas : [];
  } catch {
    return [];
  }
};

const gravar = (tarefas: Tarefa[]) => {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(tarefas));
  } catch {
    /* Armazenamento cheio ou bloqueado: a fila segue na memória da aba. */
  }
};

type Estado = {
  tarefas: Tarefa[];
  /** A última tentativa falhou por conexão — há o que esperar. */
  semConexao: boolean;
};

export const useFilaEnvio = create<Estado>(() => ({ tarefas: ler(), semConexao: false }));

const atualizar = (mudar: (tarefas: Tarefa[]) => Tarefa[]) => {
  const tarefas = mudar(useFilaEnvio.getState().tarefas);

  useFilaEnvio.setState({ tarefas });
  gravar(tarefas);
};

const executores = new Map<string, Executor>();

/** Registra quem sabe enviar um tipo de tarefa. Chamado na carga do módulo. */
export const registrarExecutor = <T>(tipo: string, executor: (dados: T) => Promise<void>) => {
  executores.set(tipo, executor as Executor);
};

/* Quem está esperando cada tarefa nesta aba (a nota aberta, por exemplo). */
const esperando = new Map<string, { resolver: () => void; rejeitar: (erro: unknown) => void }[]>();

const ouvintesDeRecusa = new Set<(r: Recusa) => void>();

/** Avisos de recusa que ninguém nesta tela está esperando — ver `AvisosDaFila`. */
export const aoRecusar = (ouvinte: (r: Recusa) => void) => {
  ouvintesDeRecusa.add(ouvinte);
  return () => {
    ouvintesDeRecusa.delete(ouvinte);
  };
};

const empresaAtual = () => useAuth.getState().user?.codigoEmpresa ?? null;

/** Gera um id no formato do banco — é ele que torna o reenvio seguro. */
export const novoId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
        (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16),
      );

/** Põe uma gravação na fila e já tenta enviá-la. Devolve o id da tarefa. */
export const enfileirar = (tipo: string, dados: unknown, descricao: string, depende?: string): string => {
  const tarefa: Tarefa = { id: novoId(), tipo, dados, descricao, empresa: empresaAtual(), depende, criadaEm: Date.now(), tentativas: 0 };

  atualizar((ts) => [...ts, tarefa]);
  void processar();

  return tarefa.id;
};

/**
 * Espera a tarefa chegar ao servidor. Resolve quando ela é gravada; rejeita
 * só se o servidor a RECUSAR — sem conexão, simplesmente continua esperando.
 */
export const aguardar = (idTarefa: string): Promise<void> =>
  new Promise((resolver, rejeitar) => {
    if (!useFilaEnvio.getState().tarefas.some((t) => t.id === idTarefa)) return resolver();

    esperando.set(idTarefa, [...(esperando.get(idTarefa) ?? []), { resolver, rejeitar }]);
  });

/**
 * Falha que passa: sem resposta (internet caiu, servidor fora do ar), tempo
 * esgotado, sessão a renovar, sobrecarga. Tudo o mais é o servidor dizendo
 * "não" — e repetir daria o mesmo "não".
 */
const ehFalhaDeConexao = (erro: unknown): boolean => {
  if (!axios.isAxiosError(erro)) return false;
  if (!erro.response) return true;

  return [401, 408, 429, 502, 503, 504].includes(erro.response.status);
};

let processando = false;
let proxima: ReturnType<typeof setTimeout> | null = null;

const agendar = (ms: number) => {
  if (proxima) clearTimeout(proxima);
  proxima = setTimeout(() => void processar(), ms);
};

const concluir = (tarefa: Tarefa) => {
  atualizar((ts) => ts.filter((t) => t.id !== tarefa.id));
  esperando.get(tarefa.id)?.forEach((e) => e.resolver());
  esperando.delete(tarefa.id);
};

const recusar = (tarefa: Tarefa, erro: unknown) => {
  /* Quem dependia dela sai junto — o pagamento de uma nota recusada só
     traria um segundo aviso, "nota não encontrada", sobre o mesmo problema. */
  const removidas = new Set([tarefa.id]);

  for (const t of useFilaEnvio.getState().tarefas) if (t.depende && removidas.has(t.depende)) removidas.add(t.id);

  atualizar((ts) => ts.filter((t) => !removidas.has(t.id)));

  let alguemEsperava = false;

  for (const id of removidas) {
    const lista = esperando.get(id);

    if (lista?.length) alguemEsperava = true;
    lista?.forEach((e) => e.rejeitar(erro));
    esperando.delete(id);
  }

  /* Ninguém nesta tela esperava (a nota já foi fechada, ou a tarefa veio de
     antes do F5): o aviso vai para a camada global. */
  if (!alguemEsperava) {
    const recusa: Recusa = {
      tarefa,
      titulo: getErrorTitle(erro),
      mensagem: `${tarefa.descricao}: ${extractErrorMessage(erro, "o servidor recusou a gravação.")}`,
      erro,
    };

    ouvintesDeRecusa.forEach((o) => o(recusa));
  }
};

/** Envia o que estiver na fila, uma tarefa por vez, na ordem. */
export const processar = async () => {
  if (processando) return;

  processando = true;

  try {
    for (;;) {
      const empresa = empresaAtual();

      /* Sem sessão não há com que enviar: a fila espera o próximo login. */
      if (!empresa) break;

      const tarefa = useFilaEnvio.getState().tarefas.find((t) => t.empresa === empresa);

      if (!tarefa) {
        useFilaEnvio.setState({ semConexao: false });
        break;
      }

      const executor = executores.get(tarefa.tipo);

      /* Tarefa de uma versão antiga, cujo tipo não existe mais: segurá-la
         travaria tudo o que veio depois. */
      if (!executor) {
        concluir(tarefa);
        continue;
      }

      try {
        await executor(tarefa.dados as never);
        concluir(tarefa);
        useFilaEnvio.setState({ semConexao: false });
      } catch (erro) {
        if (ehFalhaDeConexao(erro)) {
          const tentativas = tarefa.tentativas + 1;

          atualizar((ts) => ts.map((t) => (t.id === tarefa.id ? { ...t, tentativas } : t)));
          useFilaEnvio.setState({ semConexao: true });

          /* 2s, 4s, 8s, 16s e daí a cada 30s — e na hora em que a internet
             voltar, pelo evento `online`, sem esperar o relógio. */
          agendar(Math.min(30_000, 2_000 * 2 ** Math.min(tentativas - 1, 4)));
          break;
        }

        recusar(tarefa, erro);
      }
    }
  } finally {
    processando = false;
  }
};

let iniciada = false;

/** Liga os gatilhos da fila. Uma vez, na carga do app. */
export const iniciarFila = () => {
  if (iniciada || typeof window === "undefined") return;

  iniciada = true;

  window.addEventListener("online", () => void processar());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void processar();
  });

  /* O login muda a empresa da sessão: a fila dela pode andar agora. */
  useAuth.subscribe((estado, anterior) => {
    if (estado.user?.codigoEmpresa !== anterior.user?.codigoEmpresa) void processar();
  });

  /* Rede de segurança: se algum gatilho falhar, a fila não fica parada. */
  setInterval(() => {
    if (useFilaEnvio.getState().tarefas.length > 0) void processar();
  }, 20_000);

  /* O que sobrou de antes do F5 sai agora. */
  void processar();
};
