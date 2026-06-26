CREATE OR REPLACE FUNCTION public.next_client_ref()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year text := to_char(now(), 'YYYY');
  v_next integer;
BEGIN
  -- Lock to serialize concurrent ref generation
  PERFORM pg_advisory_xact_lock(hashtext('client_ref_' || v_year));

  SELECT COALESCE(MAX((regexp_match(client_ref, '^CL-' || v_year || '-(\d+)$'))[1]::integer), 0) + 1
  INTO v_next
  FROM public.clients
  WHERE client_ref ~ ('^CL-' || v_year || '-\d+$');

  RETURN 'CL-' || v_year || '-' || lpad(v_next::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_client_ref() FROM public;
GRANT EXECUTE ON FUNCTION public.next_client_ref() TO authenticated, service_role;