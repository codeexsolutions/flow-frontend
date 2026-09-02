import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Loader2, Sparkles, ShieldCheck, Smartphone, WifiOff,
} from "lucide-react";

import CardPlano from "@/features/assinatura/components/CardPlano";
import useCatalogo from "@/shared/plano/catalogo.store";
import { type Plano } from "@/features/assinatura/types/assinatura.types";

/** O que vale para todo plano — dito uma vez, embaixo, em vez de repetido em cada cartão. */
const INCLUSO = [
  { icone: Smartphone, texto: "Instala como aplicativo no celular" },
  { icone: WifiOff, texto: "Continua abrindo se a internet cair" },
  { icone: ShieldCheck, texto: "Seus dados isolados dos de outras lojas" },
  { icone: Sparkles, texto: "Seis temas e nove cores de destaque" },
];
const PlanosPage = () => {
  const navigate = useNavigate();

  const planos = useCatalogo((s) => s.planos);
  const carregando = useCatalogo((s) => !s.carregado);
  const erro = useCatalogo((s) => s.erro);
  const carregarCatalogo = useCatalogo((s) => s.carregar);

  /* A lista já vem do catálogo carregado no boot; a chamada aqui só cobre
     quem abre `/planos` direto, e a store ignora o pedido repetido. */
  useEffect(() => {
    carregarCatalogo();
  }, [carregarCatalogo]);

  const umPlanoSo = planos.length === 1;

  /** O plano escolhido viaja na URL — o cadastro lê e já abre marcado. */
  const escolher = (plano: Plano) => navigate(`/cadastro?plano=${encodeURIComponent(plano.codigo)}`);

  return (
    /* `vitrine`: página pública veste a identidade do Flow, não o tema que o
       visitante salvou em Aparência. */
    <div className="vitrine aurora relative min-h-[100dvh] w-full overflow-x-hidden bg-canvas px-5 py-8 sm:py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col">
        <button
          type="button"
          onClick={() => navigate("/page")}
          className="focus-ring mb-8 inline-flex w-fit items-center gap-1.5 rounded-xl border border-fg/[0.07] px-3 py-1.5 text-[12px] text-mist transition hover:bg-fg/[0.04] hover:text-ink"
        >
          <ArrowLeft size={13} />
          Voltar
        </button>

        <div className="flex flex-col items-center text-center">
          <img src="/logo.png" alt="CodeEx Flow" width={48} height={48} className="h-12 w-12 rounded-xl shadow-e2" />
          {/*
           * O título acompanha o catálogo.
           *
           * "Todos os planos, lado a lado" em cima de um cartão só promete uma
           * comparação que a página não entrega — e a primeira coisa que o
           * visitante faz é procurar os outros. Com um plano em catálogo a
           * página deixa de ser tabela e vira a apresentação do produto.
           */}
          <h1 className="mt-5 text-2xl tracking-tight text-ink sm:text-[28px]">
            {umPlanoSo ? "O Flow, por um preço só" : "Todos os planos, lado a lado"}
          </h1>
          <p className="mt-2.5 max-w-lg text-[13px] leading-relaxed text-mist">
            {umPlanoSo
              ? "Um plano, o sistema inteiro: PDV, clientes, produtos, financeiro, produções e relatórios. Sem pacote para destravar depois."
              : "Do empreendedor que vende sozinho à operação com mais de uma loja. Você troca de plano quando quiser, pagando só a diferença."}
          </p>

          {/* A saída para quem abriu esta página e travou: o caminho curto para
              a conta, em vez de fechar a aba. */}
          <button
            type="button"
            onClick={() => navigate("/cadastro")}
            className="focus-ring group mt-6 inline-flex items-center gap-2 rounded-xl border border-accent/25 bg-accent/[0.08] px-4 py-2.5 text-[13px] text-accent-soft transition hover:bg-accent/[0.14]"
          >
            <Sparkles size={14} />
            Criar minha conta
          </button>
        </div>

        {carregando && (
          <div className="flex items-center justify-center gap-2 py-28 text-[13px] text-mist">
            <Loader2 size={15} className="animate-spin text-accent" />
            Carregando planos...
          </div>
        )}

        {!carregando && erro && (
          <p className="mt-12 rounded-2xl border border-danger/25 bg-danger/[0.06] px-6 py-10 text-center text-[13px] text-danger">{erro}</p>
        )}

        {!carregando && !erro && planos.length === 0 && (
          <p className="mt-12 rounded-2xl border border-dashed border-fg/[0.12] px-6 py-14 text-center text-[13px] text-faint">
            Nenhum plano disponível agora. Fale com o suporte para liberar seu cadastro.
          </p>
        )}

        {!carregando && planos.length > 0 && (
          <>
            {/*
              `items-stretch` (o padrão): todos os cartões da fileira com a
              mesma altura.

              A versão anterior usava `items-start` para o Starter não ganhar
              um vão do tamanho do Enterprise embaixo. Só que altura desigual
              lê como plano inacabado: o olho compara a moldura antes de ler o
              conteúdo, e o cartão mais baixo parece valer menos. Preferível o
              vão — e o `flex-1` dentro do cartão empurra o botão para a base,
              então os cinco botões ficam na mesma linha.

              Três colunas só a partir de `xl`: em 1024px, três cartões
              espremem o preço e a lista de recursos.

              Com um plano só a grade sai de cena: o cartão sozinho na
              primeira coluna de três fica estreito e encostado à esquerda,
              lendo como sobra de uma fileira que não veio.
            */}
            <div
              className={
                umPlanoSo
                  ? "mx-auto mt-10 w-full max-w-sm"
                  : "mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3"
              }
            >
              {planos.map((plano) => (
                <CardPlano key={plano.id} plano={plano} onEscolher={escolher} />
              ))}
            </div>

            {/* O que não varia entre planos fica aqui, dito uma vez só. */}
            <div className="mt-8 rounded-2xl border border-fg/[0.07] bg-fg/[0.02] p-6">
              <p className="text-[11px] uppercase tracking-[1.6px] text-faint">{umPlanoSo ? "Já incluído" : "Em todos os planos"}</p>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {INCLUSO.map(({ icone: Icone, texto }) => (
                  <div key={texto} className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-fg/[0.05] text-accent-soft">
                      <Icone size={15} />
                    </span>
                    <span className="text-[12.5px] leading-snug text-mist">{texto}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <p className="mt-10 text-center text-[12px] text-faint">
          Já tem conta?{" "}
          <button type="button" onClick={() => navigate("/login")} className="focus-ring rounded text-accent transition-colors hover:text-accent-soft">
            Entrar
          </button>
        </p>
      </div>
    </div>
  );
};

export default PlanosPage;
