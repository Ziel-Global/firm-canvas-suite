CREATE TABLE public.workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  case_type TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.workflow_template_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  name TEXT,
  sequence_order INT,
  responsible_role public.user_role,
  expected_output TEXT,
  deadline_days INT
);

CREATE TABLE public.case_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE,
  template_stage_id UUID,
  name TEXT,
  sequence_order INT,
  assignee_id UUID REFERENCES public.profiles(id),
  status public.stage_status DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  deadline DATE,
  notes TEXT
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_templates TO authenticated;
GRANT ALL ON public.workflow_templates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_template_stages TO authenticated;
GRANT ALL ON public.workflow_template_stages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_stages TO authenticated;
GRANT ALL ON public.case_stages TO service_role;

ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_template_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view workflow templates" ON public.workflow_templates FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can insert workflow templates" ON public.workflow_templates FOR INSERT TO authenticated WITH CHECK (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can update workflow templates" ON public.workflow_templates FOR UPDATE TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can delete workflow templates" ON public.workflow_templates FOR DELETE TO authenticated USING (public.is_active_staff(auth.uid()));

CREATE POLICY "Staff can view template stages" ON public.workflow_template_stages FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can insert template stages" ON public.workflow_template_stages FOR INSERT TO authenticated WITH CHECK (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can update template stages" ON public.workflow_template_stages FOR UPDATE TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can delete template stages" ON public.workflow_template_stages FOR DELETE TO authenticated USING (public.is_active_staff(auth.uid()));

CREATE POLICY "Staff can view case stages" ON public.case_stages FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can insert case stages" ON public.case_stages FOR INSERT TO authenticated WITH CHECK (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can update case stages" ON public.case_stages FOR UPDATE TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can delete case stages" ON public.case_stages FOR DELETE TO authenticated USING (public.is_active_staff(auth.uid()));