import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Archive,
  BadgeCheck,
  Briefcase,
  ChevronRight,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  ImageIcon,
  Layers,
  Loader2,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/auth-context";
import {
  getDocumentViewUrl,
  searchGlobalDocuments,
} from "@/lib/documents.functions";
import { listCases } from "@/lib/cases.functions";
import { PremiumSelect } from "@/components/premium-select";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ListSkeleton } from "@/components/loading-skeletons";

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "Verdio" },
      { name: "description", content: "Documents you can access across your matters." },
    ],
  }),
  component: GlobalDocumentsPage,
});

const STAFF_ROLES = [
  "super_admin",
  "admin",
  "senior_lawyer",
  "junior_lawyer",
  "support",
] as const;

const FIELD =
  "h-11 rounded-xl border-white/[0.08] bg-[#14161a] text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-white/20 focus:ring-0";

function isUuidTitle(title: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    title.trim(),
  );
}

function displayTitle(title: string, docType: string | null) {
  if (!title?.trim()) return "Untitled document";
  if (isUuidTitle(title)) {
    if (docType === "PDF") return "PDF document";
    if (docType === "Word") return "Word document";
    if (docType === "Excel") return "Spreadsheet";
    if (docType === "Image") return "Image file";
    return "Document";
  }
  return title;
}

function TypeGlyph({ type }: { type: string | null }) {
  if (type === "Excel") return <FileSpreadsheet className="size-4" />;
  if (type === "Image") return <ImageIcon className="size-4" />;
  return <FileText className="size-4" />;
}

function typeTone(type: string | null) {
  switch (type) {
    case "PDF":
      return "border-priority-high/25 bg-priority-high/10 text-priority-high";
    case "Word":
      return "border-tag-blue/30 bg-tag-blue/12 text-tag-blue";
    case "Excel":
      return "border-status-ontrack/30 bg-status-ontrack/12 text-status-ontrack";
    case "Image":
      return "border-tag-sand/30 bg-tag-sand/12 text-tag-sand";
    default:
      return "border-white/[0.1] bg-white/[0.04] text-muted-foreground";
  }
}

function statusTone(status: string) {
  if (status === "approved") return "bg-white/[0.08] text-foreground/90";
  if (status === "in_review") return "bg-amber-500/15 text-amber-200/90";
  return "bg-white/[0.05] text-muted-foreground";
}

