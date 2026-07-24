import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { createUser, type CreateUserInput } from "@/lib/create-user.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CREATE_USER_ROLES,
  STAFF_ROLE_LABELS,
  type CreateUserRole,
} from "@/lib/roles";
import { cn } from "@/lib/utils";

const FIELD =
  "border-border bg-surface shadow-none focus-visible:ring-1 focus-visible:ring-white/15";

const ROLE_OPTIONS = [...CREATE_USER_ROLES];

interface NewUserSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EMPTY: CreateUserInput = {
  fullName: "",
  email: "",
  password: "",
  role: "junior_lawyer",
  phone: "",
  requireTwoFactor: false,
};

export function NewUserSheet({ open, onOpenChange }: NewUserSheetProps) {
  const [form, setForm] = useState<CreateUserInput>(EMPTY);
  const submit = useServerFn(createUser);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: CreateUserInput) => submit({ data: input }),
    onSuccess: (res) => {
      toast.success(`User created — ${res.email}`, {
        description: "An email notification has been queued.",
      });
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      setForm(EMPTY);
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      toast.error("Could not create user", {
        description: err instanceof Error ? err.message : "Unexpected error",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.email.trim() || !form.password.trim()) {
      toast.error("Full name, email, and password are required.");
      return;
    }
    if (form.password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    mutation.mutate(form);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>New user</SheetTitle>
          <SheetDescription>
            Create an account and assign a password manually.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
          <div className="grid gap-2">
            <Label htmlFor="full-name">Full name</Label>
            <Input
              id="full-name"
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              placeholder="Jane Vance"
              autoComplete="off"
              className={FIELD}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="jane@marlowevance.com"
              autoComplete="off"
              className={FIELD}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="••••••••"
              autoComplete="new-password"
              className={FIELD}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="role">Role</Label>
            <Select
              value={form.role}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, role: v as CreateUserRole }))
              }
            >
              <SelectTrigger id="role" className={cn(FIELD, "w-full")}>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {STAFF_ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+1 555 0100"
              autoComplete="off"
              className={FIELD}
            />
          </div>

          <div className="flex items-center justify-between rounded-control border border-white/[0.12] bg-white/[0.03] px-4 py-3">
            <div>
              <Label htmlFor="require-2fa">Require 2FA</Label>
              <p className="text-xs text-muted-foreground">
                User must set up two-factor authentication.
              </p>
            </div>
            <Switch
              id="require-2fa"
              checked={form.requireTwoFactor}
              onCheckedChange={(v) => setForm((f) => ({ ...f, requireTwoFactor: v }))}
            />
          </div>

          <SheetFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
              className="border-white/[0.12] bg-white/[0.06] text-foreground hover:bg-white/[0.1] hover:text-foreground"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating…" : "Create user"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
