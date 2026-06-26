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
  v_existing uuid;
  v_action text;
BEGIN
  IF NEW.deadline IS NULL THEN
    DELETE FROM public.calendar_events WHERE source_stage_id = NEW.id;
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.name, '') ~* '(hearing|court|trial|tribunal)' THEN
    v_type := 'hearing';
  ELSE
    v_type := 'deadline';
  END IF;

  v_title := COALESCE(NULLIF(btrim(NEW.name), ''),
                      CASE WHEN v_type = 'hearing' THEN 'Court hearing' ELSE 'Deadline' END);

  SELECT user_id INTO v_lead
  FROM public.case_assignments
  WHERE case_id = NEW.case_id AND is_lead = true
  ORDER BY assigned_at
  LIMIT 1;

  v_starts := (NEW.deadline + time '09:00')::timestamptz;
  v_ends := v_starts + interval '1 hour';

  SELECT id INTO v_existing FROM public.calendar_events WHERE source_stage_id = NEW.id LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE public.calendar_events SET
      title = v_title,
      description = NEW.notes,
      case_id = NEW.case_id,
      event_type = v_type,
      starts_at = v_starts,
      ends_at = v_ends,
      owner_id = v_lead
    WHERE id = v_existing;
    v_action := 'calendar_event_auto_updated';
  ELSE
    INSERT INTO public.calendar_events
      (title, description, case_id, event_type, starts_at, ends_at, is_private, owner_id, source_stage_id)
    VALUES
      (v_title, NEW.notes, NEW.case_id, v_type, v_starts, v_ends, false, v_lead, NEW.id);
    v_action := 'calendar_event_auto_created';
  END IF;

  INSERT INTO public.activity_log (case_id, actor_id, action, detail)
  VALUES (NEW.case_id, auth.uid(), v_action,
    jsonb_build_object('stage_id', NEW.id, 'title', v_title, 'event_type', v_type, 'date', NEW.deadline));

  RETURN NEW;
END;
$function$;