import type { Periodo } from "@/shared/ui/SeletorPeriodo";
import { type PedidoClienteType, estaCancelado, recebidoDoPedido, totalDoPedido } from "@/shared/domain/pedido";
import { MONTHS, toDate } from "@/shared/utils/date";

/**
 * O recorte de tempo aplicado às vendas — em UM lugar.
 *
 * Isto morava dentro do `useMemo` do painel de Início. Quando o panorama de
 * Vendas ganhou o mesmo seletor de período, copiar o bloco significaria ter
 * duas respostas para a mesma pergunta ("como fica a curva quando escolho
 * março?") e vê-las divergir na primeira correção feita só de um lado — foi o
 * que aconteceu com a tabela escrita à mão em cada tela antes de existir o
 * `DataTable`.
 *
 * Aqui ficam as três coisas que dependem do período e nada mais: quais vendas
 * entram, quais meses o seletor oferece e como a curva é fatiada. Comparação
 * com a janela anterior, ranking e mix de pagamento continuam em cada tela —
 * são leituras próprias, não recorte.
 */

const soODia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** O primeiro dia do mês da data — o eixo do gráfico anda de mês em mês. */
const primeiroDoMes = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

const chaveDia = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const chaveMes = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;

/** Vendas que contam: cancelada não faturou, e somá-la inflaria toda a tela. */
export const vendasAtivas = (vendas: PedidoClienteType[]): PedidoClienteType[] => vendas.filter((v) => !estaCancelado(v));

/** A venda cai dentro do recorte? `de`/`ate` nulos não limitam aquele lado. */
export const dentroDoPeriodo = (v: PedidoClienteType, periodo: Periodo): boolean => {
  const d = toDate(v.pedido.dataPedido);

  if (!d) return false;
  if (periodo.de && d < periodo.de) return false;
  if (periodo.ate && d > periodo.ate) return false;

  return true;
};

export const noPeriodo = (vendas: PedidoClienteType[], periodo: Periodo): PedidoClienteType[] =>
  vendas.filter((v) => dentroDoPeriodo(v, periodo));

/**
 * Os meses que TÊM venda, do mais recente para o mais antigo.
 *
 * É o que alimenta o seletor: a lista de recortes é feita do que existe, e não
 * de atalhos fixos que caem em meses vazios. Serve também ao gráfico, que
 * precisa saber onde a história começa.
 */
export const mesesComMovimento = (vendas: PedidoClienteType[]): Date[] => {
  const chaves = new Set<string>();

  for (const v of vendas) {
    const d = toDate(v.pedido.dataPedido);
    if (d) chaves.add(chaveMes(d));
  }

  return [...chaves]
    .map((chave) => {
      const [ano, mes] = chave.split("-").map(Number);
      return new Date(ano, mes, 1);
    })
    .sort((a, b) => +b - +a);
};

export type PontoSerie = { name: string; faturado: number; recebido: number };

/**
 * A curva do período, na granularidade que o recorte pede.
 *
 * ---------------------------------------------------------------------------
 * Por que a barra não é sempre o mês
 * ---------------------------------------------------------------------------
 * Um mês escolhido no seletor virava UMA barra. O gráfico ficava com um traço
 * solitário no meio da caixa, sem dizer nada que o KPI ao lado já não
 * dissesse — e escondia justamente o que se quer saber ao abrir um mês
 * fechado: em que dias a loja vendeu. Sábado puxa o mês? A primeira semana
 * carrega o resto? A resposta estava no dado e não aparecia em lugar nenhum.
 *
 * Recorte curto (até dois meses) desce para o DIA; daí para cima, mês. O corte
 * é pelo tamanho e não pelo tipo de escolha, então um intervalo livre de dez
 * dias ganha a mesma leitura fina que um mês do seletor.
 *
 * Dia sem venda entra na série com zero, e é informação: buraco no meio da
 * curva é a segunda-feira em que a loja não abriu. Pular o dia faria duas
 * segundas seguidas parecerem dias consecutivos.
 */
