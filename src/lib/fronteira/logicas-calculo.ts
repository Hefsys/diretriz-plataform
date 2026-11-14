// Tipos e utilitários para Lógicas de Cálculo configuráveis

export type CampoTipo = "decimal" | "inteiro" | "texto";

export interface CampoUsuario {
  key: string;
  label: string;
  tipo: CampoTipo;
  obrigatorio: boolean;
  validar_contra_xml: string | null;
}

export interface ParametrosST {
  aliquota_interna: number;
}

export type FormulaCodigo =
  "ST_PESO_LEGISLACAO" | "USO_E_CONSUMO" | "ICMS_ANTECIPADO" | "ST_DESTINATARIO" | "FLUXO_VISUAL";

export interface LogicaCalculo {
  id: string;
  nome: string;
  descricao: string | null;
  formula_codigo: string;
  parametros: Record<string, unknown>;
  campos_usuario: CampoUsuario[];
  ativa: boolean;
  created_at: string | null;
  fluxo?: unknown;
}

export interface NcmLegislacao {
  id?: string;
  logica_id?: string;
  ncm: string;
  descricao_produto: string | null;
  legislacao_valor: number;
  unidade: string | null;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
}

export const FORMULAS_DISPONIVEIS: Array<{ codigo: FormulaCodigo; label: string }> = [
  { codigo: "ST_PESO_LEGISLACAO", label: "ST por Peso × Legislação × Quantidade (Baterias)" },
  { codigo: "USO_E_CONSUMO", label: "Uso e Consumo (DIFAL por dentro / 0,795)" },
  {
    codigo: "ICMS_ANTECIPADO",
    label: "ICMS Antecipado (Alíquota interna por dentro / 0,795 − ICMS normal)",
  },
  {
    codigo: "ST_DESTINATARIO",
    label: "ICMS-ST pago pelo destinatário (MVA, remetente sem retenção)",
  },
  { codigo: "FLUXO_VISUAL", label: "Fluxograma visual (montar fórmula)" },
];

export function inputsValidos(campos: CampoUsuario[], inputs: Record<string, string>): boolean {
  for (const c of campos) {
    if (!c.obrigatorio) continue;
    const v = inputs[c.key];
    if (v === undefined || v === "") return false;
    const n = Number(String(v).replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return false;
  }
  return true;
}

export function parseInputNumber(v: string): number {
  return Number(String(v ?? "").replace(",", "."));
}
