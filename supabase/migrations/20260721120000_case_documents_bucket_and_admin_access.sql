-- Ensure the case-documents storage bucket exists (policies already reference it).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'case-documents',
  'case-documents',
  false,
  52428800,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'text/plain'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Recreate storage write policy so authenticated staff with full case access
-- can upload (older environments may be missing this policy entirely).
DROP POLICY IF EXISTS "case_docs_insert" ON storage.objects;
CREATE POLICY "case_docs_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'case-documents'
  AND public.is_active_user()
  AND public.effective_case_access(((storage.foldername(name))[1])::uuid) = 'full'
);

DROP POLICY IF EXISTS "case_docs_update" ON storage.objects;
CREATE POLICY "case_docs_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'case-documents'
  AND public.is_active_user()
  AND public.effective_case_access(((storage.foldername(name))[1])::uuid) = 'full'
)
WITH CHECK (
  bucket_id = 'case-documents'
  AND public.is_active_user()
  AND public.effective_case_access(((storage.foldername(name))[1])::uuid) = 'full'
);

-- Admins manage the firm: treat them like super_admin for case readability
-- (including private matters), so they can open case details and Documents.
CREATE OR REPLACE FUNCTION public.can_read_case(_case_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = _case_id AND (
      public.current_role() IN ('super_admin', 'admin')
      OR (NOT c.is_private AND (
        public.effective_case_access(c.id) IN ('read_only','full')
        OR (public.current_role() = 'support'
            AND public.case_override_level(c.id) IS DISTINCT FROM 'none'
            AND EXISTS (SELECT 1 FROM public.tasks t
                        WHERE t.case_id = c.id AND t.assignee_id = auth.uid()))
        OR (public.current_role() = 'client'
            AND c.client_id IS NOT NULL
            AND c.client_id = public.current_client_id())
      ))
    )
  )
$$;
