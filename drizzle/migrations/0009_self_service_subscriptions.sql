CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  price_cents integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0 AND price_cents <= 99999999),
  duration_days integer NOT NULL CHECK (duration_days BETWEEN 1 AND 3650),
  access_level integer NOT NULL DEFAULT 1 CHECK (access_level BETWEEN 1 AND 5),
  is_free boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT is_free OR price_cents = 0),
  CHECK (NOT is_free OR is_active)
);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_plans_single_free_plan
  ON public.subscription_plans (is_free) WHERE is_free;

INSERT INTO public.subscription_plans
  (slug, name, description, price_cents, duration_days, access_level, is_free, is_active)
VALUES
  ('free-trial', 'Free', 'Teste gratuito por 7 dias para organizar suas finanças pessoais.', 0, 7, 1, true, true)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  access_level_override integer CHECK (access_level_override BETWEEN 1 AND 5),
  status text NOT NULL DEFAULT 'expired' CHECK (status IN ('trialing', 'active', 'expired', 'canceled')),
  started_at timestamptz,
  expires_at timestamptz,
  pending_plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  pending_requested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((pending_plan_id IS NULL) = (pending_requested_at IS NULL))
);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscription_plans, public.user_subscriptions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.subscription_plans, public.user_subscriptions TO service_role;
