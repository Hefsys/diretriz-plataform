/**
 * Importação única dos dados do sistema Fronteira antigo (projeto Supabase
 * próprio) para as tabelas ff_* da plataforma.
 *
 * - O usuário entra com o login DELE no sistema antigo (a senha vai direto
 *   para o Supabase do sistema antigo; nada é guardado).
 * - Os IDs originais são preservados (upsert por id) → pode rodar de novo
 *   sem duplicar.
 * - Empresas são casadas com as da plataforma pelo CNPJ (ou pela IE).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { db } from "@/lib/dp/db";

// Endereço e chave pública (publishable) do projeto antigo — a mesma que
// está no repositório Hefsys/fronteira-fiscal-guard.
const LEGADO_URL = "https://otdifcbuagnuhlcgkwlx.supabase.co";
const LEGADO_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90ZGlmY2J1YWdudWhsY2drd2x4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2ODIzODQsImV4cCI6MjA5MjI1ODM4NH0.U7YwthaAASpiMvLpQTpoAZFT3hpmqPKT1nAVZIG36ew";

export function clienteLegado(): SupabaseClient {
  return createClient(LEGADO_URL, LEGADO_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: "fronteira-legado" },
  });
}

type Linha = Record<string, unknown>;
const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

/** Lê uma tabela inteira do sistema antigo (paginado de 1000 em 1000). */
async function lerTudo(sb: SupabaseClient, tabela: string): Promise<Linha[]> {
  const todas: Linha[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from(tabela).select("*").range(de, de + 999);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    todas.push(...((data ?? []) as Linha[]));
    if (!data || data.length < 1000) break;
  }
  return todas;
}

/** Mantém só as colunas que existem na tabela de destino. */
const pegar = (l: Linha, cols: string[]): Linha => Object.fromEntries(cols.filter((c) => c in l).map((c) => [c, l[c]]));

async function gravar(tabela: string, linhas: Linha[]) {
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await db.from(tabela).upsert(linhas.slice(i, i + 500), { onConflict: "id" });
    if (error) throw new Error(`${tabela}: ${error.message}`);
  }
}

const VIG = ["vigencia_inicio", "vigencia_fim"];
const TABELAS_REFERENCIA: { origem: string; destino: string; cols: string[] }[] = [
  { origem: "aliquotas_internas", destino: "ff_aliquotas_internas", cols: ["id", "ncm", "descricao", "aliquota", "fecp", ...VIG, "base_legal", "observacoes", "created_at"] },
  { origem: "mvas", destino: "ff_mvas", cols: ["id", "ncm", "cest", "descricao", "mva_original", "mva_ajustada_4", "mva_ajustada_7", "mva_ajustada_12", ...VIG, "base_legal", "created_at"] },
  { origem: "pautas_fiscais", destino: "ff_pautas_fiscais", cols: ["id", "ncm", "descricao", "valor_pauta", "unidade", "comparacao", ...VIG, "base_legal", "created_at"] },
  { origem: "ncms_regimes", destino: "ff_ncms_regimes", cols: ["id", "ncm", "cest", "descricao", "regime", "tem_liberacao", "codigo_dispositivo", ...VIG, "base_legal", "created_at"] },
  { origem: "regras_calculo", destino: "ff_regras_calculo", cols: ["id", "codigo", "descricao", "cfops_aplicaveis", "csts_aplicaveis", "regime_destino", "formula_template", "prioridade", ...VIG, "base_legal", "ativa", "created_at", "updated_at"] },
  { origem: "excecoes_ncm", destino: "ff_excecoes_ncm", cols: ["id", "ncm", "cest", "descricao", "regime_override", "motivo", ...VIG, "base_legal", "created_at", "updated_at"] },
  { origem: "creditos_simples_nacional", destino: "ff_creditos_simples_nacional", cols: ["id", "ncm", "cnae", "descricao", "percentual_credito", ...VIG, "base_legal", "created_at", "updated_at"] },
  { origem: "anexos_cnae", destino: "ff_anexos_cnae", cols: ["id", "anexo", "cnae", "descricao", "mva", ...VIG] },
  { origem: "logicas_calculo", destino: "ff_logicas_calculo", cols: ["id", "nome", "descricao", "formula_codigo", "parametros", "campos_usuario", "fluxo", "ativa", "created_at"] },
  { origem: "logica_ncm_legislacao", destino: "ff_logica_ncm_legislacao", cols: ["id", "logica_id", "ncm", "descricao_produto", "legislacao_valor", "unidade", "fluxo", ...VIG, "created_at"] },
];
const COLS_CAMPOS = ["id", "codigo", "label", "descricao", "escopo", "tipo", "estrategia", "caminho", "origem_texto", "padrao_regex", "grupo_captura", "agregacao", "xml_amostra_path", "valor_esperado", "sistema", "ativo", "ordem", "criado_em", "atualizado_em"];
const COLS_PERFIL = ["id", "vigencia_inicio", "vigencia_fim", "cnae", "porte", "regime", "flags", "sistematicas_especiais", "aliquota_interna_default", "created_at"];
const COLS_SESSAO = ["id", "periodo_fiscal", "numero_extrato", "passo_atual", "status", "logica_calculo_id", "inputs_usuario", "total_casos", "total_calculados", "total_corretos", "total_divergencia_maior", "total_divergencia_menor", "total_sem_xml", "total_xmls_enviados", "total_xmls_ignorados", "total_xmls_descartados", "total_sefaz_sem_xml", "valor_recuperavel", "created_at", "concluida_em"];
const COLS_NOTA = ["id", "sessao_id", "nnf", "cnpj_emitente", "nome_emitente", "valor_nf", "icms_sefaz", "icms_calculado", "diferenca", "icms_xml_editado", "motivo_edicao", "created_at"];
const COLS_AJUSTE = ["id", "nnf", "cnpj_emitente", "inscricao_estadual", "periodo_fiscal", "icms_xml_original", "icms_xml_novo", "motivo", "usuario_email", "created_at"];

