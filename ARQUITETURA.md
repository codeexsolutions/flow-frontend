# Como este frontend é montado

Leia isto antes de criar tela nova. Ele existe por um motivo prático: são **99
arquivos e ~37.500 linhas** em `src/features`, e sem um mapa a pergunta "onde
eu mexo?" custa meia hora toda vez.

O documento tem três partes: o **vocabulário** (o que usar para cada coisa), o
**índice de telas** (o que cada uma é e onde mora) e as **convenções** (as
regras que já custaram bug quando alguém não sabia delas).

---

## 1. A regra de ouro

**Antes de desenhar qualquer coisa, procure em `src/shared/ui`.**

Quando a peça existe e você não usa, o custo não é hoje: é no dia em que
alguém mexe no espaçamento padrão e vinte telas mudam menos uma. Foi o que
aconteceu com o botão de download — virou quatro botões diferentes, dois deles
sem oferecer PDF, e a mesma ação dava resultados diferentes conforme a tela.

**O estado hoje é melhor do que parece de fora.** A casca (`PageScreen`) está
em todo destino de rota; as telas que não a têm são abas dentro de uma casca
(Configurações, Vendas, Financeiro, Correios), invólucros de uma linha
(`KanbanPage`) ou telas públicas fora do sistema (login, ponto, o link do
cliente). A dívida real está no item 6, medida com método — não com grep.

---

## 2. O vocabulário — `src/shared/ui`

### A casca da tela

| Peça | Para quê |
|---|---|
| `PageShell` → `PageScreen` | **A casca de todo destino de rota**: fundo, brilho, cabeçalho, abas e espaçamento. É ela que faz uma tela parecer parte do sistema. |
| `PageShell` → `PageBody` | O corpo rolável, quando você monta a casca à mão (raro). |
| `HeaderPage` | O cabeçalho isolado — usado por dentro do `PageScreen`. |

> **Conteúdo de aba não leva casca.** Quem tem `PageScreen` é a tela pai; o que
> entra num `<Outlet>` (as abas de Configurações, por exemplo) entra pelado.

### Listas e tabelas — `DataTable.tsx`

| Peça | Para quê |
|---|---|
| `TabelaCard` | O cartão que envolve uma listagem, com título e ações. |
| `ListaCabecalho` + `ListaLinha` | **A lista padrão.** Recebe `cols` (grid CSS) e `rotulos`; sabe virar cartão no celular sozinha. |
| `TabelaHead` + `TabelaRow` | A variante orientada a colunas (`Coluna<T>[]`), quando as células são simples. |
| `ListaAcao` | O botão de ícone da linha (30×30, com `Dica`). |
| `ListaFantasmas` | Linhas vazias completando a página — impede o rodapé de pular entre páginas. |
| `ControlesPagina` / `TabelaPaginacao` | Paginação. |
| `TabelaVazia` | O estado vazio, com ícone, título e ação. |

**Não use `<table>` para LISTA DE APLICATIVO.** A lista do sistema já resolve
responsivo, paginação, estado vazio e o cartão do celular.

`<table>` continua certo em **documento**: a nota (`Invoice`), o orçamento
(`OrcamentoNota`), o resumo (`NotaResumo`) e a folha de relatório (`FolhaA4`)
são papel — vão para PNG e para impressora, precisam de colunas que se alinham
sozinhas e não têm nada a ganhar virando cartão no celular. A planilha
configurável também é grade de verdade.

### Formulário e configuração

| Peça | Para quê |
|---|---|
| `ConfigUI` → `SettingsCard` | O cartão de ajuste: ícone, título, descrição e rodapé com o Salvar. |
| `ConfigUI` → `SaveRow` | A linha de Salvar, com o "Alterações salvas". |
| `ConfigUI` → `useSaver` | O estado de salvando/salvo. |
| `form/FormKit` | `Form`, `FormSection`, `FormGrid`, `FormActions`, `TextField`, `CurrencyField`, `TextArea`, `SelectBox`, `SwitchField`, `AcaoIcone`. |
| `inputs` | Campos avulsos. |
| `Select` | O seletor do tema (não use `<select>` cru em tela nova). |
| `UploadImagem` | Envio de imagem com prévia. |

