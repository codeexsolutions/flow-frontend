import { useEffect, useMemo, useRef, useState } from "react";
import HeaderInterprise from "@/shared/ui/HeaderInterprise";

import { formatDate } from "@/shared/utils/date";
import { formatCurrency } from "@/shared/utils/currency";

import ProductType from "@/shared/domain/produto";
import type { Indisponibilidade, Variacao } from "@/shared/domain/estoque";
import { extrairFaltas } from "@/shared/domain/estoque";
import type { PedidoClienteType, ItemPedidoType, NovoPedidoDto, PedidoUpdateDto } from "@/shared/domain/pedido";

import NoteService from "@/features/vendas/services/note.service";
import ProductService from "@/features/estoque/services/product.service";
import FinanceiroService from "@/features/financeiro/services/financeiro.service";

import MoneyInput from "@/shared/ui/inputs/MoneyInput";
import { Modal } from "@/shared/ui/Modal";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import BuscaProduto from "@/features/vendas/components/BuscaProduto";
import { ProdutoForm } from "@/features/estoque/components/ProdutoForm";
import type { ProductFormData } from "@/features/estoque/schema/product.schema";
import BotaoVerDocumento from "@/shared/ui/BotaoVerDocumento";
import UploadImagem from "@/shared/ui/UploadImagem";
import BotaoRecibo from "@/shared/ui/BotaoRecibo";
import FundoNota from "@/shared/ui/FundoNota";
import useEnterprise from "@/features/empresa/store/enterprise.store";
import OrcamentoService from "@/features/orcamentos/services/orcamento.service";
import CrmService from "@/features/crm/services/crm.service";
import { gerarBlobNota } from "@/shared/ui/DownloadButton";
import { gerarPdfNota } from "@/shared/ui/downloadNota";

import { Save, Trash2, QrCode, Loader2, FileText, Copy, Check, Image as ImageIcon } from "lucide-react";
import { Skeleton, SkeletonInvoiceCard, SkeletonInvoiceHeader, SkeletonInvoiceRow, SkeletonSummary } from "@/shared/ui/skeleton";

import { generatePixPayload, getQrCodeDataUrl } from "@/shared/utils/pix";
import PixService, { pixConfigurado, type ConfigPix } from "@/features/config/services/pix.service";
import useAuth from "@/features/auth/store/auth.store";
import { ehGestor } from "@/features/vendas/components/TabsVendas";
import useClientes from "@/features/clientes/store/cliente.store";
import { maskPhone } from "@/shared/validation/masks";
import { formatDocument } from "@/shared/utils/format";
import { podeMostrarDocumento } from "@/shared/utils/documento";
import PrazoNota from "@/features/vendas/components/PrazoNota";
import PainelPagamento from "@/features/vendas/components/PainelPagamento";
import PagamentoForm from "@/shared/ui/PagamentoForm";
import RecebimentosNota from "@/features/financeiro/components/RecebimentosNota";
import ContaService, { type AcordoVenda } from "@/features/financeiro/services/conta.service";
import NotaResumo from "@/features/vendas/components/NotaResumo";

const gerarUID = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

type InvoiceProps = {
  id?: string;
  clienteId?: string;
  nome?: string;
  onSaved?: () => void;
  /**
   * A conversa de onde esta nota nasceu.
   *
   * Presente, a nota ganha o gesto que faltava: assim que ela é gerada, o
   * documento vai para o cliente pelo WhatsApp — em PNG ou PDF —, na mesma
   * conversa em que a venda foi combinada. Ausente (PDV, lista de vendas), a
   * nota se comporta como sempre.
   */
  conversaId?: string;
  /** Modo orçamento: a mesma nota, mas com título "Orçamento", sem pagamento
      e com "Gerar orçamento" no lugar de "Gerar Nota". */
  modoOrcamento?: boolean;
  /**
   * Itens com que a nota já nasce — usado por quem vem de um orçamento.
   *
   * É o que torna possível "converter em venda" e "editar orçamento" sem
   * relançar produto por produto: a nota abre com a proposta montada, e o
   * operador só confirma. Vale apenas para nota NOVA; havendo `id`, os itens
   * vêm do pedido salvo, que é a verdade.
   */
  itensIniciais?: ItemPedidoType[];
  /**
   * Orçamento que está sendo reescrito. Presente, "Gerar orçamento" salva por
   * cima em vez de criar uma segunda proposta com o mesmo conteúdo.
   */
  orcamentoId?: string;
  /**
   * Telefone e vencimento da proposta que está sendo REESCRITA.
   *
   * Sem eles, reabrir um orçamento para corrigir a quantidade de um item
   * salvaria por cima com o telefone em branco e a validade recalculada a
   * partir de hoje — a correção de um item mudaria o prazo combinado com o
   * cliente. Em proposta nova não vêm, e os campos nascem do cadastro do
   * cliente e do prazo padrão.
   */
  contatoInicial?: string | null;
  validadeInicial?: string | null;
  /**
   * Orçamento que esta venda substitui — ele é APAGADO quando a nota nasce.
   *
   * -------------------------------------------------------------------------
   * Por que aqui dentro, e não ao fechar a tela
   * -------------------------------------------------------------------------
   * A marcação antiga vivia no `onClose` do PDV, apoiada na ideia de que
   * fechar a nota significa tê-la salvado. Não significa: o mesmo `onClose`
   * dispara quando a pessoa abre a conversão, muda de ideia e fecha no X.
   * Marcar um orçamento como resolvido nesse caso já era errado; APAGÁ-LO
   * seria perder a proposta sem nada em troca.
   *
   * Aqui a exclusão acontece depois de o servidor devolver o id da nota — ou
   * seja, só quando a venda existe de fato. O pior desfecho possível passa a
   * ser o orçamento sobreviver a uma venda (visível, e resolvido com o botão
   * de apagar da lista), nunca o contrário.
   */
  converterOrcamentoId?: string;
};


/**
 * ============================================================================
 * A NOTA — 1.750 linhas, e o documento que o cliente leva. Leia este mapa.
 * ============================================================================
 *
 * É o componente mais crítico do sistema: é ele que vira o papel na mão do
 * cliente, o PNG mandado no WhatsApp e o registro da venda no banco. Um erro
 * aqui sai da loja.
 *
 * ----------------------------------------------------------------------------
 * UM COMPONENTE, TRÊS DOCUMENTOS
 * ----------------------------------------------------------------------------
 * As props mudam o que ele é:
 *
 *   • sem `id`            → NOTA NOVA, sendo montada no balcão;
 *   • com `id`            → nota SALVA, que se edita, recebe pagamento,
 *                           cancela ou apaga;
 *   • `modoOrcamento`     → a MESMA nota como PROPOSTA: sem pagamento, com
 *                           "Gerar orçamento" no lugar de "Gerar nota".
 *
 * `itensIniciais` faz a nota nascer com a proposta montada (converter
 * orçamento em venda sem relançar item por item). `converterOrcamentoId`
 * apaga o orçamento DEPOIS que a venda existe — ver a nota da prop.
 *
 * ----------------------------------------------------------------------------
 * ELE É USADO DE QUATRO LUGARES
 * ----------------------------------------------------------------------------
 * PDV (venda nova), lista de vendas (abrir a nota), orçamentos (propor e
 * converter) e agora o CRM (vender dentro da conversa). Mudança aqui aparece
 * nos quatro — não existe "só no PDV".
 *
 * ----------------------------------------------------------------------------
 * COMO O ARQUIVO ESTÁ DIVIDIDO
 * ----------------------------------------------------------------------------
 *   1. PROPS (acima) — cada uma documentada, porque é a prop que decide se
 *      isto é nota, proposta ou conversão.
 *
 *   2. ESTADO E AÇÕES (~102 a ~930):
 *        · `recarregarNotaEPrazo` — relê a nota e o acordo de prazo;
 *        · `handleSalvar` — cria ou atualiza a nota;
 *        · `handleGerarOrcamento` — a mesma coisa, para proposta;
 *        · `handleAdicionarPagamento` — recebe;
 *        · `handleCancelar` / `handleApagar` — encerram a nota. Cancelar
 *          devolve o estoque e mantém no histórico; apagar só existe DEPOIS
 *          de cancelada, e o servidor recusa se houver pagamento.
 *        · `handleNovoProduto` — cadastra produto sem sair da venda.
 *
 *   3. RENDER — o cabeçalho com status e ações, a nota EDITÁVEL e a coluna de
 *      pagamento.
 *
 * ----------------------------------------------------------------------------
 * ESTA TELA NÃO É O DOCUMENTO
 * ----------------------------------------------------------------------------
 * O que o cliente recebe sai do `NotaResumo`, num nó escondido de 900px — o
 * MESMO componente que a lista de Vendas e o PDV fotografam. Ver
 * `vendaDoDocumento`, que traduz o estado vivo desta tela para ele.
 *
 * Foi assim que acabou a divergência de detalhes entre a nota baixada aqui
 * dentro e a baixada pela lista: não existe mais um segundo desenho do mesmo
 * papel. Mexer no documento é mexer no `NotaResumo`; mexer aqui é mexer na
 * ferramenta de montar a venda.
 *
 * O `notaRef` e o `data-sem-foto` continuam servindo ao ORÇAMENTO, que ainda
 * é fotografado da tela.
 *
 * ----------------------------------------------------------------------------
 * O QUE MORA FORA DAQUI
 * ----------------------------------------------------------------------------
 * `PainelPagamento` (a coluna de dinheiro no desktop), `PagamentoForm`,
 * `RecebimentosNota` (o extrato que corrige e apaga cada pagamento),
 * `BotaoVerDocumento` e `BotaoRecibo`, `FundoNota` (o wallpaper), `PrazoNota`.
 *
 * Os números de linha envelhecem; os nomes dos handlers, não.
 */

const STATUS_STYLE: Record<string, string> = {
  ABERTO: "bg-warning/25 text-warning ring-warning/25",
  PENDENTE: "bg-warning/25 text-warning ring-warning/25",
  FECHADO: "bg-success/30 text-success ring-success/25",
  PAGO: "bg-success/30 text-success ring-success/25",
  CANCELADO: "bg-danger/25 text-danger ring-danger/25",
};

/**
 * Quanto tempo uma proposta vale, quando ninguém diz o contrário.
 *
 * Quinze dias é o prazo que a loja consegue sustentar: curto o bastante para o
 * preço não envelhecer junto com o custo do fornecedor, e longo o bastante
 * para o cliente pensar, pesquisar e voltar. Quem precisar de outro prazo
 * troca a data no campo — o padrão só evita que a proposta saia sem prazo
 * nenhum, que era o que acontecia.
 */
const PRAZO_PADRAO_DIAS = 15;

/** `aaaa-mm-dd` daqui a N dias — o formato que o `<input type="date">` usa. */
const emDias = (dias: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};



