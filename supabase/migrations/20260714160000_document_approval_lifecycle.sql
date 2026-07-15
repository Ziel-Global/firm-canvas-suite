-- ============================================================
-- Document approval lifecycle
-- Integrates with existing public.approvals table and adds 
-- columns to documents table.
-- ============================================================

-- 1. New columns on documents
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (approval_status IN ('draft','in_review','approved')),
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_by UUID,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID;

-- 2. submit_document_for_approval()
-- Transitions draft → in_review; any team member with write access may submit.
CREATE OR REPLACE FUNCTION public.submit_document_for_approval(
  _document_id uuid,
  _note        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _doc         public.documents%ROWTYPE;
BEGIN
  SELECT * INTO _doc FROM public.documents WHERE id = _document_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found.';
  END IF;

  IF _doc.approval_status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft documents can be submitted. Current status: %', _doc.approval_status;
  END IF;

  IF _doc.is_locked THEN
    RAISE EXCEPTION 'Document is locked and cannot be submitted.';
  END IF;

  -- Transition to in_review
  UPDATE public.documents
  SET
    approval_status = 'in_review',
    submitted_at    = now(),
    submitted_by    = auth.uid()
  WHERE id = _document_id;

  -- Create the pending approval row
  INSERT INTO public.approvals (document_id, case_id, submitted_by, status)
  VALUES (_document_id, _doc.case_id, auth.uid(), 'pending');

  -- Activity log
  INSERT INTO public.activity_log (case_id, actor_id, action, detail)
  VALUES (
    _doc.case_id,
    auth.uid(),
    'document_submitted_for_approval',
    jsonb_build_object('document_id', _document_id, 'title', _doc.title)
  );

  -- Notify Super Admins
  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT id, 'approval_requested', 'Document Approval', 'A document (' || _doc.title || ') is pending approval.', '/cases/' || _doc.case_id
  FROM public.profiles
  WHERE role = 'super_admin';

  RETURN jsonb_build_object('ok', true, 'approval_status', 'in_review');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_document_for_approval(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_document_for_approval(uuid, text) TO authenticated;

-- 3. approve_document()
-- Atomically approves, locks, and moves to "04 Approved Documents".
-- Only super_admin or admin may call this.
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
BEGIN
  -- Caller must be super_admin or admin
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

  -- Resolve the "04 Approved Documents" folder for this case
  SELECT id INTO _approved_folder
  FROM public.document_folders
  WHERE case_id = _doc.case_id AND code = '04'
  LIMIT 1;

  -- Approve, lock, move to approved folder, version-stamp via current_version increment
  UPDATE public.documents
  SET
    approval_status = 'approved',
    is_locked       = true,
    folder_id       = COALESCE(_approved_folder, folder_id),
    approved_at     = now(),
    approved_by     = auth.uid()
  WHERE id = _document_id;

  -- Update the pending approval row
  UPDATE public.approvals
  SET status = 'approved',
      decided_at = now(),
      decided_by = auth.uid()
  WHERE document_id = _document_id AND status = 'pending';

  -- Activity log
  INSERT INTO public.activity_log (case_id, actor_id, action, detail)
  VALUES (
    _doc.case_id,
    auth.uid(),
    'document_approved',
    jsonb_build_object(
      'document_id', _document_id,
      'title',       _doc.title,
      'version',     _doc.current_version,
      'moved_to',    '04 Approved Documents'
    )
  );

  RETURN jsonb_build_object(
    'ok',              true,
    'approval_status', 'approved',
    'is_locked',       true,
    'folder_id',       _approved_folder
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_document(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_document(uuid, text) TO authenticated;
