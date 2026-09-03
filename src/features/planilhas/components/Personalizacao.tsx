import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ImageIcon, Palette, Sparkles } from "lucide-react";

import UploadImagem from "@/shared/ui/UploadImagem";

import type { MarcaEmpresa, TemaMarca } from "@/features/planilhas/services/planilha.service";
import { paleta, rgba } from "@/features/acompanhamento/marca";

type Props = {
  marca: MarcaEmpresa;
  /** Mexe só no estado local — usado durante o arraste do seletor de cor. */
  onMudar: (atualizar: (m: MarcaEmpresa | null) => MarcaEmpresa | null) => void;
  onSalvar: (mudanca: Partial<Pick<MarcaEmpresa, "cor" | "tema" | "capa" | "mascote">>) => void;
};

const TEMAS: { id: TemaMarca; nome: string }[] = [
  { id: "claro", nome: "Claro" },
  { id: "escuro", nome: "Escuro" },
  { id: "degrade", nome: "Degradê" },
];

/**
 * Como a página do cliente se veste, com prévia ao vivo.
 *
 * A prévia não é enfeite: cor de marca é a decisão em que a intuição erra mais.
 * Um azul-marinho que fica ótimo no cartão de visita some no fundo escuro, e um
 * amarelo que parece alegre deixa o cabeçalho ilegível. Sem ver o resultado, o
 * dono só descobre isso abrindo o próprio link — depois de já ter mandado para
 * o cliente.
 *
 * Ela usa `paleta()`, a MESMA função da página real. Uma prévia que calculasse
 * cor por conta própria seria pior que nenhuma: daria confiança em algo que não
 * corresponde ao que o cliente vê.
 */
