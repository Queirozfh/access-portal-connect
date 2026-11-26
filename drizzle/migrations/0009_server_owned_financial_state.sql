-- Financial state access is mediated by authenticated server routes so that
-- access levels, the PF/PJ boundary and optimistic concurrency are enforced.
REVOKE ALL ON public.app_state FROM anon, authenticated;
GRANT ALL ON public.app_state TO service_role;

REVOKE SELECT ON public.app_state_history FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_financial_state(bigint) FROM authenticated;

CREATE OR REPLACE FUNCTION public.save_app_state_if_version(
  p_id text,
  p_json text,
  p_expected_updated_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE saved_at timestamptz;
BEGIN
  IF p_id IS NULL OR length(p_id) > 80 OR p_json IS NULL OR length(p_json) > 5000000 THEN
    RAISE EXCEPTION 'Invalid financial state';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    INSERT INTO public.app_state(id,json,updated_at)
    VALUES(p_id,p_json,clock_timestamp())
    ON CONFLICT (id) DO NOTHING
    RETURNING updated_at INTO saved_at;
  ELSE
    UPDATE public.app_state
    SET json=p_json, updated_at=clock_timestamp()
    WHERE id=p_id AND updated_at=p_expected_updated_at
    RETURNING updated_at INTO saved_at;
  END IF;
  IF saved_at IS NULL THEN
    RETURN jsonb_build_object('ok',false);
  END IF;
  RETURN jsonb_build_object('ok',true,'updated_at',saved_at);
END;
$$;
REVOKE ALL ON FUNCTION public.save_app_state_if_version(text,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_app_state_if_version(text,text,timestamptz) TO service_role;
