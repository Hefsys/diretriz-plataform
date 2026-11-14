/**
 * Lógicas de cálculo pré-cadastradas (formato FLUXO_VISUAL) — ICMS/PE.
 *
 * Cada lógica reproduz uma regra do catálogo (regras_fiscais) para um cenário
 * fixo (alíquota interna de 20,5% e alíquota interestadual definida) e traz os
 * exemplos oficiais da SEFAZ-PE que ela precisa reproduzir
 * (informativo "Base de Cálculo nas Entradas Interestaduais", item 5).
 *
 * As fórmulas seguem a avaliação da esquerda para a direita de fluxo-calculo.ts.
 * Não altere os fluxos sem rodar logicas-pre-cadastradas.test.ts.
 */
import type { Fluxo, NoFluxo } from "../fluxo-calculo";

export interface CasoLogica { item: string; v: Record<string, number>; esperado: number }
export interface LogicaPreCadastrada {
  codigo: string;
  nome: string;
  descricao: string;
  /** id em public.regras_fiscais */
  regra: string;
  fluxo: Fluxo;
  casos: CasoLogica[];
}

/** Campos do XML (total da NF-e) usados pelas lógicas. */
export const CAMPOS_PRE_CADASTRADOS = [
  { codigo: "valor_produtos", label: "Valor dos produtos", caminho: "total>ICMSTot>vProd", ordem: 1 },
  { codigo: "valor_ipi", label: "Valor do IPI", caminho: "total>ICMSTot>vIPI", ordem: 2 },
  { codigo: "valor_frete", label: "Valor do frete", caminho: "total>ICMSTot>vFrete", ordem: 3 },
  { codigo: "valor_seguro", label: "Valor do seguro", caminho: "total>ICMSTot>vSeg", ordem: 4 },
  { codigo: "valor_outros", label: "Outras despesas acessórias", caminho: "total>ICMSTot>vOutro", ordem: 5 },
  { codigo: "valor_desconto", label: "Valor do desconto", caminho: "total>ICMSTot>vDesc", ordem: 6 },
  { codigo: "icms_destacado", label: "ICMS destacado", caminho: "total>ICMSTot>vICMS", ordem: 7 },
  { codigo: "valor_total_nf", label: "Valor total da nota", caminho: "total>ICMSTot>vNF", ordem: 8 },
] as const;

let k = 0;
const id = () => `pc${(++k).toString(36).padStart(3, "0")}`;
const X = (campo: string): NoFluxo => ({ id: id(), tipo: "operando", origem: "xml", campo });
const N = (valor: number): NoFluxo => ({ id: id(), tipo: "operando", origem: "numero", valor });
const P = (valor: number): NoFluxo => ({ id: id(), tipo: "operando", origem: "percentual", valor });
const O = (op: "+" | "-" | "x" | "/"): NoFluxo => ({ id: id(), tipo: "operador", op });

const valorOperacao = (): NoFluxo[] => [
  X("valor_produtos"), O("+"), X("valor_ipi"), O("+"), X("valor_frete"), O("+"), X("valor_seguro"), O("+"), X("valor_outros"),
];
const baseDentro = (comDesconto: boolean): NoFluxo[] => [
  ...valorOperacao(), ...(comDesconto ? [O("-"), X("valor_desconto")] : []), O("-"), X("icms_destacado"), O("/"), N(0.795),
];
const br = (v: number) => v.toString().replace(".", ",");

type Caso = CasoLogica;
const L: LogicaPreCadastrada[] = [];
const caso = (item: string, esperado: number, produtos: number, icms: number, extra: Record<string, number> = {}): Caso => ({
  item, esperado, v: { valor_produtos: produtos, valor_ipi: 0, valor_frete: 0, valor_seguro: 0, valor_outros: 0, valor_desconto: 0, icms_destacado: icms, valor_total_nf: produtos, ...extra },
});
const RODAPE = "Considera alíquota interna de 20,5%. Cálculo pela soma da nota inteira: notas com itens de alíquotas ou destinações diferentes devem ser auditadas pelo motor oficial (por item).";

// 1. Antecipação parcial
L.push({ codigo: "AT-01", regra: "ANTECIPACAO_PARCIAL",
  nome: "AT-01 · Antecipação parcial — regime normal, sem MVA",
  descricao: `Compra em outra UF para revenda ou industrialização por empresa do regime normal sem CNAE no Anexo 12. Base "por dentro" × 20,5% − ICMS destacado. Descontos não são deduzidos. Código 058-2. Fundamento: Dec. 44.650/2017, arts. 332 e 333; informativo Antecipação Tributária – Aquisições em outra UF, itens 2.3.1 e 2.3.2. ${RODAPE}`,
  fluxo: [...baseDentro(false), O("x"), P(20.5), O("-"), X("icms_destacado")],
  casos: [caso("5.2.1.1", 756.6, 4000, 280, { valor_ipi: 200, valor_seguro: 100 }), caso("5.2.1.2", 1108.81, 4000, 0, { valor_ipi: 200, valor_seguro: 100 }), caso("5.2.1.3", 837.74, 4000, 154)] });

