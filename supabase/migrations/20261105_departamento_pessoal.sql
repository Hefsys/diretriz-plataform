-- ═══════════════════════════════════════════════════════════════════
-- Módulo Departamento Pessoal (Folha)
--   • Admissões: ficha pública preenchida pelo cliente + documentos
--   • Variáveis da folha: competências preenchidas pelo cliente via link
--   • VR: planilhas preenchidas pela equipe + TXT para o Domínio
-- Execute no Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- Escritório (owner) do usuário logado: o próprio uid para o dono,
-- ou escritorio_owner_id para membros da equipe.
CREATE OR REPLACE FUNCTION public.dp_escritorio_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT escritorio_owner_id FROM public.usuarios_perfil WHERE user_id = auth.uid() LIMIT 1),
    auth.uid()
  )
$$;
REVOKE EXECUTE ON FUNCTION public.dp_escritorio_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_escritorio_id() TO authenticated;

-- Código da empresa no Domínio (usado no TXT de importação da folha)
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS codigo_dominio text;

-- ─────────────────────────── ADMISSÕES ───────────────────────────
CREATE TABLE IF NOT EXISTS public.dp_admissoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE SET NULL,
  empresa_nome text NOT NULL,
  protocolo text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'recebido' CHECK (status IN ('recebido','em_analise','pendencia','concluido')),
  departamento text,
  nome_completo text NOT NULL,
  endereco_rua text, endereco_numero text, endereco_complemento text,
  endereco_bairro text, endereco_cidade text, endereco_cep text,
  telefone text, email text, filiacao text,
  data_nascimento date, naturalidade text, sexo text, grau_instrucao text, estado_civil text, cor text,
  cpf text, cpf_emissao date,
  identidade_numero text, identidade_orgao text, identidade_expedicao date,
  titulo_eleitor text, titulo_zona text, titulo_secao text,
  habilitacao_numero text, habilitacao_emissao date, habilitacao_vencimento date,
  reservista_numero text, reservista_serie text,
  pis_numero text, pis_inscricao date,
  ctps_numero text, ctps_serie text, ctps_uf text,
  data_admissao date,
  contrato_experiencia boolean NOT NULL DEFAULT false,
  contrato_experiencia_dias integer,
  funcao text,
  salario numeric(12,2),
  vale_transporte boolean NOT NULL DEFAULT false,
  observacoes_cliente text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dp_admissoes_escritorio_idx ON public.dp_admissoes(escritorio_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.dp_admissao_arquivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admissao_id uuid NOT NULL REFERENCES public.dp_admissoes(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  nome_arquivo text NOT NULL,
  storage_path text NOT NULL,
  tamanho bigint,
  content_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dp_admissao_arquivos_adm_idx ON public.dp_admissao_arquivos(admissao_id);

CREATE TABLE IF NOT EXISTS public.dp_admissao_notas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admissao_id uuid NOT NULL REFERENCES public.dp_admissoes(id) ON DELETE CASCADE,
  autor_id uuid,
  autor_nome text,
  texto text,
  status_novo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dp_admissao_notas_adm_idx ON public.dp_admissao_notas(admissao_id);

ALTER TABLE public.dp_admissoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dp_admissao_arquivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dp_admissao_notas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dp_admissoes_equipe" ON public.dp_admissoes;
CREATE POLICY "dp_admissoes_equipe" ON public.dp_admissoes FOR ALL TO authenticated
  USING (escritorio_id = public.dp_escritorio_id())
  WITH CHECK (escritorio_id = public.dp_escritorio_id());

DROP POLICY IF EXISTS "dp_admissao_arquivos_equipe" ON public.dp_admissao_arquivos;
CREATE POLICY "dp_admissao_arquivos_equipe" ON public.dp_admissao_arquivos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.dp_admissoes a WHERE a.id = admissao_id AND a.escritorio_id = public.dp_escritorio_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.dp_admissoes a WHERE a.id = admissao_id AND a.escritorio_id = public.dp_escritorio_id()));

