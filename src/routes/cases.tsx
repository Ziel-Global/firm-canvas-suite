import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Search,
  LayoutGrid,
  Table as TableIcon,
  CalendarClock,
  User,
  Plus,
  ChevronRight,
  Activity,
  Briefcase,
  CircleDot,
  Layers,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { NewCaseSheet } from "@/components/new-case-sheet";
import { AssignLeadDialog } from "@/components/assign-lead-dialog";
import { useAuth } from "@/contexts/auth-context";
import { listCases, type CaseRow } from "@/lib/cases.functions";
import { PremiumSelect } from "@/components/premium-select";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TableSkeleton, CardsSkeleton } from "@/components/loading-skeletons";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/cases")({
  validateSearch: (search: Record<string, unknown>): { new?: boolean } => ({
    new:
      search.new === true || search.new === "true" || search.new === "1"
        ? true
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Verdio" },
      {
        name: "description",
        content: "Cases section for the firm operations system.",
      },
    ],
  }),
  component: CasesPage,
});

type ViewMode = "table" | "cards";

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

function healthBadge(health: string | null) {
  const key = health ?? "on_track";
  const label = HEALTH_LABELS[key] ?? "—";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] whitespace-nowrap",
        key === "overdue"
          ? "border-priority-high/25 bg-priority-high/12 text-priority-high"
          : key === "at_risk"
            ? "border-amber-500/25 bg-amber-500/12 text-amber-200/90"
            : "border-white/10 bg-white/[0.06] text-foreground/85",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          key === "overdue"
            ? "bg-priority-high shadow-[0_0_0_3px_rgba(239,68,68,0.15)]"
            : key === "at_risk"
              ? "bg-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.12)]"
              : "bg-emerald-400/90 shadow-[0_0_0_3px_rgba(52,211,153,0.12)]",
        )}
      />
      {label}
    </span>
  );
}

