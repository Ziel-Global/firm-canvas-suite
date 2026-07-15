-- Seed starter workflow templates with sensible default stages.

INSERT INTO public.workflow_templates (name, case_type, description, is_active)
SELECT
  'Property Matter',
  'property',
  'Residential and commercial property matters from intake through filing or dispatch.',
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.workflow_templates
  WHERE name = 'Property Matter'
    AND case_type = 'property'
);

WITH template AS (
  SELECT id
  FROM public.workflow_templates
  WHERE name = 'Property Matter'
    AND case_type = 'property'
  LIMIT 1
)
INSERT INTO public.workflow_template_stages (template_id, name, sequence_order, responsible_role, expected_output, deadline_days)
SELECT template.id, 'Client Intake', 1, 'support'::public.user_role, 'Client instructions and matter details captured', 1
FROM template
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_template_stages
  WHERE template_id = template.id AND name = 'Client Intake' AND sequence_order = 1
);

WITH template AS (
  SELECT id
  FROM public.workflow_templates
  WHERE name = 'Property Matter'
    AND case_type = 'property'
  LIMIT 1
)
INSERT INTO public.workflow_template_stages (template_id, name, sequence_order, responsible_role, expected_output, deadline_days)
SELECT template.id, 'Research', 2, 'junior_lawyer'::public.user_role, 'Title, registry, and issue research completed', 2
FROM template
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_template_stages
  WHERE template_id = template.id AND name = 'Research' AND sequence_order = 2
);

WITH template AS (
  SELECT id
  FROM public.workflow_templates
  WHERE name = 'Property Matter'
    AND case_type = 'property'
  LIMIT 1
)
INSERT INTO public.workflow_template_stages (template_id, name, sequence_order, responsible_role, expected_output, deadline_days)
SELECT template.id, 'Drafting', 3, 'junior_lawyer'::public.user_role, 'Draft transfer, contract, or correspondence prepared', 3
FROM template
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_template_stages
  WHERE template_id = template.id AND name = 'Drafting' AND sequence_order = 3
);

WITH template AS (
  SELECT id
  FROM public.workflow_templates
  WHERE name = 'Property Matter'
    AND case_type = 'property'
  LIMIT 1
)
INSERT INTO public.workflow_template_stages (template_id, name, sequence_order, responsible_role, expected_output, deadline_days)
SELECT template.id, 'Internal Review', 4, 'senior_lawyer'::public.user_role, 'Reviewed draft with legal and commercial issues resolved', 1
FROM template
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_template_stages
  WHERE template_id = template.id AND name = 'Internal Review' AND sequence_order = 4
);

WITH template AS (
  SELECT id
  FROM public.workflow_templates
  WHERE name = 'Property Matter'
    AND case_type = 'property'
  LIMIT 1
)
INSERT INTO public.workflow_template_stages (template_id, name, sequence_order, responsible_role, expected_output, deadline_days)
SELECT template.id, 'Principal Approval', 5, 'super_admin'::public.user_role, 'Principal sign-off recorded for the matter', 1
FROM template
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_template_stages
  WHERE template_id = template.id AND name = 'Principal Approval' AND sequence_order = 5
);

WITH template AS (
  SELECT id
  FROM public.workflow_templates
  WHERE name = 'Property Matter'
    AND case_type = 'property'
  LIMIT 1
)
INSERT INTO public.workflow_template_stages (template_id, name, sequence_order, responsible_role, expected_output, deadline_days)
SELECT template.id, 'Filing or Dispatch', 6, 'support'::public.user_role, 'Documents filed, sent, or dispatched to the counterparty', 2
FROM template
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_template_stages
  WHERE template_id = template.id AND name = 'Filing or Dispatch' AND sequence_order = 6
);

INSERT INTO public.workflow_templates (name, case_type, description, is_active)
SELECT
  'Litigation',
  'litigation',
  'Litigation matters from intake and research through drafting, approval, and filing or service.',
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.workflow_templates
  WHERE name = 'Litigation'
    AND case_type = 'litigation'
);

WITH template AS (
  SELECT id
  FROM public.workflow_templates
  WHERE name = 'Litigation'
    AND case_type = 'litigation'
  LIMIT 1
)
INSERT INTO public.workflow_template_stages (template_id, name, sequence_order, responsible_role, expected_output, deadline_days)
SELECT template.id, 'Client Intake', 1, 'support'::public.user_role, 'Brief intake, filing deadlines, and key facts captured', 1
FROM template
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_template_stages
  WHERE template_id = template.id AND name = 'Client Intake' AND sequence_order = 1
);

WITH template AS (
  SELECT id
  FROM public.workflow_templates
  WHERE name = 'Litigation'
    AND case_type = 'litigation'
  LIMIT 1
)
INSERT INTO public.workflow_template_stages (template_id, name, sequence_order, responsible_role, expected_output, deadline_days)
SELECT template.id, 'Research', 2, 'junior_lawyer'::public.user_role, 'Authorities, chronology, and procedural issues researched', 4
FROM template
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_template_stages
  WHERE template_id = template.id AND name = 'Research' AND sequence_order = 2
);

