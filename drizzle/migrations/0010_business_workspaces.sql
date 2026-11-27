ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS member_limit integer NOT NULL DEFAULT 1
  CHECK (member_limit BETWEEN 1 AND 500);

UPDATE public.subscription_plans
SET member_limit = 5, updated_at = now()
WHERE access_level = 5 AND is_free = false AND member_limit = 1;

CREATE TABLE IF NOT EXISTS public.business_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.business_workspace_members (
  workspace_id uuid NOT NULL REFERENCES public.business_workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'finance', 'collaborator', 'accountant')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS business_workspace_members_user_idx
  ON public.business_workspace_members (user_id, workspace_id);

CREATE TABLE IF NOT EXISTS public.business_workspace_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.business_workspaces(id) ON DELETE CASCADE,
  invited_email text NOT NULL CHECK (char_length(invited_email) BETWEEN 3 AND 255),
  role text NOT NULL CHECK (role IN ('admin', 'finance', 'collaborator', 'accountant')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  responded_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS business_workspace_pending_invite_email_idx
  ON public.business_workspace_invitations (workspace_id, lower(invited_email))
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS business_workspace_invitation_email_idx
  ON public.business_workspace_invitations (lower(invited_email), status, expires_at);

CREATE TABLE IF NOT EXISTS public.business_workspace_state (
  workspace_id uuid PRIMARY KEY REFERENCES public.business_workspaces(id) ON DELETE CASCADE,
  json text NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.business_workspace_state_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.business_workspaces(id) ON DELETE CASCADE,
  json text NOT NULL,
  saved_at timestamptz NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.business_workspace_daily_backups (
  workspace_id uuid NOT NULL REFERENCES public.business_workspaces(id) ON DELETE CASCADE,
  backup_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  json text NOT NULL,
  PRIMARY KEY (workspace_id, backup_date)
);

CREATE OR REPLACE FUNCTION public.create_daily_business_workspace_backup(p_workspace_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Fortaleza')::date;
BEGIN
  INSERT INTO public.business_workspace_daily_backups (workspace_id, backup_date, json)
  SELECT p_workspace_id, v_today, json
  FROM public.business_workspace_state
  WHERE workspace_id = p_workspace_id
  ON CONFLICT (workspace_id, backup_date) DO NOTHING;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_business_workspace_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.business_workspace_state_history (workspace_id, json, saved_at)
  VALUES (OLD.workspace_id, OLD.json, OLD.updated_at);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_workspace_state_archive_before_update ON public.business_workspace_state;
CREATE TRIGGER business_workspace_state_archive_before_update
  BEFORE UPDATE ON public.business_workspace_state
  FOR EACH ROW EXECUTE FUNCTION public.archive_business_workspace_state();

CREATE OR REPLACE FUNCTION public.create_business_workspace(
  p_owner uuid,
  p_name text,
  p_member_limit integer,
  p_initial_state text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_member_limit < 1 OR p_member_limit > 500 THEN
    RAISE EXCEPTION 'member_limit_invalid' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.business_workspaces (owner_user_id, name)
  VALUES (p_owner, btrim(p_name))
  RETURNING id INTO v_id;
  INSERT INTO public.business_workspace_members (workspace_id, user_id, role)
  VALUES (v_id, p_owner, 'owner');
  INSERT INTO public.business_workspace_state (workspace_id, json)
  VALUES (v_id, COALESCE(p_initial_state, '{}'));
  RETURN v_id;
END;
$$;

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
  v_level integer;
  v_status text;
  v_expires timestamptz;
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
  SELECT s.status, s.expires_at, COALESCE(s.access_level_override, p.access_level), p.member_limit
    INTO v_status, v_expires, v_level, v_limit
  FROM public.user_subscriptions s
  LEFT JOIN public.subscription_plans p ON p.id = s.plan_id
  WHERE s.user_id = v_workspace.owner_user_id;
  IF NOT public.has_role(v_workspace.owner_user_id, 'admin'::public.app_role)
     AND NOT (v_status IN ('active', 'trialing') AND v_level = 5 AND (v_expires IS NULL OR v_expires > now())) THEN
    RAISE EXCEPTION 'workspace_plan_inactive' USING ERRCODE = '42501';
  END IF;
  IF public.has_role(v_workspace.owner_user_id, 'admin'::public.app_role) THEN v_limit := 5; END IF;
  IF v_limit IS NULL OR v_limit < 1 THEN v_limit := 5; END IF;
  IF (SELECT count(*) FROM public.business_workspace_members WHERE workspace_id = p_workspace_id)
     + (SELECT count(*) FROM public.business_workspace_invitations WHERE workspace_id = p_workspace_id AND status = 'pending' AND expires_at > now()) >= v_limit THEN
    RAISE EXCEPTION 'workspace_seat_limit' USING ERRCODE = '23514';
  END IF;
  v_expires := now() + interval '14 days';
  INSERT INTO public.business_workspace_invitations (workspace_id, invited_email, role, created_by, expires_at)
  VALUES (p_workspace_id, lower(btrim(p_email)), p_role, p_actor, v_expires)
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
  v_level integer;
  v_status text;
  v_expires timestamptz;
BEGIN
  SELECT * INTO v_invite FROM public.business_workspace_invitations WHERE id = p_invitation_id FOR UPDATE;
  IF NOT FOUND OR v_invite.status <> 'pending' OR v_invite.expires_at <= now()
     OR lower(v_invite.invited_email) <> lower(btrim(p_email)) THEN
    RAISE EXCEPTION 'invitation_unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_workspace FROM public.business_workspaces WHERE id = v_invite.workspace_id FOR UPDATE;
  SELECT s.status, s.expires_at, COALESCE(s.access_level_override, p.access_level), p.member_limit
    INTO v_status, v_expires, v_level, v_limit
  FROM public.user_subscriptions s
  LEFT JOIN public.subscription_plans p ON p.id = s.plan_id
  WHERE s.user_id = v_workspace.owner_user_id;
  IF NOT public.has_role(v_workspace.owner_user_id, 'admin'::public.app_role)
     AND NOT (v_status IN ('active', 'trialing') AND v_level = 5 AND (v_expires IS NULL OR v_expires > now())) THEN
    RAISE EXCEPTION 'workspace_plan_inactive' USING ERRCODE = '42501';
  END IF;
  IF public.has_role(v_workspace.owner_user_id, 'admin'::public.app_role) THEN v_limit := 5; END IF;
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

ALTER TABLE public.business_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_workspace_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_workspace_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_workspace_state_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.business_workspaces, public.business_workspace_members,
  public.business_workspace_invitations, public.business_workspace_state,
  public.business_workspace_state_history, public.business_workspace_daily_backups FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.business_workspaces, public.business_workspace_members,
  public.business_workspace_invitations, public.business_workspace_state,
  public.business_workspace_state_history, public.business_workspace_daily_backups TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.business_workspace_state_history_id_seq TO service_role;
REVOKE ALL ON FUNCTION public.create_business_workspace(uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invite_business_workspace_member(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_business_workspace_invitation(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_daily_business_workspace_backup(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_business_workspace(uuid, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.invite_business_workspace_member(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.accept_business_workspace_invitation(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_daily_business_workspace_backup(uuid) TO service_role;
