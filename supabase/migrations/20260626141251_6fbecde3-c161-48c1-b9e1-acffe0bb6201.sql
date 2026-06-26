ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;
ALTER TABLE public.case_stages ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;

-- Helper: can the calling user read a given case (mirrors cases SELECT logic)
CREATE OR REPLACE FUNCTION public.can_read_case(_case_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = _case_id AND (
      public.current_role() = 'super_admin'
      OR (NOT c.is_private AND (
        public.current_role() = 'admin'
        OR (public.current_role() = 'senior_lawyer' AND public.effective_case_access(c.id) IN ('read_only','full'))
        OR (public.current_role() = 'junior_lawyer' AND public.is_assigned_to_case(c.id))
        OR (public.current_role() = 'support' AND EXISTS (
              SELECT 1 FROM public.tasks t WHERE t.case_id = c.id AND t.assignee_id = auth.uid()))
      ))
    )
  )
$$;
REVOKE EXECUTE ON FUNCTION public.can_read_case(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_case(uuid) TO authenticated;

-- Drop existing policies on the three tables
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies
           WHERE schemaname='public' AND tablename IN ('cases','case_assignments','case_stages')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ============ CASES ============
CREATE POLICY "cases_select" ON public.cases FOR SELECT TO authenticated
USING (public.is_active_user() AND public.can_read_case(id));

CREATE POLICY "cases_insert" ON public.cases FOR INSERT TO authenticated
WITH CHECK (public.is_active_user() AND public.current_role() IN ('super_admin','admin'));

CREATE POLICY "cases_update" ON public.cases FOR UPDATE TO authenticated
USING (public.is_active_user() AND (
  public.current_role() IN ('super_admin','admin')
  OR (public.current_role() = 'senior_lawyer' AND public.effective_case_access(id) IN ('read_only','full'))
))
WITH CHECK (public.is_active_user() AND (
  public.current_role() IN ('super_admin','admin')
  OR (public.current_role() = 'senior_lawyer' AND public.effective_case_access(id) IN ('read_only','full'))
));

CREATE POLICY "cases_delete" ON public.cases FOR DELETE TO authenticated
USING (public.is_active_user() AND public.current_role() IN ('super_admin','admin'));

-- ============ CASE_ASSIGNMENTS (follow parent case access) ============
CREATE POLICY "case_assignments_select" ON public.case_assignments FOR SELECT TO authenticated
USING (public.is_active_user() AND public.can_read_case(case_id));

CREATE POLICY "case_assignments_insert" ON public.case_assignments FOR INSERT TO authenticated
WITH CHECK (public.is_active_user() AND public.current_role() IN ('super_admin','admin'));

CREATE POLICY "case_assignments_update" ON public.case_assignments FOR UPDATE TO authenticated
USING (public.is_active_user() AND public.current_role() IN ('super_admin','admin'))
WITH CHECK (public.is_active_user() AND public.current_role() IN ('super_admin','admin'));

CREATE POLICY "case_assignments_delete" ON public.case_assignments FOR DELETE TO authenticated
USING (public.is_active_user() AND public.current_role() IN ('super_admin','admin'));

-- ============ CASE_STAGES ============
-- Junior lawyers see only their own assigned stage; everyone else who can read
-- the case sees all stages. Private stages are super_admin only.
CREATE POLICY "case_stages_select" ON public.case_stages FOR SELECT TO authenticated
USING (
  public.is_active_user() AND (
    public.current_role() = 'super_admin'
    OR (NOT is_private AND (
      CASE WHEN public.current_role() = 'junior_lawyer'
        THEN (public.is_assigned_to_case(case_id) AND assignee_id = auth.uid())
        ELSE public.can_read_case(case_id)
      END
    ))
  )
);

CREATE POLICY "case_stages_insert" ON public.case_stages FOR INSERT TO authenticated
WITH CHECK (public.is_active_user() AND (
  public.current_role() IN ('super_admin','admin')
  OR (public.current_role() = 'senior_lawyer' AND public.effective_case_access(case_id) IN ('read_only','full'))
));

CREATE POLICY "case_stages_update" ON public.case_stages FOR UPDATE TO authenticated
USING (public.is_active_user() AND (
  public.current_role() IN ('super_admin','admin')
  OR (public.current_role() = 'senior_lawyer' AND public.effective_case_access(case_id) IN ('read_only','full'))
  OR (public.current_role() = 'junior_lawyer' AND assignee_id = auth.uid())
))
WITH CHECK (public.is_active_user() AND (
  public.current_role() IN ('super_admin','admin')
  OR (public.current_role() = 'senior_lawyer' AND public.effective_case_access(case_id) IN ('read_only','full'))
  OR (public.current_role() = 'junior_lawyer' AND assignee_id = auth.uid())
));

CREATE POLICY "case_stages_delete" ON public.case_stages FOR DELETE TO authenticated
USING (public.is_active_user() AND (
  public.current_role() IN ('super_admin','admin')
  OR (public.current_role() = 'senior_lawyer' AND public.effective_case_access(case_id) IN ('read_only','full'))
));