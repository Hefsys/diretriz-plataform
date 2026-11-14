import { db } from "@/lib/dp/db";
import { CAMPOS_PRE_CADASTRADOS, LOGICAS_PRE_CADASTRADAS } from "./fiscal-pe/logicas-pre-cadastradas";

/** Instala campos e lógicas pré-cadastrados sem duplicar nem alterar os existentes. */
export async function instalarLogicasPreCadastradas() {
  const { data: campos, error: e1 } = await db.from("ff_campos_xml").select("codigo");
  if (e1) throw new Error(e1.message);
  const existentesCampos = new Set((campos ?? []).map((c: { codigo: string }) => c.codigo));
  const novosCampos = CAMPOS_PRE_CADASTRADOS.filter((c) => !existentesCampos.has(c.codigo)).map((c) => ({
    codigo: c.codigo, label: c.label, caminho: c.caminho, ordem: c.ordem,
    escopo: "nota", tipo: "moeda", estrategia: "caminho", sistema: true, ativo: true,
  }));
  if (novosCampos.length) {
    const { error } = await db.from("ff_campos_xml").insert(novosCampos);
    if (error) throw new Error(error.message);
  }

  const { data: logicas, error: e2 } = await db.from("ff_logicas_calculo").select("parametros");
  if (e2) throw new Error(e2.message);
  const codigos = new Set(
    (logicas ?? []).map((l: { parametros: Record<string, unknown> | null }) => l.parametros?.codigo).filter(Boolean),
  );
  const novasLogicas = LOGICAS_PRE_CADASTRADAS.filter((l) => !codigos.has(l.codigo)).map((l) => ({
    nome: l.nome, descricao: l.descricao, formula_codigo: "FLUXO_VISUAL",
    fluxo: l.fluxo, campos_usuario: [], ativa: true,
    parametros: { aliquota_interna: 20.5, codigo: l.codigo, regra_fiscal_id: l.regra, pre_cadastrada: true },
  }));
  if (novasLogicas.length) {
    const { error } = await db.from("ff_logicas_calculo").insert(novasLogicas);
    if (error) throw new Error(error.message);
  }
  return {
    camposInseridos: novosCampos.length,
    camposExistentes: CAMPOS_PRE_CADASTRADOS.length - novosCampos.length,
    logicasInseridas: novasLogicas.length,
    logicasExistentes: LOGICAS_PRE_CADASTRADAS.length - novasLogicas.length,
  };
}
