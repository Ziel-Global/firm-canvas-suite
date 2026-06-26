import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Briefcase, CalendarClock, Clock } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { listClients, type ClientRow } from "@/lib/clients.functions";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/clients")({
  head: () => ({
    meta: [
      { title: "Clients — Law Firm Ops" },
      { name: "description", content: "Firm clients with active cases and hearings." },
    ],
  }),
  component: ClientsPage,
});

type SortKey = "name" | "active_cases" | "last_contact" | "next_hearing";

const ALLOWED_ROLES = ["super_admin", "admin", "senior_lawyer", "junior_lawyer"];

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ClientsPage() {
  const { role } = useAuth();
  const fetchClients = useServerFn(listClients);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");

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
          const av = a.next_hearing_at ? new Date(a.next_hearing_at).getTime() : Infinity;
          const bv = b.next_hearing_at ? new Date(b.next_hearing_at).getTime() : Infinity;
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
      <main className="px-4 py-6 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Clients</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to view this page.
        </p>
      </main>
    );
  }

  return (
    <main className="px-4 py-6 sm:px-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Clients</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Clients you can access through your assigned cases.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or reference"
            className="pl-9"
          />
        </div>
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name (A–Z)</SelectItem>
            <SelectItem value="active_cases">Most active cases</SelectItem>
            <SelectItem value="last_contact">Most recent contact</SelectItem>
            <SelectItem value="next_hearing">Next hearing soonest</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <p className="mt-8 text-center text-sm text-muted-foreground">Loading clients…</p>
      )}
      {error && !isLoading && (
        <p className="mt-8 text-center text-sm text-destructive">Could not load clients.</p>
      )}
      {!isLoading && !error && rows.length === 0 && (
        <p className="mt-8 text-center text-sm text-muted-foreground">No clients found.</p>
      )}

      {!isLoading && !error && rows.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((c: ClientRow) => (
            <Card key={c.id} className="flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold text-foreground">
                    {c.full_name}
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">{c.client_ref}</p>
                </div>
                <Tag color="blue">
                  <Briefcase className="size-3.5" />
                  {c.active_case_count} active
                </Tag>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="size-4" />
                  <span>Last contact: {formatDate(c.last_contact_at)}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CalendarClock className="size-4" />
                  <span>Next hearing: {formatDate(c.next_hearing_at)}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
