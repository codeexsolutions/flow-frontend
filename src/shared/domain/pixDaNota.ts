import PixService, { pixConfigurado, type ConfigPix } from "@/features/config/services/pix.service";
import { generatePixPayload, getQrCodeDataUrl } from "@/shared/utils/pix";
import { totalDoPedido, recebidoDoPedido, valorPendenteDoPedido, estaCancelado, type PedidoClienteType } from "@/shared/domain/pedido";

/** O Pix de uma venda, pronto para entrar no documento. */
export type PixDaNota = {
  /** O QR já como data URI — é o que faz a imagem entrar no PNG. */
  qrCode: string;
  /** O copia-e-cola, impresso ao lado do QR. */
  payload: string;
  /** Quanto o QR cobra. */
  valor: number;
};

/**
 * O Pix da nota, montado FORA da tela que a desenha.
 *
 * ---------------------------------------------------------------------------
 * Por que não dentro do componente do documento
 * ---------------------------------------------------------------------------
 * Gerar o QR é assíncrono (a biblioteca devolve uma promessa), e o download
 * rasteriza o nó escondido um quadro depois de montá-lo. Um `useEffect` dentro
 * do documento perderia a corrida: a `<img>` do QR ainda não existiria no DOM
 * na hora da foto, e `esperarImagens` não tem como esperar por uma imagem que
 * não está lá.
 *
 * Era exatamente isso que fazia a nota baixada sair sem QR enquanto a nota
 * aberta na tela saía com ele — a nota aberta já tinha o QR pronto havia
 * tempo, porque a pessoa estava olhando para ela.
 *
 * Aqui a tela pede o Pix ANTES de mandar rasterizar, com `await`. Quando o nó
 * é montado, o data URI já existe.
 *
 * ---------------------------------------------------------------------------
 * Quanto o QR cobra
 * ---------------------------------------------------------------------------
 * O SALDO, não o total: numa venda com entrada já paga, um QR pelo valor cheio
 * faz o cliente pagar duas vezes. Quitada ou cancelada não tem o que cobrar, e
 * a função devolve `null` — o documento sai sem o bloco, que é o certo: um QR
 * numa nota paga é um convite ao engano.
 */
export async function pixDaNota(venda: PedidoClienteType): Promise<PixDaNota | null> {
  /* A nota manda: quem desligou o QR naquela venda (a que o cliente já quitou
     no balcão) não quer vê-lo de volta no arquivo. */
  if (venda.pedido.mostrarQr === false) return null;

  if (estaCancelado(venda)) return null;

  const total = totalDoPedido(venda);
  const pago = recebidoDoPedido(venda);

  /* `valorPendenteDoPedido` zera para nota quitada — é o que queremos. Mas ele
     também zera para a que o status ainda não alcançou, então a subtração
     entra como reserva. */
  const valor = valorPendenteDoPedido(venda) || Math.max(total - pago, 0);

  if (valor <= 0) return null;

  let config: ConfigPix | null = null;

  try {
    config = await PixService.consultar();
  } catch {
    /* Sem a configuração o documento sai sem Pix, como saía antes. Falhar aqui
       não pode impedir o download da nota. */
    return null;
  }

  if (!pixConfigurado(config)) return null;

  const payload = generatePixPayload({
    pixKey: config!.chave,
    pixKeyType: config!.tipoChave,
    merchantName: config!.beneficiario,
    merchantCity: config!.cidade,
    amount: valor,
    transactionId: String(venda.pedido.pedidoId ?? `nota-${Date.now()}`),
    description: "Nota de venda",
  });

  try {
    return { qrCode: await getQrCodeDataUrl(payload), payload, valor };
  } catch {
    return null;
  }
}
