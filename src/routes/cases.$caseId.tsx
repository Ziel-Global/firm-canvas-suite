import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  User,
  Briefcase,
  CalendarClock,
  CalendarDays,
  Pencil,
  Plus,
  CheckSquare,
  Activity,
  Bot,
} from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { getCaseDetail } from "@/lib/cases.functions";
import { getMyCaseAccess } from "@/lib/case-access.functions";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusDot, type StatusDotProps } from "@/components/ui/status-dot";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CaseOverviewTab } from "@/components/case-overview-tab";
import { CaseNotesTab } from "@/components/case-notes-tab";
import { CaseActivityTab } from "@/components/case-activity-tab";
import { CaseAccessTab } from "@/components/case-access-tab";
import { CaseTasksTab } from "@/components/case-tasks-tab";
import { CaseStagesTab } from "@/components/case-stages-tab";
import { CaseDocumentsTab } from "@/components/case-documents-tab";
import { CaseLifecycleActions } from "@/components/case-lifecycle-actions";
import { CaseSummariseModal } from "@/components/case-summarise-modal";

export const Route = createFileRoute("/cases/$caseId")({
  head: () => ({
    meta: [{ title: "Case — Law Firm Ops" }],
  }),
  component: CaseDetailPage,
  errorComponent: ({ error }) => (
    <main className="px-4 py-6 sm:px-6">
      <p className="text-sm text-destructive" role="alert">
        {error.message}
      </p>
    </main>
  ),
  notFoundComponent: () => (
    <main className="px-4 py-6 sm:px-6">
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

const TABS = [
  "overview",
  "stages",
  "tasks",
  "documents",
  "calendar",
  "notes",
  "access",
  "activity",
] as const;

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
  const { role } = useAuth();
  const fetchDetail = useServerFn(getCaseDetail);
  const checkMyAccess = useServerFn(getMyCaseAccess);
  const [tab, setTab] = useState<string>("overview");
  const [summariseModalOpen, setSummariseModalOpen] = useState(false);

  const canView = role != null && ALLOWED_ROLES.includes(role);

  // Poll the caller's effective access so a revoked override signs them out of
  // this case immediately (RLS enforces it; this surfaces it in the UI).
  const { data: myAccess } = useQuery({
    queryKey: ["my-case-access", caseId],
    queryFn: () => checkMyAccess({ data: { caseId } }),
    enabled: canView,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
  const accessRevoked = myAccess?.level === "none";

  const { data, isLoading, error } = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => fetchDetail({ data: { id: caseId } }),
    enabled: canView && !accessRevoked,
  });

  if (!canView) {
    return (
      <main className="px-4 py-6 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Case</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to view this page.
        </p>
      </main>
    );
  }

  if (accessRevoked) {
    return (
      <main className="px-4 py-6 sm:px-6">
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
    <main className="px-4 py-6 sm:px-6">
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
          {/* Left summary rail */}
          <aside className="space-y-4">
            <Card className="space-y-5 p-5">
              <div>
                <p className="text-xs text-muted-foreground">{data.case_ref ?? "—"}</p>
                <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-foreground">
                  {data.title}
                </h2>
              </div>

              <div className="flex flex-wrap gap-2">
                {data.case_type && <Tag color="blue">{data.case_type}</Tag>}
                {data.status && (
                  <Tag color="sand">{STATUS_LABELS[data.status] ?? data.status}</Tag>
                )}
              </div>

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
                  {data.lead_name ?? "—"}
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

            <Card className="space-y-2 p-5">
              <h3 className="text-sm font-semibold text-foreground">Quick actions</h3>
              <div className="grid gap-2">
                <Button variant="ghost" className="justify-start" disabled>
                  <Plus className="size-4" />
                  New task
                </Button>
                <Button variant="ghost" className="justify-start" disabled>
                  <CalendarDays className="size-4" />
                  Add event
                </Button>
                <Button variant="ghost" className="justify-start" disabled>
                  <Pencil className="size-4" />
                  Edit case
                </Button>
                <Button variant="ghost" className="justify-start text-tag-blue hover:text-tag-blue/90 hover:bg-tag-blue/10" onClick={() => setSummariseModalOpen(true)}>
                  <Bot className="size-4" />
                  Summarise case
                </Button>
              </div>
            </Card>

            {role === "super_admin" && (
              <CaseLifecycleActions caseId={caseId} status={data.status} />
            )}
          </aside>

          {/* Tabbed main area */}
          <section className="min-w-0">
            <CaseSummariseModal open={summariseModalOpen} onOpenChange={setSummariseModalOpen} caseId={caseId} />
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
                    <CaseOverviewTab caseId={caseId} role={role} />
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
                  ) : t === "access" ? (
                    role === "super_admin" ? (
                      <CaseAccessTab caseId={caseId} />
                    ) : (
                      <Card className="p-6">
                        <p className="text-sm text-muted-foreground">
                          Only super admins can view case access.
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
