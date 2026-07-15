import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  Briefcase,
  CheckSquare,
  AlertTriangle,
  ClipboardCheck,
  ShieldAlert,
  ArrowRight,
  User,
  Layers,
  TrendingUp,
  RefreshCw,
  ChevronRight,
} from "lucide-react";

import { getOperationsDashboard } from "@/lib/dashboard.functions";
import { Card } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status-dot";
import { Button } from "@/components/ui/button";
import { MemberDrillDownSheet } from "@/components/member-drilldown-sheet";
import { CaseDrillDownSheet } from "@/components/case-drilldown-sheet";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Operations Dashboard — Law Firm Ops" },
      { name: "description", content: "Firm-wide operations overview for the Super Admin." },
    ],
  }),
  component: DashboardPage,
});

// ─── Colour helpers ───────────────────────────────────────────────────────────

const HEALTH_MAP: Record<string, "ontrack" | "atrisk" | "overdue"> = {
  on_track: "ontrack",
  at_risk: "atrisk",
  overdue: "overdue",
};

const HEALTH_LABELS: Record<string, string> = {
  on_track: "On track",
  at_risk: "At risk",
  overdue: "Overdue",
};

function heatClass(open: number, overdue: number): string {
  if (overdue > 0) return "bg-priority-high/15 text-priority-high border-priority-high/30";
  if (open >= 6) return "bg-tag-sand/20 text-amber-700 dark:text-amber-400 border-tag-sand/40";
  if (open >= 3) return "bg-tag-blue/10 text-tag-blue border-tag-blue/30";
  return "bg-muted/60 text-muted-foreground border-border";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function DashboardPage() {
  const { role } = useAuth();

  // Redirect lower roles directly to their task board
  if (role === "senior_lawyer" || role === "junior_lawyer" || role === "support") {
    return <Navigate to="/tasks" replace />;
  }

  // Super Admin gets the full Operations Dashboard
  if (role === "super_admin") {
    return <OperationsDashboard />;
  }

  // Admin gets the limited dashboard
  if (role === "admin") {
    return <AdminDashboard />;
  }

  return null;
}

function AdminDashboard() {
  const fetchDashboard = useServerFn(getOperationsDashboard);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["ops-dashboard-admin"],
    queryFn: () => fetchDashboard(),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const d = data ?? {
    totalActiveCases: 0,
    casesByStage: [],
    tasksDueToday: 0,
    tasksOverdue: 0,
    pendingApprovals: 0,
    healthCounts: { on_track: 0, at_risk: 0, overdue: 0 },
    attention: [],
    teamWorkload: [],
    casesByType: [],
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Firm Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Limited view · refreshes every 60 seconds
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading dashboard...</p>
      ) : (
        <>
          {/* Top Level Metrics */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="glass-card stat-card flex flex-col justify-between p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-muted-foreground">Active Cases</span>
                <Briefcase className="size-4 text-brand-secondary" />
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight gradient-text">{d.totalActiveCases}</span>
              </div>
            </Card>

            <Card className="glass-card stat-card flex flex-col justify-between p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-muted-foreground">Tasks Due Today</span>
                <CheckSquare className="size-4 text-brand-primary" />
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight gradient-text">{d.tasksDueToday}</span>
              </div>
            </Card>

            <Card className="glass-card stat-card flex flex-col justify-between p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-muted-foreground">Overdue Tasks</span>
                <AlertTriangle className={cn("size-4", d.tasksOverdue > 0 ? "text-priority-high badge-pulse" : "text-muted-foreground")} />
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className={cn("text-3xl font-bold tracking-tight", d.tasksOverdue > 0 ? "gradient-text-warm" : "text-foreground")}>
                  {d.tasksOverdue}
                </span>
              </div>
            </Card>

            <Card className="glass-card stat-card flex flex-col justify-between p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-muted-foreground">Pending Approvals</span>
                <ClipboardCheck className="size-4 text-brand-tertiary" />
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight text-foreground">{d.pendingApprovals}</span>
              </div>
            </Card>
          </div>

          <Card className="p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Firm-wide Calendar</h2>
            <p className="text-sm text-muted-foreground mb-4">
              View all upcoming deadlines, events, and task dues across all active firm cases.
            </p>
            <Button asChild variant="outline">
              <Link to="/calendar">Open Full Calendar</Link>
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}

function OperationsDashboard() {
  const fetchDashboard = useServerFn(getOperationsDashboard);
  // Drill-down state
  const [memberSheet, setMemberSheet] = useState<{ id: string; name: string } | null>(null);
  const [caseSheet, setCaseSheet] = useState<{ id: string; title: string } | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["ops-dashboard"],
    queryFn: () => fetchDashboard(),
    staleTime: 60_000, // refresh every 60 s
    refetchInterval: 60_000,
  });

  const d = data ?? {
    totalActiveCases: 0,
    casesByStage: [],
    tasksDueToday: 0,
    tasksOverdue: 0,
    pendingApprovals: 0,
    healthCounts: { on_track: 0, at_risk: 0, overdue: 0 },
    attention: [],
    teamWorkload: [],
    casesByType: [],
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Operations Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Firm-wide snapshot · refreshes every 60 seconds
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* ── Row 1: KPI Cards ─────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="Active Cases"
          value={d.totalActiveCases}
          icon={<Briefcase className="size-5" />}
          accent="tag-blue"
        />
        <KpiCard
          label="On Track"
          value={d.healthCounts.on_track}
          icon={<StatusDot status="ontrack" label="" />}
          accent="tag-green"
        />
        <KpiCard
          label="At Risk"
          value={d.healthCounts.at_risk}
          icon={<StatusDot status="atrisk" label="" />}
          accent="tag-sand"
          alert={d.healthCounts.at_risk > 0}
        />
        <KpiCard
          label="Overdue"
          value={d.healthCounts.overdue}
          icon={<AlertTriangle className="size-5" />}
          accent="priority-high"
          alert={d.healthCounts.overdue > 0}
        />
        <KpiCard
          label="Pending Approvals"
          value={d.pendingApprovals}
          icon={<ClipboardCheck className="size-5" />}
          accent="tag-purple"
          alert={d.pendingApprovals > 0}
          linkTo="/approvals"
        />
      </div>

      {/* ── Row 2: Tasks strip ───────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <TaskStrip
          label="Tasks due today"
          value={d.tasksDueToday}
          icon={<CheckSquare className="size-5 text-tag-blue" />}
          linkTo="/tasks"
          className="border-tag-blue/30"
        />
        <TaskStrip
          label="Overdue tasks"
          value={d.tasksOverdue}
          icon={<AlertTriangle className="size-5 text-priority-high" />}
          linkTo="/tasks"
          alert
          className={d.tasksOverdue > 0 ? "border-priority-high/40" : ""}
        />
      </div>

      {/* ── Row 3: Stage pipeline + Case types ──────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Cases by stage — pipeline bar */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Cases by Stage</h2>
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : d.casesByStage.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active stages.</p>
          ) : (
            <div className="space-y-2.5">
              {d.casesByStage.map((s) => {
                const pct = d.totalActiveCases
                  ? Math.round((s.count / d.totalActiveCases) * 100)
                  : 0;
                return (
                  <div key={s.stage} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground truncate max-w-[60%]">
                        {s.stage}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {s.count} case{s.count !== 1 ? "s" : ""} · {pct}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-tag-blue transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Case type breakdown */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">By Case Type</h2>
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : d.casesByType.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data.</p>
          ) : (
            <div className="space-y-2">
              {d.casesByType.slice(0, 7).map((t) => (
                <div key={t.type} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-foreground truncate">{t.type}</span>
                  <span className="text-xs font-medium text-muted-foreground tabular-nums shrink-0">
                    {t.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Row 4: Needs Attention + Team Workload ───────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Needs attention */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert className="size-4 text-priority-high" />
            <h2 className="text-sm font-semibold text-foreground">Needs Attention</h2>
            {d.attention.length > 0 && (
              <span className="ml-auto text-xs font-medium bg-priority-high/10 text-priority-high px-2 py-0.5 rounded-full">
                {d.attention.length}
              </span>
            )}
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : d.attention.length === 0 ? (
            <div className="py-6 text-center">
              <StatusDot status="ontrack" label="" />
              <p className="text-sm text-muted-foreground mt-2">
                All cases are on track.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {d.attention.map((c) => (
                <li key={c.id}>
                  <div className="flex items-start justify-between gap-3 py-2.5 group">
                    <button
                      type="button"
                      onClick={() => setCaseSheet({ id: c.id, title: c.title })}
                      className="flex-1 min-w-0 text-left hover:text-foreground"
                    >
                      <p className="truncate text-sm font-medium text-foreground">
                        {c.title}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                        {c.case_ref && (
                          <span className="text-xs text-muted-foreground">{c.case_ref}</span>
                        )}
                        {c.active_stage && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Layers className="size-3" />
                            {c.active_stage}
                          </span>
                        )}
                        {c.responsible_member && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <User className="size-3" />
                            {c.responsible_member}
                          </span>
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-2 shrink-0 mt-0.5">
                      <StatusDot
                        status={HEALTH_MAP[c.health ?? "on_track"] ?? "ontrack"}
                        label={HEALTH_LABELS[c.health ?? ""] ?? ""}
                      />
                      <button
                        type="button"
                        onClick={() => setCaseSheet({ id: c.id, title: c.title })}
                        className="p-1 rounded hover:bg-muted transition-colors"
                        title="Quick view"
                      >
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Team workload heat map */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <User className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Team Workload</h2>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : d.teamWorkload.length === 0 ? (
            <p className="text-sm text-muted-foreground">No team members found.</p>
          ) : (
            <div className="space-y-2">
              {/* Header row */}
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                <span>Member</span>
                <span className="w-16 text-right">Cases</span>
                <span className="w-14 text-right">Tasks</span>
                <span className="w-16 text-right">Overdue</span>
              </div>
              {d.teamWorkload.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMemberSheet({ id: m.id, name: m.name })}
                  className={cn(
                    "w-full text-left grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center px-2 py-2 rounded-[var(--radius-control)] border text-sm transition-all hover:shadow-sm hover:scale-[1.01] active:scale-100 cursor-pointer",
                    heatClass(m.open_tasks, m.overdue_tasks),
                  )}
                >
                  <span className="font-medium truncate">{m.name}</span>
                  <span className="w-16 text-right tabular-nums text-xs">{m.active_cases}</span>
                  <span className="w-14 text-right tabular-nums text-xs">{m.open_tasks}</span>
                  <span
                    className={cn(
                      "w-16 text-right tabular-nums text-xs font-semibold",
                      m.overdue_tasks > 0 && "text-priority-high",
                    )}
                  >
                    {m.overdue_tasks > 0 ? m.overdue_tasks : "—"}
                  </span>
                </button>
              ))}
              <p className="text-[10px] text-muted-foreground mt-2 px-1">
                Red = overdue tasks · Amber = high load · Blue = moderate
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* ── Drill-down sheets ─────────────────────────────────────────────── */}
      <MemberDrillDownSheet
        memberId={memberSheet?.id ?? null}
        memberName={memberSheet?.name ?? ""}
        onClose={() => setMemberSheet(null)}
      />
      <CaseDrillDownSheet
        caseId={caseSheet?.id ?? null}
        caseTitle={caseSheet?.title ?? ""}
        onClose={() => setCaseSheet(null)}
      />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon,
  accent,
  alert,
  linkTo,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent: string;
  alert?: boolean;
  linkTo?: string;
}) {
  const inner = (
    <Card
      className={cn(
        "p-4 flex flex-col gap-3 transition-all hover:shadow-md",
        alert && value > 0 && "ring-1 ring-priority-high/30",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={`text-${accent} opacity-70`}>{icon}</span>
      </div>
      <p
        className={cn(
          "text-3xl font-bold tabular-nums",
          alert && value > 0 ? "text-priority-high" : "text-foreground",
        )}
      >
        {value}
      </p>
    </Card>
  );

  if (linkTo) {
    return (
      <Link to={linkTo} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}

function TaskStrip({
  label,
  value,
  icon,
  linkTo,
  alert,
  className,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  linkTo: string;
  alert?: boolean;
  className?: string;
}) {
  return (
    <Link to={linkTo}>
      <Card
        className={cn(
          "p-4 flex items-center gap-4 hover:shadow-md transition-all border",
          className,
        )}
      >
        <div className="shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p
            className={cn(
              "text-2xl font-bold tabular-nums",
              alert && value > 0 ? "text-priority-high" : "text-foreground",
            )}
          >
            {value}
          </p>
        </div>
        <ArrowRight className="size-4 text-muted-foreground shrink-0" />
      </Card>
    </Link>
  );
}
