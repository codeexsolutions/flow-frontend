import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, Copy, Globe, Loader2, RefreshCw } from "lucide-react";

import DominioService, { type EstadoDominio } from "@/features/config/services/dominio.service";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";
import useAuth from "@/features/auth/store/auth.store";
import { ehGestor } from "@/features/vendas/components/TabsVendas";

const campo = "w-full rounded-xl border border-fg/[0.08] bg-fg/[0.03] px-3.5 py-2.5 text-[13px] text-ink outline-none transition-colors focus:border-accent/60";

/** Para onde o registro aponta, conforme o caso. */
const ALVO_CNAME = "cname.vercel-dns.com";
const ALVO_A = "76.76.21.21";

/**
 * Sufixos de dois níveis: em `josean.com.br`, o domínio raiz tem TRÊS partes.
 *
 * A lista é curta de propósito — cobre o que se vende no Brasil. Errar para o
 * lado de "é raiz" é o lado seguro: o registro A funciona nos dois casos,
 * enquanto o CNAME na raiz é recusado pela maioria dos provedores.
 */
const SUFIXOS_DUPLOS = ["com.br", "net.br", "org.br", "ind.br", "app.br", "eco.br", "co.uk", "com.pt"];

/**
 * O domínio digitado é a RAIZ (`josean.com`) ou um subdomínio
 * (`pedidos.josean.com`)?
 *
 * A pergunta decide qual registro pedir, e errá-la custa caro na prática: a
 * raiz não aceita CNAME em quase nenhum provedor — o painel simplesmente
 * recusa, ou aceita e quebra o e-mail do domínio junto. Mandar a pessoa criar
 * "um CNAME" sem essa distinção é mandá-la bater numa porta fechada e concluir
 * que o sistema é que está errado.
 */
const ehRaiz = (host: string): boolean => {
    const partes = host.split(".").filter(Boolean);
    const duplo = SUFIXOS_DUPLOS.some((sufixo) => host.endsWith(`.${sufixo}`) || host === sufixo);

    return partes.length <= (duplo ? 3 : 2);
};

/**
 * O endereço próprio da empresa.
 *
 * O link de acompanhamento que a gráfica manda pelo WhatsApp abre com o NOSSO
 * domínio. Por dentro a página já é dela — logo, cor, wallpaper —, mas o
 * endereço é a primeira coisa que se lê num link colado numa conversa, e ali
 * ainda aparece o nome do sistema. Quem tem `joseanfardamentos.com` quer mandar
 * `joseanfardamentos.com/p/...`.
 *
 * ---------------------------------------------------------------------
 * Por que a tela mostra o passo a passo, e não só um campo
 * ---------------------------------------------------------------------
 * Gravar aqui não aponta domínio nenhum: falta um registro no provedor DO
 * CLIENTE e o domínio precisa ser liberado na hospedagem. Um campo solitário
 * daria a entender que salvar basta — e o jeito de descobrir que não bastava
 * seria uma leva de clientes com um link que não abre.
 *
 * Por isso o campo vem acompanhado do registro exato a criar e de um botão que
 * CONFERE. A conferência é feita pelo servidor: do navegador ela esbarraria no
 * CORS do próprio domínio testado, e o erro de CORS é indistinguível de "não
 * existe" para quem está lendo a tela.
 */
