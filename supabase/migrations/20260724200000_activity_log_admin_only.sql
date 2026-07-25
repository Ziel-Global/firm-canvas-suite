-- Case activity_log is an admin audit trail. Restrict SELECT to admin /
-- super_admin. Staff may still INSERT (triggers / app writes).

DROP POLICY IF EXISTS "Staff can view permitted activity log" ON public.activity_log;
DROP POLICY IF EXISTS "activity_log_select" ON public.activity_log;

CREATE POLICY "activity_log_select" ON public.activity_log
FOR SELECT TO authenticated
USING (
  public.is_active_user()
  AND public.current_role() IN (
    'super_admin'::public.user_role,
    'admin'::public.user_role
  )
);
