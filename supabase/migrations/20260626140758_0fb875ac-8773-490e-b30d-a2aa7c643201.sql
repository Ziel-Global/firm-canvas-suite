-- current_role(): role of the calling user
CREATE OR REPLACE FUNCTION public.current_role()
RETURNS public.user_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- is_active_user(): is_active for the calling user
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_active FROM public.profiles WHERE id = auth.uid()), false)
$$;

-- is_assigned_to_case(case_id): calling user has a case_assignments row
CREATE OR REPLACE FUNCTION public.is_assigned_to_case(_case_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.case_assignments
    WHERE case_id = _case_id AND user_id = auth.uid()
  )
$$;

-- case_override_level(case_id): access_level override for calling user, or null
CREATE OR REPLACE FUNCTION public.case_override_level(_case_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT access_level FROM public.case_access_overrides
  WHERE case_id = _case_id AND user_id = auth.uid()
  LIMIT 1
$$;

-- effective_case_access(case_id): combine role default + override -> none|read_only|full
CREATE OR REPLACE FUNCTION public.effective_case_access(_case_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.user_role := public.current_role();
  v_override text := public.case_override_level(_case_id);
  v_assigned boolean := public.is_assigned_to_case(_case_id);
  v_default text;
BEGIN
  -- Inactive users get nothing
  IF NOT public.is_active_user() THEN
    RETURN 'none';
  END IF;

  -- Override takes precedence: 'none' blocks, 'read_only'/'full' grants
  IF v_override IS NOT NULL THEN
    IF v_override = 'none' THEN
      RETURN 'none';
    ELSIF v_override IN ('read_only', 'full') THEN
      RETURN v_override;
    END IF;
  END IF;

  -- Role default
  v_default := CASE
    WHEN v_role IN ('super_admin', 'admin') THEN 'full'
    WHEN v_role IN ('senior_lawyer', 'junior_lawyer') THEN
      CASE WHEN v_assigned THEN 'full' ELSE 'none' END
    WHEN v_role = 'support' THEN
      CASE WHEN v_assigned THEN 'read_only' ELSE 'none' END
    ELSE 'none'
  END;

  RETURN v_default;
END;
$$;

-- stage_assigned_to_user(case_id): sequence_order of stage assigned to calling user
CREATE OR REPLACE FUNCTION public.stage_assigned_to_user(_case_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sequence_order FROM public.case_stages
  WHERE case_id = _case_id AND assignee_id = auth.uid()
  ORDER BY sequence_order
  LIMIT 1
$$;

-- Allow signed-in users to call these helpers from within RLS policies
GRANT EXECUTE ON FUNCTION public.current_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_assigned_to_case(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.case_override_level(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.effective_case_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stage_assigned_to_user(uuid) TO authenticated;