const DominioProprio = () => {
  const alert = useAlert();
  const { user } = useAuth();

  /* Trocar o endereço muda o link que TODO cliente da empresa recebe. É
     decisão de dono, como o cadastro ao lado — e a API é quem barra de fato. */
  const gestor = ehGestor(user);

  const [dominio, setDominio] = useState("");
  const [salvo, setSalvo] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [estado, setEstado] = useState<EstadoDominio | null>(null);

  useEffect(() => {
    DominioService.ler()
      .then(({ dominio: atual }) => {
        setDominio(atual ?? "");
        setSalvo(atual);
      })
      .catch(() => {
        /* Sem o campo no banco (migration não aplicada) a seção fica vazia em
           vez de estourar um alerta na cara de quem abriu Configurações para
           mexer em outra coisa. */
      })
      .finally(() => setCarregando(false));
  }, []);

  const salvar = async () => {
    setSalvando(true);

    try {
      const { dominio: gravado } = await DominioService.salvar(dominio.trim() || null);

      /* O servidor devolve o valor NORMALIZADO — sem `https://`, sem `www.`,
         sem barra. O campo passa a mostrar o que de fato ficou gravado; deixar
         o texto digitado faria a tela discordar do banco em silêncio. */
      setDominio(gravado ?? "");
      setSalvo(gravado);
      setEstado(null);

      alert.success(
        gravado ? "Endereço salvo!" : "Voltou ao endereço padrão",
        gravado ? "Os próximos links copiados já saem com ele." : "Os links voltam a usar o endereço do sistema.",
      );

      /* Confere na sequência: quem acabou de salvar quer saber se já funciona,
         e pedir um segundo clique para a resposta mais importante da tela seria
         economia de botão paga com uma dúvida. */
      if (gravado) void verificar();

    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível salvar o endereço."));
    } finally {
      setSalvando(false);
    }
  };

  const verificar = async () => {
    setVerificando(true);

    try {
      setEstado(await DominioService.verificar());
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível verificar agora."));
    } finally {
      setVerificando(false);
    }
  };

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      alert.success("Copiado!", texto);
    } catch {
      alert.info("Copie manualmente", texto);
    }
  };

  if (carregando) {
    return (
      <section className="card glass-sheen flex items-center gap-2 p-5 text-[12px] text-faint">
        <Loader2 size={14} className="animate-spin" /> Carregando endereço…
      </section>
    );
  }

  const mudou = (dominio.trim() || null) !== salvo;

  /* O registro exato a criar, para o domínio que está no campo AGORA — não
     para o que está gravado. Quem está digitando é quem vai ao provedor em
     seguida, e a instrução tem de acompanhar o que ele decidiu usar. */
  const host = dominio.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];

  /* O registro vem da HOSPEDAGEM quando já conferimos, e do palpite abaixo
     antes disso. O de lá é a fonte da verdade: o IP do balanceador muda, e uma
     constante desatualizada mandaria todo cliente novo apontar para o lugar
     errado — seguindo a instrução da própria tela. */
  const registro = estado?.registro
    ? { tipo: estado.registro.tipo, nome: estado.registro.nome, alvo: estado.registro.valor }
    : ehRaiz(host)
      ? { tipo: "A", nome: "@", alvo: ALVO_A }
      : { tipo: "CNAME", nome: host.split(".")[0], alvo: ALVO_CNAME };

  return (
    <section className="card glass-sheen flex flex-col gap-4 p-5">
      <header className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/[0.14] text-accent-soft ring-1 ring-inset ring-accent/20">
          <Globe size={16} />
        </span>

        <div className="min-w-0">
          <h2 className="text-[13px] text-ink">Endereço próprio</h2>
          <p className="text-[11px] leading-relaxed text-faint">
            O domínio que aparece nos links que você manda para os clientes
          </p>
        </div>
      </header>

      {!gestor ? (
        <p className="text-[12px] leading-relaxed text-faint">
          {salvo
            ? `Os links do cliente saem por ${salvo}.`
            : "Os links do cliente saem pelo endereço padrão do sistema. Só o dono pode trocar."}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase tracking-[0.7px] text-faint">Domínio</label>

            <input
              value={dominio}
              onChange={(e) => setDominio(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && mudou && salvar()}
              placeholder="joseanfardamentos.com"
              spellCheck={false}
              autoCapitalize="none"
              className={campo}
            />

            <p className="text-[11px] leading-relaxed text-faint">
              Só o domínio — sem <span className="text-mist">https://</span> e sem barra. Deixe em branco para voltar ao
              endereço padrão.
            </p>
          </div>

          {/* A prévia do que muda. É o único jeito de a pessoa conferir a
              decisão sem sair da tela, gerar um link e colar em algum lugar. */}
          {dominio.trim() && (
            <div className="rounded-xl border border-fg/[0.07] bg-fg/[0.02] px-3.5 py-2.5">
              <p className="text-[10px] uppercase tracking-[0.7px] text-faint">Os links ficarão assim</p>
              <p className="mt-1 break-all text-[12px] text-ink">
                https://{dominio.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "")}/p/abc123…
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={salvar}
              disabled={salvando || !mudou}
              className="focus-ring flex cursor-pointer items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[12px] text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {salvando && <Loader2 size={14} className="animate-spin" />}
              Salvar
            </button>

            {salvo && (
              <button
                type="button"
                onClick={verificar}
                disabled={verificando}
                className="focus-ring flex cursor-pointer items-center gap-2 rounded-xl border border-fg/[0.1] px-3.5 py-2.5 text-[12px] text-mist transition-colors hover:text-ink disabled:opacity-50"
              >
                <RefreshCw size={13} className={verificando ? "animate-spin" : undefined} />
                Verificar
              </button>
            )}
          </div>

          {/* O resultado da conferência.
              Verde não é enfeite: ele é a diferença entre "pode mandar os links
              pelo novo endereço" e "ainda não". */}
          {estado?.responde === true && (
            <p className="flex items-start gap-2 rounded-xl border border-success/25 bg-success/[0.08] px-3.5 py-2.5 text-[12px] leading-relaxed text-success">
              <CircleCheck size={14} className="mt-0.5 shrink-0" />
              Está no ar. Os links que você copiar já podem ser enviados por este endereço.
            </p>
          )}

          {estado?.responde === false && (
            <p className="flex items-start gap-2 rounded-xl border border-warning/25 bg-warning/[0.08] px-3.5 py-2.5 text-[12px] leading-relaxed text-warning">
              <CircleAlert size={14} className="mt-0.5 shrink-0" />
              {estado.detalhe}
            </p>
          )}

          {/* Os dois passos que este sistema NÃO consegue dar sozinho.
              Ficam à vista, e não atrás de um "saiba mais": quem chegou aqui
              vai precisar deles, e escondê-los só adiaria a descoberta. */}
          <div className="flex flex-col gap-2 border-t border-fg/[0.06] pt-3.5">
            <p className="text-[10px] uppercase tracking-[0.7px] text-faint">
              {estado?.naHospedagem === true ? "Falta só isto, no provedor do domínio" : "Para funcionar, falta fazer fora daqui"}
            </p>

            {/*
             * O TXT de posse vem PRIMEIRO, e só quando existe.
             *
             * Ele é o passo que ninguém adivinha: o registro A pode estar
             * criado e certo, o endereço resolve, e mesmo assim o navegador
             * derruba a conexão — porque sem esta confirmação a hospedagem não
             * emite o certificado. Sem este bloco, a tela mandava conferir o
             * registro A que já estava lá, e a pessoa ficava dias no laço.
             */}
            {estado?.verificacao && (
              <div className="flex flex-col gap-1.5 rounded-xl border border-warning/25 bg-warning/[0.06] px-3 py-2.5">
                <p className="text-[12px] leading-relaxed text-mist">
                  <span className="text-warning">Primeiro:</span> crie um registro{" "}
                  <span className="text-ink">TXT</span> com o nome{" "}
                  <span className="text-ink">{estado.verificacao.nome}</span> e este valor — é assim que a hospedagem
                  confirma que o domínio é seu. Sem ele o certificado de segurança não é emitido.
                </p>

                <button
                  type="button"
                  onClick={() => copiar(estado.verificacao!.valor)}
                  className="focus-ring flex w-full items-center justify-between gap-2 rounded-lg border border-fg/[0.1] bg-fg/[0.03] px-2.5 py-1.5 text-left text-[11.5px] text-ink transition-colors hover:border-accent/40"
                >
                  <span className="min-w-0 break-all">{estado.verificacao.valor}</span>
                  <Copy size={12} className="shrink-0 text-faint" />
                </button>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <p className="text-[12px] leading-relaxed text-mist">
                {estado?.verificacao && <span className="text-warning">Depois:</span>} No provedor onde você comprou
                o domínio, crie um registro{" "}
                <span className="text-ink">{registro.tipo}</span>
                {registro.nome && (
                  <>
                    {" "}
                    com o nome <span className="text-ink">{registro.nome}</span>
                  </>
                )}{" "}
                apontando para:
              </p>

              <button
                type="button"
                onClick={() => copiar(registro.alvo)}
                className="focus-ring flex w-fit items-center gap-2 rounded-lg border border-fg/[0.1] bg-fg/[0.03] px-2.5 py-1.5 text-[11.5px] text-ink transition-colors hover:border-accent/40"
              >
                {registro.alvo}
                <Copy size={12} className="text-faint" />
              </button>

              {registro.tipo === "A" && (
                <p className="text-[11px] leading-relaxed text-faint">
                  É um registro A, e não CNAME, porque este é o domínio raiz — a maioria dos provedores recusa CNAME
                  nele, e onde aceita costuma derrubar o e-mail do domínio junto.
                </p>
              )}
            </div>

            {/* O passo 2 sumiu como TAREFA: o cadastro na hospedagem acontece
                sozinho ao salvar. Ele continua aparecendo como ESTADO, porque
                é o outro motivo pelo qual um endereço pode não abrir — e sem
                dizer qual dos dois falhou, "não funciona" manda procurar no
                lugar errado. */}
            {estado?.naHospedagem === true && !estado.verificacao && (
              <p className="flex items-center gap-2 text-[11.5px] text-mist">
                <CircleCheck size={13} className="shrink-0 text-success" />
                {estado.apontado === true
                  ? "Domínio liberado e DNS apontado — só falta o certificado ser emitido."
                  : "Domínio já liberado na hospedagem — falta só o registro acima."}
              </p>
            )}

            {estado?.naHospedagem === null && salvo && (
              <p className="text-[12px] leading-relaxed text-mist">
                <span className="text-ink">2.</span> Avise o suporte para liberar o domínio na hospedagem — sem isso o
                endereço responde, mas não abre o sistema.
              </p>
            )}

            <p className="text-[11px] leading-relaxed text-faint">
              O DNS pode levar de alguns minutos a algumas horas para propagar. Use o botão Verificar para saber quando
              estiver pronto — enquanto não estiver, continue mandando os links pelo endereço de sempre.
            </p>
          </div>
        </>
      )}
    </section>
  );
};

export default DominioProprio;
