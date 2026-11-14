/**
 * Importação do acervo (informativos, trechos, regras e anexos de CNAE) pelo
 * navegador — equivalente à server function do sistema original. As funções
 * SQL e o RLS garantem que só administradores gravem e só no próprio escritório.
 */
import type { z } from "zod";
import { db } from "@/lib/dp/db";
import { anexoSchema, fonteSchema, preservarFonte, preservarValidacao, regraSchema, trechoSchema, type Fonte } from "./acervo";

type Entrada =
  | { tipo: "fontes"; linhas: z.infer<typeof fonteSchema>[] }
  | { tipo: "regras"; linhas: z.infer<typeof regraSchema>[] }
  | { tipo: "anexos"; linhas: z.infer<typeof anexoSchema>[] }
  | { tipo: "trechos"; linhas: z.infer<typeof trechoSchema>[]; primeiro: boolean };

export async function importarAcervo({ data }: { data: Entrada }): Promise<{ importados: number }> {
  if (data.tipo === "fontes") {
    const existentes = await db.from("ff_fontes_legais").select("*");
    if (existentes.error) throw existentes.error;
    const rows = data.linhas.map((l) => preservarFonte(l, (existentes.data as Fonte[]).find((f) => f.chave === l.chave)));
    const res = await db.from("ff_fontes_legais").upsert(rows, { onConflict: "escritorio_id,chave" });
    if (res.error) throw res.error;
  } else if (data.tipo === "regras") {
    const existentes = await db.from("ff_regras_fiscais").select("id,status,validado_por,validado_em");
    if (existentes.error) throw existentes.error;
    const rows = data.linhas.map((l) =>
      preservarValidacao(l, (existentes.data as { id: string; status: string; validado_por: string | null; validado_em: string | null }[]).find((r) => r.id === l.id)));
    const res = await db.from("ff_regras_fiscais").upsert(rows, { onConflict: "escritorio_id,id" });
    if (res.error) throw res.error;
  } else if (data.tipo === "anexos") {
    const res = await db.rpc("ff_importar_anexos_acervo", { linhas: data.linhas });
    if (res.error) throw res.error;
  } else {
    const res = await db.rpc("ff_importar_trechos_acervo", { linhas: data.linhas, primeiro: data.primeiro });
    if (res.error) throw res.error;
  }
  return { importados: data.linhas.length };
}
