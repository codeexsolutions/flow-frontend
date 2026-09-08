import { maskPhone } from "@/shared/validation/masks";

/**
 * O contato do WhatsApp em estado de virar cadastro.
 *
 * Mora fora dos componentes porque duas telas o usam — o formulário de
 * cadastro rápido, no cabeçalho da conversa, e a ficha que abre pelo nome — e
 * porque nome e telefone limpos são regra de dado, não de desenho.
 */

/**
 * O telefone do WhatsApp em formato brasileiro — ou `null` se não der.
 *
 * O `null` NÃO é raro e não é defeito de digitação: o WhatsApp passou a
 * entregar contas como LID ("72597882552520"), um identificador de conta que
 * não é telefone. Preencher o formulário com esses quinze dígitos gravaria no
 * cadastro um número que ninguém consegue discar — pior do que deixar o campo
 * vazio para a pessoa preencher com o que ela sabe.
 */
export function telefoneBr(digitos: string): string | null {
  const so = String(digitos ?? "").replace(/\D/g, "");

  /* Com DDI brasileiro: 55 + DDD (2) + número (8 ou 9). */
  if (so.startsWith("55") && (so.length === 12 || so.length === 13)) return maskPhone(so.slice(2));

  /* Sem DDI, como o lojista digitaria. */
  if (so.length === 10 || so.length === 11) return maskPhone(so);

  return null;
}

/**
 * O nome do WhatsApp em estado de virar cadastro.
 *
 * O pushname é o que a pessoa escreveu no perfil dela, e vem como ela quis:
 * "Maria 💅", "😎🤓L.JUNIOR🤓😎", "Cauan | Conceito Imobiliária". Isso é ótimo na
 * lista de conversas — é como ela se apresenta — e péssimo no cadastro, que
 * alimenta nota fiscal, relatório e busca. Um emoji gravado ali reaparece no
 * papel que o cliente leva para a contabilidade dele.
 *
 * Fica o que é NOME: letras (com acento — `\p{L}` cobre "ç" e "ã"), números
 * (razões sociais os têm), espaço, hífen e apóstrofo ("D'Ávila", "Ana-Clara").
 * O ponto entra por causa das abreviações ("Cia.", "L.JUNIOR") e os dois
 * pontos porque muita gente se apresenta com rótulo — "Vendedor: Allef Melo".
 * Tirá-los emendava as duas partes numa frase só.
 *
 * Dois detalhes que vieram de olhar os nomes reais desta base:
 *
 *   • **o que sai vira ESPAÇO, não nada.** "Ana|Maria" apagando o "|" viraria
 *     "AnaMaria" — duas pessoas coladas num nome que não existe.
 *
 *   • **nome sem nenhuma letra é descartado.** Um terço dos contatos aqui tem
 *     como "nome" o próprio telefone ("+55 85 9202-5544"), que é o que o
 *     WhatsApp mostra quando a pessoa não pôs pushname. Gravar isso no campo
 *     Nome deixaria o cadastro com um número onde deveria estar gente — e o
 *     telefone já vai no campo dele.
 *
 * Vazio é resposta legítima: o formulário abre com o campo em branco, que é
 * honesto quando não sabemos como a pessoa se chama.
 */
export function nomeLimpo(bruto: string): string {
  const limpo = String(bruto ?? "")
    .replace(/[^\p{L}\p{N}\s'\-.:]/gu, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s'\-.:]+|[\s'\-.:]+$/g, "")
    .trim();

  return /\p{L}/u.test(limpo) ? limpo : "";
}


/**
 * O telefone de um contato, olhando também para o NOME.
 *
 * O WhatsApp entrega cada vez mais conta como LID — um identificador de 14 a
 * 15 dígitos que NÃO é telefone ("212227772649587"). `telefoneBr` recusa esses
 * números de propósito: gravar um deles no cadastro daria um cliente com um
 * "telefone" que ninguém consegue discar, pior que o campo vazio.
 *
 * Só que existe um resto aproveitável. Quando a loja não tem o contato salvo,
 * o nome que o WhatsApp manda costuma ser o PRÓPRIO NÚMERO — "+55 85
 * 8834-3800" —, e aí o telefone está ali, escrito no lugar errado. É a única
 * fonte que sobra para o cadastro rápido de quem chega por LID.
 */
export const telefoneDoContato = (telefone: string, nome?: string | null): string | null =>
  telefoneBr(telefone) ?? telefoneBr(String(nome ?? ""));
