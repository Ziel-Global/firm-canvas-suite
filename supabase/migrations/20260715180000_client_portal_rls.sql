-- Client Portal: link auth users to client records and scope data via RLS.

-- 1. Link a profiles/auth user to a clients row (portal identity).
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS clients_user_id_idx ON public.clients(user_id)
  WHERE user_id IS NOT NULL;

-- 2. Resolve the caller's client id (null if not a linked client).
CREATE OR REPLACE FUNCTION public.current_client_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id
  FROM public.clients c
  WHERE c.user_id = auth.uid()
  LIMIT 1
$$;

REVOKE EXECUTE ON FUNCTION public.current_client_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_client_id() TO authenticated;

-- 3. Clients may read their own non-private cases.
CREATE OR REPLACE FUNCTION public.can_read_case(_case_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = _case_id AND (
      public.current_role() = 'super_admin'
      OR (NOT c.is_private AND (
        public.effective_case_access(c.id) IN ('read_only','full')
        OR (public.current_role() = 'support'
            AND public.case_override_level(c.id) IS DISTINCT FROM 'none'
            AND EXISTS (SELECT 1 FROM public.tasks t
                        WHERE t.case_id = c.id AND t.assignee_id = auth.uid()))
        OR (public.current_role() = 'client'
            AND c.client_id IS NOT NULL
            AND c.client_id = public.current_client_id())
      ))
    )
  )
$$;

-- 4. Documents: clients only via explicit shares (not via case/folder access).
CREATE OR REPLACE FUNCTION public.can_read_document(_doc_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
        AND (
          d.folder_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.document_folders f
            WHERE f.id = d.folder_id
              AND public.can_access_folder(d.case_id, f.code)
              AND (
                public.current_role() = 'super_admin'
                OR public.case_override_level(d.case_id) IN ('read_only','full')
                OR public.role_can_read_folder(f.code)
              )
          )
        )
      )
    )
  )
$$;

-- 5. Clients may see their own client row (excluding write; notes still selected in
--    SQL but portal code never reads them — staff notes stay off the UI).
DROP POLICY IF EXISTS "clients_select" ON public.clients;
CREATE POLICY "clients_select" ON public.clients FOR SELECT TO authenticated
USING (
  public.is_active_user() AND (
    public.current_role() IN ('super_admin','admin')
    OR (
      public.current_role() IN ('senior_lawyer','junior_lawyer')
      AND EXISTS (
        SELECT 1 FROM public.cases c
        JOIN public.case_assignments ca ON ca.case_id = c.id
        WHERE c.client_id = clients.id AND ca.user_id = auth.uid()
      )
    )
    OR (
      public.current_role() = 'client'
      AND user_id = auth.uid()
    )
  )
);

-- 6. Internal notes: never visible to clients even when they can read the case.
DROP POLICY IF EXISTS "Read case notes" ON public.case_notes;
CREATE POLICY "Read case notes" ON public.case_notes
  FOR SELECT TO authenticated
  USING (
    public.current_role() <> 'client'
    AND public.can_read_case(case_id)
    AND (NOT is_principal_only OR public.current_role() = 'super_admin')
  );

-- 7. Stage rows include internal notes — clients use cases.status/health only.
DROP POLICY IF EXISTS "case_stages_select" ON public.case_stages;
CREATE POLICY "case_stages_select" ON public.case_stages FOR SELECT TO authenticated
USING (
  public.is_active_user() AND public.current_role() <> 'client' AND (
    public.current_role() = 'super_admin'
    OR (NOT is_private AND (
      CASE WHEN public.current_role() = 'junior_lawyer'
        THEN (public.is_assigned_to_case(case_id) AND assignee_id = auth.uid())
        ELSE public.can_read_case(case_id)
      END
    ))
  )
);

-- 8. Storage: staff keep case-based read; clients need a shared document path.
DROP POLICY IF EXISTS "case_docs_select" ON storage.objects;
CREATE POLICY "case_docs_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'case-documents'
  AND public.is_active_user()
  AND (
    (
      public.current_role() <> 'client'
      AND public.can_read_case(((storage.foldername(name))[1])::uuid)
    )
    OR EXISTS (
      SELECT 1
      FROM public.documents d
      WHERE (d.file_path = name OR EXISTS (
        SELECT 1 FROM public.document_versions dv
        WHERE dv.document_id = d.id AND dv.file_path = name
      ))
      AND public.can_read_document(d.id)
      AND (
        public.current_role() <> 'client'
        OR EXISTS (
          SELECT 1 FROM public.document_shares ds
          WHERE ds.document_id = d.id
            AND ds.shared_with = auth.uid()
            AND ds.can_download = true
        )
      )
    )
  )
);
