import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Search,
  Briefcase,
  CalendarClock,
  Clock,
  Plus,
  ChevronRight,
  ChevronDown,
  Check,
  Hash,
} from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { listClients, type ClientRow } from "@/lib/clients.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { NewClientSheet } from "@/components/new-client-sheet";
import { cn } from "@/lib/utils";
import { ListSkeleton } from "@/components/loading-skeletons";

export const Route = createFileRoute("/clients")({
  head: () => ({
    meta: [
      { title: "Verdio" },
      {
        name: "description",
        content: "Firm clients with active cases and hearings.",
      },
    ],
  }),
  component: ClientsPage,
});

type SortKey = "name" | "active_cases" | "last_contact" | "next_hearing";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "name", label: "Name (A–Z)" },
  { value: "active_cases", label: "Most active cases" },
  { value: "last_contact", label: "Most recent contact" },
  { value: "next_hearing", label: "Next hearing soonest" },
];
const ALLOWED_ROLES = [
  "super_admin",
  "admin",
  "senior_lawyer",
  "junior_lawyer",
];

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function ClientsPage() {
  const { role } = useAuth();
  const fetchClients = useServerFn(listClients);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sheetOpen, setSheetOpen] = useState(false);
  const canCreate = role === "super_admin" || role === "admin";

  const canView = role != null && ALLOWED_ROLES.includes(role);

  const { data, isLoading, error } = useQuery({
    queryKey: ["clients"],
    queryFn: () => fetchClients(),
    enabled: canView,
  });

  const rows = useMemo(() => {
    const list = (data ?? []).filter((c) => {
      const q = search.trim().toLowerCase();
      return (
        q === "" ||
        c.full_name.toLowerCase().includes(q) ||
        c.client_ref.toLowerCase().includes(q)
      );
    });
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case "active_cases":
          return b.active_case_count - a.active_case_count;
        case "last_contact":
          return (
            (b.last_contact_at ? new Date(b.last_contact_at).getTime() : 0) -
            (a.last_contact_at ? new Date(a.last_contact_at).getTime() : 0)
          );
        case "next_hearing": {
          const av = a.next_hearing_at
            ? new Date(a.next_hearing_at).getTime()
            : Infinity;
          const bv = b.next_hearing_at
            ? new Date(b.next_hearing_at).getTime()
            : Infinity;
          return av - bv;
        }
        default:
          return a.full_name.localeCompare(b.full_name);
      }
    });
    return sorted;
  }, [data, search, sortKey]);

  if (!canView) {
    return (
      <main className="dashboard-shell px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Clients
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to view this page.
        </p>
      </main>
    );
  }

  return (
    <main className="dashboard-shell min-h-[calc(100dvh-3.5rem)] px-3 py-4 sm:px-5 sm:py-6 md:px-7 lg:px-8 xl:px-10">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Firm
            </p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
              Clients
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Clients accessible through your assigned cases
            </p>
          </div>

          {canCreate && (
            <Button
              onClick={() => setSheetOpen(true)}
              className="gap-1.5 border-0 bg-gradient-to-b from-[#F8F8F8] to-[#CFCFCF] text-[#1a1c20] shadow-[0_8px_20px_rgba(0,0,0,0.22)] hover:from-white hover:to-[#d8d8d8]"
            >
              <Plus className="size-4" />
              New client
            </Button>
          )}
        </div>

        {canCreate && (
          <NewClientSheet open={sheetOpen} onOpenChange={setSheetOpen} />
        )}

        <Card className="border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-3 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)] sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or reference…"
                className="h-10 border-white/[0.08] bg-[#17191D] pl-9 focus-visible:ring-white/10"
              />
            </div>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 w-full justify-between border border-white/[0.08] bg-[#17191D] px-3 font-normal hover:bg-[#17191D] hover:text-foreground sm:w-56"
                >
                  <span className="truncate">
                    {SORT_OPTIONS.find((o) => o.value === sortKey)?.label ??
                      "Sort by"}
                  </span>
                  <ChevronDown className="size-4 shrink-0 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {SORT_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onSelect={() => setSortKey(opt.value)}
                    className="justify-between gap-2"
                  >
                    {opt.label}
                    {sortKey === opt.value ? (
                      <Check className="size-4 shrink-0" />
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </Card>

        {isLoading ? (
          <ListSkeleton rows={5} />
        ) : error ? (
          <Card className="border-priority-high/25 bg-[rgba(18,18,20,0.72)] p-6">
            <p className="text-center text-sm text-priority-high">
              Could not load clients.
            </p>
          </Card>
        ) : rows.length === 0 ? (
          <Card className="relative overflow-hidden border-white/[0.08] bg-[rgba(18,18,20,0.72)] px-6 py-20 text-center shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)]">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.06),transparent_55%)]"
            />
            <div className="relative mx-auto flex size-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              <Briefcase className="size-6" />
            </div>
            <h3 className="relative mt-5 text-base font-semibold tracking-tight text-foreground">
              No clients found
            </h3>
            <p className="relative mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
              {search.trim()
                ? "No clients match your search. Try a different name or reference."
                : "Clients linked to your cases will appear here."}
            </p>
            {canCreate && !search.trim() ? (
              <Button
                onClick={() => setSheetOpen(true)}
                className="relative mt-6 gap-1.5 border-0 bg-gradient-to-b from-[#F8F8F8] to-[#CFCFCF] text-[#1a1c20] shadow-[0_8px_20px_rgba(0,0,0,0.22)] hover:from-white hover:to-[#d8d8d8]"
              >
                <Plus className="size-4" />
                Add first client
              </Button>
            ) : null}
          </Card>
        ) : (
          <Card className="overflow-hidden border-white/[0.08] bg-[rgba(18,18,20,0.72)] p-0 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.55)]">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Directory
                </span>
                <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-foreground/80">
                  {rows.length}
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                Sorted by{" "}
                {sortKey === "name"
                  ? "name"
                  : sortKey === "active_cases"
                    ? "active cases"
                    : sortKey === "last_contact"
                      ? "last contact"
                      : "next hearing"}
              </span>
            </div>

            <ul className="divide-y divide-white/[0.06]">
              {rows.map((c: ClientRow) => (
                <li key={c.id}>
                  <Link
                    to="/clients/$clientId"
                    params={{ clientId: c.id }}
                    className="group flex items-start gap-3.5 px-4 py-4 transition-colors hover:bg-white/[0.03] sm:items-center sm:px-5"
                  >
                    <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-[11px] font-semibold tracking-wide text-foreground/90 sm:mt-0">
                      {initials(c.full_name)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold tracking-tight text-foreground">
                          {c.full_name}
                        </h3>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                            c.active_case_count > 0
                              ? "bg-white/[0.1] text-foreground"
                              : "bg-white/[0.04] text-muted-foreground",
                          )}
                        >
                          <Briefcase className="size-3" />
                          {c.active_case_count} active
                        </span>
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Hash className="size-3 shrink-0" />
                          <span className="tabular-nums">{c.client_ref}</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="size-3 shrink-0" />
                          <span>Last contact {formatDate(c.last_contact_at)}</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarClock className="size-3 shrink-0" />
                          <span>
                            Next hearing {formatDate(c.next_hearing_at)}
                          </span>
                        </span>
                      </div>
                    </div>

                    <ChevronRight className="mt-2 size-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground sm:mt-0" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </main>
  );
}