DROP POLICY IF EXISTS "dp_admissao_notas_equipe" ON public.dp_admissao_notas;
CREATE POLICY "dp_admissao_notas_equipe" ON public.dp_admissao_notas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.dp_admissoes a WHERE a.id = admissao_id AND a.escritorio_id = public.dp_escritorio_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.dp_admissoes a WHERE a.id = admissao_id AND a.escritorio_id = public.dp_escritorio_id()));

DROP TRIGGER IF EXISTS dp_admissoes_updated_at ON public.dp_admissoes;
CREATE TRIGGER dp_admissoes_updated_at BEFORE UPDATE ON public.dp_admissoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────── FOLHA: VARIÁVEIS E VR ───────────────
CREATE TABLE IF NOT EXISTS public.dp_folha_competencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  modulo text NOT NULL DEFAULT 'variaveis' CHECK (modulo IN ('variaveis','vr')),
  competencia text NOT NULL CHECK (competencia ~ '^\d{2}/\d{4}$'),
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','enviado','preenchido','reaberto')),
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  enviado_por uuid,
  enviado_por_email text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, modulo, competencia)
);
CREATE INDEX IF NOT EXISTS dp_folha_comp_escritorio_idx ON public.dp_folha_competencias(escritorio_id, modulo);

CREATE TABLE IF NOT EXISTS public.dp_folha_rubricas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id uuid NOT NULL REFERENCES public.dp_folha_competencias(id) ON DELETE CASCADE,
  nome text NOT NULL,
  codigo text NOT NULL DEFAULT '',
  posicao int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS dp_folha_rubricas_comp_idx ON public.dp_folha_rubricas(competencia_id);

CREATE TABLE IF NOT EXISTS public.dp_folha_funcionarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id uuid NOT NULL REFERENCES public.dp_folha_competencias(id) ON DELETE CASCADE,
  tipo_calculo text NOT NULL DEFAULT '11',
  codigo text NOT NULL DEFAULT '',
  nome text NOT NULL,
  posicao int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS dp_folha_func_comp_idx ON public.dp_folha_funcionarios(competencia_id);

CREATE TABLE IF NOT EXISTS public.dp_folha_lancamentos (
  funcionario_id uuid NOT NULL REFERENCES public.dp_folha_funcionarios(id) ON DELETE CASCADE,
  rubrica_id uuid NOT NULL REFERENCES public.dp_folha_rubricas(id) ON DELETE CASCADE,
  valor numeric NOT NULL,
  PRIMARY KEY (funcionario_id, rubrica_id)
);

ALTER TABLE public.dp_folha_competencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dp_folha_rubricas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dp_folha_funcionarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dp_folha_lancamentos ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.dp_competencia_do_escritorio(_competencia_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.dp_folha_competencias c
                  WHERE c.id = _competencia_id AND c.escritorio_id = public.dp_escritorio_id())
$$;
REVOKE EXECUTE ON FUNCTION public.dp_competencia_do_escritorio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_competencia_do_escritorio(uuid) TO authenticated;

DROP POLICY IF EXISTS "dp_folha_comp_equipe" ON public.dp_folha_competencias;
CREATE POLICY "dp_folha_comp_equipe" ON public.dp_folha_competencias FOR ALL TO authenticated
  USING (escritorio_id = public.dp_escritorio_id())
  WITH CHECK (escritorio_id = public.dp_escritorio_id());

DROP POLICY IF EXISTS "dp_folha_rubricas_equipe" ON public.dp_folha_rubricas;
CREATE POLICY "dp_folha_rubricas_equipe" ON public.dp_folha_rubricas FOR ALL TO authenticated
  USING (public.dp_competencia_do_escritorio(competencia_id))
  WITH CHECK (public.dp_competencia_do_escritorio(competencia_id));

DROP POLICY IF EXISTS "dp_folha_func_equipe" ON public.dp_folha_funcionarios;
CREATE POLICY "dp_folha_func_equipe" ON public.dp_folha_funcionarios FOR ALL TO authenticated
  USING (public.dp_competencia_do_escritorio(competencia_id))
  WITH CHECK (public.dp_competencia_do_escritorio(competencia_id));

