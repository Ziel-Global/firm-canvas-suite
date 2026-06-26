-- Failed-login lockout tracking (server-managed via service role only)
CREATE TABLE public.login_attempts (
  email text PRIMARY KEY,
  failed_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_failed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.login_attempts TO service_role;

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
-- No policies: clients (anon/authenticated) have no access. Only service-role server code touches this.

-- Cooldown duration for account lockout, in minutes
INSERT INTO public.firm_settings (key, value)
VALUES ('lockout_minutes', '15'::jsonb)
ON CONFLICT (key) DO NOTHING;