WITH template AS (
  SELECT id
  FROM public.workflow_templates
  WHERE name = 'Litigation'
    AND case_type = 'litigation'
  LIMIT 1
)
INSERT INTO public.workflow_template_stages (template_id, name, sequence_order, responsible_role, expected_output, deadline_days)
SELECT template.id, 'Drafting', 3, 'junior_lawyer'::public.user_role, 'Pleadings, correspondence, or submissions drafted', 5
FROM template
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_template_stages
  WHERE template_id = template.id AND name = 'Drafting' AND sequence_order = 3
);

WITH template AS (
  SELECT id
  FROM public.workflow_templates
  WHERE name = 'Litigation'
    AND case_type = 'litigation'
  LIMIT 1
)
INSERT INTO public.workflow_template_stages (template_id, name, sequence_order, responsible_role, expected_output, deadline_days)
SELECT template.id, 'Internal Review', 4, 'senior_lawyer'::public.user_role, 'Draft reviewed for strategy, pleading, and evidence risks', 2
FROM template
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_template_stages
  WHERE template_id = template.id AND name = 'Internal Review' AND sequence_order = 4
);

WITH template AS (
  SELECT id
  FROM public.workflow_templates
  WHERE name = 'Litigation'
    AND case_type = 'litigation'
  LIMIT 1
)
INSERT INTO public.workflow_template_stages (template_id, name, sequence_order, responsible_role, expected_output, deadline_days)
SELECT template.id, 'Principal Approval', 5, 'super_admin'::public.user_role, 'Approval to file, settle, or take next step recorded', 1
FROM template
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_template_stages
  WHERE template_id = template.id AND name = 'Principal Approval' AND sequence_order = 5
);

WITH template AS (
  SELECT id
  FROM public.workflow_templates
  WHERE name = 'Litigation'
    AND case_type = 'litigation'
  LIMIT 1
)
INSERT INTO public.workflow_template_stages (template_id, name, sequence_order, responsible_role, expected_output, deadline_days)
SELECT template.id, 'Filing or Dispatch', 6, 'support'::public.user_role, 'Filed or served materials dispatched on time', 1
FROM template
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_template_stages
  WHERE template_id = template.id AND name = 'Filing or Dispatch' AND sequence_order = 6
);

INSERT INTO public.workflow_templates (name, case_type, description, is_active)
SELECT
  'Corporate Filing',
  'corporate',
  'Corporate secretarial and filing work from intake through drafting, approval, and lodgement.',
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.workflow_templates
  WHERE name = 'Corporate Filing'
    AND case_type = 'corporate'
);

WITH template AS (
  SELECT id
  FROM public.workflow_templates
  WHERE name = 'Corporate Filing'
    AND case_type = 'corporate'
  LIMIT 1
)
INSERT INTO public.workflow_template_stages (template_id, name, sequence_order, responsible_role, expected_output, deadline_days)
SELECT template.id, 'Client Intake', 1, 'support'::public.user_role, 'Entity details and filing instructions captured', 1
FROM template
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_template_stages
  WHERE template_id = template.id AND name = 'Client Intake' AND sequence_order = 1
);

WITH template AS (
  SELECT id
  FROM public.workflow_templates
  WHERE name = 'Corporate Filing'
    AND case_type = 'corporate'
  LIMIT 1
)
INSERT INTO public.workflow_template_stages (template_id, name, sequence_order, responsible_role, expected_output, deadline_days)
SELECT template.id, 'Research', 2, 'junior_lawyer'::public.user_role, 'Registry requirements and entity checks confirmed', 1
FROM template
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_template_stages
  WHERE template_id = template.id AND name = 'Research' AND sequence_order = 2
);

WITH template AS (
  SELECT id
  FROM public.workflow_templates
  WHERE name = 'Corporate Filing'
    AND case_type = 'corporate'
  LIMIT 1
)
INSERT INTO public.workflow_template_stages (template_id, name, sequence_order, responsible_role, expected_output, deadline_days)
SELECT template.id, 'Drafting', 3, 'junior_lawyer'::public.user_role, 'Corporate documents prepared for review', 2
FROM template
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_template_stages
  WHERE template_id = template.id AND name = 'Drafting' AND sequence_order = 3
);

WITH template AS (
  SELECT id
  FROM public.workflow_templates
  WHERE name = 'Corporate Filing'
    AND case_type = 'corporate'
  LIMIT 1
)
INSERT INTO public.workflow_template_stages (template_id, name, sequence_order, responsible_role, expected_output, deadline_days)
SELECT template.id, 'Internal Review', 4, 'senior_lawyer'::public.user_role, 'Corporate documents reviewed for accuracy and completeness', 1
FROM template
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_template_stages
  WHERE template_id = template.id AND name = 'Internal Review' AND sequence_order = 4
);

