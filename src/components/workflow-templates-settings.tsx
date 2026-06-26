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
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pill } from "@/components/ui/pill";
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
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">
          Workflow Templates
        </h2>
        <WorkflowTemplateEditor
          templateId={editingId}
          onClose={() => setEditingId(null)}
        />
      </section>
    );
  }

  const grouped = groupByCaseType(templates ?? []);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Workflow Templates
          </h2>
          <p className="text-sm text-muted-foreground">
            Reusable stage workflows applied when creating cases, grouped by
            case type.
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="mr-1 size-4" /> New template
        </Button>
      </div>

      {isLoading && (
        <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>
      )}

      {!isLoading && (templates?.length ?? 0) === 0 && (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <Workflow className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No workflow templates yet.
          </p>
        </Card>
      )}

      {grouped.map(([caseType, items]) => (
        <div key={caseType} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {caseType}
          </h3>
          <div className="space-y-2">
            {items.map((t) => (
              <Card
                key={t.id}
                className="flex items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-foreground">
                      {t.name ?? "Untitled"}
                    </span>
                    {!t.is_active && (
                      <Pill className="bg-muted/30 text-muted-foreground">
                        Inactive
                      </Pill>
                    )}
                  </div>
                  {t.description && (
                    <p className="truncate text-sm text-muted-foreground">
                      {t.description}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Pill className="bg-tag-blue/40 text-foreground">
                    {t.stage_count} stage{t.stage_count === 1 ? "" : "s"}
                  </Pill>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingId(t.id)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteId(t.id)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New workflow template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Template name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Standard Litigation Workflow"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Case type</Label>
              <Input
                value={newCaseType}
                onChange={(e) => setNewCaseType(e.target.value)}
                placeholder="e.g. Litigation"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !newName.trim()}
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the template and all its stages. Cases already
              created from it are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
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
