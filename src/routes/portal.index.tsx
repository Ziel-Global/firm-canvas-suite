import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Briefcase, Calendar, Download, FileText, ChevronRight, Receipt } from "lucide-react";
import { format, parseISO } from "date-fns";

import {
  getPortalDocumentDownloadUrl,
  getPortalHome,
  getPortalInvoices,
} from "@/lib/portal.functions";
import { PremiumLoaderPanel } from "@/components/premium-loader";
import { StatusDot } from "@/components/ui/status-dot";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/portal/")({
  component: PortalHomePage,
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

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "d MMM yyyy · h:mm a");
  } catch {
    return iso;
  }
}

function money(n: number | null | undefined) {
  return (n ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function PortalHomePage() {
  const loadHome = useServerFn(getPortalHome);
  const getDownload = useServerFn(getPortalDocumentDownloadUrl);
  const loadInvoices = useServerFn(getPortalInvoices);

  const { data, isLoading, error } = useQuery({
    queryKey: ["portal", "home"],
    queryFn: () => loadHome(),
  });

  const invoicesQuery = useQuery({
    queryKey: ["portal", "invoices"],
    queryFn: () => loadInvoices(),
  });
  const invoices = (invoicesQuery.data ?? []).slice(0, 3);

  const download = useMutation({
    mutationFn: (documentId: string) => getDownload({ data: { documentId } }),
    onSuccess: (result) => {
      window.open(result.url, "_blank", "noopener,noreferrer");
    },
  });

  if (isLoading) {
    return <PremiumLoaderPanel label="Loading your matters…" />;
  }

  if (error || !data) {
    return (
      <div className="glass-card page-enter rounded-[var(--radius-card)] p-6 text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "Unable to load the portal."}
      </div>
    );
  }

  return (
    <div className="page-enter space-y-10">
      <header className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Client portal
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {data.clientName ? `Welcome, ${data.clientName}` : "Your matters"}
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Matter status, documents shared with you, and upcoming hearing dates —
          nothing else from the firm workspace.
        </p>
      </header>

      <section className="space-y-3">
        <div className="flex items-center gap-2 text-foreground">
          <Briefcase className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-wide">Your matters</h2>
        </div>
        {data.cases.length === 0 ? (
          <EmptyState message="No matters are linked to your account yet." />
        ) : (
          <ul className="space-y-2">
            {data.cases.map((c) => {
              const health = c.health ? HEALTH_MAP[c.health] : undefined;
              return (
                <li key={c.id}>
                  <Link
                    to="/portal/cases/$caseId"
                    params={{ caseId: c.id }}
                    className={cn(
                      "glass-card group flex items-center justify-between gap-4 rounded-[var(--radius-card)] px-4 py-3.5",
                      "transition-colors hover:border-white/20",
                    )}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {c.case_ref ? (
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {c.case_ref}
                          </span>
                        ) : null}
                        {c.status ? (
                          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                            {STATUS_LABELS[c.status] ?? c.status}
                          </span>
                        ) : null}
                      </div>
                      <p className="truncate text-sm font-medium text-foreground">
                        {c.title}
                      </p>
                      {health ? (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <StatusDot status={health} label="" className="gap-0 text-xs" />
                          <span className="capitalize">{c.health?.replaceAll("_", " ")}</span>
                        </div>
                      ) : null}
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-60 transition group-hover:opacity-100" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-foreground">
            <Receipt className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-wide">Invoices</h2>
          </div>
          {invoicesQuery.data && invoicesQuery.data.length > 0 ? (
            <Link
              to="/portal/invoices"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              View all
            </Link>
          ) : null}
        </div>
        {invoices.length === 0 ? (
          <EmptyState message="No invoices yet." />
        ) : (
          <ul className="space-y-2">
            {invoices.map((inv) => (
              <li key={inv.id}>
                <Link
                  to="/portal/invoices/$invoiceId"
                  params={{ invoiceId: inv.id }}
                  className="glass-card flex items-center justify-between gap-4 rounded-[var(--radius-card)] px-4 py-3.5 transition-colors hover:border-white/20"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-mono text-[11px] text-muted-foreground">{inv.invoice_number}</p>
                    <p className="truncate text-sm font-medium text-foreground">
                      {inv.case_title ?? "Matter"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium text-foreground">{money(inv.total)}</p>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {inv.status.replace(/_/g, " ")}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2 text-foreground">
          <Calendar className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-wide">Upcoming hearings</h2>
        </div>
        {data.hearings.length === 0 ? (
          <EmptyState message="No upcoming hearings on your matters." />
        ) : (
          <ul className="space-y-2">
            {data.hearings.map((h) => (
              <li
                key={h.id}
                className="glass-card rounded-[var(--radius-card)] px-4 py-3.5"
              >
                <p className="text-sm font-medium text-foreground">
                  {h.title ?? "Hearing"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatWhen(h.starts_at)}
                  {h.location ? ` · ${h.location}` : ""}
                </p>
                {(h.case_ref || h.case_title) && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {h.case_ref ? `${h.case_ref} · ` : ""}
                    {h.case_title}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2 text-foreground">
          <FileText className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-wide">Shared documents</h2>
        </div>
        {data.documents.length === 0 ? (
          <EmptyState message="No documents have been shared with you yet." />
        ) : (
          <ul className="space-y-2">
            {data.documents.map((d) => (
              <li
                key={d.id}
                className="glass-card flex items-center justify-between gap-3 rounded-[var(--radius-card)] px-4 py-3.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {d.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[d.doc_type, d.case_ref, d.case_title].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {d.can_download ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    disabled={download.isPending}
                    onClick={() => download.mutate(d.id)}
                  >
                    <Download className="size-3.5" />
                    Download
                  </Button>
                ) : (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    View only
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-white/10 px-4 py-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
