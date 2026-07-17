import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { createClient, type CreateClientInput } from "@/lib/clients.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface NewClientSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EMPTY: CreateClientInput = {
  full_name: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
};

const FIELD_CLASS =
  "border-border bg-surface shadow-none focus-visible:ring-1 focus-visible:ring-white/15";

export function NewClientSheet({ open, onOpenChange }: NewClientSheetProps) {
  const [form, setForm] = useState<CreateClientInput>(EMPTY);
  const queryClient = useQueryClient();
  const create = useServerFn(createClient);

  const mutation = useMutation({
    mutationFn: (input: CreateClientInput) => create({ data: input }),
    onSuccess: (result) => {
      toast.success(`Client created — ${result.client_ref}`);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setForm(EMPTY);
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Could not create client.");
    },
  });

  const set = (key: keyof CreateClientInput) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) {
      toast.error("Full name is required.");
      return;
    }
    mutation.mutate(form);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>New client</SheetTitle>
          <SheetDescription>
            A unique reference (CL-YYYY-NNNN) is generated automatically on save.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 overflow-y-auto px-1 py-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">Full name *</Label>
            <Input
              id="full_name"
              value={form.full_name}
              onChange={set("full_name")}
              placeholder="e.g. John Smith"
              required
              className={FIELD_CLASS}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={set("email")}
              placeholder="e.g. john@example.com"
              className={FIELD_CLASS}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={form.phone}
              onChange={set("phone")}
              placeholder="e.g. +1 555 123 4567"
              className={FIELD_CLASS}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              value={form.address}
              onChange={set("address")}
              placeholder="Street address, city"
              rows={2}
              className={FIELD_CLASS}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={set("notes")}
              placeholder="Optional client notes"
              rows={3}
              className={FIELD_CLASS}
            />
          </div>

          <SheetFooter className="mt-auto flex-row gap-2">
            <Button
              type="button"
              variant="ghost"
              className="flex-1 border border-white/[0.12] bg-white/[0.06] text-foreground hover:bg-white/[0.1] hover:text-foreground"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save client"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
