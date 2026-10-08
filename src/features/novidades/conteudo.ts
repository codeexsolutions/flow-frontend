/**
 * O que mudou no sistema desde a última vez — mostrado UMA vez, a quem já usa.
 *
 * ---------------------------------------------------------------------------
 * Por que uma tela, e não um aviso no menu
 * ---------------------------------------------------------------------------
 * O trabalho de meses chegava sem nenhum anúncio: a pessoa entrava, encontrava
 * um item novo no menu e descobria (ou não) sozinha. O caso ruim não é a
 * novidade passar despercebida — é a pessoa continuar fazendo à mão o que o
 * sistema passou a fazer por ela, sem nunca saber que podia parar.
 *
 * ---------------------------------------------------------------------------
 * As três regras que evitam isto virar propaganda
 * ---------------------------------------------------------------------------
 *   1. **Uma vez por versão, por pessoa.** Fechou, não volta. Anúncio que
 *      reaparece é anúncio que a pessoa aprende a fechar sem ler — e aí o
 *      próximo, que importava, também some.
 *
 *   2. **Não aparece para quem acabou de chegar.** Quem nunca viu o sistema
 *      recebe o tour, não um changelog: "agora a baixa leva ao extrato" não
 *      significa nada para quem não conhece o extrato de antes.
 *
 *   3. **Só o que muda o dia da pessoa.** Refatoração, mapa de arquitetura e
 *      arrumação de código ficam de fora — quem lê aqui quer saber o que passou
 *      a poder fazer, não o que mexemos por dentro.
 *
 * Para publicar a próxima leva: troque `VERSAO` e reescreva `NOVIDADES`. A
 * versão nova reabre a tela para todo mundo uma vez.
 */

export type TipoNovidade = "novo" | "melhor" | "corrigido";

export type Novidade = {
    tipo: TipoNovidade;
    titulo: string;
    /** Uma ou duas frases, na língua de quem usa — não na nossa. */
    texto: string;
    /** Para onde ir quando a pessoa quiser ver aquilo agora. */
    rota?: string;
};

/**
 * A versão desta leva de novidades.
 *
 * É ela que decide quem já viu: mudou a string, todo mundo vê de novo (uma
 * vez). Não é o `BUILD_ID` de propósito — aquele muda a cada deploy, e um
 * anúncio a cada correção de CSS seria exatamente o que a regra 1 evita.
 */
export const VERSAO = "2026-10";

/** O título da leva, para a tela não abrir com "Novidades" e nada mais. */
export const RESUMO = "Cupom fiscal, Correios e a ordem de serviço saindo da venda";

export const NOVIDADES: Novidade[] = [
    {
        tipo: "novo",
        titulo: "Cupom fiscal da venda",
        texto:
            "A NFC-e sai pelo botão na própria nota. Os dados que fazem o cupom sair (NCM, CSC, "
            + "Inscrição Estadual) ficam na aba Fiscal do PDV, onde a falta deles aparece antes de o "
            + "cliente estar esperando no balcão. Vale para os planos com emissão fiscal.",
        rota: "/pdv",
    },
    {
        tipo: "novo",
        titulo: "Correios dentro do Flow",
        texto:
            "Cote o frete com todas as opções lado a lado, escolha depois de ver o preço, gere a "
            + "etiqueta e acompanhe o rastreio sem sair do sistema. Está no plano Professional.",
        rota: "/correios",
    },
    {
        tipo: "novo",
        titulo: "A ordem de serviço nasce da venda",
        texto:
            "Em Produção › Pedidos aparece o que tem para produzir, com as peças de cada pedido e sem "
            + "valores, e é de lá que você gera a ordem. A ficha foi redesenhada para ler de longe na "
            + "bancada, cabe inteira na tela e leva foto da peça.",
        rota: "/producao",
    },
    {
        tipo: "novo",
        titulo: "\"Este mês\" no seletor de período",
        texto:
            "Um toque e as telas mostram do dia 1 até hoje, mesmo antes da primeira venda do mês.",
    },
    {
        tipo: "melhor",
        titulo: "Baixe o documento em PDF ou em imagem",
        texto:
            "A seta de baixar da nota, do orçamento e da ordem agora pergunta o formato. A imagem "
            + "chega no WhatsApp do cliente como foto, sem pedir leitor de PDF.",
    },
    {
        tipo: "melhor",
        titulo: "Vencimentos ficam no carnê",
        texto:
            "A lista de vendas parou de mostrar só a próxima parcela. Quem paga em cada dia, o total "
            + "do dia e os botões de avisar e dar baixa estão no carnê, num calendário do mês.",
        rota: "/financeiro",
    },
    {
        tipo: "melhor",
        titulo: "Links de acompanhamento de volta",
        texto:
            "Os links que você manda para o cliente acompanhar o pedido ganharam a aba Links, ao lado "
            + "do Kanban: dá para listar, copiar e revogar.",
        rota: "/producao/links",
    },
    {
        tipo: "melhor",
        titulo: "Buscar atualização no celular",
        texto:
            "O botão que traz a versão nova do sistema saiu do fundo das configurações e está no Mais, "
            + "junto com a versão que você tem instalada.",
    },
    {
        tipo: "corrigido",
        titulo: "Saída do caixa no dia certo",
        texto:
            "Uma saída lançada hoje aparecia no dia anterior. Agora ela entra e aparece na data em "
            + "que foi lançada.",
        rota: "/financeiro",
    },
    {
        tipo: "corrigido",
        titulo: "Nota no iPhone com logo e QR do Pix",
        texto:
            "A nota baixada pelo iPhone saía sem a logo e sem o QR do Pix. Os dois voltaram, em "
            + "qualquer navegador do celular.",
    },
    {
        tipo: "corrigido",
        titulo: "Fim do \"Preparando o documento…\" sem fim",
        texto:
            "Abrir a nota, o orçamento ou a ordem às vezes travava nessa mensagem. O documento agora "
            + "abre, e se o navegador bloquear a guia ele é baixado em vez de ficar esperando.",
    },
    {
        tipo: "corrigido",
        titulo: "Pedidos e ordens que passavam da tela",
        texto:
            "As listas de Pedidos e de Ordem de serviço cortavam o que não cabia na janela. Agora "
            + "elas rolam e têm páginas.",
        rota: "/producao/os",
    },
];

/** A chave que guarda quem já viu. Uma por pessoa, uma por versão. */
const marca = (usuarioId?: string) => `codeex-flow-novidades-${VERSAO}-${usuarioId ?? "anon"}`;

export const jaViuNovidades = (usuarioId?: string): boolean => {
    try {
        return localStorage.getItem(marca(usuarioId)) === "1";
    } catch {
        /* Navegador com armazenamento bloqueado: melhor não mostrar do que
           mostrar a cada carga de página. */
        return true;
    }
};

export const marcarNovidadesVistas = (usuarioId?: string): void => {
    try {
        localStorage.setItem(marca(usuarioId), "1");
    } catch {
        /* Sem onde gravar, a tela aparece de novo no próximo acesso. É o pior
           caso aceitável — e é raro. */
    }
};

/** Quantos itens tem a leva, para o rótulo do botão em Meu perfil. */
export const TOTAL_NOVIDADES = NOVIDADES.length;
