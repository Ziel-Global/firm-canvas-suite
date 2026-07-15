import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ReactNode } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { ListSkeleton } from "@/components/loading-skeletons";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Operations Dashboard — SAS Associates" },
      {
        name: "description",
        content: "Firm-wide operations overview for the Super Admin.",
      },
    ],
  }),
  component: DashboardPage,
});

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
  if (overdue > 0)
    return "bg-priority-high/10 text-priority-high border-priority-high/25";
  if (open >= 6)
    return "bg-white/[0.04] text-amber-200/90 border-white/10";
  if (open >= 3) return "bg-white/[0.03] text-foreground/90 border-white/10";
  return "bg-transparent text-muted-foreground border-white/[0.06]";
}

function DashboardPage() {
  const { role } = useAuth();

  if (
    role === "senior_lawyer" ||
    role === "junior_lawyer" ||
    role === "support"
  ) {
    return <Navigate to="/tasks" replace />;
  }

  if (role === "super_admin") return <OperationsDashboard />;
  if (role === "admin") return <AdminDashboard />;
  return null;
}

function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <main className="dashboard-shell min-h-[calc(100vh-3.5rem)] px-5 py-6 sm:px-7 lg:px-8 xl:px-10">
      <div className="mx-auto w-full max-w-[1440px] space-y-7">{children}</div>
    </main>
  );
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
    <DashboardShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Firm overview
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
            Operations snapshot
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Limited view · refreshes every 60 seconds
          </p>
        </div>
        <RefreshButton onClick={() => refetch()} busy={isFetching} />
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card
                key={i}
                className="border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-5 shadow-[0_12px_32px_-20px_rgba(0,0,0,0.5)]"
              >
                <Skeleton className="h-2.5 w-20" />
                <Skeleton className="mt-4 h-8 w-16" />
              </Card>
            ))}
          </div>
          <ListSkeleton rows={4} />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Active Cases"
              value={d.totalActiveCases}
              icon={<Briefcase className="size-4" />}
            />
            <KpiCard
              label="Tasks Due Today"
              value={d.tasksDueToday}
              icon={<CheckSquare className="size-4" />}
            />
            <KpiCard
              label="Overdue Tasks"
              value={d.tasksOverdue}
              icon={<AlertTriangle className="size-4" />}
              alert={d.tasksOverdue > 0}
            />
            <KpiCard
              label="Pending Approvals"
              value={d.pendingApprovals}
              icon={<ClipboardCheck className="size-4" />}
            />
          </div>

          <Panel>
            <PanelHeader
              title="Firm-wide calendar"
              icon={<Layers className="size-4" />}
            />
            <p className="mt-2 text-sm text-muted-foreground">
              View upcoming deadlines, hearings, and events across active cases.
            </p>
            <Button asChild variant="outline" className="mt-5">
              <Link to="/calendar">Open calendar</Link>
            </Button>
          </Panel>
        </>
      )}
    </DashboardShell>
  );
}

