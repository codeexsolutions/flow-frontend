import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotionConfig } from "framer-motion";
import {
  Hash, ShoppingBag, Tag, Barcode, Ruler, MapPin, Layers, Bookmark,
  AlertTriangle, Check, Package,
} from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { calcularGanho, productSchema, type ProductFormData, type ProductFormInput } from "@/features/estoque/schema/product.schema";
import type { Categoria } from "@/shared/domain/estoque";
import { SEM_CATEGORIA, TIPO_ITEM } from "@/shared/domain/produto";
import {
  Form, FormGrid, FormSection, TextField, SelectBox, TextArea, CurrencyField,
  FormActions, SwitchField,
} from "@/shared/ui/form/FormKit";
import UploadImagem from "@/shared/ui/UploadImagem";
import { formatCurrency } from "@/shared/utils/currency";
import { useAlert } from "@/shared/ui/Alert";

/**
 * Cadastro do item — produto, serviço ou insumo.
 *
 * ---------------------------------------------------------------------------
 * Por que ABAS, e não um formulário só
 * ---------------------------------------------------------------------------
 * A ficha do produto cresceu de cinco campos para quinze (SKU, código de
 * barras, unidade, categoria, marca, localização, estoque mínimo e as duas
 * chaves de regra de estoque). Numa coluna só, isso vira uma escada que só
 * termina rolando — e quem está com o fornecedor na frente descarregando nota
 * olha a pilha e adia o cadastro. É o mesmo problema que a ficha do cliente
 * teve, e a resposta é a mesma.
 *
 * A versão anterior tentou resolver com uma sanfona ("Identificação e
 * organização", fechada por padrão). Resolvia pela metade e criava um
 * problema novo: campo dentro de bloco fechado é campo que ninguém sabe que
 * existe, e um erro de validação lá dentro pedia "revise os campos
 * destacados" sem nada destacado à vista.
 *
 * ---------------------------------------------------------------------------
 * As abas NÃO são um caminho obrigatório
 * ---------------------------------------------------------------------------
 * Não há "Continuar". O botão de cadastrar está disponível desde a primeira
 * aba, porque **só o nome é obrigatório** — preço, estoque e organização são o
 * que se sabe do item agora, não pedágio. Fatiar um formulário e depois
 * obrigar a atravessar as quatro telas seria trocar uma pilha por um corredor.
 */

/**
 * As duas perguntas do cadastro.
 *
 * ---------------------------------------------------------------------------
 * Eram quatro, e três delas não eram perguntas
 * ---------------------------------------------------------------------------
 * "Item", "Preço", "Estoque" e "Organização" pareciam quatro etapas e não
 * eram: "Preço" tinha DOIS campos e uma aba inteira para eles, e "Estoque"
 * tinha três. O custo disso não é estético — são três cliques para atravessar
 * um cadastro cujo conteúdo cabe em duas telas, e um campo esquecido numa aba
 * fechada é um campo que ninguém sabe que existe.
 *
 * Ficaram duas, pelo critério do que a pessoa tem na mão no momento:
 *
 *   • ITEM — o que ela sabe sem consultar nada: o que é, como se chama, a
 *     foto e por quanto compra e vende. É o cadastro mínimo, e é aqui que
 *     acaba a maioria deles.
 *   • ORGANIZAÇÃO — o que exige olhar a prateleira ou o sistema: quanto tem,
 *     em que unidade, SKU, código de barras, categoria, onde está guardado.
 *
 * O preço subiu para "Item" porque é a segunda coisa que se digita depois do
 * nome; o estoque desceu para "Organização" porque contar a prateleira é a
 * parte que se faz depois.
 */
const ETAPAS = [
  { id: "item", titulo: "Item", icone: Package },
  { id: "organizacao", titulo: "Organização", icone: Bookmark },
] as const;

