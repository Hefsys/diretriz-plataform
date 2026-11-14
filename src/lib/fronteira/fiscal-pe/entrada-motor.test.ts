import { describe, expect, it } from "vitest";
import { aliquotaInterestadualItem, aliquotaInternaItem, montarEntradaOficial, sujeitoAntecipacaoPadrao, type ContextoEntrada, type ItemEntrada } from "./entrada-motor";
import { calcularItem, type ContextoCalculo } from "../motor-calculo";
import { calcularAntecipacao } from "./motor-antecipacao-pe";
import { calcularPorIcmsAntecipado, calcularPorUsoConsumo, parseXMLNFe } from "../fronteiraFiscal";

const item: ItemEntrada = { numero_item: 1, ncm: "85071010", cfop: "2556", valor_total_item: 1000, valor_icms_item: 120, aliquota_icms_origem: 12 };
const ctx: ContextoEntrada = { data_referencia: "2026-10-01", uf_origem: "SP", perfil: { regime: "Lucro Real", aliquota_interna_default: 20.5, flags: { tipo_empresa: "Varejista" } }, aliquotas_internas: [] };
const xml = (data = "<dhEmi>2026-10-01T09:00:00-03:00</dhEmi>", origem = "0", uf = "SP") => `<NFe><infNFe Id="NFe123"><ide><nNF>1</nNF>${data}</ide><emit><CNPJ>1</CNPJ><enderEmit><UF>${uf}</UF></enderEmit></emit><dest><CNPJ>2</CNPJ></dest><det nItem="1"><prod><NCM>85071010</NCM><CFOP>2556</CFOP><vProd>1000</vProd><qCom>1</qCom></prod><imposto><ICMS><ICMS00><orig>${origem}</orig><CST>00</CST><pICMS>12</pICMS><vICMS>120</vICMS></ICMS00></ICMS></imposto></det><total><ICMSTot><vProd>1000</vProd><vICMS>120</vICMS></ICMSTot></total></infNFe></NFe>`;

