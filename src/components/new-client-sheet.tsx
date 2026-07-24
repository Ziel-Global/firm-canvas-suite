import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";

import { createClient, type CreateClientInput } from "@/lib/clients.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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

type FormState = CreateClientInput & {
  portal_password: string;
  confirm_password: string;
};

const EMPTY: FormState = {
  full_name: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
  portal_password: "",
  confirm_password: "",
};

const FIELD_CLASS =
  "border-border bg-surface shadow-none focus-visible:ring-1 focus-visible:ring-white/15";

export function NewClientSheet({ open, onOpenChange }: NewClientSheetProps) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [enablePortal, setEnablePortal] = useState(false);
  const queryClient = useQueryClient();
  const create = useServerFn(createClient);

  const mutation = useMutation({
    mutationFn: (input: CreateClientInput) => create({ data: input }),
    onSuccess: (result) => {
      toast.success(
        result.portalEnabled
          ? `Client created — ${result.client_ref}. Portal login is ready.`
          : `Client created — ${result.client_ref}`,
      );
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setForm(EMPTY);
      setEnablePortal(false);
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      toast.error(
        err instanceof Error ? err.message : "Could not create client.",
      );
    },
  });

  const set =
    (key: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) {
      toast.error("Full name is required.");
      return;
    }

    if (enablePortal) {
      if (!form.email.trim()) {
        toast.error("Email is required for portal access.");
        return;
      }
      if (form.portal_password.length < 8) {
        toast.error("Portal password must be at least 8 characters.");
        return;
      }
      if (form.portal_password !== form.confirm_password) {
        toast.error("Passwords do not match.");
        return;
      }
    }

    mutation.mutate({
      full_name: form.full_name,
      email: form.email,
      phone: form.phone,
      address: form.address,
      notes: form.notes,
      portal_password: enablePortal ? form.portal_password : undefined,
    });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setForm(EMPTY);
          setEnablePortal(false);
        }
        onOpenChange(next);
      }}
    >
      <SheetContent className="flex w-full flex-col overflow-hidden sm:max-w-md">
        <SheetHeader>
          <SheetTitle>New client</SheetTitle>
          <SheetDescription>
            A unique reference (CL-YYYY-NNNN) is generated automatically on
            save. Optionally create a portal password so they can sign in.
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 py-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
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
            <Label htmlFor="email">
              Email{enablePortal ? " *" : ""}
            </Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={set("email")}
              placeholder="e.g. john@example.com"
              required={enablePortal}
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

          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <KeyRound className="size-3.5 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">
                    Client portal access
                  </p>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Create a password so this client can sign in at /auth and open
                  /portal.
                </p>
              </div>
              <Switch
                checked={enablePortal}
                onCheckedChange={(checked) => {
                  setEnablePortal(checked);
                  if (!checked) {
                    setForm((f) => ({
                      ...f,
                      portal_password: "",
                      confirm_password: "",
                    }));
                  }
                }}
                aria-label="Enable portal access"
              />
            </div>

            {enablePortal ? (
              <div className="mt-4 space-y-3 border-t border-white/[0.06] pt-4">
                <div className="space-y-2">
                  <Label htmlFor="portal_password">Portal password *</Label>
                  <Input
                    id="portal_password"
                    type="password"
                    value={form.portal_password}
                    onChange={set("portal_password")}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    className={FIELD_CLASS}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm_password">Confirm password *</Label>
                  <Input
                    id="confirm_password"
                    type="password"
                    value={form.confirm_password}
                    onChange={set("confirm_password")}
                    placeholder="Repeat password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    className={FIELD_CLASS}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Share this email and password with the client securely. They
                  use the same sign-in page as staff, then land on the portal.
                </p>
              </div>
            ) : null}
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
            <Button
              type="submit"
              className="flex-1"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Saving…" : "Save client"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
