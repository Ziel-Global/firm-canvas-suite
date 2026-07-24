-- When a user updates their own profile, lock privileged columns.
-- Super admins may still change any profile (including their own).

CREATE OR REPLACE FUNCTION public.profiles_self_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NEW.id = auth.uid()
     AND public.current_role() IS DISTINCT FROM 'super_admin' THEN
    NEW.role := OLD.role;
    NEW.is_active := OLD.is_active;
    NEW.two_factor_enabled := OLD.two_factor_enabled;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_self_update_guard_trg ON public.profiles;
CREATE TRIGGER profiles_self_update_guard_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_self_update_guard();