const Invoice = ({ id: idInicial, clienteId, nome, onSaved, modoOrcamento = false, itensIniciais, orcamentoId, contatoInicial, validadeInicial, converterOrcamentoId, conversaId }: InvoiceProps) => {
  const alert = useAlert();
  const notaRef = useRef<HTMLDivElement>(null);

  /*
   * O envio da nota pelo WhatsApp.
   *
   * `perguntarEnvio` acende sozinho quando a nota nasce DENTRO de uma conversa
   * — é o instante em que a pergunta faz sentido, e é o instante em que a
   * pessoa está com o cliente do outro lado esperando o documento. Fora da
   * conversa (`conversaId` ausente) nada disto existe.
   */
  const [perguntarEnvio, setPerguntarEnvio] = useState(false);
  const [enviandoWhats, setEnviandoWhats] = useState<"png" | "pdf" | null>(null);

  /* O id começa na prop (nota existente) e pode nascer aqui dentro: ao criar
     uma nota nova, o `setPedidoId` é preenchido com o id devolvido pela API —
     a nota continua aberta para o pagamento sem recarregar a tela. */
  const [pedidoId, setPedidoId] = useState<string | undefined>(idInicial);
  const id = pedidoId;

  /* ─── Quem vende e para quem ─── */
  const { user } = useAuth();
  const clientes = useClientes((s) => s.clientes);
  const enterprise = useEnterprise((s) => s.enterprise);

  /**
   * O vendedor da nota é quem está logado emitindo-a.
   *
   * O apelido escolhido em Perfil ganha do nome do cadastro: este campo é lido
   * pelo CLIENTE, e o cadastro guarda o nome completo — que estoura a largura
   * da coluna e não é como a pessoa se apresenta no balcão. Vazio cai no nome
   * de sempre, então quem não preencheu nada não vê diferença nenhuma.
   */
  const vendedor = user?.nomeExibicao || user?.nome || user?.email || "—";

  /**
   * O pedido só traz o nome do cliente; o telefone mora no cadastro. Pega do
   * que já está carregado em memória — sem disparar requisição para a nota.
   */
  /* Documento e e-mail vêm do cadastro já carregado — sem requisição a mais
     só para enriquecer a nota. */
  const clienteCadastro = clientes.find((c) => c.id === clienteId);

  /* Mesma regra do documento da empresa: CNPJ sai, CPF só se a opção estiver
     desligada. O do cliente é ainda menos assunto de quem recebe a via — e é
     ele que a nota circula junto do nome e do telefone. */
  const documentoCliente = podeMostrarDocumento(clienteCadastro?.cpfCnpj, enterprise?.ocultarCpfNota)
    ? formatDocument(String(clienteCadastro?.cpfCnpj))
    : "";
  const emailCliente = clienteCadastro?.contato?.email ?? "";

  const telefoneCadastro = (() => {
    const alvo = clientes.find((c) => c.id === clienteId);
    const contato = alvo?.contato;
    const numero = contato?.celular || contato?.whatsapp || contato?.telefone || "";
    return numero ? maskPhone(String(numero)) : "";
  })();

  /*
   * ─── Os dois dados que só a PROPOSTA tem: telefone e validade ───
   *
   * A nota de venda os dispensa: ela nasce de um cliente CADASTRADO (o
   * telefone vem de lá) e vale no ato. O orçamento não — ele é montado para um
   * nome livre, muitas vezes de alguém que nunca comprou, e o preço dele
   * precisa vencer.
   *
   * Sem estes campos a proposta saía sem telefone nenhum quando o cliente não
   * tinha cadastro, e SEMPRE sem validade: o papel que o cliente guardava não
   * dizia até quando aquele preço valia, e a loja não tinha como recusar um
   * orçamento de três meses atrás.
   */
  const [contatoOrcamento, setContatoOrcamento] = useState(() => (contatoInicial ? maskPhone(String(contatoInicial)) : ""));
  const [validadeOrcamento, setValidadeOrcamento] = useState(() => (validadeInicial ? String(validadeInicial).slice(0, 10) : emDias(PRAZO_PADRAO_DIAS)));

  /* O cadastro preenche o campo vazio — sem apagar o que já foi digitado à
     mão, que é o caso de quem escreveu o número de um cliente sem ficha. */
  useEffect(() => {
    if (!modoOrcamento || !telefoneCadastro) return;
    setContatoOrcamento((atual) => atual || telefoneCadastro);
  }, [modoOrcamento, telefoneCadastro]);

  /* O que vai IMPRESSO: no orçamento, o que está no campo; na nota, o
     cadastro, como sempre foi. */
  const telefoneCliente = modoOrcamento ? contatoOrcamento : telefoneCadastro;

  /*
   * Cadastro de produto sem sair da nota.
   *
   * `null` = fechado; string = aberto com o nome que estava na busca (pode ser
   * vazia, quando se abre pelo ícone). Guardar o nome é o que faz o cadastro
   * continuar de onde a venda parou, em vez de pedir para digitar de novo.
   */
  const [novoProduto, setNovoProduto] = useState<string | null>(null);
  const [salvandoProduto, setSalvandoProduto] = useState(false);

  /* ─── Loading states ─── */
  const [loadingProdutos, setLoadingProdutos] = useState(true);
  const [loadingPedido, setLoadingPedido] = useState(!!idInicial);
  const [savingNote, setSavingNote] = useState(false);

  /* ─── Dados ─── */
  const [products, setProducts] = useState<ProductType[]>([]);
  const [pedido, setPedido] = useState<PedidoClienteType | null>(null);

  /* Nota nova pode nascer com itens (veio de um orçamento). Nota existente
     ignora: os itens dela são carregados do pedido logo abaixo. */
  const [itens, setItens] = useState<ItemPedidoType[]>(() => (idInicial ? [] : (itensIniciais ?? [])));

  /* Linhas que o servidor recusou por falta de estoque, por chave
     produto+variação. Ver `chaveDaLinha`. */
  const [faltas, setFaltas] = useState<Indisponibilidade[]>([]);

  /** Data de emissão ao lado do vendedor: quem fez e quando, na mesma leitura. */
  const dataEmissao = formatDate(pedido?.pedido?.dataPedido ?? new Date());

  const [valorPagoAnterior, setValorPagoAnterior] = useState(0);
  const [confirmandoPagamento, setConfirmandoPagamento] = useState(false);

  /* ─── Venda a prazo ───
     O acordo é a conta a receber que nasceu desta nota: as parcelas e seus
     vencimentos. `null` = nota à vista, que é a maioria. */
  const [acordo, setAcordo] = useState<AcordoVenda | null>(null);
  const [carregandoAcordo, setCarregandoAcordo] = useState(!!idInicial);


  /* ─── UI state ─── */
  const [tipoPagamento, setTipoPagamento] = useState("");
  const [valorPagamento, setValorPagamento] = useState(0);

  /* Logo depois de salvar, o pagamento é o próximo passo: o aside ganha um
     anel de destaque para quem paga "depois de salvar" saber que a nota está
     pronta e o que falta é receber. */
  const [focarPagamento, setFocarPagamento] = useState(false);

  /**
   * Quanto o QR vai cobrar — em REAIS, não em porcentagem.
   *
   * Eram atalhos de 100%/50% e um campo de "%" livre. A conta que o balcão faz
   * não é essa: o combinado com o cliente é "me adianta duzentos", "deixa
   * cinquenta de sinal" — valor cheio, redondo, dito em dinheiro. Com o campo
   * em porcentagem, quem atende dividia 200 por 1.437,90 de cabeça para
   * descobrir que precisava digitar 14%, e o QR saía cobrando R$ 201,31.
   *
   * `null` = cobrar o total. Guardado como string porque é o que o campo
   * edita: "1", "1,", "1,5" são estados válidos de quem está digitando, e
   * converter a cada tecla apagaria a vírgula no meio da digitação.
   */
  const [cobrancaLivre, setCobrancaLivre] = useState("");
  const [qrCodeNota, setQrCodeNota] = useState("");

  /**
   * As duas fotos do serviço, e a escolha de mostrar o QR — gravadas na venda.
   *
   * Começam vazias e são preenchidas quando a nota chega do servidor. Ver a
   * migration 057 sobre por que as fotos são da venda e não do produto.
   */
  const [imagensServico, setImagensServico] = useState<string[]>([]);
  const [mostrarQr, setMostrarQr] = useState(true);

  /* Confirmação do copia-e-cola — volta ao normal sozinha em 2s. */
  const [pixCopiado, setPixCopiado] = useState(false);
  const [modalCancelar, setModalCancelar] = useState(false);
  const [modalApagar, setModalApagar] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  /* ─── PIX ───
     A configuração é da EMPRESA e vem do servidor. A nota só lê: quem
     configura é o usuário master, em Configurações → Empresa. */
  const [configPix, setConfigPix] = useState<ConfigPix | null>(null);

  const pixConfig = pixConfigurado(configPix);

  /* ─── Carrega config PIX salva ─── */
  useEffect(() => {
    PixService.consultar().then(setConfigPix);
  }, []);

  /* ─── Carrega produtos ─── */
  useEffect(() => {
    ProductService.getAll()
      .then(({ data }) => setProducts(data.data ?? []))
      .catch((err) => alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível carregar os produtos.")))
      .finally(() => setLoadingProdutos(false));
  }, []);

  /* ─── Carrega pedido ─── */
  useEffect(() => {
    if (!id) return;

    NoteService.getById(id)
      .then((pedidoData) => {
        if (!pedidoData) {
          alert.error("Pedido não encontrado", "Não localizamos esse pedido no sistema.");
          return;
        }
        setPedido(pedidoData);
        setValorPagoAnterior(Number(pedidoData.pedido.valorPago ?? 0));
        setImagensServico(pedidoData.pedido.imagensServico ?? []);
        setMostrarQr(pedidoData.pedido.mostrarQr !== false);

        const itensOriginais = pedidoData.pedido.itensPedido ?? [];
        setItens(itensOriginais.map((item: ItemPedidoType) => ({ ...item })));
      })
      .catch((err) => alert.error(getErrorTitle(err), extractErrorMessage(err, "Erro ao carregar o pedido.")))
      .finally(() => setLoadingPedido(false));
  }, [id]);

  /* ─── Carrega o acordo de prazo ───
     Em paralelo ao pedido, e sem derrubar a nota se falhar: a venda continua
     legível e recebível mesmo que o financeiro esteja fora do ar. */
  useEffect(() => {
    if (!id) {
      setAcordo(null);
      return;
    }

    setCarregandoAcordo(true);

    ContaService.acordoDaVenda(id)
      .then(setAcordo)
      .catch(() => setAcordo(null))
      .finally(() => setCarregandoAcordo(false));
  }, [id]);

  /**
   * Relê nota e acordo juntos.
   *
   * Receber uma parcela mexe nos dois — a baixa abate o saldo da nota no
   * servidor. Recarregar só um deixaria a tela mostrando um pagamento que o
   * outro lado não conhece.
   */
  const recarregarNotaEPrazo = async () => {
    if (!id) return;

    const [pedidoAtualizado, acordoAtual] = await Promise.all([
      NoteService.getById(id).catch(() => null),
      ContaService.acordoDaVenda(id).catch(() => null),
    ]);

    if (pedidoAtualizado) {
      setPedido(pedidoAtualizado);
      setValorPagoAnterior(Number(pedidoAtualizado.pedido.valorPago ?? 0));
    }

    setAcordo(acordoAtual);
  };

  /* ─── Produtos ─── */
  /* `avisar` existe para o cadastro feito de dentro da nota: lá o produto entra
     na nota junto do "Produto cadastrado!", e dois avisos seguidos para o mesmo
     gesto só atrapalham quem está atendendo. */
  const adicionarProduto = (produtoHandle: ProductType, variacao?: Variacao, avisar = true) => {
    /*
     * A identidade da linha é PRODUTO + VARIAÇÃO.
     *
     * Antes era só o produto, e com variações isso passou a estar errado:
     * lançar a camiseta M e depois a G somaria as duas na mesma linha, e a
     * nota sairia dizendo "2 camisetas" sem dizer quais — com a baixa caindo
     * toda na primeira variação.
     */
    const mesmaLinha = (l: ItemPedidoType) =>
      l.produto.produtoId === produtoHandle.id && (l.variacaoId ?? null) === (variacao?.id ?? null);

    /* O preço da variação manda quando ela tem um; senão herda o do produto.
       Ver a nota do campo em `shared/domain/estoque.ts` sobre por que zero não
       serve como "herda". */
    const preco = variacao?.valorVendaEfetivo ?? variacao?.valorVenda ?? produtoHandle.valorVenda;

    setItens((prev) => {
      // Mesma linha já está na nota → soma a quantidade em vez de criar uma
      // segunda (duas linhas do mesmo item quebravam a edição/remoção da nota
      // no backend).
      if (prev.some(mesmaLinha)) {
        return prev.map((l) => (mesmaLinha(l) ? { ...l, quantidadeItem: l.quantidadeItem + 1 } : l));
      }

      return [
        ...prev,
        {
          itemPedidoId: gerarUID(),
          quantidadeItem: 1,
          valorVendaItem: preco,
          variacaoId: variacao?.id ?? null,
          variacaoDescricao: variacao?.descricao,
          produto: {
            nomeProduto: produtoHandle.nome,
            produtoId: produtoHandle.id,
            valorProduto: preco,
          },
        },
      ];
    });

    if (avisar) alert.toast("success", "Produto adicionado!", undefined, { position: "bottom-right", timer: 2000 });
  };

  /**
   * Um item que não está no estoque — e que não precisa estar.
   *
   * Vender e orçar é, muitas vezes, dizer um preço por algo que ainda não é
   * produto: "banner 2x1 em lona", "arte + 200 cartões", "conserto da placa",
   * "frete". Escrever essa linha exigia parar o atendimento, abrir o cadastro e
   * preencher uma ficha inteira — com o cliente no balcão esperando, por um
   * item que muitas vezes se vende uma vez só.
   *
   * VALE NA NOTA TAMBÉM, e não só na proposta. Era só do orçamento por uma
   * razão que já não existia: a venda precisa de produto de verdade (é dele que
   * sai a baixa de estoque e a soma do relatório), e a ponte para isso —
   * `materializarAvulsos` — já estava pronta e já rodava em toda nota, porque
   * a proposta convertida chegava aqui cheia de avulsos. Quem lançava a linha
   * pelo caminho do orçamento vendia; quem estava na nota, não. Era a mesma
   * venda barrada pela porta de entrada.
   *
   * A linha nasce sem `produtoId`, com preço zero para a pessoa digitar na
   * própria tabela. Nada é criado no estoque agora: quando a nota for gravada,
   * `materializarAvulsos` cria o produto ali — no instante em que ele passa a
   * ter motivo para existir. Proposta recusada e nota abandonada não deixam
   * nada no catálogo.
   *
   * Sem somar com linha igual, ao contrário do produto de catálogo: dois
   * "Banner" num orçamento costumam ser dois banners diferentes, cada um com
   * seu preço, e juntá-los apagaria a distinção que a pessoa acabou de fazer.
   */
  const adicionarAvulso = (nomeItem: string) => {
    const limpo = nomeItem.trim();

    if (!limpo) return;

    setItens((prev) => [
      ...prev,
      {
        itemPedidoId: gerarUID(),
        quantidadeItem: 1,
        valorVendaItem: 0,
        variacaoId: null,
        produto: { nomeProduto: limpo, produtoId: "", valorProduto: 0 },
      },
    ]);

    alert.toast("success", "Item avulso adicionado!", "Informe a quantidade e o preço na linha.", { position: "bottom-right", timer: 2600 });
  };

  /** A linha veio da busca livre, e não do catálogo. */
  const ehAvulso = (l: ItemPedidoType) => !String(l.produto.produtoId ?? "").trim();

  /**
   * Cadastra o produto e já o lança na nota.
   *
   * Faltar um produto no meio da venda é rotina — e mandar quem atende até
   * Estoque e de volta é o que faz a nota ser abandonada pela metade. O
   * cadastro acontece aqui, a lista da busca é relida e o item entra na nota
   * sozinho: é para isso que se cadastrou agora, e não depois.
   */
  const handleNovoProduto = async (dados: ProductFormData) => {
    setSalvandoProduto(true);

    try {
      await ProductService.create(dados);

      /* Relê a lista em vez de confiar no retorno do POST: é a mesma fonte que
         a busca usa, então o produto novo aparece nela também. */
      const { data } = await ProductService.getAll();
      const lista: ProductType[] = data.data ?? [];

      setProducts(lista);
      setNovoProduto(null);

      const criado = lista.find((p) => p.nome?.trim().toLowerCase() === dados.nome.trim().toLowerCase());

      if (criado) adicionarProduto(criado, undefined, false);

      alert.success("Produto cadastrado!", criado ? "Ele já entrou na nota." : "Ele já pode ser lançado na busca.");
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível cadastrar o produto."));
    } finally {
      setSalvandoProduto(false);
    }
  };

  const atualizarLinha = (uid: string, patch: Partial<ItemPedidoType>) => setItens((prev) => prev.map((l) => (l.itemPedidoId === uid ? { ...l, ...patch } : l)));

  /**
   * Quais linhas o servidor recusou por falta de estoque.
   *
   * Guardado por chave produto+variação, e não por índice: a pessoa vai mexer
   * na nota depois do erro (é o que se espera dela), e um índice apontaria
   * para a linha errada assim que uma fosse removida.
   *
   * Limpo a cada tentativa de salvar — marcação velha sobre uma nota já
   * corrigida é pior do que marcação nenhuma.
   */
  const chaveDaLinha = (l: ItemPedidoType) => `${l.produto.produtoId}|${l.variacaoId ?? ""}`;

  const faltaDaLinha = (l: ItemPedidoType) =>
    faltas.find((f) => `${f.produtoId}|${f.variacaoId ?? ""}` === chaveDaLinha(l));

  const removerProduto = (uid: string) => setItens((prev) => prev.filter((l) => l.itemPedidoId !== uid));

  /* ─── Totais ─── */
  const totalLiquido = useMemo(() => itens.reduce((acc, l) => acc + l.valorVendaItem * l.quantidadeItem, 0), [itens]);
  const totalBruto = useMemo(() => itens.reduce((acc, l) => acc + l.produto.valorProduto * l.quantidadeItem, 0), [itens]);
  const totalDesconto = Math.max(totalBruto - totalLiquido, 0);
  const total = totalLiquido;
  const temDesconto = totalDesconto > 0 && totalBruto > 0;

  /* Não há mais "pago nesta sessão": todo recebimento vai direto ao servidor
     e a nota é relida em seguida. O que o banco diz é o que a tela mostra —
     sem um segundo total local para divergir dele. */
  const totalPago = valorPagoAnterior;
  const pendente = Math.max(total - totalPago, 0);
  const formaPagamento = pedido?.pedido?.formaPagamento ?? "Não consta";

  /* Nota quitada: é o que libera o recibo. Comparado por valor, e não pelo
     status do pedido — nota fechada com pagamento parcial não deve emitir
     comprovante de quitação. */
  const quitada = Boolean(id) && total > 0 && totalPago >= total;

  /* ─── PIX payload ─── */
  /*
   * O QR cobra o valor digitado; vazio cobra o total.
   *
   * O teto é o próprio total: um QR pedindo mais do que a nota deve é erro de
   * digitação toda vez ("1500" onde era "150"), e quem paga por QR não confere
   * o valor — esse zero a mais vira estorno no dia seguinte.
   */
  const valorCobranca = useMemo(() => {
    const digitado = Number(cobrancaLivre.replace(/\./g, "").replace(",", "."));

    if (!cobrancaLivre.trim() || !Number.isFinite(digitado) || digitado <= 0) return total;

    return Math.min(Math.round(digitado * 100) / 100, total);
  }, [total, cobrancaLivre]);

  const pixPayload = useMemo(() => {
    if (!pixConfigurado(configPix) || valorCobranca <= 0) return "";
    return generatePixPayload({
      pixKey: configPix!.chave,
      pixKeyType: configPix!.tipoChave,
      merchantName: configPix!.beneficiario,
      merchantCity: configPix!.cidade,
      amount: valorCobranca,
      transactionId: id || `nota-${Date.now()}`,
      description: "Nota de venda",
    });
  }, [valorCobranca, id, configPix]);

  /* Data URI: é isso que faz o QR sair no PNG do download — imagem externa
     contaminaria o canvas e derrubaria a exportação inteira. */
  useEffect(() => {
    if (!pixPayload) {
      setQrCodeNota("");
      return;
    }

    let vivo = true;
    getQrCodeDataUrl(pixPayload).then((url) => vivo && setQrCodeNota(url));

    return () => {
      vivo = false;
    };
  }, [pixPayload]);

  /* ─────────────────────────── O DOCUMENTO ───────────────────────────
   *
   * O que sai impresso NÃO é esta tela.
   *
   * Durante muito tempo foi: o botão fotografava o próprio formulário
   * (`notaRef`) e o `data-sem-foto` apagava os controles da foto. Funcionava
   * até alguém comparar com a nota baixada pela LISTA, que sempre foi um
   * componente à parte — e aí eram dois documentos parecidos, divergindo em
   * silêncio a cada mexida num dos dois. O telefone do cliente só saía por um
   * caminho; o número da nota, só pelo outro; e como o formulário usa
   * breakpoints (`md:`, `lg:`), a nota baixada do celular saía com os itens em
   * cartões e o resumo em duas colunas, enquanto a do desktop saía em tabela e
   * seis colunas — a mesma venda, dois papéis.
   *
   * Agora os dois caminhos fotografam o MESMO `NotaResumo`, num nó escondido
   * de 900px. Esta tela voltou a ser o que é: onde se monta a venda.
   */
  const refDocumento = useRef<HTMLDivElement>(null);

  /**
   * A venda como o documento a lê — do estado VIVO, não do que o servidor
   * devolveu por último.
   *
   * Quem clica em "Ver nota" acabou de mexer nos itens, nas fotos ou no
   * desconto; o papel tem de mostrar o que está na tela. O que vem do `pedido`
   * é só o que a tela não tem: status, data de emissão e a forma do último
   * pagamento.
   */
  const vendaDoDocumento = useMemo<PedidoClienteType>(
    () => ({
      clienteId: clienteId ?? pedido?.clienteId ?? "",
      nomeCliente: pedido?.nomeCliente || nome || "—",
      statusCliente: pedido?.statusCliente ?? "",
      codigoEmpresa: pedido?.codigoEmpresa ?? "",
      vendedorId: pedido?.vendedorId ?? null,
      /* O vendedor gravado manda; a nota nova ainda não tem um, e aí quem
         assina é quem está emitindo. */
      nomeVendedor: pedido?.nomeVendedor || vendedor,
      pedido: {
        pedidoId: id ?? "",
        totalPedido: total,
        dataPedido: pedido?.pedido?.dataPedido ?? new Date(),
        pedidoStatus: pedido?.pedido?.pedidoStatus ?? "ABERTO",
        valorPago: totalPago,
        formaPagamento: pedido?.pedido?.formaPagamento ?? null,
        itensPedido: itens,
        imagensServico,
        mostrarQr,
      },
    }),
    [clienteId, nome, pedido, vendedor, id, total, totalPago, itens, imagensServico, mostrarQr],
  );

  /**
   * O Pix que entra no documento.
   *
   * As mesmas portas do `pixDaNota`, para o papel sair igual pelos dois
   * caminhos: sem QR desligado, sem nota cancelada e sem nota já quitada — um
   * QR numa nota paga é um convite a pagar duas vezes.
   *
   * O QR em si é o que a tela já preparou (`qrCodeNota`, um data URI pronto
   * desde que a pessoa abriu a nota), e o valor é o desta tela: o campo
   * "Cobrar" existe justamente para o sinal combinado no balcão.
   */
  const pixDoDocumento = useMemo(
    () =>
      mostrarQr && qrCodeNota && pixPayload && pendente > 0 && pedido?.pedido?.pedidoStatus !== "CANCELADO"
        ? { qrCode: qrCodeNota, payload: pixPayload, valor: valorCobranca }
        : null,
    [mostrarQr, qrCodeNota, pixPayload, pendente, pedido, valorCobranca],
  );


  /**
   * Copia o código Pix (o "copia e cola") para a área de transferência.
   *
   * É o que se manda no WhatsApp junto da foto da nota: o cliente que recebe a
   * imagem no próprio celular não tem como apontar a câmera para o QR que está
   * na tela dele — ou cola o código, ou não paga.
   *
   * `execCommand` como reserva: a API moderna exige contexto seguro, e a loja
   * que roda o sistema em `http://` na rede local ficaria sem copiar nada.
   */
  const copiarPix = async () => {
    if (!pixPayload) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(pixPayload);
      } else {
        const campo = document.createElement("textarea");

        campo.value = pixPayload;
        campo.style.cssText = "position:fixed;left:-9999px;top:0;";
        document.body.appendChild(campo);
        campo.select();
        document.execCommand("copy");
        campo.remove();
      }

      setPixCopiado(true);
      setTimeout(() => setPixCopiado(false), 2000);
      alert.toast("success", "Código Pix copiado!", "Cole na conversa com o cliente.", { position: "bottom-right", timer: 2200 });
    } catch {
      alert.error("Não foi possível copiar", "O navegador bloqueou o acesso à área de transferência.");
    }
  };

  /* ─── Nota CRUD ─── */
  const montarItens = (lista: ItemPedidoType[] = itens) =>
    lista.map((item) => ({
      produtoId: item.produto.produtoId,
      quantidade: item.quantidadeItem,
      valorVenda: item.valorVendaItem,
      /* Qual peça saiu. Sem isto o servidor baixaria o estoque do produto
         inteiro e a nota reimpressa não diria se o cliente levou a P ou a G. */
      variacaoId: item.variacaoId ?? null,
    }));

  const handleGerarOrcamento = async () => {
    const nomeCliente = (nome ?? "").trim();

    if (!nomeCliente) {
      alert.warning("Informe o cliente", "O orçamento precisa saber para quem é.");
      return;
    }

    if (itens.length === 0) {
      alert.warning("Orçamento vazio", "Adicione ao menos um item — do estoque ou avulso.");
      return;
    }

    setSavingNote(true);

    try {
      const proposta = {
        clienteNome: nomeCliente,
        clienteId: clienteId ?? null,
        clienteContato: contatoOrcamento.trim() || null,
        validade: validadeOrcamento || null,
        itens: itens.map((l) => ({
          produtoId: String(l.produto.produtoId ?? "") || null,
          nomeProduto: l.produto.nomeProduto,
          quantidade: l.quantidadeItem,
          valorUnitario: l.valorVendaItem,
        })),
      };

      /* Editando: salva por cima. Sem isso, corrigir a quantidade de um item
         deixaria duas propostas quase idênticas na lista, e o cliente com
         duas versões do mesmo orçamento. */
      if (orcamentoId) {
        await OrcamentoService.atualizar(orcamentoId, proposta);
        alert.success("Orçamento atualizado!", "A proposta foi reescrita e continua aguardando resposta.");
      } else {
        await OrcamentoService.criar(proposta);
        alert.success("Orçamento gerado!", "Ele está na aba Orçamentos, aguardando a resposta do cliente.");
      }

      onSaved?.();
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível gerar o orçamento."));
    } finally {
      setSavingNote(false);
    }
  };

  /**
   * Dá existência aos itens avulsos, no instante em que a venda vai nascer.
   *
   * Nota de venda aponta para produto: é dele que sai a baixa de estoque, é
   * nele que o relatório soma o que foi vendido, e o servidor não aceita um
   * item sem esse vínculo. O orçamento pode viver com uma linha de texto —
   * a venda não pode.
   *
   * Então o produto é criado AQUI, e não lá atrás: proposta recusada não
   * deixa nada no catálogo, e só o que foi de fato vendido vira cadastro.
   *
   * Nasce como SERVIÇO, e sem controle de estoque.
   *
   * O tipo não é detalhe de cadastro: um "banner 2x1" criado neste segundo
   * teria saldo zero, e a própria venda que o criou seria recusada por falta de
   * estoque — o item existiria só para bloquear a si mesmo. `SERVICO` não tem o
   * que estocar (ver `Produto.Tipo`), o que resolve isso e diz a verdade sobre
   * a linha: quem digita "conserto da placa" ou "arte + 200 cartões" está
   * vendendo trabalho, não tirando peça da prateleira.
   *
   * E é esse tipo que faz a venda virar produção: o quadro recebe a nota que
   * tem serviço, e não a que só entrega estoque pronto. Ver
   * `ProducaoAutomaticaService` na API.
   *
   * Antes de criar, procura pelo nome: orçar "banner 2x1" para dez clientes
   * não pode render dez produtos iguais no estoque.
   */
  const materializarAvulsos = async (lista: ItemPedidoType[]): Promise<ItemPedidoType[]> => {
    const avulsos = lista.filter(ehAvulso);

    if (avulsos.length === 0) return lista;

    let catalogo = products;

    const acharPorNome = (nomeItem: string) =>
      catalogo.find((p) => p.nome?.trim().toLowerCase() === nomeItem.trim().toLowerCase());

    /* Nomes distintos, para não criar dois produtos quando a mesma linha
       aparece duas vezes na nota. */
    const pendentes = [...new Set(avulsos.map((l) => l.produto.nomeProduto.trim()))].filter((n) => n && !acharPorNome(n));

    for (const nomeItem of pendentes) {
      const preco = avulsos.find((l) => l.produto.nomeProduto.trim() === nomeItem)?.valorVendaItem ?? 0;

      await ProductService.create({
        nome: nomeItem,
        tipo: "SERVICO",
        valorCompra: 0,
        valorVenda: preco,
        quantidade: 0,
        /* Sem contagem, a venda que acabou de criar o item não esbarra no
           saldo zero dele. Explícito e não herdado do tipo: é a garantia que
           não depende de o cadastro decidir o que fazer com serviço. */
        controlaEstoque: false,
        permiteVendaSemEstoque: false,
        estoqueMinimo: null,
        observacoes: "Criado a partir de um item avulso lançado na nota.",
      });
    }

    if (pendentes.length > 0) {
      /* Relê o catálogo uma vez só, depois de criar todos: é dele que saem os
         ids, e uma leitura por item seria N requisições para a mesma lista. */
      const { data } = await ProductService.getAll();

      catalogo = (data.data ?? []) as ProductType[];
      setProducts(catalogo);
    }

    return lista.map((l) => {
      if (!ehAvulso(l)) return l;

      const achado = acharPorNome(l.produto.nomeProduto);

      return achado ? { ...l, produto: { ...l.produto, produtoId: achado.id } } : l;
    });
  };

  /**
   * Manda a nota para o cliente, pela conversa.
   *
   * O documento sai do MESMO nó que o botão "Ver nota" usa (`refDocumento`, o
   * `NotaResumo` escondido), então o que vai pela conversa é o mesmo papel que
   * sai pela lista de Vendas — e não uma foto desta tela. PNG abre como foto na
   * conversa — o cliente vê sem baixar, e é o que ele quer no celular; PDF vai
   * como anexo com nome, que é o que serve para guardar e imprimir.
   *
   * O base64 vai sem o prefixo `data:`: o WhatsApp espera o conteúdo cru, e o
   * prefixo junto entrega um arquivo corrompido do outro lado.
   */
  const enviarNotaWhatsapp = async (formato: "png" | "pdf") => {
    if (!conversaId) return;

    setEnviandoWhats(formato);

    try {
      const png = await gerarBlobNota(modoOrcamento ? notaRef : refDocumento);
      const empresa = enterprise?.nomeFantasia ?? "nota";

      const { arquivo, nome: nomeArquivo } =
        formato === "pdf"
          ? await gerarPdfNota(png, empresa)
          : { arquivo: png, nome: `${modoOrcamento ? "orcamento" : "nota"}-${empresa}.png` };

      const base64 = await new Promise<string>((pronto, falhou) => {
        const leitor = new FileReader();

        leitor.onerror = () => falhou(new Error("Não foi possível ler o arquivo."));
        leitor.onload = () => pronto(String(leitor.result).split(",")[1] ?? "");
        leitor.readAsDataURL(arquivo);
      });

      await CrmService.enviarArquivo(conversaId, {
        base64,
        mime: formato === "pdf" ? "application/pdf" : "image/png",
        nome: nomeArquivo,
        legenda: modoOrcamento ? "Segue o orçamento. Qualquer dúvida é só chamar!" : "Segue a nota da sua compra. Obrigado!",
      });

      setPerguntarEnvio(false);
      alert.success("Enviado!", "A nota já está na conversa do cliente.");
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível enviar pelo WhatsApp."));
    } finally {
      setEnviandoWhats(null);
    }
  };

  const handleSalvar = async () => {
    if (!clienteId) {
      alert.warning("Sem cliente", "Selecione um cliente para emitir a nota.");
      return;
    }
    if (itens.length === 0) {
      alert.warning("Nota vazia", "Adicione ao menos um produto à nota.");
      return;
    }
    if (itens.every((l) => l.quantidadeItem <= 0)) {
      alert.warning("Quantidade inválida", "Informe a quantidade dos produtos.");
      return;
    }

    /* Sem exigir Pix para salvar.
       Antes a primeira nota travava até configurar a chave — mas venda em
       dinheiro ou cartão não depende de Pix, e o vendedor não pode nem
       configurar (é do usuário master). Ele ficava preso sem saída. Sem chave,
       a nota simplesmente sai sem QR. */

    /* Marcação da tentativa anterior sai antes desta: mantida, ela apontaria
       para um problema que a pessoa acabou de corrigir. */
    setFaltas([]);

    setSavingNote(true);
    try {
      /*
       * Os itens avulsos viram produto ANTES de qualquer coisa ir para o
       * servidor: dali em diante a nota é uma nota comum, e nenhuma das duas
       * ramificações abaixo precisa saber que essa distinção existiu.
       */
      const itensDaNota = await materializarAvulsos(itens);

      /* A tela passa a mostrar as linhas já vinculadas — sem isto, o selo de
         "item avulso" continuaria numa linha que não é mais avulsa, e um
         segundo salvamento tentaria criar o produto de novo. */
      if (itensDaNota !== itens) setItens(itensDaNota);

      const semVinculo = itensDaNota.find(ehAvulso);

      if (semVinculo) {
        alert.error("Não foi possível preparar a nota", `O item “${semVinculo.produto.nomeProduto}” não pôde virar produto. Cadastre-o em Estoque e tente de novo.`);
        return;
      }

      if (id) {
        // UPDATE — usa PedidoUpdateDto. Atenção: esse endpoint lê `produtosPedido`,
        // não `itensPedido`.
        const payload: PedidoUpdateDto = { clienteId, produtosPedido: montarItens(itensDaNota), imagensServico, mostrarQr };
        await NoteService.update(payload, id);

        // Não há pagamento pendente a gravar junto: registrar já grava direto
        // no servidor, então salvar a nota cuida só dos itens.
        alert.success("Nota alterada!", "As alterações foram salvas com sucesso.");
      } else {
        // CREATE — usa NovoPedidoDto. A nota criada NÃO fecha a tela: quem
        // paga "depois de salvar" precisa da nota aberta para registrar o
        // pagamento na sequência. O id novo mantém a nota em modo edição.
        const payload: NovoPedidoDto = { clienteId, itensPedido: montarItens(itensDaNota), imagensServico, mostrarQr };
        const criada = await NoteService.create(payload);

        const novoId = criada?.data?.data?.[0] as string | undefined;

        if (novoId) setPedidoId(novoId);
        setFocarPagamento(true);
        alert.success("Nota criada!", "A venda foi registrada. Agora registre o pagamento.");

        /* Nasceu dentro de uma conversa: o documento tem para onde ir agora
           mesmo — ver `enviarNotaWhatsapp`. */
        if (conversaId) setPerguntarEnvio(true);

        /*
         * A proposta some agora que a venda existe.
         *
         * Depois do `novoId`, e não antes: a ordem é o que garante que nunca
         * se apague um orçamento sem a venda no lugar dele. Se a exclusão
         * falhar, o orçamento continua na lista — visível, e resolvível pelo
         * botão de apagar. É a falha certa das duas possíveis.
         */
        if (novoId && converterOrcamentoId) {
          try {
            await OrcamentoService.excluir(converterOrcamentoId);
          } catch {
            /* A venda é o que importa e já está gravada. */
          }
        }
      }

      // Pagamentos acumulados seguem gravados (update) ou prontos (create).
      // Só fecha a tela quando o usuário decide fechar — não ao salvar.
      if (id) onSaved?.();
    } catch (err) {
      /*
       * Falta de estoque não é "erro ao salvar".
       *
       * O servidor recusa com 409 e manda a lista item a item. Tratada como
       * erro genérico, a pessoa lê "Erro ao salvar a nota. Tente novamente." —
       * e tentar de novo dá exatamente o mesmo resultado, porque o problema
       * não é a nota, é o estoque. Aqui a mensagem nomeia cada item, diz
       * quanto foi pedido e quanto existe, e as linhas ficam marcadas na
       * tabela para não ser preciso conferir uma a uma.
       */
      const faltas = extrairFaltas(err);

      if (faltas.length > 0) {
        setFaltas(faltas);

        alert.error(
          "Sem estoque para fechar",
          faltas
            .map((f) =>
              f.motivo === "INSUMO"
                ? `${f.insumoNome}: precisa de ${f.solicitado}, há ${f.disponivel}`
                : `${f.variacaoDescricao ? `${f.produtoNome} (${f.variacaoDescricao})` : f.produtoNome}: pediu ${f.solicitado}, há ${f.disponivel}`,
            )
            .join(" · "),
        );

        return;
      }

      alert.error(getErrorTitle(err), extractErrorMessage(err, "Erro ao salvar a nota. Tente novamente."));
    } finally {
      setSavingNote(false);
    }
  };

  /**
   * Cancela a nota — não apaga.
   *
   * Venda errada precisa sumir da operação, mas não da história: o cliente
   * lembra do pedido que fez e alguém vai ter que explicar o que aconteceu.
   * Apagar do banco não deixa o que explicar. Cancelada, a nota mantém itens,
   * valor e data, e some da lista de notas ativas.
   *
   * O servidor recusa cancelar nota paga (dinheiro que entrou sai pelo
   * financeiro, com estorno) — a mensagem dele chega pronta para o balcão.
   */
  /**
   * Apaga a nota de vez.
   *
   * Só aparece depois de cancelada e só para o gestor — cancelar é do balcão,
   * apagar é de quem responde pelo histórico. O servidor recusa igual se
   * alguém chamar por fora, inclusive quando há pagamento registrado.
   */
  const handleApagar = async () => {
    if (!id) return;

    setApagando(true);

    try {
      await NoteService.excluir(id);

      setModalApagar(false);
      alert.success("Nota apagada", "Ela saiu do histórico para sempre.");

      /* `onSaved` é o mesmo caminho do cancelar: fecha o modal e recarrega a
         lista. A nota não existe mais — deixar a tela aberta nela mostraria
         um documento que o servidor já não conhece. */
      onSaved?.();
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível apagar a nota."));
    } finally {
      setApagando(false);
    }
  };

  const handleCancelar = async () => {
    if (!id) return;

    setCancelando(true);

    try {
      await NoteService.cancelar(id);
      setModalCancelar(false);
      alert.success("Nota cancelada!", "Ela sai das notas ativas, mas continua no histórico.");
      onSaved?.();
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível cancelar a nota."));
    } finally {
      setCancelando(false);
    }
  };

  /* Recebe valor e forma por parâmetro: o formulário compartilhado tem o
     próprio estado, e depender do estado desta tela criava um render de
     atraso — o primeiro clique lançava o valor anterior. */
  /**
   * Registra o pagamento e volta para a nota — uma etapa só.
   *
   * Antes eram duas: "Adicionar pagamento" empilhava numa lista de pendentes
   * e um segundo botão "Confirmar" é que gravava. A separação existia para
   * lançar "50 no Pix e 30 em dinheiro" como um recebimento só, mas cobrava
   * dois cliques de todo mundo para atender o caso raro — e deixava o caso
   * comum com um pagamento na tela que parecia gravado e não estava.
   *
   * Agora cada recebimento vai direto ao servidor. Pagamento misto continua
   * possível: são dois lançamentos em vez de um, o que é mais fiel ao que
   * aconteceu no balcão.
   */
  const handleAdicionarPagamento = async (valorRecebido?: number, formaRecebida?: string) => {
    const valorFinal = valorRecebido ?? valorPagamento;
    const tipoFinal = formaRecebida ?? tipoPagamento;

    if (!tipoFinal || valorFinal <= 0) return;
    if (!id) {
      alert.warning("Salve a nota primeiro", "A nota precisa ser salva antes de registrar pagamentos.");
      return;
    }

    setConfirmandoPagamento(true);

    try {
      await FinanceiroService.registrarPagamentoNota(id, valorFinal, tipoFinal);

      const pedidoAtualizado = await NoteService.getById(id);

      if (pedidoAtualizado) {
        setPedido(pedidoAtualizado);
        setValorPagoAnterior(Number(pedidoAtualizado.pedido.valorPago ?? 0));
      }

      setTipoPagamento("");
      setValorPagamento(0);
      /* O destaque "nota salva — registre o pagamento" já cumpriu o papel. */
      setFocarPagamento(false);

      alert.success("Pagamento registrado!", "O valor foi somado ao pagamento da nota.");

    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível registrar o pagamento."));
    } finally {
      setConfirmandoPagamento(false);
    }
  };

  const statusPedido = pedido?.pedido?.pedidoStatus;

  /*
   * O que trava o botão muda conforme o documento.
   *
   * Nota exige cliente CADASTRADO: ela vira pedido, e pedido sem cliente não
   * tem a quem cobrar. Orçamento não — ele é montado para nome livre, digitado
   * no PDV, justamente para propor a quem ainda não é cliente.
   *
   * Enquanto os dois compartilhavam a mesma regra, o "Gerar orçamento" nascia
   * desabilitado para sempre: o fluxo do PDV abre a proposta sem `clienteId`,
   * então a condição nunca era satisfeita e o clique não fazia nada. Era esse
   * o "não consigo cadastrar o orçamento".
   */
  const semDestinatario = modoOrcamento ? !(nome ?? "").trim() : !clienteId;

  const salvarDesabilitado = semDestinatario || itens.length === 0;

  /* ─── Classes repetidas ─── */
  const lblResumo = "block text-[11px] uppercase tracking-[0.08em] text-faint";
  const valResumo = "mt-1 block truncate text-sm text-ink";

  return (
    <>
    {/*
      * `min-h-0` em toda a corrente de altura.
      *
      * Sem ele, a nota que nasce cheia — é o caso de editar um orçamento, que
      * abre com os itens da proposta — era recortada pela metade em vez de
      * rolar: cada caixa flex herda `min-height: auto`, se recusa a encolher
      * abaixo do próprio conteúdo e estoura a altura do modal, que corta o
      * excedente no `overflow-hidden`. A venda nova não mostrava o defeito
      * porque abre vazia e só cresce um item por vez.
      */}
    <div className="flex h-full min-h-0 flex-col">


      {/* ════════════ MODAL: PAGAMENTOS ════════════ */}

      {/* ════════════ MODAL: NOVO PRODUTO ════════════
          Cadastro sem sair da nota: abre pela busca de produtos, já com o nome
          que estava digitado. */}
      <Modal open={novoProduto !== null} onClose={() => setNovoProduto(null)} title="Novo produto" subtitle="Ele entra na nota assim que for salvo">
        {novoProduto !== null && (
          <ProdutoForm
            /* `key` com o termo: reabrir a busca com outro nome precisa
               remontar o formulário — `defaultValues` do react-hook-form só
               vale na montagem. */
            key={novoProduto}
            defaultValues={novoProduto ? { nome: novoProduto } : undefined}
            submitText={salvandoProduto ? "Salvando..." : "Cadastrar produto"}
            onCancel={() => setNovoProduto(null)}
            onSubmit={handleNovoProduto}
          />
        )}
      </Modal>

      {/* ════════════ MODAL: CANCELAR ════════════ */}
      {/*
        Apagar pede uma confirmação mais dura que cancelar, porque é.
        Cancelar deixa a nota no histórico, riscada; apagar não deixa nada, e
        não há como desfazer. O texto diz o que some, e o botão diz o que faz.
      */}
      <Modal open={modalApagar} onClose={() => setModalApagar(false)} title="Apagar a nota para sempre" subtitle="Não há como desfazer" accent="rgb(var(--danger))" maxWidth="max-w-sm">
        <div className="flex flex-col gap-4">
          <p className="text-[13px] leading-relaxed text-mist">
            A nota sai do histórico junto com os itens e as cobranças geradas por ela. O movimento de estoque fica —
            ele é o registro do que saiu e voltou da prateleira.
          </p>

          <p className="rounded-xl border border-warning/25 bg-warning/[0.07] px-3 py-2.5 text-[12px] leading-relaxed text-warning">
            Se esta nota tiver algum pagamento registrado, o servidor recusa: apagá-la sumiria com dinheiro que passou
            pelo caixa.
          </p>

          <div className="flex justify-end gap-2">
            <button onClick={() => setModalApagar(false)} className="h-10 rounded-xl bg-fg/[0.05] px-4 text-sm text-ink transition-colors hover:bg-fg/[0.1]">
              Voltar
            </button>
            <button
              disabled={apagando}
              onClick={handleApagar}
              className="flex h-10 items-center gap-2 rounded-xl bg-danger px-4 text-sm text-white transition-colors hover:brightness-110 disabled:opacity-50"
            >
              {apagando && <Loader2 size={14} className="animate-spin" />}
              Apagar para sempre
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={modalCancelar} onClose={() => setModalCancelar(false)} title="Cancelar nota" subtitle="A nota sai da operação, mas fica no histórico" accent="rgb(var(--danger))" maxWidth="max-w-sm">
        <p className="text-sm leading-relaxed text-mist">
          A nota deixa de contar como venda ativa e passa a aparecer como <span className="text-danger">cancelada</span>. Itens, valores e data continuam registrados.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setModalCancelar(false)} className="h-10 rounded-xl bg-fg/[0.05] px-4 text-sm text-ink transition-colors hover:bg-fg/[0.1]">
            Voltar
          </button>
          <button
            onClick={handleCancelar}
            disabled={cancelando}
            className="flex h-10 items-center gap-2 rounded-xl bg-danger px-4 text-sm text-white transition-colors hover:brightness-110 disabled:opacity-50"
          >
            {cancelando && <Loader2 size={15} className="animate-spin" />}
            Cancelar nota
          </button>
        </div>
      </Modal>

      {/* ════════════ NOTA ════════════ */}
      {/* `flex-1` em vez de `h-full`: a altura vem da corrente flex, não de uma
          porcentagem que depende do pai ter altura definida — dentro do `Sheet`
          do celular ela não tem, e o `100%` virava altura automática. */}
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl bg-surface ring-1 ring-fg/[0.06]">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-fg/[0.05] px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            {loadingPedido ? (
              <Skeleton className="h-5 w-24 rounded-full" />
            ) : statusPedido ? (
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] tracking-wide ring-1 ${STATUS_STYLE[statusPedido] ?? "bg-fg/[0.05] text-mist"}`}>{statusPedido}</span>
            ) : modoOrcamento ? (
              <span className="inline-flex items-center rounded-full bg-warning/[0.15] px-3 py-1 text-[11px] text-warning ring-1 ring-warning/30">PROPOSTA</span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-accent/[0.12] px-3 py-1 text-[11px] text-accent-soft ring-1 ring-accent/25">NOVA NOTA</span>
            )}
          </div>

          {/* Cancelar fica no canto oposto ao status: são as duas pontas da
              vida da nota — em que pé ela está, e como encerrá-la. Longe do
              "Salvar" do rodapé, também, para não errar o alvo com pressa. */}
          {!modoOrcamento && id && statusPedido !== "CANCELADO" && (
            <button
              title="Cancelar nota"
              aria-label="Cancelar nota"
              onClick={() => setModalCancelar(true)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-danger/20 hover:text-danger"
            >
              <Trash2 size={15} />
            </button>
          )}

          {/*
            Apagar de vez só existe DEPOIS de cancelada, e só para o gestor.
            Substitui o cancelar no mesmo canto — a nota já está cancelada, não
            há o que cancelar de novo, e dois botões vermelhos lado a lado num
            documento seriam um convite a errar o alvo.
          */}
          {!modoOrcamento && id && statusPedido === "CANCELADO" && ehGestor(user) && (
            <button
              title="Apagar esta nota do histórico, para sempre"
              aria-label="Apagar a nota definitivamente"
              onClick={() => setModalApagar(true)}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[11.5px] text-faint transition-colors hover:bg-danger/20 hover:text-danger"
            >
              <Trash2 size={15} />
              <span className="hidden sm:inline">Apagar</span>
            </button>
          )}
        </div>

        {/* Conteúdo da nota (capturado no PNG) — é ESTE que rola. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Largura limitada e centralizada.
              Sem teto, a nota acompanhava o monitor: em tela larga, o nome do
              cliente ficava a meia tela do valor, e a tabela de itens virava
              linhas com um vão enorme no meio. 900px é o suficiente para as
              cinco colunas de item sem espalhar. */}
          {/*
            Os dados da proposta — FORA do documento, de propósito.

            São dois campos de quem atende, não linhas do papel: o `notaRef`
            começa logo abaixo, então nada daqui entra no PNG. Ficariam dentro
            com `data-sem-foto`, mas campo de formulário é o caso em que o
            `html-to-image` mais escorrega (o clone não leva o valor digitado),
            e o risco de um orçamento sair com o telefone em branco não paga a
            economia de uma faixa.

            O que se digita aqui aparece impresso logo abaixo, na
            identificação: telefone na linha do telefone, data na de validade.
          */}
          {modoOrcamento && (
            <div className="mx-auto mb-3 flex w-full max-w-[900px] flex-wrap items-end gap-3 rounded-xl border border-fg/[0.06] bg-fg/[0.02] px-4 py-3">
              <label className="flex min-w-[180px] flex-1 flex-col gap-1">
                <span className="text-[10.5px] uppercase tracking-[0.1em] text-faint">Telefone do cliente</span>
                <input
                  value={contatoOrcamento}
                  onChange={(e) => setContatoOrcamento(maskPhone(e.target.value))}
                  inputMode="tel"
                  placeholder="(00) 00000-0000"
                  className="h-10 w-full rounded-lg border border-fg/[0.08] bg-surface px-3 text-[14px] text-ink outline-none focus:border-accent/60"
                />
              </label>

              <label className="flex min-w-[160px] flex-col gap-1">
                <span className="text-[10.5px] uppercase tracking-[0.1em] text-faint">Válido até</span>
                <input
                  type="date"
                  value={validadeOrcamento}
                  onChange={(e) => setValidadeOrcamento(e.target.value)}
                  className="h-10 w-full rounded-lg border border-fg/[0.08] bg-surface px-3 text-[14px] text-ink outline-none focus:border-accent/60"
                />
              </label>

              {/* O prazo padrão de volta num clique: quem mexeu na data e se
                  perdeu não precisa contar quinze dias no calendário. */}
              <button
                type="button"
                onClick={() => setValidadeOrcamento(emDias(PRAZO_PADRAO_DIAS))}
                className="h-10 shrink-0 rounded-lg border border-fg/[0.08] px-3 text-[12px] text-mist transition-colors hover:border-accent/40 hover:text-accent-soft"
              >
                {PRAZO_PADRAO_DIAS} dias
              </button>
            </div>
          )}

          <div ref={notaRef} className="relative mx-auto flex w-full max-w-[900px] flex-col overflow-hidden bg-surface">
            {/* Wallpaper da nota: imagem de fundo com overlay translúcido —
                bonito e transparente, com o conteúdo legível por cima. Entra
                no PNG/PDF porque faz parte do nó rasterizado. */}
            <FundoNota imagem={enterprise?.notaBackground} />

            <div className="relative flex flex-col">
            {/* Cabeçalho */}
            <div className="border-b border-fg/[0.05] p-6">
              {loadingPedido ? (
                <SkeletonInvoiceHeader />
              ) : (
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <HeaderInterprise />
                  <div className="md:text-right">
                    <h2 className="text-xl leading-none text-ink md:text-2xl">{modoOrcamento ? "ORÇAMENTO" : "Nota de Venda"}</h2>
                    <p className="mt-1.5 text-sm text-mist">Data: {formatDate(pedido?.pedido?.dataPedido ?? new Date())}</p>
                  </div>
                </div>
              )}
            </div>

            {/*
             * Identificação empilhada à esquerda, QR à direita.
             *
             * Antes cliente e telefone dividiam a linha e o QR ficava lá
             * embaixo, no fim da nota. Quem recebe a foto pelo WhatsApp lê de
             * cima para baixo e para no primeiro bloco: pôr o código de
             * pagamento ao lado de para-quem-é resolve a nota num olhar.
             */}
            <div className="flex flex-col gap-6 px-6 pt-6 sm:flex-row sm:items-start sm:gap-8">
              {/*
               * Lista compacta, não três caixas de formulário.
               *
               * Eram campos de 44px com moldura e fundo — pareciam editáveis
               * sem ser, e sozinhos ocupavam mais altura que o QR ao lado. Numa
               * nota isto é dado impresso: rótulo pequeno, valor legível, uma
               * linha fina separando. Ganha-se metade da altura e a leitura
               * melhora.
               */}
              {/*
               * Sem moldura: o que separa as linhas é espaço, não borda.
               *
               * Caixa dentro de caixa dentro do cartão da nota empilha três
               * contornos na mesma região e faz a leitura pesar. Retirando a
               * borda e abrindo o respiro, os mesmos dados ocupam a mesma
               * largura e a nota fica mais limpa — que é o que uma nota deve
               * parecer: papel, não formulário.
               */}
              {/* Sem ícone. Numa nota, o que o cliente lê é o dado — o símbolo
                  ao lado do rótulo era ruído numa peça que já tem pouco espaço
                  e vai impressa. */}
              <dl className="flex min-w-0 flex-1 flex-col gap-3.5">
                {[
                  { rotulo: "Cliente", valor: pedido?.nomeCliente || nome || "—", extra: documentoCliente },
                  { rotulo: "Telefone", valor: telefoneCliente || "Não informado", extra: emailCliente },
                  /* Na proposta, o lugar do vendedor é do PRAZO — ver a nota
                     do `OrcamentoNota` sobre por que o nome de quem vendeu não
                     vai no papel que o cliente leva. */
                  modoOrcamento
                    ? {
                        rotulo: "Validade",
                        valor: validadeOrcamento ? `Válido até ${formatDate(validadeOrcamento)}` : "Sem prazo definido",
                        extra: `Emitido em ${dataEmissao}`,
                      }
                    : { rotulo: "Vendedor", valor: vendedor, extra: dataEmissao },
                ].map((linha) => (
                  <div key={linha.rotulo} className="min-w-0">
                    <dt className="text-[10.5px] uppercase tracking-[0.1em] text-faint">{linha.rotulo}</dt>
                    <dd className="mt-0.5 min-w-0 truncate text-[14.5px] leading-snug text-ink">{loadingPedido ? <Skeleton className="h-4 w-40" /> : linha.valor}</dd>
                    {linha.extra && !loadingPedido && <dd className="truncate text-[11.5px] text-faint">{linha.extra}</dd>}
                  </div>
                ))}
              </dl>

              {/* ─────────────────── As fotos do serviço ───────────────────
                  Elas ocupam o lugar que era do QR — e a troca é a resposta a
                  duas perguntas que estavam na ordem errada.

                  O QR pedia pagamento no alto da nota, antes de o cliente ter
                  visto o que comprou; desceu para o pé, depois do resumo (ver
                  "Pagamento via Pix"). No lugar dele entra o que a nota de
                  serviço precisa mostrar cedo: a foto do que foi feito. É a
                  mesma lógica da guia no acompanhamento — "é o meu mesmo?"
                  vem antes de "quanto é?".

                  Grandes de propósito. Como área de upload, um quadrado de
                  70px é alvo ruim no celular e não deixa conferir nada do que
                  foi enviado; como parte do documento, miniatura de estampa
                  não prova coisa nenhuma. Aqui cada uma nasce com a largura da
                  coluna e cresce até a da nota no celular.

                  Duas, e não uma lista aberta: a nota é documento de página
                  única e elas dividem a largura. Com três, cada uma vira
                  miniatura ilegível; com uma só, não dá para mostrar o par
                  "como estava / como ficou". Ver a migration 057.

                  Os CONTROLES (enviar, remover) são `data-sem-foto` —
                  ferramenta de quem atende. As imagens em si NÃO: elas são o
                  documento. */}
              {!modoOrcamento && (
                <div className="w-full shrink-0 sm:w-[300px]">
                  {/* Sem foto nenhuma o rótulo fica fora da nota impressa: uma
                      seção "Fotos do serviço" vazia num PDF que vai para o
                      cliente parece defeito, não espaço reservado. */}
                  <span {...(imagensServico.length === 0 ? { "data-sem-foto": true } : {})} className="text-[10.5px] uppercase tracking-[0.1em] text-faint">
                    Fotos do serviço
                  </span>

                  <div className="mt-2 grid grid-cols-2 gap-2.5">
                    {[0, 1].map((slot) => {
                      const url = imagensServico[slot] ?? null;

                      /* Slot vazio só existe para quem edita. Na foto da nota
                         sobra a imagem que existe — uma ou duas, sem buraco. */
                      if (!url) {
                        return (
                          <div key={slot} data-sem-foto className="aspect-square">
                            <UploadImagem
                              tipo="servico"
                              formato="miniatura"
                              rotulo={`Foto ${slot + 1}`}
                              valor={null}
                              onChange={(nova) => {
                                if (!nova) return;

                                /* Preenche o primeiro buraco em vez de escrever
                                   no índice do slot: com a foto 1 vazia e a 2
                                   preenchida, gravar por índice deixaria um
                                   `undefined` no meio do array — e ele viraria
                                   `null` no JSON e um quadrado quebrado na nota. */
                                setImagensServico((antes) => [...antes, nova].slice(0, 2));
                              }}
                            />
                          </div>
                        );
                      }

                      return (
                        <div key={slot} className="relative aspect-square overflow-hidden rounded-xl border border-fg/[0.08]">
                          <img src={url} alt={`Foto ${slot + 1} do serviço`} className="h-full w-full object-cover" />

                          <button
                            type="button"
                            data-sem-foto
                            onClick={() => setImagensServico((antes) => antes.filter((_, i) => i !== slot))}
                            aria-label={`Remover a foto ${slot + 1}`}
                            className="focus-ring absolute right-1.5 top-1.5 grid h-7 w-7 cursor-pointer place-items-center rounded-lg bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-danger"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/*
              Busca logo acima da tabela, não dentro dela.

              Como célula, a lista de sugestões era engolida pelo
              `overflow-hidden` do quadro da tabela: as opções existiam no DOM e
              nunca apareciam na tela. Aqui a lista tem para onde crescer.

              Largura contida (`max-w-md`): o campo recebe um nome de produto,
              não um parágrafo — esticado na largura da nota ele virava uma
              faixa vazia atravessando a tela.

              `data-sem-foto`: é ferramenta de quem atende, não informação do
              cliente — fica de fora do PNG.
            */}
            <div data-sem-foto className="hidden px-6 pt-6 md:block">
              <div className="max-w-md">
                <BuscaProduto produtos={products} carregando={loadingProdutos} onAdicionar={adicionarProduto} onCadastrar={setNovoProduto} onItemAvulso={adicionarAvulso} />
              </div>
            </div>

            {/* Tabela de itens */}
            <div className="hidden px-6 pt-3 md:block">
              {/* Sem altura máxima e sem rolagem própria aqui. O teto de 42vh
                  cortava a tabela pela metade na tela e, no download, capturava
                  só a parte visível — nota com muitos itens saía truncada. Quem
                  rola é o container da nota, um nível acima. */}
              <div className="overflow-hidden rounded-xl border border-fg/[0.06]">
                <div>
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-surface-raised">
                      <tr className="border-b border-fg/[0.06] text-[11px] uppercase tracking-[0.08em] text-faint">
                        <td className="px-3 py-2.5 text-left">Produto</td>
                        <td className="px-3 py-2.5 text-left">Qtde</td>
                        <td className="px-3 py-2.5 text-left">V. Unit</td>
                        <td className="px-3 py-2.5 text-left">Subtotal</td>
                        <td className="px-3 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-fg/[0.05]">
                      {loadingPedido ? (
                        Array.from({ length: 4 }).map((_, i) => <SkeletonInvoiceRow key={i} />)
                      ) : itens.length > 0 ? (
                        itens.map((item) => {
                          const falta = faltaDaLinha(item);

                          return (
                          <tr key={item.itemPedidoId} className={`transition-colors ${falta ? "bg-danger/[0.08]" : "hover:bg-fg/[0.03]"}`}>
                            <td className="max-w-[280px] p-2 align-middle">
                              <p className="truncate px-1 text-ink" title={item.produto.nomeProduto}>
                                {item.produto.nomeProduto}
                                {/* A variação vira selo ao lado do nome: sem ela,
                                    duas linhas de "Camiseta preta" ficam idênticas
                                    na nota e o cliente não sabe o que levou. */}
                                {item.variacaoDescricao && (
                                  <span className="ml-1.5 rounded bg-fg/[0.07] px-1.5 py-px text-[10px] text-mist">{item.variacaoDescricao}</span>
                                )}

                                {/* `data-sem-foto`: é recado para quem monta a
                                    proposta, não para o cliente. No papel que
                                    ele recebe, item avulso e produto de
                                    catálogo são a mesma coisa — uma linha com
                                    um preço. */}
                                {ehAvulso(item) && (
                                  <span data-sem-foto className="ml-1.5 rounded bg-warning/[0.15] px-1.5 py-px text-[10px] text-warning">avulso</span>
                                )}
                              </p>
                              {falta && (
                                <p className="px-1 text-[10.5px] text-danger">
                                  {falta.motivo === "INSUMO"
                                    ? `falta ${falta.insumoNome} (há ${falta.disponivel})`
                                    : `só há ${falta.disponivel} em estoque`}
                                </p>
                              )}
                            </td>
                            <td className="p-2 align-middle">
                              <input
                                type="number"
                                min={0}
                                inputMode="numeric"
                                value={item.quantidadeItem}
                                /* Clicar já seleciona o que está lá, e digitar
                                   SUBSTITUI. Sem isto, o campo com 0 (ou com a
                                   quantidade anterior) recebia o dígito ao lado
                                   do que já havia — "0" virava "01", "02" — e
                                   corrigir custava selecionar e apagar antes de
                                   cada troca. Numa nota de dez itens isso é dez
                                   vezes o mesmo trabalho. */
                                onFocus={(e) => e.currentTarget.select()}
                                onChange={(e) => atualizarLinha(item.itemPedidoId, { quantidadeItem: Math.max(0, Number(e.target.value) || 0) })}
                                /* Número menor que o texto da linha: a caixa continua
                                   com alvo de toque confortável, mas o valor para de
                                   competir com o nome do produto. */
                                className="h-9 w-16 rounded-lg border border-fg/[0.06] bg-fg/[0.03] px-2 text-center text-[12.5px] tabular-nums text-ink outline-none focus:border-accent/60"
                              />
                            </td>
                            <td className="p-2 align-middle">
                              <div className="flex items-center gap-1.5">
                                <MoneyInput value={item.valorVendaItem} onChange={(v) => atualizarLinha(item.itemPedidoId, { valorVendaItem: v })} className="h-9 w-24 rounded-lg border border-fg/[0.06] bg-fg/[0.03] px-2 text-center text-[12.5px] tabular-nums text-ink outline-none focus:border-accent/60" />
                                {item.valorVendaItem !== item.produto.valorProduto && <span className="text-[10px] text-mist line-through">{formatCurrency(item.produto.valorProduto)}</span>}
                              </div>
                            </td>
                            <td className="p-2 align-middle">
                              <p className="flex h-9 items-center rounded-lg bg-fg/[0.03] px-3 text-[12.5px] tabular-nums text-ink">{formatCurrency(item.valorVendaItem * item.quantidadeItem)}</p>
                            </td>
                            <td className="p-2 text-center align-middle">
                              <button title="Remover" onClick={() => removerProduto(item.itemPedidoId)} className="grid h-8 w-8 place-items-center rounded-lg text-faint transition-colors hover:bg-danger/25 hover:text-danger">
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-mist">
                            <p className="text-sm">{modoOrcamento ? "Nenhum item no orçamento" : "Nenhum produto na nota"}</p>
                            <p className="mt-2 text-[12px] text-faint">
                              Busque no estoque — ou digite o item e tecle Enter para lançar avulso.
                            </p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Mobile — busca de produtos, fora da foto da nota */}
            <div data-sem-foto className="px-6 pt-5 md:hidden">
              <BuscaProduto produtos={products} carregando={loadingProdutos} onAdicionar={adicionarProduto} onCadastrar={setNovoProduto} onItemAvulso={adicionarAvulso} />
            </div>

            {/* Mobile */}
            <div className="space-y-3 px-6 pt-6 md:hidden">
              {loadingPedido ? (
                Array.from({ length: 3 }).map((_, i) => <SkeletonInvoiceCard key={i} />)
              ) : itens.length > 0 ? (
                itens.map((item) => (
                  <div key={item.itemPedidoId} className="rounded-xl border border-fg/[0.06] bg-fg/[0.03] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 text-sm text-ink">
                        {item.produto.nomeProduto}
                        {item.variacaoDescricao && (
                          <span className="ml-1.5 rounded bg-fg/[0.07] px-1.5 py-px text-[10px] text-mist">{item.variacaoDescricao}</span>
                        )}
                        {ehAvulso(item) && (
                          <span data-sem-foto className="ml-1.5 rounded bg-warning/[0.15] px-1.5 py-px text-[10px] text-warning">avulso</span>
                        )}
                        {faltaDaLinha(item) && (
                          <span className="mt-0.5 block text-[10.5px] text-danger">sem estoque suficiente</span>
                        )}
                      </p>
                      <button onClick={() => removerProduto(item.itemPedidoId)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-danger/20 text-danger">
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-[11px] text-mist">Qtde</label>
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={item.quantidadeItem}
                          /* Mesma regra do desktop — ver a nota lá. No celular
                             pesa ainda mais: posicionar o cursor antes do zero
                             com o dedo é quase impossível. */
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => atualizarLinha(item.itemPedidoId, { quantidadeItem: Math.max(0, Number(e.target.value) || 0) })}
                          className="h-10 w-full rounded-lg border border-fg/[0.06] bg-fg/[0.03] px-2 text-center tabular-nums text-ink outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] text-mist">V. Unit</label>
                        <div className="flex items-center gap-1.5">
                          <MoneyInput value={item.valorVendaItem} onChange={(v) => atualizarLinha(item.itemPedidoId, { valorVendaItem: v })} className="h-10 w-full rounded-lg border border-fg/[0.06] bg-fg/[0.03] px-2 text-center tabular-nums text-ink outline-none" />
                          {item.valorVendaItem !== item.produto.valorProduto && <span className="text-[10px] text-mist line-through">{formatCurrency(item.produto.valorProduto)}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between rounded-lg bg-fg/[0.03] px-3 py-2">
                      <span className="text-xs text-mist">Subtotal</span>
                      <span className="text-sm tabular-nums text-ink">{formatCurrency(item.valorVendaItem * item.quantidadeItem)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-fg/[0.12] py-10 text-center text-sm text-mist">Nenhum produto</div>
              )}
              {!loadingPedido && itens.length === 0 && (
                <p className="py-2 text-center text-[12px] text-faint">
                  Busque no estoque — ou digite o item e tecle Enter para lançar avulso.
                </p>
              )}
            </div>

            {/* Resumo */}
            <div className="p-5">
              {loadingPedido ? (
                <SkeletonSummary />
              ) : (
                <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${modoOrcamento ? "" : "lg:grid-cols-6"}`}>
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
                    <span className={`${valResumo} tabular-nums`}>{formatCurrency(totalLiquido)}</span>
                  </div>

                  {/* Pagamento não existe em orçamento — só na nota de venda. */}
                  {!modoOrcamento && (
                    <>
                      <div className="rounded-xl border border-fg/[0.06] bg-fg/[0.03] p-3">
                        <span className={lblResumo}>T. Pago</span>
                        <span className={`${valResumo} tabular-nums`}>{formatCurrency(totalPago)}</span>
                      </div>
                      {/* Virou informação, não botão: o pagamento agora está sempre
                          visível na coluna ao lado — não há mais o que abrir. */}
                      <div className={`rounded-xl border p-3 ${pendente > 0 ? "border-warning/20 bg-warning/[0.12]" : "border-success/20 bg-success/[0.12]"}`}>
                        <span className={`${lblResumo} ${pendente > 0 ? "text-warning" : "text-success"}`}>Pendente</span>
                        <span className={`mt-1 block truncate text-sm tabular-nums ${pendente > 0 ? "text-warning" : "text-success"}`}>{formatCurrency(pendente)}</span>
                      </div>
                      <div className="rounded-xl border border-fg/[0.06] bg-fg/[0.03] p-3">
                        <span className={lblResumo}>F. Pagamento</span>
                        <span className={valResumo}>{formaPagamento}</span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ─────────────────────── Pagamento via Pix ───────────────────────
                O QR morava lá em cima, ao lado do nome do cliente, porque era o
                único lugar com largura sobrando. Só que ele é a ÚLTIMA coisa da
                leitura — primeiro o cliente confere o que comprou e quanto deu,
                depois paga —, e ali ele empurrava a identificação para uma
                coluna estreita e cobrava 176px de largura em toda nota, inclusive
                nas já quitadas.

                Aqui embaixo, depois do resumo, ele fecha o documento: o valor
                que o QR cobra vem logo abaixo do total que o explica. E o
                copia-e-cola passou a sair IMPRESSO ao lado dele — quem recebe a
                nota por WhatsApp abre a imagem no próprio celular e não tem como
                apontar a câmera para o QR que está na tela desse mesmo celular.
                O código escrito é o único caminho de pagamento para essa pessoa,
                e ele estava só num botão que a foto não capturava. */}
            {!modoOrcamento && (
              <div className="px-5 pb-5">
                {/* A chave de mostrar/esconder — de quem atende, fora da foto. */}
                <div data-sem-foto className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <button
                    type="button"
                    onClick={() => setMostrarQr((v) => !v)}
                    aria-pressed={mostrarQr}
                    className="focus-ring flex cursor-pointer items-center gap-2 text-[12px] text-mist transition-colors hover:text-ink"
                  >
                    <span className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${mostrarQr ? "bg-accent" : "bg-fg/[0.18]"}`}>
                      <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${mostrarQr ? "left-3.5" : "left-0.5"}`} />
                    </span>
                    Mostrar o Pix nesta nota
                  </button>

                  {/* O valor da cobrança só faz sentido com o Pix ligado. */}
                  {mostrarQr && pixPayload && (
                    <label className="flex items-center gap-2 text-[12px] text-mist">
                      Cobrar
                      <span className={`flex items-center gap-1 rounded-lg border px-2 py-1 ${cobrancaLivre ? "border-accent" : "border-fg/[0.1]"}`}>
                        <span className="text-faint">R$</span>
                        <input
                          value={cobrancaLivre}
                          onChange={(e) => setCobrancaLivre(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 12))}
                          inputMode="decimal"
                          placeholder={formatCurrency(total).replace("R$", "").trim()}
                          aria-label="Valor a cobrar no Pix"
                          className="w-[86px] bg-transparent text-right tabular-nums text-ink outline-none placeholder:text-faint"
                        />
                      </span>
                      {/* Diz o que o vazio significa, em vez de deixar a pessoa
                          descobrir apagando o campo. */}
                      <span className="text-[11px] text-faint">{cobrancaLivre ? "entrada / sinal" : "o total"}</span>
                    </label>
                  )}
                </div>

                {mostrarQr && (
                  pixPayload ? (
                    <div className="flex flex-col gap-4 rounded-2xl border border-fg/[0.06] bg-fg/[0.02] p-4 sm:flex-row sm:items-center">
                      <div className="shrink-0 overflow-hidden rounded-2xl border border-fg/[0.08] bg-white p-2.5">
                        {qrCodeNota ? (
                          <img src={qrCodeNota} alt="QR Code para pagamento via Pix" className="h-[144px] w-[144px] rounded-lg" />
                        ) : (
                          <div className="h-[144px] w-[144px] animate-pulse rounded-lg bg-fg/[0.06]" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-faint">Pagamento via Pix</p>
                        <p className="mt-0.5 text-sm text-ink">
                          Aponte a câmera para o QR ou copie o código abaixo
                          <span className="ml-1 tabular-nums text-mist">· {formatCurrency(valorCobranca)}</span>
                        </p>

                        <div className="mt-2.5 rounded-xl border border-fg/[0.08] bg-fg/[0.03] p-2.5">
                          <code className="block select-all break-all text-[10.5px] leading-relaxed text-mist">{pixPayload}</code>
                        </div>

                        <button
                          type="button"
                          data-sem-foto
                          onClick={() => void copiarPix()}
                          title="Copiar o código Pix para mandar ao cliente"
                          className="focus-ring mt-2 flex cursor-pointer items-center gap-1.5 rounded-lg border border-fg/[0.1] px-3 py-1.5 text-[11px] text-mist transition-colors hover:border-accent/40 hover:text-accent-soft"
                        >
                          {pixCopiado ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                          {pixCopiado ? "Copiado!" : "Copiar código Pix"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Aviso de configuração é para quem atende, não para o
                       cliente: fica fora da foto. */
                    <div data-sem-foto className="flex items-center gap-3 rounded-2xl border border-dashed border-fg/[0.12] px-4 py-3">
                      <QrCode size={20} className="shrink-0 text-faint" />
                      <p className="text-[11px] leading-relaxed text-mist">
                        {pixConfig ? "O QR aparece quando a nota tiver valor." : "Chave Pix não cadastrada."}
                        {!pixConfig && <span className="block text-[10.5px] text-faint">Configurações → Empresa (só o usuário master).</span>}
                      </p>
                    </div>
                  )
                )}
              </div>
            )}

            {/* ───────────── Os recebimentos, no celular e no tablet ─────────────
                A coluna de pagamento (`PainelPagamento`) só existe a partir de
                `lg`. Abaixo disso não havia caminho NENHUM para o dinheiro da
                nota: nem registrar, nem — o que dói mais — corrigir. Quem
                lançou 300 no lugar de 30 no balcão, do celular, ficava sem
                saída até chegar num computador.

                São os MESMOS componentes da coluna, só que empilhados: o
                formulário de receber e o extrato linha a linha. Nada de lógica
                duplicada — se a regra mudar lá, muda aqui junto.

                O extrato aparece mesmo com a nota QUITADA, e é de propósito:
                é ele que desfaz a quitação por engano. Apagar o recebimento a
                mais devolve a venda para "em aberto" sozinha, porque o status
                é recalculado da soma das linhas — não existe (nem precisa
                existir) um botão de "desquitar".

                `data-sem-foto`: ferramenta de quem atende, fora do PNG. */}
            {!modoOrcamento && id && (
              <div data-sem-foto className="px-5 pb-3 lg:hidden">
                <div className="rounded-2xl border border-fg/[0.08] bg-fg/[0.02] p-4">
                  <div className="mb-3 flex items-baseline justify-between gap-2">
                    <span className={lblResumo}>Pagamentos</span>
                    <span className={`shrink-0 text-[11px] tabular-nums ${pendente > 0 ? "text-warning" : "text-success"}`}>
                      {pendente > 0 ? `faltam ${formatCurrency(pendente)}` : "nota quitada"}
                    </span>
                  </div>

                  {/* Nota quitada não pede valor: o formulário só ofereceria
                      receber de novo o que já foi recebido. O extrato abaixo
                      continua, porque é lá que se desfaz o que foi errado. */}
                  {pendente > 0 && (
                    <PagamentoForm
                      total={total}
                      jaPago={totalPago}
                      compacto
                      salvando={confirmandoPagamento}
                      textoConfirmar="Registrar pagamento"
                      onConfirmar={(valor, forma) => void handleAdicionarPagamento(valor, forma)}
                    />
                  )}

                  <RecebimentosNota pedidoId={id} versao={totalPago} onAlterado={recarregarNotaEPrazo} compacto />
                </div>
              </div>
            )}

            {/* Venda a prazo no celular.
                A coluna de recebimento só existe a partir de `lg`; sem isto,
                combinar vencimento e dar baixa em parcela seria coisa de
                desktop — e boa parte das vendas a prazo é fechada no balcão,
                no celular. `data-sem-foto` mantém tudo fora do PNG: é
                ferramenta de quem atende, não parte do documento. */}
            {!modoOrcamento && id && (
              <div data-sem-foto className="px-5 pb-2 lg:hidden">
                <PrazoNota
                  pedidoId={id}
                  pendente={pendente}
                  clienteNome={pedido?.nomeCliente || nome}
                  acordo={acordo}
                  carregando={carregandoAcordo}
                  onAtualizar={recarregarNotaEPrazo}
                />
              </div>
            )}

            {/* O copia-e-cola do Pix saiu daqui.
                Era um bloco largo com o código inteiro quebrado em várias
                linhas — ocupava mais altura que o resumo da venda para uma
                ação que quase ninguém usa: no balcão, o cliente aponta a câmera
                para o QR. Quem paga pelo computador escaneia pelo celular
                assim mesmo. */}
            </div>
          </div>
        </div>

        {/* Footer */}
        {/* No celular o total e os dois botões não cabiam lado a lado: "Pagamento"
            com o valor pendente mais "Gerar Nota" estouravam os 390px. Aqui o
            rodapé empilha — total em cima, botões dividindo a linha de baixo —
            e a partir de `sm` volta a ser uma linha só. */}
        <footer
          className="flex shrink-0 flex-col gap-3 border-t border-fg/[0.06] bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="min-w-0">
            <span className={lblResumo}>Total da nota</span>
            {loadingPedido ? <Skeleton className="mt-1 h-7 w-32" /> : <span className="block truncate text-xl tabular-nums text-ink md:text-2xl">{formatCurrency(total)}</span>}
          </div>

          <div className="flex items-center gap-2">
            {/*
             * Baixar só DEPOIS que o documento existe.
             *
             * O botão vinha desde a nota em branco, e o arquivo que ele
             * entregava era uma foto do rascunho: sem número, sem data
             * gravada, com o que estava na tela naquele segundo. Mandado ao
             * cliente, virava um documento que o sistema não conhece — não dá
             * para achar pelo número, não consta em lugar nenhum, e o que ele
             * promete não está registrado. Pior no orçamento, onde o preço do
             * papel passa a valer sem que exista proposta.
             *
             * Gerada a nota (ou a proposta), o botão aparece no mesmo lugar,
             * sem fechar nada — e o que ele baixa é o documento de verdade.
             */}
            {(modoOrcamento ? Boolean(orcamentoId) : Boolean(id)) && (
              <BotaoVerDocumento refNota={modoOrcamento ? notaRef : refDocumento} nomeEmpresa={enterprise?.nomeFantasia ?? "nota"} prefixo={modoOrcamento ? "orcamento" : "nota"} titulo={modoOrcamento ? "Baixar orçamento" : "Baixar nota"} documento={modoOrcamento ? "orçamento" : "nota"} />
            )}

            {/* Recibo: só depois de quitada. Antes disso não há o que
                comprovar, e um "recibo" de nota em aberto é um documento que
                afirma o que não aconteceu. */}
            {quitada && !modoOrcamento && (
              <BotaoRecibo
                dados={{
                  numero: String(pedido?.pedido?.pedidoId ?? id ?? "").slice(0, 8),
                  clienteNome: nome ?? "",
                  valor: totalPago,
                  formaPagamento,
                  pagoEm: pedido?.pedido?.dataPedido ? String(pedido.pedido.dataPedido) : null,
                }}
              />
            )}

            {/* Sem X aqui: o modal que envolve a nota já tem o próprio fechar
                no topo, e dois botões de fechar na mesma tela só criavam a
                dúvida de qual deles descarta a venda. Cancelar a nota mudou
                para a barra de cima, ao lado do status. */}

            {modoOrcamento ? (
              <button
                onClick={handleGerarOrcamento}
                disabled={salvarDesabilitado || savingNote || loadingPedido}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-warning px-5 text-sm text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40 sm:flex-none"
              >
                {savingNote ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
                {savingNote ? "Salvando..." : orcamentoId ? "Salvar orçamento" : "Gerar orçamento"}
              </button>
            ) : (
              <button
                onClick={handleSalvar}
                disabled={salvarDesabilitado || savingNote || loadingPedido}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm text-white transition-all hover:bg-accent-soft active:scale-[0.98] disabled:opacity-40 sm:flex-none"
              >
                {savingNote ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                {savingNote ? "Salvando..." : !id ? "Gerar Nota" : "Salvar"}
              </button>
            )}
          </div>
        </footer>
        </div>

        {/*
         * Pagamentos na lateral, não em modal.
         *
         * Receber é conferência: quem lança olha o total da nota, o que já
         * entrou e o que falta ao mesmo tempo. O modal cobria justamente a nota
         * que se está conferindo, e obrigava a fechar e reabrir para checar um
         * item. Ao lado, os dois convivem.
         *
         * À ESQUERDA, com `order-first`: quem opera lê a nota da esquerda para
         * a direita e termina no total. Pôr o recebimento depois disso obrigava
         * o olho a voltar. Antes da nota, ele é o primeiro passo do fechamento.
         *
         * Some abaixo de `lg`: em tela estreita não há largura para duas
         * colunas, e lá o rodapé continua sendo o caminho.
         */}
        {/* Pagamento não existe em orçamento — a proposta não recebe. */}
        {!modoOrcamento && (
          <PainelPagamento
            pedidoId={id}
            total={total}
            totalPago={totalPago}
            totalBruto={totalBruto}
            totalDesconto={totalDesconto}
            formaPagamento={formaPagamento}
            statusPedido={statusPedido}
            clienteNome={pedido?.nomeCliente || nome}
            acordo={acordo}
            carregandoAcordo={carregandoAcordo}
            salvandoPagamento={confirmandoPagamento}
            destacar={focarPagamento}
            onPagar={(valor, forma) => void handleAdicionarPagamento(valor, forma)}
            onAtualizar={recarregarNotaEPrazo}
          />
        )}
      </div>
    </div>

      {/*
        A nota recém-gerada, a caminho do cliente.
        Só existe quando a venda nasceu dentro de uma conversa (`conversaId`).
        Duas saídas de verdade — foto ou documento — e a terceira, que é não
        mandar: quem gerou a nota para conferir não deve ser obrigado a enviar.
      */}
      <Modal
        open={perguntarEnvio}
        onClose={() => !enviandoWhats && setPerguntarEnvio(false)}
        title="Enviar para o cliente?"
        subtitle="Pelo WhatsApp, na mesma conversa"
        size="sm"
      >
        <div className="flex flex-col gap-3">
          <p className="text-[12.5px] leading-relaxed text-mist">
            A nota que você acabou de gerar vai como está na tela. <span className="text-ink">Foto</span> o cliente vê
            sem baixar nada — é o que serve no celular. <span className="text-ink">PDF</span> ele guarda e imprime.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!!enviandoWhats}
              onClick={() => void enviarNotaWhatsapp("png")}
              className="focus-ring flex min-h-[64px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-fg/[0.09] text-[12.5px] text-mist transition-colors hover:border-accent/50 hover:text-ink disabled:opacity-50"
            >
              {enviandoWhats === "png" ? <Loader2 size={16} className="animate-spin text-accent" /> : <ImageIcon size={16} className="text-accent-soft" />}
              Enviar como foto
            </button>

            <button
              type="button"
              disabled={!!enviandoWhats}
              onClick={() => void enviarNotaWhatsapp("pdf")}
              className="focus-ring flex min-h-[64px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-fg/[0.09] text-[12.5px] text-mist transition-colors hover:border-accent/50 hover:text-ink disabled:opacity-50"
            >
              {enviandoWhats === "pdf" ? <Loader2 size={16} className="animate-spin text-accent" /> : <FileText size={16} className="text-accent-soft" />}
              Enviar como PDF
            </button>
          </div>

          <button
            type="button"
            disabled={!!enviandoWhats}
            onClick={() => setPerguntarEnvio(false)}
            className="focus-ring cursor-pointer text-center text-[12px] text-faint transition-colors hover:text-ink disabled:opacity-50"
          >
            Agora não
          </button>
        </div>
      </Modal>

      {/* O DOCUMENTO — fora da tela, com a largura fixa do papel.

          `-left-[9999px]` em vez de `display:none`: `html-to-image` não
          fotografa o que não está no layout, e a largura de 900px é o que
          garante que a nota saia igual no celular e no desktop. Mesmo recurso
          da lista de Vendas e do PDV.

          Só na nota: a proposta tem outro documento (validade, sem vendedor,
          sem pagamento) e continua saindo do nó da tela. */}
      {!modoOrcamento && (
        <div className="fixed -left-[9999px] top-0 w-[900px]" aria-hidden>
          <NotaResumo venda={vendaDoDocumento} pix={pixDoDocumento} refNota={refDocumento} />
        </div>
      )}
    </>
  );
};

export default Invoice;
