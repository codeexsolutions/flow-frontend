import { useCallback, useEffect, useState } from "react";

import TermosService, { type SituacaoTermos } from "@/features/termos/termos.service";

/**
 * A situação dos termos desta empresa, e o gesto de aceitar.
 *
 * ---------------------------------------------------------------------------
 * Por que `bloqueando` não é o mesmo que `pendente`
 * ---------------------------------------------------------------------------
 * Pendente é da EMPRESA: ninguém aceitou a versão vigente. Bloquear é da
 * PESSOA que está na tela, e as duas coisas divergem no caso que mais
 * acontece: o vendedor abre o sistema às sete da manhã e o dono ainda não
 * aceitou. Prendê-lo num modal que ele não tem permissão para fechar seria
 * parar o balcão por uma decisão que não é dele — e a API recusaria o aceite
 * dele de qualquer forma.
 *
 * Então o modal só bloqueia quem pode resolver. Para os demais, o sistema abre
 * normalmente e a pendência espera o master entrar.
 *
 * ---------------------------------------------------------------------------
 * Falhar aqui não tranca ninguém
 * ---------------------------------------------------------------------------
 * Se a consulta cair (rede, API fora, empresa sem a migration aplicada), o
 * estado continua "não pendente" e o sistema abre. O contrário — travar o
 * acesso de todo mundo porque uma chamada falhou — transformaria um erro de
 * rede em loja parada.
 */
export function useTermosLgpd() {
  const [situacao, setSituacao] = useState<SituacaoTermos | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;

    TermosService.situacao()
      .then((s) => vivo && setSituacao(s))
      .catch(() => vivo && setSituacao(null))
      .finally(() => vivo && setCarregando(false));

    return () => {
      vivo = false;
    };
  }, []);

  const aceitar = useCallback(async () => {
    setSalvando(true);
    setErro(null);

    try {
      await TermosService.aceitar();

      /* O modal fecha por este estado, sem recarregar a página: a pessoa
         estava no meio de alguma coisa quando ele apareceu. */
      setSituacao((s) => (s ? { ...s, pendente: false, aceito: true } : s));
    } catch {
      setErro("Não foi possível registrar o aceite. Verifique a conexão e tente de novo.");
    } finally {
      setSalvando(false);
    }
  }, []);

  return {
    carregando,
    salvando,
    erro,
    termos: situacao?.termos ?? null,
    /** A empresa está em dia com a versão vigente? */
    pendente: Boolean(situacao?.pendente),
    /** Esta PESSOA vê o modal e tem como sair dele. */
    bloqueando: Boolean(situacao?.pendente && situacao?.podeAceitar),
    aceitar,
  };
}