WITH template AS (
  SELECT id
  FROM public.workflow_templates
  WHERE name = 'Corporate Filing'
    AND case_type = 'corporate'
  LIMIT 1
)
INSERT INTO public.workflow_template_stages (template_id, name, sequence_order, responsible_role, expected_output, deadline_days)
SELECT template.id, 'Principal Approval', 5, 'super_admin'::public.user_role, 'Principal sign-off completed before filing', 1
FROM template
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_template_stages
  WHERE template_id = template.id AND name = 'Principal Approval' AND sequence_order = 5
);

WITH template AS (
  SELECT id
  FROM public.workflow_templates
  WHERE name = 'Corporate Filing'
    AND case_type = 'corporate'
  LIMIT 1
)
INSERT INTO public.workflow_template_stages (template_id, name, sequence_order, responsible_role, expected_output, deadline_days)
SELECT template.id, 'Filing or Dispatch', 6, 'support'::public.user_role, 'Lodgement completed and confirmation dispatched', 1
FROM template
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_template_stages
  WHERE template_id = template.id AND name = 'Filing or Dispatch' AND sequence_order = 6
);

INSERT INTO public.workflow_templates (name, case_type, description, is_active)
SELECT
  'Criminal Defence',
  'criminal_defence',
  'Criminal defence matters from intake and disclosure review through drafting, approval, and dispatch.',
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.workflow_templates
  WHERE name = 'Criminal Defence'
    AND case_type = 'criminal_defence'
);

WITH template AS (
  SELECT id
  FROM public.workflow_templates
  WHERE name = 'Criminal Defence'
    AND case_type = 'criminal_defence'
  LIMIT 1
)
INSERT INTO public.workflow_template_stages (template_id, name, sequence_order, responsible_role, expected_output, deadline_days)
SELECT template.id, 'Client Intake', 1, 'support'::public.user_role, 'Client instructions, custody status, and urgent dates captured', 1
FROM template
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_template_stages
  WHERE template_id = template.id AND name = 'Client Intake' AND sequence_order = 1
);

WITH template AS (
  SELECT id
  FROM public.workflow_templates
  WHERE name = 'Criminal Defence'
    AND case_type = 'criminal_defence'
  LIMIT 1
)
INSERT INTO public.workflow_template_stages (template_id, name, sequence_order, responsible_role, expected_output, deadline_days)
SELECT template.id, 'Research', 2, 'junior_lawyer'::public.user_role, 'Disclosure, precedents, and procedural deadlines reviewed', 2
FROM template
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_template_stages
  WHERE template_id = template.id AND name = 'Research' AND sequence_order = 2
);

WITH template AS (
  SELECT id
  FROM public.workflow_templates
  WHERE name = 'Criminal Defence'
    AND case_type = 'criminal_defence'
  LIMIT 1
)
INSERT INTO public.workflow_template_stages (template_id, name, sequence_order, responsible_role, expected_output, deadline_days)
SELECT template.id, 'Drafting', 3, 'junior_lawyer'::public.user_role, 'Submissions, advice, or correspondence drafted', 3
FROM template
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_template_stages
  WHERE template_id = template.id AND name = 'Drafting' AND sequence_order = 3
);

WITH template AS (
  SELECT id
  FROM public.workflow_templates
  WHERE name = 'Criminal Defence'
    AND case_type = 'criminal_defence'
  LIMIT 1
)
INSERT INTO public.workflow_template_stages (template_id, name, sequence_order, responsible_role, expected_output, deadline_days)
SELECT template.id, 'Internal Review', 4, 'senior_lawyer'::public.user_role, 'Draft reviewed for strategic and evidentiary issues', 1
FROM template
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_template_stages
  WHERE template_id = template.id AND name = 'Internal Review' AND sequence_order = 4
);

WITH template AS (
  SELECT id
  FROM public.workflow_templates
  WHERE name = 'Criminal Defence'
    AND case_type = 'criminal_defence'
  LIMIT 1
)
INSERT INTO public.workflow_template_stages (template_id, name, sequence_order, responsible_role, expected_output, deadline_days)
SELECT template.id, 'Principal Approval', 5, 'super_admin'::public.user_role, 'Principal sign-off for strategy or plea position recorded', 1
FROM template
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_template_stages
  WHERE template_id = template.id AND name = 'Principal Approval' AND sequence_order = 5
);

WITH template AS (
  SELECT id
  FROM public.workflow_templates
  WHERE name = 'Criminal Defence'
    AND case_type = 'criminal_defence'
  LIMIT 1
)
INSERT INTO public.workflow_template_stages (template_id, name, sequence_order, responsible_role, expected_output, deadline_days)
SELECT template.id, 'Filing or Dispatch', 6, 'support'::public.user_role, 'Court filing, service, or correspondence dispatched', 1
FROM template
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_template_stages
  WHERE template_id = template.id AND name = 'Filing or Dispatch' AND sequence_order = 6
);
