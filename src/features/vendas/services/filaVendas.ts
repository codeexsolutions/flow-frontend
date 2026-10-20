import FinanceiroService from "@/features/financeiro/services/financeiro.service";
import OrcamentoService from "@/features/orcamentos/services/orcamento.service";
import ProductService from "@/features/estoque/services/product.service";
import NoteService from "@/features/vendas/services/note.service";
import type ProductType from "@/shared/domain/produto";
import { registrarExecutor } from "@/shared/fila/filaEnvio";

/**
 * O que a fila de envio sabe fazer com uma VENDA — ver `shared/fila/filaEnvio`.
 *
 * Cada executor recebe só dados (a tarefa é guardada no aparelho e pode ser
 * enviada depois de um F5, sem a tela que a criou), e precisa poder rodar
 * MAIS DE UMA VEZ sem estragar nada: a internet pode cair depois de o servidor
 * gravar e antes de a resposta chegar, e aí a fila repete.
 */

/** Uma linha da nota, como a fila guarda: sem `produtoId` = item avulso. */
export type LinhaNaFila = {
  produtoId: string;
  nomeProduto: string;
  quantidade: number;
  valorVenda: number;
  variacaoId: string | null;
};

export type NotaNaFila = {
  /** Gerado na tela. É o que faz o reenvio encontrar a nota já gravada. */
  id: string;
  clienteId: string;
  itens: LinhaNaFila[];
  imagensServico: string[];
  mostrarQr: boolean;
  valorQr: number | null;
  /** O orçamento que esta venda substitui — sai quando a venda existe. */
  converterOrcamentoId?: string | null;
};

export type AlteracaoNaFila = Omit<NotaNaFila, "id" | "converterOrcamentoId"> & { pedidoId: string };

export type PagamentoNaFila = {
  /** Id do recebimento, gerado na tela — reenviar não lança duas vezes. */
  id: string;
  pedidoId: string;
  valor: number;
  formaPagamento: string;
};

/**
 * Os itens avulsos viram produto antes de a nota ir para o servidor.
 *
 * Mesma regra de `materializarAvulsos`, na nota: cria como SERVIÇO, sem
 * controle de estoque, e procura pelo NOME antes — o que também a torna
 * repetível: na segunda vez, o produto criado na primeira é achado.
 */
const materializar = async (itens: LinhaNaFila[]): Promise<LinhaNaFila[]> => {
  if (!itens.some((l) => !l.produtoId)) return itens;

  const lerCatalogo = async () => ((await ProductService.getAll()).data.data ?? []) as ProductType[];
  const porNome = (catalogo: ProductType[], nome: string) => catalogo.find((p) => p.nome?.trim().toLowerCase() === nome.trim().toLowerCase());

  let catalogo = await lerCatalogo();

  const faltando = [...new Set(itens.filter((l) => !l.produtoId).map((l) => l.nomeProduto.trim()))].filter((n) => n && !porNome(catalogo, n));

  for (const nome of faltando) {
    const preco = itens.find((l) => !l.produtoId && l.nomeProduto.trim() === nome)?.valorVenda ?? 0;

    await ProductService.create({
      nome,
      tipo: "SERVICO",
      valorCompra: 0,
      valorVenda: preco,
      quantidade: 0,
      controlaEstoque: false,
      permiteVendaSemEstoque: false,
      estoqueMinimo: null,
      observacoes: "Criado a partir de um item avulso lançado na nota.",
    });
  }

  if (faltando.length > 0) catalogo = await lerCatalogo();

  return itens.map((l) => {
    if (l.produtoId) return l;

    const achado = porNome(catalogo, l.nomeProduto);

    if (!achado) throw new Error(`O item “${l.nomeProduto}” não pôde virar produto. Cadastre-o em Estoque e lance de novo.`);

    return { ...l, produtoId: String(achado.id) };
  });
};

const paraServidor = (itens: LinhaNaFila[]) =>
  itens.map((l) => ({ produtoId: l.produtoId, quantidade: l.quantidade, valorVenda: l.valorVenda, variacaoId: l.variacaoId }));

registrarExecutor<NotaNaFila>("nota.criar", async (nota) => {
  const itens = await materializar(nota.itens);

  await NoteService.create({
    id: nota.id,
    clienteId: nota.clienteId,
    itensPedido: paraServidor(itens),
    imagensServico: nota.imagensServico,
    mostrarQr: nota.mostrarQr,
    valorQr: nota.valorQr,
  });

  /* A proposta sai só depois de a venda existir. Falhar aqui não desfaz a
     venda: o orçamento fica na lista, e o botão de apagar resolve. */
  if (nota.converterOrcamentoId) {
    try {
      await OrcamentoService.excluir(nota.converterOrcamentoId);
    } catch {
      /* A venda é o que importa e já está gravada. */
    }
  }
});

registrarExecutor<AlteracaoNaFila>("nota.alterar", async (nota) => {
  const itens = await materializar(nota.itens);

  await NoteService.update(
    { clienteId: nota.clienteId, produtosPedido: paraServidor(itens), imagensServico: nota.imagensServico, mostrarQr: nota.mostrarQr, valorQr: nota.valorQr },
    nota.pedidoId,
  );
});

registrarExecutor<PagamentoNaFila>("nota.pagar", async (p) => {
  await FinanceiroService.registrarPagamentoNota(p.pedidoId, p.valor, p.formaPagamento, p.id);
});
