import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Pencil, Loader2, X, Check } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/auth-context";
import { getTemplates, updateTemplate, DocumentTemplate } from "@/lib/templates.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function DocumentTemplatesSettings() {
  const { role } = useAuth();
  const isAdmin = role === "super_admin" || role === "admin";
  const fetchTemplates = useServerFn(getTemplates);
  const saveTemplate = useServerFn(updateTemplate);
  const queryClient = useQueryClient();

  const [editingTemplate, setEditingTemplate] = useState<DocumentTemplate | null>(null);
  const [editForm, setEditForm] = useState<{name: string, doc_type: string, body: string, fields_schema: string}>({
    name: "", doc_type: "", body: "", fields_schema: ""
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
    } catch (e) {
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
        }
      });
      toast.success("Template updated successfully");
      queryClient.invalidateQueries({ queryKey: ["document-templates"] });
      setEditingTemplate(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update template");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-foreground">Document Templates Library</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage standardized firm templates including client letters, memos, and court applications.
        </p>
      </div>

      {editingTemplate ? (
        <Card className="p-4 flex flex-col gap-4 border-tag-blue/30 ring-1 ring-tag-blue/10 shadow-sm">
          <div className="flex justify-between items-center border-b pb-2">
            <h3 className="font-semibold text-foreground">Editing: {editingTemplate.name}</h3>
            <Button variant="ghost" size="icon" onClick={() => setEditingTemplate(null)}>
              <X className="size-4" />
            </Button>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium">Template Name</label>
              <input 
                type="text" 
                className="w-full flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" 
                value={editForm.name} 
                onChange={e => setEditForm({...editForm, name: e.target.value})} 
                disabled={!isAdmin}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Document Type (e.g. Word, PDF)</label>
              <input 
                type="text" 
                className="w-full flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" 
                value={editForm.doc_type} 
                onChange={e => setEditForm({...editForm, doc_type: e.target.value})} 
                disabled={!isAdmin}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-1 flex flex-col">
              <label className="text-xs font-medium">Template Body (Markdown/Text with {'{{placeholders}}'})</label>
              <Textarea 
                className="font-mono text-sm min-h-[300px] flex-1" 
                value={editForm.body} 
                onChange={e => setEditForm({...editForm, body: e.target.value})} 
                disabled={!isAdmin}
              />
            </div>
            <div className="space-y-1 flex flex-col">
              <label className="text-xs font-medium">Fields Schema (JSON Array)</label>
              <Textarea 
                className="font-mono text-sm min-h-[300px] flex-1 bg-muted/30" 
                value={editForm.fields_schema} 
                onChange={e => setEditForm({...editForm, fields_schema: e.target.value})} 
                disabled={!isAdmin}
              />
            </div>
          </div>

          {isAdmin && (
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setEditingTemplate(null)}>Cancel</Button>
              <Button onClick={handleSave} disabled={isSaving} className="bg-tag-blue hover:bg-tag-blue/90 text-white">
                {isSaving ? <Loader2 className="size-4 animate-spin mr-2" /> : <Check className="size-4 mr-2" />}
                Save Template
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading templates...</div>
          ) : templates && templates.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 p-4 gap-4 bg-muted/10">
              {templates.map((tpl) => (
                <Card key={tpl.id} className="p-4 flex flex-col hover:border-tag-blue/50 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <FileText className="size-5 text-tag-blue shrink-0" />
                    {isAdmin && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => handleEditClick(tpl)}>
                        <Pencil className="size-3" />
                      </Button>
                    )}
                  </div>
                  <h3 className="font-semibold text-foreground text-sm leading-tight mb-1">{tpl.name}</h3>
                  <div className="flex items-center gap-2 mt-auto pt-4">
                    <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground font-medium">
                      {tpl.doc_type}
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      Updated {new Date(tpl.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">No document templates found.</div>
          )}
        </Card>
      )}
    </div>
  );
}
