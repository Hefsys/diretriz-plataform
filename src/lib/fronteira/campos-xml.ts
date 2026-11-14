// Catálogo de campos do XML (tabela public.campos_xml).
//
// Os campos deixaram de ser hardcoded: cada bloco "Campo do XML" de um
// fluxograma guarda o `codigo` de uma linha desta tabela.
//
// Módulo puro: sem I/O.

export type EscopoCampo = "nota" | "item";
export type TipoCampo = "moeda" | "peso" | "quantidade" | "percentual";
export type EstrategiaCampo = "caminho" | "texto_livre" | "derivado";
export type AgregacaoCampo = "soma" | "media" | "primeiro" | "item_predominante";

export interface CampoXmlDef {
  id: string;
  codigo: string;
  label: string;
  descricao: string | null;
  escopo: EscopoCampo;
  tipo: TipoCampo;
  estrategia: EstrategiaCampo;
  caminho: string | null;
  origem_texto: string | null;
  padrao_regex: string | null;
  grupo_captura: number | null;
  agregacao: AgregacaoCampo | null;
  campo_fallback_id: string | null;
  xml_amostra_path: string | null;
  valor_esperado: number | null;
  sistema: boolean;
  ativo: boolean;
  ordem: number;
}

export const TIPOS_CAMPO: Array<{ valor: TipoCampo; label: string }> = [
  { valor: "moeda", label: "Valor em reais" },
  { valor: "peso", label: "Peso (kg)" },
  { valor: "quantidade", label: "Quantidade" },
  { valor: "percentual", label: "Percentual" },
];

export const ESCOPOS_CAMPO: Array<{
  valor: EscopoCampo;
  label: string;
  descricao: string;
}> = [
  {
    valor: "nota",
    label: "Nota inteira",
    descricao: "O valor aparece uma vez na nota (ex.: total do frete).",
  },
  {
    valor: "item",
    label: "Por produto",
    descricao: "O valor aparece em cada produto e precisa ser combinado.",
  },
];

export const AGREGACOES_CAMPO: Array<{
  valor: AgregacaoCampo;
  label: string;
  descricao: string;
}> = [
  { valor: "soma", label: "Somar", descricao: "Soma o valor de todos os produtos." },
  { valor: "media", label: "Média", descricao: "Média entre os produtos que têm o valor." },
  { valor: "primeiro", label: "Primeiro", descricao: "Usa o valor do primeiro produto." },
  {
    valor: "item_predominante",
    label: "Produto de maior valor",
    descricao: "Usa o valor do produto com o maior total na nota.",
  },
];

/** Um campo pode ter vários padrões alternativos, tentados em ordem. */
export function padroesDoCampo(padrao: string | null | undefined): string[] {
  const bruto = (padrao ?? "").trim();
  if (!bruto) return [];
  if (bruto.startsWith("[")) {
    try {
      const arr = JSON.parse(bruto) as unknown;
      if (Array.isArray(arr)) {
        return arr.filter((p): p is string => typeof p === "string" && !!p.trim());
      }
    } catch {
      /* cai no fallback abaixo */
    }
  }
  return bruto
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);
}

export const LIMITE_REGEX = 200;

/** Recusa padrões perigosos (backtracking catastrófico) e longos demais. */
export function validarRegexSegura(padrao: string): string | null {
  const p = (padrao ?? "").trim();
  if (!p) return "Informe o padrão de busca.";
  if (p.length > LIMITE_REGEX) {
    return `Padrão muito longo (máximo ${LIMITE_REGEX} caracteres).`;
  }
  if (/([+*?]\s*\)|\)\s*)[+*]\s*[+*]/.test(p) || /\([^)]*[+*][^)]*\)\s*[+*]/.test(p)) {
    return "Padrão com repetição dentro de repetição — pode travar o processamento.";
  }
  try {
    new RegExp(p, "i");
  } catch {
    return "Padrão inválido.";
  }
  return null;
}

/** Executa os padrões em ordem e devolve o primeiro número capturado. */
export function extrairNumeroPorRegex(
  texto: string,
  padroes: string[],
  grupo = 1,
): number | null {
  const alvo = (texto ?? "").slice(0, 20000);
  if (!alvo) return null;
  for (const padrao of padroes) {
    if (padrao.length > LIMITE_REGEX * 4) continue;
    let re: RegExp;
    try {
      re = new RegExp(padrao, "i");
    } catch {
      continue;
    }
    const m = alvo.match(re);
    const capturado = m?.[grupo] ?? m?.[1];
    if (capturado == null) continue;
    const v = Number(String(capturado).replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(v)) return v;
  }
  return null;
}

export function campoPorCodigo(
  catalogo: CampoXmlDef[],
  codigo: string,
): CampoXmlDef | undefined {
  return catalogo.find((c) => c.codigo === codigo);
}

export function labelDoCampo(catalogo: CampoXmlDef[], codigo: string): string {
  return campoPorCodigo(catalogo, codigo)?.label ?? codigo;
}

export function ordenarCampos(catalogo: CampoXmlDef[]): CampoXmlDef[] {
  return catalogo
    .slice()
    .sort((a, b) => a.ordem - b.ordem || a.label.localeCompare(b.label, "pt-BR"));
}
