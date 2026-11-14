/**
 * Motor de referência — Antecipação tributária e diferencial de alíquotas (ICMS/PE)
 *
 * Fonte primária: informativos fiscais da SEFAZ-PE
 *   - "Antecipação Tributária – Aquisições em outra UF" (atualizado em 01/10/2026)
 *   - "Base de Cálculo nas Entradas Interestaduais" (atualizado em 01/10/2026)
 *   - "Antecipação Tributária nas Aquisições Internas – Hipermercado..." (13/07/2023)
 *   - "Ativo Permanente, Uso ou Consumo" a partir de 01/10/2022 (03/08/2026)
 *
 * Princípio: o motor é DETERMINÍSTICO. Cada passo do cálculo carrega o
 * fundamento (informativo + item + dispositivo legal). O agente de IA apenas
 * EXPLICA o trace; nunca calcula nem escolhe a regra.
 *
 * Arredondamento: precisão total nas etapas intermediárias e duas casas no
 * resultado e na exibição de cada passo — é o que reproduz os exemplos oficiais.
 */

// ───────────────────────────── Tipos ─────────────────────────────

export type Destinacao = "COMERCIALIZACAO" | "INDUSTRIALIZACAO" | "USO_CONSUMO" | "ATIVO";
export type Regime = "NORMAL" | "SIMPLES";
export type Porte = "MEI" | "ME" | "EPP";
export type Atividade = "VAREJO" | "ATACADO" | "INDUSTRIA" | "SERVICO_ANEXO15" | "OUTRA";
export type TipoProduto = "GERAL" | "SOFTWARE" | "CAMARAO" | "LEITE";

export interface Fundamento {
  /** chave do informativo em `fontes_legais.chave` */
  informativo: string;
  item: string;
  dispositivo: string;
}

export interface Passo {
  passo: string;
  valor: number;
  detalhe?: string;
  fundamento?: Fundamento;
}

export interface Adquirente {
  regime: Regime;
  porte?: Porte; // obrigatório quando SIMPLES
  atividade: Atividade;
  /** Sujeito à antecipação dos arts. 329 a 347 do Dec. 44.650/2017 (define código 058-2 x 057-4) */
  sujeitoAntecipacao: boolean;
  /** Simples Nacional regular nos termos do art. 339-A (benefício do art. 363-A) */
  regular339A?: boolean;
  /** Mesorregião do Agreste com CNAE principal no Anexo 19 */
  agresteAnexo19?: boolean;
  /** MVA do Anexo 12 para o CNAE do adquirente, em % (ex.: 30) */
  mvaAnexo12?: number;
  /** Edital DPC: transferências > 60% (art. 332, §§ 2º e 3º) ou sistemista Prodeauto — sem MVA */
  dispensaMva?: boolean;
  atividadeSuspensa?: boolean;
  /** Atacadista credenciado no Dec. 38.455/2012 (limite de 6%) */
  credenciado38455?: boolean;
  /** Atacadista sistemista do Prodeauto (limite de 1%) */
  sistemistaProdeauto?: boolean;
}

export interface ReducaoBase {
  /** Percentual da base que permanece tributado (ex.: 40 para "40% do valor da operação") */
  percentualBase: number;
  sistema: "NORMAL" | "OPCIONAL";
  /** Ex.: Convênio ICMS 52/1991 (Anexo 3, art. 20, § 1º) — mantém o crédito integral */
  manterCreditoIntegral?: boolean;
}

export interface CreditoPresumido {
  percentual: number;
  sistema: "NORMAL" | "OPCIONAL";
}

export interface EntradaCalculo {
  dataDocumento: string; // AAAA-MM-DD
  destinacao: Destinacao;
  adquirente: Adquirente;
  produto?: {
    tipo?: TipoProduto;
    reducaoBase?: ReducaoBase;
    creditoPresumido?: CreditoPresumido;
    /** Pauta fiscal total (preço corrente × quantidade) para a entrada */
    pautaFiscal?: number;
  };
  valores: {
    produtos: number;
    ipi?: number;
    frete?: number; // somente quando por conta do remetente e cobrado em separado
    seguro?: number;
    outras?: number;
    descontoIncondicional?: number;
    /**
     * ICMS a excluir/creditar: o destacado na NF-e; ou o crédito informado pelo
     * remetente do Simples (LC 123/2006, art. 23); ou, a partir de 01/01/2024, o
     * crédito transferido em transferência entre estabelecimentos do mesmo titular.
     */
    icmsOrigem: number;
  };
  aliquotaInterestadual: number; // %
  aliquotaInterna: number; // % (já com o adicional do FECEP, quando houver)
}

