-- Task assignment visibility: assignees and creators must see delegated work.
-- Drop legacy permissive policies that conflict with role-scoped rules.

DROP POLICY IF EXISTS "Staff can view tasks" ON public.tasks;
DROP POLICY IF EXISTS "Staff can insert tasks" ON public.tasks;
DROP POLICY IF EXISTS "Staff can update tasks" ON public.tasks;
DROP POLICY IF EXISTS "Staff can delete tasks" ON public.tasks;

DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;

CREATE POLICY "tasks_select" ON public.tasks FOR SELECT TO authenticated
USING (
  public.is_active_user() AND (
    public.current_role() IN ('super_admin', 'admin')
    OR assignee_id = auth.uid()
    OR created_by = auth.uid()
  )
);

CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT TO authenticated
WITH CHECK (
  public.is_active_user() AND (
    public.current_role() IN ('super_admin', 'admin', 'senior_lawyer')
    OR assignee_id = auth.uid()
  )
);

CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE TO authenticated
USING (
  public.is_active_user() AND (
    public.current_role() IN ('super_admin', 'admin')
    OR assignee_id = auth.uid()
    OR created_by = auth.uid()
  )
)
WITH CHECK (
  public.is_active_user() AND (
    public.current_role() IN ('super_admin', 'admin')
    OR assignee_id = auth.uid()
    OR created_by = auth.uid()
  )
);

CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE TO authenticated
USING (
  public.is_active_user() AND (
    public.current_role() IN ('super_admin', 'admin')
    OR created_by = auth.uid()
  )
);
