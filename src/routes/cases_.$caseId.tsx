import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  User,
  Briefcase,
  CalendarClock,
  CalendarDays,
  Plus,
  CheckSquare,
  Activity,
  Bot,
  UserPlus,
} from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { getCaseDetail } from "@/lib/cases.functions";
import { getMyCaseAccess } from "@/lib/case-access.functions";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { Button } from "@/components/ui/button";
import { StatusDot, type StatusDotProps } from "@/components/ui/status-dot";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CaseOverviewTab } from "@/components/case-overview-tab";
import { CaseNotesTab } from "@/components/case-notes-tab";
import { CaseActivityTab } from "@/components/case-activity-tab";
import { CaseAccessTab } from "@/components/case-access-tab";
import { CaseTeamTab } from "@/components/case-team-tab";
import { CaseTasksTab } from "@/components/case-tasks-tab";
import { CaseStagesTab } from "@/components/case-stages-tab";
import { CaseDocumentsTab } from "@/components/case-documents-tab";
import { CaseCalendarTab } from "@/components/case-calendar-tab";
import { CaseLifecycleActions } from "@/components/case-lifecycle-actions";
import { CaseSummariseModal } from "@/components/case-summarise-modal";
import { AssignLeadDialog } from "@/components/assign-lead-dialog";
import { NewTaskSheet } from "@/components/new-task-sheet";
import { cn } from "@/lib/utils";

const TABS = [
  "overview",
  "stages",
  "tasks",
  "documents",
  "calendar",
  "notes",
  "team",
  "access",
  "activity",
] as const;

export const Route = createFileRoute("/cases_/$caseId")({
  head: () => ({
    meta: [{ title: "Verdio" }],
  }),
  validateSearch: (search: Record<string, unknown>): { tab?: string } => {
    const tab = typeof search.tab === "string" ? search.tab : undefined;
    return {
      tab: tab && (TABS as readonly string[]).includes(tab) ? tab : undefined,
    };
  },
  component: CaseDetailPage,
  errorComponent: ({ error }) => (
    <main className="dashboard-shell px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
      <p className="text-sm text-destructive" role="alert">
        {error.message}
      </p>
    </main>
  ),
  notFoundComponent: () => (
    <main className="dashboard-shell px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
      <p className="text-sm text-muted-foreground">Case not found.</p>
    </main>
  ),
});

const ALLOWED_ROLES = [
  "super_admin",
  "admin",
  "senior_lawyer",
  "junior_lawyer",
  "support",
];

const STATUS_LABELS: Record<string, string> = {
  intake: "Intake",
  active: "Active",
  on_hold: "On hold",
  closed: "Closed",
};

const HEALTH_MAP: Record<string, StatusDotProps["status"]> = {
  on_track: "ontrack",
  at_risk: "atrisk",
  overdue: "overdue",
};

