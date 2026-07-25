-- Case-linked tasks are only visible when the viewer can still read the case.
-- Fixes stale stage/case tasks after team removal or access override = none.

DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update" ON public.tasks;

CREATE POLICY "tasks_select" ON public.tasks FOR SELECT TO authenticated
USING (
  public.is_active_user() AND (
    public.current_role() IN ('super_admin', 'admin')
    OR (
      (assignee_id = auth.uid() OR created_by = auth.uid())
      AND (case_id IS NULL OR public.can_read_case(case_id))
    )
  )
);

CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE TO authenticated
USING (
  public.is_active_user() AND (
    public.current_role() IN ('super_admin', 'admin')
    OR (
      (assignee_id = auth.uid() OR created_by = auth.uid())
      AND (case_id IS NULL OR public.can_read_case(case_id))
    )
  )
)
WITH CHECK (
  public.is_active_user() AND (
    public.current_role() IN ('super_admin', 'admin')
    OR (
      (assignee_id = auth.uid() OR created_by = auth.uid())
      AND (case_id IS NULL OR public.can_read_case(case_id))
    )
  )
);

-- Helper: staff member no longer has case access (not admin; not on team or overridden to none).
CREATE OR REPLACE FUNCTION public.staff_lost_case_access(_user_id uuid, _case_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id
      AND p.role NOT IN ('super_admin', 'admin')
  )
  AND (
    EXISTS (
      SELECT 1 FROM public.case_access_overrides o
      WHERE o.case_id = _case_id
        AND o.user_id = _user_id
        AND o.access_level = 'none'
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.case_assignments ca
      WHERE ca.case_id = _case_id
        AND ca.user_id = _user_id
    )
  );
$$;

REVOKE ALL ON FUNCTION public.staff_lost_case_access(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_lost_case_access(uuid, uuid) TO authenticated, service_role;

-- Clean up work already left behind for people who lost case access.
UPDATE public.case_stages cs
SET assignee_id = NULL
WHERE cs.assignee_id IS NOT NULL
  AND public.staff_lost_case_access(cs.assignee_id, cs.case_id);

DELETE FROM public.tasks t
WHERE t.stage_id IS NOT NULL
  AND t.assignee_id IS NOT NULL
  AND t.case_id IS NOT NULL
  AND public.staff_lost_case_access(t.assignee_id, t.case_id);

UPDATE public.tasks t
SET assignee_id = NULL
WHERE t.stage_id IS NULL
  AND t.assignee_id IS NOT NULL
  AND t.case_id IS NOT NULL
  AND public.staff_lost_case_access(t.assignee_id, t.case_id);
