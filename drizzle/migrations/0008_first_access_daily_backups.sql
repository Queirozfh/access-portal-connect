-- Daily snapshots are now created when an authenticated account first loads
-- its financial state, rather than by a global scheduled job.
DO $$
DECLARE
  backup_job record;
BEGIN
  FOR backup_job IN
    SELECT jobid FROM cron.job WHERE jobname = 'daily-financial-account-backup'
  LOOP
    PERFORM cron.unschedule(backup_job.jobid);
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.create_daily_financial_backup_for_account(p_account_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  fortaleza_date date := (clock_timestamp() AT TIME ZONE 'America/Fortaleza')::date;
BEGIN
  IF p_account_id IS NULL OR btrim(p_account_id) = '' THEN
    RAISE EXCEPTION 'Invalid account';
  END IF;

  INSERT INTO public.app_state_daily_backup(account_id, backup_date, json, created_at)
  SELECT id, fortaleza_date, json, clock_timestamp()
  FROM public.app_state
  WHERE id = p_account_id
  ON CONFLICT (account_id, backup_date) DO NOTHING;

  WITH ranked AS (
    SELECT account_id, backup_date,
      row_number() OVER (PARTITION BY account_id ORDER BY backup_date DESC) AS position
    FROM public.app_state_daily_backup
    WHERE account_id = p_account_id
  )
  DELETE FROM public.app_state_daily_backup AS backup
  USING ranked
  WHERE backup.account_id = ranked.account_id
    AND backup.backup_date = ranked.backup_date
    AND (ranked.position > 7 OR ranked.backup_date < fortaleza_date - 6);
END;
$$;
REVOKE ALL ON FUNCTION public.create_daily_financial_backup_for_account(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_daily_financial_backup_for_account(text) TO service_role;

-- Keep the administrative/manual routine consistent with the same retention
-- rules in case it is invoked outside the normal first-access flow.
CREATE OR REPLACE FUNCTION public.create_daily_financial_backup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  fortaleza_date date := (clock_timestamp() AT TIME ZONE 'America/Fortaleza')::date;
BEGIN
  INSERT INTO public.app_state_daily_backup(account_id, backup_date, json, created_at)
  SELECT id, fortaleza_date, json, clock_timestamp()
  FROM public.app_state
  ON CONFLICT (account_id, backup_date) DO NOTHING;

  WITH ranked AS (
    SELECT account_id, backup_date,
      row_number() OVER (PARTITION BY account_id ORDER BY backup_date DESC) AS position
    FROM public.app_state_daily_backup
  )
  DELETE FROM public.app_state_daily_backup AS backup
  USING ranked
  WHERE backup.account_id = ranked.account_id
    AND backup.backup_date = ranked.backup_date
    AND (ranked.position > 7 OR ranked.backup_date < fortaleza_date - 6);
END;
$$;
REVOKE ALL ON FUNCTION public.create_daily_financial_backup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_daily_financial_backup() TO service_role;

-- Bring existing data under the new seven-day and seven-record limits.
DO $$
DECLARE
  fortaleza_date date := (clock_timestamp() AT TIME ZONE 'America/Fortaleza')::date;
BEGIN
  WITH ranked AS (
    SELECT account_id, backup_date,
      row_number() OVER (PARTITION BY account_id ORDER BY backup_date DESC) AS position
    FROM public.app_state_daily_backup
  )
  DELETE FROM public.app_state_daily_backup AS backup
  USING ranked
  WHERE backup.account_id = ranked.account_id
    AND backup.backup_date = ranked.backup_date
    AND (ranked.position > 7 OR ranked.backup_date < fortaleza_date - 6);
END
$$;

CREATE OR REPLACE FUNCTION public.list_daily_financial_backups()
RETURNS TABLE(backup_date date, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  target text;
  fortaleza_date date := (clock_timestamp() AT TIME ZONE 'America/Fortaleza')::date;
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(((auth.jwt()->'app_metadata'->>'expires_at')::timestamptz > now()),true) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF NOT public.can_export_financial_state(auth.uid()) THEN RAISE EXCEPTION 'Access denied'; END IF;
  target := CASE WHEN auth.uid()='ad46a5e7-af23-4cff-b190-ea6b6140013d'::uuid THEN 'main' ELSE auth.uid()::text END;
  RETURN QUERY SELECT backup.backup_date, backup.created_at
    FROM public.app_state_daily_backup AS backup
    WHERE backup.account_id = target
      AND backup.backup_date BETWEEN fortaleza_date - 6 AND fortaleza_date
    ORDER BY backup.backup_date DESC
    LIMIT 7;
END
$$;
REVOKE ALL ON FUNCTION public.list_daily_financial_backups() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_daily_financial_backups() TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_daily_financial_backup(p_backup_date date)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  target text;
  snapshot text;
  fortaleza_date date := (clock_timestamp() AT TIME ZONE 'America/Fortaleza')::date;
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(((auth.jwt()->'app_metadata'->>'expires_at')::timestamptz > now()),true) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF NOT public.can_export_financial_state(auth.uid()) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF p_backup_date < fortaleza_date - 6 OR p_backup_date > fortaleza_date THEN RETURN false; END IF;

  target := CASE WHEN auth.uid()='ad46a5e7-af23-4cff-b190-ea6b6140013d'::uuid THEN 'main' ELSE auth.uid()::text END;
  PERFORM 1 FROM public.app_state WHERE id=target FOR UPDATE;
  SELECT json INTO snapshot
    FROM public.app_state_daily_backup
    WHERE account_id=target AND backup_date=p_backup_date;
  IF snapshot IS NULL THEN RETURN false; END IF;
  UPDATE public.app_state SET json=snapshot,updated_at=now() WHERE id=target;
  RETURN FOUND;
END
$$;
REVOKE ALL ON FUNCTION public.restore_daily_financial_backup(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_daily_financial_backup(date) TO authenticated;
