import type { ReactNode } from "react";
import { Building2, Hash, FileText, User, MapPin, Phone, Smartphone, MessageCircle, Mail, ShieldCheck, Image as ImageIcon } from "lucide-react";

import useEnterprise from "@/features/empresa/store/enterprise.store";
import { formatDocument } from "@/shared/utils/format";
import { rotuloDocumento } from "@/shared/utils/documento";
import { maskPhone } from "@/shared/validation/masks";

/**
 * A empresa, em leitura — a coluna direita do perfil.
 *
 * ---------------------------------------------------------------------------
 * Ela PREENCHE a coluna, e é por isso que é detalhada
 * ---------------------------------------------------------------------------
 * Um cartão curto ao lado de um formulário alto deixa metade da tela em
 * branco, e "sobra de tela" não é neutra: ela faz a coluna parecer um resto,
 * algo que ficou ali por falta de lugar melhor. Preenchendo a altura, a
 * coluna vira a outra metade da tela — o que a empresa É, ao lado de quem
 * você é.
 *
 * O que dá corpo a ela é o detalhe, não o espaçamento esticado: cada bloco
 * abaixo responde a uma pergunta que alguém faz de verdade ao abrir esta tela
 * — qual é o meu código, que documento está cadastrado, para onde vai a
 * correspondência, por onde o cliente me acha, e que imagens saem na nota.
 *
 * Continua sendo LEITURA. Quem edita é Configurações › Empresa, e é para lá
 * que o rodapé manda — repetir os campos aqui daria dois lugares para o mesmo
 * dado, que foi justamente o defeito da versão anterior deste cartão.
 */

/** Um par rótulo/valor. `mono` para o que se confere dígito a dígito. */
const Linha = ({ icone, rotulo, valor, mono = false }: { icone: ReactNode; rotulo: string; valor: string; mono?: boolean }) => (
  <div className="flex items-start justify-between gap-3 py-1.5">
    <span className="flex min-w-0 shrink-0 items-center gap-2 text-[11.5px] text-mist">
      <span className="text-faint">{icone}</span>
      {rotulo}
    </span>
    <span className={`min-w-0 truncate text-right text-[12.5px] text-ink ${mono ? "tabular-nums" : ""}`} title={valor}>
      {valor}
    </span>
  </div>
);

/** Um agrupamento com título. Sem itens, não é renderizado pelo chamador. */
const Bloco = ({ titulo, children }: { titulo: string; children: ReactNode }) => (
  <div className="rounded-xl border border-fg/[0.06] bg-fg/[0.02] px-3.5 py-2.5">
    <p className="mb-1 text-[10px] uppercase tracking-[0.1em] text-faint">{titulo}</p>
    <div className="divide-y divide-fg/[0.05]">{children}</div>
  </div>
);

