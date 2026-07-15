import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Pencil, Loader2, X, Check } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/auth-context";
import {
  getTemplates,
  updateTemplate,
  DocumentTemplate,
} from "@/lib/templates.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { SettingsSection } from "@/components/settings-section";

const fieldClass =
  "h-10 border-white/[0.08] bg-[#17191D] focus-visible:ring-white/10";

export function DocumentTemplatesSettings() {
  const { role } = useAuth();
  const isAdmin = role === "super_admin" || role === "admin";
  const fetchTemplates = useServerFn(getTemplates);
  const saveTemplate = useServerFn(updateTemplate);
  const queryClient = useQueryClient();

  const [editingTemplate, setEditingTemplate] =
    useState<DocumentTemplate | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    doc_type: string;
    body: string;
    fields_schema: string;
  }>({
    name: "",
    doc_type: "",
    body: "",
    fields_schema: "",
  });
  const [isSaving, setIsSaving] = useState(false);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["document-templates"],
    queryFn: () => fetchTemplates(),
  });

  const handleEditClick = (template: DocumentTemplate) => {
    setEditingTemplate(template);
    setEditForm({
      name: template.name,
      doc_type: template.doc_type,
      body: template.body,
      fields_schema: JSON.stringify(template.fields_schema, null, 2),
    });
  };

  const handleSave = async () => {
    if (!editingTemplate) return;

    let parsedSchema;
    try {
      parsedSchema = JSON.parse(editForm.fields_schema);
    } catch {
      toast.error("Fields Schema must be valid JSON.");
      return;
    }

    setIsSaving(true);
    try {
      await saveTemplate({
        data: {
          id: editingTemplate.id,
          name: editForm.name,
          doc_type: editForm.doc_type,
          body: editForm.body,
          fields_schema: parsedSchema,
        },
      });
      toast.success("Template updated successfully");
      queryClient.invalidateQueries({ queryKey: ["document-templates"] });
      setEditingTemplate(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update template",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsSection
      eyebrow="Library"
      title="Document templates"
      description="Standardized firm templates for client letters, memos, and court applications."
      bare={Boolean(editingTemplate)}
    >
      {editingTemplate ? (
        <Card className="relative overflow-hidden border-white/[0.08] bg-[rgba(18,18,20,0.78)] p-5 shadow-[0_20px_50px_-28px_rgba(0,0,0,0.65)] sm:p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
          />
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Editing
              </p>
              <h3 className="mt-1 text-base font-semibold tracking-tight text-foreground">
                {editingTemplate.name}
              </h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditingTemplate(null)}
              className="border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Template name
              </label>
              <Input
                className={fieldClass}
                value={editForm.name}
                onChange={(e) =>
                  setEditForm({ ...editForm, name: e.target.value })
                }
                disabled={!isAdmin}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Document type
              </label>
              <Input
                className={fieldClass}
                value={editForm.doc_type}
                onChange={(e) =>
                  setEditForm({ ...editForm, doc_type: e.target.value })
                }
                disabled={!isAdmin}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="flex flex-col space-y-1.5">
              <label className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Template body
              </label>
              <Textarea
                className="min-h-[300px] flex-1 border-white/[0.08] bg-[#17191D] font-mono text-sm focus-visible:ring-white/10"
                value={editForm.body}
                onChange={(e) =>
                  setEditForm({ ...editForm, body: e.target.value })
                }
                disabled={!isAdmin}
              />
            </div>
            <div className="flex flex-col space-y-1.5">
              <label className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Fields schema (JSON)
              </label>
              <Textarea
                className="min-h-[300px] flex-1 border-white/[0.08] bg-[#141518] font-mono text-sm focus-visible:ring-white/10"
                value={editForm.fields_schema}
                onChange={(e) =>
                  setEditForm({ ...editForm, fields_schema: e.target.value })
                }
                disabled={!isAdmin}
              />
            </div>
          </div>

          {isAdmin && (
            <div className="mt-5 flex justify-end gap-2 border-t border-white/[0.06] pt-4">
              <Button
                variant="ghost"
                onClick={() => setEditingTemplate(null)}
                className="border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="gap-1.5 border-0 bg-gradient-to-b from-[#F8F8F8] to-[#CFCFCF] text-[#1a1c20] shadow-[0_8px_20px_rgba(0,0,0,0.22)] hover:from-white hover:to-[#d8d8d8]"
              >
                {isSaving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Save template
              </Button>
            </div>
          )}
        </Card>
      ) : isLoading ? (
        <div className="px-5 py-14 text-center text-sm text-muted-foreground">
          Loading templates…
        </div>
      ) : templates && templates.length > 0 ? (
        <ul className="divide-y divide-white/[0.06]">
          {templates.map((tpl) => (
            <li
              key={tpl.id}
              className="flex items-start gap-3.5 px-4 py-4 transition-colors hover:bg-white/[0.03] sm:items-center sm:px-5"
            >
              <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-muted-foreground sm:mt-0">
                <FileText className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-sm font-semibold tracking-tight text-foreground">
                    {tpl.name}
                  </h3>
                  <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {tpl.doc_type}
                  </span>
                </div>
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                  Updated{" "}
                  {new Date(tpl.updated_at).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
              {isAdmin ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 border border-white/[0.08] bg-white/[0.03] px-2.5 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                  onClick={() => handleEditClick(tpl)}
                >
                  <Pencil className="size-3.5" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="relative px-6 py-16 text-center">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.05),transparent_55%)]"
          />
          <div className="relative mx-auto flex size-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-muted-foreground">
            <FileText className="size-5" />
          </div>
          <p className="relative mt-4 text-sm font-medium text-foreground">
            No document templates
          </p>
          <p className="relative mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Firm letter and memo templates will appear here once added.
          </p>
        </div>
      )}
    </SettingsSection>
  );
}
