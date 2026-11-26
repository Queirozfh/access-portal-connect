-- Align the server-enforced AI quota with the per-user admin setting.
ALTER TABLE public.ai_monthly_usage
  DROP CONSTRAINT IF EXISTS ai_monthly_usage_used_check;
ALTER TABLE public.ai_monthly_usage
  ADD CONSTRAINT ai_monthly_usage_used_check CHECK (used >= 0 AND used <= 10000);

CREATE OR REPLACE FUNCTION public.reserve_ai_use(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  m date := date_trunc('month', now() AT TIME ZONE 'America/Fortaleza')::date;
  n integer;
  allowed boolean;
  configured_limit integer := 4;
BEGIN
  INSERT INTO public.ai_account_access(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
  SELECT enabled INTO allowed FROM public.ai_account_access WHERE user_id=p_user_id FOR UPDATE;
  IF NOT COALESCE(allowed, false) THEN
    RETURN jsonb_build_object('allowed',false,'reason','disabled');
  END IF;
  IF public.has_role(p_user_id,'admin') THEN
    RETURN jsonb_build_object('allowed',true,'admin',true);
  END IF;

  SELECT CASE
    WHEN COALESCE(raw_app_meta_data->>'ai_monthly_limit','') ~ '^[0-9]{1,5}$'
      THEN LEAST((raw_app_meta_data->>'ai_monthly_limit')::integer,10000)
    ELSE 4
  END
  INTO configured_limit
  FROM auth.users
  WHERE id=p_user_id;
  configured_limit := COALESCE(configured_limit,4);

  INSERT INTO public.ai_monthly_usage(user_id,month,used) VALUES(p_user_id,m,0) ON CONFLICT DO NOTHING;
  UPDATE public.ai_monthly_usage
  SET used=used+1
  WHERE user_id=p_user_id AND month=m AND used<configured_limit
  RETURNING used INTO n;
  IF n IS NULL THEN
    RETURN jsonb_build_object('allowed',false,'reason','limit','used',
      COALESCE((SELECT used FROM public.ai_monthly_usage WHERE user_id=p_user_id AND month=m),0),
      'limit',configured_limit);
  END IF;
  RETURN jsonb_build_object('allowed',true,'used',n,'limit',configured_limit,'month',m);
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_ai_use(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_use(uuid) TO service_role;

-- Retain one immutable snapshot per account and local calendar day.
ALTER TABLE public.app_state_daily_backup
  DROP CONSTRAINT IF EXISTS app_state_daily_backup_pkey;
ALTER TABLE public.app_state_daily_backup
  DROP CONSTRAINT IF EXISTS app_state_daily_backup_account_id_fkey;
ALTER TABLE public.app_state_daily_backup
  ADD CONSTRAINT app_state_daily_backup_pkey PRIMARY KEY (account_id, backup_date);

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
  ON CONFLICT (account_id, backup_date) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.create_daily_financial_backup() FROM PUBLIC, anon, authenticated;
