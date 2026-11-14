// Decide como cada item da nota é calculado, a partir dos vínculos NCM → lógica
// da empresa destinatária (tabela empresa_ncm_calculo).
//
// Regra única: o vínculo vigente na data de emissão, no nível mais específico
// (8 → 6 → 4 dígitos). Sem vínculo, A_CLASSIFICAR ou lógica inativa, o item fica
// PENDENTE. Nunca há lógica padrão, lógica da sessão ou outro fallback.
//
// Módulo puro: sem I/O.

import { acharOverrideNcm } from "./resolver-fluxo-ncm";

export type StatusVinculoNcm = "A_CLASSIFICAR" | "CLASSIFICADO" | "SEM_COBRANCA";

/** Linha de public.empresa_ncm_calculo. */
export interface VinculoNcmCalculo {
  id: string;
  empresa_id: string;
  ncm: string;
  status: StatusVinculoNcm | string;
  logica_calculo_id: string | null;
  parametros: Record<string, unknown> | null;
  fundamento: string | null;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  descricao_produto?: string | null;
}

/** Campos de public.logicas_calculo usados no cálculo. */
export interface LogicaDoItem {
  id: string;
  nome: string;
  ativa: boolean | null;
  formula_codigo: string;
  parametros: Record<string, unknown> | null;
  fluxo: unknown;
}

export type DecisaoCalculoItem =
  | {
      tipo: "CALCULAR";
      logica: LogicaDoItem;
      parametros: Record<string, unknown>;
      vinculoId: string;
      /** NCM ou prefixo do vínculo que casou (difere do NCM do item quando foi por prefixo). */
      ncmCasado: string;
    }
  | { tipo: "SEM_COBRANCA"; fundamento: string; vinculoId: string; ncmCasado: string }
  | { tipo: "PENDENTE"; motivo: string };

export interface ResolverCalculoDoItemArgs {
  ncm: string | null | undefined;
  /** Data de emissão da nota (YYYY-MM-DD). */
  dataReferencia: string | null | undefined;
  /** Vínculos da empresa destinatária da nota. */
  vinculosDaEmpresa: VinculoNcmCalculo[];
  logicas: LogicaDoItem[];
}

export function resolverCalculoDoItem({
  ncm,
  dataReferencia,
  vinculosDaEmpresa,
  logicas,
}: ResolverCalculoDoItemArgs): DecisaoCalculoItem {
  const alvo = (ncm ?? "").replace(/\D/g, "");
  if (!alvo) return { tipo: "PENDENTE", motivo: "Item sem NCM no XML" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataReferencia ?? "")) {
    return { tipo: "PENDENTE", motivo: "Informe a data de emissão da nota (dhEmi ou dEmi no XML)" };
  }
  const naoClassificado = `NCM ${alvo} não classificado para esta empresa`;
  const vinculo = acharOverrideNcm(alvo, vinculosDaEmpresa, dataReferencia ?? undefined);
  if (!vinculo || vinculo.status === "A_CLASSIFICAR")
    return { tipo: "PENDENTE", motivo: naoClassificado };

  if (vinculo.status === "SEM_COBRANCA") {
    return {
      tipo: "SEM_COBRANCA",
      fundamento: vinculo.fundamento ?? "",
      vinculoId: vinculo.id,
      ncmCasado: vinculo.ncm,
    };
  }
  if (vinculo.status !== "CLASSIFICADO") return { tipo: "PENDENTE", motivo: naoClassificado };

  const logica = logicas.find((l) => l.id === vinculo.logica_calculo_id);
  if (!logica)
    return { tipo: "PENDENTE", motivo: `Lógica de cálculo do NCM ${alvo} não encontrada` };
  if (logica.ativa === false) {
    return {
      tipo: "PENDENTE",
      motivo: `NCM ${alvo} usa a lógica "${logica.nome}", que está inativa`,
    };
  }
  return {
    tipo: "CALCULAR",
    logica,
    parametros: vinculo.parametros ?? {},
    vinculoId: vinculo.id,
    ncmCasado: vinculo.ncm,
  };
}
