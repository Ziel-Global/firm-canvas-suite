-- Fix client portal shared documents.
-- Live documents_select required case + folder access, which blocks clients
-- even when a document_shares row exists. Route SELECT through can_read_document
-- so explicit portal shares are visible.

DROP POLICY IF EXISTS "documents_select" ON public.documents;
CREATE POLICY "documents_select" ON public.documents FOR SELECT TO authenticated
USING (public.is_active_user() AND public.can_read_document(id));
