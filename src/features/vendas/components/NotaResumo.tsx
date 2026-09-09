import type { LegacyRef } from "react";

import HeaderInterprise from "@/shared/ui/HeaderInterprise";
import FundoNota from "@/shared/ui/FundoNota";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDate } from "@/shared/utils/date";
import { formatDocument } from "@/shared/utils/format";
import { podeMostrarDocumento } from "@/shared/utils/documento";
import { maskPhone } from "@/shared/validation/masks";
import useEnterprise from "@/features/empresa/store/enterprise.store";
import useClientes from "@/features/clientes/store/cliente.store";

import { type PedidoClienteType, totalDoPedido, recebidoDoPedido, valorPendenteDoPedido, estaCancelado } from "@/shared/domain/pedido";
import type { PixDaNota } from "@/shared/domain/pixDaNota";

/**
 * A NOTA DE VENDA — o documento, e só ele.
 *
 * ---------------------------------------------------------------------------
 * Um documento, dois caminhos
 * ---------------------------------------------------------------------------
 * Este componente é o papel que o cliente recebe, venha ele da linha da lista
 * de Vendas, do PDV ou do botão dentro da nota aberta (`Invoice`). Os três
 * fotografam ESTE nó.
 *
 * Já foram dois desenhos: a lista fotografava este arquivo e a nota aberta
 * fotografava a si mesma — o próprio formulário, com os controles filtrados
 * por `data-sem-foto`. Os dois começaram iguais e foram separando nos
 * detalhes, que é o único jeito que duas cópias do mesmo documento sabem
 * terminar: o telefone do cliente só existia num, o número da nota só no
 * outro, as fotos do serviço ficavam em alturas diferentes, e o resumo saía
 * com seis caixas de um lado e duas do outro. O cliente que recebe os dois não
 * sabe (nem deveria saber) por qual caminho a loja gerou o arquivo.
 *
 * Então o formulário voltou a ser formulário, e o documento é isto aqui.
 *
 * ---------------------------------------------------------------------------
 * Nada de breakpoint: a nota não é responsiva
 * ---------------------------------------------------------------------------
 * O nó vive escondido, com largura FIXA de 900px, e as classes `sm:` / `md:` /
 * `lg:` do Tailwind olham a largura da JANELA — não a do elemento. Dentro
 * daqui elas são um defeito com cara de recurso: a mesma venda baixada do
 * celular saía com o cabeçalho empilhado, o resumo em duas colunas e as fotos
 * uma embaixo da outra, enquanto a do desktop saía certa. Um documento não
 * muda de forma conforme o aparelho de quem o emitiu.
 *
 * Por isso todo layout aqui é incondicional. Se um bloco precisa de duas
 * colunas, ele tem duas colunas sempre.
 *
 * ---------------------------------------------------------------------------
 * O que a nota traz, e por quê
 * ---------------------------------------------------------------------------
 * Identificação à esquerda e as fotos do serviço à direita: "é o meu mesmo?"
 * vem antes de "quanto é?", então a prova do serviço aparece cedo. O Pix fecha
 * o documento, depois do resumo — o valor que o QR cobra vem logo abaixo do
 * total que o explica —, e o copia-e-cola sai IMPRESSO ao lado dele, porque
 * quem abre a imagem no próprio celular não tem como apontar a câmera para um
 * QR que está na tela desse mesmo celular.
 *
 * O resumo tem SEIS caixas, e a que mais importa é a segunda: o DESCONTO. Quem
 * negociou R$ 80 numa venda de R$ 100 e recebe um papel dizendo só "Total
 * R$ 80" começa a próxima conversa perguntando se o abatimento entrou. Pelo
 * mesmo motivo o preço de tabela riscado fica na linha do item — é o desconto
 * item a item, e não só na soma.
 *
 * Estático, como o `OrcamentoNota` e a `OrdemServico`: só o que vai para o
 * PNG. Nada aqui é editável, nada aqui é `data-sem-foto`.
 */
