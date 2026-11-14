import { describe, expect, it } from "vitest";
import { parsearNfeXml } from "./nfe-parser";

const xml = `<?xml version="1.0"?>
<nfeProc><NFe><infNFe Id="NFe${"2".repeat(44)}">
  <ide><nNF>10</nNF><dhEmi>2026-03-10T09:00:00-03:00</dhEmi><tpNF>1</tpNF></ide>
  <emit><CNPJ>11111111000111</CNPJ><enderEmit><UF>SP</UF></enderEmit></emit>
  <dest><CNPJ>22222222000122</CNPJ></dest>
  <det nItem="1">
    <prod><NCM>85071010</NCM><CFOP>6102</CFOP><qCom>1</qCom><vProd>1000.00</vProd><vSeg>12.34</vSeg></prod>
    <imposto><ICMS><ICMS00><orig>1</orig><CST>00</CST><pICMS>4.00</pICMS><vICMS>40.00</vICMS></ICMS00></ICMS></imposto>
  </det>
  <det nItem="2">
    <prod><NCM>85071010</NCM><CFOP>6102</CFOP><qCom>1</qCom><vProd>10.00</vProd></prod>
    <imposto><ICMS><ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS></imposto>
  </det>
  <total><ICMSTot><vSeg>12.34</vSeg></ICMSTot></total>
</infNFe></NFe></nfeProc>`;

describe("parsearNfeXml", () => {
  it("lê o seguro de cada item", () => {
    const nfe = parsearNfeXml(xml);
    expect(nfe.data_emissao).toBe("2026-03-10");
    expect(nfe.itens.map((i) => [i.valor_seguro_item, i.cst_csosn])).toEqual([
      [12.34, "00"],
      [0, "102"],
    ]);
  });
});
