import { describe, expect, it } from "vitest";
import {
  avaliarFluxoDetalhado,
  fluxoValido,
  camposUsados,
  type Fluxo,
} from "./fluxo-calculo";

const num = (v: number): Fluxo[number] => ({
  id: `n${v}`, tipo: "operando", origem: "numero", valor: v,
});
const pct = (v: number): Fluxo[number] => ({
  id: `p${v}`, tipo: "operando", origem: "percentual", valor: v,
});
const xml = (c: string): Fluxo[number] => ({
  id: `x${c}`, tipo: "operando", origem: "xml", campo: c,
});
const op = (o: "+" | "-" | "x" | "/"): Fluxo[number] => ({
  id: `o${o}`, tipo: "operador", op: o,
});

const valor = (f: Fluxo, v: Record<string, number> = {}) =>
  avaliarFluxoDetalhado(f, v).resultado;

describe("avaliarFluxoDetalhado — esquerda para a direita", () => {
  it("ignora precedência matemática", () => {
    const fluxo: Fluxo = [
      xml("valor_produtos"), op("+"), xml("valor_frete"),
      op("-"), xml("icms_destacado"), op("/"), num(0.795),
      op("x"), pct(20.5),
    ];
    const r = valor(fluxo, {
      valor_produtos: 1000, valor_frete: 100, icms_destacado: 120,
    });
    expect(r).toBeCloseTo(252.7, 1);
  });

  it("soma, subtrai, multiplica e divide", () => {
    expect(valor([num(10), op("+"), num(2)])).toBe(12);
    expect(valor([num(10), op("-"), num(2)])).toBe(8);
    expect(valor([num(10), op("x"), num(2)])).toBe(20);
    expect(valor([num(10), op("/"), num(2)])).toBe(5);
  });

  it("percentual vale valor ÷ 100", () => {
    expect(valor([num(200), op("x"), pct(20.5)])).toBeCloseTo(41, 6);
  });

  it("divisão por zero mantém o acumulado", () => {
    expect(valor([num(10), op("/"), num(0)])).toBe(10);
  });

  it("campo fora do catálogo invalida o fluxo (nunca zero)", () => {
    const r = avaliarFluxoDetalhado([num(10), op("+"), xml("nao_existe")], {});
    expect(r.valido).toBe(false);
    expect(r.erro).toContain("nao_existe");
    expect(r.resultado).toBe(0);
  });

  it("campo cadastrado com valor zero é aceito", () => {
    const r = avaliarFluxoDetalhado([num(10), op("+"), xml("valor_frete")], {
      valor_frete: 0,
    });
    expect(r.valido).toBe(true);
    expect(r.resultado).toBe(10);
  });
});

describe("fluxoValido", () => {
  it("recusa fluxo vazio, terminado em operador ou fora de ordem", () => {
    expect(fluxoValido([])).toBe(false);
    expect(fluxoValido([num(1), op("+")])).toBe(false);
    expect(fluxoValido([op("+"), num(1)])).toBe(false);
    expect(fluxoValido([num(1), op("+"), num(2)])).toBe(true);
  });
});

describe("passo a passo e campos usados", () => {
  it("registra cada passo com o acumulado", () => {
    const d = avaliarFluxoDetalhado([num(10), op("x"), num(3)], {});
    expect(d.valido).toBe(true);
    expect(d.passos).toHaveLength(2);
    expect(d.passos[1].valor).toBe(30);
  });

  it("lista os códigos de campos sem repetir", () => {
    expect(
      camposUsados([xml("a"), op("+"), xml("b"), op("+"), xml("a")]),
    ).toEqual(["a", "b"]);
  });

  it("fluxo incompleto é inválido com mensagem", () => {
    const r = avaliarFluxoDetalhado([num(1), op("+")], {});
    expect(r.valido).toBe(false);
    expect(r.erro).toBeTruthy();
  });
});
