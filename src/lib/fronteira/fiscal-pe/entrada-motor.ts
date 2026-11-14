import type { Adquirente, Atividade, Destinacao, EntradaCalculo, Porte } from "./motor-antecipacao-pe";

export interface PerfilEntrada {
  regime: string | null;
  porte?: string | null;
  aliquota_interna_default: number;
  cnae?: string | null;
  flags?: Record<string, unknown> | null;
  mva_anexo12?: number | null;
}
export interface ItemEntrada {
  numero_item?: number;
  ncm?: string | null;
  cfop?: string | null;
  cst_csosn?: string | null;
  origem_mercadoria?: string | number | null;
  aliquota_icms_origem?: number;
  aliquota_interna_destino?: number;
  valor_total_item: number;
  valor_ipi_item?: number;
  valor_frete_item?: number;
  valor_seguro_item?: number;
  valor_outros_item?: number;
  valor_desconto_item?: number;
  valor_icms_item?: number;
}
export interface ContextoEntrada {
  data_referencia: string;
  uf_origem: string;
  perfil: PerfilEntrada | null;
  aliquotas_internas: Array<{ ncm: string | null; aliquota: number; fecp: number; vigencia_inicio: string; vigencia_fim: string | null }>;
}

export function mapearPorte(porte?: string | null): Porte | undefined {
  const p = (porte ?? "").toUpperCase();
  if (p.includes("MEI")) return "MEI";
  if (p.includes("EPP")) return "EPP";
  if (p.includes("MICRO") || p === "ME" || p.includes("(ME)")) return "ME";
  return undefined;
}
export function mapearAtividade(flags: Record<string, unknown>): Atividade {
  const tipo = String(flags.tipo_empresa ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (flags.industria_ou_equiparado === true || tipo.includes("INDUSTRIA")) return "INDUSTRIA";
  if (tipo.includes("ATACAD")) return "ATACADO";
  if (tipo.includes("VAREJ")) return "VAREJO";
  return "OUTRA";
}
export function sujeitoAntecipacaoPadrao(flags: Record<string, unknown>): boolean {
  return ["VAREJO", "ATACADO", "INDUSTRIA"].includes(mapearAtividade(flags));
}
export function aliquotaInterestadualPadrao(ufOrigem: string): number {
  const uf = ufOrigem.trim().toUpperCase();
  // Res. Senado 22/1989, destino PE: Sul e Sudeste (exceto ES) a 7%; demais UFs a 12%.
  if (["RS", "SC", "PR", "SP", "RJ", "MG"].includes(uf)) return 7;
  if (["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "PA", "PB", "PI", "RN", "RO", "RR", "SE", "TO"].includes(uf)) return 12;
  throw new Error("Não foi possível determinar a alíquota interestadual: informe a UF de origem ou a origem da mercadoria no XML");
}
export function aliquotaInterestadualItem(item: ItemEntrada, ufOrigem: string): number {
  // orig é distinto de CST/CSOSN: CSOSN 102 não significa origem 1.
  const origem = item.origem_mercadoria ?? (/^\d{3}$/.test(item.cst_csosn ?? "") && !["101", "102", "103", "201", "202", "203", "300", "400", "500", "900"].includes(item.cst_csosn ?? "") ? item.cst_csosn?.[0] : undefined);
  if (["1", "2", "3", "8"].includes(String(origem))) return 4;
  if (Number(item.aliquota_icms_origem) > 0) return Number(item.aliquota_icms_origem);
  return aliquotaInterestadualPadrao(ufOrigem);
}
export function aliquotaInternaItem(ncm: string | null | undefined, ctx: ContextoEntrada): number {
  const limpo = (ncm ?? "").replace(/\D/g, "");
  const candidatos = ctx.aliquotas_internas.filter(a => ctx.data_referencia >= a.vigencia_inicio && (!a.vigencia_fim || ctx.data_referencia <= a.vigencia_fim) && (!a.ncm || limpo.startsWith(a.ncm.replace(/\D/g, ""))));
  candidatos.sort((a, b) => (b.ncm?.length ?? 0) - (a.ncm?.length ?? 0) || b.vigencia_inicio.localeCompare(a.vigencia_inicio));
  const a = candidatos[0];
  const valor = a ? Number(a.aliquota) + Number(a.fecp ?? 0) : Number(ctx.perfil?.aliquota_interna_default);
  if (!(valor > 0 && valor < 100)) throw new Error("Informe a alíquota interna do NCM ou do perfil fiscal da empresa");
  return valor;
}
export function montarEntradaOficial(item: ItemEntrada, ctx: ContextoEntrada, regime: string, aliqInternaTotal = aliquotaInternaItem(item.ncm, ctx), aliqInterest = aliquotaInterestadualItem(item, ctx.uf_origem)): EntradaCalculo {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ctx.data_referencia)) throw new Error("Informe a data de emissão da nota (dhEmi ou dEmi no XML)");
  if (!ctx.perfil) throw new Error("Cadastre o perfil fiscal da empresa para a data de emissão da nota");
  const flags = ctx.perfil.flags ?? {};
  const simples = (ctx.perfil.regime ?? "").toUpperCase().includes("SIMPLES");
  const porte = mapearPorte(ctx.perfil.porte);
  if (simples && !porte) throw new Error("Informe o porte (MEI, ME ou EPP) no perfil fiscal da empresa");
  const cfop = (item.cfop ?? "").replace(/\D/g, "");
  const padrao = flags.destinacao_padrao as Destinacao | undefined;
  const destinacao: Destinacao = cfop.endsWith("551") || cfop.endsWith("552") ? "ATIVO" : regime === "DIFAL" ? (padrao === "ATIVO" ? "ATIVO" : "USO_CONSUMO") : padrao ?? "COMERCIALIZACAO";
  const adquirente: Adquirente = {
    regime: simples ? "SIMPLES" : "NORMAL", porte: simples ? porte : undefined,
    atividade: mapearAtividade(flags),
    sujeitoAntecipacao: typeof flags.sujeito_antecipacao === "boolean" ? flags.sujeito_antecipacao : sujeitoAntecipacaoPadrao(flags),
    regular339A: flags.regular_339a === true, agresteAnexo19: flags.agreste_anexo19 === true,
    mvaAnexo12: ctx.perfil.mva_anexo12 ?? undefined, dispensaMva: flags.dispensa_mva === true,
    atividadeSuspensa: flags.atividade_suspensa === true, credenciado38455: flags.credenciado_38455 === true,
    sistemistaProdeauto: flags.sistemista_prodeauto === true,
  };
  return { dataDocumento: ctx.data_referencia, destinacao, adquirente,
    valores: { produtos: item.valor_total_item, ipi: item.valor_ipi_item, frete: item.valor_frete_item, seguro: item.valor_seguro_item, outras: item.valor_outros_item, descontoIncondicional: item.valor_desconto_item, icmsOrigem: item.valor_icms_item ?? 0 },
    aliquotaInterna: aliqInternaTotal, aliquotaInterestadual: aliqInterest };
}
/** Notas importadas antes da gravação de vSeg/vOutro por item ficam com zero nos itens. */
export function avisoSeguroOutrosAusentes(
  nota: { valor_seguro?: number | null; valor_outros?: number | null },
  itens: Array<{ valor_seguro_item?: number | null; valor_outros_item?: number | null }>,
): string | null {
  const soma = (k: "valor_seguro_item" | "valor_outros_item") => itens.reduce((t, i) => t + Number(i[k] ?? 0), 0);
  const faltaSeg = Number(nota.valor_seguro ?? 0) > 0 && soma("valor_seguro_item") === 0;
  const faltaOut = Number(nota.valor_outros ?? 0) > 0 && soma("valor_outros_item") === 0;
  if (!faltaSeg && !faltaOut) return null;
  const quais = [faltaSeg && "seguro (vSeg)", faltaOut && "outras despesas (vOutro)"].filter(Boolean).join(" e ");
  return `A nota tem ${quais} no total, mas os itens estão com zero: reimporte o XML para incluir esses valores na base de cálculo.`;
}
