-- ═══════════════════════════════════════════════════════════════════
-- Fiscal → Fronteira — etapa 2
-- Acervo legal (informativos SEFAZ-PE: fontes, trechos pesquisáveis e PDFs)
-- e catálogo de Regras fiscais. Isolado por escritório.
-- Requer 20261114_fronteira_fiscal.sql.
-- Execute no Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- Quem pode gerir acervo/regras/fórmulas: dono do escritório ou administrador da equipe
CREATE OR REPLACE FUNCTION public.ff_pode_gerir()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    NOT EXISTS (SELECT 1 FROM public.usuarios_perfil WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.usuarios_perfil WHERE user_id = auth.uid() AND is_admin)
  )
$$;
REVOKE EXECUTE ON FUNCTION public.ff_pode_gerir() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ff_pode_gerir() TO authenticated;

-- Busca em português sem acentos
CREATE EXTENSION IF NOT EXISTS unaccent;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'pt_unaccent') THEN
    CREATE TEXT SEARCH CONFIGURATION public.pt_unaccent (COPY = pg_catalog.portuguese);
    ALTER TEXT SEARCH CONFIGURATION public.pt_unaccent ALTER MAPPING FOR hword, hword_part, word WITH unaccent, portuguese_stem;
  END IF;
END $$;

-- ─────────────── Acervo legal ───────────────
CREATE TABLE IF NOT EXISTS public.ff_fontes_legais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id uuid NOT NULL DEFAULT public.dp_escritorio_id() REFERENCES auth.users(id) ON DELETE CASCADE,
  chave text NOT NULL,
  titulo text NOT NULL,
  arquivo text NOT NULL,
  categoria text NOT NULL CHECK (categoria IN ('NUCLEO_CALCULO','SISTEMATICA_SETORIAL','BENEFICIO_PROGRAMA','OPERACAO_ESPECIAL','OBRIGACAO_ACESSORIA','FORA_DO_ESCOPO_ICMS','OUTROS')),
  atualizado_em date,
  vigencia_inicio date,
  vigencia_fim date,
  status text NOT NULL DEFAULT 'VIGENTE' CHECK (status IN ('VIGENTE','HISTORICO')),
  substituido_por text,
  paginas int,
  observacao text,
  storage_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (escritorio_id, chave)
);

CREATE TABLE IF NOT EXISTS public.ff_trechos_legais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id uuid NOT NULL DEFAULT public.dp_escritorio_id() REFERENCES auth.users(id) ON DELETE CASCADE,
  fonte_id uuid NOT NULL REFERENCES public.ff_fontes_legais(id) ON DELETE CASCADE,
  item text NOT NULL,
  titulo text NOT NULL,
  caminho text,
  parte int,
  fundamento text,
  fundamento_herdado text,
  texto text NOT NULL,
  tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('public.pt_unaccent', coalesce(titulo,'') || ' ' || coalesce(caminho,'')), 'A') ||
    setweight(to_tsvector('public.pt_unaccent', coalesce(fundamento,'') || ' ' || coalesce(fundamento_herdado,'')), 'B') ||
    setweight(to_tsvector('public.pt_unaccent', texto), 'C')
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ff_trechos_tsv_idx ON public.ff_trechos_legais USING gin(tsv);
CREATE INDEX IF NOT EXISTS ff_trechos_item_idx ON public.ff_trechos_legais(fonte_id, item);

-- ─────────────── Regras fiscais (catálogo com fundamentos) ───────────────
CREATE TABLE IF NOT EXISTS public.ff_regras_fiscais (
  escritorio_id uuid NOT NULL DEFAULT public.dp_escritorio_id() REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL,
  nome text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('CALCULO','AJUSTE','INAPLICABILIDADE','SUJEICAO','INFORMATIVA')),
  descricao text NOT NULL,
  condicoes jsonb NOT NULL DEFAULT '{}'::jsonb,
  formula text,
  parametros jsonb NOT NULL DEFAULT '{}'::jsonb,
  codigo_receita text,
  prazo_recolhimento text,
  fundamentos jsonb NOT NULL DEFAULT '[]'::jsonb,
  vigencia_inicio date,
  vigencia_fim date,
  exemplos_oficiais text[] NOT NULL DEFAULT '{}',
  observacoes text,
  implementada_no_motor boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'RASCUNHO' CHECK (status IN ('RASCUNHO','VALIDADA','INATIVA')),
  validado_por uuid,
  validado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (escritorio_id, id)
);

