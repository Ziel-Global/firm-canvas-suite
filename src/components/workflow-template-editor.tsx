import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Save, Trash2, X } from "lucide-react";

import {
  getWorkflowTemplate,
  saveTemplateStages,
  updateWorkflowTemplate,
  type StageInput,
} from "@/lib/workflow-templates.functions";
import type { AppRole } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin", label: "Admin" },
  { value: "senior_lawyer", label: "Senior Lawyer" },
  { value: "junior_lawyer", label: "Junior Lawyer" },
  { value: "support", label: "Support" },
];

interface StageRow extends StageInput {
  key: string;
}

let keyCounter = 0;
const nextKey = () => `s${++keyCounter}`;

export function WorkflowTemplateEditor({
  templateId,
  onClose,
}: {
  templateId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fetchTemplate = useServerFn(getWorkflowTemplate);
  const saveStages = useServerFn(saveTemplateStages);
  const updateMeta = useServerFn(updateWorkflowTemplate);

  const { data, isLoading } = useQuery({
    queryKey: ["workflow-template", templateId],
    queryFn: () => fetchTemplate({ data: { id: templateId } }),
  });

  const [name, setName] = useState("");
  const [caseType, setCaseType] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [stages, setStages] = useState<StageRow[]>([]);

  useEffect(() => {
    if (!data) return;
    setName(data.template.name ?? "");
    setCaseType(data.template.case_type ?? "");
    setDescription(data.template.description ?? "");
    setIsActive(data.template.is_active ?? true);
    setStages(
      data.stages.map((s) => ({
        key: nextKey(),
        name: s.name ?? "",
        responsible_role: (s.responsible_role ?? "junior_lawyer") as AppRole,
        expected_output: s.expected_output ?? "",
        deadline_days: s.deadline_days,
      })),
    );
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await updateMeta({
        data: {
          id: templateId,
          name,
          case_type: caseType,
          description,
          is_active: isActive,
        },
      });
      await saveStages({
        data: {
          template_id: templateId,
          stages: stages.map(({ key: _k, ...rest }) => rest),
        },
      });
    },
    onSuccess: () => {
      toast.success("Template saved");
      qc.invalidateQueries({ queryKey: ["workflow-templates"] });
      qc.invalidateQueries({ queryKey: ["workflow-template", templateId] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addStage = () =>
    setStages((prev) => [
      ...prev,
      {
        key: nextKey(),
        name: "",
        responsible_role: "junior_lawyer",
        expected_output: "",
        deadline_days: 7,
      },
    ]);

  const updateStage = (key: string, patch: Partial<StageRow>) =>
    setStages((prev) =>
      prev.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    );

  const removeStage = (key: string) =>
    setStages((prev) => prev.filter((s) => s.key !== key));

  const move = (index: number, dir: -1 | 1) =>
    setStages((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  if (isLoading) {
    return <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>;
  }

  return (
    <Card className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-lg font-semibold text-foreground">Edit template</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Template name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Case type</Label>
          <Input
            value={caseType}
            onChange={(e) => setCaseType(e.target.value)}
            placeholder="e.g. Litigation"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="size-4 rounded"
          />
          Active
        </label>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">
            Stages ({stages.length})
          </h4>
          <Button variant="ghost" size="sm" onClick={addStage}>
            <Plus className="mr-1 size-4" /> Add stage
          </Button>
        </div>

        {stages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No stages yet. Add the first stage to define this workflow.
          </p>
        )}

        {stages.map((stage, idx) => (
          <Card key={stage.key} className="space-y-3 bg-frame/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {idx + 1}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={idx === 0}
                  onClick={() => move(idx, -1)}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={idx === stages.length - 1}
                  onClick={() => move(idx, 1)}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeStage(stage.key)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Stage name</Label>
                <Input
                  value={stage.name}
                  onChange={(e) =>
                    updateStage(stage.key, { name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Responsible role</Label>
                <Select
                  value={stage.responsible_role}
                  onValueChange={(v) =>
                    updateStage(stage.key, {
                      responsible_role: v as AppRole,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Deadline (days)</Label>
                <Input
                  type="number"
                  min={0}
                  value={stage.deadline_days ?? ""}
                  onChange={(e) =>
                    updateStage(stage.key, {
                      deadline_days:
                        e.target.value === ""
                          ? null
                          : Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Required output</Label>
                <Textarea
                  value={stage.expected_output}
                  onChange={(e) =>
                    updateStage(stage.key, {
                      expected_output: e.target.value,
                    })
                  }
                  rows={2}
                  placeholder="What must be produced to complete this stage?"
                />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !name.trim()}
        >
          <Save className="mr-1 size-4" />
          {saveMutation.isPending ? "Saving…" : "Save template"}
        </Button>
      </div>
    </Card>
  );
}
