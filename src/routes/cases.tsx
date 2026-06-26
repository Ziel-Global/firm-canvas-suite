import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, LayoutGrid, Table as TableIcon, CalendarClock, User, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { NewCaseSheet } from "@/components/new-case-sheet";

import { useAuth } from "@/contexts/auth-context";
import { listCases, type CaseRow } from "@/lib/cases.functions";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { Input } from "@/components/ui/input";
import { StatusDot, type StatusDotProps } from "@/components/ui/status-dot";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export const Route = createFileRoute("/cases")({
  head: () => ({
    meta: [
      { title: "Cases — Law Firm Ops" },
      { name: "description", content: "Cases section for the firm operations system." },
    ],
  }),
  component: CasesPage,
});

type ViewMode = "table" | "cards";

const HEALTH_MAP: Record<string, NonNullable<StatusDotProps["status"]>> = {
  on_track: "ontrack",
  at_risk: "atrisk",
  overdue: "overdue",
};

const STATUS_LABELS: Record<string, string> = {
  intake: "Intake",
  active: "Active",
  on_hold: "On hold",
  closed: "Closed",
};

const HEALTH_LABELS: Record<string, string> = {
  on_track: "On track",
  at_risk: "At risk",
  overdue: "Overdue",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function healthDot(health: string | null) {
  const status = health ? HEALTH_MAP[health] : undefined;
  return <StatusDot status={status ?? "ontrack"} label={health ? HEALTH_LABELS[health] : "—"} />;
}

function CasesPage() {
  const { role } = useAuth();
  const fetchCases = useServerFn(listCases);
  const [view, setView] = useState<ViewMode>("table");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState("all");
  const [newCaseOpen, setNewCaseOpen] = useState(false);

  const canView = role != null;
  const canCreate = role === "super_admin" || role === "admin";

  const { data, isLoading, error } = useQuery({
    queryKey: ["cases"],
    queryFn: () => fetchCases(),
    enabled: canView,
  });

  const caseTypes = useMemo(
    () =>
      Array.from(
        new Set((data ?? []).map((c) => c.case_type).filter((v): v is string => Boolean(v))),
      ).sort(),
    [data],
  );
  const assignees = useMemo(
    () =>
      Array.from(
        new Set((data ?? []).map((c) => c.lead_name).filter((v): v is string => Boolean(v))),
      ).sort(),
    [data],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((c) => {
      if (
        q !== "" &&
        !(
          c.title.toLowerCase().includes(q) ||
          (c.case_ref ?? "").toLowerCase().includes(q) ||
          (c.client_name ?? "").toLowerCase().includes(q)
        )
      )
        return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (typeFilter !== "all" && c.case_type !== typeFilter) return false;
      if (assigneeFilter !== "all" && c.lead_name !== assigneeFilter) return false;
      if (healthFilter !== "all" && c.health !== healthFilter) return false;
      return true;
    });
  }, [data, search, statusFilter, typeFilter, assigneeFilter, healthFilter]);

  if (!canView) {
    return (
      <main className="px-4 py-6 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Cases</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to view this page.
        </p>
      </main>
    );
  }

  return (
    <main className="px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Cases</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cases you can access based on your role and assignments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => v && setView(v as ViewMode)}
            className="rounded-control border border-border bg-surface p-1"
          >
            <ToggleGroupItem value="table" aria-label="Table view" className="gap-1.5">
              <TableIcon className="size-4" />
              Table
            </ToggleGroupItem>
            <ToggleGroupItem value="cards" aria-label="Card view" className="gap-1.5">
              <LayoutGrid className="size-4" />
              Cards
            </ToggleGroupItem>
          </ToggleGroup>
          {canCreate && (
            <Button onClick={() => setNewCaseOpen(true)} className="gap-1.5">
              <Plus className="size-4" />
              New case
            </Button>
          )}
        </div>
      </div>

      {canCreate && <NewCaseSheet open={newCaseOpen} onOpenChange={setNewCaseOpen} />}


      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="relative w-full lg:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ref, title, or client"
            className="pl-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full lg:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="intake">Intake</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="on_hold">On hold</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full lg:w-44">
            <SelectValue placeholder="Case type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {caseTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
          <SelectTrigger className="w-full lg:w-44">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assignees</SelectItem>
            {assignees.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={healthFilter} onValueChange={setHealthFilter}>
          <SelectTrigger className="w-full lg:w-40">
            <SelectValue placeholder="Health" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All health</SelectItem>
            <SelectItem value="on_track">On track</SelectItem>
            <SelectItem value="at_risk">At risk</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <p className="mt-8 text-center text-sm text-muted-foreground">Loading cases…</p>
      )}
      {error && !isLoading && (
        <p className="mt-8 text-center text-sm text-destructive">Could not load cases.</p>
      )}
      {!isLoading && !error && rows.length === 0 && (
        <p className="mt-8 text-center text-sm text-muted-foreground">No cases found.</p>
      )}

      {!isLoading && !error && rows.length > 0 && view === "table" && (
        <Card className="mt-6 overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Current stage</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Next deadline</TableHead>
                  <TableHead>Health</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c: CaseRow) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link
                        to="/cases/$caseId"
                        params={{ caseId: c.id }}
                        className="hover:underline"
                      >
                        {c.case_ref ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/cases/$caseId"
                        params={{ caseId: c.id }}
                        className="hover:underline"
                      >
                        {c.title}
                      </Link>
                    </TableCell>
                    <TableCell>{c.client_name ?? "—"}</TableCell>
                    <TableCell>{c.case_type ?? "—"}</TableCell>
                    <TableCell>{c.current_stage_name ?? "—"}</TableCell>
                    <TableCell>{c.lead_name ?? "—"}</TableCell>
                    <TableCell>{formatDate(c.next_deadline)}</TableCell>
                    <TableCell>{healthDot(c.health)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {!isLoading && !error && rows.length > 0 && view === "cards" && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((c: CaseRow) => (
            <Card key={c.id} className="flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <Link
                  to="/cases/$caseId"
                  params={{ caseId: c.id }}
                  className="min-w-0"
                >
                  <p className="text-xs text-muted-foreground">{c.case_ref ?? "—"}</p>
                  <h3 className="truncate text-base font-semibold text-foreground hover:underline">{c.title}</h3>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {c.client_name ?? "—"}
                  </p>
                </Link>
                {healthDot(c.health)}
              </div>
              <div className="flex flex-wrap gap-2">
                {c.case_type && <Tag color="blue">{c.case_type}</Tag>}
                {c.status && <Tag color="sand">{STATUS_LABELS[c.status] ?? c.status}</Tag>}
                {c.current_stage_name && <Tag color="purple">{c.current_stage_name}</Tag>}
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="size-4" />
                  <span>Lead: {c.lead_name ?? "—"}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CalendarClock className="size-4" />
                  <span>Next deadline: {formatDate(c.next_deadline)}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
