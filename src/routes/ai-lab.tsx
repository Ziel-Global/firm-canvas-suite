import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bot, ShieldAlert, Sparkles, FileText, Search, Activity, Mic, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/ai-lab")({
  head: () => ({
    meta: [
      { title: "AI Lab — Law Firm Ops" },
      { name: "description", content: "Test and debug AI Edge Functions." },
    ],
  }),
  component: AILabPage,
});

type AIJobKind = 'proofread' | 'draft' | 'summarise' | 'search' | 'risk_scan' | 'transcribe';

function AILabPage() {
  const { role } = useAuth();
  const isSuperAdmin = role === "super_admin";

  const [activeTab, setActiveTab] = useState<AIJobKind>('summarise');
  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [output, setOutput] = useState<any>(null);

  if (!isSuperAdmin) {
    return (
      <main className="px-4 py-6 sm:px-6">
        <h2 className="text-2xl font-semibold text-foreground">AI Lab</h2>
        <p className="mt-2 text-sm text-muted-foreground">Only Super Admins can access the AI Lab.</p>
      </main>
    );
  }

  const tabs: { id: AIJobKind; label: string; icon: React.ReactNode; placeholder: string }[] = [
    { id: 'summarise', label: 'Summarise', icon: <FileText className="size-4" />, placeholder: 'Paste document text to summarise...' },
    { id: 'proofread', label: 'Proofread', icon: <Sparkles className="size-4" />, placeholder: 'Paste text to check for grammar and tone...' },
    { id: 'risk_scan', label: 'Risk Scan', icon: <ShieldAlert className="size-4" />, placeholder: 'Paste legal text to scan for missing clauses and liabilities...' },
    { id: 'draft', label: 'Draft', icon: <Bot className="size-4" />, placeholder: 'Describe the document or clause you want to generate...' },
    { id: 'search', label: 'Search', icon: <Search className="size-4" />, placeholder: 'Enter semantic search query...' },
    { id: 'transcribe', label: 'Transcribe', icon: <Mic className="size-4" />, placeholder: 'Provide audio URL or base64 (mocked)...' },
  ];

  const handleRunAI = async () => {
    if (!inputText.trim()) {
      toast.error("Please provide input text.");
      return;
    }

    setIsProcessing(true);
    setOutput(null);

    // MOCKING THE EDGE FUNCTION CALL
    setTimeout(() => {
      setIsProcessing(false);
      
      // Enforce limits checks (mocked)
      const lower = inputText.toLowerCase();
      if (lower.includes("approve") || lower.includes("send email") || lower.includes("schedule") || lower.includes("bill")) {
        setOutput({
          error: "Edge Function Blocked: AI operations are strictly sandboxed. The AI is restricted from approving documents, communicating with clients, making scheduling commitments, or accessing billing data."
        });
        toast.error("AI execution blocked by safety limits.");
        return;
      }

      setOutput({
        success: true,
        kind: activeTab,
        result: `[Mock AI Output for ${activeTab.toUpperCase()}]\n\nProcessed input of ${inputText.length} characters successfully. This represents the structured JSON output that the ai-jobs edge function would save and return.`
      });
      toast.success("AI job completed");
    }, 1500);
  };

  return (
    <main className="px-4 py-6 sm:px-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Bot className="size-6 text-tag-blue" />
          AI Lab Sandbox
        </h2>
        <p className="mt-1 text-sm text-muted-foreground max-w-3xl">
          Simulated UI for the <code className="bg-muted px-1 py-0.5 rounded text-xs">ai-run</code> Edge Function.
          The AI assists, flags, summarises, and drafts. It is strictly sandboxed: it never approves, never sends client communication, never modifies records, and has no billing access.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="col-span-1 p-2 flex flex-col gap-1 bg-frame/50">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setOutput(null);
                setInputText("");
              }}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-tag-blue text-white shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </Card>

        <div className="col-span-1 md:col-span-3 flex flex-col gap-4 min-h-[400px]">
          <Card className="p-4 flex flex-col gap-4 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">Input Payload</h3>
            </div>
            
            <Textarea
              className="flex-1 min-h-[200px] resize-none font-mono text-sm"
              placeholder={tabs.find(t => t.id === activeTab)?.placeholder}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />

            <div className="flex justify-between items-center mt-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-1.5 rounded-full border border-amber-500/20">
                <ShieldAlert className="size-3" />
                <span>Strict AI Sandboxing Enforced</span>
              </div>
              <Button onClick={handleRunAI} disabled={isProcessing} className="w-32 bg-tag-blue hover:bg-tag-blue/90">
                {isProcessing ? <Loader2 className="size-4 animate-spin" /> : "Run AI Job"}
              </Button>
            </div>
          </Card>

          {output && (
            <Card className={`p-4 border-l-4 ${output.error ? "border-l-destructive bg-destructive/5" : "border-l-tag-blue bg-tag-blue/5"}`}>
              <h3 className={`text-sm font-semibold mb-2 ${output.error ? "text-destructive" : "text-tag-blue"}`}>
                {output.error ? "Execution Blocked" : "Edge Function Output"}
              </h3>
              <pre className="whitespace-pre-wrap text-sm font-mono text-foreground/80">
                {output.error || output.result}
              </pre>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}