type Props = {
  venda: PedidoClienteType;
  /**
   * O Pix já montado — QR em data URI, copia-e-cola e valor.
   *
   * Vem PRONTO de quem baixa (ver `pixDaNota`), e não é gerado aqui: o QR é
   * assíncrono e a foto acontece um quadro depois de montar o nó. Gerado
   * dentro do componente, a `<img>` ainda não existiria na hora da captura —
   * era exatamente por isso que a nota baixada saía sem QR.
   */
  pix?: PixDaNota | null;
  /** Quem rasteriza é o botão de download, via `html-to-image`. */
  refNota?: LegacyRef<HTMLDivElement>;
};

const NotaResumo = ({ venda: v, pix, refNota }: Props) => {
  const itens = v.pedido.itensPedido ?? [];

  /* As mesmas três contas do `Invoice`, com os mesmos nomes — quando uma
     mudar, é para as duas mudarem juntas. O líquido sai de `totalDoPedido`
     (o total gravado, que já cai na soma dos itens quando falta). */
  const totalLiquido = totalDoPedido(v);
  const totalBruto = itens.reduce((acc, i) => acc + Number(i.produto?.valorProduto ?? 0) * Number(i.quantidadeItem ?? 0), 0);
  const totalDesconto = Math.max(totalBruto - totalLiquido, 0);
  const temDesconto = totalDesconto > 0 && totalBruto > 0;

  const pago = recebidoDoPedido(v);
  const pendente = valorPendenteDoPedido(v);
  const cancelada = estaCancelado(v);
  const formaPagamento = v.pedido.formaPagamento?.trim() || "Não consta";

  const enterprise = useEnterprise((s) => s.enterprise);

  /*
   * Telefone, documento e e-mail saem do CADASTRO, aqui dentro.
   *
   * A venda só guarda o nome do cliente. Enquanto quem montava a nota era a
   * tela, esses três campos existiam no documento da nota aberta (que tem o
   * cadastro à mão) e sumiam no da lista — a mesma venda ia para o cliente com
   * ou sem telefone dependendo do botão clicado.
   *
   * Buscando no store já carregado, os dois caminhos passam a ler a mesma
   * coisa e nenhuma requisição é disparada só para desenhar o papel. Cliente
   * sem cadastro em memória cai nos vazios de sempre.
   */
  const clientes = useClientes((s) => s.clientes);
  const cadastro = clientes.find((c) => c.id === v.clienteId);

  /* Mesma regra do documento da empresa: CNPJ sai, CPF só se a opção estiver
     desligada — é o cliente que carrega esse papel por aí. */
  const documentoCliente = podeMostrarDocumento(cadastro?.cpfCnpj, enterprise?.ocultarCpfNota)
    ? formatDocument(String(cadastro?.cpfCnpj))
    : "";
  const emailCliente = cadastro?.contato?.email ?? "";
  const telefoneCliente = (() => {
    const numero = cadastro?.contato?.celular || cadastro?.contato?.whatsapp || cadastro?.contato?.telefone || "";
    return numero ? maskPhone(String(numero)) : "";
  })();

  /* Rótulo pequeno, valor legível, uma linha de respiro — dado impresso, não
     campo de formulário. O `extra` é o apoio que cabe embaixo sem virar linha
     própria: o documento do cliente, o e-mail, a data de emissão. */
  const identificacao = [
    { rotulo: "Cliente", valor: v.nomeCliente || "—", extra: documentoCliente },
    { rotulo: "Telefone", valor: telefoneCliente || "Não informado", extra: emailCliente },
    { rotulo: "Vendedor", valor: v.nomeVendedor || "—", extra: `Emitida em ${formatDate(v.pedido.dataPedido)}` },
    { rotulo: "Código", valor: v.pedido.pedidoId || "—", extra: "" },
  ];

  const imagens = v.pedido.imagensServico ?? [];

  /* Os mesmos rótulos e valores do resumo da nota. */
  const lblResumo = "block text-[11px] uppercase tracking-[0.08em] text-faint";
  const valResumo = "mt-1 block truncate text-sm text-ink";

  return (
    <div ref={refNota} className="relative flex w-full flex-col overflow-hidden bg-surface">
      <FundoNota imagem={enterprise?.notaBackground} />

      <div className="relative flex flex-col">
      {/* Cabeçalho — empresa à esquerda, nota à direita */}
      <div className="flex flex-row items-end justify-between gap-3 border-b border-fg/[0.05] p-6">
        <HeaderInterprise />
        <div className="text-right">
          <h2 className="text-2xl leading-none text-ink">Nota de Venda</h2>
          <p className="mt-1.5 text-sm text-mist">Data: {formatDate(v.pedido.dataPedido)}</p>
          <p className="mt-0.5 text-[11.5px] uppercase tracking-wide text-faint">#{v.pedido.pedidoId?.slice(-6).toUpperCase() ?? "—"}</p>
        </div>
      </div>

      {/* Identificação à esquerda, fotos do serviço à direita.
          A coluna da direita só existe quando há foto: uma seção "Fotos do
          serviço" vazia num PDF que vai para o cliente parece defeito, não
          espaço reservado. */}
      <div className="flex flex-row items-start gap-8 px-6 pt-6">
        <dl className="flex min-w-0 flex-1 flex-col gap-3.5">
          {identificacao.map((linha) => (
            <div key={linha.rotulo} className="min-w-0">
              <dt className="text-[10.5px] uppercase tracking-[0.1em] text-faint">{linha.rotulo}</dt>
              <dd className="mt-0.5 min-w-0 truncate text-[14.5px] leading-snug text-ink">{linha.valor}</dd>
              {linha.extra && <dd className="truncate text-[11.5px] text-faint">{linha.extra}</dd>}
            </div>
          ))}
        </dl>

        {imagens.length > 0 && (
          <div className="w-[300px] shrink-0">
            <span className="text-[10.5px] uppercase tracking-[0.1em] text-faint">Fotos do serviço</span>

            {/* Duas, dividindo a largura da coluna: com três cada uma vira
                miniatura ilegível; com uma só não dá para mostrar o par "como
                estava / como ficou". Ver a migration 057. */}
            <div className="mt-2 grid grid-cols-2 gap-2.5">
              {imagens.map((url, i) => (
                <img key={url} src={url} alt={`Foto ${i + 1} do serviço`} className="aspect-square w-full rounded-xl border border-fg/[0.08] object-cover" />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tabela de itens */}
      <div className="px-6 pt-6">
        <div className="overflow-hidden rounded-xl border border-fg/[0.06]">
          <table className="w-full text-sm">
            <thead className="bg-surface-raised">
              <tr className="border-b border-fg/[0.06] text-[11px] uppercase tracking-[0.08em] text-faint">
                <td className="px-3 py-2.5 text-left">Produto</td>
                <td className="px-3 py-2.5 text-left">Qtde</td>
                <td className="px-3 py-2.5 text-left">V. Unit</td>
                <td className="px-3 py-2.5 text-left">Subtotal</td>
              </tr>
            </thead>
            <tbody className="divide-y divide-fg/[0.05]">
              {itens.length > 0 ? (
                itens.map((item) => {
                  const unitario = Number(item.valorVendaItem);
                  const tabela = Number(item.produto?.valorProduto ?? 0);

                  return (
                    <tr key={item.itemPedidoId}>
                      <td className="max-w-[280px] p-2 align-middle">
                        <p className="truncate px-1 text-ink" title={item.produto.nomeProduto}>
                          {item.produto.nomeProduto}
                          {/* A variação vira selo ao lado do nome: sem ela, duas
                              linhas de "Camiseta preta" ficam idênticas na nota
                              e o cliente não sabe o que levou. */}
                          {item.variacaoDescricao && (
                            <span className="ml-1.5 rounded bg-fg/[0.07] px-1.5 py-px text-[10px] text-mist">{item.variacaoDescricao}</span>
                          )}
                        </p>
                      </td>
                      <td className="p-2 align-middle">
                        <p className="px-1 tabular-nums text-ink">{Number(item.quantidadeItem)}</p>
                      </td>
                      <td className="p-2 align-middle">
                        {/* O preço de tabela riscado ao lado do praticado — é o
                            desconto item a item, do mesmo jeito que a nota
                            aberta mostra. */}
                        <div className="flex items-center gap-1.5 px-1">
                          <span className="tabular-nums text-ink">{formatCurrency(unitario)}</span>
                          {tabela > 0 && unitario !== tabela && (
                            <span className="text-[10px] text-mist line-through">{formatCurrency(tabela)}</span>
                          )}
                        </div>
                      </td>
                      <td className="p-2 align-middle">
                        <p className="px-1 tabular-nums text-ink">{formatCurrency(unitario * Number(item.quantidadeItem))}</p>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-mist">
                    <p className="text-sm">Nenhum item na nota</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resumo — as SEIS caixas, sempre em seis colunas */}
      <div className="p-5 pt-6">
        <div className="grid grid-cols-6 gap-2">
          <div className="rounded-xl border border-fg/[0.06] bg-fg/[0.03] p-3">
            <span className={lblResumo}>T. Bruto</span>
            <span className={`${valResumo} tabular-nums`}>{formatCurrency(totalBruto)}</span>
          </div>

          <div className={`rounded-xl border p-3 ${temDesconto ? "border-warning/20 bg-warning/[0.12]" : "border-fg/[0.06] bg-fg/[0.03]"}`}>
            <span className={`${lblResumo} ${temDesconto ? "text-warning" : "text-faint"}`}>Desconto</span>
            <span className={`mt-1 block truncate text-sm tabular-nums ${temDesconto ? "text-warning" : "text-ink"}`}>{temDesconto ? `- ${formatCurrency(totalDesconto)}` : formatCurrency(0)}</span>
          </div>

          <div className="rounded-xl border border-fg/[0.06] bg-fg/[0.03] p-3">
            <span className={lblResumo}>T. Líquido</span>
            {/* Nota cancelada risca o líquido: é o único lugar do documento em
                que o cancelamento precisa aparecer para quem lê. */}
            <span className={`mt-1 block truncate text-sm tabular-nums ${cancelada ? "text-mist line-through" : "text-ink"}`}>{formatCurrency(totalLiquido)}</span>
          </div>

          <div className="rounded-xl border border-fg/[0.06] bg-fg/[0.03] p-3">
            <span className={lblResumo}>T. Pago</span>
            <span className={`${valResumo} tabular-nums`}>{formatCurrency(pago)}</span>
          </div>

          <div className={`rounded-xl border p-3 ${pendente > 0 ? "border-warning/20 bg-warning/[0.12]" : "border-success/20 bg-success/[0.12]"}`}>
            <span className={`${lblResumo} ${pendente > 0 ? "text-warning" : "text-success"}`}>Pendente</span>
            <span className={`mt-1 block truncate text-sm tabular-nums ${pendente > 0 ? "text-warning" : "text-success"}`}>{formatCurrency(pendente)}</span>
          </div>

          <div className="rounded-xl border border-fg/[0.06] bg-fg/[0.03] p-3">
            <span className={lblResumo}>F. Pagamento</span>
            <span className={valResumo}>{formaPagamento}</span>
          </div>
        </div>
      </div>

      {/* ─────────────────────── Pagamento via Pix ───────────────────────
          Quem recebe o arquivo pelo WhatsApp precisa de como pagar, e o código
          escrito ao lado do QR não é enfeite: quem abre a imagem no próprio
          celular não tem como apontar a câmera para um QR que está na tela
          desse mesmo celular. O copia-e-cola é o único caminho de pagamento
          para essa pessoa.

          Quem decide se o bloco existe é quem monta o Pix (`pixDaNota`, ou a
          nota aberta): nota quitada, cancelada ou com o QR desligado chega
          aqui com `pix` nulo — um QR numa nota paga é um convite ao engano. */}
      {pix && (
        <div className="px-6 pb-6">
          <div className="flex flex-row items-center gap-4 rounded-2xl border border-fg/[0.06] bg-fg/[0.02] p-4">
            <div className="shrink-0 overflow-hidden rounded-2xl border border-fg/[0.08] bg-white p-2.5">
              <img src={pix.qrCode} alt="QR Code para pagamento via Pix" className="h-[144px] w-[144px] rounded-lg" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-[0.08em] text-faint">Pagamento via Pix</p>
              <p className="mt-0.5 text-sm text-ink">
                Aponte a câmera para o QR ou copie o código abaixo
                <span className="ml-1 tabular-nums text-mist">· {formatCurrency(pix.valor)}</span>
              </p>

              <div className="mt-2.5 rounded-xl border border-fg/[0.08] bg-fg/[0.03] p-2.5">
                <code className="block break-all text-[10.5px] leading-relaxed text-mist">{pix.payload}</code>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default NotaResumo;
