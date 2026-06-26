CREATE TABLE public.approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES public.documents(id),
  case_id UUID REFERENCES public.cases(id),
  submitted_by UUID,
  status public.approval_status DEFAULT 'pending',
  ai_report JSONB,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by UUID
);

CREATE TABLE public.approval_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id UUID REFERENCES public.approvals(id) ON DELETE CASCADE,
  author_id UUID,
  body TEXT,
  anchor JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.approvals TO authenticated;
GRANT ALL ON public.approvals TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_comments TO authenticated;
GRANT ALL ON public.approval_comments TO service_role;

ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view approvals" ON public.approvals FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can insert approvals" ON public.approvals FOR INSERT TO authenticated WITH CHECK (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can update approvals" ON public.approvals FOR UPDATE TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can delete approvals" ON public.approvals FOR DELETE TO authenticated USING (public.is_active_staff(auth.uid()));

CREATE POLICY "Staff can view approval comments" ON public.approval_comments FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can insert approval comments" ON public.approval_comments FOR INSERT TO authenticated WITH CHECK (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can update approval comments" ON public.approval_comments FOR UPDATE TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can delete approval comments" ON public.approval_comments FOR DELETE TO authenticated USING (public.is_active_staff(auth.uid()));