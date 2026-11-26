-- Persist login and signup throttles across serverless instances and restarts.
CREATE TABLE public.auth_attempt_windows (
  attempt_key text NOT NULL,
  action text NOT NULL CHECK (action IN ('login','signup')),
  window_started_at timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts >= 0),
  PRIMARY KEY (attempt_key, action)
);
ALTER TABLE public.auth_attempt_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_attempt_windows FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.auth_attempt_windows TO service_role;

CREATE OR REPLACE FUNCTION public.consume_auth_attempt(
  p_key text,
  p_action text,
  p_limit integer DEFAULT 5,
  p_window_seconds integer DEFAULT 900
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE current_attempts integer;
BEGIN
  IF length(p_key) <> 64 OR p_action NOT IN ('login','signup')
     OR p_limit < 1 OR p_limit > 20 OR p_window_seconds < 60 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid throttle parameters';
  END IF;
  INSERT INTO public.auth_attempt_windows(attempt_key,action,window_started_at,attempts)
  VALUES(p_key,p_action,clock_timestamp(),1)
  ON CONFLICT (attempt_key,action) DO UPDATE
  SET attempts = CASE
        WHEN public.auth_attempt_windows.window_started_at + make_interval(secs => p_window_seconds) <= clock_timestamp()
          THEN 1 ELSE public.auth_attempt_windows.attempts + 1 END,
      window_started_at = CASE
        WHEN public.auth_attempt_windows.window_started_at + make_interval(secs => p_window_seconds) <= clock_timestamp()
          THEN clock_timestamp() ELSE public.auth_attempt_windows.window_started_at END
  RETURNING attempts INTO current_attempts;
  RETURN current_attempts <= p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_auth_attempts(p_key text, p_action text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  DELETE FROM public.auth_attempt_windows WHERE attempt_key = p_key AND action = p_action;
$$;
REVOKE ALL ON FUNCTION public.consume_auth_attempt(text,text,integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_auth_attempts(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_auth_attempt(text,text,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_auth_attempts(text,text) TO service_role;
