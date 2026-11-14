-- ═══════════════════════════════════════════════════════════════════
-- Fiscal → Fronteira (auditoria do ICMS Fronteira SEFAZ-PE)
-- Etapa 1: perfil fiscal das empresas, tabelas do motor de cálculo,
-- fórmulas (lógicas), campos do XML e histórico de auditorias.
-- Tudo isolado por escritório (dp_escritorio_id) e prefixado com ff_.
-- Requer 20261105_departamento_pessoal.sql (dp_escritorio_id).
-- Execute no Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────── Perfil fiscal da empresa (com vigência) ───────────────
CREATE TABLE IF NOT EXISTS public.ff_perfis_fiscais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id uuid NOT NULL DEFAULT public.dp_escritorio_id() REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  vigencia_inicio date NOT NULL,
  vigencia_fim date,
  cnae varchar(40),
  porte text,
  regime text,
  flags jsonb DEFAULT '{}'::jsonb,
  sistematicas_especiais text[] DEFAULT '{}',
  aliquota_interna_default numeric(5,2) DEFAULT 20.50,
  created_at timestamptz DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);
CREATE INDEX IF NOT EXISTS ff_perfis_empresa_idx ON public.ff_perfis_fiscais(empresa_id, vigencia_inicio);

-- ─────────────── Tabelas de referência do motor ───────────────
CREATE TABLE IF NOT EXISTS public.ff_aliquotas_internas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id uuid NOT NULL DEFAULT public.dp_escritorio_id() REFERENCES auth.users(id) ON DELETE CASCADE,
  ncm varchar(10),
  descricao text,
  aliquota numeric(5,2) NOT NULL,
  fecp numeric(5,2) DEFAULT 0,
  vigencia_inicio date NOT NULL,
  vigencia_fim date,
  base_legal text,
  observacoes text,
  created_at timestamptz DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);

CREATE TABLE IF NOT EXISTS public.ff_mvas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id uuid NOT NULL DEFAULT public.dp_escritorio_id() REFERENCES auth.users(id) ON DELETE CASCADE,
  ncm varchar(10) NOT NULL,
  cest varchar(10),
  descricao text,
  mva_original numeric(7,4) NOT NULL,
  mva_ajustada_4 numeric(7,4),
  mva_ajustada_7 numeric(7,4),
  mva_ajustada_12 numeric(7,4),
  vigencia_inicio date NOT NULL,
  vigencia_fim date,
  base_legal text,
  created_at timestamptz DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);

CREATE TABLE IF NOT EXISTS public.ff_pautas_fiscais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id uuid NOT NULL DEFAULT public.dp_escritorio_id() REFERENCES auth.users(id) ON DELETE CASCADE,
  ncm varchar(10) NOT NULL,
  descricao text NOT NULL,
  valor_pauta numeric(12,4) NOT NULL,
  unidade text,
  comparacao text DEFAULT 'MAIOR' CHECK (comparacao IN ('MAIOR','MENOR','FIXO')),
  vigencia_inicio date NOT NULL,
  vigencia_fim date,
  base_legal text,
  created_at timestamptz DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);

CREATE TABLE IF NOT EXISTS public.ff_ncms_regimes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id uuid NOT NULL DEFAULT public.dp_escritorio_id() REFERENCES auth.users(id) ON DELETE CASCADE,
  ncm varchar(10) NOT NULL,
  cest varchar(10),
  descricao text,
  regime text NOT NULL CHECK (regime IN ('ST','ANTECIPACAO','DIFAL','NORMAL','ISENTO')),
  tem_liberacao boolean,
  codigo_dispositivo varchar(20),
  vigencia_inicio date NOT NULL,
  vigencia_fim date,
  base_legal text,
  created_at timestamptz DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);

CREATE TABLE IF NOT EXISTS public.ff_regras_calculo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id uuid NOT NULL DEFAULT public.dp_escritorio_id() REFERENCES auth.users(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  descricao text NOT NULL,
  cfops_aplicaveis text[] NOT NULL DEFAULT '{}',
  csts_aplicaveis text[] NOT NULL DEFAULT '{}',
  regime_destino text NOT NULL CHECK (regime_destino IN ('ST','ANTECIPACAO','DIFAL','NORMAL','ISENTO')),
  formula_template jsonb NOT NULL DEFAULT '{}'::jsonb,
  prioridade int NOT NULL DEFAULT 100,
  vigencia_inicio date NOT NULL,
  vigencia_fim date,
  base_legal text,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);

CREATE TABLE IF NOT EXISTS public.ff_excecoes_ncm (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id uuid NOT NULL DEFAULT public.dp_escritorio_id() REFERENCES auth.users(id) ON DELETE CASCADE,
  ncm varchar NOT NULL,
  cest varchar,
  descricao text,
  regime_override text NOT NULL CHECK (regime_override IN ('ST','ANTECIPACAO','DIFAL','NORMAL','ISENTO')),
  motivo text,
  vigencia_inicio date NOT NULL,
  vigencia_fim date,
  base_legal text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);

