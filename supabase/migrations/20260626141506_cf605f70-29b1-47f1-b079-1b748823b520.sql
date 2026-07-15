-- Folder scope helpers
CREATE OR REPLACE FUNCTION public.folder_scope_for_case(_case_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT folder_scope FROM public.case_access_overrides
  WHERE case_id = _case_id AND user_id = auth.uid()
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.folder_scope_for_case(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.folder_scope_for_case(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_access_folder(_case_id uuid, _folder_code text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.can_read_case(_case_id) AND (
    public.current_role() = 'super_admin'
    OR public.folder_scope_for_case(_case_id) IS NULL
    OR btrim(public.folder_scope_for_case(_case_id)) = ''
    OR _folder_code = ANY (
         ARRAY(SELECT btrim(s) FROM unnest(string_to_array(public.folder_scope_for_case(_case_id), ',')) s)
       )
  )
$$;
REVOKE EXECUTE ON FUNCTION public.can_access_folder(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_folder(uuid, text) TO authenticated;

-- ============ CASE_ACCESS_OVERRIDES ============
DROP POLICY IF EXISTS "Staff can view overrides" ON public.case_access_overrides;
DROP POLICY IF EXISTS "Staff can insert overrides" ON public.case_access_overrides;
DROP POLICY IF EXISTS "Staff can update overrides" ON public.case_access_overrides;
DROP POLICY IF EXISTS "Staff can delete overrides" ON public.case_access_overrides;
DROP POLICY IF EXISTS "overrides_select" ON public.case_access_overrides;
DROP POLICY IF EXISTS "overrides_insert" ON public.case_access_overrides;
DROP POLICY IF EXISTS "overrides_update" ON public.case_access_overrides;
DROP POLICY IF EXISTS "overrides_delete" ON public.case_access_overrides;

CREATE POLICY "overrides_select" ON public.case_access_overrides FOR SELECT TO authenticated
USING (public.is_active_user() AND (public.current_role() = 'super_admin' OR user_id = auth.uid()));

CREATE POLICY "overrides_insert" ON public.case_access_overrides FOR INSERT TO authenticated
WITH CHECK (public.is_active_user() AND public.current_role() = 'super_admin');

CREATE POLICY "overrides_update" ON public.case_access_overrides FOR UPDATE TO authenticated
USING (public.is_active_user() AND public.current_role() = 'super_admin')
WITH CHECK (public.is_active_user() AND public.current_role() = 'super_admin');

CREATE POLICY "overrides_delete" ON public.case_access_overrides FOR DELETE TO authenticated
USING (public.is_active_user() AND public.current_role() = 'super_admin');

-- ============ DOCUMENT_FOLDERS (folder-scoped) ============
DROP POLICY IF EXISTS "Staff can view folders" ON public.document_folders;
DROP POLICY IF EXISTS "Staff can insert folders" ON public.document_folders;
DROP POLICY IF EXISTS "Staff can update folders" ON public.document_folders;
DROP POLICY IF EXISTS "Staff can delete folders" ON public.document_folders;
DROP POLICY IF EXISTS "folders_select" ON public.document_folders;
DROP POLICY IF EXISTS "folders_write_insert" ON public.document_folders;
DROP POLICY IF EXISTS "folders_write_update" ON public.document_folders;
DROP POLICY IF EXISTS "folders_write_delete" ON public.document_folders;

CREATE POLICY "folders_select" ON public.document_folders FOR SELECT TO authenticated
USING (public.is_active_user() AND public.can_access_folder(case_id, code));

CREATE POLICY "folders_write_insert" ON public.document_folders FOR INSERT TO authenticated
WITH CHECK (public.is_active_user() AND (public.current_role() IN ('super_admin','admin') OR public.effective_case_access(case_id) = 'full'));

CREATE POLICY "folders_write_update" ON public.document_folders FOR UPDATE TO authenticated
USING (public.is_active_user() AND (public.current_role() IN ('super_admin','admin') OR public.effective_case_access(case_id) = 'full'))
WITH CHECK (public.is_active_user() AND (public.current_role() IN ('super_admin','admin') OR public.effective_case_access(case_id) = 'full'));

CREATE POLICY "folders_write_delete" ON public.document_folders FOR DELETE TO authenticated
USING (public.is_active_user() AND public.current_role() IN ('super_admin','admin'));

-- ============ DOCUMENTS (folder-scoped) ============
DROP POLICY IF EXISTS "Staff can view documents" ON public.documents;
DROP POLICY IF EXISTS "Staff can insert documents" ON public.documents;
DROP POLICY IF EXISTS "Staff can update documents" ON public.documents;
DROP POLICY IF EXISTS "Staff can delete documents" ON public.documents;
DROP POLICY IF EXISTS "documents_select" ON public.documents;
DROP POLICY IF EXISTS "documents_insert" ON public.documents;
DROP POLICY IF EXISTS "documents_update" ON public.documents;
DROP POLICY IF EXISTS "documents_delete" ON public.documents;

CREATE POLICY "documents_select" ON public.documents FOR SELECT TO authenticated
USING (
  public.is_active_user() AND public.can_read_case(case_id) AND (
    folder_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.document_folders f
      WHERE f.id = documents.folder_id
        AND public.can_access_folder(documents.case_id, f.code)
    )
  )
);

CREATE POLICY "documents_insert" ON public.documents FOR INSERT TO authenticated
WITH CHECK (public.is_active_user() AND (public.current_role() IN ('super_admin','admin') OR public.effective_case_access(case_id) = 'full'));

CREATE POLICY "documents_update" ON public.documents FOR UPDATE TO authenticated
USING (public.is_active_user() AND (public.current_role() IN ('super_admin','admin') OR public.effective_case_access(case_id) = 'full'))
WITH CHECK (public.is_active_user() AND (public.current_role() IN ('super_admin','admin') OR public.effective_case_access(case_id) = 'full'));

CREATE POLICY "documents_delete" ON public.documents FOR DELETE TO authenticated
USING (public.is_active_user() AND (public.current_role() IN ('super_admin','admin') OR public.effective_case_access(case_id) = 'full'));