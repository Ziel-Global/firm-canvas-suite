-- ============================================================
-- Document Templates
-- ============================================================

CREATE TABLE public.document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  body TEXT NOT NULL,
  fields_schema JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.document_templates TO authenticated;
GRANT ALL ON public.document_templates TO service_role;
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view document templates" 
ON public.document_templates FOR SELECT 
TO authenticated 
USING (public.is_active_staff(auth.uid()));

CREATE POLICY "Admins can manage document templates" 
ON public.document_templates FOR ALL
TO authenticated 
USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_doc_template_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER tr_document_templates_updated_at
BEFORE UPDATE ON public.document_templates
FOR EACH ROW
EXECUTE FUNCTION update_doc_template_updated_at();

-- Seed templates
INSERT INTO public.document_templates (name, doc_type, body, fields_schema) VALUES 
(
  'Client Engagement and Retainer Letter', 
  'Word', 
  'Dear {{client_name}},\n\nThis letter sets out the terms of our engagement for {{matter_description}}...\n\nSincerely,\n{{lawyer_name}}',
  '[{"name": "client_name", "label": "Client Name", "type": "text"}, {"name": "matter_description", "label": "Matter Description", "type": "text"}, {"name": "lawyer_name", "label": "Lawyer Name", "type": "text"}]'::jsonb
),
(
  'Demand Notice and Legal Correspondence', 
  'Word', 
  'DEMAND NOTICE\n\nTo: {{recipient_name}}\n\nWe act on behalf of {{client_name}}. Take notice that...\n\nFailure to comply within {{days}} days will result in legal action.',
  '[{"name": "recipient_name", "label": "Recipient Name", "type": "text"}, {"name": "client_name", "label": "Client Name", "type": "text"}, {"name": "days", "label": "Days to Comply", "type": "number"}]'::jsonb
),
(
  'Court Application Covering Letter', 
  'PDF', 
  'The Registrar,\n{{court_name}}\n\nRe: Application in {{case_title}}\n\nPlease find enclosed the application for {{application_type}}...\n\nRegards,\n{{firm_name}}',
  '[{"name": "court_name", "label": "Court Name", "type": "text"}, {"name": "case_title", "label": "Case Title", "type": "text"}, {"name": "application_type", "label": "Application Type", "type": "text"}, {"name": "firm_name", "label": "Firm Name", "type": "text"}]'::jsonb
),
(
  'Internal Case Memo / Status Update', 
  'Word', 
  'MEMO\nDate: {{date}}\nTo: Case File\nFrom: {{author_name}}\n\nSubject: Status Update for {{case_title}}\n\nSummary:\n{{summary}}',
  '[{"name": "date", "label": "Date", "type": "date"}, {"name": "author_name", "label": "Author", "type": "text"}, {"name": "case_title", "label": "Case Title", "type": "text"}, {"name": "summary", "label": "Summary", "type": "textarea"}]'::jsonb
),
(
  'Case Closure Summary', 
  'PDF', 
  'CASE CLOSURE REPORT\n\nCase: {{case_title}}\nClient: {{client_name}}\n\nOutcome: {{outcome}}\n\nNext Steps / Archiving Rules: {{archiving_rules}}',
  '[{"name": "case_title", "label": "Case Title", "type": "text"}, {"name": "client_name", "label": "Client Name", "type": "text"}, {"name": "outcome", "label": "Outcome", "type": "text"}, {"name": "archiving_rules", "label": "Archiving Rules", "type": "text"}]'::jsonb
);
