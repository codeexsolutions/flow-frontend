import { pixConfigurado, type ConfigPix, type PixKeyType } from "@/features/config/services/pix.service";

/**
 * Formas de pagamento e dados bancários da empresa, impressos no papel.
 *
 * O texto é escrito uma vez em Configurações › Empresa (`notaPagamento`) e sai
 * igual na nota de venda e no orçamento — o cliente que repassa o arquivo para
 * quem aprova precisa do "como pagar" junto, e não numa mensagem solta do
 * WhatsApp.
 *
 * `pix` é a chave cadastrada, escrita por extenso. Só o orçamento manda: ele
 * não tem QR (proposta não é cobrança), e sem isto a chave da empresa não saía
 * em lugar nenhum do papel. A nota de venda já tem o bloco do Pix, então não
 * passa. Sem texto e sem chave: o bloco não existe.
 *
 * Estático como os documentos que o usam: nada de breakpoint, é só o que vai
 * para o PNG.
 */
type Props = { texto?: string | null; pix?: ConfigPix | null };

const TIPO: Record<PixKeyType, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  phone: "Telefone",
  email: "E-mail",
  random: "Chave aleatória",
};

const PagamentoNota = ({ texto, pix }: Props) => {
  const conteudo = texto?.trim();
  const chave = pix && pixConfigurado(pix) ? pix : null;

  if (!conteudo && !chave) return null;

  return (
    <div className="px-6 pb-6">
      <div className="rounded-2xl border border-fg/[0.06] bg-fg/[0.02] p-4">
        <p className="text-[11px] uppercase tracking-[0.08em] text-faint">Formas de pagamento</p>
        {conteudo && <p className="mt-1.5 whitespace-pre-line break-words text-[13px] leading-relaxed text-ink">{conteudo}</p>}
        {chave && (
          <p className={`break-words text-[13px] leading-relaxed text-ink ${conteudo ? "mt-2.5 border-t border-fg/[0.06] pt-2.5" : "mt-1.5"}`}>
            Pix ({TIPO[chave.tipoChave] ?? "Chave"}): <span className="select-all">{chave.chave}</span>
            <span className="block text-[12px] text-mist">Favorecido: {chave.beneficiario}</span>
          </p>
        )}
      </div>
    </div>
  );
};

export default PagamentoNota;
