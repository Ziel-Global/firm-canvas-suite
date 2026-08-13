-- ============================================================
-- Invoice reminder seeding + daily cron (mirrors event_reminder_scheduler.sql)
-- ============================================================

INSERT INTO public.firm_settings (key, value)
VALUES ('supabase_project_ref', '"ttuyrnpuixhrlgrfafki"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Seed reminder rows the moment an invoice is sent, using
-- firm_settings.invoice_reminder_offsets_days (days after due_date), falling
-- back to a sensible default if the setting is unset.
CREATE OR REPLACE FUNCTION public.seed_invoice_reminders_for_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offsets integer[];
BEGIN
  IF NEW.status <> 'sent' OR OLD.status IS NOT DISTINCT FROM 'sent' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.invoice_reminders r WHERE r.invoice_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT ARRAY(
    SELECT jsonb_array_elements_text(value)::integer
    FROM public.firm_settings WHERE key = 'invoice_reminder_offsets_days'
  ) INTO v_offsets;
  IF v_offsets IS NULL OR array_length(v_offsets, 1) IS NULL THEN
    v_offsets := ARRAY[3, 7, 14, 30];
  END IF;

  INSERT INTO public.invoice_reminders (invoice_id, offset_days, channel, sent)
  SELECT NEW.id, o, 'email', false
  FROM unnest(v_offsets) AS o
  WHERE o > 0;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_invoice_reminders ON public.invoices;
CREATE TRIGGER trg_seed_invoice_reminders
  AFTER UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_invoice_reminders_for_invoice();

-- Invoke the process-invoice-reminders edge function via pg_net + pg_cron.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.trigger_process_invoice_reminders()
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
    RAISE NOTICE 'process-invoice-reminders cron skipped: firm_settings.supabase_project_ref is not set';
    RETURN;
  END IF;

  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF service_key IS NULL OR btrim(service_key) = '' THEN
    RAISE NOTICE 'process-invoice-reminders cron skipped: vault secret service_role_key is not set';
    RETURN;
  END IF;

  function_url :=
    'https://' || btrim(project_ref) || '.supabase.co/functions/v1/process-invoice-reminders';

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
    SELECT 1 FROM cron.job WHERE jobname = 'process-invoice-reminders'
  ) THEN
    PERFORM cron.schedule(
      'process-invoice-reminders',
      '0 8 * * *',
      $cron$SELECT public.trigger_process_invoice_reminders();$cron$
    );
  END IF;
EXCEPTION
  WHEN undefined_function OR undefined_object OR insufficient_privilege THEN
    RAISE NOTICE 'pg_cron schedule for process-invoice-reminders skipped (extensions unavailable).';
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'mark-overdue-invoices'
  ) THEN
    PERFORM cron.schedule(
      'mark-overdue-invoices',
      '5 8 * * *',
      $cron$SELECT public.mark_overdue_invoices();$cron$
    );
  END IF;
EXCEPTION
  WHEN undefined_function OR undefined_object OR insufficient_privilege THEN
    RAISE NOTICE 'pg_cron schedule for mark-overdue-invoices skipped (extensions unavailable).';
END $$;
