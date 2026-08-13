import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { listInvoices } from "@/lib/invoices.functions";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { PremiumSelect } from "@/components/premium-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/loading-skeletons";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/billing")({
  head: () => ({
    meta: [
      { title: "Verdio" },
      { name: "description", content: "Invoices across the firm's matters." },
    ],
  }),
  component: BillingPage,
});

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  partially_paid: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "partially_paid", label: "Partially paid" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "void", label: "Void" },
];

function money(n: number | null | undefined) {
  return (n ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function BillingPage() {
  const { role } = useAuth();
  const fetchInvoices = useServerFn(listInvoices);
  const [statusFilter, setStatusFilter] = useState("all");

  const isAdmin = role === "super_admin" || role === "admin";

  const { data, isLoading, error } = useQuery({
    queryKey: ["billing-invoices"],
    queryFn: () => fetchInvoices({ data: {} }),
    enabled: isAdmin,
  });

  const rows = useMemo(() => {
    if (!data) return [];
    if (statusFilter === "all") return data;
    return data.filter((inv) => inv.status === statusFilter);
  }, [data, statusFilter]);

  const totals = useMemo(() => {
    const outstanding = rows
      .filter((r) => ["sent", "partially_paid", "overdue"].includes(r.status))
      .reduce((sum, r) => sum + (r.total - r.amount_paid), 0);
    const paid = rows.filter((r) => r.status === "paid").reduce((sum, r) => sum + r.total, 0);
    return { outstanding, paid };
  }, [rows]);

  if (!isAdmin) {
    return (
      <main className="dashboard-shell px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Billing</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to view this page.
        </p>
      </main>
    );
  }

  return (
    <main className="dashboard-shell min-h-[calc(100dvh-3.5rem)] px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
      <div className="mx-auto w-full max-w-[1440px] space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Firm
            </p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
              Billing
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Every invoice across the firm's matters
            </p>
          </div>
        </div>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Outstanding</p>
            <p className="mt-1 text-lg font-semibold text-priority-high">{money(totals.outstanding)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Paid</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{money(totals.paid)}</p>
          </Card>
        </section>

        <Card className="border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-3 sm:p-4">
          <PremiumSelect
            aria-label="Filter by status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_OPTIONS}
            emptyLabel="All statuses"
            className="h-10 lg:w-48"
          />
        </Card>

        {isLoading ? (
          <TableSkeleton rows={7} cols={6} />
        ) : error ? (
          <p className="py-10 text-center text-sm text-destructive">Could not load invoices.</p>
        ) : rows.length === 0 ? (
          <Card className="border-white/[0.08] bg-[rgba(18,18,20,0.72)] px-6 py-14 text-center">
            <p className="text-sm font-medium text-foreground">No invoices found</p>
          </Card>
        ) : (
          <Card className="relative overflow-hidden border-white/[0.08] bg-[rgba(18,18,20,0.78)] p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/[0.06] hover:bg-transparent">
                    <TableHead>Number</TableHead>
                    <TableHead>Matter</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((inv) => (
                    <TableRow key={inv.id} className="border-white/[0.05]">
                      <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                      <TableCell className="max-w-[220px] truncate">{inv.case_title ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{inv.client_name ?? "—"}</TableCell>
                      <TableCell>
                        <Pill
                          className={cn(
                            "text-[10px]",
                            inv.status === "paid"
                              ? "bg-emerald-500/12 text-emerald-300/90"
                              : inv.status === "overdue"
                                ? "bg-priority-high/12 text-priority-high"
                                : "bg-white/[0.06] text-muted-foreground",
                          )}
                        >
                          {STATUS_LABELS[inv.status] ?? inv.status}
                        </Pill>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{inv.due_date ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(inv.total)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {money(inv.total - inv.amount_paid)}
                      </TableCell>
                      <TableCell className="pr-5">
                        <Link
                          to="/billing/$invoiceId"
                          params={{ invoiceId: inv.id }}
                          className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground/50 hover:bg-white/[0.04] hover:text-foreground"
                        >
                          <ChevronRight className="size-4" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}
