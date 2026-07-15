import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, FileText, Lock, Filter } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { searchGlobalDocuments } from "@/lib/documents.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tag } from "@/components/ui/tag";
import { Pill } from "@/components/ui/pill";

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "Global Documents — Law Firm Ops" },
      { name: "description", content: "Global search across all documents." },
    ],
  }),
  component: GlobalDocumentsPage,
});

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
    // Add a slight debounce effect by relying on react-query's default behaviors 
    // or just letting it fetch as typing happens (for simplicity we just pass state).
  });

  if (!isAdmin) {
    return (
      <main className="px-4 py-6 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Global Documents</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to access the global documents search.
        </p>
      </main>
    );
  }

  return (
    <main className="px-4 py-6 sm:px-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Global Documents</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Search across all documents in the firm. Results are automatically filtered to show only documents you have permission to view.
        </p>
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by document title..."
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <div className="relative w-48">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Case ID filter..."
                className="pl-9"
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
              />
            </div>
            <select
              className="flex h-10 w-40 items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">All Types</option>
              <option value="PDF">PDF</option>
              <option value="Word">Word</option>
              <option value="Excel">Excel</option>
              <option value="Image">Image</option>
            </select>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Searching documents...</p>
      ) : error ? (
        <Card className="p-6 border-destructive/50">
          <p className="text-sm text-destructive text-center">Failed to search documents: {error.message}</p>
        </Card>
      ) : documents && documents.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-border">
            {documents.map((doc) => {
              const statusConfig = {
                draft: { label: 'Draft', className: 'bg-frame text-muted-foreground' },
                in_review: { label: 'In Review', className: 'bg-tag-sand/60 text-foreground' },
                approved: { label: 'Approved', className: 'bg-priority-low/20 text-foreground' },
              } as const;

              const status = statusConfig[doc.approval_status as keyof typeof statusConfig] ?? statusConfig.draft;

              return (
                <li key={doc.id} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-frame/50">
                  <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{doc.title}</span>
                      <Pill className={status.className}>{status.label}</Pill>
                      {doc.is_locked && (
                        <Pill className="bg-priority-high/20 text-foreground">
                          <Lock className="size-3" />
                          Locked
                        </Pill>
                      )}
                      {doc.is_archived && <Pill className="bg-frame text-muted-foreground">Archived</Pill>}
                      {doc.case_title && <Tag color="gray">{doc.case_title}</Tag>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {doc.doc_type && <Tag color="blue">{doc.doc_type}</Tag>}
                      <span>v{doc.current_version ?? 1}</span>
                      <span>·</span>
                      <span>Uploaded by {doc.uploader_name ?? "Unknown"}</span>
                      <span>·</span>
                      <span>
                        {new Date(doc.created_at).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <Card className="p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <FileText className="size-10 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground">No documents found</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              Try adjusting your search query or filters to find what you're looking for. Note that you can only see documents you have permission to view.
            </p>
          </div>
        </Card>
      )}
    </main>
  );
}
