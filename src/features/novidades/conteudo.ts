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
export const VERSAO = "2026-09";

/** O título da leva, para a tela não abrir com "Novidades" e nada mais. */
export const RESUMO = "WhatsApp, financeiro mais solto e a sua assinatura";

export const NOVIDADES: Novidade[] = [
    {
        tipo: "novo",
        titulo: "WhatsApp da loja dentro do Flow",
        texto:
            "Conecte o número da loja e atenda por aqui: caixa de entrada, funil de atendimento, "
            + "áudio, foto e documento na conversa. A ficha do cliente, as vendas e as produções dele "
            + "aparecem ao lado da conversa — e quem ainda não é cadastrado vira cliente em um clique. "
            + "Está em versão de testes, e a tela avisa isso.",
        rota: "/whatsapp",
    },
    {
        tipo: "novo",
        titulo: "Como você quer ser chamado",
        texto:
            "Em Meu perfil dá para escolher o nome que assina o que você manda pelo WhatsApp da loja. "
            + "Sem isso o sistema chutava o primeiro nome do cadastro — e errava com quem é conhecido "
            + "pelo apelido ou pelo sobrenome.",
        rota: "/configuracoes/perfil",
    },
    {
        tipo: "novo",
        titulo: "A página do seu cliente com a sua marca",
        texto:
            "O link que o cliente abre para acompanhar o pedido entra com a logo, a cor e o domínio da "
            + "sua loja — e pode ser instalado como aplicativo no celular dele.",
    },
    {
        tipo: "melhor",
        titulo: "A baixa leva direto ao extrato",
        texto:
            "Deu baixa numa movimentação? O sistema abre o extrato no lançamento certo, em vez de "
            + "deixar você procurar. E o que foi lançado errado agora vai para a lixeira, com volta.",
        rota: "/financeiro",
    },
    {
        tipo: "melhor",
        titulo: "Nota, recibo e orçamento baixam igual",
        texto:
            "Os três botões de download passaram a se comportar do mesmo jeito, com o mesmo nome de "
            + "arquivo e a mesma qualidade de imagem — inclusive no celular.",
    },
    {
        tipo: "melhor",
        titulo: "A planilha da produção sem a caixa de \"Salvando…\"",
        texto:
            "O aviso que piscava a cada tecla digitada saiu. O que você escreve continua sendo salvo "
            + "sozinho, só que sem tirar a sua atenção da linha.",
        rota: "/producao/kanban",
    },
    {
        tipo: "corrigido",
        titulo: "Remover pagamento de uma nota",
        texto:
            "Um pagamento lançado por engano travava a nota inteira. Agora ele sai, e a nota volta a "
            + "aceitar o recebimento certo.",
    },
    {
        tipo: "corrigido",
        titulo: "Apagar nota cancelada",
        texto:
            "Nota cancelada ficava para sempre na lista, sem jeito de tirar. Depois de cancelada, ela "
            + "pode ser apagada de vez.",
    },
    {
        tipo: "novo",
        titulo: "Sua assinatura, sem susto",
        texto:
            "O aviso de vencimento e a fatura passam a chegar no WhatsApp, com o PDF e o Pix copia e "
            + "cola já no valor certo. Em Assinatura você vê o que está em aberto, paga e manda o "
            + "comprovante — o acesso é liberado na hora.",
        rota: "/configuracoes/faturas",
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
