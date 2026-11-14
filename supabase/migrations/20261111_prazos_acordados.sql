-- ═══════════════════════════════════════════════════════════════════
-- Monitoramento → Prazos Acordados
-- Colaborador registra Empresa + Atividade + Prazo combinado com o
-- supervisor. Prazo vencido sem conclusão → e-mail diário para o
-- supervisor (função alertar-prazos).
-- Requer 20261105_departamento_pessoal.sql (dp_escritorio_id).
-- Execute no Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.monitor_prazos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id uuid NOT NULL DEFAULT public.dp_escritorio_id() REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  atividade text NOT NULL,
  prazo date NOT NULL,
  responsavel_id uuid DEFAULT auth.uid(),
  responsavel_nome text,
  concluido boolean NOT NULL DEFAULT false,
  concluido_em timestamptz,
  alerta_enviado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS monitor_prazos_escritorio_idx ON public.monitor_prazos(escritorio_id, concluido, prazo);

ALTER TABLE public.monitor_prazos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "monitor_prazos_escritorio" ON public.monitor_prazos;
CREATE POLICY "monitor_prazos_escritorio" ON public.monitor_prazos FOR ALL TO authenticated
  USING (escritorio_id = public.dp_escritorio_id())
  WITH CHECK (escritorio_id = public.dp_escritorio_id());

-- Mudou o prazo ou reabriu → pode avisar de novo; concluiu → registra a data
CREATE OR REPLACE FUNCTION public.monitor_prazos_before_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.prazo IS DISTINCT FROM OLD.prazo OR (OLD.concluido AND NOT NEW.concluido) THEN
    NEW.alerta_enviado_em := NULL;
  END IF;
  IF NEW.concluido AND NOT OLD.concluido THEN
    NEW.concluido_em := now();
  ELSIF NOT NEW.concluido THEN
    NEW.concluido_em := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS monitor_prazos_before_update ON public.monitor_prazos;
CREATE TRIGGER monitor_prazos_before_update BEFORE UPDATE ON public.monitor_prazos
  FOR EACH ROW EXECUTE FUNCTION public.monitor_prazos_before_update();

-- Libera a nova aba para toda a equipe (admins e proprietário já veem tudo)
UPDATE public.usuarios_perfil
SET modulos = array_cat(COALESCE(modulos, '{}'), ARRAY['prazos', 'prazos:controle'])
WHERE NOT ('prazos:controle' = ANY(COALESCE(modulos, '{}')));

-- Agenda: todo dia às 11:00 UTC (08:00 de Brasília)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'alertar-prazos-daily') THEN
    PERFORM cron.unschedule('alertar-prazos-daily');
  END IF;
END $$;
SELECT cron.schedule(
  'alertar-prazos-daily',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://awdfeqxagqplpotjwant.supabase.co/functions/v1/alertar-prazos',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
