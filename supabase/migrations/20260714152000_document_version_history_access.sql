CREATE OR REPLACE FUNCTION public.can_read_document_version(_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.document_versions dv
    JOIN public.documents d ON d.id = dv.document_id
    WHERE dv.id = _version_id
      AND public.can_read_document(d.id)
      AND (
        public.current_role() = 'super_admin'
        OR public.case_override_level(d.case_id) = 'full'
        OR dv.version_number = d.current_version
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.can_read_document_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_document_version(uuid) TO authenticated;

DROP POLICY IF EXISTS "Staff can view versions" ON public.document_versions;
DROP POLICY IF EXISTS "versions_select" ON public.document_versions;
DROP POLICY IF EXISTS "versions_insert" ON public.document_versions;
DROP POLICY IF EXISTS "versions_delete" ON public.document_versions;

CREATE POLICY "versions_select" ON public.document_versions FOR SELECT TO authenticated
USING (public.is_active_user() AND public.can_read_document_version(id));

CREATE POLICY "versions_insert" ON public.document_versions FOR INSERT TO authenticated
WITH CHECK (public.is_active_user() AND EXISTS (
  SELECT 1 FROM public.documents d
  WHERE d.id = document_id AND public.effective_case_access(d.case_id) = 'full'
));

CREATE POLICY "versions_delete" ON public.document_versions FOR DELETE TO authenticated
USING (public.is_active_user() AND public.current_role() IN ('super_admin','admin'));
