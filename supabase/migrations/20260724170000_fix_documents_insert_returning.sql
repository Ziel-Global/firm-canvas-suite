-- Fix staff document uploads after client-portal documents_select change.
-- INSERT ... RETURNING must pass SELECT. can_read_document can deny the new
-- row (folder role matrix / visibility) even when INSERT WITH CHECK passed.
-- Allow non-client uploaders to SELECT their own rows; keep client share path.

DROP POLICY IF EXISTS "documents_select" ON public.documents;
CREATE POLICY "documents_select" ON public.documents FOR SELECT TO authenticated
USING (
  public.is_active_user() AND (
    public.can_read_document(id)
    OR (
      public.current_role() <> 'client'
      AND uploaded_by IS NOT NULL
      AND uploaded_by = auth.uid()
    )
  )
);
