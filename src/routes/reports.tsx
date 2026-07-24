import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  FileText,
  Table as TableIcon,
  RefreshCw,
  Activity,
  Users,
} from "lucide-react";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import {
  getTeamProductivityData,
  getWorkloadDistributionData,
  getApprovalQueueReportData,
  getClientFollowUpReportData,
} from "@/lib/reports.functions";
import { exportReport } from "@/lib/report-export";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { PremiumLoader } from "@/components/premium-loader";
import { TableSkeleton } from "@/components/loading-skeletons";
import { toast } from "sonner";

// ─── Data Layer ─────────────────────────────────────────────────────────────

interface ReportRow {
  case_id: string;
  case_ref: string;
  title: string;
  health: string;
  stageName: string;
  assignedMember: string;
  nextDeadline: string | null;
  daysSinceActivity: number;
  isStalled: boolean;
}

export const getReportData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReportRow[]> => {
    const { data: cases, error } = await context.supabase
      .from("cases")
      .select(`
        id, case_ref, title, health, status,
        case_stages ( name, deadline, status, assignee_id, profiles ( full_name ) ),
        tasks ( due_date, status )
      `)
      .in("status", ["active", "intake"]);

    if (error) throw new Error(error.message);

    const activeCases = cases ?? [];
    const caseIds = activeCases.map(c => c.id);

    // Fetch latest activity from audit_log
    const { data: audits } = await context.supabase
      .from("audit_log")
      .select("target_id, created_at")
      .in("target_id", caseIds)
      .order("created_at", { ascending: false });

    const now = new Date().getTime();

    return activeCases.map((c) => {
      // Find active stage
      const activeStage = (c.case_stages as any[] | null)?.find(s => s.status === "active");
      const stageName = activeStage?.name ?? "No active stage";
      const assignedMember = activeStage?.profiles?.full_name ?? "Unassigned";

      // Next deadline
      let nextDeadline: string | null = activeStage?.deadline ?? null;
      const openTasks = (c.tasks as any[] | null)?.filter(t => t.status !== "done" && t.due_date) ?? [];
      for (const t of openTasks) {
        if (!nextDeadline || t.due_date < nextDeadline) {
          nextDeadline = t.due_date;
        }
      }

      // Days since activity
      const latestAudit = audits?.find(a => a.target_id === c.id);
      let daysSinceActivity = 0;
      if (latestAudit) {
        const diffMs = now - new Date(latestAudit.created_at).getTime();
        daysSinceActivity = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      } else {
        daysSinceActivity = -1; // Unknown
      }

      const isStalled = daysSinceActivity > 14;

      return {
        case_id: c.id,
        case_ref: c.case_ref ?? "N/A",
        title: c.title,
        health: c.health ?? "on_track",
        stageName,
        assignedMember,
        nextDeadline,
        daysSinceActivity,
        isStalled,
      };
    });
  });

// ─── Route ──────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — SAS Associates" },
      {
        name: "description",
        content: "Firm operations reports and exports.",
      },
    ],
  }),
  component: ReportsPage,
});

const PANEL =
  "overflow-hidden border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-0 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)]";
const TH =
  "px-4 py-3 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground";
const TD = "px-4 py-3 text-sm";
const ROW = "border-b border-white/[0.06] last:border-b-0 transition-colors hover:bg-white/[0.03]";

function PanelHeader({
  title,
  meta,
}: {
  title: string;
  meta: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3 sm:px-5">
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </span>
      <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-foreground/80">
        {meta}
      </span>
    </div>
  );
}

function healthBadge(health: string, stalled: boolean) {
  const label = `${health.replace("_", " ")}${stalled ? " · stalled" : ""}`;
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap",
        health === "overdue"
          ? "bg-priority-high/15 text-priority-high"
          : health === "at_risk"
            ? "bg-amber-500/15 text-amber-200/90"
            : "bg-white/[0.1] text-foreground",
      )}
    >
      {label}
    </span>
  );
}