describe("entrada compartilhada do motor oficial", () => {
  it.each([1, 2, 3, 8])("origem %s usa 4%%", origem => expect(aliquotaInterestadualItem({ ...item, origem_mercadoria: origem }, "SP")).toBe(4));
  it("CSOSN 102 não é origem importada", () => expect(aliquotaInterestadualItem({ ...item, aliquota_icms_origem: 0, cst_csosn: "102" }, "SP")).toBe(7));
  it("sem destaque usa UF", () => {
    expect(aliquotaInterestadualItem({ ...item, aliquota_icms_origem: 0 }, "BA")).toBe(12);
    expect(aliquotaInterestadualItem({ ...item, aliquota_icms_origem: 0 }, "SP")).toBe(7);
  });
  it("sem origem determinável bloqueia", () => expect(() => aliquotaInterestadualItem({ ...item, aliquota_icms_origem: 0 }, "")).toThrow(/determinar/));
  it("Simples sem porte não vira normal", () => expect(() => montarEntradaOficial(item, { ...ctx, perfil: { ...ctx.perfil, regime: "Simples Nacional", aliquota_interna_default: 20.5, porte: null } }, "DIFAL")).toThrow("Informe o porte (MEI, ME ou EPP) no perfil fiscal da empresa"));
  it.each(["Microempreendedor Individual (MEI)", "Microempresa (ME)", "Empresa de Pequeno Porte (EPP)"])("reconhece porte %s", porte => {
    const e = montarEntradaOficial(item, { ...ctx, perfil: { ...ctx.perfil, regime: "Simples Nacional", aliquota_interna_default: 20.5, porte } }, "DIFAL");
    expect(e.adquirente.porte).toBe(porte.includes("MEI") ? "MEI" : porte.includes("EPP") ? "EPP" : "ME");
    expect(e.adquirente.regime).toBe("SIMPLES");
  });
  it.each(["Varejista", "Atacadista", "Indústria", "Equiparado a Indústria"])("%s é sujeito por padrão", tipo_empresa => expect(sujeitoAntecipacaoPadrao({ tipo_empresa })).toBe(true));
  it.each(["USO_CONSUMO", "ATIVO"])("%s não sujeito recolhe 057-4 até dia 15", destinacao_padrao => {
    const entrada = montarEntradaOficial({ ...item, cfop: "2556" }, { ...ctx, perfil: { ...ctx.perfil, regime: "Lucro Real", aliquota_interna_default: 20.5, flags: { tipo_empresa: "Varejista", sujeito_antecipacao: false, destinacao_padrao } } }, "DIFAL");
    const r = calcularAntecipacao(entrada);
    expect(r.recolhimento.codigoReceita).toBe("057-4");
    expect(r.recolhimento.prazo).toContain("dia 15");
  });
  it("sujeito recolhe 058-2", () => expect(calcularAntecipacao(montarEntradaOficial(item, ctx, "DIFAL")).recolhimento.codigoReceita).toBe("058-2"));
  it("NCM vigente supera perfil e tabela genérica", () => {
    const c = { ...ctx, aliquotas_internas: [{ ncm: null, aliquota: 20.5, fecp: 0, vigencia_inicio: "2020-01-01", vigencia_fim: null }, { ncm: "8507", aliquota: 18, fecp: 0, vigencia_inicio: "2020-01-01", vigencia_fim: "2026-10-01" }, { ncm: "8507", aliquota: 25, fecp: 0, vigencia_inicio: "2026-10-02", vigencia_fim: null }] };
    expect(aliquotaInternaItem(item.ncm, c)).toBe(18);
    expect(aliquotaInternaItem(item.ncm, { ...c, data_referencia: "2026-10-02" })).toBe(25);
  });
  it.each(["<dhEmi>2026-10-01T23:30:00-03:00</dhEmi>", "<dEmi>2026-10-01</dEmi>"])("preserva emissão do XML %s", data => expect(parseXMLNFe(xml(data))?.data_emissao).toBe("2026-10-01"));
  it("os dois caminhos usam a mesma entrada", () => {
    const nota = parseXMLNFe(xml());
    if (!nota) throw new Error("XML inválido");
    const m = calcularPorUsoConsumo(nota, { difal_percentual: 99 }, ctx);
    expect(m.icmsAntecipado).toBe(calcularAntecipacao(montarEntradaOficial(item, ctx, "DIFAL")).valor);
    expect(m.dataDocumento).toBe("2026-10-01");
    expect(m.recolhimento?.codigoReceita).toBe("058-2");
  });
  it("sem grupo DIFAL usa alíquota do perfil, não 20,5 fixa", () => {
    const nota = parseXMLNFe(xml());
    if (!nota) throw new Error("XML inválido");
    const m = calcularPorUsoConsumo(nota, { difal_percentual: 99 }, { ...ctx, perfil: { regime: "Lucro Real", aliquota_interna_default: 18, flags: { tipo_empresa: "Varejista" } } });
    expect(m.aliquotaInternaPct).toBe(18);
    expect(m.icmsAntecipado).toBe(64.39);
  });
  it("nota do Simples sem porte permanece pendente", () => {
    const nota = parseXMLNFe(xml());
    if (!nota) throw new Error("XML inválido");
    const m = calcularPorIcmsAntecipado(nota, { aliquota_interna: 20.5 }, { ...ctx, perfil: { regime: "Simples Nacional", aliquota_interna_default: 20.5 } });
    expect(m.suportado).toBe(false);
    expect(m.motivoNaoSuportado).toBe("Informe o porte (MEI, ME ou EPP) no perfil fiscal da empresa");
  });
  it("o caminho por item e a auditoria usam o mesmo perfil Simples e flags", () => {
    const nota = parseXMLNFe(xml());
    if (!nota) throw new Error("XML inválido");
    const c: ContextoCalculo = { ...ctx, uf_destino: "PE", perfil: { regime: "Simples Nacional", porte: "Microempresa (ME)", aliquota_interna_default: 20.5, flags: { tipo_empresa: "Atacadista", regular_339a: true, sujeito_antecipacao: false } }, regras: [], mvas: [], pautas: [], ncms_regimes: [], excecoes: [], creditos_sn: [] };
    const r = calcularItem({ ...item, numero_item: 1, ncm: "85071010", cfop: "2556", quantidade: 1, valor_unitario: 1000 }, c);
    const m = calcularPorUsoConsumo(nota, { difal_percentual: 99 }, c);
    expect(r.icms_calculado_item).toBe(58.78);
    expect(m.icmsAntecipado).toBe(r.icms_calculado_item);
    expect(m.recolhimento?.codigoReceita).toBe("057-4");
    expect(r.regra_fiscal_id).toBe("SN_CARGA_USO_ATIVO");
  });
  it("auditoria sem origem fica pendente", () => {
    const nota = parseXMLNFe(xml(undefined, "", "").replace("<pICMS>12</pICMS>", ""));
    if (!nota) throw new Error("XML inválido");
    const m = calcularPorUsoConsumo(nota, { difal_percentual: 10 }, ctx);
    expect(m.suportado).toBe(false);
    expect(m.motivoNaoSuportado).toContain("determinar a alíquota interestadual");
  });
  it("sem emissão não usa hoje", () => {
    const nota = parseXMLNFe(xml(""));
    if (!nota) throw new Error("XML inválido");
    expect(calcularPorUsoConsumo(nota, { difal_percentual: 10 }, ctx).suportado).toBe(false);
  });
});