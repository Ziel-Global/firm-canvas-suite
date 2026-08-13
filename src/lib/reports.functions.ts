import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export interface MemberProductivity {
  id: string;
  name: string;
  role: string;
  tasksCompleted: number;
  avgTaskTimeHrs: number;
  activeTasks: number;
  overdueTasks: number;
  docsSubmitted: number;
  docsApproved: number;
  docsReturned: number;
}

export const getTeamProductivityData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { timeRange: "daily" | "weekly" | "monthly" }) => input)
  .handler(async ({ data: { timeRange }, context }): Promise<MemberProductivity[]> => {
    const { supabase, userId } = context;

    // Must be super_admin
    const { data: role } = await supabase.rpc("current_role");
    if (role !== "super_admin") {
      throw new Error("Only Super Admins can view team productivity reports.");
    }

    // Determine the start date for filtering based on timeRange
    const now = new Date();
    let startDate = new Date();
    if (timeRange === "daily") {
      startDate.setHours(0, 0, 0, 0);
    } else if (timeRange === "weekly") {
      startDate.setDate(now.getDate() - 7);
    } else if (timeRange === "monthly") {
      startDate.setMonth(now.getMonth() - 1);
    }
    const startStr = startDate.toISOString();

    const [profilesRes, tasksRes, approvalsRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, role").eq("is_active", true),
      supabase.from("tasks").select("id, assignee_id, status, created_at, completed_at, due_date"),
      supabase.from("approvals").select("id, submitted_by, status, submitted_at, decided_at"),
    ]);

    const profiles = profilesRes.data ?? [];
    const tasks = tasksRes.data ?? [];
    const approvals = approvalsRes.data ?? [];

    const todayStr = now.toISOString().slice(0, 10);

    const statsMap = new Map<string, MemberProductivity>();
    for (const p of profiles) {
      statsMap.set(p.id, {
        id: p.id,
        name: p.full_name ?? "Unknown",
        role: p.role,
        tasksCompleted: 0,
        avgTaskTimeHrs: 0,
        activeTasks: 0,
        overdueTasks: 0,
        docsSubmitted: 0,
        docsApproved: 0,
        docsReturned: 0,
      });
    }

    // Process tasks
    // Active / Overdue are current states (not strictly bounded by timeRange, though we could filter completed tasks by timeRange)
    for (const t of tasks) {
      if (!t.assignee_id) continue;
      const stat = statsMap.get(t.assignee_id);
      if (!stat) continue;

      if (t.status === "done") {
        // Only count completed tasks if they were completed within the time range
        if (t.completed_at && t.completed_at >= startStr) {
          stat.tasksCompleted++;
          // Calculate time taken
          const created = new Date(t.created_at).getTime();
          const completed = new Date(t.completed_at).getTime();
          const hrs = (completed - created) / (1000 * 60 * 60);
          stat.avgTaskTimeHrs += hrs;
        }
      } else {
        // Active task
        stat.activeTasks++;
        if (t.due_date && t.due_date < todayStr) {
          stat.overdueTasks++;
        }
      }
    }

    // Process approvals
    for (const a of approvals) {
      if (!a.submitted_by) continue;
      const stat = statsMap.get(a.submitted_by);
      if (!stat) continue;

      if (a.submitted_at >= startStr) {
        stat.docsSubmitted++;
        if (a.status === "approved") stat.docsApproved++;
        else if (a.status === "returned") stat.docsReturned++;
      }
    }

    // Finalize averages
    return Array.from(statsMap.values()).map(s => {
      if (s.tasksCompleted > 0) {
        s.avgTaskTimeHrs = Math.round((s.avgTaskTimeHrs / s.tasksCompleted) * 10) / 10;
      }
      return s;
    }).sort((a, b) => b.tasksCompleted - a.tasksCompleted);
  });

export interface WorkloadDistribution {
  id: string;
  name: string;
  role: string;
  activeTasks: number;
  activeCases: number;
  estHoursRemaining: number;
  bandwidth: "Available" | "Moderate" | "High Load" | "Overloaded";
}

