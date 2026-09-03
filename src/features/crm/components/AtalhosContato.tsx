import { useEffect, useMemo, useState } from "react";
import { Link2, Loader2, Search, ShoppingCart, UserPlus, UserRound } from "lucide-react";

import CrmService, { type Conversa } from "@/features/crm/services/crm.service";
import ClienteForm from "@/features/clientes/components/ClienteForm";
import ClientService from "@/features/clientes/services/client.service";
import useClienteStore from "@/features/clientes/store/cliente.store";
import type { ClienteFormData } from "@/features/clientes/schema/cliente.schema";
import { maskPhone } from "@/shared/validation/masks";
import { Modal } from "@/shared/ui/Modal";
import Dica from "@/shared/ui/Dica";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";

/**
 * Os atalhos do contato — do lado oposto ao nome, no cabeçalho da conversa.
 *
 * ---------------------------------------------------------------------------
 * Por que eles moram aqui
 * ---------------------------------------------------------------------------
 * O atendimento e o cadastro são o mesmo momento, e estavam em telas
 * diferentes. Quem está conversando descobre o nome, o endereço e o que a
 * pessoa quer comprar — e para registrar isso precisava sair do WhatsApp, abrir
 * Clientes, procurar (ou cadastrar), voltar e reencontrar a conversa. O que
 * acontece na prática é que ninguém faz: o cliente segue como um número solto
 * e a loja perde o histórico dele.
 *
 * O botão que aparece depende do que falta:
 *
 *   • **sem cadastro** — "Cadastrar" (com o nome e o telefone já preenchidos) e
 *     "Vincular" (para quem JÁ está no cadastro com outro número);
 *   • **com cadastro** — "Ficha", que abre o painel do cliente AO LADO.
 *
 * "Vender" aparece sempre: é o desfecho que o atendimento persegue.
 *
 * ---------------------------------------------------------------------------
 * Nenhum destes botões TIRA a pessoa da conversa
 * ---------------------------------------------------------------------------
 * Cadastro e vínculo abrem em cima; a ficha abre ao lado; a venda abre a nota
 * por cima. Foi assim desde o começo para cadastrar e vincular, e a primeira
 * versão errava nos outros dois — mandava para `/clientes` e `/pdv`.
 *
 * Sair da tela custa o atendimento: quem navega perde a conversa de vista,
 * volta pelo menu, procura de novo na lista e recomeça a ler. O cliente do
 * outro lado só vê o silêncio.
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
function telefoneBr(digitos: string): string | null {
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
function nomeLimpo(bruto: string): string {
  const limpo = String(bruto ?? "")
    .replace(/[^\p{L}\p{N}\s'\-.:]/gu, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s'\-.:]+|[\s'\-.:]+$/g, "")
    .trim();

  return /\p{L}/u.test(limpo) ? limpo : "";
}

type Props = {
  conversa: Conversa;
  /** A lista precisa recarregar quando o vínculo muda — o nome exibido muda junto. */
  aoMudar: () => void;
  /** Abre e fecha o painel do cliente, que vive ao lado da conversa. */
  onAlternarPainel: () => void;
  painelAberto: boolean;
  /** Abre a nota — nova para este cliente — por cima da conversa. */
  onNovaVenda: () => void;
};