-- Validar/inativar regra: só quem gere; registra quem e quando
CREATE OR REPLACE FUNCTION public.ff_regras_atribuir_validacao()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'VALIDADA' AND NEW.validado_por IS NULL THEN NEW.validado_por := auth.uid(); NEW.validado_em := now(); END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('VALIDADA','INATIVA') THEN
    IF NOT public.ff_pode_gerir() THEN RAISE EXCEPTION 'Somente administradores validam ou inativam regras'; END IF;
    NEW.validado_por := auth.uid(); NEW.validado_em := now();
  ELSIF NEW.validado_por IS DISTINCT FROM OLD.validado_por OR NEW.validado_em IS DISTINCT FROM OLD.validado_em THEN
    NEW.validado_por := OLD.validado_por; NEW.validado_em := OLD.validado_em;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ff_regras_atribuir_validacao ON public.ff_regras_fiscais;
CREATE TRIGGER ff_regras_atribuir_validacao BEFORE INSERT OR UPDATE ON public.ff_regras_fiscais
  FOR EACH ROW EXECUTE FUNCTION public.ff_regras_atribuir_validacao();

-- ─────────────── RLS: leitura no escritório, escrita só para quem gere ───────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ff_fontes_legais','ff_trechos_legais','ff_regras_fiscais'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_ler', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_gerir', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (escritorio_id = public.dp_escritorio_id())', t || '_ler', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (escritorio_id = public.dp_escritorio_id() AND public.ff_pode_gerir()) WITH CHECK (escritorio_id = public.dp_escritorio_id() AND public.ff_pode_gerir())', t || '_gerir', t);
  END LOOP;
END $$;

-- ─────────────── Busca nos trechos (respeita RLS do escritório) ───────────────
CREATE OR REPLACE FUNCTION public.ff_buscar_trechos_legais(consulta text, data_ref date DEFAULT current_date, limite int DEFAULT 8, fonte_chaves text[] DEFAULT NULL)
RETURNS TABLE(trecho_id uuid, fonte_chave text, fonte_titulo text, atualizado_em date, item text, titulo text, caminho text, fundamento text, texto text, relevancia real)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT t.id, f.chave, f.titulo, f.atualizado_em, t.item, t.titulo, t.caminho, coalesce(t.fundamento, t.fundamento_herdado), t.texto, ts_rank_cd(t.tsv, q)
  FROM public.ff_trechos_legais t
  JOIN public.ff_fontes_legais f ON f.id = t.fonte_id
  CROSS JOIN websearch_to_tsquery('public.pt_unaccent', consulta) q
  WHERE t.tsv @@ q
    AND (f.vigencia_inicio IS NULL OR f.vigencia_inicio <= data_ref)
    AND (f.vigencia_fim IS NULL OR f.vigencia_fim >= data_ref)
    AND (fonte_chaves IS NULL OR f.chave = ANY(fonte_chaves))
    AND f.categoria <> 'FORA_DO_ESCOPO_ICMS'
  ORDER BY ts_rank_cd(t.tsv, q) DESC
  LIMIT limite
$$;

CREATE OR REPLACE FUNCTION public.ff_trechos_do_item(fonte_chave text, item_prefixo text)
RETURNS TABLE(trecho_id uuid, item text, titulo text, caminho text, fundamento text, texto text, parte int)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT t.id, t.item, t.titulo, t.caminho, coalesce(t.fundamento, t.fundamento_herdado), t.texto, t.parte
  FROM public.ff_trechos_legais t
  JOIN public.ff_fontes_legais f ON f.id = t.fonte_id
  WHERE f.chave = fonte_chave AND (t.item = item_prefixo OR t.item LIKE item_prefixo || '.%')
  ORDER BY (SELECT array_agg(CASE WHEN p ~ '^\d+$' THEN lpad(p, 4, '0') ELSE p END) FROM unnest(string_to_array(t.item, '.')) AS p), t.parte NULLS FIRST
  LIMIT 12
$$;

