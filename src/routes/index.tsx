import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, ShieldAlert } from "lucide-react";

import { Card } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status-dot";
import { getDashboard } from "@/lib/dashboard.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Law Firm Ops" },
      { name: "description", content: "Operations dashboard for the firm." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const fetchDashboard = useServerFn(getDashboard);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchDashboard(),
  });

  const counts = data?.counts ?? {
    on_track: 0,
    at_risk: 0,
    overdue: 0,
    total: 0,
  };
  const attention = data?.attention ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Case health is refreshed hourly from stage deadlines.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <HealthCard
          label="Open cases"
          value={counts.total}
          status={null}
        />
        <HealthCard label="On track" value={counts.on_track} status="ontrack" />
        <HealthCard label="At risk" value={counts.at_risk} status="atrisk" />
        <HealthCard label="Overdue" value={counts.overdue} status="overdue" />
      </div>

      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <ShieldAlert className="size-5 text-priority-high" />
          <h2 className="text-lg font-semibold text-foreground">
            Needs attention
          </h2>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : attention.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No cases are at risk or overdue. Everything is on track.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {attention.map((c) => (
              <li key={c.id}>
                <Link
                  to="/cases/$caseId"
                  params={{ caseId: c.id }}
                  className="flex items-center justify-between gap-3 py-3 transition-colors hover:text-foreground"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {c.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.case_ref ?? "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusDot
                      status={c.health === "overdue" ? "overdue" : "atrisk"}
                      label={c.health === "overdue" ? "Overdue" : "At risk"}
                    />
                    <ArrowRight className="size-4 text-muted-foreground" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function HealthCard({
  label,
  value,
  status,
}: {
  label: string;
  value: number;
  status: "ontrack" | "atrisk" | "overdue" | null;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        {status && <StatusDot status={status} label="" />}
      </div>
      <p className="mt-2 text-3xl font-semibold text-foreground">{value}</p>
    </Card>
  );
}
