-- Lock down the role-check helper from direct API calls
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.user_role) FROM PUBLIC, anon, authenticated;

-- Helper to confirm the caller is an active staff member
CREATE OR REPLACE FUNCTION public.is_active_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id
      AND is_active = true
      AND role <> 'client'
  )
$$;
REVOKE EXECUTE ON FUNCTION public.is_active_staff(uuid) FROM PUBLIC, anon, authenticated;

DROP POLICY "Authenticated staff can insert clients" ON public.clients;
DROP POLICY "Authenticated staff can update clients" ON public.clients;
DROP POLICY "Authenticated staff can delete clients" ON public.clients;

CREATE POLICY "Staff can insert clients"
ON public.clients FOR INSERT TO authenticated
WITH CHECK (public.is_active_staff(auth.uid()));

CREATE POLICY "Staff can update clients"
ON public.clients FOR UPDATE TO authenticated
USING (public.is_active_staff(auth.uid()));

CREATE POLICY "Staff can delete clients"
ON public.clients FOR DELETE TO authenticated
USING (public.is_active_staff(auth.uid()));