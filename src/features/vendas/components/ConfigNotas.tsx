import { useState } from "react";
import { Loader2, QrCode, ShieldOff, Image as ImageIcon } from "lucide-react";

import useEnterprise from "@/features/empresa/store/enterprise.store";
import UploadImagem from "@/shared/ui/UploadImagem";
import { useAlert } from "@/shared/ui/Alert";
import { extractErrorMessage, getErrorTitle } from "@/shared/utils/errorHandler";

/**
 * CONFIGURAÇÕES DA NOTA — no balcão, onde a nota é feita.
 *
 * ---------------------------------------------------------------------------
 * Por que aqui, e não só em Configurações › Empresa
 * ---------------------------------------------------------------------------
 * Estas três chaves mudam o papel que sai para o cliente, e quem descobre que
 * elas estão erradas é quem está emitindo — vendo o QR numa loja que só recebe
 * no cartão, ou o CPF impresso numa nota que vai junto da sacola. Mandar essa
 * pessoa para outra seção, achar a aba certa e voltar é o caminho que faz
 * ninguém arrumar: arruma-se onde se percebe.
 *
 * As mesmas chaves continuam em Configurações › Empresa. Não é duplicação de
 * regra — é o mesmo campo com duas portas, e quem grava é o mesmo
 * `updateEnterprise`.
 *
 * ---------------------------------------------------------------------------
 * Cada uma é PADRÃO, não trava
 * ---------------------------------------------------------------------------
 * O Pix ligado aqui é o valor com que a nota NASCE; dentro dela, quem atende
 * continua ligando e desligando por venda, e é essa escolha que fica gravada
 * no pedido. O padrão existe para a loja não repetir a mesma correção em toda
 * nota — não para impedir a exceção.
 *
 * ---------------------------------------------------------------------------
 * Salva no clique, sem botão "Salvar"
 * ---------------------------------------------------------------------------
 * Mesma escolha das outras preferências de uma chave só: um rodapé de salvar
 * para um interruptor faz a pessoa desligá-lo, sair da tela e descobrir depois
 * que não valeu.
 */

/** Uma preferência: o interruptor, o nome e a explicação de quando usar. */
const Chave = ({
  icone,
  titulo,
  descricao,
  ligada,
  onMudar,
  salvando,
}: {
  icone: React.ReactNode;
  titulo: string;
  descricao: string;
  ligada: boolean;
  onMudar: (v: boolean) => void;
  salvando: boolean;
}) => (
  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-fg/[0.08] p-3.5">
    <input
      type="checkbox"
      checked={ligada}
      disabled={salvando}
      onChange={(e) => onMudar(e.target.checked)}
      className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]"
    />

    <span className="min-w-0">
      <span className="flex items-center gap-2 text-[13px] text-ink">
        <span className="text-accent-soft">{icone}</span>
        {titulo}
      </span>
      <span className="mt-0.5 block text-[11.5px] leading-relaxed text-faint">{descricao}</span>
    </span>
  </label>
);

const ConfigNotas = () => {
  const alert = useAlert();
  const { enterprise, updateEnterprise } = useEnterprise();

  const [salvando, setSalvando] = useState(false);

  if (!enterprise) return null;

  const salvar = async (dados: Record<string, unknown>) => {
    setSalvando(true);

    try {
      await updateEnterprise(enterprise.id, dados);
    } catch (err) {
      alert.error(getErrorTitle(err), extractErrorMessage(err, "Não foi possível salvar."));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <p className="text-[13px] text-ink">O papel que sai para o cliente</p>
        {salvando && <Loader2 size={13} className="animate-spin text-accent" />}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Chave
          icone={<QrCode size={14} />}
          titulo="Nota nasce com o QR do Pix"
          descricao="Vale para as notas NOVAS. Dentro de cada nota o QR continua podendo ser ligado ou desligado — e é essa escolha que fica gravada na venda. Desligue aqui se a sua loja recebe no cartão e o QR só atrapalha."
          ligada={enterprise.notaMostrarQr !== false}
          onMudar={(v) => void salvar({ notaMostrarQr: v })}
          salvando={salvando}
        />

        <Chave
          icone={<ShieldOff size={14} />}
          titulo="Esconder o CPF nas notas"
          descricao="Vale para o seu documento e para o do cliente. A nota circula por WhatsApp e balcão — CNPJ é público, CPF não. Desmarque se precisar do documento impresso."
          ligada={enterprise.ocultarCpfNota !== false}
          onMudar={(v) => void salvar({ ocultarCpfNota: v })}
          salvando={salvando}
        />
      </div>

      {/* O wallpaper da nota — imagem, não interruptor, então tem espaço
          próprio. Ele entra atrás do conteúdo, com overlay: o que sobe aqui é
          marca d'água, não capa. */}
      <div className="flex flex-col gap-2 rounded-xl border border-fg/[0.08] p-3.5">
        <span className="flex items-center gap-2 text-[13px] text-ink">
          <ImageIcon size={14} className="text-accent-soft" />
          Papel de parede da nota
        </span>
        <span className="text-[11.5px] leading-relaxed text-faint">
          Entra atrás do conteúdo, esmaecido, e sai no PNG e no PDF. Imagem clara funciona melhor: o texto da nota é
          escuro e precisa continuar legível impresso.
        </span>

        <div className="mt-1 max-w-md">
          <UploadImagem
            tipo="wallpaper"
            formato="largo"
            rotulo="Papel de parede"
            valor={enterprise.notaBackground ?? null}
            onChange={(url) => void salvar({ notaBackground: url ?? "" })}
          />
        </div>
      </div>
    </div>
  );
};

export default ConfigNotas;
