import type { ReactNode } from "react";

/**
 * Folha A4 (210 × 297 mm).
 *
 * A prévia na tela usa as mesmas medidas em mm que a impressão, então o que se
 * vê é o que sai no papel. As regras de `@media print` em `print.css` escondem
 * o resto da aplicação e removem o vidro/sombra — papel não tem blur.
 */
export const FolhaA4 = ({ children }: { children: ReactNode }) => <div className="folha-a4 mx-auto bg-white text-[#111] shadow-e3 print:shadow-none">{children}</div>;

export const FolhaHeader = ({
  empresa,
  documento,
  titulo,
  periodo,
  filtro,
  logo,
}: {
  empresa: string;
  documento?: string;
  titulo: string;
  periodo: string;
  /**
   * O recorte além do tempo — "Vendedor: João".
   *
   * Vai IMPRESSO, e não só na tela de quem monta. Uma folha filtrada por
   * vendedor tem números menores que os da empresa; sem dizer no papel de quem
   * ela fala, quem recebe a folha lê o total da loja e conclui que a loja caiu
   * pela metade.
   */
  filtro?: string;
  logo?: string;
}) => (
  <header className="flex items-start justify-between gap-6 border-b-2 border-[#111] pb-3">
    <div className="flex items-center gap-3">
      {logo && <img src={logo} alt="" className="h-12 w-12 rounded object-cover" />}
      <div>
        <p className="text-[13pt] leading-tight">{empresa}</p>
        {documento && <p className="text-[8pt] text-[#555]">{documento}</p>}
      </div>
    </div>
    <div className="text-right">
      <p className="text-[12pt] leading-tight">{titulo}</p>
      <p className="text-[8pt] text-[#555]">{periodo}</p>
      {filtro && <p className="text-[8pt] text-[#555]">{filtro}</p>}
    </div>
  </header>
);

/**
 * A fileira de números do topo.
 *
 * A grade acompanha a QUANTIDADE de itens em vez de ser fixa em quatro: com
 * cinco, o quinto caía sozinho numa segunda fileira e a folha ficava com um
 * quadro solto ocupando a largura toda.
 */
export const FolhaKpis = ({ itens }: { itens: { label: string; valor: string }[] }) => (
  <section className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(itens.length, 1), 5)}, minmax(0, 1fr))` }}>
    {itens.map((k) => (
      <div key={k.label} className="rounded border border-[#ddd] px-2.5 py-2">
        <p className="text-[7pt] uppercase tracking-wide text-[#666]">{k.label}</p>
        <p className="mt-0.5 text-[11pt] tabular-nums">{k.valor}</p>
      </div>
    ))}
  </section>
);

export type Coluna<T> = {
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  width?: string;
};

export function FolhaTabela<T>({ titulo, colunas, linhas, vazio = "Nenhum registro no período." }: { titulo?: string; colunas: Coluna<T>[]; linhas: T[]; vazio?: string }) {
  return (
    <section className="mt-4">
      {titulo && <h2 className="mb-1.5 text-[10pt] uppercase tracking-wide">{titulo}</h2>}
      <table className="w-full border-collapse text-[8.5pt]">
        <thead>
          <tr className="border-y border-[#111] bg-[#f2f2f2]">
            {colunas.map((c) => (
              <th key={c.header} style={{ width: c.width, textAlign: c.align ?? "left" }} className="px-2 py-1.5 uppercase tracking-wide">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.length === 0 ? (
            <tr>
              <td colSpan={colunas.length} className="px-2 py-6 text-center text-[#777]">
                {vazio}
              </td>
            </tr>
          ) : (
            linhas.map((row, i) => (
              <tr key={i} className="break-inside-avoid border-b border-[#e5e5e5]">
                {colunas.map((c) => (
                  <td key={c.header} style={{ textAlign: c.align ?? "left" }} className="px-2 py-1.5 tabular-nums">
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

export const FolhaTotais = ({ itens }: { itens: { label: string; valor: string; destaque?: boolean }[] }) => (
  <section className="mt-3 flex justify-end">
    <table className="text-[9pt]">
      <tbody>
        {itens.map((t) => (
          <tr key={t.label} className={t.destaque ? "border-t-2 border-[#111]" : ""}>
            <td className="py-1 pr-6 text-right text-[#555]">{t.label}</td>
            <td className={`py-1 text-right tabular-nums ${t.destaque ? "text-[11pt]" : ""}`}>{t.valor}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
);

export const FolhaFooter = ({ emitidoEm }: { emitidoEm: string }) => (
  <footer className="mt-6 border-t border-[#ccc] pt-2 text-[7.5pt] text-[#666]">
    <div className="flex justify-between">
      <span>Emitido em {emitidoEm}</span>
      <span>CodeEx Flow</span>
    </div>
  </footer>
);
