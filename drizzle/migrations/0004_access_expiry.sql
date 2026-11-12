CREATE POLICY "access not expired" ON public.app_state AS RESTRICTIVE FOR ALL TO authenticated
USING (coalesce((auth.jwt() -> 'app_metadata' ->> 'expires_at')::timestamptz > now(), true))
WITH CHECK (coalesce((auth.jwt() -> 'app_metadata' ->> 'expires_at')::timestamptz > now(), true));