DROP POLICY IF EXISTS "dp_folha_lanc_equipe" ON public.dp_folha_lancamentos;
CREATE POLICY "dp_folha_lanc_equipe" ON public.dp_folha_lancamentos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.dp_folha_funcionarios f WHERE f.id = funcionario_id AND public.dp_competencia_do_escritorio(f.competencia_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.dp_folha_funcionarios f WHERE f.id = funcionario_id AND public.dp_competencia_do_escritorio(f.competencia_id)));

-- ─────────────── STORAGE: documentos das admissões ───────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('dp-admissoes', 'dp-admissoes', false, 15728640,
        ARRAY['application/pdf','image/jpeg','image/png','image/webp','image/heic'])
ON CONFLICT (id) DO NOTHING;

-- Upload anônimo só para a pasta de uma admissão criada há menos de 2 horas
CREATE OR REPLACE FUNCTION public.dp_admissao_aceita_upload(_pasta text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.dp_admissoes
                  WHERE id::text = _pasta AND created_at > now() - interval '2 hours')
$$;
GRANT EXECUTE ON FUNCTION public.dp_admissao_aceita_upload(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.dp_admissao_pasta_do_escritorio(_pasta text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.dp_admissoes
                  WHERE id::text = _pasta AND escritorio_id = public.dp_escritorio_id())
$$;
REVOKE EXECUTE ON FUNCTION public.dp_admissao_pasta_do_escritorio(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_admissao_pasta_do_escritorio(text) TO authenticated;

DROP POLICY IF EXISTS "dp_admissoes_upload_publico" ON storage.objects;
CREATE POLICY "dp_admissoes_upload_publico" ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'dp-admissoes' AND public.dp_admissao_aceita_upload((storage.foldername(name))[1]));

DROP POLICY IF EXISTS "dp_admissoes_leitura_equipe" ON storage.objects;
CREATE POLICY "dp_admissoes_leitura_equipe" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'dp-admissoes' AND public.dp_admissao_pasta_do_escritorio((storage.foldername(name))[1]));

DROP POLICY IF EXISTS "dp_admissoes_exclusao_equipe" ON storage.objects;
CREATE POLICY "dp_admissoes_exclusao_equipe" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'dp-admissoes' AND public.dp_admissao_pasta_do_escritorio((storage.foldername(name))[1]));

-- ─────────────── FUNÇÕES PÚBLICAS (cliente, sem login) ───────────────

