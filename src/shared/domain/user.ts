export default interface UserType {
  id: string;
  email: string;
  cargo: string;
  permissao: string;
  /** Usuário master: gerencia funcionários e vê todas as vendas. */
  root?: boolean;
  codigoEmpresa: string;
  ativo: boolean;
  nome?: string;
  /** Como a pessoa quer ser chamada na nota e no WhatsApp. Vazio = usa `nome`. */
  nomeExibicao?: string;
  phone?: string;
  image?: string;
}
