-- ============================================================
-- Document approve/return actions and workflow advancement
-- ============================================================

-- 1. Update approve_document() to also advance the workflow stage
CREATE OR REPLACE FUNCTION public.approve_document(
  _document_id uuid,
  _note        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _doc              public.documents%ROWTYPE;
  _approved_folder  uuid;
  _current_stage_id uuid;
  _next_stage_id    uuid;
  _current_seq      int;
BEGIN
  IF public.current_role() NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Only a Super Admin or Admin can approve documents.';
  END IF;

  SELECT * INTO _doc FROM public.documents WHERE id = _document_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found.';
  END IF;

  IF _doc.approval_status <> 'in_review' THEN
    RAISE EXCEPTION 'Only documents in review can be approved. Current status: %', _doc.approval_status;
  END IF;

  -- 1. Move to "04 Approved Documents" folder
  SELECT id INTO _approved_folder FROM public.document_folders
  WHERE case_id = _doc.case_id AND code = '04' LIMIT 1;

  UPDATE public.documents
  SET
    approval_status = 'approved',
    is_locked       = true,
    folder_id       = COALESCE(_approved_folder, folder_id),
    approved_at     = now(),
    approved_by     = auth.uid()
  WHERE id = _document_id;

  -- Update pending approval row
  UPDATE public.approvals
  SET status = 'approved', decided_at = now(), decided_by = auth.uid()
  WHERE document_id = _document_id AND status = 'pending';

  -- Advance the workflow stage
  SELECT current_stage_id INTO _current_stage_id FROM public.cases WHERE id = _doc.case_id;
  IF _current_stage_id IS NOT NULL THEN
    -- Mark current stage complete
    UPDATE public.case_stages SET status = 'complete', completed_at = now()
    WHERE id = _current_stage_id RETURNING sequence_order INTO _current_seq;

    -- Find next stage
    SELECT id INTO _next_stage_id FROM public.case_stages
    WHERE case_id = _doc.case_id AND sequence_order > COALESCE(_current_seq, 0)
    ORDER BY sequence_order ASC LIMIT 1;

    IF _next_stage_id IS NOT NULL THEN
      UPDATE public.case_stages SET status = 'active', started_at = now() WHERE id = _next_stage_id;
      UPDATE public.cases SET current_stage_id = _next_stage_id WHERE id = _doc.case_id;
    ELSE
      UPDATE public.cases SET current_stage_id = NULL WHERE id = _doc.case_id;
    END IF;
  END IF;

  -- Activity log
  INSERT INTO public.activity_log (case_id, actor_id, action, detail)
  VALUES (
    _doc.case_id, auth.uid(), 'document_approved',
    jsonb_build_object('document_id', _document_id, 'title', _doc.title, 'moved_to', '04 Approved Documents')
  );
  
  -- Audit log
  INSERT INTO public.audit_log (actor_id, action, target_table, target_id, detail)
  VALUES (auth.uid(), 'document_approved', 'documents', _document_id, jsonb_build_object('title', _doc.title));

  RETURN jsonb_build_object('ok', true, 'approval_status', 'approved');
END;
$$;

-- 2. New return_document() function
CREATE OR REPLACE FUNCTION public.return_document(
  _document_id uuid,
  _note        text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _doc       public.documents%ROWTYPE;
  _submitter uuid;
BEGIN
  IF public.current_role() NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Only a Super Admin or Admin can return documents.';
  END IF;

  IF _note IS NULL OR trim(_note) = '' THEN
    RAISE EXCEPTION 'A return reason (note) is required.';
  END IF;

  SELECT * INTO _doc FROM public.documents WHERE id = _document_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found.';
  END IF;

  IF _doc.approval_status <> 'in_review' THEN
    RAISE EXCEPTION 'Only documents in review can be returned. Current status: %', _doc.approval_status;
  END IF;

  -- Revert to draft
  UPDATE public.documents
  SET approval_status = 'draft', submitted_at = NULL, submitted_by = NULL
  WHERE id = _document_id;

  -- Update pending approval row to rejected
  UPDATE public.approvals
  SET status = 'rejected', decided_at = now(), decided_by = auth.uid()
  WHERE document_id = _document_id AND status = 'pending'
  RETURNING submitted_by INTO _submitter;

  -- Notify the submitter instantly
  IF _submitter IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      _submitter,
      'approval_returned',
      'Document Returned for Revision',
      'Your document (' || _doc.title || ') was returned. Reason: ' || _note,
      '/cases/' || _doc.case_id
    );
  END IF;

  -- Activity log
  INSERT INTO public.activity_log (case_id, actor_id, action, detail)
  VALUES (
    _doc.case_id, auth.uid(), 'document_returned',
    jsonb_build_object('document_id', _document_id, 'title', _doc.title, 'reason', _note)
  );

  -- Audit log
  INSERT INTO public.audit_log (actor_id, action, target_table, target_id, detail)
  VALUES (auth.uid(), 'document_returned', 'documents', _document_id, jsonb_build_object('title', _doc.title, 'reason', _note));

  RETURN jsonb_build_object('ok', true, 'approval_status', 'draft');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.return_document(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.return_document(uuid, text) TO authenticated;
