import { describe, it, expect } from "vitest";
import { resolverFluxoNcm, type OverrideFluxoNcm } from "./resolver-fluxo-ncm";
import type { Fluxo } from "./fluxo-calculo";

const padrao: Fluxo = [
  { id: "a", tipo: "operando", origem: "numero", valor: 1 },
];
const proprio: Fluxo = [
  { id: "b", tipo: "operando", origem: "numero", valor: 2 },
];
const invalido = [{ id: "c", tipo: "operador", op: "+" }];

const ov = (o: Partial<OverrideFluxoNcm> & { ncm: string }): OverrideFluxoNcm => ({
  fluxo: proprio,
  vigencia_inicio: "2020-01-01",
  vigencia_fim: null,
  ...o,
});

const data = "2026-01-15";

describe("resolverFluxoNcm", () => {
  it("sem override retorna o padrão", () => {
    expect(resolverFluxoNcm({ ncm: "85071000", fluxoPadrao: padrao, overrides: [], dataReferencia: data }))
      .toEqual(padrao);
  });

  it("match exato de 8 dígitos", () => {
    expect(resolverFluxoNcm({
      ncm: "85071000", fluxoPadrao: padrao,
      overrides: [ov({ ncm: "85071000" })], dataReferencia: data,
    })).toEqual(proprio);
  });

  it("fallback para prefixo de 6", () => {
    expect(resolverFluxoNcm({
      ncm: "85071000", fluxoPadrao: padrao,
      overrides: [ov({ ncm: "850710" })], dataReferencia: data,
    })).toEqual(proprio);
  });

  it("fallback para prefixo de 4", () => {
    expect(resolverFluxoNcm({
      ncm: "85071000", fluxoPadrao: padrao,
      overrides: [ov({ ncm: "8507" })], dataReferencia: data,
    })).toEqual(proprio);
  });

  it("prefere o mais específico", () => {
    const especifico: Fluxo = [{ id: "d", tipo: "operando", origem: "numero", valor: 9 }];
    expect(resolverFluxoNcm({
      ncm: "85071000", fluxoPadrao: padrao,
      overrides: [ov({ ncm: "8507" }), ov({ ncm: "85071000", fluxo: especifico })],
      dataReferencia: data,
    })).toEqual(especifico);
  });

  it("ignora vigência expirada", () => {
    expect(resolverFluxoNcm({
      ncm: "85071000", fluxoPadrao: padrao,
      overrides: [ov({ ncm: "85071000", vigencia_fim: "2025-12-31" })],
      dataReferencia: data,
    })).toEqual(padrao);
  });

  it("ignora vigência futura", () => {
    expect(resolverFluxoNcm({
      ncm: "85071000", fluxoPadrao: padrao,
      overrides: [ov({ ncm: "85071000", vigencia_inicio: "2027-01-01" })],
      dataReferencia: data,
    })).toEqual(padrao);
  });

  it("fluxo nulo cai para o padrão", () => {
    expect(resolverFluxoNcm({
      ncm: "85071000", fluxoPadrao: padrao,
      overrides: [ov({ ncm: "85071000", fluxo: null })], dataReferencia: data,
    })).toEqual(padrao);
  });

  it("fluxo inválido cai para o padrão", () => {
    expect(resolverFluxoNcm({
      ncm: "85071000", fluxoPadrao: padrao,
      overrides: [ov({ ncm: "85071000", fluxo: invalido })], dataReferencia: data,
    })).toEqual(padrao);
  });
});
