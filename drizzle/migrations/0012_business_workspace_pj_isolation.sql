-- Keep shared company state structurally separate from every personal profile.
-- This guard is a database backstop for the server-side workspace scoping.
CREATE OR REPLACE FUNCTION public.enforce_business_workspace_pj_isolation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_state jsonb;
  v_profiles jsonb;
  v_legacy_profile jsonb;
BEGIN
  BEGIN
    v_state := NEW.json::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'workspace_state_invalid_json' USING ERRCODE = '22023';
  END;

  IF jsonb_typeof(v_state) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'workspace_state_invalid_shape' USING ERRCODE = '22023';
  END IF;

  v_profiles := v_state -> 'financeProfiles';
  IF jsonb_typeof(v_profiles) IS DISTINCT FROM 'object' OR NOT COALESCE(v_profiles ? 'PJ', false) THEN
    RAISE EXCEPTION 'workspace_state_must_contain_company_profile' USING ERRCODE = '23514';
  END IF;
  IF COALESCE(v_profiles ? 'PF', false) OR COALESCE(v_state ? 'PF', false) THEN
    RAISE EXCEPTION 'workspace_personal_profile_forbidden' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(v_profiles -> 'PJ') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'workspace_company_profile_invalid' USING ERRCODE = '23514';
  END IF;

  -- `patrimonioApp` was a legacy duplicate of PJ. Only allow it when empty or
  -- byte-for-byte equivalent as JSON to the explicit company profile.
  v_legacy_profile := v_state -> 'patrimonioApp';
  IF v_legacy_profile IS NOT NULL
     AND v_legacy_profile <> '{}'::jsonb
     AND v_legacy_profile IS DISTINCT FROM (v_profiles -> 'PJ') THEN
    RAISE EXCEPTION 'workspace_legacy_profile_must_match_company' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_business_workspace_pj_isolation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_business_workspace_pj_isolation() TO service_role;

DROP TRIGGER IF EXISTS business_workspace_state_pj_isolation ON public.business_workspace_state;
CREATE TRIGGER business_workspace_state_pj_isolation
  BEFORE INSERT OR UPDATE OF json ON public.business_workspace_state
  FOR EACH ROW EXECUTE FUNCTION public.enforce_business_workspace_pj_isolation();
