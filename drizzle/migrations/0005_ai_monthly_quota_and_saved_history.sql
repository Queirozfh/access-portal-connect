CREATE TABLE public.ai_account_access (user_id uuid PRIMARY KEY, enabled boolean NOT NULL DEFAULT true);
GRANT SELECT ON public.ai_account_access TO authenticated;
GRANT ALL ON public.ai_account_access TO service_role;
ALTER TABLE public.ai_account_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ai permission" ON public.ai_account_access FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE TABLE public.ai_monthly_usage (user_id uuid NOT NULL, month date NOT NULL, used integer NOT NULL DEFAULT 0 CHECK (used >= 0 AND used <= 4), PRIMARY KEY(user_id, month));
GRANT SELECT ON public.ai_monthly_usage TO authenticated;
GRANT ALL ON public.ai_monthly_usage TO service_role;
ALTER TABLE public.ai_monthly_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ai usage" ON public.ai_monthly_usage FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE FUNCTION public.reserve_ai_use(p_user_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m date := date_trunc('month', now() AT TIME ZONE 'America/Fortaleza')::date; n integer; allowed boolean;
BEGIN
 INSERT INTO ai_account_access(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
 SELECT enabled INTO allowed FROM ai_account_access WHERE user_id=p_user_id FOR UPDATE;
 IF NOT allowed THEN RETURN jsonb_build_object('allowed',false,'reason','disabled'); END IF;
 IF public.has_role(p_user_id,'admin') THEN RETURN jsonb_build_object('allowed',true,'admin',true); END IF;
 INSERT INTO ai_monthly_usage(user_id,month,used) VALUES(p_user_id,m,0) ON CONFLICT DO NOTHING;
 UPDATE ai_monthly_usage SET used=used+1 WHERE user_id=p_user_id AND month=m AND used<4 RETURNING used INTO n;
 IF n IS NULL THEN RETURN jsonb_build_object('allowed',false,'reason','limit','used',4); END IF;
 RETURN jsonb_build_object('allowed',true,'used',n,'month',m);
END $$;
REVOKE ALL ON FUNCTION public.reserve_ai_use(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_use(uuid) TO service_role;
CREATE TABLE public.app_state_history (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, account_id text NOT NULL, json text NOT NULL, saved_at timestamptz NOT NULL, archived_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.app_state_history TO authenticated;
GRANT ALL ON public.app_state_history TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.app_state_history_id_seq TO service_role;
ALTER TABLE public.app_state_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own active history" ON public.app_state_history FOR SELECT TO authenticated USING ((account_id=auth.uid()::text OR (account_id='main' AND auth.uid()='ad46a5e7-af23-4cff-b190-ea6b6140013d'::uuid)) AND COALESCE(((auth.jwt()->'app_metadata'->>'expires_at')::timestamptz > now()),true));
CREATE FUNCTION public.archive_financial_state() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF OLD.json IS DISTINCT FROM NEW.json THEN
 INSERT INTO app_state_history(account_id,json,saved_at) VALUES(OLD.id,OLD.json,OLD.updated_at);
 DELETE FROM app_state_history WHERE account_id=OLD.id AND id NOT IN (SELECT id FROM app_state_history WHERE account_id=OLD.id ORDER BY id DESC LIMIT 7);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.archive_financial_state() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER archive_financial_state BEFORE UPDATE ON public.app_state FOR EACH ROW EXECUTE FUNCTION public.archive_financial_state();
CREATE FUNCTION public.restore_financial_state(p_history_id bigint) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target text; snapshot text;
BEGIN
 IF auth.uid() IS NULL OR NOT COALESCE(((auth.jwt()->'app_metadata'->>'expires_at')::timestamptz > now()),true) THEN RAISE EXCEPTION 'Access denied'; END IF;
 target := CASE WHEN auth.uid()='ad46a5e7-af23-4cff-b190-ea6b6140013d'::uuid THEN 'main' ELSE auth.uid()::text END;
 PERFORM 1 FROM app_state WHERE id=target FOR UPDATE;
 SELECT json INTO snapshot FROM app_state_history WHERE id=p_history_id AND account_id=target;
 IF snapshot IS NULL THEN RETURN false; END IF;
 UPDATE app_state SET json=snapshot,updated_at=now() WHERE id=target;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.restore_financial_state(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_financial_state(bigint) TO authenticated;