export interface ResultadoCalculo {
  regraId: string;
  valor: number;
  baseCalculo: number;
  passos: Passo[];
  avisos: string[];
  recolhimento: { codigoReceita: string; prazo: string; fundamento: Fundamento };
}

// ───────────────────────────── Fundamentos ─────────────────────────────

const AT = "ANTECIPACAO_OUTRA_UF";
const BC = "BASE_CALCULO_ENTRADAS";

const F = {
  baseDentro: { informativo: BC, item: "2", dispositivo: "Lei 15.730/2016, art. 12, XI e art. 29, II, “d”, 1" },
  composicaoValor: { informativo: BC, item: "2", dispositivo: "Lei 15.730/2016, art. 12, § 1º — IPI, seguro, frete do remetente, demais importâncias" },
  descontoUso: { informativo: AT, item: "2.3.10.1, Importante 4", dispositivo: "Resolução de Consulta nº 57/2022" },
  descontoComerc: { informativo: BC, item: "2", dispositivo: "Lei 15.730/2016, art. 29, § 2º — descontos não considerados na antecipação" },
  difal: { informativo: AT, item: "2.3.10.2", dispositivo: "Lei 15.730/2016, art. 24; Dec. 44.650/2017, art. 326" },
  semMvaUso: { informativo: BC, item: "2", dispositivo: "Entradas para uso, consumo ou ativo não recebem MVA" },
  aliqInterna: { informativo: AT, item: "2.3.1.2 / 2.3.2.2", dispositivo: "Dec. 44.650/2017, art. 333" },
  mvaAnexo12: { informativo: AT, item: "2.3.3.1", dispositivo: "Dec. 44.650/2017, arts. 332, § 1º e 335, parágrafo único; Anexo 12" },
  mvaSuspenso: { informativo: AT, item: "2.3.6.1", dispositivo: "Dec. 44.650/2017, art. 342 — 30% ou Anexo 12, o maior" },
  mvaLeite: { informativo: AT, item: "3.1", dispositivo: "Dec. 44.650/2017, art. 349 — MVA de 35%" },
  dispensaMva: { informativo: AT, item: "2.3.3.1 (Importante)", dispositivo: "Dec. 44.650/2017, art. 332, §§ 2º e 3º" },
  pauta: { informativo: AT, item: "2.3", dispositivo: "Dec. 44.650/2017, art. 323 — pauta, se maior (exceto Simples)" },
  reducao: { informativo: AT, item: "2.3", dispositivo: "Base reduzida como na saída interna subsequente; crédito proporcional (sistema normal) ou vedado (sistema opcional)" },
  presumido: { informativo: BC, item: "5.2.1.11 / 5.2.1.12", dispositivo: "Lei 15.730/2016, art. 30, § 2º; Dec. 44.650/2017, arts. 17, 19 e 327-A" },
  credito: { informativo: AT, item: "2.3.1.2", dispositivo: "Dec. 44.650/2017, art. 333 — dedução do crédito destacado" },
  limite38455: { informativo: AT, item: "2.3.2.2, caso a", dispositivo: "Dec. 44.650/2017, art. 333, § 1º, I — limite de 6%" },
  limiteProdeauto: { informativo: AT, item: "2.3.2.2, caso b", dispositivo: "Dec. 44.650/2017, art. 333, § 1º, II — limite de 1%" },
  software: { informativo: AT, item: "2.3.9.2", dispositivo: "Lei 15.730/2016, art. 30, § 2º; Dec. 44.650/2017, art. 325 — 1%" },
  camarao: { informativo: AT, item: "2.3.11.2", dispositivo: "Dec. 44.650/2017, art. 302-C — limite de 6%" },
  snCarga: { informativo: AT, item: "2.3.7.2", dispositivo: "Dec. 44.650/2017, arts. 339-A, 340, parágrafo único e 363-A; Convênio ICMS 190/2017" },
  snGeral: { informativo: AT, item: "2.3.7.2.4 / 2.3.7.2.5", dispositivo: "Dec. 44.650/2017, art. 340 — diferença de alíquotas" },
  snSemMva: { informativo: AT, item: "3.1, caso a", dispositivo: "Dec. 44.650/2017, arts. 324, I e 363" },
  prazoCred: { informativo: AT, item: "4.1", dispositivo: "Dec. 44.650/2017, art. 351, II; Anexo 24" },
  prazo0574: { informativo: AT, item: "2.1, b", dispositivo: "Lei 15.730/2016, art. 2º, XV; Dec. 44.650/2017, art. 23" },
} satisfies Record<string, Fundamento>;

