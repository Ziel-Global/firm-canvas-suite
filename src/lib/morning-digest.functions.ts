import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface DigestScheduleItem {
  id: string;
  title: string;
  event_type: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  is_private: boolean;
  case_ref: string | null;
  case_title: string | null;
}

export interface DigestApprovalItem {
  id: string;
  submitted_at: string;
  submitted_by_name: string | null;
  case_ref: string | null;
  case_title: string | null;
  document_title: string | null;
}

export interface DigestTaskItem {
  id: string;
  title: string;
  priority: string | null;
  due_date: string | null;
  days_overdue: number;
  assignee_name: string | null;
  case_ref: string | null;
  case_title: string | null;
}

export interface MorningDigest {
  generated_at: string;
  digest_date: string; // YYYY-MM-DD
  recipient_name: string | null;
  morning_digest_time: string | null;
  schedule: DigestScheduleItem[];
  pending_approvals: DigestApprovalItem[];
  overdue_tasks: DigestTaskItem[];
  totals: {
    schedule: number;
    pending_approvals: number;
    overdue_tasks: number;
  };
}

function startEndOfDay(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Assembles the Super Admin's morning digest: today's schedule (including the
 * principal-private layer), all pending approvals, and overdue tasks across the
 * firm. Restricted to super_admin. Delivery is wired in Part H using
 * firm_settings.morning_digest_time.
 */
export const getMorningDigest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { date?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<MorningDigest> => {
    const { supabase, userId } = context;

    // Gate to super_admin.
    const { data: me, error: meErr } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", userId)
      .single();
    if (meErr) throw new Error(meErr.message);
    if (me?.role !== "super_admin") {
      throw new Error("Only the Super Admin can view the morning digest.");
    }

    const targetDate = data.date ? new Date(`${data.date}T00:00:00`) : new Date();
    if (Number.isNaN(targetDate.getTime())) {
      throw new Error("Invalid date.");
    }
    const { start, end } = startEndOfDay(targetDate);
    const todayStr = `${targetDate.getFullYear()}-${String(
      targetDate.getMonth() + 1,
    ).padStart(2, "0")}-${String(targetDate.getDate()).padStart(2, "0")}`;

    // Morning digest time from firm_settings.
    const { data: setting } = await supabase
      .from("firm_settings")
      .select("value")
      .eq("key", "morning_digest_time")
      .maybeSingle();
    const digestTime =
      typeof setting?.value === "string"
        ? setting.value.replace(/"/g, "")
        : (setting?.value as string | null) ?? null;

    // --- Day schedule (RLS already exposes private events to super_admin) ---
    const { data: events, error: evErr } = await supabase
      .from("calendar_events")
      .select(
        "id, title, event_type, starts_at, ends_at, location, is_private, cases(case_ref, title)",
      )
      .gte("starts_at", start)
      .lte("starts_at", end)
      .order("starts_at", { ascending: true });
    if (evErr) throw new Error(evErr.message);

    const schedule: DigestScheduleItem[] = (events ?? []).map((e) => {
      const c = e.cases as { case_ref: string; title: string } | null;
      return {
        id: e.id,
        title: e.title ?? "Untitled",
        event_type: e.event_type,
        starts_at: e.starts_at as string,
        ends_at: (e.ends_at as string) ?? null,
        location: e.location,
        is_private: Boolean(e.is_private),
        case_ref: c?.case_ref ?? null,
        case_title: c?.title ?? null,
      };
    });

    // --- Pending approvals ---
    const { data: approvals, error: apErr } = await supabase
      .from("approvals")
      .select(
        "id, submitted_at, profiles:submitted_by(full_name), cases(case_ref, title), documents(title)",
      )
      .eq("status", "pending")
      .order("submitted_at", { ascending: true });
    if (apErr) throw new Error(apErr.message);

    const pending_approvals: DigestApprovalItem[] = (approvals ?? []).map((a) => {
      const c = a.cases as { case_ref: string; title: string } | null;
      const doc = a.documents as { title: string } | null;
      const sb = a.profiles as { full_name: string } | null;
      return {
        id: a.id,
        submitted_at: a.submitted_at as string,
        submitted_by_name: sb?.full_name ?? null,
        case_ref: c?.case_ref ?? null,
        case_title: c?.title ?? null,
        document_title: doc?.title ?? null,
      };
    });

    // --- Overdue tasks (due before today and not yet done) ---
    const { data: tasks, error: tErr } = await supabase
      .from("tasks")
      .select(
        "id, title, priority, due_date, profiles:assignee_id(full_name), cases(case_ref, title)",
      )
      .lt("due_date", todayStr)
      .neq("status", "done")
      .order("due_date", { ascending: true });
    if (tErr) throw new Error(tErr.message);

    const overdue_tasks: DigestTaskItem[] = (tasks ?? [])
      .filter((t) => t.due_date)
      .map((t) => {
        const c = t.cases as { case_ref: string; title: string } | null;
        const a = t.profiles as { full_name: string } | null;
        const due = new Date(`${t.due_date}T00:00:00`);
        const days = Math.max(
          0,
          Math.round((targetDate.getTime() - due.getTime()) / 86_400_000),
        );
        return {
          id: t.id,
          title: t.title,
          priority: t.priority,
          due_date: t.due_date as string,
          days_overdue: days,
          assignee_name: a?.full_name ?? null,
          case_ref: c?.case_ref ?? null,
          case_title: c?.title ?? null,
        };
      });

    return {
      generated_at: new Date().toISOString(),
      digest_date: todayStr,
      recipient_name: me?.full_name ?? null,
      morning_digest_time: digestTime,
      schedule,
      pending_approvals,
      overdue_tasks,
      totals: {
        schedule: schedule.length,
        pending_approvals: pending_approvals.length,
        overdue_tasks: overdue_tasks.length,
      },
    };
  });
