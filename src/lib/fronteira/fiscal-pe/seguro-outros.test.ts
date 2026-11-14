import { describe, expect, it } from "vitest";
import { parsearNfeXml } from "../nfe-parser";
import { avisoSeguroOutrosAusentes, montarEntradaOficial, type ContextoEntrada } from "./entrada-motor";

const chave = "2".repeat(44);
const det = (n: number, extras: string) =>
  `<det nItem="${n}"><prod><NCM>85071010</NCM><CFOP>2102</CFOP><vProd>1000</vProd>${extras}</prod><imposto><ICMS><ICMS00><CST>00</CST><pICMS>12</pICMS><vICMS>120</vICMS></ICMS00></ICMS></imposto></det>`;
const xml = `<NFe><infNFe Id="NFe${chave}"><ide><nNF>1</nNF><dhEmi>2026-10-01T09:00:00-03:00</dhEmi></ide><emit><CNPJ>1</CNPJ></emit>${det(1, "<vSeg>15.50</vSeg><vOutro>7.25</vOutro>")}${det(2, "")}<total><ICMSTot><vSeg>15.50</vSeg><vOutro>7.25</vOutro></ICMSTot></total></infNFe></NFe>`;

const ctx: ContextoEntrada = { data_referencia: "2026-10-01", uf_origem: "SP", perfil: { regime: "Lucro Real", aliquota_interna_default: 20.5, flags: { tipo_empresa: "Varejista" } }, aliquotas_internas: [] };

describe("seguro e outras despesas por item", () => {
  it("parser lê vSeg e vOutro de det/prod", () => {
    const nf = parsearNfeXml(xml);
    expect(nf.itens[0].valor_seguro_item).toBe(15.5);
    expect(nf.itens[0].valor_outros_item).toBe(7.25);
  });
  it("parser grava zero quando o item não tem vSeg/vOutro", () => {
    const nf = parsearNfeXml(xml);
    expect(nf.itens[1].valor_seguro_item).toBe(0);
    expect(nf.itens[1].valor_outros_item).toBe(0);
  });
  it("entrada do motor envia seguro e outras despesas", () => {
    const e = montarEntradaOficial({ ncm: "85071010", cfop: "2102", valor_total_item: 1000, valor_icms_item: 120, aliquota_icms_origem: 12, valor_seguro_item: 15.5, valor_outros_item: 7.25 }, ctx, "ANTECIPACAO");
    expect(e.valores.seguro).toBe(15.5);
    expect(e.valores.outras).toBe(7.25);
  });
  it("avisa quando a nota tem vSeg/vOutro no total e zero nos itens", () => {
    expect(avisoSeguroOutrosAusentes({ valor_seguro: 15.5, valor_outros: 0 }, [{ valor_seguro_item: 0 }])).toContain("reimporte o XML");
    expect(avisoSeguroOutrosAusentes({ valor_seguro: 0, valor_outros: 7.25 }, [{ valor_outros_item: 0 }])).toContain("outras despesas");
  });
  it("não avisa quando os itens já têm os valores", () => {
    expect(avisoSeguroOutrosAusentes({ valor_seguro: 15.5, valor_outros: 7.25 }, [{ valor_seguro_item: 15.5, valor_outros_item: 7.25 }])).toBeNull();
  });
});
