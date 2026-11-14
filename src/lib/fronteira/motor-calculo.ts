/**
 * Motor de cálculo de ICMS Fronteira por item.
 * Pure logic — sem I/O. Recebe inputs já carregados pelo caller.
 *
 * Regimes suportados: ST, ANTECIPACAO, DIFAL, NORMAL, ISENTO
 */

import {
  calcularAntecipacao,
  type Fundamento,
} from "./fiscal-pe/motor-antecipacao-pe";

import { calcularStDestinatario } from "./fiscal-pe/motor-st-pe";
import { montarEntradaOficial, aliquotaInterestadualItem, aliquotaInternaItem } from "./fiscal-pe/entrada-motor";

export type Regime = "ST" | "ANTECIPACAO" | "DIFAL" | "NORMAL" | "ISENTO";

export interface ItemNF {
  id?: string;
  numero_item: number;
  ncm: string | null;
  cest?: string | null;
  cfop: string | null;
  cst_csosn?: string | null;
  descricao?: string | null;
  quantidade: number;
  valor_unitario: number;
  valor_total_item: number;
  valor_frete_item?: number;
  valor_ipi_item?: number;
  valor_desconto_item?: number;
  valor_outros_item?: number;
  base_icms_item?: number;
  valor_icms_item?: number;
  aliquota_icms_origem?: number;
  origem_mercadoria?: string | number | null;
  valor_seguro_item?: number;
  aliquota_icms_st?: number;
  valor_icms_st_item?: number;
  /** CRT do emitente 1 ou 2 (Simples Nacional) */
  remetente_simples?: boolean;
}

export interface RegraCalculo {
  id: string;
  codigo: string;
  regime_destino: Regime;
  cfops_aplicaveis: string[];
  csts_aplicaveis: string[];
  formula_template: Record<string, unknown>;
  prioridade: number;
  vigencia_inicio: string;
  vigencia_fim: string | null;
}

export interface AliquotaInterna {
  ncm: string | null;
  aliquota: number;
  fecp: number;
  vigencia_inicio: string;
  vigencia_fim: string | null;
}

export interface MvaRow {
  ncm: string;
  mva_original: number;
  mva_ajustada_4: number | null;
  mva_ajustada_7: number | null;
  mva_ajustada_12: number | null;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  base_legal?: string | null;
}

export interface PautaRow {
  ncm: string;
  valor_pauta: number;
  unidade: string | null;
  comparacao: string | null;
  vigencia_inicio: string;
  vigencia_fim: string | null;
}

export interface NcmRegime {
  ncm: string;
  regime: string; // ST, ANTECIPACAO, DIFAL, NORMAL...
  vigencia_inicio: string;
  vigencia_fim: string | null;
}

export interface ExcecaoNcm {
  ncm: string;
  cest: string | null;
  regime_override: Regime;
  vigencia_inicio: string;
  vigencia_fim: string | null;
}

export interface CreditoSN {
  ncm: string | null;
  cnae: string | null;
  percentual_credito: number;
  vigencia_inicio: string;
  vigencia_fim: string | null;
}

export interface PerfilFiscal {
  regime: string | null;
  aliquota_interna_default: number;
  cnae?: string | null;
  porte?: string | null;
  /** Flags JSONB do perfil (regular_339a, agreste_anexo19, credenciado_38455, etc.) */
  flags?: Record<string, unknown> | null;
  /** MVA do Anexo 12 para o CNAE principal, resolvida via public.mva_anexo12 */
  mva_anexo12?: number | null;
}

export interface ContextoCalculo {
  data_referencia: string; // YYYY-MM-DD
  uf_origem: string;
  uf_destino: string; // 'PE'
  perfil: PerfilFiscal | null;
  // Tabelas pré-carregadas (todas vigentes na data)
  regras: RegraCalculo[];
  aliquotas_internas: AliquotaInterna[];
  mvas: MvaRow[];
  pautas: PautaRow[];
  ncms_regimes: NcmRegime[];
  excecoes: ExcecaoNcm[];
  creditos_sn: CreditoSN[];
}

export interface PassoTrace {
  passo: string;
  detalhe: string;
  valor?: number;
  /** Fundamento legal (informativo + item + dispositivo) — motor oficial. */
  fundamento?: Fundamento;
}

