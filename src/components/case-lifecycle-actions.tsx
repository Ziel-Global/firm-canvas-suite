import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw, UserCog, Lock } from "lucide-react";

import { listProfiles } from "@/lib/users.functions";
import {
  changeCaseStatus,
  reassignLead,
  closeCase,
} from "@/lib/case-lifecycle.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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

const STATUS_OPTIONS = [
  { value: "intake", label: "Intake" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
] as const;

const STAFF_ROLES = ["super_admin", "admin", "senior_lawyer", "junior_lawyer"];

export function CaseLifecycleActions({
  caseId,
  status,
}: {
  caseId: string;
  status: string | null;
}) {
  const queryClient = useQueryClient();
  const changeStatus = useServerFn(changeCaseStatus);
  const reassign = useServerFn(reassignLead);
  const close = useServerFn(closeCase);
  const fetchProfiles = useServerFn(listProfiles);

  const [statusOpen, setStatusOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  const [newStatus, setNewStatus] = useState<string>(status ?? "active");
  const [newLeadId, setNewLeadId] = useState<string>("");
  const [keepReadOnly, setKeepReadOnly] = useState(true);
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);

  const isClosed = status === "closed";

  const { data: profiles } = useQuery({
    queryKey: ["assignable-leads"],
    queryFn: () => fetchProfiles(),
    enabled: reassignOpen,
  });
  const leadOptions = (profiles ?? []).filter(
    (p) => p.is_active && STAFF_ROLES.includes(p.role),
  );

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["case", caseId] });
    queryClient.invalidateQueries({ queryKey: ["case-overview", caseId] });
    queryClient.invalidateQueries({ queryKey: ["case-activity", caseId] });
  }

  async function handleStatus() {
    setBusy(true);
    try {
      await changeStatus({ data: { caseId, status: newStatus as never } });
      toast.success("Status updated.");
      setStatusOpen(false);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update status.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReassign() {
    if (!newLeadId) {
      toast.error("Choose a new lead.");
      return;
    }
    setBusy(true);
    try {
      await reassign({ data: { caseId, newLeadId, keepReadOnly } });
      toast.success("Lead reassigned.");
      setReassignOpen(false);
      setNewLeadId("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reassign lead.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClose() {
    setBusy(true);
    try {
      await close({ data: { caseId, closureSummary: summary } });
      toast.success("Case closed.");
      setCloseOpen(false);
      setSummary("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not close case.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-2 p-5">
      <h3 className="text-sm font-semibold text-foreground">Lifecycle</h3>
      <div className="grid gap-2">
        <Button
          variant="ghost"
          className="justify-start"
          disabled={isClosed}
          onClick={() => {
            setNewStatus(status && status !== "closed" ? status : "active");
            setStatusOpen(true);
          }}
        >
          <RefreshCw className="size-4" />
          Change status
        </Button>
        <Button
          variant="ghost"
          className="justify-start"
          disabled={isClosed}
          onClick={() => setReassignOpen(true)}
        >
          <UserCog className="size-4" />
          Reassign lead
        </Button>
        <Button
          variant="destructive"
          className="justify-start"
          disabled={isClosed}
          onClick={() => setCloseOpen(true)}
        >
          <Lock className="size-4" />
          {isClosed ? "Case closed" : "Close case"}
        </Button>
      </div>

      {/* Change status */}
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change case status</DialogTitle>
            <DialogDescription>
              Update the working status of this case.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStatusOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleStatus} disabled={busy}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reassign lead */}
      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign lead</DialogTitle>
            <DialogDescription>
              The current lead is removed from the case unless you keep their
              read-only access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New lead</Label>
              <Select value={newLeadId} onValueChange={setNewLeadId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a lawyer" />
                </SelectTrigger>
                <SelectContent>
                  {leadOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name ?? "Unnamed"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label htmlFor="keep-ro">Keep previous lead read-only</Label>
                <p className="text-xs text-muted-foreground">
                  Grants the former lead a read-only access override.
                </p>
              </div>
              <Switch
                id="keep-ro"
                checked={keepReadOnly}
                onCheckedChange={setKeepReadOnly}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReassignOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleReassign} disabled={busy}>
              Reassign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close case */}
      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close case</DialogTitle>
            <DialogDescription>
              Closing sets the retention date from firm policy and archives all
              case documents. This records a closure summary.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="summary">Closure summary</Label>
            <Textarea
              id="summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Summarise the outcome and final disposition…"
              rows={5}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCloseOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleClose}
              disabled={busy || summary.trim().length < 3}
            >
              Close case
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