export const getWorkloadDistributionData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorkloadDistribution[]> => {
    const { supabase } = context;

    const { data: role } = await supabase.rpc("current_role");
    if (role !== "super_admin" && role !== "admin") {
      throw new Error("Not authorized for this report.");
    }

    const [profilesRes, tasksRes, casesRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, role").eq("is_active", true),
      supabase.from("tasks").select("id, assignee_id, status, priority").neq("status", "done"),
      supabase.from("cases").select("id, status, case_stages(assignee_id, status)").in("status", ["active", "intake"])
    ]);

    const profiles = profilesRes.data ?? [];
    const openTasks = tasksRes.data ?? [];
    const activeCases = casesRes.data ?? [];

    const workloadMap = new Map<string, WorkloadDistribution>();
    for (const p of profiles) {
      workloadMap.set(p.id, {
        id: p.id,
        name: p.full_name ?? "Unknown",
        role: p.role,
        activeTasks: 0,
        activeCases: 0,
        estHoursRemaining: 0,
        bandwidth: "Available",
      });
    }

    // Tally open tasks and estimate hours
    for (const t of openTasks) {
      if (!t.assignee_id) continue;
      const wl = workloadMap.get(t.assignee_id);
      if (!wl) continue;

      wl.activeTasks++;
      // Priority-based task type averages: High=4h, Medium=2h, Low=1h, null=2h
      const est = t.priority === "high" ? 4 : t.priority === "low" ? 1 : 2;
      wl.estHoursRemaining += est;
    }

    // Tally active cases
    for (const c of activeCases) {
      const activeStage = (c.case_stages as any[] | null)?.find(s => s.status === "active");
      if (activeStage?.assignee_id) {
        const wl = workloadMap.get(activeStage.assignee_id);
        if (wl) {
          wl.activeCases++;
        }
      }
    }

    // Determine bandwidth
    return Array.from(workloadMap.values()).map(wl => {
      if (wl.activeTasks >= 10 || wl.estHoursRemaining >= 30) {
        wl.bandwidth = "Overloaded";
      } else if (wl.activeTasks >= 6 || wl.estHoursRemaining >= 15) {
        wl.bandwidth = "High Load";
      } else if (wl.activeTasks >= 3) {
        wl.bandwidth = "Moderate";
      } else {
        wl.bandwidth = "Available";
      }
      return wl;
    }).sort((a, b) => b.estHoursRemaining - a.estHoursRemaining);
  });

export interface ApprovalQueueReport {
  id: string;
  documentName: string;
  caseRef: string;
  caseTitle: string;
  submittedBy: string;
  submittedAt: string;
  waitedDays: number;
}

export const getApprovalQueueReportData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ApprovalQueueReport[]> => {
    const { supabase } = context;

    const { data: role } = await supabase.rpc("current_role");
    if (role !== "super_admin") {
      throw new Error("Only Super Admins can view the approval queue report.");
    }

    const { data: approvals, error } = await supabase
      .from("approvals")
      .select(`
        id, submitted_at,
        documents ( title ),
        cases ( case_ref, title ),
        profiles!approvals_submitted_by_fkey ( full_name )
      `)
      .eq("status", "pending")
      .order("submitted_at", { ascending: true });

    if (error) throw new Error(error.message);

    const now = new Date().getTime();

    return (approvals ?? []).map(a => {
      const diffMs = now - new Date(a.submitted_at).getTime();
      const waitedDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      return {
        id: a.id,
        documentName: a.documents?.title ?? "Unknown Document",
        caseRef: a.cases?.case_ref ?? "N/A",
        caseTitle: a.cases?.title ?? "Unknown Matter",
        submittedBy: (a.profiles as any)?.full_name ?? "Unknown",
        submittedAt: a.submitted_at,
        waitedDays,
      };
    });
  });

export interface ClientFollowUpReport {
  clientId: string;
  clientName: string;
  email: string;
  activeCases: number;
  lastCommunicationDate: string | null;
  upcomingHearingDate: string | null;
  outstandingBilling: number; // Mocked since it doesn't exist in schema
  isOverdue: boolean;
}

