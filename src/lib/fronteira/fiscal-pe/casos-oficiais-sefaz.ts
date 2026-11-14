/**
 * Exemplos numéricos oficiais do informativo "Base de Cálculo nas Entradas
 * Interestaduais" (SEFAZ-PE, atualizado em 01/10/2026), item 5.
 * O valor esperado é o "ICMS-AT" impresso no informativo.
 */
import type { Adquirente, EntradaCalculo } from "./motor-antecipacao-pe";

export interface CasoOficial {
  item: string;
  descricao: string;
  entrada: EntradaCalculo;
  esperado: number;
  /** Quando o informativo traz erro aritmético: valor impresso e explicação */
  divergencia?: { valorInformativo: number; motivo: string };
}

const normal = (x: Partial<Adquirente> = {}): Adquirente => ({ regime: "NORMAL", atividade: "VAREJO", sujeitoAntecipacao: true, ...x });
const simples = (porte: "MEI" | "ME" | "EPP", x: Partial<Adquirente> = {}): Adquirente => ({
  regime: "SIMPLES", porte, atividade: "VAREJO", sujeitoAntecipacao: true, regular339A: true, ...x,
});

function c(
  item: string, descricao: string, esperado: number,
  destinacao: EntradaCalculo["destinacao"], adquirente: Adquirente,
  valores: EntradaCalculo["valores"], inter: number, interna = 20.5,
  produto?: EntradaCalculo["produto"],
): CasoOficial {
  return { item, descricao, esperado, entrada: { dataDocumento: "2026-10-01", destinacao, adquirente, valores, aliquotaInterestadual: inter, aliquotaInterna: interna, produto } };
}

