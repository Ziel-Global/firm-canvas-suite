import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, FileText, Lock, Filter, Archive } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { searchGlobalDocuments } from "@/lib/documents.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/utils";
import { ListSkeleton } from "@/components/loading-skeletons";

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "Verdio" },
      { name: "description", content: "Global search across all firm documents." },
    ],
  }),
  component: GlobalDocumentsPage,
});

const STATUS_STYLES = {
  draft: "bg-white/[0.06] text-muted-foreground",
  in_review: "bg-amber-500/15 text-amber-200/90",
  approved: "bg-white/[0.1] text-foreground",
} as const;

function GlobalDocumentsPage() {
  const { role } = useAuth();
  const searchDocs = useServerFn(searchGlobalDocuments);

  const [query, setQuery] = useState("");
  const [caseId, setCaseId] = useState("");
  const [type, setType] = useState("");

  const isAdmin = role === "super_admin" || role === "admin";

  const { data: documents, isLoading, error } = useQuery({
    queryKey: ["global-documents", query, caseId, type],
    queryFn: () => searchDocs({ data: { q: query, caseId, type } }),
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <main className="dashboard-shell px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Documents
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to access the global documents search.
        </p>
      </main>
    );
  }

  return (
    <main className="dashboard-shell min-h-[calc(100dvh-3.5rem)] px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Workspace
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
            Documents
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Firm-wide document search · permission-aware results
          </p>
        </div>

        <Card className="border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-3 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)] sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by document title…"
                className="h-10 border-white/[0.08] bg-[#17191D] pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="relative w-full lg:w-52">
              <Filter className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Case ID filter…"
                className="h-10 border-white/[0.08] bg-[#17191D] pl-9"
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
              />
            </div>
            <select
              className="h-10 w-full rounded-md border border-white/[0.08] bg-[#17191D] px-3 text-sm text-foreground outline-none focus:border-white/20 lg:w-40"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">All types</option>
              <option value="PDF">PDF</option>
              <option value="Word">Word</option>
              <option value="Excel">Excel</option>
              <option value="Image">Image</option>
            </select>
          </div>
        </Card>

        {isLoading ? (
          <ListSkeleton rows={6} />
        ) : error ? (
          <Card className="border-priority-high/25 bg-[rgba(18,18,20,0.72)] p-6">
            <p className="text-center text-sm text-priority-high">
              Failed to search documents: {error.message}
            </p>
          </Card>
        ) : documents && documents.length > 0 ? (
          <Card className="overflow-hidden border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-0 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)]">
            <ul className="divide-y divide-white/[0.06]">
              {documents.map((doc) => {
                const status =
                  STATUS_STYLES[
                    doc.approval_status as keyof typeof STATUS_STYLES
                  ] ?? STATUS_STYLES.draft;
                const statusLabel =
                  doc.approval_status === "in_review"
                    ? "In Review"
                    : doc.approval_status === "approved"
                      ? "Approved"
                      : "Draft";

                return (
                  <li key={doc.id}>
                    {doc.case_id ? (
                      <Link
                        to="/cases/$caseId"
                        params={{ caseId: doc.case_id }}
                        search={{ tab: "documents" }}
                        className="flex w-full items-start gap-3.5 px-4 py-3.5 transition-colors hover:bg-white/[0.03] sm:px-5"
                      >
                        <DocumentRowBody
                          doc={doc}
                          status={status}
                          statusLabel={statusLabel}
                        />
                      </Link>
                    ) : (
                      <div className="flex w-full items-start gap-3.5 px-4 py-3.5 sm:px-5">
                        <DocumentRowBody
                          doc={doc}
                          status={status}
                          statusLabel={statusLabel}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : (
          <Card className="border-white/[0.08] bg-[rgba(18,18,20,0.72)] px-6 py-16 text-center shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)]">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-white/[0.04] text-muted-foreground">
              <FileText className="size-5" />
            </div>
            <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground">
              No documents found
            </h3>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
              Adjust search or filters. Results only include documents you are
              permitted to view.
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              Tip: open a{" "}
              <Link
                to="/cases"
                className="text-foreground/80 underline-offset-2 hover:underline"
              >
                case
              </Link>{" "}
              and upload documents from its Documents tab.
            </p>
          </Card>
        )}
      </div>
    </main>
  );
}

function DocumentRowBody({
  doc,
  status,
  statusLabel,
}: {
  doc: {
    title: string;
    doc_type: string | null;
    case_title?: string;
    current_version: number | null;
    uploader_name: string | null;
    created_at: string;
    is_locked: boolean;
    is_archived: boolean;
  };
  status: string;
  statusLabel: string;
}) {
  return (
    <>
      <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-muted-foreground">
        <FileText className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold tracking-tight text-foreground">
            {doc.title}
          </span>
          <span
            className={cn(
              "rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              status,
            )}
          >
            {statusLabel}
          </span>
          {doc.is_locked && (
            <span className="inline-flex items-center gap-1 rounded-md bg-priority-high/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-priority-high">
              <Lock className="size-3" />
              Locked
            </span>
          )}
          {doc.is_archived && (
            <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Archive className="size-3" />
              Archived
            </span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {doc.doc_type && <Tag color="blue">{doc.doc_type}</Tag>}
          {doc.case_title && doc.case_title !== "Unknown Case" ? (
            <span className="truncate">{doc.case_title}</span>
          ) : null}
          <span className="tabular-nums">v{doc.current_version ?? 1}</span>
          <span>·</span>
          <span>Uploaded by {doc.uploader_name ?? "Unknown"}</span>
          <span>·</span>
          <span className="tabular-nums">
            {new Date(doc.created_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
      </div>
    </>
  );
}