type Props = {
  defaultValues?: Partial<ProductFormInput>;
  onSubmit: (data: ProductFormData) => void;
  onCancel: () => void;
  /** Quando fornecido, exibe o botão de excluir (modo edição). */
  onDelete?: () => void;
  submitText: string;
  /** Cadastro em série: ao salvar, limpa os campos em vez de fechar o modal. */
  resetarAoSalvar?: boolean;
  /**
   * Esconde a quantidade — para quando o saldo é editado em outro lugar.
   *
   * É o caso da ficha do produto: ali existe o painel de estoque, que muda o
   * saldo lançando um movimento no extrato. Deixar o campo aqui também daria
   * duas portas para o mesmo número, e a desta escreveria a coluna direto —
   * bastaria abrir "Editar" para corrigir o nome e o extrato pararia de bater
   * com o saldo, sem ninguém ter pedido nada disso.
   */
  semQuantidade?: boolean;
  /**
   * As categorias cadastradas pela empresa.
   *
   * Vem de fora, e não de uma busca aqui dentro, porque as duas telas que
   * abrem este formulário já têm a lista carregada — a de estoque para montar
   * o filtro, a ficha do produto porque a ficha traz tudo numa requisição só.
   * Buscar de novo aqui seria uma terceira ida ao servidor a cada vez que o
   * modal abre, para mostrar o que já estava na tela atrás dele.
   */
  categorias?: Categoria[];
};

const VAZIO: ProductFormInput = {
  nome: "",
  tipo: "PRODUTO",
  valorCompra: 0,
  valorVenda: 0,
  quantidade: 0,
  descricao: "",
  imagem: "",
  sku: "",
  codigoBarras: "",
  unidade: "",
  categoriaId: "",
  marca: "",
  localizacao: "",
  observacoes: "",
  estoqueMinimo: null,
  controlaEstoque: true,
  permiteVendaSemEstoque: false,
};

/** Abre e fecha por altura — o campo empurra o resto em vez de cobrir. */
const REVELA = {
  fechado: { opacity: 0, height: 0 },
  aberto: { opacity: 1, height: "auto" },
};

const temTexto = (valor: unknown) => String(valor ?? "").trim() !== "";

