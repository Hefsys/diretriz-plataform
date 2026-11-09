import { describe, expect, it } from "vitest";
import { calcularMes, calcularTrimestre, mesVazio, type MesEntrada } from "@/lib/fiscal/lucro-presumido";

const m = (p: Partial<MesEntrada>): MesEntrada => ({ ...mesVazio(), ...p });

// Valores da planilha VILLE MARAGOGI 2026 (1º trimestre)
const t1: [MesEntrada, MesEntrada, MesEntrada] = [
  m({ rec_mercadorias: 252799.45, rec_monofasico: 35601, rec_servicos: 1583830.16, rec_aplicacoes: 3035.07 }),
  m({ rec_mercadorias: 131222.15, rec_monofasico: 17966.5, rec_servicos: 856691.53, rec_aplicacoes: 4709.78 }),
  m({ rec_mercadorias: 131092.25, rec_monofasico: 20892, rec_servicos: 647653.33, rec_aplicacoes: 142497.15, ret_ir: 26584.38 }),
];

describe("Lucro Presumido", () => {
  it("IR a pagar do 1º trimestre igual à planilha", () => {
    expect(calcularTrimestre(t1).irPagar).toBeCloseTo(280908.45, 1);
  });
  it("CSLL a pagar do 1º trimestre igual à planilha", () => {
    expect(calcularTrimestre(t1).csllPagar).toBeCloseTo(108828.61, 1);
  });
  it("PIS 0,65% e COFINS 3% sem monofásico (janeiro)", () => {
    const r = calcularMes(t1[0], 0.03);
    expect(r.pis).toBeCloseTo(11938.09, 1);
    expect(r.cofins).toBeCloseTo(55098.89, 1);
  });
  it("ISS usa a alíquota da empresa", () => {
    expect(calcularMes(t1[0], 0.03).iss).toBeCloseTo(47514.9, 1);
    expect(calcularMes(t1[0], 0.05).iss).toBeCloseTo(79191.51, 1);
  });
  it("sem excedente abaixo de R$ 1.250.000 no trimestre", () => {
    const r = calcularTrimestre([m({ rec_servicos: 1_000_000 })]);
    expect(r.excedente).toBe(0);
    expect(r.bcIr32).toBeCloseTo(320000);
  });
});

it("Receita Exterior entra em IRPJ/CSLL (8%/12%) e não em PIS/COFINS/ISS", () => {
  const r = calcularMes({ ...mesVazio(), rec_exterior: 100000 }, 0.03);
  expect(r.pis).toBe(0);
  expect(r.cofins).toBe(0);
  expect(r.iss).toBe(0);
  const t = calcularTrimestre([{ ...mesVazio(), rec_exterior: 100000 }, mesVazio(), mesVazio()]);
  expect(t.baseIr).toBeCloseTo(8000, 2);
  expect(t.baseCsll).toBeCloseTo(12000, 2);
});
