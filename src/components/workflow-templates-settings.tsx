import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Workflow } from "lucide-react";

import {
  createWorkflowTemplate,
  deleteWorkflowTemplate,
  listWorkflowTemplates,
  type WorkflowTemplate,
} from "@/lib/workflow-templates.functions";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { WorkflowTemplateEditor } from "@/components/workflow-template-editor";
import { SettingsSection } from "@/components/settings-section";
import { cn } from "@/lib/utils";

export function WorkflowTemplatesSettings() {
  const { role } = useAuth();
  const canManage = role === "super_admin" || role === "admin";

  const qc = useQueryClient();
  const fetchList = useServerFn(listWorkflowTemplates);
  const createTpl = useServerFn(createWorkflowTemplate);
  const deleteTpl = useServerFn(deleteWorkflowTemplate);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCaseType, setNewCaseType] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["workflow-templates"],
    queryFn: () => fetchList(),
    enabled: canManage,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createTpl({
        data: { name: newName, case_type: newCaseType, description: newDesc },
      }),
    onSuccess: ({ id }) => {
      toast.success("Template created");
      qc.invalidateQueries({ queryKey: ["workflow-templates"] });
      setNewOpen(false);
      setNewName("");
      setNewCaseType("");
      setNewDesc("");
      setEditingId(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTpl({ data: { id } }),
    onSuccess: () => {
      toast.success("Template deleted");
      qc.invalidateQueries({ queryKey: ["workflow-templates"] });
      setDeleteId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canManage) return null;

  if (editingId) {
    return (
      <SettingsSection
        eyebrow="Workflows"
        title="Workflow templates"
        description="Editing stages for this reusable workflow."
        bare
      >
        <WorkflowTemplateEditor
          templateId={editingId}
          onClose={() => setEditingId(null)}
        />
      </SettingsSection>
    );
  }

  const grouped = groupByCaseType(templates ?? []);

  return (
    <>
      <SettingsSection
        eyebrow="Workflows"
        title="Workflow templates"
        description="Reusable stage workflows applied when creating matters, grouped by matter type."
        action={
          <Button
            onClick={() => setNewOpen(true)}
            className="h-9 gap-1.5 border-0 bg-gradient-to-b from-[#F8F8F8] to-[#CFCFCF] px-3 text-[#1a1c20] shadow-[0_8px_20px_rgba(0,0,0,0.22)] hover:from-white hover:to-[#d8d8d8]"
          >
            <Plus className="size-4" />
            New template
          </Button>
        }
      >
        {isLoading ? (
          <div className="px-5 py-14 text-center text-sm text-muted-foreground">
            Loading templates…
          </div>
        ) : (templates?.length ?? 0) === 0 ? (
          <div className="relative px-6 py-16 text-center">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.05),transparent_55%)]"
            />
            <div className="relative mx-auto flex size-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-muted-foreground">
              <Workflow className="size-5" />
            </div>
            <p className="relative mt-4 text-sm font-medium text-foreground">
              No workflow templates yet
            </p>
            <p className="relative mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Create a reusable stage sequence to speed up new matters.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {grouped.map(([caseType, items]) => (
              <div key={caseType}>
                <div className="border-b border-white/[0.04] bg-white/[0.015] px-4 py-2.5 sm:px-5">
                  <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {caseType}
                  </span>
                </div>
                <ul className="divide-y divide-white/[0.06]">
                  {items.map((t) => (
                    <li
                      key={t.id}
                      className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between sm:px-5"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-muted-foreground">
                          <Workflow className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-semibold tracking-tight text-foreground">
                              {t.name ?? "Untitled"}
                            </span>
                            {!t.is_active ? (
                              <span className="rounded-md bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Inactive
                              </span>
                            ) : null}
                            <span className="rounded-md bg-white/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide tabular-nums text-foreground/85">
                              {t.stage_count} stage
                              {t.stage_count === 1 ? "" : "s"}
                            </span>
                          </div>
                          {t.description ? (
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                              {t.description}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2 pl-12 sm:pl-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingId(t.id)}
                          className="h-8 border border-white/[0.08] bg-white/[0.03] px-2.5 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteId(t.id)}
                          className="h-8 border border-white/[0.08] bg-white/[0.03] px-2.5 text-muted-foreground hover:border-priority-high/30 hover:bg-priority-high/10 hover:text-priority-high"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="border-white/[0.1] bg-[rgba(18,18,20,0.98)]">
          <DialogHeader>
            <DialogTitle>New workflow template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Template name
              </Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Standard Litigation Workflow"
                className="h-10 border-white/[0.08] bg-[#17191D]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Matter type
              </Label>
              <Input
                value={newCaseType}
                onChange={(e) => setNewCaseType(e.target.value)}
                placeholder="e.g. Litigation"
                className="h-10 border-white/[0.08] bg-[#17191D]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Description
              </Label>
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="h-10 border-white/[0.08] bg-[#17191D]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setNewOpen(false)}
              className="border border-white/[0.08] bg-white/[0.03]"
            >
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !newName.trim()}
              className={cn(
                "border-0 bg-gradient-to-b from-[#F8F8F8] to-[#CFCFCF] text-[#1a1c20] shadow-[0_8px_20px_rgba(0,0,0,0.22)] hover:from-white hover:to-[#d8d8d8]",
              )}
            >
              Create &amp; add stages
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(o) => !o && setDeleteId(null)}
      >
        <AlertDialogContent className="border-white/[0.1] bg-[rgba(18,18,20,0.98)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the template and all its stages. Matters already created
              from it are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/[0.08] bg-white/[0.03]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-priority-high text-white hover:bg-priority-high/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function groupByCaseType(
  templates: WorkflowTemplate[],
): [string, WorkflowTemplate[]][] {
  const map = new Map<string, WorkflowTemplate[]>();
  for (const t of templates) {
    const key = t.case_type?.trim() || "Uncategorized";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}
