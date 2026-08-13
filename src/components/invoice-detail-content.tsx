import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Send, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";

import {
  getInvoiceDetail,
  sendInvoice,
  updateInvoiceDraft,
  voidInvoice,
} from "@/lib/invoices.functions";
import { getInvoicePayments } from "@/lib/payments.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Pill } from "@/components/ui/pill";
import { RecordPaymentSheet } from "@/components/record-payment-sheet";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  partially_paid: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};

const STATUS_TONE: Record<string, string> = {
  draft: "border-white/15 bg-white/[0.05] text-muted-foreground",
  sent: "border-tag-blue/30 bg-tag-blue/10 text-tag-blue",
  partially_paid: "border-amber-500/25 bg-amber-500/12 text-amber-200/90",
  paid: "border-emerald-500/25 bg-emerald-500/12 text-emerald-300/90",
  overdue: "border-priority-high/25 bg-priority-high/12 text-priority-high",
  void: "border-white/10 bg-white/[0.03] text-muted-foreground line-through",
};

function money(n: number | null | undefined) {
  return (n ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

interface EditableLineItem {
  id: string;
  description: string;
  quantity: number | null;
  rate: number | null;
  amount: number;
  sortOrder: number;
}

export function InvoiceDetailContent({
  invoiceId,
  isAdmin,
  onVoided,
}: {
  invoiceId: string;
  isAdmin: boolean;
  onVoided?: () => void;
}) {
  const queryClient = useQueryClient();
  const fetchInvoice = useServerFn(getInvoiceDetail);
  const fetchPayments = useServerFn(getInvoicePayments);
  const saveDraft = useServerFn(updateInvoiceDraft);
  const send = useServerFn(sendInvoice);
  const voidMutationFn = useServerFn(voidInvoice);

  const [lineItems, setLineItems] = useState<EditableLineItem[]>([]);
  const [notes, setNotes] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);

  const invoiceQuery = useQuery({
    queryKey: ["invoice-detail", invoiceId],
    queryFn: () => fetchInvoice({ data: { invoiceId } }),
  });

  const invoice = invoiceQuery.data;
  const isDraft = invoice?.status === "draft";

  useEffect(() => {
    if (!invoice) return;
    setLineItems(
      invoice.line_items.map((li) => ({
        id: li.id,
        description: li.description,
        quantity: li.quantity,
        rate: li.rate,
        amount: li.amount,
        sortOrder: li.sort_order,
      })),
    );
    setNotes(invoice.notes ?? "");
  }, [invoice]);

  const paymentsQuery = useQuery({
    queryKey: ["invoice-payments", invoiceId],
    queryFn: () => fetchPayments({ data: { invoiceId } }),
    enabled: Boolean(invoice) && invoice?.status !== "draft",
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      saveDraft({
        data: {
          invoiceId,
          lineItems: lineItems.map((li) => ({
            id: li.id,
            description: li.description,
            quantity: li.quantity,
            rate: li.rate,
            amount: li.amount,
            sortOrder: li.sortOrder,
          })),
          notes,
        },
      }),
    onSuccess: () => {
      toast.success("Draft saved");
      queryClient.invalidateQueries({ queryKey: ["invoice-detail", invoiceId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const sendMutation = useMutation({
    mutationFn: () => send({ data: { invoiceId } }),
    onSuccess: () => {
      toast.success("Invoice sent");
      queryClient.invalidateQueries({ queryKey: ["invoice-detail", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["case-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["case-time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["case-expenses"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const voidMutation = useMutation({
    mutationFn: () => voidMutationFn({ data: { invoiceId } }),
    onSuccess: () => {
      toast.success("Invoice voided");
      queryClient.invalidateQueries({ queryKey: ["invoice-detail", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["case-invoices"] });
      onVoided?.();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function updateLine(id: string, patch: Partial<EditableLineItem>) {
    setLineItems((prev) =>
      prev.map((li) => {
        if (li.id !== id) return li;
        const next = { ...li, ...patch };
        if (patch.quantity !== undefined || patch.rate !== undefined) {
          if (next.quantity != null && next.rate != null) {
            next.amount = Math.round(next.quantity * next.rate * 100) / 100;
          }
        }
        return next;
      }),
    );
  }

  function removeLine(id: string) {
    setLineItems((prev) => prev.filter((li) => li.id !== id));
  }

  function addLine() {
    setLineItems((prev) => [
      ...prev,
      {
        id: `new-${crypto.randomUUID()}`,
        description: "",
        quantity: 1,
        rate: 0,
        amount: 0,
        sortOrder: prev.length,
      },
    ]);
  }

  const total = Math.round(lineItems.reduce((sum, li) => sum + li.amount, 0) * 100) / 100;
  const balanceDue = invoice ? Math.max(0, invoice.total - invoice.amount_paid) : 0;

  if (invoiceQuery.isLoading) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Loading invoice…</p>;
  }
  if (invoiceQuery.error || !invoice) {
    return <p className="py-10 text-center text-sm text-destructive">Could not load invoice.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{invoice.invoice_number}</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
            {invoice.case_title ?? "Matter"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{invoice.client_name ?? "No client"}</p>
        </div>
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
            STATUS_TONE[invoice.status],
          )}
        >
          {STATUS_LABELS[invoice.status] ?? invoice.status}
        </span>
      </div>

      <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Issued</p>
          <p className="mt-1 text-sm font-medium text-foreground">{invoice.issue_date ?? "—"}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Due</p>
          <p className="mt-1 text-sm font-medium text-foreground">{invoice.due_date ?? "—"}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
          <p className="mt-1 text-sm font-medium text-foreground">{money(invoice.total)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Balance due</p>
          <p className={cn("mt-1 text-sm font-medium", balanceDue > 0 ? "text-priority-high" : "text-foreground")}>
            {money(balanceDue)}
          </p>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Description</th>
                <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                <th className="px-4 py-2.5 text-right font-medium">Rate</th>
                <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                {isDraft ? <th className="px-4 py-2.5" /> : null}
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li) =>
                isDraft ? (
                  <tr key={li.id} className="border-b border-white/[0.04] last:border-0">
                    <td className="px-4 py-2">
                      <Input
                        value={li.description}
                        onChange={(e) => updateLine(li.id, { description: e.target.value })}
                        className="h-8 border-white/[0.08] bg-transparent"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        value={li.quantity ?? ""}
                        onChange={(e) => updateLine(li.id, { quantity: e.target.value === "" ? null : Number(e.target.value) })}
                        className="h-8 w-20 border-white/[0.08] bg-transparent text-right"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        value={li.rate ?? ""}
                        onChange={(e) => updateLine(li.id, { rate: e.target.value === "" ? null : Number(e.target.value) })}
                        className="h-8 w-24 border-white/[0.08] bg-transparent text-right"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        value={li.amount}
                        onChange={(e) => updateLine(li.id, { amount: Number(e.target.value) })}
                        className="h-8 w-24 border-white/[0.08] bg-transparent text-right"
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeLine(li.id)}
                        className="text-muted-foreground hover:text-priority-high"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={li.id} className="border-b border-white/[0.04] last:border-0">
                    <td className="px-4 py-2.5 text-foreground/90">{li.description}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{li.quantity ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {li.rate != null ? money(li.rate) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{money(li.amount)}</td>
                  </tr>
                ),
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={isDraft ? 3 : 3} className="px-4 py-2.5 text-right text-sm font-medium text-muted-foreground">
                  Total
                </td>
                <td className="px-4 py-2.5 text-right text-sm font-semibold text-foreground">
                  {money(isDraft ? total : invoice.total)}
                </td>
                {isDraft ? <td /> : null}
              </tr>
            </tfoot>
          </table>
        </div>
        {isDraft ? (
          <div className="border-t border-white/[0.06] p-3">
            <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={addLine}>
              <Plus className="size-3.5" />
              Add line
            </Button>
          </div>
        ) : null}
      </Card>

      {isDraft ? (
        <div className="space-y-2">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes on this invoice (optional)"
            rows={2}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              className="border border-white/[0.12] bg-white/[0.06]"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving…" : "Save draft"}
            </Button>
            <Button
              type="button"
              className="gap-1.5"
              onClick={() => sendMutation.mutate()}
              disabled={sendMutation.isPending || lineItems.length === 0}
            >
              <Send className="size-3.5" />
              {sendMutation.isPending ? "Sending…" : "Send invoice"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Payments</h3>
            {isAdmin && invoice.status !== "void" ? (
              <Button type="button" size="sm" onClick={() => setPaymentOpen(true)}>
                Record payment
              </Button>
            ) : null}
          </div>
          {paymentsQuery.data && paymentsQuery.data.length > 0 ? (
            <ul className="space-y-1.5">
              {paymentsQuery.data.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-sm"
                >
                  <span className="text-foreground/90">
                    {money(p.amount)} · {p.method.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-muted-foreground">{p.paid_at}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
          )}

          {isAdmin && ["sent", "partially_paid", "overdue"].includes(invoice.status) ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 text-priority-high hover:bg-priority-high/10 hover:text-priority-high"
              onClick={() => {
                if (confirm("Void this invoice? Its time entries and expenses will return to unbilled.")) {
                  voidMutation.mutate();
                }
              }}
              disabled={voidMutation.isPending}
            >
              <Undo2 className="size-3.5" />
              Void invoice
            </Button>
          ) : null}

          <RecordPaymentSheet
            open={paymentOpen}
            onOpenChange={setPaymentOpen}
            invoiceId={invoiceId}
            balanceDue={balanceDue}
          />
        </div>
      )}
    </div>
  );
}
