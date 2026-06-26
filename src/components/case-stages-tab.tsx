import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, CircleDot, Clock, FileOutput, Loader2, StickyNote, Undo2, User } from "lucide-react";
import { toast } from "sonner";

import { getCaseStages, type CaseStageRow } from "@/lib/cases.functions";
import { completeStage, returnStage } from "@/lib/stage-transitions.functions";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";


const STATUS_TAG: Record<string, { label: string; color: "high" | "medium" | "low" | "purple" | "blue" | "sand" | "green" }> = {
  pending: { label: "Pending", color: "low" },
  active: { label: "Active", color: "blue" },
  complete: { label: "Complete", color: "green" },
  returned: { label: "Returned", color: "high" },
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function StepIcon({ status }: { status: string | null }) {
  if (status === "complete")
    return <Check className="size-4 text-primary-foreground" />;
  if (status === "active")
    return <CircleDot className="size-4 text-primary-foreground" />;
  return <span className="text-xs font-semibold" />;
}

export function CaseStagesTab({ caseId }: { caseId: string }) {
  const fetchStages = useServerFn(getCaseStages);
  const { data: stages, isLoading } = useQuery({
    queryKey: ["case-stages", caseId],
    queryFn: () => fetchStages({ data: { caseId } }),
  });
  const { user, role } = useAuth();
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!stages || stages.length === 0) return;
    setSelectedId((prev) => {
      if (prev && stages.some((s) => s.id === prev)) return prev;
      const active = stages.find((s) => s.status === "active");
      return active?.id ?? stages[0].id;
    });
  }, [stages]);

  if (isLoading) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">Loading stages…</Card>
    );
  }

  if (!stages || stages.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-foreground">Stages</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          This case has no workflow stages yet. Stages are added when a workflow
          template is applied.
        </p>
      </Card>
    );
  }

  const selected = stages.find((s) => s.id === selectedId) ?? stages[0];

  return (
    <div className="space-y-6">
      {/* Horizontal stepper */}
      <Card className="overflow-x-auto p-5">
        <ol className="flex min-w-max items-start gap-2">
          {stages.map((stage, idx) => {
            const isActive = stage.status === "active";
            const isComplete = stage.status === "complete";
            const isSelected = stage.id === selected.id;
            return (
              <li key={stage.id} className="flex items-start">
                <button
                  type="button"
                  onClick={() => setSelectedId(stage.id)}
                  className={cn(
                    "flex w-32 flex-col items-center gap-2 rounded-control px-2 py-2 text-center transition-colors",
                    isSelected ? "bg-frame" : "hover:bg-frame/50",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-full border-2 text-sm font-semibold",
                      isComplete && "border-primary bg-primary text-primary-foreground",
                      isActive &&
                        "border-primary bg-primary text-primary-foreground ring-4 ring-primary/20",
                      !isComplete &&
                        !isActive &&
                        "border-border bg-surface text-muted-foreground",
                    )}
                  >
                    {isComplete || isActive ? (
                      <StepIcon status={stage.status} />
                    ) : (
                      idx + 1
                    )}
                  </span>
                  <span
                    className={cn(
                      "line-clamp-2 text-xs font-medium",
                      isSelected ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {stage.name ?? `Stage ${idx + 1}`}
                  </span>
                </button>
                {idx < stages.length - 1 && (
                  <span
                    className={cn(
                      "mt-[18px] h-0.5 w-6 shrink-0 rounded-full",
                      isComplete ? "bg-primary" : "bg-border",
                    )}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </Card>

      {/* Detail panel */}
      <StageDetail
        stage={selected}
        caseId={caseId}
        isFirst={stages[0]?.id === selected.id}
        isSuperAdmin={role === "super_admin"}
        canAct={
          role === "super_admin" ||
          role === "admin" ||
          role === "senior_lawyer" ||
          selected.assignee_id === user?.id
        }
        onChanged={() => {
          queryClient.invalidateQueries({ queryKey: ["case-stages", caseId] });
          queryClient.invalidateQueries({ queryKey: ["case-detail", caseId] });
          queryClient.invalidateQueries({ queryKey: ["case-activity", caseId] });
        }}
      />


    </div>
  );
}

function StageDetail({
  stage,
  caseId,
  isFirst,
  canAct,
  isSuperAdmin,
  onChanged,
}: {
  stage: CaseStageRow;
  caseId: string;
  isFirst: boolean;
  canAct: boolean;
  isSuperAdmin: boolean;
  onChanged: () => void;
}) {
  const status = stage.status ?? "pending";
  const tag = STATUS_TAG[status] ?? STATUS_TAG.pending;

  const complete = useServerFn(completeStage);
  const sendBack = useServerFn(returnStage);
  const [notes, setNotes] = useState("");
  const [comments, setComments] = useState("");
  const [returning, setReturning] = useState(false);

  const completeMutation = useMutation({
    mutationFn: () =>
      complete({
        data: {
          caseId,
          stageId: stage.id,
          notes: notes.trim() ? notes.trim() : undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Stage marked complete. The next assignee was notified.");
      setNotes("");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const returnMutation = useMutation({
    mutationFn: () =>
      sendBack({ data: { caseId, stageId: stage.id, comments } }),
    onSuccess: () => {
      toast.success("Stage returned to the previous assignee.");
      setComments("");
      setReturning(false);
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isActive = status === "active";
  const isPrincipalApproval = /principal\s+approval/i.test(stage.name ?? "");
  const principalLocked = isPrincipalApproval && !isSuperAdmin;



  return (
    <Card className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-foreground">
          {stage.name ?? "Stage"}
        </h3>
        <Tag color={tag.color}>{tag.label}</Tag>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field icon={<User className="size-4" />} label="Assignee">
          {stage.assignee_name || "Unassigned"}
        </Field>
        <Field icon={<Clock className="size-4" />} label="Deadline">
          {formatDate(stage.deadline)}
        </Field>
        <Field icon={<Clock className="size-4" />} label="Started">
          {formatDate(stage.started_at)}
        </Field>
        <Field icon={<Check className="size-4" />} label="Completed">
          {formatDate(stage.completed_at)}
        </Field>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <FileOutput className="size-4 text-muted-foreground" />
          Expected output
        </div>
        <p className="text-sm text-muted-foreground">
          {stage.expected_output || "No expected output defined for this stage."}
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <StickyNote className="size-4 text-muted-foreground" />
          Notes
        </div>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {stage.notes || "No notes on this stage."}
        </p>
      </div>

      {isActive && principalLocked && (
        <div className="flex items-start gap-2 rounded-card border border-priority-high/40 bg-priority-high/10 p-4 text-sm text-foreground">
          <Lock className="mt-0.5 size-4 shrink-0 text-priority-high" />
          <p>
            This is the <span className="font-medium">Principal Approval</span>{" "}
            stage. No output can advance past it without the Super Admin's
            explicit sign-off. Only the Super Admin can mark this stage complete.
          </p>
        </div>
      )}

      {isActive && canAct && !principalLocked && (

        <div className="space-y-4 rounded-card border border-border bg-frame/40 p-4">
          <h4 className="text-sm font-semibold text-foreground">
            Stage actions
          </h4>
          {!returning ? (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Completion notes (optional)
                </label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Summarise the work completed for this stage…"
                  rows={3}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => completeMutation.mutate()}
                  disabled={completeMutation.isPending}
                >
                  {completeMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Mark complete
                </Button>
                {!isFirst && (
                  <Button
                    variant="ghost"
                    onClick={() => setReturning(true)}
                    disabled={completeMutation.isPending}
                  >
                    <Undo2 className="size-4" />
                    Return to previous
                  </Button>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Comments for the previous assignee
                </label>
                <Textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Explain what needs to change before this stage can proceed…"
                  rows={3}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="destructive"
                  onClick={() => returnMutation.mutate()}
                  disabled={returnMutation.isPending || !comments.trim()}
                >
                  {returnMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Undo2 className="size-4" />
                  )}
                  Return stage
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setReturning(false);
                    setComments("");
                  }}
                  disabled={returnMutation.isPending}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>

  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-sm font-medium text-foreground">{children}</div>
    </div>
  );
}
