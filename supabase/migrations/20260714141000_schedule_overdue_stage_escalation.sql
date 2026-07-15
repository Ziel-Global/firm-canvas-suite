CREATE EXTENSION IF NOT EXISTS pg_cron;

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
    WITH worst_overdue AS (
      SELECT DISTINCT ON (c.id)
        c.id AS case_id,
        c.case_ref,
        c.title,
        c.health AS old_health,
        cs.name AS stage_name,
        (CURRENT_DATE - cs.deadline) AS days_overdue
      FROM public.cases c
      JOIN public.case_stages cs ON cs.case_id = c.id
      WHERE c.status <> 'closed'
        AND cs.status = 'active'
        AND cs.deadline IS NOT NULL
        AND cs.deadline < CURRENT_DATE
      ORDER BY c.id, (CURRENT_DATE - cs.deadline) DESC, cs.sequence_order ASC
    )
    SELECT
      c.id,
      c.case_ref,
      c.title,
      c.health AS old_health,
      wo.stage_name,
      wo.days_overdue,
      CASE
        WHEN wo.case_id IS NULL THEN 'on_track'::public.health_status
        WHEN wo.days_overdue >= 3 THEN 'overdue'::public.health_status
        ELSE 'at_risk'::public.health_status
      END AS new_health
    FROM public.cases c
    LEFT JOIN worst_overdue wo ON wo.case_id = c.id
    WHERE c.status <> 'closed'
  LOOP
    IF case_row.old_health IS DISTINCT FROM case_row.new_health THEN
      UPDATE public.cases
      SET health = case_row.new_health
      WHERE id = case_row.id;

      INSERT INTO public.activity_log (case_id, actor_id, action, detail)
      VALUES (
        case_row.id,
        NULL,
        'case_health_updated',
        jsonb_build_object(
          'old_health', case_row.old_health,
          'new_health', case_row.new_health,
          'stage_name', case_row.stage_name,
          'days_overdue', case_row.days_overdue
        )
      );

      IF case_row.new_health IN ('at_risk', 'overdue') THEN
        FOR admin_row IN
          SELECT id
          FROM public.profiles
          WHERE role = 'super_admin' AND is_active = true
        LOOP
          INSERT INTO public.notifications (user_id, type, title, body, link)
          VALUES (
            admin_row.id,
            'stage_escalation',
            CASE
              WHEN case_row.new_health = 'overdue'
                THEN format('Overdue: %s', COALESCE(case_row.case_ref, case_row.title))
              ELSE format('At risk: %s', COALESCE(case_row.case_ref, case_row.title))
            END,
            format(
              'Stage "%s" is %s day%s past its deadline on %s.',
              COALESCE(case_row.stage_name, 'stage'),
              case_row.days_overdue,
              CASE WHEN case_row.days_overdue = 1 THEN '' ELSE 's' END,
              case_row.title
            ),
            format('/cases/%s', case_row.id)
          );
        END LOOP;
      END IF;
    END IF;
  END LOOP;
END;
$$;

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