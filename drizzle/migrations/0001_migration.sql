DROP POLICY IF EXISTS "public read" ON public.app_state;
CREATE POLICY "public read main" ON public.app_state FOR SELECT TO anon, authenticated USING (id = 'main');