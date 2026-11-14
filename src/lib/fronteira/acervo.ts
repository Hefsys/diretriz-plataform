import { z } from "zod";
export type Fonte = {
  id: string; chave: string; titulo: string; arquivo: string; categoria: string;
  atualizado_em: string | null; vigencia_inicio: string | null; vigencia_fim: string | null;
  status: string; substituido_por: string | null; paginas: number | null; observacao: string | null;
  storage_path: string | null; created_at: string;
};
export const categorias = {
  NUCLEO_CALCULO: "Núcleo de cálculo",
  SISTEMATICA_SETORIAL: "Sistemática setorial",
  BENEFICIO_PROGRAMA: "Benefício / programa",
  OPERACAO_ESPECIAL: "Operação especial",
  OBRIGACAO_ACESSORIA: "Obrigação acessória",
  FORA_DO_ESCOPO_ICMS: "Fora do escopo ICMS",
  OUTROS: "Outros",
};
const texto = z.string().min(1);
const data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();
const opcional = z.string().nullable().optional();
export const fonteSchema = z.object({
  chave: texto.regex(/^[A-Za-z0-9_-]+$/),
  titulo: texto,
  arquivo: texto,
  categoria: z.enum([
    "NUCLEO_CALCULO",
    "SISTEMATICA_SETORIAL",
    "BENEFICIO_PROGRAMA",
    "OPERACAO_ESPECIAL",
    "OBRIGACAO_ACESSORIA",
    "FORA_DO_ESCOPO_ICMS",
    "OUTROS",
  ]),
  atualizado_em: data,
  vigencia_inicio: data,
  vigencia_fim: data,
  status: z.enum(["VIGENTE", "HISTORICO"]).default("VIGENTE"),
  substituido_por: opcional,
  paginas: z.number().int().positive().nullable().optional(),
  observacao: opcional,
});
export const trechoSchema = z.object({
  fonte_chave: texto,
  item: texto,
  titulo: texto,
  caminho: opcional,
  parte: z.number().int().nullable().optional(),
  fundamento: opcional,
  fundamento_herdado: opcional,
  texto,
});
export const regraSchema = z.object({
  id: texto,
  nome: texto,
  tipo: z.enum(["CALCULO", "AJUSTE", "INAPLICABILIDADE", "SUJEICAO", "INFORMATIVA"]),
  descricao: texto,
  condicoes: z.record(z.string(), z.unknown()).default({}),
  formula: opcional,
  parametros: z.record(z.string(), z.unknown()).default({}),
  codigo_receita: opcional,
  prazo_recolhimento: opcional,
  fundamentos: z.array(z.record(z.string(), z.unknown())).default([]),
  vigencia_inicio: data,
  vigencia_fim: data,
  exemplos_oficiais: z.array(z.string()).default([]),
  observacoes: opcional,
  implementada_no_motor: z.boolean().default(false),
});
export const anexoSchema = z.object({
  anexo: z.union([
    z.literal(11),
    z.literal(12),
    z.literal(13),
    z.literal(14),
    z.literal(15),
    z.literal(19),
  ]),
  cnae: z.string().regex(/^\d{7}$/),
  descricao: texto,
  mva: z.number().nullable().optional(),
  vigencia_inicio: data,
  vigencia_fim: data,
});
export const PDF_CONCORRENCIA = 3;
export const TAMANHO_LOTE = 200;
export const PDF_DURACAO = 600;
export function normalizarArquivo(nome: string) {
  return nome
    .normalize("NFC")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s,\-."'“”‘’]+/g, " ")
    .trim();
}
export function corresponderFonte(nome: string, fontes: Fonte[]) {
  const matches = fontes.filter((f) => normalizarArquivo(f.arquivo) === normalizarArquivo(nome));
  return matches.length === 1 ? matches[0] : undefined;
}
/** PDFs ficam no bucket privado ff-acervo, numa pasta por escritório. */
export const BUCKET_ACERVO = "ff-acervo";
export function caminhoPdf(chave: string, escritorioId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(chave)) throw new Error("Chave de informativo inválida");
  return `${escritorioId}/informativos/${chave}.pdf`;
}
export function dividirItens(item: string) {
  return [
    ...new Set(
      item
        .split(/\s*\/\s*/)
        .map((i) => i.trim())
        .filter(Boolean),
    ),
  ];
}
export function lotes<T>(linhas: T[], tamanho = TAMANHO_LOTE) {
  const resultado: T[][] = [];
  for (let i = 0; i < linhas.length; i += tamanho) resultado.push(linhas.slice(i, i + tamanho));
  return resultado;
}
export function podeGerirAcervo(papel: string | null) {
  return papel === "admin" || papel === "fiscal";
}
export function preservarFonte(nova: z.infer<typeof fonteSchema>, antiga?: Fonte) {
  return { ...nova, storage_path: antiga?.storage_path ?? null };
}
export function preservarValidacao(
  nova: z.infer<typeof regraSchema>,
  antiga?: { status: string; validado_por: string | null; validado_em: string | null },
) {
  return {
    ...nova,
    status: antiga?.status ?? "RASCUNHO",
    validado_por: antiga?.validado_por ?? null,
    validado_em: antiga?.validado_em ?? null,
  };
}
export function formatarData(valor: string | null) {
  return valor ? valor.split("-").reverse().join("/") : "sem data";
}
export function vigencia(fonte: Fonte) {
  return !fonte.vigencia_inicio && !fonte.vigencia_fim
    ? "sem data"
    : `${formatarData(fonte.vigencia_inicio)} a ${formatarData(fonte.vigencia_fim)}`;
}
