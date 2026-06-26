-- Link auto-generated calendar events back to their source case stage
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS source_stage_id uuid REFERENCES public.case_stages(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_source_stage_id_key
  ON public.calendar_events (source_stage_id)
  WHERE source_stage_id IS NOT NULL;

-- Sync function: a court date / deadline on a case stage maintains a linked calendar event
CREATE OR REPLACE FUNCTION public.sync_stage_calendar_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_type text;
  v_title text;
  v_lead uuid;
  v_starts timestamptz;
  v_ends timestamptz;
  v_action text;
BEGIN
  -- No deadline => ensure no linked event remains
  IF NEW.deadline IS NULL THEN
    DELETE FROM public.calendar_events WHERE source_stage_id = NEW.id;
    RETURN NEW;
  END IF;

  -- Court date vs generic deadline
  IF COALESCE(NEW.name, '') ~* '(hearing|court|trial|tribunal)' THEN
    v_type := 'hearing';
  ELSE
    v_type := 'deadline';
  END IF;

  v_title := COALESCE(NULLIF(btrim(NEW.name), ''),
                      CASE WHEN v_type = 'hearing' THEN 'Court hearing' ELSE 'Deadline' END);

  -- Owner = case lead (so it surfaces on the principal's calendar when they lead the case)
  SELECT user_id INTO v_lead
  FROM public.case_assignments
  WHERE case_id = NEW.case_id AND is_lead = true
  ORDER BY assigned_at
  LIMIT 1;

  v_starts := (NEW.deadline + time '09:00')::timestamptz;
  v_ends := v_starts + interval '1 hour';

  INSERT INTO public.calendar_events
    (title, description, case_id, event_type, starts_at, ends_at, is_private, owner_id, source_stage_id)
  VALUES
    (v_title, NEW.notes, NEW.case_id, v_type, v_starts, v_ends, false, v_lead, NEW.id)
  ON CONFLICT (source_stage_id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    case_id = EXCLUDED.case_id,
    event_type = EXCLUDED.event_type,
    starts_at = EXCLUDED.starts_at,
    ends_at = EXCLUDED.ends_at,
    owner_id = EXCLUDED.owner_id;

  v_action := CASE WHEN TG_OP = 'INSERT' THEN 'calendar_event_auto_created' ELSE 'calendar_event_auto_updated' END;

  INSERT INTO public.activity_log (case_id, actor_id, action, detail)
  VALUES (NEW.case_id, auth.uid(), v_action,
    jsonb_build_object('stage_id', NEW.id, 'title', v_title, 'event_type', v_type, 'date', NEW.deadline));

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_stage_calendar_event ON public.case_stages;
CREATE TRIGGER trg_sync_stage_calendar_event
AFTER INSERT OR UPDATE OF deadline, name, notes, case_id ON public.case_stages
FOR EACH ROW
EXECUTE FUNCTION public.sync_stage_calendar_event();