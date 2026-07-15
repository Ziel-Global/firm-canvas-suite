import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCheck, X, Bot, AlertTriangle, Info, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { useState, useRef, useEffect } from "react";

import { useAuth } from "@/contexts/auth-context";
import { getApprovalDetail, getApprovalComments, createApprovalComment } from "@/lib/approvals.functions";
import { approveDocument, returnDocument } from "@/lib/documents.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/approvals/$approvalId")({
  head: () => ({
    meta: [
      { title: "Review Document — Law Firm Ops" },
      { name: "description", content: "AI Review and approval interface." },
    ],
  }),
  component: ReviewScreenPage,
});

function ReviewScreenPage() {
  const { approvalId } = Route.useParams();
  const { role } = useAuth();
  const navigate = useNavigate();
  const isSuperAdmin = role === "super_admin";
  const fetchDetail = useServerFn(getApprovalDetail);
  const fetchComments = useServerFn(getApprovalComments);
  const addComment = useServerFn(createApprovalComment);
  const approveDoc = useServerFn(approveDocument);
  const rejectDoc = useServerFn(returnDocument);
  const queryClient = useQueryClient();

  // Annotation state
  const cleanDocRef = useRef<HTMLDivElement>(null);
  const [selectionRange, setSelectionRange] = useState<Range | null>(null);
  const [commentText, setCommentText] = useState("");
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [boxPosition, setBoxPosition] = useState({ top: 0, left: 0 });

  // Return logic state
  const [isReturning, setIsReturning] = useState(false);
  const [returnReason, setReturnReason] = useState("");

  // AI Flags resolution state
  const [resolvedFlags, setResolvedFlags] = useState<Record<number, 'accepted' | 'dismissed'>>({});

  const canReview = role === "super_admin" || role === "admin" || role === "senior_lawyer";

  const { data: detail, isLoading, error } = useQuery({
    queryKey: ["approval-detail", approvalId],
    queryFn: () => fetchDetail({ data: { approvalId } }),
    enabled: canReview,
  });

  const { data: comments } = useQuery({
    queryKey: ["approval-comments", approvalId],
    queryFn: () => fetchComments({ data: { approvalId } }),
    enabled: canReview,
  });

  // Handle text selection in the clean document
  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        // Don't close the box immediately if they're typing
        return;
      }
      
      const range = selection.getRangeAt(0);
      
      // Ensure selection is inside the clean document container
      if (cleanDocRef.current && cleanDocRef.current.contains(range.commonAncestorContainer)) {
        const rect = range.getBoundingClientRect();
        setSelectionRange(range);
        setBoxPosition({
          top: rect.bottom + window.scrollY,
          left: rect.left + window.scrollX,
        });
        setShowCommentBox(true);
      }
    };

    document.addEventListener("mouseup", handleSelection);
    return () => document.removeEventListener("mouseup", handleSelection);
  }, []);

  if (!canReview) {
    return (
      <main className="px-4 py-6 sm:px-6">
        <p className="text-sm text-muted-foreground">Only Super Admins or delegated users can access this review screen.</p>
      </main>
    );
  }

  if (isLoading) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Loading review screen…</p>;
  }

  if (error || !detail) {
    return (
      <main className="p-6">
        <Card className="p-6 border-destructive/50">
          <p className="text-sm text-destructive text-center">
            Failed to load review details: {error?.message ?? "Not found"}
          </p>
        </Card>
      </main>
    );
  }

  async function handleApprove() {
    try {
      await approveDoc({ data: { documentId: detail!.document_id } });
      toast.success("Document approved and workflow advanced.");
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      navigate({ to: "/approvals" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approval failed");
    }
  }

  async function handleReturn() {
    if (!returnReason.trim()) {
      toast.error("Please provide a reason for returning the document.");
      return;
    }
    try {
      await rejectDoc({ data: { documentId: detail!.document_id, note: returnReason } });
      toast.success("Document returned for revision. Submitter notified.");
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      navigate({ to: "/approvals" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Return failed");
    }
  }

  async function handleSaveComment() {
    if (!commentText.trim() || !selectionRange) return;
    
    // We store the text that was highlighted as the anchor
    const selectedText = selectionRange.toString();
    
    try {
      await addComment({
        data: {
          approvalId,
          body: commentText,
          anchor: { text: selectedText },
        }
      });
      toast.success("Annotation saved");
      setCommentText("");
      setShowCommentBox(false);
      setSelectionRange(null);
      window.getSelection()?.removeAllRanges();
      queryClient.invalidateQueries({ queryKey: ["approval-comments", approvalId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save annotation");
    }
  }

  function handleDismissFlag(idx: number) {
    setResolvedFlags(prev => ({ ...prev, [idx]: 'dismissed' }));
    toast.success("AI suggestion dismissed");
  }

  function handleAcceptFlag(idx: number) {
    setResolvedFlags(prev => ({ ...prev, [idx]: 'accepted' }));
    toast.success("AI suggestion accepted");
  }

  return (
    <main className="flex h-[calc(100vh-4rem)] flex-col gap-6 p-4 sm:p-6 overflow-hidden">
      {/* Header */}
      <header className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center shrink-0">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild className="shrink-0 mt-1">
            <Link to="/approvals">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">{detail.document_title}</h2>
            <p className="text-sm text-muted-foreground">
              Submitted by {detail.submitter_name ?? "Unknown"} in {detail.case_title}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsReturning(true)} className="text-destructive border-destructive/30 hover:bg-destructive/10">
            <X className="mr-2 size-4" />
            Reject & Return
          </Button>
          <Button variant="default" onClick={handleApprove}>
            <CheckCheck className="mr-2 size-4" />
            Approve Document
          </Button>
        </div>
      </header>

      {/* Return Reason Popover / Overlay */}
      {isReturning && (
        <Card className="p-4 border-destructive bg-destructive/5 shrink-0 flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-destructive">Return Document for Revision</h3>
            <Button variant="ghost" size="icon" onClick={() => setIsReturning(false)}>
              <X className="size-4" />
            </Button>
          </div>
          <Textarea 
            placeholder="Explain what needs to be changed..." 
            value={returnReason} 
            onChange={(e) => setReturnReason(e.target.value)} 
            className="min-h-[80px]"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsReturning(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReturn}>Confirm Return</Button>
          </div>
        </Card>
      )}

      {/* AI Summary Report */}
      {detail.ai_job_report && (
        <Card className="p-4 bg-tag-blue/10 border-tag-blue/20 shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <Bot className="size-5 text-tag-blue" />
            <h3 className="font-medium text-foreground">AI Review Summary</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-3">{detail.ai_job_report.summary}</p>
          
          {detail.ai_job_report.flags && detail.ai_job_report.flags.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Detected Flags</h4>
              <ul className="space-y-2">
                {detail.ai_job_report.flags.map((flag: any, idx: number) => {
                  if (resolvedFlags[idx]) return null;
                  return (
                    <li key={idx} className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-sm bg-background/80 p-3 rounded-md border shadow-sm">
                      <div className="flex items-start gap-2">
                        {flag.type === 'risk' ? (
                          <AlertTriangle className="size-4 text-priority-high shrink-0 mt-0.5" />
                        ) : (
                          <Info className="size-4 text-tag-blue shrink-0 mt-0.5" />
                        )}
                        <span className="text-foreground">{flag.description}</span>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleDismissFlag(idx)}>Dismiss</Button>
                        <Button variant="default" size="sm" className="h-7 text-xs bg-tag-blue hover:bg-tag-blue/90" onClick={() => handleAcceptFlag(idx)}>Accept</Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Card>
      )}

      {/* Two Panel Side-by-Side View */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0 relative">
        <Card className="flex flex-col h-full overflow-hidden relative">
          <div className="border-b bg-muted/30 px-4 py-2 shrink-0 flex items-center justify-between">
            <h3 className="font-medium text-sm text-foreground">Clean Document</h3>
            <span className="text-xs text-muted-foreground">Select text to annotate</span>
          </div>
          <div className="p-4 overflow-y-auto flex-1" ref={cleanDocRef}>
            <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
              {detail.clean_content}
            </div>

            {/* Render existing comments below the document content */}
            {comments && comments.length > 0 && (
              <div className="mt-8 pt-4 border-t space-y-3">
                <h4 className="text-sm font-semibold text-foreground">Annotations ({comments.length})</h4>
                {comments.map(c => (
                  <div key={c.id} className="text-sm bg-frame p-3 rounded-md border">
                    <p className="text-muted-foreground italic mb-1 pl-2 border-l-2 border-primary/50 text-xs">
                      "{c.anchor?.text}"
                    </p>
                    <p className="text-foreground">{c.body}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      — {c.author_name ?? "Unknown"} on {new Date(c.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Popover for adding a new annotation */}
          {showCommentBox && (
            <div 
              className="absolute z-10 w-72 bg-popover text-popover-foreground border shadow-lg p-3 rounded-md flex flex-col gap-2"
              style={{ top: '10px', right: '10px' }} // Positioned absolutely inside the card for simplicity in this mockup
            >
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium flex items-center gap-1">
                  <MessageSquarePlus className="size-3" /> Add Annotation
                </span>
                <button onClick={() => { setShowCommentBox(false); setSelectionRange(null); window.getSelection()?.removeAllRanges(); }} className="text-muted-foreground hover:text-foreground">
                  <X className="size-3" />
                </button>
              </div>
              <p className="text-xs italic text-muted-foreground truncate border-l-2 pl-1">
                "{selectionRange?.toString()}"
              </p>
              <Textarea
                className="text-sm min-h-[80px]"
                placeholder="Type your comment..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                autoFocus
              />
              <Button size="sm" onClick={handleSaveComment}>Save Annotation</Button>
            </div>
          )}
        </Card>

        <Card className="flex flex-col h-full overflow-hidden border-tag-blue/30 ring-1 ring-tag-blue/10 shadow-sm">
          <div className="border-b border-tag-blue/20 bg-tag-blue/5 px-4 py-2 flex items-center justify-between shrink-0">
            <h3 className="font-medium text-sm text-tag-blue flex items-center gap-2">
              <Bot className="size-4" /> AI Annotated View
            </h3>
            <span className="text-xs text-tag-blue bg-tag-blue/10 px-2 py-0.5 rounded-full font-medium">
              {detail.ai_job_report?.flags?.length || 0} issues flagged
            </span>
          </div>
          <div className="p-4 overflow-y-auto flex-1 bg-tag-blue/5">
            {/* 
              dangerouslySetInnerHTML is used here only to render the mock inline highlights
              like <mark> tags provided by the backend. In production, this would use a proper
              safe HTML renderer or PDF text layer overlay.
            */}
            <div 
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: detail.annotated_content }}
            />
          </div>
        </Card>
      </div>
    </main>
  );
}
