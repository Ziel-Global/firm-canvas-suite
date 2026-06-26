CREATE TABLE public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  description TEXT,
  case_id UUID REFERENCES public.cases(id),
  event_type TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  is_private BOOLEAN DEFAULT false,
  owner_id UUID,
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.event_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  offset_minutes INT,
  channel TEXT CHECK (channel IN ('email','sms','in_app')),
  sent BOOLEAN DEFAULT false
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated;
GRANT ALL ON public.calendar_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_reminders TO authenticated;
GRANT ALL ON public.event_reminders TO service_role;

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view calendar events" ON public.calendar_events FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can insert calendar events" ON public.calendar_events FOR INSERT TO authenticated WITH CHECK (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can update calendar events" ON public.calendar_events FOR UPDATE TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can delete calendar events" ON public.calendar_events FOR DELETE TO authenticated USING (public.is_active_staff(auth.uid()));

CREATE POLICY "Staff can view event reminders" ON public.event_reminders FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can insert event reminders" ON public.event_reminders FOR INSERT TO authenticated WITH CHECK (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can update event reminders" ON public.event_reminders FOR UPDATE TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can delete event reminders" ON public.event_reminders FOR DELETE TO authenticated USING (public.is_active_staff(auth.uid()));