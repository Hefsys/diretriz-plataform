import { describe, expect, it } from "vitest";
import { CASOS_OFICIAIS } from "./casos-oficiais-sefaz";
import { calcularAntecipacao, calcularAntecipacaoInternaVarejoAlimentar, calcularIcmsImportacao } from "./motor-antecipacao-pe";

describe("Exemplos oficiais SEFAZ-PE — Base de Cálculo nas Entradas Interestaduais, item 5", () => {
  it.each(CASOS_OFICIAIS.map((k) => [k.item, k] as const))("%s", (_item, k) => {
    const r = calcularAntecipacao(k.entrada);
    expect(r.valor).toBeCloseTo(k.esperado, 2);
    // todo passo com valor relevante precisa ter fundamento rastreável
    expect(r.passos.some((p) => p.fundamento)).toBe(true);
  });
});

describe("Regras complementares", () => {
  it("antecipação interna de hiper/supermercado: 2,5% do valor total, código 100-6", () => {
    const r = calcularAntecipacaoInternaVarejoAlimentar(10_000);
    expect(r.valor).toBe(250);
    expect(r.recolhimento.codigoReceita).toBe("100-6");
  });
  it("importação: divisor acompanha a alíquota (18% → ÷ 0,82)", () => {
    const r = calcularIcmsImportacao(8200, 18);
    expect(r.baseCalculo).toBe(10000);
    expect(r.valor).toBe(1800);
  });
  it("uso e consumo deduz desconto incondicional (RC 57/2022)", () => {
    const base = { dataDocumento: "2026-10-01", destinacao: "USO_CONSUMO" as const, aliquotaInterestadual: 7, aliquotaInterna: 20.5,
      adquirente: { regime: "NORMAL" as const, atividade: "VAREJO" as const, sujeitoAntecipacao: true } };
    const sem = calcularAntecipacao({ ...base, valores: { produtos: 1000, icmsOrigem: 70 } });
    const com = calcularAntecipacao({ ...base, valores: { produtos: 1000, descontoIncondicional: 100, icmsOrigem: 70 } });
    expect(com.valor).toBeLessThan(sem.valor);
  });
  it("comercialização NÃO deduz desconto (Lei 15.730/2016, art. 29, § 2º)", () => {
    const base = { dataDocumento: "2026-10-01", destinacao: "COMERCIALIZACAO" as const, aliquotaInterestadual: 7, aliquotaInterna: 20.5,
      adquirente: { regime: "NORMAL" as const, atividade: "VAREJO" as const, sujeitoAntecipacao: true } };
    const sem = calcularAntecipacao({ ...base, valores: { produtos: 1000, icmsOrigem: 70 } });
    const com = calcularAntecipacao({ ...base, valores: { produtos: 1000, descontoIncondicional: 100, icmsOrigem: 70 } });
    expect(com.valor).toBe(sem.valor);
  });
});
