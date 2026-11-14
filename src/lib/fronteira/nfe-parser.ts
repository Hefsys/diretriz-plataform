import { XMLParser } from "fast-xml-parser";

export interface NfeItemParsed {
  numero_item: number;
  ncm: string | null;
  cest: string | null;
  cfop: string | null;
  cst_csosn: string | null;
  descricao: string | null;
  unidade: string | null;
  quantidade: number;
  valor_unitario: number;
  valor_total_item: number;
  valor_frete_item: number;
  valor_seguro_item: number;
  valor_outros_item: number;
  valor_ipi_item: number;
  valor_desconto_item: number;
  aliquota_icms_origem: number;
  base_icms_item: number;
  valor_icms_item: number;
  aliquota_icms_st: number;
  base_icms_st_item: number;
  valor_icms_st_item: number;
  mva_destacado: number | null;
}

export interface NfeParsed {
  chave_acesso: string;
  numero: string;
  serie: string | null;
  modelo: string | null;
  cnpj_emitente: string | null;
  nome_emitente: string | null;
  ie_emitente: string | null;
  crt_emitente: number | null;
  uf_origem: string | null;
  cnpj_destinatario: string | null;
  data_emissao: string | null;
  data_saida: string | null;
  finalidade: number | null;
  chave_referenciada: string | null;
  tipo_operacao: "ENTRADA" | "SAIDA";
  valor_produtos: number;
  valor_frete: number;
  valor_seguro: number;
  valor_ipi: number;
  valor_desconto: number;
  valor_outros: number;
  valor_total_nf: number;
  base_icms: number;
  icms_destacado: number;
  base_icms_st: number;
  icms_st_destacado: number;
  itens: NfeItemParsed[];
  warnings: string[];
}

function n(v: unknown): number {
  if (v == null) return 0;
  const x = Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : 0;
}

function s(v: unknown): string | null {
  if (v == null) return null;
  const str = String(v).trim();
  return str.length ? str : null;
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function dataISO(v: unknown): string | null {
  const str = s(v);
  if (!str) return null;
  // dhEmi vem com tz (2024-03-15T10:23:45-03:00); dEmi vem só com data
  const m = str.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/**
 * Faz o parse de um XML de NF-e (modelo 55) ou NFC-e (modelo 65).
 * Aceita tanto o XML cru quanto o procNFe (com protocolo).
 */
export function parsearNfeXml(xml: string): NfeParsed {
  const warnings: string[] = [];
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
  });
  const obj = parser.parse(xml);

  // Pode vir embrulhado em nfeProc.NFe ou direto em NFe
  const nfe =
    obj?.nfeProc?.NFe ??
    obj?.NFe ??
    obj?.nfeProc?.nfe ??
    obj?.nfe;
  if (!nfe?.infNFe) {
    throw new Error("XML inválido: tag <NFe>/<infNFe> não encontrada");
  }

  const inf = nfe.infNFe;
  const idAttr: string = inf["@_Id"] ?? "";
  const chave = idAttr.replace(/^NFe/, "").replace(/\D/g, "");
  if (chave.length !== 44) {
    throw new Error(`Chave de acesso inválida (${chave.length} dígitos)`);
  }

  const ide = inf.ide ?? {};
  const emit = inf.emit ?? {};
  const dest = inf.dest ?? {};
  const total = inf.total?.ICMSTot ?? {};
  const dets = asArray(inf.det);

  // Finalidade: 1=Normal, 2=Complementar, 3=Ajuste, 4=Devolução
  const finalidade = ide.finNFe ? Number(ide.finNFe) : null;

  // Chave referenciada (devolução)
  let chaveRef: string | null = null;
  if (inf.NFref) {
    const refs = asArray(inf.NFref);
    for (const r of refs) {
      if (r.refNFe) {
        chaveRef = String(r.refNFe).replace(/\D/g, "");
        break;
      }
    }
  }

  // tpNF: 0 = Entrada, 1 = Saída (do ponto de vista do emitente)
  const tpNF = String(ide.tpNF ?? "1");
  const tipo_operacao: "ENTRADA" | "SAIDA" = tpNF === "0" ? "ENTRADA" : "SAIDA";

  const itens: NfeItemParsed[] = dets.map((det, idx) => {
    const prod = det.prod ?? {};
    const imp = det.imposto ?? {};
    const icmsBlock = imp.ICMS ?? {};
    // ICMS pode ter qualquer chave: ICMS00, ICMS10, ICMS20, ICMSSN101..., etc.
    const icmsKey = Object.keys(icmsBlock)[0];
    const icms = icmsKey ? icmsBlock[icmsKey] : {};
    const ipi = imp.IPI?.IPITrib ?? {};

    return {
      numero_item: Number(det["@_nItem"] ?? idx + 1),
      ncm: s(prod.NCM),
      cest: s(prod.CEST),
      cfop: s(prod.CFOP),
      cst_csosn: s(icms?.CST ?? icms?.CSOSN),
      descricao: s(prod.xProd),
      unidade: s(prod.uCom),
      quantidade: n(prod.qCom),
      valor_unitario: n(prod.vUnCom),
      valor_total_item: n(prod.vProd),
      valor_frete_item: n(prod.vFrete),
      valor_seguro_item: n(prod.vSeg),
      valor_outros_item: n(prod.vOutro),
      valor_ipi_item: n(ipi.vIPI),
      valor_desconto_item: n(prod.vDesc),
      aliquota_icms_origem: n(icms?.pICMS),
      base_icms_item: n(icms?.vBC),
      valor_icms_item: n(icms?.vICMS),
      aliquota_icms_st: n(icms?.pICMSST),
      base_icms_st_item: n(icms?.vBCST),
      valor_icms_st_item: n(icms?.vICMSST),
      mva_destacado: icms?.pMVAST != null ? n(icms.pMVAST) : null,
    };
  });

  if (itens.length === 0) warnings.push("Nenhum item encontrado na NF-e");

  return {
    chave_acesso: chave,
    numero: String(ide.nNF ?? ""),
    serie: s(ide.serie),
    modelo: s(ide.mod),
    cnpj_emitente: s(emit.CNPJ)?.replace(/\D/g, "") ?? null,
    nome_emitente: s(emit.xNome),
    ie_emitente: s(emit.IE),
    crt_emitente: emit.CRT != null && s(emit.CRT) ? Number(emit.CRT) : null,
    uf_origem: s(emit.enderEmit?.UF),
    cnpj_destinatario: s(dest.CNPJ ?? dest.CPF)?.replace(/\D/g, "") ?? null,
    data_emissao: dataISO(ide.dhEmi ?? ide.dEmi),
    data_saida: dataISO(ide.dhSaiEnt ?? ide.dSaiEnt),
    finalidade,
    chave_referenciada: chaveRef,
    tipo_operacao,
    valor_produtos: n(total.vProd),
    valor_frete: n(total.vFrete),
    valor_seguro: n(total.vSeg),
    valor_ipi: n(total.vIPI),
    valor_desconto: n(total.vDesc),
    valor_outros: n(total.vOutro),
    valor_total_nf: n(total.vNF),
    base_icms: n(total.vBC),
    icms_destacado: n(total.vICMS),
    base_icms_st: n(total.vBCST),
    icms_st_destacado: n(total.vST),
    itens,
    warnings,
  };
}

/**
 * Calcula SHA-256 hex de uma string. Usa Web Crypto disponível no Worker e no browser.
 */
export async function sha256Hex(data: string): Promise<string> {
  const enc = new TextEncoder().encode(data);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}