import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";

import { getPortalInvoices } from "@/lib/portal.functions";
import { PremiumLoaderPanel } from "@/components/premium-loader";

export const Route = createFileRoute("/portal/invoices")({
  component: PortalInvoicesPage,
});

function money(n: number | null | undefined) {
  return (n ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function PortalInvoicesPage() {
  const loadInvoices = useServerFn(getPortalInvoices);

  const { data, isLoading, error } = useQuery({
    queryKey: ["portal", "invoices"],
    queryFn: () => loadInvoices(),
  });

  if (isLoading) {
    return <PremiumLoaderPanel label="Loading your invoices…" />;
  }

  if (error || !data) {
    return (
      <div className="space-y-4 page-enter">
        <BackLink />
        <div className="glass-card rounded-[var(--radius-card)] p-6 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Unable to load invoices."}
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter space-y-6">
      <BackLink />

      <header className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Client portal
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Invoices
        </h1>
      </header>

      {data.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-white/10 px-4 py-8 text-center text-sm text-muted-foreground">
          No invoices yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {data.map((inv) => (
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
                  <p className="text-[11px] text-muted-foreground">
                    {inv.due_date ? `Due ${inv.due_date}` : "—"}
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
