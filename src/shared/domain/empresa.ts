interface EnterpriseType {
  id: string;
  codigoEmpresa: string;
  nomeRepresentante: string;
  nomeFantasia: string;
  cpfCnpj: string;
  inscMunicipal?: string;
  urlLogo?: string;
  /** Imagem de fundo (wallpaper) da nota de venda e do orçamento. */
  notaBackground?: string;
  /**
   * `true` (padrão) omite CPF da nota — o da empresa e o do cliente.
   *
   * CNPJ nunca é escondido: é público e é o que identifica a empresa. CPF é
   * dado pessoal, e a nota é um documento que circula por WhatsApp e balcão.
   */
  ocultarCpfNota?: boolean;
  /**
   * `true` (padrão) faz a venda COM SERVIÇO virar uma linha na produção.
   *
   * Só tem efeito para quem tem produção no plano — a trava do módulo é do
   * plano, esta é a preferência de quem já tem direito a ele.
   */
  producaoAutomatica?: boolean;
  /**
   * A nota nasce com o QR do Pix ligado?
   *
   * É só o valor INICIAL: dentro da nota o QR continua podendo ser ligado ou
   * desligado, e é essa escolha que fica gravada na venda (`mostrarQr`, no
   * pedido). Existe para a loja que recebe no cartão não desligar o QR em toda
   * nota, uma por uma.
   */
  notaMostrarQr?: boolean;
  /**
   * Qual planilha recebe as vendas.
   *
   * `null` não é "desligado", é "não escolhi": nesse caso o servidor usa a
   * única planilha da empresa, e não faz nada quando há mais de uma.
   */
  producaoPlanilhaId?: string | null;
  /**
   * Chave do MODELO DE ORDEM DE SERVIÇO adotado. `null` = documento padrão.
   *
   * Os modelos disponíveis vêm do painel (`/producao/os-modelos`); o desenho
   * de cada um mora em `features/producao/modelos`.
   */
  osModelo?: string | null;
  ativo: boolean;
  endereco?: {
    logradouro: string;
    numero: string;
    complemento?: string;
    bairro: string;
    cidade: string;
    uf: string;
    cep: string;
  };
  contato?: {
    telefone?: string;
    celular?: string;
    whatsapp?: string;
    email?: string;
  };
}

export type EnterpriseLike = {
  nomeFantasia?: string;
  name?: string;
  cpfCnpj?: string;
  urlLogo?: string;
};

const CODIGO_EMPRESA_SUFFIX_LENGTH = 2;

export const toCodigoEmpresaBase = (codigoEmpresa: string): string => codigoEmpresa.slice(0, -CODIGO_EMPRESA_SUFFIX_LENGTH);

export default EnterpriseType;
