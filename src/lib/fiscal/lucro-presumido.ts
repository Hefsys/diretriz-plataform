export const CAMPOS_ENTRADA = [
  { key: "rec_mercadorias", label: "Receita de Mercadorias" },
  { key: "rec_monofasico", label: "Receita de Mercadorias Monofásico" },
  { key: "rec_servicos", label: "Receita de Serviços" },
  { key: "rec_exterior", label: "Receita Exterior" },
  { key: "rec_aplicacoes", label: "Receita de Aplicações (Outras)" },
  { key: "ret_ir", label: "Retenção IR" },
  { key: "ret_csll", label: "Retenção CSLL" },
  { key: "perse_ir", label: "PERSE IR (Lei 14.148/2021)" },
  { key: "perse_csll", label: "PERSE CSLL (Lei 14.148/2021)" },
  { key: "pis_deduzir", label: "PIS a Deduzir" },
  { key: "cofins_deduzir", label: "COFINS a Deduzir" },
  { key: "iss_deduzir", label: "ISS a Deduzir" },
] as const;

export type CampoEntrada = (typeof CAMPOS_ENTRADA)[number]["key"];
export type MesEntrada = Record<CampoEntrada, number>;

export const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
export const LIMITE_TRIMESTRE = 1_250_000;
export const LIMITE_ADICIONAL = 60_000;

export function mesVazio(): MesEntrada {
  return Object.fromEntries(CAMPOS_ENTRADA.map((c) => [c.key, 0])) as MesEntrada;
}

export interface ResultadoMes {
  totalReceitas: number;
  basePis: number;
  pis: number;
  cofins: number;
  baseIss: number;
  iss: number;
}

export interface ResultadoTrimestre {
  receitaMercadorias: number;
  receitaServicos: number;
  receitaTotal: number;
  ateLimite: number;
  excedente: number;
  excedenteComercio: number;
  excedenteServico: number;
  bcIr32: number;
  bcIr352: number;
  bcIr8: number;
  bcIr88: number;
  outrasReceitas: number;
  baseIr: number;
  irpj15: number;
  baseAdicional: number;
  adicional10: number;
  totalIr: number;
  perseIr: number;
  retencaoIr: number;
  irPagar: number;
  csllMercadorias: number;
  csllServicos: number;
  baseCsll: number;
  csll9: number;
  perseCsll: number;
  retencaoCsll: number;
  csllPagar: number;
}

const soma = (ms: MesEntrada[], k: CampoEntrada) => ms.reduce((s, m) => s + (m[k] || 0), 0);

export function calcularMes(m: MesEntrada, aliquotaIss: number): ResultadoMes {
  const basePis = m.rec_mercadorias + m.rec_servicos;
  return {
    totalReceitas: m.rec_mercadorias + m.rec_monofasico + m.rec_servicos + m.rec_exterior,
    basePis,
    pis: basePis * 0.0065 - m.pis_deduzir,
    cofins: basePis * 0.03 - m.cofins_deduzir,
    baseIss: m.rec_servicos,
    iss: m.rec_servicos * aliquotaIss - m.iss_deduzir,
  };
}