### Avisos e sobreposição

| Peça | Para quê |
|---|---|
| `Alert` → `useAlert()` | `success` `error` `warning` `info` `confirm` `toast` `loading` `during`. |
| `Modal` | A sobreposição padrão. `size`/`maxWidth`, `accent` para ação destrutiva. |
| `Sheet` | Gaveta lateral. |
| `Dica` | Tooltip do tema — **use no lugar de `title`** numa fileira de ícones. |
| `LoadingScreen`, `skeleton` | Espera. |

### Painel e números — `Painel.tsx`

O vocabulário do dashboard e dos relatórios: `Painel` e `PainelHead` (o
cartão), `Kpi` e `KpiFaixa` (o número em destaque), `Legenda` e `ChartTip`
(gráficos), `PainelVazio`, `SeloIcone`.

`Rosca` é o gráfico de rosca, com `PALETA` própria.

### Selos e estados

`StatusBadge` exporta `Selo` (o genérico, com `tom`), mais `PedidoStatusBadge`
e `ClienteStatusBadge` — os dois já sabem traduzir o status do domínio, então
não escreva o `switch` de novo.

### Diversos

`AbasTabela` (abas dentro de um cartão de lista), `SeletorDia`,
`SeletorPeriodo`, `BuscaSugestoes`, `Suspenso`, `PagamentoForm`,
`AssinaturaPad`.

### Documentos (nota, recibo)

`MenuDownloadNota` é **o único botão de download** de nota, recibo, orçamento e
holerite. Tem duas variantes: `completo` (rodapé do documento) e `linha`
(fileira de ações de uma lista). `Recibo`, `ReciboSalario`, `FundoNota`,
`BotaoRecibo` e `DownloadButton` (a rasterização) completam o conjunto.

---

## 3. Índice de telas

Rotas em `src/app/routes/AppRoutes.tsx`. Casca em `src/app/layouts/MainLayout.tsx`.

> **Atenção:** vários imports são renomeados na rota (`Workflow` = `PDVPage`,
> `TableStock` = `StockPage`, `CustomerDetailPage` = `ClienteDetailPage`,
> `ProdutoDetalhe` = `ProdutoDetailPage`, `AuthPage` = `LoginPage`,
> `ConfiguracoesPage` = `ConfigPage`, `AparenciaTab` = `AparenciaPage`).
> Procurar pelo nome da rota não acha o arquivo. Isso é dívida — em tela nova,
> importe com o nome do arquivo.

### Dentro do sistema (com login)

