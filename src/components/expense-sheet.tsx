import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Receipt, X } from "lucide-react";
import { toast } from "sonner";

import { createExpense } from "@/lib/expenses.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface ExpenseSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
}

export function ExpenseSheet({ open, onOpenChange, caseId }: ExpenseSheetProps) {
  const queryClient = useQueryClient();
  const create = useServerFn(createExpense);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [expenseType, setExpenseType] = useState<"hard_cost" | "soft_cost">("hard_cost");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [receipt, setReceipt] = useState<File | null>(null);

  function reset() {
    setExpenseType("hard_cost");
    setDescription("");
    setAmount("");
    setReceipt(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const mutation = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.set("caseId", caseId);
      form.set("expenseType", expenseType);
      form.set("description", description.trim());
      form.set("amount", amount);
      form.set("expenseDate", expenseDate);
      if (receipt) form.set("file", receipt);
      return create({ data: form });
    },
    onSuccess: () => {
      toast.success("Expense logged");
      queryClient.invalidateQueries({ queryKey: ["case-expenses", caseId] });
      reset();
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      toast.error("A description is required.");
      return;
    }
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      toast.error("Enter a valid amount.");
      return;
    }
    mutation.mutate();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Log expense</SheetTitle>
          <SheetDescription>
            Filing fees, courier, printing, or any other cost on this matter.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 overflow-y-auto py-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <ToggleGroup
              type="single"
              value={expenseType}
              onValueChange={(v) => v && setExpenseType(v as "hard_cost" | "soft_cost")}
              className="rounded-xl border border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-1"
            >
              <ToggleGroupItem value="hard_cost" className="flex-1">
                Hard cost
              </ToggleGroupItem>
              <ToggleGroupItem value="soft_cost" className="flex-1">
                Soft cost
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expense-description">Description *</Label>
            <Textarea
              id="expense-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Court filing fee"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="expense-amount">Amount *</Label>
              <Input
                id="expense-amount"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expense-date">Date</Label>
              <Input
                id="expense-date"
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Receipt (optional)</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              capture="environment"
              className="hidden"
              onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
            />
            {receipt ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2 truncate text-foreground/85">
                  <Receipt className="size-3.5 shrink-0" />
                  <span className="truncate">{receipt.name}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setReceipt(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start gap-1.5 border border-dashed border-white/20 bg-white/[0.03] text-muted-foreground hover:border-white/35 hover:bg-white/[0.06]"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="size-4" />
                Photograph or attach a receipt
              </Button>
            )}
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
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save expense"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