-- Importação de trechos em lotes (primeiro lote substitui os trechos do escritório)
CREATE OR REPLACE FUNCTION public.ff_importar_trechos_acervo(linhas jsonb, primeiro boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SET search_path = public AS $$
DECLARE total integer;
BEGIN
  IF NOT public.ff_pode_gerir() THEN RAISE EXCEPTION 'Acesso restrito a administradores'; END IF;
  IF jsonb_typeof(linhas) <> 'array' OR jsonb_array_length(linhas) < 1 OR jsonb_array_length(linhas) > 500 THEN
    RAISE EXCEPTION 'Lote deve ter de 1 a 500 trechos';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(linhas) l
    LEFT JOIN public.ff_fontes_legais f ON f.chave = l->>'fonte_chave' AND f.escritorio_id = public.dp_escritorio_id()
    WHERE f.id IS NULL
  ) THEN RAISE EXCEPTION 'Lote cita informativo que não está no acervo'; END IF;
  IF primeiro THEN DELETE FROM public.ff_trechos_legais WHERE escritorio_id = public.dp_escritorio_id(); END IF;
  INSERT INTO public.ff_trechos_legais (fonte_id, item, titulo, caminho, parte, fundamento, fundamento_herdado, texto)
  SELECT f.id, l->>'item', l->>'titulo', l->>'caminho', (l->>'parte')::int, l->>'fundamento', l->>'fundamento_herdado', l->>'texto'
  FROM jsonb_array_elements(linhas) l
  JOIN public.ff_fontes_legais f ON f.chave = l->>'fonte_chave' AND f.escritorio_id = public.dp_escritorio_id();
  GET DIAGNOSTICS total = ROW_COUNT;
  RETURN total;
END $$;

-- Substitui os anexos de CNAE (11,12,13,14,15,19) do escritório
CREATE OR REPLACE FUNCTION public.ff_importar_anexos_acervo(linhas jsonb)
RETURNS integer LANGUAGE plpgsql SET search_path = public AS $$
DECLARE total integer;
BEGIN
  IF NOT public.ff_pode_gerir() THEN RAISE EXCEPTION 'Acesso restrito a administradores'; END IF;
  IF jsonb_typeof(linhas) <> 'array' OR jsonb_array_length(linhas) < 1 OR jsonb_array_length(linhas) > 5000 THEN
    RAISE EXCEPTION 'Arquivo de anexos inválido';
  END IF;
  DELETE FROM public.ff_anexos_cnae WHERE escritorio_id = public.dp_escritorio_id();
  INSERT INTO public.ff_anexos_cnae (anexo, cnae, descricao, mva, vigencia_inicio, vigencia_fim)
  SELECT anexo, cnae, descricao, mva, vigencia_inicio, vigencia_fim
  FROM jsonb_to_recordset(linhas) AS l(anexo smallint, cnae varchar(7), descricao text, mva numeric, vigencia_inicio date, vigencia_fim date);
  GET DIAGNOSTICS total = ROW_COUNT;
  RETURN total;
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'ff_buscar_trechos_legais(text,date,int,text[])', 'ff_trechos_do_item(text,text)',
    'ff_importar_trechos_acervo(jsonb,boolean)', 'ff_importar_anexos_acervo(jsonb)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;

-- ─────────────── PDFs do acervo (bucket privado, pasta = escritório) ───────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('ff-acervo', 'ff-acervo', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "ff_acervo_ler" ON storage.objects;
CREATE POLICY "ff_acervo_ler" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ff-acervo' AND (storage.foldername(name))[1] = public.dp_escritorio_id()::text);
DROP POLICY IF EXISTS "ff_acervo_enviar" ON storage.objects;
CREATE POLICY "ff_acervo_enviar" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ff-acervo' AND (storage.foldername(name))[1] = public.dp_escritorio_id()::text AND public.ff_pode_gerir());
DROP POLICY IF EXISTS "ff_acervo_atualizar" ON storage.objects;
CREATE POLICY "ff_acervo_atualizar" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'ff-acervo' AND (storage.foldername(name))[1] = public.dp_escritorio_id()::text AND public.ff_pode_gerir())
  WITH CHECK (bucket_id = 'ff-acervo' AND (storage.foldername(name))[1] = public.dp_escritorio_id()::text AND public.ff_pode_gerir());
DROP POLICY IF EXISTS "ff_acervo_apagar" ON storage.objects;
CREATE POLICY "ff_acervo_apagar" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ff-acervo' AND (storage.foldername(name))[1] = public.dp_escritorio_id()::text AND public.ff_pode_gerir());

NOTIFY pgrst, 'reload schema';
