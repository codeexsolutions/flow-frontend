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
 * Se a venda tem o que cobrar no Pix — a mesma porta do `pixDaNota`, sem ir à
 * rede. É o que a lista usa para decidir se mostra o botão do copia-e-cola.
 */
export function vendaCobraPix(venda: PedidoClienteType): boolean {
  return valorDoPix(venda) > 0;
}

/** Quanto o QR cobra: o saldo; zero quando não há o que cobrar. */
function valorDoPix(venda: PedidoClienteType): number {
  /* A nota manda: quem desligou o QR naquela venda (a que o cliente já quitou
     no balcão) não quer vê-lo de volta no arquivo. */
  if (venda.pedido.mostrarQr === false) return 0;

  if (estaCancelado(venda)) return 0;

  const total = totalDoPedido(venda);
  const pago = recebidoDoPedido(venda);

  /* `valorPendenteDoPedido` zera para nota quitada — é o que queremos. Mas ele
     também zera para a que o status ainda não alcançou, então a subtração
     entra como reserva. */
  const saldo = valorPendenteDoPedido(venda) || Math.max(total - pago, 0);

  /* O valor definido no campo "Cobrar" da nota (a entrada, o sinal) manda —
     nunca acima do que falta pagar. */
  const definido = Number(venda.pedido.valorQr ?? 0);

  return definido > 0 ? Math.min(definido, saldo) : saldo;
}

/**
 * Só o copia-e-cola, sem o QR — o mesmo código que sai impresso na nota.
 *
 * É o que se manda no WhatsApp junto da imagem: quem abre a nota no próprio
 * celular não consegue apontar a câmera para o QR que está na tela dele.
 */
export async function codigoPixDaNota(venda: PedidoClienteType): Promise<Omit<PixDaNota, "qrCode"> | null> {
  const valor = valorDoPix(venda);

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

  return { payload, valor };
}

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
  const codigo = await codigoPixDaNota(venda);

  if (!codigo) return null;

  try {
    return { qrCode: await getQrCodeDataUrl(codigo.payload), ...codigo };
  } catch {
    return null;
  }
}
