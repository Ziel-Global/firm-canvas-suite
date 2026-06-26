CREATE TABLE public.ai_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT CHECK (kind IN ('proofread','draft','summarise','search','transcribe','risk_scan')),
  input JSONB,
  output JSONB,
  status TEXT DEFAULT 'queued',
  case_id UUID,
  requested_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE public.firm_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE,
  value JSONB
);

CREATE TABLE public.reports_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT,
  params JSONB,
  payload JSONB,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_jobs TO authenticated;
GRANT ALL ON public.ai_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.firm_settings TO authenticated;
GRANT ALL ON public.firm_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports_cache TO authenticated;
GRANT ALL ON public.reports_cache TO service_role;

ALTER TABLE public.ai_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports_cache ENABLE ROW LEVEL SECURITY;

-- ai_jobs: active staff manage
CREATE POLICY "Staff can view ai jobs" ON public.ai_jobs FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can insert ai jobs" ON public.ai_jobs FOR INSERT TO authenticated WITH CHECK (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can update ai jobs" ON public.ai_jobs FOR UPDATE TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can delete ai jobs" ON public.ai_jobs FOR DELETE TO authenticated USING (public.is_active_staff(auth.uid()));

-- firm_settings: staff read, admins write
CREATE POLICY "Staff can view firm settings" ON public.firm_settings FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Admins can insert firm settings" ON public.firm_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins can update firm settings" ON public.firm_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins can delete firm settings" ON public.firm_settings FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- reports_cache: active staff manage
CREATE POLICY "Staff can view reports cache" ON public.reports_cache FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can insert reports cache" ON public.reports_cache FOR INSERT TO authenticated WITH CHECK (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can update reports cache" ON public.reports_cache FOR UPDATE TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can delete reports cache" ON public.reports_cache FOR DELETE TO authenticated USING (public.is_active_staff(auth.uid()));

-- Seed firm_settings
INSERT INTO public.firm_settings (key, value) VALUES
  ('retention_days', '2555'::jsonb),
  ('session_timeout_minutes', '30'::jsonb),
  ('reminder_offsets', '[10080, 1440, 120]'::jsonb),
  ('morning_digest_time', '"07:30"'::jsonb),
  ('max_failed_logins', '5'::jsonb)
ON CONFLICT (key) DO NOTHING;