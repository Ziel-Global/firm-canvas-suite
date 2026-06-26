-- RLS policies for the case-documents storage bucket.
-- File path convention: {caseId}/{folderId}/{filename}

CREATE POLICY "case_docs_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'case-documents'
  AND public.is_active_user()
  AND public.can_read_case(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "case_docs_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'case-documents'
  AND public.is_active_user()
  AND public.effective_case_access(((storage.foldername(name))[1])::uuid) = 'full'
);

CREATE POLICY "case_docs_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'case-documents'
  AND public.is_active_user()
  AND public."current_role"() = ANY (ARRAY['super_admin'::public.user_role, 'admin'::public.user_role])
);