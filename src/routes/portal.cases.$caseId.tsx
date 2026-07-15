import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { format, parseISO } from "date-fns";

import { getPortalCase } from "@/lib/portal.functions";
import { PremiumLoaderPanel } from "@/components/premium-loader";
import { StatusDot } from "@/components/ui/status-dot";

export const Route = createFileRoute("/portal/cases/$caseId")({
  component: PortalCasePage,
});

const HEALTH_MAP: Record<string, "ontrack" | "atrisk" | "overdue"> = {
  on_track: "ontrack",
  at_risk: "atrisk",
  overdue: "overdue",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  on_hold: "On hold",
  closed: "Closed",
  archived: "Archived",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "d MMMM yyyy");
  } catch {
    return iso;
  }
}

function PortalCasePage() {
  const { caseId } = Route.useParams();
  const loadCase = useServerFn(getPortalCase);

  const { data, isLoading, error } = useQuery({
    queryKey: ["portal", "case", caseId],
    queryFn: () => loadCase({ data: { id: caseId } }),
  });

  if (isLoading) {
    return <PremiumLoaderPanel label="Loading case…" />;
  }

  if (error || !data) {
    return (
      <div className="space-y-4 page-enter">
        <BackLink />
        <div className="glass-card rounded-[var(--radius-card)] p-6 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Case not found."}
        </div>
      </div>
    );
  }

  const health = data.health ? HEALTH_MAP[data.health] : undefined;

  return (
    <div className="page-enter space-y-6">
      <BackLink />

      <header className="space-y-2">
        {data.case_ref ? (
          <p className="font-mono text-xs text-muted-foreground">{data.case_ref}</p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {data.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          Status only — internal notes and team activity are not shown here.
        </p>
      </header>

      <dl className="glass-card grid gap-4 rounded-[var(--radius-card)] p-5 sm:grid-cols-2">
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Status
          </dt>
          <dd className="mt-1 text-sm font-medium text-foreground">
            {data.status ? STATUS_LABELS[data.status] ?? data.status : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Health
          </dt>
          <dd className="mt-1 flex items-center gap-1.5 text-sm font-medium text-foreground">
            {health ? (
              <StatusDot status={health} label="" className="gap-0" />
            ) : null}
            <span className="capitalize">
              {data.health?.replaceAll("_", " ") ?? "—"}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Type
          </dt>
          <dd className="mt-1 text-sm font-medium capitalize text-foreground">
            {data.case_type?.replaceAll("_", " ") ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Opened
          </dt>
          <dd className="mt-1 text-sm font-medium text-foreground">
            {formatDate(data.opened_at)}
          </dd>
        </div>
        {data.closed_at ? (
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Closed
            </dt>
            <dd className="mt-1 text-sm font-medium text-foreground">
              {formatDate(data.closed_at)}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/portal"
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" />
      Back to portal
    </Link>
  );
}
