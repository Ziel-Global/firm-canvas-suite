-- 16.2 Extension: task-pace risk detection + responsible member in alerts
-- Extends escalate_overdue_stages to also flag cases where task progress
-- is slipping against workflow deadlines, and includes responsible member name.

CREATE OR REPLACE FUNCTION public.escalate_overdue_stages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  case_row record;
  admin_row record;
BEGIN
  FOR case_row IN
    WITH
    -- Stage-based overdue: stage deadline already passed
    worst_stage_overdue AS (
      SELECT DISTINCT ON (c.id)
        c.id AS case_id,
        cs.name AS stage_name,
        cs.deadline AS at_risk_date,
        (CURRENT_DATE - cs.deadline) AS days_overdue,
        COALESCE(p.full_name, 'Unassigned') AS responsible_member,
        'stage_overdue' AS risk_source
      FROM public.cases c
      JOIN public.case_stages cs ON cs.case_id = c.id
      LEFT JOIN public.profiles p ON p.id = cs.assignee_id
      WHERE c.status <> 'closed'
        AND cs.status = 'active'
        AND cs.deadline IS NOT NULL
        AND cs.deadline < CURRENT_DATE
      ORDER BY c.id, (CURRENT_DATE - cs.deadline) DESC, cs.sequence_order ASC
    ),

    -- Task-pace risk: open tasks whose due_date is within 3 days OR already past
    worst_task_risk AS (
      SELECT DISTINCT ON (t.case_id)
        t.case_id,
        t.title AS stage_name,
        t.due_date AS at_risk_date,
        GREATEST(0, (CURRENT_DATE - t.due_date)) AS days_overdue,
        COALESCE(p.full_name, 'Unassigned') AS responsible_member,
        'task_pace' AS risk_source
      FROM public.tasks t
      LEFT JOIN public.profiles p ON p.id = t.assignee_id
      WHERE t.status NOT IN ('done')
        AND t.due_date IS NOT NULL
        AND t.due_date <= (CURRENT_DATE + INTERVAL '3 days')
      ORDER BY t.case_id, t.due_date ASC
    ),

    -- Combine: prefer stage overdue if both exist
    combined_risk AS (
      SELECT
        COALESCE(so.case_id, tr.case_id) AS case_id,
        COALESCE(so.stage_name, tr.stage_name) AS stage_name,
        COALESCE(so.at_risk_date, tr.at_risk_date) AS at_risk_date,
        COALESCE(so.days_overdue, tr.days_overdue) AS days_overdue,
        COALESCE(so.responsible_member, tr.responsible_member) AS responsible_member,
        COALESCE(so.risk_source, tr.risk_source) AS risk_source
      FROM worst_stage_overdue so
      FULL OUTER JOIN worst_task_risk tr ON tr.case_id = so.case_id
    ),

    -- Final: compute the new health for each active case
    final AS (
      SELECT
        c.id,
        c.case_ref,
        c.title,
        c.health AS old_health,
        cr.stage_name,
        cr.at_risk_date,
        cr.days_overdue,
        cr.responsible_member,
        cr.risk_source,
        CASE
          WHEN cr.case_id IS NULL      THEN 'on_track'::public.health_status
          WHEN cr.days_overdue >= 3    THEN 'overdue'::public.health_status
          WHEN cr.at_risk_date <= CURRENT_DATE + INTERVAL '3 days'
                                       THEN 'at_risk'::public.health_status
          ELSE 'on_track'::public.health_status
        END AS new_health
      FROM public.cases c
      LEFT JOIN combined_risk cr ON cr.case_id = c.id
      WHERE c.status <> 'closed'
    )

    SELECT * FROM final

  LOOP
    IF case_row.old_health IS DISTINCT FROM case_row.new_health THEN
      -- Update health on the case
      UPDATE public.cases
      SET health = case_row.new_health
      WHERE id = case_row.id;

      -- Log the change to the activity log
      INSERT INTO public.activity_log (case_id, actor_id, action, detail)
      VALUES (
        case_row.id,
        NULL,
        'case_health_updated',
        jsonb_build_object(
          'old_health', case_row.old_health,
          'new_health', case_row.new_health,
          'stage_name', case_row.stage_name,
          'days_overdue', case_row.days_overdue,
          'at_risk_date', case_row.at_risk_date,
          'responsible_member', case_row.responsible_member,
          'risk_source', case_row.risk_source
        )
      );

      -- Alert super admins only when health worsens
      IF case_row.new_health IN ('at_risk', 'overdue') THEN
        FOR admin_row IN
          SELECT id
          FROM public.profiles
          WHERE role = 'super_admin' AND is_active = true
        LOOP
          INSERT INTO public.notifications (user_id, type, title, body, link)
          VALUES (
            admin_row.id,
            'risk_alert',
            CASE
              WHEN case_row.new_health = 'overdue'
                THEN format('Overdue: %s', COALESCE(case_row.case_ref, case_row.title))
              ELSE format('At risk: %s', COALESCE(case_row.case_ref, case_row.title))
            END,
            format(
              '%s "%s" %s (due %s). Stage: %s. Responsible: %s.',
              CASE WHEN case_row.risk_source = 'task_pace' THEN 'Task' ELSE 'Stage' END,
              COALESCE(case_row.stage_name, 'Unknown'),
              CASE
                WHEN case_row.days_overdue > 0
                  THEN format('is %s day%s overdue', case_row.days_overdue,
                       CASE WHEN case_row.days_overdue = 1 THEN '' ELSE 's' END)
                ELSE 'is due soon'
              END,
              TO_CHAR(case_row.at_risk_date, 'DD Mon YYYY'),
              COALESCE(case_row.stage_name, 'None'),
              COALESCE(case_row.responsible_member, 'Unassigned')
            ),
            format('/cases/%s', case_row.id)
          );
        END LOOP;
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- Ensure the hourly cron job exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'escalate-overdue-stages-hourly'
  ) THEN
    PERFORM cron.schedule(
      'escalate-overdue-stages-hourly',
      '0 * * * *',
      $cron$SELECT public.escalate_overdue_stages();$cron$
    );
  END IF;
END $$;
