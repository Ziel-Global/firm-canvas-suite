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
        "id, title, description, status, priority, start_date, due_date, case_id, assignee_id, sort_order, created_at",
      )
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    const rows = tasks ?? [];

    const caseIds = [...new Set(rows.map((t) => t.case_id).filter(Boolean))] as string[];
    const assigneeIds = [
      ...new Set(rows.map((t) => t.assignee_id).filter(Boolean)),
    ] as string[];

    const caseMap = new Map<
      string,
      { case_ref: string | null; title: string; case_type: string | null }
    >();
    if (caseIds.length) {
      const { data: cases } = await supabase
        .from("cases")
        .select("id, case_ref, title, case_type")
        .in("id", caseIds);
      for (const c of cases ?? []) {
        caseMap.set(c.id as string, {
          case_ref: (c.case_ref as string) ?? null,
          title: (c.title as string) ?? "",
          case_type: (c.case_type as string) ?? null,
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
        start_date: (t.start_date as string) ?? null,
        due_date: (t.due_date as string) ?? null,
        case_id: (t.case_id as string) ?? null,
        case_ref: c?.case_ref ?? null,
        case_title: c?.title ?? null,
        case_type: c?.case_type ?? null,
        assignee_id: (t.assignee_id as string) ?? null,
        assignee_name: t.assignee_id ? peopleMap.get(t.assignee_id) ?? null : null,
        sort_order: (t.sort_order as number) ?? null,

      };
    });
  });

export interface TaskOrderInput {
  id: string;
  status: TaskStatus;
  sort_order: number;
}

/**
 * Persist drag-and-drop board changes: each moved/reordered task gets its new
 * status and sort_order. Tasks moved into "done" get completed_at stamped;
 * tasks moved out of "done" have it cleared. RLS scopes writes per role.
 */
export const reorderTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tasks: TaskOrderInput[] }) => {
    if (!input?.tasks?.length) throw new Error("No tasks to update.");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase } = context;
    const nowIso = new Date().toISOString();

    await Promise.all(
      data.tasks.map((t) =>
        supabase
          .from("tasks")
          .update({
            status: t.status,
            sort_order: t.sort_order,
            completed_at: t.status === "done" ? nowIso : null,
          })
          .eq("id", t.id),
      ),
    );

    return { ok: true };
  });

export interface TaskCaseOption {
  id: string;
  case_ref: string | null;
  title: string;
}

export interface TaskAssigneeOption {
  id: string;
  full_name: string;
  role: string;
}

export interface TaskFormOptions {
  canAssignOthers: boolean;
  cases: TaskCaseOption[];
  assignees: TaskAssigneeOption[];
}

const ROLES_CAN_ASSIGN = ["super_admin", "admin"];

/**
 * Options for the New Task sheet. Only super_admin/admin may assign to others,
 * so non-privileged roles receive only their own profile as an assignee option.
 */
export const getTaskFormOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TaskFormOptions> => {
    const { supabase, userId } = context;

    const { data: me, error: meErr } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", userId)
      .single();
    if (meErr) throw new Error(meErr.message);

    const canAssignOthers = ROLES_CAN_ASSIGN.includes(me.role as string);

    let assignees: TaskAssigneeOption[];
    if (canAssignOthers) {
      const { data: people, error } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("is_active", true)
        .neq("role", "client")
        .order("full_name", { ascending: true });
      if (error) throw new Error(error.message);
      assignees = (people ?? []).map((p) => ({
        id: p.id as string,
        full_name: (p.full_name as string) ?? "",
        role: p.role as string,
      }));
    } else {
      assignees = [
        {
          id: me.id as string,
          full_name: (me.full_name as string) ?? "",
          role: me.role as string,
        },
      ];
    }

    const { data: cases, error: caseErr } = await supabase
      .from("cases")
      .select("id, case_ref, title")
      .order("created_at", { ascending: false });
    if (caseErr) throw new Error(caseErr.message);

    return {
      canAssignOthers,
      cases: (cases ?? []).map((c) => ({
        id: c.id as string,
        case_ref: (c.case_ref as string) ?? null,
        title: (c.title as string) ?? "",
      })),
      assignees,
    };
  });

export interface CreateTaskTagInput {
  label: string;
  color: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  case_id?: string | null;
  assignee_id?: string | null;
  priority?: "low" | "medium" | "high" | null;
  start_date?: string | null;
  due_date?: string | null;
  tags?: CreateTaskTagInput[];
}

/**
 * Create a task. Enforces assignment rules: only super_admin/admin may assign
 * to other users; everyone else can only create tasks assigned to themselves.
 * Notifies the assignee and relies on the task trigger to write activity_log.
 */
export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CreateTaskInput) => {
    if (!input?.title?.trim()) throw new Error("A task title is required.");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase, userId } = context;

    const { data: me, error: meErr } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", userId)
      .single();
    if (meErr) throw new Error(meErr.message);

    const canAssignOthers = ROLES_CAN_ASSIGN.includes(me.role as string);

    let assigneeId = data.assignee_id?.trim() || userId;
    if (assigneeId !== userId && !canAssignOthers) {
      throw new Error("You can only create tasks assigned to yourself.");
    }

    const { data: inserted, error } = await supabase
      .from("tasks")
      .insert({
        title: data.title.trim(),
        description: data.description?.trim() || null,
        case_id: data.case_id?.trim() || null,
        assignee_id: assigneeId,
        priority: data.priority ?? null,
        start_date: data.start_date || null,
        due_date: data.due_date || null,
        status: "todo",
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const taskId = inserted.id as string;

    const tags = (data.tags ?? []).filter((t) => t.label.trim());
    if (tags.length) {
      const { error: tagErr } = await supabase.from("task_tags").insert(
        tags.map((t) => ({
          task_id: taskId,
          label: t.label.trim(),
          color: t.color,
        })),
      );
      if (tagErr) throw new Error(tagErr.message);
    }

    // Notify the assignee (skip self-assignment to avoid noise).
    if (assigneeId !== userId) {
      await supabase.from("notifications").insert({
        user_id: assigneeId,
        type: "task_assigned",
        title: "New task assigned",
        body: `${(me.full_name as string) || "A colleague"} assigned you: ${data.title.trim()}`,
        link: "/tasks",
      });
    }

    return { id: taskId };
  });
