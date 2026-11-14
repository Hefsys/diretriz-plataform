import { describe, expect, it } from "vitest";
import { parseXmlDoc } from "./xml-doc";
import { resolverCampo, resolverCamposXml } from "./resolver-campos-xml";
import type { CampoXmlDef } from "./campos-xml";

const base: CampoXmlDef = {
  id: "1",
  codigo: "campo",
  label: "Campo",
  descricao: null,
  escopo: "nota",
  tipo: "moeda",
  estrategia: "caminho",
  caminho: null,
  origem_texto: null,
  padrao_regex: null,
  grupo_captura: 1,
  agregacao: null,
  campo_fallback_id: null,
  xml_amostra_path: null,
  valor_esperado: null,
  sistema: true,
  ativo: true,
  ordem: 1,
};

const campo = (over: Partial<CampoXmlDef>): CampoXmlDef => ({ ...base, ...over });

const XML = `<?xml version="1.0"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe><infNFe Id="NFe123">
    <ide><nNF>4567</nNF></ide>
    <det nItem="1">
      <prod><NCM>85071090</NCM><xProd>BATERIA A</xProd><qCom>10</qCom><vProd>1000.00</vProd></prod>
      <infAdProd>BATERIA 60AH #13,5KG# LOTE 1</infAdProd>
    </det>
    <det nItem="2">
      <prod><NCM>85071090</NCM><xProd>BATERIA B</xProd><qCom>5</qCom><vProd>4000.00</vProd></prod>
      <infAdProd>BATERIA 100AH PESO UNITARIO: 19,8 KG</infAdProd>
    </det>
    <total><ICMSTot><vProd>5000.00</vProd><vFrete>250.50</vFrete><vICMS>600.00</vICMS></ICMSTot></total>
    <transp><vol><pesoB>300.00</pesoB><pesoL>290.00</pesoL></vol></transp>
  </infNFe></NFe>
</nfeProc>`;

const doc = parseXmlDoc(XML);

describe("campos por caminho", () => {
  it("lê valor da nota ignorando namespace", () => {
    const c = campo({ caminho: "total>ICMSTot>vFrete" });
    expect(resolverCampo(c, doc, [c])).toBeCloseTo(250.5, 2);
  });

  it("devolve null quando o caminho não existe", () => {
    const c = campo({ caminho: "total>ICMSTot>vSeguroInexistente" });
    expect(resolverCampo(c, doc, [c])).toBeNull();
  });
});

describe("agregações de campos por produto", () => {
  const porItem = (agregacao: CampoXmlDef["agregacao"]) =>
    campo({ escopo: "item", caminho: "det>prod>vProd", agregacao });

  it("soma", () => {
    const c = porItem("soma");
    expect(resolverCampo(c, doc, [c])).toBe(5000);
  });
  it("média", () => {
    const c = porItem("media");
    expect(resolverCampo(c, doc, [c])).toBe(2500);
  });
  it("primeiro", () => {
    const c = porItem("primeiro");
    expect(resolverCampo(c, doc, [c])).toBe(1000);
  });
  it("produto de maior valor", () => {
    const c = campo({ escopo: "item", caminho: "det>prod>qCom", agregacao: "item_predominante" });
    expect(resolverCampo(c, doc, [c])).toBe(5);
  });
});

