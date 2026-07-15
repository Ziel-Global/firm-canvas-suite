-- Morning digest: schedule edge function around firm_settings.morning_digest_time.
-- Cron runs every minute; the function only emails when HH:MM matches and not yet sent today.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

INSERT INTO public.firm_settings (key, value)
VALUES
  ('morning_digest_time', '"07:30"'::jsonb),
  ('morning_digest_last_sent', '""'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.trigger_send_morning_digest()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  project_ref text;
  service_key text;
  function_url text;
BEGIN
  SELECT value #>> '{}' INTO project_ref
  FROM public.firm_settings
  WHERE key = 'supabase_project_ref';

  IF project_ref IS NULL OR btrim(project_ref) = '' THEN
    RAISE NOTICE 'morning digest cron skipped: supabase_project_ref not set';
    RETURN;
  END IF;

  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF service_key IS NULL OR btrim(service_key) = '' THEN
    RAISE NOTICE 'morning digest cron skipped: service_role_key vault secret missing';
    RETURN;
  END IF;

  function_url :=
    'https://' || btrim(project_ref) || '.supabase.co/functions/v1/send-morning-digest';

  PERFORM net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key,
      'apikey', service_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'send-morning-digest'
  ) THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'send-morning-digest';
  END IF;

  PERFORM cron.schedule(
    'send-morning-digest',
    '* * * * *',
    $cron$SELECT public.trigger_send_morning_digest();$cron$
  );
EXCEPTION
  WHEN undefined_function OR undefined_object OR insufficient_privilege THEN
    RAISE NOTICE 'pg_cron schedule for send-morning-digest skipped.';
END $$;