function statusLabel(status: string) {
  if (status === "in_review") return "In review";
  if (status === "approved") return "Approved";
  return "Draft";
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function GlobalDocumentsPage() {
  const { role } = useAuth();
  const searchDocs = useServerFn(searchGlobalDocuments);
  const fetchCases = useServerFn(listCases);
  const fetchViewUrl = useServerFn(getDocumentViewUrl);

  const [query, setQuery] = useState("");
  const [caseId, setCaseId] = useState("");
  const [type, setType] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);

  const canAccess = role != null && (STAFF_ROLES as readonly string[]).includes(role);
  const isAdmin = role === "super_admin" || role === "admin";

  const { data: cases = [] } = useQuery({
    queryKey: ["cases-for-document-filter"],
    queryFn: () => fetchCases(),
    enabled: canAccess,
    staleTime: 60_000,
  });

  const { data: documents, isLoading, error } = useQuery({
    queryKey: ["global-documents", query, caseId, type],
    queryFn: () =>
      searchDocs({
        data: {
          q: query.trim() || undefined,
          caseId: caseId || undefined,
          type: type || undefined,
        },
      }),
    enabled: canAccess,
  });

  async function openDocument(doc: { id: string; case_id: string | null }) {
    if (!doc.case_id || openingId) return;
    setOpeningId(doc.id);
    try {
      const result = await fetchViewUrl({
        data: {
          caseId: doc.case_id,
          documentId: doc.id,
        },
      });
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open document");
    } finally {
      setOpeningId(null);
    }
  }

  const selectedCaseLabel = useMemo(() => {
    if (!caseId) return null;
    const match = cases.find((c) => c.id === caseId);
    if (!match) return null;
    return match.case_ref ? `${match.case_ref} · ${match.title}` : match.title;
  }, [caseId, cases]);

  const caseOptions = useMemo(
    () => [
      {
        value: "",
        label: "All matters",
        description: "Every matter you can access",
        icon: <Layers className="size-3.5" />,
      },
      ...cases.map((c) => ({
        value: c.id,
        label: c.case_ref ?? c.title,
        description: c.case_ref ? c.title : undefined,
        icon: <Briefcase className="size-3.5" />,
      })),
    ],
    [cases],
  );

  const typeOptions = useMemo(
    () => [
      {
        value: "",
        label: "All types",
        description: "PDF, Word, Excel, Image",
        icon: <Layers className="size-3.5" />,
      },
      {
        value: "PDF",
        label: "PDF",
        description: "Portable documents",
        icon: <FileText className="size-3.5" />,
      },
      {
        value: "Word",
        label: "Word",
        description: "DOCX files",
        icon: <FileText className="size-3.5" />,
      },
      {
        value: "Excel",
        label: "Excel",
        description: "Spreadsheets",
        icon: <FileSpreadsheet className="size-3.5" />,
      },
      {
        value: "Image",
        label: "Image",
        description: "JPG & PNG",
        icon: <ImageIcon className="size-3.5" />,
      },
    ],
    [],
  );

  if (!canAccess) {
    return (
      <main className="dashboard-shell px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Documents
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to access documents.
        </p>
      </main>
    );
  }

  const count = documents?.length ?? 0;

  return (
    <main className="dashboard-shell min-h-[calc(100dvh-3.5rem)] px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Workspace
            </p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
              Documents
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
              {isAdmin
                ? "Click a file to open it. Filter by matter or file type."
                : "Click a file to open it. Only files from your matters that you can view appear here."}
            </p>
          </div>
          {!isLoading && !error ? (
            <div className="rounded-2xl border border-white/[0.08] bg-[rgba(18,18,20,0.72)] px-4 py-3 text-right shadow-[0_16px_40px_-28px_rgba(0,0,0,0.7)]">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Showing
              </p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight text-foreground">
                {count}
                <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                  {count === 1 ? "file" : "files"}
                </span>
              </p>
            </div>
          ) : null}
        </div>

        <Card className="overflow-hidden border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-0 shadow-[0_20px_50px_-28px_rgba(0,0,0,0.65)]">
          <div className="border-b border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent p-3 sm:p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search titles…"
                  className={cn(FIELD, "pl-10")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:contents">
                <PremiumSelect
                  aria-label="Filter by matter"
                  value={caseId}
                  onChange={setCaseId}
                  options={caseOptions}
                  emptyLabel="All matters"
                  leadingIcon={<Briefcase className="size-3.5" />}
                  searchable={cases.length > 6}
                  searchPlaceholder="Search matters…"
                  className="lg:w-72"
                  contentClassName="lg:w-80"
                />
                <PremiumSelect
                  aria-label="Filter by type"
                  value={type}
                  onChange={setType}
                  options={typeOptions}
                  emptyLabel="All types"
                  className="lg:w-44"
                  contentClassName="lg:w-56"
                />
              </div>
            </div>
            {selectedCaseLabel ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Filtered to{" "}
                <span className="font-medium text-foreground/85">{selectedCaseLabel}</span>
              </p>
            ) : null}
          </div>

          {isLoading ? (
            <div className="p-4">
              <ListSkeleton rows={5} />
            </div>
          ) : error ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-priority-high">
                Could not load documents: {error.message}
              </p>
            </div>
          ) : documents && documents.length > 0 ? (
            <ul className="divide-y divide-white/[0.05]">
              {documents.map((doc) => {
                const title = displayTitle(doc.title, doc.doc_type);
                const caseLine =
                  doc.case_ref && doc.case_title && doc.case_title !== "Unknown Matter"
                    ? `${doc.case_ref} · ${doc.case_title}`
                    : doc.case_title && doc.case_title !== "Unknown Matter"
                      ? doc.case_title
                      : doc.case_ref ?? "Unlinked matter";
                const isOpening = openingId === doc.id;
                const canOpen = Boolean(doc.case_id);

                return (
                  <li key={doc.id}>
                    <div
                      role={canOpen ? "button" : undefined}
                      tabIndex={canOpen ? 0 : undefined}
                      aria-busy={isOpening || undefined}
                      aria-disabled={!canOpen || openingId != null || undefined}
                      onClick={() => {
                        if (!canOpen || openingId != null) return;
                        void openDocument(doc);
                      }}
                      onKeyDown={(e) => {
                        if (!canOpen || openingId != null) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          void openDocument(doc);
                        }
                      }}
                      className={cn(
                        "group flex w-full items-start gap-3.5 px-4 py-4 text-left transition-colors sm:gap-4 sm:px-5",
                        canOpen
                          ? "cursor-pointer hover:bg-white/[0.035]"
                          : "cursor-not-allowed opacity-60",
                        openingId != null && !isOpening ? "pointer-events-none opacity-70" : null,
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-2xl border",
                          typeTone(doc.doc_type),
                        )}
                      >
                        <TypeGlyph type={doc.doc_type} />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-[15px] font-semibold tracking-tight text-foreground">
                            {title}
                          </h3>
                          <span
                            className={cn(
                              "rounded-lg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
                              statusTone(doc.approval_status),
                            )}
                          >
                            {statusLabel(doc.approval_status)}
                          </span>
                          {doc.is_locked ? (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-status-ontrack/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-status-ontrack">
                              <BadgeCheck className="size-3" />
                              Final
                            </span>
                          ) : null}
                          {doc.is_archived ? (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                              <Archive className="size-3" />
                              Archived
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {doc.doc_type ? (
                            <span className="font-medium text-foreground/70">{doc.doc_type}</span>
                          ) : null}
                          {doc.case_id ? (
                            <Link
                              to="/cases/$caseId"
                              params={{ caseId: doc.case_id }}
                              search={{ tab: "documents" }}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                              className="inline-flex min-w-0 items-center gap-1.5 truncate hover:text-foreground/85"
                              title="Open matter documents"
                            >
                              <Briefcase className="size-3 shrink-0 opacity-60" />
                              <span className="truncate">{caseLine}</span>
                            </Link>
                          ) : (
                            <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                              <Briefcase className="size-3 shrink-0 opacity-60" />
                              <span className="truncate">{caseLine}</span>
                            </span>
                          )}
                          <span className="tabular-nums text-foreground/55">
                            v{doc.current_version ?? 1}
                          </span>
                          <span className="hidden sm:inline text-white/15">·</span>
                          <span className="hidden truncate sm:inline">
                            {doc.uploader_name ?? "Unknown uploader"}
                          </span>
                          <span className="hidden sm:inline text-white/15">·</span>
                          <span className="hidden tabular-nums sm:inline">
                            {formatDate(doc.created_at)}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] tabular-nums text-muted-foreground sm:hidden">
                          {doc.uploader_name ?? "Unknown"} · {formatDate(doc.created_at)}
                        </p>
                      </div>

                      {isOpening ? (
                        <Loader2 className="mt-3 size-4 shrink-0 animate-spin text-muted-foreground" />
                      ) : (
                        <ExternalLink className="mt-3 size-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground/70" />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-muted-foreground">
                <FileText className="size-6" />
              </div>
              <h3 className="mt-5 text-base font-semibold tracking-tight text-foreground">
                No documents match
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Try another search or matter. Only files you are permitted to view appear here.
              </p>
              <Link
                to="/cases"
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-foreground/85 underline-offset-4 hover:underline"
              >
                Browse matters
                <ChevronRight className="size-3.5" />
              </Link>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
