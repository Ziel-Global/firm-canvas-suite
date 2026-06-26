import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity as ActivityIcon,
  CalendarClock,
  CheckSquare,
  ClipboardList,
  Plus,
  CalendarDays,
  Pencil,
  Upload,
  UserCheck,
} from "lucide-react";

import { getCaseOverview } from "@/lib/cases.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { StatusDot, type StatusDotProps } from "@/components/ui/status-dot";

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

const STAGE_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  in_progress: "In progress",
  blocked: "Blocked",
  complete: "Complete",
};

function actionLabel(action: string | null) {
  switch (action) {
    case "case_created":
      return "Case created";
    case "case_status_changed":
      return "Case status changed";
    case "stage_created":
      return "Stage created";
    case "stage_status_changed":
      return "Stage status changed";
    case "task_created":
      return "Task created";
    case "task_status_changed":
      return "Task status changed";
    case "document_created":
      return "Document added";
    case "document_lock_changed":
      return "Document lock changed";
    case "client_updated":
      return "Client details updated";
    default:
      return action ?? "Activity";
  }
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function daysUntil(value: string | null): number | null {
  if (!value) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function CaseOverviewTab({
  caseId,
  role,
}: {
  caseId: string;
  role: string | null;
}) {
  const fetchOverview = useServerFn(getCaseOverview);
  const { data, isLoading, error } = useQuery({
    queryKey: ["case-overview", caseId],
    queryFn: () => fetchOverview({ data: { id: caseId } }),
  });

  if (isLoading) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Loading overview…</p>
      </Card>
    );
  }
  if (error || !data) {
    return (
      <Card className="p-6">
        <p className="text-sm text-destructive">Could not load overview.</p>
      </Card>
    );
  }

  const dd = daysUntil(data.next_deadline);
  const deadlineHint =
    dd == null
      ? "No upcoming deadline"
      : dd < 0
        ? `${Math.abs(dd)} day${Math.abs(dd) === 1 ? "" : "s"} overdue`
        : dd === 0
          ? "Due today"
          : `In ${dd} day${dd === 1 ? "" : "s"}`;

  const canManage =
    role === "super_admin" ||
    role === "admin" ||
    role === "senior_lawyer" ||
    role === "junior_lawyer";
  const canEditCase = role === "super_admin" || role === "admin";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Current stage + responsible person */}
        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <CheckSquare className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Current stage</h3>
          </div>
          <p className="text-lg font-semibold text-foreground">
            {data.current_stage_name ?? "No active stage"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {data.current_stage_status && (
              <Tag color="purple">
                {STAGE_STATUS_LABELS[data.current_stage_status] ??
                  data.current_stage_status}
              </Tag>
            )}
            {data.total_stages > 0 && (
              <span className="text-xs text-muted-foreground">
                Stage {data.completed_stages + 1} of {data.total_stages}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <UserCheck className="size-4" />
            <span>
              Responsible:{" "}
              <span className="text-foreground">
                {data.current_stage_assignee ?? "Unassigned"}
              </span>
            </span>
          </div>
        </Card>

        {/* Next deadline */}
        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Next deadline</h3>
          </div>
          <p className="text-lg font-semibold text-foreground">
            {formatDate(data.next_deadline)}
          </p>
          <p
            className={
              dd != null && dd < 0
                ? "text-sm font-medium text-destructive"
                : "text-sm text-muted-foreground"
            }
          >
            {deadlineHint}
          </p>
          {data.next_deadline_stage && (
            <p className="text-xs text-muted-foreground">
              For stage: {data.next_deadline_stage}
            </p>
          )}
        </Card>
      </div>

      {/* Health panel */}
      <Card className="p-5">
        <div className="flex items-center gap-2">
          <ActivityIcon className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Health</h3>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {data.health && HEALTH_MAP[data.health] && (
                <StatusDot status={HEALTH_MAP[data.health]} label="" />
              )}
              <span className="text-sm font-semibold text-foreground">
                {data.health ? HEALTH_LABELS[data.health] ?? data.health : "—"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Overall health</p>
          </div>
          <Metric
            value={`${data.completed_stages}/${data.total_stages}`}
            label="Stages complete"
          />
          <Metric value={data.open_tasks} label="Open tasks" />
          <Metric
            value={data.overdue_stages}
            label="Overdue stages"
            alert={data.overdue_stages > 0}
          />
        </div>
      </Card>

      {/* Recent activity */}
      <Card className="p-5">
        <div className="flex items-center gap-2">
          <ClipboardList className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Recent activity</h3>
        </div>
        {data.activity.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No activity recorded.</p>
        ) : (
          <ol className="mt-4 space-y-4">
            {data.activity.map((a) => (
              <li key={a.id} className="flex gap-3">
                <span className="mt-1.5 size-2 shrink-0 rounded-pill bg-primary" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {actionLabel(a.action)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(a.created_at)}
                    {a.actor_name ? ` · ${a.actor_name}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* Role-appropriate quick actions */}
      {canManage && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-foreground">Quick actions</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="ghost" disabled>
              <Plus className="size-4" />
              New task
            </Button>
            <Button variant="ghost" disabled>
              <Upload className="size-4" />
              Upload document
            </Button>
            <Button variant="ghost" disabled>
              <CalendarDays className="size-4" />
              Add event
            </Button>
            {canEditCase && (
              <Button variant="ghost" disabled>
                <Pencil className="size-4" />
                Edit case
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function Metric({
  value,
  label,
  alert,
}: {
  value: string | number;
  label: string;
  alert?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p
        className={
          alert
            ? "text-lg font-semibold text-destructive"
            : "text-lg font-semibold text-foreground"
        }
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
