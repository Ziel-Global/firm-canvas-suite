import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity as ActivityIcon } from "lucide-react";

import { getCaseActivity } from "@/lib/cases.functions";
import { Card } from "@/components/ui/card";

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

function describeDetail(
  action: string | null,
  detail: Record<string, unknown> | null,
): string | null {
  if (!detail) return null;
  const get = (k: string) => {
    const v = detail[k];
    return v == null ? null : String(v);
  };
  switch (action) {
    case "case_created":
      return [get("case_ref"), get("title")].filter(Boolean).join(" · ") || null;
    case "case_status_changed":
    case "stage_status_changed":
    case "task_status_changed":
    case "document_lock_changed": {
      const name = get("title") ?? get("name");
      const transition =
        get("from") && get("to") ? `${get("from")} → ${get("to")}` : null;
      return [name, transition].filter(Boolean).join(" · ") || null;
    }
    case "stage_created":
    case "task_created":
    case "document_created":
      return get("title") ?? get("name");
    default:
      return get("title") ?? get("name");
  }
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CaseActivityTab({ caseId }: { caseId: string }) {
  const fetchActivity = useServerFn(getCaseActivity);
  const { data, isLoading, error } = useQuery({
    queryKey: ["case-activity", caseId],
    queryFn: () => fetchActivity({ data: { caseId } }),
  });

  if (isLoading) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Loading activity…</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <p className="text-sm text-destructive">Could not load activity.</p>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <ActivityIcon className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Activity timeline</h3>
      </div>

      <ol className="relative space-y-5 border-l border-border pl-5">
        {data.map((entry) => {
          const detail = describeDetail(entry.action, entry.detail);
          return (
            <li key={entry.id} className="relative">
              <span className="absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full bg-primary ring-4 ring-background" />
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium text-foreground">
                  {actionLabel(entry.action)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatTimestamp(entry.created_at)}
                </span>
              </div>
              {detail && (
                <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>
              )}
              <p className="mt-0.5 text-xs text-muted-foreground">
                by {entry.actor_name ?? "System"}
              </p>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
