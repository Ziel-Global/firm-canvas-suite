-- Match next_client_ref privileges so authenticated staff can generate case refs.
REVOKE ALL ON FUNCTION public.next_case_ref() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_case_ref() TO authenticated, service_role;