describe("ICMS por item (curinga no CST)", () => {
  const XML_CST = `<?xml version="1.0"?>
  <nfeProc><NFe><infNFe>
    <det nItem="1"><prod><vProd>100</vProd></prod><imposto><ICMS><ICMS00><vICMS>12.00</vICMS></ICMS00></ICMS></imposto></det>
    <det nItem="2"><prod><vProd>200</vProd></prod><imposto><ICMS><ICMS20><vICMS>8.00</vICMS></ICMS20></ICMS></imposto></det>
    <total><ICMSTot><vICMS>20.00</vICMS></ICMSTot></total>
  </infNFe></NFe></nfeProc>`;
  const docCst = parseXmlDoc(XML_CST);
  const icmsItem = campo({
    codigo: "icms_destacado",
    escopo: "item",
    caminho: "det>imposto>ICMS>*>vICMS",
    agregacao: "soma",
  });

  it("soma o vICMS de cada item, mesmo com CSTs diferentes", () => {
    expect(resolverCampo(icmsItem, docCst, [icmsItem])).toBe(20);
  });

  it("devolve o valor do próprio item quando o doc tem um único det", () => {
    const umDet = parseXmlDoc(
      `<NFe><det><prod><vProd>100</vProd></prod><imposto><ICMS><ICMS00><vICMS>12.00</vICMS></ICMS00></ICMS></imposto></det></NFe>`,
    );
    expect(resolverCampo(icmsItem, umDet, [icmsItem])).toBe(12);
  });
});

describe("texto livre (peso em infAdProd)", () => {
  const pesoUnitario = campo({
    codigo: "peso_unitario",
    escopo: "item",
    estrategia: "texto_livre",
    origem_texto: "det>infAdProd",
    agregacao: "item_predominante",
    padrao_regex: JSON.stringify([
      "#\\s*([0-9]+(?:[.,][0-9]+)?)\\s*KG\\s*#",
      "PESO\\s*UNIT[A-Z]*[^0-9]{0,12}([0-9]+(?:[.,][0-9]+)?)",
      "([0-9]+(?:[.,][0-9]+)?)\\s*KG",
    ]),
  });

  it("usa o peso do produto de maior valor", () => {
    expect(resolverCampo(pesoUnitario, doc, [pesoUnitario])).toBeCloseTo(19.8, 2);
  });

  it("lê o formato #13,5KG#", () => {
    const c = campo({ ...pesoUnitario, agregacao: "primeiro" });
    expect(resolverCampo(c, doc, [c])).toBeCloseTo(13.5, 2);
  });

  it("lê 14.2 KG e #16.8KG#", () => {
    const d = parseXmlDoc(
      `<NFe><det><prod><vProd>1</vProd></prod><infAdProd>PECA 14.2 KG</infAdProd></det>
       <det><prod><vProd>0.5</vProd></prod><infAdProd>PECA #16.8KG#</infAdProd></det></NFe>`,
    );
    const soma = campo({ ...pesoUnitario, agregacao: "soma" });
    expect(resolverCampo(soma, d, [soma])).toBeCloseTo(31, 2);
  });
});

describe("fallback e catálogo", () => {
  it("cai no campo de fallback quando não encontra o valor", () => {
    const fallback = campo({ id: "fb", codigo: "peso_bruto", caminho: "transp>vol>pesoB" });
    const principal = campo({
      id: "pr",
      codigo: "peso_alvo",
      caminho: "prod>pesoInexistente",
      campo_fallback_id: "fb",
    });
    expect(resolverCampo(principal, doc, [principal, fallback])).toBe(300);
  });

  it("resolve o catálogo inteiro e não inventa chaves", () => {
    const catalogo = [
      campo({ id: "a", codigo: "valor_produtos", caminho: "total>ICMSTot>vProd" }),
      campo({ id: "b", codigo: "inativo", caminho: "total>ICMSTot>vICMS", ativo: false }),
    ];
    const valores = resolverCamposXml(doc, catalogo);
    expect(valores["valor_produtos"]).toBe(5000);
    expect("inativo" in valores).toBe(false);
    expect("qualquer_outro" in valores).toBe(false);
  });

  it("campo derivado combina outros campos", () => {
    const bruto = campo({ id: "pb", codigo: "peso_bruto", caminho: "transp>vol>pesoB" });
    const qtd = campo({
      id: "q", codigo: "quantidade_itens", escopo: "item",
      caminho: "det>prod>qCom", agregacao: "soma",
    });
    const medio = campo({
      id: "m", codigo: "peso_unitario_medio",
      estrategia: "derivado", caminho: "peso_bruto / quantidade_itens",
    });
    expect(resolverCampo(medio, doc, [bruto, qtd, medio])).toBeCloseTo(20, 6);
  });
});
