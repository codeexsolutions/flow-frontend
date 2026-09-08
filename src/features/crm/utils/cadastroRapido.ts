import CrmService, { type Conversa } from "@/features/crm/services/crm.service";
import ClientService from "@/features/clientes/services/client.service";
import ClientType, { eStatus } from "@/shared/domain/cliente";
import useClienteStore from "@/features/clientes/store/cliente.store";
import { nomeLimpo, telefoneDoContato } from "@/features/crm/utils/contato";

/**
 * O cadastro que acontece sozinho na hora de vender.
 *
 * Nota precisa de cliente. O contato da conversa já tem as duas coisas que o
 * cadastro exige — nome e telefone —, e pedir para alguém redigitá-las no meio
 * de um atendimento é o passo em que a pessoa desiste e lança a venda como
 * "Consumidor": a loja perde o histórico daquele cliente para sempre, e o
 * cliente vira um número solto que ninguém consegue cobrar depois.
 *
 * Então quem clica em Venda ou Orçamento não vê formulário nenhum: a ficha é
 * criada com o que a conversa sabe e o contato já sai vinculado a ela.
 *
 * **O nome é o que a LOJA salvou na agenda**, não o apelido de perfil do
 * WhatsApp ("Maria 💅", "😎 L.JUNIOR") — ver a nota em `sessoes.js` no serviço
 * de CRM, que é onde essa preferência é decidida, e `nomeLimpo`, que tira o
 * enfeite do que sobrar. Sem nada aproveitável fica o telefone: um número
 * identifica melhor que "Cliente sem nome".
 *
 * Falhar NÃO é fatal e não deve travar a venda: quem chama abre a nota assim
 * mesmo, com o campo do cliente em branco, e resolve ali. Transformar um
 * problema de cadastro numa venda perdida seria o pior dos dois mundos.
 */
export type ClienteRapido = {
  /** O id do cadastro — ausente quando ele não pôde ser criado. */
  clienteId?: string;
  /** O nome usado (ou o que já existia), para a nota abrir com ele escrito. */
  nome: string;
  /** O que impediu o cadastro, quando impediu. */
  erro?: unknown;
};

/** Só dígitos, para comparar telefone com telefone e não máscara com máscara. */
const digitos = (v?: string | null) => String(v ?? "").replace(/\D/g, "");

/**
 * O cliente que JÁ existe para este contato — pelo telefone, ou pelo nome.
 *
 * Antes de criar, procura. Sem isto, o mesmo contato vira uma ficha nova a
 * cada venda em que o vínculo não tenha sido gravado — e foi exatamente o que
 * um erro de vínculo produziu aqui: o cadastro nascia, a ligação falhava, e o
 * clique seguinte criava outra "Amanda Silva".
 *
 * O telefone manda: dois clientes podem se chamar "João", nenhum divide o
 * mesmo WhatsApp. O nome só decide quando não há telefone para comparar — o
 * caso das contas que chegam como LID, sem número visível —, e aí a
 * comparação é exata (sem acento e sem caixa), porque "Ana" e "Ana Paula"
 * são duas pessoas.
 */
const jaCadastrado = (nome: string, telefone: string | null): string | undefined => {
  const { clientes } = useClienteStore.getState();
  const numero = digitos(telefone);

  const achado = clientes.find((c) => {
    if (numero) {
      const dele = [c.contato?.whatsapp, c.contato?.celular, c.contato?.telefone].map(digitos);
      if (dele.some((d) => d && d.endsWith(numero.slice(-8)))) return true;
    }

    const igual = (a?: string) =>
      String(a ?? "").trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{Diacritic}/gu, "");

    return !numero && !!nome && igual(c.nome) === igual(nome);
  });

  return achado?.id ? String(achado.id) : undefined;
};

export async function garantirCliente(conversa: Conversa): Promise<ClienteRapido> {
  /* Já tem ficha: nada a criar — criar de novo daria duas fichas para a mesma
     pessoa, que é exatamente o que o vínculo existe para evitar. */
  if (conversa.cliente_fk) return { clienteId: String(conversa.cliente_fk), nome: conversa.nome };

  /* O telefone do contato — inclusive quando ele veio escrito no NOME, que é
     o caso das contas que chegam como LID. Ver `telefoneDoContato`. */
  const telefone = telefoneDoContato(conversa.telefone, conversa.nome);
  const nome =
    (conversa.nome && conversa.nome !== conversa.telefone ? nomeLimpo(conversa.nome) : "") ||
    telefone ||
    conversa.telefone;

  try {
    /* A base de clientes, para procurar antes de criar. `fetchClientes`
       guarda por sessão: na segunda venda do dia isto não custa viagem. */
    await useClienteStore.getState().fetchClientes();

    const existente = jaCadastrado(nome, telefone);

    if (existente) {
      await CrmService.vincularCliente(conversa.contato_id, existente);
      return { clienteId: existente, nome };
    }

    const novo: ClientType = {
      nome,
      status: eStatus.ATIVO,
      contato: telefone ? { whatsapp: telefone } : undefined,
    };

    const resposta = await ClientService.create(novo);

    /*
     * O id do cadastro novo vem em `data[0]` — ver `Cadastrar` no controller
     * da API. Com ele o contato já sai vinculado; cadastrar e deixar a
     * conversa solta seria fazer o trabalho pela metade.
     *
     * Aceita as DUAS formas: a API devolvia a linha do `RETURNING`
     * (`{ id }`) onde a assinatura prometia o id. Isso foi corrigido lá, e a
     * leitura tolerante fica: um `String()` cego naquele objeto virava
     * "[object Object]", o vínculo estourava com `invalid input syntax for
     * type uuid` e a tela anunciava que não cadastrou um cliente que estava
     * cadastrado.
     */
    const bruto = (resposta as { data?: { data?: (string | { id?: string })[] } })?.data?.data?.[0];
    const clienteId = typeof bruto === "string" ? bruto : bruto?.id;

    if (clienteId) await CrmService.vincularCliente(conversa.contato_id, String(clienteId));

    return { clienteId: clienteId ? String(clienteId) : undefined, nome };
  } catch (erro) {
    return { nome, erro };
  }
}
