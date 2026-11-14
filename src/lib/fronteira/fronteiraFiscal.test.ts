import { describe, expect, it } from "vitest";
import { calcularFluxoPorItem, parseXMLNFe } from "./fronteiraFiscal";
import type { CampoXmlDef } from "./campos-xml";
import type { Fluxo } from "./fluxo-calculo";

describe("conferência de ICMS por produto", () => {
  it("soma 5.818,62 e 5.818,61 com peso unitário 13,5 e ICMS do próprio item", () => {
    const itens = [756.96, 756.97].map((icms, i) => `<det nItem="${i + 1}"><prod><NCM>85071010</NCM><xProd>Bateria</xProd><qCom>120</qCom><vProd>10000</vProd></prod><imposto><ICMS><ICMS00><vICMS>${icms}</vICMS></ICMS00></ICMS></imposto><infAdProd>#13.5KG#</infAdProd></det>`).join("");
    const nota = parseXMLNFe(`<NFe><infNFe Id="NFe123"><ide><nNF>1</nNF></ide>${itens}<total><ICMSTot><vProd>20000</vProd><vICMS>1513.93</vICMS><vNF>20000</vNF></ICMSTot></total></infNFe></NFe>`);
    if (!nota) throw new Error("XML de teste inválido");
    const base: CampoXmlDef = { id: "", codigo: "", label: "", descricao: null, escopo: "item", tipo: "quantidade", estrategia: "caminho", caminho: null, origem_texto: null, padrao_regex: null, grupo_captura: 1, agregacao: "soma", campo_fallback_id: null, xml_amostra_path: null, valor_esperado: null, sistema: false, ativo: true, ordem: 1 };
    const campos: CampoXmlDef[] = [
      { ...base, id: "peso", codigo: "peso", estrategia: "texto_livre", origem_texto: "det>infAdProd", padrao_regex: "#([0-9.,]+)KG#" },
      { ...base, id: "qtd", codigo: "qtd", caminho: "det>prod>qCom" },
      { ...base, id: "icms", codigo: "icms", caminho: "det>imposto>ICMS>*>vICMS" },
    ];
    const fluxo: Fluxo = [
      { id: "1", tipo: "operando", origem: "xml", campo: "peso" },
      { id: "2", tipo: "operador", op: "x" }, { id: "3", tipo: "operando", origem: "numero", valor: 19.8 },
      { id: "4", tipo: "operador", op: "x" }, { id: "5", tipo: "operando", origem: "xml", campo: "qtd" },
      { id: "6", tipo: "operador", op: "x" }, { id: "7", tipo: "operando", origem: "percentual", valor: 20.5 },
      { id: "8", tipo: "operador", op: "-" }, { id: "9", tipo: "operando", origem: "xml", campo: "icms" },
    ];
    const resultado = calcularFluxoPorItem(nota, () => fluxo, campos);
    expect(resultado.formulaCodigo).toBe("FLUXO_VISUAL");
    expect(resultado.icmsAntecipado).toBeCloseTo(11637.23, 2);
    expect(resultado.trace?.filter(p => p.passo.startsWith("= ICMS do item")).map(p => p.valor)).toEqual([5818.62, 5818.61]);
  });
});