-- Empresas ativas do escritório, para o cliente escolher na ficha
CREATE OR REPLACE FUNCTION public.dp_publico_empresas(p_escritorio uuid)
RETURNS TABLE (id uuid, nome text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT e.id, e.razao_social FROM public.empresas e
   WHERE e.user_id = p_escritorio AND e.ativa = true
   ORDER BY e.razao_social
$$;
GRANT EXECUTE ON FUNCTION public.dp_publico_empresas(uuid) TO anon, authenticated;

-- Cria a ficha de admissão e devolve id + protocolo
CREATE OR REPLACE FUNCTION public.dp_publico_criar_admissao(p_escritorio uuid, p_empresa_id uuid, p_dados jsonb)
RETURNS TABLE (id uuid, protocolo text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa text;
  v_protocolo text;
  v_id uuid;
  v_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
BEGIN
  SELECT razao_social INTO v_empresa FROM public.empresas
   WHERE empresas.id = p_empresa_id AND user_id = p_escritorio AND ativa = true;
  IF v_empresa IS NULL THEN RAISE EXCEPTION 'Empresa inválida'; END IF;
  IF coalesce(trim(p_dados->>'nome_completo'), '') = '' THEN RAISE EXCEPTION 'Informe o nome completo'; END IF;

  LOOP
    v_protocolo := 'ADM-' || extract(year FROM now())::int || '-';
    FOR i IN 1..6 LOOP
      v_protocolo := v_protocolo || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.dp_admissoes a WHERE a.protocolo = v_protocolo);
  END LOOP;

  INSERT INTO public.dp_admissoes (
    escritorio_id, empresa_id, empresa_nome, protocolo, departamento, nome_completo,
    endereco_rua, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_cep,
    telefone, email, filiacao, data_nascimento, naturalidade, sexo, grau_instrucao, estado_civil, cor,
    cpf, cpf_emissao, identidade_numero, identidade_orgao, identidade_expedicao,
    titulo_eleitor, titulo_zona, titulo_secao, habilitacao_numero, habilitacao_emissao, habilitacao_vencimento,
    reservista_numero, reservista_serie, pis_numero, pis_inscricao, ctps_numero, ctps_serie, ctps_uf,
    data_admissao, contrato_experiencia, contrato_experiencia_dias, funcao, salario, vale_transporte, observacoes_cliente
  ) VALUES (
    p_escritorio, p_empresa_id, v_empresa, v_protocolo, left(p_dados->>'departamento', 200), left(p_dados->>'nome_completo', 200),
    left(p_dados->>'endereco_rua', 200), left(p_dados->>'endereco_numero', 20), left(p_dados->>'endereco_complemento', 100),
    left(p_dados->>'endereco_bairro', 100), left(p_dados->>'endereco_cidade', 100), left(p_dados->>'endereco_cep', 10),
    left(p_dados->>'telefone', 30), left(p_dados->>'email', 255), left(p_dados->>'filiacao', 300),
    nullif(p_dados->>'data_nascimento', '')::date, left(p_dados->>'naturalidade', 100), left(p_dados->>'sexo', 30),
    left(p_dados->>'grau_instrucao', 60), left(p_dados->>'estado_civil', 40), left(p_dados->>'cor', 40),
    left(p_dados->>'cpf', 14), nullif(p_dados->>'cpf_emissao', '')::date,
    left(p_dados->>'identidade_numero', 40), left(p_dados->>'identidade_orgao', 40), nullif(p_dados->>'identidade_expedicao', '')::date,
    left(p_dados->>'titulo_eleitor', 40), left(p_dados->>'titulo_zona', 20), left(p_dados->>'titulo_secao', 20),
    left(p_dados->>'habilitacao_numero', 40), nullif(p_dados->>'habilitacao_emissao', '')::date, nullif(p_dados->>'habilitacao_vencimento', '')::date,
    left(p_dados->>'reservista_numero', 40), left(p_dados->>'reservista_serie', 40),
    left(p_dados->>'pis_numero', 40), nullif(p_dados->>'pis_inscricao', '')::date,
    left(p_dados->>'ctps_numero', 40), left(p_dados->>'ctps_serie', 40), left(p_dados->>'ctps_uf', 2),
    nullif(p_dados->>'data_admissao', '')::date,
    coalesce((p_dados->>'contrato_experiencia')::boolean, false),
    nullif(p_dados->>'contrato_experiencia_dias', '')::int,
    left(p_dados->>'funcao', 200),
    nullif(p_dados->>'salario', '')::numeric,
    coalesce((p_dados->>'vale_transporte')::boolean, false),
    left(p_dados->>'observacoes_cliente', 2000)
  ) RETURNING dp_admissoes.id INTO v_id;

  RETURN QUERY SELECT v_id, v_protocolo;
END;
$$;
GRANT EXECUTE ON FUNCTION public.dp_publico_criar_admissao(uuid, uuid, jsonb) TO anon, authenticated;

-- Registra os arquivos já enviados ao storage (confere id + protocolo)
CREATE OR REPLACE FUNCTION public.dp_publico_registrar_arquivos(p_admissao uuid, p_protocolo text, p_arquivos jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.dp_admissoes
                  WHERE id = p_admissao AND protocolo = p_protocolo
                    AND created_at > now() - interval '2 hours') THEN
    RAISE EXCEPTION 'Admissão não encontrada';
  END IF;
  IF jsonb_array_length(p_arquivos) > 40 THEN RAISE EXCEPTION 'Arquivos demais'; END IF;
  INSERT INTO public.dp_admissao_arquivos (admissao_id, tipo, nome_arquivo, storage_path, tamanho, content_type)
  SELECT p_admissao, left(a->>'tipo', 60), left(a->>'nome_arquivo', 255), a->>'storage_path',
         (a->>'tamanho')::bigint, left(a->>'content_type', 120)
    FROM jsonb_array_elements(p_arquivos) a
   WHERE (a->>'storage_path') LIKE p_admissao::text || '/%';
END;
$$;
GRANT EXECUTE ON FUNCTION public.dp_publico_registrar_arquivos(uuid, text, jsonb) TO anon, authenticated;

-- Portal do cliente (Variáveis): carrega a planilha pelo token
CREATE OR REPLACE FUNCTION public.dp_portal_obter(p_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  c record;
BEGIN
  SELECT fc.id, fc.competencia, fc.status, fc.submitted_at, e.razao_social, e.cnpj, e.codigo_dominio
    INTO c
    FROM public.dp_folha_competencias fc JOIN public.empresas e ON e.id = fc.empresa_id
   WHERE fc.token = p_token AND fc.modulo = 'variaveis';
  IF NOT FOUND THEN RAISE EXCEPTION 'Link inválido'; END IF;
  RETURN jsonb_build_object(
    'competencia', c.competencia, 'status', c.status, 'submitted_at', c.submitted_at,
    'empresa', jsonb_build_object('nome', c.razao_social, 'cnpj', c.cnpj, 'codigo', c.codigo_dominio),
    'rubricas', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'nome', r.nome, 'codigo', r.codigo) ORDER BY r.posicao)
                            FROM public.dp_folha_rubricas r WHERE r.competencia_id = c.id), '[]'::jsonb),
    'funcionarios', coalesce((SELECT jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome, 'codigo', f.codigo) ORDER BY f.posicao)
                                FROM public.dp_folha_funcionarios f WHERE f.competencia_id = c.id), '[]'::jsonb),
    'lancamentos', coalesce((SELECT jsonb_agg(jsonb_build_object('funcionario_id', l.funcionario_id, 'rubrica_id', l.rubrica_id, 'valor', l.valor))
                               FROM public.dp_folha_lancamentos l JOIN public.dp_folha_funcionarios f ON f.id = l.funcionario_id
                              WHERE f.competencia_id = c.id), '[]'::jsonb)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.dp_portal_obter(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.dp_portal_salvar(p_token text, p_funcionario uuid, p_rubrica uuid, p_valor numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_comp uuid;
BEGIN
  SELECT id INTO v_comp FROM public.dp_folha_competencias
   WHERE token = p_token AND modulo = 'variaveis' AND status IN ('enviado','reaberto');
  IF v_comp IS NULL THEN RAISE EXCEPTION 'Esta planilha não está aberta para preenchimento.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dp_folha_funcionarios WHERE id = p_funcionario AND competencia_id = v_comp)
     OR NOT EXISTS (SELECT 1 FROM public.dp_folha_rubricas WHERE id = p_rubrica AND competencia_id = v_comp) THEN
    RAISE EXCEPTION 'Registro inválido';
  END IF;
  IF p_valor IS NULL THEN
    DELETE FROM public.dp_folha_lancamentos WHERE funcionario_id = p_funcionario AND rubrica_id = p_rubrica;
  ELSE
    IF abs(p_valor) > 1e10 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
    INSERT INTO public.dp_folha_lancamentos (funcionario_id, rubrica_id, valor)
    VALUES (p_funcionario, p_rubrica, p_valor)
    ON CONFLICT (funcionario_id, rubrica_id) DO UPDATE SET valor = EXCLUDED.valor;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.dp_portal_salvar(text, uuid, uuid, numeric) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.dp_portal_confirmar(p_token text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.dp_folha_competencias
     SET status = 'preenchido', submitted_at = now()
   WHERE token = p_token AND modulo = 'variaveis' AND status IN ('enviado','reaberto');
  IF NOT FOUND THEN RAISE EXCEPTION 'Esta planilha já foi confirmada.'; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.dp_portal_confirmar(text) TO anon, authenticated;