const HEALTH_LABELS: Record<string, string> = {
  on_track: "On track",
  at_risk: "At risk",
  overdue: "Overdue",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function CaseDetailPage() {
  const { caseId } = Route.useParams();
  const { tab: tabFromSearch } = Route.useSearch();
  const { role, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const fetchDetail = useServerFn(getCaseDetail);
  const checkMyAccess = useServerFn(getMyCaseAccess);
  const [tab, setTab] = useState<string>(tabFromSearch ?? "overview");
  const [summariseModalOpen, setSummariseModalOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  const canView = role != null && ALLOWED_ROLES.includes(role);
  const isFirmAdmin = role === "super_admin" || role === "admin";
  const canAssign = isFirmAdmin;
  const canManageLifecycle = canAssign;

  const { data: myAccess, isLoading: accessLoading } = useQuery({
    queryKey: ["my-case-access", caseId],
    queryFn: () => checkMyAccess({ data: { caseId } }),
    enabled: canView && !isFirmAdmin,
    refetchInterval: isFirmAdmin ? false : 15000,
    refetchOnWindowFocus: !isFirmAdmin,
  });
  // Firm admins always retain case access by role. For everyone else, wait
  // until the access check settles before treating a missing level as revoked.
  const accessRevoked =
    !isFirmAdmin && !accessLoading && myAccess?.level === "none";

  const { data, isLoading, error } = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => fetchDetail({ data: { id: caseId } }),
    enabled: canView && !accessRevoked,
  });

  if (authLoading) {
    return (
      <main className="dashboard-shell px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
        <p className="mt-8 text-center text-sm text-muted-foreground">Loading case…</p>
      </main>
    );
  }

  if (!canView) {
    return (
      <main className="dashboard-shell px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Case</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to view this page.
        </p>
      </main>
    );
  }

  if (accessRevoked) {
    return (
      <main className="dashboard-shell px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
        <Link
          to="/cases"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to cases
        </Link>
        <h2 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">
          Access removed
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your access to this case has been revoked. You no longer have
          permission to view its contents.
        </p>
      </main>
    );
  }

  return (
    <main className="dashboard-shell px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
      <Link
        to="/cases"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to cases
      </Link>

      {isLoading && (
        <p className="mt-8 text-center text-sm text-muted-foreground">Loading case…</p>
      )}
      {error && !isLoading && (
        <p className="mt-8 text-center text-sm text-destructive">Could not load case.</p>
      )}

      {data && (
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[20rem_1fr]">
          <aside className="space-y-4">
            <Card className="space-y-5 border-white/[0.08] bg-[rgba(18,18,20,0.78)] p-5 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)]">
              <div>
                <p className="font-mono text-xs text-muted-foreground">
                  {data.case_ref ?? "—"}
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
                  {data.title}
                </h2>
              </div>

              <div className="flex flex-wrap gap-2">
                {data.case_type && <Tag color="blue">{data.case_type}</Tag>}
                {data.status && (
                  <Tag color="sand">{STATUS_LABELS[data.status] ?? data.status}</Tag>
                )}
              </div>

              {!data.lead_id && canAssign ? (
                <button
                  type="button"
                  onClick={() => setAssignOpen(true)}
                  className="flex w-full items-start gap-3 rounded-xl border border-dashed border-white/20 bg-white/[0.03] px-3 py-3 text-left transition-colors hover:border-white/35 hover:bg-white/[0.06]"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.08]">
                    <UserPlus className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">
                      Assign a lead
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Required so lawyers can own this matter and stages.
                    </span>
                  </span>
                </button>
              ) : null}

              <dl className="space-y-3 text-sm">
                <RailRow icon={Briefcase} label="Client">
                  {data.client_id ? (
                    <Link
                      to="/clients/$clientId"
                      params={{ clientId: data.client_id }}
                      className="text-foreground hover:underline"
                    >
                      {data.client_name ?? "—"}
                    </Link>
                  ) : (
                    "—"
                  )}
                </RailRow>
                <RailRow icon={User} label="Lead">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn(!data.lead_name && "text-muted-foreground")}>
                      {data.lead_name ?? "Unassigned"}
                    </span>
                    {canAssign ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 border border-white/[0.1] bg-white/[0.04] px-2 text-xs"
                        onClick={() => setAssignOpen(true)}
                      >
                        <UserPlus className="size-3.5" />
                        {data.lead_id ? "Change" : "Assign"}
                      </Button>
                    ) : null}
                  </div>
                </RailRow>
                <RailRow icon={CheckSquare} label="Current stage">
                  {data.current_stage_name ?? "—"}
                </RailRow>
                <RailRow icon={Activity} label="Health">
                  <span className="inline-flex items-center gap-2">
                    {data.health && HEALTH_MAP[data.health] && (
                      <StatusDot status={HEALTH_MAP[data.health]} label="" />
                    )}
                    {data.health ? HEALTH_LABELS[data.health] ?? data.health : "—"}
                  </span>
                </RailRow>
                <RailRow icon={CalendarClock} label="Next deadline">
                  {formatDate(data.next_deadline)}
                </RailRow>
                <RailRow icon={CalendarDays} label="Opened">
                  {formatDate(data.opened_at)}
                </RailRow>
                {data.closed_at && (
                  <RailRow icon={CalendarDays} label="Closed">
                    {formatDate(data.closed_at)}
                  </RailRow>
                )}
                {data.retention_until && (
                  <RailRow icon={CalendarDays} label="Retention until">
                    {formatDate(data.retention_until)}
                  </RailRow>
                )}
              </dl>
            </Card>

            <Card className="space-y-2 border-white/[0.08] bg-[rgba(18,18,20,0.78)] p-5">
              <h3 className="text-sm font-semibold text-foreground">Quick actions</h3>
              <div className="grid gap-2">
                <Button
                  variant="ghost"
                  className="justify-start border border-transparent hover:border-white/[0.08]"
                  onClick={() => setTaskOpen(true)}
                >
                  <Plus className="size-4" />
                  New task
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start border border-transparent hover:border-white/[0.08]"
                  onClick={() => setTab("stages")}
                >
                  <CheckSquare className="size-4" />
                  Open stages
                </Button>
                {canAssign ? (
                  <Button
                    variant="ghost"
                    className="justify-start border border-transparent hover:border-white/[0.08]"
                    onClick={() => setAssignOpen(true)}
                  >
                    <UserPlus className="size-4" />
                    {data.lead_id ? "Change lead" : "Assign lead"}
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  className="justify-start text-tag-blue hover:bg-tag-blue/10 hover:text-tag-blue/90"
                  onClick={() => setSummariseModalOpen(true)}
                >
                  <Bot className="size-4" />
                  Summarise case
                </Button>
              </div>
            </Card>

            {canManageLifecycle && (
              <CaseLifecycleActions caseId={caseId} status={data.status} />
            )}
          </aside>

          <section className="min-w-0">
            <CaseSummariseModal
              open={summariseModalOpen}
              onOpenChange={setSummariseModalOpen}
              caseId={caseId}
            />
            <AssignLeadDialog
              open={assignOpen}
              onOpenChange={setAssignOpen}
              caseId={caseId}
              caseTitle={data.title}
              currentLeadId={data.lead_id}
              currentLeadName={data.lead_name}
              onAssigned={() => {
                queryClient.invalidateQueries({ queryKey: ["case", caseId] });
                queryClient.invalidateQueries({ queryKey: ["case-team", caseId] });
              }}
            />
            <NewTaskSheet
              open={taskOpen}
              onOpenChange={setTaskOpen}
              defaultCaseId={caseId}
              lockCase
            />
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="flex w-full flex-wrap justify-start gap-1">
                {TABS.map((t) => (
                  <TabsTrigger key={t} value={t} className="capitalize">
                    {t}
                  </TabsTrigger>
                ))}
              </TabsList>

              {TABS.map((t) => (
                <TabsContent key={t} value={t}>
                  {t === "overview" ? (
                    <CaseOverviewTab
                      caseId={caseId}
                      role={role}
                      onOpenDocuments={() => {
                        setTab("documents");
                      }}
                    />
                  ) : t === "stages" ? (
                    <CaseStagesTab caseId={caseId} />
                  ) : t === "notes" ? (
                    <CaseNotesTab caseId={caseId} role={role} />
                  ) : t === "activity" ? (
                    <CaseActivityTab caseId={caseId} />
                  ) : t === "tasks" ? (
                    <CaseTasksTab caseId={caseId} />
                  ) : t === "documents" ? (
                    <CaseDocumentsTab caseId={caseId} />
                  ) : t === "calendar" ? (
                    <CaseCalendarTab caseId={caseId} />
                  ) : t === "team" ? (
                    role === "super_admin" || role === "admin" ? (
                      <CaseTeamTab
                        caseId={caseId}
                        onChangeLead={() => setAssignOpen(true)}
                      />
                    ) : (
                      <Card className="p-6">
                        <p className="text-sm text-muted-foreground">
                          Only admins can manage the case team.
                        </p>
                      </Card>
                    )
                  ) : t === "access" ? (
                    role === "super_admin" || role === "admin" ? (
                      <CaseAccessTab caseId={caseId} />
                    ) : (
                      <Card className="p-6">
                        <p className="text-sm text-muted-foreground">
                          Only admins can view case access.
                        </p>
                      </Card>
                    )
                  ) : (
                    <Card className="p-6">
                      <h3 className="text-sm font-semibold capitalize text-foreground">{t}</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        The {t} view will be built in a later step.
                      </p>
                    </Card>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </section>
        </div>
      )}
    </main>
  );
}

function RailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof User;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="break-words text-foreground">{children}</dd>
      </div>
    </div>
  );
}