// ───────────────────────────── Tabelas ─────────────────────────────

/** Item 2.3.7.2.1 — Agreste com CNAE no Anexo 19 (por alíquota interestadual) */
export const CARGA_AGRESTE: Record<number, number> = { 4: 3.42, 7: 3.53, 12: 3.73 };

/** Item 2.3.7.2.2 — ME e MEI: [alíquota interna][alíquota interestadual] */
export const CARGA_ME_MEI: Record<string, Record<number, number>> = {
  "18": { 4: 4.27, 7: 4.41, 12: 4.66 },
  "20.5": { 4: 4.86, 7: 5.02, 12: 5.31 },
  "25": { 4: 3.91, 7: 4.03, 12: 4.26 },
  "27": { 4: 3.8, 7: 3.92, 12: 4.15 },
};

/** Item 2.3.7.2.3 — demais hipóteses (EPP): [alíquota interna][alíquota interestadual] */
export const CARGA_DEMAIS: Record<string, Record<number, number>> = {
  "18": { 4: 11.96, 7: 9.7, 12: 5.59 },
  "20.5": { 4: 13.62, 7: 11.05, 12: 6.37 },
  "25": { 4: 16.41, 7: 14.52, 12: 11.08 },
  "27": { 4: 17.49, 7: 15.7, 12: 12.44 },
};

// ───────────────────────────── Utilitários ─────────────────────────────

export const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const n = (x?: number) => (Number.isFinite(x) ? (x as number) : 0);

/** Inclui o ICMS interno "por dentro": valor ÷ (1 − alíquota interna) */
export function incluirImpostoPorDentro(valorSemIcms: number, aliquotaInterna: number): number {
  if (aliquotaInterna <= 0 || aliquotaInterna >= 100) {
    throw new Error(`Alíquota interna inválida: ${aliquotaInterna}%`);
  }
  // Sem arredondar: os exemplos oficiais arredondam só na exibição (ver caso 5.1.2.6).
  return valorSemIcms / (1 - aliquotaInterna / 100);
}

function cargaSimples(e: EntradaCalculo): { pct: number; tabela: string } | null {
  const a = e.adquirente;
  if (a.agresteAnexo19) {
    const pct = CARGA_AGRESTE[e.aliquotaInterestadual];
    return pct ? { pct, tabela: "2.3.7.2.1 (Agreste/Anexo 19)" } : null;
  }
  const tab = a.porte === "EPP" ? CARGA_DEMAIS : CARGA_ME_MEI;
  const pct = tab[String(e.aliquotaInterna)]?.[e.aliquotaInterestadual];
  if (!pct) return null; // alíquota interna fora de 18/20,5/25/27 → regra geral (2.3.7.2.5)
  return { pct, tabela: a.porte === "EPP" ? "2.3.7.2.3 (demais/EPP)" : "2.3.7.2.2 (ME/MEI)" };
}

function recolhimento(e: EntradaCalculo): ResultadoCalculo["recolhimento"] {
  const uso = e.destinacao === "USO_CONSUMO" || e.destinacao === "ATIVO";
  if (uso && !e.adquirente.sujeitoAntecipacao) {
    return { codigoReceita: "057-4", prazo: "Até o dia 15 do mês subsequente ao da entrada", fundamento: F.prazo0574 };
  }
  return {
    codigoReceita: "058-2",
    prazo:
      "Credenciado: até o dia 28 do mês subsequente (dia 26 se cair em fevereiro); microrregião de Petrolina: 2º mês subsequente. " +
      "Descredenciado ou irregular: na passagem pela 1ª unidade fiscal ou em 8 dias.",
    fundamento: F.prazoCred,
  };
}

