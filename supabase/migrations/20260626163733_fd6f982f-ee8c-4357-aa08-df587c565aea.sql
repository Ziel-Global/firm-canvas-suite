CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.event_reminder_defaults (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type text NOT NULL UNIQUE,
  offsets integer[] NOT NULL DEFAULT ARRAY[10080, 1440, 120],
  channels text[] NOT NULL DEFAULT ARRAY['email','in_app'],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_reminder_defaults TO authenticated;
GRANT ALL ON public.event_reminder_defaults TO service_role;

ALTER TABLE public.event_reminder_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reminder_defaults_select" ON public.event_reminder_defaults
  FOR SELECT TO authenticated
  USING (is_active_staff(auth.uid()));

CREATE POLICY "reminder_defaults_insert" ON public.event_reminder_defaults
  FOR INSERT TO authenticated
  WITH CHECK (is_active_user() AND public."current_role"() = ANY (ARRAY['super_admin'::user_role, 'admin'::user_role]));

CREATE POLICY "reminder_defaults_update" ON public.event_reminder_defaults
  FOR UPDATE TO authenticated
  USING (is_active_user() AND public."current_role"() = ANY (ARRAY['super_admin'::user_role, 'admin'::user_role]))
  WITH CHECK (is_active_user() AND public."current_role"() = ANY (ARRAY['super_admin'::user_role, 'admin'::user_role]));

CREATE POLICY "reminder_defaults_delete" ON public.event_reminder_defaults
  FOR DELETE TO authenticated
  USING (is_active_user() AND public."current_role"() = 'super_admin'::user_role);

CREATE TRIGGER trg_reminder_defaults_updated_at
  BEFORE UPDATE ON public.event_reminder_defaults
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.event_reminder_defaults (event_type, offsets, channels) VALUES
  ('meeting',  ARRAY[10080, 1440, 120], ARRAY['email','in_app']),
  ('hearing',  ARRAY[10080, 1440, 120], ARRAY['email','in_app']),
  ('deadline', ARRAY[10080, 1440, 120], ARRAY['email','in_app']),
  ('call',     ARRAY[10080, 1440, 120], ARRAY['email','in_app']),
  ('internal', ARRAY[10080, 1440, 120], ARRAY['email','in_app']);