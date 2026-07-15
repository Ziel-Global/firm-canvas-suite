-- Project ref used by pg_cron to call the process-reminders edge function.
INSERT INTO public.firm_settings (key, value)
VALUES ('supabase_project_ref', '"ttuyrnpuixhrlgrfafki"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Seed default reminders when a calendar event is created without any rows.
CREATE OR REPLACE FUNCTION public.seed_event_reminders_for_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.event_reminders er WHERE er.event_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.event_reminders (event_id, offset_minutes, channel, sent)
  SELECT
    NEW.id,
    o.offset_min,
    ch.channel,
    false
  FROM public.event_reminder_defaults d
  CROSS JOIN LATERAL unnest(d.offsets) AS o(offset_min)
  CROSS JOIN LATERAL unnest(d.channels) AS ch(channel)
  WHERE d.event_type = COALESCE(NULLIF(btrim(NEW.event_type), ''), 'meeting')
    AND o.offset_min > 0;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_event_reminders ON public.calendar_events;
CREATE TRIGGER trg_seed_event_reminders
  AFTER INSERT ON public.calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_event_reminders_for_event();

-- Backfill reminders for existing future events that have none.
INSERT INTO public.event_reminders (event_id, offset_minutes, channel, sent)
SELECT
  ce.id,
  o.offset_min,
  ch.channel,
  false
FROM public.calendar_events ce
JOIN public.event_reminder_defaults d
  ON d.event_type = COALESCE(NULLIF(btrim(ce.event_type), ''), 'meeting')
CROSS JOIN LATERAL unnest(d.offsets) AS o(offset_min)
CROSS JOIN LATERAL unnest(d.channels) AS ch(channel)
WHERE ce.starts_at IS NOT NULL
  AND ce.starts_at > now()
  AND o.offset_min > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.event_reminders er WHERE er.event_id = ce.id
  );

CREATE INDEX IF NOT EXISTS event_reminders_unsent_idx
  ON public.event_reminders (event_id)
  WHERE sent = false;

-- Invoke the process-reminders edge function via pg_net + pg_cron.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.trigger_process_reminders()
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
    RAISE NOTICE 'process-reminders cron skipped: firm_settings.supabase_project_ref is not set';
    RETURN;
  END IF;

  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF service_key IS NULL OR btrim(service_key) = '' THEN
    RAISE NOTICE 'process-reminders cron skipped: vault secret service_role_key is not set';
    RETURN;
  END IF;

  function_url :=
    'https://' || btrim(project_ref) || '.supabase.co/functions/v1/process-reminders';

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
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'process-event-reminders'
  ) THEN
    PERFORM cron.schedule(
      'process-event-reminders',
      '*/5 * * * *',
      $cron$SELECT public.trigger_process_reminders();$cron$
    );
  END IF;
EXCEPTION
  WHEN undefined_function OR undefined_object OR insufficient_privilege THEN
    RAISE NOTICE 'pg_cron schedule for process-reminders skipped (extensions unavailable).';
END $$;
