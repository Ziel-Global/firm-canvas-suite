-- Document visibility grants must actually work across folders.
-- Allowlist (explicit who-can-see) bypasses role_can_read_folder so admins
-- can open a doc in e.g. 04 Approved to juniors/support. Folder browse also
-- surfaces folders that contain an allowlisted doc the caller may read.

CREATE OR REPLACE FUNCTION public.folder_has_allowlisted_document(_folder_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.documents d
    WHERE d.folder_id = _folder_id
      AND d.visibility_mode = 'allowlist'
      AND public.can_read_case(d.case_id)
      AND public.document_visibility_allows(d.id)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.folder_has_allowlisted_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.folder_has_allowlisted_document(uuid) TO authenticated;

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
                -- Explicit allowlist grants win over the folder role matrix.
                OR d.visibility_mode = 'allowlist'
              )
          )
        )
      )
    )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.can_read_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_document(uuid) TO authenticated;

DROP POLICY IF EXISTS "folders_select" ON public.document_folders;
CREATE POLICY "folders_select" ON public.document_folders FOR SELECT TO authenticated
USING (
  public.is_active_user()
  AND public.can_access_folder(case_id, code)
  AND (
    public.current_role() = 'super_admin'
    OR public.case_override_level(case_id) IN ('read_only', 'full')
    OR public.role_can_read_folder(code)
    OR public.folder_has_allowlisted_document(id)
  )
);
