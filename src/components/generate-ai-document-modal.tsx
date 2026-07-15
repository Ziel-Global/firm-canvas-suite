import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bot, Loader2, Sparkles, FileText, Check } from "lucide-react";
import { toast } from "sonner";

import { getTemplates, DocumentTemplate } from "@/lib/templates.functions";
import { createAiDocument } from "@/lib/documents.functions";

export function GenerateAIDocumentModal({ 
  open, 
  onOpenChange, 
  caseId 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  caseId: string;
}) {
  const fetchTemplates = useServerFn(getTemplates);
  const saveDocument = useServerFn(createAiDocument);
  const queryClient = useQueryClient();

  const [step, setStep] = useState<1 | 2>(1);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [generatedContent, setGeneratedContent] = useState("");
  const [documentTitle, setDocumentTitle] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["document-templates"],
    queryFn: () => fetchTemplates(),
    enabled: open,
  });

  const activeTemplate = templates?.find(t => t.id === selectedTemplateId);
  const schema = activeTemplate?.fields_schema as Array<{name: string, label: string, type: string}> | undefined;

  const handleGenerate = () => {
    if (!activeTemplate) return;
    setIsGenerating(true);
    
    // MOCK AI GENERATION
    setTimeout(() => {
      let draft = activeTemplate.body;
      // Simple mock placeholder replacement
      if (schema) {
        for (const field of schema) {
          const val = formValues[field.name] || `[${field.label}]`;
          draft = draft.replace(new RegExp(`\\{\\{${field.name}\\}\\}`, 'g'), val);
        }
      }
      
      setGeneratedContent(draft);
      setDocumentTitle(`Draft: ${activeTemplate.name}`);
      setIsGenerating(false);
      setStep(2);
      toast.success("AI draft generated successfully.");
    }, 2000);
  };

  const handleSave = async () => {
    if (!documentTitle.trim()) {
      toast.error("Please provide a document title.");
      return;
    }
    
    setIsSaving(true);
    try {
      await saveDocument({
        data: {
          caseId,
          title: documentTitle,
          content: generatedContent,
          docType: activeTemplate?.doc_type || "Word"
        }
      });
      toast.success("Saved to Internal Drafts");
      queryClient.invalidateQueries({ queryKey: ["case-documents", caseId] });
      setStep(1);
      setSelectedTemplateId("");
      setFormValues({});
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save draft");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!val) {
        setStep(1);
        setSelectedTemplateId("");
        setFormValues({});
      }
      onOpenChange(val);
    }}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="size-5 text-tag-blue" />
            {step === 1 ? "Generate Document with AI" : "Review AI Draft"}
          </DialogTitle>
          <DialogDescription>
            {step === 1 
              ? "Select a template and provide facts. The AI will structure the draft without inventing legal arguments."
              : "Review and edit the AI-generated draft before saving it to Internal Drafts."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 py-4">
          {step === 1 ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label>Document Template</Label>
                {isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading templates...</p>
                ) : (
                  <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {templates?.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {activeTemplate && schema && (
                <div className="space-y-4 bg-muted/20 p-4 rounded-md border">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <FileText className="size-4" /> Case-Specific Facts
                  </h4>
                  <div className="grid gap-4">
                    {schema.map(field => (
                      <div key={field.name} className="space-y-1">
                        <Label className="text-xs">{field.label}</Label>
                        {field.type === "textarea" ? (
                          <Textarea 
                            className="text-sm min-h-[80px]"
                            value={formValues[field.name] || ""}
                            onChange={e => setFormValues(prev => ({...prev, [field.name]: e.target.value}))}
                          />
                        ) : (
                          <Input 
                            type={field.type === "date" ? "date" : "text"}
                            className="text-sm"
                            value={formValues[field.name] || ""}
                            onChange={e => setFormValues(prev => ({...prev, [field.name]: e.target.value}))}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 h-full flex flex-col">
              <div className="space-y-1">
                <Label className="text-xs">Document Title</Label>
                <Input 
                  value={documentTitle}
                  onChange={e => setDocumentTitle(e.target.value)}
                />
              </div>
              <div className="flex-1 space-y-1 flex flex-col">
                <Label className="text-xs">Rich Text Editor (Draft Content)</Label>
                <Textarea 
                  className="flex-1 font-mono text-sm resize-none min-h-[350px]"
                  value={generatedContent}
                  onChange={e => setGeneratedContent(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-4 border-t">
          {step === 1 ? (
            <Button 
              onClick={handleGenerate} 
              disabled={!activeTemplate || isGenerating}
              className="bg-tag-blue hover:bg-tag-blue/90"
            >
              {isGenerating ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Sparkles className="size-4 mr-2" />}
              Generate First Draft
            </Button>
          ) : (
            <div className="flex gap-2 w-full justify-end">
              <Button variant="outline" onClick={() => setStep(1)} disabled={isSaving}>Back to Edit Facts</Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Check className="size-4 mr-2" />}
                Save to Internal Drafts
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
