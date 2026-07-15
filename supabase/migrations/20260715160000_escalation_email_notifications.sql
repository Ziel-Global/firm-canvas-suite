-- Point the hourly escalation cron at the edge function so Super Admins
-- receive both in-app notifications and email (via send-email).

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.trigger_escalate_overdue_stages()
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
    -- Fallback: keep the in-app-only SQL path if project ref is missing.
    PERFORM public.escalate_overdue_stages();
    RETURN;
  END IF;

  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF service_key IS NULL OR btrim(service_key) = '' THEN
    PERFORM public.escalate_overdue_stages();
    RETURN;
  END IF;

  function_url :=
    'https://' || btrim(project_ref) || '.supabase.co/functions/v1/escalate-overdue-stages';

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
  -- Replace the old SQL-only cron schedule with the edge-function invoker.
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'escalate-overdue-stages-hourly';

  PERFORM cron.schedule(
    'escalate-overdue-stages-hourly',
    '0 * * * *',
    $cron$SELECT public.trigger_escalate_overdue_stages();$cron$
  );
EXCEPTION
  WHEN undefined_function OR undefined_object OR insufficient_privilege THEN
    RAISE NOTICE 'pg_cron reschedule for escalate-overdue-stages skipped.';
END $$;
