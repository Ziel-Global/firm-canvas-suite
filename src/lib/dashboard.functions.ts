import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DashboardCase {
  id: string;
  case_ref: string | null;
  title: string;
  health: string | null;
  active_stage?: string | null;
  responsible_member?: string | null;
}

export interface StageGroup {
  stage: string;
  count: number;
}

export interface TeamMember {
  id: string;
  name: string;
  open_tasks: number;
  overdue_tasks: number;
  active_cases: number;
}

export interface OperationsDashboardData {
  // Summary counts
  totalActiveCases: number;
  casesByStage: StageGroup[];
  tasksDueToday: number;
  tasksOverdue: number;
  pendingApprovals: number;
  // Health breakdown
  healthCounts: { on_track: number; at_risk: number; overdue: number };
  // Attention list (at-risk / overdue)
  attention: DashboardCase[];
  // Team workload
  teamWorkload: TeamMember[];
  // Case type breakdown
  casesByType: { type: string; count: number }[];
}

export interface DashboardData {
  counts: { on_track: number; at_risk: number; overdue: number; total: number };
  attention: DashboardCase[];
}

// ─── Simple getDashboard (non-admin, kept for other roles) ───────────────────

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DashboardData> => {
    const { supabase } = context;

    const { data, error } = await supabase
      .from("cases")
      .select(`
        id, case_ref, title, health,
        case_stages ( name, status, profiles ( full_name ) )
      `)
      .neq("status", "closed");

    const rows = (error ? [] : data) ?? [];
    const counts = { on_track: 0, at_risk: 0, overdue: 0, total: rows.length };
    for (const r of rows) {
      if (r.health === "overdue") counts.overdue++;
      else if (r.health === "at_risk") counts.at_risk++;
      else counts.on_track++;
    }

    const rank: Record<string, number> = { overdue: 0, at_risk: 1 };
    const attention = rows
      .filter((r) => r.health === "overdue" || r.health === "at_risk")
      .sort((a, b) => (rank[a.health ?? ""] ?? 9) - (rank[b.health ?? ""] ?? 9))
      .map((r) => {
        const stages = r.case_stages as any[];
        const activeStage = stages?.find((s: any) => s.status === "active");
        return {
          id: r.id,
          case_ref: r.case_ref,
          title: r.title,
          health: r.health,
          active_stage: activeStage?.name ?? null,
          responsible_member: activeStage?.profiles?.full_name ?? null,
        };
      });

    return { counts, attention };
  });

// ─── Full Operations Dashboard (Super Admin) ─────────────────────────────────

