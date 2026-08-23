import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Link2, Loader2, Trash2 } from "lucide-react";

import PlanilhaService, { type Coluna, type LinkPublico, type MarcaEmpresa, type Registro } from "@/features/planilhas/services/planilha.service";
import useClienteStore from "@/features/clientes/store/cliente.store";
import SeletorCliente from "@/features/planilhas/components/SeletorCliente";
import Personalizacao from "@/features/planilhas/components/Personalizacao";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import { useAlert } from "@/shared/ui/Alert";

type Props = {
  planilhaId: string;
  colunas: Coluna[];
  /** As linhas da página aberta — só para sugerir quem já está na planilha. */
  registros: Registro[];
};

/**
 * Os links de acompanhamento desta planilha.
 *
 * Um link por cliente, e é essa a razão de a tela existir em vez de um botão
 * "compartilhar": o dono precisa ver PARA QUEM já emitiu, quantas vezes cada um
 * abriu e poder cortar o acesso de um sem mexer nos outros.
 */
const LinksCliente = ({ planilhaId, colunas, registros }: Props) => {
  const alert = useAlert();

  const [links, setLinks] = useState<LinkPublico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [marca, setMarca] = useState<MarcaEmpresa | null>(null);

  const colunasCliente = useMemo(() => colunas.filter((c) => c.tipo === "CLIENTE"), [colunas]);

  const [cliente, setCliente] = useState("");
  const [colunaCliente, setColunaCliente] = useState("");

  /* O que o cliente PODE ver. Nasce com tudo marcado porque o padrão é mostrar
     a produção inteira — esconder é a exceção, e exceção se escolhe.

     Fora da lista: a coluna de CLIENTE (já é o título da página) e as marcadas
     como internas na configuração de colunas. O servidor recusa essas de
     qualquer jeito; oferecê-las aqui só criaria a expectativa de que marcar
     adianta. */
  const exibiveis = useMemo(() => colunas.filter((c) => c.tipo !== "CLIENTE" && c.publico !== false), [colunas]);

  const internas = useMemo(() => colunas.filter((c) => c.tipo !== "CLIENTE" && c.publico === false), [colunas]);

  const [visiveis, setVisiveis] = useState<Set<string>>(new Set());
  const [escolhendo, setEscolhendo] = useState(false);

  useEffect(() => {
    setVisiveis(new Set(exibiveis.map((c) => c.id)));
  }, [exibiveis]);

  const alternar = (id: string) =>
    setVisiveis((atual) => {
      const nova = new Set(atual);

      nova.has(id) ? nova.delete(id) : nova.add(id);

      return nova;
    });

  const clientesCadastro = useClienteStore((s) => s.clientes);
  const buscarClientes = useClienteStore((s) => s.fetchClientes);

  useEffect(() => {
    buscarClientes();
  }, [buscarClientes]);

  /* Uma coluna de CLIENTE só: já vem escolhida, e o seletor nem aparece. Com
     duas ("Cliente", "Indicado por"), escolher por conta própria mandaria o
     link errado — o servidor recusa e a tela pergunta. */
  useEffect(() => {
    if (colunasCliente.length === 1) setColunaCliente(colunasCliente[0].id);
  }, [colunasCliente]);

  const carregar = useCallback(async () => {
    setCarregando(true);

    try {
      setLinks(await PlanilhaService.links(planilhaId));
    } catch {
      /* Lista vazia já comunica; um alerta aqui interromperia quem só abriu a
         aba para copiar um link que ele sabe que existe. */
    } finally {
      setCarregando(false);
    }
  }, [planilhaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    PlanilhaService.marca()
      .then(setMarca)
      .catch(() => {
        /* Sem marca a página do cliente usa o neutro: não vale interromper
           quem abriu a tela para copiar um link. */
      });
  }, []);

  /**
   * A cor é gravada ao SOLTAR o seletor, não a cada movimento.
   *
   * `<input type="color">` dispara `onChange` continuamente enquanto o dedo
   * arrasta — gravar ali seria uma requisição por pixel de gradiente. O estado
   * local acompanha o arraste (a prévia responde), a rede só no `onBlur`.
   */
  const salvarMarca = async (mudanca: Partial<Pick<MarcaEmpresa, "cor" | "tema" | "capa">>) => {
    const antes = marca;

    setMarca((m) => (m ? { ...m, ...mudanca } : m));

    try {
      await PlanilhaService.salvarMarca(mudanca);
    } catch (err) {
      setMarca(antes);
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível salvar."));
    }
  };

  /**
   * Quem sugerir na lista.
   *
   * Os nomes JÁ GRAVADOS na planilha vêm primeiro, e não o cadastro inteiro,
   * porque o link casa por nome: emitir para um cliente cujo nome não está em
   * nenhuma linha gera uma página vazia. Os do cadastro entram depois, para
   * quem vai preencher a planilha em seguida.
   */
  const naPlanilha = useMemo(() => {
    const nomes = new Set<string>();

    for (const r of registros) {
      for (const c of colunasCliente) {
        const v = r.valores[c.id];

        if (typeof v === "string" && v.trim()) nomes.add(v.trim());
      }
    }

    return nomes;
  }, [registros, colunasCliente]);

  const sugestoes = useMemo(() => {
    const doCadastro = clientesCadastro.map((c) => c.nome).filter((n) => n && !naPlanilha.has(n));

    return [...[...naPlanilha].sort(), ...doCadastro.sort()];
  }, [naPlanilha, clientesCadastro]);

  /**
   * O endereço do link entregue ao cliente.
   *
   * Usa o domínio próprio da empresa quando ela tem um. `window.location.origin`
   * seria o endereço por onde o DONO entrou no sistema — ele acessa pelo nosso
   * domínio, e o link copiado sairia com o nome do sistema mesmo depois de a
   * empresa ter configurado o dela. O que decide não é por onde se administra,
   * é por onde a empresa quer ser vista.
   */
  const enderecoDe = (token: string) =>
    `${marca?.dominio ? `https://${marca.dominio}` : window.location.origin}/p/${token}`;

  const copiar = async (token: string) => {
    const url = enderecoDe(token);

    try {
      await navigator.clipboard.writeText(url);
      setCopiado(token);
      setTimeout(() => setCopiado((t) => (t === token ? null : t)), 2000);
    } catch {
      /* Clipboard bloqueado (http, permissão negada): mostrar o endereço deixa
         a cópia manual possível em vez de falhar em silêncio. */
      alert.info("Copie o link", url);
    }
  };

  const gerar = async () => {
    const nome = cliente.trim();

    if (!nome) return;

    setGerando(true);

    try {
      const link = await PlanilhaService.criarLink(planilhaId, {
        clienteNome: nome,
        colunaClienteId: colunaCliente || undefined,
        /* Só manda a lista quando ela NÃO é o conjunto inteiro: mandar tudo
           congelaria as colunas de hoje, e uma etapa criada depois ficaria de
           fora do link sem ninguém perceber. Omitir deixa o servidor aplicar
           o padrão dele. */
        colunasVisiveis: visiveis.size === exibiveis.length ? undefined : [...visiveis],
      });

      /* Reemitir para o mesmo cliente devolve o link existente com validade
         renovada: substitui em vez de duplicar na lista. */
      setLinks((atual) => [link, ...atual.filter((l) => l.id !== link.id)]);
      setCliente("");

      await copiar(link.token);
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível gerar o link."));
    } finally {
      setGerando(false);
    }
  };

  const revogar = async (link: LinkPublico) => {
    setLinks((atual) => atual.map((l) => (l.id === link.id ? { ...l, ativo: false } : l)));

    try {
      await PlanilhaService.revogarLink(link.id);
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível revogar."));
      carregar();
    }
  };

  if (colunasCliente.length === 0) {
    return (
      <p className="py-10 text-center text-[13px] text-faint">
        Esta planilha não tem coluna de Cliente. Crie uma em <strong className="text-mist">Colunas</strong> para poder
        enviar o acompanhamento a cada cliente.
      </p>
    );
  }

  const ativos = links.filter((l) => l.ativo);
  const revogados = links.filter((l) => !l.ativo);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SeletorCliente
            valor={cliente}
            onChange={setCliente}
            opcoes={sugestoes}
            naPlanilha={naPlanilha}
            onConfirmar={gerar}
          />

          {colunasCliente.length > 1 && (
            <select
              value={colunaCliente}
              onChange={(e) => setColunaCliente(e.target.value)}
              className="focus-ring rounded-xl border border-fg/[0.1] bg-transparent px-3 py-2 text-[12.5px] text-ink outline-none"
            >
              <option value="">Qual coluna?</option>
              {colunasCliente.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={gerar}
            disabled={!cliente.trim() || gerando}
            className="focus-ring flex items-center gap-1.5 rounded-xl border border-fg/[0.1] px-3 py-2 text-[12px] text-mist transition-colors hover:text-ink disabled:opacity-40"
          >
            {gerando ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
            Gerar link
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[11.5px] text-faint">
            O cliente vê só as linhas no nome dele. Não vê outros clientes, nem edita nada.
          </p>

          <button
            onClick={() => setEscolhendo((e) => !e)}
            className="text-[11.5px] text-mist underline decoration-fg/20 underline-offset-2 transition-colors hover:text-ink"
          >
            {visiveis.size === exibiveis.length
              ? `mostrando as ${exibiveis.length} colunas`
              : `mostrando ${visiveis.size} de ${exibiveis.length}`}
          </button>
        </div>

        <AnimatePresence>
          {escolhendo && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-1.5 rounded-xl border border-fg/[0.08] p-2.5">
                {exibiveis.map((c) => {
                  const on = visiveis.has(c.id);

                  return (
                    <button
                      key={c.id}
                      onClick={() => alternar(c.id)}
                      className={`rounded-full px-2.5 py-1 text-[11.5px] transition-colors ${
                        on ? "bg-accent/10 text-accent" : "bg-fg/[0.04] text-faint line-through"
                      }`}
                    >
                      {c.nome}
                    </button>
                  );
                })}

                {/* As internas aparecem travadas, e não somem: sem elas, quem
                    procura "ATENDIMENTO" na lista conclui que a tela está
                    quebrada em vez de que a coluna foi marcada como interna. */}
                {internas.map((c) => (
                  <span
                    key={c.id}
                    title="Marcada como interna em Colunas — nunca aparece no link"
                    className="cursor-default rounded-full bg-fg/[0.03] px-2.5 py-1 text-[11.5px] text-faint/60 line-through"
                  >
                    {c.nome}
                  </span>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* O link casa por NOME. Avisar antes é mais barato que explicar depois
            por que a página do cliente abriu vazia. */}
        {cliente.trim() && !naPlanilha.has(cliente.trim()) && (
          <p className="text-[11.5px] text-amber-500">
            Nenhuma linha desta página está com esse nome — confira se está escrito igual ao da planilha.
          </p>
        )}
      </div>

      {/* A página do cliente é da EMPRESA, não do Flow: logo, cor, fundo e
          WhatsApp saem daqui. Vive no servidor porque quem abre o link é outro
          navegador — o tema do sistema, que mora no localStorage, não chega
          até lá. */}
      {marca && <Personalizacao marca={marca} onMudar={setMarca} onSalvar={salvarMarca} />}

      {carregando ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-mist">
          <Loader2 size={15} className="animate-spin text-accent" />
          Carregando...
        </div>
      ) : links.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-faint">Nenhum link gerado ainda.</p>
      ) : (
        <div className="flex flex-col divide-y divide-fg/[0.06]">
          {[...ativos, ...revogados].map((l) => (
            <div key={l.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 ${l.ativo ? "" : "opacity-50"}`}>
              <span className="text-[12.5px] text-ink">{l.cliente_nome}</span>

              <span className="text-[11px] text-faint">
                {l.ativo
                  ? l.visitas > 0
                    ? `${l.visitas} ${l.visitas === 1 ? "abertura" : "aberturas"}`
                    : "ainda não aberto"
                  : "revogado"}
                {l.expira_em && l.ativo && ` · expira ${new Date(l.expira_em).toLocaleDateString("pt-BR")}`}
              </span>

              {l.ativo && (
                <div className="ml-auto flex items-center gap-1">
                  <button
                    onClick={() => copiar(l.token)}
                    title="Copiar link"
                    className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-mist transition-colors hover:text-ink"
                  >
                    {copiado === l.token ? <Check size={14} className="text-accent" /> : <Copy size={14} />}
                  </button>
                  <button
                    onClick={() => revogar(l)}
                    title="Revogar — o link para de abrir"
                    className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-mist transition-colors hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LinksCliente;