CREATE TABLE IF NOT EXISTS public.ff_creditos_simples_nacional (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id uuid NOT NULL DEFAULT public.dp_escritorio_id() REFERENCES auth.users(id) ON DELETE CASCADE,
  ncm varchar,
  cnae varchar,
  descricao text,
  percentual_credito numeric NOT NULL,
  vigencia_inicio date NOT NULL,
  vigencia_fim date,
  base_legal text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);

-- Anexos do Decreto (CNAE → MVA do Anexo 12 etc.)
CREATE TABLE IF NOT EXISTS public.ff_anexos_cnae (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id uuid NOT NULL DEFAULT public.dp_escritorio_id() REFERENCES auth.users(id) ON DELETE CASCADE,
  anexo smallint NOT NULL CHECK (anexo IN (11,12,13,14,15,19)),
  cnae varchar(7) NOT NULL,
  descricao text NOT NULL,
  mva numeric(6,2),
  vigencia_inicio date,
  vigencia_fim date
);
CREATE INDEX IF NOT EXISTS ff_anexos_cnae_idx ON public.ff_anexos_cnae(escritorio_id, anexo, cnae);

-- ─────────────── Fórmulas (lógicas de cálculo) ───────────────
CREATE TABLE IF NOT EXISTS public.ff_logicas_calculo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id uuid NOT NULL DEFAULT public.dp_escritorio_id() REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  formula_codigo text NOT NULL,
  parametros jsonb NOT NULL DEFAULT '{}'::jsonb,
  campos_usuario jsonb NOT NULL DEFAULT '[]'::jsonb,
  fluxo jsonb NOT NULL DEFAULT '[]'::jsonb,
  ativa boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);

CREATE TABLE IF NOT EXISTS public.ff_logica_ncm_legislacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id uuid NOT NULL DEFAULT public.dp_escritorio_id() REFERENCES auth.users(id) ON DELETE CASCADE,
  logica_id uuid NOT NULL REFERENCES public.ff_logicas_calculo(id) ON DELETE CASCADE,
  ncm varchar(8) NOT NULL,
  descricao_produto text,
  legislacao_valor numeric(10,4) NOT NULL,
  unidade text DEFAULT 'R$/kg',
  fluxo jsonb,
  vigencia_inicio date DEFAULT CURRENT_DATE,
  vigencia_fim date,
  created_at timestamptz DEFAULT now(),
  UNIQUE (logica_id, ncm, vigencia_inicio)
);

