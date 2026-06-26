-- 1. Auto-create standard document folders on new case
CREATE OR REPLACE FUNCTION public.create_standard_case_folders()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.document_folders (case_id, code, name) VALUES
    (NEW.id, '01', '01 Client Documents'),
    (NEW.id, '02', '02 Correspondence'),
    (NEW.id, '03', '03 Internal Drafts'),
    (NEW.id, '04', '04 Approved Documents'),
    (NEW.id, '05', '05 Court Filings'),
    (NEW.id, '06', '06 Research and Notes'),
    (NEW.id, '07', '07 Billing');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_case_folders
AFTER INSERT ON public.cases
FOR EACH ROW EXECUTE FUNCTION public.create_standard_case_folders();

-- 2. Activity logging for cases
CREATE OR REPLACE FUNCTION public.log_case_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.activity_log (case_id, actor_id, action, detail)
    VALUES (NEW.id, auth.uid(), 'case_created',
      jsonb_build_object('case_ref', NEW.case_ref, 'title', NEW.title, 'status', NEW.status));
  ELSIF (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status) THEN
    INSERT INTO public.activity_log (case_id, actor_id, action, detail)
    VALUES (NEW.id, auth.uid(), 'case_status_changed',
      jsonb_build_object('from', OLD.status, 'to', NEW.status, 'title', NEW.title));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_case_activity
AFTER INSERT OR UPDATE ON public.cases
FOR EACH ROW EXECUTE FUNCTION public.log_case_activity();

-- 3. Activity logging for tasks
CREATE OR REPLACE FUNCTION public.log_task_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.activity_log (case_id, actor_id, action, detail)
    VALUES (NEW.case_id, auth.uid(), 'task_created',
      jsonb_build_object('task_id', NEW.id, 'title', NEW.title, 'status', NEW.status));
  ELSIF (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status) THEN
    INSERT INTO public.activity_log (case_id, actor_id, action, detail)
    VALUES (NEW.case_id, auth.uid(), 'task_status_changed',
      jsonb_build_object('task_id', NEW.id, 'title', NEW.title, 'from', OLD.status, 'to', NEW.status));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_task_activity
AFTER INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.log_task_activity();

-- 4. Activity logging for documents
CREATE OR REPLACE FUNCTION public.log_document_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.activity_log (case_id, actor_id, action, detail)
    VALUES (NEW.case_id, auth.uid(), 'document_created',
      jsonb_build_object('document_id', NEW.id, 'title', NEW.title, 'is_locked', NEW.is_locked));
  ELSIF (TG_OP = 'UPDATE' AND NEW.is_locked IS DISTINCT FROM OLD.is_locked) THEN
    INSERT INTO public.activity_log (case_id, actor_id, action, detail)
    VALUES (NEW.case_id, auth.uid(), 'document_lock_changed',
      jsonb_build_object('document_id', NEW.id, 'title', NEW.title, 'from', OLD.is_locked, 'to', NEW.is_locked));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_document_activity
AFTER INSERT OR UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.log_document_activity();

-- 5. Activity logging for case_stages
CREATE OR REPLACE FUNCTION public.log_case_stage_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.activity_log (case_id, actor_id, action, detail)
    VALUES (NEW.case_id, auth.uid(), 'stage_created',
      jsonb_build_object('stage_id', NEW.id, 'name', NEW.name, 'status', NEW.status));
  ELSIF (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status) THEN
    INSERT INTO public.activity_log (case_id, actor_id, action, detail)
    VALUES (NEW.case_id, auth.uid(), 'stage_status_changed',
      jsonb_build_object('stage_id', NEW.id, 'name', NEW.name, 'from', OLD.status, 'to', NEW.status));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_case_stage_activity
AFTER INSERT OR UPDATE ON public.case_stages
FOR EACH ROW EXECUTE FUNCTION public.log_case_stage_activity();

-- 6. Make audit_log immutable
CREATE OR REPLACE FUNCTION public.prevent_audit_log_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not permitted', TG_OP;
END;
$$;

CREATE TRIGGER trg_prevent_audit_log_update
BEFORE UPDATE OR DELETE ON public.audit_log
FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_changes();