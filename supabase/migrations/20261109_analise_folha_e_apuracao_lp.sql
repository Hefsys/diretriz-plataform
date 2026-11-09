-- ═══════════════════════════════════════════════════════════════════
-- 1) Análise da Folha (Comissão x eSocial) — tabelas usadas pela tela
--    já existente na plataforma, compartilhadas dentro do escritório.
-- 2) Fiscal — Apuração do Lucro Presumido (IRPJ/CSLL trimestral,
--    PIS/COFINS/ISS mensal) por empresa e ano.
-- Requer a migração 20261105_departamento_pessoal.sql (dp_escritorio_id).
-- Execute no Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- O usuário _user pertence ao mesmo escritório do usuário logado?
CREATE OR REPLACE FUNCTION public.mesmo_escritorio(_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT escritorio_owner_id FROM public.usuarios_perfil WHERE user_id = _user LIMIT 1),
    _user
  ) = public.dp_escritorio_id()
$$;
REVOKE EXECUTE ON FUNCTION public.mesmo_escritorio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mesmo_escritorio(uuid) TO authenticated;

-- ─────────────────── ANÁLISE DA FOLHA ───────────────────
CREATE TABLE IF NOT EXISTS public.conferencias (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  competencia text NOT NULL,
  empresa text,
  cnpj text,
  pdf_nome text,
  planilhas_nomes text[],
  esocial_nome text,
  total_funcionarios int NOT NULL DEFAULT 0,
  total_divergencias int NOT NULL DEFAULT 0,
  total_comissao_pdf numeric(14,2) DEFAULT 0,
  total_comissao_planilha numeric(14,2) DEFAULT 0,
  total_gratificacao_pdf numeric(14,2) DEFAULT 0,
  total_gratificacao_planilha numeric(14,2) DEFAULT 0,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conferencia_itens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conferencia_id uuid NOT NULL REFERENCES public.conferencias(id) ON DELETE CASCADE,
  cpf text,
  matricula text,
  nome text NOT NULL,
  setor text,
  comissao_pdf numeric(14,2) DEFAULT 0,
  comissao_planilha numeric(14,2) DEFAULT 0,
  gratificacao_pdf numeric(14,2) DEFAULT 0,
  gratificacao_planilha numeric(14,2) DEFAULT 0,
  premio_pdf numeric(14,2) DEFAULT 0,
  premio_planilha numeric(14,2) DEFAULT 0,
  base_inss numeric(14,2) DEFAULT 0,
  valor_fgts numeric(14,2) DEFAULT 0,
  emprestimos_pdf numeric(14,2) DEFAULT 0,
  emprestimos_esocial_qtd int DEFAULT 0,
  status text NOT NULL DEFAULT 'ok',
  divergencias jsonb DEFAULT '[]'::jsonb,
  gratificacao_nps_pdf numeric DEFAULT 0,
  gratificacao_nps_planilha numeric DEFAULT 0,
  adiant_premio_pdf numeric DEFAULT 0,
  adiant_premio_planilha numeric DEFAULT 0,
  salario_base numeric DEFAULT 0,
  vale_transporte numeric DEFAULT 0,
  vale_refeicao numeric DEFAULT 0,
  plano_saude numeric DEFAULT 0,
  outros_beneficios jsonb DEFAULT '[]'::jsonb,
  bancos_esocial jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conferencia_itens_conferencia ON public.conferencia_itens(conferencia_id);

CREATE TABLE IF NOT EXISTS public.conferencia_emprestimos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.conferencia_itens(id) ON DELETE CASCADE,
  conferencia_id uuid NOT NULL REFERENCES public.conferencias(id) ON DELETE CASCADE,
  banco text,
  numero_contrato text,
  parcela numeric DEFAULT 0,
  parcelas_restantes integer,
  origem text NOT NULL DEFAULT 'esocial',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_emprestimos_item ON public.conferencia_emprestimos(item_id);
CREATE INDEX IF NOT EXISTS idx_emprestimos_conferencia ON public.conferencia_emprestimos(conferencia_id);

ALTER TABLE public.conferencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conferencia_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conferencia_emprestimos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conferencias_escritorio" ON public.conferencias;
CREATE POLICY "conferencias_escritorio" ON public.conferencias FOR ALL TO authenticated
  USING (public.mesmo_escritorio(user_id))
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.conferencia_do_escritorio(_conferencia uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.conferencias c WHERE c.id = _conferencia AND public.mesmo_escritorio(c.user_id))
$$;
REVOKE EXECUTE ON FUNCTION public.conferencia_do_escritorio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conferencia_do_escritorio(uuid) TO authenticated;

DROP POLICY IF EXISTS "conferencia_itens_escritorio" ON public.conferencia_itens;
CREATE POLICY "conferencia_itens_escritorio" ON public.conferencia_itens FOR ALL TO authenticated
  USING (public.conferencia_do_escritorio(conferencia_id))
  WITH CHECK (public.conferencia_do_escritorio(conferencia_id));

DROP POLICY IF EXISTS "conferencia_emprestimos_escritorio" ON public.conferencia_emprestimos;
CREATE POLICY "conferencia_emprestimos_escritorio" ON public.conferencia_emprestimos FOR ALL TO authenticated
  USING (public.conferencia_do_escritorio(conferencia_id))
  WITH CHECK (public.conferencia_do_escritorio(conferencia_id));

DROP TRIGGER IF EXISTS conferencias_updated_at ON public.conferencias;
CREATE TRIGGER conferencias_updated_at BEFORE UPDATE ON public.conferencias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────── APURAÇÃO LUCRO PRESUMIDO ───────────────────
-- Alíquota de ISS própria da empresa (padrão 3%)
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS aliquota_iss numeric NOT NULL DEFAULT 0.03;

CREATE TABLE IF NOT EXISTS public.fiscal_apuracao_lp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  ano int NOT NULL,
  mes int NOT NULL CHECK (mes BETWEEN 1 AND 12),
  rec_mercadorias numeric NOT NULL DEFAULT 0,
  rec_monofasico numeric NOT NULL DEFAULT 0,
  rec_servicos numeric NOT NULL DEFAULT 0,
  rec_exterior numeric NOT NULL DEFAULT 0,
  rec_aplicacoes numeric NOT NULL DEFAULT 0,
  ret_ir numeric NOT NULL DEFAULT 0,
  ret_csll numeric NOT NULL DEFAULT 0,
  perse_ir numeric NOT NULL DEFAULT 0,
  perse_csll numeric NOT NULL DEFAULT 0,
  pis_deduzir numeric NOT NULL DEFAULT 0,
  cofins_deduzir numeric NOT NULL DEFAULT 0,
  iss_deduzir numeric NOT NULL DEFAULT 0,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, ano, mes)
);
CREATE INDEX IF NOT EXISTS fiscal_apuracao_lp_escritorio_idx ON public.fiscal_apuracao_lp(escritorio_id, ano);

ALTER TABLE public.fiscal_apuracao_lp ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fiscal_apuracao_lp_escritorio" ON public.fiscal_apuracao_lp;
CREATE POLICY "fiscal_apuracao_lp_escritorio" ON public.fiscal_apuracao_lp FOR ALL TO authenticated
  USING (escritorio_id = public.dp_escritorio_id())
  WITH CHECK (escritorio_id = public.dp_escritorio_id());
