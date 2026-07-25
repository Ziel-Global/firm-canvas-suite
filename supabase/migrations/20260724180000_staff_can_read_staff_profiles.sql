-- Staff need to read other staff profiles for display names (case lead,
-- task/stage assignees, team lists, etc.). Previously only self + super_admin
-- could SELECT profiles, so juniors saw "Unassigned" even when a lead existed.
-- Clients remain limited to their own profile row.

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
USING (
  public.is_active_user()
  AND (
    id = auth.uid()
    OR public.current_role() = 'super_admin'
    OR (
      public.is_active_staff(auth.uid())
      AND role IS DISTINCT FROM 'client'::public.user_role
    )
  )
);
