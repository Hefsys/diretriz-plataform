import { describe, expect, it } from "vitest";
import {
  calcularAntecipacao,
  calcularAntecipacaoInternaVarejoAlimentar,
  calcularIcmsImportacao,
  incluirImpostoPorDentro,
  type EntradaCalculo,
} from "./motor-antecipacao-pe";

const base1000: EntradaCalculo = {
  dataDocumento: "2026-10-01",
  destinacao: "COMERCIALIZACAO",
  adquirente: { regime: "NORMAL", atividade: "VAREJO", sujeitoAntecipacao: true },
  valores: { produtos: 1000, icmsOrigem: 120 },
  aliquotaInterestadual: 12,
  aliquotaInterna: 20.5,
};

describe("motor oficial SEFAZ-PE", () => {
  it("uso e consumo: base por dentro × diferença de alíquotas", () => {
    const r = calcularAntecipacao({ ...base1000, destinacao: "USO_CONSUMO", adquirente: { ...base1000.adquirente, sujeitoAntecipacao: false } });
    // 880 ÷ 0,795 = 1106,9182…; × 8,5% = 94,09
    expect(r.valor).toBe(94.09);
    expect(r.regraId).toBe("DIFAL_USO_ATIVO");
    expect(r.recolhimento.codigoReceita).toBe("057-4");
    expect(r.passos.every((p) => p.fundamento || p.passo.startsWith("="))).toBe(true);
  });

  it("comercialização regime normal sem MVA: ICMS total − crédito", () => {
    const r = calcularAntecipacao(base1000);
    // 1106,9182 × 20,5% = 226,92; − 120 = 106,92
    expect(r.valor).toBe(106.92);
    expect(r.regraId).toBe("ANTECIPACAO_PARCIAL");
    expect(r.recolhimento.codigoReceita).toBe("058-2");
  });

  it("Simples ME regular (339-A): carga tributária da tabela 2.3.7.2.2", () => {
    const r = calcularAntecipacao({
      ...base1000,
      adquirente: { regime: "SIMPLES", porte: "ME", atividade: "VAREJO", sujeitoAntecipacao: true, regular339A: true },
    });
    // 1106,9182 × 5,31% = 58,78
    expect(r.valor).toBe(58.78);
    expect(r.regraId).toBe("SN_CARGA_COMERC");
  });

  it("Simples sem porte informado: erro explícito", () => {
    expect(() =>
      calcularAntecipacao({
        ...base1000,
        adquirente: { regime: "SIMPLES", atividade: "VAREJO", sujeitoAntecipacao: true },
      }),
    ).toThrow(/porte/i);
  });

  it("software não personalizado: 1% sem MVA", () => {
    const r = calcularAntecipacao({ ...base1000, produto: { tipo: "SOFTWARE" } });
    expect(r.valor).toBe(11.07);
    expect(r.regraId).toBe("SOFTWARE_1PCT");
  });

  it("leite: MVA de 35% (art. 349)", () => {
    const r = calcularAntecipacao({ ...base1000, produto: { tipo: "LEITE" } });
    // base 1106,9182 × 1,35 = 1494,3396; × 20,5% = 306,34; − 120 = 186,34
    expect(r.valor).toBe(186.34);
    expect(r.regraId).toBe("LEITE_MVA35");
  });

  it("cada passo com fundamento carrega informativo, item e dispositivo", () => {
    const r = calcularAntecipacao(base1000);
    const comFundamento = r.passos.filter((p) => p.fundamento);
    expect(comFundamento.length).toBeGreaterThan(0);
    for (const p of comFundamento) {
      expect(p.fundamento?.informativo.length ?? 0).toBeGreaterThan(0);
      expect(p.fundamento?.item.length ?? 0).toBeGreaterThan(0);
      expect(p.fundamento?.dispositivo.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("incluirImpostoPorDentro rejeita alíquota inválida", () => {
    expect(() => incluirImpostoPorDentro(100, 0)).toThrow();
    expect(() => incluirImpostoPorDentro(100, 100)).toThrow();
  });

  it("antecipação interna do varejo alimentar: 2,5% código 100-6", () => {
    const r = calcularAntecipacaoInternaVarejoAlimentar(10000);
    expect(r.valor).toBe(250);
    expect(r.recolhimento.codigoReceita).toBe("100-6");
  });

  it("importação: base por dentro × alíquota, código 017-5", () => {
    const r = calcularIcmsImportacao(1000, 20.5);
    // 1000 ÷ 0,795 = 1257,8616; × 20,5% = 257,86
    expect(r.valor).toBe(257.86);
    expect(r.regraId).toBe("IMPORTACAO");
    expect(r.recolhimento.codigoReceita).toBe("017-5");
  });
});
