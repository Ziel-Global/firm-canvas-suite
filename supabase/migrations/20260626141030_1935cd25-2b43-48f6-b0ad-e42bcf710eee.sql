-- Ensure RLS is enabled on all public tables
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-- ============ PROFILES ============
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
USING (public.is_active_user() AND (id = auth.uid() OR public.current_role() = 'super_admin'));

CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated
USING (public.is_active_user() AND (id = auth.uid() OR public.current_role() = 'super_admin'))
WITH CHECK (public.is_active_user() AND (id = auth.uid() OR public.current_role() = 'super_admin'));

CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated
WITH CHECK (public.is_active_user() AND public.current_role() = 'super_admin');

CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE TO authenticated
USING (public.is_active_user() AND public.current_role() = 'super_admin');

-- ============ CLIENTS ============
DROP POLICY IF EXISTS "Authenticated staff can view clients" ON public.clients;
DROP POLICY IF EXISTS "Staff can insert clients" ON public.clients;
DROP POLICY IF EXISTS "Staff can update clients" ON public.clients;
DROP POLICY IF EXISTS "Staff can delete clients" ON public.clients;

CREATE POLICY "clients_select" ON public.clients FOR SELECT TO authenticated
USING (
  public.is_active_user() AND (
    public.current_role() IN ('super_admin','admin')
    OR (
      public.current_role() IN ('senior_lawyer','junior_lawyer')
      AND EXISTS (
        SELECT 1 FROM public.cases c
        JOIN public.case_assignments ca ON ca.case_id = c.id
        WHERE c.client_id = clients.id AND ca.user_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "clients_insert" ON public.clients FOR INSERT TO authenticated
WITH CHECK (public.is_active_user() AND public.current_role() IN ('super_admin','admin'));

CREATE POLICY "clients_update" ON public.clients FOR UPDATE TO authenticated
USING (public.is_active_user() AND public.current_role() IN ('super_admin','admin'))
WITH CHECK (public.is_active_user() AND public.current_role() IN ('super_admin','admin'));

CREATE POLICY "clients_delete" ON public.clients FOR DELETE TO authenticated
USING (public.is_active_user() AND public.current_role() IN ('super_admin','admin'));

-- ============ FIRM_SETTINGS ============
DROP POLICY IF EXISTS "Staff can view firm settings" ON public.firm_settings;
DROP POLICY IF EXISTS "Admins can insert firm settings" ON public.firm_settings;
DROP POLICY IF EXISTS "Admins can update firm settings" ON public.firm_settings;
DROP POLICY IF EXISTS "Admins can delete firm settings" ON public.firm_settings;

CREATE POLICY "firm_settings_select" ON public.firm_settings FOR SELECT TO authenticated
USING (public.is_active_user() AND public.current_role() IN ('super_admin','admin'));
CREATE POLICY "firm_settings_insert" ON public.firm_settings FOR INSERT TO authenticated
WITH CHECK (public.is_active_user() AND public.current_role() = 'super_admin');
CREATE POLICY "firm_settings_update" ON public.firm_settings FOR UPDATE TO authenticated
USING (public.is_active_user() AND public.current_role() = 'super_admin')
WITH CHECK (public.is_active_user() AND public.current_role() = 'super_admin');
CREATE POLICY "firm_settings_delete" ON public.firm_settings FOR DELETE TO authenticated
USING (public.is_active_user() AND public.current_role() = 'super_admin');

-- ============ WORKFLOW_TEMPLATES ============
DROP POLICY IF EXISTS "Staff can view workflow templates" ON public.workflow_templates;
DROP POLICY IF EXISTS "Staff can insert workflow templates" ON public.workflow_templates;
DROP POLICY IF EXISTS "Staff can update workflow templates" ON public.workflow_templates;
DROP POLICY IF EXISTS "Staff can delete workflow templates" ON public.workflow_templates;

CREATE POLICY "workflow_templates_select" ON public.workflow_templates FOR SELECT TO authenticated
USING (public.is_active_user() AND public.current_role() IN ('super_admin','admin'));
CREATE POLICY "workflow_templates_insert" ON public.workflow_templates FOR INSERT TO authenticated
WITH CHECK (public.is_active_user() AND public.current_role() = 'super_admin');
CREATE POLICY "workflow_templates_update" ON public.workflow_templates FOR UPDATE TO authenticated
USING (public.is_active_user() AND public.current_role() = 'super_admin')
WITH CHECK (public.is_active_user() AND public.current_role() = 'super_admin');
CREATE POLICY "workflow_templates_delete" ON public.workflow_templates FOR DELETE TO authenticated
USING (public.is_active_user() AND public.current_role() = 'super_admin');

-- ============ DOCUMENT_TEMPLATES ============
DROP POLICY IF EXISTS "Staff can view doc templates" ON public.document_templates;
DROP POLICY IF EXISTS "Staff can insert doc templates" ON public.document_templates;
DROP POLICY IF EXISTS "Staff can update doc templates" ON public.document_templates;
DROP POLICY IF EXISTS "Staff can delete doc templates" ON public.document_templates;

CREATE POLICY "document_templates_select" ON public.document_templates FOR SELECT TO authenticated
USING (public.is_active_user() AND public.current_role() IN ('super_admin','admin'));
CREATE POLICY "document_templates_insert" ON public.document_templates FOR INSERT TO authenticated
WITH CHECK (public.is_active_user() AND public.current_role() = 'super_admin');
CREATE POLICY "document_templates_update" ON public.document_templates FOR UPDATE TO authenticated
USING (public.is_active_user() AND public.current_role() = 'super_admin')
WITH CHECK (public.is_active_user() AND public.current_role() = 'super_admin');
CREATE POLICY "document_templates_delete" ON public.document_templates FOR DELETE TO authenticated
USING (public.is_active_user() AND public.current_role() = 'super_admin');