const AtalhosContato = ({ conversa, aoMudar, onAlternarPainel, painelAberto, onNovaVenda }: Props) => {
  const alert = useAlert();

  const [cadastrando, setCadastrando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [vinculando, setVinculando] = useState(false);
  const [busca, setBusca] = useState("");
  const [ligando, setLigando] = useState(false);

  const clientes = useClienteStore((s) => s.clientes);
  const buscarClientes = useClienteStore((s) => s.fetchClientes);

  /* A lista só é buscada quando o seletor abre: a store guarda por sessão, e
     carregar trezentos clientes ao abrir cada conversa seria desperdício numa
     tela em que se troca de conversa o tempo todo. */
  useEffect(() => {
    if (vinculando) void buscarClientes();
  }, [vinculando, buscarClientes]);

  const encontrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const lista = t ? clientes.filter((c) => c.nome?.toLowerCase().includes(t)) : clientes;

    return lista.slice(0, 40);
  }, [clientes, busca]);

  const telefone = telefoneBr(conversa.telefone);

  /* O nome do WhatsApp vira o nome do cadastro, depois de limpo — ver
     `nomeLimpo`. É um palpite, e um bom: é como a pessoa se apresenta. O
     formulário abre com ele escrito e editável. */
  const prefill = {
    nome: conversa.nome && conversa.nome !== conversa.telefone ? nomeLimpo(conversa.nome) : "",
    contato: telefone ? { whatsapp: telefone } : undefined,
  };

  const cadastrar = async (dados: ClienteFormData) => {
    setSalvando(true);

    try {
      const resposta = await ClientService.create(dados);

      /* O id do cadastro novo vem em `data[0]` (ver `Cadastrar` no controller
         da API). Com ele o contato já sai vinculado — cadastrar e depois pedir
         para a pessoa vincular à mão seria deixar o trabalho pela metade. */
      const novoId = (resposta as { data?: { data?: string[] } })?.data?.data?.[0];

      if (novoId) await CrmService.vincularCliente(conversa.contato_id, String(novoId));

      setCadastrando(false);
      aoMudar();

      alert.toast("success", "Cliente cadastrado", "A conversa já está ligada à ficha dele.", {
        position: "bottom-right",
        timer: 4000,
      });
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível cadastrar."));
    } finally {
      setSalvando(false);
    }
  };

  const vincular = async (clienteId: string) => {
    setLigando(true);

    try {
      await CrmService.vincularCliente(conversa.contato_id, clienteId);

      setVinculando(false);
      setBusca("");
      aoMudar();

      alert.toast("success", "Contato vinculado", "A conversa passa a mostrar o nome do cadastro.", {
        position: "bottom-right",
        timer: 4000,
      });
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível vincular."));
    } finally {
      setLigando(false);
    }
  };

  const botao =
    "focus-ring flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-fg/[0.08] px-2.5 text-[11.5px] text-mist transition-colors hover:border-accent/40 hover:text-accent-soft disabled:opacity-50";

  return (
    <>
      <div className="flex shrink-0 items-center gap-1.5">
        {/* A ficha aparece mesmo sem cadastro: o painel mostra a PRODUÇÃO, que
            existe para quem mandou fazer antes de virar cliente. */}
        <Dica texto="Ver cadastro, produção e compras — ao lado da conversa">
          <button
            type="button"
            onClick={onAlternarPainel}
            aria-pressed={painelAberto}
            className={`${botao} ${painelAberto ? "border-accent/40 text-accent-soft" : ""}`}
          >
            <UserRound size={13} />
            <span className="hidden md:inline">Ficha</span>
          </button>
        </Dica>

        {!conversa.cliente_fk && (
          <>
            <Dica texto="Cadastrar esta pessoa como cliente">
              <button type="button" onClick={() => setCadastrando(true)} className={botao}>
                <UserPlus size={13} />
                <span className="hidden md:inline">Cadastrar</span>
              </button>
            </Dica>

            {/* Para quem JÁ é cliente e escreveu de outro número — o caso que o
                casamento automático por telefone não pega. */}
            <Dica texto="Ligar a um cliente que já está no cadastro">
              <button type="button" onClick={() => setVinculando(true)} className={botao}>
                <Link2 size={13} />
                <span className="hidden lg:inline">Vincular</span>
              </button>
            </Dica>
          </>
        )}

        <Dica texto="Abrir uma nota para este cliente, sem sair da conversa">
          <button type="button" onClick={onNovaVenda} className={botao}>
            <ShoppingCart size={13} />
            <span className="hidden lg:inline">Vender</span>
          </button>
        </Dica>
      </div>

      {/* Cadastro, já preenchido com o que a conversa sabe. */}
      {cadastrando && (
        <ClienteForm prefill={prefill} saving={salvando} onClose={() => setCadastrando(false)} onSubmit={cadastrar} />
      )}

      {/* Seletor de cliente existente. */}
      <Modal
        open={vinculando}
        onClose={() => {
          setVinculando(false);
          setBusca("");
        }}
        title="Vincular ao cadastro"
        subtitle={conversa.nome}
        size="sm"
      >
        <div className="flex flex-col gap-3">
          <div className="overflow-hidden rounded-xl border border-fg/[0.06]">
            {/* A busca DENTRO da lista, grudada no topo: ela filtra o que está
                logo abaixo, e fora da caixa parecia buscar outra coisa. Mesma
                decisão da busca de contatos, em `CrmPage`. */}
            <div className="sticky top-0 z-10 flex h-[38px] items-center gap-2 border-b border-fg/[0.06] bg-surface px-3">
              <Search className="h-4 w-4 shrink-0 text-muted" />
              <input
                autoFocus
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar cliente pelo nome"
                className="w-full flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-faint"
              />
            </div>

            <div className="max-h-72 overflow-y-auto">
            {encontrados.length === 0 ? (
              <p className="px-3 py-6 text-center text-[12px] text-faint">
                {busca.trim() ? "Nenhum cliente com esse nome." : "Nenhum cliente cadastrado ainda."}
              </p>
            ) : (
              encontrados.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={ligando}
                  onClick={() => void vincular(String(c.id))}
                  className="flex w-full items-center gap-2 border-b border-fg/[0.04] px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-fg/[0.05] disabled:opacity-50"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent/25 bg-accent/[0.12] text-accent-soft">
                    <UserRound size={13} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-ink">{c.nome}</span>
                    {c.contato?.whatsapp && (
                      <span className="block truncate text-[11px] text-faint">{c.contato.whatsapp}</span>
                    )}
                  </span>
                  {ligando && <Loader2 size={13} className="shrink-0 animate-spin text-accent" />}
                </button>
              ))
            )}
            </div>
          </div>

          {/* A saída para quem abriu o seletor e percebeu que a pessoa não tem
              cadastro nenhum: em vez de fechar e procurar o outro botão. */}
          <button
            type="button"
            onClick={() => {
              setVinculando(false);
              setCadastrando(true);
            }}
            className="flex cursor-pointer items-center justify-center gap-1.5 text-[12px] text-mist transition-colors hover:text-accent-soft"
          >
            <UserPlus size={13} /> Não está na lista — cadastrar agora
          </button>
        </div>
      </Modal>
    </>
  );
};

export default AtalhosContato;