| Rota | Arquivo | O que é |
|---|---|---|
| `/` | `dashboard/DashboardPage` | Painel de entrada: números do dia e atalhos. |
| `/pdv` | `vendas/PDVPage` | Balcão: monta a venda, lista as do dia e os orçamentos. |
| `/pdv/orcamentos` | `orcamentos/OrcamentosPage` | Propostas enviadas, ainda sem compromisso. |
| `/vendas` | `vendas/VendasPage` | Casca com duas abas: panorama e lista. |
| `/clientes` | `clientes/ClientesPage` | Base de clientes, com filtro de aniversariantes. |
| `/clientes/:id` | `clientes/ClienteDetailPage` | Ficha: dados, compras, orçamentos. |
| `/estoque` | `estoque/StockPage` | Produtos e serviços. |
| `/estoque/:id` | `estoque/ProdutoDetailPage` | Ficha do produto: variações, insumos, movimentações. |
| `/financeiro/:aba?` | `financeiro/FinanceiroPage` | Casca de três abas: caixa, a pagar, a receber. |
| `/producao` | `producao/ProducoesPage` | Produções em curso, um cliente por linha. |
| `/producao/kanban` | `producao/KanbanPage` → `planilhas/PlanilhasPage` | **A planilha configurável** — tabela e backlog na mesma tela. |
| `/relatorios` | `relatorios/RelatoriosPage` | Relatórios, com layout de impressão. |
| `/funcionarios` | `funcionarios/FuncionariosPage` | Equipe e acesso ao sistema. |
| `/funcionarios/:id` | `funcionarios/FuncionarioDetailPage` | Ficha do funcionário: ponto, salário. |
| `/whatsapp` | `crm/CrmPage` | CRM: caixa de entrada e funil. |
| `/chatbot` | `crm/ChatbotPage` | O robô: expediente, mensagem fora de hora e IA. |
| `/postagem`, `/rastrear` | `correios/*` | Correios. |
| `/ajuda` | `ajuda/AjudaPage` | Ajuda e suporte. |
| `/checkout`, `/faturas` | `checkout/CheckoutPage` | Assinatura e faturas. |
| `/configuracoes` | `config/ConfigPage` | Casca das abas de configuração. |
| `/perfil` | `config/ProfilePage` | Perfil, senha, "como quer ser chamado". |
| `/empresa` | `config/EmpresaPage` | Identificação, contato, endereço, marca, Pix, domínio. |
| `/aparencia` | `config/AparenciaPage` | Tema. |

### Fora do sistema (sem login)

| Rota | Arquivo | O que é |
|---|---|---|
| `/login`, `/cadastro` | `auth/LoginPage`, `SignUpPage` | Entrada e cadastro da empresa. |
| `/bem-vindo` | `auth/BoasVindasPage` | Entre o cadastro e a primeira conversa. |
| `/page` | `landing/LandingPage` | Página de venda do produto. |
| `/planos` | `assinatura/PlanosPage` | Planos. |
| `/:token`, `/p/:token` | `acompanhamento/AcompanharProducaoPage` | **O que o cliente da loja abre** — sem login, sem menu. |
| `/ponto`, `/ponto/:token` | `ponto/AbrirPontoPage`, `BaterPontoPage` | App de ponto do funcionário. |

### Fora da navegação

`producao/ProducaoPage` é o **controle de produção antigo**, substituído pela
planilha. Continua no código e não tem rota.

---

## 4. Onde as coisas moram

### Uma feature

```
features/<assunto>/
  pages/       telas com rota
  components/  pedaços daquela feature
  services/    as chamadas HTTP daquele assunto
  store/       estado global (zustand), quando precisa
  schema/      validação (zod), quando tem formulário
```

**Componente usado por mais de uma feature sobe para `shared/ui`.** Foi assim
que `MenuDownloadNota` deixou de ser quatro botões diferentes.

### Estado global (`zustand`)

`auth`, `cliente`, `enterprise`, `produto`, `financeiro`, `contas`, `equipe`,
`venda`, mais `plano`, `catalogo`, `theme` e `transicao` em `shared/`.

Regra: store guarda o que **várias telas** leem. Estado de uma tela fica na
tela.

### `shared/`

| Pasta | O que tem |
|---|---|
| `api` | `sysgrafix` (axios + interceptors), sessão, URL da API, **`carregamento.ts`** |
| `ui` | o vocabulário visual |
| `domain` | os tipos do negócio (`cliente`, `pedido`, `produto`…) |
| `utils` | moeda, data, erros (`errorHandler`), parcelas |
| `validation` | máscaras |
| `realtime` | `useSincronizacao` — socket que recarrega a tela quando outra pessoa mexe |
| `hooks` | `useIsMobile`, `useSwipeAbas` |
| `plano`, `theme`, `pwa`, `marca`, `session`, `suporte` | o resto |

---

## 5. Convenções que já custaram bug

### O aviso "Salvando…" é automático — e às vezes atrapalha

`sysgrafix` acende um **modal** em toda gravação (POST/PUT/PATCH/DELETE). É
certo na maior parte do sistema e **errado em tela de digitação contínua**: o
modal não tem botão, rouba o foco e engole a tecla seguinte.