// ───────────────────────────── Motor ─────────────────────────────

export function calcularAntecipacao(e: EntradaCalculo): ResultadoCalculo {
  const passos: Passo[] = [];
  const avisos: string[] = [];
  const a = e.adquirente;
  const tipo = e.produto?.tipo ?? "GERAL";
  const uso = e.destinacao === "USO_CONSUMO" || e.destinacao === "ATIVO";
  const v = e.valores;

  if (a.regime === "SIMPLES" && !a.porte) throw new Error("Informe o porte (MEI, ME ou EPP) do adquirente do Simples.");
  if (e.dataDocumento >= "2029-01-01" && a.regime === "SIMPLES" && a.atividade !== "INDUSTRIA") {
    avisos.push("A partir de 01/01/2029 o benefício do art. 363-A para comércio sofre redução de 20% ao ano (Conv. ICMS 190/2017). Revisar percentuais.");
  }

  // 1. Valor da operação
  let valorOperacao = n(v.produtos) + n(v.ipi) + n(v.frete) + n(v.seguro) + n(v.outras);
  passos.push({ passo: "Valor da operação", valor: r2(valorOperacao), detalhe: "produtos + IPI + frete do remetente + seguro + outras", fundamento: F.composicaoValor });
  if (n(v.descontoIncondicional) > 0) {
    if (uso) {
      valorOperacao -= n(v.descontoIncondicional);
      passos.push({ passo: "(−) Desconto incondicional", valor: r2(n(v.descontoIncondicional)), fundamento: F.descontoUso });
    } else {
      passos.push({ passo: "Desconto não deduzido", valor: 0, detalhe: "antecipação de operação subsequente", fundamento: F.descontoComerc });
    }
  }

  // 2. Exclusão do ICMS de origem e inclusão "por dentro"
  const semIcms = r2(valorOperacao - n(v.icmsOrigem));
  passos.push({ passo: "(−) ICMS de origem", valor: r2(n(v.icmsOrigem)), fundamento: F.baseDentro });
  let base = incluirImpostoPorDentro(semIcms, e.aliquotaInterna);
  passos.push({
    passo: `Inclusão do ICMS interno (÷ ${Number((1 - e.aliquotaInterna / 100).toFixed(4))})`,
    valor: r2(base),
    detalhe: `${semIcms} ÷ (1 − ${e.aliquotaInterna}%)`,
    fundamento: F.baseDentro,
  });

  const fim = (regraId: string, valor: number): ResultadoCalculo => ({
    regraId,
    valor: r2(Math.max(0, valor)),
    baseCalculo: r2(base),
    passos,
    avisos,
    recolhimento: recolhimento(e),
  });
  const diferencial = r2(e.aliquotaInterna - e.aliquotaInterestadual);

  // 3a. Uso, consumo e ativo permanente — item 2.3.10
  if (uso) {
    passos.push({ passo: "Sem MVA e sem redução de base", valor: r2(base), fundamento: F.semMvaUso });
    if (e.produto?.reducaoBase) {
      avisos.push("Redução de base informada foi ignorada: em uso, consumo ou ativo só se admite a do Conv. ICMS 52/1991 e a do art. 363-A (2.3.10.1, Importante 2). Conv. 52/1991 ainda não implementado — revisar manualmente.");
    }
    if (a.regime === "SIMPLES" && a.regular339A) {
      const c = cargaSimples(e);
      if (c) {
        const valor = r2(base * (c.pct / 100));
        passos.push({ passo: `× Carga tributária ${c.pct}% — tabela ${c.tabela}`, valor, fundamento: F.snCarga });
        return fim("SN_CARGA_USO_ATIVO", valor);
      }
    }
    const valor = r2(base * (diferencial / 100));
    passos.push({ passo: `× Diferença de alíquotas (${e.aliquotaInterna}% − ${e.aliquotaInterestadual}% = ${diferencial}%)`, valor, fundamento: F.difal });
    if (tipo === "SOFTWARE" && e.destinacao === "ATIVO") {
      avisos.push("Software para o ativo: recolher 1% e o complemento até o diferencial no código 058-2 (2.3.9.2, Importante 3). O total já está no valor calculado.");
    }
    return fim(a.regime === "SIMPLES" ? "SN_DIFAL_USO_ATIVO" : "DIFAL_USO_ATIVO", valor);
  }

  // 3b. Software não personalizado — 1% (qualquer regime)
  if (tipo === "SOFTWARE") {
    const valor = r2(base * 0.01);
    passos.push({ passo: "× 1% (software não personalizado, sem MVA)", valor, fundamento: F.software });
    return fim("SOFTWARE_1PCT", valor);
  }

  // 3c. Simples Nacional — comercialização/industrialização (item 2.3.7)
  if (a.regime === "SIMPLES") {
    if (tipo === "LEITE") passos.push({ passo: "Leite e derivados, adquirente do Simples: sem MVA", valor: r2(base), fundamento: F.snSemMva });
    if (a.regular339A) {
      const c = cargaSimples(e);
      if (c) {
        const valor = r2(base * (c.pct / 100));
        passos.push({ passo: `× Carga tributária ${c.pct}% — tabela ${c.tabela}`, valor, fundamento: F.snCarga });
        avisos.push("Se houver outro benefício na operação, prevalece o de menor imposto (art. 340, parágrafo único). Verificar.");
        return fim("SN_CARGA_COMERC", valor);
      }
    }
    let valor = r2(base * (diferencial / 100));
    passos.push({ passo: `× Diferença de alíquotas (${diferencial}%)`, valor, fundamento: F.snGeral });
    if (tipo === "CAMARAO") {
      const lim = r2(base * 0.06);
      if (valor > lim) {
        valor = lim;
        passos.push({ passo: "Limite de 6% da base (camarão)", valor, fundamento: F.camarao });
      }
    }
    return fim("SN_DIFERENCIAL_COMERC", valor);
  }

  // 3d. Regime normal — comercialização/industrialização (itens 2.3.1 a 2.3.6, 2.3.11 e 3)
  let mva = 0;
  let fMva: Fundamento | undefined;
  if (tipo === "LEITE") {
    mva = 35;
    fMva = F.mvaLeite;
  } else if (tipo === "CAMARAO" || a.dispensaMva) {
    mva = 0;
    if (a.dispensaMva) passos.push({ passo: "Sem MVA (edital DPC / sistemista Prodeauto)", valor: r2(base), fundamento: F.dispensaMva });
  } else if (a.atividadeSuspensa) {
    mva = Math.max(30, n(a.mvaAnexo12));
    fMva = F.mvaSuspenso;
  } else if (n(a.mvaAnexo12) > 0) {
    mva = n(a.mvaAnexo12);
    fMva = F.mvaAnexo12;
  }
  if (mva > 0) {
    const agregado = base * (mva / 100);
    base = base + agregado;
    passos.push({ passo: `(+) Agregação MVA ${mva}%`, valor: r2(agregado), fundamento: fMva });
    passos.push({ passo: "= Base com MVA", valor: r2(base) });
  }

  if (n(e.produto?.pautaFiscal) > base) {
    base = n(e.produto?.pautaFiscal);
    passos.push({ passo: "Pauta fiscal maior que a base apurada — adota a pauta", valor: r2(base), fundamento: F.pauta });
  }

  let credito = n(v.icmsOrigem);
  const red = e.produto?.reducaoBase;
  if (red) {
    base = base * (red.percentualBase / 100);
    passos.push({ passo: `Redução de base: ${red.percentualBase}% da base (sistema ${red.sistema.toLowerCase()})`, valor: r2(base), fundamento: F.reducao });
    if (red.sistema === "OPCIONAL") credito = 0;
    else if (!red.manterCreditoIntegral) credito = r2(credito * (red.percentualBase / 100));
  }

  const icmsTotal = r2(base * (e.aliquotaInterna / 100));
  passos.push({ passo: `× Alíquota interna ${e.aliquotaInterna}% = ICMS total`, valor: icmsTotal, fundamento: F.aliqInterna });

  const cp = e.produto?.creditoPresumido;
  let presumido = 0;
  if (cp) {
    presumido = r2(base * (cp.percentual / 100));
    if (cp.sistema === "OPCIONAL") credito = 0;
    passos.push({ passo: `(−) Crédito presumido ${cp.percentual}% (sistema ${cp.sistema.toLowerCase()})`, valor: presumido, fundamento: F.presumido });
  }
  if (credito > 0) passos.push({ passo: "(−) Crédito fiscal de origem", valor: credito, fundamento: F.credito });

  let valor = r2(icmsTotal - credito - presumido);
  passos.push({ passo: "= ICMS antecipado", valor });

  const limite = (pct: number, f: Fundamento) => {
    const lim = r2(base * (pct / 100));
    if (valor > lim) {
      valor = lim;
      passos.push({ passo: `Limitado a ${pct}% da base`, valor, fundamento: f });
    }
  };
  if (tipo === "CAMARAO") limite(6, F.camarao);
  if (a.credenciado38455) limite(6, F.limite38455);
  if (a.sistemistaProdeauto) limite(1, F.limiteProdeauto);
  if (a.atividade === "INDUSTRIA" && e.dataDocumento <= "2023-08-31") {
    avisos.push("Indústria com CNAE no Anexo 14 até 31/08/2023: limite de 1% (2.3.5.2) — não implementado.");
  }

  const regraId =
    tipo === "LEITE" ? "LEITE_MVA35" : tipo === "CAMARAO" ? "CAMARAO_LIMITE6" : mva > 0 ? "ANTECIPACAO_MVA" : "ANTECIPACAO_PARCIAL";
  return fim(regraId, valor);
}

