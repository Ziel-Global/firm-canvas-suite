-- Client portal: let clients always see their own cases and non-private hearings,
-- even when the case is staff-marked private. Also treat NULL is_private as false.

CREATE OR REPLACE FUNCTION public.can_read_case(_case_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = _case_id AND (
      public.current_role() = 'super_admin'
      OR (
        public.current_role() = 'client'
        AND c.client_id IS NOT NULL
        AND c.client_id = public.current_client_id()
      )
      OR (
        COALESCE(c.is_private, false) = false
        AND (
          public.effective_case_access(c.id) IN ('read_only','full')
          OR (
            public.current_role() = 'support'
            AND public.case_override_level(c.id) IS DISTINCT FROM 'none'
            AND EXISTS (
              SELECT 1 FROM public.tasks t
              WHERE t.case_id = c.id AND t.assignee_id = auth.uid()
            )
          )
        )
      )
    )
  )
$$;

DROP POLICY IF EXISTS "events_select" ON public.calendar_events;
CREATE POLICY "events_select" ON public.calendar_events FOR SELECT TO authenticated
USING (
  public.is_active_user() AND (
    public.current_role() = 'super_admin'
    OR (
      COALESCE(is_private, false) = false
      AND (
        public.current_role() = 'admin'
        OR owner_id = auth.uid()
        OR (
          public.current_role() IN ('senior_lawyer','junior_lawyer','support')
          AND case_id IS NOT NULL
          AND public.can_read_case(case_id)
        )
        OR (
          public.current_role() = 'client'
          AND event_type = 'hearing'
          AND case_id IS NOT NULL
          AND public.can_read_case(case_id)
        )
      )
    )
  )
);
