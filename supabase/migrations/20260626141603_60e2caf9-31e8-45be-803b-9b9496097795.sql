CREATE OR REPLACE FUNCTION public.can_read_case(_case_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = _case_id AND (
      public.current_role() = 'super_admin'
      OR (NOT c.is_private AND (
        -- Role default + override (none blocks, read_only/full grant)
        public.effective_case_access(c.id) IN ('read_only','full')
        -- Support: visible via an assigned task, unless an override explicitly blocks
        OR (public.current_role() = 'support'
            AND public.case_override_level(c.id) IS DISTINCT FROM 'none'
            AND EXISTS (SELECT 1 FROM public.tasks t
                        WHERE t.case_id = c.id AND t.assignee_id = auth.uid()))
      ))
    )
  )
$$;