REVOKE EXECUTE ON FUNCTION public.current_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_active_user() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_assigned_to_case(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.case_override_level(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.effective_case_access(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.stage_assigned_to_user(uuid) FROM PUBLIC, anon;