-- Junior lawyers on a case team need to see the case's current stage and
-- upcoming deadlines. Previously case_stages SELECT only returned rows where
-- assignee_id = auth.uid(), so summary fields showed blank/"—" even when the
-- junior was assigned to the case.
-- Keep UPDATE/DELETE restrictions: juniors may still only edit their own stages.

DROP POLICY IF EXISTS "case_stages_select" ON public.case_stages;

CREATE POLICY "case_stages_select" ON public.case_stages FOR SELECT TO authenticated
USING (
  public.is_active_user()
  AND public.current_role() IS DISTINCT FROM 'client'::public.user_role
  AND (
    public.current_role() = 'super_admin'::public.user_role
    OR (NOT is_private AND public.can_read_case(case_id))
  )
);
