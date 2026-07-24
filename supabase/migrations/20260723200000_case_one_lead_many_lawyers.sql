-- At most one lead lawyer per case. Multiple non-lead lawyers remain allowed.
CREATE UNIQUE INDEX IF NOT EXISTS case_assignments_one_lead_per_case
  ON public.case_assignments (case_id)
  WHERE is_lead = true;