export type EmpresaLegado = { id: string; razao_social: string; cnpj: string | null; inscricao_estadual: string | null };
export type Casamento = { legado: EmpresaLegado; empresaId: string | null; criterio: "cnpj" | "ie" | null };

/** Casa as empresas do sistema antigo com as da plataforma (CNPJ; senão IE). */
export async function casarEmpresas(sb: SupabaseClient): Promise<Casamento[]> {
  const [legado, atuais] = await Promise.all([
    lerTudo(sb, "empresas"),
    db.from("empresas").select("id, cnpj, inscricao_estadual"),
  ]);
  if (atuais.error) throw new Error(atuais.error.message);
  const daPlataforma = (atuais.data ?? []) as { id: string; cnpj: string | null; inscricao_estadual: string | null }[];
  return (legado as unknown as EmpresaLegado[]).map((e) => {
    const cnpj = soDigitos(e.cnpj);
    const ie = soDigitos(e.inscricao_estadual);
    const porCnpj = cnpj ? daPlataforma.filter((p) => soDigitos(p.cnpj) === cnpj) : [];
    if (porCnpj.length === 1) return { legado: e, empresaId: porCnpj[0].id, criterio: "cnpj" as const };
    const porIe = ie ? daPlataforma.filter((p) => soDigitos(p.inscricao_estadual) === ie) : [];
    if (porIe.length === 1) return { legado: e, empresaId: porIe[0].id, criterio: "ie" as const };
    return { legado: e, empresaId: null, criterio: null };
  }).sort((a, b) => a.legado.razao_social.localeCompare(b.legado.razao_social));
}

export type ResumoImportacao = { tabela: string; importadas: number; ignoradas: number }[];

/**
 * Copia tudo. Perfis e auditorias de empresas que não casaram com nenhuma
 * empresa da plataforma são ignorados (e contados no resumo).
 */
export async function importarTudo(sb: SupabaseClient, casamentos: Casamento[], progresso: (msg: string) => void): Promise<ResumoImportacao> {
  const resumo: ResumoImportacao = [];
  const mapa = new Map(casamentos.filter((c) => c.empresaId).map((c) => [c.legado.id, c.empresaId as string]));

  for (const t of TABELAS_REFERENCIA) {
    progresso(`Copiando ${t.origem}…`);
    const linhas = (await lerTudo(sb, t.origem)).map((l) => pegar(l, t.cols));
    await gravar(t.destino, linhas);
    resumo.push({ tabela: t.origem, importadas: linhas.length, ignoradas: 0 });
  }

  progresso("Copiando campos do XML…");
  const campos = await lerTudo(sb, "campos_xml");
  // 1ª passada sem o "campo reserva" (referência entre campos); 2ª passada liga as referências.
  await gravar("ff_campos_xml", campos.map((c) => ({ ...pegar(c, COLS_CAMPOS), campo_fallback_id: null })));
  for (const c of campos.filter((c) => c.campo_fallback_id)) {
    const { error } = await db.from("ff_campos_xml").update({ campo_fallback_id: c.campo_fallback_id }).eq("id", c.id as string);
    if (error) throw new Error(`campos_xml: ${error.message}`);
  }
  resumo.push({ tabela: "campos_xml", importadas: campos.length, ignoradas: 0 });

  progresso("Copiando perfis fiscais…");
  const perfis = await lerTudo(sb, "perfis_fiscais");
  const perfisOk: Linha[] = perfis.filter((p) => mapa.has(p.empresa_id as string))
    .map((p) => ({ ...pegar(p, COLS_PERFIL), empresa_id: mapa.get(p.empresa_id as string), created_by: null }));
  await gravar("ff_perfis_fiscais", perfisOk);
  resumo.push({ tabela: "perfis_fiscais", importadas: perfisOk.length, ignoradas: perfis.length - perfisOk.length });

  progresso("Copiando histórico de auditorias…");
  const sessoes = await lerTudo(sb, "sessoes_auditoria");
  const sessoesOk: Linha[] = sessoes.filter((s) => mapa.has(s.empresa_id as string))
    .map((s) => ({ ...pegar(s, COLS_SESSAO), empresa_id: mapa.get(s.empresa_id as string), created_by: null }));
  await gravar("ff_sessoes_auditoria", sessoesOk);
  resumo.push({ tabela: "sessoes_auditoria", importadas: sessoesOk.length, ignoradas: sessoes.length - sessoesOk.length });

  const idsSessoes = new Set(sessoesOk.map((s) => s.id as string));
  const notas = await lerTudo(sb, "conferencia_notas");
  const notasOk = notas.filter((n) => idsSessoes.has(n.sessao_id as string)).map((n) => pegar(n, COLS_NOTA));
  await gravar("ff_conferencia_notas", notasOk);
  resumo.push({ tabela: "conferencia_notas", importadas: notasOk.length, ignoradas: notas.length - notasOk.length });

  progresso("Copiando ajustes manuais…");
  const ajustes = (await lerTudo(sb, "ajustes_conferencia")).map((a) => ({ ...pegar(a, COLS_AJUSTE), usuario_id: null }));
  await gravar("ff_ajustes_conferencia", ajustes);
  resumo.push({ tabela: "ajustes_conferencia", importadas: ajustes.length, ignoradas: 0 });

  return resumo;
}
