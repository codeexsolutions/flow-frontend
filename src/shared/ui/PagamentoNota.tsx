/**
 * Formas de pagamento e dados bancários da empresa, impressos no papel.
 *
 * O texto é escrito uma vez em Configurações › Empresa (`notaPagamento`) e sai
 * igual na nota de venda e no orçamento — o cliente que repassa o arquivo para
 * quem aprova precisa do "como pagar" junto, e não numa mensagem solta do
 * WhatsApp. Texto vazio: o bloco não existe.
 *
 * Estático como os documentos que o usam: nada de breakpoint, é só o que vai
 * para o PNG.
 */
type Props = { texto?: string | null };

const PagamentoNota = ({ texto }: Props) => {
  const conteudo = texto?.trim();

  if (!conteudo) return null;

  return (
    <div className="px-6 pb-6">
      <div className="rounded-2xl border border-fg/[0.06] bg-fg/[0.02] p-4">
        <p className="text-[11px] uppercase tracking-[0.08em] text-faint">Formas de pagamento</p>
        <p className="mt-1.5 whitespace-pre-line break-words text-[13px] leading-relaxed text-ink">{conteudo}</p>
      </div>
    </div>
  );
};

export default PagamentoNota;