export const CASOS_OFICIAIS: CasoOficial[] = [
  // 5.1 — Uso, consumo e ativo permanente
  c("5.1.1.1", "Normal, ativo, SP 7%", 789.62, "ATIVO", normal(), { produtos: 5000, icmsOrigem: 350 }, 7),
  c("5.1.1.2", "Normal, uso, RS 7%, IPI, interna 25%", 1629.36, "USO_CONSUMO", normal({ atividade: "ATACADO" }), { produtos: 7000, ipi: 300, icmsOrigem: 511 }, 7, 25),
  c("5.1.1.3", "Normal, ativo, mercadoria com ST, AL 12%", 762.11, "ATIVO", normal(), { produtos: 8000, ipi: 100, icmsOrigem: 972 }, 12),
  c("5.1.1.4", "Normal, uso, importada 4%", 796.98, "USO_CONSUMO", normal(), { produtos: 4000, icmsOrigem: 160 }, 4),
  c("5.1.1.5", "Normal Anexo 12 (MVA ignorada em uso), 27%", 1814.79, "USO_CONSUMO", normal({ mvaAnexo12: 30 }), { produtos: 6000, icmsOrigem: 240 }, 4, 27),
  c("5.1.1.6", "Indústria Anexo 13, uso, 29%", 1757.83, "USO_CONSUMO", normal({ atividade: "INDUSTRIA" }), { produtos: 6000, ipi: 100, icmsOrigem: 427 }, 7, 29),
  c("5.1.1.7", "Indústria fora do Anexo 13, DIFAL (057-4)", 475.14, "USO_CONSUMO", normal({ atividade: "INDUSTRIA", sujeitoAntecipacao: false }), { produtos: 5000, ipi: 50, icmsOrigem: 606 }, 12),
  c("5.1.1.8", "Informática p/ ativo: redução não se aplica", 1263.4, "ATIVO", normal(), { produtos: 8000, icmsOrigem: 560 }, 7, 20.5, { reducaoBase: { percentualBase: 70.59, sistema: "NORMAL" } }),
  c("5.1.1.9", "DIFAL de frete FOB (CT-e BA 12%)", 188.18, "USO_CONSUMO", normal({ atividade: "INDUSTRIA" }), { produtos: 2000, icmsOrigem: 240 }, 12),
  c("5.1.1.10", "Normal, uso, remetente do Simples (crédito LC 123)", 653.09, "USO_CONSUMO", normal(), { produtos: 4000, icmsOrigem: 154 }, 7),
  c("5.1.1.11", "Transportadora Anexo 15, veículo p/ ativo", 12633.96, "ATIVO", normal({ atividade: "SERVICO_ANEXO15" }), { produtos: 80000, icmsOrigem: 5600 }, 7),
  c("5.1.1.12", "Atacadista de veículos, alíquota interna 12%", 4227.27, "ATIVO", normal({ atividade: "ATACADO" }), { produtos: 80000, icmsOrigem: 5600 }, 7, 12),
  c("5.1.1.13", "Normal, ativo com ST, remetente do Simples", 653.09, "ATIVO", normal(), { produtos: 4000, icmsOrigem: 154 }, 7),
  c("5.1.2.1", "Simples (regularidade não informada), uso, 25%", 806.4, "USO_CONSUMO", simples("ME", { regular339A: false }), { produtos: 3000, icmsOrigem: 120 }, 4, 25),
  c("5.1.2.2", "Simples EPP regular, uso", 261.11, "USO_CONSUMO", simples("EPP"), { produtos: 2000, ipi: 20, icmsOrigem: 141.4 }, 7),
  c("5.1.2.3", "Simples ME regular, uso", 118.62, "USO_CONSUMO", simples("ME"), { produtos: 2000, ipi: 20, icmsOrigem: 141.4 }, 7),
  c("5.1.2.4", "Simples EPP regular, origem isenta, 4%", 513.96, "USO_CONSUMO", simples("EPP"), { produtos: 3000, icmsOrigem: 0 }, 4),
  c("5.1.2.5", "Simples Agreste/Anexo 19, 12%", 86.7, "USO_CONSUMO", simples("ME", { agresteAnexo19: true }), { produtos: 2000, ipi: 100, icmsOrigem: 252 }, 12),
  c("5.1.2.6", "Simples ME NÃO regular, uso", 197.58, "USO_CONSUMO", simples("ME", { regular339A: false }), { produtos: 2000, ipi: 100, icmsOrigem: 252 }, 12),
  c("5.1.2.7", "MEI regular, origem sem ICMS, 12%", 66.79, "USO_CONSUMO", simples("MEI"), { produtos: 1000, icmsOrigem: 0 }, 12),
  c("5.1.2.9", "Simples Agreste, remetente do Simples", 170.77, "USO_CONSUMO", simples("ME", { agresteAnexo19: true }), { produtos: 4000, icmsOrigem: 154 }, 7),

  // 5.2 — Comercialização ou industrialização
  c("5.2.1.1", "Normal varejo, antecipação parcial", 756.6, "COMERCIALIZACAO", normal(), { produtos: 4000, ipi: 200, seguro: 100, icmsOrigem: 280 }, 7),
  c("5.2.1.2", "Normal, origem isenta", 1108.81, "COMERCIALIZACAO", normal(), { produtos: 4000, ipi: 200, seguro: 100, icmsOrigem: 0 }, 7),
  c("5.2.1.3", "Normal, remetente do Simples", 837.74, "COMERCIALIZACAO", normal(), { produtos: 4000, icmsOrigem: 154 }, 7),
  c("5.2.1.4", "Normal Anexo 12, MVA 30%", 2101.65, "COMERCIALIZACAO", normal({ mvaAnexo12: 30 }), { produtos: 8000, ipi: 400, seguro: 100, icmsOrigem: 560 }, 7),
  c("5.2.1.5", "Normal Anexo 12, MVA 30%, origem isenta", 2849.37, "COMERCIALIZACAO", normal({ mvaAnexo12: 30 }), { produtos: 8000, ipi: 400, seguro: 100, icmsOrigem: 0 }, 7),
  c("5.2.1.6", "Normal Anexo 12, remetente do Simples", 2412.42, "COMERCIALIZACAO", normal({ mvaAnexo12: 30 }), { produtos: 8000, ipi: 400, seguro: 100, icmsOrigem: 327.25 }, 7),
  c("5.2.1.7", "Indústria Anexo 13, 27%", 273.97, "INDUSTRIALIZACAO", normal({ atividade: "INDUSTRIA" }), { produtos: 1000, icmsOrigem: 70 }, 7, 27),
  {
    ...c("5.2.1.8", "Redução de base 40%, sistema normal", 302.64, "COMERCIALIZACAO", normal(), { produtos: 4000, ipi: 200, seguro: 100, icmsOrigem: 280 }, 7, 20.5, { reducaoBase: { percentualBase: 40, sistema: "NORMAL" } }),
    divergencia: {
      valorInformativo: 292.53,
      motivo:
        "O informativo aplica 20% sobre a base de 2.022,64 (= 404,53), embora declare alíquota interna de 20,5%. " +
        "Com 20,5%: 414,64 − 112,00 = 302,64. O caso 5.2.1.10, com os mesmos dados, usa 20,5% corretamente (414,64).",
    },
  },
  c("5.2.1.9", "Software não personalizado, 1%", 11.82, "COMERCIALIZACAO", normal(), { produtos: 1000, ipi: 10, icmsOrigem: 70 }, 7, 20.5, { tipo: "SOFTWARE" }),
  c("5.2.1.10", "Redução de base 40%, sistema opcional", 414.64, "COMERCIALIZACAO", normal(), { produtos: 4000, ipi: 200, seguro: 100, icmsOrigem: 280 }, 7, 20.5, { reducaoBase: { percentualBase: 40, sistema: "OPCIONAL" } }),
  c("5.2.1.11", "Crédito presumido 15,5%, sistema opcional", 233.97, "COMERCIALIZACAO", normal(), { produtos: 4000, icmsOrigem: 280 }, 7, 20.5, { creditoPresumido: { percentual: 15.5, sistema: "OPCIONAL" } }),
  c("5.2.1.12", "Crédito presumido 13,5%, sistema normal", 47.55, "COMERCIALIZACAO", normal(), { produtos: 4000, icmsOrigem: 280 }, 7, 20.5, { creditoPresumido: { percentual: 13.5, sistema: "NORMAL" } }),
  c("5.2.1.14", "Atacadista, alíquota 12% com crédito integral", 2272.73, "COMERCIALIZACAO", normal({ atividade: "ATACADO" }), { produtos: 40000, icmsOrigem: 2800 }, 7, 12),
  c("5.2.1.15", "Atacadista credenciado Dec. 38.455/2012, limite 6%", 833.96, "COMERCIALIZACAO", normal({ atividade: "ATACADO", mvaAnexo12: 30, credenciado38455: true }), { produtos: 8000, ipi: 400, seguro: 100, icmsOrigem: 0 }, 7),
  c("5.2.1.17", "Conv. 52/1991, base 27,32%, crédito integral", 127.37, "COMERCIALIZACAO", normal(), { produtos: 4000, ipi: 200, seguro: 100, icmsOrigem: 164 }, 4, 20.5, { reducaoBase: { percentualBase: 27.32, sistema: "NORMAL", manterCreditoIntegral: true } }),
  c("5.2.2.1", "Simples ME regular", 117.45, "COMERCIALIZACAO", simples("ME"), { produtos: 2000, icmsOrigem: 140 }, 7),
  c("5.2.2.2", "Simples EPP regular, importado 4%", 328.94, "COMERCIALIZACAO", simples("EPP"), { produtos: 2000, icmsOrigem: 80 }, 4),
  c("5.2.2.3", "MEI regular, 25%", 105.32, "COMERCIALIZACAO", simples("MEI"), { produtos: 2000, ipi: 100, icmsOrigem: 140 }, 7, 25),
  c("5.2.2.4", "Simples Agreste/Anexo 19", 87.03, "COMERCIALIZACAO", simples("EPP", { agresteAnexo19: true }), { produtos: 2000, ipi: 100, icmsOrigem: 140 }, 7),
  c("5.2.2.5", "Simples EPP regular, 12%, origem sem ICMS", 80.13, "COMERCIALIZACAO", simples("EPP"), { produtos: 1000, icmsOrigem: 0 }, 12),
  c("5.2.2.7", "Simples ME NÃO regular", 332.83, "COMERCIALIZACAO", simples("ME", { regular339A: false }), { produtos: 2000, ipi: 100, icmsOrigem: 140 }, 7),
  c("5.2.2.8", "Simples EPP, interna 12% → regra geral", 2113.64, "COMERCIALIZACAO", simples("EPP"), { produtos: 40000, icmsOrigem: 2800 }, 7, 12),
  c("5.2.2.9", "Simples EPP Agreste/Anexo 19", 41.29, "COMERCIALIZACAO", simples("EPP", { agresteAnexo19: true }), { produtos: 1000, icmsOrigem: 70 }, 7),
  c("5.2.2.10", "Leite, Simples Agreste regular, sem MVA", 25.66, "COMERCIALIZACAO", simples("EPP", { agresteAnexo19: true }), { produtos: 600, ipi: 20, icmsOrigem: 42 }, 7, 20.5, { tipo: "LEITE" }),
  c("5.2.2.11", "Leite, Simples irregular, sem MVA", 98.15, "COMERCIALIZACAO", simples("EPP", { regular339A: false }), { produtos: 600, ipi: 20, icmsOrigem: 42 }, 7, 20.5, { tipo: "LEITE" }),
  c("5.2.2.12", "Simples ME Agreste, remetente do Simples", 213.47, "COMERCIALIZACAO", simples("ME", { agresteAnexo19: true }), { produtos: 5000, icmsOrigem: 192.5 }, 7),
];
