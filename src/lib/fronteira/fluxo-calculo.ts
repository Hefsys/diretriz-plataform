// Motor de avaliação das "Lógicas de Cálculo em Fluxograma".
//
// ⚠️ REGRA CRÍTICA 1: a avaliação é ESTRITAMENTE da esquerda para a direita,
// SEM precedência matemática. Cada bloco opera sobre o acumulado até ali.
// Exceção: blocos entre parênteses são resolvidos antes, como um único operando.
// Ex.: 1000 + 100 − 120 ÷ 0,795 × 20,50%  →  252,70 (e não 1069,06).
//
// ⚠️ REGRA CRÍTICA 2: campo do XML que não existe no catálogo (tabela
// public.campos_xml) NUNCA vale zero — o fluxo fica inválido com mensagem de
// erro. Zero silencioso em cálculo fiscal é erro de valor em contestação.
//
// Módulo puro: sem I/O.

import { labelDoCampo, type CampoXmlDef } from "./campos-xml";

export type OperadorFluxo = "+" | "-" | "x" | "/";

export type NoFluxo =
  | { id: string; tipo: "operando"; origem: "xml"; campo: string }
  | { id: string; tipo: "operando"; origem: "numero"; valor: number }
  | { id: string; tipo: "operando"; origem: "percentual"; valor: number }
  | { id: string; tipo: "operador"; op: OperadorFluxo }
  | { id: string; tipo: "abre" }
  | { id: string; tipo: "fecha" };

export type Fluxo = NoFluxo[];

/** Valores resolvidos por código de campo. Chave ausente = campo não cadastrado. */
export type ValoresCampos = Record<string, number | undefined>;

export const OPERADORES: Array<{ op: OperadorFluxo; simbolo: string; label: string }> = [
  { op: "+", simbolo: "+", label: "Soma" },
  { op: "-", simbolo: "−", label: "Subtração" },
  { op: "x", simbolo: "×", label: "Multiplicação" },
  { op: "/", simbolo: "÷", label: "Divisão" },
];

export function simboloOperador(op: OperadorFluxo): string {
  return OPERADORES.find((o) => o.op === op)?.simbolo ?? op;
}

