CREATE TABLE public.case_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  body text NOT NULL,
  is_principal_only boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_case_notes_case_id ON public.case_notes(case_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_notes TO authenticated;
GRANT ALL ON public.case_notes TO service_role;

ALTER TABLE public.case_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read case notes" ON public.case_notes
  FOR SELECT TO authenticated
  USING (
    public.can_read_case(case_id)
    AND (NOT is_principal_only OR public.current_role() = 'super_admin')
  );

CREATE POLICY "Add case notes" ON public.case_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.effective_case_access(case_id) = 'full'
    AND (NOT is_principal_only OR public.current_role() = 'super_admin')
  );

CREATE POLICY "Update case notes" ON public.case_notes
  FOR UPDATE TO authenticated
  USING (public.current_role() = 'super_admin')
  WITH CHECK (public.current_role() = 'super_admin');

CREATE POLICY "Delete case notes" ON public.case_notes
  FOR DELETE TO authenticated
  USING (public.current_role() = 'super_admin' OR author_id = auth.uid());