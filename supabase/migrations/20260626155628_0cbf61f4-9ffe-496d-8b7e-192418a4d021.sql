DROP POLICY IF EXISTS "Staff can view activity log" ON public.activity_log;

CREATE POLICY "Staff can view permitted activity log"
  ON public.activity_log FOR SELECT
  USING (
    public.is_active_staff(auth.uid())
    AND (
      public.current_role() = 'super_admin'
      OR (case_id IS NOT NULL AND public.can_read_case(case_id))
    )
  );