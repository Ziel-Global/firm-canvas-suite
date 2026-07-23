-- Per-document visibility: open / allowlist / admin_only, with allow|deny by user or role.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS visibility_mode text NOT NULL DEFAULT 'open';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_visibility_mode_check'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_visibility_mode_check
      CHECK (visibility_mode IN ('open', 'allowlist', 'admin_only'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.document_visibility_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  effect text NOT NULL CHECK (effect IN ('allow', 'deny')),
  subject_type text NOT NULL CHECK (subject_type IN ('user', 'role')),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.user_role,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT document_visibility_rules_subject_chk CHECK (
    (subject_type = 'user' AND user_id IS NOT NULL AND role IS NULL)
    OR (subject_type = 'role' AND role IS NOT NULL AND user_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS document_visibility_rules_user_uidx
  ON public.document_visibility_rules (document_id, effect, subject_type, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS document_visibility_rules_role_uidx
  ON public.document_visibility_rules (document_id, effect, subject_type, role)
  WHERE role IS NOT NULL;

CREATE INDEX IF NOT EXISTS document_visibility_rules_document_id_idx
  ON public.document_visibility_rules (document_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_visibility_rules TO authenticated;
GRANT ALL ON public.document_visibility_rules TO service_role;

ALTER TABLE public.document_visibility_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visibility_rules_select" ON public.document_visibility_rules;
CREATE POLICY "visibility_rules_select" ON public.document_visibility_rules
FOR SELECT TO authenticated
USING (
  public.is_active_user()
  AND public.current_role() IN ('super_admin', 'admin')
);

DROP POLICY IF EXISTS "visibility_rules_write" ON public.document_visibility_rules;
CREATE POLICY "visibility_rules_write" ON public.document_visibility_rules
FOR ALL TO authenticated
USING (
  public.is_active_user()
  AND public.current_role() IN ('super_admin', 'admin')
)
WITH CHECK (
  public.is_active_user()
  AND public.current_role() IN ('super_admin', 'admin')
);

-- Does the caller's identity pass this document's visibility ACL?
CREATE OR REPLACE FUNCTION public.document_visibility_allows(_doc_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _mode text;
  _uploader uuid;
  _my_role public.user_role;
  _allowed boolean;
  _denied boolean;
BEGIN
  SELECT d.visibility_mode, d.uploaded_by
  INTO _mode, _uploader
  FROM public.documents d
  WHERE d.id = _doc_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  _my_role := public.current_role();

  IF _my_role IN ('super_admin', 'admin') THEN
    RETURN true;
  END IF;

  IF _mode = 'admin_only' THEN
    RETURN false;
  END IF;

  -- Uploader keeps visibility unless admin_only (handled above).
  IF _uploader IS NOT NULL AND _uploader = auth.uid() THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.document_visibility_rules r
    WHERE r.document_id = _doc_id
      AND r.effect = 'deny'
      AND (
        (r.subject_type = 'user' AND r.user_id = auth.uid())
        OR (r.subject_type = 'role' AND r.role = _my_role)
      )
  ) INTO _denied;

  IF _mode = 'allowlist' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.document_visibility_rules r
      WHERE r.document_id = _doc_id
        AND r.effect = 'allow'
        AND (
          (r.subject_type = 'user' AND r.user_id = auth.uid())
          OR (r.subject_type = 'role' AND r.role = _my_role)
        )
    ) INTO _allowed;
    RETURN _allowed AND NOT COALESCE(_denied, false);
  END IF;

  -- open: visible unless explicitly denied
  RETURN NOT COALESCE(_denied, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.document_visibility_allows(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.document_visibility_allows(uuid) TO authenticated;

-- Staff path now also requires visibility ACL. Client shares stay additive.
CREATE OR REPLACE FUNCTION public.can_read_document(_doc_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = _doc_id AND (
      EXISTS (
        SELECT 1 FROM public.document_shares ds
        WHERE ds.document_id = d.id AND ds.shared_with = auth.uid()
      )
      OR (
        public.current_role() <> 'client'
        AND public.can_read_case(d.case_id)
        AND public.document_visibility_allows(d.id)
        AND (
          d.folder_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.document_folders f
            WHERE f.id = d.folder_id
              AND public.can_access_folder(d.case_id, f.code)
              AND (
                public.current_role() = 'super_admin'
                OR public.case_override_level(d.case_id) IN ('read_only', 'full')
                OR public.role_can_read_folder(f.code)
              )
          )
        )
      )
    )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.can_read_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_document(uuid) TO authenticated;
