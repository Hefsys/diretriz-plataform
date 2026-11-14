import { describe, expect, it } from "vitest";
import {
  resolverCalculoDoItem,
  type LogicaDoItem,
  type VinculoNcmCalculo,
} from "./resolver-calculo-item";

const logica = (id: string, ativa = true): LogicaDoItem => ({
  id,
  nome: `Lógica ${id}`,
  ativa,
  formula_codigo: "ICMS_ANTECIPADO",
  parametros: {},
  fluxo: [],
});
const LOGICAS = [logica("antecipacao"), logica("difal"), logica("velha", false)];

let seq = 0;
const vinculo = (
  v: Partial<VinculoNcmCalculo> & Pick<VinculoNcmCalculo, "ncm">,
): VinculoNcmCalculo => ({
  id: `v${++seq}`,
  empresa_id: "empresa-a",
  status: "CLASSIFICADO",
  logica_calculo_id: "antecipacao",
  parametros: {},
  fundamento: null,
  vigencia_inicio: "2026-01-01",
  vigencia_fim: null,
  ...v,
});

const resolver = (ncm: string, vinculos: VinculoNcmCalculo[], data = "2026-06-15") =>
  resolverCalculoDoItem({
    ncm,
    dataReferencia: data,
    vinculosDaEmpresa: vinculos,
    logicas: LOGICAS,
  });

