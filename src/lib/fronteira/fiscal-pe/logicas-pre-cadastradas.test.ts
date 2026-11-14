import { describe, expect, it } from "vitest";
import { avaliarFluxoDetalhado, fluxoValido } from "../fluxo-calculo";
import { LOGICAS_PRE_CADASTRADAS } from "./logicas-pre-cadastradas";

describe("Lógicas pré-cadastradas reproduzem os exemplos oficiais da SEFAZ-PE", () => {
  it("todas as lógicas têm fluxo válido e código único", () => {
    const codigos = new Set(LOGICAS_PRE_CADASTRADAS.map((l) => l.codigo));
    expect(codigos.size).toBe(LOGICAS_PRE_CADASTRADAS.length);
    for (const l of LOGICAS_PRE_CADASTRADAS) expect(fluxoValido(l.fluxo)).toBe(true);
  });
  const casos = LOGICAS_PRE_CADASTRADAS.flatMap((l) => l.casos.map((c) => [l.codigo, c.item, l, c] as const));
  it.each(casos)("%s · exemplo %s", (_cod, _item, l, c) => {
    const r = avaliarFluxoDetalhado(l.fluxo, c.v);
    expect(r.valido).toBe(true);
    expect(Math.round(r.resultado * 100) / 100).toBeCloseTo(c.esperado, 2);
  });
});