function OperationsDashboard() {
  const fetchDashboard = useServerFn(getOperationsDashboard);
  const [memberSheet, setMemberSheet] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [caseSheet, setCaseSheet] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["ops-dashboard"],
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
    <DashboardShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Command centre
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
            Operations Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Firm-wide snapshot · live every 60 seconds
          </p>
        </div>
        <RefreshButton onClick={() => refetch()} busy={isFetching} />
      </div>

      {/* KPI strip */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard
          label="Active Cases"
          value={d.totalActiveCases}
          icon={<Briefcase className="size-4" />}
        />
        <KpiCard
          label="On Track"
          value={d.healthCounts.on_track}
          icon={<StatusDot status="ontrack" label="" />}
        />
        <KpiCard
          label="At Risk"
          value={d.healthCounts.at_risk}
          icon={<StatusDot status="atrisk" label="" />}
          alert={d.healthCounts.at_risk > 0}
        />
        <KpiCard
          label="Overdue"
          value={d.healthCounts.overdue}
          icon={<AlertTriangle className="size-4" />}
          alert={d.healthCounts.overdue > 0}
        />
        <KpiCard
          label="Pending Approvals"
          value={d.pendingApprovals}
          icon={<ClipboardCheck className="size-4" />}
          alert={d.pendingApprovals > 0}
          linkTo="/approvals"
          className="col-span-2 lg:col-span-1"
        />
      </section>

      {/* Task focus */}
      <section className="grid gap-3 sm:grid-cols-2">
        <TaskStrip
          label="Tasks due today"
          value={d.tasksDueToday}
          icon={<CheckSquare className="size-4" />}
          linkTo="/tasks"
        />
        <TaskStrip
          label="Overdue tasks"
          value={d.tasksOverdue}
          icon={<AlertTriangle className="size-4" />}
          linkTo="/tasks"
          alert={d.tasksOverdue > 0}
        />
      </section>

      {/* Pipeline + types */}
      <section className="grid gap-3 lg:grid-cols-12">
        <Panel className="lg:col-span-8">
          <PanelHeader
            title="Cases by stage"
            icon={<Layers className="size-4" />}
          />
          {isLoading ? (
            <div className="mt-4 space-y-3">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-[85%]" />
              <Skeleton className="h-3 w-[70%]" />
            </div>
          ) : d.casesByStage.length === 0 ? (
            <EmptyState>No active stages.</EmptyState>
          ) : (
            <div className="mt-5 space-y-4">
              {d.casesByStage.map((s) => {
                const pct = d.totalActiveCases
                  ? Math.round((s.count / d.totalActiveCases) * 100)
                  : 0;
                return (
                  <div key={s.stage} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="truncate font-medium text-foreground">
                        {s.stage}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {s.count} · {pct}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-white/55 to-white/25 transition-all duration-700"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel className="lg:col-span-4">
          <PanelHeader
            title="By case type"
            icon={<TrendingUp className="size-4" />}
          />
          {isLoading ? (
            <div className="mt-4 space-y-3">
              <Skeleton className="h-3 w-[70%]" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-[55%]" />
            </div>
          ) : d.casesByType.length === 0 ? (
            <EmptyState>No data.</EmptyState>
          ) : (
            <ul className="mt-4 divide-y divide-white/[0.06]">
              {d.casesByType.slice(0, 8).map((t) => (
                <li
                  key={t.type}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="truncate text-sm text-foreground/90">
                    {t.type}
                  </span>
                  <span className="rounded-md bg-white/[0.05] px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                    {t.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      {/* Attention + workload */}
      <section className="grid gap-3 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Needs attention"
            icon={<ShieldAlert className="size-4 text-priority-high/90" />}
            trailing={
              d.attention.length > 0 ? (
                <span className="rounded-full bg-priority-high/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-priority-high">
                  {d.attention.length}
                </span>
              ) : null
            }
          />

          {isLoading ? (
            <div className="mt-4 space-y-3">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          ) : d.attention.length === 0 ? (
            <div className="mt-6 flex flex-col items-center py-8 text-center">
              <StatusDot status="ontrack" label="" />
              <p className="mt-3 text-sm text-muted-foreground">
                All cases are on track.
              </p>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-white/[0.06]">
              {d.attention.map((c) => (
                <li key={c.id}>
                  <div className="flex items-start justify-between gap-3 py-3">
                    <button
                      type="button"
                      onClick={() =>
                        setCaseSheet({ id: c.id, title: c.title })
                      }
                      className="min-w-0 flex-1 text-left transition-colors hover:text-foreground"
                    >
                      <p className="truncate text-sm font-medium text-foreground">
                        {c.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        {c.case_ref && (
                          <span className="text-xs text-muted-foreground">
                            {c.case_ref}
                          </span>
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
                    <div className="mt-0.5 flex shrink-0 items-center gap-2">
                      <StatusDot
                        status={
                          HEALTH_MAP[c.health ?? "on_track"] ?? "ontrack"
                        }
                        label={HEALTH_LABELS[c.health ?? ""] ?? ""}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setCaseSheet({ id: c.id, title: c.title })
                        }
                        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
                        title="Quick view"
                      >
                        <ChevronRight className="size-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Team workload"
            icon={<User className="size-4" />}
          />

          {isLoading ? (
            <div className="mt-4 space-y-2.5">
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
          ) : d.teamWorkload.length === 0 ? (
            <EmptyState>No team members found.</EmptyState>
          ) : (
            <div className="mt-4 space-y-1.5">
              <div className="grid grid-cols-[1fr_3.5rem_3.25rem_3.75rem] gap-2 px-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                <span>Member</span>
                <span className="text-right">Cases</span>
                <span className="text-right">Tasks</span>
                <span className="text-right">Overdue</span>
              </div>
              {d.teamWorkload.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() =>
                    setMemberSheet({ id: m.id, name: m.name })
                  }
                  className={cn(
                    "grid w-full cursor-pointer grid-cols-[1fr_3.5rem_3.25rem_3.75rem] items-center gap-2 rounded-xl border px-2.5 py-2.5 text-left text-sm transition-all hover:border-white/15 hover:bg-white/[0.03]",
                    heatClass(m.open_tasks, m.overdue_tasks),
                  )}
                >
                  <span className="truncate font-medium">{m.name}</span>
                  <span className="text-right text-xs tabular-nums">
                    {m.active_cases}
                  </span>
                  <span className="text-right text-xs tabular-nums">
                    {m.open_tasks}
                  </span>
                  <span
                    className={cn(
                      "text-right text-xs font-semibold tabular-nums",
                      m.overdue_tasks > 0 && "text-priority-high",
                    )}
                  >
                    {m.overdue_tasks > 0 ? m.overdue_tasks : "—"}
                  </span>
                </button>
              ))}
              <p className="px-1 pt-2 text-[10px] text-muted-foreground">
                Highlighted rows indicate overdue work or high open-task load.
              </p>
            </div>
          )}
        </Panel>
      </section>

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
    </DashboardShell>
  );
}

function RefreshButton({
  onClick,
  busy,
}: {
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={busy}
      className="gap-2 border border-white/[0.08] bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
    >
      <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
      Refresh
    </Button>
  );
}

function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "dashboard-panel border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-5 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)] backdrop-blur-sm sm:p-6",
        className,
      )}
    >
      {children}
    </Card>
  );
}

function PanelHeader({
  title,
  icon,
  trailing,
}: {
  title: string;
  icon: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-7 items-center justify-center rounded-lg bg-white/[0.05] text-muted-foreground">
        {icon}
      </span>
      <h2 className="text-sm font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      {trailing ? <div className="ml-auto">{trailing}</div> : null}
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="mt-6 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function KpiCard({
  label,
  value,
  icon,
  alert,
  linkTo,
  className,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  alert?: boolean;
  linkTo?: string;
  className?: string;
}) {
  const inner = (
    <Card
      className={cn(
        "group relative overflow-hidden border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-4 shadow-[0_12px_32px_-20px_rgba(0,0,0,0.5)] transition-all duration-300 hover:border-white/15 hover:bg-[rgba(22,22,25,0.85)] sm:p-5",
        alert && value > 0 && "border-priority-high/25",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-lg bg-white/[0.05] text-muted-foreground",
            alert && value > 0 && "text-priority-high",
          )}
        >
          {icon}
        </span>
      </div>
      <p
        className={cn(
          "mt-4 text-3xl font-semibold tracking-tight tabular-nums sm:text-[2rem]",
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
}: {
  label: string;
  value: number;
  icon: ReactNode;
  linkTo: string;
  alert?: boolean;
}) {
  return (
    <Link to={linkTo} className="block">
      <Card
        className={cn(
          "flex items-center gap-4 border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-4 transition-all duration-300 hover:border-white/15 hover:bg-[rgba(22,22,25,0.85)] sm:p-5",
          alert && value > 0 && "border-priority-high/30",
        )}
      >
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-muted-foreground",
            alert && value > 0 && "text-priority-high",
          )}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
            {label}
          </p>
          <p
            className={cn(
              "mt-1 text-2xl font-semibold tabular-nums tracking-tight",
              alert && value > 0 ? "text-priority-high" : "text-foreground",
            )}
          >
            {value}
          </p>
        </div>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground/70" />
      </Card>
    </Link>
  );
}
