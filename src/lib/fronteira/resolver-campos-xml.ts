// Resolve os campos cadastrados em public.campos_xml contra uma NF-e parseada.
//
// Entrada: árvore XML (src/lib/xml-doc.ts) + catálogo de campos.
// Saída: Record<codigo, número>. Um campo cadastrado SEMPRE tem chave no
// resultado; campo não cadastrado (ou inativo) simplesmente não aparece, e o
// motor de fluxo trata isso como erro bloqueante — nunca como zero.
//
// Módulo puro: sem I/O.

import {
  extrairNumeroPorRegex,
  padroesDoCampo,
  type AgregacaoCampo,
  type CampoXmlDef,
} from "./campos-xml";
import {
  numeroDeTexto,
  selecionarTodos,
  textoDe,
  descendentesPorNome,
  selecionar,
  type XmlNode,
} from "./xml-doc";

function agregar(valores: number[], agregacao: AgregacaoCampo | null): number | null {
  if (!valores.length) return null;
  switch (agregacao) {
    case "soma":
      return valores.reduce((s, v) => s + v, 0);
    case "media":
      return valores.reduce((s, v) => s + v, 0) / valores.length;
    case "primeiro":
    case "item_predominante":
    default:
      return valores[0];
  }
}

function segmentos(caminho: string): string[] {
  return caminho.split(">").map((s) => s.trim()).filter(Boolean);
}

function valorRelativo(base: XmlNode, resto: string[]): string {
  if (!resto.length) return textoDe(base);
  let atuais: XmlNode[] = [base];
  for (const seg of resto) {
    // "*" casa qualquer filho — útil para ICMS00/ICMS20/... (CST varia por nota)
    atuais = atuais.flatMap((n) =>
      n.filhos.filter((f) => seg === "*" || f.nome === seg),
    );
  }
  return textoDe(atuais[0] ?? null);
}

function totalDoItem(item: XmlNode): number {
  const prod = item.filhos.find((f) => f.nome === "prod");
  const vProd = prod?.filhos.find((f) => f.nome === "vProd");
  return numeroDeTexto(textoDe(vProd ?? null)) ?? 0;
}

/** Lê um campo escopo=item: valor por produto + agregação. */
function resolverItem(
  doc: XmlNode,
  caminho: string,
  extrair: (texto: string) => number | null,
  agregacao: AgregacaoCampo | null,
): number | null {
  const segs = segmentos(caminho);
  if (!segs.length) return null;
  const itens = descendentesPorNome(doc, segs[0]);
  if (!itens.length) return null;
  const resto = segs.slice(1);

  const pares: Array<{ valor: number; total: number }> = [];
  for (const item of itens) {
    const v = extrair(valorRelativo(item, resto));
    if (v == null) continue;
    pares.push({ valor: v, total: totalDoItem(item) });
  }

  if (!pares.length) return null;
  if (agregacao === "item_predominante") {
    return pares.slice().sort((a, b) => b.total - a.total)[0].valor;
  }
  return agregar(
    pares.map((p) => p.valor),
    agregacao,
  );
}

function resolverDerivado(
  campo: CampoXmlDef,
  doc: XmlNode,
  catalogo: CampoXmlDef[],
  visitados: Set<string>,
): number | null {
  const expr = (campo.caminho ?? "").trim();
  const m = expr.match(/^([a-z0-9_]+)\s*([+\-*/])\s*([a-z0-9_]+)$/i);
  if (!m) return null;
  const a = resolverPorCodigo(m[1], doc, catalogo, visitados);
  const b = resolverPorCodigo(m[3], doc, catalogo, visitados);
  if (a == null || b == null) return null;
  switch (m[2]) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "*":
      return a * b;
    case "/":
      return b === 0 ? null : a / b;
    default:
      return null;
  }
}

function resolverPorCodigo(
  codigo: string,
  doc: XmlNode,
  catalogo: CampoXmlDef[],
  visitados: Set<string>,
): number | null {
  const campo = catalogo.find((c) => c.codigo === codigo);
  if (!campo) return null;
  return resolverCampo(campo, doc, catalogo, visitados);
}

/** Valor de um campo, com fallback encadeado. Devolve null quando não resolve. */
export function resolverCampo(
  campo: CampoXmlDef,
  doc: XmlNode,
  catalogo: CampoXmlDef[],
  visitados: Set<string> = new Set(),
): number | null {
  if (visitados.has(campo.id || campo.codigo)) return null;
  visitados.add(campo.id || campo.codigo);

  let valor: number | null = null;

  if (campo.estrategia === "caminho" && campo.caminho) {
    if (campo.escopo === "item") {
      valor = resolverItem(doc, campo.caminho, numeroDeTexto, campo.agregacao);
    } else {
      const no = selecionarTodos(doc, campo.caminho)[0] ?? null;
      valor = numeroDeTexto(textoDe(no));
    }
  } else if (campo.estrategia === "texto_livre") {
    const padroes = padroesDoCampo(campo.padrao_regex);
    const grupo = campo.grupo_captura ?? 1;
    const extrair = (texto: string) => extrairNumeroPorRegex(texto, padroes, grupo);
    const origem = campo.origem_texto ?? "";
    if (!padroes.length || !origem) {
      valor = null;
    } else if (campo.escopo === "item") {
      valor = resolverItem(doc, origem, extrair, campo.agregacao);
    } else {
      valor = extrair(textoDe(selecionar(doc, origem)));
    }
  } else if (campo.estrategia === "derivado") {
    valor = resolverDerivado(campo, doc, catalogo, visitados);
  }

  if ((valor == null || !Number.isFinite(valor)) && campo.campo_fallback_id) {
    const fb = catalogo.find((c) => c.id === campo.campo_fallback_id);
    if (fb) valor = resolverCampo(fb, doc, catalogo, visitados);
  }

  return valor != null && Number.isFinite(valor) ? valor : null;
}

/**
 * Resolve todos os campos ativos do catálogo. Campos que não encontram valor no
 * XML entram como 0 (ausência da tag na nota), mas a CHAVE sempre existe — é a
 * ausência da chave que sinaliza "campo não cadastrado" para o motor de fluxo.
 */
export function resolverCamposXml(
  doc: XmlNode,
  catalogo: CampoXmlDef[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const campo of catalogo) {
    if (!campo.ativo) continue;
    out[campo.codigo] = resolverCampo(campo, doc, catalogo) ?? 0;
  }
  return out;
}
