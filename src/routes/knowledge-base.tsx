import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Search, X, FileText, CalendarDays, User, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/auth-context";
import { searchKnowledgeBase, ClosedCaseRecord } from "@/lib/knowledge-base.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/knowledge-base")({
  head: () => ({
    meta: [
      { title: "Knowledge Base — Law Firm Ops" },
      { name: "description", content: "Search closed cases for precedents, outcomes, and key decisions." },
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

function KnowledgeBasePage() {
  const { role } = useAuth();
  const fetchKB = useServerFn(searchKnowledgeBase);

  const [q, setQ] = useState("");
  const [caseType, setCaseType] = useState("");
  const [clientName, setClientName] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Active search params (committed on search)
  const [activeParams, setActiveParams] = useState({});

  const { data: results, isLoading, refetch } = useQuery({
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
    setActiveParams(params);
  }

  function handleClear() {
    setQ("");
    setCaseType("");
    setClientName("");
    setFromDate("");
    setToDate("");
    setActiveParams({});
  }

  return (
    <main className="px-4 py-6 sm:px-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
          <BookOpen className="size-6 text-tag-blue" />
          Knowledge Base
        </h2>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
          Search closed cases for precedents, outcomes, and key decisions. Only cases you are permitted to see are returned.
        </p>
      </div>

      {/* Search form */}
      <Card className="p-5">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1 lg:col-span-2">
              <Label className="text-xs">Keyword search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search titles, summaries, topics…"
                  value={q}
                  onChange={e => setQ(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Case Type</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={caseType}
                onChange={e => setCaseType(e.target.value)}
              >
                <option value="">All types</option>
                {CASE_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Client Name</Label>
              <Input
                placeholder="Filter by client…"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Closed from</Label>
              <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Closed to</Label>
              <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="ghost" onClick={handleClear}>
              <X className="size-4 mr-1" /> Clear
            </Button>
            <Button type="submit" className="bg-tag-blue hover:bg-tag-blue/90">
              <Search className="size-4 mr-1" /> Search
            </Button>
          </div>
        </form>
      </Card>

      {/* Results */}
      <div className="space-y-3">
        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground py-8">Searching knowledge base…</p>
        ) : results && results.length > 0 ? (
          <>
            <p className="text-xs text-muted-foreground">{results.length} case{results.length !== 1 ? "s" : ""} found</p>
            {results.map(c => (
              <KBCaseCard
                key={c.id}
                record={c}
                expanded={expandedId === c.id}
                onToggle={() => setExpandedId(prev => prev === c.id ? null : c.id)}
              />
            ))}
          </>
        ) : results && results.length === 0 ? (
          <Card className="p-10 text-center">
            <BookOpen className="size-8 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground">No closed cases match your search. Try broadening the filters.</p>
          </Card>
        ) : (
          <Card className="p-10 text-center">
            <BookOpen className="size-8 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground">Use the search above to find closed cases.</p>
          </Card>
        )}
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
    <Card className="overflow-hidden hover:border-tag-blue/40 transition-colors">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-5 py-4 flex items-start gap-4"
      >
        <FileText className="size-5 text-tag-blue shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-foreground leading-tight">
              {record.title}
              {record.case_ref && <span className="ml-2 text-xs text-muted-foreground font-normal">{record.case_ref}</span>}
            </h3>
            {expanded ? <ChevronUp className="size-4 text-muted-foreground shrink-0 mt-0.5" /> : <ChevronDown className="size-4 text-muted-foreground shrink-0 mt-0.5" />}
          </div>
          <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground">
            {record.case_type && (
              <span className="bg-muted px-2 py-0.5 rounded font-medium">{record.case_type}</span>
            )}
            {record.client_name && (
              <span className="flex items-center gap-1">
                <User className="size-3" /> {record.client_name}
              </span>
            )}
            {record.closed_at && (
              <span className="flex items-center gap-1">
                <CalendarDays className="size-3" /> Closed {new Date(record.closed_at).toLocaleDateString()}
              </span>
            )}
            <span>{record.document_count} docs</span>
            <span>{record.note_count} notes</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t bg-muted/20 px-5 py-4 space-y-4">
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Closure Summary</h4>
            <pre className="whitespace-pre-wrap text-sm text-foreground/80 font-sans bg-background/60 p-4 rounded-md border leading-relaxed">
              {record.closure_summary}
            </pre>
          </div>
          {record.retention_until && (
            <p className="text-xs text-muted-foreground">
              Retained until: <strong>{new Date(record.retention_until).toLocaleDateString()}</strong>
            </p>
          )}
          <div className="flex justify-end">
            <Link
              to="/cases/$caseId"
              params={{ caseId: record.id }}
              className="text-xs text-tag-blue hover:underline"
            >
              Open full case →
            </Link>
          </div>
        </div>
      )}
    </Card>
  );
}
