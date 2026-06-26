import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  FileText,
  Pencil,
  Briefcase,
  History,
} from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { getClientDetail } from "@/lib/clients.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { EditClientSheet } from "@/components/edit-client-sheet";

export const Route = createFileRoute("/clients/$clientId")({
  head: () => ({
    meta: [{ title: "Client — Law Firm Ops" }],
  }),
  component: ClientDetailPage,
  errorComponent: ({ error }) => (
    <main className="px-4 py-6 sm:px-6">
      <p className="text-sm text-destructive" role="alert">
        {error.message}
      </p>
    </main>
  ),
  notFoundComponent: () => (
    <main className="px-4 py-6 sm:px-6">
      <p className="text-sm text-muted-foreground">Client not found.</p>
    </main>
  ),
});

const ALLOWED_ROLES = ["super_admin", "admin", "senior_lawyer", "junior_lawyer"];

const STATUS_LABELS: Record<string, string> = {
  intake: "Intake",
  active: "Active",
  on_hold: "On hold",
  closed: "Closed",
};

const HEALTH_MAP: Record<string, "ontrack" | "atrisk" | "overdue"> = {
  on_track: "ontrack",
  at_risk: "atrisk",
  overdue: "overdue",
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function actionLabel(action: string | null) {
  switch (action) {
    case "client_created":
      return "Client created";
    case "client_updated":
      return "Client details updated";
    case "case_created":
      return "Case created";
    case "case_status_changed":
      return "Case status changed";
    case "task_created":
      return "Task created";
    case "task_status_changed":
      return "Task status changed";
    case "stage_created":
      return "Stage created";
    case "stage_status_changed":
      return "Stage status changed";
    case "document_created":
      return "Document added";
    case "document_lock_changed":
      return "Document lock changed";
    default:
      return action ?? "Activity";
  }
}

function ClientDetailPage() {
  const { clientId } = Route.useParams();
  const { role } = useAuth();
  const router = useRouter();
  const fetchDetail = useServerFn(getClientDetail);
  const [editOpen, setEditOpen] = useState(false);

  const canView = role != null && ALLOWED_ROLES.includes(role);
  const canEdit = role === "super_admin" || role === "admin";

  const { data, isLoading, error } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => fetchDetail({ data: { id: clientId } }),
    enabled: canView,
  });

  if (!canView) {
    return (
      <main className="px-4 py-6 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Client</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to view this page.
        </p>
      </main>
    );
  }

  return (
    <main className="px-4 py-6 sm:px-6">
      <Link
        to="/clients"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to clients
      </Link>

      {isLoading && (
        <p className="mt-8 text-center text-sm text-muted-foreground">Loading client…</p>
      )}
      {error && !isLoading && (
        <p className="mt-8 text-center text-sm text-destructive">Could not load client.</p>
      )}

      {data && (
        <>
          <div className="mt-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                {data.full_name}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{data.client_ref}</p>
            </div>
            {canEdit && (
              <Button onClick={() => setEditOpen(true)} variant="dark">
                <Pencil className="size-4" />
                Edit
              </Button>
            )}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Record */}
            <Card className="space-y-4 p-5 lg:col-span-1">
              <h3 className="text-sm font-semibold text-foreground">Client record</h3>
              <dl className="space-y-3 text-sm">
                <ContactRow icon={Mail} label="Email" value={data.email} />
                <ContactRow icon={Phone} label="Phone" value={data.phone} />
                <ContactRow icon={MapPin} label="Address" value={data.address} />
                <ContactRow icon={FileText} label="Notes" value={data.notes} />
              </dl>
            </Card>

            <div className="space-y-6 lg:col-span-2">
              {/* Linked cases */}
              <Card className="p-5">
                <div className="flex items-center gap-2">
                  <Briefcase className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">
                    Linked cases ({data.cases.length})
                  </h3>
                </div>
                {data.cases.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">No cases linked.</p>
                ) : (
                  <ul className="mt-4 divide-y divide-border">
                    {data.cases.map((c) => (
                      <li
                        key={c.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{c.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.case_ref ?? "—"}
                            {c.current_stage_name ? ` · ${c.current_stage_name}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          {c.health && HEALTH_MAP[c.health] && (
                            <StatusDot status={HEALTH_MAP[c.health]} label="" />
                          )}
                          <Badge variant="secondary">
                            {STATUS_LABELS[c.status] ?? c.status}
                          </Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* Contact history */}
              <Card className="p-5">
                <div className="flex items-center gap-2">
                  <History className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">
                    Contact history ({data.history.length})
                  </h3>
                </div>
                {data.history.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">No activity recorded.</p>
                ) : (
                  <ol className="mt-4 space-y-4">
                    {data.history.map((h) => (
                      <li key={h.id} className="flex gap-3">
                        <span className="mt-1.5 size-2 shrink-0 rounded-pill bg-primary" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {actionLabel(h.action)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(h.created_at)}
                            {h.actor_name ? ` · ${h.actor_name}` : ""}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            </div>
          </div>

          {canEdit && (
            <EditClientSheet
              client={data}
              open={editOpen}
              onOpenChange={(open) => {
                setEditOpen(open);
                if (!open) router.invalidate();
              }}
            />
          )}
        </>
      )}
    </main>
  );
}

function ContactRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="whitespace-pre-wrap break-words text-foreground">{value || "—"}</dd>
      </div>
    </div>
  );
}
