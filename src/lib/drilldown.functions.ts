import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface MemberDrillDown {
  id: string;
  name: string;
  role: string;
  // Bandwidth
  open_tasks: number;
  overdue_tasks: number;
  active_cases: number;
  bandwidth: "available" | "moderate" | "high" | "overloaded";
  // Task list
  tasks: {
    id: string;
    title: string;
    status: string;
    priority: string | null;
    due_date: string | null;
    case_title: string | null;
    is_overdue: boolean;
  }[];
  // Assigned cases
  cases: {
    id: string;
    title: string;
    case_ref: string | null;
    health: string | null;
    active_stage: string | null;
  }[];
}

export interface CaseDrillDown {
  id: string;
  title: string;
  case_ref: string | null;
  case_type: string | null;
  health: string | null;
  status: string | null;
  // Stage
  active_stage: string | null;
  stage_deadline: string | null;
  responsible_member: string | null;
  // Activity (last 8 entries)
  activity: {
    action: string;
    created_at: string;
    actor_name: string | null;
  }[];
  // Upcoming deadlines
  deadlines: {
    label: string;
    due_date: string;
    type: "task" | "stage";
    is_overdue: boolean;
  }[];
}

// ─── Member drill-down ──────────────────────────────────────────────────────

export const getMemberDrillDown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { memberId: string }) => {
    if (!input?.memberId) throw new Error("Member ID required.");
    return input;
  })
  .handler(async ({ data, context }): Promise<MemberDrillDown> => {
    const { supabase } = context;
    const { memberId } = data;
    const todayStr = new Date().toISOString().slice(0, 10);

    const [profileRes, tasksRes, caseAssignmentsRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", memberId)
        .single(),

      supabase
        .from("tasks")
        .select("id, title, status, priority, due_date, case_id, cases(title)")
        .eq("assignee_id", memberId)
        .not("status", "eq", "done")
        .order("due_date", { ascending: true })
        .limit(20),

      supabase
        .from("case_stages")
        .select("case_id, cases(id, title, case_ref, health, case_stages(name, status))")
        .eq("assignee_id", memberId)
        .eq("status", "active"),
    ]);

    const profile = profileRes.data;
    if (!profile) throw new Error("Member not found.");

    const tasks = (tasksRes.data ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status ?? "todo",
      priority: t.priority,
      due_date: t.due_date,
      case_title: (t.cases as any)?.title ?? null,
      is_overdue: !!(t.due_date && t.due_date < todayStr),
    }));

    const seenCaseIds = new Set<string>();
    const cases: MemberDrillDown["cases"] = [];
    for (const s of caseAssignmentsRes.data ?? []) {
      const c = s.cases as any;
      if (!c || seenCaseIds.has(c.id)) continue;
      seenCaseIds.add(c.id);
      const activeStage = (c.case_stages as any[])?.find(
        (st: any) => st.status === "active",
      );
      cases.push({
        id: c.id,
        title: c.title,
        case_ref: c.case_ref,
        health: c.health,
        active_stage: activeStage?.name ?? null,
      });
    }

    // Bandwidth heuristic
    const overdue = tasks.filter((t) => t.is_overdue).length;
    const open = tasks.length;
    let bandwidth: MemberDrillDown["bandwidth"] = "available";
    if (overdue > 2) bandwidth = "overloaded";
    else if (overdue > 0 || open >= 6) bandwidth = "high";
    else if (open >= 3) bandwidth = "moderate";

    return {
      id: profile.id,
      name: profile.full_name ?? "Unknown",
      role: profile.role ?? "",
      open_tasks: open,
      overdue_tasks: overdue,
      active_cases: cases.length,
      bandwidth,
      tasks,
      cases,
    };
  });

// ─── Case drill-down ─────────────────────────────────────────────────────────

export const getCaseDrillDown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { caseId: string }) => {
    if (!input?.caseId) throw new Error("Case ID required.");
    return input;
  })
  .handler(async ({ data, context }): Promise<CaseDrillDown> => {
    const { supabase } = context;
    const { caseId } = data;
    const todayStr = new Date().toISOString().slice(0, 10);

    const [caseRes, activityRes, tasksRes, stagesRes] = await Promise.all([
      supabase
        .from("cases")
        .select("id, title, case_ref, case_type, health, status")
        .eq("id", caseId)
        .single(),

      supabase
        .from("activity_log")
        .select("action, created_at, actor_id, profiles(full_name)")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false })
        .limit(8),

      supabase
        .from("tasks")
        .select("id, title, due_date, status")
        .eq("case_id", caseId)
        .not("status", "eq", "done")
        .not("due_date", "is", null)
        .order("due_date", { ascending: true })
        .limit(5),

      supabase
        .from("case_stages")
        .select("name, status, deadline, assignee_id, profiles(full_name)")
        .eq("case_id", caseId)
        .eq("status", "active")
        .order("sequence_order", { ascending: true })
        .limit(1),
    ]);

    if (caseRes.error) throw new Error(caseRes.error.message);
    const c = caseRes.data!;

    const activeStage = stagesRes.data?.[0];

    const activity = (activityRes.data ?? []).map((a) => ({
      action: (a.action ?? "").replace(/_/g, " "),
      created_at: a.created_at,
      actor_name: (a.profiles as any)?.full_name ?? null,
    }));

    // Combine task + stage deadlines
    const deadlines: CaseDrillDown["deadlines"] = [];

    for (const t of tasksRes.data ?? []) {
      if (!t.due_date) continue;
      deadlines.push({
        label: t.title,
        due_date: t.due_date,
        type: "task",
        is_overdue: t.due_date < todayStr,
      });
    }
    if (activeStage?.deadline) {
      deadlines.push({
        label: `Stage: ${activeStage.name}`,
        due_date: activeStage.deadline,
        type: "stage",
        is_overdue: activeStage.deadline < todayStr,
      });
    }
    deadlines.sort((a, b) => a.due_date.localeCompare(b.due_date));

    return {
      id: c.id,
      title: c.title,
      case_ref: c.case_ref,
      case_type: c.case_type,
      health: c.health,
      status: c.status,
      active_stage: activeStage?.name ?? null,
      stage_deadline: activeStage?.deadline ?? null,
      responsible_member: (activeStage?.profiles as any)?.full_name ?? null,
      activity,
      deadlines,
    };
  });