// 2. Antecipação com MVA do Anexo 12
const exMva: Record<number, Caso[]> = { 30: [caso("5.2.1.4", 2101.65, 8000, 560, { valor_ipi: 400, valor_seguro: 100 }), caso("5.2.1.6", 2412.42, 8000, 327.25, { valor_ipi: 400, valor_seguro: 100 })] };
for (const [i, m] of [30, 40, 50, 60, 80].entries()) {
  L.push({ codigo: `AT-0${i + 2}`, regra: "ANTECIPACAO_MVA",
    nome: `AT-0${i + 2} · Antecipação com MVA de ${m}% — CNAE do Anexo 12`,
    descricao: `Regime normal com CNAE no Anexo 12 do Dec. 44.650/2017 cuja MVA é ${m}% (confira o CNAE na tabela do anexo). Base "por dentro" × ${100 + m}% × 20,5% − ICMS destacado. Código 058-2. Fundamento: Dec. 44.650/2017, arts. 332, § 1º e 335, parágrafo único; Anexo 12; informativo Antecipação em outra UF, item 2.3.3. ${RODAPE}`,
    fluxo: [...baseDentro(false), O("x"), P(100 + m), O("x"), P(20.5), O("-"), X("icms_destacado")],
    casos: exMva[m] ?? [] });
}
L.push({ codigo: "AT-07", regra: "LEITE_MVA35",
  nome: "AT-07 · Leite e derivados — regime normal, MVA de 35%",
  descricao: `Leite e derivados adquiridos em outra UF por empresa do regime normal. Base "por dentro" × 135% × 20,5% − ICMS destacado. Se a pauta fiscal for maior que a base, vale a pauta (não coberta por esta lógica). Fundamento: Dec. 44.650/2017, arts. 349 e 350; informativo Antecipação em outra UF, item 3. ${RODAPE}`,
  fluxo: [...baseDentro(false), O("x"), P(135), O("x"), P(20.5), O("-"), X("icms_destacado")], casos: [] });
L.push({ codigo: "AT-08", regra: "SOFTWARE_1PCT",
  nome: "AT-08 · Software não personalizado — 1%",
  descricao: `Programa de computador "de prateleira" para revenda, qualquer regime. Base "por dentro" × 1%. Fundamento: Lei 15.730/2016, art. 30, § 2º; Dec. 44.650/2017, art. 325; informativo Antecipação em outra UF, item 2.3.9. ${RODAPE}`,
  fluxo: [...baseDentro(false), O("x"), P(1)], casos: [caso("5.2.1.9", 11.82, 1000, 70, { valor_ipi: 10 })] });

// 3. Diferencial de alíquotas — uso, consumo e ativo
const exDifal: Record<number, Caso[]> = {
  4: [caso("5.1.1.4", 796.98, 4000, 160)],
  7: [caso("5.1.1.1", 789.62, 5000, 350), caso("5.1.1.10", 653.09, 4000, 154)],
  12: [caso("5.1.1.3", 762.11, 8000, 972, { valor_ipi: 100 }), caso("5.1.1.9", 188.18, 2000, 240)],
};
for (const [i, r] of [4, 7, 12].entries()) {
  L.push({ codigo: `DA-0${i + 1}`, regra: "DIFAL_USO_ATIVO",
    nome: `DA-0${i + 1} · Diferencial de alíquotas — uso, consumo ou ativo, interestadual ${r}%`,
    descricao: `Entrada interestadual com alíquota de ${r}% para uso, consumo ou ativo permanente, regime normal. Base "por dentro" (com dedução do desconto incondicional) × ${br(20.5 - r)}% (20,5% − ${r}%). Sem MVA e sem redução de base. Código 058-2 se a empresa é sujeita à antecipação; senão 057-4, até o dia 15. Fundamento: Lei 15.730/2016, art. 24; Dec. 44.650/2017, art. 326; Resolução de Consulta 57/2022; informativo Antecipação em outra UF, item 2.3.10. ${RODAPE}`,
    fluxo: [...baseDentro(true), O("x"), P(20.5 - r)], casos: exDifal[r] });
}

