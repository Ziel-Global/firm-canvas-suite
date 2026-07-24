-- Allow clients to view shared files in storage without requiring can_download.
-- Download remains gated in the portal UI by document_shares.can_download.

DROP POLICY IF EXISTS "case_docs_select" ON storage.objects;
CREATE POLICY "case_docs_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'case-documents'
  AND public.is_active_user()
  AND (
    (
      public.current_role() <> 'client'
      AND public.can_read_case(((storage.foldername(name))[1])::uuid)
    )
    OR EXISTS (
      SELECT 1
      FROM public.documents d
      WHERE (
        d.file_path = name
        OR EXISTS (
          SELECT 1 FROM public.document_versions dv
          WHERE dv.document_id = d.id AND dv.file_path = name
        )
      )
      AND public.can_read_document(d.id)
      AND (
        public.current_role() <> 'client'
        OR EXISTS (
          SELECT 1 FROM public.document_shares ds
          WHERE ds.document_id = d.id
            AND ds.shared_with = auth.uid()
        )
      )
    )
  )
);
