CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

CREATE TABLE public.app_state_daily_backup (
  account_id text PRIMARY KEY REFERENCES public.app_state(id) ON DELETE CASCADE,
  backup_date date NOT NULL,
  json text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_state_daily_backup TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_state_daily_backup TO service_role;
ALTER TABLE public.app_state_daily_backup ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own daily financial backup" ON public.app_state_daily_backup FOR SELECT TO authenticated USING (
  (account_id=auth.uid()::text OR (account_id='main' AND auth.uid()='ad46a5e7-af23-4cff-b190-ea6b6140013d'::uuid))
  AND COALESCE(((auth.jwt()->'app_metadata'->>'expires_at')::timestamptz > now()),true)
);

CREATE OR REPLACE FUNCTION public.create_daily_financial_backup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  sao_paulo_date date := (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  INSERT INTO public.app_state_daily_backup(account_id, backup_date, json, created_at)
  SELECT id, sao_paulo_date, json, clock_timestamp()
  FROM public.app_state
  ON CONFLICT (account_id) DO UPDATE
  SET backup_date=EXCLUDED.backup_date,
      json=EXCLUDED.json,
      created_at=EXCLUDED.created_at
  WHERE public.app_state_daily_backup.backup_date < EXCLUDED.backup_date;
END;
$$;
REVOKE ALL ON FUNCTION public.create_daily_financial_backup() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule(
  'daily-financial-account-backup',
  '0 3 * * *',
  'SELECT public.create_daily_financial_backup();'
);
