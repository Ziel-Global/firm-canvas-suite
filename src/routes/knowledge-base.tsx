import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BookOpen,
  Search,
  X,
  FileText,
  CalendarDays,
  User,
  ChevronDown,
  ChevronUp,
  Scale,
  Archive,
  StickyNote,
  ArrowUpRight,
} from "lucide-react";

import { searchKnowledgeBase, ClosedCaseRecord } from "@/lib/knowledge-base.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ListSkeleton } from "@/components/loading-skeletons";

export const Route = createFileRoute("/knowledge-base")({
  head: () => ({
    meta: [
      { title: "Knowledge Base — SAS Associates" },
      {
        name: "description",
        content:
          "Search closed cases for precedents, outcomes, and key decisions.",
      },
    ],
  }),
  component: KnowledgeBasePage,
});

const CASE_TYPES = [
  "Civil Litigation",
  "Criminal Defence",
  "Family Law",
  "Corporate",
  "Conveyancing",
  "Employment",
  "Immigration",
  "Personal Injury",
  "Intellectual Property",
];

const fieldClass =
  "h-10 border-white/[0.08] bg-[#17191D] focus-visible:ring-white/10";
const selectClass =
  "h-10 w-full rounded-md border border-white/[0.08] bg-[#17191D] px-3 text-sm text-foreground outline-none focus:border-white/20";

function KnowledgeBasePage() {
  const fetchKB = useServerFn(searchKnowledgeBase);

  const [q, setQ] = useState("");
  const [caseType, setCaseType] = useState("");
  const [clientName, setClientName] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [activeParams, setActiveParams] = useState<Record<string, string>>({});

  const { data: results, isLoading } = useQuery({
    queryKey: ["knowledge-base", activeParams],
    queryFn: () => fetchKB({ data: activeParams }),
    enabled: true,
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const params: Record<string, string> = {};
    if (q.trim()) params.q = q.trim();
    if (caseType) params.caseType = caseType;
    if (clientName.trim()) params.clientName = clientName.trim();
    if (fromDate) params.fromDate = fromDate;
    if (toDate) params.toDate = toDate;
    setHasSearched(true);
    setActiveParams(params);
  }

  function handleClear() {
    setQ("");
    setCaseType("");
    setClientName("");
    setFromDate("");
    setToDate("");
    setHasSearched(false);
    setActiveParams({});
    setExpandedId(null);
  }

  const filterCount = [
    q.trim(),
    caseType,
    clientName.trim(),
    fromDate,
    toDate,
  ].filter(Boolean).length;

  return (
    <main className="dashboard-shell min-h-[calc(100vh-3.5rem)] px-5 py-6 sm:px-7 lg:px-8 xl:px-10">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-7">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1">
              <Scale className="size-3 text-muted-foreground" />
              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Firm · Precedent library
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              Knowledge Base
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Search closed matters for precedents, outcomes, and key decisions.
              Results respect your case permissions.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-[rgba(18,18,20,0.72)] px-4 py-3 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)]">
            <div className="flex size-9 items-center justify-center rounded-xl bg-white/[0.05] text-muted-foreground">
              <Archive className="size-4" />
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Closed archive
              </p>
              <p className="mt-0.5 text-sm font-medium text-foreground">
                {isLoading
                  ? "Searching…"
                  : results
                    ? `${results.length} match${results.length === 1 ? "" : "es"}`
                    : "Ready"}
              </p>
            </div>
          </div>
        </div>

        {/* Search */}
        <Card className="relative overflow-hidden border-white/[0.08] bg-[rgba(18,18,20,0.78)] p-0 shadow-[0_20px_50px_-28px_rgba(0,0,0,0.65)]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
          />
          <form onSubmit={handleSearch} className="space-y-5 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Query builder
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Keywords, matter type, client, and closure window
                </p>
              </div>
              {filterCount > 0 ? (
                <span className="rounded-md bg-white/[0.08] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-foreground/80">
                  {filterCount} active
                </span>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
                <Label className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Keyword search
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className={cn(fieldClass, "pl-9")}
                    placeholder="Titles, summaries, topics, decisions…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5 lg:col-span-2">
                <Label className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Case type
                </Label>
                <select
                  className={selectClass}
                  value={caseType}
                  onChange={(e) => setCaseType(e.target.value)}
                >
                  <option value="">All types</option>
                  {CASE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
                <Label className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Client name
                </Label>
                <Input
                  className={fieldClass}
                  placeholder="Filter by client…"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5 lg:col-span-2">
                <Label className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Closed from
                </Label>
                <Input
                  type="date"
                  className={fieldClass}
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>

              <div className="space-y-1.5 lg:col-span-2">
                <Label className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Closed to
                </Label>
                <Input
                  type="date"
                  className={fieldClass}
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.06] pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={handleClear}
                className="h-9 border border-white/[0.08] bg-white/[0.03] px-3 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
              >
                <X className="mr-1.5 size-4" />
                Clear
              </Button>
              <Button
                type="submit"
                className="h-9 gap-1.5 border-0 bg-gradient-to-b from-[#F8F8F8] to-[#CFCFCF] px-4 text-[#1a1c20] shadow-[0_8px_20px_rgba(0,0,0,0.22)] hover:from-white hover:to-[#d8d8d8]"
              >
                <Search className="size-4" />
                Search archive
              </Button>
            </div>
          </form>
        </Card>

        {/* Results */}
        <section className="space-y-4">
          {isLoading ? (
            <ListSkeleton rows={4} />
          ) : results && results.length > 0 ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Results
                  </span>
                  <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-foreground/80">
                    {results.length}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Expand a matter to read its closure summary
                </p>
              </div>

              <Card className="overflow-hidden border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-0 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)]">
                <ul className="divide-y divide-white/[0.06]">
                  {results.map((c) => (
                    <KBCaseCard
                      key={c.id}
                      record={c}
                      expanded={expandedId === c.id}
                      onToggle={() =>
                        setExpandedId((prev) => (prev === c.id ? null : c.id))
                      }
                    />
                  ))}
                </ul>
              </Card>
            </>
          ) : (
            <Card className="relative overflow-hidden border-white/[0.08] bg-[rgba(18,18,20,0.72)] px-6 py-20 text-center shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)]">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.07),transparent_55%)]"
              />
              <div className="relative mx-auto flex size-16 items-center justify-center rounded-2xl border border-white/[0.1] bg-gradient-to-b from-white/[0.08] to-white/[0.02] text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <BookOpen className="size-7" />
              </div>
              <h3 className="relative mt-6 text-lg font-semibold tracking-tight text-foreground">
                {hasSearched || Object.keys(activeParams).length > 0
                  ? "No matching precedents"
                  : "Begin with a precise query"}
              </h3>
              <p className="relative mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                {hasSearched || Object.keys(activeParams).length > 0
                  ? "No closed cases match these filters. Broaden keywords, clear the date window, or try another matter type."
                  : "Search titles, summaries, and topics across closed cases you are permitted to view."}
              </p>
            </Card>
          )}
        </section>
      </div>
    </main>
  );
}