function initials(name: string | null) {
  if (!name?.trim()) return null;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function CasesPage() {
  const { role } = useAuth();
  const navigate = useNavigate({ from: "/cases" });
  const { new: openNewFromNav } = Route.useSearch();
  const fetchCases = useServerFn(listCases);
  const [view, setView] = useState<ViewMode>("table");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState("all");
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{
    id: string;
    title: string;
    leadId: string | null;
    leadName: string | null;
  } | null>(null);

  const canView = role != null;
  const canCreate = role === "super_admin" || role === "admin";
  const canAssign = canCreate;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => {
      if (mq.matches) setView("cards");
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (openNewFromNav && canCreate) {
      setNewCaseOpen(true);
    }
  }, [openNewFromNav, canCreate]);

  function handleNewCaseOpenChange(open: boolean) {
    setNewCaseOpen(open);
    if (!open && openNewFromNav) {
      void navigate({
        to: "/cases",
        search: { new: undefined },
        replace: true,
      });
    }
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ["cases"],
    queryFn: () => fetchCases(),
    enabled: canView,
  });

  const caseTypes = useMemo(
    () =>
      Array.from(
        new Set(
          (data ?? [])
            .map((c) => c.case_type)
            .filter((v): v is string => Boolean(v)),
        ),
      ).sort(),
    [data],
  );
  const assignees = useMemo(
    () =>
      Array.from(
        new Set(
          (data ?? [])
            .map((c) => c.lead_name)
            .filter((v): v is string => Boolean(v)),
        ),
      ).sort(),
    [data],
  );

  const statusOptions = useMemo(
    () => [
      {
        value: "all",
        label: "All statuses",
        description: "Every lifecycle state",
        icon: <Layers className="size-3.5" />,
      },
      {
        value: "intake",
        label: "Intake",
        description: "Newly opened matters",
        icon: <CircleDot className="size-3.5" />,
      },
      {
        value: "active",
        label: "Active",
        description: "In progress",
        icon: <CircleDot className="size-3.5" />,
      },
      {
        value: "on_hold",
        label: "On hold",
        description: "Paused work",
        icon: <CircleDot className="size-3.5" />,
      },
      {
        value: "closed",
        label: "Closed",
        description: "Completed matters",
        icon: <CircleDot className="size-3.5" />,
      },
    ],
    [],
  );

  const typeOptions = useMemo(
    () => [
      {
        value: "all",
        label: "All types",
        description: "Every practice area",
        icon: <Layers className="size-3.5" />,
      },
      ...caseTypes.map((t) => ({
        value: t,
        label: t
          .split("_")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" "),
        description: "Case type",
        icon: <Briefcase className="size-3.5" />,
      })),
    ],
    [caseTypes],
  );

  const assigneeOptions = useMemo(
    () => [
      {
        value: "all",
        label: "All assignees",
        description: "Any case lead",
        icon: <Layers className="size-3.5" />,
      },
      ...assignees.map((a) => ({
        value: a,
        label: a,
        description: "Case lead",
        icon: <User className="size-3.5" />,
      })),
    ],
    [assignees],
  );

  const healthOptions = useMemo(
    () => [
      {
        value: "all",
        label: "All health",
        description: "Any risk level",
        icon: <Layers className="size-3.5" />,
      },
      {
        value: "on_track",
        label: "On track",
        description: "Healthy progress",
        icon: <Activity className="size-3.5" />,
      },
      {
        value: "at_risk",
        label: "At risk",
        description: "Needs attention",
        icon: <Activity className="size-3.5" />,
      },
      {
        value: "overdue",
        label: "Overdue",
        description: "Past deadline",
        icon: <Activity className="size-3.5" />,
      },
    ],
    [],
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
      if (assigneeFilter !== "all" && c.lead_name !== assigneeFilter)
        return false;
      if (healthFilter !== "all" && c.health !== healthFilter) return false;
      return true;
    });
  }, [data, search, statusFilter, typeFilter, assigneeFilter, healthFilter]);

  if (!canView) {
    return (
      <main className="dashboard-shell px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Cases
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to view this page.
        </p>
      </main>
    );
  }

  return (
    <main className="dashboard-shell min-h-[calc(100dvh-3.5rem)] px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
      <div className="mx-auto w-full max-w-[1440px] space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Workspace
            </p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
              Cases
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Role-scoped matters across the firm portfolio
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(v) => v && setView(v as ViewMode)}
              className="rounded-xl border border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-1"
            >
              <ToggleGroupItem
                value="table"
                aria-label="Table view"
                className="gap-1.5 rounded-lg px-3 data-[state=on]:bg-white/[0.08] data-[state=on]:text-foreground"
              >
                <TableIcon className="size-3.5" />
                Table
              </ToggleGroupItem>
              <ToggleGroupItem
                value="cards"
                aria-label="Card view"
                className="gap-1.5 rounded-lg px-3 data-[state=on]:bg-white/[0.08] data-[state=on]:text-foreground"
              >
                <LayoutGrid className="size-3.5" />
                Cards
              </ToggleGroupItem>
            </ToggleGroup>

            {canCreate && (
              <Button
                onClick={() => setNewCaseOpen(true)}
                className="gap-1.5 border-0 bg-gradient-to-b from-[#F8F8F8] to-[#CFCFCF] text-[#1a1c20] shadow-[0_8px_20px_rgba(0,0,0,0.22)] hover:from-white hover:to-[#d8d8d8]"
              >
                <Plus className="size-4" />
                New case
              </Button>
            )}
          </div>
        </div>

        {canCreate && (
          <NewCaseSheet open={newCaseOpen} onOpenChange={handleNewCaseOpenChange} />
        )}

        <AssignLeadDialog
          open={assignTarget != null}
          onOpenChange={(open) => {
            if (!open) setAssignTarget(null);
          }}
          caseId={assignTarget?.id ?? ""}
          caseTitle={assignTarget?.title}
          currentLeadId={assignTarget?.leadId}
          currentLeadName={assignTarget?.leadName}
        />

        {/* Filters */}
        <Card className="border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-3 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)] sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
            <div className="relative w-full lg:max-w-sm lg:flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ref, title, or client"
                className="h-10 border-white/[0.08] bg-[#17191D] pl-9 focus-visible:ring-white/10"
              />
            </div>

            <PremiumSelect
              aria-label="Filter by status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={statusOptions}
              emptyLabel="All statuses"
              className="h-10 lg:w-40"
              contentClassName="lg:w-56"
            />

            <PremiumSelect
              aria-label="Filter by case type"
              value={typeFilter}
              onChange={setTypeFilter}
              options={typeOptions}
              emptyLabel="All types"
              className="h-10 lg:w-44"
              contentClassName="lg:w-56"
              searchable={caseTypes.length > 6}
              searchPlaceholder="Search types…"
            />

            <PremiumSelect
              aria-label="Filter by assignee"
              value={assigneeFilter}
              onChange={setAssigneeFilter}
              options={assigneeOptions}
              emptyLabel="All assignees"
              leadingIcon={<User className="size-3.5" />}
              className="h-10 lg:w-44"
              contentClassName="lg:w-60"
              searchable={assignees.length > 6}
              searchPlaceholder="Search assignees…"
            />

            <PremiumSelect
              aria-label="Filter by health"
              value={healthFilter}
              onChange={setHealthFilter}
              options={healthOptions}
              emptyLabel="All health"
              className="h-10 lg:w-40"
              contentClassName="lg:w-56"
            />
          </div>
        </Card>

        {isLoading &&
          (view === "cards" ? (
            <CardsSkeleton />
          ) : (
            <TableSkeleton rows={7} cols={6} />
          ))}
        {error && !isLoading && (
          <p className="py-10 text-center text-sm text-destructive">
            Could not load cases.
          </p>
        )}
        {!isLoading && !error && rows.length === 0 && (
          <Card className="border-white/[0.08] bg-[rgba(18,18,20,0.72)] px-6 py-14 text-center">
            <p className="text-sm font-medium text-foreground">No cases found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Adjust filters or create a new matter to get started.
            </p>
          </Card>
        )}

        {!isLoading && !error && rows.length > 0 && view === "table" && (
          <Card className="relative overflow-hidden border-white/[0.08] bg-[rgba(18,18,20,0.78)] p-0 shadow-[0_20px_50px_-28px_rgba(0,0,0,0.65)]">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
            />

            <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Case register
                </span>
                <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-foreground/80">
                  {rows.length}
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                Click a matter to open
              </span>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/[0.06] hover:bg-transparent">
                    {[
                      "Reference",
                      "Title",
                      "Client",
                      "Type",
                      "Current stage",
                      "Lead",
                      "Next deadline",
                      "Health",
                      "",
                    ].map((label) => (
                      <TableHead
                        key={label || "action"}
                        className={cn(
                          "sticky top-0 z-[1] h-12 bg-[rgba(16,16,18,0.92)] px-4 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground backdrop-blur-md first:pl-5 last:pr-5",
                          label === "Health" && "text-right",
                        )}
                      >
                        {label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c: CaseRow) => {
                    const overdue = c.health === "overdue";
                    const leadInitials = initials(c.lead_name);
                    return (
                      <TableRow
                        key={c.id}
                        className={cn(
                          "group border-white/[0.05] transition-colors hover:bg-white/[0.035]",
                          overdue && "bg-priority-high/[0.03]",
                        )}
                      >
                        <TableCell className="relative px-4 py-4 first:pl-5">
                          {overdue ? (
                            <span
                              aria-hidden
                              className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-priority-high/70"
                            />
                          ) : null}
                          <Link
                            to="/cases/$caseId"
                            params={{ caseId: c.id }}
                            className="inline-flex rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 font-mono text-[11px] font-semibold tracking-wide text-foreground/90 transition-colors hover:border-white/20 hover:bg-white/[0.08]"
                          >
                            {c.case_ref ?? "—"}
                          </Link>
                        </TableCell>

                        <TableCell className="max-w-[260px] px-4 py-4">
                          <Link
                            to="/cases/$caseId"
                            params={{ caseId: c.id }}
                            className="block min-w-0"
                          >
                            <span className="block truncate text-sm font-semibold tracking-tight text-foreground transition-colors group-hover:underline">
                              {c.title}
                            </span>
                            {c.status ? (
                              <span className="mt-1 block text-[11px] text-muted-foreground">
                                {STATUS_LABELS[c.status] ?? c.status}
                              </span>
                            ) : null}
                          </Link>
                        </TableCell>

                        <TableCell className="px-4 py-4 text-sm text-muted-foreground">
                          <span className="truncate">
                            {c.client_name ?? "—"}
                          </span>
                        </TableCell>

                        <TableCell className="px-4 py-4">
                          {c.case_type ? (
                            <span className="inline-flex rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/85">
                              {c.case_type}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        <TableCell className="px-4 py-4 text-sm text-muted-foreground">
                          {c.current_stage_name ? (
                            <span className="inline-flex max-w-[160px] truncate rounded-md bg-white/[0.03] px-2 py-1 text-xs text-foreground/80">
                              {c.current_stage_name}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>

                        <TableCell className="px-4 py-4">
                          {canAssign ? (
                            <button
                              type="button"
                              onClick={() =>
                                setAssignTarget({
                                  id: c.id,
                                  title: c.title,
                                  leadId: c.lead_id,
                                  leadName: c.lead_name,
                                })
                              }
                              className={cn(
                                "group/lead flex max-w-[180px] items-center gap-2.5 rounded-lg border px-2 py-1.5 text-left transition-colors",
                                c.lead_name
                                  ? "border-transparent hover:border-white/15 hover:bg-white/[0.05]"
                                  : "border-dashed border-white/20 bg-white/[0.03] hover:border-white/35 hover:bg-white/[0.06]",
                              )}
                            >
                              {c.lead_name ? (
                                <>
                                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-[10px] font-semibold tracking-wide text-foreground/85">
                                    {leadInitials}
                                  </span>
                                  <span className="truncate text-sm text-foreground/85 group-hover/lead:underline">
                                    {c.lead_name}
                                  </span>
                                </>
                              ) : (
                                <span className="text-sm font-medium text-foreground/90">
                                  Assign lead…
                                </span>
                              )}
                            </button>
                          ) : c.lead_name ? (
                            <div className="flex items-center gap-2.5">
                              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-[10px] font-semibold tracking-wide text-foreground/85">
                                {leadInitials}
                              </span>
                              <span className="truncate text-sm text-foreground/85">
                                {c.lead_name}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              Unassigned
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="px-4 py-4">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 text-sm tabular-nums",
                              overdue
                                ? "font-medium text-priority-high"
                                : "text-muted-foreground",
                            )}
                          >
                            <CalendarClock className="size-3.5 opacity-70" />
                            {formatDate(c.next_deadline)}
                          </span>
                        </TableCell>

                        <TableCell className="px-4 py-4 text-right">
                          {healthBadge(c.health)}
                        </TableCell>

                        <TableCell className="px-4 py-4 pr-5">
                          <Link
                            to="/cases/$caseId"
                            params={{ caseId: c.id }}
                            className="inline-flex size-8 items-center justify-center rounded-lg border border-transparent text-muted-foreground/50 transition-all group-hover:border-white/[0.08] group-hover:bg-white/[0.04] group-hover:text-foreground"
                            aria-label={`Open ${c.title}`}
                          >
                            <ChevronRight className="size-4" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}

        {!isLoading && !error && rows.length > 0 && view === "cards" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((c: CaseRow) => (
              <Card
                key={c.id}
                className="group flex flex-col gap-4 border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-5 shadow-[0_12px_32px_-20px_rgba(0,0,0,0.5)] transition-all duration-300 hover:border-white/15 hover:bg-[rgba(22,22,25,0.85)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <Link
                    to="/cases/$caseId"
                    params={{ caseId: c.id }}
                    className="min-w-0"
                  >
                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      {c.case_ref ?? "—"}
                    </p>
                    <h3 className="mt-1 truncate text-base font-semibold tracking-tight text-foreground group-hover:underline">
                      {c.title}
                    </h3>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {c.client_name ?? "—"}
                    </p>
                  </Link>
                  {healthBadge(c.health)}
                </div>

                <div className="flex flex-wrap gap-2">
                  {c.case_type && <Tag color="blue">{c.case_type}</Tag>}
                  {c.status && (
                    <Tag color="sand">
                      {STATUS_LABELS[c.status] ?? c.status}
                    </Tag>
                  )}
                  {c.current_stage_name && (
                    <Tag color="purple">{c.current_stage_name}</Tag>
                  )}
                </div>

                <div className="mt-auto space-y-2 border-t border-white/[0.06] pt-3 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <User className="size-3.5 shrink-0" />
                    {canAssign ? (
                      <button
                        type="button"
                        onClick={() =>
                          setAssignTarget({
                            id: c.id,
                            title: c.title,
                            leadId: c.lead_id,
                            leadName: c.lead_name,
                          })
                        }
                        className="truncate text-left hover:text-foreground hover:underline"
                      >
                        Lead: {c.lead_name ?? "Assign…"}
                      </button>
                    ) : (
                      <span className="truncate">
                        Lead: {c.lead_name ?? "—"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CalendarClock className="size-3.5 shrink-0" />
                    <span>Deadline: {formatDate(c.next_deadline)}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
