DROP POLICY IF EXISTS "public read main" ON public.app_state;
DROP POLICY IF EXISTS "public insert" ON public.app_state;
DROP POLICY IF EXISTS "public update" ON public.app_state;
REVOKE ALL ON public.app_state FROM anon;
CREATE POLICY "owner read" ON public.app_state FOR SELECT TO authenticated USING (id = 'main' AND auth.uid() = 'ad46a5e7-af23-4cff-b190-ea6b6140013d'::uuid);
CREATE POLICY "owner insert" ON public.app_state FOR INSERT TO authenticated WITH CHECK (id = 'main' AND auth.uid() = 'ad46a5e7-af23-4cff-b190-ea6b6140013d'::uuid);
CREATE POLICY "owner update" ON public.app_state FOR UPDATE TO authenticated USING (id = 'main' AND auth.uid() = 'ad46a5e7-af23-4cff-b190-ea6b6140013d'::uuid) WITH CHECK (id = 'main' AND auth.uid() = 'ad46a5e7-af23-4cff-b190-ea6b6140013d'::uuid);