// 4. Simples Nacional
const tabelas: Array<{ cod: string; titulo: string; item: string; cargas: Record<number, number>; casos: Record<number, Caso[]> }> = [
  { cod: "SN-ME", titulo: "Simples regular ME/MEI", item: "2.3.7.2.2", cargas: { 4: 4.86, 7: 5.02, 12: 5.31 },
    casos: { 7: [caso("5.2.2.1", 117.45, 2000, 140), caso("5.1.2.3", 118.62, 2000, 141.4, { valor_ipi: 20 })], 12: [caso("5.1.2.7", 66.79, 1000, 0)] } },
  { cod: "SN-EPP", titulo: "Simples regular EPP", item: "2.3.7.2.3", cargas: { 4: 13.62, 7: 11.05, 12: 6.37 },
    casos: { 4: [caso("5.2.2.2", 328.94, 2000, 80)], 7: [caso("5.1.2.2", 261.11, 2000, 141.4, { valor_ipi: 20 })], 12: [caso("5.2.2.5", 80.13, 1000, 0)] } },
  { cod: "SN-AG", titulo: "Simples regular Agreste (CNAE do Anexo 19)", item: "2.3.7.2.1", cargas: { 4: 3.42, 7: 3.53, 12: 3.73 },
    casos: { 7: [caso("5.2.2.4", 87.03, 2000, 140, { valor_ipi: 100 }), caso("5.2.2.9", 41.29, 1000, 70)], 12: [caso("5.1.2.5", 86.7, 2000, 252, { valor_ipi: 100 })] } },
];
for (const t of tabelas) for (const r of [4, 7, 12]) {
  const c = t.cargas[r];
  L.push({ codigo: `${t.cod}-${r}`, regra: "SN_CARGA",
    nome: `${t.cod}-${r} · ${t.titulo} — interestadual ${r}%, carga ${br(c)}%`,
    descricao: `Adquirente do Simples Nacional regular (art. 339-A), compra interestadual com alíquota de ${r}%, mercadoria com alíquota interna de 20,5%. Base "por dentro" × ${br(c)}%. Vale para revenda e para uso e consumo (em uso e consumo, se houver desconto incondicional, deduza-o do valor). Código 058-2. Fundamento: Dec. 44.650/2017, arts. 339-A, 340 e 363-A; Conv. ICMS 190/2017; informativo Antecipação em outra UF, item ${t.item}. Benefício até 31/12/2032; comércio com redução de 20% ao ano a partir de 2029. ${RODAPE}`,
    fluxo: [...baseDentro(false), O("x"), P(c)], casos: t.casos[r] ?? [] });
}
const exSnIrr: Record<number, Caso[]> = { 7: [caso("5.2.2.7", 332.83, 2000, 140, { valor_ipi: 100 })], 12: [caso("5.1.2.6", 197.58, 2000, 252, { valor_ipi: 100 })] };
for (const r of [4, 7, 12]) {
  L.push({ codigo: `SN-IRR-${r}`, regra: "SN_DIFERENCIAL",
    nome: `SN-IRR-${r} · Simples não regular — interestadual ${r}%`,
    descricao: `Adquirente do Simples Nacional que não está regular nos termos do art. 339-A. Base "por dentro" × ${br(20.5 - r)}% (diferença de alíquotas). Código 058-2. Fundamento: Dec. 44.650/2017, art. 340; informativo Antecipação em outra UF, item 2.3.7.2.4. ${RODAPE}`,
    fluxo: [...baseDentro(false), O("x"), P(20.5 - r)], casos: exSnIrr[r] ?? [] });
}

// 5. Antecipação interna
L.push({ codigo: "AI-01", regra: "ANTECIPACAO_INTERNA_2_5",
  nome: "AI-01 · Antecipação interna — hiper, super, minimercado e mercearia (2,5%)",
  descricao: "Empresa do regime normal com CNAE principal 4711-3/01, 4711-3/02 ou 4712-1/00 comprando dentro de PE. Valor total da operação × 2,5%. Não se aplica a mercadoria com ST, cesta básica e outras antecipações específicas, saída isenta e devoluções. Código 100-6, até o dia 20 do mês seguinte à emissão. O valor recolhido vira crédito. Fundamento: Lei 15.730/2016, art. 29, II, “a”; Dec. 44.650/2017, arts. 360-B a 360-F; informativo Antecipação nas Aquisições Internas, itens 1 a 3.",
  fluxo: [X("valor_total_nf"), O("x"), P(2.5)], casos: [caso("—", 250, 10000, 0)] });


export const LOGICAS_PRE_CADASTRADAS: readonly LogicaPreCadastrada[] = L;

