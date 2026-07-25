-- One linked task per workflow stage (shown on the assignee's Tasks board).
-- stage_id was already on public.tasks but unused.

CREATE UNIQUE INDEX IF NOT EXISTS tasks_stage_id_unique
  ON public.tasks (stage_id)
  WHERE stage_id IS NOT NULL;

-- Backfill: existing stage assignees get a matching task.
INSERT INTO public.tasks (
  title,
  description,
  case_id,
  assignee_id,
  status,
  priority,
  due_date,
  stage_id,
  created_by,
  completed_at
)
SELECT
  'Stage: ' || COALESCE(NULLIF(trim(cs.name), ''), 'Untitled'),
  'Workflow stage on this matter. Complete it from the case Stages tab.',
  cs.case_id,
  cs.assignee_id,
  CASE
    WHEN cs.status = 'complete' THEN 'done'::public.task_status
    WHEN cs.status = 'active' THEN 'in_progress'::public.task_status
    ELSE 'todo'::public.task_status
  END,
  'medium'::public.priority,
  cs.deadline,
  cs.id,
  cs.assignee_id,
  CASE
    WHEN cs.status = 'complete' THEN COALESCE(cs.completed_at, now())
    ELSE NULL
  END
FROM public.case_stages cs
WHERE cs.assignee_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.tasks t WHERE t.stage_id = cs.id
  );
