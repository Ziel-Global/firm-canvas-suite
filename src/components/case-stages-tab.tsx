import { type ReactNode, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  CircleDot,
  Clock,
  FileOutput,
  Loader2,
  Lock,
  Plus,
  StickyNote,
  Trash2,
  Undo2,
  User,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import { getCaseStages, type CaseStageRow } from "@/lib/cases.functions";
import { completeStage, returnStage } from "@/lib/stage-transitions.functions";
import {
  assignStageAssignee,
  createCaseStage,
  deleteCaseStage,
  listCaseTeam,
  updateCaseStage,
} from "@/lib/case-lifecycle.functions";
import { useAuth } from "@/contexts/auth-context";
import { DarkDatePicker } from "@/components/dark-date-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tag } from "@/components/ui/tag";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const FIELD_CLASS =
  "border-border bg-surface shadow-none focus-visible:ring-1 focus-visible:ring-white/15";

function parseIsoDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function toIsoDate(date: Date | undefined): string | null {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const STATUS_TAG: Record<
  string,
  { label: string; color: "high" | "medium" | "low" | "purple" | "blue" | "sand" | "green" }
> = {
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

function formatStatus(status: string | null) {
  if (!status) return "Pending";
  if (status === "active") return "Active";
  if (status === "complete") return "Complete";
  if (status === "returned") return "Returned";
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function StepIcon({ status }: { status: string | null }) {
  if (status === "complete") return <Check className="size-4 text-primary-foreground" />;
  if (status === "active") return <CircleDot className="size-4 text-primary-foreground" />;
  return <span className="text-xs font-semibold" />;
}

export function CaseStagesTab({
  caseId,
  initialStageId,
}: {
  caseId: string;
  initialStageId?: string | null;
}) {
  const fetchStages = useServerFn(getCaseStages);
  const { data: stages, isLoading } = useQuery({
    queryKey: ["case-stages", caseId],
    queryFn: () => fetchStages({ data: { caseId } }),
  });
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const canManage = role === "super_admin" || role === "admin";
  const [adding, setAdding] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(
    initialStageId ?? null,
  );

  useEffect(() => {
    if (!stages || stages.length === 0) return;
    setSelectedId((prev) => {
      if (initialStageId && stages.some((s) => s.id === initialStageId)) {
        return initialStageId;
      }
      if (prev && stages.some((s) => s.id === prev)) return prev;
      const active = stages.find((s) => s.status === "active");
      return active?.id ?? stages[0].id;
    });
  }, [stages, initialStageId]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["case-stages", caseId] });
    queryClient.invalidateQueries({ queryKey: ["case", caseId] });
    queryClient.invalidateQueries({ queryKey: ["case-activity", caseId] });
    queryClient.invalidateQueries({ queryKey: ["case-overview", caseId] });
    queryClient.invalidateQueries({ queryKey: ["cases"] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["case-team", caseId] });
  };

  if (isLoading) {
    return <Card className="p-6 text-sm text-muted-foreground">Loading stages…</Card>;
  }

  if (!stages || stages.length === 0) {
    return (
      <div className="space-y-4">
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-foreground">Stages</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            This case has no workflow stages yet.
            {canManage
              ? " Add stages and set each deadline here — nothing is created automatically."
              : " An admin needs to add stages and deadlines for this case."}
          </p>
          {canManage ? (
            <Button
              type="button"
              className="mt-4 gap-1.5"
              onClick={() => setAdding(true)}
            >
              <Plus className="size-4" />
              Add stage
            </Button>
          ) : null}
        </Card>
        {canManage && adding ? (
          <AddStageCard
            caseId={caseId}
            onCancel={() => setAdding(false)}
            onCreated={(id) => {
              setAdding(false);
              setSelectedId(id);
              invalidate();
            }}
          />
        ) : null}
      </div>
    );
  }

  const selected = stages.find((s) => s.id === selectedId) ?? stages[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {canManage
            ? "Set each stage deadline manually. Calendar deadline events update when you save a date."
            : "Stage progress and deadlines for this case."}
        </p>
        {canManage ? (
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            onClick={() => setAdding((v) => !v)}
          >
            <Plus className="size-3.5" />
            {adding ? "Hide form" : "Add stage"}
          </Button>
        ) : null}
      </div>

      {canManage && adding ? (
        <AddStageCard
          caseId={caseId}
          onCancel={() => setAdding(false)}
          onCreated={(id) => {
            setAdding(false);
            setSelectedId(id);
            invalidate();
          }}
        />
      ) : null}

      {/* Horizontal stepper */}
      <Card className="overflow-x-auto p-5">
        <ol className="flex min-w-max items-start gap-2">
          {stages.map((stage, idx) => {
            const isActive = stage.status === "active";
            const isComplete = stage.status === "complete";
            const isReturned = stage.status === "returned";
            const isSelected = stage.id === selected.id;
            return (
              <li key={stage.id} className="flex items-start">
                <button
                  type="button"
                  onClick={() => setSelectedId(stage.id)}
                  className={cn(
                    "flex w-48 flex-col items-center gap-3 rounded-card border px-3 py-3 text-center transition-all",
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-surface hover:bg-frame/50",
                    isActive && "ring-2 ring-primary/20",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-10 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors",
                      isComplete && "border-primary bg-primary text-primary-foreground",
                      isActive &&
                        "border-primary bg-primary text-primary-foreground ring-4 ring-primary/20",
                      isReturned && "border-priority-high bg-priority-high/10 text-priority-high",
                      !isComplete && !isActive && "border-border bg-surface text-muted-foreground",
                    )}
                  >
                    {isComplete || isActive ? <StepIcon status={stage.status} /> : idx + 1}
                  </span>
                  <div className="space-y-1">
                    <span
                      className={cn(
                        "line-clamp-2 block text-sm font-medium leading-snug",
                        isSelected ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {stage.name ?? `Stage ${idx + 1}`}
                    </span>
                    <div className="space-y-0.5 text-xs text-muted-foreground">
                      <MetaLine label="Assignee" value={stage.assignee_name ?? "Unassigned"} />
                      <MetaLine label="Status" value={formatStatus(stage.status)} />
                      <MetaLine label="Deadline" value={formatDate(stage.deadline)} />
                    </div>
                  </div>
                </button>
                {idx < stages.length - 1 && (
                  <span
                    className={cn(
                      "mt-[20px] h-0.5 w-8 shrink-0 rounded-full",
                      isComplete || isActive ? "bg-primary" : "bg-border",
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
        canAssign={canManage}
        canAct={
          role === "super_admin" ||
          role === "admin" ||
          role === "senior_lawyer" ||
          selected.assignee_id === user?.id
        }
        onChanged={invalidate}
      />
    </div>
  );
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5 truncate">
      <span className="font-medium text-foreground/80">{label}:</span>
      <span className="truncate">{value}</span>
    </div>
  );
}

function AddStageCard({
  caseId,
  onCancel,
  onCreated,
}: {
  caseId: string;
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const create = useServerFn(createCaseStage);
  const [name, setName] = useState("");
  const [deadline, setDeadline] = useState<Date | undefined>();
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          caseId,
          name: name.trim(),
          deadline: toIsoDate(deadline),
          notes: notes.trim() || null,
        },
      }),
    onSuccess: (result) => {
      toast.success("Stage added.");
      onCreated(result.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">New stage</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Name the stage and set its deadline. Leave the date empty if it is not fixed yet.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="new-stage-name">Stage name</Label>
          <Input
            id="new-stage-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Drafting, Filing, Hearing"
            className={FIELD_CLASS}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Deadline</Label>
          <div className="flex flex-wrap items-center gap-2">
            <DarkDatePicker
              value={deadline}
              onChange={setDeadline}
              className={cn("flex-1", FIELD_CLASS)}
              placeholder="Set deadline"
            />
            {deadline ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDeadline(undefined)}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="new-stage-notes">Notes (optional)</Label>
          <Textarea
            id="new-stage-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={FIELD_CLASS}
            placeholder="Internal notes for this stage…"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={mutation.isPending || !name.trim()}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Save stage
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={mutation.isPending}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

function StageDetail({
  stage,
  caseId,
  isFirst,
  canAct,
  canAssign,
  isSuperAdmin,
  onChanged,
}: {
  stage: CaseStageRow;
  caseId: string;
  isFirst: boolean;
  canAct: boolean;
  canAssign: boolean;
  isSuperAdmin: boolean;
  onChanged: () => void;
}) {
  const status = stage.status ?? "pending";
  const tag = STATUS_TAG[status] ?? STATUS_TAG.pending;
  const NONE = "__none__";

  const complete = useServerFn(completeStage);
  const sendBack = useServerFn(returnStage);
  const assignStage = useServerFn(assignStageAssignee);
  const updateStage = useServerFn(updateCaseStage);
  const removeStage = useServerFn(deleteCaseStage);
  const fetchTeam = useServerFn(listCaseTeam);
  const [notes, setNotes] = useState("");
  const [comments, setComments] = useState("");
  const [returning, setReturning] = useState(false);
  const [assigneeDraft, setAssigneeDraft] = useState<string>(
    stage.assignee_id ?? NONE,
  );
  const [nameDraft, setNameDraft] = useState(stage.name ?? "");
  const [deadlineDraft, setDeadlineDraft] = useState<Date | undefined>(
    parseIsoDate(stage.deadline),
  );
  const [stageNotesDraft, setStageNotesDraft] = useState(stage.notes ?? "");

  useEffect(() => {
    setAssigneeDraft(stage.assignee_id ?? NONE);
  }, [stage.id, stage.assignee_id]);

  useEffect(() => {
    setNameDraft(stage.name ?? "");
    setDeadlineDraft(parseIsoDate(stage.deadline));
    setStageNotesDraft(stage.notes ?? "");
  }, [stage.id, stage.name, stage.deadline, stage.notes]);

  const { data: team = [] } = useQuery({
    queryKey: ["case-team", caseId],
    queryFn: () => fetchTeam({ data: { caseId } }),
    enabled: canAssign,
  });

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
    mutationFn: () => sendBack({ data: { caseId, stageId: stage.id, comments } }),
    onSuccess: () => {
      toast.success("Stage returned to the previous assignee.");
      setComments("");
      setReturning(false);
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignMutation = useMutation({
    mutationFn: () =>
      assignStage({
        data: {
          stageId: stage.id,
          assigneeId: assigneeDraft === NONE ? null : assigneeDraft,
        },
      }),
    onSuccess: () => {
      toast.success("Stage assignee updated.");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveDetailsMutation = useMutation({
    mutationFn: () =>
      updateStage({
        data: {
          stageId: stage.id,
          name: nameDraft.trim(),
          deadline: toIsoDate(deadlineDraft),
          notes: stageNotesDraft.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Stage details saved.");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => removeStage({ data: { stageId: stage.id } }),
    onSuccess: () => {
      toast.success("Stage removed.");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isActive = status === "active";
  const isPrincipalApproval = /principal\s+approval/i.test(stage.name ?? "");
  const principalLocked = isPrincipalApproval && !isSuperAdmin;
  const assigneeDirty = (stage.assignee_id ?? NONE) !== assigneeDraft;
  const detailsDirty =
    (stage.name ?? "") !== nameDraft.trim() ||
    (stage.deadline ?? null) !== toIsoDate(deadlineDraft) ||
    (stage.notes ?? "") !== stageNotesDraft.trim();
  const canDelete = canAssign && status !== "active" && status !== "complete";

  return (
    <Card className="space-y-5 border-white/[0.08] bg-[rgba(18,18,20,0.78)] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-foreground">
          {canAssign ? "Stage details" : (stage.name ?? "Stage")}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Tag color={tag.color}>{tag.label}</Tag>
          {canDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 text-priority-high hover:text-priority-high"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Remove stage “${stage.name ?? "Untitled"}”? This cannot be undone.`,
                  )
                ) {
                  deleteMutation.mutate();
                }
              }}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              Delete
            </Button>
          ) : null}
        </div>
      </div>

      {canAssign ? (
        <div className="space-y-4 rounded-card border border-border bg-frame/40 p-4">
          <div className="space-y-1.5">
            <Label htmlFor={`stage-name-${stage.id}`}>Name</Label>
            <Input
              id={`stage-name-${stage.id}`}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              className={FIELD_CLASS}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Deadline</Label>
            <div className="flex flex-wrap items-center gap-2">
              <DarkDatePicker
                value={deadlineDraft}
                onChange={setDeadlineDraft}
                className={cn("min-w-[14rem] flex-1", FIELD_CLASS)}
                placeholder="Set deadline"
              />
              {deadlineDraft ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeadlineDraft(undefined)}
                >
                  Clear
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Must fall before the next stage’s deadline (and after the previous
              one) when those dates are set.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`stage-notes-${stage.id}`}>Notes</Label>
            <Textarea
              id={`stage-notes-${stage.id}`}
              value={stageNotesDraft}
              onChange={(e) => setStageNotesDraft(e.target.value)}
              rows={3}
              className={FIELD_CLASS}
              placeholder="Internal notes for this stage…"
            />
          </div>
          {detailsDirty ? (
            <Button
              type="button"
              size="sm"
              disabled={saveDetailsMutation.isPending || !nameDraft.trim()}
              onClick={() => saveDetailsMutation.mutate()}
            >
              {saveDetailsMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              Save stage details
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field icon={<User className="size-4" />} label="Assignee">
          {canAssign ? (
            <div className="space-y-2">
              <Select value={assigneeDraft} onValueChange={setAssigneeDraft}>
                <SelectTrigger className="border-border bg-surface">
                  <SelectValue placeholder="Assign someone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                  {team.map((p) => (
                    <SelectItem key={p.userId} value={p.userId}>
                      {p.fullName}
                      {p.isLead ? " (Lead)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {team.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Add lawyers on the Team tab before assigning a stage.
                </p>
              ) : null}
              {assigneeDirty ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5"
                  disabled={assignMutation.isPending}
                  onClick={() => assignMutation.mutate()}
                >
                  {assignMutation.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <UserPlus className="size-3.5" />
                  )}
                  Save assignee
                </Button>
              ) : null}
            </div>
          ) : (
            stage.assignee_name || "Unassigned"
          )}
        </Field>
        {!canAssign ? (
          <Field icon={<Clock className="size-4" />} label="Deadline">
            {formatDate(stage.deadline)}
          </Field>
        ) : null}
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

      {!canAssign ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <StickyNote className="size-4 text-muted-foreground" />
            Notes
          </div>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {stage.notes || "No notes on this stage."}
          </p>
        </div>
      ) : null}

      {isActive && principalLocked && (
        <div className="flex items-start gap-2 rounded-card border border-priority-high/40 bg-priority-high/10 p-4 text-sm text-foreground">
          <Lock className="mt-0.5 size-4 shrink-0 text-priority-high" />
          <p>
            This is the <span className="font-medium">Principal Approval</span> stage. No output can
            advance past it without the Super Admin&apos;s explicit sign-off. Only the Super Admin can
            mark this stage complete.
          </p>
        </div>
      )}

      {isActive && canAct && !principalLocked && (
        <div className="space-y-4 rounded-card border border-border bg-frame/40 p-4">
          <h4 className="text-sm font-semibold text-foreground">Stage actions</h4>
          {!returning ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  Completion notes (optional)
                </Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Summarise the work completed for this stage…"
                  rows={3}
                  className="border-border bg-surface"
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
                <Label className="text-xs font-medium text-muted-foreground">
                  Comments for the previous assignee
                </Label>
                <Textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Explain what needs to change before this stage can proceed…"
                  rows={3}
                  className="border-border bg-surface"
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

function Field({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
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
