import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock, FileText, Plus, Receipt, Settings, Square } from "lucide-react";
import { toast } from "sonner";

import { getCaseTimeEntries, getRunningTimer, stopTimer } from "@/lib/time-entries.functions";
import { getCaseExpenses, getExpenseReceiptUrl } from "@/lib/expenses.functions";
import { getCaseInvoices } from "@/lib/invoices.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TimeEntrySheet } from "@/components/time-entry-sheet";
import { ExpenseSheet } from "@/components/expense-sheet";
import { GenerateInvoiceSheet } from "@/components/generate-invoice-sheet";
import { InvoiceDetailSheet } from "@/components/invoice-detail-sheet";
import { CaseBillingSettingsDialog } from "@/components/case-billing-settings-dialog";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  partially_paid: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};

function money(n: number | null | undefined) {
  return (n ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatDuration(minutes: number | null) {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function CaseBillingTab({ caseId, role }: { caseId: string; role: string | null }) {
  const queryClient = useQueryClient();
  const fetchTimeEntries = useServerFn(getCaseTimeEntries);
  const fetchExpenses = useServerFn(getCaseExpenses);
  const fetchInvoices = useServerFn(getCaseInvoices);
  const fetchRunningTimer = useServerFn(getRunningTimer);
  const stopTimerFn = useServerFn(stopTimer);
  const getReceiptUrl = useServerFn(getExpenseReceiptUrl);

  const [section, setSection] = useState<"time" | "expenses" | "invoices">("time");
  const [timeSheetOpen, setTimeSheetOpen] = useState(false);
  const [expenseSheetOpen, setExpenseSheetOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [viewingInvoiceId, setViewingInvoiceId] = useState<string | null>(null);
  const [billingSettingsOpen, setBillingSettingsOpen] = useState(false);

  const isAdmin = role === "super_admin" || role === "admin";
  const canManage = isAdmin || role === "senior_lawyer" || role === "junior_lawyer";

  const timeEntriesQuery = useQuery({
    queryKey: ["case-time-entries", caseId],
    queryFn: () => fetchTimeEntries({ data: { caseId } }),
    enabled: section === "time",
  });
  const expensesQuery = useQuery({
    queryKey: ["case-expenses", caseId],
    queryFn: () => fetchExpenses({ data: { caseId } }),
    enabled: section === "expenses",
  });
  const invoicesQuery = useQuery({
    queryKey: ["case-invoices", caseId],
    queryFn: () => fetchInvoices({ data: { caseId } }),
    enabled: section === "invoices",
  });
  const runningTimerQuery = useQuery({
    queryKey: ["running-timer"],
    queryFn: () => fetchRunningTimer(),
  });
  const runningTimer =
    runningTimerQuery.data && runningTimerQuery.data.case_id === caseId ? runningTimerQuery.data : null;

  const stopMutation = useMutation({
    mutationFn: (timeEntryId: string) => stopTimerFn({ data: { timeEntryId } }),
    onSuccess: () => {
      toast.success("Timer stopped");
      queryClient.invalidateQueries({ queryKey: ["running-timer"] });
      queryClient.invalidateQueries({ queryKey: ["case-time-entries", caseId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  async function openReceipt(expenseId: string) {
    try {
      const { url } = await getReceiptUrl({ data: { expenseId } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open receipt.");
    }
  }

  return (
    <div className="space-y-4">
      {runningTimer ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-tag-blue/30 bg-tag-blue/[0.06] p-4">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Clock className="size-4 animate-pulse text-tag-blue" />
            Timer running — {runningTimer.description}
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="gap-1.5 border border-white/[0.12] bg-white/[0.06]"
            onClick={() => stopMutation.mutate(runningTimer.id)}
            disabled={stopMutation.isPending}
          >
            <Square className="size-3.5" />
            {stopMutation.isPending ? "Stopping…" : "Stop timer"}
          </Button>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          value={section}
          onValueChange={(v) => v && setSection(v as typeof section)}
          className="rounded-xl border border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-1"
        >
          <ToggleGroupItem value="time">Time</ToggleGroupItem>
          <ToggleGroupItem value="expenses">Expenses</ToggleGroupItem>
          <ToggleGroupItem value="invoices">Invoices</ToggleGroupItem>
        </ToggleGroup>

        {canManage ? (
          <div className="flex flex-wrap gap-2">
            {section === "time" ? (
              <Button size="sm" className="gap-1.5" onClick={() => setTimeSheetOpen(true)}>
                <Plus className="size-3.5" />
                Log time
              </Button>
            ) : section === "expenses" ? (
              <Button size="sm" className="gap-1.5" onClick={() => setExpenseSheetOpen(true)}>
                <Plus className="size-3.5" />
                Log expense
              </Button>
            ) : (
              <>
                {isAdmin ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 border border-white/[0.12] bg-white/[0.06]"
                    onClick={() => setBillingSettingsOpen(true)}
                  >
                    <Settings className="size-3.5" />
                    Billing settings
                  </Button>
                ) : null}
                <Button size="sm" className="gap-1.5" onClick={() => setGenerateOpen(true)}>
                  <FileText className="size-3.5" />
                  Generate invoice
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {section === "time" ? (
        timeEntriesQuery.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading time entries…</p>
        ) : !timeEntriesQuery.data || timeEntriesQuery.data.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-sm text-muted-foreground">No time logged yet.</p>
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Description</th>
                    <th className="px-4 py-2.5 font-medium">Timekeeper</th>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 text-right font-medium">Duration</th>
                    <th className="px-4 py-2.5 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {timeEntriesQuery.data.map((e) => (
                    <tr key={e.id} className="border-b border-white/[0.04] last:border-0">
                      <td className="px-4 py-2.5 text-foreground/90">
                        {e.description}
                        {!e.is_billable ? (
                          <Pill className="ml-2 bg-white/[0.06] text-[10px] text-muted-foreground">
                            Non-billable
                          </Pill>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{e.timekeeper_name ?? "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{e.entry_date}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                        {e.timer_started_at ? "running…" : formatDuration(e.duration_minutes)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">{e.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )
      ) : null}

      {section === "expenses" ? (
        expensesQuery.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading expenses…</p>
        ) : !expensesQuery.data || expensesQuery.data.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-sm text-muted-foreground">No expenses logged yet.</p>
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Description</th>
                    <th className="px-4 py-2.5 font-medium">Type</th>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {expensesQuery.data.map((x) => (
                    <tr key={x.id} className="border-b border-white/[0.04] last:border-0">
                      <td className="px-4 py-2.5 text-foreground/90">{x.description}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {x.expense_type === "hard_cost" ? "Hard cost" : "Soft cost"}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{x.expense_date}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{money(x.amount)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {x.receipt_path ? (
                          <button
                            type="button"
                            onClick={() => openReceipt(x.id)}
                            className="inline-flex items-center gap-1 text-xs text-tag-blue hover:underline"
                          >
                            <Receipt className="size-3.5" />
                            Receipt
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )
      ) : null}

      {section === "invoices" ? (
        invoicesQuery.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading invoices…</p>
        ) : !invoicesQuery.data || invoicesQuery.data.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-sm text-muted-foreground">No invoices yet.</p>
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Number</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Due</th>
                    <th className="px-4 py-2.5 text-right font-medium">Total</th>
                    <th className="px-4 py-2.5 text-right font-medium">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {invoicesQuery.data.map((inv) => (
                    <tr
                      key={inv.id}
                      className="cursor-pointer border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03]"
                      onClick={() => setViewingInvoiceId(inv.id)}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-foreground/90">{inv.invoice_number}</td>
                      <td className="px-4 py-2.5">
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
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{inv.due_date ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{money(inv.total)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                        {money(inv.amount_paid)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )
      ) : null}

      <TimeEntrySheet open={timeSheetOpen} onOpenChange={setTimeSheetOpen} caseId={caseId} />
      <ExpenseSheet open={expenseSheetOpen} onOpenChange={setExpenseSheetOpen} caseId={caseId} />
      <GenerateInvoiceSheet
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        caseId={caseId}
        onGenerated={(invoiceId) => setViewingInvoiceId(invoiceId)}
      />
      <InvoiceDetailSheet
        open={Boolean(viewingInvoiceId)}
        onOpenChange={(next) => !next && setViewingInvoiceId(null)}
        invoiceId={viewingInvoiceId}
        isAdmin={isAdmin}
      />
      <CaseBillingSettingsDialog
        open={billingSettingsOpen}
        onOpenChange={setBillingSettingsOpen}
        caseId={caseId}
      />
    </div>
  );
}
