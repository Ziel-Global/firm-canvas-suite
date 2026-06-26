CREATE OR REPLACE FUNCTION public.effective_case_access_for(_user_id uuid, _case_id uuid)
RETURNS TABLE(role_default text, override_level text, effective_level text, folder_scope text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role public.user_role;
  v_active boolean;
  v_override text;
  v_scope text;
  v_assigned boolean;
  v_default text;
  v_effective text;
BEGIN
  SELECT role, is_active INTO v_role, v_active
  FROM public.profiles WHERE id = _user_id;

  SELECT o.access_level, o.folder_scope INTO v_override, v_scope
  FROM public.case_access_overrides o
  WHERE o.case_id = _case_id AND o.user_id = _user_id
  LIMIT 1;

  v_assigned := EXISTS (
    SELECT 1 FROM public.case_assignments
    WHERE case_id = _case_id AND user_id = _user_id
  );

  v_default := CASE
    WHEN v_role IN ('super_admin', 'admin') THEN 'full'
    WHEN v_role IN ('senior_lawyer', 'junior_lawyer') THEN
      CASE WHEN v_assigned THEN 'full' ELSE 'none' END
    WHEN v_role = 'support' THEN
      CASE WHEN v_assigned THEN 'read_only' ELSE 'none' END
    ELSE 'none'
  END;

  IF COALESCE(v_active, false) = false THEN
    v_effective := 'none';
  ELSIF v_override IS NOT NULL THEN
    IF v_override = 'none' THEN
      v_effective := 'none';
    ELSIF v_override IN ('read_only', 'full') THEN
      v_effective := v_override;
    ELSE
      v_effective := v_default;
    END IF;
  ELSE
    v_effective := v_default;
  END IF;

  role_default := v_default;
  override_level := v_override;
  effective_level := v_effective;
  folder_scope := v_scope;
  RETURN NEXT;
END;
$function$;