import * as XLSX from "xlsx";

export interface ConferenciaNotaExport {
  nNF: string;
  cnpjEmitente: string;
  vNF: number;
  icmsSefaz: number;
  icmsCalculado: number;
  diferenca: number;
  icmsXmlEditado?: number | null;
  motivoEdicao?: string | null;
}

export interface ConferenciaExportMeta {
  razaoSocial?: string;
  inscricaoEstadual?: string;
  periodoFiscal?: string;
  totalIcmsSefaz: number;
  totalIcmsCalculado: number;
  totalDiferenca: number;
  tituloArquivo?: string;
}

const fmtCnpj = (c: string) => {
  const d = c.replace(/\D/g, "").padStart(14, "0");
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};

/** Planilha da conferência (extrato SEFAZ × XMLs): cabeçalho, totais e uma linha por nota. */
export async function exportarConferenciaXLSX(notas: ConferenciaNotaExport[], meta: ConferenciaExportMeta) {
  const temEdicoes = notas.some((n) => n.icmsXmlEditado != null);
  const cabecalho = ["nNF", "CNPJ emitente", "Valor NF", "ICMS SEFAZ", "ICMS XML", "Diferença", ...(temEdicoes ? ["ICMS XML editado", "Motivo"] : [])];
  const linhas: (string | number | null)[][] = [
    ["Auditoria ICMS Fronteira — Diretriz"],
    [],
    ["Razão social", meta.razaoSocial ?? "—"],
    ["Inscrição estadual", meta.inscricaoEstadual ?? "—"],
    ["Período fiscal", meta.periodoFiscal ?? "—"],
    ["Gerado em", new Date().toLocaleString("pt-BR")],
    [],
    ["ICMS SEFAZ", meta.totalIcmsSefaz],
    ["ICMS calculado (XMLs)", meta.totalIcmsCalculado],
    ["Diferença", meta.totalDiferenca],
    [],
    cabecalho,
    ...notas.map((n) => [
      n.nNF, fmtCnpj(n.cnpjEmitente), n.vNF, n.icmsSefaz, n.icmsCalculado, n.diferenca,
      ...(temEdicoes ? [n.icmsXmlEditado ?? null, n.motivoEdicao ?? ""] : []),
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  ws["!cols"] = (temEdicoes ? [12, 24, 16, 16, 16, 16, 18, 42] : [12, 24, 16, 16, 16, 16]).map((wch) => ({ wch }));
  // Formato moeda nas colunas de valor e nos totais
  const moeda = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
  const inicioTabela = 12; // linha (0-based) do cabeçalho
  for (let r = 7; r <= 9; r++) { const c = ws[XLSX.utils.encode_cell({ r, c: 1 })]; if (c) c.z = moeda; }
  const colsMoeda = temEdicoes ? [2, 3, 4, 5, 6] : [2, 3, 4, 5];
  for (let r = inicioTabela; r < inicioTabela + notas.length; r++) {
    for (const c of colsMoeda) { const cell = ws[XLSX.utils.encode_cell({ r, c })]; if (cell && typeof cell.v === "number") cell.z = moeda; }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Conferência");
  XLSX.writeFile(wb, `${meta.tituloArquivo ?? "conferencia"}.xlsx`);
}
