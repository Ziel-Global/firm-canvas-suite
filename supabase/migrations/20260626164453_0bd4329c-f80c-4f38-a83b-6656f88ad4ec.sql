-- Allow admins (not just super_admin) to manage workflow templates,
-- matching the Settings > Workflow Templates area available to both roles.
DROP POLICY IF EXISTS "workflow_templates_insert" ON public.workflow_templates;
DROP POLICY IF EXISTS "workflow_templates_update" ON public.workflow_templates;
DROP POLICY IF EXISTS "workflow_templates_delete" ON public.workflow_templates;

CREATE POLICY "workflow_templates_insert" ON public.workflow_templates
  FOR INSERT TO authenticated
  WITH CHECK (is_active_user() AND ("current_role"() = ANY (ARRAY['super_admin'::user_role, 'admin'::user_role])));

CREATE POLICY "workflow_templates_update" ON public.workflow_templates
  FOR UPDATE TO authenticated
  USING (is_active_user() AND ("current_role"() = ANY (ARRAY['super_admin'::user_role, 'admin'::user_role])))
  WITH CHECK (is_active_user() AND ("current_role"() = ANY (ARRAY['super_admin'::user_role, 'admin'::user_role])));

CREATE POLICY "workflow_templates_delete" ON public.workflow_templates
  FOR DELETE TO authenticated
  USING (is_active_user() AND ("current_role"() = ANY (ARRAY['super_admin'::user_role, 'admin'::user_role])));