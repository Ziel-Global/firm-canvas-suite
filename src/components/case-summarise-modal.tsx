import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bot, Loader2, Copy, Download, Calendar, CheckSquare, FileText, User } from "lucide-react";
import { toast } from "sonner";

import { summariseCase, CaseSummaryReport } from "@/lib/ai.functions";

export function CaseSummariseModal({ 
  open, 
  onOpenChange, 
  caseId 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  caseId: string;
}) {
  const runSummary = useServerFn(summariseCase);
  const [isGenerating, setIsGenerating] = useState(false);
  const [summary, setSummary] = useState<CaseSummaryReport | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setSummary(null);
    try {
      const data = await runSummary({ data: { caseId } });
      setSummary(data);
      toast.success("Matter summary generated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate summary");
    } finally {
      setIsGenerating(false);
    }
  };

  // Auto-generate when the modal opens
  useEffect(() => {
    if (open) {
      setSummary(null);
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleCopy = () => {
    if (!summary) return;
    const text = `MATTER SUMMARY: ${summary.case_title}\n` +
      `Client: ${summary.client_name}\n` +
      `Type: ${summary.case_type} | Stage: ${summary.current_stage}\n` +
      `Responsible Member: ${summary.responsible_member}\n\n` +
      `KEY DATES:\n${summary.key_dates.join("\n")}\n\n` +
      `UPCOMING DEADLINES:\n${summary.upcoming_deadlines.join("\n")}\n\n` +
      `STRATEGY & DECISIONS:\n${summary.key_decisions.join("\n")}\n\n` +
      `Metrics: ${summary.open_tasks} open tasks, ${summary.document_count} documents.`;
    
    navigator.clipboard.writeText(text);
    toast.success("Summary copied to clipboard.");
  };

  const handleExport = () => {
    if (!summary) return;
    const text = `MATTER SUMMARY: ${summary.case_title}\n` +
      `Client: ${summary.client_name}\n` +
      `Type: ${summary.case_type} | Stage: ${summary.current_stage}\n` +
      `Responsible Member: ${summary.responsible_member}\n\n` +
      `KEY DATES:\n${summary.key_dates.join("\n")}\n\n` +
      `UPCOMING DEADLINES:\n${summary.upcoming_deadlines.join("\n")}\n\n` +
      `STRATEGY & DECISIONS:\n${summary.key_decisions.join("\n")}\n\n` +
      `Metrics: ${summary.open_tasks} open tasks, ${summary.document_count} documents.`;
      
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Summary_${summary.case_title.replace(/\s+/g, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported as text file.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="size-5 text-tag-blue" />
            AI Matter Summary
          </DialogTitle>
          <DialogDescription>
            Structured overview based on notes, activity logs, and metadata you have access to.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 py-4">
          {isGenerating ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
              <Loader2 className="size-8 animate-spin text-tag-blue" />
              <p className="text-sm animate-pulse">Reading matter data, notes, and activity logs...</p>
            </div>
          ) : summary ? (
            <div className="space-y-6">
              {/* Header Info */}
              <div className="grid grid-cols-2 gap-4 bg-muted/30 p-4 rounded-lg border">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Client</p>
                  <p className="font-medium text-foreground flex items-center gap-2">
                    <User className="size-3 text-tag-blue" /> {summary.client_name}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Matter Type</p>
                  <p className="font-medium text-foreground">{summary.case_type}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Current Stage</p>
                  <p className="font-medium text-foreground text-tag-blue">{summary.current_stage}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Responsible Member</p>
                  <p className="font-medium text-foreground">{summary.responsible_member}</p>
                </div>
              </div>

              {/* Grid Content */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2 border-b pb-1">
                    <Calendar className="size-4 text-muted-foreground" /> Key Dates & Milestones
                  </h4>
                  <ul className="text-sm space-y-1.5">
                    {summary.key_dates.map((d, i) => (
                      <li key={i} className="text-muted-foreground">{d}</li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2 border-b pb-1">
                    <CheckSquare className="size-4 text-priority-high" /> Upcoming Deadlines
                  </h4>
                  <ul className="text-sm space-y-1.5">
                    {summary.upcoming_deadlines.map((d, i) => (
                      <li key={i} className="text-muted-foreground">{d}</li>
                    ))}
                  </ul>
                </div>

                <div className="col-span-1 md:col-span-2 space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2 border-b pb-1">
                    <FileText className="size-4 text-tag-blue" /> Strategy & Decisions
                  </h4>
                  <ul className="text-sm space-y-2">
                    {summary.key_decisions.map((d, i) => (
                      <li key={i} className="bg-frame/50 p-2 rounded text-muted-foreground italic border-l-2 border-tag-blue/50">
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Footer metrics */}
              <div className="flex gap-4 pt-4 border-t text-sm text-muted-foreground">
                <span><strong>{summary.open_tasks}</strong> Open Tasks</span>
                <span><strong>{summary.document_count}</strong> Documents</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <Button onClick={handleGenerate} className="bg-tag-blue hover:bg-tag-blue/90">
                Generate Summary
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="pt-4 border-t flex sm:justify-between items-center">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCopy} disabled={!summary}>
              <Copy className="size-4 mr-2" /> Copy
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={!summary}>
              <Download className="size-4 mr-2" /> Export
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
