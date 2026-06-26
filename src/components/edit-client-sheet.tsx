import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { updateClient, type ClientDetail } from "@/lib/clients.functions";
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

interface EditClientSheetProps {
  client: ClientDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditClientSheet({ client, open, onOpenChange }: EditClientSheetProps) {
  const [form, setForm] = useState({
    full_name: client.full_name ?? "",
    email: client.email ?? "",
    phone: client.phone ?? "",
    address: client.address ?? "",
    notes: client.notes ?? "",
  });
  const queryClient = useQueryClient();
  const update = useServerFn(updateClient);

  const mutation = useMutation({
    mutationFn: () => update({ data: { id: client.id, ...form } }),
    onSuccess: () => {
      toast.success("Client updated.");
      queryClient.invalidateQueries({ queryKey: ["client", client.id] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Could not update client.");
    },
  });

  const set = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) {
      toast.error("Full name is required.");
      return;
    }
    mutation.mutate();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Edit client</SheetTitle>
          <SheetDescription>Changes are recorded in the contact history.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 overflow-y-auto px-1 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit_full_name">Full name *</Label>
            <Input id="edit_full_name" value={form.full_name} onChange={set("full_name")} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit_email">Email</Label>
            <Input id="edit_email" type="email" value={form.email} onChange={set("email")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit_phone">Phone</Label>
            <Input id="edit_phone" value={form.phone} onChange={set("phone")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit_address">Address</Label>
            <Textarea id="edit_address" value={form.address} onChange={set("address")} rows={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit_notes">Notes</Label>
            <Textarea id="edit_notes" value={form.notes} onChange={set("notes")} rows={3} />
          </div>

          <SheetFooter className="mt-auto flex-row gap-2">
            <Button type="button" variant="ghost" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