Passe `{ carregamento: false }` na chamada quando a gravação acontece
**enquanto a pessoa trabalha** — célula de planilha, arrastar cartão, mandar
mensagem no CRM. Passe `{ carregamento: "Cadastrando produto…" }` quando quiser
a frase certa em vez do "Salvando…" genérico.

### Erro em tela de digitação é toast, nunca modal

Mesmo motivo. Ver o topo de `PlanilhasPage`.

### Recarga silenciosa

Ao recarregar dados que já estão na tela (tempo real, depois de salvar), **não
acenda o esqueleto**: quem está digitando vê a tela piscar e conclui que
perdeu o que escreveu. O padrão é um parâmetro `silencioso`.

### Gravação otimista

Célula, arrastar cartão, mover no funil: aplique na tela **antes** da resposta e
reverta se falhar. Esperar o servidor faz o cartão saltar de volta e ir de novo.

### Tempo real

`useSincronizacao(["colecao"], recarregar)` — coleções em
`shared/realtime/useSincronizacao.ts`. A aba de quem provocou a mudança ignora
o próprio eco.

### Permissão

`ehGestor(user)` (de `features/vendas/components/TabsVendas`) é `root` ou
`ADMIN`. **A trava de verdade é do servidor** — a tela esconde, o servidor
recusa. Esconder sem travar não é permissão, é decoração.

### Tema

Cores por token (`text-ink`, `bg-surface`, `border-fg/[0.07]`, `text-accent`).
**Cor fixa em hexadecimal só com motivo escrito** — hoje há dois: o QR
(precisa de contraste real) e a conversa do CRM (reproduz o WhatsApp).

---

## 6. Dívida conhecida

Anotada porque some da memória e volta como surpresa. **Medida, não estimada** —
e o que não deu para medir com confiança está dito como tal.

1. **Quatro arquivos passam de mil linhas**: `PlanilhasPage` (2.007),
   `Invoice` (1.755), `PDVPage` (1.253), `EstoquePainel` (1.021). São os mais
   caros de mexer e os que mais quebram. Também são o coração da operação —
   quebrá-los rende a longo prazo e é a mudança de maior risco desta lista.

2. **Imports renomeados na rota** — ver a nota do índice de telas. Custa tempo
   toda vez que alguém procura pelo nome da rota.

3. **Funcionalidade escrita e nunca ligada.** Aconteceu três vezes:
   `MenuFormatoDownload`, o ícone do caixa que não abria nada, e
   `ContaService.estornar`. Os dois últimos formavam um beco: um recebimento
   lançado errado não tinha como ser removido por tela nenhuma.
   **Ao criar um método de service, ligue a tela no mesmo commit.**

4. **`producao/ProducaoPage`** é o controle de produção antigo, sem rota.

5. **Componentes soltos que talvez devessem estar em `shared/ui`** — não
   medido. Um levantamento honesto exige abrir os arquivos: um `rounded-2xl
   border` pode ser um cartão reinventado ou um ícone num quadrado, e o grep
   não distingue. Quem for fazer isso, faça olhando.

## 7. Receita: criando uma tela nova

1. `features/<assunto>/pages/MinhaPage.tsx`
2. Envolva em **`PageScreen`** com `title`, `subtitle` e `icon`
3. Listagem? **`TabelaCard` + `ListaCabecalho`/`ListaLinha`**
4. Ajustes? **`SettingsCard` + `SaveRow`**
5. Serviço em `features/<assunto>/services/` — e **ligue na tela no mesmo commit**
6. Avisos por `useAlert()`; toast se a tela for de digitação
7. Rota em `AppRoutes.tsx`, item em `shared/ui/Sidebar.tsx`
8. Permissão: esconda na tela **e** trave no servidor
9. Escreva um comentário no topo dizendo **o que a tela é** — quem abrir daqui
   a seis meses lê isso primeiro
