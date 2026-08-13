import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { reassignLead } from "@/lib/case-lifecycle.functions";
import { listAssignableStaff } from "@/lib/users.functions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  senior_lawyer: "Senior Lawyer",
  junior_lawyer: "Junior Lawyer",
};

interface AssignLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  caseTitle?: string;
  currentLeadId?: string | null;
  currentLeadName?: string | null;
  onAssigned?: (lead: { id: string; name: string | null }) => void;
}

export function AssignLeadDialog({
  open,
  onOpenChange,
  caseId,
  caseTitle,
  currentLeadId,
  currentLeadName,
  onAssigned,
}: AssignLeadDialogProps) {
  const queryClient = useQueryClient();
  const fetchStaff = useServerFn(listAssignableStaff);
  const assign = useServerFn(reassignLead);

  const [selectedId, setSelectedId] = useState<string>(currentLeadId ?? "");
  const [keepOnTeam, setKeepOnTeam] = useState(true);

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["assignable-staff"],
    queryFn: () => fetchStaff(),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Choose a lead.");
      return assign({
        data: {
          caseId,
          newLeadId: selectedId,
          keepOnTeam: currentLeadId ? keepOnTeam : false,
        },
      });
    },
    onSuccess: (result) => {
      const name =
        result.lead_name ??
        staff.find((s) => s.id === selectedId)?.full_name ??
        null;
      toast.success(
        currentLeadId ? `Lead updated — ${name ?? "assigned"}` : `Lead assigned — ${name ?? "done"}`,
      );
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      queryClient.invalidateQueries({ queryKey: ["case", caseId] });
      queryClient.invalidateQueries({ queryKey: ["case-overview", caseId] });
      queryClient.invalidateQueries({ queryKey: ["case-stages", caseId] });
      queryClient.invalidateQueries({ queryKey: ["case-activity", caseId] });
      queryClient.invalidateQueries({ queryKey: ["case-team", caseId] });
      onAssigned?.({ id: selectedId, name });
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setSelectedId(currentLeadId ?? "");
          setKeepOnTeam(true);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-4" />
            {currentLeadId ? "Change matter lead" : "Assign matter lead"}
          </DialogTitle>
          <DialogDescription>
            {caseTitle
              ? `Choose the lead for “${caseTitle}”. Other lawyers can stay on the team alongside the lead.`
              : "Choose who leads this matter. You can add more lawyers after."}
            {currentLeadName ? (
              <>
                {" "}
                Current lead: <span className="text-foreground">{currentLeadName}</span>.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label>Staff member</Label>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading team…</p>
            ) : staff.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active staff found.</p>
            ) : (
              <ul className="max-h-64 space-y-1.5 overflow-y-auto rounded-xl border border-white/[0.08] bg-black/20 p-1.5">
                {staff.map((p) => {
                  const active = selectedId === p.id;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(p.id)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                          active
                            ? "bg-white text-[#1a1c20]"
                            : "hover:bg-white/[0.06]",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {p.full_name ?? "Unnamed"}
                          </span>
                          <span
                            className={cn(
                              "block truncate text-xs",
                              active ? "text-[#1a1c20]/70" : "text-muted-foreground",
                            )}
                          >
                            {ROLE_LABELS[p.role] ?? p.role}
                          </span>
                        </span>
                        {active ? <Check className="size-4 shrink-0" /> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {currentLeadId ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3">
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="keep-on-team">Keep previous lead on the team</Label>
                <p className="text-xs text-muted-foreground">
                  They stay as another lawyer on this matter (not the lead).
                </p>
              </div>
              <Switch
                id="keep-on-team"
                checked={keepOnTeam}
                onCheckedChange={setKeepOnTeam}
              />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            className="border border-white/[0.12] bg-white/[0.06]"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!selectedId || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending
              ? "Saving…"
              : currentLeadId
                ? "Update lead"
                : "Assign lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
