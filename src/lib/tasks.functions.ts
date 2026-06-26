import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TaskStatus = "todo" | "in_progress" | "in_review" | "done";

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: string | null;
  start_date: string | null;
  due_date: string | null;
  case_id: string | null;
  case_ref: string | null;
  case_title: string | null;
  case_type: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  sort_order: number | null;

}

/**
 * List tasks visible to the current user, enriched with case and assignee
 * labels for the board. RLS on `tasks` scopes visibility per role.
 */
export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TaskRow[]> => {
    const { supabase } = context;

    const { data: tasks, error } = await supabase
      .from("tasks")
      .select(
        "id, title, description, status, priority, due_date, case_id, assignee_id, sort_order, created_at",
      )
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const rows = tasks ?? [];

    const caseIds = [...new Set(rows.map((t) => t.case_id).filter(Boolean))] as string[];
    const assigneeIds = [
      ...new Set(rows.map((t) => t.assignee_id).filter(Boolean)),
    ] as string[];

    const caseMap = new Map<string, { case_ref: string | null; title: string }>();
    if (caseIds.length) {
      const { data: cases } = await supabase
        .from("cases")
        .select("id, case_ref, title")
        .in("id", caseIds);
      for (const c of cases ?? []) {
        caseMap.set(c.id as string, {
          case_ref: (c.case_ref as string) ?? null,
          title: (c.title as string) ?? "",
        });
      }
    }

    const peopleMap = new Map<string, string>();
    if (assigneeIds.length) {
      const { data: people } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", assigneeIds);
      for (const p of people ?? []) {
        peopleMap.set(p.id as string, (p.full_name as string) ?? "");
      }
    }

    return rows.map((t) => {
      const c = t.case_id ? caseMap.get(t.case_id) : undefined;
      return {
        id: t.id as string,
        title: t.title as string,
        description: (t.description as string) ?? null,
        status: (t.status as TaskStatus) ?? "todo",
        priority: (t.priority as string) ?? null,
        due_date: (t.due_date as string) ?? null,
        case_id: (t.case_id as string) ?? null,
        case_ref: c?.case_ref ?? null,
        case_title: c?.title ?? null,
        assignee_id: (t.assignee_id as string) ?? null,
        assignee_name: t.assignee_id ? peopleMap.get(t.assignee_id) ?? null : null,
        sort_order: (t.sort_order as number) ?? null,
      };
    });
  });
