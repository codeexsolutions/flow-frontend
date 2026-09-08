import { FlaskConical } from "lucide-react";

/**
 * A faixa que diz, sem rodeio, que o WhatsApp ainda está em teste.
 *
 * ---------------------------------------------------------------------------
 * Por que ela existe, e por que não some
 * ---------------------------------------------------------------------------
 * Esta é a única tela do Flow por onde passa a conversa do cliente FINAL da
 * loja. Quando algo falha aqui, quem sente não é o lojista olhando um relatório
 * — é o cliente dele, esperando uma resposta que não chegou. Uma pessoa que não
 * sabe que a ferramenta está em teste aposta o atendimento inteiro nela no
 * primeiro dia e desliga o celular do balcão.
 *
 * Por isso o aviso é permanente, e não um alerta que se fecha e nunca mais
 * volta: a informação continua verdadeira na segunda semana. Em troca ele é
 * pequeno e discreto — uma linha, sem cor de alarme —, porque avisar não pode
 * custar a metade da tela em que a pessoa está trabalhando.
 *
 * O texto diz o que fazer, não só o que é: "confira no celular" é a instrução
 * que evita o único prejuízo real desta fase, que é a loja achar que respondeu
 * quando a mensagem não saiu.
 */
const AvisoTeste = () => (
    <div className="flex shrink-0 items-start gap-2.5 border-b border-accent/15 bg-accent/[0.06] px-3 py-2">
        <span className="mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center text-accent-soft">
            <FlaskConical size={13} />
        </span>

        <p className="text-[11.5px] leading-relaxed text-mist">
            <span className="font-medium text-ink">WhatsApp em versão de testes.</span>{" "}
            Já dá para conversar com seus clientes por aqui, mas ainda estamos acertando os
            detalhes — pode acontecer de uma mensagem demorar ou de a conexão cair. Confira no
            celular da loja o que for importante, e nos avise quando algo parecer errado.
        </p>
    </div>
);

export default AvisoTeste;