describe("resolverCalculoDoItem", () => {
  it("match exato vence prefixo", () => {
    const exato = vinculo({ ncm: "85071010", logica_calculo_id: "difal" });
    const r = resolver("85071010", [vinculo({ ncm: "8507" }), vinculo({ ncm: "850710" }), exato]);
    expect(r).toMatchObject({ tipo: "CALCULAR", vinculoId: exato.id, ncmCasado: "85071010" });
    if (r.tipo === "CALCULAR") expect(r.logica.id).toBe("difal");
  });

  it("prefixo de 6 vence prefixo de 4", () => {
    const seis = vinculo({ ncm: "850710", logica_calculo_id: "difal" });
    expect(resolver("85071090", [vinculo({ ncm: "8507" }), seis])).toMatchObject({
      tipo: "CALCULAR",
      vinculoId: seis.id,
      ncmCasado: "850710",
    });
  });

  it("prefixo de 4 cobre a família", () => {
    expect(resolver("85079000", [vinculo({ ncm: "8507" })])).toMatchObject({
      tipo: "CALCULAR",
      ncmCasado: "8507",
    });
  });

  it("aceita NCM com pontuação", () => {
    expect(resolver("8507.10.10", [vinculo({ ncm: "85071010" })])).toMatchObject({
      tipo: "CALCULAR",
    });
  });

  it("devolve os parâmetros do vínculo", () => {
    const r = resolver("85071010", [
      vinculo({ ncm: "85071010", parametros: { legislacao_valor: 12.5 } }),
    ]);
    expect(r).toMatchObject({ tipo: "CALCULAR", parametros: { legislacao_valor: 12.5 } });
  });

  describe("vigência", () => {
    const v = () =>
      vinculo({ ncm: "85071010", vigencia_inicio: "2026-03-01", vigencia_fim: "2026-03-31" });
    it("antes do início fica pendente", () =>
      expect(resolver("85071010", [v()], "2026-02-28").tipo).toBe("PENDENTE"));
    it("no primeiro dia calcula", () =>
      expect(resolver("85071010", [v()], "2026-03-01").tipo).toBe("CALCULAR"));
    it("no último dia calcula", () =>
      expect(resolver("85071010", [v()], "2026-03-31").tipo).toBe("CALCULAR"));
    it("depois do fim fica pendente", () =>
      expect(resolver("85071010", [v()], "2026-04-01").tipo).toBe("PENDENTE"));
    it("fim nulo vale para sempre", () =>
      expect(
        resolver("85071010", [vinculo({ ncm: "85071010", vigencia_fim: null })], "2030-01-01").tipo,
      ).toBe("CALCULAR"));
    it("escolhe a linha vigente na data entre várias do histórico", () => {
      const antiga = vinculo({ ncm: "85071010", vigencia_fim: "2026-04-30" });
      const nova = vinculo({
        ncm: "85071010",
        vigencia_inicio: "2026-05-01",
        logica_calculo_id: "difal",
      });
      expect(resolver("85071010", [antiga, nova], "2026-04-30")).toMatchObject({
        vinculoId: antiga.id,
      });
      expect(resolver("85071010", [antiga, nova], "2026-05-01")).toMatchObject({
        vinculoId: nova.id,
      });
    });
    it("prefixo vigente não é usado se o exato também estiver vigente", () => {
      const exato = vinculo({ ncm: "85071010", vigencia_inicio: "2026-06-01" });
      const familia = vinculo({ ncm: "8507" });
      expect(resolver("85071010", [familia, exato], "2026-05-31")).toMatchObject({
        vinculoId: familia.id,
      });
      expect(resolver("85071010", [familia, exato], "2026-06-01")).toMatchObject({
        vinculoId: exato.id,
      });
    });
  });

  it("SEM_COBRANCA devolve o fundamento", () => {
    const v = vinculo({
      ncm: "85071010",
      status: "SEM_COBRANCA",
      logica_calculo_id: null,
      fundamento: "Isenção, art. 9º",
    });
    expect(resolver("85071010", [v])).toEqual({
      tipo: "SEM_COBRANCA",
      fundamento: "Isenção, art. 9º",
      vinculoId: v.id,
      ncmCasado: "85071010",
    });
  });

  it("A_CLASSIFICAR fica pendente", () => {
    const v = vinculo({ ncm: "85071010", status: "A_CLASSIFICAR", logica_calculo_id: null });
    expect(resolver("85071010", [v])).toEqual({
      tipo: "PENDENTE",
      motivo: "NCM 85071010 não classificado para esta empresa",
    });
  });

  it("A_CLASSIFICAR mais específico não cai no prefixo classificado", () => {
    const v = vinculo({ ncm: "85071010", status: "A_CLASSIFICAR", logica_calculo_id: null });
    expect(resolver("85071010", [vinculo({ ncm: "8507" }), v]).tipo).toBe("PENDENTE");
  });

  it("sem vínculo fica pendente, sem fallback", () => {
    expect(resolver("85071010", [vinculo({ ncm: "39269090" })])).toEqual({
      tipo: "PENDENTE",
      motivo: "NCM 85071010 não classificado para esta empresa",
    });
    expect(resolver("85071010", []).tipo).toBe("PENDENTE");
  });

  it("lógica inativa fica pendente", () => {
    const r = resolver("85071010", [vinculo({ ncm: "85071010", logica_calculo_id: "velha" })]);
    expect(r).toEqual({
      tipo: "PENDENTE",
      motivo: 'NCM 85071010 usa a lógica "Lógica velha", que está inativa',
    });
  });

  it("lógica inexistente fica pendente", () => {
    expect(
      resolver("85071010", [vinculo({ ncm: "85071010", logica_calculo_id: "apagada" })]).tipo,
    ).toBe("PENDENTE");
  });

  it("item sem NCM ou nota sem data fica pendente", () => {
    expect(resolver("", [vinculo({ ncm: "8507" })]).tipo).toBe("PENDENTE");
    expect(resolver("85071010", [vinculo({ ncm: "8507" })], "").tipo).toBe("PENDENTE");
  });

  it("mesmo NCM em duas empresas usa a lógica de cada uma", () => {
    const daA = [
      vinculo({ ncm: "85071010", empresa_id: "empresa-a", logica_calculo_id: "antecipacao" }),
    ];
    const daB = [vinculo({ ncm: "85071010", empresa_id: "empresa-b", logica_calculo_id: "difal" })];
    const a = resolver("85071010", daA);
    const b = resolver("85071010", daB);
    expect(a.tipo === "CALCULAR" && a.logica.id).toBe("antecipacao");
    expect(b.tipo === "CALCULAR" && b.logica.id).toBe("difal");
  });
});