-- Catálogo de campos lidos do XML pelas fórmulas em fluxograma
CREATE TABLE IF NOT EXISTS public.ff_campos_xml (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id uuid NOT NULL DEFAULT public.dp_escritorio_id() REFERENCES auth.users(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  label text NOT NULL,
  descricao text,
  escopo text NOT NULL CHECK (escopo IN ('nota','item')),
  tipo text NOT NULL CHECK (tipo IN ('moeda','peso','quantidade','percentual')),
  estrategia text NOT NULL CHECK (estrategia IN ('caminho','texto_livre','derivado')),
  caminho text,
  origem_texto text,
  padrao_regex text,
  grupo_captura int DEFAULT 1,
  agregacao text CHECK (agregacao IN ('soma','media','primeiro','item_predominante')),
  campo_fallback_id uuid REFERENCES public.ff_campos_xml(id) ON DELETE SET NULL,
  xml_amostra_path text,
  valor_esperado numeric,
  sistema boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  ordem int NOT NULL DEFAULT 100,
  criado_por uuid DEFAULT auth.uid(),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (escritorio_id, codigo)
);

CREATE OR REPLACE FUNCTION public.ff_campos_xml_protege_sistema()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.sistema THEN RAISE EXCEPTION 'Campo padrão do sistema não pode ser excluído'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.sistema THEN
    NEW.codigo := OLD.codigo;
    NEW.sistema := OLD.sistema;
  END IF;
  NEW.atualizado_em := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ff_campos_xml_protege_sistema ON public.ff_campos_xml;
CREATE TRIGGER ff_campos_xml_protege_sistema BEFORE UPDATE OR DELETE ON public.ff_campos_xml
  FOR EACH ROW EXECUTE FUNCTION public.ff_campos_xml_protege_sistema();

-- ─────────────── Histórico de auditorias ───────────────
CREATE TABLE IF NOT EXISTS public.ff_sessoes_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id uuid NOT NULL DEFAULT public.dp_escritorio_id() REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  periodo_fiscal varchar(7) NOT NULL,
  numero_extrato varchar(20),
  passo_atual smallint NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'EM_ANDAMENTO' CHECK (status IN ('EM_ANDAMENTO','CONCLUIDA','ARQUIVADA')),
  logica_calculo_id uuid REFERENCES public.ff_logicas_calculo(id) ON DELETE SET NULL,
  inputs_usuario jsonb DEFAULT '{}'::jsonb,
  total_casos int NOT NULL DEFAULT 0,
  total_calculados int NOT NULL DEFAULT 0,
  total_corretos int NOT NULL DEFAULT 0,
  total_divergencia_maior int NOT NULL DEFAULT 0,
  total_divergencia_menor int NOT NULL DEFAULT 0,
  total_sem_xml int NOT NULL DEFAULT 0,
  total_xmls_enviados int NOT NULL DEFAULT 0,
  total_xmls_ignorados int NOT NULL DEFAULT 0,
  total_xmls_descartados int NOT NULL DEFAULT 0,
  total_sefaz_sem_xml int NOT NULL DEFAULT 0,
  valor_recuperavel numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  concluida_em timestamptz
);
CREATE INDEX IF NOT EXISTS ff_sessoes_empresa_idx ON public.ff_sessoes_auditoria(empresa_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ff_conferencia_notas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id uuid NOT NULL DEFAULT public.dp_escritorio_id() REFERENCES auth.users(id) ON DELETE CASCADE,
  sessao_id uuid NOT NULL REFERENCES public.ff_sessoes_auditoria(id) ON DELETE CASCADE,
  nnf text NOT NULL,
  cnpj_emitente text NOT NULL,
  nome_emitente text,
  valor_nf numeric(14,2),
  icms_sefaz numeric(14,2),
  icms_calculado numeric(14,2),
  diferenca numeric(14,2),
  icms_xml_editado numeric(14,2),
  motivo_edicao text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ff_conferencia_notas_sessao_idx ON public.ff_conferencia_notas(sessao_id);

-- Ajustes manuais do ICMS calculado (com motivo), por IE + período
CREATE TABLE IF NOT EXISTS public.ff_ajustes_conferencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id uuid NOT NULL DEFAULT public.dp_escritorio_id() REFERENCES auth.users(id) ON DELETE CASCADE,
  nnf text NOT NULL,
  cnpj_emitente text NOT NULL,
  inscricao_estadual text,
  periodo_fiscal text,
  icms_xml_original numeric NOT NULL,
  icms_xml_novo numeric NOT NULL,
  motivo text NOT NULL,
  usuario_id uuid DEFAULT auth.uid(),
  usuario_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ff_ajustes_ie_periodo_idx ON public.ff_ajustes_conferencia(escritorio_id, inscricao_estadual, periodo_fiscal);

-- ─────────────── updated_at ───────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ff_regras_calculo','ff_excecoes_ncm','ff_creditos_simples_nacional'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER %I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;
END $$;

-- ─────────────── RLS: cada escritório só enxerga os próprios dados ───────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ff_perfis_fiscais','ff_aliquotas_internas','ff_mvas','ff_pautas_fiscais','ff_ncms_regimes',
    'ff_regras_calculo','ff_excecoes_ncm','ff_creditos_simples_nacional','ff_anexos_cnae',
    'ff_logicas_calculo','ff_logica_ncm_legislacao','ff_campos_xml',
    'ff_sessoes_auditoria','ff_conferencia_notas','ff_ajustes_conferencia'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_escritorio', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (escritorio_id = public.dp_escritorio_id()) WITH CHECK (escritorio_id = public.dp_escritorio_id())',
      t || '_escritorio', t);
  END LOOP;
END $$;

-- Perfil fiscal só pode apontar para empresa do próprio escritório
CREATE OR REPLACE FUNCTION public.ff_empresa_do_escritorio(_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = _empresa AND e.user_id = public.dp_escritorio_id())
$$;
REVOKE EXECUTE ON FUNCTION public.ff_empresa_do_escritorio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ff_empresa_do_escritorio(uuid) TO authenticated;

DROP POLICY IF EXISTS ff_perfis_fiscais_escritorio ON public.ff_perfis_fiscais;
CREATE POLICY ff_perfis_fiscais_escritorio ON public.ff_perfis_fiscais FOR ALL TO authenticated
  USING (escritorio_id = public.dp_escritorio_id())
  WITH CHECK (escritorio_id = public.dp_escritorio_id() AND public.ff_empresa_do_escritorio(empresa_id));

DROP POLICY IF EXISTS ff_sessoes_auditoria_escritorio ON public.ff_sessoes_auditoria;
CREATE POLICY ff_sessoes_auditoria_escritorio ON public.ff_sessoes_auditoria FOR ALL TO authenticated
  USING (escritorio_id = public.dp_escritorio_id())
  WITH CHECK (escritorio_id = public.dp_escritorio_id() AND public.ff_empresa_do_escritorio(empresa_id));

-- Libera a nova tela para quem já tem acesso ao módulo Fiscal
UPDATE public.usuarios_perfil
SET modulos = array_cat(COALESCE(modulos, '{}'), ARRAY['fiscal:fronteira'])
WHERE 'fiscal' = ANY(COALESCE(modulos, '{}'))
  AND NOT ('fiscal:fronteira' = ANY(COALESCE(modulos, '{}')));

NOTIFY pgrst, 'reload schema';
