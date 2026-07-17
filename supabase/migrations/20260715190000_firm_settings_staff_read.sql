-- Allow active staff to read firm_settings (session timeout & retention need live values).
-- Writes remain super_admin-only.

DROP POLICY IF EXISTS "firm_settings_select" ON public.firm_settings;

CREATE POLICY "firm_settings_select" ON public.firm_settings
  FOR SELECT TO authenticated
  USING (
    public.is_active_user()
    AND public.current_role() <> 'client'
  );

-- Ensure required policy keys exist.
INSERT INTO public.firm_settings (key, value) VALUES
  ('retention_days', '2555'::jsonb),
  ('session_timeout_minutes', '30'::jsonb),
  ('reminder_offsets', '[10080, 1440, 120]'::jsonb),
  ('morning_digest_time', '"07:30"'::jsonb),
  ('max_failed_logins', '5'::jsonb),
  ('lockout_minutes', '15'::jsonb)
ON CONFLICT (key) DO NOTHING;
