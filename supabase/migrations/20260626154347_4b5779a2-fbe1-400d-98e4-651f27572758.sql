CREATE OR REPLACE FUNCTION public.next_case_ref()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_year text := to_char(now(), 'YYYY');
  v_next integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('case_ref_' || v_year));

  SELECT COALESCE(MAX((regexp_match(case_ref, '^CASE-' || v_year || '-(\d+)$'))[1]::integer), 0) + 1
  INTO v_next
  FROM public.cases
  WHERE case_ref ~ ('^CASE-' || v_year || '-\d+$');

  RETURN 'CASE-' || v_year || '-' || lpad(v_next::text, 4, '0');
END;
$function$;