export const serieDeVendas = (vendas: PedidoClienteType[], periodo: Periodo): { serie: PontoSerie[]; porDia: boolean } => {
  const agora = new Date();
  const ativas = vendasAtivas(vendas);
  const meses = mesesComMovimento(ativas);
  const primeira = meses.length ? meses[meses.length - 1] : null;

  const inicioBruto = soODia(periodo.de ?? primeira ?? agora);

  /* O fim é cortado em HOJE: a cauda de dias (ou meses) futuros zerados
     achatava a curva inteira contra a base por metade da largura. */
  const fimCandidato = soODia(periodo.ate && periodo.ate < agora ? periodo.ate : agora);
  const fimBruto = fimCandidato < inicioBruto ? inicioBruto : fimCandidato;

  const DIA_MS = 24 * 60 * 60 * 1000;
  const diasNoRecorte = Math.round((+fimBruto - +inicioBruto) / DIA_MS) + 1;
  const porDia = diasNoRecorte <= 62;
  const chaveDe = porDia ? chaveDia : chaveMes;

  /*
   * Um balde por dia (ou por mês), preenchido numa passada só.
   *
   * Filtrar a lista inteira dentro do laço das barras seria varrer todas as
   * vendas trinta vezes para montar um mês.
   */
  const baldes = new Map<string, { faturado: number; recebido: number }>();

  for (const v of ativas) {
    const d = toDate(v.pedido.dataPedido);

    if (!d) continue;

    const chave = chaveDe(d);
    const balde = baldes.get(chave) ?? { faturado: 0, recebido: 0 };
    const valor = totalDoPedido(v);

    balde.faturado += valor;

    /* A linha verde é DINHEIRO, não status: o recebimento parcial entra no dia
       em que entrou. Antes ela só subia quando a nota inteira era baixada, e o
       gráfico ficava rente ao zero numa loja que recebe metade na entrada e
       metade na entrega. Mesma regra do KPI ao lado — ver `recebidoDoPedido`. */
    balde.recebido += recebidoDoPedido(v);

    baldes.set(chave, balde);
  }

  /* Os pontos do eixo, do começo ao fim do recorte, sem furos. */
  const pontos: Date[] = [];

  if (porDia) {
    for (let d = inicioBruto; d <= fimBruto; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      pontos.push(d);
    }
  } else {
    const primeiroMes = primeiroDoMes(inicioBruto);
    const ultimoMes = primeiroDoMes(fimBruto);

    for (let m = primeiroMes; m <= ultimoMes; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
      pontos.push(m);

      /* Trava de sanidade: data corrompida no banco poderia render um laço de
         milhares de barras e travar a aba. */
      if (pontos.length >= 120) break;
    }
  }

  /*
   * O rótulo do eixo diz o mínimo que basta para não confundir.
   *
   * Em dias dentro de um mês só, o número do dia — "01/09" trinta vezes é a
   * mesma informação repetida com o dobro dos caracteres. Atravessando meses,
   * entra o mês. Em meses dentro de um ano só, o nome do mês; atravessando
   * anos, entra o ano.
   */
  const cruzaMes = pontos.length > 0 && chaveMes(pontos[0]) !== chaveMes(pontos[pontos.length - 1]);
  const cruzaAno = pontos.length > 0 && pontos[0].getFullYear() !== pontos[pontos.length - 1].getFullYear();

  const rotular = (d: Date) => {
    if (porDia) return cruzaMes ? `${d.getDate()}/${MONTHS[d.getMonth()]}` : String(d.getDate());

    return cruzaAno ? `${MONTHS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}` : MONTHS[d.getMonth()];
  };

  const serie = pontos.map((d) => {
    const balde = baldes.get(chaveDe(d));

    return { name: rotular(d), faturado: balde?.faturado ?? 0, recebido: balde?.recebido ?? 0 };
  });

  return { serie, porDia };
};