export const getClientFollowUpReportData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ClientFollowUpReport[]> => {
    const { supabase } = context;

    // Fetch clients that have active cases
    const { data: clientsData, error: clientsErr } = await supabase
      .from("clients")
      .select(`
        id, full_name, email,
        cases ( id, status )
      `);

    if (clientsErr) throw new Error(clientsErr.message);

    // Filter to only those with active cases
    const activeClients = (clientsData ?? []).filter(c => {
      const activeCases = (c.cases as any[] | null)?.filter(cs => cs.status === "active") ?? [];
      return activeCases.length > 0;
    });

    if (activeClients.length === 0) return [];

    const caseIds = activeClients.flatMap(c => (c.cases as any[]).filter(cs => cs.status === "active").map(cs => cs.id));

    // Fetch hearings
    const { data: events } = await supabase
      .from("calendar_events")
      .select("case_id, starts_at, event_type")
      .in("case_id", caseIds)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true });

    // Fetch audit_logs for last communication / activity
    const { data: audits } = await supabase
      .from("audit_log")
      .select("target_id, created_at")
      .in("target_id", caseIds)
      .order("created_at", { ascending: false });

    const now = new Date().getTime();

    return activeClients.map(c => {
      const cCases = (c.cases as any[]).filter(cs => cs.status === "active");
      const cCaseIds = cCases.map(cs => cs.id);

      // Next hearing
      const nextHearing = events?.find(e => e.case_id && cCaseIds.includes(e.case_id) && e.event_type?.toLowerCase().includes("hearing"));
      
      // Last activity
      const lastAudit = audits?.find(a => a.target_id && cCaseIds.includes(a.target_id));
      let isOverdue = false;
      if (lastAudit) {
        const diffDays = (now - new Date(lastAudit.created_at).getTime()) / (1000 * 60 * 60 * 24);
        isOverdue = diffDays > 30; // 30 days without activity = overdue
      } else {
        isOverdue = true; // No activity ever
      }

      return {
        clientId: c.id,
        clientName: c.full_name,
        email: c.email ?? "No email",
        activeCases: cCases.length,
        lastCommunicationDate: lastAudit ? lastAudit.created_at : null,
        upcomingHearingDate: nextHearing ? nextHearing.starts_at : null,
        outstandingBilling: 0, // Mocked
        isOverdue,
      };
    });
  });

async function requireBillingReportAccess(supabase: SupabaseClient<Database>) {
  const { data: role } = await supabase.rpc("current_role");
  if (role !== "super_admin" && role !== "admin") {
    throw new Error("Not authorized for this report.");
  }
}

export interface ArAgingRow {
  invoiceId: string;
  invoiceNumber: string;
  caseTitle: string | null;
  clientName: string | null;
  balance: number;
  daysOverdue: number;
  bucket: "current" | "0-30" | "31-60" | "61-90" | "90+";
}

/** Unpaid invoice balances bucketed by days past due. */
export const getArAgingReportData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ArAgingRow[]> => {
    const { supabase } = context;
    await requireBillingReportAccess(supabase);

    const { data, error } = await supabase
      .from("invoices")
      .select("id, invoice_number, due_date, total, amount_paid, cases(title), clients(full_name)")
      .in("status", ["sent", "partially_paid", "overdue"]);
    if (error) throw new Error(error.message);

    const today = new Date();
    return (data ?? [])
      .map((r) => {
        const balance = Math.round((r.total - r.amount_paid) * 100) / 100;
        const daysOverdue = r.due_date
          ? Math.max(0, Math.floor((today.getTime() - new Date(r.due_date).getTime()) / 86_400_000))
          : 0;
        const bucket: ArAgingRow["bucket"] =
          daysOverdue === 0 ? "current" : daysOverdue <= 30 ? "0-30" : daysOverdue <= 60 ? "31-60" : daysOverdue <= 90 ? "61-90" : "90+";
        return {
          invoiceId: r.id,
          invoiceNumber: r.invoice_number,
          caseTitle: (r.cases as { title: string | null } | null)?.title ?? null,
          clientName: (r.clients as { full_name: string | null } | null)?.full_name ?? null,
          balance,
          daysOverdue,
          bucket,
        };
      })
      .filter((r) => r.balance > 0)
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
  });

export interface BillingHistoryRow {
  invoiceId: string;
  invoiceNumber: string;
  caseTitle: string | null;
  clientName: string | null;
  status: string;
  issueDate: string | null;
  total: number;
  amountPaid: number;
}

/** Invoice history for a date range, most recent first. */
export const getBillingHistoryReportData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input?: { dateFrom?: string; dateTo?: string }) => input ?? {})
  .handler(async ({ data, context }): Promise<BillingHistoryRow[]> => {
    const { supabase } = context;
    await requireBillingReportAccess(supabase);

    let query = supabase
      .from("invoices")
      .select("id, invoice_number, status, issue_date, total, amount_paid, cases(title), clients(full_name)")
      .neq("status", "draft")
      .order("issue_date", { ascending: false });
    if (data.dateFrom) query = query.gte("issue_date", data.dateFrom);
    if (data.dateTo) query = query.lte("issue_date", data.dateTo);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    return (rows ?? []).map((r) => ({
      invoiceId: r.id,
      invoiceNumber: r.invoice_number,
      caseTitle: (r.cases as { title: string | null } | null)?.title ?? null,
      clientName: (r.clients as { full_name: string | null } | null)?.full_name ?? null,
      status: r.status,
      issueDate: r.issue_date,
      total: r.total,
      amountPaid: r.amount_paid,
    }));
  });

