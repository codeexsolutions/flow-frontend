import { create } from "zustand";

/**
 * A chave que abre a tela de novidades fora do horário dela.
 *
 * A tela aparece sozinha uma vez por versão (ver `conteudo.ts`). Esta loja
 * existe para o outro caminho: quem fechou sem ler e quer voltar, pelo botão em
 * Configurações › Meu perfil › Conta.
 *
 * Sem ela, o "ver de novo" teria de mexer no `localStorage` para desmarcar o
 * que já foi visto — e aí a tela reapareceria no próximo login também, que é
 * exatamente o que a regra "uma vez" evita.
 */
type Estado = {
  aberto: boolean;
  abrir: () => void;
  fechar: () => void;
};

const useNovidades = create<Estado>((set) => ({
  aberto: false,
  abrir: () => set({ aberto: true }),
  fechar: () => set({ aberto: false }),
}));

export default useNovidades;