export interface ResultadoItem {
  numero_item: number;
  ncm: string | null;
  cfop: string | null;
  regime_aplicado: Regime;
  regra_calculo_id: string | null;
  regra_codigo: string | null;
  formula_aplicada: string;
  base_calculo: number;
  aliquota_interna: number;
  aliquota_interestadual: number;
  mva_aplicada: number | null;
  pauta_aplicada: number | null;
  credito_sn_aplicado: number;
  icms_destacado_item: number;
  icms_calculado_item: number;
  trace: PassoTrace[];
  avisos: string[];
  /** regraId do motor oficial (regras_fiscais.id), quando aplicável. */
  regra_fiscal_id?: string | null;
  /** Código de receita e prazo de recolhimento (motor oficial). */
  recolhimento?: { codigoReceita: string; prazo: string; fundamento: Fundamento } | null;
  /** Motivo quando o item não pôde ser calculado (classificação ausente). */
  pendente?: string | null;
}

export interface ResultadoCalculo {
  itens: ResultadoItem[];
  base_calculo_total: number;
  icms_destacado_total: number;
  icms_calculado_total: number;
  avisos: string[];
  /** Itens não calculados (NCM sem classificação, ST sem MVA). */
  pendencias: string[];
}

// ====== utils ======

const inRange = (data: string, ini: string, fim: string | null) =>
  data >= ini && (fim === null || data <= fim);

const num = (v: number | null | undefined) => Number(v ?? 0) || 0;

function escolherMva(mva: MvaRow, aliqInterestadual: number): number {
  if (aliqInterestadual === 4 && mva.mva_ajustada_4 != null) return Number(mva.mva_ajustada_4);
  if (aliqInterestadual === 7 && mva.mva_ajustada_7 != null) return Number(mva.mva_ajustada_7);
  if (aliqInterestadual === 12 && mva.mva_ajustada_12 != null)
    return Number(mva.mva_ajustada_12);
  return Number(mva.mva_original);
}

function buscarVigente<T extends { vigencia_inicio: string; vigencia_fim: string | null }>(
  lista: T[],
  data: string,
): T[] {
  return lista.filter((r) => inRange(data, r.vigencia_inicio, r.vigencia_fim));
}

/**
 * Normaliza valores de regime vindos do DB (que historicamente usavam
 * ST_LIBERACAO / ANTECIPACAO_COM_LIBERACAO / ANTECIPACAO_SEM_LIBERACAO / OUTROS)
 * para o vocabulário do motor (ST / ANTECIPACAO / DIFAL / NORMAL / ISENTO).
 * Mantido defensivo mesmo após a migration de consolidação.
 */
export function normalizarRegime(r: string | null | undefined): Regime {
  switch ((r ?? "").toUpperCase()) {
    case "ST":
    case "ST_LIBERACAO":
      return "ST";
    case "ANTECIPACAO":
    case "ANTECIPACAO_COM_LIBERACAO":
    case "ANTECIPACAO_SEM_LIBERACAO":
      return "ANTECIPACAO";
    case "DIFAL":
      return "DIFAL";
    case "ISENTO":
      return "ISENTO";
    case "NORMAL":
    case "OUTROS":
    default:
      return "NORMAL";
  }
}

// ====== classificação ======

function determinarRegime(item: ItemNF, ctx: ContextoCalculo): {
  regime: Regime;
  origem: string;
} {
  const ncm = (item.ncm ?? "").replace(/\D/g, "");
  if (!ncm) return { regime: "NORMAL", origem: "sem-ncm" };

  // 1) Exceção tem prioridade absoluta
  const exc = buscarVigente(ctx.excecoes, ctx.data_referencia).find(
    (e) => e.ncm.replace(/\D/g, "") === ncm,
  );
  if (exc) return { regime: normalizarRegime(exc.regime_override), origem: "excecao_ncm" };

  // 2) Tabela ncms_regimes (com fallback por prefixo de NCM)
  const candidatos = buscarVigente(ctx.ncms_regimes, ctx.data_referencia).filter((r) => {
    const rncm = r.ncm.replace(/\D/g, "");
    return rncm === ncm || ncm.startsWith(rncm);
  });
  if (candidatos.length > 0) {
    // mais específico (NCM mais longo) primeiro
    candidatos.sort((a, b) => b.ncm.length - a.ncm.length);
    const reg = normalizarRegime(candidatos[0].regime);
    return { regime: reg, origem: "ncms_regimes" };
  }

  // 3) Heurística por CFOP (DIFAL para uso/consumo, ativo)
  const cfop = (item.cfop ?? "").replace(/\D/g, "");
  if (cfop.startsWith("2") && (cfop.endsWith("551") || cfop.endsWith("556") || cfop.endsWith("552"))) {
    return { regime: "DIFAL", origem: "heuristica_cfop_uso_consumo" };
  }

  return { regime: "NORMAL", origem: "fallback" };
}

