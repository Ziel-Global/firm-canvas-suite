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
import { SettingsSection } from "@/components/settings-section";
import { cn } from "@/lib/utils";

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
      <SettingsSection
        eyebrow="Delivery"
        title="Morning digest"
        description="Daily operations briefing for the Super Admin."
      >
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
          The morning digest is available to the Super Admin only.
        </div>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      eyebrow="Delivery"
      title="Morning digest"
      description={`Daily summary delivered at ${data?.morning_digest_time ?? "—"}. Preview of what goes out.`}
      action={
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 border border-white/[0.08] bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw
            className={cn("h-4 w-4", isFetching && "animate-spin")}
          />
          Refresh
        </Button>
      }
      bare
    >
      {isLoading && (
        <p className="text-sm text-muted-foreground">Assembling digest…</p>
      )}
      {isError && (
        <Card className="border-priority-high/25 bg-[rgba(18,18,20,0.72)] p-5">
          <p className="text-sm text-priority-high">
            {(error as Error).message}
          </p>
        </Card>
      )}

      {data && (
        <Card className="relative overflow-hidden border-white/[0.08] bg-[rgba(18,18,20,0.78)] p-0 shadow-[0_20px_50px_-28px_rgba(0,0,0,0.65)]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
          />
          <div className="border-b border-white/[0.06] bg-white/[0.03] p-5">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Good morning
              {data.recipient_name ? `, ${data.recipient_name}` : ""}
            </p>
            <p className="mt-1.5 text-base font-semibold tracking-tight text-foreground">
              {fmtDate(data.digest_date)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-md bg-white/[0.08] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/85">
                {data.totals.schedule} events
              </span>
              <span className="rounded-md bg-white/[0.08] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/85">
                {data.totals.pending_approvals} approvals
              </span>
              <span className="rounded-md bg-white/[0.08] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/85">
                {data.totals.overdue_tasks} overdue
              </span>
            </div>
          </div>

          <div className="space-y-6 p-5">
            <section>
              <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" />
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
                      className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3"
                    >
                      <div className="w-20 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
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

            <section>
              <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                <FileCheck2 className="h-3.5 w-3.5" />
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
                      className="flex items-start justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3"
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

            <section>
              <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5" />
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
                      className="flex items-start justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3"
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
    </SettingsSection>
  );
}
