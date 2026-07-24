import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bot,
  ShieldAlert,
  Sparkles,
  FileText,
  Search,
  Activity,
  Mic,
  Loader2,
  FlaskConical,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ai-lab")({
  head: () => ({
    meta: [
      { title: "verdio" },
      {
        name: "description",
        content: "Sandboxed AI Edge Function testing environment.",
      },
    ],
  }),
  component: AILabPage,
});

type AIJobKind =
  | "proofread"
  | "draft"
  | "summarise"
  | "search"
  | "risk_scan"
  | "transcribe";

const TABS: {
  id: AIJobKind;
  label: string;
  description: string;
  icon: typeof FileText;
  placeholder: string;
}[] = [
  {
    id: "summarise",
    label: "Summarise",
    description: "Condense long documents",
    icon: FileText,
    placeholder: "Paste document text to summarise…",
  },
  {
    id: "proofread",
    label: "Proofread",
    description: "Grammar and tone check",
    icon: Sparkles,
    placeholder: "Paste text to check for grammar and tone…",
  },
  {
    id: "risk_scan",
    label: "Risk scan",
    description: "Clauses and liabilities",
    icon: ShieldAlert,
    placeholder:
      "Paste legal text to scan for missing clauses and liabilities…",
  },
  {
    id: "draft",
    label: "Draft",
    description: "Generate clauses",
    icon: Bot,
    placeholder: "Describe the document or clause you want to generate…",
  },
  {
    id: "search",
    label: "Search",
    description: "Semantic retrieval",
    icon: Search,
    placeholder: "Enter semantic search query…",
  },
  {
    id: "transcribe",
    label: "Transcribe",
    description: "Audio to text",
    icon: Mic,
    placeholder: "Provide audio URL or base64 (mocked)…",
  },
];

function AILabPage() {
  const { role } = useAuth();
  const isSuperAdmin = role === "super_admin";

  const [activeTab, setActiveTab] = useState<AIJobKind>("summarise");
  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [output, setOutput] = useState<{
    error?: string;
    success?: boolean;
    kind?: AIJobKind;
    result?: string;
  } | null>(null);

  if (!isSuperAdmin) {
    return (
      <main className="dashboard-shell px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          AI Lab
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Only Super Admins can access the AI Lab.
        </p>
      </main>
    );
  }

  const active = TABS.find((t) => t.id === activeTab) ?? TABS[0];

  const handleRunAI = async () => {
    if (!inputText.trim()) {
      toast.error("Please provide input text.");
      return;
    }

    setIsProcessing(true);
    setOutput(null);

    setTimeout(() => {
      setIsProcessing(false);

      const lower = inputText.toLowerCase();
      if (
        lower.includes("approve") ||
        lower.includes("send email") ||
        lower.includes("schedule") ||
        lower.includes("bill")
      ) {
        setOutput({
          error:
            "Edge Function Blocked: AI operations are strictly sandboxed. The AI is restricted from approving documents, communicating with clients, making scheduling commitments, or accessing billing data.",
        });
        toast.error("AI execution blocked by safety limits.");
        return;
      }

      setOutput({
        success: true,
        kind: activeTab,
        result: `[Mock AI Output for ${activeTab.toUpperCase()}]\n\nProcessed input of ${inputText.length} characters successfully. This represents the structured JSON output that the ai-jobs edge function would save and return.`,
      });
      toast.success("AI job completed");
    }, 1500);
  };

  return (
    <main className="dashboard-shell min-h-[calc(100dvh-3.5rem)] px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-7 pb-10">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1">
              <FlaskConical className="size-3 text-muted-foreground" />
              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Firm · Sandboxed runtime
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              AI Lab
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Simulated console for the{" "}
              <code className="rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] text-foreground/85">
                ai-run
              </code>{" "}
              Edge Function. Assists, flags, summarises, and drafts — never
              approves, never emails clients, never writes records, never
              touches billing.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-[rgba(18,18,20,0.72)] px-4 py-3 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)]">
            <div className="flex size-9 items-center justify-center rounded-xl bg-white/[0.05] text-muted-foreground">
              <ShieldAlert className="size-4" />
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Safety
              </p>
              <p className="mt-0.5 text-sm font-medium text-foreground">
                Hard sandbox enforced
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Tool rail */}
          <Card className="relative overflow-hidden border-white/[0.08] bg-[rgba(18,18,20,0.78)] p-2 shadow-[0_20px_50px_-28px_rgba(0,0,0,0.65)] lg:col-span-3">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
            />
            <div className="px-3 pb-2 pt-3">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Capabilities
              </p>
            </div>
            <nav className="flex flex-col gap-1 p-1">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const selected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id);
                      setOutput(null);
                      setInputText("");
                    }}
                    className={cn(
                      "flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                      selected
                        ? "bg-white/[0.1] text-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border",
                        selected
                          ? "border-white/15 bg-white/[0.08] text-foreground"
                          : "border-white/[0.06] bg-white/[0.03]",
                      )}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium tracking-tight">
                        {tab.label}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {tab.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>
          </Card>

          {/* Workspace */}
          <div className="flex min-h-[480px] flex-col gap-4 lg:col-span-9">
            <Card className="relative flex flex-1 flex-col overflow-hidden border-white/[0.08] bg-[rgba(18,18,20,0.78)] p-0 shadow-[0_20px_50px_-28px_rgba(0,0,0,0.65)]">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
              />

              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-muted-foreground">
                    <Activity className="size-4" />
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Input payload
                    </p>
                    <p className="mt-0.5 text-sm font-semibold tracking-tight text-foreground">
                      {active.label}
                    </p>
                  </div>
                </div>
                <span className="rounded-md bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {active.id}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-4 p-5">
                <Textarea
                  className="min-h-[240px] flex-1 resize-none border-white/[0.08] bg-[#141518] font-mono text-sm leading-relaxed focus-visible:ring-white/10"
                  placeholder={active.placeholder}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                />

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
                  <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[11px] font-medium text-amber-200/90">
                    <ShieldAlert className="size-3.5" />
                    Strict sandboxing enforced
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {inputText.length.toLocaleString()} chars
                    </span>
                    <Button
                      onClick={handleRunAI}
                      disabled={isProcessing}
                      className="min-w-[9.5rem] gap-1.5 border-0 bg-gradient-to-b from-[#F8F8F8] to-[#CFCFCF] text-[#1a1c20] shadow-[0_8px_20px_rgba(0,0,0,0.22)] hover:from-white hover:to-[#d8d8d8]"
                    >
                      {isProcessing ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : null}
                      {isProcessing ? "Running…" : "Run AI job"}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>

            {output ? (
              <Card
                className={cn(
                  "relative overflow-hidden border-white/[0.08] bg-[rgba(18,18,20,0.78)] p-0 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)]",
                  output.error
                    ? "border-l-2 border-l-priority-high"
                    : "border-l-2 border-l-white/40",
                )}
              >
                <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <Terminal className="size-3.5 text-muted-foreground" />
                    <p
                      className={cn(
                        "text-[11px] font-medium uppercase tracking-[0.14em]",
                        output.error
                          ? "text-priority-high"
                          : "text-muted-foreground",
                      )}
                    >
                      {output.error
                        ? "Execution blocked"
                        : "Edge function output"}
                    </p>
                  </div>
                  {output.kind ? (
                    <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      {output.kind}
                    </span>
                  ) : null}
                </div>
                <pre className="whitespace-pre-wrap px-5 py-4 font-mono text-sm leading-relaxed text-foreground/85">
                  {output.error || output.result}
                </pre>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