function ReportsPage() {
  const { role } = useAuth();
  const fetchReport = useServerFn(getReportData);
  const fetchProductivity = useServerFn(getTeamProductivityData);
  const fetchWorkload = useServerFn(getWorkloadDistributionData);
  const fetchApprovalQueue = useServerFn(getApprovalQueueReportData);
  const fetchClientFollowUp = useServerFn(getClientFollowUpReportData);
  
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [activeTab, setActiveTab] = useState("cases");
  const [timeRange, setTimeRange] = useState<"daily" | "weekly" | "monthly">("weekly");

  const { data: casesData, isLoading: loadingCases, isFetching: fetchingCases, refetch: refetchCases } = useQuery({
    queryKey: ["reports-data", "cases"],
    queryFn: () => fetchReport(),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const { data: prodData, isLoading: loadingProd, isFetching: fetchingProd, refetch: refetchProd } = useQuery({
    queryKey: ["reports-data", "productivity", timeRange],
    queryFn: () => fetchProductivity({ data: { timeRange } }),
    enabled: role === "super_admin" && activeTab === "productivity",
    staleTime: 30_000,
  });

  const { data: workloadData, isLoading: loadingWorkload, isFetching: fetchingWorkload, refetch: refetchWorkload } = useQuery({
    queryKey: ["reports-data", "workload"],
    queryFn: () => fetchWorkload(),
    enabled: (role === "super_admin" || role === "admin") && activeTab === "workload",
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const { data: queueData, isLoading: loadingQueue, isFetching: fetchingQueue, refetch: refetchQueue } = useQuery({
    queryKey: ["reports-data", "approval-queue"],
    queryFn: () => fetchApprovalQueue(),
    enabled: role === "super_admin" && activeTab === "queue",
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const { data: followupData, isLoading: loadingFollowup, isFetching: fetchingFollowup, refetch: refetchFollowup } = useQuery({
    queryKey: ["reports-data", "client-followup"],
    queryFn: () => fetchClientFollowUp(),
    enabled: (role === "super_admin" || role === "admin") && activeTab === "followup",
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const handleExport = async (format: "pdf" | "excel") => {
    let reportData: unknown[] | undefined = casesData;
    let title = "Active_Cases_Status_Report";

    if (activeTab === "productivity") {
      reportData = prodData;
      title = `Team_Productivity_${timeRange}`;
    } else if (activeTab === "workload") {
      reportData = workloadData;
      title = "Workload_Distribution_Report";
    } else if (activeTab === "queue") {
      reportData = queueData;
      title = "Approval_Queue_Report";
    } else if (activeTab === "followup") {
      reportData = followupData;
      title = "Client_Follow_Up_Report";
    }

    if (!reportData) {
      toast.error("No report data loaded yet.");
      return;
    }

    setExporting(format);
    try {
      await exportReport(format, title, reportData);
      toast.success(
        format === "excel" ? "CSV downloaded" : "PDF downloaded",
      );
    } catch (err: unknown) {
      console.error("Export failed:", err);
      toast.error(
        err instanceof Error ? err.message : "Export failed.",
      );
    } finally {
      setExporting(null);
    }
  };

  const isSyncing =
    fetchingCases ||
    fetchingProd ||
    fetchingWorkload ||
    fetchingQueue ||
    fetchingFollowup;

  const canExport = Boolean(
    casesData || prodData || workloadData || queueData || followupData,
  );

  return (
    <main className="dashboard-shell min-h-[calc(100dvh-3.5rem)] px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Firm
            </p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
              Reports
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Operations exports · live data · auto-sync every 30s
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (activeTab === "productivity") refetchProd();
                else if (activeTab === "workload") refetchWorkload();
                else if (activeTab === "queue") refetchQueue();
                else if (activeTab === "followup") refetchFollowup();
                else refetchCases();
              }}
              disabled={isSyncing}
              className="h-9 border border-white/[0.08] bg-white/[0.03] px-3 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
            >
              <RefreshCw
                className={cn("mr-2 size-4", isSyncing && "animate-spin")}
              />
              Sync
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleExport("excel")}
              disabled={!canExport || !!exporting}
              className="h-9 border border-white/[0.08] bg-white/[0.03] px-3 text-foreground hover:bg-white/[0.06]"
            >
              {exporting === "excel" ? (
                <PremiumLoader size="sm" className="mr-2" />
              ) : (
                <TableIcon className="mr-2 size-4" />
              )}
              Export CSV
            </Button>
            <Button
              size="sm"
              onClick={() => handleExport("pdf")}
              disabled={!canExport || !!exporting}
              className="h-9 gap-1.5 border-0 bg-gradient-to-b from-[#F8F8F8] to-[#CFCFCF] px-3 text-[#1a1c20] shadow-[0_8px_20px_rgba(0,0,0,0.22)] hover:from-white hover:to-[#d8d8d8]"
            >
              {exporting === "pdf" ? (
                <PremiumLoader size="sm" className="mr-2" />
              ) : (
                <FileText className="mr-2 size-4" />
              )}
              Export PDF
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <Card className="border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-1.5 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)]">
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
              <TabsTrigger
                value="cases"
                className="gap-1.5 rounded-lg px-3 py-2 text-xs data-[state=active]:bg-white/[0.1] data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              >
                <Activity className="size-3.5" />
                Case progress
              </TabsTrigger>
              {(role === "super_admin" || role === "admin") && (
                <TabsTrigger
                  value="workload"
                  className="gap-1.5 rounded-lg px-3 py-2 text-xs data-[state=active]:bg-white/[0.1] data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  <TableIcon className="size-3.5" />
                  Workload
                </TabsTrigger>
              )}
              {(role === "super_admin" || role === "admin") && (
                <TabsTrigger
                  value="followup"
                  className="gap-1.5 rounded-lg px-3 py-2 text-xs data-[state=active]:bg-white/[0.1] data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  <Users className="size-3.5" />
                  Client follow-up
                </TabsTrigger>
              )}
              {role === "super_admin" && (
                <TabsTrigger
                  value="productivity"
                  className="gap-1.5 rounded-lg px-3 py-2 text-xs data-[state=active]:bg-white/[0.1] data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  <Activity className="size-3.5" />
                  Team productivity
                </TabsTrigger>
              )}
              {role === "super_admin" && (
                <TabsTrigger
                  value="queue"
                  className="gap-1.5 rounded-lg px-3 py-2 text-xs data-[state=active]:bg-white/[0.1] data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  <FileText className="size-3.5" />
                  Approval queue
                </TabsTrigger>
              )}
            </TabsList>
          </Card>

          <TabsContent value="cases" className="mt-4">
            <Card className={PANEL}>
              <PanelHeader
                title="Case progress report"
                meta={
                  casesData
                    ? `${casesData.length} active cases`
                    : "Loading…"
                }
              />
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className={TH}>Ref</th>
                      <th className={TH}>Case title</th>
                      <th className={TH}>Current stage</th>
                      <th className={TH}>Assigned</th>
                      <th className={TH}>Next deadline</th>
                      <th className={cn(TH, "text-right")}>Last activity</th>
                      <th className={cn(TH, "text-right")}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingCases ? (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <TableSkeleton
                            rows={6}
                            cols={7}
                            className="rounded-none border-0 shadow-none"
                          />
                        </td>
                      </tr>
                    ) : !casesData || casesData.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-12 text-center text-sm text-muted-foreground"
                        >
                          No active cases found.
                        </td>
                      </tr>
                    ) : (
                      casesData.map((row) => (
                        <tr
                          key={row.case_id}
                          className={cn(
                            ROW,
                            row.isStalled && "bg-amber-500/[0.04]",
                            row.health === "overdue" &&
                              "bg-priority-high/[0.04]",
                          )}
                        >
                          <td
                            className={cn(
                              TD,
                              "whitespace-nowrap text-xs tabular-nums text-muted-foreground",
                            )}
                          >
                            {row.case_ref}
                          </td>
                          <td
                            className={cn(
                              TD,
                              "max-w-[220px] truncate font-medium tracking-tight text-foreground",
                            )}
                          >
                            {row.title}
                          </td>
                          <td className={cn(TD, "text-xs text-muted-foreground")}>
                            {row.stageName}
                          </td>
                          <td className={cn(TD, "text-xs text-muted-foreground")}>
                            {row.assignedMember}
                          </td>
                          <td
                            className={cn(
                              TD,
                              "text-xs tabular-nums text-muted-foreground",
                            )}
                          >
                            {row.nextDeadline
                              ? new Date(row.nextDeadline).toLocaleDateString()
                              : "—"}
                          </td>
                          <td className={cn(TD, "text-right tabular-nums")}>
                            {row.daysSinceActivity === -1 ? (
                              "—"
                            ) : (
                              <span
                                className={
                                  row.isStalled
                                    ? "font-semibold text-amber-200/90"
                                    : "text-muted-foreground"
                                }
                              >
                                {row.daysSinceActivity === 0
                                  ? "Today"
                                  : `${row.daysSinceActivity}d ago`}
                              </span>
                            )}
                          </td>
                          <td className={cn(TD, "text-right")}>
                            {healthBadge(row.health, row.isStalled)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {role === "super_admin" && (
            <TabsContent value="productivity" className="mt-4 space-y-4">
              <div className="flex justify-end">
                <div className="inline-flex rounded-xl border border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-1">
                  {(["daily", "weekly", "monthly"] as const).map((tr) => (
                    <button
                      key={tr}
                      type="button"
                      onClick={() => setTimeRange(tr)}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                        timeRange === tr
                          ? "bg-white/[0.1] text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {tr}
                    </button>
                  ))}
                </div>
              </div>

              <Card className={PANEL}>
                <PanelHeader
                  title={`Team productivity · ${timeRange}`}
                  meta={
                    prodData ? `${prodData.length} members` : "Loading…"
                  }
                />
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className={TH}>Member</th>
                        <th className={TH}>Role</th>
                        <th className={cn(TH, "text-right")}>Completed</th>
                        <th className={cn(TH, "text-right")}>Avg time (h)</th>
                        <th className={cn(TH, "text-right")}>Overdue</th>
                        <th className={cn(TH, "text-right")}>Active</th>
                        <th className={cn(TH, "text-right")}>Docs sub</th>
                        <th className={cn(TH, "text-right")}>Approved</th>
                        <th className={cn(TH, "text-right")}>Revisions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingProd ? (
                        <tr>
                          <td colSpan={9} className="p-0">
                            <TableSkeleton
                              rows={5}
                              cols={9}
                              className="rounded-none border-0 shadow-none"
                            />
                          </td>
                        </tr>
                      ) : !prodData || prodData.length === 0 ? (
                        <tr>
                          <td
                            colSpan={9}
                            className="px-4 py-12 text-center text-sm text-muted-foreground"
                          >
                            No team data available.
                          </td>
                        </tr>
                      ) : (
                        prodData.map((row) => (
                          <tr key={row.id} className={ROW}>
                            <td
                              className={cn(
                                TD,
                                "whitespace-nowrap font-medium tracking-tight text-foreground",
                              )}
                            >
                              {row.name}
                            </td>
                            <td
                              className={cn(
                                TD,
                                "text-xs capitalize text-muted-foreground",
                              )}
                            >
                              {row.role.replace(/_/g, " ")}
                            </td>
                            <td
                              className={cn(
                                TD,
                                "text-right tabular-nums font-semibold",
                              )}
                            >
                              {row.tasksCompleted}
                            </td>
                            <td
                              className={cn(
                                TD,
                                "text-right tabular-nums text-muted-foreground",
                              )}
                            >
                              {row.avgTaskTimeHrs}
                            </td>
                            <td
                              className={cn(
                                TD,
                                "text-right tabular-nums font-medium",
                                row.overdueTasks > 0 && "text-priority-high",
                              )}
                            >
                              {row.overdueTasks}
                            </td>
                            <td
                              className={cn(
                                TD,
                                "text-right tabular-nums text-muted-foreground",
                              )}
                            >
                              {row.activeTasks}
                            </td>
                            <td
                              className={cn(
                                TD,
                                "text-right tabular-nums text-muted-foreground",
                              )}
                            >
                              {row.docsSubmitted}
                            </td>
                            <td
                              className={cn(
                                TD,
                                "text-right tabular-nums text-foreground",
                              )}
                            >
                              {row.docsApproved}
                            </td>
                            <td
                              className={cn(
                                TD,
                                "text-right tabular-nums",
                                row.docsReturned > 0 &&
                                  "font-medium text-amber-200/90",
                              )}
                            >
                              {row.docsReturned}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </TabsContent>
          )}

          {(role === "super_admin" || role === "admin") && (
            <TabsContent value="workload" className="mt-4">
              <Card className={PANEL}>
                <PanelHeader
                  title="Workload distribution"
                  meta={
                    workloadData
                      ? `${workloadData.length} members`
                      : "Loading…"
                  }
                />
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className={TH}>Member</th>
                        <th className={TH}>Role</th>
                        <th className={cn(TH, "text-right")}>Active cases</th>
                        <th className={cn(TH, "text-right")}>Active tasks</th>
                        <th className={cn(TH, "text-right")}>Est. hours</th>
                        <th className={cn(TH, "text-right")}>Bandwidth</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingWorkload ? (
                        <tr>
                          <td colSpan={6} className="p-0">
                            <TableSkeleton
                              rows={5}
                              cols={6}
                              className="rounded-none border-0 shadow-none"
                            />
                          </td>
                        </tr>
                      ) : !workloadData || workloadData.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-4 py-12 text-center text-sm text-muted-foreground"
                          >
                            No team data available.
                          </td>
                        </tr>
                      ) : (
                        workloadData.map((row) => (
                          <tr key={row.id} className={ROW}>
                            <td
                              className={cn(
                                TD,
                                "whitespace-nowrap font-medium tracking-tight text-foreground",
                              )}
                            >
                              {row.name}
                            </td>
                            <td
                              className={cn(
                                TD,
                                "text-xs capitalize text-muted-foreground",
                              )}
                            >
                              {row.role.replace(/_/g, " ")}
                            </td>
                            <td
                              className={cn(
                                TD,
                                "text-right tabular-nums text-muted-foreground",
                              )}
                            >
                              {row.activeCases}
                            </td>
                            <td
                              className={cn(
                                TD,
                                "text-right tabular-nums text-muted-foreground",
                              )}
                            >
                              {row.activeTasks}
                            </td>
                            <td
                              className={cn(
                                TD,
                                "text-right tabular-nums text-muted-foreground",
                              )}
                            >
                              {row.estHoursRemaining} hrs
                            </td>
                            <td className={cn(TD, "text-right")}>
                              <span
                                className={cn(
                                  "inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap",
                                  row.bandwidth === "Available"
                                    ? "bg-white/[0.1] text-foreground"
                                    : row.bandwidth === "Moderate"
                                      ? "bg-white/[0.06] text-foreground/80"
                                      : row.bandwidth === "High Load"
                                        ? "bg-amber-500/15 text-amber-200/90"
                                        : "bg-priority-high/15 text-priority-high",
                                )}
                              >
                                {row.bandwidth}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </TabsContent>
          )}

          {role === "super_admin" && (
            <TabsContent value="queue" className="mt-4">
              <Card className={PANEL}>
                <PanelHeader
                  title="Approval queue report"
                  meta={
                    queueData
                      ? `${queueData.length} pending`
                      : "Loading…"
                  }
                />
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className={TH}>Document</th>
                        <th className={TH}>Case ref</th>
                        <th className={TH}>Case title</th>
                        <th className={TH}>Submitted by</th>
                        <th className={TH}>Submitted at</th>
                        <th className={cn(TH, "text-right")}>Wait (days)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingQueue ? (
                        <tr>
                          <td colSpan={6} className="p-0">
                            <TableSkeleton
                              rows={4}
                              cols={6}
                              className="rounded-none border-0 shadow-none"
                            />
                          </td>
                        </tr>
                      ) : !queueData || queueData.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-4 py-12 text-center text-sm text-muted-foreground"
                          >
                            No pending approvals.
                          </td>
                        </tr>
                      ) : (
                        queueData.map((row) => (
                          <tr key={row.id} className={ROW}>
                            <td
                              className={cn(
                                TD,
                                "whitespace-nowrap font-medium tracking-tight text-foreground",
                              )}
                            >
                              {row.documentName}
                            </td>
                            <td
                              className={cn(
                                TD,
                                "text-xs tabular-nums text-muted-foreground",
                              )}
                            >
                              {row.caseRef}
                            </td>
                            <td className={cn(TD, "text-xs text-muted-foreground")}>
                              {row.caseTitle}
                            </td>
                            <td className={cn(TD, "text-xs text-muted-foreground")}>
                              {row.submittedBy}
                            </td>
                            <td
                              className={cn(
                                TD,
                                "text-xs tabular-nums text-muted-foreground",
                              )}
                            >
                              {new Date(row.submittedAt).toLocaleDateString()}
                            </td>
                            <td
                              className={cn(
                                TD,
                                "text-right tabular-nums font-medium",
                                row.waitedDays > 2
                                  ? "text-priority-high"
                                  : "text-foreground",
                              )}
                            >
                              {row.waitedDays}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </TabsContent>
          )}

          {(role === "super_admin" || role === "admin") && (
            <TabsContent value="followup" className="mt-4">
              <Card className={PANEL}>
                <PanelHeader
                  title="Client follow-up report"
                  meta={
                    followupData
                      ? `${followupData.length} clients`
                      : "Loading…"
                  }
                />
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className={TH}>Client</th>
                        <th className={TH}>Email</th>
                        <th className={cn(TH, "text-right")}>Active cases</th>
                        <th className={cn(TH, "text-right")}>Last comm.</th>
                        <th className={cn(TH, "text-right")}>Next hearing</th>
                        <th className={cn(TH, "text-right")}>Billing</th>
                        <th className={cn(TH, "text-right")}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingFollowup ? (
                        <tr>
                          <td colSpan={7} className="p-0">
                            <TableSkeleton
                              rows={5}
                              cols={7}
                              className="rounded-none border-0 shadow-none"
                            />
                          </td>
                        </tr>
                      ) : !followupData || followupData.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-4 py-12 text-center text-sm text-muted-foreground"
                          >
                            No active clients.
                          </td>
                        </tr>
                      ) : (
                        followupData.map((row) => (
                          <tr
                            key={row.clientId}
                            className={cn(
                              ROW,
                              row.isOverdue && "bg-amber-500/[0.04]",
                            )}
                          >
                            <td
                              className={cn(
                                TD,
                                "whitespace-nowrap font-medium tracking-tight text-foreground",
                              )}
                            >
                              {row.clientName}
                            </td>
                            <td className={cn(TD, "text-xs text-muted-foreground")}>
                              {row.email}
                            </td>
                            <td
                              className={cn(
                                TD,
                                "text-right tabular-nums text-muted-foreground",
                              )}
                            >
                              {row.activeCases}
                            </td>
                            <td className={cn(TD, "text-right tabular-nums")}>
                              {row.lastCommunicationDate ? (
                                <span
                                  className={
                                    row.isOverdue
                                      ? "font-semibold text-amber-200/90"
                                      : "text-muted-foreground"
                                  }
                                >
                                  {new Date(
                                    row.lastCommunicationDate,
                                  ).toLocaleDateString()}
                                </span>
                              ) : (
                                <span className="font-semibold text-amber-200/90">
                                  —
                                </span>
                              )}
                            </td>
                            <td
                              className={cn(
                                TD,
                                "text-right tabular-nums text-muted-foreground",
                              )}
                            >
                              {row.upcomingHearingDate
                                ? new Date(
                                    row.upcomingHearingDate,
                                  ).toLocaleDateString()
                                : "—"}
                            </td>
                            <td
                              className={cn(
                                TD,
                                "text-right tabular-nums text-muted-foreground",
                              )}
                            >
                              ${row.outstandingBilling.toFixed(2)}
                            </td>
                            <td className={cn(TD, "text-right")}>
                              <span
                                className={cn(
                                  "inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap",
                                  row.isOverdue
                                    ? "bg-amber-500/15 text-amber-200/90"
                                    : "bg-white/[0.1] text-foreground",
                                )}
                              >
                                {row.isOverdue ? "Overdue contact" : "On track"}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </main>
  );
}