function selecionarRegra(
  regime: Regime,
  item: ItemNF,
  ctx: ContextoCalculo,
): RegraCalculo | null {
  const cfop = (item.cfop ?? "").replace(/\D/g, "");
  const cst = (item.cst_csosn ?? "").trim();

  const candidatas = buscarVigente(ctx.regras, ctx.data_referencia)
    .filter((r) => r.regime_destino === regime)
    .filter(
      (r) =>
        r.cfops_aplicaveis.length === 0 ||
        r.cfops_aplicaveis.some((c) => c.replace(/\D/g, "") === cfop),
    )
    .filter(
      (r) => r.csts_aplicaveis.length === 0 || r.csts_aplicaveis.includes(cst),
    )
    .sort((a, b) => a.prioridade - b.prioridade);

  return candidatas[0] ?? null;
}

function buscarAliquotaInterna(
  ncm: string | null,
  ctx: ContextoCalculo,
): { aliq: number; fecp: number; origem: string } {
  const ncmLimpo = (ncm ?? "").replace(/\D/g, "");
  const candidatos = buscarVigente(ctx.aliquotas_internas, ctx.data_referencia).filter(
    (a) => {
      if (!a.ncm) return true; // genérica
      const an = a.ncm.replace(/\D/g, "");
      return an === ncmLimpo || ncmLimpo.startsWith(an);
    },
  );
  if (candidatos.length > 0) {
    candidatos.sort((a, b) => (b.ncm?.length ?? 0) - (a.ncm?.length ?? 0));
    const c = candidatos[0];
    return {
      aliq: Number(c.aliquota),
      fecp: Number(c.fecp ?? 0),
      origem: c.ncm ? `aliquota_internas[${c.ncm}]` : "aliquota_interna_generica",
    };
  }
  // fallback perfil
  const def = ctx.perfil?.aliquota_interna_default ?? 20.5;
  return { aliq: Number(def), fecp: 0, origem: "perfil_default" };
}

function buscarPauta(ncm: string | null, ctx: ContextoCalculo): PautaRow | null {
  const ncmLimpo = (ncm ?? "").replace(/\D/g, "");
  if (!ncmLimpo) return null;
  const candidatos = buscarVigente(ctx.pautas, ctx.data_referencia).filter((p) => {
    const pn = p.ncm.replace(/\D/g, "");
    return pn === ncmLimpo || ncmLimpo.startsWith(pn);
  });
  if (candidatos.length === 0) return null;
  candidatos.sort((a, b) => b.ncm.length - a.ncm.length);
  return candidatos[0];
}

function buscarMva(ncm: string | null, ctx: ContextoCalculo): MvaRow | null {
  const ncmLimpo = (ncm ?? "").replace(/\D/g, "");
  if (!ncmLimpo) return null;
  const candidatos = buscarVigente(ctx.mvas, ctx.data_referencia).filter((m) => {
    const mn = m.ncm.replace(/\D/g, "");
    return mn === ncmLimpo || ncmLimpo.startsWith(mn);
  });
  if (candidatos.length === 0) return null;
  candidatos.sort((a, b) => b.ncm.length - a.ncm.length);
  return candidatos[0];
}

function buscarCreditoSN(ncm: string | null, ctx: ContextoCalculo): number {
  if (ctx.perfil?.regime !== "SIMPLES_NACIONAL" && ctx.perfil?.regime !== "SIMPLES")
    return 0;
  const ncmLimpo = (ncm ?? "").replace(/\D/g, "");
  const cnae = ctx.perfil?.cnae ?? null;
  const candidatos = buscarVigente(ctx.creditos_sn, ctx.data_referencia).filter((c) => {
    const matchNcm = !c.ncm || (ncmLimpo && ncmLimpo.startsWith(c.ncm.replace(/\D/g, "")));
    const matchCnae = !c.cnae || c.cnae === cnae;
    return matchNcm && matchCnae;
  });
  if (candidatos.length === 0) return 0;
  return Number(candidatos[0].percentual_credito) || 0;
}

// ====== cálculo por item ======

