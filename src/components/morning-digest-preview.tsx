import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarClock,
  FileCheck2,
  Lock,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

import { getMorningDigest } from "@/lib/morning-digest.functions";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Tag } from "@/components/ui/tag";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function caseLabel(ref: string | null, title: string | null) {
  if (!ref && !title) return null;
  return [ref, title].filter(Boolean).join(" · ");
}

const priorityColor: Record<string, "high" | "medium" | "low"> = {
  high: "high",
  medium: "medium",
  low: "low",
};

export function MorningDigestPreview() {
  const { role } = useAuth();
  const fetchDigest = useServerFn(getMorningDigest);
  const [date] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["morning-digest", date],
    queryFn: () => fetchDigest({ data: { date } }),
    enabled: role === "super_admin",
  });

  if (role !== "super_admin") {
    return (
      <Card className="p-5">
        <p className="text-sm text-muted-foreground">
          The morning digest is available to the Super Admin only.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Morning digest
          </h2>
          <p className="text-sm text-muted-foreground">
            Daily summary delivered at{" "}
            <span className="font-medium text-foreground">
              {data?.morning_digest_time ?? "—"}
            </span>
            . Preview of what goes out.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">Assembling digest…</p>
      )}
      {isError && (
        <Card className="p-5">
          <p className="text-sm text-priority-high">
            {(error as Error).message}
          </p>
        </Card>
      )}

      {data && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-border bg-surface-dark p-5 text-surface">
            <p className="text-xs uppercase tracking-wide text-surface/60">
              Good morning{data.recipient_name ? `, ${data.recipient_name}` : ""}
            </p>
            <p className="mt-1 text-base font-semibold">
              {fmtDate(data.digest_date)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-pill bg-surface/10 px-2.5 py-1">
                {data.totals.schedule} events
              </span>
              <span className="rounded-pill bg-surface/10 px-2.5 py-1">
                {data.totals.pending_approvals} approvals
              </span>
              <span className="rounded-pill bg-surface/10 px-2.5 py-1">
                {data.totals.overdue_tasks} overdue
              </span>
            </div>
          </div>

          <div className="space-y-6 p-5">
            {/* Schedule */}
            <section>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <CalendarClock className="h-4 w-4 text-priority-med" />
                Today&apos;s schedule
              </div>
              {data.schedule.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No events scheduled.
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.schedule.map((e) => (
                    <li
                      key={e.id}
                      className="flex items-start gap-3 rounded-control border border-border p-3"
                    >
                      <div className="w-20 shrink-0 text-xs font-medium text-muted-foreground">
                        {fmtTime(e.starts_at)}
                        {e.ends_at ? `–${fmtTime(e.ends_at)}` : ""}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-medium text-foreground">
                            {e.title}
                          </p>
                          {e.is_private && (
                            <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {[
                            e.event_type,
                            e.location,
                            caseLabel(e.case_ref, e.case_title),
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Pending approvals */}
            <section>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <FileCheck2 className="h-4 w-4 text-status-atrisk" />
                Pending approvals
              </div>
              {data.pending_approvals.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing awaiting approval.
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.pending_approvals.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-start justify-between gap-3 rounded-control border border-border p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {a.document_title ?? "Approval request"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[
                            caseLabel(a.case_ref, a.case_title),
                            a.submitted_by_name
                              ? `by ${a.submitted_by_name}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {fmtDate(a.submitted_at.slice(0, 10))
                          .split(",")[0]
                          .trim()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Overdue tasks */}
            <section>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <AlertTriangle className="h-4 w-4 text-priority-high" />
                Overdue tasks
              </div>
              {data.overdue_tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No overdue tasks.
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.overdue_tasks.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-start justify-between gap-3 rounded-control border border-border p-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-foreground">
                            {t.title}
                          </p>
                          {t.priority && (
                            <Tag color={priorityColor[t.priority] ?? "low"}>
                              {t.priority}
                            </Tag>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {[
                            caseLabel(t.case_ref, t.case_title),
                            t.assignee_name,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
                      </div>
                      <Pill className="shrink-0 bg-priority-high/15 text-priority-high">
                        {t.days_overdue}d late
                      </Pill>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </Card>
      )}
    </div>
  );
}
