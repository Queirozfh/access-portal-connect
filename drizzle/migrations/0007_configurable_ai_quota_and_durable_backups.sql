ALTER TABLE public.ai_monthly_usage
  DROP CONSTRAINT IF EXISTS ai_monthly_usage_used_check;
ALTER TABLE public.ai_monthly_usage
  ADD CONSTRAINT ai_monthly_usage_used_check CHECK (used >= 0 AND used <= 10000);

CREATE OR REPLACE FUNCTION public.reserve_ai_use(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  m date := date_trunc('month', now() AT TIME ZONE 'America/Fortaleza')::date;
  n integer;
  allowed boolean;
  configured_limit integer;
  raw_limit text;
BEGIN
  SELECT raw_app_meta_data->>'ai_monthly_limit'
    INTO raw_limit
    FROM auth.users
    WHERE id = p_user_id;

  IF raw_limit ~ '^(0|[1-9][0-9]{0,4})$' AND raw_limit::integer <= 10000 THEN
    configured_limit := raw_limit::integer;
  ELSE
    configured_limit := 4;
  END IF;

  INSERT INTO ai_account_access(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
  SELECT enabled INTO allowed FROM ai_account_access WHERE user_id=p_user_id FOR UPDATE;
  IF NOT COALESCE(allowed, false) THEN
    RETURN jsonb_build_object('allowed',false,'reason','disabled');
  END IF;
  IF public.has_role(p_user_id,'admin') THEN
    RETURN jsonb_build_object('allowed',true,'admin',true);
  END IF;

  INSERT INTO ai_monthly_usage(user_id,month,used) VALUES(p_user_id,m,0) ON CONFLICT DO NOTHING;
  UPDATE ai_monthly_usage
    SET used=used+1
    WHERE user_id=p_user_id AND month=m AND used<configured_limit
    RETURNING used INTO n;
  IF n IS NULL THEN
    RETURN jsonb_build_object('allowed',false,'reason','limit','used',configured_limit,'limit',configured_limit);
  END IF;
  RETURN jsonb_build_object('allowed',true,'used',n,'limit',configured_limit,'month',m);
END
$$;
REVOKE ALL ON FUNCTION public.reserve_ai_use(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_use(uuid) TO service_role;

ALTER TABLE public.app_state_daily_backup
  DROP CONSTRAINT IF EXISTS app_state_daily_backup_pkey;
ALTER TABLE public.app_state_daily_backup
  ADD CONSTRAINT app_state_daily_backup_pkey PRIMARY KEY (account_id, backup_date);

CREATE OR REPLACE FUNCTION public.can_export_financial_state(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  account auth.users%ROWTYPE;
  admin_account auth.users%ROWTYPE;
  level integer;
  policies jsonb;
  permitted boolean;
  raw_expiry text;
BEGIN
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN RETURN false; END IF;
  IF p_user_id='ad46a5e7-af23-4cff-b190-ea6b6140013d'::uuid OR public.has_role(p_user_id,'admin') THEN RETURN true; END IF;
  SELECT * INTO account FROM auth.users WHERE id=p_user_id;
  IF NOT FOUND THEN RETURN false; END IF;
  raw_expiry := account.raw_app_meta_data->>'expires_at';
  IF raw_expiry ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' AND raw_expiry::timestamptz <= now() THEN RETURN false; END IF;
  IF (account.raw_app_meta_data->>'access_level') ~ '^[1-5]$' THEN
    level := (account.raw_app_meta_data->>'access_level')::integer;
  ELSE
    level := CASE WHEN account.created_at < '2026-11-24T00:00:00Z'::timestamptz THEN 5 ELSE 1 END;
  END IF;
  IF level >= 5 THEN RETURN true; END IF;
  SELECT * INTO admin_account FROM auth.users WHERE id='ad46a5e7-af23-4cff-b190-ea6b6140013d'::uuid;
  policies := admin_account.raw_app_meta_data->'access_policies';
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(policies)='array' THEN policies ELSE '[]'::jsonb END) AS item
    WHERE (item->>'level') ~ '^[1-5]$'
      AND (item->>'level')::integer=level
      AND jsonb_typeof(COALESCE(item->'features','[]'::jsonb))='array'
      AND COALESCE(item->'features','[]'::jsonb) ? 'account.export'
  ) INTO permitted;
  RETURN COALESCE(permitted,false);
END
$$;
REVOKE ALL ON FUNCTION public.can_export_financial_state(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_export_financial_state(uuid) TO authenticated;

DROP POLICY IF EXISTS "own active history" ON public.app_state_history;
CREATE POLICY "own active history" ON public.app_state_history FOR SELECT TO authenticated USING (
  (account_id=auth.uid()::text OR (account_id='main' AND auth.uid()='ad46a5e7-af23-4cff-b190-ea6b6140013d'::uuid))
  AND COALESCE(((auth.jwt()->'app_metadata'->>'expires_at')::timestamptz > now()),true)
  AND public.can_export_financial_state(auth.uid())
);

DROP POLICY IF EXISTS "user own read" ON public.app_state;
DROP POLICY IF EXISTS "user own insert" ON public.app_state;
DROP POLICY IF EXISTS "user own update" ON public.app_state;
REVOKE ALL ON public.app_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_state TO service_role;

REVOKE ALL ON public.app_state_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.app_state_history TO authenticated;

DROP POLICY IF EXISTS "own daily financial backup" ON public.app_state_daily_backup;
REVOKE ALL ON public.app_state_daily_backup FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.app_state_daily_backup TO authenticated;
CREATE POLICY "own daily financial backup" ON public.app_state_daily_backup FOR SELECT TO authenticated USING (
  (account_id=auth.uid()::text OR (account_id='main' AND auth.uid()='ad46a5e7-af23-4cff-b190-ea6b6140013d'::uuid))
  AND COALESCE(((auth.jwt()->'app_metadata'->>'expires_at')::timestamptz > now()),true)
  AND public.can_export_financial_state(auth.uid())
);

CREATE OR REPLACE FUNCTION public.restore_financial_state(p_history_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  target text;
  snapshot text;
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(((auth.jwt()->'app_metadata'->>'expires_at')::timestamptz > now()),true)
     OR NOT public.can_export_financial_state(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  target := CASE WHEN auth.uid()='ad46a5e7-af23-4cff-b190-ea6b6140013d'::uuid THEN 'main' ELSE auth.uid()::text END;
  PERFORM 1 FROM public.app_state WHERE id=target FOR UPDATE;
  SELECT json INTO snapshot FROM public.app_state_history WHERE id=p_history_id AND account_id=target;
  IF snapshot IS NULL THEN RETURN false; END IF;
  UPDATE public.app_state SET json=snapshot,updated_at=now() WHERE id=target;
  RETURN FOUND;
END
$$;
REVOKE ALL ON FUNCTION public.restore_financial_state(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_financial_state(bigint) TO authenticated;

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
  ON CONFLICT (account_id, backup_date) DO UPDATE
    SET json=EXCLUDED.json, created_at=EXCLUDED.created_at;

  DELETE FROM public.app_state_daily_backup
    WHERE backup_date < fortaleza_date - 30;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_daily_financial_backup(p_backup_date date)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  target text;
  snapshot text;
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(((auth.jwt()->'app_metadata'->>'expires_at')::timestamptz > now()),true) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF NOT public.can_export_financial_state(auth.uid()) THEN RAISE EXCEPTION 'Access denied'; END IF;

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

CREATE OR REPLACE FUNCTION public.list_daily_financial_backups()
RETURNS TABLE(backup_date date, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  target text;
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(((auth.jwt()->'app_metadata'->>'expires_at')::timestamptz > now()),true) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF NOT public.can_export_financial_state(auth.uid()) THEN RAISE EXCEPTION 'Access denied'; END IF;
  target := CASE WHEN auth.uid()='ad46a5e7-af23-4cff-b190-ea6b6140013d'::uuid THEN 'main' ELSE auth.uid()::text END;
  RETURN QUERY SELECT b.backup_date, b.created_at
    FROM public.app_state_daily_backup b
    WHERE b.account_id=target
    ORDER BY b.backup_date DESC
    LIMIT 30;
END
$$;
REVOKE ALL ON FUNCTION public.list_daily_financial_backups() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_daily_financial_backups() TO authenticated;

CREATE TABLE public.auth_attempt_limits (
  kind text NOT NULL CHECK (kind IN ('login', 'signup')),
  ip_hash text NOT NULL CHECK (ip_hash ~ '^[0-9a-f]{64}$'),
  window_started timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts > 0),
  PRIMARY KEY (kind, ip_hash)
);
ALTER TABLE public.auth_attempt_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_attempt_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auth_attempt_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_auth_attempt(p_kind text, p_ip_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_time timestamptz := clock_timestamp();
  n integer;
BEGIN
  IF p_kind NOT IN ('login', 'signup') OR p_ip_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;
  INSERT INTO public.auth_attempt_limits(kind, ip_hash, window_started, attempts)
    VALUES (p_kind, p_ip_hash, current_time, 1)
  ON CONFLICT (kind, ip_hash) DO UPDATE SET
    window_started = CASE
      WHEN public.auth_attempt_limits.window_started <= current_time - interval '15 minutes' THEN current_time
      ELSE public.auth_attempt_limits.window_started
    END,
    attempts = CASE
      WHEN public.auth_attempt_limits.window_started <= current_time - interval '15 minutes' THEN 1
      ELSE public.auth_attempt_limits.attempts + 1
    END
  RETURNING attempts INTO n;
  RETURN n <= 5;
END
$$;
REVOKE ALL ON FUNCTION public.consume_auth_attempt(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_auth_attempt(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.reset_auth_attempt(p_kind text, p_ip_hash text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  DELETE FROM public.auth_attempt_limits WHERE kind=p_kind AND ip_hash=p_ip_hash
$$;
REVOKE ALL ON FUNCTION public.reset_auth_attempt(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_auth_attempt(text, text) TO service_role;

SELECT cron.schedule(
  'auth-attempt-limit-cleanup',
  '30 3 * * *',
  $$DELETE FROM public.auth_attempt_limits WHERE window_started < now() - interval '1 day'$$
);
