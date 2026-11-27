-- An explicit level-5 value in app_metadata is assigned through the admin
-- access controls. It grants the PJ workspace even when an old subscription
-- row is expired or inactive. The admin-managed expires_at still applies.
CREATE OR REPLACE FUNCTION public.business_owner_has_admin_level_five_grant(p_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = p_owner
      AND u.raw_app_meta_data->>'access_level' = '5'
      AND CASE
        WHEN NULLIF(u.raw_app_meta_data->>'expires_at', '') IS NULL THEN true
        WHEN (u.raw_app_meta_data->>'expires_at') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
          THEN (u.raw_app_meta_data->>'expires_at')::timestamptz > now()
        ELSE false
      END
  );
$$;

REVOKE ALL ON FUNCTION public.business_owner_has_admin_level_five_grant(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_owner_has_admin_level_five_grant(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.business_owner_has_active_level_five(p_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
  SELECT public.business_owner_has_admin_level_five_grant(p_owner)
    OR EXISTS (
      SELECT 1
      FROM auth.users u
      LEFT JOIN public.user_subscriptions s ON s.user_id = u.id
      LEFT JOIN public.subscription_plans p ON p.id = s.plan_id
      WHERE u.id = p_owner
        AND CASE
          WHEN s.user_id IS NOT NULL THEN
            s.status IN ('active', 'trialing')
            AND COALESCE(s.access_level_override, p.access_level, 0) = 5
            AND (s.expires_at IS NULL OR s.expires_at > now())
            AND CASE
              WHEN NULLIF(u.raw_app_meta_data->>'expires_at', '') IS NULL THEN true
              WHEN (u.raw_app_meta_data->>'expires_at') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
                THEN (u.raw_app_meta_data->>'expires_at')::timestamptz > now()
              ELSE false
            END
          ELSE
            COALESCE(
              CASE WHEN (u.raw_app_meta_data->>'access_level') ~ '^[1-5]$'
                THEN (u.raw_app_meta_data->>'access_level')::integer
              END,
              CASE WHEN u.created_at < timestamptz '2026-11-24 00:00:00+00' THEN 5 ELSE 1 END
            ) = 5
            AND CASE
              WHEN NULLIF(u.raw_app_meta_data->>'expires_at', '') IS NULL THEN true
              WHEN (u.raw_app_meta_data->>'expires_at') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
                THEN (u.raw_app_meta_data->>'expires_at')::timestamptz > now()
              ELSE false
            END
        END
    );
$$;

REVOKE ALL ON FUNCTION public.business_owner_has_active_level_five(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_owner_has_active_level_five(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.invite_business_workspace_member(
  p_workspace_id uuid,
  p_actor uuid,
  p_email text,
  p_role text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_workspace public.business_workspaces%ROWTYPE;
  v_limit integer;
  v_invite_id uuid;
  v_invited_user_id uuid;
  v_can_manage boolean;
BEGIN
  SELECT * INTO v_workspace FROM public.business_workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'workspace_not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.business_workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = p_actor AND role IN ('owner', 'admin')
  ) INTO v_can_manage;
  IF NOT v_can_manage THEN RAISE EXCEPTION 'workspace_forbidden' USING ERRCODE = '42501'; END IF;
  IF p_role NOT IN ('admin', 'finance', 'collaborator', 'accountant') THEN
    RAISE EXCEPTION 'workspace_role_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_invited_user_id FROM auth.users WHERE lower(email) = lower(btrim(p_email)) LIMIT 1;
  IF v_invited_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.business_workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = v_invited_user_id
  ) THEN
    RAISE EXCEPTION 'member_already_exists' USING ERRCODE = '23505';
  END IF;
  SELECT p.member_limit INTO v_limit
  FROM public.user_subscriptions s
  LEFT JOIN public.subscription_plans p ON p.id = s.plan_id
  WHERE s.user_id = v_workspace.owner_user_id;
  IF NOT public.has_role(v_workspace.owner_user_id, 'admin'::public.app_role)
     AND NOT public.business_owner_has_active_level_five(v_workspace.owner_user_id) THEN
    RAISE EXCEPTION 'workspace_plan_inactive' USING ERRCODE = '42501';
  END IF;
  IF public.has_role(v_workspace.owner_user_id, 'admin'::public.app_role) THEN v_limit := 5; END IF;
  IF public.business_owner_has_admin_level_five_grant(v_workspace.owner_user_id) THEN
    v_limit := GREATEST(5, COALESCE(v_limit, 1));
  END IF;
  IF v_limit IS NULL OR v_limit < 1 THEN v_limit := 5; END IF;
  IF (SELECT count(*) FROM public.business_workspace_members WHERE workspace_id = p_workspace_id)
     + (SELECT count(*) FROM public.business_workspace_invitations WHERE workspace_id = p_workspace_id AND status = 'pending' AND expires_at > now()) >= v_limit THEN
    RAISE EXCEPTION 'workspace_seat_limit' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.business_workspace_invitations (workspace_id, invited_email, role, created_by, expires_at)
  VALUES (p_workspace_id, lower(btrim(p_email)), p_role, p_actor, now() + interval '14 days')
  RETURNING id INTO v_invite_id;
  RETURN v_invite_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_business_workspace_invitation(
  p_invitation_id uuid,
  p_user_id uuid,
  p_email text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_invite public.business_workspace_invitations%ROWTYPE;
  v_workspace public.business_workspaces%ROWTYPE;
  v_limit integer;
BEGIN
  SELECT * INTO v_invite FROM public.business_workspace_invitations WHERE id = p_invitation_id FOR UPDATE;
  IF NOT FOUND OR v_invite.status <> 'pending' OR v_invite.expires_at <= now()
     OR lower(v_invite.invited_email) <> lower(btrim(p_email)) THEN
    RAISE EXCEPTION 'invitation_unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_workspace FROM public.business_workspaces WHERE id = v_invite.workspace_id FOR UPDATE;
  SELECT p.member_limit INTO v_limit
  FROM public.user_subscriptions s
  LEFT JOIN public.subscription_plans p ON p.id = s.plan_id
  WHERE s.user_id = v_workspace.owner_user_id;
  IF NOT public.has_role(v_workspace.owner_user_id, 'admin'::public.app_role)
     AND NOT public.business_owner_has_active_level_five(v_workspace.owner_user_id) THEN
    RAISE EXCEPTION 'workspace_plan_inactive' USING ERRCODE = '42501';
  END IF;
  IF public.has_role(v_workspace.owner_user_id, 'admin'::public.app_role) THEN v_limit := 5; END IF;
  IF public.business_owner_has_admin_level_five_grant(v_workspace.owner_user_id) THEN
    v_limit := GREATEST(5, COALESCE(v_limit, 1));
  END IF;
  IF v_limit IS NULL OR v_limit < 1 THEN v_limit := 5; END IF;
  IF (SELECT count(*) FROM public.business_workspace_members WHERE workspace_id = v_workspace.id) >= v_limit THEN
    RAISE EXCEPTION 'workspace_seat_limit' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.business_workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace.id, p_user_id, v_invite.role)
  ON CONFLICT (workspace_id, user_id) DO NOTHING;
  UPDATE public.business_workspace_invitations SET status = 'accepted', responded_at = now() WHERE id = v_invite.id;
  RETURN v_workspace.id;
END;
$$;

REVOKE ALL ON FUNCTION public.invite_business_workspace_member(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_business_workspace_invitation(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invite_business_workspace_member(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.accept_business_workspace_invitation(uuid, uuid, text) TO service_role;
