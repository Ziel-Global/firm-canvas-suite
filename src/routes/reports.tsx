import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Download, FileText, Table as TableIcon, Loader2, RefreshCw, Activity, Users } from "lucide-react";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { getTeamProductivityData, getWorkloadDistributionData, getApprovalQueueReportData, getClientFollowUpReportData } from "@/lib/reports.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
      { title: "Reports — Law Firm Ops" },
      { name: "description", content: "Reports and exports" },
    ],
  }),
  component: ReportsPage,
});

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
    let reportData: any = casesData;
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
    
    if (!reportData) return;
    setExporting(format);
    try {
      const { data: blob, error } = await supabase.functions.invoke("export-report", {
        body: {
          format,
          title,
          reportData,
        },
      });

      if (error) throw error;

      // Trigger download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title}.${format === "excel" ? "csv" : "pdf"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Export failed:", err);
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Firm Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Generate and export dynamic operations reports. Updates in real time.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
            disabled={fetchingCases || fetchingProd || fetchingWorkload || fetchingQueue || fetchingFollowup}
            className="text-muted-foreground"
          >
            <RefreshCw className={`size-4 mr-2 ${(fetchingCases || fetchingProd || fetchingWorkload || fetchingQueue || fetchingFollowup) ? "animate-spin" : ""}`} />
            Sync
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport("excel")}
            disabled={(!casesData && !prodData && !workloadData && !queueData && !followupData) || !!exporting}
            className="border-tag-green/30 text-tag-green hover:bg-tag-green/10 hover:text-tag-green"
          >
            {exporting === "excel" ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <TableIcon className="size-4 mr-2" />
            )}
            Export Excel (CSV)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport("pdf")}
            disabled={(!casesData && !prodData && !workloadData && !queueData && !followupData) || !!exporting}
            className="border-priority-high/30 text-priority-high hover:bg-priority-high/10 hover:text-priority-high"
          >
            {exporting === "pdf" ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <FileText className="size-4 mr-2" />
            )}
            Export PDF
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="cases" className="gap-2"><Activity className="size-4" /> Case Progress</TabsTrigger>
          {(role === "super_admin" || role === "admin") && (
            <TabsTrigger value="workload" className="gap-2"><TableIcon className="size-4" /> Workload Distribution</TabsTrigger>
          )}
          {(role === "super_admin" || role === "admin") && (
            <TabsTrigger value="followup" className="gap-2"><Users className="size-4" /> Client Follow-up</TabsTrigger>
          )}
          {role === "super_admin" && (
            <TabsTrigger value="productivity" className="gap-2"><Activity className="size-4" /> Team Productivity</TabsTrigger>
          )}
          {role === "super_admin" && (
            <TabsTrigger value="queue" className="gap-2"><FileText className="size-4" /> Approval Queue</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="cases" className="mt-0">
          <Card className="overflow-hidden border-border bg-canvas">
            <div className="p-4 border-b border-border bg-muted/20 flex justify-between items-center">
              <h2 className="font-semibold text-sm">Case Progress Report</h2>
              <span className="text-xs text-muted-foreground">
                {casesData ? `${casesData.length} active cases` : "Loading..."}
              </span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Ref</th>
                    <th className="px-4 py-3 font-medium">Case Title</th>
                    <th className="px-4 py-3 font-medium">Current Stage</th>
                    <th className="px-4 py-3 font-medium">Assigned</th>
                    <th className="px-4 py-3 font-medium">Next Deadline</th>
                    <th className="px-4 py-3 font-medium text-right">Last Activity</th>
                    <th className="px-4 py-3 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loadingCases ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        <Loader2 className="size-5 animate-spin mx-auto mb-2" />
                        Loading case progress...
                      </td>
                    </tr>
                  ) : !casesData || casesData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        No active cases found.
                      </td>
                    </tr>
                  ) : (
                    casesData.map((row) => (
                      <tr key={row.case_id} className={`transition-colors ${row.isStalled ? 'bg-amber-500/5 hover:bg-amber-500/10' : row.health === 'overdue' ? 'bg-priority-high/5 hover:bg-priority-high/10' : 'hover:bg-muted/20'}`}>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{row.case_ref}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{row.title}</td>
                        <td className="px-4 py-3 text-xs">{row.stageName}</td>
                        <td className="px-4 py-3 text-xs">{row.assignedMember}</td>
                        <td className="px-4 py-3 text-xs tabular-nums">
                          {row.nextDeadline ? new Date(row.nextDeadline).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {row.daysSinceActivity === -1 ? '—' : 
                            <span className={row.isStalled ? 'text-amber-500 font-semibold' : 'text-muted-foreground'}>
                              {row.daysSinceActivity === 0 ? 'Today' : `${row.daysSinceActivity}d ago`}
                            </span>
                          }
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase whitespace-nowrap inline-flex ${
                            row.health === "overdue" ? "bg-priority-high/15 text-priority-high" :
                            row.health === "at_risk" ? "bg-tag-sand/20 text-amber-700 dark:text-amber-400" :
                            "bg-tag-green/15 text-tag-green"
                          }`}>
                            {row.health.replace("_", " ")}
                            {row.isStalled && " (STALLED)"}
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

        {role === "super_admin" && (
          <TabsContent value="productivity" className="mt-0 space-y-4">
            <div className="flex justify-end">
              <div className="bg-muted p-1 rounded-md inline-flex text-sm">
                {(["daily", "weekly", "monthly"] as const).map(tr => (
                  <button
                    key={tr}
                    onClick={() => setTimeRange(tr)}
                    className={`px-3 py-1 rounded-sm capitalize ${timeRange === tr ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {tr}
                  </button>
                ))}
              </div>
            </div>

            <Card className="overflow-hidden border-border bg-canvas">
              <div className="p-4 border-b border-border bg-muted/20 flex justify-between items-center">
                <h2 className="font-semibold text-sm">Team Productivity ({timeRange})</h2>
                <span className="text-xs text-muted-foreground">
                  {prodData ? `${prodData.length} team members` : "Loading..."}
                </span>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Member</th>
                      <th className="px-4 py-3 font-medium">Role</th>
                      <th className="px-4 py-3 font-medium text-right" title="Tasks completed in range">Completed</th>
                      <th className="px-4 py-3 font-medium text-right" title="Average task time (hrs)">Avg Time (h)</th>
                      <th className="px-4 py-3 font-medium text-right text-priority-high" title="Currently overdue">Overdue</th>
                      <th className="px-4 py-3 font-medium text-right" title="Currently active">Active</th>
                      <th className="px-4 py-3 font-medium text-right" title="Docs submitted">Docs Sub</th>
                      <th className="px-4 py-3 font-medium text-right text-tag-green" title="Docs approved">Approved</th>
                      <th className="px-4 py-3 font-medium text-right text-amber-500" title="Revisions requested">Revisions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loadingProd ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                          <Loader2 className="size-5 animate-spin mx-auto mb-2" />
                          Loading productivity data...
                        </td>
                      </tr>
                    ) : !prodData || prodData.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                          No team data available.
                        </td>
                      </tr>
                    ) : (
                      prodData.map((row) => (
                        <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap">{row.name}</td>
                          <td className="px-4 py-2.5 text-xs capitalize text-muted-foreground">{row.role.replace(/_/g, " ")}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{row.tasksCompleted}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{row.avgTaskTimeHrs}</td>
                          <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${row.overdueTasks > 0 ? 'text-priority-high' : ''}`}>
                            {row.overdueTasks}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{row.activeTasks}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{row.docsSubmitted}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-tag-green">{row.docsApproved}</td>
                          <td className={`px-4 py-2.5 text-right tabular-nums ${row.docsReturned > 0 ? 'text-amber-500 font-medium' : ''}`}>
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
          <TabsContent value="workload" className="mt-0 space-y-4">
            <Card className="overflow-hidden border-border bg-canvas">
              <div className="p-4 border-b border-border bg-muted/20 flex justify-between items-center">
                <h2 className="font-semibold text-sm">Workload Distribution</h2>
                <span className="text-xs text-muted-foreground">
                  {workloadData ? `${workloadData.length} team members` : "Loading..."}
                </span>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Member</th>
                      <th className="px-4 py-3 font-medium">Role</th>
                      <th className="px-4 py-3 font-medium text-right">Active Cases</th>
                      <th className="px-4 py-3 font-medium text-right">Active Tasks</th>
                      <th className="px-4 py-3 font-medium text-right" title="Estimated hours based on task priority averages">Est. Hours Remaining</th>
                      <th className="px-4 py-3 font-medium text-right">Bandwidth</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loadingWorkload ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                          <Loader2 className="size-5 animate-spin mx-auto mb-2" />
                          Loading workload data...
                        </td>
                      </tr>
                    ) : !workloadData || workloadData.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                          No team data available.
                        </td>
                      </tr>
                    ) : (
                      workloadData.map((row) => (
                        <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap">{row.name}</td>
                          <td className="px-4 py-2.5 text-xs capitalize text-muted-foreground">{row.role.replace(/_/g, " ")}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{row.activeCases}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{row.activeTasks}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{row.estHoursRemaining} hrs</td>
                          <td className="px-4 py-2.5 text-right">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase inline-flex whitespace-nowrap ${
                              row.bandwidth === "Available" ? "bg-tag-green/15 text-tag-green" :
                              row.bandwidth === "Moderate" ? "bg-tag-blue/15 text-tag-blue" :
                              row.bandwidth === "High Load" ? "bg-tag-sand/20 text-amber-700 dark:text-amber-400" :
                              "bg-priority-high/15 text-priority-high"
                            }`}>
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
          <TabsContent value="queue" className="mt-0 space-y-4">
            <Card className="overflow-hidden border-border bg-canvas">
              <div className="p-4 border-b border-border bg-muted/20 flex justify-between items-center">
                <h2 className="font-semibold text-sm">Approval Queue Report</h2>
                <span className="text-xs text-muted-foreground">
                  {queueData ? `${queueData.length} documents pending` : "Loading..."}
                </span>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Document</th>
                      <th className="px-4 py-3 font-medium">Case Ref</th>
                      <th className="px-4 py-3 font-medium">Case Title</th>
                      <th className="px-4 py-3 font-medium">Submitted By</th>
                      <th className="px-4 py-3 font-medium">Submitted At</th>
                      <th className="px-4 py-3 font-medium text-right text-priority-high" title="Days waiting for approval">Wait Time (Days)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loadingQueue ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                          <Loader2 className="size-5 animate-spin mx-auto mb-2" />
                          Loading approval queue...
                        </td>
                      </tr>
                    ) : !queueData || queueData.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                          No pending approvals!
                        </td>
                      </tr>
                    ) : (
                      queueData.map((row) => (
                        <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap">{row.documentName}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{row.caseRef}</td>
                          <td className="px-4 py-2.5 text-xs">{row.caseTitle}</td>
                          <td className="px-4 py-2.5 text-xs">{row.submittedBy}</td>
                          <td className="px-4 py-2.5 text-xs tabular-nums text-muted-foreground">
                            {new Date(row.submittedAt).toLocaleDateString()}
                          </td>
                          <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${row.waitedDays > 2 ? 'text-priority-high' : 'text-foreground'}`}>
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
          <TabsContent value="followup" className="mt-0 space-y-4">
            <Card className="overflow-hidden border-border bg-canvas">
              <div className="p-4 border-b border-border bg-muted/20 flex justify-between items-center">
                <h2 className="font-semibold text-sm">Client Follow-up Report</h2>
                <span className="text-xs text-muted-foreground">
                  {followupData ? `${followupData.length} active clients` : "Loading..."}
                </span>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Client Name</th>
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium text-right">Active Cases</th>
                      <th className="px-4 py-3 font-medium text-right" title="Last logged activity">Last Comm.</th>
                      <th className="px-4 py-3 font-medium text-right">Next Hearing</th>
                      <th className="px-4 py-3 font-medium text-right">Outstanding Billing</th>
                      <th className="px-4 py-3 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loadingFollowup ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                          <Loader2 className="size-5 animate-spin mx-auto mb-2" />
                          Loading client list...
                        </td>
                      </tr>
                    ) : !followupData || followupData.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                          No active clients.
                        </td>
                      </tr>
                    ) : (
                      followupData.map((row) => (
                        <tr key={row.clientId} className={`transition-colors ${row.isOverdue ? 'bg-amber-500/5 hover:bg-amber-500/10' : 'hover:bg-muted/20'}`}>
                          <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{row.clientName}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{row.email}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{row.activeCases}</td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {row.lastCommunicationDate ? (
                              <span className={row.isOverdue ? 'text-amber-500 font-semibold' : 'text-muted-foreground'}>
                                {new Date(row.lastCommunicationDate).toLocaleDateString()}
                              </span>
                            ) : (
                              <span className="text-amber-500 font-semibold">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {row.upcomingHearingDate ? new Date(row.upcomingHearingDate).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            ${row.outstandingBilling.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase inline-flex whitespace-nowrap ${
                              row.isOverdue ? "bg-tag-sand/20 text-amber-700 dark:text-amber-400" : "bg-tag-green/15 text-tag-green"
                            }`}>
                              {row.isOverdue ? "OVERDUE CONTACT" : "ON TRACK"}
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
  );
}
