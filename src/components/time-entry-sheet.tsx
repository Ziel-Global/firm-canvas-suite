import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Timer, Plus } from "lucide-react";
import { toast } from "sonner";

import { createManualTimeEntry, startTimer } from "@/lib/time-entries.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface TimeEntrySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
}

export function TimeEntrySheet({ open, onOpenChange, caseId }: TimeEntrySheetProps) {
  const queryClient = useQueryClient();
  const start = useServerFn(startTimer);
  const logManual = useServerFn(createManualTimeEntry);

  const [mode, setMode] = useState<"timer" | "manual">("timer");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("");
  const [isBillable, setIsBillable] = useState(true);
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");

  function reset() {
    setDescription("");
    setCode("");
    setIsBillable(true);
    setHours("");
    setMinutes("");
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["running-timer"] });
    queryClient.invalidateQueries({ queryKey: ["case-time-entries", caseId] });
  }

  const startMutation = useMutation({
    mutationFn: () =>
      start({
        data: { caseId, description: description.trim(), code: code.trim() || undefined, isBillable },
      }),
    onSuccess: () => {
      toast.success("Timer started");
      invalidate();
      reset();
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const manualMutation = useMutation({
    mutationFn: () => {
      const durationMinutes = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
      return logManual({
        data: {
          caseId,
          entryDate,
          durationMinutes,
          description: description.trim(),
          code: code.trim() || undefined,
          isBillable,
        },
      });
    },
    onSuccess: () => {
      toast.success("Time logged");
      invalidate();
      reset();
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const busy = startMutation.isPending || manualMutation.isPending;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      toast.error("A description is required.");
      return;
    }
    if (mode === "timer") {
      startMutation.mutate();
      return;
    }
    const durationMinutes = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
    if (durationMinutes <= 0) {
      toast.error("Enter a duration.");
      return;
    }
    manualMutation.mutate();
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
          <SheetTitle>Log time</SheetTitle>
          <SheetDescription>
            Start a live timer or log hours you have already worked.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 overflow-y-auto py-4">
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(v) => v && setMode(v as "timer" | "manual")}
            className="rounded-xl border border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-1"
          >
            <ToggleGroupItem value="timer" className="flex-1 gap-1.5">
              <Timer className="size-3.5" />
              Start timer
            </ToggleGroupItem>
            <ToggleGroupItem value="manual" className="flex-1 gap-1.5">
              <Plus className="size-3.5" />
              Log manually
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="space-y-2">
            <Label htmlFor="time-entry-description">Description *</Label>
            <Textarea
              id="time-entry-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What did you work on?"
              rows={3}
            />
          </div>

          {mode === "manual" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="time-entry-date">Date</Label>
                <Input
                  id="time-entry-date"
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Duration</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={0}
                    placeholder="Hrs"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                  />
                  <Input
                    type="number"
                    min={0}
                    max={59}
                    placeholder="Min"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                  />
                </div>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="time-entry-code">UTBMS / billing code (optional)</Label>
            <Input
              id="time-entry-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. L120"
            />
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <Checkbox checked={isBillable} onCheckedChange={(c) => setIsBillable(c === true)} />
            Billable
          </label>

          <SheetFooter className="mt-auto flex-row gap-2">
            <Button
              type="button"
              variant="ghost"
              className="flex-1 border border-white/[0.12] bg-white/[0.06] text-foreground hover:bg-white/[0.1] hover:text-foreground"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={busy}>
              {busy ? "Saving…" : mode === "timer" ? "Start timer" : "Save entry"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