const Personalizacao = ({ marca, onMudar, onSalvar }: Props) => {
  const [aberto, setAberto] = useState(false);

  const p = paleta(marca.cor, marca.tema);

  return (
    <div className="rounded-xl border border-fg/[0.08]">
      <button
        onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <Palette size={14} className="text-mist" />
        <span className="text-[12px] text-mist">Aparência da página do cliente</span>

        {/* Amostra fechada: dá para conferir a escolha sem abrir. */}
        <span
          className="ml-auto h-5 w-9 shrink-0 rounded-md ring-1 ring-fg/[0.12]"
          style={{ background: p.capa }}
        />

        <motion.span animate={{ rotate: aberto ? 180 : 0 }} transition={{ duration: 0.18 }} className="text-mist">
          <ChevronDown size={14} />
        </motion.span>
      </button>

      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-4 border-t border-fg/[0.06] p-3">
              {/* Prévia */}
              <div className="relative overflow-hidden rounded-xl ring-1 ring-fg/[0.1]" style={{ backgroundColor: p.fundo }}>
                {/* O wallpaper da empresa entra na prévia porque entra na
                    página: sem ele aqui, a prévia mostraria um fundo chapado e
                    o dono só descobriria a imagem abrindo o próprio link — que
                    é exatamente o passo que a prévia existe para poupar. */}
                {marca.wallpaper && (
                  <>
                    <span
                      className="absolute inset-0 bg-cover bg-center"
                      style={{ backgroundImage: `url("${marca.wallpaper}")`, opacity: p.escuro ? 0.18 : 0.14 }}
                    />
                    <span
                      className="absolute inset-0"
                      style={{ background: `linear-gradient(to bottom, ${rgba(p.fundo, 0.2)}, ${p.fundo})` }}
                    />
                  </>
                )}
                <div
                  className="relative z-10 flex items-center gap-2 px-3 py-2.5"
                  style={{ background: p.capa, color: p.sobreCapa }}
                >
                  {marca.capa && (
                    <span
                      className="absolute inset-0 bg-cover bg-center opacity-30"
                      style={{ backgroundImage: `url("${marca.capa}")` }}
                    />
                  )}

                  <span className="relative grid h-6 w-6 shrink-0 place-items-center rounded bg-white/90 text-[9px] font-bold text-black">
                    {marca.logo ? <img src={marca.logo} alt="" className="h-full w-full rounded object-contain p-0.5" /> : "L"}
                  </span>
                  <span className="relative truncate text-[11px] font-semibold">{marca.nome || "Sua empresa"}</span>
                </div>

                <div className="relative z-10 p-3">
                  {/* O mascote também na prévia: é a decisão em que ver o
                      resultado importa mais — PNG com fundo, cortado errado ou
                      grande demais só apareceria ao abrir o próprio link. */}
                  {marca.mascote && (
                    <img
                      src={marca.mascote}
                      alt=""
                      className="pointer-events-none absolute bottom-0 right-1 z-20 h-16 w-auto object-contain"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  )}

                  <div className="rounded-lg p-2.5" style={{ backgroundColor: p.cartao, border: `1px solid ${p.linha}` }}>
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <span className="text-[9px]" style={{ color: p.apagado }}>
                        Andamento
                      </span>
                      <span className="text-[10px] font-bold" style={{ color: p.destaque }}>
                        60%
                      </span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full" style={{ backgroundColor: rgba(p.destaque, 0.15) }}>
                      <div className="h-full w-3/5 rounded-full" style={{ backgroundColor: p.destaque }} />
                    </div>

                    <div className="mt-2 flex gap-1">
                      {["#22c55e", "#f0a020", "#94a3b8"].map((c) => (
                        <span
                          key={c}
                          className="rounded px-1.5 py-0.5 text-[8px] font-semibold"
                          style={{ backgroundColor: rgba(c, 0.15), color: c }}
                        >
                          ETAPA
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Cor */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11.5px] text-mist">Cor</span>

                <label className="relative h-7 w-10 cursor-pointer overflow-hidden rounded-lg ring-1 ring-fg/[0.12]">
                  <span className="absolute inset-0" style={{ backgroundColor: marca.cor ?? "#6366f1" }} />
                  <input
                    type="color"
                    value={marca.cor ?? "#6366f1"}
                    onChange={(e) => onMudar((m) => (m ? { ...m, cor: e.target.value } : m))}
                    onBlur={(e) => onSalvar({ cor: e.target.value })}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                </label>

                {marca.cor && (
                  <button onClick={() => onSalvar({ cor: null })} className="text-[11px] text-faint transition-colors hover:text-mist">
                    limpar
                  </button>
                )}
              </div>

              {/* Fundo */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11.5px] text-mist">Fundo</span>

                {TEMAS.map((t) => {
                  const ativo = marca.tema === t.id;
                  const amostra = paleta(marca.cor, t.id);

                  return (
                    <button
                      key={t.id}
                      onClick={() => onSalvar({ tema: t.id })}
                      className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] transition-colors ${
                        ativo ? "bg-accent/10 text-accent ring-1 ring-accent/30" : "text-mist hover:text-ink"
                      }`}
                    >
                      <span className="h-3.5 w-3.5 rounded-full ring-1 ring-fg/[0.12]" style={{ background: amostra.capa }} />
                      {t.nome}
                    </button>
                  );
                })}
              </div>

              {/*
                Capa e mascote: ESCOLHER O ARQUIVO, não colar link.

                Os dois eram campos de URL, herdados da época em que não havia
                upload — e o que se colava ali era link de CDN do WhatsApp e do
                imgur, que EXPIRA. A imagem some da página do cliente sozinha,
                semanas depois, e quem descobre é o cliente. Agora o arquivo
                vira WebP no nosso storage e fica.
              */}
              <div className="flex flex-wrap gap-4">
                <div className="min-w-[150px] flex-1">
                  <span className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-mist">
                    <ImageIcon size={12} />
                    Capa
                  </span>

                  <UploadImagem tipo="wallpaper" formato="largo" rotulo="Capa" valor={marca.capa} onChange={(url) => onSalvar({ capa: url })} />
                </div>

                <div className="min-w-[150px] flex-1">
                  <span className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-mist">
                    <Sparkles size={12} />
                    Mascote
                  </span>

                  <UploadImagem tipo="mascote" formato="quadrado" rotulo="Mascote" valor={marca.mascote} onChange={(url) => onSalvar({ mascote: url })} />
                </div>
              </div>

              {/* Dito aqui porque é a dúvida que o campo cria: PNG de fundo
                  branco vira um retângulo colado no canto da página, e o dono só
                  descobriria isso abrindo o próprio link. */}
              <p className="-mt-2 text-[11px] text-faint">
                O mascote é um boneco <strong className="font-medium text-mist">recortado, em PNG de fundo transparente</strong> — a
                transparência sobrevive à conversão. Ele entra deslizando pela direita e fica no canto de baixo — no celular,
                menor e encostado na quina. Passa sempre por TRÁS dos cartões, então nunca cobre o andamento nem o prazo.
              </p>

              {!marca.logo && (
                <p className="text-[11px] text-faint">
                  Sem logo — defina em Configurações › Empresa para ele aparecer no topo da página.
                </p>
              )}

              {/* Dito aqui, e não só lá: o wallpaper aparece NESTA página, então
                  é aqui que a pessoa pergunta de onde ele vem. */}
              <p className="text-[11px] text-faint">
                {marca.wallpaper
                  ? "O fundo da página é o wallpaper da sua empresa — o mesmo da nota. Troque-o em Configurações › Empresa."
                  : "Sem wallpaper — o fundo da nota, em Configurações › Empresa, também veste esta página."}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Personalizacao;