export interface MatterBalanceRow {
  caseId: string;
  caseTitle: string;
  caseRef: string | null;
  totalBilled: number;
  totalPaid: number;
  outstanding: number;
}

/** Per-matter rollup of billed / paid / outstanding across all its invoices. */
export const getMatterBalanceReportData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MatterBalanceRow[]> => {
    const { supabase } = context;
    await requireBillingReportAccess(supabase);

    const { data: invoices, error } = await supabase
      .from("invoices")
      .select("case_id, total, amount_paid, status, cases(title, case_ref)")
      .neq("status", "draft")
      .neq("status", "void");
    if (error) throw new Error(error.message);

    const byCase = new Map<string, MatterBalanceRow>();
    for (const inv of invoices ?? []) {
      const c = inv.cases as { title: string | null; case_ref: string | null } | null;
      const existing = byCase.get(inv.case_id) ?? {
        caseId: inv.case_id,
        caseTitle: c?.title ?? "Matter",
        caseRef: c?.case_ref ?? null,
        totalBilled: 0,
        totalPaid: 0,
        outstanding: 0,
      };
      existing.totalBilled = Math.round((existing.totalBilled + inv.total) * 100) / 100;
      existing.totalPaid = Math.round((existing.totalPaid + inv.amount_paid) * 100) / 100;
      existing.outstanding = Math.round((existing.totalBilled - existing.totalPaid) * 100) / 100;
      byCase.set(inv.case_id, existing);
    }

    return Array.from(byCase.values()).sort((a, b) => b.outstanding - a.outstanding);
  });

export interface RevenueByTimekeeper {
  timekeeperId: string;
  timekeeperName: string;
  billedHours: number;
  revenue: number;
}

export interface RevenueReport {
  totalRevenue: number;
  byTimekeeper: RevenueByTimekeeper[];
}

/** Revenue recognized (invoiced, not draft/void) and fee allocation by timekeeper for billed time. */
export const getRevenueReportData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input?: { dateFrom?: string; dateTo?: string }) => input ?? {})
  .handler(async ({ data, context }): Promise<RevenueReport> => {
    const { supabase } = context;
    await requireBillingReportAccess(supabase);

    let invoiceQuery = supabase
      .from("invoices")
      .select("total, issue_date")
      .neq("status", "draft")
      .neq("status", "void");
    if (data.dateFrom) invoiceQuery = invoiceQuery.gte("issue_date", data.dateFrom);
    if (data.dateTo) invoiceQuery = invoiceQuery.lte("issue_date", data.dateTo);
    const { data: invoices, error: invoicesError } = await invoiceQuery;
    if (invoicesError) throw new Error(invoicesError.message);

    const totalRevenue = Math.round((invoices ?? []).reduce((sum, i) => sum + i.total, 0) * 100) / 100;

    const { data: entries, error: entriesError } = await supabase
      .from("time_entries")
      .select("timekeeper_id, duration_minutes, rate, status, profiles!time_entries_timekeeper_id_fkey(full_name)")
      .eq("status", "billed");
    if (entriesError) throw new Error(entriesError.message);

    const byTimekeeper = new Map<string, RevenueByTimekeeper>();
    for (const e of entries ?? []) {
      if (!e.timekeeper_id) continue;
      const hours = (e.duration_minutes ?? 0) / 60;
      const revenue = hours * (e.rate ?? 0);
      const existing = byTimekeeper.get(e.timekeeper_id) ?? {
        timekeeperId: e.timekeeper_id,
        timekeeperName: (e.profiles as { full_name: string | null } | null)?.full_name ?? "Unknown",
        billedHours: 0,
        revenue: 0,
      };
      existing.billedHours = Math.round((existing.billedHours + hours) * 100) / 100;
      existing.revenue = Math.round((existing.revenue + revenue) * 100) / 100;
      byTimekeeper.set(e.timekeeper_id, existing);
    }

    return {
      totalRevenue,
      byTimekeeper: Array.from(byTimekeeper.values()).sort((a, b) => b.revenue - a.revenue),
    };
  });
