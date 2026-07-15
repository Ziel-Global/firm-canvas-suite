import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCheck, Clock, FileText, Bot } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/auth-context";
import { getPendingApprovals } from "@/lib/approvals.functions";
import { approveDocument } from "@/lib/documents.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Tag } from "@/components/ui/tag";

export const Route = createFileRoute("/approvals")({
  head: () => ({
    meta: [
      { title: "Review Queue — Law Firm Ops" },
      { name: "description", content: "Review queue for document approvals." },
    ],
  }),
  component: ApprovalsQueuePage,
});

function formatTimeWaiting(submittedAt: string) {
  const diff = Date.now() - new Date(submittedAt).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m waiting`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h waiting`;
  const days = Math.floor(hours / 24);
  return `${days}d waiting`;
}

function ApprovalsQueuePage() {
  const { role } = useAuth();
  const canReview = role === "super_admin" || role === "admin" || role === "senior_lawyer";
  const fetchPending = useServerFn(getPendingApprovals);
  const approveDoc = useServerFn(approveDocument);
  const queryClient = useQueryClient();

  const { data: queue, isLoading, error } = useQuery({
    queryKey: ["pending-approvals"],
    queryFn: () => fetchPending(),
    enabled: canReview,
    refetchInterval: 15000, // keep the queue fresh
  });

  if (!canReview) {
    return (
      <main className="px-4 py-6 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Review Queue</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Only Super Admins or delegated users can access the review queue.
        </p>
      </main>
    );
  }

  async function handleApprove(documentId: string) {
    try {
      await approveDoc({ data: { documentId } });
      toast.success("Document approved");
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approval failed");
    }
  }

  return (
    <main className="px-4 py-6 sm:px-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Review Queue</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pending document approvals, sorted oldest first. Review and approve items below.
        </p>
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading queue…</p>
      ) : error ? (
        <Card className="p-6 border-destructive/50">
          <p className="text-sm text-destructive text-center">Failed to load queue: {error.message}</p>
        </Card>
      ) : queue && queue.length > 0 ? (
        <div className="space-y-4">
          {queue.map((item) => (
            <Card key={item.id} className="p-5 flex flex-col sm:flex-row gap-4 justify-between items-start">
              <div className="space-y-3 flex-1 min-w-0">
                <div className="flex items-start gap-3">
                  <FileText className="size-5 shrink-0 text-muted-foreground mt-0.5" />
                  <div>
                    <Link
                      to="/approvals/$approvalId"
                      params={{ approvalId: item.id }}
                      className="text-base font-semibold text-foreground hover:underline"
                    >
                      {item.document_title}
                    </Link>
                    <p className="text-sm text-muted-foreground mt-1">
                      Submitted by {item.submitter_name ?? "Unknown"} in <span className="font-medium">{item.case_title}</span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pl-8">
                  <Pill className="bg-tag-sand/60 text-foreground">
                    <Clock className="size-3" />
                    {formatTimeWaiting(item.submitted_at)}
                  </Pill>
                  {item.ai_report ? (
                    <Pill className="bg-tag-blue/30 text-foreground">
                      <Bot className="size-3" />
                      AI Scanned
                    </Pill>
                  ) : (
                    <Pill className="bg-frame text-muted-foreground">
                      <Bot className="size-3 opacity-50" />
                      No AI Report
                    </Pill>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pl-8 sm:pl-0">
                <Button
                  variant="default"
                  onClick={() => handleApprove(item.document_id)}
                >
                  <CheckCheck className="size-4 mr-1.5" />
                  Approve
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <CheckCheck className="size-10 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground">Queue is empty</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              There are currently no documents waiting for approval.
            </p>
          </div>
        </Card>
      )}
    </main>
  );
}
