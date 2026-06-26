CREATE TABLE public.cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_ref TEXT UNIQUE,
  title TEXT NOT NULL,
  client_id UUID REFERENCES public.clients(id),
  case_type TEXT,
  status public.case_status DEFAULT 'intake',
  health public.health_status DEFAULT 'on_track',
  current_stage_id UUID,
  opened_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ,
  retention_until DATE,
  closure_summary TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.case_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id),
  role_on_case TEXT,
  is_lead BOOLEAN DEFAULT false,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  assigned_by UUID,
  UNIQUE (case_id, user_id)
);

CREATE TABLE public.case_access_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id),
  access_level TEXT CHECK (access_level IN ('none','read_only','full')),
  folder_scope TEXT,
  granted_by UUID,
  granted_at TIMESTAMPTZ DEFAULT now(),
  note TEXT
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cases TO authenticated;
GRANT ALL ON public.cases TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_assignments TO authenticated;
GRANT ALL ON public.case_assignments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_access_overrides TO authenticated;
GRANT ALL ON public.case_access_overrides TO service_role;

ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_access_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view cases" ON public.cases FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can insert cases" ON public.cases FOR INSERT TO authenticated WITH CHECK (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can update cases" ON public.cases FOR UPDATE TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can delete cases" ON public.cases FOR DELETE TO authenticated USING (public.is_active_staff(auth.uid()));

CREATE POLICY "Staff can view assignments" ON public.case_assignments FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can insert assignments" ON public.case_assignments FOR INSERT TO authenticated WITH CHECK (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can update assignments" ON public.case_assignments FOR UPDATE TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can delete assignments" ON public.case_assignments FOR DELETE TO authenticated USING (public.is_active_staff(auth.uid()));

CREATE POLICY "Staff can view overrides" ON public.case_access_overrides FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can insert overrides" ON public.case_access_overrides FOR INSERT TO authenticated WITH CHECK (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can update overrides" ON public.case_access_overrides FOR UPDATE TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can delete overrides" ON public.case_access_overrides FOR DELETE TO authenticated USING (public.is_active_staff(auth.uid()));