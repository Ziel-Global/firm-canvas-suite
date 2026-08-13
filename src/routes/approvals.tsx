import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCheck,
  Clock,
  FileText,
  Bot,
  ChevronRight,
  User,
  Briefcase,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/auth-context";
import { getPendingApprovals } from "@/lib/approvals.functions";
import { approveDocument } from "@/lib/documents.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ListSkeleton } from "@/components/loading-skeletons";

export const Route = createFileRoute("/approvals")({
  head: () => ({
    meta: [
      { title: "Verdio" },
      {
        name: "description",
        content: "Review queue for pending document approvals.",
      },
    ],
  }),
  component: ApprovalsQueuePage,
});

function formatTimeWaiting(submittedAt: string) {
  const diff = Date.now() - new Date(submittedAt).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function waitingTone(submittedAt: string) {
  const hours = (Date.now() - new Date(submittedAt).getTime()) / 3_600_000;
  if (hours >= 48) return "text-priority-high bg-priority-high/15";
  if (hours >= 24) return "text-amber-200/90 bg-amber-500/15";
  return "text-muted-foreground bg-white/[0.06]";
}

function ApprovalsQueuePage() {
  const { role } = useAuth();
  const canReview =
    role === "super_admin" || role === "admin" || role === "senior_lawyer";
  const fetchPending = useServerFn(getPendingApprovals);
  const approveDoc = useServerFn(approveDocument);
  const queryClient = useQueryClient();

  const { data: queue, isLoading, error } = useQuery({
    queryKey: ["pending-approvals"],
    queryFn: () => fetchPending(),
    enabled: canReview,
    refetchInterval: 15000,
  });

  if (!canReview) {
    return (
      <main className="dashboard-shell px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Approvals
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Only Super Admins or delegated users can access the review queue.
        </p>
      </main>
    );
  }

  async function handleApprove(documentId: string) {
    try {
      await approveDoc({ data: { documentId } });
      toast.success("Document approved — moved to Approved Documents and locked");
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approval failed");
    }
  }

  const pendingCount = queue?.length ?? 0;

  return (
    <main className="dashboard-shell min-h-[calc(100dvh-3.5rem)] px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Workspace
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
            Approvals
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pending document reviews · oldest submissions first
          </p>
        </div>

        {isLoading ? (
          <ListSkeleton rows={4} />
        ) : error ? (
          <Card className="border-priority-high/25 bg-[rgba(18,18,20,0.72)] p-6">
            <p className="text-center text-sm text-priority-high">
              Failed to load queue: {error.message}
            </p>
          </Card>
        ) : queue && queue.length > 0 ? (
          <Card className="overflow-hidden border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-0 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)]">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Review queue
                </span>
                <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-foreground/80">
                  {pendingCount}
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                Auto-refreshes every 15s
              </span>
            </div>

            <ul className="divide-y divide-white/[0.06]">
              {queue.map((item) => {
                const hasAi = Boolean(item.ai_report);
                return (
                  <li
                    key={item.id}
                    className="flex flex-col gap-4 px-4 py-4 transition-colors hover:bg-white/[0.03] sm:flex-row sm:items-center sm:px-5"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3.5">
                      <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-muted-foreground">
                        <FileText className="size-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to="/approvals/$approvalId"
                            params={{ approvalId: item.id }}
                            className="truncate text-sm font-semibold tracking-tight text-foreground hover:underline"
                          >
                            {item.document_title}
                          </Link>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide tabular-nums",
                              waitingTone(item.submitted_at),
                            )}
                          >
                            <Clock className="size-3" />
                            {formatTimeWaiting(item.submitted_at)} waiting
                          </span>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                              hasAi
                                ? "bg-white/[0.1] text-foreground"
                                : "bg-white/[0.04] text-muted-foreground",
                            )}
                          >
                            <Bot className={cn("size-3", !hasAi && "opacity-50")} />
                            {hasAi ? "AI scanned" : "No AI report"}
                          </span>
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex min-w-0 items-center gap-1.5">
                            <User className="size-3 shrink-0" />
                            <span className="truncate">
                              {item.submitter_name ?? "Unknown"}
                            </span>
                          </span>
                          <span className="inline-flex min-w-0 items-center gap-1.5">
                            <Briefcase className="size-3 shrink-0" />
                            <span className="truncate">{item.case_title}</span>
                          </span>
                          <span className="tabular-nums">
                            {new Date(item.submitted_at).toLocaleString(
                              undefined,
                              {
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              },
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 pl-[3.25rem] sm:pl-0">
                      <Button
                        variant="ghost"
                        asChild
                        className="h-9 border border-white/[0.08] bg-white/[0.03] px-3 text-foreground hover:bg-white/[0.06]"
                      >
                        <Link
                          to="/approvals/$approvalId"
                          params={{ approvalId: item.id }}
                        >
                          Review
                          <ChevronRight className="ml-1 size-3.5" />
                        </Link>
                      </Button>
                      <Button
                        onClick={() => handleApprove(item.document_id)}
                        className="h-9 gap-1.5 border-0 bg-gradient-to-b from-[#F8F8F8] to-[#CFCFCF] text-[#1a1c20] shadow-[0_8px_20px_rgba(0,0,0,0.22)] hover:from-white hover:to-[#d8d8d8]"
                      >
                        <CheckCheck className="size-4" />
                        Approve
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : (
          <Card className="relative overflow-hidden border-white/[0.08] bg-[rgba(18,18,20,0.72)] px-6 py-20 text-center shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)]">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.06),transparent_55%)]"
            />
            <div className="relative mx-auto flex size-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              <CheckCheck className="size-6" />
            </div>
            <h3 className="relative mt-5 text-base font-semibold tracking-tight text-foreground">
              Queue is clear
            </h3>
            <p className="relative mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
              No documents are waiting for approval. New submissions appear here
              automatically, oldest first.
            </p>
            <p className="relative mt-5 text-xs text-muted-foreground">
              Submit drafts from a{" "}
              <Link
                to="/cases"
                className="text-foreground/80 underline-offset-2 hover:underline"
              >
                matter
              </Link>{" "}
              Documents tab to start a review.
            </p>
          </Card>
        )}
      </div>
    </main>
  );
}
