import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";

import { getPortalInvoiceDetail } from "@/lib/portal.functions";
import { PremiumLoaderPanel } from "@/components/premium-loader";

export const Route = createFileRoute("/portal/invoices/$invoiceId")({
  component: PortalInvoiceDetailPage,
});

const STATUS_LABELS: Record<string, string> = {
  sent: "Sent",
  partially_paid: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};

function money(n: number | null | undefined) {
  return (n ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function PortalInvoiceDetailPage() {
  const { invoiceId } = Route.useParams();
  const loadInvoice = useServerFn(getPortalInvoiceDetail);

  const { data, isLoading, error } = useQuery({
    queryKey: ["portal", "invoice", invoiceId],
    queryFn: () => loadInvoice({ data: { invoiceId } }),
  });

  if (isLoading) {
    return <PremiumLoaderPanel label="Loading invoice…" />;
  }

  if (error || !data) {
    return (
      <div className="space-y-4 page-enter">
        <BackLink />
        <div className="glass-card rounded-[var(--radius-card)] p-6 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Invoice not found."}
        </div>
      </div>
    );
  }

  const balanceDue = Math.max(0, data.total - data.amount_paid);

  return (
    <div className="page-enter space-y-6">
      <BackLink />

      <header className="space-y-2">
        <p className="font-mono text-xs text-muted-foreground">{data.invoice_number}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {data.case_title ?? "Matter"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {STATUS_LABELS[data.status] ?? data.status}
          {data.due_date ? ` · Due ${data.due_date}` : ""}
        </p>
      </header>

      <dl className="glass-card grid gap-4 rounded-[var(--radius-card)] p-5 sm:grid-cols-3">
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Total</dt>
          <dd className="mt-1 text-sm font-medium text-foreground">{money(data.total)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Paid</dt>
          <dd className="mt-1 text-sm font-medium text-foreground">{money(data.amount_paid)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Balance due</dt>
          <dd className="mt-1 text-sm font-medium text-foreground">{money(balanceDue)}</dd>
        </div>
      </dl>

      <div className="glass-card overflow-hidden rounded-[var(--radius-card)] p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Description</th>
                <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                <th className="px-4 py-2.5 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.line_items.map((li) => (
                <tr key={li.id} className="border-b border-white/[0.06] last:border-0">
                  <td className="px-4 py-2.5 text-foreground/90">{li.description}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {li.quantity ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{money(li.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Questions about this invoice? Contact the firm directly — payments are recorded by staff.
      </p>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/portal/invoices"
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" />
      Back to invoices
    </Link>
  );
}
