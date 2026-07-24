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
  .validator((input?: { caseId?: string | null }) => input ?? {})
  .handler(async ({ data, context }): Promise<TaskRow[]> => {
    const { supabase } = context;

    let query = supabase
      .from("tasks")
      .select(
        "id, title, description, status, priority, start_date, due_date, case_id, assignee_id, sort_order, created_at",
      );

    if (data?.caseId) {
      query = query.eq("case_id", data.caseId);
    }

    const { data: tasks, error } = await query
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
  .validator((input: { tasks: TaskOrderInput[] }) => {
    if (!input?.tasks?.length) throw new Error("No tasks to update.");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase } = context;
    const nowIso = new Date().toISOString();

    const results = await Promise.all(
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
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);

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

const ROLES_CAN_ASSIGN_OTHERS = ["super_admin", "admin", "senior_lawyer"] as const;

const TASK_ASSIGNEE_ROLES = [
  "super_admin",
  "admin",
  "senior_lawyer",
  "junior_lawyer",
  "support",
] as const;

function roleCanAssignOthers(role: string) {
  return (ROLES_CAN_ASSIGN_OTHERS as readonly string[]).includes(role);
}

/**
 * Options for the New Task sheet. Only super_admin/admin may assign to others,
 * so non-privileged roles receive only their own profile as an assignee option.
 */
export const getTaskFormOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TaskFormOptions> => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const { data: me, error: meErr } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, role, is_active")
      .eq("id", userId)
      .single();
    if (meErr) throw new Error(meErr.message);
    if (!me?.is_active) throw new Error("Your account is inactive.");

    const canAssignOthers = roleCanAssignOthers(me.role as string);

    let assignees: TaskAssigneeOption[];
    if (canAssignOthers) {
      const { data: people, error } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, role")
        .eq("is_active", true)
        .in("role", [...TASK_ASSIGNEE_ROLES])
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
  .validator((input: CreateTaskInput) => {
    if (!input?.title?.trim()) throw new Error("A task title is required.");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const { data: me, error: meErr } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, role, is_active")
      .eq("id", userId)
      .single();
    if (meErr) throw new Error(meErr.message);
    if (!me?.is_active) throw new Error("Your account is inactive.");

    const canAssignOthers = roleCanAssignOthers(me.role as string);

    const requestedAssignee = data.assignee_id?.trim() || null;
    if (!requestedAssignee && canAssignOthers) {
      throw new Error("Choose who this task is assigned to.");
    }

    let assigneeId = requestedAssignee ?? userId;
    if (assigneeId !== userId && !canAssignOthers) {
      throw new Error("You can only create tasks assigned to yourself.");
    }

    const { data: assignee, error: assigneeErr } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, role, is_active")
      .eq("id", assigneeId)
      .maybeSingle();
    if (assigneeErr) throw new Error(assigneeErr.message);
    if (!assignee?.is_active) {
      throw new Error("That assignee is inactive or does not exist.");
    }
    if (
      !(TASK_ASSIGNEE_ROLES as readonly string[]).includes(assignee.role as string)
    ) {
      throw new Error("Tasks can only be assigned to firm staff.");
    }

    const caseId = data.case_id?.trim() || null;
    if (caseId && me.role === "senior_lawyer") {
      const { data: access, error: accessErr } = await supabase.rpc(
        "effective_case_access",
        { _case_id: caseId },
      );
      if (accessErr) throw new Error(accessErr.message);
      if (access !== "full") {
        throw new Error("You can only assign case tasks on matters you fully access.");
      }
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("tasks")
      .insert({
        title: data.title.trim(),
        description: data.description?.trim() || null,
        case_id: caseId,
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
      const { error: tagErr } = await supabaseAdmin.from("task_tags").insert(
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
      await supabaseAdmin.from("notifications").insert({
        user_id: assigneeId,
        type: "task_assigned",
        title: "New task assigned",
        body: `${(me.full_name as string) || "A colleague"} assigned you: ${data.title.trim()}`,
        link: "/tasks",
      });

      const { data: authUser } =
        await supabaseAdmin.auth.admin.getUserById(assigneeId);

      if (authUser?.user?.email) {
        supabase.functions.invoke("send-email", {
          body: {
            to: authUser.user.email,
            subject: `New Task Assigned: ${data.title.trim()}`,
            html: `<p>Hi ${assignee.full_name || "Team Member"},</p><p>${(me.full_name as string) || "A colleague"} has assigned you a new task: <strong>${data.title.trim()}</strong>.</p><p><a href="https://firmcanvas.app/tasks">View Task</a></p>`,
          },
        }).catch((err) => console.error("Failed to send task email:", err));
      }
    }

    return { id: taskId };
  });
