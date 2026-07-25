import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { X, User, Layers, CalendarDays, Activity, AlertTriangle, Clock, ExternalLink, Tag } from "lucide-react";
import { getCaseDrillDown } from "@/lib/drilldown.functions";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { cn } from "@/lib/utils";
import { PremiumLoader } from "@/components/premium-loader";
import { InlineLoaderSkeleton } from "@/components/loading-skeletons";

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

interface CaseDrillDownSheetProps {
  caseId: string | null;
  caseTitle: string;
  onClose: () => void;
}

export function CaseDrillDownSheet({ caseId, caseTitle, onClose }: CaseDrillDownSheetProps) {
  const fetchCase = useServerFn(getCaseDrillDown);
  const { role } = useAuth();
  const canViewActivity = role === "super_admin" || role === "admin";

  const { data, isLoading } = useQuery({
    queryKey: ["case-drilldown", caseId],
    queryFn: () => fetchCase({ data: { caseId: caseId! } }),
    enabled: !!caseId,
    staleTime: 30_000,
  });

  if (!caseId) return null;

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
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border bg-canvas">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-foreground leading-snug">{caseTitle}</h2>
            {data?.case_ref && (
              <p className="text-xs text-muted-foreground mt-0.5">{data.case_ref}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 mt-0.5">
            {data?.health && (
              <StatusDot
                status={HEALTH_MAP[data.health] ?? "ontrack"}
                label={HEALTH_LABELS[data.health] ?? ""}
              />
            )}
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
            <PremiumLoader size="md" label="Loading case…" />
            <InlineLoaderSkeleton lines={4} className="w-full max-w-sm" />
          </div>
        ) : !data ? null : (
          <div className="flex-1 overflow-y-auto">
            {/* Meta row */}
            <div className="px-5 py-4 border-b border-border space-y-2.5">
              {data.case_type && (
                <MetaRow icon={<Tag className="size-3.5" />} label="Type" value={data.case_type} />
              )}
              <MetaRow
                icon={<Layers className="size-3.5" />}
                label="Current Stage"
                value={data.active_stage ?? "No active stage"}
              />
              {data.stage_deadline && (
                <MetaRow
                  icon={<CalendarDays className="size-3.5" />}
                  label="Stage Deadline"
                  value={new Date(data.stage_deadline).toLocaleDateString()}
                  valueClassName={data.stage_deadline < new Date().toISOString().slice(0, 10) ? "text-priority-high font-semibold" : ""}
                />
              )}
              <MetaRow
                icon={<User className="size-3.5" />}
                label="Responsible"
                value={data.responsible_member ?? "Unassigned"}
              />
              <div className="pt-1">
                <Link
                  to="/cases/$caseId"
                  params={{ caseId: data.id }}
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 text-xs text-tag-blue hover:underline"
                >
                  <ExternalLink className="size-3" />
                  Open full case
                </Link>
              </div>
            </div>

            {/* Upcoming deadlines */}
            <Section title="Upcoming Deadlines" icon={<CalendarDays className="size-3.5" />}>
              {data.deadlines.length === 0 ? (
                <p className="text-xs text-muted-foreground px-1">No upcoming deadlines.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.deadlines.map((d, i) => (
                    <li
                      key={i}
                      className={cn(
                        "flex items-center justify-between gap-3 p-2 rounded-[var(--radius-control)] border",
                        d.is_overdue
                          ? "bg-priority-high/5 border-priority-high/20"
                          : "bg-muted/30 border-border",
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {d.is_overdue ? (
                          <AlertTriangle className="size-3.5 text-priority-high shrink-0" />
                        ) : (
                          <Clock className="size-3.5 text-muted-foreground shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className={cn("text-sm truncate", d.is_overdue ? "text-priority-high font-medium" : "text-foreground")}>
                            {d.label}
                          </p>
                          <span className="text-[10px] text-muted-foreground capitalize">{d.type}</span>
                        </div>
                      </div>
                      <span className={cn("text-xs tabular-nums shrink-0", d.is_overdue ? "text-priority-high font-semibold" : "text-muted-foreground")}>
                        {new Date(d.due_date).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {/* Recent activity — admins only */}
            {canViewActivity ? (
              <Section title="Recent Activity" icon={<Activity className="size-3.5" />}>
                {data.activity.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-1">No recent activity.</p>
                ) : (
                  <ol className="relative border-l border-border ml-2 space-y-3 pl-4">
                    {data.activity.map((a, i) => (
                      <li key={i} className="relative">
                        <span className="absolute -left-[1.125rem] top-1 size-2 rounded-full bg-muted-foreground/40 ring-2 ring-canvas" />
                        <p className="text-sm text-foreground capitalize">{a.action}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {a.actor_name ? `${a.actor_name} · ` : ""}
                          {new Date(a.created_at).toLocaleString(undefined, {
                            day: "numeric", month: "short",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </Section>
            ) : null}
          </div>
        )}
      </aside>
    </>
  );
}

function MetaRow({
  icon,
  label,
  value,
  valueClassName,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <span className="text-muted-foreground shrink-0 w-28">{label}</span>
      <span className={cn("text-foreground font-medium", valueClassName)}>{value}</span>
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
