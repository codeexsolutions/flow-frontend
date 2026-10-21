import { useEffect, useState } from "react";

import ClientService from "@/features/clientes/services/client.service";
import useClienteStore from "@/features/clientes/store/cliente.store";
import { eStatus } from "@/shared/domain/cliente";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";

import { Botao, Campo, CLASSE_INPUT, Folha } from "@/mobile/ui";

/** Celular com máscara enquanto digita: (11) 98765-4321. */
const mascaraTelefone = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);

  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;

  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

/**
 * Cadastro de balcão: nome e WhatsApp, e o resto fica para o computador.
 *
 * O cliente está na frente do vendedor esperando. Só o nome é obrigatório no
 * servidor, e é só ele que este formulário exige.
 */
const NovoCliente = ({ aberta, aoFechar, aoCriar, nomeInicial = "" }: { aberta: boolean; aoFechar: () => void; aoCriar: (id: string) => void; nomeInicial?: string }) => {
  const alert = useAlert();
  const fetchClientes = useClienteStore((s) => s.fetchClientes);

  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [cpf, setCpf] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberta) return;

    setNome(nomeInicial);
    setWhatsapp("");
    setCpf("");
  }, [aberta, nomeInicial]);

  const salvar = async () => {
    if (!nome.trim()) return;

    setSalvando(true);
    try {
      const { data } = await ClientService.create({
        nome: nome.trim(),
        status: eStatus.ATIVO,
        cpfCnpj: cpf.replace(/\D/g, "") || null,
        contato: whatsapp ? { whatsapp: whatsapp.replace(/\D/g, ""), celular: whatsapp.replace(/\D/g, "") } : undefined,
      });

      await fetchClientes(true);

      const id = Array.isArray(data?.data) ? data.data[0] : data?.data;
      alert.toast("success", "Cliente cadastrado!", nome.trim(), { position: "top" });
      aoFechar();
      if (id) aoCriar(String(id));
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível cadastrar o cliente."));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Folha
      aberta={aberta}
      aoFechar={aoFechar}
      titulo="Novo cliente"
      rodape={
        <Botao className="w-full" disabled={!nome.trim() || salvando} onClick={() => void salvar()}>
          {salvando ? "Cadastrando…" : "Cadastrar"}
        </Botao>
      }
    >
      <form
        className="flex flex-col gap-4 pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
      >
        <Campo rotulo="Nome *">
          <input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" autoCapitalize="words" className={CLASSE_INPUT} placeholder="Nome do cliente" />
        </Campo>
        <Campo rotulo="WhatsApp">
          <input value={whatsapp} onChange={(e) => setWhatsapp(mascaraTelefone(e.target.value))} inputMode="tel" autoComplete="off" className={CLASSE_INPUT} placeholder="(00) 00000-0000" />
        </Campo>
        <Campo rotulo="CPF ou CNPJ (opcional)">
          <input value={cpf} onChange={(e) => setCpf(e.target.value)} inputMode="numeric" autoComplete="off" className={CLASSE_INPUT} placeholder="Só números" />
        </Campo>
        {/* Enter do teclado envia. */}
        <button type="submit" hidden />
      </form>
    </Folha>
  );
};

export default NovoCliente;