// ───────────────────── Antecipação interna (hiper/super/mini/mercearia) ─────────────────────

export const CNAES_ANTECIPACAO_INTERNA = ["4711301", "4711302", "4712100"];

export function calcularAntecipacaoInternaVarejoAlimentar(valorTotalOperacao: number): ResultadoCalculo {
  const fund: Fundamento = {
    informativo: "ANTECIPACAO_INTERNA_HIPERMERCADO",
    item: "3",
    dispositivo: "Lei 15.730/2016, art. 29, II, “a”; Dec. 44.650/2017, arts. 360-D a 360-F",
  };
  const valor = r2(valorTotalOperacao * 0.025);
  return {
    regraId: "ANTECIPACAO_INTERNA_2_5",
    valor,
    baseCalculo: r2(valorTotalOperacao),
    passos: [
      { passo: "Base: valor total da operação", valor: r2(valorTotalOperacao), fundamento: fund },
      { passo: "× 2,5%", valor, fundamento: fund },
    ],
    avisos: [
      "Não se aplica a: mercadoria com ST, antecipação específica (cesta básica, gado, tilápia...), saída subsequente isenta ou não tributada, devoluções (item 2).",
    ],
    recolhimento: { codigoReceita: "100-6", prazo: "Até o dia 20 do mês seguinte à emissão do documento fiscal", fundamento: fund },
  };
}

// ───────────────────── ICMS na importação (ativo, uso ou consumo) ─────────────────────

export function calcularIcmsImportacao(somaParcelas: number, aliquotaInterna: number): ResultadoCalculo {
  const fund: Fundamento = { informativo: "ATIVO_PERMANENTE_2022", item: "3.1", dispositivo: "Lei 15.730/2016, art. 12, VI, §§ 6º e 7º" };
  const base = incluirImpostoPorDentro(somaParcelas, aliquotaInterna);
  const valor = r2(base * (aliquotaInterna / 100));
  return {
    regraId: "IMPORTACAO",
    valor,
    baseCalculo: base,
    passos: [
      { passo: "Soma: valor aduaneiro + II + IPI + IOF + despesas aduaneiras", valor: r2(somaParcelas), fundamento: fund },
      { passo: `÷ (1 − ${aliquotaInterna}%)`, valor: base, fundamento: fund },
      { passo: `× ${aliquotaInterna}%`, valor, fundamento: fund },
    ],
    avisos: [],
    recolhimento: { codigoReceita: "017-5", prazo: "No desembaraço aduaneiro (credenciado art. 37: prazo da categoria)", fundamento: fund },
  };
}