export function novoIdFluxo(): string {
  return `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Rótulo curto de um bloco, usado nos chips e no passo a passo. */
export function labelNo(no: NoFluxo, catalogo: CampoXmlDef[] = []): string {
  if (no.tipo === "operador") return simboloOperador(no.op);
  if (no.tipo === "abre") return "(";
  if (no.tipo === "fecha") return ")";
  if (no.origem === "xml") return labelDoCampo(catalogo, no.campo);
  if (no.origem === "percentual") return `${no.valor.toString().replace(".", ",")}%`;
  return no.valor.toString().replace(".", ",");
}

export interface PassoFluxo {
  passo: string;
  detalhe: string;
  valor: number;
  /** Rastro do campo usado (para a memória de cálculo auditável). */
  campoCodigo?: string;
  campoId?: string;
}

export interface ResultadoFluxo {
  resultado: number;
  passos: PassoFluxo[];
  valido: boolean;
  erro?: string;
}

function erroFluxo(erro: string): ResultadoFluxo {
  return { resultado: 0, passos: [], valido: false, erro };
}

/**
 * Avaliação com passo a passo. Falha alto: campo fora do catálogo invalida o
 * fluxo inteiro em vez de virar zero.
 */
export function avaliarFluxoDetalhado(
  fluxo: Fluxo,
  valores: ValoresCampos,
  catalogo: CampoXmlDef[] = [],
): ResultadoFluxo {
  if (!fluxoValido(fluxo)) {
    return erroFluxo(
      "Fórmula incompleta: verifique se operandos e operadores se alternam e se todo parêntese aberto foi fechado.",
    );
  }

  const faltando = camposUsados(fluxo).find(
    (c) => valores[c] === undefined || !Number.isFinite(Number(valores[c])),
  );
  if (faltando) {
    return erroFluxo(`Campo '${faltando}' não está cadastrado`);
  }

  const val = (n: NoFluxo): number => {
    if (n.tipo !== "operando") return 0;
    if (n.origem === "xml") return Number(valores[n.campo]);
    if (n.origem === "percentual") return n.valor / 100;
    return n.valor;
  };
  const detalhe = (n: NoFluxo): string => {
    if (n.tipo !== "operando") return "";
    if (n.origem === "xml") return "Campo do XML da NF-e";
    if (n.origem === "percentual") return `Porcentagem fixa (${n.valor} ÷ 100)`;
    return "Número fixo";
  };
  const rastro = (n: NoFluxo): Pick<PassoFluxo, "campoCodigo" | "campoId"> => {
    if (n.tipo !== "operando" || n.origem !== "xml") return {};
    return {
      campoCodigo: n.campo,
      campoId: catalogo.find((c) => c.codigo === n.campo)?.id,
    };
  };

  const passos: PassoFluxo[] = [];
  let pos = 0;
  const aplicar = (r: number, op: OperadorFluxo, v: number) =>
    op === "+" ? r + v
    : op === "-" ? r - v
    : op === "x" ? r * v
    : (v === 0 ? r : r / v); // divisão por zero: mantém o acumulado

  // Parênteses: o conteúdo é resolvido primeiro (também da esquerda para a
  // direita) e o resultado entra como um único operando na expressão de fora.
  type Termo = { v: number; label: string; detalhe: string; r: Pick<PassoFluxo, "campoCodigo" | "campoId"> };
  const termo = (nivel: number): Termo => {
    const n = fluxo[pos++];
    if (n.tipo === "abre") {
      const pre = "│ ".repeat(nivel + 1);
      passos.push({ passo: `${"│ ".repeat(nivel)}( abre parêntese`, detalhe: "", valor: 0 });
      const v = expr(nivel + 1, pre);
      pos++; // fecha
      passos.push({ passo: `${"│ ".repeat(nivel)}) resultado do parêntese`, detalhe: "", valor: v });
      return { v, label: "( … )", detalhe: "Resultado do parêntese", r: {} };
    }
    return { v: val(n), label: labelNo(n, catalogo), detalhe: detalhe(n), r: rastro(n) };
  };
  const expr = (nivel: number, pre = ""): number => {
    const t = termo(nivel);
    let r = t.v;
    if (t.label !== "( … )") passos.push({ passo: pre + t.label, detalhe: t.detalhe, valor: r, ...t.r });
    while (pos < fluxo.length && fluxo[pos].tipo === "operador") {
      const op = fluxo[pos++] as Extract<NoFluxo, { tipo: "operador" }>;
      const b = termo(nivel);
      r = aplicar(r, op.op, b.v);
      passos.push({
        passo: `${pre}${simboloOperador(op.op)} ${b.label}`,
        detalhe: `${b.detalhe} — aplicado sobre o acumulado (valor: ${b.v})`,
        valor: r,
        ...b.r,
      });
    }
    return r;
  };
  const r = expr(0);
  return { resultado: r, passos, valido: true };
}

/** Gramática: expr := termo (operador termo)* ; termo := operando | "(" expr ")". */
export function fluxoValido(fluxo: Fluxo): boolean {
  if (!fluxo.length) return false;
  let pos = 0;
  const termo = (): boolean => {
    const n = fluxo[pos];
    if (!n) return false;
    if (n.tipo === "operando") { pos++; return true; }
    if (n.tipo === "abre") {
      pos++;
      if (!expr()) return false;
      if (fluxo[pos]?.tipo !== "fecha") return false;
      pos++;
      return true;
    }
    return false;
  };
  const expr = (): boolean => {
    if (!termo()) return false;
    while (fluxo[pos]?.tipo === "operador") { pos++; if (!termo()) return false; }
    return true;
  };
  return expr() && pos === fluxo.length;
}

/** Normaliza o JSONB vindo do banco para um Fluxo tipado. */
export function parseFluxo(json: unknown): Fluxo {
  if (!Array.isArray(json)) return [];
  return json.filter(
    (n): n is NoFluxo =>
      !!n && typeof n === "object" &&
      ["operador", "operando", "abre", "fecha"].includes((n as NoFluxo).tipo),
  );
}

/** Códigos de campos do XML usados no fluxo, sem duplicar, na ordem de uso. */
export function camposUsados(fluxo: Fluxo): string[] {
  const out: string[] = [];
  for (const n of fluxo) {
    if (n.tipo === "operando" && n.origem === "xml" && !out.includes(n.campo)) {
      out.push(n.campo);
    }
  }
  return out;
}
