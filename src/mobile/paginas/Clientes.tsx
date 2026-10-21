import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Phone, ShoppingCart, UserPlus, Users } from "lucide-react";

import useClienteStore from "@/features/clientes/store/cliente.store";
import useVendaStore from "@/features/vendas/store/venda.store";
import type ClientType from "@/shared/domain/cliente";
import { estaCancelado, totalDoPedido, valorPendenteDoPedido } from "@/shared/domain/pedido";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDocument } from "@/shared/utils/format";

import { Avatar, Botao, CampoBusca, Carregando, Dado, Folha, Linha, Tela, Vazio } from "@/mobile/ui";
import useFolhaNaUrl from "@/mobile/useFolhaNaUrl";
import NovoCliente from "@/mobile/paginas/NovoCliente";
import { linkWhatsapp, normalizar, telefoneDo } from "@/mobile/util";


const Clientes = () => {
  const { clientes, fetchClientes, loading, error } = useClienteStore();

  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState(false);
  const folha = useFolhaNaUrl("cliente");

  useEffect(() => {
    void fetchClientes();
  }, [fetchClientes]);

  const lista = useMemo(() => {
    const termo = normalizar(busca.trim());
    const digitos = busca.replace(/\D/g, "");

    return [...clientes]
      .filter((c) => {
        if (!termo) return true;
        if (normalizar(c.nome ?? "").includes(termo)) return true;

        return digitos.length >= 3 && (telefoneDo(c).replace(/\D/g, "").includes(digitos) || (c.cpfCnpj ?? "").replace(/\D/g, "").includes(digitos));
      })
      .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"));
  }, [clientes, busca]);

  const visiveis = lista.slice(0, 100);
  const aberto = clientes.find((c) => String(c.id) === folha.valor);

  return (
    <Tela
      titulo="Clientes"
      subtitulo={`${clientes.length} cadastrados`}
      acao={
        <button type="button" aria-label="Novo cliente" onClick={() => setNovo(true)} className="grid h-11 w-11 place-items-center rounded-full bg-accent/[0.12] text-accent-soft active:bg-accent/[0.2]">
          <UserPlus size={20} />
        </button>
      }
    >
      <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Nome, telefone ou CPF" />

      <div className="-mx-3 mt-2">
        {loading && clientes.length === 0 ? (
          <Carregando />
        ) : error && clientes.length === 0 ? (
          <Vazio icone={<Users size={24} />} titulo="Não deu para carregar" texto={error}>
            <Botao variante="secundario" onClick={() => void fetchClientes(true)}>
              Tentar de novo
            </Botao>
          </Vazio>
        ) : visiveis.length === 0 ? (
          <Vazio icone={<Users size={24} />} titulo={busca ? "Ninguém com esse nome" : "Nenhum cliente ainda"}>
            <Botao onClick={() => setNovo(true)}>
              <UserPlus size={18} />
              Cadastrar cliente
            </Botao>
          </Vazio>
        ) : (
          visiveis.map((c) => (
            <Linha key={c.id} onClick={() => folha.abrir(String(c.id))}>
              <Avatar nome={c.nome ?? "?"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] text-ink">{c.nome}</span>
                <span className="block truncate text-[12px] text-mist">{telefoneDo(c) || c.contato?.email || "Sem contato"}</span>
              </span>
            </Linha>
          ))
        )}
      </div>

      {lista.length > visiveis.length && <p className="mt-3 text-center text-[12px] text-faint">Use a busca para achar os outros {lista.length - visiveis.length}.</p>}

      <FichaCliente cliente={aberto} aoFechar={folha.fechar} />
      <NovoCliente aberta={novo} aoFechar={() => setNovo(false)} aoCriar={(id) => folha.abrir(id)} />
    </Tela>
  );
};

const FichaCliente = ({ cliente, aoFechar }: { cliente?: ClientType; aoFechar: () => void }) => {
  const navigate = useNavigate();
  const vendas = useVendaStore((s) => s.vendas);
  const fetchVendas = useVendaStore((s) => s.fetchVendas);

  useEffect(() => {
    if (cliente) void fetchVendas();
  }, [cliente, fetchVendas]);

  const resumo = useMemo(() => {
    const dele = vendas.filter((v) => String(v.clienteId) === String(cliente?.id) && !estaCancelado(v));

    return {
      quantidade: dele.length,
      total: dele.reduce((a, v) => a + totalDoPedido(v), 0),
      deve: dele.reduce((a, v) => a + valorPendenteDoPedido(v), 0),
    };
  }, [vendas, cliente?.id]);

  if (!cliente) return null;

  const telefone = telefoneDo(cliente);
  const end = cliente.endereco;
  const endereco = [end?.logradouro && `${end.logradouro}${end.numero ? `, ${end.numero}` : ""}`, end?.bairro, end?.cidade && `${end.cidade}${end.uf ? `/${end.uf}` : ""}`].filter(Boolean).join(" · ");

  return (
    <Folha
      aberta
      aoFechar={aoFechar}
      titulo={cliente.nome}
      subtitulo={cliente.cpfCnpj ? formatDocument(cliente.cpfCnpj) : undefined}
      rodape={
        <Botao className="w-full" onClick={() => navigate(`/pdv?cliente=${cliente.id}`, { replace: true })}>
          <ShoppingCart size={18} />
          Nova venda para {cliente.nome.split(" ")[0]}
        </Botao>
      }
    >
      {telefone && (
        <div className="grid grid-cols-2 gap-2">
          <a href={linkWhatsapp("", telefone)} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#25D366]/[0.14] text-[14px] font-medium text-[#1fa855]">
            <MessageCircle size={18} /> WhatsApp
          </a>
          <a href={`tel:${telefone.replace(/\D/g, "")}`} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-fg/[0.07] text-[14px] font-medium text-ink">
            <Phone size={18} /> Ligar
          </a>
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-fg/[0.04] px-2 py-3">
          <p className="text-[11px] text-mist">Compras</p>
          <p className="mt-0.5 text-[15px] font-semibold tabular-nums">{resumo.quantidade}</p>
        </div>
        <div className="rounded-2xl bg-fg/[0.04] px-2 py-3">
          <p className="text-[11px] text-mist">Total</p>
          <p className="mt-0.5 truncate text-[15px] font-semibold tabular-nums">{formatCurrency(resumo.total)}</p>
        </div>
        <div className="rounded-2xl bg-fg/[0.04] px-2 py-3">
          <p className="text-[11px] text-mist">Deve</p>
          <p className={`mt-0.5 truncate text-[15px] font-semibold tabular-nums ${resumo.deve > 0.004 ? "text-warning" : ""}`}>{formatCurrency(resumo.deve)}</p>
        </div>
      </div>

      <div className="mt-3">
        {telefone && <Dado rotulo="Telefone">{telefone}</Dado>}
        {cliente.contato?.email && <Dado rotulo="E-mail">{cliente.contato.email}</Dado>}
        {endereco && <Dado rotulo="Endereço">{endereco}</Dado>}
        {!telefone && !cliente.contato?.email && !endereco && <p className="py-3 text-center text-[13px] text-mist">Sem contato cadastrado.</p>}
      </div>
    </Folha>
  );
};

export default Clientes;
