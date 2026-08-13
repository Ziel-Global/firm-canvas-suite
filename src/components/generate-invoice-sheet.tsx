import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText } from "lucide-react";
import { toast } from "sonner";

import { generateInvoiceDraft, getUnbilledSummary } from "@/lib/invoices.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

function money(n: number | null | undefined) {
  return (n ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function hours(minutes: number) {
  return Math.round((minutes / 60) * 100) / 100;
}

interface GenerateInvoiceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  onGenerated: (invoiceId: string) => void;
}

export function GenerateInvoiceSheet({
  open,
  onOpenChange,
  caseId,
  onGenerated,
}: GenerateInvoiceSheetProps) {
  const queryClient = useQueryClient();
  const fetchSummary = useServerFn(getUnbilledSummary);
  const generate = useServerFn(generateInvoiceDraft);

  const [settlementAmount, setSettlementAmount] = useState("");

  const summaryQuery = useQuery({
    queryKey: ["unbilled-summary", caseId],
    queryFn: () => fetchSummary({ data: { caseId } }),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: () =>
      generate({
        data: {
          caseId,
          settlementAmount: settlementAmount ? Number(settlementAmount) : undefined,
        },
      }),
    onSuccess: (result) => {
      toast.success("Draft invoice created");
      queryClient.invalidateQueries({ queryKey: ["case-invoices", caseId] });
      setSettlementAmount("");
      onOpenChange(false);
      onGenerated(result.id);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const summary = summaryQuery.data;
  const isContingency = summary?.fee_structure === "contingency";
  const timeTotal = summary
    ? summary.time_entries.reduce((sum, e) => sum + hours(e.duration_minutes) * (e.rate ?? 0), 0)
    : 0;
  const expenseTotal = summary ? summary.expenses.reduce((sum, e) => sum + e.amount, 0) : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Generate invoice</SheetTitle>
          <SheetDescription>
            Pulls every unbilled time entry and expense on this matter into an editable draft.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto py-4">
          {summaryQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : summary ? (
            <>
              <Card className="space-y-2 p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Fee structure: {summary.fee_structure}
                </p>
                {summary.fee_structure === "hourly" ? (
                  <p className="text-sm text-foreground">
                    {summary.time_entries.length} unbilled time{" "}
                    {summary.time_entries.length === 1 ? "entry" : "entries"} · {money(timeTotal)}
                  </p>
                ) : summary.fee_structure === "flat" ? (
                  <p className="text-sm text-foreground">
                    Flat fee: {summary.flat_fee_amount != null ? money(summary.flat_fee_amount) : "not set"}
                  </p>
                ) : summary.fee_structure === "subscription" ? (
                  <p className="text-sm text-foreground">
                    Subscription: {summary.subscription_amount != null ? money(summary.subscription_amount) : "not set"}
                    {summary.subscription_period ? ` / ${summary.subscription_period}` : ""}
                  </p>
                ) : (
                  <p className="text-sm text-foreground">
                    Contingency: {summary.contingency_percentage != null ? `${summary.contingency_percentage}%` : "not set"}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  {summary.expenses.length} unbilled expense{summary.expenses.length === 1 ? "" : "s"} · {money(expenseTotal)}
                </p>
              </Card>

              {isContingency ? (
                <div className="space-y-2">
                  <Label htmlFor="settlement-amount">Settlement / recovery amount *</Label>
                  <Input
                    id="settlement-amount"
                    type="number"
                    min={0}
                    step="0.01"
                    value={settlementAmount}
                    onChange={(e) => setSettlementAmount(e.target.value)}
                    placeholder="0.00"
                  />
                  <p className="text-xs text-muted-foreground">
                    The contingency fee is calculated from this amount at generation time.
                  </p>
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <SheetFooter className="mt-auto flex-row gap-2">
          <Button
            type="button"
            variant="ghost"
            className="flex-1 border border-white/[0.12] bg-white/[0.06] text-foreground hover:bg-white/[0.1] hover:text-foreground"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1 gap-1.5"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || summaryQuery.isLoading}
          >
            <FileText className="size-4" />
            {mutation.isPending ? "Generating…" : "Generate draft"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
