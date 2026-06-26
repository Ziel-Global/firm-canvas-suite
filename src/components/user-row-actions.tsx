import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import {
  updateUserDetails,
  deactivateUser,
  reactivateUser,
  resetUserPassword,
} from "@/lib/user-actions.functions";
import type { ProfileRow } from "@/lib/users.functions";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { AppRole } from "@/lib/nav";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  senior_lawyer: "Senior Lawyer",
  junior_lawyer: "Junior Lawyer",
  support: "Support",
  client: "Client",
};

const ROLE_OPTIONS: AppRole[] = [
  "super_admin",
  "admin",
  "senior_lawyer",
  "junior_lawyer",
  "support",
  "client",
];

type Confirm = "deactivate" | "reactivate" | "reset" | null;

export function UserRowActions({ user }: { user: ProfileRow }) {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [roleValue, setRoleValue] = useState<AppRole>(user.role as AppRole);

  const update = useServerFn(updateUserDetails);
  const deactivate = useServerFn(deactivateUser);
  const reactivate = useServerFn(reactivateUser);
  const reset = useServerFn(resetUserPassword);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["profiles"] });

  const editMutation = useMutation({
    mutationFn: () =>
      update({
        data: { userId: user.id, fullName, role: roleValue, phone },
      }),
    onSuccess: () => {
      toast.success("User updated");
      invalidate();
      setEditOpen(false);
    },
    onError: (e: unknown) =>
      toast.error("Could not update user", {
        description: e instanceof Error ? e.message : "Unexpected error",
      }),
  });

  const deactivateMutation = useMutation({
    mutationFn: () => deactivate({ data: { userId: user.id } }),
    onSuccess: () => {
      toast.success("User deactivated", {
        description: "Their sessions were ended and access revoked.",
      });
      invalidate();
      setConfirm(null);
    },
    onError: (e: unknown) =>
      toast.error("Could not deactivate", {
        description: e instanceof Error ? e.message : "Unexpected error",
      }),
  });

  const reactivateMutation = useMutation({
    mutationFn: () => reactivate({ data: { userId: user.id } }),
    onSuccess: () => {
      toast.success("User reactivated");
      invalidate();
      setConfirm(null);
    },
    onError: (e: unknown) =>
      toast.error("Could not reactivate", {
        description: e instanceof Error ? e.message : "Unexpected error",
      }),
  });

  const resetMutation = useMutation({
    mutationFn: () => reset({ data: { userId: user.id } }),
    onSuccess: (res) => {
      toast.success("Password reset", {
        description: `A new temporary password was emailed to ${res.email}.`,
      });
      setConfirm(null);
    },
    onError: (e: unknown) =>
      toast.error("Could not reset password", {
        description: e instanceof Error ? e.message : "Unexpected error",
      }),
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Row actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            Edit role & details
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setConfirm("reset")}>
            Reset password
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {user.is_active ? (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => setConfirm("deactivate")}
            >
              Deactivate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setConfirm("reactivate")}>
              Reactivate
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit sheet */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Edit user</SheetTitle>
            <SheetDescription>Update this user's role and details.</SheetDescription>
          </SheetHeader>
          <div className="grid gap-4 px-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Full name</Label>
              <Input
                id="edit-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select value={roleValue} onValueChange={(v) => setRoleValue(v as AppRole)}>
                <SelectTrigger id="edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>
          <SheetFooter>
            <Button
              onClick={() => editMutation.mutate()}
              disabled={editMutation.isPending || fullName.trim() === ""}
            >
              {editMutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Confirm dialogs */}
      <AlertDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
      >
        <AlertDialogContent>
          {confirm === "deactivate" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Deactivate this user?</AlertDialogTitle>
                <AlertDialogDescription>
                  {user.full_name ?? "This user"} will be signed out immediately and lose
                  all access until reactivated.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    deactivateMutation.mutate();
                  }}
                >
                  Deactivate
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
          {confirm === "reactivate" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Reactivate this user?</AlertDialogTitle>
                <AlertDialogDescription>
                  {user.full_name ?? "This user"} will regain access according to their role.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    reactivateMutation.mutate();
                  }}
                >
                  Reactivate
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
          {confirm === "reset" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset password?</AlertDialogTitle>
                <AlertDialogDescription>
                  A new temporary password will be generated and emailed to{" "}
                  {user.full_name ?? "this user"}.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    resetMutation.mutate();
                  }}
                >
                  Reset password
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