export function ProdutoForm({ defaultValues, onSubmit, onCancel, onDelete, submitText, resetarAoSalvar, semQuantidade, categorias = [] }: Props) {
  const alert = useAlert();
  const reduzir = useReducedMotionConfig();

  const [etapa, setEtapa] = useState(0);

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    trigger,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormInput, unknown, ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: { ...VAZIO, ...defaultValues },

    /*
     * Explícito, e não pelo padrão.
     *
     * Com a animação de troca, a aba que sai é DESMONTADA — só uma existe no
     * DOM por vez. `shouldUnregister: false` é o que faz o valor sobreviver a
     * isso: sem ele, sair da aba de Preço apagaria custo e venda, e o produto
     * seria salvo zerado sem ninguém ver.
     *
     * É o padrão do react-hook-form v7, mas fica escrito porque agora existe
     * código que DEPENDE dele — mudá-lo, ou migrar de versão, quebraria a
     * gravação de um jeito silencioso e longe da causa.
     */
    shouldUnregister: false,
  });

  const valores = watch();

  const tipo = valores.tipo;
  const controla = valores.controlaEstoque;
  const custo = Number(valores.valorCompra) || 0;
  const venda = Number(valores.valorVenda) || 0;

  const ehServico = tipo === "SERVICO";
  const ehInsumo = tipo === "INSUMO";
  const { lucro, margem } = calcularGanho(custo, venda);

  /*
   * As duas abas existem SEMPRE — o que desaparece para serviço são os campos
   * de estoque dentro de "Organização".
   *
   * Antes a aba inteira sumia, porque ela era só de estoque. Agora ela também
   * guarda SKU, categoria, marca e localização, que um serviço usa como
   * qualquer produto: esconder a aba levaria embora seis campos válidos para
   * evitar mostrar três que não se aplicam.
   *
   * Quem limpa o dado é o schema, na saída (ver `productSchema`) — esconder
   * aqui é decisão de tela, não de dado.
   */
  const etapas = ETAPAS;

  /*
   * O que cada aba já tem.
   *
   * Alimenta o tique verde da navegação — que é o que permite pular direto
   * para o que falta em vez de reler as quatro. Numa edição feita meses
   * depois, é a diferença entre "onde estava a localização?" e um clique.
   */
  const preenchida = useMemo(() => {
    const porId: Record<string, boolean> = {
      item: temTexto(valores.nome),
      /* Com a quantidade escondida, ela sai da conta: a aba ficaria marcada
         como preenchida por um campo que não está lá para ser preenchido. */
      organizacao:
        (!semQuantidade && Number(valores.quantidade) > 0) ||
        temTexto(valores.unidade) ||
        valores.estoqueMinimo != null ||
        [valores.sku, valores.codigoBarras, valores.categoriaId, valores.marca, valores.localizacao].some(temTexto),
    };

    return etapas.map((e) => porId[e.id] ?? false);
  }, [valores, etapas]);

  /**
   * Sair da primeira aba valida o nome, e só ele.
   *
   * É o único campo obrigatório: exigir qualquer outro para trocar de aba
   * seria inventar obrigatoriedade que o cadastro não tem. Descobrir o nome
   * vazio depois de preencher preço e estoque é que sairia caro.
   */
  const irPara = async (destino: number) => {
    if (destino === etapa) return;
    // Voltar nunca valida: quem clica em "Item" quer justamente corrigir o
    // que está lá.
    if (destino > 0 && !(await trigger("nome"))) return setEtapa(0);
    setEtapa(destino);
  };

  /** Em que aba mora o campo — usado quando a submissão falha. */
  const etapaDoCampo = (campo: string) => {
    const mapa: Record<string, (typeof ETAPAS)[number]["id"]> = {
      nome: "item", tipo: "item", descricao: "item", imagem: "item",
      valorCompra: "item", valorVenda: "item",
      quantidade: "organizacao", unidade: "organizacao", estoqueMinimo: "organizacao",
      controlaEstoque: "organizacao", permiteVendaSemEstoque: "organizacao",
      sku: "organizacao", codigoBarras: "organizacao", categoriaId: "organizacao",
      marca: "organizacao", localizacao: "organizacao", observacoes: "organizacao",
    };

    return etapas.findIndex((e) => e.id === mapa[campo]);
  };

  const handleValid = async (data: ProductFormData) => {
    const { confirmed } = await alert.confirm(
      `Salvar ${TIPO_ITEM[data.tipo].singular.toLowerCase()}?`,
      "Confirme os dados antes de salvar.",
    );
    if (!confirmed) return;

    onSubmit(data);

    if (!resetarAoSalvar) return;

    /* Tipo, unidade e categoria sobrevivem à limpeza: quem cadastra camisetas
       cadastra a próxima camiseta. Nome, preços e quantidade zeram — herdar o
       preço do item anterior é como um erro entra no estoque sem ninguém ver. */
    reset({ ...VAZIO, tipo: data.tipo, unidade: data.unidade, categoriaId: data.categoriaId });
    setEtapa(0);
    setFocus("nome");
  };

  /**
   * Erro numa aba fechada é erro invisível.
   *
   * Com o formulário fatiado, um campo inválido pode estar em outra tela — e o
   * aviso mandaria "revise os campos destacados" sem nada destacado à vista.
   * Então a submissão inválida leva junto para onde está o problema.
   */
  const handleInvalid = (erros: typeof errors) => {
    const primeiro = Object.keys(erros)[0];
    const destino = primeiro ? etapaDoCampo(primeiro) : -1;

    if (destino >= 0) setEtapa(destino);

    alert.error("Campos inválidos", "Revise os campos destacados e tente novamente.");
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    const { confirmed } = await alert.confirm("Excluir produto?", "Essa ação não pode ser desfeita.", {
      type: "warning",
      confirmText: "Excluir",
    });
    if (!confirmed) return;
    onDelete();
  };

  const atual = etapas[etapa]?.id;

  return (
    <Form onSubmit={handleSubmit(handleValid, handleInvalid)} className="!gap-4">
      {/* ---------- Navegação das abas ---------- */}
      {/*
       * A pílula do destaque é UM elemento que se move, não um fundo que
       * acende e apaga em cada botão. É o mesmo `layoutId` do painel de
       * pagamentos da nota: o framer interpola a posição entre um render e
       * outro, e o olho segue para onde foi — em vez de procurar o que mudou.
       */}
      <div
        className="grid gap-0.5 rounded-xl border border-fg/[0.07] bg-fg/[0.02] p-0.5"
        style={{ gridTemplateColumns: `repeat(${etapas.length}, minmax(0, 1fr))` }}
      >
        {etapas.map((e, i) => {
          const Icone = e.icone;
          const on = i === etapa;

          return (
            <button
              key={e.id}
              type="button"
              onClick={() => void irPara(i)}
              aria-current={on ? "step" : undefined}
              className="focus-ring relative flex min-h-[38px] cursor-pointer items-center justify-center gap-1.5 rounded-[10px] px-2 text-[12.5px] transition-colors"
            >
              {on && (
                <motion.span
                  layoutId="aba-produto-form"
                  /* Sem animação de layout para quem pediu menos movimento: o
                     destaque continua aparecendo, só não desliza. */
                  transition={reduzir ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 38 }}
                  className="absolute inset-0 rounded-[10px] bg-accent"
                />
              )}

              <span className={`relative flex items-center gap-1.5 ${on ? "text-white" : "text-mist"}`}>
                {preenchida[i] && !on ? <Check size={13} className="text-faint" /> : <Icone size={13} className={on ? "" : "text-faint"} />}

                {/* O rótulo aparece SEMPRE agora. Ele sumia no celular porque
                    quatro nomes lado a lado em 360px quebravam linha e dobravam
                    a altura da barra; com dois, os dois cabem — e uma aba
                    identificada só por ícone é uma aba que se clica para
                    descobrir o que é. */}
                <span className="min-w-0 truncate">{e.titulo}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/*
       * A área do conteúdo tem ALTURA FIXA.
       *
       * Sem isso o modal encolhe e cresce a cada troca de aba — "Item" tem
       * quatro campos, "Organização" tem onze —, e o que acontece na prática é
       * que o botão de salvar sobe e desce debaixo do cursor: a pessoa clica
       * onde ele estava e acerta outra coisa. Com altura fixa, a janela é uma
       * só do começo ao fim e os botões ficam parados.
       *
       * O que não couber rola aqui dentro, não na janela: rolar o modal
       * inteiro levaria as abas para fora da vista, que é justamente a
       * navegação de que a pessoa precisa para sair dali.
       *
       * `58dvh` no celular acompanha a altura da tela (com o teclado aberto,
       * `dvh` encolhe junto e o campo em foco continua visível); acima de
       * `sm` vira um valor fixo, porque aí a janela não depende mais do
       * aparelho.
       */}
      <div className="relative h-[58dvh] overflow-y-auto overflow-x-hidden pr-1 sm:h-[366px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            /* A `key` é o que faz o framer entender que é OUTRO conteúdo, e
               não o mesmo mudando. Sem ela não há saída nem entrada. */
            key={atual}
            initial={reduzir ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduzir ? { opacity: 0 } : { opacity: 0, y: -4 }}
            /* `mode="wait"` para a aba que sai não dividir o espaço com a que
               entra: no cruzamento, os dois conjuntos de campos se sobrepõem e
               viram embaralhado, não transição. */
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="flex flex-col gap-3"
          >
          {/* ---------- Item ---------- */}
          {atual === "item" && (
          <div className="flex flex-col gap-3">
            {/*
             * Foto à esquerda, identidade à direita.
             *
             * A foto ocupava uma faixa inteira do formulário, com rótulo em
             * cima e dois botões ao lado — três linhas para um campo opcional,
             * empurrando o preço para fora da vista. Em coluna, ela divide a
             * mesma altura de "Tipo" + "Nome" e some do caminho: quem não vai
             * pôr foto passa direto por ela.
             *
             * A foto é um QUADRADO, e o quadrado sai da largura: `aspect-square`
             * com a largura declarada dá a altura de graça, sem depender de
             * `items-stretch`. Esticar pela altura dos dois campos ao lado
             * parecia mais esperto, mas a altura deles muda quando um deles
             * mostra mensagem de erro — e a foto mudava de forma junto, no meio
             * da digitação.
             *
             * 176 px é a altura dos dois campos empilhados no desktop, então o
             * quadrado fecha rente com eles sem nada de altura cravada do lado
             * direito. `items-start` porque quem define a altura da fileira é o
             * que for mais alto, e nenhum dos dois precisa acompanhar o outro.
             */}
            {/*
             * No CELULAR a foto sobe e os campos ficam embaixo.
             *
             * Lado a lado em 402px sobravam ~200px para o campo de nome, e o
             * próprio exemplo dele não cabia: o placeholder aparecia como
             * "Camiseta básica pre…". Um campo que não mostra o que se espera
             * dele deixa de ser um exemplo e vira um enigma. Empilhado, o
             * nome ocupa a largura inteira; a partir de `sm` a fileira volta.
             */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="aspect-square w-[104px] shrink-0 sm:w-[176px]">
                {/*
                 * A foto é ESCOLHIDA, não colada.
                 *
                 * Aqui havia um campo de texto "URL (opcional)". O que aparecia
                 * nele em produção era link de CDN do WhatsApp — que EXPIRA: a
                 * foto some do catálogo sozinha, semanas depois, e ninguém liga
                 * uma coisa à outra. Agora o arquivo vira WebP no servidor e
                 * mora no nosso storage.
                 */}
                <Controller
                  control={control}
                  name="imagem"
                  render={({ field }) => (
                    <UploadImagem
                      tipo="produto"
                      formato="miniatura"
                      valor={field.value}
                      onChange={(url) => field.onChange(url ?? "")}
                    />
                  )}
                />
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-3">
                {/* Insumo é a terceira opção e não uma tela separada: o que se
                    preenche é o MESMO — nome, custo, unidade, quanto tem. O que
                    muda é onde ele aparece depois (fora do catálogo e fora da
                    busca do PDV), e isso é consequência do campo, não motivo
                    para um segundo formulário que divergiria do primeiro. */}
                <SelectBox label="Tipo" icon={<Tag className="h-3.5 w-3.5" />} error={errors.tipo?.message} {...register("tipo")}>
                  <option value="PRODUTO">{TIPO_ITEM.PRODUTO.singular}</option>
                  <option value="SERVICO">{TIPO_ITEM.SERVICO.singular}</option>
                  <option value="INSUMO">{TIPO_ITEM.INSUMO.singular}</option>
                </SelectBox>

                <TextField
                  label="Nome"
                  icon={<ShoppingBag className="h-3.5 w-3.5" />}
                  placeholder={ehServico ? "Instalação de ar-condicionado" : ehInsumo ? "Tecido malha preta (metro)" : "Camiseta básica preta"}
                  autoFocus
                  error={errors.nome?.message}
                  {...register("nome")}
                />
              </div>
            </div>

            {/* O preço logo abaixo do nome: é a segunda coisa que se digita, e
                estava atrás de um clique numa aba própria de dois campos. */}
            <FormGrid cols={2}>
              <Controller
                control={control}
                name="valorCompra"
                render={({ field }) => (
                  <CurrencyField label="Custo" hint="O que o item custa para você" value={Number(field.value) || 0} onValueChange={field.onChange} error={errors.valorCompra?.message} />
                )}
              />

              <Controller
                control={control}
                name="valorVenda"
                render={({ field }) => (
                  <CurrencyField label="Venda" hint="O que o cliente paga" value={Number(field.value) || 0} onValueChange={field.onChange} error={errors.valorVenda?.message} />
                )}
              />
            </FormGrid>

            {/* O ganho aparece sozinho quando há preço de venda — é a resposta que
                antes se buscava na calculadora do celular. */}
            <AnimatePresence initial={false}>
              {venda > 0 && (
                <motion.div
                  variants={reduzir ? undefined : REVELA}
                  initial="fechado"
                  animate="aberto"
                  exit="fechado"
                  transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div
                    className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 ${
                      lucro < 0 ? "bg-danger/[0.08]" : lucro === 0 ? "bg-fg/[0.03]" : "bg-success/[0.08]"
                    }`}
                  >
                    <span className="text-[11px] uppercase tracking-[0.08em] text-faint">{lucro < 0 ? "Prejuízo" : "Lucro"}</span>
                    <span className="flex items-baseline gap-2 tabular-nums">
                      <motion.span
                        key={lucro}
                        initial={reduzir ? false : { opacity: 0, y: -3 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.14 }}
                        className={`text-[15px] leading-none ${lucro < 0 ? "text-danger" : lucro === 0 ? "text-mist" : "text-success"}`}
                      >
                        {formatCurrency(lucro)}
                      </motion.span>
                      {margem !== null && <span className="text-[11.5px] text-mist">{margem.toFixed(0)}%</span>}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          )}

          {/* ---------- Organização ---------- */}
          {atual === "organizacao" && (
          <div className="flex flex-col gap-3">
            <FormGrid cols={2}>
              <TextField label="SKU" placeholder="CAM-PRT" icon={<Bookmark className="h-3.5 w-3.5" />} hint="Seu código interno" error={errors.sku?.message} {...register("sku")} />
              <TextField label="Código de barras" placeholder="7891234567890" icon={<Barcode className="h-3.5 w-3.5" />} hint="O que a leitora bipa" error={errors.codigoBarras?.message} {...register("codigoBarras")} />
            </FormGrid>

            <FormGrid cols={3}>
              {/*
               * Escolhida, não digitada.
               *
               * Aqui era um campo de texto, e o que ele produzia era
               * "Bebida", "Bebidas" e "bebidas" convivendo como três
               * categorias — o filtro da lista mostrava as três, cada uma com
               * um pedaço dos produtos. A lista de opções é o cadastro da
               * empresa, mantido pelo botão "Categorias" da tela de estoque.
               *
               * A primeira opção é a ausência, com nome próprio: um seletor
               * que abre em branco não diz se o produto está sem categoria ou
               * se a tela não carregou.
               */}
              <SelectBox
                label="Categoria"
                icon={<Layers className="h-3.5 w-3.5" />}
                hint={categorias.length === 0 ? "Crie categorias no botão “Categorias”, no estoque" : undefined}
                error={errors.categoriaId?.message}
                {...register("categoriaId")}
              >
                <option value="">{SEM_CATEGORIA}</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </SelectBox>

              <TextField label="Marca" placeholder="—" icon={<Tag className="h-3.5 w-3.5" />} error={errors.marca?.message} {...register("marca")} />
              <TextField label="Localização" placeholder="Prateleira A3" icon={<MapPin className="h-3.5 w-3.5" />} error={errors.localizacao?.message} {...register("localizacao")} />
            </FormGrid>

            {/*
             * Os campos de estoque, que tinham uma aba própria.
             *
             * Eram três campos e dois interruptores ocupando um quarto da
             * barra de abas. Aqui embaixo eles seguem a mesma ordem de
             * trabalho da tela: primeiro se identifica o item (SKU, código,
             * categoria), depois se conta o que existe dele.
             *
             * Somem para SERVIÇO — "quantas instalações eu tenho em estoque?"
             * não é uma pergunta. O que zera o dado é o schema, na saída (ver
             * `productSchema`); aqui é só a tela.
             */}
            {!ehServico && (
              <>
                <FormGrid cols={semQuantidade ? 2 : 3}>
                  {/* Ver a nota da prop `semQuantidade`. */}
                  {!semQuantidade && (
                    <TextField
                      label="Quantidade"
                      type="number"
                      min="0"
                      step="any"
                      icon={<Hash className="h-3.5 w-3.5" />}
                      hint="Quanto existe hoje"
                      error={errors.quantidade?.message}
                      {...register("quantidade", { valueAsNumber: true })}
                    />
                  )}

                  <TextField
                    label="Unidade"
                    placeholder="un, kg, m, cx…"
                    icon={<Ruler className="h-3.5 w-3.5" />}
                    hint="Como você conta este item"
                    error={errors.unidade?.message}
                    {...register("unidade")}
                  />

                  <TextField
                    label="Avisar abaixo de"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="5"
                    icon={<AlertTriangle className="h-3.5 w-3.5" />}
                    hint="Vazio usa o padrão"
                    error={errors.estoqueMinimo?.message}
                    {...register("estoqueMinimo")}
                  />
                </FormGrid>

                <FormSection title="Regras de venda">
                  <div className="flex flex-col gap-2">
                    <Controller
                      control={control}
                      name="controlaEstoque"
                      render={({ field }) => (
                        <SwitchField
                          label="Controlar estoque deste item"
                          hint="Desligue para itens sob encomenda, que não têm unidade para contar."
                          checked={field.value ?? true}
                          onChange={field.onChange}
                        />
                      )}
                    />

                    {/* Só aparece quando controlar estoque está ligado: sem contagem,
                        "vender sem estoque" não decide nada. */}
                    <AnimatePresence initial={false}>
                      {controla && (
                        <motion.div
                          variants={reduzir ? undefined : REVELA}
                          initial="fechado"
                          animate="aberto"
                          exit="fechado"
                          transition={{ duration: 0.16 }}
                          className="overflow-hidden"
                        >
                          <Controller
                            control={control}
                            name="permiteVendaSemEstoque"
                            render={({ field }) => (
                              <SwitchField
                                label="Permitir venda mesmo sem estoque"
                                hint="Por padrão a venda é bloqueada quando o saldo acaba. Ligue só para o item que você vende encomendado."
                                checked={field.value ?? false}
                                onChange={field.onChange}
                              />
                            )}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </FormSection>
              </>
            )}

            <TextArea label="Observações" rows={2} placeholder="Anotações internas — não aparecem na nota" error={errors.observacoes?.message} {...register("observacoes")} />
          </div>
          )}

          </motion.div>
        </AnimatePresence>
      </div>

      <FormActions onCancel={onCancel} onDelete={onDelete ? handleDelete : undefined} saving={isSubmitting} submitText={submitText} />
    </Form>
  );
}