export function calcularItem(item: ItemNF, ctx: ContextoCalculo): ResultadoItem {
  const trace: PassoTrace[] = [];
  const avisos: string[] = [];

  const { regime, origem: origemRegime } = determinarRegime(item, ctx);
  trace.push({ passo: "regime", detalhe: `${regime} (origem: ${origemRegime})` });

  const regra = selecionarRegra(regime, item, ctx);
  trace.push({
    passo: "regra",
    detalhe: regra
      ? `${regra.codigo} (prioridade ${regra.prioridade})`
      : "nenhuma regra cadastrada — usando fórmula padrão do regime",
  });
  if (!regra)
    avisos.push(`Sem regra cadastrada para regime ${regime}, CFOP ${item.cfop}, CST ${item.cst_csosn}`);

  const valorBruto =
    num(item.valor_total_item) +
    num(item.valor_frete_item) +
    num(item.valor_ipi_item) +
    num(item.valor_outros_item) -
    num(item.valor_desconto_item);
  trace.push({ passo: "valor_operacao", detalhe: "produto+frete+ipi+outros-desconto", valor: valorBruto });

  // Pauta
  const pauta = buscarPauta(item.ncm, ctx);
  let baseAntesMva = valorBruto;
  let pautaAplicada: number | null = null;
  if (pauta) {
    const valorPautaTotal = Number(pauta.valor_pauta) * num(item.quantidade || 1);
    if (pauta.comparacao === "MAIOR" || pauta.comparacao == null) {
      if (valorPautaTotal > valorBruto) {
        baseAntesMva = valorPautaTotal;
        pautaAplicada = valorPautaTotal;
        trace.push({
          passo: "pauta",
          detalhe: `pauta ${pauta.valor_pauta}/${pauta.unidade ?? "un"} aplicada (maior que valor da operação)`,
          valor: valorPautaTotal,
        });
      } else {
        trace.push({ passo: "pauta", detalhe: "pauta consultada mas valor da operação é maior" });
      }
    } else {
      baseAntesMva = valorPautaTotal;
      pautaAplicada = valorPautaTotal;
      trace.push({ passo: "pauta", detalhe: `pauta ${pauta.comparacao} aplicada`, valor: valorPautaTotal });
    }
  }

  const aliqInterest = aliquotaInterestadualItem(item, ctx.uf_origem);
  trace.push({ passo: "aliq_interestadual", detalhe: `${aliqInterest}%`, valor: aliqInterest });

  const { aliq: aliqInterna, fecp, origem: origemAliq } = buscarAliquotaInterna(item.ncm, ctx);
  const aliqInternaTotal = regime === "ANTECIPACAO" || regime === "DIFAL"
    ? aliquotaInternaItem(item.ncm, ctx)
    : aliqInterna + fecp;
  trace.push({
    passo: "aliq_interna",
    detalhe: `${aliqInterna}% + FECP ${fecp}% (${origemAliq})`,
    valor: aliqInternaTotal,
  });

  const icmsDestacado = num(item.valor_icms_item);

  let baseCalculo = baseAntesMva;
  let mvaAplicada: number | null = null;
  let icmsCalculado = 0;
  let formulaTxt = "NORMAL: sem complementação";
  let regraFiscalId: string | null = null;
  let recolhimento: ResultadoItem["recolhimento"] = null;
  let pendente: string | null =
    origemRegime === "fallback" || origemRegime === "sem-ncm" ? "NCM sem classificação" : null;

  switch (pendente ? "PENDENTE" : regime) {
    case "PENDENTE": {
      icmsCalculado = 0;
      formulaTxt = `Pendente: ${pendente}`;
      trace.push({ passo: "pendente", detalhe: pendente ?? "" });
      break;
    }
    case "ST": {
      const mvaRow = buscarMva(item.ncm, ctx);
      const stItem = num(item.valor_icms_st_item);
      const aliqStItem = num(item.aliquota_icms_st);
      if (stItem > 0 && Math.abs(aliqStItem - aliqInternaTotal) < 0.01) {
        regraFiscalId = "INAP_ST";
        formulaTxt = "ST retida pelo remetente";
        trace.push({ passo: "ST retida pelo remetente", detalhe: `ICMS-ST ${stItem.toFixed(2)} retido com alíquota ${aliqStItem}% (PE)`, valor: stItem });
        icmsCalculado = 0;
        break;
      }
      if (stItem > 0) {
        avisos.push(`ICMS-ST destacado com alíquota de outra UF (${aliqStItem}%) — não aproveitado em PE`);
      }
      if (!mvaRow) {
        pendente = `MVA não cadastrada para o NCM ${item.ncm}`;
        formulaTxt = "ST: pendente";
        trace.push({ passo: "mva", detalhe: pendente });
        break;
      }
      mvaAplicada = escolherMva(mvaRow, aliqInterest);
      const r = calcularStDestinatario({
        dataDocumento: ctx.data_referencia,
        ncm: item.ncm ?? "",
        mva: mvaAplicada,
        aliquotaInterna: aliqInternaTotal,
        aliquotaInterestadual: aliqInterest,
        valores: {
          produtos: num(item.valor_total_item),
          frete: num(item.valor_frete_item),
          ipi: num(item.valor_ipi_item),
          seguro: num(item.valor_seguro_item),
          outras: num(item.valor_outros_item),
          descontoIncondicional: num(item.valor_desconto_item),
          icmsDestacado,
        },
        remetenteSimples: !!item.remetente_simples,
        baseLegalMva: mvaRow.base_legal ?? null,
      });
      baseCalculo = r.baseCalculo;
      icmsCalculado = r.valor;
      regraFiscalId = r.regraId;
      recolhimento = { ...r.recolhimento, fundamento: r.passos[0].fundamento! };
      formulaTxt = `ST (pago pelo destinatário): ${r.regraId}`;
      for (const p of r.passos) {
        trace.push({ passo: p.passo, detalhe: p.detalhe ?? p.fundamento?.dispositivo ?? "", valor: p.valor, fundamento: p.fundamento });
      }
      avisos.push(...r.avisos);
      break;
    }
    case "ANTECIPACAO":
    case "DIFAL": {
      // Motor oficial SEFAZ-PE (src/lib/fiscal-pe/motor-antecipacao-pe.ts):
      // única implementação da antecipação e do diferencial de alíquotas.
      const entrada = montarEntradaOficial(item, ctx, regime, aliqInternaTotal, aliqInterest);
      const r = calcularAntecipacao(entrada);
      baseCalculo = r.baseCalculo;
      icmsCalculado = r.valor;
      regraFiscalId = r.regraId;
      recolhimento = r.recolhimento;
      formulaTxt = `${regime} (motor oficial): ${r.regraId}`;
      for (const p of r.passos) {
        trace.push({
          passo: p.passo,
          detalhe: p.detalhe ?? p.fundamento?.dispositivo ?? "",
          valor: p.valor,
          fundamento: p.fundamento,
        });
      }
      avisos.push(...r.avisos);
      break;
    }
    case "ISENTO": {
      icmsCalculado = 0;
      formulaTxt = "ISENTO";
      break;
    }
    case "NORMAL":
    default: {
      icmsCalculado = 0;
      formulaTxt = "NORMAL: sem ICMS Fronteira a complementar";
    }
  }

  // Crédito Simples Nacional
  const credSnPct = buscarCreditoSN(item.ncm, ctx);
  let credSn = 0;
  if (credSnPct > 0 && icmsCalculado > 0 && regime !== "ST") {
    credSn = (icmsCalculado * credSnPct) / 100;
    icmsCalculado = Math.max(0, icmsCalculado - credSn);
    trace.push({ passo: "credito_sn", detalhe: `${credSnPct}% de crédito aplicado`, valor: credSn });
  }

  trace.push({ passo: "icms_calculado", detalhe: formulaTxt, valor: icmsCalculado });

  return {
    numero_item: item.numero_item,
    ncm: item.ncm,
    cfop: item.cfop,
    regime_aplicado: regime,
    regra_calculo_id: regra?.id ?? null,
    regra_codigo: regra?.codigo ?? null,
    formula_aplicada: formulaTxt,
    base_calculo: baseCalculo,
    aliquota_interna: aliqInternaTotal,
    aliquota_interestadual: aliqInterest,
    mva_aplicada: mvaAplicada,
    pauta_aplicada: pautaAplicada,
    credito_sn_aplicado: credSn,
    icms_destacado_item: icmsDestacado,
    icms_calculado_item: icmsCalculado,
    trace,
    avisos,
    regra_fiscal_id: regraFiscalId,
    recolhimento,
    pendente,
  };
}

export function calcularLote(itens: ItemNF[], ctx: ContextoCalculo): ResultadoCalculo {
  const resultados = itens.map((it) => calcularItem(it, ctx));
  const base_calculo_total = resultados.reduce((s, r) => s + r.base_calculo, 0);
  const icms_destacado_total = resultados.reduce((s, r) => s + r.icms_destacado_item, 0);
  const icms_calculado_total = resultados.reduce((s, r) => s + r.icms_calculado_item, 0);
  const avisos = resultados.flatMap((r) => r.avisos);
  const pendencias = resultados
    .filter((r) => r.pendente)
    .map((r) => `Item ${r.numero_item} (NCM ${r.ncm ?? "—"}): ${r.pendente}`);
  return {
    itens: resultados,
    base_calculo_total,
    icms_destacado_total,
    icms_calculado_total,
    avisos,
    pendencias,
  };
}