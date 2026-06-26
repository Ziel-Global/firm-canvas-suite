-- reports summary flag
ALTER TABLE public.reports_cache ADD COLUMN IF NOT EXISTS is_summary boolean NOT NULL DEFAULT true;

-- ============ DOCUMENT_SHARES ============
CREATE TABLE IF NOT EXISTS public.document_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  shared_with uuid NOT NULL,
  shared_by uuid,
  can_download boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, shared_with)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_shares TO authenticated;
GRANT ALL ON public.document_shares TO service_role;
ALTER TABLE public.document_shares ENABLE ROW LEVEL SECURITY;

-- Folder role matrix helpers
CREATE OR REPLACE FUNCTION public.role_can_read_folder(_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE public.current_role()
    WHEN 'super_admin' THEN true
    WHEN 'admin' THEN _code <> '07'
    WHEN 'senior_lawyer' THEN _code <> '07'
    WHEN 'junior_lawyer' THEN _code IN ('03','06')
    WHEN 'support' THEN _code <> '07'
    ELSE false
  END
$$;
REVOKE EXECUTE ON FUNCTION public.role_can_read_folder(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.role_can_read_folder(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.role_can_write_folder(_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE public.current_role()
    WHEN 'super_admin' THEN true
    WHEN 'admin' THEN _code <> '07'
    WHEN 'senior_lawyer' THEN _code IN ('02','03')
    WHEN 'junior_lawyer' THEN _code IN ('03')
    ELSE false
  END
$$;
REVOKE EXECUTE ON FUNCTION public.role_can_write_folder(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.role_can_write_folder(text) TO authenticated;

-- Document read helper (used by documents + versions + shares)
CREATE OR REPLACE FUNCTION public.can_read_document(_doc_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = _doc_id AND (
      EXISTS (SELECT 1 FROM public.document_shares ds
              WHERE ds.document_id = d.id AND ds.shared_with = auth.uid())
      OR (
        public.can_read_case(d.case_id) AND (
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
REVOKE EXECUTE ON FUNCTION public.can_read_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_document(uuid) TO authenticated;

-- Drop existing policies on affected tables
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies
           WHERE schemaname='public' AND tablename IN
           ('document_folders','documents','document_versions','tasks','calendar_events','reports_cache')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ============ DOCUMENT_FOLDERS ============
CREATE POLICY "folders_select" ON public.document_folders FOR SELECT TO authenticated
USING (public.is_active_user() AND public.can_access_folder(case_id, code) AND (
  public.current_role() = 'super_admin'
  OR public.case_override_level(case_id) IN ('read_only','full')
  OR public.role_can_read_folder(code)
));
CREATE POLICY "folders_insert" ON public.document_folders FOR INSERT TO authenticated
WITH CHECK (public.is_active_user() AND public.effective_case_access(case_id) = 'full' AND (
  public.current_role() = 'super_admin'
  OR public.case_override_level(case_id) = 'full'
  OR public.role_can_write_folder(code)
));
CREATE POLICY "folders_update" ON public.document_folders FOR UPDATE TO authenticated
USING (public.is_active_user() AND public.current_role() IN ('super_admin','admin'))
WITH CHECK (public.is_active_user() AND public.current_role() IN ('super_admin','admin'));
CREATE POLICY "folders_delete" ON public.document_folders FOR DELETE TO authenticated
USING (public.is_active_user() AND public.current_role() IN ('super_admin','admin'));

-- ============ DOCUMENTS ============
CREATE POLICY "documents_select" ON public.documents FOR SELECT TO authenticated
USING (public.is_active_user() AND public.can_read_document(id));

CREATE POLICY "documents_insert" ON public.documents FOR INSERT TO authenticated
WITH CHECK (public.is_active_user() AND public.effective_case_access(case_id) = 'full' AND (
  folder_id IS NULL OR EXISTS (
    SELECT 1 FROM public.document_folders f
    WHERE f.id = folder_id AND public.can_access_folder(case_id, f.code) AND (
      public.current_role() = 'super_admin'
      OR public.case_override_level(case_id) = 'full'
      OR public.role_can_write_folder(f.code)
    )
  )
));

CREATE POLICY "documents_update" ON public.documents FOR UPDATE TO authenticated
USING (public.is_active_user() AND public.effective_case_access(case_id) = 'full' AND public.can_read_document(id))
WITH CHECK (public.is_active_user() AND public.effective_case_access(case_id) = 'full');

CREATE POLICY "documents_delete" ON public.documents FOR DELETE TO authenticated
USING (public.is_active_user() AND (public.current_role() IN ('super_admin','admin')));

-- ============ DOCUMENT_VERSIONS ============
CREATE POLICY "versions_select" ON public.document_versions FOR SELECT TO authenticated
USING (public.is_active_user() AND public.can_read_document(document_id));
CREATE POLICY "versions_insert" ON public.document_versions FOR INSERT TO authenticated
WITH CHECK (public.is_active_user() AND EXISTS (
  SELECT 1 FROM public.documents d
  WHERE d.id = document_id AND public.effective_case_access(d.case_id) = 'full'
));
CREATE POLICY "versions_delete" ON public.document_versions FOR DELETE TO authenticated
USING (public.is_active_user() AND public.current_role() IN ('super_admin','admin'));

-- ============ DOCUMENT_SHARES ============
CREATE POLICY "shares_select" ON public.document_shares FOR SELECT TO authenticated
USING (public.is_active_user() AND (
  public.current_role() IN ('super_admin','admin')
  OR shared_with = auth.uid()
  OR EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND public.effective_case_access(d.case_id) = 'full')
));
CREATE POLICY "shares_insert" ON public.document_shares FOR INSERT TO authenticated
WITH CHECK (public.is_active_user() AND (
  public.current_role() IN ('super_admin','admin')
  OR EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND public.effective_case_access(d.case_id) = 'full')
));
CREATE POLICY "shares_update" ON public.document_shares FOR UPDATE TO authenticated
USING (public.is_active_user() AND (
  public.current_role() IN ('super_admin','admin')
  OR EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND public.effective_case_access(d.case_id) = 'full')
))
WITH CHECK (public.is_active_user() AND (
  public.current_role() IN ('super_admin','admin')
  OR EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND public.effective_case_access(d.case_id) = 'full')
));
CREATE POLICY "shares_delete" ON public.document_shares FOR DELETE TO authenticated
USING (public.is_active_user() AND (
  public.current_role() IN ('super_admin','admin')
  OR EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND public.effective_case_access(d.case_id) = 'full')
));

-- ============ TASKS ============
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT TO authenticated
USING (public.is_active_user() AND (
  public.current_role() IN ('super_admin','admin')
  OR assignee_id = auth.uid()
));
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT TO authenticated
WITH CHECK (public.is_active_user() AND (
  public.current_role() IN ('super_admin','admin')
  OR assignee_id = auth.uid()
));
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE TO authenticated
USING (public.is_active_user() AND (
  public.current_role() IN ('super_admin','admin')
  OR assignee_id = auth.uid()
))
WITH CHECK (public.is_active_user() AND (
  public.current_role() IN ('super_admin','admin')
  OR assignee_id = auth.uid()
));
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE TO authenticated
USING (public.is_active_user() AND public.current_role() IN ('super_admin','admin'));

-- ============ CALENDAR_EVENTS ============
CREATE POLICY "events_select" ON public.calendar_events FOR SELECT TO authenticated
USING (public.is_active_user() AND (
  public.current_role() = 'super_admin'
  OR (NOT is_private AND (
    public.current_role() = 'admin'
    OR owner_id = auth.uid()
    OR (public.current_role() IN ('senior_lawyer','junior_lawyer','support')
        AND case_id IS NOT NULL AND public.can_read_case(case_id))
    OR (public.current_role() = 'client'
        AND event_type = 'hearing' AND case_id IS NOT NULL AND public.can_read_case(case_id))
  ))
));
CREATE POLICY "events_insert" ON public.calendar_events FOR INSERT TO authenticated
WITH CHECK (public.is_active_user() AND (
  public.current_role() = 'super_admin'
  OR (NOT is_private AND (public.current_role() = 'admin' OR owner_id = auth.uid()))
));
CREATE POLICY "events_update" ON public.calendar_events FOR UPDATE TO authenticated
USING (public.is_active_user() AND (
  public.current_role() = 'super_admin'
  OR (NOT is_private AND (public.current_role() = 'admin' OR owner_id = auth.uid()))
))
WITH CHECK (public.is_active_user() AND (
  public.current_role() = 'super_admin'
  OR (NOT is_private AND (public.current_role() = 'admin' OR owner_id = auth.uid()))
));
CREATE POLICY "events_delete" ON public.calendar_events FOR DELETE TO authenticated
USING (public.is_active_user() AND (
  public.current_role() = 'super_admin'
  OR (NOT is_private AND (public.current_role() = 'admin' OR owner_id = auth.uid()))
));

-- ============ REPORTS_CACHE ============
CREATE POLICY "reports_select" ON public.reports_cache FOR SELECT TO authenticated
USING (public.is_active_user() AND (
  public.current_role() = 'super_admin'
  OR (public.current_role() = 'admin' AND is_summary)
));
CREATE POLICY "reports_insert" ON public.reports_cache FOR INSERT TO authenticated
WITH CHECK (public.is_active_user() AND public.current_role() = 'super_admin');
CREATE POLICY "reports_update" ON public.reports_cache FOR UPDATE TO authenticated
USING (public.is_active_user() AND public.current_role() = 'super_admin')
WITH CHECK (public.is_active_user() AND public.current_role() = 'super_admin');
CREATE POLICY "reports_delete" ON public.reports_cache FOR DELETE TO authenticated
USING (public.is_active_user() AND public.current_role() = 'super_admin');