function KBCaseCard({
  record,
  expanded,
  onToggle,
}: {
  record: ClosedCaseRecord;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="group flex w-full items-start gap-3.5 px-4 py-4 text-left transition-colors hover:bg-white/[0.03] sm:px-5"
      >
        <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-muted-foreground transition-colors group-hover:border-white/15 group-hover:text-foreground">
          <FileText className="size-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-semibold tracking-tight text-foreground">
                  {record.title}
                </h3>
                {record.case_ref ? (
                  <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide tabular-nums text-muted-foreground">
                    {record.case_ref}
                  </span>
                ) : null}
                {record.case_type ? (
                  <span className="rounded-md bg-white/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/85">
                    {record.case_type}
                  </span>
                ) : null}
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {record.client_name ? (
                  <span className="inline-flex items-center gap-1.5">
                    <User className="size-3 shrink-0" />
                    <span className="truncate">{record.client_name}</span>
                  </span>
                ) : null}
                {record.closed_at ? (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="size-3 shrink-0" />
                    Closed{" "}
                    {new Date(record.closed_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1.5">
                  <Archive className="size-3 shrink-0" />
                  {record.document_count} docs
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <StickyNote className="size-3 shrink-0" />
                  {record.note_count} notes
                </span>
              </div>
            </div>

            <span className="mt-1 shrink-0 text-muted-foreground/70 transition-colors group-hover:text-foreground">
              {expanded ? (
                <ChevronUp className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
            </span>
          </div>
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-white/[0.06] bg-white/[0.015] px-4 py-5 sm:px-5 sm:pl-[4.25rem]">
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Closure summary
              </p>
              <div className="mt-2 rounded-xl border border-white/[0.08] bg-[#141518] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/85">
                  {record.closure_summary || "No closure summary recorded."}
                </pre>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              {record.retention_until ? (
                <p className="text-xs text-muted-foreground">
                  Retained until{" "}
                  <span className="font-medium text-foreground/80">
                    {new Date(record.retention_until).toLocaleDateString(
                      undefined,
                      {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      },
                    )}
                  </span>
                </p>
              ) : (
                <span />
              )}

              <Link
                to="/cases/$caseId"
                params={{ caseId: record.id }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-white/[0.08]"
              >
                Open full case
                <ArrowUpRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
}
