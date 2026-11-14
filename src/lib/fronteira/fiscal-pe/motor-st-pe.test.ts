import { describe, expect, it } from "vitest";
import { calcularStDestinatario, type EntradaST } from "./motor-st-pe";

// Valores sintéticos: nenhum dado de nota real fica no código.
const base = (x: Partial<EntradaST> & { valores: EntradaST["valores"] }): EntradaST => ({
  dataDocumento: "2026-08-01", ncm: "00000000", mva: 45, aliquotaInterna: 20.5, aliquotaInterestadual: 7, remetenteSimples: false, ...x,
});

describe("ICMS-ST pago pelo destinatário", () => {
  it("fornecedor do regime normal: 1.000 × 1,45 × 20,5% − 70 = 227,25", () => {
    const r = calcularStDestinatario(base({ valores: { produtos: 1000, icmsDestacado: 70 } }));
    expect(r.valor).toBe(227.25);
    expect(r.credito).toBe(70);
    expect(r.avisos).toHaveLength(0);
  });
  it("frete entra na base, mas o crédito é só sobre os produtos: (300 + 25) × 1,35 × 20,5% − 21 = 68,94", () => {
    const r = calcularStDestinatario(base({ mva: 35, remetenteSimples: true, valores: { produtos: 300, frete: 25, icmsDestacado: 0 } }));
    expect(r.valor).toBe(68.94);
    expect(r.credito).toBe(21);
    expect(r.avisos.join(" ")).toContain("Simples");
  });
  it("mercadoria importada a 4%: 600 × 1,45 × 20,5% − 24 = 154,35", () => {
    const r = calcularStDestinatario(base({ aliquotaInterestadual: 4, valores: { produtos: 600, icmsDestacado: 24 } }));
    expect(r.valor).toBe(154.35);
  });
  it("avisa quando o ICMS destacado difere do crédito pela alíquota interestadual", () => {
    const r = calcularStDestinatario(base({ valores: { produtos: 1000, icmsDestacado: 120 } }));
    expect(r.credito).toBe(70);
    expect(r.avisos.join(" ")).toContain("difere");
  });
  it("não calcula sem MVA", () => {
    expect(() => calcularStDestinatario(base({ mva: Number.NaN, valores: { produtos: 100, icmsDestacado: 7 } }))).toThrow(/MVA/);
  });
  it("não deixa o imposto negativo", () => {
    const r = calcularStDestinatario(base({ mva: 0, aliquotaInterna: 7, valores: { produtos: 100, icmsDestacado: 7 } }));
    expect(r.valor).toBe(0);
  });
});

