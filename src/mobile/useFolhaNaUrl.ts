import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

/**
 * Qual folha está aberta, guardado na URL (`?venda=…`, `?cliente=…`).
 *
 * No Android o botão voltar é o gesto de fechar. Com a folha só no estado do
 * React, ele saía da tela inteira; na URL, voltar fecha a folha.
 *
 * Aberta aqui, fechar volta uma entrada do histórico. Aberta por link (o "ver"
 * do Início, por exemplo) não há entrada para voltar: tirar o parâmetro basta.
 */
export const useFolhaNaUrl = (param: string) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();

  const valor = params.get(param);

  const abrir = (v: string) => setParams((p) => (p.set(param, v), p), { state: { folhaLocal: true } });

  const fechar = () => {
    if (!valor) return;

    if ((location.state as { folhaLocal?: boolean } | null)?.folhaLocal) navigate(-1);
    else setParams((p) => (p.delete(param), p), { replace: true });
  };

  return { valor, abrir, fechar };
};

export default useFolhaNaUrl;
