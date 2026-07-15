import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { X, Briefcase, CheckSquare, AlertTriangle, Clock, Zap, Loader2, ExternalLink } from "lucide-react";
import { getMemberDrillDown } from "@/lib/drilldown.functions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BANDWIDTH_CONFIG = {
  available: { label: "Available", className: "bg-tag-green/15 text-tag-green border-tag-green/30" },
  moderate: { label: "Moderate Load", className: "bg-tag-blue/15 text-tag-blue border-tag-blue/30" },
  high: { label: "High Load", className: "bg-tag-sand/20 text-amber-700 dark:text-amber-400 border-tag-sand/40" },
  overloaded: { label: "Overloaded", className: "bg-priority-high/15 text-priority-high border-priority-high/30" },
};

const STATUS_COLORS: Record<string, string> = {
  on_track: "bg-tag-green/20 text-tag-green",
  at_risk: "bg-tag-sand/20 text-amber-700 dark:text-amber-400",
  overdue: "bg-priority-high/15 text-priority-high",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-priority-high",
  medium: "text-amber-600 dark:text-amber-400",
  low: "text-muted-foreground",
};

interface MemberDrillDownSheetProps {
  memberId: string | null;
  memberName: string;
  onClose: () => void;
}

export function MemberDrillDownSheet({ memberId, memberName, onClose }: MemberDrillDownSheetProps) {
  const fetchMember = useServerFn(getMemberDrillDown);

  const { data, isLoading } = useQuery({
    queryKey: ["member-drilldown", memberId],
    queryFn: () => fetchMember({ data: { memberId: memberId! } }),
    enabled: !!memberId,
    staleTime: 30_000,
  });

  if (!memberId) return null;

  const bw = data ? BANDWIDTH_CONFIG[data.bandwidth] : null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Sheet */}
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-canvas border-l border-border shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border bg-canvas">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground truncate">{memberName}</h2>
            {data && (
              <p className="text-xs text-muted-foreground capitalize">{data.role.replace(/_/g, " ")}</p>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
            <X className="size-4" />
          </Button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data ? null : (
          <div className="flex-1 overflow-y-auto">
            {/* Bandwidth + stats */}
            <div className="px-5 py-4 border-b border-border space-y-3">
              <div className={cn("inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border", bw?.className)}>
                <Zap className="size-3" />
                {bw?.label}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Stat icon={<Briefcase className="size-4 text-tag-blue" />} label="Cases" value={data.active_cases} />
                <Stat icon={<CheckSquare className="size-4 text-tag-blue" />} label="Open Tasks" value={data.open_tasks} />
                <Stat
                  icon={<AlertTriangle className="size-4 text-priority-high" />}
                  label="Overdue"
                  value={data.overdue_tasks}
                  alert={data.overdue_tasks > 0}
                />
              </div>
            </div>

            {/* Assigned cases */}
            <Section title="Assigned Cases" icon={<Briefcase className="size-3.5" />}>
              {data.cases.length === 0 ? (
                <p className="text-xs text-muted-foreground px-1">No active cases assigned.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.cases.map((c) => (
                    <li key={c.id}>
                      <Link
                        to="/cases/$caseId"
                        params={{ caseId: c.id }}
                        onClick={onClose}
                        className="flex items-center justify-between gap-2 p-2 rounded-[var(--radius-control)] hover:bg-muted/50 transition-colors group"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{c.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.case_ref ?? ""}{c.active_stage ? ` · ${c.active_stage}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {c.health && (
                            <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded capitalize", STATUS_COLORS[c.health] ?? "bg-muted text-muted-foreground")}>
                              {c.health.replace(/_/g, " ")}
                            </span>
                          )}
                          <ExternalLink className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {/* Task list */}
            <Section title="Open Tasks" icon={<CheckSquare className="size-3.5" />}>
              {data.tasks.length === 0 ? (
                <p className="text-xs text-muted-foreground px-1">No open tasks.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.tasks.map((t) => (
                    <li
                      key={t.id}
                      className={cn(
                        "flex items-start gap-3 p-2 rounded-[var(--radius-control)] border",
                        t.is_overdue
                          ? "bg-priority-high/5 border-priority-high/20"
                          : "bg-muted/30 border-border",
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-medium truncate", t.is_overdue ? "text-priority-high" : "text-foreground")}>
                          {t.title}
                        </p>
                        {t.case_title && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{t.case_title}</p>
                        )}
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        {t.priority && (
                          <span className={cn("text-[10px] font-semibold capitalize", PRIORITY_COLORS[t.priority] ?? "")}>
                            {t.priority}
                          </span>
                        )}
                        {t.due_date && (
                          <span className={cn("flex items-center gap-1 text-[10px]", t.is_overdue ? "text-priority-high" : "text-muted-foreground")}>
                            <Clock className="size-2.5" />
                            {new Date(t.due_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        )}
      </aside>
    </>
  );
}

function Stat({ icon, label, value, alert }: { icon: React.ReactNode; label: string; value: number; alert?: boolean }) {
  return (
    <div className="bg-muted/40 rounded-[var(--radius-control)] p-3 text-center space-y-1">
      <div className="flex justify-center">{icon}</div>
      <p className={cn("text-xl font-bold tabular-nums", alert && value > 0 ? "text-priority-high" : "text-foreground")}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4 border-b border-border last:border-0">
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-muted-foreground">{icon}</span>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}
