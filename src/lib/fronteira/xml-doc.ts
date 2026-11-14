// Árvore XML única do projeto.
//
// Padronizada em fast-xml-parser (DOMParser não existe no runtime do
// Cloudflare Workers). Os nomes de tag são normalizados sem namespace, para que
// caminhos como `total>ICMSTot>vProd` funcionem em qualquer XML de NF-e.
//
// Módulo puro: sem I/O.

import { XMLParser } from "fast-xml-parser";

export interface XmlNode {
  nome: string;
  texto: string;
  atributos: Record<string, string>;
  filhos: XmlNode[];
}

const TEXTO = "#text";

function nomeLocal(tag: string): string {
  const i = tag.indexOf(":");
  return i === -1 ? tag : tag.slice(i + 1);
}

type EntradaOrdenada = Record<string, unknown>;

function construir(nome: string, entradas: unknown, attrs: unknown): XmlNode {
  const no: XmlNode = { nome, texto: "", atributos: {}, filhos: [] };

  if (attrs && typeof attrs === "object") {
    for (const [k, v] of Object.entries(attrs as Record<string, unknown>)) {
      no.atributos[nomeLocal(k.replace(/^@_/, ""))] = String(v ?? "");
    }
  }

  if (!Array.isArray(entradas)) return no;

  const partesTexto: string[] = [];
  for (const bruto of entradas) {
    if (!bruto || typeof bruto !== "object") continue;
    const entrada = bruto as EntradaOrdenada;
    for (const [chave, valor] of Object.entries(entrada)) {
      if (chave === ":@") continue;
      if (chave === TEXTO) {
        const t = String(valor ?? "").trim();
        if (t) partesTexto.push(t);
        continue;
      }
      no.filhos.push(
        construir(nomeLocal(chave), valor, (entrada[":@"] as unknown) ?? null),
      );
    }
  }
  no.texto = partesTexto.join(" ");
  return no;
}

/** Faz o parse do XML e devolve o nó raiz sintético `#documento`. */
export function parseXmlDoc(xml: string): XmlNode {
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    ignoreDeclaration: true,
    ignorePiTags: true,
  });
  const arvore = parser.parse(xml) as unknown;
  return construir("#documento", arvore, null);
}

/** Todos os descendentes (em qualquer profundidade) com o nome informado. */
export function descendentesPorNome(raiz: XmlNode, nome: string): XmlNode[] {
  const out: XmlNode[] = [];
  const pilha: XmlNode[] = [...raiz.filhos];
  while (pilha.length) {
    const n = pilha.shift()!;
    if (n.nome === nome) out.push(n);
    if (n.filhos.length) pilha.unshift(...n.filhos);
  }
  return out;
}

/** Caminho `a>b>c`: procura `a` em qualquer profundidade e depois desce filho a filho. */
export function selecionarTodos(raiz: XmlNode, caminho: string): XmlNode[] {
  const segs = caminho.split(">").map((s) => s.trim()).filter(Boolean);
  if (!segs.length) return [];
  let atuais = descendentesPorNome(raiz, segs[0]);
  for (const seg of segs.slice(1)) {
    atuais = atuais.flatMap((n) => n.filhos.filter((f) => f.nome === seg));
  }
  return atuais;
}

export function selecionar(raiz: XmlNode, caminho: string): XmlNode | null {
  return selecionarTodos(raiz, caminho)[0] ?? null;
}

/** Texto do nó, incluindo o texto dos descendentes. */
export function textoDe(no: XmlNode | null | undefined): string {
  if (!no) return "";
  const partes = [no.texto, ...no.filhos.map((f) => textoDe(f))];
  return partes.filter(Boolean).join(" ").trim();
}

export function textoNoCaminho(raiz: XmlNode, caminho: string): string {
  return textoDe(selecionar(raiz, caminho));
}

/** Converte texto XML em número (aceita 1234.56 e 1234,56). */
export function numeroDeTexto(texto: string): number | null {
  const t = (texto ?? "").trim();
  if (!t) return null;
  const v = Number(t.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

export function numeroNoCaminho(raiz: XmlNode, caminho: string): number {
  return numeroDeTexto(textoNoCaminho(raiz, caminho)) ?? 0;
}

export function atributoNoCaminho(
  raiz: XmlNode,
  caminho: string,
  atributo: string,
): string {
  return selecionar(raiz, caminho)?.atributos[atributo] ?? "";
}