const CorporateBadge = () => {
  const { enterprise } = useEnterprise();

  if (!enterprise) return null;

  const end = enterprise.endereco;
  const cont = enterprise.contato;

  const identificacao = [
    enterprise.cpfCnpj && { icone: <FileText size={13} />, rotulo: rotuloDocumento(enterprise.cpfCnpj), valor: formatDocument(enterprise.cpfCnpj), mono: true },
    enterprise.nomeRepresentante && { icone: <User size={13} />, rotulo: "Representante", valor: enterprise.nomeRepresentante },
    enterprise.inscMunicipal && { icone: <Hash size={13} />, rotulo: "Insc. municipal", valor: enterprise.inscMunicipal, mono: true },
  ].filter(Boolean) as { icone: ReactNode; rotulo: string; valor: string; mono?: boolean }[];

  const contatos = [
    cont?.telefone && { icone: <Phone size={13} />, rotulo: "Telefone", valor: maskPhone(String(cont.telefone)), mono: true },
    cont?.celular && { icone: <Smartphone size={13} />, rotulo: "Celular", valor: maskPhone(String(cont.celular)), mono: true },
    cont?.whatsapp && { icone: <MessageCircle size={13} />, rotulo: "WhatsApp", valor: maskPhone(String(cont.whatsapp)), mono: true },
    cont?.email && { icone: <Mail size={13} />, rotulo: "E-mail", valor: cont.email },
  ].filter(Boolean) as { icone: ReactNode; rotulo: string; valor: string; mono?: boolean }[];

  /* As imagens que a empresa já subiu. Aqui elas não são campo — são a
     resposta a "a minha nota está vestida?", que se responde vendo, e não
     lendo o nome de um arquivo. */
  const imagens = [
    { rotulo: "Logo", url: enterprise.urlLogo },
    { rotulo: "Fundo da nota", url: enterprise.notaBackground },
  ].filter((i) => Boolean(i.url)) as { rotulo: string; url: string }[];

  return (
    /* `h-full` + `flex-col`: a coluna inteira é o cartão. O miolo é o que
       cresce (`flex-1`), então o rodapé encosta no fim da tela em vez de
       flutuar no meio com vazio embaixo. */
    <section className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-fg/[0.08] bg-gradient-to-b from-surface-raised to-surface">
      <div className="pointer-events-none absolute -left-10 -top-16 h-44 w-44 rounded-full bg-accent/15 blur-3xl" />

      {/* Cabeçalho: logo à esquerda, identidade à direita — a mesma anatomia
          do cabeçalho que sai na nota (`HeaderInterprise`). */}
      <header className="relative flex shrink-0 items-center gap-4 border-b border-fg/[0.06] px-5 py-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-accent/25 bg-canvas">
          {enterprise.urlLogo ? (
            /* `object-contain` porque logo é marca, não foto de capa: `cover`
               come as bordas de qualquer uma que não seja quadrada. */
            <img src={enterprise.urlLogo} alt={enterprise.nomeFantasia} className="h-full w-full object-contain p-1" />
          ) : (
            <Building2 className="h-7 w-7 text-accent-soft" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] text-ink">{enterprise.nomeFantasia}</h2>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`flex shrink-0 items-center gap-1 text-[11px] ${enterprise.ativo ? "text-success" : "text-danger"}`}>
              <ShieldCheck size={13} />
              {enterprise.ativo ? "Conta ativa" : "Conta inativa"}
            </span>

            {enterprise.codigoEmpresa && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent/20 bg-accent/[0.08] px-2 py-0.5 font-mono text-[10.5px] text-accent-soft">
                <Hash size={10} />
                {enterprise.codigoEmpresa}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* O miolo cresce e rola por dentro quando a empresa tem muito
          cadastrado — a coluna não empurra a página para baixo. */}
      <div className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
        {identificacao.length > 0 && (
          <Bloco titulo="Identificação">
            {identificacao.map((l) => (
              <Linha key={l.rotulo} {...l} />
            ))}
          </Bloco>
        )}

        {end && (
          <Bloco titulo="Endereço">
            <Linha icone={<MapPin size={13} />} rotulo="Logradouro" valor={[end.logradouro, end.numero].filter(Boolean).join(", ") || "—"} />
            {end.complemento && <Linha icone={<MapPin size={13} />} rotulo="Complemento" valor={end.complemento} />}
            {end.bairro && <Linha icone={<MapPin size={13} />} rotulo="Bairro" valor={end.bairro} />}
            <Linha icone={<Building2 size={13} />} rotulo="Cidade/UF" valor={[end.cidade, end.uf].filter(Boolean).join("/") || "—"} />
            {end.cep && <Linha icone={<Hash size={13} />} rotulo="CEP" valor={end.cep} mono />}
          </Bloco>
        )}

        {contatos.length > 0 && (
          <Bloco titulo="Contato">
            {contatos.map((l) => (
              <Linha key={l.rotulo} {...l} />
            ))}
          </Bloco>
        )}

        {imagens.length > 0 && (
          <div className="rounded-xl border border-fg/[0.06] bg-fg/[0.02] px-3.5 py-2.5">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-faint">
              <ImageIcon size={12} /> Como a nota sai
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              {imagens.map((i) => (
                <div key={i.rotulo} className="min-w-0">
                  <div className="aspect-[4/3] overflow-hidden rounded-lg border border-fg/[0.08] bg-canvas">
                    <img
                      src={i.url}
                      alt={i.rotulo}
                      className="h-full w-full object-contain"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </div>
                  <p className="mt-1 truncate text-[10.5px] text-faint">{i.rotulo}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Onde se muda tudo isto. Sem o recado, a leitura vira beco: a pessoa
          vê o dado errado e procura o campo dentro deste cartão. */}
      <footer className="relative shrink-0 border-t border-fg/[0.06] bg-fg/[0.02] px-5 py-3 text-[11px] leading-relaxed text-faint">
        Estes dados são cadastrados em <span className="text-mist">Configurações › Empresa</span>.
      </footer>
    </section>
  );
};

export default CorporateBadge;