export function calcularTrimestre(ms: MesEntrada[]): ResultadoTrimestre {
  const receitaMercadorias = soma(ms, "rec_mercadorias") + soma(ms, "rec_monofasico") + soma(ms, "rec_exterior");
  const receitaServicos = soma(ms, "rec_servicos");
  const receitaTotal = receitaMercadorias + receitaServicos;
  const ateLimite = Math.min(receitaTotal, LIMITE_TRIMESTRE);
  const excedente = Math.max(receitaTotal - LIMITE_TRIMESTRE, 0);
  const excedenteComercio = receitaTotal ? excedente * (receitaMercadorias / receitaTotal) : 0;
  const excedenteServico = receitaTotal ? excedente * (receitaServicos / receitaTotal) : 0;
  const bcIr32 = receitaTotal ? (receitaServicos - excedenteServico) * 0.32 : 0;
  const bcIr352 = excedenteServico * 0.352;
  const bcIr8 = receitaTotal ? (receitaMercadorias - excedenteComercio) * 0.08 : 0;
  const bcIr88 = excedenteComercio * 0.088;
  const outrasReceitas = soma(ms, "rec_aplicacoes");
  const baseIr = bcIr32 + bcIr352 + bcIr8 + bcIr88 + outrasReceitas;
  const irpj15 = baseIr * 0.15;
  const baseAdicional = Math.max(baseIr - LIMITE_ADICIONAL, 0);
  const adicional10 = baseAdicional * 0.1;
  const totalIr = irpj15 + adicional10;
  const perseIr = soma(ms, "perse_ir");
  const retencaoIr = soma(ms, "ret_ir");
  const csllMercadorias = receitaMercadorias * 0.12;
  const csllServicos = receitaServicos * 0.32;
  const baseCsll = csllMercadorias + csllServicos + outrasReceitas;
  const csll9 = baseCsll * 0.09;
  const perseCsll = soma(ms, "perse_csll");
  const retencaoCsll = soma(ms, "ret_csll");
  return {
    receitaMercadorias, receitaServicos, receitaTotal, ateLimite, excedente, excedenteComercio,
    excedenteServico, bcIr32, bcIr352, bcIr8, bcIr88, outrasReceitas, baseIr, irpj15, baseAdicional,
    adicional10, totalIr, perseIr, retencaoIr, irPagar: totalIr - perseIr - retencaoIr,
    csllMercadorias, csllServicos, baseCsll, csll9, perseCsll, retencaoCsll,
    csllPagar: csll9 - perseCsll - retencaoCsll,
  };
}

export function calcularAno(meses: MesEntrada[], aliquotaIss: number) {
  const ms = Array.from({ length: 12 }, (_, i) => meses[i] ?? mesVazio());
  const mensal = ms.map((m) => calcularMes(m, aliquotaIss));
  const trimestral = [0, 1, 2, 3].map((t) => calcularTrimestre(ms.slice(t * 3, t * 3 + 3)));
  const sumM = (k: keyof ResultadoMes) => mensal.reduce((s, r) => s + r[k], 0);
  const sumT = (k: keyof ResultadoTrimestre) => trimestral.reduce((s, r) => s + r[k], 0);
  const totais = {
    receita: sumM("totalReceitas"),
    irpj: sumT("irPagar"),
    csll: sumT("csllPagar"),
    pis: sumM("pis"),
    cofins: sumM("cofins"),
    iss: sumM("iss"),
  };
  const impostos = totais.irpj + totais.csll + totais.pis + totais.cofins + totais.iss;
  return { mensal, trimestral, totais: { ...totais, impostos, carga: totais.receita ? impostos / totais.receita : 0 } };
}

export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
export const num = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });


// Linhas do modelo de planilha (Plan1, colunas B..M = Jan..Dez)
const MAPA: Partial<Record<CampoEntrada, number>> = {
  rec_mercadorias: 4,
  rec_monofasico: 5,
  rec_servicos: 6,
  rec_aplicacoes: 8,
  perse_ir: 26,
  ret_ir: 27,
  perse_csll: 38,
  ret_csll: 39,
  pis_deduzir: 48,
  cofins_deduzir: 54,
  iss_deduzir: 60,
};

export async function importarPlanilha(file: File): Promise<{ meses: MesEntrada[]; cliente: string | undefined }> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer());
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  const val = (r: number, c: number) => {
    const cell = ws[XLSX.utils.encode_cell({ r: r - 1, c })];
    const n = typeof cell?.v === "number" ? cell.v : Number(cell?.v);
    return Number.isFinite(n) ? n : 0;
  };
  const meses = Array.from({ length: 12 }, (_, i) => {
    const m = mesVazio();
    for (const [k, row] of Object.entries(MAPA)) m[k as CampoEntrada] = val(row!, i + 1);
    return m;
  });
  const cliente = ws["B1"]?.v ? String(ws["B1"].v) : undefined;
  return { meses, cliente };
}
