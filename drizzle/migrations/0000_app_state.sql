CREATE TABLE public.app_state (id text PRIMARY KEY, json text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE ON public.app_state TO anon, authenticated;
GRANT ALL ON public.app_state TO service_role;
ALTER TABLE public.app_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON public.app_state FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public insert" ON public.app_state FOR INSERT TO anon, authenticated WITH CHECK (id = 'main');
CREATE POLICY "public update" ON public.app_state FOR UPDATE TO anon, authenticated USING (id = 'main') WITH CHECK (id = 'main');