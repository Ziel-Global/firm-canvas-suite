import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  getCaseBillingSettings,
  updateCaseBillingSettings,
} from "@/lib/invoices.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type FeeStructure = "hourly" | "flat" | "contingency" | "subscription";

const FEE_STRUCTURE_LABELS: Record<FeeStructure, string> = {
  hourly: "Hourly",
  flat: "Flat fee",
  contingency: "Contingency",
  subscription: "Subscription",
};

export function CaseBillingSettingsDialog({
  open,
  onOpenChange,
  caseId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
}) {
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getCaseBillingSettings);
  const save = useServerFn(updateCaseBillingSettings);

  const [feeStructure, setFeeStructure] = useState<FeeStructure>("hourly");
  const [hourlyRate, setHourlyRate] = useState("");
  const [flatFee, setFlatFee] = useState("");
  const [contingencyPct, setContingencyPct] = useState("");
  const [subscriptionAmount, setSubscriptionAmount] = useState("");
  const [subscriptionPeriod, setSubscriptionPeriod] = useState("monthly");

  const settingsQuery = useQuery({
    queryKey: ["case-billing-settings", caseId],
    queryFn: () => fetchSettings({ data: { caseId } }),
    enabled: open,
  });

  useEffect(() => {
    const s = settingsQuery.data;
    if (!s) return;
    setFeeStructure(s.fee_structure);
    setHourlyRate(s.default_hourly_rate?.toString() ?? "");
    setFlatFee(s.flat_fee_amount?.toString() ?? "");
    setContingencyPct(s.contingency_percentage?.toString() ?? "");
    setSubscriptionAmount(s.subscription_amount?.toString() ?? "");
    setSubscriptionPeriod(s.subscription_period ?? "monthly");
  }, [settingsQuery.data]);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          caseId,
          feeStructure,
          defaultHourlyRate: hourlyRate ? Number(hourlyRate) : null,
          flatFeeAmount: flatFee ? Number(flatFee) : null,
          contingencyPercentage: contingencyPct ? Number(contingencyPct) : null,
          subscriptionAmount: subscriptionAmount ? Number(subscriptionAmount) : null,
          subscriptionPeriod: feeStructure === "subscription" ? subscriptionPeriod : null,
        },
      }),
    onSuccess: () => {
      toast.success("Billing settings saved");
      queryClient.invalidateQueries({ queryKey: ["case-billing-settings", caseId] });
      queryClient.invalidateQueries({ queryKey: ["unbilled-summary", caseId] });
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Billing settings</DialogTitle>
          <DialogDescription>
            How this matter is billed — used to resolve rates and generate invoices.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Fee structure</Label>
            <Select value={feeStructure} onValueChange={(v) => setFeeStructure(v as FeeStructure)}>
              <SelectTrigger className="border-border bg-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FEE_STRUCTURE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {feeStructure === "hourly" ? (
            <div className="space-y-2">
              <Label htmlFor="matter-hourly-rate">Matter hourly rate (optional override)</Label>
              <Input
                id="matter-hourly-rate"
                type="number"
                min={0}
                step="0.01"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="Falls back to each timekeeper's default rate"
              />
            </div>
          ) : feeStructure === "flat" ? (
            <div className="space-y-2">
              <Label htmlFor="flat-fee-amount">Flat fee amount *</Label>
              <Input
                id="flat-fee-amount"
                type="number"
                min={0}
                step="0.01"
                value={flatFee}
                onChange={(e) => setFlatFee(e.target.value)}
              />
            </div>
          ) : feeStructure === "contingency" ? (
            <div className="space-y-2">
              <Label htmlFor="contingency-pct">Contingency percentage *</Label>
              <Input
                id="contingency-pct"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={contingencyPct}
                onChange={(e) => setContingencyPct(e.target.value)}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="subscription-amount">Subscription amount *</Label>
                <Input
                  id="subscription-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={subscriptionAmount}
                  onChange={(e) => setSubscriptionAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Period</Label>
                <Select value={subscriptionPeriod} onValueChange={setSubscriptionPeriod}>
                  <SelectTrigger className="border-border bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annually">Annually</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            className="border border-white/[0.12] bg-white/[0.06]"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
