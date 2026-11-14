/**
 * ICMS-ST pago pelo destinatário (antecipação com encerramento da fase de
 * tributação) — entrada interestadual sem retenção pelo remetente.
 *
 * Fórmula conferida contra um extrato real da SEFAZ-PE (08/2026):
 *   ICMS-ST = (produtos + frete + IPI + seguro + outras − desconto incondicional)
 *             × (1 + MVA) × alíquota interna − crédito
 *   crédito = alíquota interestadual × valor dos produtos (critério do
 *             extrato, inclusive para remetente do Simples sem destaque).
 *
 * O adquirente do Simples NÃO tem a carga reduzida do art. 363-A na ST.
 * Precisão total nas etapas; duas casas só no resultado.
 */
import type { Fundamento, Passo } from "./motor-antecipacao-pe";

export interface EntradaST {
  dataDocumento: string;
  ncm: string;
  mva: number; // %, ex.: 45
  aliquotaInterna: number; // %
  aliquotaInterestadual: number; // %
  valores: {
    produtos: number;
    frete?: number;
    ipi?: number;
    seguro?: number;
    outras?: number;
    descontoIncondicional?: number;
    icmsDestacado: number;
  };
  remetenteSimples: boolean;
  /** Origem da MVA (tabela mvas): base legal cadastrada */
  baseLegalMva?: string | null;
}

export interface ResultadoST {
  regraId: "ST_DESTINATARIO";
  valor: number;
  baseCalculo: number;
  credito: number;
  passos: Passo[];
  avisos: string[];
  recolhimento: { codigoReceita: string; prazo: string };
}

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const n = (x?: number) => (Number.isFinite(x) ? (x as number) : 0);

const F_ST: Fundamento = {
  informativo: "SUBSTITUICAO_TRIBUTARIA_REGRAS_GERAIS_OUT22",
  item: "5 / 5.3",
  dispositivo: "Dec. 44.650/2017, art. 361-A e Anexo 37; Lei 15.730/2016, art. 29, I — responsabilidade do adquirente quando o remetente não retém o ICMS-ST",
};
const F_CRED: Fundamento = {
  informativo: "SUBSTITUICAO_TRIBUTARIA_REGRAS_GERAIS_OUT22",
  item: "5",
  dispositivo: "Crédito pela alíquota interestadual sobre o valor dos produtos — critério aplicado pela SEFAZ-PE no extrato; validar com o responsável técnico",
};

export function calcularStDestinatario(e: EntradaST): ResultadoST {
  if (!(e.mva >= 0)) throw new Error(`MVA não cadastrada para o NCM ${e.ncm}`);
  if (e.aliquotaInterna <= 0) throw new Error(`Alíquota interna inválida para o NCM ${e.ncm}`);
  const v = e.valores;
  const passos: Passo[] = [];
  const avisos: string[] = [];

  const valor = n(v.produtos) + n(v.frete) + n(v.ipi) + n(v.seguro) + n(v.outras) - n(v.descontoIncondicional);
  passos.push({ passo: "Valor da operação", valor: r2(valor), detalhe: "produtos + frete + IPI + seguro + outras − desconto incondicional", fundamento: F_ST });
  const base = valor * (1 + e.mva / 100);
  passos.push({ passo: `(+) MVA ${e.mva}% = base da ST`, valor: r2(base), detalhe: e.baseLegalMva ?? "MVA da tabela de MVAs", fundamento: F_ST });
  const icmsTotal = base * (e.aliquotaInterna / 100);
  passos.push({ passo: `× Alíquota interna ${e.aliquotaInterna}%`, valor: r2(icmsTotal), fundamento: F_ST });

  // Critério da SEFAZ-PE no extrato: crédito = alíquota interestadual × valor dos
  // produtos, inclusive quando o remetente é do Simples e não destacou ICMS.
  const credito = r2(n(v.produtos) * (e.aliquotaInterestadual / 100));
  passos.push({ passo: `(−) Crédito: ${e.aliquotaInterestadual}% × valor dos produtos`, valor: credito, fundamento: F_CRED });
  if (e.remetenteSimples && n(v.icmsDestacado) <= 0) {
    avisos.push("Remetente do Simples sem ICMS destacado: crédito calculado pela alíquota interestadual, como faz a SEFAZ no extrato.");
  } else if (Math.abs(n(v.icmsDestacado) - credito) > 0.05) {
    avisos.push(`ICMS destacado na nota (${r2(n(v.icmsDestacado))}) difere do crédito pela alíquota interestadual (${credito}). Conferir a nota.`);
  }
  const devido = r2(Math.max(0, icmsTotal - credito));
  passos.push({ passo: "= ICMS-ST devido", valor: devido });
  return {
    regraId: "ST_DESTINATARIO", valor: devido, baseCalculo: r2(base), credito: r2(credito), passos, avisos,
    recolhimento: { codigoReceita: "058-2", prazo: "No mesmo extrato da antecipação (credenciado: dia 28 do mês subsequente)" },
  };
}