export const getOperationsDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OperationsDashboardData> => {
    const { supabase } = context;

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    // Run all queries in parallel for speed
    const [casesRes, stagesRes, tasksRes, approvalsRes, profilesRes, taskAssigneesRes] =
      await Promise.all([
        // Active cases with health
        supabase
          .from("cases")
          .select("id, case_ref, title, health, case_type")
          .neq("status", "closed"),

        // Active stages to group cases by stage
        supabase
          .from("case_stages")
          .select("case_id, name, status, assignee_id, profiles(full_name)")
          .eq("status", "active"),

        // All open tasks for today/overdue counts
        supabase
          .from("tasks")
          .select("id, due_date, status, assignee_id")
          .not("status", "eq", "done"),

        // Pending approvals
        supabase
          .from("approvals")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),

        // Team members (staff roles) for workload heat map
        supabase
          .from("profiles")
          .select("id, full_name, role")
          .in("role", ["super_admin", "admin", "senior_lawyer", "junior_lawyer"])
          .eq("is_active", true),

        // Task assignments per person
        supabase
          .from("tasks")
          .select("id, assignee_id, due_date, status")
          .not("status", "eq", "done"),
      ]);

    const cases = casesRes.data ?? [];
    const stages = stagesRes.data ?? [];
    const tasks = tasksRes.data ?? [];
    const profiles = profilesRes.data ?? [];
    const assigneeTasks = taskAssigneesRes.data ?? [];

    // ── 1. Cases by stage (group by name of their active stage) ──────────────
    const stageCaseMap = new Map<string, number>();
    const caseActiveStageMap = new Map<string, { name: string; member: string | null }>();

    for (const s of stages) {
      if (!s.case_id) continue;
      const stageName = (s.name as string) ?? "Unnamed Stage";
      stageCaseMap.set(stageName, (stageCaseMap.get(stageName) ?? 0) + 1);
      caseActiveStageMap.set(s.case_id, {
        name: stageName,
        member: (s.profiles as any)?.full_name ?? null,
      });
    }

    // Cases with no active stage → bucket as "No Active Stage"
    const casesWithStage = new Set(stages.map((s) => s.case_id));
    for (const c of cases) {
      if (!casesWithStage.has(c.id)) {
        stageCaseMap.set("No Active Stage", (stageCaseMap.get("No Active Stage") ?? 0) + 1);
      }
    }

    const casesByStage: StageGroup[] = Array.from(stageCaseMap.entries())
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => b.count - a.count);

    // ── 2. Task counts ────────────────────────────────────────────────────────
    let tasksDueToday = 0;
    let tasksOverdue = 0;
    for (const t of tasks) {
      if (!t.due_date) continue;
      if (t.due_date === todayStr) tasksDueToday++;
      else if (t.due_date < todayStr) tasksOverdue++;
    }

    // ── 3. Health breakdown ───────────────────────────────────────────────────
    const healthCounts = { on_track: 0, at_risk: 0, overdue: 0 };
    for (const c of cases) {
      if (c.health === "overdue") healthCounts.overdue++;
      else if (c.health === "at_risk") healthCounts.at_risk++;
      else healthCounts.on_track++;
    }

    // ── 4. Attention list ─────────────────────────────────────────────────────
    const rank: Record<string, number> = { overdue: 0, at_risk: 1 };
    const attention = cases
      .filter((c) => c.health === "overdue" || c.health === "at_risk")
      .sort((a, b) => (rank[a.health ?? ""] ?? 9) - (rank[b.health ?? ""] ?? 9))
      .slice(0, 8)
      .map((c) => {
        const stageInfo = caseActiveStageMap.get(c.id);
        return {
          id: c.id,
          case_ref: c.case_ref,
          title: c.title,
          health: c.health,
          active_stage: stageInfo?.name ?? null,
          responsible_member: stageInfo?.member ?? null,
        };
      });

    // ── 5. Team workload heat map ─────────────────────────────────────────────
    const memberOpenTasks = new Map<string, number>();
    const memberOverdueTasks = new Map<string, number>();
    for (const t of assigneeTasks) {
      if (!t.assignee_id) continue;
      memberOpenTasks.set(t.assignee_id, (memberOpenTasks.get(t.assignee_id) ?? 0) + 1);
      if (t.due_date && t.due_date < todayStr) {
        memberOverdueTasks.set(
          t.assignee_id,
          (memberOverdueTasks.get(t.assignee_id) ?? 0) + 1,
        );
      }
    }

    // Count active cases per assignee from stage assignments
    const memberActiveCases = new Map<string, Set<string>>();
    for (const s of stages) {
      if (!s.assignee_id || !s.case_id) continue;
      if (!memberActiveCases.has(s.assignee_id)) {
        memberActiveCases.set(s.assignee_id, new Set());
      }
      memberActiveCases.get(s.assignee_id)!.add(s.case_id);
    }

    const teamWorkload: TeamMember[] = profiles
      .map((p) => ({
        id: p.id,
        name: p.full_name ?? "Unknown",
        open_tasks: memberOpenTasks.get(p.id) ?? 0,
        overdue_tasks: memberOverdueTasks.get(p.id) ?? 0,
        active_cases: memberActiveCases.get(p.id)?.size ?? 0,
      }))
      .sort((a, b) => b.open_tasks - a.open_tasks);

    // ── 6. Cases by type ─────────────────────────────────────────────────────
    const typeMap = new Map<string, number>();
    for (const c of cases) {
      const t = c.case_type ?? "General";
      typeMap.set(t, (typeMap.get(t) ?? 0) + 1);
    }
    const casesByType = Array.from(typeMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    return {
      totalActiveCases: cases.length,
      casesByStage,
      tasksDueToday,
      tasksOverdue,
      pendingApprovals: approvalsRes.count ?? 0,
      healthCounts,
      attention,
      teamWorkload,
      casesByType,
    };
  });
