import sysgrafix from "@/shared/api/sysgrafix";
import type { CalcFreteDto, PrePostagemDto } from "@/features/correios/types/correios.types";

/**
 * Serviço de envio — a seção Correios.
 *
 * Todas as chamadas passam pelo backend, que detém o token do provedor: ele
 * autoriza comprar frete com o saldo da empresa e não pode chegar ao
 * navegador.
 *
 * O provedor hoje é o MELHOR ENVIO, e é por isso que os Correios aparecem ao
 * lado de Jadlog, Azul e Loggi no mesmo resultado — as APIs oficiais dos
 * Correios exigem contrato "a faturar", que a maioria das empresas não tem.
 * Os caminhos continuam `/correios/*` porque é assim que a seção se chama para
 * quem usa.
 */
const CorreiosService = {
  /* ─── Preços ─── */
  calcularFrete: (data: CalcFreteDto) => sysgrafix.post("/correios/calcular-frete", data),
  /** O catálogo: toda transportadora e todo serviço que a conta tem. */
  listarServicos: () => sysgrafix.get("/correios/servicos"),
  /** Pontos de postagem — o aéreo e a Loggi exigem um antes de comprar. */
  listarAgencias: (filtro: { transportadora?: number; uf?: string; cidade?: string }) =>
    sysgrafix.get("/correios/agencias", { params: filtro }),

  /* ─── Pré-Postagem ─── */
  solicitarPostagem: (data: PrePostagemDto) => sysgrafix.post("/correios/pre-postagem", data),
  listarPostagens: () => sysgrafix.get("/correios/postagens"),
  cancelarPostagem: (id: string) => sysgrafix.delete(`/correios/postagens/${id}`),
  emitirDAE: (postagemId: string) => sysgrafix.post(`/correios/postagens/${postagemId}/dae`, {}),
  reimprimirEtiqueta: (postagemId: string) => sysgrafix.get(`/correios/postagens/${postagemId}/etiqueta`),

  /* ─── Rastreio ─── */
  rastrear: (codigo: string) => sysgrafix.get(`/correios/rastro/${codigo}`),

  /* ─── Coleta ─── */
  solicitarColeta: (data: object) => sysgrafix.post("/correios/coleta", data),

  /* ─── Resumo ─── */
  obterResumo: () => sysgrafix.get("/correios/resumo"),

  /* ─── A conta do provedor ─── */
  obterConfiguracao: () => sysgrafix.get("/correios/configuracao"),
  /** Token vazio significa "não mexi": a tela nunca recebe o valor atual. */
  salvarConfiguracao: (dados: { token?: string; ambiente?: number }) => sysgrafix.put("/correios/configuracao", dados),
};

export default CorreiosService;
