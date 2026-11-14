/**
 * Monta o contexto fiscal (perfil vigente + tabelas do motor) e calcula as
 * notas pelas fórmulas oficiais. No sistema original isso rodava em
 * "server functions"; aqui roda no navegador com o cliente Supabase do
 * usuário (as políticas de RLS isolam os dados por escritório).
 */
import { db } from "@/lib/dp/db";
import {
  calcularPorIcmsAntecipado, calcularPorUsoConsumo, memoriaPendente,
  type MemoriaCalculo, type NotaXML,
} from "./fronteiraFiscal";
import type { ContextoCalculo } from "./motor-calculo";

export const soDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

type TabelasMotor = Pick<ContextoCalculo,
  "regras" | "aliquotas_internas" | "mvas" | "pautas" | "ncms_regimes" | "excecoes" | "creditos_sn">;

/** Tabelas de referência (iguais para todas as notas) — carregadas uma vez por cálculo. */
async function carregarTabelas(): Promise<TabelasMotor> {
  const consultas = await Promise.all([
    db.from("ff_regras_calculo").select("*").eq("ativa", true),
    db.from("ff_aliquotas_internas").select("*"),
    db.from("ff_mvas").select("*"),
    db.from("ff_pautas_fiscais").select("*"),
    db.from("ff_ncms_regimes").select("*"),
    db.from("ff_excecoes_ncm").select("*"),
    db.from("ff_creditos_simples_nacional").select("*"),
  ]);
  for (const r of consultas) if (r.error) throw new Error("Não foi possível carregar as tabelas fiscais");
  const [regras, aliq, mvas, pautas, ncms, exc, cred] = consultas.map((r) => r.data ?? []);
  return {
    regras: regras as ContextoCalculo["regras"],
    aliquotas_internas: aliq as ContextoCalculo["aliquotas_internas"],
    mvas: mvas as ContextoCalculo["mvas"],
    pautas: pautas as ContextoCalculo["pautas"],
    ncms_regimes: ncms as ContextoCalculo["ncms_regimes"],
    excecoes: exc as ContextoCalculo["excecoes"],
    creditos_sn: cred as ContextoCalculo["creditos_sn"],
  };
}

/** MVA do Anexo 12 para o CNAE na data (equivalente à função SQL mva_anexo12). */
async function mvaAnexo12(cnae: string, data: string): Promise<number | null> {
  const { data: linhas, error } = await db
    .from("ff_anexos_cnae")
    .select("mva, vigencia_inicio, vigencia_fim")
    .eq("anexo", 12)
    .eq("cnae", soDigitos(cnae));
  if (error) throw new Error("Não foi possível consultar a MVA do Anexo 12");
  type LinhaAnexo = { mva: number | null; vigencia_inicio: string | null; vigencia_fim: string | null };
  const vigentes = ((linhas ?? []) as LinhaAnexo[])
    .filter((l) => (!l.vigencia_inicio || l.vigencia_inicio <= data) && (!l.vigencia_fim || l.vigencia_fim >= data))
    .sort((a, b) => String(b.vigencia_inicio ?? "").localeCompare(String(a.vigencia_inicio ?? "")));
  const mva = vigentes[0]?.mva;
  return mva != null ? Number(mva) : null;
}

async function perfilVigente(empresaId: string, data: string): Promise<ContextoCalculo["perfil"]> {
  const { data: perfil, error } = await db
    .from("ff_perfis_fiscais")
    .select("*")
    .eq("empresa_id", empresaId)
    .lte("vigencia_inicio", data)
    .or(`vigencia_fim.is.null,vigencia_fim.gte.${data}`)
    .order("vigencia_inicio", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Não foi possível carregar o perfil fiscal da empresa");
  if (!perfil) return null;
  const cnaePrincipal = perfil.cnae?.split("/")[0]?.trim();
  return {
    regime: perfil.regime,
    aliquota_interna_default: Number(perfil.aliquota_interna_default ?? 20.5),
    cnae: perfil.cnae,
    porte: perfil.porte,
    flags: (perfil.flags ?? null) as Record<string, unknown> | null,
    mva_anexo12: cnaePrincipal ? await mvaAnexo12(cnaePrincipal, data) : null,
  };
}

/**
 * Calcula cada nota com o perfil fiscal da empresa destinatária vigente na
 * data de emissão. Notas sem empresa/perfil viram memória "pendente" com o motivo.
 */
export async function calcularNotasOficiais(
  formula: "ICMS_ANTECIPADO" | "USO_E_CONSUMO",
  notas: NotaXML[],
): Promise<Record<string, MemoriaCalculo>> {
  const [tabelas, empresasRes] = await Promise.all([
    carregarTabelas(),
    db.from("empresas").select("id, cnpj"),
  ]);
  if (empresasRes.error) throw new Error("Não foi possível carregar as empresas");
  const empresas = (empresasRes.data ?? []) as { id: string; cnpj: string | null }[];

  const memorias: Record<string, MemoriaCalculo> = {};
  const cache = new Map<string, ContextoCalculo>();
  for (const nota of notas) {
    try {
      const cnpj = soDigitos(nota.cnpjDestinatario);
      if (!cnpj) throw new Error("XML sem CNPJ do destinatário para identificar o perfil fiscal");
      const candidatas = empresas.filter((e) => soDigitos(e.cnpj) === cnpj);
      if (candidatas.length !== 1) throw new Error("Cadastre a empresa destinatária da nota e seu perfil fiscal");
      if (!nota.data_emissao) throw new Error("Informe a data de emissão da nota (dhEmi ou dEmi no XML)");
      const chave = `${candidatas[0].id}|${nota.data_emissao}|${nota.ufEmitente}`;
      let ctx = cache.get(chave);
      if (!ctx) {
        ctx = {
          data_referencia: nota.data_emissao,
          uf_origem: nota.ufEmitente,
          uf_destino: "PE",
          perfil: await perfilVigente(candidatas[0].id, nota.data_emissao),
          ...tabelas,
        };
        cache.set(chave, ctx);
      }
      memorias[nota.chaveAcesso] = formula === "USO_E_CONSUMO"
        ? calcularPorUsoConsumo(nota, { difal_percentual: 0 }, ctx)
        : calcularPorIcmsAntecipado(nota, { aliquota_interna: 0 }, ctx);
    } catch (erro) {
      memorias[nota.chaveAcesso] = memoriaPendente(nota, erro instanceof Error ? erro.message : "Não foi possível carregar o perfil fiscal", formula);
    }
  }
  return memorias;
}
