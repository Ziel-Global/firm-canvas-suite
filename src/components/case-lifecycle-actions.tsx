import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw, UserCog, Lock, Sparkles, Loader2 } from "lucide-react";

import {
  changeCaseStatus,
  closeCase,
} from "@/lib/case-lifecycle.functions";
import { generateClosureSummary } from "@/lib/knowledge-base.functions";
import { AssignLeadDialog } from "@/components/assign-lead-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

export function CaseLifecycleActions({
  caseId,
  status,
}: {
  caseId: string;
  status: string | null;
}) {
  const queryClient = useQueryClient();
  const changeStatus = useServerFn(changeCaseStatus);
  const close = useServerFn(closeCase);
  const genSummary = useServerFn(generateClosureSummary);

  const [statusOpen, setStatusOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  const [newStatus, setNewStatus] = useState<string>(status ?? "active");
  const [summary, setSummary] = useState("");
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [busy, setBusy] = useState(false);

  const isClosed = status === "closed";

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["case", caseId] });
    queryClient.invalidateQueries({ queryKey: ["case-overview", caseId] });
    queryClient.invalidateQueries({ queryKey: ["case-activity", caseId] });
    queryClient.invalidateQueries({ queryKey: ["cases"] });
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

  async function handleClose() {
    setBusy(true);
    try {
      await close({ data: { caseId, closureSummary: summary } });
      toast.success("Case closed and closure summary saved.");
      setCloseOpen(false);
      setSummary("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not close case.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAutoGenerate() {
    setGeneratingSummary(true);
    try {
      const result = await genSummary({ data: { caseId } });
      setSummary(result.summary);
      toast.success("AI summary generated — review and edit before closing.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate summary.");
    } finally {
      setGeneratingSummary(false);
    }
  }

  return (
    <Card className="space-y-2 border-white/[0.08] bg-[rgba(18,18,20,0.78)] p-5">
      <h3 className="text-sm font-semibold text-foreground">Lifecycle</h3>
      <div className="grid gap-2">
        <Button
          variant="ghost"
          className="justify-start border border-transparent hover:border-white/[0.08]"
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
          className="justify-start border border-transparent hover:border-white/[0.08]"
          disabled={isClosed}
          onClick={() => setReassignOpen(true)}
        >
          <UserCog className="size-4" />
          Assign / change lead
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
              <SelectTrigger className="border-border bg-surface">
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
            <Button
              variant="ghost"
              className="border border-white/[0.12] bg-white/[0.06]"
              onClick={() => setStatusOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleStatus} disabled={busy}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AssignLeadDialog
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        caseId={caseId}
        onAssigned={() => refresh()}
      />

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
            <div className="flex items-center justify-between">
              <Label htmlFor="summary">Closure summary</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAutoGenerate}
                disabled={generatingSummary || busy}
                className="h-7 text-xs text-tag-blue border-tag-blue/30 hover:bg-tag-blue/10"
              >
                {generatingSummary ? (
                  <>
                    <Loader2 className="mr-1 size-3 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-1 size-3" />
                    Auto-generate with AI
                  </>
                )}
              </Button>
            </div>
            <Textarea
              id="summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Summarise the outcome and final disposition, or click Auto-generate…"
              rows={7}
              className="border-border bg-surface"
            />
            <p className="text-xs text-muted-foreground">
              Review and edit the summary before closing. It will be stored on
              the case and be searchable in the Knowledge Base.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              className="border border-white/[0.12] bg-white/[0.06]"
              onClick={() => setCloseOpen(false)}
            >
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
